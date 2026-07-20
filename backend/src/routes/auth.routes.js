const express = require("express");
const controller = require("../controllers/auth.controller");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

// Accesos publicos: consulta DNI y login administrativo.
router.get("/dni/:dni", asyncHandler(controller.getDni));
router.post("/admin/login", asyncHandler(controller.loginAdmin));
router.post("/admin/password/forgot", asyncHandler(controller.requestAdminPasswordReset));
router.post("/admin/password/verify", asyncHandler(controller.verifyAdminResetCode));
router.post("/admin/password/reset", asyncHandler(controller.resetAdminPassword));

module.exports = router;
