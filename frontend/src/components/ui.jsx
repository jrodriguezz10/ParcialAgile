import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { APP_STATUS, MEMBER_STATUS } from "../constants/status";
import cipLogo from "../assets/cip-logo.png";
import { initials } from "../utils/format";

export function BrandMark({ compact = false }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <img className="brand-seal" src={cipLogo} alt="Logo del Colegio de Ingenieros del Peru" />
      <div>
        <strong>Colegio de Ingenieros del Peru</strong>
        {!compact && <small>Consejo Nacional | Colegiacion digital</small>}
      </div>
    </div>
  );
}

export function Button({ children, icon: Icon, variant = "primary", ...props }) {
  return (
    <button className={`btn btn-${variant}`} {...props}>
      {Icon && <Icon size={17} />}
      <span>{children}</span>
    </button>
  );
}

export function StatusBadge({ status }) {
  if (!status) return <span className="badge muted">Sin estado</span>;
  const normalized = String(status).toUpperCase();
  return (
    <span className={`badge ${normalized.toLowerCase()}`}>
      {APP_STATUS[normalized] || MEMBER_STATUS[normalized] || status}
    </span>
  );
}

export function Metric({ icon: Icon, label, value }) {
  return (
    <article className="metric">
      <Icon size={22} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

export function FileInput({ icon: Icon, label, accept, existing, disabled = false, onChange }) {
  const [filename, setFilename] = useState("");
  return (
    <label className="file-input">
      <Icon size={20} />
      <strong>{label}</strong>
      <span>{filename || (existing ? "Archivo cargado" : "Seleccionar archivo")}</span>
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          setFilename(file?.name || "");
          onChange(file);
        }}
      />
      {existing && (
        <a href={existing} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
          Ver actual
        </a>
      )}
    </label>
  );
}

export function PasswordField({ visible, onToggle, ...props }) {
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="password-field">
      <input type={visible ? "text" : "password"} {...props} />
      <button type="button" onClick={onToggle} aria-label={visible ? "Ocultar contraseña" : "Ver contraseña"}>
        <Icon size={18} />
      </button>
    </div>
  );
}

export function DataTable({ columns, rows, empty }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="empty-cell">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ProfileCard({ name, subtitle, detail, image, badges = [], compact = false }) {
  return (
    <div className={`profile-card ${compact ? "profile-card-compact" : ""}`} aria-label={compact ? `${name}. ${subtitle}` : undefined}>
      <div className="profile-avatar">
        {image ? <img src={image} alt="" /> : <span>{initials(name)}</span>}
      </div>
      {!compact && (
        <div className="profile-copy">
          <strong>{name}</strong>
          <span>{subtitle}</span>
          {detail && <small>{detail}</small>}
          {!!badges.length && (
            <div className="operator-status">
              {badges.map((badge) => (
                <StatusBadge key={badge} status={badge} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
