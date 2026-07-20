const bcrypt = require("bcryptjs");
const { getPool } = require("../../config/database");
const snapshot = require("../../services/snapshot.service");
const kv = require("../../services/kv.service");
const pgStore = require("../../services/postgres-store.service");
const { inAdminBranch, scopedBranch } = require("../../utils/admin-scope");

function dataStore() {
  return kv.enabled() ? kv : pgStore;
}

function scopedRole(req, requestedRole) {
  return req.admin?.role === "CAJERO" ? "CAJERO" : requestedRole;
}

function canManageAdmin(req, admin) {
  return Boolean(admin) && inAdminBranch(req, admin);
}

function normalizeAdminBody(req, requirePassword = false) {
  const name = String(req.body.name || "").trim();
  const dni = String(req.body.dni || "").replace(/\D/g, "").slice(0, 8);
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(0, 9);
  const role = String(req.body.role || "Administrador").trim();
  const branch = scopedBranch(req, String(req.body.branch || "Consejo Nacional - Lima").trim());
  const password = String(req.body.password || "");

  if (!name || dni.length !== 8 || !email || phone.length !== 9 || !role || (requirePassword && !password)) {
    return { error: "Nombre, DNI, correo, telefono, cargo y clave son requeridos." };
  }
  if (password && password.length < 6) return { error: "La clave debe tener al menos 6 caracteres." };
  return { name, dni, email, phone, role, branch, password };
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
    "SELECT id, name, dni, email, phone, role, branch, disabled_at, created_at, updated_at FROM admins WHERE id = ?",
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
  const requestedRole = String(req.body.role || "Administrador").trim();
  const requestedBranch = String(req.body.branch || "Consejo Nacional - Lima").trim();
  const role = scopedRole(req, requestedRole);
  const branch = scopedBranch(req, requestedBranch);
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
  if (req.dbReady === false && snapshot.available()) {
    const hash = password ? await bcrypt.hash(password, 10) : null;
    const admin = snapshot.updateAdmin(req.auth.sub, { name, dni, email, phone, role, branch, password_hash: hash });
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
    "SELECT id, name, dni, email, phone, role, branch, disabled_at, created_at, updated_at FROM admins WHERE id = ?",
    [req.auth.sub]
  );
  res.json(admin);
}

async function listAdmins(req, res) {
  const visibleToAdmin = (admin) => inAdminBranch(req, admin);
  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) return res.json((await (kv.enabled() ? kv : pgStore).listAdmins()).filter(visibleToAdmin));
  if (req.dbReady === false && snapshot.available()) return res.json(snapshot.listAdmins().filter(visibleToAdmin));

  const [rows] = await getPool().query(
    "SELECT id, name, dni, email, phone, role, branch, disabled_at, created_at, updated_at FROM admins ORDER BY created_at DESC"
  );
  res.json(rows.filter(visibleToAdmin));
}

async function createAdmin(req, res) {
  const body = normalizeAdminBody(req, true);
  if (body.error) return res.status(422).json({ message: body.error });
  const { name, dni, email, phone, role, branch, password } = body;

  const hash = await bcrypt.hash(password, 10);
  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    const admin = await dataStore().createAdmin({ name, dni, email, phone, role, branch, password_hash: hash });
    return res.status(201).json(admin);
  }
  if (req.dbReady === false && snapshot.available()) {
    const admin = snapshot.createAdmin({ name, dni, email, phone, role, branch, password_hash: hash });
    return res.status(201).json(admin);
  }

  const pool = getPool();
  try {
    const [result] = await pool.query(
      "INSERT INTO admins (name, dni, email, phone, role, branch, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [name, dni, email, phone, role, branch, hash]
    );
    const [[admin]] = await pool.query(
      "SELECT id, name, dni, email, phone, role, branch, disabled_at, created_at, updated_at FROM admins WHERE id = ?",
      [result.insertId]
    );
    res.status(201).json(admin);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Ese administrador ya existe." });
    throw error;
  }
}

async function readAdminForManagement(req, id) {
  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) return dataStore().getAdmin(id);
  if (req.dbReady === false && snapshot.available()) return snapshot.getAdmin(id);
  const [[admin]] = await getPool().query(
    "SELECT id, name, dni, email, phone, role, branch, disabled_at, created_at, updated_at FROM admins WHERE id = ?",
    [id]
  );
  return admin || null;
}

async function updateAdminById(req, res) {
  const target = await readAdminForManagement(req, req.params.id);
  if (!canManageAdmin(req, target)) return res.status(404).json({ message: "Usuario no encontrado en tu sede." });

  const body = normalizeAdminBody(req, false);
  if (body.error) return res.status(422).json({ message: body.error });
  const hash = body.password ? await bcrypt.hash(body.password, 10) : null;
  const payload = { ...body, password_hash: hash };
  delete payload.password;

  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    return res.json(await dataStore().updateAdmin(target.id, payload));
  }
  if (req.dbReady === false && snapshot.available()) {
    const admin = snapshot.updateAdmin(target.id, payload);
    if (!admin) return res.status(404).json({ message: "Administrador no encontrado." });
    return res.json(admin);
  }

  const pool = getPool();
  try {
    if (hash) {
      await pool.query(
        "UPDATE admins SET name = ?, dni = ?, email = ?, phone = ?, role = ?, branch = ?, password_hash = ? WHERE id = ?",
        [payload.name, payload.dni, payload.email, payload.phone, payload.role, payload.branch, hash, target.id]
      );
    } else {
      await pool.query("UPDATE admins SET name = ?, dni = ?, email = ?, phone = ?, role = ?, branch = ? WHERE id = ?", [
        payload.name,
        payload.dni,
        payload.email,
        payload.phone,
        payload.role,
        payload.branch,
        target.id,
      ]);
    }
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Ese correo o DNI ya esta registrado." });
    throw error;
  }
  res.json(await readAdminForManagement(req, target.id));
}

async function setAdminDisabled(req, res) {
  const target = await readAdminForManagement(req, req.params.id);
  if (!canManageAdmin(req, target)) return res.status(404).json({ message: "Usuario no encontrado en tu sede." });
  if (Number(target.id) === Number(req.auth.sub)) return res.status(422).json({ message: "No puedes deshabilitar tu propia cuenta." });
  const disabled = Boolean(req.body.disabled);

  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) return res.json(await dataStore().setAdminDisabled(target.id, disabled));
  if (req.dbReady === false && snapshot.available()) return res.json(snapshot.setAdminDisabled(target.id, disabled));

  await getPool().query("UPDATE admins SET disabled_at = ? WHERE id = ?", [
    disabled ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
    target.id,
  ]);
  res.json(await readAdminForManagement(req, target.id));
}

async function deleteAdminById(req, res) {
  const target = await readAdminForManagement(req, req.params.id);
  if (!canManageAdmin(req, target)) return res.status(404).json({ message: "Usuario no encontrado en tu sede." });
  if (Number(target.id) === Number(req.auth.sub)) return res.status(422).json({ message: "No puedes eliminar tu propia cuenta." });
  if (!target.disabled_at) {
    return res.status(422).json({ message: "Primero deshabilita el usuario antes de eliminarlo." });
  }

  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    const deleted = await dataStore().deleteAdmin(target.id);
    if (!deleted) return res.status(404).json({ message: "Usuario no encontrado." });
    return res.json({ ok: true });
  }
  if (req.dbReady === false && snapshot.available()) {
    const deleted = snapshot.deleteAdmin(target.id);
    if (!deleted) return res.status(404).json({ message: "Usuario no encontrado." });
    return res.json({ ok: true });
  }

  await getPool().query("DELETE FROM admins WHERE id = ?", [target.id]);
  res.json({ ok: true });
}

module.exports = {
  getMe,
  updateProfile,
  listAdmins,
  createAdmin,
  updateAdminById,
  setAdminDisabled,
  deleteAdminById,
};
