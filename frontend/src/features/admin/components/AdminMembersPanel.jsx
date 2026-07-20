import { Mail, Plus, ReceiptText, RefreshCw, Search, Trash2, X } from "lucide-react";
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
  manualPaymentMethods,
  memberCardRef,
  onFilterChange,
  onRefresh,
  onOpenPayments,
  onManualPeriodChange,
  onPaymentCountChange,
  onManualPaymentMethodsChange,
  onRegisterPayment,
  onRegisterSinglePeriod,
  onOpenCard,
  onCloseMember,
  onNotifyEmail,
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
  const pendingPeriods = Array.isArray(selectedMember?.pending_periods) ? selectedMember.pending_periods : [];
  const expectedTotal = selectedMember ? Number(selectedMember.debt_amount || 0) : paymentCount * 2;
  const paymentTotal = (manualPaymentMethods || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paymentStatus = getPaymentStatus(manualPaymentMethods, expectedTotal);

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
            {member.debt_count > 0 && <button className="inline-action" onClick={() => onNotifyEmail(member)} disabled={!member.email} title={member.email ? "Notificar deuda por correo" : "Registra un correo para notificar"}>
              <Mail size={15} /> Correo
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
                  <strong>Deuda S/ {expectedTotal.toFixed(2)}</strong>
                </div>
                <form className="payment-controls" onSubmit={onRegisterPayment}>
                  <small className={pendingPeriods.length ? "payment-total warning" : "payment-total ok"}>
                    {pendingPeriods.length
                      ? `Meses vencidos: ${pendingPeriods.join(", ")}. Incluye 1% de mora en periodos atrasados.`
                      : "No tiene mensualidades vencidas."}
                  </small>
                  <PaymentMethodsEditor
                    methods={manualPaymentMethods}
                    expectedTotal={expectedTotal}
                    onChange={onManualPaymentMethodsChange}
                  />
                  <small className={paymentStatus.canSubmit ? "payment-total ok" : "payment-total warning"}>
                    Total recibido S/ {paymentTotal.toFixed(2)} de S/ {expectedTotal.toFixed(2)}
                    {paymentStatus.missing > 0.01 && ` - Falta S/ ${paymentStatus.missing.toFixed(2)}`}
                    {paymentStatus.change > 0.01 && ` - Vuelto S/ ${paymentStatus.change.toFixed(2)}`}
                    {paymentStatus.invalidChange && " - El vuelto solo aplica con efectivo"}
                  </small>
                  <Button icon={ReceiptText} disabled={!pendingPeriods.length || !paymentStatus.canSubmit}>
                    Cobrar {pendingPeriods.length || 0} mensualidad{pendingPeriods.length === 1 ? "" : "es"}
                  </Button>
                </form>
              </div>
              <DataTable
                columns={["Tipo", "Periodo", "Monto", "Método", "Estado", "Fecha", "Comprobante"]}
                rows={memberPayments.map((payment) => [
                  payment.payment_type === "INSCRIPCION" ? "Inscripción" : "Mensualidad",
                  payment.period_month,
                  `S/ ${Number(payment.amount).toFixed(2)}`,
                  payment.status === "PENDIENTE" && payment.payment_type === "MENSUALIDAD"
                    ? "Pendiente de cobro"
                    : payment.method_detail || payment.method,
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

const PAYMENT_METHODS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "YAPE", label: "Yape" },
  { value: "PLIN", label: "Plin" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

function getPaymentStatus(methods = [], expectedTotal) {
  const total = methods.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const missing = Math.max(0, expectedTotal - total);
  const change = Math.max(0, total - expectedTotal);
  const hasCash = methods.some((item) => item.method === "EFECTIVO" && Number(item.amount || 0) > 0);
  const invalidChange = change > 0.01 && !hasCash;
  return {
    total,
    missing,
    change,
    invalidChange,
    canSubmit: missing <= 0.01 && !invalidChange,
  };
}

function PaymentMethodsEditor({ methods = [], expectedTotal, onChange }) {
  const rows = methods.length ? methods : [{ method: "EFECTIVO", amount: expectedTotal }];

  function updateRow(index, patch) {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    onChange([...rows, { method: "YAPE", amount: 0 }]);
  }

  function removeRow(index) {
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
    onChange(nextRows.length ? nextRows : [{ method: "EFECTIVO", amount: expectedTotal }]);
  }

  return (
    <div className="payment-methods wide">
      {rows.map((row, index) => (
        <div className="payment-method-row" key={`${row.method}-${index}`}>
          <select value={row.method} onChange={(event) => updateRow(index, { method: event.target.value })}>
            {PAYMENT_METHODS.map((method) => <option value={method.value} key={method.value}>{method.label}</option>)}
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            value={row.amount}
            onChange={(event) => updateRow(index, { amount: Number(event.target.value) || 0 })}
            aria-label="Monto por medio de pago"
          />
          <button type="button" className="icon-btn" onClick={() => removeRow(index)} aria-label="Quitar medio de pago">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button type="button" className="inline-action" onClick={addRow}>
        <Plus size={15} /> Agregar medio
      </button>
    </div>
  );
}
