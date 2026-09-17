const { authenticateAccessToken } = require("../../modules/auth/auth.service");
const { AppError, UnauthorizedError, ForbiddenError } = require("../errors/AppError");

async function authenticate(req, res, next) {
  const header = req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new UnauthorizedError("Authentication token not provided"));

  let user;
  try {
    user = await authenticateAccessToken(token);
  } catch (err) {
    return next(err);
  }
  req.user = user;
  next();
}

// req.user.role comes from the stored user document (loaded by authenticate),
// never from the request body/query or the JWT's role claim, so a client
// cannot grant itself a role. Named, with `roles` attached, so the policy of
// every route can be introspected (see test/routes.js).
function authorize(...roles) {
  function authorizeRoles(req, res, next) {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`This action requires one of these roles: ${roles.join(", ")}`));
    }
    next();
  }
  authorizeRoles.roles = roles;
  return authorizeRoles;
}

// For actions that create records other people rely on (job postings) or move
// money (investments). Must run after authenticate.
function requireVerifiedEmail(req, res, next) {
  if (req.user?.emailVerified) return next();
  next(new AppError("Verify your email address before performing this action", 403, "EMAIL_NOT_VERIFIED"));
}

module.exports = { authenticate, authorize, requireVerifiedEmail };
