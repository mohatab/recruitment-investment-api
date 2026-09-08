const { app, request, registerUser } = require("../helpers");

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

  test("GET /api/users/:id returns another user's public profile", async () => {
    const { accessToken } = await registerUser();
    const other = await registerUser();
    const res = await request(app).get(`/api/users/${other.user._id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(other.user._id);
  });

  test("non-admin cannot list all users", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });
});
