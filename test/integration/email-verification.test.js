jest.mock("../../src/common/services/email.service", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

const { app, request, registerUser } = require("../helpers");
const { sendEmail } = require("../../src/common/services/email.service");
const AuthToken = require("../../src/modules/auth/authToken.model");
const env = require("../../src/config/env");

const verify = (token) => request(app).post("/api/v1/auth/verify-email").send({ token });
const me = (accessToken) => request(app).get("/api/v1/users/me").set("Authorization", `Bearer ${accessToken}`);
const resend = (accessToken) =>
  request(app).post("/api/v1/auth/resend-verification").set("Authorization", `Bearer ${accessToken}`);

const verificationEmails = (email) =>
  sendEmail.mock.calls.map(([m]) => m).filter((m) => m.to === email && m.subject === "Confirm your email address");
const tokenFrom = (mail) => mail.text.match(/#token=([0-9a-f]{64})/)[1];

const JOB = {
  title: "Backend Engineer",
  role: "Engineering",
  description: "Build APIs",
  responsibilities: "Everything",
  minSalary: 1,
  maxSalary: 2,
  salaryType: "yearly",
  expirationDate: new Date(Date.now() + 7 * 864e5).toISOString(),
};

beforeEach(() => sendEmail.mockClear());

describe("email verification", () => {
  test("registration sends a verification link to the client app, and the token verifies the address", async () => {
    const { user, accessToken } = await registerUser({}, { verified: false });
    const [mail] = verificationEmails(user.email);
    expect(mail.text).toContain(`${env.appUrl}/verify-email#token=`);

    expect((await me(accessToken)).body.data.emailVerified).toBe(false);
    expect((await verify(tokenFrom(mail))).status).toBe(200);
    expect((await me(accessToken)).body.data.emailVerified).toBe(true);
  });

  test("a verification token is single use", async () => {
    const { user } = await registerUser({}, { verified: false });
    const token = tokenFrom(verificationEmails(user.email)[0]);
    expect((await verify(token)).status).toBe(200);
    const again = await verify(token);
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("INVALID_TOKEN");
  });

  test("an expired verification token is rejected", async () => {
    const { user, accessToken } = await registerUser({}, { verified: false });
    await AuthToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await verify(tokenFrom(verificationEmails(user.email)[0]))).body.error.code).toBe("INVALID_TOKEN");
    expect((await me(accessToken)).body.data.emailVerified).toBe(false);
  });

  test("resend issues a new link that supersedes the old one, at most once a minute", async () => {
    const { user, accessToken } = await registerUser({}, { verified: false });
    const original = tokenFrom(verificationEmails(user.email)[0]);

    await resend(accessToken).expect(200);
    expect(verificationEmails(user.email)).toHaveLength(1); // still inside the cooldown

    await AuthToken.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } }); // Mongoose treats createdAt as immutable
    await resend(accessToken).expect(200);
    const emails = verificationEmails(user.email);
    expect(emails).toHaveLength(2);

    expect((await verify(original)).body.error.code).toBe("INVALID_TOKEN");
    expect((await verify(tokenFrom(emails[1]))).status).toBe(200);
  });

  test("resend is a no-op for an already verified address", async () => {
    const { accessToken, user } = await registerUser(); // verified by the helper
    sendEmail.mockClear();
    await AuthToken.collection.updateMany({}, { $set: { createdAt: new Date(0) } }); // Mongoose treats createdAt as immutable
    await resend(accessToken).expect(200);
    expect(verificationEmails(user.email)).toHaveLength(0);
  });

  test("resend requires authentication", async () => {
    expect((await request(app).post("/api/v1/auth/resend-verification")).status).toBe(401);
  });

  test("an unverified recruiter cannot post a job until they verify (403 EMAIL_NOT_VERIFIED)", async () => {
    const { user, accessToken } = await registerUser({ role: "recruiter" }, { verified: false });
    const post = () => request(app).post("/api/v1/jobs").set("Authorization", `Bearer ${accessToken}`).send(JOB);

    const blocked = await post();
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("EMAIL_NOT_VERIFIED");

    await verify(tokenFrom(verificationEmails(user.email)[0])).expect(200);
    expect((await post()).status).toBe(201);
  });

  test("an unverified investor cannot start an investment", async () => {
    const { accessToken } = await registerUser({ role: "investor" }, { verified: false });
    const res = await request(app)
      .post("/api/v1/investments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ startupId: "507f1f77bcf86cd799439011", amountCents: 10000 });
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });
});
