const logger = require("../utils/logger");

// One structured access-log line per request, written when the response
// finishes. Deliberately logs no query string, headers or body: tokens, reset
// links and PII live there.
module.exports = function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const status = res.statusCode;
    let level = "info";
    if (req.path.startsWith("/health"))
      level = status >= 500 ? "warn" : "debug"; // frequent; not-ready is expected
    else if (status >= 500) level = "error";
    else if (status >= 400) level = "warn";

    logger[level]("request completed", {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      route: req.route ? `${req.baseUrl}${req.route.path}` : undefined,
      status,
      durationMs: Number((process.hrtime.bigint() - start) / 1000n) / 1000,
      userId: req.user?.id,
      errorCode: res.locals.errorCode,
    });
  });
  next();
};
