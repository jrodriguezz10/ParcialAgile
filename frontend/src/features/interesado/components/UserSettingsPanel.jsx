import { Save } from "lucide-react";
import { Button, StatusBadge } from "../../../components/ui";

// Modulo Configuracion: datos editables del perfil del interesado.
export function UserSettingsPanel({ activeModule, user, member, application, form, emailPattern, onSubmit, onUpdateForm }) {
  return (
    <section className={`panel ${activeModule === "configuracion" ? "" : "module-hidden"}`} id="configuracion">
      <div className="section-title">
        <div>
          <span>Cuenta</span>
          <h2>Configuración de cuenta</h2>
        </div>
        <StatusBadge status={member?.status || application?.status} />
      </div>

      <form className="settings-form" onSubmit={onSubmit}>
        <div className="settings-grid">
          <label>
            DNI
            <input value={user?.dni || ""} disabled />
          </label>
          <label>
            Nombres completos
            <input value={form.full_name || ""} onChange={(event) => onUpdateForm("full_name", event.target.value)} required />
          </label>
          <label>
            Correo
            <input
              type="email"
              value={form.email || ""}
              onChange={(event) => onUpdateForm("email", event.target.value)}
              pattern={emailPattern}
              placeholder="usuario@correo.com"
              required
            />
          </label>
          <label>
            Teléfono
            <input value={form.phone || ""} onChange={(event) => onUpdateForm("phone", event.target.value)} />
          </label>
          <label>
            Profesión
            <input value={form.profession || ""} onChange={(event) => onUpdateForm("profession", event.target.value)} required />
          </label>
          <label className="wide">
            Dirección
            <input value={form.address || ""} onChange={(event) => onUpdateForm("address", event.target.value)} />
          </label>
        </div>
        <Button icon={Save}>Guardar configuración</Button>
      </form>
    </section>
  );
}
