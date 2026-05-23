import { useEffect } from "react";
import { AuthLayout, AuthPageLayout } from "../components/layout";
import { LoginAuth } from "../features/interesado/components/AuthForms";
import { clearUserToken } from "../lib/api";

// Entrada publica: inicio institucional y login administrativo.
export default function Inicio({ authView, onNavigate }) {
  useEffect(() => {
    clearUserToken();
  }, []);

  if (authView) {
    return <AuthAccess onNavigate={onNavigate} />;
  }

  return <AuthLayout />;
}

// Pantallas de acceso: centraliza textos de login y registro.
function AuthAccess({ onNavigate }) {
  return (
    <AuthPageLayout
      title="Ingreso administrativo"
      subtitle="Ingresa con tu correo y clave de administrador para revisar solicitudes, padrón y pagos."
    >
      <LoginAuth
        onNavigate={onNavigate}
        onUserAuthenticated={() => {}}
        onAdminAuthenticated={() => onNavigate("admin", { replace: true })}
      />
    </AuthPageLayout>
  );
}
