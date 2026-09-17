const { app, request, registerUser } = require("../helpers");

describe("auth flows", () => {
  test("register -> receives user + tokens, password never returned", async () => {
    const { res, user, accessToken, refreshToken } = await registerUser();
    expect(res.status).toBe(201);
    expect(user.password).toBeUndefined();
    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();
  });

  test("registering the same email twice returns 409", async () => {
    const email = "dup@example.com";
    await registerUser({ email });
    const res = await request(app).post("/api/auth/register").send({
      firstName: "A",
      lastName: "B",
      email,
      password: "password123",
    });
    expect(res.status).toBe(409);
  });

  test("registering as admin is rejected (no self-service privilege escalation)", async () => {
    const res = await request(app).post("/api/auth/register").send({
      firstName: "A",
      lastName: "B",
      email: "wannabe-admin@example.com",
      password: "password123",
      role: "admin",
    });
    expect(res.status).toBe(400);
  });

  test("login with correct credentials succeeds", async () => {
    const email = "login@example.com";
    await registerUser({ email, password: "correct-password" });
    const res = await request(app).post("/api/auth/login").send({ email, password: "correct-password" });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  test("login with wrong password returns 401", async () => {
    const email = "wrongpass@example.com";
    await registerUser({ email, password: "correct-password" });
    const res = await request(app).post("/api/auth/login").send({ email, password: "nope" });
    expect(res.status).toBe(401);
  });

  test("protected route without a token returns 401", async () => {
    const res = await request(app).get("/api/users/me");
    expect(res.status).toBe(401);
  });

  test("refresh token rotation issues a new pair and invalidates the old refresh token", async () => {
    const { refreshToken } = await registerUser();
    const first = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.data.refreshToken).not.toBe(refreshToken);

    const reuse = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(reuse.status).toBe(401);
  });

  test("forgot-password responds identically for existing and non-existing emails", async () => {
    const { user } = await registerUser();
    const existing = await request(app).post("/api/auth/forgot-password").send({ email: user.email });
    const missing = await request(app).post("/api/auth/forgot-password").send({ email: "nobody@example.com" });
    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(existing.body.message).toBe(missing.body.message);
  });

  test("logout revokes the refresh token so it can no longer be used to refresh", async () => {
    const { refreshToken } = await registerUser();

    const logoutRes = await request(app).post("/api/auth/logout").send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    const attemptedRefresh = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(attemptedRefresh.status).toBe(401);
  });

  test("logging out with an already-revoked or unknown refresh token still returns 200 (no oracle for valid tokens)", async () => {
    const res = await request(app).post("/api/auth/logout").send({ refreshToken: "not-a-real-token" });
    expect(res.status).toBe(200);
  });
});
