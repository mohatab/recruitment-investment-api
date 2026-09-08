const nodemailer = require("nodemailer");
const env = require("../../config/env");
const logger = require("../utils/logger");

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  // `service` (e.g. "gmail") and an explicit `host` are mutually exclusive
  // in Nodemailer — the original code passed both, which silently picks
  // one and ignores the other. Prefer an explicit host when given.
  transporter = env.email.host
    ? nodemailer.createTransport({
        host: env.email.host,
        port: 587,
        secure: false,
        auth: { user: env.email.user, pass: env.email.pass },
      })
    : nodemailer.createTransport({
        service: env.email.service,
        auth: { user: env.email.user, pass: env.email.pass },
      });
  return transporter;
}

async function sendEmail({ to, subject, text, html }) {
  if (!env.email.user || !env.email.pass) {
    logger.warn("Email not configured — skipping send", { to, subject });
    return;
  }
  try {
    await getTransporter().sendMail({ from: env.email.user, to, subject, text, html });
  } catch (err) {
    // Email delivery failing must never crash the request that triggered it
    // (e.g. registration) — log and move on.
    logger.error("Failed to send email", { to, subject, error: err.message });
  }
}

module.exports = { sendEmail };
