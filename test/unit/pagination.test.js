const { parsePagination, buildMeta } = require("../../src/common/utils/pagination");

describe("pagination utility", () => {
  test("defaults page to 1 and limit to 20", () => {
    const { page, limit, skip } = parsePagination({});
    expect(page).toBe(1);
    expect(limit).toBe(20);
    expect(skip).toBe(0);
  });

  test("caps limit at 100 and floors page at 1", () => {
    const { page, limit } = parsePagination({ page: "-5", limit: "500" });
    expect(page).toBe(1);
    expect(limit).toBe(100);
  });

  test("parses a comma-separated sort with descending prefix", () => {
    const { sort } = parsePagination({ sort: "-createdAt,title" });
    expect(sort).toEqual({ createdAt: -1, title: 1 });
  });

  test("buildMeta computes totalPages correctly", () => {
    expect(buildMeta({ page: 1, limit: 10, total: 25 })).toEqual({ page: 1, limit: 10, total: 25, totalPages: 3 });
  });
});
