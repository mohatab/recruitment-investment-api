const escapeRegex = require("../../src/common/utils/escapeRegex");

describe("escapeRegex", () => {
  test("escapes regex metacharacters so the input is matched literally", () => {
    const pattern = new RegExp(escapeRegex("C++ (Senior)"), "i");
    expect(pattern.test("C++ (Senior)")).toBe(true);
    expect(pattern.test("C plus plus Senior")).toBe(false);
  });

  test("neutralizes a catastrophic-backtracking-shaped input instead of building it into a live pattern", () => {
    const malicious = "(a+)+$";
    const pattern = new RegExp(escapeRegex(malicious), "i");
    // If this weren't escaped, testing it against a long non-matching
    // string would hang the process (ReDoS). It should just not match.
    expect(pattern.test("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!")).toBe(false);
  });
});
