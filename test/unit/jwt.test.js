const jsonwebtoken = require("jsonwebtoken");
const { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken } = require("../../src/modules/auth/jwt");
const env = require("../../src/config/env");

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

  test("rejects an expired token", () => {
    const expired = jsonwebtoken.sign({ sub: "abc123", role: "candidate" }, env.jwt.accessSecret, {
      algorithm: "HS256",
      expiresIn: -10, // already expired
    });
    expect(() => verifyAccessToken(expired)).toThrow(/expired/i);
  });

  test("rejects an algorithm-confusion token (alg: none) even with a correct-looking payload", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "abc123", role: "admin" })).toString("base64url");
    const forgedToken = `${header}.${payload}.`;
    expect(() => verifyAccessToken(forgedToken)).toThrow();
  });

  test("rejects a token signed with a different secret", () => {
    const wrongSecretToken = jsonwebtoken.sign({ sub: "abc123", role: "admin" }, "attacker-controlled-secret", {
      algorithm: "HS256",
    });
    expect(() => verifyAccessToken(wrongSecretToken)).toThrow();
  });

  test("refresh tokens are random and their hash is deterministic", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
});
