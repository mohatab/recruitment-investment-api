const { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken } = require("../../src/modules/auth/jwt");

describe("jwt utilities", () => {
  test("signs and verifies an access token round-trip", () => {
    const token = signAccessToken({ _id: "abc123", role: "candidate" });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("abc123");
    expect(payload.role).toBe("candidate");
  });

  test("rejects a tampered token", () => {
    const token = signAccessToken({ _id: "abc123", role: "candidate" });
    expect(() => verifyAccessToken(token + "tamper")).toThrow();
  });

  test("refresh tokens are random and their hash is deterministic", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
});
