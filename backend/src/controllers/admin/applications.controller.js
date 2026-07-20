const { getPool } = require("../../config/database");
const { createMemberForApprovedApplication, refreshMemberStatus } = require("../../services/members.service");
const { currentPeriod } = require("../../utils/dates");
const { fileDataUrl } = require("../../utils/files");
const { applicationPresenter } = require("../../utils/presenters");
const { inAdminBranch } = require("../../utils/admin-scope");
const snapshot = require("../../services/snapshot.service");
const kv = require("../../services/kv.service");
const pgStore = require("../../services/postgres-store.service");

function store() {
  return kv.enabled() ? kv : pgStore;
}

// Solicitudes: revision documentaria y decision administrativa.
async function listApplications(req, res) {
  const status = String(req.query.status || "").toUpperCase();
  if (req.dbReady === false && snapshot.available()) {
    if (kv.enabled() || pgStore.enabled()) return res.json((await store().listApplications(status)).filter((row) => inAdminBranch(req, row)).map((row) => applicationPresenter(req, row)));
    const rows = snapshot.listApplications(status);
    const kvRows = kv.enabled() ? await kv.listKvApplications(status) : [];
    return res.json([...kvRows, ...rows].filter((row) => inAdminBranch(req, row)).map((row) => applicationPresenter(req, row)));
  }

  const params = [];
  let where = "";
  if (status && status !== "TODOS") {
    where = "WHERE a.status = ?";
    params.push(status);
  }

  const [rows] = await getPool().query(
    `SELECT a.*, u.dni, u.full_name, u.email, u.phone, u.address, u.profession, u.branch
     FROM applications a
     JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY FIELD(a.status, 'PENDIENTE', 'OBSERVADO', 'APROBADO', 'RECHAZADO'), a.submitted_at DESC`,
    params
  );
  res.json(rows.filter((row) => inAdminBranch(req, row)).map((row) => applicationPresenter(req, row)));
}

async function getApplication(req, res) {
  if (req.dbReady === false && snapshot.available()) {
    if (kv.enabled() || pgStore.enabled()) {
      const row = await store().getApplication(req.params.id);
      if (!row) return res.status(404).json({ message: "Solicitud no encontrada." });
      if (!inAdminBranch(req, row)) return res.status(404).json({ message: "Solicitud no encontrada en tu sede." });
      return res.json(applicationPresenter(req, row));
    }
    const kvRows = kv.enabled() ? await kv.listKvApplications("TODOS") : [];
    const row = kvRows.find((item) => Number(item.id) === Number(req.params.id)) || snapshot.getApplication(req.params.id);
    if (!row || !inAdminBranch(req, row)) return res.status(404).json({ message: "Solicitud no encontrada en tu sede." });
    return res.json(applicationPresenter(req, row));
  }

  const [[row]] = await getPool().query(
    `SELECT a.*, u.dni, u.full_name, u.email, u.phone, u.address, u.profession, u.branch
     FROM applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.id = ?`,
    [req.params.id]
  );
  if (!row || !inAdminBranch(req, row)) return res.status(404).json({ message: "Solicitud no encontrada en tu sede." });
  res.json(applicationPresenter(req, row));
}

async function importApplicationFiles(req, res) {
  if (req.dbReady !== false || !kv.enabled()) {
    return res.status(409).json({ message: "Importacion disponible solo para almacenamiento cloud KV." });
  }
  const application = await kv.getApplication(req.params.id);
  if (!application) return res.status(404).json({ message: "Solicitud no encontrada." });
  if (!inAdminBranch(req, application)) return res.status(404).json({ message: "Solicitud no encontrada en tu sede." });
  const files = {
    photo: fileDataUrl(req.files?.photo?.[0]),
    degreePdf: fileDataUrl(req.files?.degreePdf?.[0]),
    receipt: fileDataUrl(req.files?.receipt?.[0]),
  };
  const updated = await kv.updateApplicationFiles(req.params.id, files);
  if (!updated) return res.status(404).json({ message: "Solicitud no encontrada." });
  res.json(applicationPresenter(req, updated));
}

async function approveApplication(req, res) {
  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    const application = await store().getApplication(req.params.id);
    if (!application) return res.status(404).json({ message: "Solicitud no encontrada." });
    if (!inAdminBranch(req, application)) return res.status(404).json({ message: "Solicitud no encontrada en tu sede." });
    if (!application.photo_path || !application.degree_pdf_path || !application.receipt_path) {
      return res.status(422).json({ message: "La solicitud no tiene todos los documentos." });
    }
    const member = await store().approveApplication(req.params.id, req.body.observations || null, req.auth.sub);
    return res.json({ message: "Solicitud aprobada y carnet generado.", member });
  }
  if (req.dbReady === false && snapshot.available()) {
    const application = snapshot.getApplication(req.params.id);
    if (!application) return res.status(404).json({ message: "Solicitud no encontrada." });
    if (!inAdminBranch(req, application)) return res.status(404).json({ message: "Solicitud no encontrada en tu sede." });
    if (application.status === "APROBADO") {
      const member = snapshot
        .listMembers("TODOS")
        .find((item) => Number(item.application_id) === Number(application.id) || String(item.user_id) === String(application.user_id));
      return res.json({ message: "La solicitud ya estaba aprobada.", member });
    }
    if (!application.photo_path || !application.degree_pdf_path || !application.receipt_path) {
      return res.status(422).json({ message: "La solicitud no tiene todos los documentos." });
    }
    const member = snapshot.approveApplication(req.params.id, req.body.observations || null, req.auth.sub);
    return res.json({ message: "Solicitud aprobada y carnet generado.", member });
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[application]] = await connection.query(
      `SELECT a.*, u.id AS user_id, u.full_name, u.dni, u.branch
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
    if (!inAdminBranch(req, application)) {
      await connection.rollback();
      return res.status(404).json({ message: "Solicitud no encontrada en tu sede." });
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
       VALUES (?, ?, ?, 2.00, 'INSCRIPCION', 'RECIBO_INSCRIPCION', 'PAGADO', CURRENT_TIMESTAMP, ?, ?)
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
  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    const application = await store().getApplication(req.params.id);
    if (!application) return res.status(404).json({ message: "Solicitud no encontrada." });
    if (!inAdminBranch(req, application)) return res.status(404).json({ message: "Solicitud no encontrada en tu sede." });
    if (application.status === "APROBADO") {
      return res.status(409).json({ message: "Una solicitud aprobada ya tiene carnet generado y no puede observarse." });
    }
    const row = await store().setApplicationStatus(req.params.id, "OBSERVADO", observations, req.auth.sub);
    if (!row) return res.status(404).json({ message: "Solicitud no encontrada." });
    return res.json({ message: "Solicitud observada." });
  }
  if (req.dbReady === false && snapshot.available()) {
    const application = snapshot.getApplication(req.params.id);
    if (!application) return res.status(404).json({ message: "Solicitud no encontrada." });
    if (!inAdminBranch(req, application)) return res.status(404).json({ message: "Solicitud no encontrada en tu sede." });
    if (application.status === "APROBADO") {
      return res.status(409).json({ message: "Una solicitud aprobada ya tiene carnet generado y no puede observarse." });
    }
    const row = snapshot.setApplicationStatus(req.params.id, "OBSERVADO", observations, req.auth.sub);
    if (!row) return res.status(404).json({ message: "Solicitud no encontrada." });
    return res.json({ message: "Solicitud observada." });
  }
  const [[application]] = await getPool().query(
    `SELECT a.status, u.branch
     FROM applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.id = ?
     LIMIT 1`,
    [req.params.id]
  );
  if (!application) return res.status(404).json({ message: "Solicitud no encontrada." });
  if (!inAdminBranch(req, application)) return res.status(404).json({ message: "Solicitud no encontrada en tu sede." });
  if (application.status === "APROBADO") {
    return res.status(409).json({ message: "Una solicitud aprobada ya tiene carnet generado y no puede observarse." });
  }
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
  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    const application = await store().getApplication(req.params.id);
    if (!application) return res.status(404).json({ message: "Solicitud no encontrada." });
    if (!inAdminBranch(req, application)) return res.status(404).json({ message: "Solicitud no encontrada en tu sede." });
    if (application.status === "APROBADO") {
      return res.status(409).json({ message: "Una solicitud aprobada ya tiene carnet generado y no puede rechazarse." });
    }
    const row = await store().setApplicationStatus(
      req.params.id,
      "RECHAZADO",
      observations || "Solicitud rechazada por el Colegio.",
      req.auth.sub
    );
    if (!row) return res.status(404).json({ message: "Solicitud no encontrada." });
    return res.json({ message: "Solicitud rechazada." });
  }
  if (req.dbReady === false && snapshot.available()) {
    const application = snapshot.getApplication(req.params.id);
    if (!application) return res.status(404).json({ message: "Solicitud no encontrada." });
    if (!inAdminBranch(req, application)) return res.status(404).json({ message: "Solicitud no encontrada en tu sede." });
    if (application.status === "APROBADO") {
      return res.status(409).json({ message: "Una solicitud aprobada ya tiene carnet generado y no puede rechazarse." });
    }
    const row = snapshot.setApplicationStatus(
      req.params.id,
      "RECHAZADO",
      observations || "Solicitud rechazada por el Colegio.",
      req.auth.sub
    );
    if (!row) return res.status(404).json({ message: "Solicitud no encontrada." });
    return res.json({ message: "Solicitud rechazada." });
  }
  const [[application]] = await getPool().query(
    `SELECT a.status, u.branch
     FROM applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.id = ?
     LIMIT 1`,
    [req.params.id]
  );
  if (!application) return res.status(404).json({ message: "Solicitud no encontrada." });
  if (!inAdminBranch(req, application)) return res.status(404).json({ message: "Solicitud no encontrada en tu sede." });
  if (application.status === "APROBADO") {
    return res.status(409).json({ message: "Una solicitud aprobada ya tiene carnet generado y no puede rechazarse." });
  }
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
  importApplicationFiles,
  approveApplication,
  observeApplication,
  rejectApplication,
  _inAdminBranch: inAdminBranch,
};
