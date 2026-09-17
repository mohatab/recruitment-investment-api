const mongoose = require("mongoose");
const { app, request } = require("../helpers");

afterEach(() => {
  jest.restoreAllMocks();
  app.locals.shuttingDown = false;
});

describe("health probes", () => {
  test("GET /health is a pure liveness check", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
  });

  test("GET /health stays 200 even when MongoDB is down (liveness must not restart a healthy process)", async () => {
    jest.spyOn(mongoose.connection.db, "command").mockRejectedValue(new Error("down"));
    expect((await request(app).get("/health")).status).toBe(200);
  });

  test("GET /health/ready is 200 when MongoDB answers a ping", async () => {
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: "ready", checks: { mongodb: "up" } });
  });

  test("GET /health/ready is 503 when the MongoDB ping fails", async () => {
    jest.spyOn(mongoose.connection.db, "command").mockRejectedValue(new Error("connection refused"));
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.data.checks.mongodb).toBe("down");
  });

  test("GET /health/ready is 503 when the connection is closed", async () => {
    await mongoose.disconnect();
    try {
      expect((await request(app).get("/health/ready")).status).toBe(503);
    } finally {
      await mongoose.connect(process.env.MONGODB_URI);
    }
  });

  test("GET /health/ready is 503 while the server is shutting down", async () => {
    app.locals.shuttingDown = true;
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.data.status).toBe("shutting_down");
  });
});
