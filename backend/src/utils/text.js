const crypto = require("crypto");
const env = require("../config/env");

function normalizeDni(dni) {
  return String(dni || "").replace(/\D/g, "").slice(0, 8);
}

function normalizePersonName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildFullName({ firstName, paternalLastName, maternalLastName }) {
  return [firstName, paternalLastName, maternalLastName].map(cleanName).filter(Boolean).join(" ");
}

function isValidPassword(password) {
  return password.length >= 6;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(email || "").trim());
}

function randomRegistrationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashRegistrationCode(code) {
  return crypto.createHash("sha256").update(`${env.jwtSecret}:${code}`).digest("hex");
}

module.exports = {
  normalizeDni,
  normalizePersonName,
  cleanName,
  buildFullName,
  isValidPassword,
  isValidEmail,
  randomRegistrationCode,
  hashRegistrationCode,
};
