const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const snapshot = require("../src/services/snapshot.service");

test("credenciales snapshot de admin y cajeros son validas", async () => {
  const cases = [
    ["admin@cip.local", "Admin12345", "Administrador"],
    ["cajero1@cip.local", "Cajero12345", "CAJERO"],
    ["akiara893@gmail.com", "cajera123456", "CAJERO"],
  ];

  for (const [email, password, role] of cases) {
    const admin = snapshot.findAdminByEmail(email);
    assert.ok(admin, `Debe existir ${email}`);
    assert.equal(admin.role, role);
    assert.equal(await bcrypt.compare(password, admin.password_hash), true, `Clave valida para ${email}`);
  }
});

