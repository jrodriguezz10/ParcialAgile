import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import cipLogo from "../assets/cip-logo.png";

export async function downloadCardPdf(element, filename) {
  if (!element) return;
  const canvas = await html2canvas(element, {
    scale: 2.5,
    useCORS: true,
    backgroundColor: "#ffffff",
  });
  const image = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [86, 54] });
  pdf.addImage(image, "PNG", 0, 0, 86, 54);
  pdf.save(filename);
}

const ISSUER = {
  name: "COLEGIO DE INGENIEROS DEL PERU CONSEJO NACIONAL",
  ruc: "RUC 20138086438",
  address: "AV. AREQUIPA URB. MIRAFLORES 4947 MIRAFLORES - LIMA - LIMA",
};

function safeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

async function imageToDataUrl(src) {
  const response = await fetch(src);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatReceiptDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return safeText(value);
  return new Intl.DateTimeFormat("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function split(doc, text, maxWidth) {
  return doc.splitTextToSize(safeText(text), maxWidth);
}

export async function downloadPaymentReceiptPdf(payment, payer = {}) {
  if (!payment) return;

  const amount = Number(payment.amount || 0);
  const taxableAmount = amount / 1.18;
  const igvAmount = amount - taxableAmount;
  const serie = "B001";
  const number = String(payment.id || "0").padStart(8, "0");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let logoDataUrl = null;
  try {
    logoDataUrl = await imageToDataUrl(cipLogo);
  } catch {
    logoDataUrl = null;
  }

  doc.setProperties({
    title: `Comprobante ${serie}-${number}`,
    subject: "Representacion impresa de comprobante de pago",
    author: ISSUER.name,
  });

  doc.setDrawColor(160, 20, 36);
  doc.setLineWidth(0.6);
  doc.rect(12, 12, 186, 273);

  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 18, 19, 15, 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(split(doc, ISSUER.name, 96), logoDataUrl ? 38 : 18, 24);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(ISSUER.ruc, logoDataUrl ? 38 : 18, 36);
  doc.text(split(doc, ISSUER.address, 108), 18, 44);

  doc.setDrawColor(160, 20, 36);
  doc.rect(136, 18, 52, 31);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("BOLETA DE VENTA", 162, 29, { align: "center" });
  doc.text("ELECTRONICA", 162, 35, { align: "center" });
  doc.setFontSize(12);
  doc.text(`${serie}-${number}`, 162, 43, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("DATOS DEL ADQUIRENTE", 18, 62);
  doc.setFont("helvetica", "normal");
  doc.text(`DNI: ${safeText(payer.dni)}`, 18, 70);
  doc.text(split(doc, `Nombre: ${safeText(payer.full_name || payer.name)}`, 170), 18, 77);
  doc.text(`Emision: ${formatReceiptDate(payment.paid_at || payment.created_at)}`, 18, 90);
  doc.text(`Moneda: PEN`, 120, 90);
  doc.text(`Metodo de pago: ${safeText(payment.method_detail || payment.method)}`, 18, 97);

  doc.setFillColor(160, 20, 36);
  doc.rect(18, 108, 170, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("Cant.", 22, 114);
  doc.text("Descripcion", 42, 114);
  doc.text("P. Unit.", 145, 114, { align: "right" });
  doc.text("Importe", 184, 114, { align: "right" });

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.rect(18, 117, 170, 38);
  doc.text("1", 24, 127);
  const concept = payment.payment_type === "INSCRIPCION"
    ? "Pago por derecho a carnet CIP"
    : `Mensualidad CIP periodo ${safeText(payment.period_month)}`;
  doc.text(split(doc, concept, 88), 42, 127);
  doc.text(formatMoney(amount), 145, 127, { align: "right" });
  doc.text(formatMoney(amount), 184, 127, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.text("Op. gravada", 132, 168);
  doc.text(`S/ ${formatMoney(taxableAmount)}`, 184, 168, { align: "right" });
  doc.text("IGV 18%", 132, 176);
  doc.text(`S/ ${formatMoney(igvAmount)}`, 184, 176, { align: "right" });
  doc.text("Importe total", 132, 186);
  doc.text(`S/ ${formatMoney(amount)}`, 184, 186, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Representacion impresa de la boleta de venta electronica.", 18, 205);
  doc.text("Comprobante generado por el sistema de colegiacion digital.", 18, 211);

  doc.save(`comprobante-${serie}-${number}.pdf`);
}
