const bcrypt = require("bcryptjs");
const { getPool } = require("../../config/database");
const snapshot = require("../../services/snapshot.service");
const kv = require("../../services/kv.service");
const pgStore = require("../../services/postgres-store.service");

function dataStore() {
  return kv.enabled() ? kv : pgStore;
}

// Perfil administrador: cuenta actual y gestion de otros accesos admin.
async function getMe(req, res) {
  if (req.dbReady === false && snapshot.available()) {
    if (kv.enabled() || pgStore.enabled()) {
      const admin = await (kv.enabled() ? kv : pgStore).getAdmin(req.auth.sub);
      if (admin) return res.json(admin);
    }
    const admin = snapshot.getAdmin(req.auth.sub);
    if (admin) return res.json(admin);
  }

  const [[admin]] = await getPool().query(
    "SELECT id, name, dni, email, phone, role, branch, created_at, updated_at FROM admins WHERE id = ?",
    [req.auth.sub]
  );
  if (!admin) return res.status(404).json({ message: "Administrador no encontrado." });
  res.json(admin);
}

async function updateProfile(req, res) {
  const name = String(req.body.name || "").trim();
  const dni = String(req.body.dni || "").replace(/\D/g, "").slice(0, 8);
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(0, 9);
  const role = String(req.body.role || "Administrador").trim();
  const branch = String(req.body.branch || "Consejo Nacional - Lima").trim();
  const password = String(req.body.password || "");

  if (!name || dni.length !== 8 || !email || phone.length !== 9 || !role) {
    return res.status(422).json({ message: "Nombre, DNI, correo, telefono y cargo son requeridos." });
  }
  if (password && password.length < 6) {
    return res.status(422).json({ message: "La clave debe tener al menos 6 caracteres." });
  }

  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    const hash = password ? await bcrypt.hash(password, 10) : null;
    const admin = await dataStore().updateAdmin(req.auth.sub, { name, dni, email, phone, role, branch, password_hash: hash });
    if (!admin) return res.status(404).json({ message: "Administrador no encontrado." });
    return res.json(admin);
  }

  const pool = getPool();
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        "UPDATE admins SET name = ?, dni = ?, email = ?, phone = ?, role = ?, branch = ?, password_hash = ? WHERE id = ?",
        [name, dni, email, phone, role, branch, hash, req.auth.sub]
      );
    } else {
      await pool.query("UPDATE admins SET name = ?, dni = ?, email = ?, phone = ?, role = ?, branch = ? WHERE id = ?", [
        name,
        dni,
        email,
        phone,
        role,
        branch,
        req.auth.sub,
      ]);
    }
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Ese correo ya esta registrado." });
    }
    throw error;
  }

  const [[admin]] = await pool.query(
    "SELECT id, name, dni, email, phone, role, branch, created_at, updated_at FROM admins WHERE id = ?",
    [req.auth.sub]
  );
  res.json(admin);
}

async function listAdmins(req, res) {
  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) return res.json(await (kv.enabled() ? kv : pgStore).listAdmins());
  if (req.dbReady === false && snapshot.available()) return res.json(snapshot.listAdmins());

  const [rows] = await getPool().query(
    "SELECT id, name, dni, email, phone, role, branch, created_at, updated_at FROM admins ORDER BY created_at DESC"
  );
  res.json(rows);
}

async function createAdmin(req, res) {
  const name = String(req.body.name || "").trim();
  const dni = String(req.body.dni || "").replace(/\D/g, "").slice(0, 8);
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(0, 9);
  const role = String(req.body.role || "Administrador").trim();
  const branch = String(req.body.branch || "Consejo Nacional - Lima").trim();
  const password = String(req.body.password || "");

  if (!name || dni.length !== 8 || !email || phone.length !== 9 || !role || !password) {
    return res.status(422).json({ message: "Nombre, DNI, correo, telefono, cargo y clave son requeridos." });
  }
  if (password.length < 6) {
    return res.status(422).json({ message: "La clave debe tener al menos 6 caracteres." });
  }

  const hash = await bcrypt.hash(password, 10);
  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    const admin = await dataStore().createAdmin({ name, dni, email, phone, role, branch, password_hash: hash });
    return res.status(201).json(admin);
  }

  const pool = getPool();
  try {
    const [result] = await pool.query(
      "INSERT INTO admins (name, dni, email, phone, role, branch, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [name, dni, email, phone, role, branch, hash]
    );
    const [[admin]] = await pool.query(
      "SELECT id, name, dni, email, phone, role, branch, created_at, updated_at FROM admins WHERE id = ?",
      [result.insertId]
    );
    res.status(201).json(admin);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Ese administrador ya existe." });
    throw error;
  }
}

module.exports = {
  getMe,
  updateProfile,
  listAdmins,
  createAdmin,
};
