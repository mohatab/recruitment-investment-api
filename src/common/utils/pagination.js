// Shared list-endpoint helper: parses page/limit/sort query params once and
// returns both the Mongoose options and a `meta` block for the response.
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  let sort = { createdAt: -1 };
  if (query.sort) {
    sort = {};
    for (const field of String(query.sort).split(",")) {
      if (field.startsWith("-")) sort[field.slice(1)] = -1;
      else sort[field] = 1;
    }
  }

  return { page, limit, skip, sort };
}

function buildMeta({ page, limit, total }) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { parsePagination, buildMeta };
