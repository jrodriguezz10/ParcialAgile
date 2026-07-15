import { RefreshCw, Save, Search, UserPlus } from "lucide-react";
import { Button, DataTable } from "../../../components/ui";
import { formatDate } from "../../../utils/format";
import { CIP_BRANCHES } from "../../../constants/catalogs";

// Modulo Configuracion: administradores del sistema.
export function AdminSettingsPanel({
  activeModule,
  admins,
  adminForm,
  newAdmin,
  adminLookupLoading,
  newAdminLookupLoading,
  onRefresh,
  onAdminFormChange,
  onNewAdminChange,
  onLookupAdminDni,
  onSaveProfile,
  onCreateAdmin,
}) {
  return (
    <section className={`panel ${activeModule === "configuracion" ? "" : "module-hidden"}`} id="admin-configuracion">
      <div className="section-title">
        <div>
          <span>Configuracion</span>
          <h2>Usuarios administradores</h2>
        </div>
        <Button type="button" icon={RefreshCw} variant="ghost" onClick={onRefresh}>
          Actualizar
        </Button>
      </div>

      <div className="settings-layout">
        <form className="settings-form" onSubmit={onSaveProfile}>
          <div className="section-title compact-title">
            <div>
              <span>Cuenta actual</span>
              <h2>Administrador</h2>
            </div>
          </div>
          <div className="settings-grid">
            <label>
              Nombre
              <input value={adminForm.name} onChange={(event) => onAdminFormChange((current) => ({ ...current, name: event.target.value }))} required />
            </label>
            <label>
              DNI
              <div className="input-action">
                <input
                  value={adminForm.dni}
                  onChange={(event) =>
                    onAdminFormChange((current) => ({ ...current, dni: event.target.value.replace(/\D/g, "").slice(0, 8), name: "" }))
                  }
                  inputMode="numeric"
                  maxLength={8}
                  required
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onLookupAdminDni("current")}
                  disabled={adminLookupLoading || adminForm.dni.length !== 8}
                  aria-label="Consultar DNI en RENIEC"
                >
                  <Search size={18} />
                </button>
              </div>
            </label>
            <label>
              Correo
              <input
                type="email"
                value={adminForm.email}
                onChange={(event) => onAdminFormChange((current) => ({ ...current, email: event.target.value }))}
                required
              />
            </label>
            <label>
              Telefono
              <input
                value={adminForm.phone}
                onChange={(event) => onAdminFormChange((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 9) }))}
                inputMode="numeric"
                maxLength={9}
                required
              />
            </label>
            <label>
              Cargo
              <select value={adminForm.role} onChange={(event) => onAdminFormChange((current) => ({ ...current, role: event.target.value }))}><option value="ADMIN_SEDE">Administrador de sede</option><option value="CAJERO">Cajero</option></select>
            </label>
            <label>Sede<select value={adminForm.branch} onChange={(event) => onAdminFormChange((current) => ({ ...current, branch: event.target.value }))}>{CIP_BRANCHES.map((branch) => <option key={branch}>{branch}</option>)}</select></label>
            <label className="wide">
              Nueva clave
              <input
                type="password"
                value={adminForm.password}
                onChange={(event) => onAdminFormChange((current) => ({ ...current, password: event.target.value }))}
                placeholder="Dejar vacio para no cambiar"
              />
            </label>
          </div>
          <Button icon={Save}>Guardar administrador</Button>
        </form>

        <form className="settings-form" onSubmit={onCreateAdmin}>
          <div className="section-title compact-title">
            <div>
              <span>Nuevo acceso</span>
              <h2>Crear administrador</h2>
            </div>
          </div>
          <div className="settings-grid">
            <label>
              Nombre
              <input value={newAdmin.name} onChange={(event) => onNewAdminChange((current) => ({ ...current, name: event.target.value }))} required />
            </label>
            <label>
              DNI
              <div className="input-action">
                <input
                  value={newAdmin.dni}
                  onChange={(event) =>
                    onNewAdminChange((current) => ({ ...current, dni: event.target.value.replace(/\D/g, "").slice(0, 8), name: "" }))
                  }
                  inputMode="numeric"
                  maxLength={8}
                  required
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onLookupAdminDni("new")}
                  disabled={newAdminLookupLoading || newAdmin.dni.length !== 8}
                  aria-label="Consultar DNI en RENIEC"
                >
                  <Search size={18} />
                </button>
              </div>
            </label>
            <label>
              Correo
              <input
                type="email"
                value={newAdmin.email}
                onChange={(event) => onNewAdminChange((current) => ({ ...current, email: event.target.value }))}
                required
              />
            </label>
            <label>
              Telefono
              <input
                value={newAdmin.phone}
                onChange={(event) => onNewAdminChange((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 9) }))}
                inputMode="numeric"
                maxLength={9}
                required
              />
            </label>
            <label>
              Cargo
              <select value={newAdmin.role} onChange={(event) => onNewAdminChange((current) => ({ ...current, role: event.target.value }))}><option value="ADMIN_SEDE">Administrador de sede</option><option value="CAJERO">Cajero</option></select>
            </label>
            <label>Sede<select value={newAdmin.branch} onChange={(event) => onNewAdminChange((current) => ({ ...current, branch: event.target.value }))}>{CIP_BRANCHES.map((branch) => <option key={branch}>{branch}</option>)}</select></label>
            <label>
              Clave
              <input
                type="password"
                value={newAdmin.password}
                onChange={(event) => onNewAdminChange((current) => ({ ...current, password: event.target.value }))}
                required
              />
            </label>
          </div>
          <Button icon={UserPlus}>Crear usuario admin</Button>
        </form>
      </div>

      <div className="settings-form">
        <div className="section-title compact-title">
          <div>
            <span>Administradores</span>
            <h2>Accesos registrados</h2>
          </div>
        </div>
        <DataTable
          columns={["Nombre", "DNI", "Correo", "Telefono", "Cargo", "Sede", "Creado"]}
          rows={admins.map((admin) => [
            admin.name,
            admin.dni || "Sin dato",
            admin.email,
            admin.phone || "Sin dato",
            admin.role || "Administrador",
            admin.branch || "Consejo Nacional - Lima",
            formatDate(admin.created_at),
          ])}
          empty="No hay administradores registrados."
        />
      </div>
    </section>
  );
}
