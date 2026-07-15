const { getPool } = require("../config/database");
const { currentPeriod } = require("../utils/dates");
const { fileDataUrl, fileUrl, frontendUrl, shouldStoreUploadsInDatabase, storedPath } = require("../utils/files");
const { refreshMemberStatus } = require("../services/members.service");
const { consultDniApi } = require("../services/reniec.service");
const { isValidEmail, normalizeDni } = require("../utils/text");
const { signToken } = require("../middleware/auth");
const kv = require("../services/kv.service");
const pgStore = require("../services/postgres-store.service");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

async function requireValidDniIdentity(dni) {
  try {
    const identity = await consultDniApi(dni);
    if (!identity?.full_name) throw new Error("DNI sin datos.");
    return identity;
  } catch (error) {
    const status = error.statusCode === 503 ? 503 : 422;
    const invalid = new Error(
      status === 503
        ? "No se pudo validar el DNI con RENIEC. Intentalo nuevamente."
        : "DNI invalido. Ingresa un DNI valido."
    );
    invalid.statusCode = status;
    throw invalid;
  }
}

// Healthcheck: confirma que la API responde y muestra periodo actual.
async function health(req, res) {
  res.json({
    ok: true,
    db: req.dbReady !== false || kv.enabled() || pgStore.enabled(),
    storage: req.dbReady !== false ? "mysql" : kv.enabled() ? "upstash-kv" : pgStore.enabled() ? "neon-postgres" : "none",
    service: "colegiacion-backend",
    period: currentPeriod(),
  });
}

// Verificacion publica: responde datos visibles del carnet escaneado por QR.
async function verifyCard(req, res) {
  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    const dataStore = kv.enabled() ? kv : pgStore;
    const members = await dataStore.listMembers("TODOS");
    const member = members.find((item) => item.verification_code === req.params.code);
    if (!member) return res.status(404).json({ message: "Carnet no encontrado." });
    const applications = await dataStore.listApplications("TODOS");
    const application = applications.find((item) => Number(item.id) === Number(member.application_id) || String(item.user_id) === String(member.user_id)) || {};
    if (application.status !== "APROBADO") return res.status(404).json({ message: "Carnet no encontrado." });
    res.json({
      full_name: member.full_name,
      dni: member.dni,
      profession: member.profession,
      membership_number: member.membership_number,
      enrollment_date: member.enrollment_date,
      status: member.status,
      verify_url: `${frontendUrl(req)}/verificar/${member.verification_code}`,
      photo_url:
        application.id && /^(data:|kvfile:)/i.test(application.photo_path || "")
          ? `${req.protocol}://${req.get("host")}/api/public/applications/${application.id}/files/photo`
          : fileUrl(req, application.photo_path || member.photo_path),
      last_paid_period: member.last_paid_period || null,
      last_paid_at: member.last_paid_at || null,
    });
    return;
  }

  const pool = getPool();
  const [[member]] = await pool.query(
    `SELECT m.*, u.full_name, u.dni, u.profession, a.photo_path
     FROM members m
     JOIN users u ON u.id = m.user_id
     JOIN applications a ON a.id = m.application_id
     WHERE m.verification_code = ? AND a.status = 'APROBADO'`,
    [req.params.code]
  );
  if (!member) return res.status(404).json({ message: "Carnet no encontrado." });

  const status = await refreshMemberStatus(member.id);
  const [[lastPayment]] = await pool.query(
    `SELECT period_month, paid_at
     FROM payments
     WHERE member_id = ? AND status = 'PAGADO' AND payment_type = 'MENSUALIDAD'
     ORDER BY period_month DESC, paid_at DESC
     LIMIT 1`,
    [member.id]
  );

  res.json({
    full_name: member.full_name,
    dni: member.dni,
    profession: member.profession,
    membership_number: member.membership_number,
    enrollment_date: member.enrollment_date,
    status,
    verify_url: `${frontendUrl(req)}/verificar/${member.verification_code}`,
      photo_url: /^data:/i.test(member.photo_path || "")
        ? `${req.protocol}://${req.get("host")}/api/public/applications/${member.application_id}/files/photo`
        : fileUrl(req, member.photo_path),
    last_paid_period: lastPayment?.period_month || null,
    last_paid_at: lastPayment?.paid_at || null,
  });
}

async function getApplicationFile(req, res) {
  if (req.dbReady !== false) {
    const columns = { photo: "photo_path", degree: "degree_pdf_path", receipt: "receipt_path" };
    const column = columns[req.params.type];
    if (!column) return res.status(404).json({ message: "Archivo no encontrado." });

    const pool = getPool();
    const [[application]] = await pool.query(`SELECT ${column} AS value FROM applications WHERE id = ? LIMIT 1`, [
      req.params.id,
    ]);
    const value = application?.value;
    if (!value) return res.status(404).json({ message: "Archivo no encontrado." });
    if (/^data:/i.test(value)) {
      const match = value.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) return res.status(422).json({ message: "Archivo invalido." });
      const [, mime, base64] = match;
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.end(Buffer.from(base64, "base64"));
    }
    return res.redirect(fileUrl(req, value));
  }

  if (kv.enabled() || pgStore.enabled()) {
    const value = await (kv.enabled() ? kv : pgStore).getApplicationFile(req.params.id, req.params.type);
    if (!value) return res.status(404).json({ message: "Archivo no encontrado." });
    if (/^data:/i.test(value)) {
      const match = value.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) return res.status(422).json({ message: "Archivo invalido." });
      const [, mime, base64] = match;
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.end(Buffer.from(base64, "base64"));
    }
    return res.redirect(fileUrl(req, value));
  }
  return res.status(404).json({ message: "Archivo no encontrado." });
}

async function checkApplicationByDni(req, res) {
  const dni = normalizeDni(req.params.dni);
  if (dni.length !== 8) return res.status(422).json({ message: "DNI invalido." });

  const identity = await requireValidDniIdentity(dni);

  let row = null;
  try {
    const [rows] = await getPool().query(
      `SELECT u.id AS user_id, u.full_name, u.email, u.phone, u.address, u.profession,
              a.id AS application_id, a.status
       FROM users u
       LEFT JOIN applications a ON a.user_id = u.id
       WHERE u.dni = ?
       LIMIT 1`,
      [dni]
    );
    row = rows[0] || null;
  } catch (error) {
    console.warn("Consulta de solicitud sin base de datos disponible:", error.message);
  }
  if (!row && req.dbReady === false && (pgStore.enabled() || kv.enabled())) {
    const application = kv.enabled() ? await kv.findApplicationByDni(dni) : await pgStore.findApplicationByDni(dni);
    if (application) {
      row = {
        user_id: application.user_id,
        full_name: application.full_name,
        email: application.email,
        phone: application.phone,
        address: application.address,
        profession: application.profession,
        application_id: application.id,
        status: application.status,
      };
    }
  }

  res.json({
    dni,
    full_name: identity.full_name || row?.full_name || "",
    first_name: identity.first_name || null,
    paternal_last_name: identity.paternal_last_name || null,
    maternal_last_name: identity.maternal_last_name || null,
    has_application: Boolean(row?.application_id),
    status: row?.status || null,
    user: row
      ? {
          full_name: row.full_name,
          email: row.email,
          phone: row.phone,
          address: row.address,
          profession: row.profession,
        }
      : null,
  });
}

async function submitPublicApplication(req, res) {
  const dni = normalizeDni(req.body.dni);
  let fullName = String(req.body.full_name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const profession = String(req.body.profession || "").trim();
  const branch = String(req.body.branch || "Consejo Nacional - Lima").trim();

  if (dni.length !== 8) return res.status(422).json({ message: "Ingresa un DNI valido." });
  const identity = await requireValidDniIdentity(dni);
  fullName = identity.full_name;
  if (!fullName || !email || !profession) {
    return res.status(422).json({ message: "Completa nombres, correo y profesion." });
  }
  if (!isValidEmail(email)) return res.status(422).json({ message: "Usa un correo valido." });

  const usingPersistentStore = req.dbReady === false && (kv.enabled() || pgStore.enabled());
  const storeFilesInDatabase = usingPersistentStore || shouldStoreUploadsInDatabase();
  const photoPath = storeFilesInDatabase ? fileDataUrl(req.files?.photo?.[0]) : storedPath(req.files?.photo?.[0]) || null;
  const degreePdfPath = storeFilesInDatabase ? fileDataUrl(req.files?.degreePdf?.[0]) : storedPath(req.files?.degreePdf?.[0]) || null;
  const receiptPath = storeFilesInDatabase ? fileDataUrl(req.files?.receipt?.[0]) : storedPath(req.files?.receipt?.[0]) || null;
  if (!photoPath || !degreePdfPath || !receiptPath) {
    return res.status(422).json({ message: "Adjunta foto, titulo profesional PDF y recibo de inscripcion." });
  }

  if (req.dbReady === false && (pgStore.enabled() || kv.enabled())) {
    const { user, application } = await (kv.enabled() ? kv : pgStore).createPublicApplication({
      body: {
        dni,
        full_name: fullName,
        first_name: identity.first_name,
        paternal_last_name: identity.paternal_last_name,
        maternal_last_name: identity.maternal_last_name,
        email,
        profession,
        branch: String(req.body.branch || "Consejo Nacional - Lima"),
      },
      files: { photo: photoPath, degreePdf: degreePdfPath, receipt: receiptPath },
    });
    return res.status(201).json({
      message: "Solicitud enviada al Colegio de Ingenieros.",
      status: application.status,
      token: signToken(user, "user"),
      user,
    });
  }

  let pool;
  try {
    pool = getPool();
  } catch (error) {
    if (!pgStore.enabled() && !kv.enabled()) throw error;
    const { user, application } = await (kv.enabled() ? kv : pgStore).createPublicApplication({
      body: {
        dni,
        full_name: fullName,
        first_name: identity.first_name,
        paternal_last_name: identity.paternal_last_name,
        maternal_last_name: identity.maternal_last_name,
        email,
        profession,
      },
      files: { photo: photoPath, degreePdf: degreePdfPath, receipt: receiptPath },
    });
    return res.status(201).json({
      message: "Solicitud enviada al Colegio de Ingenieros.",
      status: application.status,
      token: signToken(user, "user"),
      user,
    });
  }

  const [[existing]] = await pool.query(
    `SELECT a.id, a.status, a.user_id
     FROM users u
     JOIN applications a ON a.user_id = u.id
     WHERE u.dni = ?
     LIMIT 1`,
    [dni]
  );
  if (existing && !["OBSERVADO", "RECHAZADO"].includes(existing.status)) {
    return res.status(409).json({ message: `Este DNI ya tiene una solicitud registrada con estado ${existing.status}.` });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[existingUser]] = await connection.query("SELECT id FROM users WHERE dni = ? LIMIT 1", [dni]);
    let userId = existingUser?.id;
    if (userId) {
      await connection.query(
        `UPDATE users
         SET full_name = ?, first_name = ?, paternal_last_name = ?, maternal_last_name = ?,
             email = ?, phone = ?, address = ?, profession = ?, branch = ?
         WHERE id = ?`,
        [
          fullName,
          identity.first_name || null,
          identity.paternal_last_name || null,
          identity.maternal_last_name || null,
          email,
          null,
          null,
          profession,
          branch,
          userId,
        ]
      );
    } else {
      const passwordHash = await bcrypt.hash(crypto.randomBytes(18).toString("hex"), 10);
      const [userResult] = await connection.query(
        `INSERT INTO users
           (dni, full_name, first_name, paternal_last_name, maternal_last_name,
            email, phone, address, profession, branch, password_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dni,
          fullName,
          identity.first_name || null,
          identity.paternal_last_name || null,
          identity.maternal_last_name || null,
          email,
          null,
          null,
          profession,
          branch,
          passwordHash,
        ]
      );
      userId = userResult.insertId;
    }

    if (existing) {
      await connection.query(
        `UPDATE applications
         SET status = 'PENDIENTE', photo_path = ?, degree_pdf_path = ?, receipt_path = ?,
             observations = NULL, submitted_at = CURRENT_TIMESTAMP, reviewed_at = NULL, reviewed_by = NULL
         WHERE id = ?`,
        [photoPath, degreePdfPath, receiptPath, existing.id]
      );
    } else {
      await connection.query(
        `INSERT INTO applications (user_id, status, photo_path, degree_pdf_path, receipt_path)
         VALUES (?, 'PENDIENTE', ?, ?, ?)`,
        [userId, photoPath, degreePdfPath, receiptPath]
      );
    }
    await connection.commit();
    const user = { id: userId, dni, full_name: fullName, email };
    res.status(201).json({
      message: "Solicitud enviada al Colegio de Ingenieros.",
      status: "PENDIENTE",
      token: signToken(user, "user"),
      user,
    });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Ese DNI o correo ya esta registrado." });
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function accessByDni(req, res) {
  const dni = normalizeDni(req.params.dni);
  if (dni.length !== 8) return res.status(422).json({ message: "DNI invalido." });

  let user = null;
  try {
    [[user]] = await getPool().query(
      `SELECT u.*
       FROM users u
       JOIN applications a ON a.user_id = u.id
       WHERE u.dni = ?
       LIMIT 1`,
      [dni]
    );
  } catch (error) {
    if (kv.enabled()) user = await kv.findUserByDni(dni);
    else if (pgStore.enabled()) user = await pgStore.findUserByDni(dni);
  }
  if (!user) return res.status(404).json({ message: "No hay solicitud registrada para este DNI." });

  res.json({
    token: signToken(user, "user"),
    user: {
      id: user.id,
      dni: user.dni,
      full_name: user.full_name,
      email: user.email,
    },
  });
}

async function startByDni(req, res) {
  const dni = normalizeDni(req.params.dni);
  if (dni.length !== 8) return res.status(422).json({ message: "DNI invalido." });
  const identity = await requireValidDniIdentity(dni);

  let pool;
  try {
    if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
      const user = await (kv.enabled() ? kv : pgStore).startByDni({ dni, identity });
      return res.status(201).json({
        token: signToken(user, "user"),
        user: {
          id: user.id,
          dni: user.dni,
          full_name: user.full_name,
          email: user.email,
        },
      });
    }
    pool = getPool();
  } catch (error) {
    error.statusCode = error.statusCode || 503;
    throw error;
  }

  let existingUser = null;
  try {
    [[existingUser]] = await pool.query("SELECT * FROM users WHERE dni = ? LIMIT 1", [dni]);
  } catch (error) {
    error.statusCode = error.statusCode || 503;
    throw error;
  }
  if (existingUser) {
    return res.json({
      token: signToken(existingUser, "user"),
      user: {
        id: existingUser.id,
        dni: existingUser.dni,
        full_name: existingUser.full_name,
        email: existingUser.email,
      },
    });
  }

  const fullName = identity.full_name;
  const passwordHash = await bcrypt.hash(crypto.randomBytes(18).toString("hex"), 10);
  const [result] = await pool.query(
    `INSERT INTO users
       (dni, full_name, first_name, paternal_last_name, maternal_last_name, email, profession, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, 'Pendiente', ?)`,
    [
      dni,
      fullName,
      identity.first_name || null,
      identity.paternal_last_name || null,
      identity.maternal_last_name || null,
      `${dni}@pendiente.cip.local`,
      passwordHash,
    ]
  );

  const user = {
    id: result.insertId,
    dni,
    full_name: fullName,
    email: `${dni}@pendiente.cip.local`,
  };
  res.status(201).json({ token: signToken(user, "user"), user });
}

module.exports = {
  health,
  verifyCard,
  getApplicationFile,
  checkApplicationByDni,
  submitPublicApplication,
  accessByDni,
  startByDni,
};
