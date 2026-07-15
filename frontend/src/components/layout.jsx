import { Bell, LogOut, Search, Send } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BrandMark, Button, Metric, StatusBadge } from "./ui";
import cipHeroColegiate from "../assets/cip-hero-colegiate.jpg";
import cipHeroRedes from "../assets/cip-hero-redes.jpg";
import mercadoPagoLogo from "../assets/mercado-pago.svg";
import { useNotificationReads } from "../features/notifications/useNotificationReads";
import { api } from "../lib/api";

function onlyDniDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

export function AuthLayout() {
  return (
    <main className="public-site">
      <CipPublicHeader />
      <section className="auth-hero" style={{ "--hero-image": `url(${cipHeroColegiate})` }}>
        <div className="auth-hero-overlay">
          <div className="hero-copy">
            <span className="eyebrow">Colegiacion digital CIP</span>
            <h1>Inicia tu colegiatura profesional</h1>
            <p>Consulta con DNI, presenta tu solicitud y revisa tu carnet virtual.</p>
          </div>
        </div>
      </section>
      <section className="landing-panels">
        <article>
          <img src={cipHeroRedes} alt="Comunicaciones oficiales CIP" />
          <div>
            <span>Comunicacion</span>
            <h3>Consulta directa y seguimiento</h3>
            <p>Revisa observaciones, estado del tramite y habilitacion mensual.</p>
          </div>
        </article>
        <article>
          <img src={cipHeroColegiate} alt="Colegiacion CIP" />
          <div>
            <span>Colegiatura</span>
            <h3>Carnet virtual verificable</h3>
            <p>Numero de colegiatura y estado vigente desde el portal.</p>
          </div>
        </article>
        <article className="pay-panel">
          <img src={mercadoPagoLogo} alt="Mercado Pago" />
          <div>
            <span>Mensualidad</span>
            <h3>Pago mensual de S/ 20.00</h3>
            <p>Checkout con Mercado Pago y actualizacion automatica de habilitado o inhabilitado.</p>
          </div>
        </article>
      </section>
      <InstitutionalFooter />
    </main>
  );
}


export function SolicitudLayout({ onAuthenticated }) {
  const [dni, setDni] = useState("");
  const [checked, setChecked] = useState(null);
  const [message, setMessage] = useState("");

  const updateDniInput = (value) => {
    setDni(onlyDniDigits(value));
    setChecked(null);
    setMessage("");
  };

  async function consultDni(event) {
    event.preventDefault();
    setMessage("");
    setChecked(null);
    const normalized = onlyDniDigits(dni);
    setDni(normalized);
    if (normalized.length !== 8) {
      setMessage("Ingresa un DNI de 8 digitos.");
      return;
    }
    try {
      const data = await api(`/api/public/applications/dni/${normalized}/status`);
      setChecked(data);
      setMessage(
        data.has_application
          ? `Este DNI ya tiene una solicitud registrada con estado ${data.status}.`
          : "DNI validado. Puedes hacer una solicitud."
      );
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function accessProfile() {
    setMessage("");
    try {
      const data = await api(`/api/public/dni-access/${dni}`, { method: "POST" });
      onAuthenticated(data.token);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function startApplication() {
    setMessage("");
    try {
      const data = await api(`/api/public/dni-start/${dni}`, { method: "POST" });
      onAuthenticated(data.token);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="public-site">
      <CipPublicHeader />
      <section className="auth-page-section solicitud-page">
        <div className="auth-page-copy">
          <span className="eyebrow">Colegiacion digital CIP</span>
          <h1>Colegiatura</h1>
          <p>Consulta el estado con DNI. Si no existe una solicitud, abre el portal de colegiatura para completar tus datos y documentos.</p>
        </div>
        <section className="public-request-section solicitud-card" id="solicitud">
          <div className="section-title">
            <div>
              <span>Colegiatura</span>
              <h2>Consulta por DNI</h2>
            </div>
          </div>
          <form className="stack" onSubmit={consultDni}>
            <label>
              DNI del solicitante
              <div className="input-action">
                <input value={dni} onChange={(event) => updateDniInput(event.target.value)} inputMode="numeric" maxLength={8} required />
                <button type="submit" className="icon-btn" aria-label="Consultar solicitud">
                  <Search size={18} />
                </button>
              </div>
            </label>
          </form>
          {checked && (
            <div className={`dni-result ${checked.has_application ? "found" : "new"}`}>
              <div>
                <span>{checked.has_application ? "Solicitud encontrada" : "DNI disponible"}</span>
                <strong>{checked.full_name || checked.user?.full_name || `DNI ${checked.dni}`}</strong>
                <div className="dni-status-row">
                  <StatusBadge status={checked.has_application ? checked.status : "SIN_SOLICITUD"} />
                </div>
                <p>{message}</p>
              </div>
              {checked.has_application ? (
                <Button type="button" icon={Send} onClick={accessProfile}>
                  Acceder al perfil
                </Button>
              ) : (
                <Button type="button" icon={Send} onClick={startApplication}>
                  Hacer solicitud
                </Button>
              )}
            </div>
          )}
          {message && !checked && <p className="notice">{message}</p>}
        </section>
      </section>
      <InstitutionalFooter />
    </main>
  );
}

export function AuthPageLayout({ title, subtitle, children }) {
  return (
    <main className="public-site auth-page">
      <CipPublicHeader />
      <section className="auth-page-section">
        <div className="auth-page-copy">
          <span className="eyebrow">Colegiacion digital CIP</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <p className="demo-disclaimer">
            Proyecto academico de demostracion. No es un portal oficial del Colegio de Ingenieros del Peru y no debe usarse con credenciales institucionales reales.
          </p>
        </div>
        <section className="auth-card auth-page-card" id="auth-card">
          {children}
        </section>
      </section>
      <InstitutionalFooter />
    </main>
  );
}

export function CipPublicHeader() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const isColegiatura = pathname === "/solicitud" || pathname === "/registro" || pathname === "/interesado";

  return (
    <header className="cip-header">
      <div className="cip-topline">
        <div className="public-auth-actions">
          <Link to="/ingresar">Iniciar sesion</Link>
        </div>
      </div>
      <div className="cip-mainnav">
        <BrandMark compact />
        <nav>
          <Link className={isHome ? "active" : ""} to="/">Inicio</Link>
          <a href="#">Institucional</a>
          <a href="#">Consejos departamentales</a>
          <Link className={isColegiatura ? "active" : ""} to="/solicitud">Colegiatura</Link>
          <a href="#">Publicaciones</a>
          <a href="#contacto">Contactenos</a>
        </nav>
      </div>
    </header>
  );
}

export function InstitutionalFooter() {
  return (
    // Footer compartido: se muestra en publico, interesado y admin. Colores en styles/base.css.
    <footer className="site-footer" id="contacto">
      <div className="footer-main">
        <BrandMark />
        <div>
          <span>Contacto</span>
          <a href="mailto:colegiodeingenieros@correo.com">colegiodeingenieros@correo.com</a>
          <p>Atencion presencial y por correo institucional.</p>
        </div>
        <div>
          <span>Atencion</span>
          <p>Lunes a viernes · 09:00 a.m. a 06:00 p.m.</p>
          <p>Colegiacion, pagos mensuales y verificacion de carnet.</p>
        </div>
        <div>
          <span>Modulos</span>
          <p>Solicitud · Revision · Padron · Carnet virtual</p>
          <p>Mensualidad S/ 20.00 con Mercado Pago</p>
        </div>
      </div>
      <div className="footer-bottom">
        <span>Colegio de Ingenieros del Peru - Consejo Nacional</span>
        <span>Sistema de colegiacion digital</span>
      </div>
    </footer>
  );
}

export function DashboardShell({
  title,
  subtitle,
  label,
  navItems,
  activeKey,
  onSelect,
  summary,
  profile,
  notifications = [],
  notificationScope = "global",
  onLogout,
  children,
}) {
  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <BrandMark compact />
        <div className="sidebar-label">Modulos</div>
        <div className="sidebar-menu">
          {navItems.map(({ keyName, icon: Icon, label: itemLabel, text }) => (
            <button
              key={keyName}
              type="button"
              className={activeKey === keyName ? "active" : ""}
              onClick={() => onSelect(keyName)}
            >
              <Icon size={19} />
              <span>
                <b>{itemLabel}</b>
                <small>{text}</small>
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="sidebar-logout" onClick={onLogout}>
          <LogOut size={18} />
          <span>Cerrar sesion</span>
        </button>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <span className="eyebrow">{label}</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="dashboard-actions">
            <NotificationBell notifications={notifications} scope={notificationScope} />
            <div className="operator-card">{profile}</div>
          </div>
        </header>

        <section className="dashboard-summary">
          {summary.map((item) => (
            <Metric key={item.label} {...item} />
          ))}
        </section>

        <section className="dashboard-board">{children}</section>
        <InstitutionalFooter />
      </section>
    </main>
  );
}

function NotificationBell({ notifications, scope }) {
  const [open, setOpen] = useState(false);
  const total = notifications.length;
  const { unreadCount, markAllRead, markItemRead, isRead } = useNotificationReads(scope, notifications);

  return (
    <div className="notification-wrap">
      <button
        type="button"
        className={`notification-trigger ${unreadCount ? "has-items" : ""}`}
        onClick={() => {
          setOpen((current) => {
            const nextOpen = !current;
            if (nextOpen) markAllRead();
            return nextOpen;
          });
        }}
        aria-label="Ver notificaciones"
      >
        <Bell size={20} />
        {unreadCount > 0 && <span>{unreadCount}</span>}
      </button>
      {open && (
        <div className="notification-panel">
          <div className="notification-head">
            <strong>Notificaciones</strong>
            <small>{unreadCount ? `${unreadCount} sin revisar` : total ? "Todo revisado" : "Sin avisos"}</small>
          </div>
          {total ? (
            <div className="notification-list">
              {notifications.map((item) => (
                <button
                  key={item.id || item.title}
                  type="button"
                  className={`notification-item ${item.variant || ""} ${isRead(item) ? "reviewed" : ""}`}
                  onClick={() => {
                    markItemRead(item);
                    item.onClick?.();
                    setOpen(false);
                  }}
                >
                  <strong>{item.title}</strong>
                  {item.message && <span>{item.message}</span>}
                  {item.meta && <small>{item.meta}</small>}
                </button>
              ))}
            </div>
          ) : (
            <div className="notification-empty">No hay novedades por revisar.</div>
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar({ role, onLogout }) {
  return (
    <header className="topbar">
      <BrandMark compact />
      <nav>
        <Link to={role === "usuario" ? "/admin" : "/"}>{role === "usuario" ? "Administrador" : "Usuario"}</Link>
        <Button icon={LogOut} variant="ghost" onClick={onLogout}>
          Salir
        </Button>
      </nav>
    </header>
  );
}
