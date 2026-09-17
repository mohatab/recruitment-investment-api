const { app, request, registerUser, createAdmin } = require("../helpers");

const me = (accessToken) => request(app).get("/api/users/me").set("Authorization", `Bearer ${accessToken}`);
const refresh = (refreshToken) => request(app).post("/api/auth/refresh").send({ refreshToken });
const login = (email, password) => request(app).post("/api/auth/login").send({ email, password });
const setStatus = (adminToken, id, body) =>
  request(app).patch(`/api/users/${id}/status`).set("Authorization", `Bearer ${adminToken}`).send(body);

describe("user profile", () => {
  test("GET /api/users/me returns the current user without a password field", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app).get("/api/users/me").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.password).toBeUndefined();
  });

  test("PATCH /api/users/me updates allowed fields", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ phone: "+1234567890" });
    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe("+1234567890");
  });

  test("changing password requires the correct current password", async () => {
    const { accessToken } = await registerUser({ password: "original-pass" });
    const wrong = await request(app)
      .post("/api/users/me/password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: "not-it", newPassword: "new-password-1" });
    expect(wrong.status).toBe(401);

    const right = await request(app)
      .post("/api/users/me/password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: "original-pass", newPassword: "new-password-1" });
    expect(right.status).toBe(200);
  });

  test("changing password revokes every existing session and returns a fresh token pair for the caller", async () => {
    const { user, accessToken, refreshToken } = await registerUser({ password: "original-pass" });
    const otherDevice = await login(user.email, "original-pass");

    const res = await request(app)
      .post("/api/users/me/password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: "original-pass", newPassword: "new-password-1" });
    expect(res.status).toBe(200);

    expect((await me(accessToken)).status).toBe(401);
    expect((await refresh(refreshToken)).status).toBe(401);
    expect((await me(otherDevice.body.data.accessToken)).status).toBe(401);
    expect((await refresh(otherDevice.body.data.refreshToken)).status).toBe(401);

    expect((await me(res.body.data.accessToken)).status).toBe(200);
    expect((await refresh(res.body.data.refreshToken)).status).toBe(200);
    expect((await login(user.email, "original-pass")).status).toBe(401);
    expect((await login(user.email, "new-password-1")).status).toBe(200);
  });

  test("the new password must meet the policy and differ from the current one", async () => {
    const { accessToken } = await registerUser({ password: "original-pass" });
    const change = (newPassword) =>
      request(app)
        .post("/api/users/me/password")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ currentPassword: "original-pass", newPassword });
    expect((await change("short")).status).toBe(400);
    expect((await change("original-pass")).status).toBe(400);
    expect((await me(accessToken)).status).toBe(200); // rejected attempts revoke nothing
  });

  test("GET /api/users/:id returns a limited profile, never another user's phone/email/birthdate", async () => {
    const { accessToken } = await registerUser();
    const other = await registerUser({ phone: "+10000000000" });
    const res = await request(app).get(`/api/users/${other.user._id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(other.user._id);
    expect(res.body.data.firstName).toBe(other.user.firstName);
    expect(res.body.data.phone).toBeUndefined();
    expect(res.body.data.email).toBeUndefined();
    expect(res.body.data.birthdate).toBeUndefined();
  });

  test("non-admin cannot list all users", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  test("an admin can list all users", async () => {
    await registerUser();
    const admin = await createAdmin();
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2); // the registered user + the admin itself
  });

  test("an admin can deactivate an account: its sessions die and login is refused; reactivation restores login", async () => {
    const admin = await createAdmin();
    const { user, accessToken, refreshToken } = await registerUser({ password: "password123" });

    const off = await setStatus(admin.accessToken, user._id, { isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.data.isActive).toBe(false);
    expect((await me(accessToken)).status).toBe(401);
    expect((await refresh(refreshToken)).status).toBe(401);
    expect((await login(user.email, "password123")).body.error.code).toBe("ACCOUNT_DISABLED");

    expect((await setStatus(admin.accessToken, user._id, { isActive: true })).status).toBe(200);
    expect((await login(user.email, "password123")).status).toBe(200);
    expect((await me(accessToken)).status).toBe(401); // old sessions stay revoked
  });

  test("only admins can change account status, never their own, and input is strictly validated", async () => {
    const admin = await createAdmin();
    const { user, accessToken } = await registerUser();

    expect((await setStatus(accessToken, admin.user._id, { isActive: false })).status).toBe(403);
    expect((await setStatus(admin.accessToken, admin.user._id, { isActive: false })).status).toBe(400);
    expect((await setStatus(admin.accessToken, user._id, { isActive: "false" })).status).toBe(400);
    expect((await setStatus(admin.accessToken, "507f1f77bcf86cd799439011", { isActive: false })).status).toBe(404);
  });

  test("uploading a CV sets cvUrl, and rejects a disallowed file type", async () => {
    const { accessToken } = await registerUser();

    const rejected = await request(app)
      .post("/api/users/me/cv")
      .set("Authorization", `Bearer ${accessToken}`)
      .attach("cv", Buffer.from("not a real executable, just wrong extension"), {
        filename: "resume.exe",
        contentType: "application/octet-stream",
      });
    expect(rejected.status).toBe(400);

    const accepted = await request(app)
      .post("/api/users/me/cv")
      .set("Authorization", `Bearer ${accessToken}`)
      .attach("cv", Buffer.from("%PDF-1.4 minimal fake pdf content"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.cvUrl).toMatch(/\/uploads\/cv\//);
  });
});
