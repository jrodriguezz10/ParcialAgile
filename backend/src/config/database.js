const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const env = require("./env");

let pool;

function getPool() {
  if (!pool) throw new Error("Base de datos no inicializada.");
  return pool;
}

async function connectDatabase() {
  const { config, database } = buildMysqlConfig();

  try {
    const adminConnection = await mysql.createConnection(config);
    await adminConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await adminConnection.end();
  } catch (error) {
    console.warn("No se pudo crear la base de datos automaticamente:", error.message);
  }

  pool = mysql.createPool({
    ...config,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
  });

  await migrate();
  await seedAdmin();
}

function buildMysqlConfig() {
  const base = env.db.url ? parseDatabaseUrl(env.db.url) : {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  };

  const { database, ...connectionConfig } = base;
  const config = {
    ...connectionConfig,
    multipleStatements: false,
  };

  if (env.db.ssl || shouldUseSsl(base.host, env.db.url)) {
    config.ssl = { rejectUnauthorized: env.db.sslRejectUnauthorized };
  }

  return {
    config,
    database: database || env.db.database,
  };
}

function parseDatabaseUrl(value) {
  const url = new URL(value);
  const params = url.searchParams;
  const sslMode = params.get("ssl") || params.get("sslmode");

  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    ssl: sslMode && sslMode !== "false" ? { rejectUnauthorized: env.db.sslRejectUnauthorized } : undefined,
  };
}

function shouldUseSsl(host, databaseUrl) {
  if (!databaseUrl || !host) return false;
  return !/^(localhost|127\.0\.0\.1|::1)$/i.test(host);
}

async function migrate() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS registration_verifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dni VARCHAR(8) NULL UNIQUE,
      full_name VARCHAR(180) NOT NULL,
      first_name VARCHAR(90) NULL,
      paternal_last_name VARCHAR(90) NULL,
      maternal_last_name VARCHAR(90) NULL,
      email VARCHAR(180) NOT NULL UNIQUE,
      phone VARCHAR(30) NULL,
      address VARCHAR(255) NULL,
      profession VARCHAR(120) NULL,
      password_hash VARCHAR(255) NOT NULL,
      code_hash VARCHAR(64) NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      verified_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      dni VARCHAR(8) NULL UNIQUE,
      email VARCHAR(180) NOT NULL UNIQUE,
      phone VARCHAR(30) NULL,
      role VARCHAR(80) NOT NULL DEFAULT 'Administrador',
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS applications (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      application_id INT NOT NULL UNIQUE,
      membership_number VARCHAR(30) NOT NULL UNIQUE,
      enrollment_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'INHABILITADO',
      verification_code VARCHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_members_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      member_id INT NOT NULL,
      user_id INT NOT NULL,
      period_month CHAR(7) NOT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 2.00,
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS payment_batches (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const statement of statements) {
    await pool.query(statement);
  }

  await ensureColumn("users", "first_name", "VARCHAR(90) NULL AFTER full_name");
  await ensureColumn("users", "paternal_last_name", "VARCHAR(90) NULL AFTER first_name");
  await ensureColumn("users", "maternal_last_name", "VARCHAR(90) NULL AFTER paternal_last_name");
  await pool.query("ALTER TABLE users MODIFY COLUMN dni VARCHAR(8) NULL");
  await pool.query("ALTER TABLE registration_verifications MODIFY COLUMN dni VARCHAR(8) NULL");
  await pool.query("ALTER TABLE registration_verifications MODIFY COLUMN first_name VARCHAR(90) NULL");
  await pool.query("ALTER TABLE registration_verifications MODIFY COLUMN paternal_last_name VARCHAR(90) NULL");
  await pool.query("ALTER TABLE registration_verifications MODIFY COLUMN maternal_last_name VARCHAR(90) NULL");
  await pool.query("ALTER TABLE registration_verifications MODIFY COLUMN phone VARCHAR(30) NULL");
  await pool.query("ALTER TABLE registration_verifications MODIFY COLUMN profession VARCHAR(120) NULL");
  await ensureColumn("registration_verifications", "first_name", "VARCHAR(90) NULL AFTER full_name");
  await ensureColumn("registration_verifications", "paternal_last_name", "VARCHAR(90) NULL AFTER first_name");
  await ensureColumn("registration_verifications", "maternal_last_name", "VARCHAR(90) NULL AFTER paternal_last_name");
  await ensureColumn("members", "status_override", "VARCHAR(20) NULL AFTER status");
  await ensureColumn("members", "status_reason", "TEXT NULL AFTER status_override");
  await pool.query("ALTER TABLE applications MODIFY COLUMN photo_path LONGTEXT NULL");
  await pool.query("ALTER TABLE applications MODIFY COLUMN degree_pdf_path LONGTEXT NULL");
  await pool.query("ALTER TABLE applications MODIFY COLUMN receipt_path LONGTEXT NULL");
  await pool.query("ALTER TABLE payments MODIFY COLUMN receipt_path LONGTEXT NULL");
  await ensureColumn(
    "admins",
    "updated_at",
    "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at"
  );
  await ensureColumn("admins", "dni", "VARCHAR(8) NULL UNIQUE AFTER name");
  await ensureColumn("admins", "phone", "VARCHAR(30) NULL AFTER email");
  await ensureColumn("admins", "role", "VARCHAR(80) NOT NULL DEFAULT 'Administrador' AFTER phone");
  await ensureColumn("admins", "branch", "VARCHAR(120) NOT NULL DEFAULT 'Consejo Nacional - Lima' AFTER role");
  await ensureColumn("admins", "disabled_at", "DATETIME NULL AFTER branch");
  await ensureColumn("users", "branch", "VARCHAR(120) NOT NULL DEFAULT 'Consejo Nacional - Lima' AFTER profession");
  await ensureColumn("payments", "payment_type", "VARCHAR(20) NOT NULL DEFAULT 'MENSUALIDAD' AFTER amount");
  await ensureColumn("payments", "method_detail", "TEXT NULL AFTER method");
  await pool.query(
    `UPDATE payments
     SET payment_type = 'INSCRIPCION'
     WHERE method IN ('RECIBO_INSCRIPCION', 'REGISTRO_ADMIN')`
  );
  await pool.query(
    `UPDATE payments p
     LEFT JOIN payments c
       ON c.id <> p.id
      AND c.member_id = p.member_id
      AND c.period_month = p.period_month
      AND c.payment_type = 'INSCRIPCION'
     SET p.payment_type = 'INSCRIPCION'
     WHERE p.method = 'MERCADO_PAGO'
       AND p.created_by_admin IS NOT NULL
       AND c.id IS NULL`
  );
  await ensurePaymentTypeIndex();
}

async function ensurePaymentTypeIndex() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND INDEX_NAME = 'uk_member_period_type'`
  );
  if (Number(row.total) > 0) return;

  try {
    await pool.query("ALTER TABLE payments DROP INDEX uk_member_period");
  } catch {
    // Older databases may already have a different index definition.
  }
  await pool.query(
    "ALTER TABLE payments ADD UNIQUE KEY uk_member_period_type (member_id, period_month, payment_type)"
  );
}

async function ensureColumn(tableName, columnName, definition) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  if (Number(row.total) === 0) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

async function seedAdmin() {
  const hash = await bcrypt.hash(env.admin.password, 10);
  await pool.query(
    `INSERT INTO admins (name, email, password_hash)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)`,
    ["Administrador CIP", env.admin.email, hash]
  );

  if (env.admin.email !== "admin@cip.local" || env.admin.password !== "Admin12345") {
    const defaultHash = await bcrypt.hash("Admin12345", 10);
    await pool.query(
      `INSERT INTO admins (name, email, password_hash)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      ["Administrador CIP", "admin@cip.local", defaultHash]
    );
  }
}

module.exports = {
  connectDatabase,
  getPool,
};
