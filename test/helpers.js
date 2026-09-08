const request = require("supertest");
const app = require("../src/app");

let counter = 0;

async function registerUser(overrides = {}) {
  counter += 1;
  const payload = {
    firstName: "Test",
    lastName: "User",
    email: `user${counter}.${Date.now()}@example.com`,
    password: "password123",
    role: "candidate",
    ...overrides,
  };
  const res = await request(app).post("/api/auth/register").send(payload);
  return { res, ...res.body.data };
}

module.exports = { app, request, registerUser };
