process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const request = require("supertest");
const app = require("../index");

// These are smoke tests only: they cover request validation and auth guards
// that run before any database call, so they don't require a live MongoDB
// connection. They intentionally don't exercise routes that call the DB.

describe("smoke tests", () => {
  test("GET /unknown-route -> 404", async () => {
    const res = await request(app).get("/unknown-route");
    expect(res.status).toBe(404);
  });

  test("POST /api/mahmoud/signup/register-manually with missing fields -> 400", async () => {
    const res = await request(app)
      .post("/api/mahmoud/signup/register-manually")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test("POST /api/matrix/users with missing fields -> 400 (Joi validation)", async () => {
    const res = await request(app).post("/api/matrix/users").send({});
    expect(res.status).toBe(400);
  });

  test("POST /api/mahmoud (create job) without a token -> 401", async () => {
    const res = await request(app).post("/api/mahmoud").send({});
    expect(res.status).toBe(401);
  });
});
