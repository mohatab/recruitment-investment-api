require("dotenv").config();

const required = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "MONGODB_URI"];

// Fail fast on missing secrets instead of silently booting with an insecure
// default — a known secret lets anyone forge valid auth tokens.
if (process.env.NODE_ENV !== "test") {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`Missing required environment variable(s): ${missing.join(", ")}. Refusing to start.`);
    process.exit(1);
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 3000,
  logLevel: process.env.LOG_LEVEL || "info",
  baseUrl: process.env.BASE_URL || "http://localhost:3000",

  mongoUri:
    process.env.MONGODB_URI ||
    (process.env.NODE_ENV === "test" ? undefined : "mongodb://localhost:27017/recruitment-investment"),

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "test-access-secret",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "test-refresh-secret",
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresInDays: Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS) || 7,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },

  email: {
    host: process.env.SMTP_HOST,
    service: process.env.SMTP_SERVICE,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  storage: {
    driver: process.env.STORAGE_DRIVER || "local",
    uploadDir: process.env.UPLOAD_DIR || "uploads",
    s3: {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      endpoint: process.env.S3_ENDPOINT, // for S3-compatible providers (R2, MinIO, ...)
    },
  },

  corsOrigin: process.env.CORS_ORIGIN || "*",
};

module.exports = env;
