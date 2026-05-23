import { Lock } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, PasswordField } from "../../components/ui";
import { api } from "../../lib/api";

export function AdminAuth({ onAuthenticated }) {
  const [email, setEmail] = useState("admin@cip.local");
  const [password, setPassword] = useState("Admin12345");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await api("/api/admin/login", {
        method: "POST",
        body: { email, password },
      });
      onAuthenticated(data.token);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="section-title compact-title">
        <div>
          <span>Administrador</span>
          <h2>Panel del Colegio</h2>
        </div>
      </div>
      <label>
        Correo
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label>
        Clave
        <PasswordField
          visible={showPassword}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onToggle={() => setShowPassword((current) => !current)}
          required
        />
      </label>
      {message && <p className="notice">{message}</p>}
      <Button icon={Lock} disabled={loading}>
        {loading ? "Ingresando..." : "Ingresar"}
      </Button>
      <Link className="text-link" to="/">
        Ir al portal del interesado
      </Link>
    </form>
  );
}
