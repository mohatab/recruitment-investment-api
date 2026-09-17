const User = require("./user.model");
const authService = require("../auth/auth.service");
const { NotFoundError, UnprocessableEntityError, CODES } = require("../../common/errors/AppError");
const { parsePagination, buildPagination } = require("../../common/utils/pagination");

const SORTABLE = ["createdAt", "lastName", "role"];

async function getById(id) {
  const user = await User.findById(id);
  if (!user) throw new NotFoundError("User not found");
  return user;
}

// What one user is allowed to see of another: a name and a role, not their
// phone/birthdate/nationality/location — that's private profile data, only
// the owner (getMe) or an admin (list) should see it in full.
const PUBLIC_PROFILE_FIELDS = "firstName lastName role createdAt";
async function getPublicProfile(id) {
  const user = await User.findById(id).select(PUBLIC_PROFILE_FIELDS);
  if (!user) throw new NotFoundError("User not found");
  return user;
}

async function updateProfile(userId, updates) {
  const user = await getById(userId);
  Object.assign(user, updates);
  await user.save();
  return user;
}

// Admin only (enforced by the route). Deactivation takes effect immediately:
// every session is revoked and open sockets are disconnected.
async function setStatus(targetId, adminId, isActive) {
  if (String(targetId) === String(adminId)) {
    throw new UnprocessableEntityError(
      "You cannot change the status of your own account",
      CODES.SELF_STATUS_CHANGE_NOT_ALLOWED
    );
  }
  const user = await User.findByIdAndUpdate(targetId, { isActive }, { new: true });
  if (!user) throw new NotFoundError("User not found");
  if (!isActive) await authService.revokeAllSessions(user._id, "deactivated");
  return user;
}

async function list(query) {
  const { page, limit, skip, sort } = parsePagination(query, { allowedSort: SORTABLE });
  const filter = {};
  if (query.role) filter.role = query.role;

  const [items, total] = await Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return { items, pagination: buildPagination({ page, limit, total }) };
}

module.exports = { getById, getPublicProfile, updateProfile, setStatus, list, SORTABLE };
