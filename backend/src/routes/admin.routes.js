const express = require("express");
const controller = require("../controllers/admin.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { auth } = require("../middleware/auth");
const upload = require("../middleware/upload");

const router = express.Router();

// Cuenta administrador.
router.get("/admin/me", auth("admin"), asyncHandler(controller.getMe));
router.put("/admin/profile", auth("admin"), asyncHandler(controller.updateProfile));
router.get("/admin/admins", auth("admin"), asyncHandler(controller.listAdmins));
router.post("/admin/admins", auth("admin"), asyncHandler(controller.createAdmin));

// Registro directo de colegiados.
router.post(
  "/admin/manual-members",
  auth("admin"),
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "degreePdf", maxCount: 1 },
    { name: "receipt", maxCount: 1 },
  ]),
  asyncHandler(controller.createManualMember)
);

// Revision documentaria de solicitudes.
router.get("/admin/applications", auth("admin"), asyncHandler(controller.listApplications));
router.get("/admin/applications/:id", auth("admin"), asyncHandler(controller.getApplication));
router.post("/admin/applications/:id/approve", auth("admin"), asyncHandler(controller.approveApplication));
router.post("/admin/applications/:id/observe", auth("admin"), asyncHandler(controller.observeApplication));
router.post("/admin/applications/:id/reject", auth("admin"), asyncHandler(controller.rejectApplication));

// Padron, estados y pagos manuales.
router.get("/admin/members", auth("admin"), asyncHandler(controller.listMembers));
router.patch("/admin/members/:id/status", auth("admin"), asyncHandler(controller.updateMemberStatus));
router.get("/admin/members/:id/payments", auth("admin"), asyncHandler(controller.listMemberPayments));
router.post("/admin/members/:id/payments", auth("admin"), asyncHandler(controller.createMemberPayment));

module.exports = router;
