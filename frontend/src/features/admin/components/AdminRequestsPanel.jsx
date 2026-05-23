import { ListChecks } from "lucide-react";
import { StatusBadge } from "../../../components/ui";

// Modulo Solicitudes: lista y filtro de expedientes que revisa el administrador.
export function AdminRequestsPanel({
  activeModule,
  applications,
  applicationFilter,
  selectedApp,
  onFilterChange,
  onSelectApplication,
}) {
  return (
    <section className={`panel ${activeModule === "solicitudes" ? "" : "module-hidden"}`} id="admin-solicitudes">
      <div className="section-title">
        <div>
          <span>Revisión</span>
          <h2>Solicitudes</h2>
        </div>
        <select value={applicationFilter} onChange={(event) => onFilterChange(event.target.value)}>
          <option value="PENDIENTE">Pendientes</option>
          <option value="OBSERVADO">Observadas</option>
          <option value="APROBADO">Aprobadas</option>
          <option value="RECHAZADO">Rechazadas</option>
          <option value="TODOS">Todas</option>
        </select>
      </div>

      <div className="list">
        {applications.map((application) => (
          <button
            key={application.id}
            className={`list-item ${selectedApp?.id === application.id ? "selected" : ""}`}
            onClick={() => onSelectApplication(application)}
          >
            <span>
              <strong>{application.full_name}</strong>
              <small>
                DNI {application.dni} - {application.profession}
              </small>
            </span>
            <StatusBadge status={application.status} />
          </button>
        ))}
        {!applications.length && (
          <div className="empty-state">
            <ListChecks size={32} />
            <p>No hay solicitudes para este filtro.</p>
          </div>
        )}
      </div>
    </section>
  );
}
