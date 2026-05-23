const bcrypt = require("bcryptjs");
const { getPool } = require("../../config/database");

// Perfil administrador: cuenta actual y gestion de otros accesos admin.
async function getMe(req, res) {
  const [[admin]] = await getPool().query(
    "SELECT id, name, dni, email, phone, role, created_at, updated_at FROM admins WHERE id = ?",
    [req.auth.sub]
  );
  if (!admin) return res.status(404).json({ message: "Administrador no encontrado." });
  res.json(admin);
}

async function updateProfile(req, res) {
  const pool = getPool();
  const name = String(req.body.name || "").trim();
  const dni = String(req.body.dni || "").replace(/\D/g, "").slice(0, 8);
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim();
  const role = String(req.body.role || "Administrador").trim();
  const password = String(req.body.password || "");

  if (!name || dni.length !== 8 || !email || !role) {
    return res.status(422).json({ message: "Nombre, DNI, correo y cargo son requeridos." });
  }
  if (password && password.length < 6) {
    return res.status(422).json({ message: "La clave debe tener al menos 6 caracteres." });
  }

  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        "UPDATE admins SET name = ?, dni = ?, email = ?, phone = ?, role = ?, password_hash = ? WHERE id = ?",
        [name, dni, email, phone, role, hash, req.auth.sub]
      );
    } else {
      await pool.query("UPDATE admins SET name = ?, dni = ?, email = ?, phone = ?, role = ? WHERE id = ?", [
        name,
        dni,
        email,
        phone,
        role,
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
    "SELECT id, name, dni, email, phone, role, created_at, updated_at FROM admins WHERE id = ?",
    [req.auth.sub]
  );
  res.json(admin);
}

async function listAdmins(req, res) {
  const [rows] = await getPool().query(
    "SELECT id, name, dni, email, phone, role, created_at, updated_at FROM admins ORDER BY created_at DESC"
  );
  res.json(rows);
}

async function createAdmin(req, res) {
  const pool = getPool();
  const name = String(req.body.name || "").trim();
  const dni = String(req.body.dni || "").replace(/\D/g, "").slice(0, 8);
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim();
  const role = String(req.body.role || "Administrador").trim();
  const password = String(req.body.password || "");

  if (!name || dni.length !== 8 || !email || !role || !password) {
    return res.status(422).json({ message: "Nombre, DNI, correo, cargo y clave son requeridos." });
  }
  if (password.length < 6) {
    return res.status(422).json({ message: "La clave debe tener al menos 6 caracteres." });
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const [result] = await pool.query(
      "INSERT INTO admins (name, dni, email, phone, role, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
      [name, dni, email, phone, role, hash]
    );
    const [[admin]] = await pool.query(
      "SELECT id, name, dni, email, phone, role, created_at, updated_at FROM admins WHERE id = ?",
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
