const createApp = require("../src/app");
const { connectDatabase } = require("../src/config/database");

let app;
let ready;
let dbReady = false;

module.exports = async function handler(req, res) {
  if (!app) {
    app = createApp();
  }

  if (!ready) {
    ready = connectDatabase().then(() => {
      dbReady = true;
    }).catch((error) => {
      dbReady = false;
      ready = null;
      console.error("No se pudo conectar la base de datos:", error.message);
    });
  }

  try {
    await ready;
    req.dbReady = dbReady;
    return app(req, res);
  } catch (error) {
    console.error("No se pudo inicializar la API:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ message: "No se pudo inicializar la API." }));
  }
};
