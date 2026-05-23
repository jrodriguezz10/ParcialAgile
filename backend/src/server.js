const createApp = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./config/database");
const { refreshAllMemberStatuses } = require("./services/members.service");

// Arranque backend: conecta BD, refresca estados y levanta Express.
connectDatabase()
  .then(() => {
    // Mantiene habilitado/inhabilitado actualizado aunque no haya actividad.
    refreshAllMemberStatuses().catch((error) => {
      console.warn("No se pudo refrescar estados de colegiados:", error.message);
    });
    setInterval(() => {
      refreshAllMemberStatuses().catch((error) => {
        console.warn("No se pudo refrescar estados de colegiados:", error.message);
      });
    }, 60 * 60 * 1000).unref();

    createApp().listen(env.port, () => {
      console.log(`API de colegiacion escuchando en http://localhost:${env.port}`);
    });
  })
  .catch((error) => {
    console.error("No se pudo iniciar el backend:", error);
    process.exit(1);
  });
