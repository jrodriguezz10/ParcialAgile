import { AlertTriangle, Camera, FileText, ReceiptText, Upload } from "lucide-react";
import { Button, FileInput, StatusBadge } from "../../../components/ui";
import { CareerField } from "../../../components/CareerField";
import { CIP_BRANCHES, isValidEngineeringCareer } from "../../../constants/catalogs";

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
  const mustReplaceDocuments = application?.status === "OBSERVADO" || application?.status === "RECHAZADO";
  const canEditApplication = !hasApplication ? unlocked : mustReplaceDocuments;
  const shouldShowStart = !hasApplication && lookupMessage && !unlocked;
  const fieldsDisabled = !canEditApplication;
  const hasRequiredInfo = Boolean(
    form.dni &&
      form.full_name?.trim() &&
      form.email?.trim() &&
      isValidEngineeringCareer(form.profession) &&
      form.branch
  );
  const hasRequiredFiles = Boolean(
    (files.photo || (!mustReplaceDocuments && application?.photo_url)) &&
      (files.degreePdf || (!mustReplaceDocuments && application?.degree_pdf_url)) &&
      (files.receipt || (!mustReplaceDocuments && application?.receipt_url))
  );

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
            <span>Antes de enviar, realiza el pago de inscripcion de S/ 2.00 con Mercado Pago y adjunta el comprobante.</span>
          </div>
        )}
        {!hasApplication && (
          <div className="button-row">
            <Button type="button" icon={Upload} onClick={onPayRegistration}>
              Pagar S/ 2.00 con Mercado Pago
            </Button>
          </div>
        )}

        <div className="two-cols">
          <label>
            DNI
            <input value={form.dni || ""} inputMode="numeric" maxLength={8} disabled required />
          </label>
          <label>
            Profesion
            <CareerField value={form.profession || ""} onChange={(value) => onUpdateForm("profession", value)} disabled={fieldsDisabled} />
          </label>
        </div>

        <label>
          Sede de atencion
          <select value={form.branch || "Consejo Nacional - Lima"} onChange={(event) => onUpdateForm("branch", event.target.value)} disabled={fieldsDisabled} required>
            {CIP_BRANCHES.map((branch) => <option key={branch}>{branch}</option>)}
          </select>
        </label>

        <label>
          Nombres completos
          <input value={form.full_name || ""} disabled required />
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
            existing={mustReplaceDocuments ? null : application?.photo_url}
            disabled={fieldsDisabled}
            onChange={(file) => onFilesChange({ ...files, photo: file })}
          />
          <FileInput
            icon={FileText}
            label="Titulo profesional PDF"
            accept="application/pdf"
            existing={mustReplaceDocuments ? null : application?.degree_pdf_url}
            disabled={fieldsDisabled}
            onChange={(file) => onFilesChange({ ...files, degreePdf: file })}
          />
          <FileInput
            icon={ReceiptText}
            label="Comprobante de pago"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            existing={mustReplaceDocuments ? null : application?.receipt_url}
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
            <Button icon={Upload} disabled={!canEditApplication || !hasRequiredInfo || !hasRequiredFiles || application?.status === "APROBADO"}>
              {hasRequiredInfo && hasRequiredFiles ? "Enviar solicitud" : "Completa todos los campos"}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
