// Introspects the real Express routers so tests can check the authorization
// policy of *every* route (and that Swagger documents it) without keeping a
// hand-written list that silently drifts when a route is added.
const app = require("../src/app");

const MOUNTS = [
  ["", "../src/modules/health/health.routes"],
  ["/api/auth", "../src/modules/auth/auth.routes"],
  ["/api/users", "../src/modules/users/user.routes"],
  ["/api/jobs", "../src/modules/recruitment/jobs/job.routes"],
  ["/api/applications", "../src/modules/recruitment/applications/applications.top.routes"],
  ["/api/startups", "../src/modules/investment/startups/startup.routes"],
  ["/api/investors", "../src/modules/investment/investors/investor.routes"],
  ["/api/investments", "../src/modules/investment/investments/investment.routes"],
  ["/api/payments", "../src/modules/payments/payment.webhook.routes"],
  ["/api/notifications", "../src/modules/notifications/notification.routes"],
  ["/api/messages", "../src/modules/messaging/message.routes"],
  ["/api/experiences", "../src/modules/experience/experience.routes"],
  ["/api/contact", "../src/modules/contact/contact.routes"],
].map(([prefix, file]) => [prefix, require(file)]);

// Express 4 keeps no path string for router.use() mounts, so nested routers
// are declared here; an undeclared one fails loudly below.
const NESTED = new Map([
  [require("../src/modules/recruitment/applications/application.routes"), "/:jobId/applications"],
]);

function walk(router, prefix, inherited, out) {
  const middleware = [...inherited];
  for (const layer of router.stack) {
    if (layer.route) {
      const chain = [...middleware, ...layer.route.stack.map((l) => l.handle)];
      const path = `${prefix}${layer.route.path === "/" ? "" : layer.route.path}` || "/";
      for (const method of Object.keys(layer.route.methods)) {
        const gate = chain.find((fn) => fn.name === "authorizeRoles");
        out.push({
          method: method.toUpperCase(),
          path,
          openapiPath: path.replace(/:([A-Za-z0-9_]+)/g, "{$1}"),
          authenticated: chain.some((fn) => fn.name === "authenticate"),
          roles: gate ? [...gate.roles].sort() : null,
          requiresVerifiedEmail: chain.some((fn) => fn.name === "requireVerifiedEmail"),
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
