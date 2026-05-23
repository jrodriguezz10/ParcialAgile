const { getPool } = require("../config/database");
const { currentPeriod } = require("../utils/dates");
const { fileUrl, frontendUrl, storedPath } = require("../utils/files");
const { refreshMemberStatus } = require("../services/members.service");
const { consultDniApi } = require("../services/reniec.service");
const { isValidEmail, normalizeDni } = require("../utils/text");
const { signToken } = require("../middleware/auth");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// Healthcheck: confirma que la API responde y muestra periodo actual.
async function health(req, res) {
  res.json({ ok: true, db: req.dbReady !== false, service: "colegiacion-backend", period: currentPeriod() });
}

// Verificacion publica: responde datos visibles del carnet escaneado por QR.
async function verifyCard(req, res) {
  const pool = getPool();
  const [[member]] = await pool.query(
    `SELECT m.*, u.full_name, u.dni, u.profession, a.photo_path
     FROM members m
     JOIN users u ON u.id = m.user_id
     JOIN applications a ON a.id = m.application_id
     WHERE m.verification_code = ?`,
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
    photo_url: fileUrl(req, member.photo_path),
    last_paid_period: lastPayment?.period_month || null,
    last_paid_at: lastPayment?.paid_at || null,
  });
}

async function checkApplicationByDni(req, res) {
  const dni = normalizeDni(req.params.dni);
  if (dni.length !== 8) return res.status(422).json({ message: "DNI invalido." });

  let identity = {};
  try {
    identity = await consultDniApi(dni);
  } catch (error) {
    identity = {};
  }

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
  const pool = getPool();
  const dni = normalizeDni(req.body.dni);
  const fullName = String(req.body.full_name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(0, 9);
  const address = String(req.body.address || "").trim();
  const profession = String(req.body.profession || "").trim();

  if (dni.length !== 8) return res.status(422).json({ message: "Ingresa un DNI valido." });
  if (!fullName || !profession) return res.status(422).json({ message: "Completa nombres y profesion." });
  if (!isValidEmail(email)) return res.status(422).json({ message: "Usa un correo valido." });
  if (!/^\d{9}$/.test(phone)) return res.status(422).json({ message: "El telefono debe tener 9 digitos." });

  const [[existing]] = await pool.query(
    `SELECT a.id, a.status
     FROM users u
     JOIN applications a ON a.user_id = u.id
     WHERE u.dni = ?
     LIMIT 1`,
    [dni]
  );
  if (existing) {
    return res.status(409).json({ message: `Este DNI ya tiene una solicitud registrada con estado ${existing.status}.` });
  }

  const photoPath = storedPath(req.files?.photo?.[0]) || null;
  const degreePdfPath = storedPath(req.files?.degreePdf?.[0]) || null;
  const receiptPath = storedPath(req.files?.receipt?.[0]) || null;
  if (!photoPath || !degreePdfPath || !receiptPath) {
    return res.status(422).json({ message: "Adjunta foto, titulo profesional PDF y recibo de inscripcion." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[existingUser]] = await connection.query("SELECT id FROM users WHERE dni = ? LIMIT 1", [dni]);
    let userId = existingUser?.id;
    if (userId) {
      await connection.query(
        `UPDATE users
         SET full_name = ?, email = ?, phone = ?, address = ?, profession = ?
         WHERE id = ?`,
        [fullName, email, phone, address, profession, userId]
      );
    } else {
      const passwordHash = await bcrypt.hash(crypto.randomBytes(18).toString("hex"), 10);
      const [userResult] = await connection.query(
        `INSERT INTO users
           (dni, full_name, email, phone, address, profession, password_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [dni, fullName, email, phone, address, profession, passwordHash]
      );
      userId = userResult.insertId;
    }

    await connection.query(
      `INSERT INTO applications (user_id, status, photo_path, degree_pdf_path, receipt_path)
       VALUES (?, 'PENDIENTE', ?, ?, ?)`,
      [userId, photoPath, degreePdfPath, receiptPath]
    );
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

  const [[user]] = await getPool().query(
    `SELECT u.*
     FROM users u
     JOIN applications a ON a.user_id = u.id
     WHERE u.dni = ?
     LIMIT 1`,
    [dni]
  );
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

  async function temporaryStart() {
    let identity = {};
    try {
      identity = await consultDniApi(dni);
    } catch {
      identity = {};
    }
    const fullName = identity.full_name || `DNI ${dni}`;
    const user = {
      id: `dni-${dni}`,
      dni,
      full_name: fullName,
      email: `${dni}@pendiente.cip.local`,
    };
    return res.status(201).json({ token: signToken(user, "user"), user });
  }

  let pool;
  try {
    pool = getPool();
  } catch (error) {
    console.warn("Inicio temporal sin base de datos disponible:", error.message);
    return temporaryStart();
  }

  let existingUser = null;
  try {
    [[existingUser]] = await pool.query("SELECT * FROM users WHERE dni = ? LIMIT 1", [dni]);
  } catch (error) {
    console.warn("Inicio temporal por error de base de datos:", error.message);
    return temporaryStart();
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

  let identity = {};
  try {
    identity = await consultDniApi(dni);
  } catch (error) {
    identity = {};
  }

  const fullName = identity.full_name || `DNI ${dni}`;
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
  checkApplicationByDni,
  submitPublicApplication,
  accessByDni,
  startByDni,
};
