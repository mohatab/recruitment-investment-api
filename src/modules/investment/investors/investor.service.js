const Investor = require("./investor.model");
const { NotFoundError } = require("../../../common/errors/AppError");

async function upsertMine(ownerId, data) {
  const existed = await Investor.exists({ owner: ownerId });
  const investor = await Investor.findOneAndUpdate(
    { owner: ownerId },
    { $set: data, $setOnInsert: { owner: ownerId } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return { investor, created: !existed };
}

async function getMine(ownerId) {
  const investor = await Investor.findOne({ owner: ownerId });
  if (!investor) throw new NotFoundError("You haven't set up investor criteria yet");
  return investor;
}

// What other users may see. Investment criteria (ticket sizes, target
// industries/stages/locations) are the investor's private deal filter; the
// owner reads them through GET /investors/me.
const PUBLIC_FIELDS = "-criteria";

async function getById(id) {
  const investor = await Investor.findById(id).select(PUBLIC_FIELDS);
  if (!investor) throw new NotFoundError("Investor not found");
  return investor;
}

module.exports = { upsertMine, getMine, getById };
