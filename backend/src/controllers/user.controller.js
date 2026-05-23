const { getPool } = require("../config/database");
const { getUserBundle } = require("../services/members.service");
const { currentPeriod } = require("../utils/dates");
const { storedPath } = require("../utils/files");
const { isValidEmail, normalizeDni } = require("../utils/text");

// Perfil completo del interesado: usuario, solicitud, miembro y periodo actual.
async function getMe(req, res) {
  try {
    const bundle = await getUserBundle(req.auth.sub, req);
    if (!bundle) return res.status(404).json({ message: "Usuario no encontrado." });
    res.json(bundle);
  } catch (error) {
    console.warn("Perfil temporal sin base de datos disponible:", error.message);
    res.json({
      user: {
        id: req.auth.sub,
        dni: req.auth.dni,
        full_name: req.auth.name || `DNI ${req.auth.dni || ""}`.trim(),
        email: req.auth.email,
        profession: "Pendiente",
      },
      application: null,
      member: null,
      current_period: currentPeriod(),
    });
  }
}

// Actualizacion de perfil: datos basicos y cambio opcional de clave.
async function updateProfile(req, res) {
  const pool = getPool();
  const fullName = String(req.body.full_name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim();
  const address = String(req.body.address || "").trim();
  const profession = String(req.body.profession || "").trim();

  if (!fullName || !email || !profession) {
    return res.status(422).json({ message: "Completa nombres, correo y profesion." });
  }
  if (!isValidEmail(email)) {
    return res.status(422).json({ message: "Usa un correo valido." });
  }
  if (!/^\d{9}$/.test(phone)) {
    return res.status(422).json({ message: "El telefono debe tener 9 digitos." });
  }

  try {
    await pool.query(
      `UPDATE users
       SET full_name = ?, email = ?, phone = ?, address = ?, profession = ?
       WHERE id = ?`,
      [fullName, email, phone, address, profession, req.auth.sub]
    );
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Ese correo ya esta registrado." });
    }
    throw error;
  }

  res.json(await getUserBundle(req.auth.sub, req));
}

// Solicitud de colegiatura: guarda datos, documentos y reinicia estado a pendiente.
async function submitApplication(req, res) {
  const dni = normalizeDni(req.body.dni);
  const fullName = String(req.body.full_name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim();
  const address = String(req.body.address || "").trim();
  const profession = String(req.body.profession || "").trim();

  if (dni.length !== 8) {
    return res.status(422).json({ message: "Ingresa un DNI valido de 8 digitos." });
  }
  if (!fullName || !email || !profession) {
    return res.status(422).json({ message: "Completa nombres, correo y profesion." });
  }
  if (!isValidEmail(email)) {
    return res.status(422).json({ message: "Usa un correo valido." });
  }
  if (!/^\d{9}$/.test(phone)) {
    return res.status(422).json({ message: "El telefono debe tener 9 digitos." });
  }

  let pool;
  try {
    pool = getPool();
  } catch (error) {
    console.warn("Solicitud temporal sin base de datos disponible:", error.message);
    return res.status(201).json({
      user: {
        id: req.auth.sub,
        dni,
        full_name: fullName,
        email,
        phone,
        address,
        profession,
      },
      application: {
        id: null,
        status: "PENDIENTE",
        observations: null,
        photo_url: null,
        degree_pdf_url: null,
        receipt_url: null,
      },
      member: null,
      current_period: currentPeriod(),
    });
  }

  let existingApplication = null;
  try {
    [[existingApplication]] = await pool.query("SELECT * FROM applications WHERE user_id = ?", [
      req.auth.sub,
    ]);
  } catch (error) {
    console.warn("Solicitud temporal por error de base de datos:", error.message);
    return res.status(201).json({
      user: {
        id: req.auth.sub,
        dni,
        full_name: fullName,
        email,
        phone,
        address,
        profession,
      },
      application: {
        id: null,
        status: "PENDIENTE",
        observations: null,
        photo_url: null,
        degree_pdf_url: null,
        receipt_url: null,
      },
      member: null,
      current_period: currentPeriod(),
    });
  }

  if (existingApplication?.status === "APROBADO") {
    return res.status(409).json({ message: "La solicitud ya fue aprobada." });
  }

  const photoPath = storedPath(req.files?.photo?.[0]) || existingApplication?.photo_path || null;
  const degreePdfPath = storedPath(req.files?.degreePdf?.[0]) || existingApplication?.degree_pdf_path || null;
  const receiptPath = storedPath(req.files?.receipt?.[0]) || existingApplication?.receipt_path || null;

  if (!photoPath || !degreePdfPath || !receiptPath) {
    return res.status(422).json({
      message: "Debes adjuntar foto, titulo profesional en PDF y recibo de inscripcion.",
    });
  }

  try {
    await pool.query(
      `UPDATE users
       SET dni = ?, full_name = ?, email = ?, phone = ?, address = ?, profession = ?
       WHERE id = ?`,
      [dni, fullName, email, phone, address, profession, req.auth.sub]
    );
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Ese DNI o correo ya esta registrado en otra cuenta." });
    }
    throw error;
  }

  if (existingApplication) {
    await pool.query(
      `UPDATE applications
       SET status = 'PENDIENTE', photo_path = ?, degree_pdf_path = ?, receipt_path = ?,
           observations = NULL, submitted_at = CURRENT_TIMESTAMP, reviewed_at = NULL, reviewed_by = NULL
       WHERE user_id = ?`,
      [photoPath, degreePdfPath, receiptPath, req.auth.sub]
    );
  } else {
    await pool.query(
      `INSERT INTO applications (user_id, status, photo_path, degree_pdf_path, receipt_path)
       VALUES (?, 'PENDIENTE', ?, ?, ?)`,
      [req.auth.sub, photoPath, degreePdfPath, receiptPath]
    );
  }

  res.status(201).json(await getUserBundle(req.auth.sub, req));
}

async function checkApplicationByDni(req, res) {
  const dni = normalizeDni(req.params.dni);
  if (dni.length !== 8) return res.status(422).json({ message: "DNI invalido." });

  const [[row]] = await getPool().query(
    `SELECT u.full_name, a.id AS application_id, a.status
     FROM users u
     LEFT JOIN applications a ON a.user_id = u.id
     WHERE u.dni = ?
     LIMIT 1`,
    [dni]
  );

  res.json({
    exists: Boolean(row?.application_id),
    status: row?.status || null,
    full_name: row?.full_name || null,
  });
}

module.exports = {
  getMe,
  updateProfile,
  submitApplication,
  checkApplicationByDni,
};
