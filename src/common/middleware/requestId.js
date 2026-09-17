const crypto = require("crypto");

// A client/proxy-supplied id is reused for cross-service correlation, but only
// if it looks like an id — otherwise it's attacker-controlled text flowing
// into every log line and response header.
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

module.exports = function requestId(req, res, next) {
  const incoming = req.headers["x-request-id"];
  req.id = typeof incoming === "string" && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
};
