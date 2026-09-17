require("dotenv").config();
const Joi = require("joi");

const secret = Joi.string().min(32);

// Only the variables the app actually reads. Anything production needs to be
// safe/functional is required there, so a misconfigured deploy fails at boot
// instead of at the first payment or password reset.
const schema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "production", "test").default("development"),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string().valid("error", "warn", "info", "debug").default("info"),
  BASE_URL: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .default("http://localhost:3000"),
  // Comma-separated allowlist. "*" is tolerated outside production only.
  CORS_ORIGIN: Joi.string().when("NODE_ENV", {
    is: "production",
    then: Joi.string().required().invalid("*"),
    otherwise: Joi.string().default("*"),
  }),
  // Express "trust proxy": off by default. Only enable when a reverse proxy
  // you control overwrites X-Forwarded-For — otherwise any client can spoof its
  // IP and walk straight past every rate limiter.
  TRUST_PROXY: Joi.alternatives(Joi.boolean(), Joi.number().integer().min(0), Joi.string()).default(false),
  RATE_LIMIT_ENABLED: Joi.boolean().default(true),

  MONGODB_URI: Joi.string()
    .uri({ scheme: ["mongodb", "mongodb+srv"] })
    .when("NODE_ENV", { is: "test", otherwise: Joi.string().required() }),

  JWT_ACCESS_SECRET: Joi.string().required().when("NODE_ENV", { is: "production", then: secret }),
  JWT_REFRESH_SECRET: Joi.string()
    .required()
    .invalid(Joi.ref("JWT_ACCESS_SECRET"))
    .when("NODE_ENV", { is: "production", then: secret })
    .messages({ "any.invalid": '"JWT_REFRESH_SECRET" must differ from "JWT_ACCESS_SECRET"' }),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN_DAYS: Joi.number().integer().min(1).default(7),

  STRIPE_SECRET_KEY: Joi.string().when("NODE_ENV", { is: "production", then: Joi.string().required() }),
  STRIPE_WEBHOOK_SECRET: Joi.string().when("NODE_ENV", { is: "production", then: Joi.string().required() }),

  SMTP_HOST: Joi.string(),
  SMTP_SERVICE: Joi.string(),
  SMTP_USER: Joi.string().when("NODE_ENV", { is: "production", then: Joi.string().required() }),
  SMTP_PASS: Joi.string().when("NODE_ENV", { is: "production", then: Joi.string().required() }),

  STORAGE_DRIVER: Joi.string().valid("local", "s3").default("local"),
  UPLOAD_DIR: Joi.string().default("uploads"),
  S3_BUCKET: Joi.string().when("STORAGE_DRIVER", { is: "s3", then: Joi.string().required() }),
  S3_REGION: Joi.string().when("STORAGE_DRIVER", { is: "s3", then: Joi.string().required() }),
  S3_ACCESS_KEY_ID: Joi.string().when("STORAGE_DRIVER", { is: "s3", then: Joi.string().required() }),
  S3_SECRET_ACCESS_KEY: Joi.string().when("STORAGE_DRIVER", { is: "s3", then: Joi.string().required() }),
  S3_ENDPOINT: Joi.string().uri(),
})
  .with("SMTP_USER", "SMTP_PASS")
  .oxor("SMTP_HOST", "SMTP_SERVICE")
  .unknown(true);

// "" means "unset" (docker-compose `${VAR:-}` and blank .env lines produce it).
function withoutBlanks(source) {
  return Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ""));
}

// Pure: validates a source object and returns the config, or throws listing
// every problem at once. Exported so tests can exercise it without a process.
function loadEnv(source = process.env) {
  const { error, value: v } = schema.validate(withoutBlanks(source), { abortEarly: false, convert: true });
  if (error) {
    const err = new Error(
      `Invalid environment configuration:\n  - ${error.details.map((d) => d.message).join("\n  - ")}`
    );
    err.name = "EnvValidationError";
    throw err;
  }

  return {
    nodeEnv: v.NODE_ENV,
    port: v.PORT,
    logLevel: v.LOG_LEVEL,
    baseUrl: v.BASE_URL,
    corsOrigin: v.CORS_ORIGIN === "*" ? "*" : v.CORS_ORIGIN.split(",").map((o) => o.trim()),
    trustProxy: v.TRUST_PROXY,
    rateLimitEnabled: v.RATE_LIMIT_ENABLED,
    mongoUri: v.MONGODB_URI,
    jwt: {
      accessSecret: v.JWT_ACCESS_SECRET,
      refreshSecret: v.JWT_REFRESH_SECRET,
      accessExpiresIn: v.JWT_ACCESS_EXPIRES_IN,
      refreshExpiresInDays: v.JWT_REFRESH_EXPIRES_IN_DAYS,
    },
    stripe: { secretKey: v.STRIPE_SECRET_KEY || "", webhookSecret: v.STRIPE_WEBHOOK_SECRET || "" },
    email: { host: v.SMTP_HOST, service: v.SMTP_SERVICE, user: v.SMTP_USER, pass: v.SMTP_PASS },
    storage: {
      driver: v.STORAGE_DRIVER,
      uploadDir: v.UPLOAD_DIR,
      s3: {
        bucket: v.S3_BUCKET,
        region: v.S3_REGION,
        accessKeyId: v.S3_ACCESS_KEY_ID,
        secretAccessKey: v.S3_SECRET_ACCESS_KEY,
        endpoint: v.S3_ENDPOINT, // for S3-compatible providers (R2, MinIO, ...)
      },
    },
  };
}

let env;
try {
  env = loadEnv();
} catch (err) {
  // The logger depends on this module, so this one message goes straight to stderr.
  console.error(`${err.message}\nRefusing to start. See .env.example.`);
  process.exit(1);
}

module.exports = env;
module.exports.loadEnv = loadEnv;
