const jwt = require("jsonwebtoken");
const env = require("../config/env");
const asyncHandler = require("./asyncHandler");

function signToken(user, role) {
  return jwt.sign(
    {
      sub: user.id,
      role,
      name: user.full_name || user.name,
      email: user.email,
      dni: user.dni,
    },
    env.jwtSecret,
    { expiresIn: "12h" }
  );
}

function auth(role) {
  return asyncHandler(async (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ message: "Token requerido." });

    try {
      const payload = jwt.verify(token, env.jwtSecret);
      if (role && payload.role !== role) {
        return res.status(403).json({ message: "No autorizado." });
      }
      req.auth = payload;
      next();
    } catch (error) {
      return res.status(401).json({ message: "Sesion vencida o invalida." });
    }
  });
}

module.exports = {
  auth,
  signToken,
};
