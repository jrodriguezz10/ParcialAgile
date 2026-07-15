const createApp = require("../src/app");
const { connectDatabase } = require("../src/config/database");
const env = require("../src/config/env");
const kv = require("../src/services/kv.service");
const pgStore = require("../src/services/postgres-store.service");

let app;
let ready;
let dbReady = false;

module.exports = async function handler(req, res) {
  if (!app) {
    app = createApp();
  }

  if (env.db.configured && !ready) {
    ready = connectDatabase().then(() => {
      dbReady = true;
    }).catch((error) => {
      dbReady = false;
      ready = null;
      console.error("No se pudo conectar la base de datos:", error.message);
    });
  }

  if (env.db.configured && ready) {
    await ready;
    if (dbReady) {
      req.dbReady = true;
      return app(req, res);
    }
  }

  if (kv.enabled()) {
    await kv.init();
    dbReady = false;
    req.dbReady = dbReady;
    return app(req, res);
  }

  if (pgStore.enabled()) {
    await pgStore.init();
    dbReady = false;
    req.dbReady = dbReady;
    return app(req, res);
  }

  if (!env.db.configured) {
    dbReady = false;
    req.dbReady = dbReady;
    return app(req, res);
  }

  try {
    req.dbReady = dbReady;
    return app(req, res);
  } catch (error) {
    console.error("No se pudo inicializar la API:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ message: "No se pudo inicializar la API." }));
  }
};
