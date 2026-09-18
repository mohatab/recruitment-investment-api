const Joi = require("joi");
const { STATUSES } = require("./application.model");
const { listQuery } = require("../../../common/utils/pagination");
const { SORTABLE } = require("./application.service");

const create = Joi.object({
  coverLetter: Joi.string().trim().min(10).max(5000).required(),
  // http(s) only: a "javascript:" or "data:" URL here would be handed straight
  // to a recruiter's browser. Omitted -> the applicant's on-file CV is used.
  resumeUrl: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .max(2000)
    .optional(),
});

const updateStatus = Joi.object({
  status: Joi.string()
    .valid(...STATUSES)
    .required(),
});

const list = listQuery(SORTABLE, { status: Joi.string().valid(...STATUSES) });

module.exports = { create, updateStatus, list };
