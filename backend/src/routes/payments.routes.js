const express = require("express");
const controller = require("../controllers/payments.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { auth } = require("../middleware/auth");

const router = express.Router();

// Confirmaciones de Mercado Pago: retorno del navegador y webhook servidor.
router.post("/payments/mercadopago/return", auth("user"), asyncHandler(controller.confirmMercadoPagoReturn));
router.post("/payments/mercadopago/webhook", asyncHandler(controller.mercadoPagoWebhook));

module.exports = router;
