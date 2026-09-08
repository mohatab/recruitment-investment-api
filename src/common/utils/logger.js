// Minimal leveled/structured logger. A project this size doesn't justify a
// pino/winston dependency; this gives levels + JSON-ish structured fields
// with the same call shape (logger.info(msg, meta)) so swapping one in later
// is a one-file change if volume ever demands it.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const env = require("../../config/env");

const currentLevel = LEVELS[env.logLevel] ?? LEVELS.info;

function log(level, message, meta) {
  if (LEVELS[level] > currentLevel) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

module.exports = {
  error: (message, meta) => log("error", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  info: (message, meta) => log("info", message, meta),
  debug: (message, meta) => log("debug", message, meta),
};
