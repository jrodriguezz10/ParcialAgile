import { SolicitudLayout } from "../components/layout";
import { setUserToken } from "../lib/api";

// Consulta publica de solicitud: valida DNI y abre el portal del interesado.
export default function Solicitud({ onNavigate }) {
  function enterPortal(token) {
    setUserToken(token);
    onNavigate("portal", { replace: true });
  }

  return <SolicitudLayout onAuthenticated={enterPortal} />;
}
