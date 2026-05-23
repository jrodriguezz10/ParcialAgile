const express = require("express");
const controller = require("../controllers/auth.controller");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

// Accesos publicos: consulta DNI y login administrativo.
router.get("/dni/:dni", asyncHandler(controller.getDni));
router.post("/admin/login", asyncHandler(controller.loginAdmin));

module.exports = router;
