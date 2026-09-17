// Asserts the generated OpenAPI spec actually documents every implemented
// route — not by hand-maintaining a duplicate list (which would silently
// drift the moment someone adds a route and forgets Swagger), but by
// introspecting the real Express router objects the app mounts and
// diffing that against `swaggerSpec.paths`.
const swaggerSpec = require("../../src/docs/swagger");

const authRoutes = require("../../src/modules/auth/auth.routes");
const userRoutes = require("../../src/modules/users/user.routes");
const jobRoutes = require("../../src/modules/recruitment/jobs/job.routes");
const applicationsTopRoutes = require("../../src/modules/recruitment/applications/applications.top.routes");
const startupRoutes = require("../../src/modules/investment/startups/startup.routes");
const investorRoutes = require("../../src/modules/investment/investors/investor.routes");
const investmentRoutes = require("../../src/modules/investment/investments/investment.routes");
const paymentWebhookRoutes = require("../../src/modules/payments/payment.webhook.routes");
const notificationRoutes = require("../../src/modules/notifications/notification.routes");
const messageRoutes = require("../../src/modules/messaging/message.routes");
const experienceRoutes = require("../../src/modules/experience/experience.routes");
const contactRoutes = require("../../src/modules/contact/contact.routes");
const healthRoutes = require("../../src/modules/health/health.routes");

// Converts Express's `:param` route syntax to OpenAPI's `{param}`.
function toOpenApiPath(expressPath) {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

// One level of router.stack, no nested-router recursion needed — this
// mirrors exactly how app.js mounts each module (a flat list of routers,
// with jobs/applications being the one nested case, handled explicitly
// below rather than generically decoding Express's internal route regexps).
function routesOf(router, prefix) {
  return router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) =>
      Object.keys(layer.route.methods).map(
        (method) =>
          `${method.toUpperCase()} ${prefix}${toOpenApiPath(layer.route.path === "/" ? "" : layer.route.path)}`
      )
    );
}

describe("Swagger contract", () => {
  test("every implemented route is documented in the generated OpenAPI spec", () => {
    const implemented = [
      ...routesOf(healthRoutes, ""),
      ...routesOf(authRoutes, "/api/auth"),
      ...routesOf(userRoutes, "/api/users"),
      ...routesOf(jobRoutes, "/api/jobs"),
      // job.routes.js mounts application.routes.js at /:jobId/applications
      ...jobRoutes.stack
        .filter((layer) => !layer.route && layer.name !== "bound dispatch")
        .flatMap((layer) =>
          layer.handle.stack
            .filter((l) => l.route)
            .flatMap((l) =>
              Object.keys(l.route.methods).map(
                (m) =>
                  `${m.toUpperCase()} /api/jobs/{jobId}/applications${toOpenApiPath(l.route.path === "/" ? "" : l.route.path)}`
              )
            )
        ),
      ...routesOf(applicationsTopRoutes, "/api/applications"),
      ...routesOf(startupRoutes, "/api/startups"),
      ...routesOf(investorRoutes, "/api/investors"),
      ...routesOf(investmentRoutes, "/api/investments"),
      ...routesOf(paymentWebhookRoutes, "/api/payments"),
      ...routesOf(notificationRoutes, "/api/notifications"),
      ...routesOf(messageRoutes, "/api/messages"),
      ...routesOf(experienceRoutes, "/api/experiences"),
      ...routesOf(contactRoutes, "/api/contact"),
    ];

    expect(implemented.length).toBeGreaterThan(40); // sanity check the introspection itself found routes

    const documented = new Set();
    for (const [path, methodsObj] of Object.entries(swaggerSpec.paths || {})) {
      for (const method of Object.keys(methodsObj)) {
        documented.add(`${method.toUpperCase()} ${path}`);
      }
    }

    const undocumented = implemented.filter((route) => !documented.has(route));
    expect(undocumented).toEqual([]);
  });

  test("every $ref in the spec resolves to a real component (no broken references)", () => {
    const broken = [];

    function resolves(ref) {
      // "#/components/schemas/User" -> ["components", "schemas", "User"]
      const path = ref.replace(/^#\//, "").split("/");
      let node = swaggerSpec;
      for (const segment of path) {
        node = node?.[segment];
        if (node === undefined) return false;
      }
      return true;
    }

    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        if (typeof node.$ref === "string" && !resolves(node.$ref)) broken.push(node.$ref);
        Object.values(node).forEach(walk);
      }
    }
    walk(swaggerSpec);

    expect(broken).toEqual([]);
  });
});
