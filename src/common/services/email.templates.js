const env = require("../../config/env");

// Every value interpolated into the HTML goes through this. Names come from
// user input, so without escaping a display name like
// `<img src=x onerror=...>` would be live markup in someone's inbox.
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Links are built from APP_URL (the client app), never from request input, so
// a forged Host header cannot turn a reset mail into a phishing link. The token
// sits in the URL fragment: browsers do not send fragments to servers, so it
// stays out of the client app's access logs and Referer headers.
const actionLink = (path, token) => `${env.appUrl}${path}#token=${token}`;

function layout({ heading, greetingName, paragraphs, action, footer }) {
  const safeParagraphs = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n      ");
  const button = action
    ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 18px;background:#1a56db;color:#ffffff;text-decoration:none;border-radius:4px">${escapeHtml(action.label)}</a></p>
      <p style="font-size:12px;color:#555">If the button does not work, copy this link into your browser:<br>${escapeHtml(action.url)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
  <body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
    <div style="max-width:560px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 16px">${escapeHtml(heading)}</h2>
      <p>Hi ${escapeHtml(greetingName || "there")},</p>
      ${safeParagraphs}
      ${button}
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
      <p style="font-size:12px;color:#555">${escapeHtml(footer)}</p>
    </div>
  </body>
</html>`;
}

// Each template returns { subject, text, html }: the text part is the fallback
// for clients that do not render HTML, and both carry the same link.
function verifyEmail({ firstName, token }) {
  const url = actionLink("/verify-email", token);
  return {
    subject: "Confirm your email address",
    text: `Hi ${firstName || "there"},\n\nConfirm your email address (link valid for 24 hours):\n${url}\n\nIf you did not create an account, ignore this email.`,
    html: layout({
      heading: "Confirm your email address",
      greetingName: firstName,
      paragraphs: [
        "Please confirm your email address to finish setting up your account. This link is valid for 24 hours.",
      ],
      action: { url, label: "Confirm email" },
      footer: "If you did not create an account, you can ignore this email.",
    }),
  };
}

function resetPassword({ firstName, token }) {
  const url = actionLink("/reset-password", token);
  return {
    subject: "Password reset request",
    text: `Hi ${firstName || "there"},\n\nReset your password (link valid for 1 hour):\n${url}\n\nIf you did not request this, you can ignore this email — your password will not change.`,
    html: layout({
      heading: "Reset your password",
      greetingName: firstName,
      paragraphs: [
        "We received a request to reset your password. This link is valid for one hour and can be used once.",
      ],
      action: { url, label: "Reset password" },
      footer: "If you did not request this, ignore this email — your password will not change.",
    }),
  };
}

module.exports = { verifyEmail, resetPassword, escapeHtml, actionLink };
