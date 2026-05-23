const env = require("../config/env");
const { buildFullName, normalizePersonName } = require("../utils/text");

function pick(data, keys) {
  for (const key of keys) {
    if (data?.[key]) return String(data[key]).trim();
  }
  return "";
}

function unwrapDniPayload(data) {
  return data?.data || data?.result || data?.persona || data?.person || data;
}

function buildDniUrl(dni) {
  if (env.reniecBaseUrl.includes("{dni}")) {
    return env.reniecBaseUrl.replace("{dni}", encodeURIComponent(dni));
  }
  return `${env.reniecBaseUrl}${encodeURIComponent(dni)}`;
}

function parseReniecResponse(dni, data) {
  const payload = unwrapDniPayload(data);
  const firstName = pick(payload, ["nombres", "first_name", "firstName", "nombre", "names"]);
  const paternalLastName = pick(payload, [
    "apellido_paterno",
    "apellidoPaterno",
    "ap_paterno",
    "ape_paterno",
    "paternal_last_name",
    "last_name_paternal",
  ]);
  const maternalLastName = pick(payload, [
    "apellido_materno",
    "apellidoMaterno",
    "ap_materno",
    "ape_materno",
    "maternal_last_name",
    "last_name_maternal",
  ]);
  const explicitFullName = pick(payload, ["nombre_completo", "full_name", "fullName", "nombreCompleto"]);
  const fullName =
    explicitFullName ||
    buildFullName({
      firstName,
      paternalLastName,
      maternalLastName,
    });

  if (!fullName) {
    const error = new Error("La respuesta de la API no contiene nombres completos.");
    error.statusCode = 502;
    throw error;
  }

  return {
    dni,
    first_name: firstName,
    paternal_last_name: paternalLastName,
    maternal_last_name: maternalLastName,
    full_name: fullName,
    raw: data,
  };
}

async function consultDniApi(dni) {
  if (!env.reniecBaseUrl || !env.reniecToken) {
    const error = new Error("API de RENIEC no configurada.");
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(buildDniUrl(dni), {
    headers: {
      Authorization: `Bearer ${env.reniecToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const error = new Error("No se pudo consultar el DNI en RENIEC.");
    error.statusCode = response.status;
    throw error;
  }

  return parseReniecResponse(dni, await response.json());
}

function compareRegistrationIdentity(input, reniec) {
  const inputFirst = normalizePersonName(input.firstName);
  const inputPaternal = normalizePersonName(input.paternalLastName);
  const inputMaternal = normalizePersonName(input.maternalLastName);
  const reniecFirst = normalizePersonName(reniec.first_name);
  const reniecPaternal = normalizePersonName(reniec.paternal_last_name);
  const reniecMaternal = normalizePersonName(reniec.maternal_last_name);

  if (reniecFirst && reniecPaternal && reniecMaternal) {
    return inputFirst === reniecFirst && inputPaternal === reniecPaternal && inputMaternal === reniecMaternal;
  }

  const inputFullName = normalizePersonName(
    buildFullName({
      firstName: input.firstName,
      paternalLastName: input.paternalLastName,
      maternalLastName: input.maternalLastName,
    })
  );
  const inputLastNameFirst = normalizePersonName(
    [input.paternalLastName, input.maternalLastName, input.firstName].filter(Boolean).join(" ")
  );
  const expectedFirstOrder = normalizePersonName(reniec.full_name);
  const expectedLastOrder = normalizePersonName(
    [reniec.paternal_last_name, reniec.maternal_last_name, reniec.first_name].filter(Boolean).join(" ")
  );

  return (
    inputFullName === expectedFirstOrder ||
    inputFullName === expectedLastOrder ||
    inputLastNameFirst === expectedFirstOrder ||
    inputLastNameFirst === expectedLastOrder
  );
}

module.exports = {
  consultDniApi,
  compareRegistrationIdentity,
};
