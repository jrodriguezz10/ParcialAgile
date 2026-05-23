import { RefreshCw, Save, UserPlus } from "lucide-react";
import { Button, DataTable, StatusBadge } from "../../../components/ui";
import { formatDate } from "../../../utils/format";

// Modulo Configuracion: administradores y estado manual del colegiado.
export function AdminSettingsPanel({
  activeModule,
  admins,
  members,
  adminForm,
  newAdmin,
  selectedMember,
  statusForm,
  onRefresh,
  onAdminFormChange,
  onNewAdminChange,
  onStatusFormChange,
  onSaveProfile,
  onCreateAdmin,
  onUpdateMemberStatus,
  onSelectMember,
}) {
  return (
    <section className={`panel ${activeModule === "configuracion" ? "" : "module-hidden"}`} id="admin-configuracion">
      <div className="section-title">
        <div>
          <span>Configuración</span>
          <h2>Usuarios administradores y estados</h2>
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
              <input
                value={adminForm.dni}
                onChange={(event) => onAdminFormChange((current) => ({ ...current, dni: event.target.value.replace(/\D/g, "").slice(0, 8) }))}
                inputMode="numeric"
                maxLength={8}
                required
              />
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
              Teléfono
              <input value={adminForm.phone} onChange={(event) => onAdminFormChange((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            <label>
              Cargo
              <input value={adminForm.role} onChange={(event) => onAdminFormChange((current) => ({ ...current, role: event.target.value }))} required />
            </label>
            <label className="wide">
              Nueva clave
              <input
                type="password"
                value={adminForm.password}
                onChange={(event) => onAdminFormChange((current) => ({ ...current, password: event.target.value }))}
                placeholder="Dejar vacío para no cambiar"
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
              <input
                value={newAdmin.dni}
                onChange={(event) => onNewAdminChange((current) => ({ ...current, dni: event.target.value.replace(/\D/g, "").slice(0, 8) }))}
                inputMode="numeric"
                maxLength={8}
                required
              />
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
              Teléfono
              <input value={newAdmin.phone} onChange={(event) => onNewAdminChange((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            <label>
              Cargo
              <input value={newAdmin.role} onChange={(event) => onNewAdminChange((current) => ({ ...current, role: event.target.value }))} required />
            </label>
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

      <div className="admin-config-grid">
        <div className="settings-form">
          <div className="section-title compact-title">
            <div>
              <span>Administradores</span>
              <h2>Accesos registrados</h2>
            </div>
          </div>
          <DataTable
            columns={["Nombre", "DNI", "Correo", "Teléfono", "Cargo", "Creado"]}
            rows={admins.map((admin) => [
              admin.name,
              admin.dni || "Sin dato",
              admin.email,
              admin.phone || "Sin dato",
              admin.role || "Administrador",
              formatDate(admin.created_at),
            ])}
            empty="No hay administradores registrados."
          />
        </div>

        <form className="settings-form" onSubmit={onUpdateMemberStatus}>
          <div className="section-title compact-title">
            <div>
              <span>Colegiado</span>
              <h2>Cambiar estado del carnet</h2>
            </div>
            {selectedMember && <StatusBadge status={selectedMember.status} />}
          </div>
          <div className="settings-grid">
            <label className="wide">
              Colegiado
              <select
                value={selectedMember?.id || ""}
                onChange={(event) => {
                  const member = members.find((item) => String(item.id) === event.target.value);
                  if (member) onSelectMember(member);
                }}
              >
                <option value="">Selecciona un colegiado</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} - {member.membership_number}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estado
              <select
                value={statusForm.status}
                onChange={(event) => onStatusFormChange((current) => ({ ...current, status: event.target.value }))}
                disabled={!selectedMember}
              >
                <option value="AUTO">Automático por mensualidad</option>
                <option value="HABILITADO">Habilitado manual</option>
                <option value="INHABILITADO">Inhabilitado manual</option>
              </select>
            </label>
            <label className="wide">
              Motivo
              <textarea
                rows={4}
                value={statusForm.reason}
                onChange={(event) => onStatusFormChange((current) => ({ ...current, reason: event.target.value }))}
                placeholder="Ejemplo: regularización administrativa o falta de documento."
                disabled={!selectedMember}
              />
            </label>
          </div>
          <Button icon={Save} disabled={!selectedMember}>
            Guardar estado
          </Button>
        </form>
      </div>
    </section>
  );
}
