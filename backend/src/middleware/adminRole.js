const { getPool } = require("../config/database");
const kv = require("../services/kv.service");
const pgStore = require("../services/postgres-store.service");
const snapshot = require("../services/snapshot.service");

function adminRole(...allowed) {
  return async function checkAdminRole(req, res, next) {
    try {
      let admin;
      if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) admin = await (kv.enabled() ? kv : pgStore).getAdmin(req.auth.sub);
      else if (req.dbReady === false && snapshot.available()) admin = snapshot.getAdmin(req.auth.sub);
      else [[admin]] = await getPool().query("SELECT id, role, branch, disabled_at FROM admins WHERE id = ?", [req.auth.sub]);
      if (!admin) return res.status(403).json({ message: "Cuenta administrativa no encontrada." });
      if (admin.disabled_at) return res.status(403).json({ message: "Esta cuenta administrativa esta deshabilitada." });
      const role = String(admin.role || "ADMIN_SEDE").toUpperCase();
      const normalized = role === "ADMINISTRADOR" ? "ADMIN_SEDE" : role;
      if (allowed.length && !allowed.includes(normalized)) return res.status(403).json({ message: "Tu rol no tiene permiso para esta operacion." });
      req.admin = { ...admin, role: normalized };
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = adminRole;
