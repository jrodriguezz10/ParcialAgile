import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Admin from "./pages/Admin";
import Inicio from "./pages/Inicio";
import PortalInteresado from "./pages/PortalInteresado";
import ResultadoPago from "./pages/ResultadoPago";
import Solicitud from "./pages/Solicitud";
import VerificarCarnet from "./pages/VerificarCarnet";

// Router principal: traduce rutas declaradas en main.jsx a paginas de la app.
export default function App({ page = "user" }) {
  const navigate = useNavigate();

  useEffect(() => {
    const titles = {
      user: "Colegio de Ingenieros del Peru | Colegiacion digital",
      solicitud: "Colegiatura | Colegio de Ingenieros",
      portal: "Portal del colegiado | Colegio de Ingenieros",
      login: "Acceso | Colegio de Ingenieros",
      admin: "Panel de atencion | Colegio de Ingenieros",
      verify: "Carnet virtual | Colegio de Ingenieros",
      checkout: "Resultado de pago | Colegio de Ingenieros",
    };
    document.title = titles[page] || titles.user;
  }, [page]);

  // Navegacion interna usada por botones sin acoplar componentes a rutas.
  const handleNavigate = useCallback((targetPage, options = {}) => {
    const paths = {
      user: "/",
      portal: "/interesado",
      solicitud: "/solicitud",
      login: "/ingresar",
      admin: "/admin",
      checkout: "/checkout/resultado",
    };
    navigate(paths[targetPage] || "/", options);
  }, [navigate]);

  // Seleccion de pagina por nombre logico.
  let content;
  if (page === "admin") {
    content = <Admin onNavigate={handleNavigate} />;
  } else if (page === "verify") {
    content = <VerificarCarnet onNavigate={handleNavigate} />;
  } else if (page === "checkout") {
    content = <ResultadoPago onNavigate={handleNavigate} />;
  } else if (page === "login") {
    content = <Inicio authView="login" onNavigate={handleNavigate} />;
  } else if (page === "solicitud") {
    content = <Solicitud onNavigate={handleNavigate} />;
  } else if (page === "portal") {
    content = <PortalInteresado onNavigate={handleNavigate} />;
  } else {
    content = <Inicio onNavigate={handleNavigate} />;
  }

  return content;
}
