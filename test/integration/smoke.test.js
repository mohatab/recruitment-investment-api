const { app, request } = require("../helpers");

describe("smoke tests", () => {
  test("GET /unknown-route -> 404 with the standard error envelope", async () => {
    const res = await request(app).get("/unknown-route");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  test("POST /api/auth/register with missing fields -> 400 (Joi validation)", async () => {
    const res = await request(app).post("/api/auth/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("POST /api/jobs without a token -> 401", async () => {
    const res = await request(app).post("/api/jobs").send({});
    expect(res.status).toBe(401);
  });

  test("every response carries an X-Request-Id header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toBeDefined();
  });
});
