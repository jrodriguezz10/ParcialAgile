import { useEffect, useState } from "react";
import { AuthPageLayout } from "../components/layout";
import { UserDashboard } from "../features/interesado/UserDashboard";
import { clearUserToken, getUserToken } from "../lib/api";

// Portal del interesado: perfil, solicitud, carnet y pagos tras consulta por DNI.
export default function PortalInteresado({ onNavigate }) {
  const [token, setToken] = useState(() => getUserToken());

  useEffect(() => {
    if (!token) onNavigate("solicitud", { replace: true });
  }, [token, onNavigate]);

  if (!token) {
    return (
      <AuthPageLayout title="Solicitud" subtitle="Consulta tu DNI para ingresar al portal del interesado.">
        <p className="notice">Redirigiendo a consulta de solicitud...</p>
      </AuthPageLayout>
    );
  }

  return (
    <UserDashboard
      token={token}
      onLogout={() => {
        clearUserToken();
        setToken(null);
        onNavigate("solicitud", { replace: true });
      }}
    />
  );
}
