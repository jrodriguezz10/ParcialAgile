const express = require("express");
const controller = require("../controllers/public.controller");
const asyncHandler = require("../middleware/asyncHandler");
const upload = require("../middleware/upload");

const router = express.Router();

// Rutas sin sesion: estado API y verificacion publica de carnet.
router.get("/health", asyncHandler(controller.health));
router.get("/public/verify/:code", asyncHandler(controller.verifyCard));
router.get("/public/applications/:id/files/:type", asyncHandler(controller.getApplicationFile));
router.get("/public/applications/dni/:dni/status", asyncHandler(controller.checkApplicationByDni));
router.post("/public/dni-access/:dni", asyncHandler(controller.accessByDni));
router.post("/public/dni-start/:dni", asyncHandler(controller.startByDni));
router.post(
  "/public/applications",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "degreePdf", maxCount: 1 },
    { name: "receipt", maxCount: 1 },
  ]),
  asyncHandler(controller.submitPublicApplication)
);

module.exports = router;
