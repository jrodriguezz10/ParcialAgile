const crypto = require("crypto");
const env = require("../config/env");
const snapshot = require("./snapshot.service");
const { comparePeriods, currentPeriod, periodFromDate, periodsBetween, previousPeriod } = require("../utils/dates");

const PREFIX = "cip:v2";

function enabled() {
  return Boolean(env.upstash.url && env.upstash.token && typeof fetch === "function");
}

async function command(args) {
  if (!enabled()) return null;
  const response = await fetch(env.upstash.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.upstash.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "No se pudo usar el almacenamiento KV.");
  return data.result;
}

async function getJson(key, fallback = null) {
  const value = await command(["GET", key]);
  if (!value) return fallback;
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function setJson(key, value) {
  await command(["SET", key, JSON.stringify(value)]);
  return value;
}

async function init() {
  if (!enabled()) return false;
  const seeded = await getJson(`${PREFIX}:seeded`, null);
  if (seeded?.ok) return true;
  await setCollection("admins", (snapshot.listAdmins() || []).map((admin) => {
    const original = snapshot.findAdminByEmail(admin.email);
    return { ...admin, password_hash: original?.password_hash };
  }));
  await setCollection("users", snapshot.listUsers(""));
  await setCollection("applications", snapshot.listApplications("TODOS"));
  await setCollection("members", snapshot.listMembers("TODOS"));
  await setCollection("payments", snapshot.available() ? require("../data/db-snapshot.json").payments || [] : []);
  await setJson(`${PREFIX}:seeded`, { ok: true, at: new Date().toISOString() });
  return true;
}

async function getCollection(name) {
  await init();
  return getJson(`${PREFIX}:${name}`, []);
}

async function setCollection(name, rows) {
  return setJson(`${PREFIX}:${name}`, rows);
}

function fileKey(applicationId, type) {
  return `${PREFIX}:file:${applicationId}:${type}`;
}

function fileRef(applicationId, type) {
  return `kvfile:${applicationId}:${type}`;
}

async function putApplicationFile(applicationId, type, value) {
  if (!value) return null;
  if (/^kvfile:/i.test(value)) return value;
  if (/^data:/i.test(value)) {
    await setJson(fileKey(applicationId, type), value);
    return fileRef(applicationId, type);
  }
  return value;
}

async function deleteApplicationFiles(applicationId) {
  await command([
    "DEL",
    fileKey(applicationId, "photo"),
    fileKey(applicationId, "degree"),
    fileKey(applicationId, "receipt"),
  ]);
}

async function readApplicationFile(value) {
  if (!value) return null;
  if (/^kvfile:/i.test(value)) {
    const [, applicationId, type] = value.split(":");
    return getJson(fileKey(applicationId, type), null);
  }
  return value;
}

function maxId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
}

function filterByStatus(rows, status) {
  const normalized = String(status || "").toUpperCase();
  return rows.filter((row) => !normalized || normalized === "TODOS" || row.status === normalized);
}

function cleanUser(user) {
  if (!user) return user;
  const cleaned = { ...user };
  if (/^[0-9]{8}@pendiente\.cip\.local$/i.test(String(cleaned.email || ""))) cleaned.email = "";
  if (/^pendiente$/i.test(String(cleaned.profession || "").trim())) cleaned.profession = "";
  if (String(cleaned.full_name || "").trim() === `DNI ${cleaned.dni}`) cleaned.full_name = "";
  return cleaned;
}

function latestPaid(payments, memberId) {
  return payments
    .filter((payment) => Number(payment.member_id) === Number(memberId) && payment.status === "PAGADO" && payment.payment_type === "MENSUALIDAD")
    .sort((a, b) => String(b.period_month || "").localeCompare(String(a.period_month || "")) || String(b.paid_at || "").localeCompare(String(a.paid_at || "")))[0] || null;
}

function deriveMemberStatus(member, payments) {
  const enrollmentPeriod = periodFromDate(member.enrollment_date);
  const overdueThrough = previousPeriod(currentPeriod());
  if (comparePeriods(enrollmentPeriod, overdueThrough) > 0) return "HABILITADO";

  const paid = new Set(
    payments
      .filter((payment) => Number(payment.member_id) === Number(member.id) && payment.status === "PAGADO" && payment.payment_type === "MENSUALIDAD")
      .map((payment) => payment.period_month)
  );
  const hasOverdueDebt = periodsBetween(enrollmentPeriod, overdueThrough).some((period) => !paid.has(period));
  return hasOverdueDebt ? "INHABILITADO" : "HABILITADO";
}

async function recalculateMemberStatus(memberId) {
  const members = await getCollection("members");
  const index = members.findIndex((item) => Number(item.id) === Number(memberId));
  if (index === -1) return null;
  const payments = await getCollection("payments");
  const lastPayment = latestPaid(payments, memberId);
  const status = deriveMemberStatus(members[index], payments);
  members[index] = {
    ...members[index],
    status,
    last_paid_period: lastPayment?.period_month || members[index].last_paid_period || null,
    last_paid_at: lastPayment?.paid_at || members[index].last_paid_at || null,
    updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  };
  await setCollection("members", members);
  return members[index];
}

async function findAdminByEmail(email) {
  const admins = await getCollection("admins");
  return admins.find((admin) => admin.email === email) || null;
}

async function getAdmin(id) {
  const admins = await getCollection("admins");
  const admin = admins.find((item) => Number(item.id) === Number(id));
  if (!admin) return null;
  const { password_hash, ...safe } = admin;
  return safe;
}

async function listAdmins() {
  const admins = await getCollection("admins");
  return admins.map(({ password_hash, ...safe }) => safe);
}

async function createAdmin(admin) {
  const admins = await getCollection("admins");
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
    created_at: now,
    updated_at: now,
  };
  admins.unshift(row);
  await setCollection("admins", admins);
  const { password_hash, ...safe } = row;
  return safe;
}

async function updateAdmin(id, admin) {
  const admins = await getCollection("admins");
  const index = admins.findIndex((item) => Number(item.id) === Number(id));
  if (index === -1) return null;
  const duplicate = admins.find(
    (item) =>
      Number(item.id) !== Number(id) &&
      (String(item.email || "").toLowerCase() === String(admin.email || "").toLowerCase() || item.dni === admin.dni)
  );
  if (duplicate) {
    const error = new Error("Ese correo ya esta registrado.");
    error.statusCode = 409;
    throw error;
  }
  admins[index] = {
    ...admins[index],
    name: admin.name,
    dni: admin.dni,
    email: admin.email,
    phone: admin.phone || "",
    role: admin.role || "Administrador",
    branch: admin.branch || admins[index].branch || "Consejo Nacional - Lima",
    ...(admin.password_hash ? { password_hash: admin.password_hash } : {}),
    updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  };
  await setCollection("admins", admins);
  const { password_hash, ...safe } = admins[index];
  return safe;
}

async function updateAdminPassword(id, passwordHash) {
  const admins = await getCollection("admins");
  const index = admins.findIndex((item) => Number(item.id) === Number(id));
  if (index === -1) return null;
  admins[index] = {
    ...admins[index],
    password_hash: passwordHash,
    updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  };
  await setCollection("admins", admins);
  const { password_hash, ...safe } = admins[index];
  return safe;
}

async function listUsers(query = "") {
  const users = (await getCollection("users")).map(cleanUser);
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return users;
  return users.filter((user) => [
    user.id,
    user.dni,
    user.full_name,
    user.email,
    user.profession,
    user.membership_number,
  ].join(" ").toLowerCase().includes(normalized));
}

async function listApplications(status = "") {
  return filterByStatus(await normalizeNonApprovedApplicationFiles(), status);
}

async function getApplication(id) {
  const rows = await normalizeNonApprovedApplicationFiles();
  return rows.find((item) => Number(item.id) === Number(id)) || null;
}

async function normalizeNonApprovedApplicationFiles() {
  const applications = await getCollection("applications");
  let changed = false;
  for (const application of applications) {
    if (
      (application.status === "OBSERVADO" || application.status === "RECHAZADO") &&
      (application.photo_path || application.degree_pdf_path || application.receipt_path)
    ) {
      await deleteApplicationFiles(application.id);
      application.photo_path = null;
      application.degree_pdf_path = null;
      application.receipt_path = null;
      application.updated_at = new Date().toISOString().slice(0, 19).replace("T", " ");
      changed = true;
    }
  }
  if (changed) await setCollection("applications", applications);
  return applications;
}

async function getApplicationFile(id, type) {
  const application = await getApplication(id);
  if (!application) return null;
  const columns = { photo: "photo_path", degree: "degree_pdf_path", receipt: "receipt_path" };
  return columns[type] ? readApplicationFile(application[columns[type]]) : null;
}

async function updateApplicationFiles(id, files = {}) {
  const applications = await getCollection("applications");
  const index = applications.findIndex((item) => Number(item.id) === Number(id));
  if (index === -1) return null;
  const application = applications[index];
  const updates = {};
  if (files.photo) updates.photo_path = await putApplicationFile(application.id, "photo", files.photo);
  if (files.degreePdf) updates.degree_pdf_path = await putApplicationFile(application.id, "degree", files.degreePdf);
  if (files.receipt) updates.receipt_path = await putApplicationFile(application.id, "receipt", files.receipt);
  applications[index] = { ...application, ...updates, updated_at: new Date().toISOString().slice(0, 19).replace("T", " ") };
  await setCollection("applications", applications);

  if (updates.photo_path) {
    const members = await getCollection("members");
    const memberIndex = members.findIndex((item) => Number(item.application_id) === Number(id));
    if (memberIndex !== -1) {
      members[memberIndex] = { ...members[memberIndex], photo_path: updates.photo_path, updated_at: new Date().toISOString().slice(0, 19).replace("T", " ") };
      await setCollection("members", members);
    }
  }
  return applications[index];
}

async function setApplicationStatus(id, status, observations = null, adminId = null) {
  const applications = await getCollection("applications");
  const index = applications.findIndex((item) => Number(item.id) === Number(id));
  if (index === -1) return null;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const clearDocs = status === "OBSERVADO" || status === "RECHAZADO";
  if (clearDocs) await deleteApplicationFiles(applications[index].id);
  applications[index] = {
    ...applications[index],
    status,
    observations,
    reviewed_at: now,
    reviewed_by: adminId,
    updated_at: now,
    ...(clearDocs ? { photo_path: null, degree_pdf_path: null, receipt_path: null } : {}),
  };
  await setCollection("applications", applications);
  return applications[index];
}

async function approveApplication(id, observations = null, adminId = null) {
  const application = await setApplicationStatus(id, "APROBADO", observations, adminId);
  if (!application) return null;
  const members = await getCollection("members");
  let member = members.find((item) => Number(item.application_id) === Number(application.id));
  if (!member) {
    const nextId = maxId(members) + 1;
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    member = {
      id: nextId,
      user_id: application.user_id,
      application_id: application.id,
      membership_number: `CIP-${new Date().getFullYear()}-${String(nextId).padStart(5, "0")}`,
      enrollment_date: new Date().toISOString().slice(0, 10),
      status: "HABILITADO",
      verification_code: crypto.randomBytes(24).toString("hex"),
      created_at: now,
      updated_at: now,
      dni: application.dni,
      full_name: application.full_name,
      email: application.email,
      phone: application.phone,
      profession: application.profession,
      branch: application.branch || "Consejo Nacional - Lima",
      photo_path: application.photo_path,
      last_paid_period: new Date().toISOString().slice(0, 7),
      last_paid_at: now,
    };
    members.unshift(member);
    await setCollection("members", members);
  }
  return member;
}

async function listMembers(status = "") {
  const allMembers = await getCollection("members");
  const payments = await getCollection("payments");
  let changed = false;
  const hydratedMembers = allMembers.map((member) => {
    const lastPayment = latestPaid(payments, member.id);
    const next = {
      ...member,
      status: deriveMemberStatus(member, payments),
      status_override: null,
      status_reason: null,
      last_paid_period: lastPayment?.period_month || member.last_paid_period || null,
      last_paid_at: lastPayment?.paid_at || member.last_paid_at || null,
    };
    if (next.status !== member.status || next.last_paid_period !== member.last_paid_period || next.last_paid_at !== member.last_paid_at) changed = true;
    return next;
  });
  if (changed) await setCollection("members", hydratedMembers);
  const members = filterByStatus(hydratedMembers, status);
  const applications = await getCollection("applications");
  return members.map((member) => {
    const application = applications.find((item) => Number(item.id) === Number(member.application_id) || String(item.user_id) === String(member.user_id));
    return { ...member, photo_path: application?.photo_path || member.photo_path };
  });
}

async function updateMemberStatus(id, status, reason = "") {
  const members = await getCollection("members");
  const index = members.findIndex((item) => Number(item.id) === Number(id));
  if (index === -1) return null;
  const requestedStatus = String(status || "").toUpperCase();
  const manualOverride = requestedStatus === "HABILITADO" || requestedStatus === "INHABILITADO" ? requestedStatus : null;
  const payments = await getCollection("payments");
  const next = {
    ...members[index],
    status_override: manualOverride,
    status_reason: manualOverride ? String(reason || "").trim() || null : null,
    updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  };
  next.status = manualOverride || deriveMemberStatus(next, payments);
  members[index] = next;
  await setCollection("members", members);
  return members[index];
}

async function listMemberPayments(memberId) {
  const payments = await getCollection("payments");
  return payments
    .filter((payment) => Number(payment.member_id) === Number(memberId) && payment.status === "PAGADO")
    .sort((a, b) => String(b.period_month || "").localeCompare(String(a.period_month || "")) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

async function createMemberPayment(memberId, periodMonth, amount = 2, adminId = null, method = "MANUAL", options = {}) {
  const members = await getCollection("members");
  const member = members.find((item) => Number(item.id) === Number(memberId));
  if (!member) return null;
  const payments = await getCollection("payments");
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const status = options.status || "PAGADO";
  const paidAt = status === "PAGADO" ? options.paid_at || now : options.paid_at || null;
  const paymentType = options.payment_type || "MENSUALIDAD";
  let payment = payments.find((item) => Number(item.member_id) === Number(memberId) && item.period_month === periodMonth && item.payment_type === paymentType);
  if (payment) {
    Object.assign(payment, {
      amount,
      method,
      method_detail: options.method_detail || payment.method_detail || null,
      status,
      paid_at: paidAt,
      payment_type: paymentType,
      receipt_path: options.receipt_path || payment.receipt_path || null,
      created_by_admin: adminId,
      external_reference: options.external_reference || payment.external_reference || null,
      mp_preference_id: options.mp_preference_id || payment.mp_preference_id || null,
      mp_payment_id: options.mp_payment_id || payment.mp_payment_id || null,
      updated_at: now,
    });
  } else {
    payment = {
      id: maxId(payments) + 1,
      member_id: member.id,
      user_id: member.user_id,
      period_month: periodMonth,
      amount,
      payment_type: paymentType,
      method,
      method_detail: options.method_detail || null,
      status,
      paid_at: paidAt,
      receipt_path: options.receipt_path || null,
      external_reference: options.external_reference || null,
      mp_preference_id: options.mp_preference_id || null,
      mp_payment_id: options.mp_payment_id || null,
      created_by_admin: adminId,
      created_at: now,
      updated_at: now,
    };
    payments.unshift(payment);
  }
  await setCollection("payments", payments);
  if (status === "PAGADO") {
    member.last_paid_period = periodMonth;
    member.last_paid_at = paidAt;
    await setCollection("members", members);
  }
  const recalculated = await recalculateMemberStatus(member.id);
  return { member: recalculated || member, payment };
}

async function approvePaymentByExternalReference(externalReference, mpPaymentId = null, paidAt = null) {
  if (!externalReference) return null;
  const payments = await getCollection("payments");
  const matches = payments.filter((item) => item.external_reference === externalReference);
  if (!matches.length) return null;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  for (const payment of matches) {
    payment.status = "PAGADO";
    payment.method = payment.method === "MERCADO_PAGO_TOTAL" ? "MERCADO_PAGO_TOTAL" : "MERCADO_PAGO";
    payment.mp_payment_id = mpPaymentId || payment.mp_payment_id || null;
    payment.paid_at = paidAt || now;
    payment.updated_at = now;
  }
  await setCollection("payments", payments);

  const payment = matches.sort((a, b) => String(b.period_month || "").localeCompare(String(a.period_month || "")))[0];
  await recalculateMemberStatus(payment.member_id);
  if (matches.length === 1) return payment;
  return {
    ...payment,
    amount: matches.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    period_month: matches.map((item) => item.period_month).sort().join(", "),
  };
}

async function findApplicationByDni(dni) {
  const applications = await getCollection("applications");
  return applications.find((item) => item.dni === dni) || null;
}

async function findUserByDni(dni) {
  const users = await getCollection("users");
  return cleanUser(users.find((item) => item.dni === dni) || null);
}

async function startByDni({ dni, identity = {} }) {
  const users = await getCollection("users");
  let user = users.find((item) => item.dni === dni);
  if (user) return cleanUser(user);
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  user = {
    id: maxId(users) + 1,
    dni,
    full_name: identity.full_name || "",
    first_name: identity.first_name || null,
    paternal_last_name: identity.paternal_last_name || null,
    maternal_last_name: identity.maternal_last_name || null,
    email: "",
    profession: "",
    created_at: now,
    updated_at: now,
  };
  users.unshift(user);
  await setCollection("users", users);
  return user;
}

async function createPublicApplication({ body, files }) {
  const users = await getCollection("users");
  const applications = await getCollection("applications");
  const existing = applications.find((item) => item.dni === body.dni);
  if (existing) {
    if (!["OBSERVADO", "RECHAZADO"].includes(existing.status)) {
      const error = new Error(`Este DNI ya tiene una solicitud registrada con estado ${existing.status}.`);
      error.statusCode = 409;
      throw error;
    }
  }
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  let user = users.find((item) => item.dni === body.dni);
  if (!user) {
    user = {
      id: maxId(users) + 1,
      dni: body.dni,
      full_name: body.full_name,
      first_name: body.first_name || null,
      paternal_last_name: body.paternal_last_name || null,
      maternal_last_name: body.maternal_last_name || null,
      email: body.email,
      profession: body.profession,
      branch: body.branch || "Consejo Nacional - Lima",
      created_at: now,
      updated_at: now,
    };
    users.unshift(user);
  } else {
    user.full_name = body.full_name;
    user.first_name = body.first_name || user.first_name || null;
    user.paternal_last_name = body.paternal_last_name || user.paternal_last_name || null;
    user.maternal_last_name = body.maternal_last_name || user.maternal_last_name || null;
    user.email = body.email;
    user.profession = body.profession;
    user.branch = body.branch || user.branch || "Consejo Nacional - Lima";
    user.updated_at = now;
  }
  await setCollection("users", users);

  if (existing) {
    existing.status = "PENDIENTE";
    existing.photo_path = await putApplicationFile(existing.id, "photo", files.photo);
    existing.degree_pdf_path = await putApplicationFile(existing.id, "degree", files.degreePdf);
    existing.receipt_path = await putApplicationFile(existing.id, "receipt", files.receipt);
    existing.observations = null;
    existing.submitted_at = now;
    existing.reviewed_at = null;
    existing.reviewed_by = null;
    existing.updated_at = now;
    existing.user_id = user.id;
    existing.dni = user.dni;
    existing.full_name = user.full_name;
    existing.email = user.email;
    existing.profession = user.profession;
    await setCollection("applications", applications);
    return { user, application: existing };
  }

  const application = {
    id: maxId(applications) + 1,
    user_id: user.id,
    status: "PENDIENTE",
    photo_path: null,
    degree_pdf_path: null,
    receipt_path: null,
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
  application.photo_path = await putApplicationFile(application.id, "photo", files.photo);
  application.degree_pdf_path = await putApplicationFile(application.id, "degree", files.degreePdf);
  application.receipt_path = await putApplicationFile(application.id, "receipt", files.receipt);
  applications.unshift(application);
  await setCollection("applications", applications);
  return { user, application };
}

module.exports = {
  enabled,
  init,
  command,
  findAdminByEmail,
  getAdmin,
  listAdmins,
  createAdmin,
  updateAdmin,
  updateAdminPassword,
  listUsers,
  listApplications,
  listKvApplications: listApplications,
  listKvUsers: listUsers,
  getApplication,
  getApplicationFile,
  updateApplicationFiles,
  setApplicationStatus,
  approveApplication,
  listMembers,
  updateMemberStatus,
  listMemberPayments,
  createMemberPayment,
  approvePaymentByExternalReference,
  findApplicationByDni,
  findUserByDni,
  startByDni,
  createPublicApplication,
};
