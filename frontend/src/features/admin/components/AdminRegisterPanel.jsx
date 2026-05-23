import { CreditCard, Download, Search } from "lucide-react";
import { VirtualCard } from "../../../components/VirtualCard";
import { Button, StatusBadge } from "../../../components/ui";
import { downloadCardPdf, downloadPaymentReceiptPdf } from "../../../utils/pdf";

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
              Teléfono
              <input
                value={manualMember.phone}
                onChange={(event) => onManualMemberChange((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 9) }))}
                inputMode="numeric"
                maxLength={9}
                pattern="[0-9]{9}"
                required
              />
            </label>
            <label>
              Profesión
              <input
                value={manualMember.profession}
                onChange={(event) => onManualMemberChange((current) => ({ ...current, profession: event.target.value }))}
                required
              />
            </label>
            <label>
              Clave inicial
              <input
                type="password"
                value={manualMember.password}
                onChange={(event) => onManualMemberChange((current) => ({ ...current, password: event.target.value }))}
                placeholder="Opcional; si se deja vacía usa el DNI"
              />
            </label>
            <label className="wide">
              Dirección
              <input
                value={manualMember.address}
                onChange={(event) => onManualMemberChange((current) => ({ ...current, address: event.target.value }))}
              />
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
                  required={registrationPayment.method === "EFECTIVO"}
                  disabled={registrationPayment.method === "MERCADO_PAGO"}
                />
              </label>
            </div>
            <label>
              Periodo a pagar
              <input
                type="month"
                value={registrationPayment.period_month}
                onChange={(event) => onRegistrationPaymentChange((current) => ({ ...current, period_month: event.target.value }))}
                required
              />
            </label>
            <label>
              Método de pago
              <select
                value={registrationPayment.method}
                onChange={(event) => onRegistrationPaymentChange((current) => ({ ...current, method: event.target.value }))}
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="MERCADO_PAGO">Mercado Pago</option>
              </select>
            </label>
          </div>
          <Button icon={CreditCard}>
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
                    onClick={() => downloadCardPdf(createdCardRef.current, `carnet-${createdMember.membership_number}.pdf`)}
                  >
                    Descargar carnet físico / PDF
                  </Button>
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
