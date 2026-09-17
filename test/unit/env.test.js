const { loadEnv } = require("../../src/config/env");

const DEV = {
  NODE_ENV: "development",
  MONGODB_URI: "mongodb://localhost:27017/app",
  JWT_ACCESS_SECRET: "dev-access",
  JWT_REFRESH_SECRET: "dev-refresh",
};

const PROD = {
  ...DEV,
  NODE_ENV: "production",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  CORS_ORIGIN: "https://app.example.com, https://admin.example.com",
  APP_URL: "https://app.example.com/",
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "mailer",
  SMTP_PASS: "pw",
};

const errorOf = (source) => {
  try {
    loadEnv(source);
  } catch (err) {
    return err.message;
  }
  throw new Error("expected loadEnv to throw");
};

describe("environment validation", () => {
  test("a minimal development config gets safe defaults", () => {
    const env = loadEnv(DEV);
    expect(env).toMatchObject({ port: 3000, trustProxy: false, rateLimitEnabled: true, corsOrigin: "*" });
  });

  test("reports every missing required variable at once", () => {
    const message = errorOf({ NODE_ENV: "development" });
    expect(message).toMatch(/MONGODB_URI/);
    expect(message).toMatch(/JWT_ACCESS_SECRET/);
    expect(message).toMatch(/JWT_REFRESH_SECRET/);
  });

  test("blank values count as unset (docker-compose `${VAR:-}`)", () => {
    expect(errorOf({ ...DEV, JWT_ACCESS_SECRET: "" })).toMatch(/JWT_ACCESS_SECRET/);
    expect(loadEnv({ ...DEV, PORT: "" }).port).toBe(3000);
  });

  test("rejects malformed values", () => {
    expect(errorOf({ ...DEV, PORT: "not-a-port" })).toMatch(/PORT/);
    expect(errorOf({ ...DEV, MONGODB_URI: "postgres://x" })).toMatch(/MONGODB_URI/);
    expect(errorOf({ ...DEV, NODE_ENV: "prod" })).toMatch(/NODE_ENV/);
  });

  test("access and refresh secrets must differ", () => {
    expect(errorOf({ ...DEV, JWT_REFRESH_SECRET: DEV.JWT_ACCESS_SECRET })).toMatch(/must differ/);
  });

  test("the test environment does not require MONGODB_URI (the in-memory server supplies it)", () => {
    const { MONGODB_URI, ...rest } = DEV; // eslint-disable-line no-unused-vars
    expect(() => loadEnv({ ...rest, NODE_ENV: "test" })).not.toThrow();
  });

  test("production requires a CORS allowlist, Stripe, SMTP and 32+ char secrets", () => {
    const message = errorOf({ ...DEV, NODE_ENV: "production", CORS_ORIGIN: "*" });
    for (const key of [
      "CORS_ORIGIN",
      "JWT_ACCESS_SECRET",
      "JWT_REFRESH_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "SMTP_USER",
      "APP_URL",
    ]) {
      expect(message).toMatch(key);
    }
  });

  test("a complete production config parses the CORS allowlist and normalizes APP_URL", () => {
    const env = loadEnv(PROD);
    expect(env.corsOrigin).toEqual(["https://app.example.com", "https://admin.example.com"]);
    expect(env.appUrl).toBe("https://app.example.com");
  });

  test("TRUST_PROXY defaults off and accepts boolean, hop count, or a named preset", () => {
    expect(loadEnv(DEV).trustProxy).toBe(false);
    expect(loadEnv({ ...DEV, TRUST_PROXY: "false" }).trustProxy).toBe(false);
    expect(loadEnv({ ...DEV, TRUST_PROXY: "1" }).trustProxy).toBe(1);
    expect(loadEnv({ ...DEV, TRUST_PROXY: "loopback" }).trustProxy).toBe("loopback");
  });

  test("the S3 driver requires its bucket credentials", () => {
    expect(errorOf({ ...DEV, STORAGE_DRIVER: "s3" })).toMatch(/S3_BUCKET/);
  });
});
