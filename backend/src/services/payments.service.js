const crypto = require("crypto");
const env = require("../config/env");
const { getPool } = require("../config/database");
const { currentPeriod, effectiveEnrollmentPeriod, periodsBetween, previousPeriod } = require("../utils/dates");
const { frontendUrl, originFromReq } = require("../utils/files");
const { refreshMemberStatus } = require("./members.service");

// Mercado Pago preference: arma el checkout remoto para mensualidad o lote.
async function createMercadoPagoPreference(checkout, user, req) {
  if (!env.mercadoPagoAccessToken) {
    return { checkout_url: null, message: "Mercado Pago no esta configurado." };
  }

  const returnUrl = `${frontendUrl(req)}/checkout/resultado`;
  const notificationUrl = `${originFromReq(req)}/api/payments/mercadopago/webhook`;
  const payload = {
    items: [
      {
        id: checkout.item_id || `mensualidad-${checkout.period_month || currentPeriod()}`,
        title: checkout.title || `Mensualidad CIP ${checkout.period_month}`,
        description: checkout.description || `Pago mensual de S/ 20.00 - ${user.full_name}`,
        quantity: 1,
        unit_price: Number(checkout.amount),
        currency_id: "PEN",
      },
    ],
    external_reference: checkout.external_reference,
    back_urls: {
      success: returnUrl,
      failure: returnUrl,
      pending: returnUrl,
    },
  };

  if (isPublicHttpsUrl(notificationUrl)) {
    payload.notification_url = notificationUrl;
  }

  if (/^https:\/\//i.test(returnUrl) && !/localhost|127\.0\.0\.1/i.test(returnUrl)) {
    payload.auto_return = "approved";
  }

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.mercadoPagoAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    return {
      checkout_url: null,
      message: data.message || "No se pudo crear la preferencia de pago.",
      details: data,
    };
  }

  return {
    preference_id: data.id,
    checkout_url: data.init_point || data.sandbox_init_point,
  };
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return !(
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      /^192\.168\.\d{1,3}\.\d{1,3}$|^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$|^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}

// Consulta segura al proveedor para validar estado real del pago.
async function fetchMercadoPagoPayment(paymentId) {
  if (!env.mercadoPagoAccessToken || !paymentId) return null;

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${env.mercadoPagoAccessToken}` },
  });
  if (!response.ok) return null;
  return response.json();
}

// Aprobacion individual: marca una mensualidad como pagada.
async function approvePaymentByExternalReference(externalReference, mpPaymentId, paidAt) {
  if (!externalReference) return null;
  const pool = getPool();
  const [[payment]] = await pool.query("SELECT * FROM payments WHERE external_reference = ?", [
    externalReference,
  ]);
  if (!payment) return null;

  await pool.query(
    `UPDATE payments
     SET status = 'PAGADO', method = 'MERCADO_PAGO', mp_payment_id = ?, paid_at = COALESCE(?, CURRENT_TIMESTAMP)
     WHERE id = ?`,
    [mpPaymentId || null, paidAt || null, payment.id]
  );
  await refreshMemberStatus(payment.member_id);
  return payment;
}

// Aprobacion por lote: convierte un checkout total en pagos mensuales pagados.
async function approveBatchByExternalReference(externalReference, mpPaymentId, paidAt) {
  if (!externalReference) return null;
  const pool = getPool();
  const [[batch]] = await pool.query("SELECT * FROM payment_batches WHERE external_reference = ?", [
    externalReference,
  ]);
  if (!batch) return null;

  const periods = JSON.parse(batch.periods_json || "[]");
  const paidAtValue = paidAt ? new Date(paidAt) : new Date();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE payment_batches
       SET status = 'PAGADO', mp_payment_id = ?, paid_at = ?
       WHERE id = ?`,
      [mpPaymentId || null, paidAtValue, batch.id]
    );

    for (const period of periods) {
      await connection.query(
        `INSERT INTO payments
           (member_id, user_id, period_month, amount, payment_type, method, status, paid_at, mp_payment_id)
         VALUES (?, ?, ?, 20.00, 'MENSUALIDAD', 'MERCADO_PAGO_TOTAL', 'PAGADO', ?, ?)
         ON DUPLICATE KEY UPDATE
           amount = VALUES(amount),
           method = 'MERCADO_PAGO_TOTAL',
           status = 'PAGADO',
           paid_at = VALUES(paid_at),
           mp_payment_id = VALUES(mp_payment_id)`,
        [batch.member_id, batch.user_id, period, paidAtValue, mpPaymentId || null]
      );
    }

    await connection.commit();
    await refreshMemberStatus(batch.member_id);
    return batch;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Resolver comun: intenta primero pago individual y luego lote.
async function approveCheckoutByExternalReference(externalReference, mpPaymentId, paidAt) {
  const payment = await approvePaymentByExternalReference(externalReference, mpPaymentId, paidAt);
  if (payment) return { ...payment, checkout_type: "single" };

  const batch = await approveBatchByExternalReference(externalReference, mpPaymentId, paidAt);
  if (batch) return { ...batch, checkout_type: "batch" };

  return null;
}

// Deuda: periodos desde la colegiatura hasta el mes actual sin pago.
async function getPendingPeriods(memberId) {
  const pool = getPool();
  const [[member]] = await pool.query("SELECT * FROM members WHERE id = ?", [memberId]);
  if (!member) return [];

  const [paidRows] = await pool.query(
    "SELECT period_month, payment_type, status FROM payments WHERE member_id = ? AND status = 'PAGADO'",
    [memberId]
  );
  const allPeriods = periodsBetween(effectiveEnrollmentPeriod(member.enrollment_date, paidRows), previousPeriod(currentPeriod()));
  if (!allPeriods.length) return [];

  const paid = new Set(paidRows.filter((row) => row.payment_type === "MENSUALIDAD").map((row) => row.period_month));
  return allPeriods.filter((period) => !paid.has(period));
}

// Referencias externas unicas para conciliar pagos con Mercado Pago.
function createExternalReference(memberId, period = currentPeriod()) {
  return `CIP-${memberId}-${period}-${crypto.randomBytes(5).toString("hex")}`;
}

function createBatchExternalReference(memberId) {
  return `CIP-TOTAL-${memberId}-${currentPeriod()}-${crypto.randomBytes(5).toString("hex")}`;
}

module.exports = {
  createMercadoPagoPreference,
  fetchMercadoPagoPayment,
  approvePaymentByExternalReference,
  approveCheckoutByExternalReference,
  getPendingPeriods,
  createExternalReference,
  createBatchExternalReference,
};
