const multer = require("multer");

function errorHandler(error, req, res, next) {
  if (error instanceof multer.MulterError || error.message?.startsWith("Formato invalido")) {
    return res.status(422).json({ message: error.message });
  }

  if (
    error.code === "ECONNREFUSED" ||
    error.code === "ETIMEDOUT" ||
    /Base de datos no inicializada|connect ECONNREFUSED|Access denied/i.test(error.message || "")
  ) {
    console.error(error);
    return res.status(503).json({
      message:
        "No se pudo conectar con la base de datos. Configura una base MySQL accesible desde Vercel para usar el panel admin y guardar solicitudes reales.",
    });
  }

  const status = error.statusCode || 500;
  console.error(error);
  res.status(status).json({
    message: status === 500 ? "Error interno del servidor." : error.message,
  });
}

module.exports = errorHandler;
