const bcrypt = require("bcryptjs");
const { getPool } = require("../config/database");
const { signToken } = require("../middleware/auth");
const { consultDniApi } = require("../services/reniec.service");
const snapshot = require("../services/snapshot.service");
const kv = require("../services/kv.service");
const pgStore = require("../services/postgres-store.service");
const { sendPasswordResetCodeEmail } = require("../services/mail.service");
const {
  requestAdminPasswordReset,
  resetAdminPassword,
} = require("../services/password-reset.service");
const { normalizeDni } = require("../utils/text");

function dataStore() {
  return kv.enabled() ? kv : pgStore;
}

// Consulta DNI: endpoint compartido para autocompletar formularios.
async function getDni(req, res) {
  const dni = normalizeDni(req.params.dni);
  if (dni.length !== 8) return res.status(422).json({ message: "El DNI debe tener 8 digitos." });
  res.json(await consultDniApi(dni));
}

// Login administrador: autentica cuenta admin y emite JWT de administrador.
async function loginAdmin(req, res) {
  const rawEmail = String(req.body.email || "").trim().toLowerCase();
  const email = rawEmail === "admin" ? "admin@cip.local" : rawEmail;
  const password = String(req.body.password || "");

  let admin;
  try {
    if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
      admin = await (kv.enabled() ? kv : pgStore).findAdminByEmail(email);
    } else {
    const pool = getPool();
    [[admin]] = await pool.query("SELECT * FROM admins WHERE email = ?", [email]);
    }
  } catch (error) {
    if (!snapshot.available()) throw error;
    admin = snapshot.findAdminByEmail(email);
  }

  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(401).json({ message: "Credenciales de administrador invalidas." });
  }
  if (admin.disabled_at) {
    return res.status(403).json({ message: "Esta cuenta administrativa esta deshabilitada." });
  }
  res.json({
    token: signToken(admin, "admin"),
    role: "admin",
    admin: { id: admin.id, name: admin.name, email: admin.email },
  });
}

async function findAdminByEmailForRequest(req, email) {
  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    return dataStore().findAdminByEmail(email);
  }
  try {
    const pool = getPool();
    const [[admin]] = await pool.query("SELECT * FROM admins WHERE email = ?", [email]);
    return admin || null;
  } catch (error) {
    if (!snapshot.available()) throw error;
    return snapshot.findAdminByEmail(email);
  }
}

async function updateAdminPasswordForRequest(req, admin, passwordHash) {
  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    return dataStore().updateAdminPassword(admin.id, passwordHash);
  }
  try {
    const pool = getPool();
    await pool.query("UPDATE admins SET password_hash = ? WHERE id = ?", [passwordHash, admin.id]);
    return { updated: true };
  } catch (error) {
    if (!snapshot.available()) throw error;
    const updated = snapshot.updateAdminPassword(admin.id, passwordHash);
    if (!updated) {
      const notFound = new Error("Administrador no encontrado.");
      notFound.statusCode = 404;
      throw notFound;
    }
    return updated;
  }
}

async function requestAdminPasswordResetController(req, res) {
  const result = await requestAdminPasswordReset({
    email: req.body.email,
    findAdminByEmail: (email) => findAdminByEmailForRequest(req, email),
    sendEmail: sendPasswordResetCodeEmail,
  });
  res.json(result);
}

async function resetAdminPasswordController(req, res) {
  const result = await resetAdminPassword({
    email: req.body.email,
    code: req.body.code,
    password: req.body.password,
    confirmPassword: req.body.confirm_password,
    findAdminByEmail: (email) => findAdminByEmailForRequest(req, email),
    updatePasswordHash: (admin, passwordHash) => updateAdminPasswordForRequest(req, admin, passwordHash),
  });
  res.json(result);
}

module.exports = {
  getDni,
  loginAdmin,
  requestAdminPasswordReset: requestAdminPasswordResetController,
  resetAdminPassword: resetAdminPasswordController,
};
