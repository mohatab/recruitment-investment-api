const crypto = require("crypto");
const { app, request, registerUser } = require("../helpers");
const User = require("../../src/modules/users/user.model");
const RefreshToken = require("../../src/modules/auth/refreshToken.model");

const me = (accessToken) => request(app).get("/api/users/me").set("Authorization", `Bearer ${accessToken}`);
const refresh = (refreshToken) => request(app).post("/api/auth/refresh").send({ refreshToken });
const login = (email, password) => request(app).post("/api/auth/login").send({ email, password });

describe("registration", () => {
  test("returns the user and a token pair; password and tokenVersion are never returned", async () => {
    const { res, user, accessToken, refreshToken } = await registerUser({}, { verified: false });
    expect(res.status).toBe(201);
    expect(user.password).toBeUndefined();
    expect(user.tokenVersion).toBeUndefined();
    expect(user.emailVerified).toBe(false);
    expect(accessToken).toEqual(expect.any(String));
    expect(refreshToken).toMatch(/^[0-9a-f]{80}$/);
  });

  test("the same email twice (in any letter case) returns 409", async () => {
    await registerUser({ email: "dup@example.com" });
    const { res } = await registerUser({ email: "DUP@Example.com" });
    expect(res.status).toBe(409);
  });

  test("registering as admin is rejected (no self-service privilege escalation)", async () => {
    const { res } = await registerUser({ role: "admin" });
    expect(res.status).toBe(400);
  });

  test.each([
    ["shorter than 8 characters", "short7!"],
    ["longer than bcrypt's 72-byte input limit", "é".repeat(37)], // 37 chars, 74 bytes
  ])("rejects a password %s", async (_, password) => {
    const { res } = await registerUser({ password });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("unknown fields such as isActive, tokenVersion or emailVerifiedAt cannot be mass-assigned", async () => {
    const { user } = await registerUser(
      { isActive: false, tokenVersion: 99, emailVerifiedAt: new Date() },
      { verified: false }
    );
    const stored = await User.findById(user._id).lean();
    expect(stored).toMatchObject({ isActive: true, tokenVersion: 0, emailVerifiedAt: null });
  });
});

describe("login", () => {
  test("correct credentials succeed, with the email matched case-insensitively", async () => {
    await registerUser({ email: "login@example.com", password: "correct-password" });
    const res = await login("  Login@Example.COM ", "correct-password");
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  test("a wrong password and an unknown email get the identical 401 response", async () => {
    await registerUser({ email: "wrongpass@example.com", password: "correct-password" });
    const wrongPassword = await login("wrongpass@example.com", "nope-nope");
    const unknownEmail = await login("nobody-here@example.com", "nope-nope");
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toEqual(unknownEmail.body.error);
  });

  test("a deactivated account cannot log in (403 ACCOUNT_DISABLED only with the right password)", async () => {
    const { user } = await registerUser({ email: "disabled@example.com", password: "correct-password" });
    await User.updateOne({ _id: user._id }, { isActive: false });

    const right = await login("disabled@example.com", "correct-password");
    expect(right.status).toBe(403);
    expect(right.body.error.code).toBe("ACCOUNT_DISABLED");
    expect(right.body.data).toBeUndefined();

    const wrong = await login("disabled@example.com", "wrong-password");
    expect(wrong.status).toBe(401); // no status disclosure without the password
  });
});

describe("access tokens", () => {
  test("protected route without a token returns 401", async () => {
    expect((await request(app).get("/api/users/me")).status).toBe(401);
  });

  test("a deactivated user's existing access token stops working immediately", async () => {
    const { user, accessToken } = await registerUser();
    expect((await me(accessToken)).status).toBe(200);
    await User.updateOne({ _id: user._id }, { isActive: false });
    expect((await me(accessToken)).status).toBe(401);
  });

  test("role is read from the stored user, not trusted from the token", async () => {
    const { user, accessToken } = await registerUser({ role: "recruiter" });
    await User.updateOne({ _id: user._id }, { role: "candidate" });
    const res = await request(app).post("/api/jobs").set("Authorization", `Bearer ${accessToken}`).send({});
    expect(res.status).toBe(403);
  });
});

describe("refresh token rotation", () => {
  test("issues a new pair and consumes the presented token", async () => {
    const { refreshToken } = await registerUser();
    const first = await refresh(refreshToken);
    expect(first.status).toBe(200);
    expect(first.body.data.refreshToken).not.toBe(refreshToken);
    expect((await me(first.body.data.accessToken)).status).toBe(200);
    expect((await refresh(first.body.data.refreshToken)).status).toBe(200); // the new one works once
  });

  test("a malformed token is a 400; an unknown well-formed token is a 401", async () => {
    expect((await refresh("not-a-token")).status).toBe(400);
    expect((await refresh(crypto.randomBytes(40).toString("hex"))).status).toBe(401);
  });

  test("an expired refresh token is rejected", async () => {
    const { refreshToken } = await registerUser();
    await RefreshToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await refresh(refreshToken)).status).toBe(401);
  });

  test("refresh is refused for a deactivated account", async () => {
    const { user, refreshToken } = await registerUser();
    await User.updateOne({ _id: user._id }, { isActive: false });
    expect((await refresh(refreshToken)).status).toBe(401);
  });

  test("concurrent requests with the same token: at most one succeeds, and none leaves a usable session", async () => {
    const { refreshToken, accessToken } = await registerUser();
    const results = await Promise.all(Array.from({ length: 5 }, () => refresh(refreshToken)));

    const successes = results.filter((r) => r.status === 200);
    expect(successes.length).toBeLessThanOrEqual(1);
    expect(results.filter((r) => r.status === 401).length).toBeGreaterThanOrEqual(4);

    // The losing requests are reuse of a rotated token, so the whole session
    // family is revoked, including anything the winner was issued.
    for (const s of successes) {
      expect((await refresh(s.body.data.refreshToken)).status).toBe(401);
      expect((await me(s.body.data.accessToken)).status).toBe(401);
    }
    expect((await me(accessToken)).status).toBe(401);
  });

  test("replaying a rotated token revokes every session of that user (reuse detection)", async () => {
    const { user, refreshToken: stolen, accessToken: originalAccess } = await registerUser();
    const otherDevice = await login(user.email, "password123");

    const legit = await refresh(stolen); // the victim rotates normally
    expect(legit.status).toBe(200);

    const attacker = await refresh(stolen); // the thief replays the old token
    expect(attacker.status).toBe(401);

    expect((await refresh(legit.body.data.refreshToken)).status).toBe(401);
    expect((await me(legit.body.data.accessToken)).status).toBe(401);
    expect((await me(originalAccess)).status).toBe(401);
    expect((await refresh(otherDevice.body.data.refreshToken)).status).toBe(401);

    // The user can still sign in again with their password.
    expect((await login(user.email, "password123")).status).toBe(200);
  });

  test("reusing a token that was revoked by logout (not rotation) does not revoke other sessions", async () => {
    const { user, refreshToken } = await registerUser();
    const otherDevice = await login(user.email, "password123");
    await request(app).post("/api/auth/logout").send({ refreshToken }).expect(200);

    expect((await refresh(refreshToken)).status).toBe(401);
    expect((await refresh(otherDevice.body.data.refreshToken)).status).toBe(200);
  });

  test("tokens are stored only as SHA-256 hashes", async () => {
    const { refreshToken } = await registerUser();
    const stored = await RefreshToken.find().lean();
    expect(JSON.stringify(stored)).not.toContain(refreshToken);
    expect(stored.some((t) => t.tokenHash === crypto.createHash("sha256").update(refreshToken).digest("hex"))).toBe(
      true
    );
  });
});

describe("logout", () => {
  test("logout revokes that refresh token only", async () => {
    const { user, refreshToken, accessToken } = await registerUser();
    const otherDevice = await login(user.email, "password123");

    expect((await request(app).post("/api/auth/logout").send({ refreshToken })).status).toBe(200);
    expect((await refresh(refreshToken)).status).toBe(401);
    expect((await refresh(otherDevice.body.data.refreshToken)).status).toBe(200);
    expect((await me(accessToken)).status).toBe(200); // access tokens are short-lived and expire on their own
  });

  test("logging out with an unknown or already-revoked token still returns 200 (no oracle)", async () => {
    const unknown = crypto.randomBytes(40).toString("hex");
    expect((await request(app).post("/api/auth/logout").send({ refreshToken: unknown })).status).toBe(200);
  });

  test("logout-all revokes every access and refresh token of the user", async () => {
    const { user, refreshToken, accessToken } = await registerUser();
    const otherDevice = await login(user.email, "password123");

    const res = await request(app).post("/api/auth/logout-all").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);

    expect((await me(accessToken)).status).toBe(401);
    expect((await me(otherDevice.body.data.accessToken)).status).toBe(401);
    expect((await refresh(refreshToken)).status).toBe(401);
    expect((await refresh(otherDevice.body.data.refreshToken)).status).toBe(401);
  });

  test("logout-all requires authentication", async () => {
    expect((await request(app).post("/api/auth/logout-all")).status).toBe(401);
  });
});
