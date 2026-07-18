const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const backendRoot = path.resolve(__dirname, "../..");
const uploadRoot = process.env.VERCEL ? path.join("/tmp", "uploads") : path.join(backendRoot, "uploads");
const applicationUploadDir = path.join(uploadRoot, "applications");

const corsOrigins = (process.env.CORS_ORIGIN || "https://colegioingenierosdelperu.online,https://www.colegioingenierosdelperu.online,https://frontend-theta-rosy-97.vercel.app,http://localhost:3001,http://localhost:3002,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function envValue(name, fallback = "") {
  const value = process.env[name];
  if (value == null) return fallback;
  const cleaned = String(value).trim().replace(/^"(.*)"$/, "$1");
  return cleaned || fallback;
}

module.exports = {
  port: Number(process.env.PORT || 8084),
  backendRoot,
  uploadRoot,
  applicationUploadDir,
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  collegeEmail: process.env.COLLEGE_EMAIL || "colegiodeingenieros@correo.com",
  registrationCodeTtlMinutes: Number(process.env.REGISTRATION_CODE_TTL_MINUTES || 15),
  corsOrigins,
  frontendUrl: process.env.FRONTEND_URL || corsOrigins[0] || "http://localhost:3001",
  publicBackendUrl: process.env.PUBLIC_BACKEND_URL || "",
  reniecBaseUrl: process.env.RENIEC_BASE_URL || "",
  reniecToken: process.env.RENIEC_TOKEN || "",
  reniecRequired: process.env.RENIEC_REQUIRED === "true",
  db: {
    configured: Boolean(
      envValue("DATABASE_URL") ||
        (envValue("DB_HOST") && envValue("DB_USER") && envValue("DB_NAME"))
    ),
    url: envValue("DATABASE_URL"),
    host: envValue("DB_HOST", "localhost"),
    port: Number(envValue("DB_PORT", 3306)),
    user: envValue("DB_USER", "root"),
    password: envValue("DB_PASSWORD"),
    database: envValue("DB_NAME", "parcial_agile"),
    ssl: process.env.DB_SSL === "true",
    sslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
  },
  admin: {
    email: process.env.ADMIN_EMAIL || "admin@cip.local",
    password: process.env.ADMIN_PASSWORD || "Admin12345",
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Colegio de Ingenieros <no-reply@localhost>",
  },
  mercadoPagoAccessToken: process.env.MP_ACCESS_TOKEN || "",
  cronSecret: envValue("CRON_SECRET"),
  upstash: {
    url: envValue("UPSTASH_REDIS_REST_URL"),
    token: envValue("UPSTASH_REDIS_REST_TOKEN"),
  },
};
