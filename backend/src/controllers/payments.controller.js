const { getPool } = require("../config/database");
const { comparePeriods, currentPeriod, isValidPeriod, periodFromDate } = require("../utils/dates");
const {
  approveCheckoutByExternalReference,
  createBatchExternalReference,
  createExternalReference,
  createMercadoPagoPreference,
  fetchMercadoPagoPayment,
  getPendingPeriods,
} = require("../services/payments.service");
const { refreshMemberStatus } = require("../services/members.service");

// Historial del interesado: pagos realizados, periodos pendientes y deuda total.
async function listUserPayments(req, res) {
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
      debt_amount: pendingPeriods.length * 20,
    });
  } catch (error) {
    console.warn("Pagos temporales por error de base de datos:", error.message);
    res.json({ member: null, payments: [], pending_periods: [], debt_amount: 0 });
  }
}

// Checkout mensual: crea o reutiliza pago pendiente para un periodo concreto.
async function createMonthlyPayment(req, res) {
  const pool = getPool();
  const period = req.body.period_month || currentPeriod();
  if (!isValidPeriod(period)) return res.status(422).json({ message: "Periodo invalido. Usa YYYY-MM." });

  const [[user]] = await pool.query("SELECT * FROM users WHERE id = ?", [req.auth.sub]);
  const [[member]] = await pool.query("SELECT * FROM members WHERE user_id = ?", [req.auth.sub]);
  if (!member) {
    return res.status(409).json({ message: "Solo los colegiados aprobados pueden pagar mensualidad." });
  }

  const enrollmentPeriod = periodFromDate(member.enrollment_date);
  if (comparePeriods(period, enrollmentPeriod) < 0) {
    return res.status(422).json({ message: `Solo puedes pagar desde tu mes de inscripción (${enrollmentPeriod}).` });
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
     VALUES (?, ?, ?, 20.00, 'MENSUALIDAD', 'MERCADO_PAGO', 'PENDIENTE', ?)
     ON DUPLICATE KEY UPDATE
       status = IF(status = 'PAGADO', status, 'PENDIENTE'),
       method = IF(status = 'PAGADO', method, 'MERCADO_PAGO'),
       external_reference = IF(status = 'PAGADO', external_reference, VALUES(external_reference))`,
    [member.id, user.id, period, externalReference]
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

  const amount = pendingPeriods.length * 20;
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

  const payment = await approveCheckoutByExternalReference(
    mpPayment.external_reference,
    String(mpPayment.id),
    mpPayment.date_approved
  );

  if (!payment || payment.user_id !== req.auth.sub) {
    return res.status(404).json({ message: "No se encontro el pago asociado a tu cuenta." });
  }

  res.json({ message: "Pago confirmado.", payment_id: payment.id });
}

// Webhook Mercado Pago: confirmacion asincrona del proveedor.
async function mercadoPagoWebhook(req, res) {
  const paymentId = req.body?.data?.id || req.query?.id || req.query?.["data.id"];
  if (!paymentId) return res.status(200).json({ ok: true });

  const mpPayment = await fetchMercadoPagoPayment(paymentId);
  if (mpPayment?.status === "approved") {
    await approveCheckoutByExternalReference(
      mpPayment.external_reference,
      String(mpPayment.id),
      mpPayment.date_approved
    );
  }
  res.status(200).json({ ok: true });
}

module.exports = {
  listUserPayments,
  createMonthlyPayment,
  createFullPayment,
  confirmMercadoPagoReturn,
  mercadoPagoWebhook,
};
