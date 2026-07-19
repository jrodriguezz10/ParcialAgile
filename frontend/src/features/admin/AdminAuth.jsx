import { KeyRound, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, PasswordField } from "../../components/ui";
import { api } from "../../lib/api";

export function AdminAuth({ onAuthenticated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [mode, setMode] = useState("login");

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

  async function requestReset(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await api("/api/admin/password/forgot", {
        method: "POST",
        body: { email },
      });
      setMode("reset");
      setMessage(data.message || "Codigo enviado al correo registrado.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await api("/api/admin/password/reset", {
        method: "POST",
        body: {
          email,
          code: resetCode,
          password: newPassword,
          confirm_password: confirmPassword,
        },
      });
      setPassword("");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
      setMode("login");
      setMessage(data.message || "Clave actualizada. Ya puedes iniciar sesion.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  if (mode === "forgot") {
    return (
      <form className="stack" onSubmit={requestReset}>
        <div className="section-title compact-title">
          <div>
            <span>Recuperacion</span>
            <h2>Restablecer clave</h2>
          </div>
        </div>
        <label>
          Correo registrado
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        </label>
        {message && <p className="notice">{message}</p>}
        <Button icon={Mail} disabled={loading}>
          {loading ? "Enviando..." : "Enviar codigo"}
        </Button>
        <button type="button" className="link-button" onClick={() => setMode("login")}>
          Volver al inicio de sesion
        </button>
      </form>
    );
  }

  if (mode === "reset") {
    return (
      <form className="stack" onSubmit={resetPassword}>
        <div className="section-title compact-title">
          <div>
            <span>Verificacion</span>
            <h2>Nueva clave</h2>
          </div>
        </div>
        <label>
          Correo registrado
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        </label>
        <label>
          Codigo recibido
          <input value={resetCode} onChange={(event) => setResetCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" required />
        </label>
        <label>
          Nueva clave
          <PasswordField
            visible={showNewPassword}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            onToggle={() => setShowNewPassword((current) => !current)}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirmar nueva clave
          <PasswordField
            visible={showConfirmPassword}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            onToggle={() => setShowConfirmPassword((current) => !current)}
            autoComplete="new-password"
            required
          />
        </label>
        {message && <p className="notice">{message}</p>}
        <Button icon={KeyRound} disabled={loading}>
          {loading ? "Actualizando..." : "Cambiar clave"}
        </Button>
        <button type="button" className="link-button" onClick={() => setMode("forgot")}>
          Enviar otro codigo
        </button>
      </form>
    );
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
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
      </label>
      <label>
        Clave
        <PasswordField
          visible={showPassword}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onToggle={() => setShowPassword((current) => !current)}
          autoComplete="current-password"
          required
        />
      </label>
      {message && <p className="notice">{message}</p>}
      <Button icon={Lock} disabled={loading}>
        {loading ? "Ingresando..." : "Ingresar"}
      </Button>
      <button type="button" className="link-button" onClick={() => setMode("forgot")}>
        Olvidaste tu contrasena?
      </button>
      <Link className="text-link" to="/">
        Ir al portal de colegiatura
      </Link>
    </form>
  );
}
