const { getPool } = require("../config/database");
const { comparePeriods, currentPeriod, effectiveEnrollmentPeriod, isValidPeriod, previousPeriod } = require("../utils/dates");
const {
  approveCheckoutByExternalReference,
  createBatchExternalReference,
  createExternalReference,
  createMercadoPagoPreference,
  fetchMercadoPagoPayment,
  getPendingPeriods,
} = require("../services/payments.service");
const { refreshMemberStatus } = require("../services/members.service");
const kv = require("../services/kv.service");
const pgStore = require("../services/postgres-store.service");
const { isValidEmail, normalizeDni } = require("../utils/text");
const { monthlyAmountForPeriod, totalMonthlyAmount } = require("../utils/monthly-amount");

function store() {
  return kv.enabled() ? kv : pgStore;
}

function addMonths(period, amount) {
  const [year, month] = String(period).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodRange(from, to) {
  const periods = [];
  if (!isValidPeriod(from) || !isValidPeriod(to)) return periods;
  for (let cursor = from; comparePeriods(cursor, to) <= 0; cursor = addMonths(cursor, 1)) {
    periods.push(cursor);
  }
  return periods;
}

async function getPgUserAndMember(req) {
  const dataStore = store();
  const users = await dataStore.listUsers("");
  const user = users.find((item) => String(item.id) === String(req.auth.sub) || item.dni === req.auth.dni) || null;
  const members = await dataStore.listMembers("TODOS");
  const member = members.find((item) => String(item.user_id) === String(user?.id || req.auth.sub) || item.dni === req.auth.dni) || null;
  return { user, member };
}

async function getPgPendingPeriods(member) {
  if (!member) return [];
  const payments = await store().listMemberPayments(member.id);
  const enrollmentPeriod = effectiveEnrollmentPeriod(member.enrollment_date, payments);
  const overdueThrough = previousPeriod(currentPeriod());
  if (comparePeriods(enrollmentPeriod, overdueThrough) > 0) return [];
  const paid = new Set(payments
    .filter((payment) => payment.status === "PAGADO" && payment.payment_type === "MENSUALIDAD")
    .map((payment) => payment.period_month));
  return periodRange(enrollmentPeriod, overdueThrough).filter((period) => !paid.has(period));
}

async function createInscriptionPayment(req, res) {
  const bodyDni = normalizeDni(req.body.dni || req.auth.dni);
  const bodyEmail = String(req.body.email || req.auth.email || "").trim().toLowerCase();
  const bodyFullName = String(req.body.full_name || req.auth.name || "").trim();
  if (bodyDni.length !== 8) return res.status(422).json({ message: "Ingresa un DNI valido antes de pagar." });
  if (!bodyFullName) return res.status(422).json({ message: "Ingresa nombres completos antes de pagar." });
  if (bodyEmail && !isValidEmail(bodyEmail)) return res.status(422).json({ message: "Usa un correo valido antes de pagar." });

  const user = {
    id: req.auth.sub,
    dni: bodyDni,
    full_name: bodyFullName,
    email: bodyEmail,
  };
  const checkout = {
    amount: 2,
    period_month: currentPeriod(),
    external_reference: `CIP-INSCRIPCION-${user.dni || user.id}-${Date.now()}`,
    item_id: `inscripcion-${user.dni || user.id}`,
    title: "Pago de inscripcion CIP",
    description: `Pago de inscripcion de S/ 2.00 - ${user.full_name}`,
  };
  const mp = await createMercadoPagoPreference(checkout, user, req);
  res.status(201).json({
    payment_type: "INSCRIPCION",
    amount: 2,
    status: mp.checkout_url ? "PENDIENTE" : "NO_CONFIGURADO",
    ...mp,
  });
}

// Historial del interesado: pagos realizados, periodos pendientes y deuda total.
async function listUserPayments(req, res) {
  if (req.dbReady === false && (pgStore.enabled() || kv.enabled())) {
    const { member } = await getPgUserAndMember(req);
    if (!member) return res.json({ member: null, payments: [], pending_periods: [], debt_amount: 0 });
    const payments = await store().listMemberPayments(member.id);
    const pendingPeriods = await getPgPendingPeriods(member);
    return res.json({
      member,
      payments,
      pending_periods: pendingPeriods,
      debt_amount: totalMonthlyAmount(pendingPeriods, currentPeriod()),
    });
  }

  let pool;
  try {
    pool = getPool();
  } catch (error) {
    console.warn("Pagos temporales sin base de datos disponible:", error.message);
    return res.json({ member: null, payments: [], pending_periods: [], debt_amount: 0 });
  }
  try {
    const [[member]] = await pool.query("SELECT * FROM members WHERE user_id = ?", [req.auth.sub]);
    if (!member) return res.json({ member: null, payments: [], pending_periods: [], debt_amount: 0 });
    await refreshMemberStatus(member.id);
    const [payments] = await pool.query(
      "SELECT * FROM payments WHERE member_id = ? ORDER BY period_month DESC, created_at DESC",
      [member.id]
    );
    const pendingPeriods = await getPendingPeriods(member.id);
    res.json({
      member: { ...member, status: await refreshMemberStatus(member.id) },
      payments,
      pending_periods: pendingPeriods,
      debt_amount: totalMonthlyAmount(pendingPeriods, currentPeriod()),
    });
  } catch (error) {
    console.warn("Pagos temporales por error de base de datos:", error.message);
    res.json({ member: null, payments: [], pending_periods: [], debt_amount: 0 });
  }
}

// Checkout mensual: crea o reutiliza pago pendiente para un periodo concreto.
async function createMonthlyPayment(req, res) {
  if (req.dbReady === false && (pgStore.enabled() || kv.enabled())) {
    const period = req.body.period_month || currentPeriod();
    if (!isValidPeriod(period)) return res.status(422).json({ message: "Periodo invalido. Usa YYYY-MM." });
    const amount = monthlyAmountForPeriod(period, currentPeriod());

    const { user, member } = await getPgUserAndMember(req);
    if (!member) {
      return res.status(409).json({ message: "Solo los colegiados aprobados pueden pagar mensualidad." });
    }

    const existingPaid = (await store().listMemberPayments(member.id)).find(
      (payment) => payment.period_month === period && payment.payment_type === "MENSUALIDAD" && payment.status === "PAGADO"
    );
    if (existingPaid) {
      return res.json({ payment: existingPaid, message: "La mensualidad de este periodo ya esta pagada." });
    }

    const externalReference = createExternalReference(member.id, period);
    let created = await store().createMemberPayment(member.id, period, amount, null, "MERCADO_PAGO", {
      status: "PENDIENTE",
      external_reference: externalReference,
    });
    const mp = await createMercadoPagoPreference(
      {
        ...created.payment,
        amount,
        period_month: period,
        external_reference: externalReference,
        item_id: `mensualidad-${member.id}-${period}`,
        title: `Mensualidad CIP ${period}`,
        description: `Mensualidad CIP de S/ ${amount.toFixed(2)} - ${period}`,
      },
      user,
      req
    );
    if (mp.preference_id) {
      created = await store().createMemberPayment(member.id, period, amount, null, "MERCADO_PAGO", {
        status: "PENDIENTE",
        external_reference: externalReference,
        mp_preference_id: mp.preference_id,
      });
    }
    return res.status(201).json({
      payment: created.payment,
      member: created.member,
      user,
      ...mp,
      message: mp.checkout_url ? "Redirigiendo a Mercado Pago." : mp.message || "No se pudo generar el checkout de Mercado Pago.",
    });
  }

  const pool = getPool();
  const period = req.body.period_month || currentPeriod();
  if (!isValidPeriod(period)) return res.status(422).json({ message: "Periodo invalido. Usa YYYY-MM." });
  const amount = monthlyAmountForPeriod(period, currentPeriod());

  const [[user]] = await pool.query("SELECT * FROM users WHERE id = ?", [req.auth.sub]);
  const [[member]] = await pool.query("SELECT * FROM members WHERE user_id = ?", [req.auth.sub]);
  if (!member) {
    return res.status(409).json({ message: "Solo los colegiados aprobados pueden pagar mensualidad." });
  }

  const [[existingPaid]] = await pool.query(
    "SELECT * FROM payments WHERE member_id = ? AND period_month = ? AND payment_type = 'MENSUALIDAD' AND status = 'PAGADO'",
    [member.id, period]
  );
  if (existingPaid) {
    return res.json({ payment: existingPaid, message: "La mensualidad de este periodo ya esta pagada." });
  }

  const externalReference = createExternalReference(member.id, period);
  await pool.query(
    `INSERT INTO payments (member_id, user_id, period_month, amount, payment_type, method, status, external_reference)
     VALUES (?, ?, ?, ?, 'MENSUALIDAD', 'MERCADO_PAGO', 'PENDIENTE', ?)
     ON DUPLICATE KEY UPDATE
       status = IF(status = 'PAGADO', status, 'PENDIENTE'),
       method = IF(status = 'PAGADO', method, 'MERCADO_PAGO'),
       external_reference = IF(status = 'PAGADO', external_reference, VALUES(external_reference))`,
    [member.id, user.id, period, amount, externalReference]
  );

  const [[payment]] = await pool.query("SELECT * FROM payments WHERE member_id = ? AND period_month = ? AND payment_type = 'MENSUALIDAD'", [
    member.id,
    period,
  ]);
  const mp = await createMercadoPagoPreference(payment, user, req);
  if (mp.preference_id) {
    await pool.query("UPDATE payments SET mp_preference_id = ? WHERE id = ?", [mp.preference_id, payment.id]);
  }
  await refreshMemberStatus(member.id);

  res.status(201).json({ payment: { ...payment, mp_preference_id: mp.preference_id || null }, ...mp });
}

// Checkout total: agrupa todas las mensualidades pendientes en una sola compra.
async function createFullPayment(req, res) {
  if (req.dbReady === false && (pgStore.enabled() || kv.enabled())) {
    const { user, member } = await getPgUserAndMember(req);
    if (!member) {
      return res.status(409).json({ message: "Solo los colegiados aprobados pueden pagar mensualidades." });
    }
    const pendingPeriods = await getPgPendingPeriods(member);
    if (!pendingPeriods.length) {
      return res.json({ message: "No tienes mensualidades pendientes.", pending_periods: [], debt_amount: 0 });
    }
    const amount = totalMonthlyAmount(pendingPeriods, currentPeriod());
    const externalReference = createBatchExternalReference(member.id);
    let payments = [];
    for (const period of pendingPeriods) {
      const created = await store().createMemberPayment(member.id, period, monthlyAmountForPeriod(period, currentPeriod()), null, "MERCADO_PAGO_TOTAL", {
        status: "PENDIENTE",
        external_reference: externalReference,
      });
      payments.push(created.payment);
    }
    const checkout = {
      amount,
      external_reference: externalReference,
      item_id: `mensualidades-total-${member.id}`,
      title: "Pago total de mensualidades CIP",
      description: `Pago de ${pendingPeriods.length} mensualidad(es): ${pendingPeriods.join(", ")}`,
    };
    const mp = await createMercadoPagoPreference(checkout, user || member, req);
    if (mp.preference_id) {
      payments = [];
      for (const period of pendingPeriods) {
        const created = await store().createMemberPayment(member.id, period, monthlyAmountForPeriod(period, currentPeriod()), null, "MERCADO_PAGO_TOTAL", {
          status: "PENDIENTE",
          external_reference: externalReference,
          mp_preference_id: mp.preference_id,
        });
        payments.push(created.payment);
      }
    }
    return res.status(201).json({
      message: mp.checkout_url ? "Redirigiendo a Mercado Pago." : mp.message || "No se pudo generar el checkout de Mercado Pago.",
      payments,
      pending_periods: pendingPeriods,
      debt_amount: amount,
      ...mp,
    });
  }

  const pool = getPool();
  const [[user]] = await pool.query("SELECT * FROM users WHERE id = ?", [req.auth.sub]);
  const [[member]] = await pool.query("SELECT * FROM members WHERE user_id = ?", [req.auth.sub]);
  if (!member) {
    return res.status(409).json({ message: "Solo los colegiados aprobados pueden pagar mensualidades." });
  }

  const pendingPeriods = await getPendingPeriods(member.id);
  if (!pendingPeriods.length) {
    return res.json({ message: "No tienes mensualidades pendientes.", pending_periods: [], debt_amount: 0 });
  }

  const amount = totalMonthlyAmount(pendingPeriods, currentPeriod());
  const externalReference = createBatchExternalReference(member.id);
  const [result] = await pool.query(
    `INSERT INTO payment_batches (member_id, user_id, periods_json, amount, status, external_reference)
     VALUES (?, ?, ?, ?, 'PENDIENTE', ?)`,
    [member.id, user.id, JSON.stringify(pendingPeriods), amount, externalReference]
  );

  const checkout = {
    id: result.insertId,
    amount,
    external_reference: externalReference,
    item_id: `mensualidades-total-${member.id}`,
    title: `Pago total de mensualidades CIP`,
    description: `Pago de ${pendingPeriods.length} mensualidad(es): ${pendingPeriods.join(", ")}`,
  };
  const mp = await createMercadoPagoPreference(checkout, user, req);
  if (mp.preference_id) {
    await pool.query("UPDATE payment_batches SET mp_preference_id = ? WHERE id = ?", [mp.preference_id, result.insertId]);
  }

  res.status(201).json({
    batch_id: result.insertId,
    pending_periods: pendingPeriods,
    debt_amount: amount,
    ...mp,
  });
}

// Retorno del checkout: confirma con Mercado Pago antes de marcar como pagado.
async function confirmMercadoPagoReturn(req, res) {
  const paymentId = req.body.payment_id || req.body.collection_id;
  const mpPayment = await fetchMercadoPagoPayment(paymentId);
  if (!mpPayment) {
    return res.status(202).json({ message: "Pago pendiente de confirmacion por Mercado Pago." });
  }

  if (mpPayment.status !== "approved") {
    return res.status(202).json({
      message: `Pago aun no aprobado. Estado actual: ${mpPayment.status}.`,
      status: mpPayment.status,
    });
  }

  const payment = req.dbReady === false && (kv.enabled() || pgStore.enabled())
    ? await store().approvePaymentByExternalReference(
        mpPayment.external_reference,
        String(mpPayment.id),
        mpPayment.date_approved
      )
    : await approveCheckoutByExternalReference(
        mpPayment.external_reference,
        String(mpPayment.id),
        mpPayment.date_approved
      );

  if (!payment && String(mpPayment.external_reference || "").startsWith("CIP-INSCRIPCION-")) {
    return res.json({
      message: "Pago de inscripcion confirmado. Descarga tu comprobante y subelo en tu solicitud.",
      payment_id: String(mpPayment.id),
      payment: {
        id: String(mpPayment.id),
        user_id: req.auth.sub,
        dni: req.auth.dni,
        period_month: currentPeriod(),
        amount: 2,
        payment_type: "INSCRIPCION",
        method: "MERCADO_PAGO",
        status: "PAGADO",
        paid_at: mpPayment.date_approved || new Date().toISOString(),
        external_reference: mpPayment.external_reference,
        mp_payment_id: String(mpPayment.id),
      },
      user: {
        id: req.auth.sub,
        dni: req.auth.dni,
        full_name: req.auth.name,
        email: req.auth.email,
      },
    });
  }

  if (!payment || payment.user_id !== req.auth.sub) {
    return res.status(404).json({ message: "No se encontro el pago asociado a tu cuenta." });
  }

  res.json({
    message: "Pago confirmado. Descarga tu comprobante cuando lo necesites.",
    payment_id: payment.id,
    payment,
    user: {
      id: req.auth.sub,
      dni: req.auth.dni,
      full_name: req.auth.name,
      email: req.auth.email,
    },
  });
}

// Webhook Mercado Pago: confirmacion asincrona del proveedor.
async function mercadoPagoWebhook(req, res) {
  const paymentId = req.body?.data?.id || req.query?.id || req.query?.["data.id"];
  if (!paymentId) return res.status(200).json({ ok: true });

  const mpPayment = await fetchMercadoPagoPayment(paymentId);
  if (mpPayment?.status === "approved") {
    if (kv.enabled() || pgStore.enabled()) {
      await store().approvePaymentByExternalReference(
        mpPayment.external_reference,
        String(mpPayment.id),
        mpPayment.date_approved
      );
    } else {
      await approveCheckoutByExternalReference(
        mpPayment.external_reference,
        String(mpPayment.id),
        mpPayment.date_approved
      );
    }
  }
  res.status(200).json({ ok: true });
}

module.exports = {
  createInscriptionPayment,
  listUserPayments,
  createMonthlyPayment,
  createFullPayment,
  confirmMercadoPagoReturn,
  mercadoPagoWebhook,
};
