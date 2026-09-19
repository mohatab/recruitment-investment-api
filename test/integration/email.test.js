// What leaves the process as email, and what a delivery failure is allowed to
// do to the domain state. Mail carries single-use authentication tokens, so
// the two invariants here are: user input never becomes live markup in an
// inbox, and a token never reaches a log line.
jest.mock("nodemailer", () => {
  const sendMail = jest.fn();
  return { createTransport: jest.fn(() => ({ sendMail })), __sendMail: sendMail };
});

// The rest of the suite leaves SMTP unconfigured (so nothing ever tries to
// send); this file is the one that exercises the transport, against the mock
// above. Set before anything loads config/env.js.
process.env.SMTP_HOST = "smtp.test.local";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "mailer@test.local";
process.env.SMTP_PASS = "super-secret-smtp-pass";
process.env.EMAIL_FROM = "Test Sender <no-reply@test.local>";

const nodemailer = require("nodemailer");
const { app, request, registerUser, waitFor } = require("../helpers");
const { sendEmail, isConfigured } = require("../../src/common/services/email.service");
const templates = require("../../src/common/services/email.templates");
const logger = require("../../src/common/utils/logger");
const AuthToken = require("../../src/modules/auth/authToken.model");
const env = require("../../src/config/env");

const sendMail = nodemailer.__sendMail;

// Captures everything the process logs during `fn`, at every level.
async function captureLogs(fn) {
  const lines = [];
  const spies = ["error", "warn", "info", "debug"].map((level) =>
    jest.spyOn(logger, level).mockImplementation((message, meta) => lines.push(JSON.stringify({ message, meta })))
  );
  try {
    await fn();
    return lines.join("\n");
  } finally {
    spies.forEach((spy) => spy.mockRestore());
  }
}

beforeEach(() => {
  sendMail.mockReset();
  sendMail.mockResolvedValue({ messageId: "test" });
});

describe("templates", () => {
  const HOSTILE = '<img src=x onerror="alert(1)">';

  test("a user-controlled name is escaped, never rendered as markup", () => {
    for (const mail of [
      templates.verifyEmail({ firstName: HOSTILE, token: "a".repeat(64) }),
      templates.resetPassword({ firstName: HOSTILE, token: "a".repeat(64) }),
    ]) {
      expect(mail.html).not.toContain(HOSTILE);
      expect(mail.html).not.toContain("<img");
      expect(mail.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    }
  });

  test("escapeHtml covers every character that could break out of an attribute or a tag", () => {
    expect(templates.escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
    expect(templates.escapeHtml(null)).toBe("");
  });

  test("links point at the configured client app and keep the token in the fragment", () => {
    const token = "b".repeat(64);
    for (const [path, mail] of [
      ["/verify-email", templates.verifyEmail({ firstName: "Ada", token })],
      ["/reset-password", templates.resetPassword({ firstName: "Ada", token })],
    ]) {
      const url = `${env.appUrl}${path}#token=${token}`;
      expect(mail.text).toContain(url);
      expect(mail.html).toContain(url);
      // A fragment is never sent to a server, so the token stays out of the
      // client app's access logs and Referer headers.
      expect(url.indexOf("#")).toBeLessThan(url.indexOf(token));
      expect(mail.subject).toBeTruthy();
    }
  });
});

describe("delivery", () => {
  test("is configured in this environment, and a successful send reports it", async () => {
    expect(isConfigured()).toBe(true);
    await expect(sendEmail({ to: "a@example.com", subject: "s", text: "t", html: "<p>t</p>" })).resolves.toEqual({
      sent: true,
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].from).toBe(env.email.from);
  });

  test("a transient failure is retried once; a persistent one resolves instead of throwing", async () => {
    sendMail.mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValueOnce({ messageId: "ok" });
    await expect(sendEmail({ to: "a@example.com", subject: "s", text: "t" })).resolves.toEqual({ sent: true });
    expect(sendMail).toHaveBeenCalledTimes(2);

    sendMail.mockReset();
    sendMail.mockRejectedValue(Object.assign(new Error("connection timed out"), { code: "ETIMEDOUT" }));
    await expect(sendEmail({ to: "a@example.com", subject: "s", text: "t" })).resolves.toEqual({
      sent: false,
      reason: "ETIMEDOUT",
    });
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  test("a failure logs the outcome and the recipient domain — never the body, address or credentials", async () => {
    const token = "c".repeat(64);
    const mail = templates.resetPassword({ firstName: "Ada", token });
    sendMail.mockRejectedValue(new Error("550 mailbox unavailable"));

    const logs = await captureLogs(() => sendEmail({ to: "ada@example.com", ...mail }));

    expect(logs).toContain("Failed to send email");
    expect(logs).toContain("example.com");
    expect(logs).not.toContain(token);
    expect(logs).not.toContain("ada@example.com");
    expect(logs).not.toContain(env.email.pass);
    expect(logs).not.toContain(mail.text);
  });
});

describe("authentication flows survive a mail outage", () => {
  test("registration still creates the account and its verification token when SMTP is down", async () => {
    sendMail.mockRejectedValue(new Error("SMTP unreachable"));

    const { res, user, accessToken } = await registerUser({}, { verified: false });
    const logs = await captureLogs(async () => {
      // The send is fire-and-forget; give it both attempts before asserting.
      await waitFor(() => sendMail.mock.calls.length >= 2, { timeoutMs: 8000 });
    });

    expect(res.status).toBe(201);
    // Durable state, not a misleading failure: the user exists, holds a
    // session, and has an unused verification token to retry against.
    expect((await request(app).get("/api/v1/users/me").set("Authorization", `Bearer ${accessToken}`)).status).toBe(200);
    expect(await AuthToken.exists({ user: user._id, purpose: "email_verification", usedAt: null })).toBeTruthy();
    expect(logs).not.toMatch(/[0-9a-f]{64}/);
  });

  test("a failed password-reset mail leaves no error to the caller and no token in the logs", async () => {
    const { user } = await registerUser();
    sendMail.mockRejectedValue(new Error("SMTP unreachable"));

    const logs = await captureLogs(async () => {
      await request(app).post("/api/v1/auth/forgot-password").send({ email: user.email }).expect(200);
      await waitFor(() => sendMail.mock.calls.length >= 2, { timeoutMs: 8000 });
    });

    const stored = await AuthToken.findOne({ user: user._id, purpose: "password_reset" });
    expect(stored).toBeTruthy();
    expect(logs).not.toMatch(/[0-9a-f]{64}/); // neither the raw token nor its hash
    expect(logs).not.toContain(stored.tokenHash);
  });

  test("the raw token is never logged on the happy path either", async () => {
    const logs = await captureLogs(async () => {
      const { user } = await registerUser({}, { verified: false });
      await waitFor(() => sendMail.mock.calls.some((c) => c[0].to === user.email));
    });
    expect(logs).not.toMatch(/#token=/);
    expect(logs).not.toMatch(/[0-9a-f]{64}/);
  });
});
