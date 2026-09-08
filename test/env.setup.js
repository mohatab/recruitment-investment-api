// Runs before the test framework is installed and before any test file's
// own requires — so config/env.js sees NODE_ENV=test the very first time
// anything requires it.
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
