import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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

export function downloadPaymentReceiptPdf(payment, payer = {}) {
  if (!payment) return;

  const amount = Number(payment.amount || 0);
  const serie = "B001";
  const number = String(payment.id || "0").padStart(8, "0");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setProperties({
    title: `Comprobante ${serie}-${number}`,
    subject: "Representacion impresa de comprobante de pago",
    author: ISSUER.name,
  });

  doc.setDrawColor(160, 20, 36);
  doc.setLineWidth(0.6);
  doc.rect(12, 12, 186, 273);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(split(doc, ISSUER.name, 108), 18, 24);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(ISSUER.ruc, 18, 36);
  doc.text(split(doc, ISSUER.address, 108), 18, 42);

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

  doc.setFillColor(160, 20, 36);
  doc.rect(18, 105, 170, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("Cant.", 22, 111);
  doc.text("Descripcion", 42, 111);
  doc.text("P. Unit.", 145, 111, { align: "right" });
  doc.text("Importe", 184, 111, { align: "right" });

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.rect(18, 114, 170, 34);
  doc.text("1", 24, 124);
  const concept = payment.payment_type === "INSCRIPCION"
    ? "Pago por derecho a carnet CIP"
    : `Mensualidad CIP periodo ${safeText(payment.period_month)}`;
  doc.text(split(doc, `${concept} (${safeText(payment.method)})`, 88), 42, 124);
  doc.text(formatMoney(amount), 145, 124, { align: "right" });
  doc.text(formatMoney(amount), 184, 124, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.text("Op. inafecta", 140, 163);
  doc.text(`S/ ${formatMoney(amount)}`, 184, 163, { align: "right" });
  doc.text("IGV", 140, 171);
  doc.text("S/ 0.00", 184, 171, { align: "right" });
  doc.text("Importe total", 140, 181);
  doc.text(`S/ ${formatMoney(amount)}`, 184, 181, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Comprobante generado por el sistema de colegiacion digital.", 18, 205);

  doc.save(`comprobante-${serie}-${number}.pdf`);
}
