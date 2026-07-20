const assert = require("node:assert/strict");
const test = require("node:test");
const { _inAdminBranch } = require("../src/controllers/admin/applications.controller");

test("solicitudes se filtran por sede exacta", () => {
  const limaAdmin = { admin: { role: "ADMIN_SEDE", branch: "Consejo Nacional - Lima" } };
  const libertadAdmin = { admin: { role: "ADMIN_SEDE", branch: "La Libertad" } };
  const libertadCashier = { admin: { role: "CAJERO", branch: "La Libertad" } };
  const superAdmin = { admin: { role: "SUPER_ADMIN", branch: "Consejo Nacional - Lima" } };
  const solicitudLibertad = { branch: "La Libertad" };

  assert.equal(_inAdminBranch(limaAdmin, solicitudLibertad), false);
  assert.equal(_inAdminBranch(libertadAdmin, solicitudLibertad), true);
  assert.equal(_inAdminBranch(libertadCashier, solicitudLibertad), true);
  assert.equal(_inAdminBranch(superAdmin, solicitudLibertad), true);
});
