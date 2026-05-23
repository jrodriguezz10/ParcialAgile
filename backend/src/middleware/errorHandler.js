const multer = require("multer");

function errorHandler(error, req, res, next) {
  if (error instanceof multer.MulterError || error.message?.startsWith("Formato invalido")) {
    return res.status(422).json({ message: error.message });
  }

  const status = error.statusCode || 500;
  console.error(error);
  res.status(status).json({
    message: status === 500 ? "Error interno del servidor." : error.message,
  });
}

module.exports = errorHandler;
