const Experience = require("./experience.model");
const { NotFoundError, ForbiddenError } = require("../../common/errors/AppError");

async function create(userId, data) {
  return Experience.create({ ...data, user: userId });
}

async function listMine(userId) {
  return Experience.find({ user: userId }).sort({ startDate: -1 });
}

async function remove(id, userId) {
  const experience = await Experience.findById(id);
  if (!experience) throw new NotFoundError("Experience not found");
  if (String(experience.user) !== String(userId))
    throw new ForbiddenError("You can only manage your own experience entries");
  await experience.deleteOne();
}

module.exports = { create, listMine, remove };
