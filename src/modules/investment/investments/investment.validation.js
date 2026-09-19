const Joi = require("joi");
const { listQuery } = require("../../../common/utils/pagination");
const { SORTABLE } = require("./investment.service");
const { MAX_AMOUNT_CENTS } = require("../../../common/utils/money");

const create = Joi.object({
  startupId: Joi.string().hex().length(24).required(),
  // Integer minor units (cents). A fractional value like 10.005 is not a
  // payable amount, so it is rejected rather than rounded.
  amountCents: Joi.number().integer().min(1).max(MAX_AMOUNT_CENTS).required().messages({
    "number.base": "{{#label}} must be an integer number of cents",
    "number.integer": "{{#label}} must be an integer number of cents (no fractions of a cent)",
  }),
});

const list = listQuery(SORTABLE);

module.exports = { create, list };
