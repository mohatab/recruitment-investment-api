const nodemailer = require("nodemailer");
const env = require("../../config/env");
const logger = require("../utils/logger");

// Bounded so a hung SMTP server cannot tie up a request or a background job
// indefinitely — nodemailer otherwise waits on the socket forever.
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };
const RETRY_DELAY_MS = 500;

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  // `service` (e.g. "gmail") and an explicit `host` are mutually exclusive in
  // Nodemailer — passing both silently picks one. Prefer an explicit host.
  transporter = env.email.host
    ? nodemailer.createTransport({
        host: env.email.host,
        port: env.email.port,
        secure: env.email.port === 465,
        auth: { user: env.email.user, pass: env.email.pass },
        ...TIMEOUTS,
      })
    : nodemailer.createTransport({
        service: env.email.service,
        auth: { user: env.email.user, pass: env.email.pass },
        ...TIMEOUTS,
      });
  return transporter;
}

const isConfigured = () => Boolean((env.email.host || env.email.service) && env.email.user && env.email.pass);

// Never throws and never logs the message: subjects and bodies carry reset and
// verification tokens, so only the outcome and the recipient's domain are
// recorded. Callers decide what a failure means for their flow — see the
// "Email failure semantics" section in the README.
//
// One retry covers the common transient case (a dropped connection, a
// greylisting 4xx). Anything beyond that belongs to a real queue, which this
// project does not have; the domain state is durable either way, and the user
// can ask for another email.
async function sendEmail({ to, subject, text, html }) {
  if (!isConfigured()) {
    logger.warn("Email not configured — skipping send", { subject });
    return { sent: false, reason: "not_configured" };
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await getTransporter().sendMail({ from: env.email.from, to, subject, text, html });
      return { sent: true };
    } catch (err) {
      const willRetry = attempt === 1;
      logger.error("Failed to send email", {
        subject,
        recipientDomain: String(to).split("@")[1],
        error: err.message,
        attempt,
        willRetry,
      });
      if (!willRetry) return { sent: false, reason: err.code || "send_failed" };
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  return { sent: false, reason: "send_failed" };
}

module.exports = { sendEmail, isConfigured };
