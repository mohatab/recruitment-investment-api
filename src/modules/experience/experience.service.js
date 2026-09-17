const Experience = require("./experience.model");
const { NotFoundError } = require("../../common/errors/AppError");
const { parsePagination, buildPagination } = require("../../common/utils/pagination");

const SORTABLE = ["startDate", "createdAt"];
const assertOwner = require("../../common/utils/assertOwner");

async function create(userId, data) {
  return Experience.create({ ...data, user: userId });
}

async function listMine(userId, query) {
  const { page, limit, skip, sort } = parsePagination(query, {
    allowedSort: SORTABLE,
    defaultSort: { startDate: -1 },
  });
  const [items, total] = await Promise.all([
    Experience.find({ user: userId }).sort(sort).skip(skip).limit(limit),
    Experience.countDocuments({ user: userId }),
  ]);
  return { items, pagination: buildPagination({ page, limit, total }) };
}

async function remove(id, userId) {
  const experience = await Experience.findById(id);
  if (!experience) throw new NotFoundError("Experience not found");
  assertOwner(experience.user, userId, "You can only manage your own experience entries");
  await experience.deleteOne();
}

module.exports = { create, listMine, remove, SORTABLE };
