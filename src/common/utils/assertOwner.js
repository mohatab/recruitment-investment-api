const { ForbiddenError } = require("../errors/AppError");

// Resource-level authorization, called by services right after loading the
// resource. Authenticated but not the owner -> 403 (401 is reserved for a
// missing/invalid session). A missing owner never matches.
module.exports = function assertOwner(ownerId, userId, message = "You do not have permission to access this resource") {
  if (!ownerId || !userId || String(ownerId) !== String(userId)) throw new ForbiddenError(message);
};
