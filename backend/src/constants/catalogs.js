const ENGINEERING_CAREERS = [
  "Ingenieria de Sistemas",
  "Ingenieria Civil",
  "Ingenieria Industrial",
  "Ingenieria Mecanica",
  "Ingenieria Electrica",
  "Ingenieria Electronica",
  "Ingenieria Ambiental",
  "Ingenieria Quimica",
  "Ingenieria Agronomica",
  "Ingenieria de Minas",
  "Ingenieria Geologica",
  "Ingenieria de Telecomunicaciones",
  "Ingenieria Mecatronica",
  "Ingenieria Sanitaria",
  "Ingenieria de Software",
  "Ingenieria Informatica",
  "Ingenieria de Computacion y Sistemas",
  "Ingenieria Electronica y de Telecomunicaciones",
  "Ingenieria Industrial y de Sistemas",
  "Ingenieria Mecanico Electrica",
  "Ingenieria de Tecnologias de la Informacion y Sistemas",
  "Ingenieria Agronomica y Zootecnia",
  "Ingenieria Pesquera",
  "Ingenieria Forestal",
  "Ingenieria Biomedica",
];

function normalizeCatalogValue(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEngineeringCareer(value) {
  const normalized = normalizeCatalogValue(value);
  return ENGINEERING_CAREERS.some((career) => normalizeCatalogValue(career) === normalized);
}

module.exports = {
  ENGINEERING_CAREERS,
  isValidEngineeringCareer,
};
