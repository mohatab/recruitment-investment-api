const Joi = require("joi");
const { STATUSES } = require("./application.model");
const { listQuery } = require("../../../common/utils/pagination");
const { SORTABLE } = require("./application.service");

const create = Joi.object({
  coverLetter: Joi.string().min(10).required(),
  resumeUrl: Joi.string().uri().optional(), // falls back to the applicant's on-file CV if omitted
});

const updateStatus = Joi.object({
  status: Joi.string()
    .valid(...STATUSES)
    .required(),
});

const list = listQuery(SORTABLE, { status: Joi.string().valid(...STATUSES) });

module.exports = { create, updateStatus, list };
