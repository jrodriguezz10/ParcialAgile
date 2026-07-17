import { MessageCircle, ReceiptText, RefreshCw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { VirtualCard } from "../../../components/VirtualCard";
import { Button, DataTable, StatusBadge } from "../../../components/ui";
import { formatDate } from "../../../utils/format";
import { downloadPaymentReceiptPdf } from "../../../utils/pdf";

// Modulo Padron: consulta de colegiados y pagos mensuales.
export function AdminMembersPanel({
  activeModule,
  members,
  memberFilter,
  selectedMember,
  memberPayments,
  manualPeriod,
  paymentCount,
  memberCardRef,
  onFilterChange,
  onRefresh,
  onOpenPayments,
  onManualPeriodChange,
  onPaymentCountChange,
  onRegisterPayment,
  onOpenCard,
  onCloseMember,
  onNotifyWhatsApp,
}) {
  const [memberSearch, setMemberSearch] = useState("");
  const normalizedSearch = memberSearch.trim().toLowerCase();
  const visibleMembers = useMemo(() => {
    if (!normalizedSearch) return members;
    return members.filter((member) => {
      const haystack = `${member.id} ${member.full_name} ${member.dni} ${member.membership_number}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [members, normalizedSearch]);

  return (
    <section className={`panel ${activeModule === "padron" ? "" : "module-hidden"}`} id="admin-padron">
      <div className="section-title">
        <div>
          <span>Colegiados</span>
          <h2>Padrón y mensualidades</h2>
        </div>
      </div>

      <div className="member-toolbar">
        <label className="member-search">
          <Search size={18} />
          <input
            value={memberSearch}
            onChange={(event) => setMemberSearch(event.target.value)}
            placeholder="Buscar por nombre, DNI o CIP"
            autoComplete="off"
          />
          {memberSearch && (
            <button
              type="button"
              onClick={() => setMemberSearch("")}
              aria-label="Limpiar busqueda"
            >
              <X size={16} />
            </button>
          )}
        </label>
        <select value={memberFilter} onChange={(event) => onFilterChange(event.target.value)}>
          <option value="TODOS">Todos los estados</option>
          <option value="HABILITADO">Habilitados</option>
          <option value="INHABILITADO">Inhabilitados</option>
        </select>
        <Button icon={RefreshCw} variant="ghost" onClick={onRefresh}>
          Actualizar lista
        </Button>
      </div>

      <DataTable
        columns={["Colegiado", "Sede", "Registro", "Estado", "Deuda", "Último pago", "Acción"]}
        rows={visibleMembers.map((member) => [
          <span className="table-person" key={member.id}>
            <b>{member.full_name}</b>
            <small>DNI {member.dni}</small>
          </span>,
          member.branch || "Consejo Nacional - Lima",
          member.membership_number,
          <StatusBadge status={member.status} />,
          member.debt_count ? `${member.debt_count} mes(es) · S/ ${Number(member.debt_amount).toFixed(2)}` : "Sin deuda",
          member.last_paid_period || "Sin pago",
          <span className="action-stack" key={`actions-${member.id}`}>
            <button className="inline-action" onClick={() => onOpenPayments(member)}>
              Historial
            </button>
            <button className="inline-action" onClick={() => onOpenCard(member)}>
              Carnet
            </button>
            {member.debt_count > 0 && <button className="inline-action" onClick={() => onNotifyWhatsApp(member)} disabled={!member.phone} title={member.phone ? "Notificar deuda por WhatsApp" : "Registra un celular para notificar"}>
              <MessageCircle size={15} /> WhatsApp
            </button>}
          </span>,
        ])}
        empty="No hay colegiados registrados."
      />

      {selectedMember && (
        <div className="member-history">
          <div className="section-title member-history-title">
            <div>
              <span>Pagos de colegiado</span>
              <h2>{selectedMember.full_name}</h2>
            </div>
            <div className="member-history-actions">
              <StatusBadge status={selectedMember.status} />
              <button type="button" className="icon-btn" onClick={onCloseMember} aria-label="Cerrar historial">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="member-history-body">
            <div className="member-payments-panel">
              <div className="payment-panel-head">
                <div>
                  <span>Pago manual</span>
                  <strong>Mensualidad S/ 20.00</strong>
                </div>
                <form className="payment-controls" onSubmit={onRegisterPayment}>
                  <input type="month" value={manualPeriod} onChange={(event) => onManualPeriodChange(event.target.value)} />
                  <input type="number" min="1" max="60" value={paymentCount} onChange={(event) => onPaymentCountChange(Math.max(1, Number(event.target.value) || 1))} aria-label="Cantidad de mensualidades" />
                  <Button icon={ReceiptText}>Cobrar {paymentCount} mensualidad{paymentCount > 1 ? "es" : ""}</Button>
                </form>
              </div>
              <DataTable
                columns={["Tipo", "Periodo", "Monto", "Método", "Estado", "Fecha", "Comprobante"]}
                rows={memberPayments.map((payment) => [
                  payment.payment_type === "INSCRIPCION" ? "Inscripción" : "Mensualidad",
                  payment.period_month,
                  `S/ ${Number(payment.amount).toFixed(2)}`,
                  payment.method,
                  <StatusBadge status={payment.status} />,
                  formatDate(payment.paid_at || payment.created_at),
                  payment.status === "PAGADO" ? (
                    <button className="inline-action" onClick={() => downloadPaymentReceiptPdf(payment, selectedMember)}>
                      Descargar
                    </button>
                  ) : (
                    "Pendiente"
                  ),
                ])}
                empty="Sin pagos registrados."
              />
            </div>
            <div className="member-card-preview">
              <VirtualCard cardRef={memberCardRef} user={selectedMember} application={{ photo_url: selectedMember.photo_url }} member={selectedMember} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
