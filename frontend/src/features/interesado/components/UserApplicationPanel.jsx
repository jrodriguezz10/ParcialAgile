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
  onUpdateForm,
  onFilesChange,
  onStartApplication,
  onlyDniDigits,
}) {
  const hasApplication = Boolean(application);
  const canEditApplication = !hasApplication ? unlocked : application.status === "OBSERVADO";
  const shouldShowStart = !hasApplication && lookupMessage && !unlocked;
  const fieldsDisabled = !canEditApplication;

  return (
    <section className={`panel ${activeModule === "solicitud" ? "" : "module-hidden"}`} id="solicitud">
      <div className="section-title">
        <div>
          <span>Interesado</span>
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
            Profesión
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

        <div className="two-cols">
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
          <label>
            Teléfono
            <input
              value={form.phone || ""}
              onChange={(event) => onUpdateForm("phone", event.target.value.replace(/\D/g, "").slice(0, 9))}
              inputMode="numeric"
              maxLength={9}
              pattern="[0-9]{9}"
              disabled={fieldsDisabled}
              required
            />
          </label>
        </div>

        <label>
          Dirección
          <input value={form.address || ""} onChange={(event) => onUpdateForm("address", event.target.value)} disabled={fieldsDisabled} />
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
            label="Título profesional PDF"
            accept="application/pdf"
            existing={application?.degree_pdf_url}
            disabled={fieldsDisabled}
            onChange={(file) => onFilesChange({ ...files, degreePdf: file })}
          />
          <FileInput
            icon={ReceiptText}
            label="Recibo de inscripción"
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
            <Button icon={Upload} disabled={!canEditApplication || application?.status === "APROBADO"}>
              Enviar solicitud
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
