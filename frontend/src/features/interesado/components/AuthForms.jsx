import { Lock } from "lucide-react";
import { useState } from "react";
import { Button, PasswordField } from "../../../components/ui";
import { api, setAdminToken } from "../../../lib/api";

const emailPattern = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(email || "").trim());
}

// Login administrador desde la pantalla publica.
export function LoginAuth({ onAdminAuthenticated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        setMessage("Ingresa un correo valido.");
        return;
      }

      const data = await api("/api/admin/login", {
        method: "POST",
        body: { email: normalizedEmail, password },
      });
      setAdminToken(data.token);
      onAdminAuthenticated(data.token);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <h2 className="auth-form-title" style={{ textAlign: "center" }}>Iniciar sesión</h2>

      <label>
        Correo
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          pattern={emailPattern}
          placeholder="usuario@correo.com"
          required
        />
      </label>

      <label>
        Clave
        <PasswordField
          value={password}
          visible={showPassword}
          onToggle={() => setShowPassword((current) => !current)}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>

      {message && <p className="notice">{message}</p>}
      <Button icon={Lock} disabled={loading}>
        {loading ? "Ingresando..." : "Ingresar"}
      </Button>

    </form>
  );
}
