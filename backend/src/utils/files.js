const path = require("path");
const env = require("../config/env");

function originFromReq(req) {
  const requestOrigin = `${req.protocol}://${req.get("host")}`;
  if (!env.publicBackendUrl) return requestOrigin;

  try {
    const configuredUrl = new URL(env.publicBackendUrl);
    const requestHost = req.get("host") || "";
    const configuredIsLocalhost = configuredUrl.hostname === "localhost" || configuredUrl.hostname === "127.0.0.1";
    const requestIsLocalhost = /^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/i.test(requestHost);

    if (configuredIsLocalhost && !requestIsLocalhost) {
      return requestOrigin;
    }
  } catch {
    return requestOrigin;
  }

  return env.publicBackendUrl;
}

function frontendUrl(req) {
  if (req?.headers?.origin) {
    try {
      const configuredUrl = new URL(env.frontendUrl);
      const requestOrigin = new URL(req.headers.origin);
      const configuredIsLocalhost = configuredUrl.hostname === "localhost" || configuredUrl.hostname === "127.0.0.1";
      const requestIsLocalNetwork =
        requestOrigin.hostname === "localhost" ||
        requestOrigin.hostname === "127.0.0.1" ||
        /^192\.168\.\d{1,3}\.\d{1,3}$|^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$|^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/i.test(requestOrigin.hostname);

      if (configuredIsLocalhost && requestIsLocalNetwork) {
        return req.headers.origin;
      }
    } catch {
      return env.frontendUrl;
    }
  }

  return env.frontendUrl;
}

function storedPath(file) {
  if (!file) return null;
  return path.relative(env.backendRoot, file.path).replace(/\\/g, "/");
}

function fileUrl(req, relativePath) {
  if (!relativePath) return null;
  return `${originFromReq(req)}/${relativePath.replace(/\\/g, "/")}`;
}

module.exports = {
  originFromReq,
  frontendUrl,
  storedPath,
  fileUrl,
};
