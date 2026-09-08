const Investor = require("./investor.model");
const { NotFoundError } = require("../../../common/errors/AppError");

async function upsertMine(ownerId, data) {
  return Investor.findOneAndUpdate(
    { owner: ownerId },
    { $set: data, $setOnInsert: { owner: ownerId } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function getMine(ownerId) {
  const investor = await Investor.findOne({ owner: ownerId });
  if (!investor) throw new NotFoundError("You haven't set up investor criteria yet");
  return investor;
}

async function getById(id) {
  const investor = await Investor.findById(id);
  if (!investor) throw new NotFoundError("Investor not found");
  return investor;
}

module.exports = { upsertMine, getMine, getById };
