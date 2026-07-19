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

      {pendingPeriods.length > 0 && (
        <div className="payment-box">
          <h3>Mensualidades vencidas</h3>
          <DataTable
            columns={["Periodo", "Monto", "Estado", "Accion"]}
            rows={pendingPeriods.map((pendingPeriod) => [
              pendingPeriod,
              "S/ 20.00",
              <StatusBadge status="PENDIENTE" />,
              <button className="inline-action" onClick={() => onPayMonthly(pendingPeriod)}>
                Pagar
              </button>,
            ])}
          />
        </div>
      )}

      <DataTable
        columns={["Tipo", "Periodo", "Monto", "Método", "Estado", "Fecha", "Comprobante"]}
        rows={payments.map((payment) => [
          payment.payment_type === "INSCRIPCION" ? "Inscripción" : "Mensualidad",
          payment.period_month,
          `S/ ${Number(payment.amount).toFixed(2)}`,
          payment.method,
          <StatusBadge status={payment.status} />,
          formatDate(payment.paid_at || payment.created_at),
          payment.status === "PAGADO" ? (
            <button className="inline-action" onClick={() => downloadPaymentReceiptPdf(payment, user)}>
              Descargar
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
