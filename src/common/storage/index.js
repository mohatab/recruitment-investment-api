const env = require("../../config/env");
const local = require("./localStorage");
const s3 = require("./s3Storage");

// Swappable at deploy time via STORAGE_DRIVER — local disk for development
// (no cloud account required to run the project), S3-compatible object
// storage (AWS S3, Cloudflare R2, MinIO, ...) for production.
module.exports = env.storage.driver === "s3" ? s3 : local;
