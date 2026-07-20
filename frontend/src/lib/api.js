function defaultApiUrl() {
  if (typeof window === "undefined") return "http://localhost:8084";
  const { protocol, hostname } = window.location;
  const apiProtocol = protocol === "https:" ? "https:" : "http:";
  return `${apiProtocol}//${hostname}:8084`;
}

export const API_URL =
  import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || defaultApiUrl();

export function getUserToken() {
  return localStorage.getItem("cip_user_token");
}

export function getAdminToken() {
  return localStorage.getItem("cip_admin_token");
}

export function setUserToken(token) {
  localStorage.setItem("cip_user_token", token);
}

export function setAdminToken(token) {
  localStorage.setItem("cip_admin_token", token);
}

export function clearUserToken() {
  localStorage.removeItem("cip_user_token");
  clearUserApplicationDrafts();
}

export function clearAdminToken() {
  localStorage.removeItem("cip_admin_token");
}

export function clearUserApplicationDrafts() {
  try {
    localStorage.removeItem("cip_application_draft");
    Object.keys(localStorage)
      .filter((key) => key.startsWith("cip_application_draft:"))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // La limpieza local no debe bloquear el acceso al portal.
  }
}

export async function api(path, options = {}) {
  const { token, body, form, method, ...rest } = options;
  const headers = { ...(rest.headers || {}) };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !form) headers["Content-Type"] = "application/json";

  // 1. Limpieza de URLs: Evita errores si API_URL termina en "/" y path empieza con "/"
  const cleanBaseUrl = API_URL.endsWith("/") ? API_URL.slice(0, -1) : API_URL;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const finalUrl = `${cleanBaseUrl}${cleanPath}`;

  let response;
  try {
    response = await fetch(finalUrl, {
      ...rest,
      method: method || (body ? "POST" : "GET"), // Asigna POST automáticamente si hay body y no se especificó método
      headers,
      body: form ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new Error(`No se pudo conectar con la API en ${cleanBaseUrl}. Verifica que el backend este encendido y accesible desde esta red.`);
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    // Si la respuesta es un objeto JSON, intentamos extraer una propiedad .error o .message
    const message = typeof data === "string" ? data : data.message || data.error || "No se pudo completar la accion.";
    throw new Error(message);
  }

  return data;
}
