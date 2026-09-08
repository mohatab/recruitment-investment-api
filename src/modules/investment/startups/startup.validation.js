const Joi = require("joi");
const { STAGES } = require("./startup.model");

const upsert = Joi.object({
  name: Joi.string().required(),
  pitchTitle: Joi.string().allow(""),
  description: Joi.string().required(),
  website: Joi.string().uri().allow(""),
  location: Joi.string().allow(""),
  industries: Joi.array().items(Joi.string()).default([]),
  stage: Joi.string()
    .valid(...STAGES)
    .default("idea"),
  idealInvestorRole: Joi.string().allow(""),
  previousRaised: Joi.number().min(0).default(0),
  totalRaising: Joi.number().min(0).required(),
  minInvestment: Joi.number().min(0).required(),
});

const list = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  sort: Joi.string(),
  industry: Joi.string(),
  stage: Joi.string().valid(...STAGES),
});

const successAssessment = Joi.object({
  isSoftwareBased: Joi.boolean().required(),
  hasAdCampaigns: Joi.boolean().required(),
  hasConsulting: Joi.boolean().required(),
  totalFunding: Joi.number().min(0).required(),
});

module.exports = { upsert, list, successAssessment };
