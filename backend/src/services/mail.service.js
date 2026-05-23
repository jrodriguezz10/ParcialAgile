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
  const transporter = createTransporter();

  if (!transporter) {
    const error = new Error(
      "SMTP no configurado. Configura SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM para enviar el codigo al correo."
    );
    error.statusCode = 503;
    throw error;
  }

  try {
    await transporter.sendMail({
      from: env.smtp.from,
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

module.exports = {
  sendRegistrationCodeEmail,
};
