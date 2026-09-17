const { parsePagination, buildPagination, listQuery, MAX_LIMIT } = require("../../src/common/utils/pagination");

describe("parsePagination", () => {
  test("defaults to page 1, limit 20, newest first", () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, skip: 0, sort: { createdAt: -1 } });
  });

  test("caps limit at the maximum and floors page at 1", () => {
    const { page, limit } = parsePagination({ page: "-5", limit: "500" });
    expect({ page, limit }).toEqual({ page: 1, limit: MAX_LIMIT });
  });

  test("computes skip from page and limit", () => {
    expect(parsePagination({ page: "3", limit: "10" }).skip).toBe(20);
  });

  test("parses a comma-separated sort, with `-` meaning descending", () => {
    const { sort } = parsePagination({ sort: "-createdAt,title" }, { allowedSort: ["createdAt", "title"] });
    expect(sort).toEqual({ createdAt: -1, title: 1 });
  });

  test("ignores sort fields outside the allowlist instead of passing them to the database", () => {
    const { sort } = parsePagination({ sort: "$where,password" }, { allowedSort: ["createdAt"] });
    expect(sort).toEqual({ createdAt: -1 });
  });

  test("honours a custom default sort", () => {
    expect(parsePagination({}, { defaultSort: { startDate: -1 } }).sort).toEqual({ startDate: -1 });
  });
});

describe("buildPagination", () => {
  test("computes totalPages", () => {
    expect(buildPagination({ page: 1, limit: 10, total: 25 })).toEqual({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
  });

  test("reports one page when there is nothing to page through", () => {
    expect(buildPagination({ page: 1, limit: 10, total: 0 }).totalPages).toBe(1);
  });
});

describe("listQuery", () => {
  const schema = listQuery(["createdAt", "amount"], {});

  test("applies defaults", () => {
    expect(schema.validate({}).value).toEqual({ page: 1, limit: 20 });
  });

  test("accepts allowed sort fields in either direction", () => {
    expect(schema.validate({ sort: "-amount,createdAt" }).error).toBeUndefined();
  });

  test("rejects sort fields outside the allowlist, and lists the allowed ones", () => {
    const { error } = schema.validate({ sort: "password" });
    expect(error.details[0].message).toMatch(
      /must be a comma-separated list of: createdAt, -createdAt, amount, -amount/
    );
  });

  test("rejects a limit above the maximum and a page below 1", () => {
    expect(schema.validate({ limit: MAX_LIMIT + 1 }).error).toBeDefined();
    expect(schema.validate({ page: 0 }).error).toBeDefined();
  });
});
