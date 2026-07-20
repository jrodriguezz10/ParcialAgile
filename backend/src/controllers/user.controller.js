const { getPool } = require("../config/database");
const { getUserBundle } = require("../services/members.service");
const { currentPeriod } = require("../utils/dates");
const { fileDataUrl, fileUrl, shouldStoreUploadsInDatabase, storedPath } = require("../utils/files");
const { isValidEmail, normalizeDni } = require("../utils/text");
const { consultDniApi } = require("../services/reniec.service");
const { isValidEngineeringCareer } = require("../constants/catalogs");
const { applicationPresenter } = require("../utils/presenters");
const snapshot = require("../services/snapshot.service");
const kv = require("../services/kv.service");
const pgStore = require("../services/postgres-store.service");

async function requireValidDniIdentity(dni) {
  try {
    const identity = await consultDniApi(dni);
    if (!identity?.full_name) throw new Error("DNI sin datos.");
    return identity;
  } catch (error) {
    const invalid = new Error(
      error.statusCode === 503
        ? "No se pudo validar el DNI con RENIEC. Intentalo nuevamente."
        : "DNI invalido. Ingresa un DNI valido."
    );
    invalid.statusCode = error.statusCode === 503 ? 503 : 422;
    throw invalid;
  }
}

// Perfil completo del interesado: usuario, solicitud, miembro y periodo actual.
async function getMe(req, res) {
  try {
    if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
      const dataStore = kv.enabled() ? kv : pgStore;
      const users = await dataStore.listUsers("");
      const user = users.find((item) => String(item.id) === String(req.auth.sub) || item.dni === req.auth.dni) || {
        id: req.auth.sub,
        dni: req.auth.dni,
        full_name: req.auth.name || "",
        email: req.auth.email || "",
        profession: "",
      };
      const applications = await dataStore.listApplications("TODOS");
      const application = applications.find((item) => String(item.user_id) === String(user.id) || item.dni === user.dni) || null;
      const members = await dataStore.listMembers("TODOS");
      const member = application?.status === "APROBADO"
        ? members.find((item) => String(item.user_id) === String(user.id) || item.dni === user.dni) || null
        : null;
      const presentedApplication = application
        ? {
            ...application,
            photo_url: /^(data:|kvfile:)/i.test(application.photo_path || "")
              ? `${req.protocol}://${req.get("host")}/api/public/applications/${application.id}/files/photo`
              : fileUrl(req, application.photo_path),
            degree_pdf_url: /^(data:|kvfile:)/i.test(application.degree_pdf_path || "")
              ? `${req.protocol}://${req.get("host")}/api/public/applications/${application.id}/files/degree`
              : fileUrl(req, application.degree_pdf_path),
            receipt_url: /^(data:|kvfile:)/i.test(application.receipt_path || "")
              ? `${req.protocol}://${req.get("host")}/api/public/applications/${application.id}/files/receipt`
              : fileUrl(req, application.receipt_path),
          }
        : null;
      const presentedMember = member
        ? {
            ...member,
            photo_url: presentedApplication?.photo_url || fileUrl(req, member.photo_path),
          }
        : null;
      return res.json({ user, application: presentedApplication, member: presentedMember, current_period: currentPeriod() });
    }
    if (req.dbReady === false && snapshot.available()) {
      const users = snapshot.listUsers("");
      const user = users.find((item) => String(item.id) === String(req.auth.sub) || item.dni === req.auth.dni) || {
        id: req.auth.sub,
        dni: req.auth.dni,
        full_name: req.auth.name || "",
        email: req.auth.email || "",
        profession: "",
      };
      const application = snapshot
        .listApplications("TODOS")
        .find((item) => String(item.user_id) === String(user.id) || item.dni === user.dni) || null;
      const member = application?.status === "APROBADO"
        ? snapshot.listMembers("TODOS").find((item) => String(item.user_id) === String(user.id) || item.dni === user.dni) || null
        : null;
      const presentedApplication = application ? applicationPresenter(req, application) : null;
      const presentedMember = member ? { ...member, photo_url: presentedApplication?.photo_url || fileUrl(req, member.photo_path) } : null;
      return res.json({ user, application: presentedApplication, member: presentedMember, current_period: currentPeriod() });
    }
    const bundle = await getUserBundle(req.auth.sub, req);
    if (!bundle) return res.status(404).json({ message: "Usuario no encontrado." });
    res.json(bundle);
  } catch (error) {
    console.warn("Perfil temporal sin base de datos disponible:", error.message);
    res.json({
      user: {
        id: req.auth.sub,
        dni: req.auth.dni,
        full_name: req.auth.name || "",
        email: req.auth.email || "",
        profession: "",
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
  const profession = String(req.body.profession || "").trim();
  const branch = String(req.body.branch || "Consejo Nacional - Lima").trim();
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(0, 9);

  if (!fullName || !email || !profession) {
    return res.status(422).json({ message: "Completa nombres, correo y profesion." });
  }
  if (!isValidEngineeringCareer(profession)) {
    return res.status(422).json({ message: "Selecciona una profesion valida de la lista." });
  }
  if (phone && !/^9\d{8}$/.test(phone)) {
    return res.status(422).json({ message: "Si ingresas celular, debe tener 9 digitos." });
  }
  if (!isValidEmail(email)) {
    return res.status(422).json({ message: "Usa un correo valido." });
  }
  try {
    await pool.query(
      `UPDATE users
       SET full_name = ?, email = ?, phone = ?, address = ?, profession = ?, branch = ?
       WHERE id = ?`,
      [fullName, email, phone, null, profession, branch, req.auth.sub]
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
  let fullName = String(req.body.full_name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const profession = String(req.body.profession || "").trim();
  const branch = String(req.body.branch || "Consejo Nacional - Lima").trim();
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(0, 9);

  if (dni.length !== 8) {
    return res.status(422).json({ message: "Ingresa un DNI valido de 8 digitos." });
  }
  const identity = await requireValidDniIdentity(dni);
  fullName = identity.full_name;
  if (!fullName || !email || !profession) {
    return res.status(422).json({ message: "Completa nombres, correo y profesion." });
  }
  if (phone && !/^9\d{8}$/.test(phone)) {
    return res.status(422).json({ message: "Si ingresas celular, debe tener 9 digitos." });
  }
  if (!isValidEmail(email)) {
    return res.status(422).json({ message: "Usa un correo valido." });
  }

  if (req.dbReady === false && (pgStore.enabled() || kv.enabled())) {
    const dataStore = kv.enabled() ? kv : pgStore;
    const photoPath = fileDataUrl(req.files?.photo?.[0]);
    const degreePdfPath = fileDataUrl(req.files?.degreePdf?.[0]);
    const receiptPath = fileDataUrl(req.files?.receipt?.[0]);
    if (!photoPath || !degreePdfPath || !receiptPath) {
      return res.status(422).json({
        message: "Debes adjuntar foto, titulo profesional en PDF y recibo de inscripcion.",
      });
    }
    const { user, application } = await dataStore.createPublicApplication({
      body: {
        dni,
        full_name: fullName,
        first_name: identity.first_name,
        paternal_last_name: identity.paternal_last_name,
        maternal_last_name: identity.maternal_last_name,
        email,
        phone,
        profession,
        branch: String(req.body.branch || "Consejo Nacional - Lima"),
      },
      files: { photo: photoPath, degreePdf: degreePdfPath, receipt: receiptPath },
    });
    return res.status(201).json({
      user,
      application: {
        ...application,
        photo_url: `${req.protocol}://${req.get("host")}/api/public/applications/${application.id}/files/photo`,
        degree_pdf_url: `${req.protocol}://${req.get("host")}/api/public/applications/${application.id}/files/degree`,
        receipt_url: `${req.protocol}://${req.get("host")}/api/public/applications/${application.id}/files/receipt`,
      },
      member: null,
      current_period: currentPeriod(),
    });
  }

  if (req.dbReady === false && snapshot.available()) {
    const photoPath = fileDataUrl(req.files?.photo?.[0]);
    const degreePdfPath = fileDataUrl(req.files?.degreePdf?.[0]);
    const receiptPath = fileDataUrl(req.files?.receipt?.[0]);
    const existingApplication = snapshot
      .listApplications("TODOS")
      .find((item) => String(item.user_id) === String(req.auth.sub) || item.dni === dni);
    if (
      !(photoPath || existingApplication?.photo_path) ||
      !(degreePdfPath || existingApplication?.degree_pdf_path) ||
      !(receiptPath || existingApplication?.receipt_path)
    ) {
      return res.status(422).json({
        message: "Debes adjuntar foto, titulo profesional en PDF y recibo de inscripcion.",
      });
    }
    const { user, application } = snapshot.createPublicApplication({
      body: {
        user_id: req.auth.sub,
        dni,
        full_name: fullName,
        first_name: identity.first_name,
        paternal_last_name: identity.paternal_last_name,
        maternal_last_name: identity.maternal_last_name,
        email,
        phone,
        profession,
        branch,
      },
      files: { photo: photoPath, degreePdf: degreePdfPath, receipt: receiptPath },
    });
    return res.status(201).json({
      user,
      application: applicationPresenter(req, application),
      member: null,
      current_period: currentPeriod(),
    });
  }

  let pool;
  try {
    pool = getPool();
  } catch (error) {
    console.warn("Solicitud temporal sin base de datos disponible:", error.message);
    return res.status(503).json({ message: "No hay almacenamiento activo para guardar la solicitud y sus fotos. Configura base de datos o KV." });
  }

  let existingApplication = null;
  try {
    [[existingApplication]] = await pool.query("SELECT * FROM applications WHERE user_id = ?", [
      req.auth.sub,
    ]);
  } catch (error) {
    console.warn("Solicitud temporal por error de base de datos:", error.message);
    return res.status(503).json({ message: "No se pudo guardar la solicitud ni sus fotos. Revisa la base de datos o KV." });
  }

  if (existingApplication?.status === "APROBADO") {
    return res.status(409).json({ message: "La solicitud ya fue aprobada." });
  }

  const usingPersistentStore = req.dbReady === false && (pgStore.enabled() || kv.enabled());
  const storeFilesInDatabase = usingPersistentStore || shouldStoreUploadsInDatabase();
  const photoPath = (storeFilesInDatabase ? fileDataUrl(req.files?.photo?.[0]) : storedPath(req.files?.photo?.[0])) || existingApplication?.photo_path || null;
  const degreePdfPath = (storeFilesInDatabase ? fileDataUrl(req.files?.degreePdf?.[0]) : storedPath(req.files?.degreePdf?.[0])) || existingApplication?.degree_pdf_path || null;
  const receiptPath = (storeFilesInDatabase ? fileDataUrl(req.files?.receipt?.[0]) : storedPath(req.files?.receipt?.[0])) || existingApplication?.receipt_path || null;

  if (!photoPath || !degreePdfPath || !receiptPath) {
    return res.status(422).json({
      message: "Debes adjuntar foto, titulo profesional en PDF y recibo de inscripcion.",
    });
  }

  try {
    await pool.query(
      `UPDATE users
       SET dni = ?, full_name = ?, first_name = ?, paternal_last_name = ?, maternal_last_name = ?,
           email = ?, phone = ?, address = ?, profession = ?, branch = ?
       WHERE id = ?`,
      [
        dni,
        fullName,
        identity.first_name || null,
        identity.paternal_last_name || null,
        identity.maternal_last_name || null,
        email,
        phone,
        null,
        profession,
        branch,
        req.auth.sub,
      ]
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
