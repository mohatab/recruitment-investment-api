const { app, request } = require("../helpers");

describe("request parsing errors", () => {
  test("malformed JSON is a 400 INVALID_JSON, not a 500", async () => {
    const res = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: { code: "INVALID_JSON" } });
  });

  test("a JSON body over the 1mb limit is a 413 PAYLOAD_TOO_LARGE, not a 500", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@b.co", password: "x".repeat(1024 * 1024 + 1) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  test("an oversized Stripe webhook body (raw parser) is also a 413", async () => {
    const res = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ pad: "x".repeat(200 * 1024) }));
    expect(res.status).toBe(413);
  });
});

describe("request ids", () => {
  test("error bodies carry the same requestId as the X-Request-Id header", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  test("a well-formed incoming X-Request-Id is propagated for correlation", async () => {
    const res = await request(app).get("/nope").set("X-Request-Id", "edge-7f3a.1:b_c");
    expect(res.headers["x-request-id"]).toBe("edge-7f3a.1:b_c");
    expect(res.body.requestId).toBe("edge-7f3a.1:b_c");
  });

  test.each([
    ["overlong", "x".repeat(129)],
    ["carrying log-injection characters", 'abc" level=error {'],
  ])("an incoming X-Request-Id that is %s is replaced with a generated UUID", async (_, value) => {
    const res = await request(app).get("/health").set("X-Request-Id", value);
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
