import { CreditCard, Download, Plus, Search, Trash2 } from "lucide-react";
import { VirtualCard } from "../../../components/VirtualCard";
import { Button, StatusBadge } from "../../../components/ui";
import { downloadPaymentReceiptPdf } from "../../../utils/pdf";
import { CareerField } from "../../../components/CareerField";
import { CIP_BRANCHES, isValidEngineeringCareer } from "../../../constants/catalogs";

// Modulo Registro: alta manual de colegiados y previsualizacion del carnet.
export function AdminRegisterPanel({
  activeModule,
  createdMember,
  createdCardRef,
  manualMember,
  registrationPayment,
  dniLookupLoading,
  onManualMemberChange,
  onManualFileChange,
  onRegistrationPaymentChange,
  onLookupDni,
  onSubmit,
  onlyDniDigits,
}) {
  const registrationPaymentTotal = (registrationPayment.methods || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const registrationPaymentStatus = getPaymentStatus(registrationPayment.methods, 2);
  const registrationPaymentMatches = registrationPayment.method === "MERCADO_PAGO" || registrationPaymentStatus.canSubmit;
  const professionValid = isValidEngineeringCareer(manualMember.profession);

  return (
    <section className={`panel ${activeModule === "registro" ? "" : "module-hidden"}`} id="admin-registro">
      <div className="section-title">
        <div>
          <span>Registro directo</span>
          <h2>Crear colegiado presencial</h2>
        </div>
        <StatusBadge status={createdMember?.status} />
      </div>

      <div className="settings-layout">
        <form className="settings-form" onSubmit={onSubmit}>
          <div className="settings-grid">
            <label>
              DNI
              <div className="input-action">
                <input
                  value={manualMember.dni}
                  onChange={(event) => {
                    const dni = onlyDniDigits(event.target.value);
                    onManualMemberChange((current) => ({
                      ...current,
                      dni,
                      full_name: dni === current.dni ? current.full_name : "",
                      first_name: "",
                      paternal_last_name: "",
                      maternal_last_name: "",
                    }));
                  }}
                  inputMode="numeric"
                  maxLength={8}
                  required
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={onLookupDni}
                  disabled={dniLookupLoading || manualMember.dni.length !== 8}
                  aria-label="Consultar DNI en la API"
                >
                  <Search size={18} />
                </button>
              </div>
            </label>
            <label className="wide">
              Nombres completos desde API DNI
              <input value={manualMember.full_name} readOnly placeholder="Consulta el DNI para completar automaticamente" required />
            </label>
            <label>
              Correo
              <input
                type="email"
                value={manualMember.email}
                onChange={(event) => onManualMemberChange((current) => ({ ...current, email: event.target.value }))}
                required
              />
            </label>
            <label>
              Profesión
              <CareerField value={manualMember.profession} onChange={(value) => onManualMemberChange((current) => ({ ...current, profession: value }))} />
            </label>
            <label>
              Sede
              <select value={manualMember.branch} onChange={(event) => onManualMemberChange((current) => ({ ...current, branch: event.target.value }))} required>
                {CIP_BRANCHES.map((branch) => <option key={branch}>{branch}</option>)}
              </select>
            </label>
            <div className="document-upload-grid wide">
              <label>
                Foto tipo carnet
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => onManualFileChange((current) => ({ ...current, photo: event.target.files?.[0] || null }))}
                />
              </label>
              <label>
                PDF del título profesional
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => onManualFileChange((current) => ({ ...current, degreePdf: event.target.files?.[0] || null }))}
                  required
                />
              </label>
              <label>
                Comprobante de pago
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={(event) => onManualFileChange((current) => ({ ...current, receipt: event.target.files?.[0] || null }))}
                  required={registrationPayment.method !== "MERCADO_PAGO"}
                  disabled={registrationPayment.method === "MERCADO_PAGO"}
                />
              </label>
            </div>
            <label>
              Periodo a pagar
              <input
                type="month"
                value={registrationPayment.period_month}
                onChange={(event) => {
                  const period = event.target.value;
                  onRegistrationPaymentChange((current) => ({ ...current, period_month: period }));
                  onManualMemberChange((current) => {
                    const periodStart = `${period}-01`;
                    return !current.enrollment_date || current.enrollment_date.slice(0, 7) > period
                      ? { ...current, enrollment_date: periodStart }
                      : current;
                  });
                }}
                required
              />
            </label>
            <label>
              Fecha de inscripcion
              <input
                type="date"
                value={manualMember.enrollment_date}
                onChange={(event) => onManualMemberChange((current) => ({ ...current, enrollment_date: event.target.value }))}
                required
              />
            </label>
            <label>
              Método de pago
              <select
                value={registrationPayment.method}
                onChange={(event) => onRegistrationPaymentChange((current) => ({
                  ...current,
                  method: event.target.value,
                  methods: [{ method: event.target.value, amount: 2 }],
                }))}
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="YAPE">Yape</option>
                <option value="PLIN">Plin</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="MERCADO_PAGO">Mercado Pago</option>
              </select>
            </label>
            {registrationPayment.method !== "MERCADO_PAGO" && (
              <div className="wide">
                <PaymentMethodsEditor
                  methods={registrationPayment.methods}
                  expectedTotal={2}
                  onChange={(methods) => onRegistrationPaymentChange((current) => ({
                    ...current,
                    method: methods[0]?.method || "EFECTIVO",
                    methods,
                  }))}
                />
                <small className={registrationPaymentStatus.canSubmit ? "payment-total ok" : "payment-total warning"}>
                  Total recibido S/ {Number(registrationPaymentTotal).toFixed(2)} de S/ 2.00
                  {registrationPaymentStatus.missing > 0.01 && ` - Falta S/ ${registrationPaymentStatus.missing.toFixed(2)}`}
                  {registrationPaymentStatus.change > 0.01 && ` - Vuelto S/ ${registrationPaymentStatus.change.toFixed(2)}`}
                  {registrationPaymentStatus.invalidChange && " - El vuelto solo aplica con efectivo"}
                </small>
              </div>
            )}
          </div>
          <Button icon={CreditCard} disabled={!registrationPaymentMatches || !professionValid}>
            {registrationPayment.method === "MERCADO_PAGO" ? "Registrar y abrir Mercado Pago" : "Registrar pago y generar carnet"}
          </Button>
        </form>

        <div className="settings-form">
          <div className="section-title compact-title">
            <div>
              <span>Carnet generado</span>
              <h2>{createdMember ? createdMember.membership_number : "Sin registro nuevo"}</h2>
            </div>
          </div>
          {createdMember ? (
            <>
              {createdMember.registration_payment?.status === "PAGADO" ? (
                <>
                  <VirtualCard cardRef={createdCardRef} user={createdMember} application={{ photo_url: createdMember.photo_url }} member={createdMember} />
                  <Button
                    type="button"
                    icon={Download}
                    variant="secondary"
                    onClick={() => downloadPaymentReceiptPdf(createdMember.registration_payment, createdMember)}
                  >
                    Descargar comprobante de pago
                  </Button>
                </>
              ) : (
                <div className="empty-state">El registro queda pendiente hasta confirmar el pago en Mercado Pago.</div>
              )}
              {createdMember.checkout_url && (
                <Button
                  type="button"
                  icon={CreditCard}
                  variant="secondary"
                  onClick={() => window.open(createdMember.checkout_url, "_blank", "noopener,noreferrer")}
                >
                  Abrir Mercado Pago
                </Button>
              )}
            </>
          ) : (
            <div className="empty-state">Registra un colegiado presencial para generar su carnet.</div>
          )}
        </div>
      </div>
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
    <div className="payment-methods">
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
