import { AlertTriangle, Camera, FileText, ReceiptText, Search, Upload } from "lucide-react";
import { Button, FileInput, StatusBadge } from "../../../components/ui";

// Modulo Solicitud: datos personales, consulta DNI y carga de documentos.
export function UserApplicationPanel({
  activeModule,
  application,
  form,
  files,
  emailPattern,
  unlocked,
  lookupMessage,
  onSubmit,
  onLookupDni,
  onPayRegistration,
  onUpdateForm,
  onFilesChange,
  onStartApplication,
  onlyDniDigits,
}) {
  const hasApplication = Boolean(application);
  const canEditApplication = !hasApplication ? unlocked : application.status === "OBSERVADO";
  const shouldShowStart = !hasApplication && lookupMessage && !unlocked;
  const fieldsDisabled = !canEditApplication;
  const hasPaymentProof = Boolean(files.receipt || application?.receipt_url);

  return (
    <section className={`panel ${activeModule === "solicitud" ? "" : "module-hidden"}`} id="solicitud">
      <div className="section-title">
        <div>
          <span>Solicitud</span>
          <h2>Solicitud de colegiatura</h2>
        </div>
        <StatusBadge status={application?.status} />
      </div>

      {application?.observations && (
        <div className="warning">
          <AlertTriangle size={18} />
          <span>{application.observations}</span>
        </div>
      )}

      {lookupMessage && (
        <div className={hasApplication ? "warning" : "info-banner"}>
          <AlertTriangle size={18} />
          <span>{lookupMessage}</span>
        </div>
      )}

      <form className="stack" onSubmit={onSubmit}>
        {!hasApplication && (
          <div className="info-banner">
            <AlertTriangle size={18} />
            <span>Antes de enviar, realiza el pago de inscripcion de S/ 20.00 con Mercado Pago y adjunta el comprobante.</span>
          </div>
        )}
        {!hasApplication && (
          <div className="button-row">
            <Button type="button" icon={Upload} onClick={onPayRegistration}>
              Pagar S/ 20.00 con Mercado Pago
            </Button>
          </div>
        )}

        <div className="two-cols">
          <label>
            DNI
            <div className="input-action">
              <input
                value={form.dni || ""}
                onChange={(event) => onUpdateForm("dni", onlyDniDigits(event.target.value))}
                inputMode="numeric"
                maxLength={8}
                required
              />
              <button type="button" className="icon-btn" onClick={onLookupDni} aria-label="Buscar datos en RENIEC">
                <Search size={18} />
              </button>
            </div>
          </label>
          <label>
            Profesion
            <input
              value={form.profession || ""}
              onChange={(event) => onUpdateForm("profession", event.target.value)}
              disabled={fieldsDisabled}
              required
            />
          </label>
        </div>

        <label>
          Nombres completos
          <input value={form.full_name || ""} onChange={(event) => onUpdateForm("full_name", event.target.value)} disabled={fieldsDisabled} required />
        </label>

        <label>
          Correo
          <input
            type="email"
            value={form.email || ""}
            onChange={(event) => onUpdateForm("email", event.target.value)}
            pattern={emailPattern}
            placeholder="usuario@correo.com"
            disabled={fieldsDisabled}
            required
          />
        </label>

        <div className="upload-grid">
          <FileInput
            icon={Camera}
            label="Foto tipo carnet"
            accept="image/png,image/jpeg,image/webp"
            existing={application?.photo_url}
            disabled={fieldsDisabled}
            onChange={(file) => onFilesChange({ ...files, photo: file })}
          />
          <FileInput
            icon={FileText}
            label="Titulo profesional PDF"
            accept="application/pdf"
            existing={application?.degree_pdf_url}
            disabled={fieldsDisabled}
            onChange={(file) => onFilesChange({ ...files, degreePdf: file })}
          />
          <FileInput
            icon={ReceiptText}
            label="Comprobante de pago"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            existing={application?.receipt_url}
            disabled={fieldsDisabled}
            onChange={(file) => onFilesChange({ ...files, receipt: file })}
          />
        </div>

        <div className="button-row">
          {shouldShowStart ? (
            <Button type="button" icon={Upload} onClick={onStartApplication}>
              Hacer solicitud
            </Button>
          ) : (
            <Button icon={Upload} disabled={!canEditApplication || !hasPaymentProof || application?.status === "APROBADO"}>
              {hasPaymentProof ? "Enviar solicitud" : "Adjunta comprobante para enviar"}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
