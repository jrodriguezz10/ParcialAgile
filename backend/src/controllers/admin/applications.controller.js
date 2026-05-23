const { getPool } = require("../../config/database");
const { createMemberForApprovedApplication, refreshMemberStatus } = require("../../services/members.service");
const { currentPeriod } = require("../../utils/dates");
const { applicationPresenter } = require("../../utils/presenters");

// Solicitudes: revision documentaria y decision administrativa.
async function listApplications(req, res) {
  const status = String(req.query.status || "").toUpperCase();
  const params = [];
  let where = "";
  if (status && status !== "TODOS") {
    where = "WHERE a.status = ?";
    params.push(status);
  }

  const [rows] = await getPool().query(
    `SELECT a.*, u.dni, u.full_name, u.email, u.phone, u.address, u.profession
     FROM applications a
     JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY FIELD(a.status, 'PENDIENTE', 'OBSERVADO', 'APROBADO', 'RECHAZADO'), a.submitted_at DESC`,
    params
  );
  res.json(rows.map((row) => applicationPresenter(req, row)));
}

async function getApplication(req, res) {
  const [[row]] = await getPool().query(
    `SELECT a.*, u.dni, u.full_name, u.email, u.phone, u.address, u.profession
     FROM applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.id = ?`,
    [req.params.id]
  );
  if (!row) return res.status(404).json({ message: "Solicitud no encontrada." });
  res.json(applicationPresenter(req, row));
}

async function approveApplication(req, res) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[application]] = await connection.query(
      `SELECT a.*, u.id AS user_id, u.full_name, u.dni
       FROM applications a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = ?
       FOR UPDATE`,
      [req.params.id]
    );
    if (!application) {
      await connection.rollback();
      return res.status(404).json({ message: "Solicitud no encontrada." });
    }
    if (!application.photo_path || !application.degree_pdf_path || !application.receipt_path) {
      await connection.rollback();
      return res.status(422).json({ message: "La solicitud no tiene todos los documentos." });
    }

    await connection.query(
      `UPDATE applications
       SET status = 'APROBADO', observations = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
       WHERE id = ?`,
      [req.body.observations || null, req.auth.sub, req.params.id]
    );

    const member = await createMemberForApprovedApplication(connection, application);

    await connection.query(
      `INSERT INTO payments
         (member_id, user_id, period_month, amount, payment_type, method, status, paid_at, receipt_path, created_by_admin)
       VALUES (?, ?, ?, 20.00, 'INSCRIPCION', 'RECIBO_INSCRIPCION', 'PAGADO', CURRENT_TIMESTAMP, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = 'PAGADO',
         paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
         receipt_path = COALESCE(receipt_path, VALUES(receipt_path)),
         created_by_admin = VALUES(created_by_admin)`,
      [member.id, application.user_id, currentPeriod(), application.receipt_path, req.auth.sub]
    );

    await connection.commit();
    await refreshMemberStatus(member.id);
    res.json({ message: "Solicitud aprobada y carnet generado.", member });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function observeApplication(req, res) {
  const observations = String(req.body.observations || "").trim();
  if (!observations) return res.status(422).json({ message: "La observacion es requerida." });
  await getPool().query(
    `UPDATE applications
     SET status = 'OBSERVADO', observations = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
     WHERE id = ?`,
    [observations, req.auth.sub, req.params.id]
  );
  res.json({ message: "Solicitud observada." });
}

async function rejectApplication(req, res) {
  const observations = String(req.body.observations || "").trim();
  await getPool().query(
    `UPDATE applications
     SET status = 'RECHAZADO', observations = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
     WHERE id = ?`,
    [observations || "Solicitud rechazada por el Colegio.", req.auth.sub, req.params.id]
  );
  res.json({ message: "Solicitud rechazada." });
}

module.exports = {
  listApplications,
  getApplication,
  approveApplication,
  observeApplication,
  rejectApplication,
};
