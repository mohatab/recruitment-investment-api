jest.mock("../../src/common/services/email.service", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

const { app, request, registerUser } = require("../helpers");
const { sendEmail } = require("../../src/common/services/email.service");

function extractToken(text) {
  return new URL(text.split(": ").pop()).searchParams.get("token");
}

describe("password reset flow", () => {
  test("requesting a reset emails a working single-use token", async () => {
    const { user } = await registerUser({ email: "reset-me@example.com", password: "old-password" });

    await request(app).post("/api/auth/forgot-password").send({ email: user.email });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const token = extractToken(sendEmail.mock.calls[0][0].text);

    const resetRes = await request(app).post("/api/auth/reset-password").send({ token, password: "new-password" });
    expect(resetRes.status).toBe(200);

    const loginOld = await request(app).post("/api/auth/login").send({ email: user.email, password: "old-password" });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app).post("/api/auth/login").send({ email: user.email, password: "new-password" });
    expect(loginNew.status).toBe(200);
  });

  test("a reset token can't be reused", async () => {
    const { user } = await registerUser({ email: "reset-reuse@example.com" });
    await request(app).post("/api/auth/forgot-password").send({ email: user.email });
    const token = extractToken(sendEmail.mock.calls.at(-1)[0].text);

    const first = await request(app).post("/api/auth/reset-password").send({ token, password: "new-password-1" });
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/auth/reset-password").send({ token, password: "new-password-2" });
    expect(second.status).toBe(401);
  });
});
