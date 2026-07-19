const crypto = require("crypto");
const { getPool } = require("../config/database");
const { currentPeriod, periodFromDate, previousPeriod, periodsBetween, todayDate } = require("../utils/dates");
const { frontendUrl } = require("../utils/files");
const { applicationPresenter } = require("../utils/presenters");

// Calcula mensualidades esperadas menos pagos registrados.
async function getPendingMonthlyPeriods(pool, memberId, enrollmentDate) {
  const expectedPeriods = periodsBetween(periodFromDate(enrollmentDate), previousPeriod(currentPeriod()));
  if (!expectedPeriods.length) return [];

  const [paidRows] = await pool.query(
    "SELECT period_month FROM payments WHERE member_id = ? AND status = 'PAGADO' AND payment_type = 'MENSUALIDAD'",
    [memberId]
  );
  const paidPeriods = new Set(paidRows.map((row) => row.period_month));
  return expectedPeriods.filter((period) => !paidPeriods.has(period));
}

// Recalcula todos los estados cuando el admin lista el padron.
async function refreshAllMemberStatuses() {
  const pool = getPool();
  const [members] = await pool.query("SELECT id FROM members");
  for (const member of members) {
    await refreshMemberStatus(member.id);
  }
}

// Estado del carnet: calculo automatico por mensualidades vencidas.
async function refreshMemberStatus(memberId) {
  const pool = getPool();
  const [[row]] = await pool.query(
    `SELECT id, enrollment_date
     FROM members
     WHERE id = ?`,
    [memberId]
  );
  if (!row) return null;

  const pendingPeriods = await getPendingMonthlyPeriods(pool, memberId, row.enrollment_date);
  const status = pendingPeriods.length ? "INHABILITADO" : "HABILITADO";
  await pool.query("UPDATE members SET status = ?, status_override = NULL, status_reason = NULL WHERE id = ?", [status, memberId]);
  return status;
}

// Paquete usado por el dashboard del interesado.
async function getUserBundle(userId, req) {
  const pool = getPool();
  const [[user]] = await pool.query(
    `SELECT id, dni, full_name, first_name, paternal_last_name, maternal_last_name,
            email, phone, address, profession, created_at
     FROM users WHERE id = ?`,
    [userId]
  );
  if (!user) return null;

  const [[application]] = await pool.query("SELECT * FROM applications WHERE user_id = ?", [userId]);
  const [[member]] = await pool.query(
    `SELECT m.*
     FROM members m
     JOIN applications a ON a.id = m.application_id
     WHERE m.user_id = ? AND a.status = 'APROBADO'
     LIMIT 1`,
    [userId]
  );

  let hydratedMember = member || null;
  if (hydratedMember) {
    const status = await refreshMemberStatus(hydratedMember.id);
    hydratedMember = { ...hydratedMember, status };
    const [[lastPayment]] = await pool.query(
      `SELECT period_month, paid_at
       FROM payments
       WHERE member_id = ? AND status = 'PAGADO' AND payment_type = 'MENSUALIDAD'
       ORDER BY period_month DESC, paid_at DESC
       LIMIT 1`,
      [hydratedMember.id]
    );
    hydratedMember.last_paid_period = lastPayment?.period_month || null;
    hydratedMember.last_paid_at = lastPayment?.paid_at || null;
    hydratedMember.verify_url = `${frontendUrl(req)}/verificar/${hydratedMember.verification_code}`;
  }

  return {
    user,
    application: applicationPresenter(req, application),
    member: hydratedMember,
    current_period: currentPeriod(),
  };
}

// Numero CIP correlativo por anio.
async function createMembershipNumber(connection) {
  const [[row]] = await connection.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM members");
  const year = new Date().getFullYear();
  return `CIP-${year}-${String(row.next_id).padStart(5, "0")}`;
}

// Crea el miembro cuando una solicitud pasa a APROBADO.
async function createMemberForApprovedApplication(connection, application, options = {}) {
  const [[existingMember]] = await connection.query("SELECT * FROM members WHERE application_id = ?", [
    application.id,
  ]);
  if (existingMember) return existingMember;

  const membershipNumber = await createMembershipNumber(connection);
  const verificationCode = crypto.randomUUID();
  const enrollmentDate = options.enrollmentDate || todayDate();
  const [memberResult] = await connection.query(
    `INSERT INTO members
       (user_id, application_id, membership_number, enrollment_date, status, verification_code)
     VALUES (?, ?, ?, ?, 'HABILITADO', ?)`,
    [application.user_id, application.id, membershipNumber, enrollmentDate, verificationCode]
  );
  const [[createdMember]] = await connection.query("SELECT * FROM members WHERE id = ?", [
    memberResult.insertId,
  ]);
  return createdMember;
}

module.exports = {
  refreshAllMemberStatuses,
  refreshMemberStatus,
  getUserBundle,
  createMemberForApprovedApplication,
};
