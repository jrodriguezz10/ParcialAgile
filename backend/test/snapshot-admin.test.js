const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const snapshot = require("../src/services/snapshot.service");
const authController = require("../src/controllers/auth.controller");

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

test("login admin usa snapshot cuando la base no esta lista", async () => {
  const req = {
    dbReady: false,
    body: {
      email: "akiara893@gmail.com",
      password: "cajera123456",
    },
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await authController.loginAdmin(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.admin.email, "akiara893@gmail.com");
  assert.equal(res.body.admin.name, "Cajera La Libertad");
  assert.ok(res.body.token);
});
