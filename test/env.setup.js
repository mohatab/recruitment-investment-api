// Runs before the test framework is installed and before any test file's
// own requires — so config/env.js sees NODE_ENV=test the very first time
// anything requires it.
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
// The suite registers/logs in dozens of users per file; the limiters
// themselves are exercised by test/integration/rate-limit.test.js, which
// turns this back on.
process.env.RATE_LIMIT_ENABLED = "false";
// Access logs at info would drown test output; 5xx errors still print.
process.env.LOG_LEVEL = "error";

// File-upload tests exercise the real local storage driver (multer memory
// storage -> disk write) — point it at the OS temp dir instead of the
// project's own uploads/, so running the suite never litters the repo with
// test-generated files (it's gitignored either way, but a clean working
// tree beats relying on that).
const path = require("path");
const os = require("os");
process.env.UPLOAD_DIR = path.join(os.tmpdir(), "recruitment-investment-test-uploads");
