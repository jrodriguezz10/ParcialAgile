import { ENGINEERING_CAREERS, isValidEngineeringCareer } from "../constants/catalogs";

export function CareerField({ value, onChange, disabled = false }) {
  const query = String(value || "").trim().toLowerCase();
  const matches = ENGINEERING_CAREERS.filter((career) => !query || career.toLowerCase().includes(query)).slice(0, 8);
  const invalid = Boolean(value) && !isValidEngineeringCareer(value);

  return <div className="career-search">
    <input
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      onInvalid={(event) => event.currentTarget.setCustomValidity("Selecciona una profesion valida de la lista.")}
      onInput={(event) => event.currentTarget.setCustomValidity("")}
      disabled={disabled}
      required
      aria-invalid={invalid}
      className={invalid ? "invalid-field" : ""}
      placeholder="Escribe para buscar, ej. Ingenieria de Sis" autoComplete="off" />
    {!disabled && query && !ENGINEERING_CAREERS.includes(value) && <div className="career-options" role="listbox">
      {matches.map((career) => <button type="button" key={career} onClick={() => onChange(career)}>{career}</button>)}
      {!matches.length && <span>No se encontraron especialidades.</span>}
    </div>}
  </div>;
}
