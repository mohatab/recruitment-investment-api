const { app, request } = require("../helpers");

describe("health check", () => {
  test("GET /health reports ok when the database is connected", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.db).toBe("connected");
  });
});
