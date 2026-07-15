import { ENGINEERING_CAREERS } from "../constants/catalogs";
export function CareerField({ value, onChange, disabled = false }) {
  const query = String(value || "").trim().toLowerCase();
  const matches = ENGINEERING_CAREERS.filter((career) => !query || career.toLowerCase().includes(query)).slice(0, 8);
  return <div className="career-search">
    <input value={value || ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} required
      placeholder="Escribe para buscar, ej. Ingenieria de Sis" autoComplete="off" />
    {!disabled && query && !ENGINEERING_CAREERS.includes(value) && <div className="career-options" role="listbox">
      {matches.map((career) => <button type="button" key={career} onClick={() => onChange(career)}>{career}</button>)}
      {!matches.length && <span>No se encontraron especialidades.</span>}
    </div>}
  </div>;
}
