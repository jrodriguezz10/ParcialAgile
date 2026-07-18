const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const { Pool: PgPool } = require("pg");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PREFIX = process.env.KV_PREFIX || "cip:v2";
const BACKEND_ROOT = path.resolve(__dirname, "..");
const DEFAULT_PASSWORD = "Admin12345";

function envValue(name, fallback = "") {
  const value = process.env[name];
  if (value == null) return fallback;
  const cleaned = String(value).trim().replace(/^"(.*)"$/, "$1");
  return cleaned || fallback;
}

function tidbConfig() {
  const url = envValue("TIDB_DATABASE_URL");
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 4000),
      user: decodeURIComponent(parsed.username || ""),
      password: decodeURIComponent(parsed.password || ""),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "parcial_agile",
      ssl: { rejectUnauthorized: envValue("TIDB_SSL_REJECT_UNAUTHORIZED", "true") !== "false" },
    };
  }

  return {
    host: envValue("TIDB_HOST"),
    port: Number(envValue("TIDB_PORT", 4000)),
    user: envValue("TIDB_USER"),
    password: envValue("TIDB_PASSWORD"),
    database: envValue("TIDB_DATABASE", "parcial_agile"),
    ssl: { rejectUnauthorized: envValue("TIDB_SSL_REJECT_UNAUTHORIZED", "true") !== "false" },
  };
}

function requireTiDbConfig(config) {
  const missing = ["host", "user", "password", "database"].filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Faltan variables TiDB: ${missing.map((key) => `TIDB_${key.toUpperCase()}`).join(", ")}`);
  }
}

async function upstashCommand(args) {
  const url = envValue("UPSTASH_REDIS_REST_URL");
  const token = envValue("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) throw new Error("Faltan UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN para leer la base actual.");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || `Upstash fallo con ${args[0]}.`);
  return data.result;
}

function upstashEnabled() {
  return Boolean(envValue("UPSTASH_REDIS_REST_URL") && envValue("UPSTASH_REDIS_REST_TOKEN"));
}

function postgresUrl() {
  const value = envValue("POSTGRES_URL") || envValue("DATABASE_URL");
  return /^postgres(ql)?:\/\//i.test(value) ? value : "";
}

let pgPool;

function getPgPool() {
  if (!pgPool) {
    pgPool = new PgPool({
      connectionString: postgresUrl(),
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pgPool;
}

async function getJsonKey(key, fallback = null) {
  const value = await upstashCommand(["GET", key]);
  if (!value) return fallback;
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function getPgJsonKey(key, fallback = null) {
  const { rows } = await getPgPool().query("SELECT value FROM cip_store WHERE key = $1", [key]);
  return rows[0]?.value ?? fallback;
}

async function collection(name) {
  const rows = upstashEnabled()
    ? await getJsonKey(`${PREFIX}:${name}`, [])
    : await getPgJsonKey(name, []);
  return Array.isArray(rows) ? rows : [];
}

function mimeFromPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function localFileDataUrl(relativePath) {
  if (!relativePath || /^data:/i.test(relativePath) || /^https?:/i.test(relativePath)) return relativePath || null;
  const absolute = path.resolve(BACKEND_ROOT, relativePath);
  if (!absolute.startsWith(BACKEND_ROOT) || !fs.existsSync(absolute)) return relativePath;
  return `data:${mimeFromPath(absolute)};base64,${fs.readFileSync(absolute).toString("base64")}`;
}

async function resolveApplicationFile(applicationId, type, value) {
  if (!value) return null;
  if (/^kvfile:/i.test(value)) {
    const [, refId, refType] = String(value).split(":");
    if (!upstashEnabled()) return null;
    return getJsonKey(`${PREFIX}:file:${refId || applicationId}:${refType || type}`, null);
  }
  if (/^data:/i.test(value)) return value;
  return localFileDataUrl(value);
}

async function createSchema(pool) {
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dni VARCHAR(8) NULL UNIQUE,
    full_name VARCHAR(180) NOT NULL,
    first_name VARCHAR(90) NULL,
    paternal_last_name VARCHAR(90) NULL,
    maternal_last_name VARCHAR(90) NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    phone VARCHAR(30) NULL,
    address VARCHAR(255) NULL,
    profession VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    dni VARCHAR(8) NULL UNIQUE,
    email VARCHAR(180) NOT NULL UNIQUE,
    phone VARCHAR(30) NULL,
    role VARCHAR(80) NOT NULL DEFAULT 'Administrador',
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    photo_path LONGTEXT NULL,
    degree_pdf_path LONGTEXT NULL,
    receipt_path LONGTEXT NULL,
    observations TEXT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    reviewed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_applications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_applications_admin FOREIGN KEY (reviewed_by) REFERENCES admins(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    application_id INT NOT NULL UNIQUE,
    membership_number VARCHAR(30) NOT NULL UNIQUE,
    enrollment_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'INHABILITADO',
    status_override VARCHAR(20) NULL,
    status_reason TEXT NULL,
    verification_code VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_members_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    user_id INT NOT NULL,
    period_month CHAR(7) NOT NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 20.00,
    payment_type VARCHAR(20) NOT NULL DEFAULT 'MENSUALIDAD',
    method VARCHAR(30) NOT NULL DEFAULT 'MERCADO_PAGO',
    method_detail TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    paid_at TIMESTAMP NULL,
    external_reference VARCHAR(120) NULL UNIQUE,
    mp_preference_id VARCHAR(120) NULL,
    mp_payment_id VARCHAR(120) NULL,
    receipt_path LONGTEXT NULL,
    created_by_admin INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_member_period_type (member_id, period_month, payment_type),
    KEY idx_payments_user (user_id),
    CONSTRAINT fk_payments_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_payments_admin FOREIGN KEY (created_by_admin) REFERENCES admins(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_batches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    user_id INT NOT NULL,
    periods_json TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    external_reference VARCHAR(120) NOT NULL UNIQUE,
    mp_preference_id VARCHAR(120) NULL,
    mp_payment_id VARCHAR(120) NULL,
    paid_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_payment_batches_member (member_id),
    CONSTRAINT fk_payment_batches_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_batches_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query("ALTER TABLE applications MODIFY COLUMN photo_path LONGTEXT NULL");
  await pool.query("ALTER TABLE applications MODIFY COLUMN degree_pdf_path LONGTEXT NULL");
  await pool.query("ALTER TABLE applications MODIFY COLUMN receipt_path LONGTEXT NULL");
  await pool.query("ALTER TABLE payments MODIFY COLUMN receipt_path LONGTEXT NULL");
  try {
    await pool.query("ALTER TABLE payments ADD COLUMN method_detail TEXT NULL AFTER method");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }
}

function sqlDateTime(value) {
  if (!value) return null;
  return String(value).replace("T", " ").replace(/\.\d+Z$/, "").slice(0, 19);
}

function sqlDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function main() {
  if (!upstashEnabled() && !postgresUrl()) {
    throw new Error("No encontre fuente de datos: configura Upstash o POSTGRES_URL/DATABASE_URL actual.");
  }

  const config = tidbConfig();
  requireTiDbConfig(config);

  const { database, ...connectionConfig } = config;
  const admin = await mysql.createConnection({ ...connectionConfig, multipleStatements: false });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();

  const pool = mysql.createPool({ ...connectionConfig, database, waitForConnections: true, connectionLimit: 5, dateStrings: true });
  await createSchema(pool);

  const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const [admins, users, applications, members, payments, batches] = await Promise.all([
    collection("admins"),
    collection("users"),
    collection("applications"),
    collection("members"),
    collection("payments"),
    collection("payment_batches"),
  ]);

  for (const adminRow of admins) {
    await pool.query(
      `INSERT INTO admins (id, name, dni, email, phone, role, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), dni = VALUES(dni), phone = VALUES(phone),
         role = VALUES(role), password_hash = VALUES(password_hash), updated_at = VALUES(updated_at)`,
      [
        adminRow.id,
        adminRow.name || "Administrador CIP",
        adminRow.dni || null,
        String(adminRow.email || "").toLowerCase(),
        adminRow.phone || null,
        adminRow.role || "Administrador",
        adminRow.password_hash || defaultHash,
        sqlDateTime(adminRow.created_at) || new Date(),
        sqlDateTime(adminRow.updated_at) || sqlDateTime(adminRow.created_at) || new Date(),
      ]
    );
  }

  for (const user of users) {
    const dni = user.dni || null;
    const email = String(user.email || "").trim().toLowerCase() || `${dni || user.id}@pendiente.cip.local`;
    await pool.query(
      `INSERT INTO users
         (id, dni, full_name, first_name, paternal_last_name, maternal_last_name, email, phone, address, profession, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE dni = VALUES(dni), full_name = VALUES(full_name), first_name = VALUES(first_name),
         paternal_last_name = VALUES(paternal_last_name), maternal_last_name = VALUES(maternal_last_name),
         email = VALUES(email), phone = VALUES(phone), address = VALUES(address), profession = VALUES(profession),
         password_hash = VALUES(password_hash), updated_at = VALUES(updated_at)`,
      [
        user.id,
        dni,
        user.full_name || (dni ? `DNI ${dni}` : `Usuario ${user.id}`),
        user.first_name || null,
        user.paternal_last_name || null,
        user.maternal_last_name || null,
        email,
        user.phone || null,
        user.address || null,
        user.profession || "",
        user.password_hash || defaultHash,
        sqlDateTime(user.created_at) || new Date(),
        sqlDateTime(user.updated_at) || sqlDateTime(user.created_at) || new Date(),
      ]
    );
  }

  for (const application of applications) {
    if (!application.user_id) continue;
    await pool.query(
      `INSERT INTO applications
         (id, user_id, status, photo_path, degree_pdf_path, receipt_path, observations, submitted_at, reviewed_at, reviewed_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), status = VALUES(status), photo_path = VALUES(photo_path),
         degree_pdf_path = VALUES(degree_pdf_path), receipt_path = VALUES(receipt_path), observations = VALUES(observations),
         submitted_at = VALUES(submitted_at), reviewed_at = VALUES(reviewed_at), reviewed_by = VALUES(reviewed_by),
         updated_at = VALUES(updated_at)`,
      [
        application.id,
        application.user_id,
        application.status || "PENDIENTE",
        await resolveApplicationFile(application.id, "photo", application.photo_path),
        await resolveApplicationFile(application.id, "degree", application.degree_pdf_path),
        await resolveApplicationFile(application.id, "receipt", application.receipt_path),
        application.observations || null,
        sqlDateTime(application.submitted_at) || sqlDateTime(application.created_at) || new Date(),
        sqlDateTime(application.reviewed_at),
        application.reviewed_by || null,
        sqlDateTime(application.created_at) || new Date(),
        sqlDateTime(application.updated_at) || sqlDateTime(application.created_at) || new Date(),
      ]
    );
  }

  for (const member of members) {
    if (!member.user_id || !member.application_id) continue;
    await pool.query(
      `INSERT INTO members
         (id, user_id, application_id, membership_number, enrollment_date, status, status_override, status_reason, verification_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), application_id = VALUES(application_id),
         membership_number = VALUES(membership_number), enrollment_date = VALUES(enrollment_date), status = VALUES(status),
         status_override = VALUES(status_override), status_reason = VALUES(status_reason), verification_code = VALUES(verification_code),
         updated_at = VALUES(updated_at)`,
      [
        member.id,
        member.user_id,
        member.application_id,
        member.membership_number || `CIP-${new Date().getFullYear()}-${String(member.id).padStart(5, "0")}`,
        sqlDate(member.enrollment_date),
        member.status || "HABILITADO",
        member.status_override || null,
        member.status_reason || null,
        member.verification_code || `migrado-${member.id}`,
        sqlDateTime(member.created_at) || new Date(),
        sqlDateTime(member.updated_at) || sqlDateTime(member.created_at) || new Date(),
      ]
    );
  }

  for (const payment of payments) {
    if (!payment.member_id || !payment.user_id || !payment.period_month) continue;
    await pool.query(
      `INSERT INTO payments
         (id, member_id, user_id, period_month, amount, payment_type, method, method_detail, status, paid_at, external_reference,
          mp_preference_id, mp_payment_id, receipt_path, created_by_admin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount), payment_type = VALUES(payment_type), method = VALUES(method),
         method_detail = VALUES(method_detail),
         status = VALUES(status), paid_at = VALUES(paid_at), external_reference = VALUES(external_reference),
         mp_preference_id = VALUES(mp_preference_id), mp_payment_id = VALUES(mp_payment_id), receipt_path = VALUES(receipt_path),
         created_by_admin = VALUES(created_by_admin), updated_at = VALUES(updated_at)`,
      [
        payment.id,
        payment.member_id,
        payment.user_id,
        payment.period_month,
        payment.amount || 20,
        payment.payment_type || "MENSUALIDAD",
        payment.method || "MERCADO_PAGO",
        payment.method_detail || null,
        payment.status || "PENDIENTE",
        sqlDateTime(payment.paid_at),
        payment.external_reference || null,
        payment.mp_preference_id || null,
        payment.mp_payment_id || null,
        localFileDataUrl(payment.receipt_path),
        payment.created_by_admin || null,
        sqlDateTime(payment.created_at) || new Date(),
        sqlDateTime(payment.updated_at) || sqlDateTime(payment.created_at) || new Date(),
      ]
    );
  }

  for (const batch of batches) {
    if (!batch.member_id || !batch.user_id || !batch.external_reference) continue;
    await pool.query(
      `INSERT INTO payment_batches
         (id, member_id, user_id, periods_json, amount, status, external_reference, mp_preference_id, mp_payment_id, paid_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE periods_json = VALUES(periods_json), amount = VALUES(amount), status = VALUES(status),
         mp_preference_id = VALUES(mp_preference_id), mp_payment_id = VALUES(mp_payment_id), paid_at = VALUES(paid_at),
         updated_at = VALUES(updated_at)`,
      [
        batch.id,
        batch.member_id,
        batch.user_id,
        typeof batch.periods_json === "string" ? batch.periods_json : JSON.stringify(batch.periods_json || []),
        batch.amount || 0,
        batch.status || "PENDIENTE",
        batch.external_reference,
        batch.mp_preference_id || null,
        batch.mp_payment_id || null,
        sqlDateTime(batch.paid_at),
        sqlDateTime(batch.created_at) || new Date(),
        sqlDateTime(batch.updated_at) || sqlDateTime(batch.created_at) || new Date(),
      ]
    );
  }

  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
  await pool.end();
  if (pgPool) await pgPool.end();
  console.log(`Migracion terminada en TiDB: ${users.length} usuarios, ${applications.length} solicitudes, ${members.length} colegiados, ${payments.length} pagos.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
