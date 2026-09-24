const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const swaggerUi = require("swagger-ui-express");

const env = require("./config/env");
const swaggerSpec = require("./docs/swagger");
const requestId = require("./common/middleware/requestId");
const requestLogger = require("./common/middleware/requestLogger");
const { apiLimiter } = require("./common/middleware/rateLimiter");
const { errorHandler, notFound } = require("./common/middleware/errorHandler");

const authRoutes = require("./modules/auth/auth.routes");
const userRoutes = require("./modules/users/user.routes");
const jobRoutes = require("./modules/recruitment/jobs/job.routes");
const applicationsTopRoutes = require("./modules/recruitment/applications/application.top-level.routes");
const startupRoutes = require("./modules/investment/startups/startup.routes");
const investorRoutes = require("./modules/investment/investors/investor.routes");
const investmentRoutes = require("./modules/investment/investments/investment.routes");
const paymentWebhookRoutes = require("./modules/payments/payment.webhook.routes");
const notificationRoutes = require("./modules/notifications/notification.routes");
const messageRoutes = require("./modules/messaging/message.routes");
const experienceRoutes = require("./modules/experience/experience.routes");
const contactRoutes = require("./modules/contact/contact.routes");
const healthRoutes = require("./modules/health/health.routes");

const app = express();

// Every application route lives under /api/v1. Health probes deliberately sit
// outside it: they are infrastructure endpoints for orchestrators, not part of
// the versioned product API, and must not move when v2 arrives.
const API = "/api/v1";

app.set("trust proxy", env.trustProxy); // default off — see TRUST_PROXY in config/env.js
app.use(requestId);
app.use(requestLogger);
app.use(helmet());
// Helmet sets no Permissions-Policy. This API needs none of these features,
// and neither does the Swagger UI page it serves, so they are switched off for
// this origin and anything it embeds.
app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  next();
});
// A wildcard origin is only safe here because auth is a bearer token in an
// Authorization header, never a cookie — `credentials: true` is never set,
// so this doesn't expose cookie-authenticated responses to arbitrary sites.
// Set CORS_ORIGIN to a real allowlist for a deployment that adds cookies.
app.use(cors({ origin: env.corsOrigin }));

// Probes are mounted before the rate limiter so frequent orchestrator checks
// can never be throttled into a false "unhealthy".
app.use(healthRoutes);

// Stripe webhook signatures are computed over the raw body, so this route
// must get the unparsed body — it's mounted before express.json() runs.
app.use(`${API}/payments`, express.raw({ type: "application/json" }), paymentWebhookRoutes);

app.use(express.json({ limit: "1mb" }));
app.use(mongoSanitize()); // strips `$`/`.` keys from req.body/query/params — blocks NoSQL operator injection
app.use(apiLimiter);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(`${API}/auth`, authRoutes);
app.use(`${API}/users`, userRoutes);
app.use(`${API}/jobs`, jobRoutes);
app.use(`${API}/applications`, applicationsTopRoutes);
app.use(`${API}/startups`, startupRoutes);
app.use(`${API}/investors`, investorRoutes);
app.use(`${API}/investments`, investmentRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/messages`, messageRoutes);
app.use(`${API}/experiences`, experienceRoutes);
app.use(`${API}/contact`, contactRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
