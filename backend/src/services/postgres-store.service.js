const { Pool } = require("pg");
const crypto = require("crypto");
const snapshot = require("./snapshot.service");
const { comparePeriods, currentPeriod, periodFromDate, periodsBetween, previousPeriod } = require("../utils/dates");

function clean(value) {
  return String(value || "").trim().replace(/^"(.*)"$/, "$1");
}

const url = clean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
let pool;
let ready;

function enabled() {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return false;
  return /^postgres(ql)?:\/\//i.test(url);
}

function getPgPool() {
  if (!enabled()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

async function init() {
  if (!enabled()) return false;
  if (ready) return ready;
  ready = (async () => {
    const db = getPgPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS cip_store (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const { rows } = await db.query("SELECT value FROM cip_store WHERE key = 'seeded'");
    if (!rows[0]?.value?.ok) {
      await setCollection("admins", snapshot.listAdmins().map((admin) => {
        const original = snapshot.findAdminByEmail(admin.email);
        return { ...admin, password_hash: original?.password_hash };
      }));
      await setCollection("users", snapshot.listUsers(""));
      await setCollection("applications", snapshot.listApplications("TODOS"));
      await setCollection("members", snapshot.listMembers("TODOS"));
      await setCollection("payments", []);
      await setJson("seeded", { ok: true, at: new Date().toISOString() });
    }
    return true;
  })();
  return ready;
}

async function getJson(key, fallback) {
  await init();
  const { rows } = await getPgPool().query("SELECT value FROM cip_store WHERE key = $1", [key]);
  return rows[0]?.value ?? fallback;
}

async function setJson(key, value) {
  await getPgPool().query(
    `INSERT INTO cip_store (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
  return value;
}

async function getCollection(name) {
  return getJson(name, []);
}

async function setCollection(name, rows) {
  return setJson(name, rows);
}

function maxId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
}

function filterByStatus(rows, status) {
  const normalized = String(status || "").toUpperCase();
  return rows.filter((row) => !normalized || normalized === "TODOS" || row.status === normalized);
}

function cleanUserPlaceholders(user) {
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
  return periodsBetween(enrollmentPeriod, overdueThrough).some((period) => !paid.has(period)) ? "INHABILITADO" : "HABILITADO";
}

async function recalculateMemberStatus(memberId) {
  const members = await getCollection("members");
  const index = members.findIndex((item) => Number(item.id) === Number(memberId));
  if (index === -1) return null;
  const payments = await getCollection("payments");
  const lastPayment = latestPaid(payments, memberId);
  members[index] = {
    ...members[index],
    status: deriveMemberStatus(members[index], payments),
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

async function listUsers(query = "") {
  const users = (await getCollection("users")).map(cleanUserPlaceholders);
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return users;
  return users.filter((user) => [
    user.id,
    user.dni,
    user.full_name,
    user.email,
    user.phone,
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
  const columns = {
    photo: "photo_path",
    degree: "degree_pdf_path",
    receipt: "receipt_path",
  };
  const key = columns[type];
  if (!key || !application[key]) return null;
  return application[key];
}

async function setApplicationStatus(id, status, observations = null, adminId = null) {
  const applications = await getCollection("applications");
  const index = applications.findIndex((item) => Number(item.id) === Number(id));
  if (index === -1) return null;
  const clearDocs = status === "OBSERVADO" || status === "RECHAZADO";
  applications[index] = {
    ...applications[index],
    status,
    observations,
    reviewed_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    reviewed_by: adminId,
    updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
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
    const year = new Date().getFullYear();
    member = {
      id: nextId,
      user_id: application.user_id,
      application_id: application.id,
      membership_number: `CIP-${year}-${String(nextId).padStart(5, "0")}`,
      enrollment_date: new Date().toISOString().slice(0, 10),
      status: "HABILITADO",
      status_override: null,
      status_reason: null,
      verification_code: crypto.randomBytes(24).toString("hex"),
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      dni: application.dni,
      full_name: application.full_name,
      email: application.email,
      phone: application.phone,
      profession: application.profession,
      photo_path: application.photo_path,
      last_paid_period: new Date().toISOString().slice(0, 7),
      last_paid_at: new Date().toISOString().slice(0, 19).replace("T", " "),
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
    return {
      ...member,
      photo_path: application?.photo_path || member.photo_path,
    };
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

async function createMemberPayment(memberId, periodMonth, amount = 20, adminId = null, method = "MANUAL", options = {}) {
  const members = await getCollection("members");
  const member = members.find((item) => Number(item.id) === Number(memberId));
  if (!member) return null;
  const payments = await getCollection("payments");
  const existing = payments.find((item) => Number(item.member_id) === Number(memberId) && item.period_month === periodMonth && item.payment_type === "MENSUALIDAD");
  const paidAt = new Date().toISOString().slice(0, 19).replace("T", " ");
  const status = options.status || "PAGADO";
  const resolvedPaidAt = status === "PAGADO" ? options.paid_at || paidAt : options.paid_at || null;
  let payment;
  if (existing) {
    Object.assign(existing, {
      amount,
      method,
      status,
      paid_at: resolvedPaidAt,
      external_reference: options.external_reference || existing.external_reference || null,
      mp_preference_id: options.mp_preference_id || existing.mp_preference_id || null,
      mp_payment_id: options.mp_payment_id || existing.mp_payment_id || null,
      created_by_admin: adminId,
      updated_at: paidAt,
    });
    payment = existing;
  } else {
    payment = {
      id: maxId(payments) + 1,
      member_id: member.id,
      user_id: member.user_id,
      period_month: periodMonth,
      amount,
      payment_type: "MENSUALIDAD",
      method,
      status,
      paid_at: resolvedPaidAt,
      external_reference: options.external_reference || null,
      mp_preference_id: options.mp_preference_id || null,
      mp_payment_id: options.mp_payment_id || null,
      created_by_admin: adminId,
      created_at: paidAt,
      updated_at: paidAt,
    };
    payments.unshift(payment);
  }
  await setCollection("payments", payments);
  if (status === "PAGADO") {
    member.last_paid_period = periodMonth;
    member.last_paid_at = resolvedPaidAt;
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
  const user = users.find((item) => item.dni === dni) || null;
  return cleanUserPlaceholders(user);
}

async function startByDni({ dni, identity = {} }) {
  await init();
  const users = await getCollection("users");
  let user = users.find((item) => item.dni === dni);
  if (user) {
    const cleaned = cleanUserPlaceholders(user);
    if (cleaned.email !== user.email || cleaned.profession !== user.profession || cleaned.full_name !== user.full_name) {
      Object.assign(user, cleaned, { updated_at: new Date().toISOString().slice(0, 19).replace("T", " ") });
      await setCollection("users", users);
    }
    return cleaned;
  }
  const fullName = identity.full_name || "";
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  user = {
    id: maxId(users) + 1,
    dni,
    full_name: fullName,
    first_name: identity.first_name || null,
    paternal_last_name: identity.paternal_last_name || null,
    maternal_last_name: identity.maternal_last_name || null,
    email: "",
    phone: null,
    address: null,
    profession: "",
    created_at: now,
    updated_at: now,
  };
  users.unshift(user);
  await setCollection("users", users);
  return user;
}

async function createPublicApplication({ body, files }) {
  await init();
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
      phone: body.phone,
      address: body.address,
      profession: body.profession,
      branch: body.branch || "Consejo Nacional - Lima",
      created_at: now,
      updated_at: now,
    };
    users.unshift(user);
    await setCollection("users", users);
  } else {
    user.full_name = body.full_name;
    user.first_name = body.first_name || user.first_name || null;
    user.paternal_last_name = body.paternal_last_name || user.paternal_last_name || null;
    user.maternal_last_name = body.maternal_last_name || user.maternal_last_name || null;
    user.email = body.email;
    user.phone = body.phone;
    user.address = body.address;
    user.profession = body.profession;
    user.branch = body.branch || user.branch || "Consejo Nacional - Lima";
    user.updated_at = now;
    await setCollection("users", users);
  }

  if (existing) {
    existing.status = "PENDIENTE";
    existing.photo_path = files.photo || null;
    existing.degree_pdf_path = files.degreePdf || null;
    existing.receipt_path = files.receipt || null;
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
    photo_path: files.photo || null,
    degree_pdf_path: files.degreePdf || null,
    receipt_path: files.receipt || null,
    observations: null,
    submitted_at: now,
    reviewed_at: null,
    reviewed_by: null,
    created_at: now,
    updated_at: now,
    dni: user.dni,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    profession: user.profession,
    branch: user.branch || "Consejo Nacional - Lima",
  };
  applications.unshift(application);
  await setCollection("applications", applications);
  return { user, application };
}

module.exports = {
  enabled,
  init,
  findAdminByEmail,
  getAdmin,
  listAdmins,
  createAdmin,
  updateAdmin,
  listUsers,
  listApplications,
  getApplication,
  getApplicationFile,
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
