const APPLICATIONS_KEY = "cip_local_applications";
const MEMBERS_KEY = "cip_local_members";
const PAYMENTS_KEY = "cip_local_payments";

export async function cacheSubmittedApplication(bundle, form, files) {
  const application = bundle?.application;
  const user = bundle?.user || {};
  if (!application?.id && !form?.dni) return null;

  const cached = {
    ...application,
    id: application?.id || localApplicationId(form.dni),
    user_id: application?.user_id || user.id || form.dni,
    dni: application?.dni || user.dni || form.dni,
    full_name: application?.full_name || user.full_name || form.full_name,
    email: application?.email || user.email || form.email,
    phone: application?.phone || user.phone || form.phone || "",
    profession: application?.profession || user.profession || form.profession,
    branch: application?.branch || user.branch || form.branch || "Consejo Nacional - Lima",
    status: application?.status || "PENDIENTE",
    submitted_at: application?.submitted_at || nowDateTime(),
    updated_at: nowDateTime(),
    photo_url: files?.photo ? await fileToDataUrl(files.photo) : application?.photo_url || null,
    degree_pdf_url: files?.degreePdf ? await fileToDataUrl(files.degreePdf) : application?.degree_pdf_url || null,
    receipt_url: files?.receipt ? await fileToDataUrl(files.receipt) : application?.receipt_url || null,
  };

  upsertApplication(cached);
  return cached;
}

export function mergeUserBundle(bundle) {
  const user = bundle?.user || {};
  const localApplication = findLocalApplicationForUser(user);
  if (!localApplication) return bundle;
  const application = preferLocalIfRemoteMissingFiles(bundle?.application, localApplication);
  const localMember = findLocalMemberForApplication(application);
  return {
    ...bundle,
    application,
    member: bundle?.member || localMember || null,
  };
}

export function mergeAdminApplications(remoteRows, status = "TODOS", adminInfo = null) {
  const rows = mergeById(remoteRows || [], readList(APPLICATIONS_KEY));
  return rows
    .filter((application) => matchesBranch(application, adminInfo))
    .filter((application) => matchesStatus(application, status))
    .sort((left, right) => timestamp(right) - timestamp(left));
}

export function mergeAdminMembers(remoteRows, status = "TODOS", adminInfo = null) {
  const rows = mergeById(remoteRows || [], readList(MEMBERS_KEY));
  return rows
    .filter((member) => matchesBranch(member, adminInfo))
    .filter((member) => matchesStatus(member, status))
    .sort((left, right) => timestamp(right) - timestamp(left));
}

export function localMemberPayments(memberId) {
  return readList(PAYMENTS_KEY)
    .filter((payment) => String(payment.member_id) === String(memberId))
    .sort((left, right) => String(right.period_month || "").localeCompare(String(left.period_month || "")));
}

export function applyLocalApplicationAction(application, action, observations = "", adminInfo = null) {
  const current = findLocalApplicationById(application?.id) || application;
  if (!current?.id) return null;
  const updated = {
    ...current,
    status: action === "approve" ? "APROBADO" : action === "observe" ? "OBSERVADO" : "RECHAZADO",
    observations: observations || null,
    reviewed_at: nowDateTime(),
    reviewed_by: adminInfo?.id || null,
    updated_at: nowDateTime(),
  };
  upsertApplication(updated);
  if (action === "approve") {
    return {
      application: updated,
      member: upsertMemberForApplication(updated, adminInfo),
    };
  }
  return { application: updated, member: null };
}

function upsertMemberForApplication(application, adminInfo) {
  const members = readList(MEMBERS_KEY);
  let member = members.find((item) => String(item.application_id) === String(application.id) || String(item.dni) === String(application.dni));
  const currentPeriod = new Date().toISOString().slice(0, 7);
  if (!member) {
    const nextId = nextNumericId(members, 90000);
    member = {
      id: nextId,
      user_id: application.user_id,
      application_id: application.id,
      membership_number: `CIP-${new Date().getFullYear()}-${String(nextId).padStart(5, "0")}`,
      enrollment_date: new Date().toISOString().slice(0, 10),
      status: "HABILITADO",
      verification_code: `local-${application.id}`,
      created_at: nowDateTime(),
    };
  }
  member = {
    ...member,
    updated_at: nowDateTime(),
    dni: application.dni,
    full_name: application.full_name,
    email: application.email,
    phone: application.phone,
    profession: application.profession,
    branch: application.branch || adminInfo?.branch || "Consejo Nacional - Lima",
    photo_url: application.photo_url,
    photo_path: application.photo_url,
    last_paid_period: currentPeriod,
    last_paid_at: nowDateTime(),
    debt_count: 0,
    debt_amount: 0,
  };
  writeList(MEMBERS_KEY, upsertById(members, member));
  upsertPaymentForMember(member, application);
  return member;
}

function upsertPaymentForMember(member, application) {
  const payments = readList(PAYMENTS_KEY);
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const exists = payments.some(
    (payment) =>
      String(payment.member_id) === String(member.id) &&
      payment.period_month === currentPeriod &&
      payment.payment_type === "INSCRIPCION"
  );
  if (exists) return;
  payments.unshift({
    id: nextNumericId(payments, 90000),
    member_id: member.id,
    user_id: member.user_id,
    period_month: currentPeriod,
    amount: 2,
    payment_type: "INSCRIPCION",
    method: "RECIBO_INSCRIPCION",
    method_detail: "Comprobante de inscripcion",
    status: "PAGADO",
    paid_at: nowDateTime(),
    receipt_url: application.receipt_url,
    created_at: nowDateTime(),
  });
  writeList(PAYMENTS_KEY, payments);
}

function preferLocalIfRemoteMissingFiles(remoteApplication, localApplication) {
  if (!remoteApplication) return localApplication;
  return {
    ...remoteApplication,
    ...localApplication,
    photo_url: localApplication.photo_url || remoteApplication.photo_url,
    degree_pdf_url: localApplication.degree_pdf_url || remoteApplication.degree_pdf_url,
    receipt_url: localApplication.receipt_url || remoteApplication.receipt_url,
  };
}

function findLocalApplicationForUser(user) {
  return readList(APPLICATIONS_KEY).find(
    (application) =>
      String(application.user_id) === String(user.id) ||
      String(application.dni) === String(user.dni) ||
      String(application.email || "").toLowerCase() === String(user.email || "").toLowerCase()
  );
}

function findLocalMemberForApplication(application) {
  if (!application) return null;
  return readList(MEMBERS_KEY).find(
    (member) => String(member.application_id) === String(application.id) || String(member.dni) === String(application.dni)
  );
}

function findLocalApplicationById(id) {
  return readList(APPLICATIONS_KEY).find((application) => String(application.id) === String(id));
}

function upsertApplication(application) {
  writeList(APPLICATIONS_KEY, upsertById(readList(APPLICATIONS_KEY), application));
}

function mergeById(remoteRows, localRows) {
  const merged = [...remoteRows];
  for (const localRow of localRows) {
    const index = merged.findIndex((row) => String(row.id) === String(localRow.id) || (row.dni && row.dni === localRow.dni));
    if (index === -1) merged.push(localRow);
    else merged[index] = preferLocalIfRemoteMissingFiles(merged[index], localRow);
  }
  return merged;
}

function upsertById(rows, row) {
  const index = rows.findIndex((item) => String(item.id) === String(row.id) || (item.dni && item.dni === row.dni));
  if (index === -1) return [row, ...rows];
  const next = [...rows];
  next[index] = { ...next[index], ...row };
  return next;
}

function matchesStatus(row, status) {
  const normalized = String(status || "TODOS").toUpperCase();
  return !normalized || normalized === "TODOS" || row.status === normalized;
}

function matchesBranch(row, adminInfo) {
  if (!adminInfo || String(adminInfo.role || "").toUpperCase() === "SUPER_ADMIN") return true;
  return (row.branch || "Consejo Nacional - Lima") === (adminInfo.branch || "Consejo Nacional - Lima");
}

function timestamp(row) {
  const value = Date.parse(row.updated_at || row.submitted_at || row.created_at || "");
  return Number.isFinite(value) ? value : Number(row.id) || 0;
}

function localApplicationId(dni) {
  return `local-${dni || Date.now()}`;
}

function nextNumericId(rows, floor) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), floor) + 1;
}

function nowDateTime() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function readList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeList(key, rows) {
  try {
    localStorage.setItem(key, JSON.stringify(rows.slice(0, 200)));
  } catch {
    // Si el navegador no permite guardar, el backend sigue siendo la fuente principal.
  }
}
