const { getPool } = require("../../config/database");
const { createManualMemberRecord } = require("../../services/admin-members.service");
const { refreshAllMemberStatuses, refreshMemberStatus } = require("../../services/members.service");
const { createExternalReference, createMercadoPagoPreference } = require("../../services/payments.service");
const { comparePeriods, currentPeriod, isValidPeriod, periodFromDate } = require("../../utils/dates");
const { fileDataUrl, fileUrl, frontendUrl } = require("../../utils/files");
const { isValidEmail, normalizeDni } = require("../../utils/text");
const snapshot = require("../../services/snapshot.service");
const kv = require("../../services/kv.service");
const pgStore = require("../../services/postgres-store.service");

function store() {
  return kv.enabled() ? kv : pgStore;
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
    req,
  });
  res.status(201).json(created);
}

function validationError(message, statusCode = 422) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function createKvManualMember(req) {
  const dni = normalizeDni(req.body.dni);
  const fullName = String(req.body.full_name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const profession = String(req.body.profession || "").trim();
  const paymentPeriod = isValidPeriod(req.body.payment_period_month) ? req.body.payment_period_month : currentPeriod();
  const paymentMethod = String(req.body.payment_method || "EFECTIVO").trim().toUpperCase();
  const receiptData = fileDataUrl(req.files?.receipt?.[0]);
  const files = {
    photo: fileDataUrl(req.files?.photo?.[0]),
    degreePdf: fileDataUrl(req.files?.degreePdf?.[0]),
    receipt: receiptData,
  };

  if (dni.length !== 8) throw validationError("DNI invalido.");
  if (!fullName) throw validationError("Consulta el DNI para completar los nombres.");
  if (!profession) throw validationError("Completa la profesion.");
  if (!isValidEmail(email)) throw validationError("Correo invalido.");
  if (!files.degreePdf) throw validationError("Sube el PDF del titulo profesional.");
  if (!["EFECTIVO", "MERCADO_PAGO"].includes(paymentMethod)) throw validationError("Selecciona un metodo de pago valido.");
  if (paymentMethod === "EFECTIVO" && !receiptData) throw validationError("Sube la imagen o PDF del comprobante de pago.");

  const { application } = await kv.createPublicApplication({
    body: { dni, full_name: fullName, email, profession, branch: String(req.body.branch || "Consejo Nacional - Lima") },
    files,
  });
  const member = await kv.approveApplication(
    application.id,
    "Registro presencial creado por administrador con datos de API DNI.",
    req.auth.sub
  );

  const paymentAmount = 20;
  const externalReference = paymentMethod === "MERCADO_PAGO" ? createExternalReference(member.id, paymentPeriod) : null;
  const paymentStatus = paymentMethod === "MERCADO_PAGO" ? "PENDIENTE" : "PAGADO";
  const createdPayment = await kv.createMemberPayment(member.id, paymentPeriod, paymentAmount, req.auth.sub, paymentMethod, {
    status: paymentStatus,
    external_reference: externalReference,
    payment_type: "INSCRIPCION",
    receipt_path: application.receipt_path,
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
      const currentAdmin = await store().getAdmin(req.auth.sub);
      const scopedMembers = (await store().listMembers(status)).filter((row) =>
        !currentAdmin?.branch || currentAdmin.branch === "Consejo Nacional - Lima" || (row.branch || "Consejo Nacional - Lima") === currentAdmin.branch
      );
      return res.json(scopedMembers.map((row) => ({
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
    return res.json(snapshot.listMembers(status).map((row) => ({
      ...row,
      verify_url: `${frontendUrl(req)}/verificar/${row.verification_code}`,
      photo_url: fileUrl(req, row.photo_path),
    })));
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
    `SELECT m.*, u.dni, u.full_name, u.email, u.phone, u.profession, a.photo_path,
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
  res.json(rows.map((row) => ({
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

async function listMemberPayments(req, res) {
  if (req.dbReady === false && snapshot.available()) {
    if (kv.enabled() || pgStore.enabled()) return res.json(await store().listMemberPayments(req.params.id));
    return res.json(snapshot.listMemberPayments(req.params.id));
  }

  const [payments] = await getPool().query(
    "SELECT * FROM payments WHERE member_id = ? ORDER BY period_month DESC, created_at DESC",
    [req.params.id]
  );
  res.json(payments);
}

async function createMemberPayment(req, res) {
  const requestedPeriods = Array.isArray(req.body.periods) ? req.body.periods : [req.body.period_month || currentPeriod()];
  const periods = [...new Set(requestedPeriods.map(String))];
  const period = periods[0];
  const amount = Number(req.body.amount || 20);
  if (!periods.length || periods.some((item) => !isValidPeriod(item))) return res.status(422).json({ message: "Periodo invalido. Usa YYYY-MM." });
  if (amount <= 0) return res.status(422).json({ message: "Monto invalido." });

  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    let created;
    for (const item of periods) created = await store().createMemberPayment(req.params.id, item, amount, req.auth.sub);
    if (!created) return res.status(404).json({ message: "Colegiado no encontrado." });
    return res.status(201).json({ message: `${periods.length} pago(s) registrado(s).`, status: created.member.status, payment: created.payment });
  }

  const pool = getPool();

  const [[member]] = await pool.query("SELECT * FROM members WHERE id = ?", [req.params.id]);
  if (!member) return res.status(404).json({ message: "Colegiado no encontrado." });

  for (const item of periods) await pool.query(
    `INSERT INTO payments
       (member_id, user_id, period_month, amount, payment_type, method, status, paid_at, created_by_admin)
     VALUES (?, ?, ?, ?, 'MENSUALIDAD', 'MANUAL', 'PAGADO', CURRENT_TIMESTAMP, ?)
     ON DUPLICATE KEY UPDATE
       amount = VALUES(amount),
       method = 'MANUAL',
       status = 'PAGADO',
       paid_at = CURRENT_TIMESTAMP,
       created_by_admin = VALUES(created_by_admin)`,
    [member.id, member.user_id, item, amount, req.auth.sub]
  );

  const status = await refreshMemberStatus(member.id);
  res.status(201).json({ message: `${periods.length} pago(s) registrado(s).`, status });
}

module.exports = {
  createManualMember,
  listMembers,
  updateMemberStatus,
  listMemberPayments,
  createMemberPayment,
};
