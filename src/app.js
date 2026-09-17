const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const swaggerUi = require("swagger-ui-express");

const env = require("./config/env");
const swaggerSpec = require("./docs/swagger");
const requestId = require("./common/middleware/requestId");
const { apiLimiter } = require("./common/middleware/rateLimiter");
const { errorHandler, notFound } = require("./common/middleware/errorHandler");
const localStorage = require("./common/storage/localStorage");

const authRoutes = require("./modules/auth/auth.routes");
const userRoutes = require("./modules/users/user.routes");
const jobRoutes = require("./modules/recruitment/jobs/job.routes");
const applicationsTopRoutes = require("./modules/recruitment/applications/applications.top.routes");
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

app.set("trust proxy", 1);
app.use(requestId);
app.use(helmet());
// A wildcard origin is only safe here because auth is a bearer token in an
// Authorization header, never a cookie — `credentials: true` is never set,
// so this doesn't expose cookie-authenticated responses to arbitrary sites.
// Set CORS_ORIGIN to a real allowlist for a deployment that adds cookies.
app.use(cors({ origin: env.corsOrigin }));

// Stripe webhook signatures are computed over the raw body, so this route
// must get the unparsed body — it's mounted before express.json() runs.
app.use("/api/payments", express.raw({ type: "application/json" }), paymentWebhookRoutes);

app.use(express.json({ limit: "1mb" }));
app.use(mongoSanitize()); // strips `$`/`.` keys from req.body/query/params — blocks NoSQL operator injection
app.use(apiLimiter);

app.use("/uploads", express.static(localStorage.rootDir));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationsTopRoutes);
app.use("/api/startups", startupRoutes);
app.use("/api/investors", investorRoutes);
app.use("/api/investments", investmentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/experiences", experienceRoutes);
app.use("/api/contact", contactRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
