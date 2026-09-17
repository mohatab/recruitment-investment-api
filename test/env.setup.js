// Runs before the test framework is installed and before any test file's
// own requires — so config/env.js sees NODE_ENV=test the very first time
// anything requires it.
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

// File-upload tests exercise the real local storage driver (multer memory
// storage -> disk write) — point it at the OS temp dir instead of the
// project's own uploads/, so running the suite never litters the repo with
// test-generated files (it's gitignored either way, but a clean working
// tree beats relying on that).
const path = require("path");
const os = require("os");
process.env.UPLOAD_DIR = path.join(os.tmpdir(), "recruitment-investment-test-uploads");
