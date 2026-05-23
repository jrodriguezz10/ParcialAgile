const bcrypt = require("bcryptjs");
const { getPool } = require("../config/database");
const { signToken } = require("../middleware/auth");
const { consultDniApi } = require("../services/reniec.service");
const { normalizeDni } = require("../utils/text");

// Consulta DNI: endpoint compartido para autocompletar formularios.
async function getDni(req, res) {
  const dni = normalizeDni(req.params.dni);
  if (dni.length !== 8) return res.status(422).json({ message: "El DNI debe tener 8 digitos." });
  res.json(await consultDniApi(dni));
}

// Login administrador: autentica cuenta admin y emite JWT de administrador.
async function loginAdmin(req, res) {
  const pool = getPool();
  const rawEmail = String(req.body.email || "").trim().toLowerCase();
  const email = rawEmail === "admin" ? "admin@cip.local" : rawEmail;
  const password = String(req.body.password || "");
  const [[admin]] = await pool.query("SELECT * FROM admins WHERE email = ?", [email]);
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(401).json({ message: "Credenciales de administrador invalidas." });
  }
  res.json({
    token: signToken(admin, "admin"),
    role: "admin",
    admin: { id: admin.id, name: admin.name, email: admin.email },
  });
}

module.exports = {
  getDni,
  loginAdmin,
};
