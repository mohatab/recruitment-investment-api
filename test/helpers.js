const request = require("supertest");
const app = require("../src/app");
const User = require("../src/modules/users/user.model");

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

// Admin accounts are deliberately not self-registrable (see auth.validation.js
// PUBLIC_ROLES) — the only way to get one is direct provisioning, exactly as
// a real deployment would (a seed script or a DB console), so tests create
// one the same way rather than through the public API.
async function createAdmin() {
  counter += 1;
  const email = `admin${counter}.${Date.now()}@example.com`;
  const password = "password123";
  await User.create({ firstName: "Admin", lastName: "User", email, password, role: "admin" });
  const loginRes = await request(app).post("/api/auth/login").send({ email, password });
  return { user: loginRes.body.data.user, accessToken: loginRes.body.data.accessToken };
}

module.exports = { app, request, registerUser, createAdmin };
