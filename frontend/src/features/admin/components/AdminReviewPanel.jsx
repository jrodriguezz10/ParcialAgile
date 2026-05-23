import { AlertTriangle, Check, Eye, FileText, ReceiptText, X } from "lucide-react";
import { Button } from "../../../components/ui";

// Modulo Detalle: muestra documentos y acciones de aprobacion/observacion.
export function AdminReviewPanel({ activeModule, selectedApp, observations, onObservationsChange, onAction }) {
  return (
    <aside className={`panel side-panel review-panel ${activeModule === "detalle" ? "" : "module-hidden"}`} id="admin-detalle">
      <div className="section-title">
        <div>
          <span>Detalle</span>
          <h2>{selectedApp ? selectedApp.full_name : "Selecciona una solicitud"}</h2>
        </div>
      </div>

      {selectedApp ? (
        <>
          <div className="detail-grid">
            <p>
              <span>DNI</span>
              <b>{selectedApp.dni}</b>
            </p>
            <p>
              <span>Correo</span>
              <b>{selectedApp.email}</b>
            </p>
            <p>
              <span>Teléfono</span>
              <b>{selectedApp.phone || "Sin dato"}</b>
            </p>
            <p>
              <span>Profesión</span>
              <b>{selectedApp.profession}</b>
            </p>
          </div>

          <div className="doc-preview">
            {selectedApp.photo_url ? <img src={selectedApp.photo_url} alt="Foto" /> : <div className="empty-state">Sin foto</div>}
            <a href={selectedApp.degree_pdf_url} target="_blank" rel="noreferrer">
              <FileText size={16} /> Ver título profesional
            </a>
            <a href={selectedApp.receipt_url} target="_blank" rel="noreferrer">
              <ReceiptText size={16} /> Ver recibo de pago
            </a>
          </div>

          <label>
            Observaciones
            <textarea value={observations} onChange={(event) => onObservationsChange(event.target.value)} rows={5} />
          </label>

          <div className="button-row">
            <Button icon={Check} onClick={() => onAction("approve")} disabled={selectedApp.status === "APROBADO"}>
              Aprobar
            </Button>
            <Button icon={AlertTriangle} variant="secondary" onClick={() => onAction("observe")}>
              Observar
            </Button>
            <Button icon={X} variant="danger" onClick={() => onAction("reject")}>
              Rechazar
            </Button>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <Eye size={34} />
          <p>Elige una solicitud para revisar datos, documentos y cambiar estado.</p>
        </div>
      )}
    </aside>
  );
}
