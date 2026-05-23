const cors = require("cors");
const express = require("express");
const env = require("./config/env");
const errorHandler = require("./middleware/errorHandler");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const adminRoutes = require("./routes/admin.routes");
const paymentsRoutes = require("./routes/payments.routes");
const publicRoutes = require("./routes/public.routes");

// Express app: registra middlewares globales, archivos publicos y rutas API.
function createApp() {
  const app = express();

  // CORS: permite frontend local/configurado y bloquea origenes no permitidos.
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.corsOrigins.includes(origin) || isLocalNetworkOrigin(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use("/uploads", express.static(env.uploadRoot, { setHeaders: setStaticHeaders }));

  // Rutas API agrupadas por responsabilidad.
  app.use("/api", publicRoutes);
  app.use("/api", authRoutes);
  app.use("/api", userRoutes);
  app.use("/api", adminRoutes);
  app.use("/api", paymentsRoutes);

  app.use(errorHandler);
  return app;
}

function isLocalNetworkOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):\d+$/i.test(origin);
}

// Headers para que html2canvas pueda incluir fotos/documentos cargados.
function setStaticHeaders(res) {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

module.exports = createApp;
