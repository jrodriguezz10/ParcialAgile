// Controlador admin agregado: mantiene las rutas actuales y delega por modulo.
module.exports = {
  ...require("./admin/profile.controller"),
  ...require("./admin/users.controller"),
  ...require("./admin/applications.controller"),
  ...require("./admin/members.controller"),
};
