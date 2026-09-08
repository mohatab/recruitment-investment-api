const User = require("./user.model");
const { NotFoundError, UnauthorizedError } = require("../../common/errors/AppError");
const { parsePagination, buildMeta } = require("../../common/utils/pagination");

async function getById(id) {
  const user = await User.findById(id);
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

module.exports = { getById, updateProfile, changePassword, list };
