import { SolicitudLayout } from "../components/layout";
import { clearUserApplicationDrafts, clearUserToken, setUserToken } from "../lib/api";

// Consulta publica de solicitud: valida DNI y abre el portal del interesado.
export default function Solicitud({ onNavigate }) {
  function enterPortal(token) {
    clearUserToken();
    clearUserApplicationDrafts();
    setUserToken(token);
    onNavigate("portal", { replace: true });
  }

  return <SolicitudLayout onAuthenticated={enterPortal} />;
}
