const Joi = require("joi");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Shared list-endpoint helper. `allowedSort` is an allowlist: a client can only
// sort by fields the endpoint declares (and that are indexed), so `sort` can
// never reach MongoDB as an arbitrary — or operator-shaped — field name.
function parsePagination(query = {}, { allowedSort = ["createdAt"], defaultSort = { createdAt: -1 } } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));

  let sort = defaultSort;
  if (query.sort) {
    sort = {};
    for (const field of String(query.sort).split(",")) {
      const descending = field.startsWith("-");
      const name = descending ? field.slice(1) : field;
      if (!allowedSort.includes(name)) continue; // validated by listQuery() before reaching here
      sort[name] = descending ? -1 : 1;
    }
    if (!Object.keys(sort).length) sort = defaultSort;
  }

  return { page, limit, skip: (page - 1) * limit, sort };
}

function buildPagination({ page, limit, total }) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

// Joi fragment for list endpoints: same page/limit/sort contract everywhere,
// with the sort allowlist enforced at the edge (400 instead of a silent
// fallback or a 500 from MongoDB).
function listQuery(allowedSort = ["createdAt"], extra = {}) {
  const sortable = allowedSort.flatMap((field) => [field, `-${field}`]);
  return Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    sort: Joi.string()
      .custom((value, helpers) => {
        const fields = value.split(",").map((f) => f.trim());
        return fields.every((f) => sortable.includes(f)) ? fields.join(",") : helpers.error("any.only");
      })
      .messages({ "any.only": `{{#label}} must be a comma-separated list of: ${sortable.join(", ")}` }),
    ...extra,
  });
}

module.exports = { parsePagination, buildPagination, listQuery, DEFAULT_LIMIT, MAX_LIMIT };
