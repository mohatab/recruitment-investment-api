const Joi = require("joi");
const { listQuery } = require("../../../common/utils/pagination");
const { SORTABLE } = require("./investment.service");

const create = Joi.object({
  startupId: Joi.string().hex().length(24).required(),
  amount: Joi.number().min(1).required(),
});

const list = listQuery(SORTABLE);

module.exports = { create, list };
