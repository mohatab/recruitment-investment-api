const request = require("supertest");
const app = require("../src/app");
const User = require("../src/modules/users/user.model");

let counter = 0;

// Registers through the public API. `verified` (default true) then marks the
// email verified directly in the DB, standing in for clicking the emailed link,
// so suites about other features aren't blocked by EMAIL_NOT_VERIFIED. The
// verification flow itself is tested in email-verification.test.js.
async function registerUser(overrides = {}, { verified = true } = {}) {
  counter += 1;
  const payload = {
    firstName: "Test",
    lastName: "User",
    email: `user${counter}.${Date.now()}@example.com`,
    password: "password123",
    role: "candidate",
    ...overrides,
  };
  const res = await request(app).post("/api/v1/auth/register").send(payload);
  if (verified && res.status === 201) {
    await User.updateOne({ _id: res.body.data.user._id }, { emailVerifiedAt: new Date() });
  }
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
  await User.create({
    firstName: "Admin",
    lastName: "User",
    email,
    password,
    role: "admin",
    emailVerifiedAt: new Date(),
  });
  const loginRes = await request(app).post("/api/v1/auth/login").send({ email, password });
  return { user: loginRes.body.data.user, accessToken: loginRes.body.data.accessToken };
}

// Polls until `fn` returns a truthy value — for effects that complete after the
// HTTP response (e.g. the forgot-password email).
async function waitFor(fn, { timeoutMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

module.exports = { app, request, registerUser, createAdmin, waitFor };
