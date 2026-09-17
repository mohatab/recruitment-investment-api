jest.mock("../../src/common/services/email.service", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

const crypto = require("crypto");
const { app, request, registerUser, waitFor } = require("../helpers");
const { sendEmail } = require("../../src/common/services/email.service");
const User = require("../../src/modules/users/user.model");
const AuthToken = require("../../src/modules/auth/authToken.model");
const env = require("../../src/config/env");

const forgot = (email) => request(app).post("/api/v1/auth/forgot-password").send({ email });
const reset = (token, password) => request(app).post("/api/v1/auth/reset-password").send({ token, password });
const login = (email, password) => request(app).post("/api/v1/auth/login").send({ email, password });

const resetEmailsTo = (email) =>
  sendEmail.mock.calls.map(([arg]) => arg).filter((m) => m.to === email && m.subject === "Password reset request");

// Waits for the background job to send the email and returns the token in its link.
async function requestResetToken(email) {
  const before = resetEmailsTo(email).length;
  await forgot(email).expect(200);
  const mail = await waitFor(() => resetEmailsTo(email)[before]);
  return mail.text.match(/#token=([0-9a-f]{64})/)[1];
}

// Lets the post-response background job for a request finish.
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

beforeEach(() => sendEmail.mockClear());

describe("forgot-password", () => {
  test("responds identically for registered, unknown and deactivated emails, and only emails the active account", async () => {
    const { user } = await registerUser({ email: "exists@example.com" });
    const { user: disabled } = await registerUser({ email: "disabled@example.com" });
    await User.updateOne({ _id: disabled._id }, { isActive: false });
    sendEmail.mockClear();

    const responses = await Promise.all([forgot(user.email), forgot("nobody@example.com"), forgot(disabled.email)]);
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...responses[0].body, requestId: res.body.requestId });
    }

    await waitFor(() => resetEmailsTo(user.email).length === 1);
    await settle();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test("the emailed link points at the client app's reset page, with the token in the URL fragment", async () => {
    const { user } = await registerUser();
    await requestResetToken(user.email);
    const [mail] = resetEmailsTo(user.email);
    expect(mail.text).toContain(`${env.appUrl}/reset-password#token=`);
  });

  test("a second request within a minute sends no second email", async () => {
    const { user } = await registerUser();
    await requestResetToken(user.email);
    await forgot(user.email).expect(200);
    await settle();
    expect(resetEmailsTo(user.email)).toHaveLength(1);
  });

  test("a newer reset link supersedes the older one", async () => {
    const { user } = await registerUser();
    const older = await requestResetToken(user.email);
    await AuthToken.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } }); // Mongoose treats createdAt as immutable
    const newer = await requestResetToken(user.email);

    expect((await reset(older, "brand-new-password")).body.error.code).toBe("INVALID_TOKEN");
    expect((await reset(newer, "brand-new-password")).status).toBe(200);
  });
});

describe("reset-password", () => {
  test("a valid token sets the new password and revokes every existing session", async () => {
    const { user, accessToken, refreshToken } = await registerUser({ password: "old-password" });
    const token = await requestResetToken(user.email);

    const res = await reset(token, "new-password");
    expect(res.status).toBe(200);

    expect((await login(user.email, "old-password")).status).toBe(401);
    expect((await login(user.email, "new-password")).status).toBe(200);
    expect((await request(app).get("/api/v1/users/me").set("Authorization", `Bearer ${accessToken}`)).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken })).status).toBe(401);
  });

  test("a token can be used only once", async () => {
    const { user } = await registerUser();
    const token = await requestResetToken(user.email);

    expect((await reset(token, "new-password-1")).status).toBe(200);
    const second = await reset(token, "new-password-2");
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe("INVALID_TOKEN");
    expect((await login(user.email, "new-password-1")).status).toBe(200);
  });

  test("concurrent use of one token succeeds at most once", async () => {
    const { user } = await registerUser();
    const token = await requestResetToken(user.email);
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => reset(token, `concurrent-pass-${i}`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  test("an expired token is rejected", async () => {
    const { user } = await registerUser();
    const token = await requestResetToken(user.email);
    await AuthToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await reset(token, "new-password")).body.error.code).toBe("INVALID_TOKEN");
  });

  test("an unknown token and a malformed token are rejected", async () => {
    expect((await reset(crypto.randomBytes(32).toString("hex"), "new-password")).body.error.code).toBe("INVALID_TOKEN");
    expect((await reset("not-a-token", "new-password")).body.error.code).toBe("VALIDATION_ERROR");
  });

  test("an email-verification token cannot be used as a reset token", async () => {
    const { user } = await registerUser({}, { verified: false });
    const mail = sendEmail.mock.calls.map(([m]) => m).find((m) => m.to === user.email);
    const verificationToken = mail.text.match(/#token=([0-9a-f]{64})/)[1];
    expect((await reset(verificationToken, "new-password")).body.error.code).toBe("INVALID_TOKEN");
  });

  test("the new password must satisfy the password policy", async () => {
    const { user } = await registerUser();
    const token = await requestResetToken(user.email);
    expect((await reset(token, "short")).status).toBe(400);
    expect((await reset(token, "long-enough")).status).toBe(200); // the rejected attempt did not consume it
  });

  test("resetting also verifies the email address (the link proved ownership)", async () => {
    const { user } = await registerUser({}, { verified: false });
    const token = await requestResetToken(user.email);
    await reset(token, "new-password");
    expect((await User.findById(user._id)).emailVerifiedAt).toBeInstanceOf(Date);
  });

  test("raw reset tokens are never stored", async () => {
    const { user } = await registerUser();
    const token = await requestResetToken(user.email);
    expect(JSON.stringify(await AuthToken.find().lean())).not.toContain(token);
  });
});
