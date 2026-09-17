// Escapes regex metacharacters in user-supplied search input before it's
// used to build a RegExp. Without this, a query param like `?role=(a+)+$`
// becomes an attacker-controlled pattern run against every document on
// every matching request — a regex-DoS (catastrophic backtracking), not
// just a correctness bug.
module.exports = function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
