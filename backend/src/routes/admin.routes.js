const express = require("express");
const controller = require("../controllers/admin.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { auth } = require("../middleware/auth");
const upload = require("../middleware/upload");
const adminRole = require("../middleware/adminRole");

const router = express.Router();

// Cuenta administrador.
router.get("/admin/me", auth("admin"), asyncHandler(controller.getMe));
router.put("/admin/profile", auth("admin"), asyncHandler(controller.updateProfile));
router.get("/admin/admins", auth("admin"), adminRole("ADMIN_SEDE"), asyncHandler(controller.listAdmins));
router.post("/admin/admins", auth("admin"), adminRole("ADMIN_SEDE"), asyncHandler(controller.createAdmin));
router.get("/admin/users", auth("admin"), asyncHandler(controller.listUsers));

// Registro directo de colegiados.
router.post(
  "/admin/manual-members",
  auth("admin"),
  adminRole("ADMIN_SEDE"),
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "degreePdf", maxCount: 1 },
    { name: "receipt", maxCount: 1 },
  ]),
  asyncHandler(controller.createManualMember)
);

// Revision documentaria de solicitudes.
router.get("/admin/applications", auth("admin"), adminRole("ADMIN_SEDE"), asyncHandler(controller.listApplications));
router.get("/admin/applications/:id", auth("admin"), adminRole("ADMIN_SEDE"), asyncHandler(controller.getApplication));
router.post(
  "/admin/applications/:id/files/import",
  auth("admin"),
  adminRole("ADMIN_SEDE"),
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "degreePdf", maxCount: 1 },
    { name: "receipt", maxCount: 1 },
  ]),
  asyncHandler(controller.importApplicationFiles)
);
router.post("/admin/applications/:id/approve", auth("admin"), adminRole("ADMIN_SEDE"), asyncHandler(controller.approveApplication));
router.post("/admin/applications/:id/observe", auth("admin"), adminRole("ADMIN_SEDE"), asyncHandler(controller.observeApplication));
router.post("/admin/applications/:id/reject", auth("admin"), adminRole("ADMIN_SEDE"), asyncHandler(controller.rejectApplication));

// Padron, estados y pagos manuales.
router.get("/admin/members", auth("admin"), adminRole("ADMIN_SEDE", "CAJERO"), asyncHandler(controller.listMembers));
router.patch("/admin/members/:id/status", auth("admin"), asyncHandler(controller.updateMemberStatus));
router.get("/admin/members/:id/payments", auth("admin"), adminRole("ADMIN_SEDE", "CAJERO"), asyncHandler(controller.listMemberPayments));
router.post("/admin/members/:id/payments", auth("admin"), adminRole("ADMIN_SEDE", "CAJERO"), asyncHandler(controller.createMemberPayment));
router.post("/admin/members/:id/notify-email", auth("admin"), adminRole("ADMIN_SEDE", "CAJERO"), asyncHandler(controller.notifyMemberEmail));

module.exports = router;
