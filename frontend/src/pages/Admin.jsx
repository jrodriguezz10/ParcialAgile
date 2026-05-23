import { useState } from "react";
import { AuthPageLayout } from "../components/layout";
import { AdminAuth } from "../features/admin/AdminAuth";
import { AdminDashboard } from "../features/admin/AdminDashboard";
import { clearAdminToken, getAdminToken, setAdminToken } from "../lib/api";

// Entrada del administrador: solo decide si mostrar login o dashboard.
export default function Admin() {
  const [token, setToken] = useState(getAdminToken());

  if (!token) {
    return (
      <AuthPageLayout
        title="Ingreso administrador"
        subtitle="Accede con el correo y clave del administrador para revisar solicitudes y pagos."
      >
        <AdminAuth
          onAuthenticated={(newToken) => {
            setAdminToken(newToken);
            setToken(newToken);
          }}
        />
      </AuthPageLayout>
    );
  }

  return (
    <AdminDashboard
      token={token}
      onLogout={() => {
        clearAdminToken();
        setToken(null);
      }}
    />
  );
}
