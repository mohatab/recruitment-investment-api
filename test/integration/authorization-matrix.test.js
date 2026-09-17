// Route-by-route authorization. Routes are enumerated from the real routers
// (test/routes.js), so a route added later is covered automatically. The
// *expected* policy is the documented one in the OpenAPI spec (security,
// x-required-roles, x-requires-verified-email) and the running app is checked
// against it; test/unit/swagger-contract.test.js separately checks that the
// routers declare the same middleware. Removing or loosening a guard therefore
// fails here even though the router "agrees with itself". Resource-level
// (ownership/IDOR) rules are in authorization-ownership.test.js.
const jsonwebtoken = require("jsonwebtoken");
const { app, request } = require("../helpers");
const { collectRoutes } = require("../routes");
const swaggerSpec = require("../../src/docs/swagger");
const User = require("../../src/modules/users/user.model");
const { signAccessToken } = require("../../src/modules/auth/jwt");
const ROLES = require("../../src/common/constants/roles");
const env = require("../../src/config/env");

const ALL_ROLES = Object.values(ROLES);
const routes = collectRoutes().map((r) => {
  const op = swaggerSpec.paths[r.openapiPath]?.[r.method.toLowerCase()];
  if (!op) throw new Error(`${r.method} ${r.path} is undocumented`);
  return {
    method: r.method,
    path: r.path,
    authenticated: op.security.length > 0,
    roles: op["x-required-roles"] || null,
    requiresVerifiedEmail: Boolean(op["x-requires-verified-email"]),
  };
});
const authenticated = routes.filter((r) => r.authenticated);
const roleRestricted = routes.filter((r) => r.roles);
const verifiedOnly = routes.filter((r) => r.requiresVerifiedEmail);
const PLACEHOLDER_ID = "507f1f77bcf86cd799439011";

// A pre-hashed password: these users never log in, so bcrypt cost is skipped.
const HASH = "$2b$10$abcdefghijklmnopqrstuuFvH8Q6Fv1V0Qb0xXxXxXxXxXxXxXxXx";

let tokens;
beforeEach(async () => {
  const docs = [
    ...ALL_ROLES.map((role) => ({ key: role, role, emailVerifiedAt: new Date() })),
    ...ALL_ROLES.map((role) => ({ key: `unverified-${role}`, role, emailVerifiedAt: null })),
    { key: "deactivated", role: ROLES.ADMIN, emailVerifiedAt: new Date(), isActive: false },
    { key: "revoked", role: ROLES.ADMIN, emailVerifiedAt: new Date(), tokenVersion: 1 },
  ];
  const users = await User.insertMany(
    docs.map(({ key, ...fields }) => ({
      firstName: "Matrix",
      lastName: key,
      email: `${key}@matrix.test`,
      password: HASH,
      ...fields,
    }))
  );
  tokens = Object.fromEntries(docs.map((d, i) => [d.key, signAccessToken(users[i])]));
  // A valid token whose session generation (0) predates the user's current one (1).
  tokens.revoked = signAccessToken({ _id: users.at(-1)._id, role: ROLES.ADMIN, tokenVersion: 0 });
  tokens.candidateClaimingAdmin = jsonwebtoken.sign(
    { sub: String(users[0]._id), role: ROLES.ADMIN, ver: 0 },
    env.jwt.accessSecret,
    { algorithm: "HS256", expiresIn: "5m" }
  );
});

function hit(route, token) {
  const path = route.path.replace(/:[A-Za-z0-9_]+/g, PLACEHOLDER_ID);
  const req = request(app)[route.method.toLowerCase()](path);
  if (token) req.set("Authorization", `Bearer ${token}`);
  return route.method === "GET" || route.method === "DELETE" ? req : req.send({});
}

const label = (r) => `${r.method} ${r.path}`;

test("the users inserted for the matrix are the roles the app defines", () => {
  expect(roleRestricted.flatMap((r) => r.roles).every((role) => ALL_ROLES.includes(role))).toBe(true);
});

describe("authentication boundary: every protected route answers 401 without a valid session", () => {
  const sessions = {
    "no Authorization header": () => null,
    "a malformed token": () => "not-a-jwt",
    "a token signed with another secret": () =>
      jsonwebtoken.sign({ sub: PLACEHOLDER_ID, role: ROLES.ADMIN, ver: 0 }, "attacker-secret", { algorithm: "HS256" }),
    "an expired token": () =>
      jsonwebtoken.sign({ sub: PLACEHOLDER_ID, role: ROLES.ADMIN, ver: 0 }, env.jwt.accessSecret, {
        algorithm: "HS256",
        expiresIn: -10,
      }),
    "a token for a user that no longer exists": () =>
      signAccessToken({ _id: PLACEHOLDER_ID, role: ROLES.ADMIN, tokenVersion: 0 }),
    "a deactivated account": () => tokens.deactivated,
    "a revoked session (stale token version)": () => tokens.revoked,
  };

  test.each(authenticated.map((r) => [label(r), r]))("%s", async (_, route) => {
    for (const [name, token] of Object.entries(sessions)) {
      const res = await hit(route, token());
      expect({ session: name, status: res.status, code: res.body.error?.code }).toEqual({
        session: name,
        status: 401,
        code: "UNAUTHORIZED",
      });
    }
  });
});

describe("role boundary: only the required roles get past the role check", () => {
  test.each(roleRestricted.map((r) => [`${label(r)} [${r.roles.join(", ")}]`, r]))("%s", async (_, route) => {
    for (const role of ALL_ROLES) {
      const res = await hit(route, tokens[role]);
      // Allowed roles may still fail later (validation, 404 on the placeholder
      // id) but never on authentication or authorization.
      const blocked = res.status === 401 || res.status === 403;
      expect({ role, blocked, code: blocked ? res.body.error.code : null }).toEqual({
        role,
        blocked: !route.roles.includes(role),
        code: route.roles.includes(role) ? null : "FORBIDDEN",
      });
    }
  });

  test.each(roleRestricted.filter((r) => !r.roles.includes(ROLES.ADMIN)).map((r) => [label(r), r]))(
    "%s: admin is not a superuser for other roles' operations",
    async (_, route) => {
      expect((await hit(route, tokens.admin)).status).toBe(403);
    }
  );
});

describe("the role claim inside a validly signed JWT is not trusted", () => {
  const adminRoutes = roleRestricted.filter((r) => r.roles.includes(ROLES.ADMIN) && !r.roles.includes(ROLES.CANDIDATE));

  test.each(adminRoutes.map((r) => [label(r), r]))(
    "%s rejects a candidate whose token claims admin",
    async (_, route) => {
      const res = await hit(route, tokens.candidateClaimingAdmin);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
  );
});

describe("verified-email boundary", () => {
  test.each(verifiedOnly.map((r) => [label(r), r]))("%s", async (_, route) => {
    for (const role of route.roles) {
      const unverified = await hit(route, tokens[`unverified-${role}`]);
      expect(unverified.status).toBe(403);
      expect(unverified.body.error.code).toBe("EMAIL_NOT_VERIFIED");
      expect((await hit(route, tokens[role])).body.error?.code).not.toBe("EMAIL_NOT_VERIFIED");
    }
  });
});

describe("public routes stay public", () => {
  const publicRoutes = routes.filter((r) => !r.authenticated);
  test.each(publicRoutes.map((r) => [label(r), r]))("%s never answers 401 or FORBIDDEN", async (_, route) => {
    const res = await hit(route, null);
    expect(res.status).not.toBe(401);
    expect(res.body.error?.code).not.toBe("FORBIDDEN");
  });
});
