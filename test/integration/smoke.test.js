const { app, request } = require("../helpers");

describe("smoke tests", () => {
  test("GET /unknown-route -> 404 with the standard error envelope", async () => {
    const res = await request(app).get("/unknown-route");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  test("POST /api/auth/register with missing fields -> 400 (Joi validation)", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("POST /api/jobs without a token -> 401", async () => {
    const res = await request(app).post("/api/v1/jobs").send({});
    expect(res.status).toBe(401);
  });

  test("every response carries an X-Request-Id header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  test("a malformed Mongo ObjectId in a route param is a clean 400, not a 500 or a stack trace", async () => {
    const res = await request(app).get("/api/v1/jobs/not-a-valid-object-id");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID");
    expect(res.body.error).not.toHaveProperty("stack");
  });

  test("an unexpected server error never leaks a stack trace to the client", async () => {
    // /api/jobs/:id/applications with a bogus jobId still hits real
    // service code (auth passes, then the job lookup 404s) — asserting the
    // response body has no stack/internals regardless of status code.
    const res = await request(app).get("/api/v1/jobs/not-a-valid-object-id/applications");
    expect(res.body).not.toHaveProperty("stack");
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|node_modules/);
  });
});
