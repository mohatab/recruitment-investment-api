const { verifyAccessToken } = require("../../modules/auth/jwt");
const { UnauthorizedError, ForbiddenError } = require("../errors/AppError");

function authenticate(req, res, next) {
  const header = req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new UnauthorizedError("Authentication token not provided"));

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired authentication token"));
  }
}

// Optional auth: attaches req.user when a valid token is present, but never
// rejects the request — for endpoints that behave differently when logged in
// (e.g. showing an investor their own match score) without requiring it.
function optionalAuthenticate(req, res, next) {
  const header = req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    // ignore invalid token on optional routes
  }
  next();
}

// Role is only ever trusted from the verified JWT payload (set at login from
// the stored user document), never from the request body/query — this is
// what prevents a client from granting itself a different role.
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`This action requires one of these roles: ${roles.join(", ")}`));
    }
    next();
  };
}

module.exports = { authenticate, optionalAuthenticate, authorize };
