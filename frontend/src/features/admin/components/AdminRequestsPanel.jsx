import { ListChecks } from "lucide-react";
import { StatusBadge } from "../../../components/ui";

// Modulo Solicitudes: bandeja rapida de expedientes pendientes.
export function AdminRequestsPanel({ activeModule, applications, selectedApp, onSelectApplication }) {
  return (
    <section className={`panel ${activeModule === "solicitudes" ? "" : "module-hidden"}`} id="admin-solicitudes">
      <div className="section-title">
        <div>
          <span>Revision</span>
          <h2>Solicitudes pendientes</h2>
        </div>
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
                DNI {application.dni} - {application.profession || "Sin profesion"}
              </small>
            </span>
            <StatusBadge status={application.status} />
          </button>
        ))}
        {!applications.length && (
          <div className="empty-state">
            <ListChecks size={32} />
            <p>No hay solicitudes pendientes.</p>
          </div>
        )}
      </div>
    </section>
  );
}
