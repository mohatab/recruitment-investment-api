const { app, request, registerUser, createAdmin } = require("../helpers");

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
