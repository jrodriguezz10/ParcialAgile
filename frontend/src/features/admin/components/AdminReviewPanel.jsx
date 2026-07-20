import { AlertTriangle, Check, Eye, FileText, ReceiptText, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, StatusBadge } from "../../../components/ui";

// Modulo Detalle: busca, filtra y revisa documentos de una solicitud.
export function AdminReviewPanel({
  activeModule,
  applications,
  applicationFilter,
  selectedApp,
  observations,
  onFilterChange,
  onObservationsChange,
  onSelectApplication,
  onCloseSelection,
  onAction,
  canReview = true,
}) {
  const [query, setQuery] = useState("");

  const filteredApplications = useMemo(() => {
    const search = query.trim().toLowerCase();
    const reviewableApplications = applications.filter((application) => application.status !== "PENDIENTE");
    if (!search) return reviewableApplications;
    return reviewableApplications.filter((application) => {
      const text = [
        application.full_name,
        application.dni,
        application.email,
        application.profession,
        application.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(search);
    });
  }, [applications, query]);

  return (
    <aside className={`panel side-panel review-panel ${activeModule === "detalle" ? "" : "module-hidden"}`} id="admin-detalle">
      <div className="section-title">
        <div>
          <span>Detalle</span>
          <h2>{selectedApp ? selectedApp.full_name : "Buscar solicitud"}</h2>
        </div>
        {selectedApp && (
          <button type="button" className="icon-close" aria-label="Cerrar detalle" onClick={onCloseSelection}>
            <X size={18} />
          </button>
        )}
      </div>

      {!selectedApp && (
        <>
          <div className="review-toolbar">
            <label className="member-search">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, DNI, correo o profesion"
              />
            </label>
            <select value={applicationFilter} onChange={(event) => onFilterChange(event.target.value)}>
              <option value="OBSERVADO">Observadas</option>
              <option value="APROBADO">Aprobadas</option>
              <option value="RECHAZADO">Rechazadas</option>
              <option value="TODOS">Todas</option>
            </select>
          </div>

          <div className="list">
            {filteredApplications.map((application) => (
              <button key={application.id} className="list-item" onClick={() => onSelectApplication(application)}>
                <span>
                  <strong>{application.full_name}</strong>
                  <small>
                    DNI {application.dni} - {application.profession || "Sin profesion"}
                  </small>
                </span>
                <StatusBadge status={application.status} />
              </button>
            ))}
            {!filteredApplications.length && (
              <div className="empty-state">
                <Eye size={34} />
                <p>No hay solicitudes para revisar con ese filtro.</p>
              </div>
            )}
          </div>
        </>
      )}

      {selectedApp && (
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
              <span>Profesion</span>
              <b>{selectedApp.profession || "Sin dato"}</b>
            </p>
          </div>

          <div className="doc-preview">
            {selectedApp.photo_url ? <img src={selectedApp.photo_url} alt="Foto" /> : <div className="empty-state">Sin foto</div>}
            <a href={selectedApp.degree_pdf_url} target="_blank" rel="noreferrer">
              <FileText size={16} /> Ver titulo profesional
            </a>
            <a href={selectedApp.receipt_url} target="_blank" rel="noreferrer">
              <ReceiptText size={16} /> Ver recibo de pago
            </a>
          </div>

          <label>
            Observaciones
            <textarea value={observations} onChange={(event) => onObservationsChange(event.target.value)} rows={5} disabled={!canReview} />
          </label>

          <div className="button-row">
            <Button icon={Check} onClick={() => onAction("approve")} disabled={!canReview || selectedApp.status === "APROBADO"}>
              Aprobar
            </Button>
            <Button icon={AlertTriangle} variant="secondary" onClick={() => onAction("observe")} disabled={!canReview || selectedApp.status === "APROBADO"}>
              Observar
            </Button>
            <Button icon={X} variant="danger" onClick={() => onAction("reject")} disabled={!canReview || selectedApp.status === "APROBADO"}>
              Rechazar
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}
