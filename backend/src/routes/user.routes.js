const express = require("express");
const controller = require("../controllers/user.controller");
const payments = require("../controllers/payments.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { auth } = require("../middleware/auth");
const upload = require("../middleware/upload");

const router = express.Router();

// Perfil y configuracion del interesado autenticado.
router.get("/me", auth("user"), asyncHandler(controller.getMe));
router.put("/me/profile", auth("user"), asyncHandler(controller.updateProfile));

// Solicitud de colegiatura con carga de documentos.
router.get("/applications/dni/:dni/status", auth("user"), asyncHandler(controller.checkApplicationByDni));
router.post(
  "/applications",
  auth("user"),
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "degreePdf", maxCount: 1 },
    { name: "receipt", maxCount: 1 },
  ]),
  asyncHandler(controller.submitApplication)
);

// Mensualidades y checkout del interesado.
router.get("/me/payments", auth("user"), asyncHandler(payments.listUserPayments));
router.post("/me/payments/monthly", auth("user"), asyncHandler(payments.createMonthlyPayment));
router.post("/me/payments/full", auth("user"), asyncHandler(payments.createFullPayment));

module.exports = router;
