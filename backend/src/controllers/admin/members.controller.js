const { getPool } = require("../../config/database");
const { createManualMemberRecord } = require("../../services/admin-members.service");
const { isValidEngineeringCareer } = require("../../constants/catalogs");
const { refreshAllMemberStatuses, refreshMemberStatus } = require("../../services/members.service");
const { createExternalReference, createMercadoPagoPreference } = require("../../services/payments.service");
const { currentPeriod, effectiveEnrollmentPeriod, isValidPeriod, periodsBetween, previousPeriod } = require("../../utils/dates");
const { fileDataUrl, fileUrl, frontendUrl } = require("../../utils/files");
const { isValidEmail, normalizeDni } = require("../../utils/text");
const snapshot = require("../../services/snapshot.service");
const kv = require("../../services/kv.service");
const pgStore = require("../../services/postgres-store.service");
const { sendDebtNoticeEmail } = require("../../services/mail.service");

function store() {
  return kv.enabled() ? kv : pgStore;
}

function withDebt(member, payments) {
  const paid = new Set((payments || []).filter((item) => item.status === "PAGADO" && item.payment_type === "MENSUALIDAD").map((item) => item.period_month));
  const start = effectiveEnrollmentPeriod(member.enrollment_date, payments || []);
  const end = previousPeriod(currentPeriod());
  const pendingPeriods = start && start <= end ? periodsBetween(start, end).filter((period) => !paid.has(period)) : [];
  return { ...member, pending_periods: pendingPeriods, debt_count: pendingPeriods.length, debt_amount: pendingPeriods.length * 2 };
}

function canAccessBranch(req, branch) {
  const adminBranch = req.admin?.branch || "Consejo Nacional - Lima";
  return adminBranch === "Consejo Nacional - Lima" || (branch || "Consejo Nacional - Lima") === adminBranch;
}

function assertBranchAccess(req, member) {
  if (!canAccessBranch(req, member?.branch)) {
    const error = new Error("Colegiado no encontrado en tu sede.");
    error.statusCode = 404;
    throw error;
  }
}

// Padron: alta manual, estado de colegiados y pagos registrados por admin.
async function createManualMember(req, res) {
  if (req.dbReady === false && kv.enabled()) {
    const created = await createKvManualMember(req);
    return res.status(201).json(created);
  }

  const pool = getPool();
  const created = await createManualMemberRecord({
    pool,
    body: req.body,
    files: req.files,
    adminId: req.auth.sub,
    adminBranch: req.admin?.branch,
    req,
  });
  res.status(201).json(created);
}

function validationError(message, statusCode = 422) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const PAYMENT_METHOD_LABELS = {
  EFECTIVO: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
};

function paymentMethodSummary(methods, expectedTotal, options = {}) {
  let source = Array.isArray(methods) ? methods : [];
  if (!source.length && methods) {
    try {
      const parsed = JSON.parse(String(methods));
      source = Array.isArray(parsed) ? parsed : [];
    } catch {
      source = [];
    }
  }
  const normalized = source
    .map((item) => ({
      method: String(item?.method || "").trim().toUpperCase(),
      amount: Number(item?.amount || 0),
    }))
    .filter((item) => item.method && item.amount > 0);

  if (!normalized.length) return { method: "MANUAL", detail: null };
  const invalid = normalized.find((item) => !PAYMENT_METHOD_LABELS[item.method] || (!options.allowMercadoPago && item.method === "MERCADO_PAGO"));
  if (invalid) throw validationError("Selecciona medios de pago presenciales validos.");
  if (options.allowMercadoPago && normalized.some((item) => item.method === "MERCADO_PAGO") && normalized.length > 1) {
    throw validationError("Mercado Pago debe registrarse como unico medio para abrir checkout.");
  }

  const total = normalized.reduce((sum, item) => sum + item.amount, 0);
  const missing = expectedTotal - total;
  if (missing > 0.01) {
    throw validationError(`Falta registrar S/ ${missing.toFixed(2)}.`);
  }
  const change = total - expectedTotal;
  if (change > 0.01 && !normalized.some((item) => item.method === "EFECTIVO")) {
    throw validationError("El vuelto solo puede calcularse cuando hay pago en efectivo.");
  }

  const applied = normalized.map((item) => ({ ...item, receivedAmount: item.amount }));
  let remainingChange = Math.max(0, change);
  for (let index = applied.length - 1; index >= 0 && remainingChange > 0.01; index -= 1) {
    if (applied[index].method !== "EFECTIVO") continue;
    const discount = Math.min(applied[index].amount, remainingChange);
    applied[index].amount -= discount;
    remainingChange -= discount;
  }
  if (remainingChange > 0.01) throw validationError("El vuelto supera el monto recibido en efectivo.");

  const charged = applied.filter((item) => item.amount > 0.01 || item.receivedAmount > item.amount + 0.01);

  return {
    method: charged.length > 1 ? "MIXTO" : charged[0].method,
    detail: charged.map((item) => {
      const label = PAYMENT_METHOD_LABELS[item.method];
      if (item.method === "EFECTIVO" && item.receivedAmount > item.amount + 0.01) {
        return `${label} S/ ${item.amount.toFixed(2)} (recibido S/ ${item.receivedAmount.toFixed(2)}, vuelto S/ ${(item.receivedAmount - item.amount).toFixed(2)})`;
      }
      return `${label} S/ ${item.amount.toFixed(2)}`;
    }).join(" + "),
  };
}

function proratedPaymentMethodSummary(methods, divisor, expectedTotal, fallback) {
  if (divisor <= 1) return fallback;
  let source = Array.isArray(methods) ? methods : [];
  if (!source.length && methods) {
    try {
      const parsed = JSON.parse(String(methods));
      source = Array.isArray(parsed) ? parsed : [];
    } catch {
      source = [];
    }
  }
  const normalized = source
    .map((item) => ({
      method: String(item?.method || "").trim().toUpperCase(),
      amount: Number(item?.amount || 0) / divisor,
    }))
    .filter((item) => item.method && item.amount > 0);
  if (!normalized.length) return fallback;
  const total = normalized.reduce((sum, item) => sum + item.amount, 0);
  if (total > expectedTotal + 0.01) return fallback;
  return {
    method: normalized.length > 1 ? "MIXTO" : normalized[0].method,
    detail: normalized.map((item) => `${PAYMENT_METHOD_LABELS[item.method]} S/ ${item.amount.toFixed(2)}`).join(" + "),
  };
}


async function createKvManualMember(req) {
  const dni = normalizeDni(req.body.dni);
  const fullName = String(req.body.full_name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(0, 9);
  const profession = String(req.body.profession || "").trim();
  const paymentPeriod = isValidPeriod(req.body.payment_period_month) ? req.body.payment_period_month : currentPeriod();
  const paymentSummary = paymentMethodSummary(req.body.payment_methods, 2, { allowMercadoPago: true });
  const paymentMethod = paymentSummary.method === "MANUAL"
    ? String(req.body.payment_method || "EFECTIVO").trim().toUpperCase()
    : paymentSummary.method;
  const receiptData = fileDataUrl(req.files?.receipt?.[0]);
  const files = {
    photo: fileDataUrl(req.files?.photo?.[0]),
    degreePdf: fileDataUrl(req.files?.degreePdf?.[0]),
    receipt: receiptData,
  };

  if (dni.length !== 8) throw validationError("DNI invalido.");
  if (!fullName) throw validationError("Consulta el DNI para completar los nombres.");
  if (!profession) throw validationError("Completa la profesion.");
  if (!isValidEngineeringCareer(profession)) throw validationError("Selecciona una profesion valida de la lista.");
  if (!isValidEmail(email)) throw validationError("Correo invalido.");
  if (phone && !/^9\d{8}$/.test(phone)) throw validationError("Ingresa un celular valido de 9 digitos.");
  if (!files.degreePdf) throw validationError("Sube el PDF del titulo profesional.");
  if (!["EFECTIVO", "YAPE", "PLIN", "TARJETA", "TRANSFERENCIA", "MIXTO", "MERCADO_PAGO"].includes(paymentMethod)) throw validationError("Selecciona un metodo de pago valido.");
  if (paymentMethod !== "MERCADO_PAGO" && !receiptData) throw validationError("Sube la imagen o PDF del comprobante de pago.");

  const { application } = await kv.createPublicApplication({
    body: { dni, full_name: fullName, email, phone, profession, branch: String(req.body.branch || "Consejo Nacional - Lima") },
    files,
  });
  const member = await kv.approveApplication(
    application.id,
    "Registro presencial creado por administrador con datos de API DNI.",
    req.auth.sub
  );

  const paymentAmount = 2;
  const externalReference = paymentMethod === "MERCADO_PAGO" ? createExternalReference(member.id, paymentPeriod) : null;
  const paymentStatus = paymentMethod === "MERCADO_PAGO" ? "PENDIENTE" : "PAGADO";
  const createdPayment = await kv.createMemberPayment(member.id, paymentPeriod, paymentAmount, req.auth.sub, paymentMethod, {
    status: paymentStatus,
    external_reference: externalReference,
    payment_type: "INSCRIPCION",
    receipt_path: application.receipt_path,
    method_detail: paymentSummary.detail,
  });

  let mercadoPago = {};
  if (paymentMethod === "MERCADO_PAGO") {
    try {
      mercadoPago = await createMercadoPagoPreference(
        {
          id: createdPayment.payment.id,
          amount: paymentAmount,
          external_reference: externalReference,
          item_id: `registro-presencial-${member.id}-${paymentPeriod}`,
          title: `Pago por derecho a carnet CIP ${paymentPeriod}`,
          description: `Registro presencial CIP - ${fullName}`,
          period_month: paymentPeriod,
        },
        { id: member.user_id, email, full_name: fullName, dni },
        req
      );
      if (mercadoPago.preference_id) {
        await kv.createMemberPayment(member.id, paymentPeriod, paymentAmount, req.auth.sub, paymentMethod, {
          status: paymentStatus,
          external_reference: externalReference,
          mp_preference_id: mercadoPago.preference_id,
          payment_type: "INSCRIPCION",
          receipt_path: application.receipt_path,
          method_detail: paymentSummary.detail,
        });
      }
    } catch {
      mercadoPago = { checkout_url: null, message: "Registro creado, pero no se pudo abrir Mercado Pago." };
    }
  }

  return {
    ...member,
    status: createdPayment.member.status,
    verify_url: `${frontendUrl(req)}/verificar/${member.verification_code}`,
    photo_url: application.photo_path ? `${req.protocol}://${req.get("host")}/api/public/applications/${application.id}/files/photo` : null,
    registration_payment: {
      ...createdPayment.payment,
      receipt_url: application.receipt_path ? `${req.protocol}://${req.get("host")}/api/public/applications/${application.id}/files/receipt` : null,
    },
    ...mercadoPago,
    dni_source: "api",
  };
}

async function listMembers(req, res) {
  if (req.dbReady === false && snapshot.available()) {
    const status = String(req.query.status || "").toUpperCase();
    if (kv.enabled() || pgStore.enabled()) {
      const applications = await store().listApplications("TODOS");
      const currentAdmin = req.admin || await store().getAdmin(req.auth.sub);
      const scopedMembers = (await store().listMembers(status)).filter((row) =>
        !currentAdmin?.branch || currentAdmin.branch === "Consejo Nacional - Lima" || (row.branch || "Consejo Nacional - Lima") === currentAdmin.branch
      );
      const decorated = await Promise.all(scopedMembers.map(async (row) => withDebt(row, await store().listMemberPayments(row.id))));
      return res.json(decorated.map((row) => ({
        ...row,
        verify_url: `${frontendUrl(req)}/verificar/${row.verification_code}`,
        photo_url: (() => {
          const application = applications.find((item) => Number(item.id) === Number(row.application_id) || String(item.user_id) === String(row.user_id));
          if (application?.id && /^(data:|kvfile:)/i.test(application.photo_path || "")) {
            return `${req.protocol}://${req.get("host")}/api/public/applications/${application.id}/files/photo`;
          }
          return fileUrl(req, row.photo_path);
        })(),
      })));
    }
    const applications = snapshot.listApplications("TODOS");
    return res.json(snapshot.listMembers(status).filter((row) => canAccessBranch(req, row.branch)).map((row) => {
      const application = applications.find((item) => Number(item.id) === Number(row.application_id) || String(item.user_id) === String(row.user_id));
      return {
        ...row,
        verify_url: `${frontendUrl(req)}/verificar/${row.verification_code}`,
        photo_url:
          application?.id && /^(data:|kvfile:)/i.test(application.photo_path || "")
            ? `${req.protocol}://${req.get("host")}/api/public/applications/${application.id}/files/photo`
            : fileUrl(req, application?.photo_path || row.photo_path),
      };
    }));
  }

  const pool = getPool();
  await refreshAllMemberStatuses();
  const status = String(req.query.status || "").toUpperCase();
  const params = [];
  let where = "";
  if (status && status !== "TODOS") {
    where = "WHERE m.status = ?";
    params.push(status);
  }

  const [rows] = await pool.query(
    `SELECT m.*, u.dni, u.full_name, u.email, u.phone, u.profession, u.branch, a.photo_path,
            lp.last_paid_period,
            lp.last_paid_at
     FROM members m
     JOIN users u ON u.id = m.user_id
     JOIN applications a ON a.id = m.application_id
     LEFT JOIN (
       SELECT member_id,
              MAX(CASE WHEN status = 'PAGADO' THEN period_month END) AS last_paid_period,
              MAX(CASE WHEN status = 'PAGADO' THEN paid_at END) AS last_paid_at
       FROM payments
       GROUP BY member_id
     ) lp ON lp.member_id = m.id
     ${where}
     ORDER BY m.created_at DESC`,
    params
  );
  const scopedRows = rows.filter((row) => canAccessBranch(req, row.branch));
  const decorated = await Promise.all(scopedRows.map(async (row) => {
    const [payments] = await pool.query("SELECT period_month, payment_type, status FROM payments WHERE member_id = ?", [row.id]);
    return withDebt(row, payments);
  }));
  res.json(decorated.map((row) => ({
    ...row,
    verify_url: `${frontendUrl(req)}/verificar/${row.verification_code}`,
    photo_url: fileUrl(req, row.photo_path),
  })));
}

async function updateMemberStatus(req, res) {
  res.status(410).json({
    message: "El estado del carnet es automatico y se calcula por mensualidades pagadas o vencidas.",
  });
}

function paymentsWithPendingDebt(member, payments) {
  const debt = withDebt(member, payments);
  const pendingRows = debt.pending_periods
    .filter((period) => !payments.some((payment) => payment.payment_type === "MENSUALIDAD" && payment.period_month === period))
    .map((period) => ({
      id: `pending-${member.id}-${period}`,
      member_id: Number(member.id),
      user_id: member.user_id,
      period_month: period,
      amount: 2,
      payment_type: "MENSUALIDAD",
      method: "PENDIENTE",
      method_detail: null,
      status: "PENDIENTE",
      paid_at: null,
      created_at: null,
      is_debt: true,
    }));
  return [...pendingRows, ...payments].sort((left, right) => String(right.period_month).localeCompare(String(left.period_month)));
}

async function listMemberPayments(req, res) {
  if (req.dbReady === false && snapshot.available()) {
    if (kv.enabled() || pgStore.enabled()) {
      const member = (await store().listMembers("TODOS")).find((item) => Number(item.id) === Number(req.params.id));
      if (!member) return res.status(404).json({ message: "Colegiado no encontrado." });
      assertBranchAccess(req, member);
      return res.json(paymentsWithPendingDebt(member, await store().listMemberPayments(req.params.id)));
    }
    const member = snapshot.listMembers("TODOS").find((item) => Number(item.id) === Number(req.params.id));
    if (!member) return res.status(404).json({ message: "Colegiado no encontrado." });
    assertBranchAccess(req, member);
    return res.json(paymentsWithPendingDebt(member, snapshot.listMemberPayments(req.params.id)));
  }

  const [[member]] = await getPool().query(
    `SELECT m.id, u.branch
     FROM members m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = ?`,
    [req.params.id]
  );
  if (!member) return res.status(404).json({ message: "Colegiado no encontrado." });
  assertBranchAccess(req, member);

  const [payments] = await getPool().query(
    "SELECT * FROM payments WHERE member_id = ? ORDER BY period_month DESC, created_at DESC",
    [req.params.id]
  );
  res.json(paymentsWithPendingDebt(member, payments));
}

async function createMemberPayment(req, res) {
  const requestedPeriods = Array.isArray(req.body.periods) ? req.body.periods : [req.body.period_month || currentPeriod()];
  const periods = [...new Set(requestedPeriods.map(String))];
  const period = periods[0];
  const amount = Number(req.body.amount || 2);
  const paymentTotal = periods.length * amount;
  const paymentSummary = paymentMethodSummary(req.body.payment_methods, paymentTotal);
  const perPeriodPaymentSummary = proratedPaymentMethodSummary(req.body.payment_methods, periods.length, paymentTotal, paymentSummary);
  if (!periods.length || periods.some((item) => !isValidPeriod(item))) return res.status(422).json({ message: "Periodo invalido. Usa YYYY-MM." });
  if (amount <= 0) return res.status(422).json({ message: "Monto invalido." });

  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    const member = (await store().listMembers("TODOS")).find((item) => Number(item.id) === Number(req.params.id));
    if (!member) return res.status(404).json({ message: "Colegiado no encontrado." });
    assertBranchAccess(req, member);
    let created;
    for (const item of periods) {
      created = await store().createMemberPayment(req.params.id, item, amount, req.auth.sub, perPeriodPaymentSummary.method, {
        method_detail: perPeriodPaymentSummary.detail,
      });
    }
    if (!created) return res.status(404).json({ message: "Colegiado no encontrado." });
    return res.status(201).json({ message: `${periods.length} pago(s) registrado(s).`, status: created.member.status, payment: created.payment });
  }

  const pool = getPool();

  const [[member]] = await pool.query(
    `SELECT m.*, u.branch
     FROM members m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = ?`,
    [req.params.id]
  );
  if (!member) return res.status(404).json({ message: "Colegiado no encontrado." });
  assertBranchAccess(req, member);

  for (const item of periods) await pool.query(
    `INSERT INTO payments
       (member_id, user_id, period_month, amount, payment_type, method, method_detail, status, paid_at, created_by_admin)
     VALUES (?, ?, ?, ?, 'MENSUALIDAD', ?, ?, 'PAGADO', CURRENT_TIMESTAMP, ?)
     ON DUPLICATE KEY UPDATE
       amount = VALUES(amount),
       method = VALUES(method),
       method_detail = VALUES(method_detail),
       status = 'PAGADO',
       paid_at = CURRENT_TIMESTAMP,
       created_by_admin = VALUES(created_by_admin)`,
    [member.id, member.user_id, item, amount, perPeriodPaymentSummary.method, perPeriodPaymentSummary.detail, req.auth.sub]
  );

  const status = await refreshMemberStatus(member.id);
  res.status(201).json({ message: `${periods.length} pago(s) registrado(s).`, status });
}

async function notifyMemberEmail(req, res) {
  let member;
  let payments;
  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    member = (await store().listMembers("TODOS")).find((item) => Number(item.id) === Number(req.params.id));
    if (member) assertBranchAccess(req, member);
    payments = member ? await store().listMemberPayments(member.id) : [];
  } else {
    [[member]] = await getPool().query(
      `SELECT m.*, u.full_name, u.email, u.branch FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
      [req.params.id]
    );
    if (member) assertBranchAccess(req, member);
    if (member) [payments] = await getPool().query("SELECT * FROM payments WHERE member_id = ?", [member.id]);
  }
  if (!member) return res.status(404).json({ message: "Colegiado no encontrado." });
  const debt = withDebt(member, payments);
  if (!debt.debt_count) return res.status(409).json({ message: "El colegiado no tiene mensualidades vencidas." });
  const result = await sendDebtNoticeEmail({ email: member.email, fullName: member.full_name, debtAmount: debt.debt_amount, pendingPeriods: debt.pending_periods });
  res.json({ ...result, message: "Notificacion enviada por correo." });
}

module.exports = {
  createManualMember,
  listMembers,
  updateMemberStatus,
  listMemberPayments,
  createMemberPayment,
  notifyMemberEmail,
};
