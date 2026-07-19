const nodemailer = require("nodemailer");
const env = require("../config/env");

function createTransporter() {
  if (!env.smtp.host) return null;
  const auth = env.smtp.user && env.smtp.pass ? { user: env.smtp.user, pass: env.smtp.pass } : undefined;
  return nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth,
  });
}

function requireTransporter() {
  const transporter = createTransporter();
  if (!transporter) {
    const error = new Error(
      "SMTP no configurado. Configura SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM para enviar correos."
    );
    error.statusCode = 503;
    throw error;
  }
  return transporter;
}

function cipFromAddress() {
  const raw = String(env.smtp.from || env.smtp.user || "").trim();
  const match = raw.match(/<([^>]+)>/);
  const address = match?.[1] || raw;
  return address ? `"CIP" <${address}>` : "CIP";
}

async function sendRegistrationCodeEmail(email, fullName, code) {
  const subject = "Codigo de verificacion - Colegiatura digital CIP";
  const body = [
    `Hola ${fullName}.`,
    "",
    `Tu codigo de verificacion para crear la cuenta CIP es: ${code}`,
    `El codigo vence en ${env.registrationCodeTtlMinutes} minutos.`,
    "",
    "Si no solicitaste este registro, ignora este mensaje.",
  ].join("\n");
  const transporter = requireTransporter();

  try {
    await transporter.sendMail({
      from: cipFromAddress(),
      to: email,
      subject,
      text: body,
    });
  } catch (error) {
    console.error("Error SMTP al enviar codigo de verificacion:", error.message);
    const mailError = new Error("No se pudo enviar el codigo al correo. Revisa la configuracion SMTP.");
    mailError.statusCode = 502;
    throw mailError;
  }

  return { sent: true, mode: "smtp", message: "Codigo enviado al correo registrado." };
}

async function sendDebtNoticeEmail({ email, fullName, debtAmount, pendingPeriods }) {
  if (!email) {
    const error = new Error("El colegiado no tiene correo registrado.");
    error.statusCode = 422;
    throw error;
  }

  const subject = "Aviso de mensualidades pendientes - CIP";
  const periods = (pendingPeriods || []).join(", ") || "mensualidad vencida";
  const body = [
    `Hola ${fullName || "colegiado"}.`,
    "",
    `Registras una deuda de S/ ${Number(debtAmount || 0).toFixed(2)} por las mensualidades: ${periods}.`,
    "Regulariza tus pagos desde el portal de colegiatura o acercate a caja de tu sede.",
    "",
    "Colegio de Ingenieros del Peru",
  ].join("\n");

  const transporter = requireTransporter();
  try {
    await transporter.sendMail({
      from: cipFromAddress(),
      to: email,
      subject,
      text: body,
    });
  } catch (error) {
    console.error("Error SMTP al enviar aviso de deuda:", error.message);
    const mailError = new Error("No se pudo enviar la notificacion por correo. Revisa la configuracion SMTP.");
    mailError.statusCode = 502;
    throw mailError;
  }

  return { sent: true, mode: "smtp", to: email };
}

async function sendPasswordResetCodeEmail({ email, fullName, code }) {
  const subject = "Codigo para restablecer clave - CIP";
  const body = [
    `Hola ${fullName || "administrador"}.`,
    "",
    `Tu codigo para cambiar la clave del panel CIP es: ${code}`,
    "El codigo vence en 15 minutos.",
    "",
    "Si no solicitaste este cambio, ignora este mensaje.",
    "Colegio de Ingenieros del Peru",
  ].join("\n");

  const transporter = requireTransporter();
  try {
    await transporter.sendMail({
      from: cipFromAddress(),
      to: email,
      subject,
      text: body,
    });
  } catch (error) {
    console.error("Error SMTP al enviar codigo de recuperacion:", error.message);
    const mailError = new Error("No se pudo enviar el codigo al correo. Revisa la configuracion SMTP.");
    mailError.statusCode = 502;
    throw mailError;
  }

  return { sent: true, mode: "smtp", to: email };
}

module.exports = {
  sendRegistrationCodeEmail,
  sendDebtNoticeEmail,
  sendPasswordResetCodeEmail,
};
