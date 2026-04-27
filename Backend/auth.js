const jwt = require("jsonwebtoken");

const jwtSecret = process.env.JWT_SECRET || "change-this-secret-in-production";

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role.name,
      campusId: user.campus.id,
    },
    jwtSecret,
    { expiresIn: "8h" }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    req.auth = jwt.verify(token, jwtSecret);
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.auth || !allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({ message: "You are not allowed to do this" });
    }

    next();
  };
}

module.exports = {
  createToken,
  requireAuth,
  requireRole,
};
