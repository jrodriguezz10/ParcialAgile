import { KeyRound, Lock, Mail } from "lucide-react";
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

  async function requestReset(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        setMessage("Ingresa un correo valido.");
        return;
      }
      const data = await api("/api/admin/password/forgot", {
        method: "POST",
        body: { email: normalizedEmail },
      });
      setMode("verify");
      setMessage(data.message || "Codigo enviado al correo registrado.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyResetCode(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await api("/api/admin/password/verify", {
        method: "POST",
        body: {
          email: email.trim().toLowerCase(),
          code: resetCode,
        },
      });
      setMode("reset");
      setMessage(data.message || "Codigo validado. Ingresa tu nueva clave.");
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
          email: email.trim().toLowerCase(),
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
        <h2 className="auth-form-title" style={{ textAlign: "center" }}>Recuperar clave</h2>

        <label>
          Correo registrado
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            pattern={emailPattern}
            placeholder="usuario@correo.com"
            autoComplete="username"
            required
          />
        </label>

        {message && <p className="notice">{message}</p>}
        <Button icon={Mail} disabled={loading}>
          {loading ? "Enviando..." : "Enviar codigo"}
        </Button>
        <button type="button" className="link-button login-reset-link" onClick={() => setMode("login")}>
          Volver a ingresar
        </button>
      </form>
    );
  }

  if (mode === "verify") {
    return (
      <form className="stack" onSubmit={verifyResetCode}>
        <h2 className="auth-form-title" style={{ textAlign: "center" }}>Validar codigo</h2>

        <label>
          Correo registrado
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        </label>
        <label>
          Codigo
          <input value={resetCode} onChange={(event) => setResetCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" required />
        </label>
        {message && <p className="notice">{message}</p>}
        <Button icon={KeyRound} disabled={loading || resetCode.length !== 6}>
          {loading ? "Validando..." : "Validar codigo"}
        </Button>
        <button type="button" className="link-button login-reset-link" onClick={() => setMode("forgot")}>
          Enviar otro codigo
        </button>
      </form>
    );
  }

  if (mode === "reset") {
    return (
      <form className="stack" onSubmit={resetPassword}>
        <h2 className="auth-form-title" style={{ textAlign: "center" }}>Nueva clave</h2>

        <label>
          Correo registrado
          <input type="email" value={email} readOnly autoComplete="username" required />
        </label>
        <label>
          Codigo validado
          <input value={resetCode} readOnly inputMode="numeric" required />
        </label>
        <label>
          Nueva clave
          <PasswordField
            value={newPassword}
            visible={showNewPassword}
            onToggle={() => setShowNewPassword((current) => !current)}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirmar nueva clave
          <PasswordField
            value={confirmPassword}
            visible={showConfirmPassword}
            onToggle={() => setShowConfirmPassword((current) => !current)}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        {message && <p className="notice">{message}</p>}
        <Button icon={KeyRound} disabled={loading}>
          {loading ? "Actualizando..." : "Cambiar clave"}
        </Button>
        <button type="button" className="link-button login-reset-link" onClick={() => setMode("forgot")}>
          Enviar otro codigo
        </button>
      </form>
    );
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
          autoComplete="username"
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
          autoComplete="current-password"
          required
        />
      </label>

      {message && <p className="notice">{message}</p>}
      <Button icon={Lock} disabled={loading}>
        {loading ? "Ingresando..." : "Ingresar"}
      </Button>
      <button type="button" className="link-button login-reset-link" onClick={() => setMode("forgot")}>
        Olvidaste tu contrasena?
      </button>

    </form>
  );
}
