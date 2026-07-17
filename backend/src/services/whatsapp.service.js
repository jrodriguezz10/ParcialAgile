const env = require("../config/env");

function configured() {
  return Boolean(env.whatsapp.token && env.whatsapp.phoneNumberId);
}

function normalizePeruPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 9) return `51${digits}`;
  if (digits.length === 11 && digits.startsWith("51")) return digits;
  return "";
}

async function sendDebtNotice({ phone, fullName, debtAmount, pendingPeriods }) {
  const to = normalizePeruPhone(phone);
  if (!to) {
    const error = new Error("El colegiado no tiene un celular peruano valido.");
    error.statusCode = 422;
    throw error;
  }
  if (!configured()) return { sent: false, configured: false, to };

  const response = await fetch(`https://graph.facebook.com/v22.0/${env.whatsapp.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.whatsapp.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: env.whatsapp.debtTemplate,
        language: { code: env.whatsapp.language },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: String(fullName || "Colegiado") },
            { type: "text", text: Number(debtAmount || 0).toFixed(2) },
            { type: "text", text: (pendingPeriods || []).join(", ") || "mensualidad vencida" },
          ],
        }],
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data?.error?.message || "WhatsApp rechazo la notificacion.");
    error.statusCode = 502;
    throw error;
  }
  return { sent: true, configured: true, to, message_id: data.messages?.[0]?.id || null };
}

module.exports = { configured, normalizePeruPhone, sendDebtNotice };
