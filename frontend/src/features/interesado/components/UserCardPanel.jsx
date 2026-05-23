import { AlertTriangle, BadgeCheck, CreditCard, Download, WalletCards } from "lucide-react";
import mercadoPagoLogo from "../../../assets/mercado-pago.svg";
import { VirtualCard } from "../../../components/VirtualCard";
import { Button, StatusBadge } from "../../../components/ui";
import { downloadCardPdf } from "../../../utils/pdf";

// Modulo Carnet: visualiza el carnet virtual, PDF y acceso rapido a pagos.
export function UserCardPanel({
  activeModule,
  member,
  user,
  application,
  cardRef,
  period,
  debtAmount,
  pendingPeriods,
  onPeriodChange,
  onPayMonthly,
  onPayFullDebt,
}) {
  return (
    <aside className={`panel side-panel ${activeModule === "carnet" ? "" : "module-hidden"}`} id="carnet">
      <div className="section-title">
        <div>
          <span>Carnet virtual</span>
          <h2>{member ? member.membership_number : "Pendiente de aprobación"}</h2>
        </div>
        {member && <StatusBadge status={member.status} />}
      </div>

      {member ? (
        <>
          <VirtualCard cardRef={cardRef} user={user} application={application} member={member} />
          <Button
            type="button"
            icon={Download}
            variant="secondary"
            onClick={() => downloadCardPdf(cardRef.current, `carnet-${member.membership_number}.pdf`)}
          >
            Descargar carnet en PDF
          </Button>
        </>
      ) : (
        <div className="empty-state">
          <BadgeCheck size={34} />
          <p>El carnet se generará cuando el administrador apruebe la solicitud.</p>
        </div>
      )}

      <div className="payment-box">
        <h3>Mensualidad CIP</h3>
        <div className="mp-brand">
          <img src={mercadoPagoLogo} alt="Mercado Pago" />
          <span>Pago online seguro. Al regularizar tus mensualidades, el carnet cambia a HABILITADO.</span>
        </div>
        {member?.status === "INHABILITADO" && (
          <div className="payment-alert">
            <AlertTriangle size={18} />
            <span>Existe al menos una mensualidad pendiente. Al regularizarla, el carnet vuelve a HABILITADO.</span>
          </div>
        )}
        <div className="payment-controls">
          <input type="month" value={period} onChange={(event) => onPeriodChange(event.target.value)} />
          <Button type="button" icon={CreditCard} onClick={onPayMonthly} disabled={!member}>
            Pagar mes
          </Button>
          <Button type="button" icon={WalletCards} variant="secondary" onClick={onPayFullDebt} disabled={!member || debtAmount <= 0}>
            Pagar todo
          </Button>
        </div>
        <p className="payment-summary">
          {debtAmount > 0
            ? `Pendiente: ${pendingPeriods.join(", ")} - Total S/ ${debtAmount.toFixed(2)}`
            : "No tienes mensualidades pendientes."}
        </p>
      </div>
    </aside>
  );
}
