// Introspects the real Express routers so tests can check the authorization
// policy of *every* route (and that Swagger documents it) without keeping a
// hand-written list that silently drifts when a route is added.
const app = require("../src/app");

const MOUNTS = [
  ["", "../src/modules/health/health.routes"],
  ["/api/v1/auth", "../src/modules/auth/auth.routes"],
  ["/api/v1/users", "../src/modules/users/user.routes"],
  ["/api/v1/jobs", "../src/modules/recruitment/jobs/job.routes"],
  ["/api/v1/applications", "../src/modules/recruitment/applications/applications.top.routes"],
  ["/api/v1/startups", "../src/modules/investment/startups/startup.routes"],
  ["/api/v1/investors", "../src/modules/investment/investors/investor.routes"],
  ["/api/v1/investments", "../src/modules/investment/investments/investment.routes"],
  ["/api/v1/payments", "../src/modules/payments/payment.webhook.routes"],
  ["/api/v1/notifications", "../src/modules/notifications/notification.routes"],
  ["/api/v1/messages", "../src/modules/messaging/message.routes"],
  ["/api/v1/experiences", "../src/modules/experience/experience.routes"],
  ["/api/v1/contact", "../src/modules/contact/contact.routes"],
].map(([prefix, file]) => [prefix, require(file)]);

// Express 4 keeps no path string for router.use() mounts, so nested routers
// are declared here; an undeclared one fails loudly below.
const NESTED = new Map([
  [require("../src/modules/recruitment/applications/application.routes"), "/:jobId/applications"],
]);

// Joi describe(): a key declared with .forbidden() is present but may never be
// sent, so it is not an accepted parameter.
function acceptedKeys(schema) {
  const described = schema.describe();
  return Object.entries(described.keys || {})
    .filter(([, value]) => value.flags?.presence !== "forbidden")
    .map(([key]) => key);
}

function requiredKeys(schema) {
  const described = schema.describe();
  return Object.entries(described.keys || {})
    .filter(([, value]) => value.flags?.presence === "required")
    .map(([key]) => key);
}

function walk(router, prefix, inherited, out) {
  const middleware = [...inherited];
  for (const layer of router.stack) {
    if (layer.route) {
      const chain = [...middleware, ...layer.route.stack.map((l) => l.handle)];
      const path = `${prefix}${layer.route.path === "/" ? "" : layer.route.path}` || "/";
      for (const method of Object.keys(layer.route.methods)) {
        const gate = chain.find((fn) => fn.name === "authorizeRoles");
        const queryValidator = chain.find((fn) => fn.name === "validateRequest" && fn.property === "query");
        const bodyValidator = chain.find((fn) => fn.name === "validateRequest" && fn.property === "body");
        out.push({
          method: method.toUpperCase(),
          path,
          openapiPath: path.replace(/:([A-Za-z0-9_]+)/g, "{$1}"),
          authenticated: chain.some((fn) => fn.name === "authenticate"),
          roles: gate ? [...gate.roles].sort() : null,
          requiresVerifiedEmail: chain.some((fn) => fn.name === "requireVerifiedEmail"),
          // The query keys this route really accepts (a forbidden key is not
          // accepted), or null when it validates no query at all.
          queryKeys: queryValidator ? acceptedKeys(queryValidator.schema) : null,
          // Likewise for the request body: the keys a client may send, and
          // which of them the schema insists on.
          bodyKeys: bodyValidator ? acceptedKeys(bodyValidator.schema) : null,
          requiredBodyKeys: bodyValidator ? requiredKeys(bodyValidator.schema) : null,
          // The strictest rate-limit policy guarding this route, if any.
          rateLimit: chain
            .filter((fn) => fn.limitPolicy)
            .map((fn) => fn.limitPolicy.limit)
            .sort((a, b) => a - b)[0],
        });
      }
    } else if (layer.handle.stack) {
      if (!NESTED.has(layer.handle)) throw new Error(`Unknown nested router under ${prefix}; add it to NESTED`);
      walk(layer.handle, prefix + NESTED.get(layer.handle), middleware, out);
    } else {
      middleware.push(layer.handle);
    }
  }
  return out;
}

function collectRoutes() {
  // Every router the app mounts must be listed in MOUNTS (identity check).
  const mounted = app._router.stack.filter((l) => l.handle.stack && l.name === "router").map((l) => l.handle);
  const known = new Set(MOUNTS.map(([, r]) => r));
  const unknown = mounted.filter((r) => !known.has(r));
  if (unknown.length) throw new Error(`${unknown.length} router(s) mounted in app.js are missing from test/routes.js`);

  return MOUNTS.flatMap(([prefix, router]) => walk(router, prefix, [], []));
}

module.exports = { collectRoutes };
