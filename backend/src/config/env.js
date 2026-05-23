const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const backendRoot = path.resolve(__dirname, "../..");
const uploadRoot = path.join(backendRoot, "uploads");
const applicationUploadDir = path.join(uploadRoot, "applications");

const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:3001,http://localhost:3002,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

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
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "parcial_agile",
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
};
