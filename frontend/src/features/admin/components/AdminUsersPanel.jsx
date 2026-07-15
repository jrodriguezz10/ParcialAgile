import { RefreshCw, Search, X } from "lucide-react";
import { useState } from "react";
import { Button, DataTable, StatusBadge } from "../../../components/ui";
import { formatDate } from "../../../utils/format";

// Modulo Usuarios: consulta privada de cuentas registradas.
export function AdminUsersPanel({ activeModule, users, onSearch, onRefresh }) {
  const [query, setQuery] = useState("");

  function submitSearch(event) {
    event.preventDefault();
    onSearch(query);
  }

  function clearSearch() {
    setQuery("");
    onSearch("");
  }

  return (
    <section className={`panel ${activeModule === "usuarios" ? "" : "module-hidden"}`} id="admin-usuarios">
      <div className="section-title">
        <div>
          <span>Usuarios</span>
          <h2>Cuentas registradas</h2>
        </div>
      </div>

      <form className="member-toolbar" onSubmit={submitSearch}>
        <label className="member-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Consultar por nombre, DNI, correo o CIP"
            autoComplete="off"
          />
          {query && (
            <button type="button" onClick={clearSearch} aria-label="Limpiar busqueda">
              <X size={16} />
            </button>
          )}
        </label>
        <Button icon={Search}>Consultar</Button>
        <Button type="button" icon={RefreshCw} variant="ghost" onClick={onRefresh}>
          Actualizar
        </Button>
      </form>

      <DataTable
        columns={["Usuario", "Contacto", "Solicitud", "Colegiatura", "Registro"]}
        rows={users.map((user) => [
          <span className="table-person" key={user.id}>
            <b>{user.full_name}</b>
            <small>DNI {user.dni || "sin DNI"}</small>
          </span>,
          <span className="table-person" key={`contact-${user.id}`}>
            <b>{user.email}</b>
            <small>{user.phone || "Sin telefono"}</small>
          </span>,
          user.application_status ? <StatusBadge status={user.application_status} /> : "Sin solicitud",
          user.membership_number ? (
            <span className="table-person" key={`member-${user.id}`}>
              <b>{user.membership_number}</b>
              <small>{user.member_status || "Sin estado"}</small>
            </span>
          ) : (
            "No colegiado"
          ),
          formatDate(user.created_at),
        ])}
        empty="No se encontraron usuarios."
      />
    </section>
  );
}
