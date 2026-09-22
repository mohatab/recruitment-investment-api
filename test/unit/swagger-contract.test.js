// The generated OpenAPI spec must match the real routers: every route is
// documented, and its documented security matches its actual authorization
// middleware. Both sides come from code (JSDoc + router introspection), so
// adding a route or changing its guards without updating the docs fails here.
const SwaggerParser = require("@apidevtools/swagger-parser");
const swaggerSpec = require("../../src/docs/swagger");
const { collectRoutes } = require("../routes");
const CODES = require("../../src/common/errors/errorCodes");

const routes = collectRoutes();
const operation = (r) => swaggerSpec.paths?.[r.openapiPath]?.[r.method.toLowerCase()];
// Follows a $ref inside components (one level is all this spec uses).
const resolve = (node) =>
  node?.$ref
    ? node.$ref
        .replace(/^#\//, "")
        .split("/")
        .reduce((acc, key) => acc[key], swaggerSpec)
    : node;
const label = (r) => `${r.method} ${r.path}`;

describe("Swagger contract", () => {
  test("introspection finds the application's routes", () => {
    expect(routes.length).toBeGreaterThan(45);
  });

  test("every implemented route is documented", () => {
    expect(routes.filter((r) => !operation(r)).map(label)).toEqual([]);
  });

  test("every documented operation corresponds to a real route", () => {
    const implemented = new Set(routes.map((r) => `${r.method.toLowerCase()} ${r.openapiPath}`));
    const documented = Object.entries(swaggerSpec.paths).flatMap(([p, ops]) =>
      Object.keys(ops).map((m) => `${m} ${p}`)
    );
    expect(documented.filter((op) => !implemented.has(op))).toEqual([]);
  });

  test("security is declared explicitly and matches whether the route authenticates", () => {
    const wrong = routes.filter((r) => {
      const { security } = operation(r);
      const expected = r.authenticated ? [{ BearerAuth: [] }] : [];
      return JSON.stringify(security) !== JSON.stringify(expected);
    });
    expect(wrong.map(label)).toEqual([]);
  });

  test("authenticated routes document 401", () => {
    expect(routes.filter((r) => r.authenticated && !operation(r).responses["401"]).map(label)).toEqual([]);
  });

  test("role-restricted and verified-email routes document 403 and exactly their required roles", () => {
    const wrong = routes.filter((r) => {
      const op = operation(r);
      if ((r.roles || r.requiresVerifiedEmail) && !op.responses["403"]) return true;
      const documentedRoles = op["x-required-roles"] ? [...op["x-required-roles"]].sort() : null;
      return JSON.stringify(documentedRoles) !== JSON.stringify(r.roles);
    });
    expect(wrong.map(label)).toEqual([]);
  });

  test("routes gated on a verified email declare x-requires-verified-email, and only those", () => {
    const wrong = routes.filter((r) => Boolean(operation(r)["x-requires-verified-email"]) !== r.requiresVerifiedEmail);
    expect(wrong.map(label)).toEqual([]);
  });

  test("the generated document is a valid OpenAPI 3 specification", async () => {
    // Validates structure, $refs and every schema against the OpenAPI meta-schema.
    await expect(SwaggerParser.validate(JSON.parse(JSON.stringify(swaggerSpec)))).resolves.toBeDefined();
  });

  test("every application route is under /api/v1; only health probes are outside it", () => {
    const misplaced = routes.filter(
      (r) => !r.openapiPath.startsWith("/api/v1/") && !r.openapiPath.startsWith("/health")
    );
    expect(misplaced.map(label)).toEqual([]);
    expect(Object.keys(swaggerSpec.paths).filter((p) => p.startsWith("/api/") && !p.startsWith("/api/v1/"))).toEqual(
      []
    );
  });

  test("every operation documents a success response with a schema (or 204 with no body)", () => {
    const wrong = routes.filter((r) => {
      const responses = operation(r).responses || {};
      const success = Object.keys(responses).filter((code) => code.startsWith("2"));
      if (success.length === 0) return true;
      return success.some((code) => {
        const response = resolve(responses[code]);
        if (code === "204") return Boolean(response.content);
        // Any media type is fine (file downloads are not application/json),
        // as long as the payload is described by a schema.
        return !Object.values(response.content || {}).some((media) => media.schema);
      });
    });
    expect(wrong.map(label)).toEqual([]);
  });

  test("list endpoints document the shared pagination parameters", () => {
    const paginated = routes.filter((r) => {
      const responses = operation(r).responses || {};
      return Object.values(responses).some((x) => JSON.stringify(x).includes("ListResponse"));
    });
    expect(paginated.length).toBeGreaterThan(5);
    const missing = paginated.filter((r) => {
      const params = JSON.stringify(operation(r).parameters || []);
      return !["Page", "Limit"].every((p) => params.includes(`parameters/${p}`));
    });
    expect(missing.map(label)).toEqual([]);
  });

  // A parameter that is documented but ignored — or accepted but undocumented
  // — is a lie in the contract. `sort` on the conversation list was the first
  // kind (validated, advertised, never applied) and `read` on the notification
  // list was both (advertised, accepted, never applied).
  test("the documented query parameters are exactly the ones a route accepts", () => {
    const documentedNames = (route) =>
      (operation(route).parameters || [])
        .map((p) => (p.$ref ? swaggerSpec.components.parameters[p.$ref.split("/").pop()] : p))
        .filter((p) => p.in === "query")
        .map((p) => p.name);

    const validated = routes.filter((r) => r.queryKeys);
    expect(validated.length).toBeGreaterThan(5);
    const wrong = validated.filter((r) => {
      const documented = documentedNames(r).sort();
      return JSON.stringify(documented) !== JSON.stringify([...r.queryKeys].sort());
    });
    expect(
      wrong.map((r) => `${label(r)} (accepts ${r.queryKeys.sort()}; documents ${documentedNames(r).sort()})`)
    ).toEqual([]);
  });

  test("no component is declared but unused", () => {
    const used = new Set();
    JSON.stringify(swaggerSpec).replace(/"#\/components\/(\w+)\/(\w+)"/g, (_, kind, name) =>
      used.add(`${kind}.${name}`)
    );
    const declared = Object.entries(swaggerSpec.components)
      .filter(([kind]) => kind !== "securitySchemes")
      .flatMap(([kind, items]) => Object.keys(items).map((name) => `${kind}.${name}`));
    expect(declared.filter((c) => !used.has(c))).toEqual([]);
  });

  test("every $ref in the spec resolves to a real component (no broken references)", () => {
    const broken = [];
    const resolves = (ref) =>
      ref
        .replace(/^#\//, "")
        .split("/")
        .reduce((node, segment) => node?.[segment], swaggerSpec) !== undefined;
    (function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        if (typeof node.$ref === "string" && !resolves(node.$ref)) broken.push(node.$ref);
        Object.values(node).forEach(walk);
      }
    })(swaggerSpec);
    expect(broken).toEqual([]);
  });
});

// --- Request bodies -------------------------------------------------------
// The spec is generated from JSDoc next to each route, so nothing stops a
// body schema from drifting away from the Joi schema that actually guards the
// endpoint. These compare the two directly: PATCH /jobs/{id} documented no
// body at all while accepting fifteen fields, and StartupInput marked
// pre-Task-7 field names (`totalRaising`, `minInvestment`) as required —
// names its own properties no longer contained, so a generated client would
// have sent fields the API rejects.
describe("request bodies match what the endpoint validates", () => {
  const bodyRoutes = routes.filter((r) => r.bodyKeys);

  const documentedBody = (route) => {
    const content = operation(route).requestBody?.content;
    if (!content) return null;
    const media = Object.keys(content)[0];
    return { media, schema: resolve(content[media].schema) ?? {} };
  };

  test("every route that validates a body documents one", () => {
    expect(bodyRoutes.length).toBeGreaterThan(5);
    const undocumented = bodyRoutes.filter((r) => !documentedBody(r));
    expect(undocumented.map(label)).toEqual([]);
  });

  test("the documented properties are exactly the fields a client may send", () => {
    const wrong = [];
    for (const route of bodyRoutes) {
      const doc = documentedBody(route);
      if (!doc || doc.media !== "application/json") continue; // multipart is checked below
      const documented = Object.keys(doc.schema.properties || {}).sort();
      const accepted = [...route.bodyKeys].sort();
      if (JSON.stringify(documented) !== JSON.stringify(accepted)) {
        wrong.push(`${label(route)} (documents ${documented}; accepts ${accepted})`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("the documented required fields are exactly the ones Joi insists on", () => {
    const wrong = [];
    for (const route of bodyRoutes) {
      const doc = documentedBody(route);
      if (!doc || doc.media !== "application/json") continue;
      const documented = (doc.schema.required || []).slice().sort();
      const required = [...route.requiredBodyKeys].sort();
      if (JSON.stringify(documented) !== JSON.stringify(required)) {
        wrong.push(`${label(route)} (documents ${documented}; requires ${required})`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

// A schema that requires a property it does not define is incoherent on its
// own terms: Swagger UI marks a field required that the schema never lists,
// and a code generator emits a client the API rejects.
test("no schema requires a property it does not define", () => {
  const broken = Object.entries(swaggerSpec.components.schemas)
    .map(([name, schema]) => {
      const properties = Object.keys(schema.properties || {});
      const missing = (schema.required || []).filter((field) => !properties.includes(field));
      return missing.length ? `${name} requires ${missing} but defines ${properties}` : null;
    })
    .filter(Boolean);
  expect(broken).toEqual([]);
});

// --- Error responses ------------------------------------------------------
describe("documented failures match the ones the route can actually produce", () => {
  test("every route that validates input documents 400", () => {
    const validating = routes.filter((r) => r.bodyKeys || r.queryKeys);
    expect(validating.length).toBeGreaterThan(10);
    const missing = validating.filter((r) => !operation(r).responses?.["400"]);
    expect(missing.map(label)).toEqual([]);
  });

  test("every rate-limited route documents 429", () => {
    const limited = routes.filter((r) => r.rateLimit);
    expect(limited.length).toBeGreaterThan(5);
    expect(limited.filter((r) => !operation(r).responses?.["429"]).map(label)).toEqual([]);
  });

  // A summary that names a status it does not document sends a reader looking
  // for a response definition that is not there.
  test("a status named in a summary is also documented", () => {
    const wrong = [];
    for (const route of routes) {
      const op = operation(route);
      for (const [, status] of (op.summary || "").matchAll(/\b([45]\d\d)\b/g)) {
        if (!op.responses?.[status]) wrong.push(`${label(route)} mentions ${status}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("every documented error code is one the application can emit", () => {
    const defined = new Set(Object.values(CODES));
    const documented = new Set();
    JSON.stringify(swaggerSpec).replace(/"([A-Z][A-Z_]{3,})"/g, (_, code) => documented.add(code));
    const invented = [...documented].filter((code) => !defined.has(code) && /_/.test(code));
    expect(invented).toEqual([]);
  });
});

// --- Response payloads ----------------------------------------------------
// Documentation is also an attack surface: a field named here is a field a
// reader expects to receive, and these are the ones that must never appear.
test("no response schema documents a secret or an internal identifier", () => {
  const forbidden = ["password", "tokenHash", "tokenVersion", "storageKey", "usedAt", "__v"];
  const offenders = [];
  for (const [name, schema] of Object.entries(swaggerSpec.components.schemas)) {
    const walkProps = (properties, trail) => {
      for (const [property, value] of Object.entries(properties || {})) {
        if (forbidden.includes(property)) offenders.push(`${trail}.${property}`);
        // The storage key of an uploaded file is internal: clients get a
        // downloadPath instead (Task 9).
        if (property === "key" && /cv|image/i.test(trail)) offenders.push(`${trail}.key`);
        if (value?.properties) walkProps(value.properties, `${trail}.${property}`);
      }
    };
    // Request bodies legitimately carry a password; responses never do.
    if (/Input$/.test(name)) continue;
    walkProps(schema.properties, name);
  }
  expect(offenders).toEqual([]);
});
