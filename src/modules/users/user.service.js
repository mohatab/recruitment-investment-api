const User = require("./user.model");
const { NotFoundError, UnauthorizedError } = require("../../common/errors/AppError");
const { parsePagination, buildMeta } = require("../../common/utils/pagination");

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

async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select("+password");
  if (!user) throw new NotFoundError("User not found");
  if (!(await user.comparePassword(currentPassword))) {
    throw new UnauthorizedError("Current password is incorrect");
  }
  user.password = newPassword;
  await user.save();
}

async function list(query) {
  const { page, limit, skip, sort } = parsePagination(query);
  const filter = {};
  if (query.role) filter.role = query.role;

  const [items, total] = await Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return { items, meta: buildMeta({ page, limit, total }) };
}

module.exports = { getById, getPublicProfile, updateProfile, changePassword, list };
