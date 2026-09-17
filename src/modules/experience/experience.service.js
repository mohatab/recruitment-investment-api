const Experience = require("./experience.model");
const { NotFoundError } = require("../../common/errors/AppError");
const assertOwner = require("../../common/utils/assertOwner");

async function create(userId, data) {
  return Experience.create({ ...data, user: userId });
}

async function listMine(userId) {
  return Experience.find({ user: userId }).sort({ startDate: -1 });
}

async function remove(id, userId) {
  const experience = await Experience.findById(id);
  if (!experience) throw new NotFoundError("Experience not found");
  assertOwner(experience.user, userId, "You can only manage your own experience entries");
  await experience.deleteOne();
}

module.exports = { create, listMine, remove };
