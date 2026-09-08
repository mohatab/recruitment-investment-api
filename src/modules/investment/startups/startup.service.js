const Startup = require("./startup.model");
const Investor = require("../investors/investor.model");
const { NotFoundError, ForbiddenError } = require("../../../common/errors/AppError");
const { parsePagination, buildMeta } = require("../../../common/utils/pagination");

async function upsertMine(ownerId, data) {
  const startup = await Startup.findOneAndUpdate(
    { owner: ownerId },
    { $set: data, $setOnInsert: { owner: ownerId } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return startup;
}

async function getMine(ownerId) {
  const startup = await Startup.findOne({ owner: ownerId });
  if (!startup) throw new NotFoundError("You haven't created a startup profile yet");
  return startup;
}

async function getById(id) {
  const startup = await Startup.findById(id);
  if (!startup) throw new NotFoundError("Startup not found");
  return startup;
}

async function list(query) {
  const { page, limit, skip, sort } = parsePagination(query);
  const filter = {};
  if (query.industry) filter.industries = query.industry;
  if (query.stage) filter.stage = query.stage;

  const [items, total] = await Promise.all([
    Startup.find(filter).sort(sort).skip(skip).limit(limit),
    Startup.countDocuments(filter),
  ]);
  return { items, meta: buildMeta({ page, limit, total }) };
}

// "the system finds relevant opportunities": a plain filter query against
// the investor's own saved criteria — deliberately not a recommendation
// model, since nothing in this project's data would make one meaningful.
async function matchesForInvestor(investorUserId) {
  const investor = await Investor.findOne({ owner: investorUserId });
  if (!investor) throw new NotFoundError("Set your investor criteria first");

  const { criteria } = investor;
  const filter = {
    minInvestment: { $gte: criteria.minInvestment, $lte: criteria.maxInvestment },
  };
  if (criteria.industries.length) filter.industries = { $in: criteria.industries };
  if (criteria.stages.length) filter.stage = { $in: criteria.stages };
  if (criteria.locations.length) filter.location = { $in: criteria.locations };

  return Startup.find(filter).sort({ createdAt: -1 });
}

// A transparent, documented rule-based heuristic — not a trained model.
// Kept stateless (no persistence) since the original endpoint's persisted
// records weren't linked to a real startup anyway.
function successAssessment({ isSoftwareBased, hasAdCampaigns, hasConsulting, totalFunding }) {
  const likely = totalFunding > 500000 && (isSoftwareBased || hasAdCampaigns);
  return {
    prediction: likely ? "likely_to_succeed" : "unlikely_to_succeed",
    method: "rule_based_heuristic",
    factorsConsidered: { isSoftwareBased, hasAdCampaigns, hasConsulting, totalFunding },
  };
}

function assertOwnership(startup, userId) {
  if (String(startup.owner) !== String(userId))
    throw new ForbiddenError("You can only manage your own startup profile");
}

module.exports = { upsertMine, getMine, getById, list, matchesForInvestor, successAssessment, assertOwnership };
