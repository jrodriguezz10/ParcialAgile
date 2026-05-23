-- Ejecutar con un usuario administrador de MySQL antes de iniciar el backend.
-- Ajusta usuario, clave o nombre de base de datos si cambias backend/.env.
-- El backend tambien ejecuta migraciones al iniciar y crea/actualiza el admin:
--   Usuario/correo: admin@cip.local
--   Clave: Admin12345

CREATE DATABASE IF NOT EXISTS parcial_agile
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'admin_sistema'@'localhost'
  IDENTIFIED BY '123456';

GRANT ALL PRIVILEGES ON parcial_agile.* TO 'admin_sistema'@'localhost';
FLUSH PRIVILEGES;

USE parcial_agile;

CREATE TABLE IF NOT EXISTS users (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS registration_verifications (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  dni VARCHAR(8) NULL UNIQUE,
  email VARCHAR(180) NOT NULL UNIQUE,
  phone VARCHAR(30) NULL,
  role VARCHAR(80) NOT NULL DEFAULT 'Administrador',
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  photo_path VARCHAR(255) NULL,
  degree_pdf_path VARCHAR(255) NULL,
  receipt_path VARCHAR(255) NULL,
  observations TEXT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  reviewed_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_applications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_applications_admin FOREIGN KEY (reviewed_by) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS members (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_id INT NOT NULL,
  user_id INT NOT NULL,
  period_month CHAR(7) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 20.00,
  payment_type VARCHAR(20) NOT NULL DEFAULT 'MENSUALIDAD',
  method VARCHAR(30) NOT NULL DEFAULT 'MERCADO_PAGO',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  paid_at TIMESTAMP NULL,
  external_reference VARCHAR(120) NULL UNIQUE,
  mp_preference_id VARCHAR(120) NULL,
  mp_payment_id VARCHAR(120) NULL,
  receipt_path VARCHAR(255) NULL,
  created_by_admin INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_member_period_type (member_id, period_month, payment_type),
  KEY idx_payments_user (user_id),
  CONSTRAINT fk_payments_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_admin FOREIGN KEY (created_by_admin) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_batches (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
