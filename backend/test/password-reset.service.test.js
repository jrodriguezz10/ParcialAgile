const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const {
  clearResetCodes,
  requestAdminPasswordReset,
  resetAdminPassword,
} = require("../src/services/password-reset.service");

test("rechaza correos no registrados", async () => {
  clearResetCodes();
  await assert.rejects(
    () =>
      requestAdminPasswordReset({
        email: "nadie@cip.local",
        findAdminByEmail: async () => null,
        sendEmail: async () => {
          throw new Error("No debe enviar correo");
        },
      }),
    /correo no esta registrado/i,
  );
});

test("cambia la clave con codigo enviado por SMTP", async () => {
  clearResetCodes();
  let sentCode = "";
  const admin = {
    id: 10,
    name: "Cajero CIP",
    email: "cajero@cip.local",
    password_hash: await bcrypt.hash("ClaveAnterior1", 10),
  };

  await requestAdminPasswordReset({
    email: "cajero@cip.local",
    findAdminByEmail: async () => admin,
    sendEmail: async ({ code }) => {
      sentCode = code;
    },
    codeFactory: () => "123456",
  });

  assert.equal(sentCode, "123456");

  await resetAdminPassword({
    email: "cajero@cip.local",
    code: sentCode,
    password: "NuevaClave1",
    confirmPassword: "NuevaClave1",
    findAdminByEmail: async () => admin,
    updatePasswordHash: async (_admin, passwordHash) => {
      admin.password_hash = passwordHash;
    },
  });

  assert.equal(await bcrypt.compare("NuevaClave1", admin.password_hash), true);
  assert.equal(await bcrypt.compare("ClaveAnterior1", admin.password_hash), false);
});

test("no cambia la clave si la confirmacion no coincide", async () => {
  clearResetCodes();
  const admin = {
    id: 11,
    name: "Admin CIP",
    email: "admin@cip.local",
    password_hash: await bcrypt.hash("ClaveAnterior1", 10),
  };

  await requestAdminPasswordReset({
    email: admin.email,
    findAdminByEmail: async () => admin,
    sendEmail: async () => {},
    codeFactory: () => "654321",
  });

  await assert.rejects(
    () =>
      resetAdminPassword({
        email: admin.email,
        code: "654321",
        password: "NuevaClave1",
        confirmPassword: "OtraClave1",
        findAdminByEmail: async () => admin,
        updatePasswordHash: async (_admin, passwordHash) => {
          admin.password_hash = passwordHash;
        },
      }),
    /confirmacion/i,
  );

  assert.equal(await bcrypt.compare("ClaveAnterior1", admin.password_hash), true);
});
