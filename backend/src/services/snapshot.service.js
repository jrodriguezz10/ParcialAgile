let snapshot = null;

try {
  snapshot = require("../data/db-snapshot.json");
} catch {
  snapshot = null;
}

function available() {
  return Boolean(snapshot);
}

function publicAdmin(admin) {
  if (!admin) return null;
  const { password_hash, ...safeAdmin } = admin;
  return safeAdmin;
}

function listAdmins() {
  return (snapshot?.admins || []).map(publicAdmin);
}

function findAdminByEmail(email) {
  return (snapshot?.admins || []).find((admin) => admin.email === email) || null;
}

function updateAdminPassword(adminId, passwordHash) {
  const admin = (snapshot?.admins || []).find((item) => Number(item.id) === Number(adminId));
  if (!admin) return null;
  admin.password_hash = passwordHash;
  admin.updated_at = new Date().toISOString().slice(0, 19).replace("T", " ");
  return publicAdmin(admin);
}

function getAdmin(id) {
  return publicAdmin((snapshot?.admins || []).find((admin) => Number(admin.id) === Number(id)));
}

function listUsers(query = "") {
  const users = snapshot?.users || [];
  const applications = snapshot?.applications || [];
  const members = snapshot?.members || [];
  const normalized = query.trim().toLowerCase();

  return users
    .map((user) => {
      const application = applications.find((item) => Number(item.user_id) === Number(user.id));
      const member = members.find((item) => Number(item.user_id) === Number(user.id));
      return {
        ...user,
        application_id: application?.id || null,
        application_status: application?.status || null,
        submitted_at: application?.submitted_at || null,
        member_id: member?.id || null,
        membership_number: member?.membership_number || null,
        member_status: member?.status || null,
        enrollment_date: member?.enrollment_date || null,
        branch: user.branch || "Consejo Nacional - Lima",
      };
    })
    .filter((user) => {
      if (!normalized) return true;
      return [
        user.id,
        user.dni,
        user.full_name,
        user.email,
        user.phone,
        user.profession,
        user.membership_number,
      ].join(" ").toLowerCase().includes(normalized);
    })
    .slice(0, 200);
}

function listApplications(status = "") {
  const normalized = status.toUpperCase();
  const users = snapshot?.users || [];
  return (snapshot?.applications || [])
    .filter((application) => !normalized || normalized === "TODOS" || application.status === normalized)
    .map((application) => {
      const user = users.find((item) => Number(item.id) === Number(application.user_id)) || {};
      return {
        ...application,
        dni: user.dni,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        profession: user.profession,
        branch: user.branch || "Consejo Nacional - Lima",
      };
    });
}

function getApplication(id) {
  return listApplications("TODOS").find((application) => Number(application.id) === Number(id)) || null;
}

function listMembers(status = "") {
  const normalized = status.toUpperCase();
  const users = snapshot?.users || [];
  const applications = snapshot?.applications || [];
  const payments = snapshot?.payments || [];

  return (snapshot?.members || [])
    .filter((member) => !normalized || normalized === "TODOS" || member.status === normalized)
    .map((member) => {
      const user = users.find((item) => Number(item.id) === Number(member.user_id)) || {};
      const application = applications.find((item) => Number(item.id) === Number(member.application_id)) || {};
      const paid = payments.filter((payment) => Number(payment.member_id) === Number(member.id) && payment.status === "PAGADO");
      return {
        ...member,
        dni: user.dni,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        profession: user.profession,
        branch: user.branch || "Consejo Nacional - Lima",
        photo_path: application.photo_path,
        last_paid_period: paid.reduce((latest, payment) => payment.period_month > latest ? payment.period_month : latest, ""),
        last_paid_at: paid.reduce((latest, payment) => payment.paid_at > latest ? payment.paid_at : latest, ""),
      };
    });
}

function listMemberPayments(memberId) {
  return (snapshot?.payments || [])
    .filter((payment) => Number(payment.member_id) === Number(memberId))
    .sort((a, b) => String(b.period_month).localeCompare(String(a.period_month)) || String(b.created_at).localeCompare(String(a.created_at)));
}

module.exports = {
  available,
  findAdminByEmail,
  updateAdminPassword,
  getAdmin,
  listAdmins,
  listApplications,
  getApplication,
  listMembers,
  listMemberPayments,
  listUsers,
};
