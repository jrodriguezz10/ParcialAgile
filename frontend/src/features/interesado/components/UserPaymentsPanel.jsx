import { CreditCard, RefreshCw, WalletCards } from "lucide-react";
import { Button, DataTable, StatusBadge } from "../../../components/ui";
import { formatDate } from "../../../utils/format";
import { downloadPaymentReceiptPdf } from "../../../utils/pdf";

// Modulo Pagos: pago individual, deuda total e historial de mensualidades.
export function UserPaymentsPanel({
  activeModule,
  member,
  user,
  payments,
  period,
  debtAmount,
  pendingPeriods,
  onRefresh,
  onPeriodChange,
  onPayMonthly,
  onPayFullDebt,
}) {
  const monthlyPaymentPeriods = new Set(
    payments
      .filter((payment) => payment.payment_type === "MENSUALIDAD")
      .map((payment) => payment.period_month),
  );
  const pendingPaymentRows = pendingPeriods
    .filter((pendingPeriod) => !monthlyPaymentPeriods.has(pendingPeriod))
    .map((pendingPeriod) => ({
      id: `pending-${pendingPeriod}`,
      payment_type: "MENSUALIDAD",
      period_month: pendingPeriod,
      amount: 2,
      method: "PENDIENTE",
      status: "PENDIENTE",
      paid_at: null,
      created_at: null,
    }));
  const displayPayments = [...pendingPaymentRows, ...payments].sort((left, right) => {
    const periodCompare = String(right.period_month || "").localeCompare(String(left.period_month || ""));
    if (periodCompare) return periodCompare;
    if (left.payment_type !== right.payment_type) return left.payment_type === "MENSUALIDAD" ? -1 : 1;
    if (left.status !== right.status) return left.status === "PENDIENTE" ? -1 : 1;
    return 0;
  });

  return (
    <section className={`panel ${activeModule === "pagos" ? "" : "module-hidden"}`} id="pagos">
      <div className="section-title">
        <div>
          <span>Mensualidades</span>
          <h2>Historial de pagos</h2>
        </div>
        <Button type="button" icon={RefreshCw} variant="ghost" onClick={onRefresh}>
          Actualizar
        </Button>
      </div>

      <div className="payment-box payment-box-inline">
        <h3>Pago de mensualidades</h3>
        <div className="payment-controls">
          <input type="month" value={period} onChange={(event) => onPeriodChange(event.target.value)} />
          <Button type="button" icon={CreditCard} onClick={() => onPayMonthly(period)} disabled={!member}>
            Pagar mes seleccionado
          </Button>
          <Button type="button" icon={WalletCards} variant="secondary" onClick={onPayFullDebt} disabled={!member || debtAmount <= 0}>
            Pagar todo pendiente
          </Button>
        </div>
        <p className="payment-summary">
          {debtAmount > 0
            ? `Meses pendientes: ${pendingPeriods.join(", ")}. Total S/ ${debtAmount.toFixed(2)}`
            : "Tus mensualidades estan al dia."}
        </p>
      </div>

      <DataTable
        columns={["Tipo", "Periodo", "Monto", "Método", "Estado", "Fecha", "Comprobante"]}
        rows={displayPayments.map((payment) => [
          payment.payment_type === "INSCRIPCION" ? "Inscripción" : "Mensualidad",
          payment.period_month,
          `S/ ${Number(payment.amount).toFixed(2)}`,
          payment.status === "PENDIENTE" && payment.payment_type === "MENSUALIDAD" ? "Pendiente de pago" : payment.method,
          <StatusBadge status={payment.status} />,
          formatDate(payment.paid_at || payment.created_at),
          payment.status === "PAGADO" ? (
            <button className="inline-action" onClick={() => downloadPaymentReceiptPdf(payment, user)}>
              Descargar
            </button>
          ) : payment.payment_type === "MENSUALIDAD" ? (
            <button className="inline-action" onClick={() => onPayMonthly(payment.period_month)}>
              Pagar
            </button>
          ) : (
            "Pendiente"
          ),
        ])}
        empty="Aún no hay pagos registrados."
      />
    </section>
  );
}
