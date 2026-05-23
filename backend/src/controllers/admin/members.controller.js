const { getPool } = require("../../config/database");
const { createManualMemberRecord } = require("../../services/admin-members.service");
const { refreshAllMemberStatuses, refreshMemberStatus } = require("../../services/members.service");
const { comparePeriods, currentPeriod, isValidPeriod, periodFromDate } = require("../../utils/dates");
const { fileUrl, frontendUrl } = require("../../utils/files");

// Padron: alta manual, estado de colegiados y pagos registrados por admin.
async function createManualMember(req, res) {
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

async function listMembers(req, res) {
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
            MAX(CASE WHEN p.status = 'PAGADO' THEN p.period_month END) AS last_paid_period,
            MAX(CASE WHEN p.status = 'PAGADO' THEN p.paid_at END) AS last_paid_at
     FROM members m
     JOIN users u ON u.id = m.user_id
     JOIN applications a ON a.id = m.application_id
     LEFT JOIN payments p ON p.member_id = m.id
     ${where}
     GROUP BY m.id, u.id
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
  const pool = getPool();
  const requestedStatus = String(req.body.status || "").trim().toUpperCase();
  const reason = String(req.body.reason || "").trim();
  const allowed = ["AUTO", "HABILITADO", "INHABILITADO"];

  if (!allowed.includes(requestedStatus)) return res.status(422).json({ message: "Estado invalido." });

  const [[member]] = await pool.query("SELECT * FROM members WHERE id = ?", [req.params.id]);
  if (!member) return res.status(404).json({ message: "Colegiado no encontrado." });

  const override = requestedStatus === "AUTO" ? null : requestedStatus;
  await pool.query("UPDATE members SET status_override = ?, status_reason = ? WHERE id = ?", [
    override,
    reason || null,
    req.params.id,
  ]);
  const status = await refreshMemberStatus(member.id);

  const [[updated]] = await pool.query(
    `SELECT m.*, u.dni, u.full_name, u.email, u.phone, u.profession,
            MAX(CASE WHEN p.status = 'PAGADO' THEN p.period_month END) AS last_paid_period,
            MAX(CASE WHEN p.status = 'PAGADO' THEN p.paid_at END) AS last_paid_at
     FROM members m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN payments p ON p.member_id = m.id
     WHERE m.id = ?
     GROUP BY m.id, u.id`,
    [req.params.id]
  );

  res.json({ ...updated, status, verify_url: `${frontendUrl(req)}/verificar/${updated.verification_code}` });
}

async function listMemberPayments(req, res) {
  const [payments] = await getPool().query(
    "SELECT * FROM payments WHERE member_id = ? ORDER BY period_month DESC, created_at DESC",
    [req.params.id]
  );
  res.json(payments);
}

async function createMemberPayment(req, res) {
  const pool = getPool();
  const period = req.body.period_month || currentPeriod();
  const amount = Number(req.body.amount || 20);
  if (!isValidPeriod(period)) return res.status(422).json({ message: "Periodo invalido. Usa YYYY-MM." });
  if (amount <= 0) return res.status(422).json({ message: "Monto invalido." });

  const [[member]] = await pool.query("SELECT * FROM members WHERE id = ?", [req.params.id]);
  if (!member) return res.status(404).json({ message: "Colegiado no encontrado." });

  const enrollmentPeriod = periodFromDate(member.enrollment_date);
  if (comparePeriods(period, enrollmentPeriod) < 0) {
    return res.status(422).json({ message: `Solo se puede registrar pagos desde ${enrollmentPeriod}.` });
  }

  await pool.query(
    `INSERT INTO payments
       (member_id, user_id, period_month, amount, payment_type, method, status, paid_at, created_by_admin)
     VALUES (?, ?, ?, ?, 'MENSUALIDAD', 'MANUAL', 'PAGADO', CURRENT_TIMESTAMP, ?)
     ON DUPLICATE KEY UPDATE
       amount = VALUES(amount),
       method = 'MANUAL',
       status = 'PAGADO',
       paid_at = CURRENT_TIMESTAMP,
       created_by_admin = VALUES(created_by_admin)`,
    [member.id, member.user_id, period, amount, req.auth.sub]
  );

  const status = await refreshMemberStatus(member.id);
  res.status(201).json({ message: "Pago registrado.", status });
}

module.exports = {
  createManualMember,
  listMembers,
  updateMemberStatus,
  listMemberPayments,
  createMemberPayment,
};
