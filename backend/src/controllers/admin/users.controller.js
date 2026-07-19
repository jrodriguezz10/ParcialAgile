const { getPool } = require("../../config/database");
const snapshot = require("../../services/snapshot.service");
const kv = require("../../services/kv.service");
const pgStore = require("../../services/postgres-store.service");

// Usuarios registrados: consulta privada para administradores.
async function listUsers(req, res) {
  if (req.dbReady === false && snapshot.available()) {
    const query = String(req.query.q || "");
    const adminBranch = req.admin?.branch || "Consejo Nacional - Lima";
    const inBranch = (user) => adminBranch === "Consejo Nacional - Lima" || (user.branch || "Consejo Nacional - Lima") === adminBranch;
    if (kv.enabled() || pgStore.enabled()) return res.json((await (kv.enabled() ? kv : pgStore).listUsers(query)).filter(inBranch));
    const snapshotUsers = snapshot.listUsers(query);
    const kvUsers = kv.enabled() ? await kv.listKvUsers(query) : [];
    const kvApplications = kv.enabled() ? await kv.listKvApplications("TODOS") : [];
    const enrichedKvUsers = kvUsers.map((user) => {
      const application = kvApplications.find((item) => Number(item.user_id) === Number(user.id));
      return {
        ...user,
        application_id: application?.id || null,
        application_status: application?.status || null,
        submitted_at: application?.submitted_at || null,
        member_id: null,
        membership_number: null,
        member_status: null,
        enrollment_date: null,
      };
    });
    return res.json([...enrichedKvUsers, ...snapshotUsers].filter(inBranch));
  }

  const pool = getPool();
  const search = String(req.query.q || "").trim();
  const params = [];
  const clauses = [];
  const adminBranch = req.admin?.branch || "Consejo Nacional - Lima";

  if (adminBranch !== "Consejo Nacional - Lima") {
    clauses.push("u.branch = ?");
    params.push(adminBranch);
  }

  if (search) {
    const term = `%${search.toLowerCase()}%`;
    clauses.push(`LOWER(CONCAT_WS(' ', u.id, u.dni, u.full_name, u.email, u.phone, u.profession, m.membership_number)) LIKE ?`);
    params.push(term);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT
       u.id,
       u.dni,
       u.full_name,
       u.first_name,
       u.paternal_last_name,
       u.maternal_last_name,
       u.email,
       u.phone,
       u.address,
       u.profession,
       u.branch,
       u.created_at,
       u.updated_at,
       a.id AS application_id,
       a.status AS application_status,
       a.submitted_at,
       m.id AS member_id,
       m.membership_number,
       m.status AS member_status,
       m.enrollment_date
     FROM users u
     LEFT JOIN applications a ON a.user_id = u.id
     LEFT JOIN members m ON m.user_id = u.id
     ${where}
     ORDER BY u.created_at DESC
     LIMIT 200`,
    params
  );

  res.json(rows);
}

module.exports = {
  listUsers,
};
