import { UserRound } from "lucide-react";
import { useState } from "react";
import cipLogo from "../assets/cip-logo.png";
import { formatDate } from "../utils/format";

function CardPhoto({ src }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <UserRound size={38} aria-label="Sin foto del colegiado" />;
  }

  return <img src={src} crossOrigin="anonymous" alt="Foto del colegiado" onError={() => setFailed(true)} />;
}

export function memberCardCode(member) {
  const digits = String(member?.membership_number || "").replace(/\D/g, "");
  return digits.slice(-8).padStart(8, "0");
}

export function VirtualCard({ cardRef, user, application, member }) {
  const enabled = member.status === "HABILITADO";
  const photoUrl = application?.photo_url || member?.photo_url || user?.photo_url;
  const code = memberCardCode(member);

  return (
    <div className="card-frame">
      <article className={`virtual-card ${enabled ? "is-enabled" : "is-disabled"}`} ref={cardRef}>
        <img className="card-watermark-mark" src={cipLogo} alt="" />
        {!enabled && <div className="disabled-watermark">INHABILITADO</div>}
        <header>
          <img className="mini-seal" src={cipLogo} alt="" />
          <div>
            <strong>COLEGIO DE INGENIEROS DEL PERU</strong>
            <span>Consejo Nacional - Carnet virtual</span>
          </div>
        </header>
        <div className="card-content">
          <div className="photo-box">
            <CardPhoto src={photoUrl} />
          </div>
          <div className="card-data">
            <strong>{user.full_name}</strong>
            <small>{user.profession}</small>
            <div className="card-grid">
              <p>
                <span>DNI</span>
                <b>{user.dni}</b>
              </p>
              <p>
                <span>Fecha de inscripcion</span>
                <b>{formatDate(member.enrollment_date)}</b>
              </p>
              <p>
                <span>Estado</span>
                <b>{enabled ? "HABILITADO" : "INHABILITADO"}</b>
              </p>
            </div>
          </div>
        </div>
        <footer>
          <span>{code}</span>
          <b>{enabled ? "HABILITADO" : "INHABILITADO"}</b>
        </footer>
      </article>
    </div>
  );
}
