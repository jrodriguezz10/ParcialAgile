const crypto = require("crypto");

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

function maxId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
}

function createAdmin(admin) {
  const admins = snapshot?.admins || [];
  const duplicate = admins.find(
    (item) => String(item.email || "").toLowerCase() === String(admin.email || "").toLowerCase() || item.dni === admin.dni
  );
  if (duplicate) {
    const error = new Error("Ese administrador ya existe.");
    error.statusCode = 409;
    throw error;
  }
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const row = {
    id: maxId(admins) + 1,
    name: admin.name,
    dni: admin.dni,
    email: admin.email,
    phone: admin.phone || "",
    role: admin.role || "Administrador",
    branch: admin.branch || "Consejo Nacional - Lima",
    password_hash: admin.password_hash,
    disabled_at: null,
    created_at: now,
    updated_at: now,
  };
  admins.unshift(row);
  return publicAdmin(row);
}

function updateAdminPassword(adminId, passwordHash) {
  const admin = (snapshot?.admins || []).find((item) => Number(item.id) === Number(adminId));
  if (!admin) return null;
  admin.password_hash = passwordHash;
  admin.updated_at = new Date().toISOString().slice(0, 19).replace("T", " ");
  return publicAdmin(admin);
}

function updateAdmin(adminId, updates) {
  const admin = (snapshot?.admins || []).find((item) => Number(item.id) === Number(adminId));
  if (!admin) return null;
  const duplicate = (snapshot?.admins || []).find(
    (item) =>
      Number(item.id) !== Number(adminId) &&
      (String(item.email || "").toLowerCase() === String(updates.email || "").toLowerCase() || item.dni === updates.dni)
  );
  if (duplicate) {
    const error = new Error("Ese correo o DNI ya esta registrado.");
    error.statusCode = 409;
    throw error;
  }
  Object.assign(admin, {
    name: updates.name,
    dni: updates.dni,
    email: updates.email,
    phone: updates.phone || "",
    role: updates.role || admin.role || "Administrador",
    branch: updates.branch || admin.branch || "Consejo Nacional - Lima",
    ...(updates.password_hash ? { password_hash: updates.password_hash } : {}),
    updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  });
  return publicAdmin(admin);
}

function setAdminDisabled(adminId, disabled) {
  const admin = (snapshot?.admins || []).find((item) => Number(item.id) === Number(adminId));
  if (!admin) return null;
  admin.disabled_at = disabled ? new Date().toISOString().slice(0, 19).replace("T", " ") : null;
  admin.updated_at = new Date().toISOString().slice(0, 19).replace("T", " ");
  return publicAdmin(admin);
}

function deleteAdmin(adminId) {
  const admins = snapshot?.admins || [];
  const index = admins.findIndex((item) => Number(item.id) === Number(adminId));
  if (index === -1) return false;
  admins.splice(index, 1);
  return true;
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

function createPublicApplication({ body, files }) {
  const users = snapshot?.users || [];
  const applications = snapshot?.applications || [];
  const existing = applications.find((item) => item.dni === body.dni || String(item.user_id) === String(body.user_id));
  if (existing && !["OBSERVADO", "RECHAZADO"].includes(existing.status)) {
    const error = new Error(`Este DNI ya tiene una solicitud registrada con estado ${existing.status}.`);
    error.statusCode = 409;
    throw error;
  }

  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  let user = users.find((item) => item.dni === body.dni || String(item.id) === String(body.user_id));
  if (!user) {
    user = {
      id: Number(body.user_id) || maxId(users) + 1,
      dni: body.dni,
      full_name: body.full_name,
      first_name: body.first_name || null,
      paternal_last_name: body.paternal_last_name || null,
      maternal_last_name: body.maternal_last_name || null,
      email: body.email,
      phone: body.phone || null,
      address: null,
      profession: body.profession,
      branch: body.branch || "Consejo Nacional - Lima",
      created_at: now,
      updated_at: now,
    };
    users.unshift(user);
  } else {
    user.dni = body.dni;
    user.full_name = body.full_name;
    user.first_name = body.first_name || user.first_name || null;
    user.paternal_last_name = body.paternal_last_name || user.paternal_last_name || null;
    user.maternal_last_name = body.maternal_last_name || user.maternal_last_name || null;
    user.email = body.email;
    user.phone = body.phone || user.phone || null;
    user.profession = body.profession;
    user.branch = body.branch || user.branch || "Consejo Nacional - Lima";
    user.updated_at = now;
  }

  if (existing) {
    Object.assign(existing, {
      status: "PENDIENTE",
      photo_path: files.photo || existing.photo_path || null,
      degree_pdf_path: files.degreePdf || existing.degree_pdf_path || null,
      receipt_path: files.receipt || existing.receipt_path || null,
      observations: null,
      submitted_at: now,
      reviewed_at: null,
      reviewed_by: null,
      updated_at: now,
      user_id: user.id,
      dni: user.dni,
      full_name: user.full_name,
      email: user.email,
      profession: user.profession,
      branch: user.branch || "Consejo Nacional - Lima",
    });
    return { user, application: existing };
  }

  const application = {
    id: maxId(applications) + 1,
    user_id: user.id,
    status: "PENDIENTE",
    photo_path: files.photo,
    degree_pdf_path: files.degreePdf,
    receipt_path: files.receipt,
    observations: null,
    submitted_at: now,
    reviewed_at: null,
    reviewed_by: null,
    created_at: now,
    updated_at: now,
    dni: user.dni,
    full_name: user.full_name,
    email: user.email,
    profession: user.profession,
    branch: user.branch || "Consejo Nacional - Lima",
  };
  applications.unshift(application);
  return { user, application };
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

function setApplicationStatus(id, status, observations = null, adminId = null) {
  const applications = snapshot?.applications || [];
  const index = applications.findIndex((application) => Number(application.id) === Number(id));
  if (index === -1) return null;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  Object.assign(applications[index], {
    status,
    observations,
    reviewed_at: now,
    reviewed_by: adminId,
    updated_at: now,
  });
  return getApplication(id);
}

function approveApplication(id, observations = null, adminId = null) {
  const application = setApplicationStatus(id, "APROBADO", observations, adminId);
  if (!application) return null;

  const members = snapshot?.members || [];
  let member = members.find((item) => Number(item.application_id) === Number(application.id));
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const currentPeriod = new Date().toISOString().slice(0, 7);

  if (!member) {
    const nextId = maxId(members) + 1;
    member = {
      id: nextId,
      user_id: application.user_id,
      application_id: application.id,
      membership_number: `CIP-${new Date().getFullYear()}-${String(nextId).padStart(5, "0")}`,
      enrollment_date: new Date().toISOString().slice(0, 10),
      status: "HABILITADO",
      status_override: null,
      status_reason: null,
      verification_code: crypto.randomBytes(24).toString("hex"),
      created_at: now,
      updated_at: now,
    };
    members.unshift(member);
  } else {
    member.status = "HABILITADO";
    member.updated_at = now;
  }

  const payments = snapshot?.payments || [];
  const existingPayment = payments.find(
    (payment) =>
      Number(payment.member_id) === Number(member.id) &&
      payment.period_month === currentPeriod &&
      payment.payment_type === "INSCRIPCION"
  );
  if (!existingPayment) {
    payments.unshift({
      id: maxId(payments) + 1,
      member_id: member.id,
      user_id: application.user_id,
      period_month: currentPeriod,
      amount: 2,
      payment_type: "INSCRIPCION",
      method: "RECIBO_INSCRIPCION",
      method_detail: null,
      status: "PAGADO",
      paid_at: now,
      external_reference: null,
      mp_preference_id: null,
      mp_payment_id: null,
      receipt_path: application.receipt_path || null,
      created_by_admin: adminId,
      created_at: now,
      updated_at: now,
    });
  }

  return listMembers("TODOS").find((item) => Number(item.id) === Number(member.id)) || member;
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
  createAdmin,
  updateAdmin,
  updateAdminPassword,
  setAdminDisabled,
  deleteAdmin,
  getAdmin,
  listAdmins,
  createPublicApplication,
  listApplications,
  getApplication,
  setApplicationStatus,
  approveApplication,
  listMembers,
  listMemberPayments,
  listUsers,
};
