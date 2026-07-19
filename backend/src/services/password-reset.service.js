const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const RESET_TTL_MINUTES = 15;
const resetCodes = new Map();

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createResetCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function validateNewPassword(password, confirmPassword) {
  if (String(password || "").length < 6) {
    const error = new Error("La nueva clave debe tener al menos 6 caracteres.");
    error.statusCode = 422;
    throw error;
  }
  if (password !== confirmPassword) {
    const error = new Error("La confirmacion de clave no coincide.");
    error.statusCode = 422;
    throw error;
  }
}

async function requestAdminPasswordReset({ email, findAdminByEmail, sendEmail, now = new Date(), codeFactory = createResetCode }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    const error = new Error("Ingresa el correo registrado.");
    error.statusCode = 422;
    throw error;
  }

  const admin = await findAdminByEmail(normalizedEmail);
  if (!admin) {
    const error = new Error("El correo no esta registrado como administrador o cajero.");
    error.statusCode = 404;
    throw error;
  }

  const code = codeFactory();
  const record = {
    adminId: admin.id,
    codeHash: hashCode(code),
    expiresAt: now.getTime() + RESET_TTL_MINUTES * 60 * 1000,
  };
  await sendEmail({ email: normalizedEmail, fullName: admin.name || "administrador", code });
  resetCodes.set(normalizedEmail, record);
  return { message: "Codigo enviado al correo registrado.", expires_in_minutes: RESET_TTL_MINUTES };
}

async function resetAdminPassword({
  email,
  code,
  password,
  confirmPassword,
  findAdminByEmail,
  updatePasswordHash,
  now = new Date(),
}) {
  const normalizedEmail = normalizeEmail(email);
  validateNewPassword(password, confirmPassword);

  const admin = await findAdminByEmail(normalizedEmail);
  const record = resetCodes.get(normalizedEmail);
  if (!admin || !record || Number(record.adminId) !== Number(admin.id)) {
    const error = new Error("Solicita un codigo valido antes de cambiar la clave.");
    error.statusCode = 422;
    throw error;
  }
  if (record.expiresAt < now.getTime()) {
    resetCodes.delete(normalizedEmail);
    const error = new Error("El codigo vencio. Solicita uno nuevo.");
    error.statusCode = 422;
    throw error;
  }
  if (record.codeHash !== hashCode(code)) {
    const error = new Error("El codigo ingresado no es valido.");
    error.statusCode = 422;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await updatePasswordHash(admin, passwordHash);
  resetCodes.delete(normalizedEmail);
  return { message: "Clave actualizada. Ya puedes iniciar sesion." };
}

function clearResetCodes() {
  resetCodes.clear();
}

module.exports = {
  RESET_TTL_MINUTES,
  clearResetCodes,
  requestAdminPasswordReset,
  resetAdminPassword,
};
