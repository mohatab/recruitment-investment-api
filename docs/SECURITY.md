# Security

A consolidated view of what's actually implemented, where, and why — the
security-relevant subset of `docs/ARCHITECTURE.md`, gathered in one place.
Every control below is real code, not aspirational; the file path is given
so it can be checked directly.

## Authentication

- **Password hashing**: bcrypt, in a single `pre('save')` hook on the one
  `User` model (`src/modules/users/user.model.js`) — the pattern the
  original codebase's `matrix` module was missing, which is exactly how it
  ended up storing a plaintext password on reset (`AUDIT.md` #2).
- **JWT algorithm pinned** (`src/modules/auth/jwt.js`): both sign and
  verify are locked to `HS256` explicitly, not left to library defaults —
  closes algorithm-confusion attacks (a token crafted with `alg: none` or a
  mismatched algorithm) regardless of what `jsonwebtoken`'s own defaults
  do. Covered by `test/unit/jwt.test.js`.
- **Access tokens** are short-lived JWTs (15 min default); **refresh
  tokens** are opaque random values, stored as a SHA-256 hash
  (`RefreshToken.tokenHash`), never the raw value — a database leak alone
  doesn't hand out usable sessions.
- **Refresh rotation**: every `/api/auth/refresh` call revokes the token it
  was given and issues a new one; reusing a rotated token is rejected
  (`auth.service.js`, tested in `auth.test.js`).
- **Password reset**: single-use (`usedAt` marks it spent), TTL-expired via
  a MongoDB index (`expireAfterSeconds: 0`, not just an application-level
  check), and resetting a password revokes every outstanding refresh token
  for that account. The request endpoint returns the same response whether
  or not the email is registered — no account-enumeration oracle.
- **No self-service privilege escalation at registration**: `admin` is not
  in the public registration schema's allowed roles
  (`auth.validation.js`); provisioning one requires direct database access.

## Authorization

- **Role is read only from the verified JWT payload**
  (`common/middleware/auth.js`), set once at login from the stored
  `User.role` — never from a request body or query string, so a client
  cannot grant itself a different role by sending one.
- **Ownership checks live in the service layer**, next to the query they
  protect (`assertOwnership` in job/startup services, inline comparisons
  elsewhere) — e.g. a recruiter can only edit/delete their own job
  postings, only a job's owning recruiter can see or advance its
  applications, only a startup's owner sees the investments it received.
- **IDOR/BOLA**: every resource that shouldn't be publicly readable is
  checked against `req.user.id`, not just gated behind "any authenticated
  user." `GET /api/users/:id` specifically returns a **limited** projection
  (name, role — not phone/email/birthdate) precisely because "authenticated"
  and "authorized to see this person's private details" aren't the same
  thing — that was a real gap found and fixed during review, not a
  hypothetical.

## Input handling

- **Joi validation on every write endpoint**, via one shared `validate()`
  middleware (`common/middleware/validate.js`) with `stripUnknown: true` —
  this is what prevents mass assignment: a client can't set `role`,
  `owner`, `raisedSoFar`, etc. through a body field the schema doesn't
  declare, because unknown fields are dropped before the value ever
  reaches a service function.
- **NoSQL injection**: `express-mongo-sanitize` strips `$`/`.`-prefixed
  keys from `body`/`params`/`query` globally, as defense-in-depth on top of
  Joi's own type checking (which already rejects an object where a string
  is expected, closing most injection attempts at the schema level before
  sanitization even runs).
- **ReDoS**: `Job.list()`'s free-text `role`/`location` filters build a
  `RegExp` from user input; the input is escaped
  (`common/utils/escapeRegex.js`) before that happens, so a crafted pattern
  like `(a+)+$` is matched literally instead of executed as a pattern
  against every document. Found and fixed during the final review pass;
  covered by `test/unit/escape-regex.test.js` and an integration test.
- **Mongoose-level validation** (required fields, enums, min/max, unique
  indexes) is the last line of defense if a route somehow bypassed Joi.

## Transport / HTTP

- **Helmet** — standard security headers (verified live: HSTS,
  `X-Content-Type-Options`, `X-Frame-Options`).
- **CORS**: configurable allowlist (`CORS_ORIGIN`), defaults to `*` — safe
  specifically because auth is a bearer token, never a cookie
  (`credentials: true` is never set); a deployment that adds cookie auth
  must also set a real origin allowlist.
- **Rate limiting** (`express-rate-limit`): 300/15min general, 20/15min on
  `/api/auth/*` — the actual brute-force control. Disabled only under
  `NODE_ENV=test` so the integration suite's own volume doesn't self-throttle
  (`common/middleware/rateLimiter.js`); verified active by
  `test/unit/rate-limiter.test.js`.
- **Request size limit**: `express.json({ limit: "1mb" })`.

## File uploads

- MIME + extension allowlist per upload kind (CV: pdf/doc/docx; images:
  jpg/png/webp), 5MB limit, `multer.memoryStorage()` so nothing touches
  disk before validation runs (`common/middleware/upload.js`).
- **Filenames are always server-generated**
  (`crypto.randomUUID() + validated extension`) — the client's filename is
  never used to construct a path, which is what rules out path traversal
  or overwrite via a crafted filename.
- **Known, accepted limitation**: validation checks declared MIME type +
  extension, not file content (magic bytes). Sufficient for this project's
  threat model (CV/profile-image uploads, not executable content); a
  stronger control (content-type sniffing, e.g. via `file-type`, or virus
  scanning) would be the next increment if this handled higher-risk
  uploads at scale.

## Real-time (Socket.IO)

- Every socket authenticates with the same JWT at handshake
  (`realtime/socket.js`) — no anonymous connections.
- Every room a socket can join (`user_<id>`, `role_<role>`) is derived from
  its own verified identity at connect time, never from an event payload —
  there is no event that takes another user's id and joins the caller to
  their room. Verified with a real `socket.io-client` connection in
  `test/integration/socket.test.js`, including that an unrelated third
  party never receives a message meant for someone else.

## Payments

- The server never handles a raw card number — it creates a Stripe
  PaymentIntent and returns `client_secret`; card entry happens entirely
  client-side via Stripe.js/Elements.
- **Webhook signature verification** (`stripe.constructWebhookEvent`) — an
  unsigned or wrongly-signed request is rejected with 400 before any of its
  contents are trusted. Payment state changes **only** on this path, never
  on a client's own "it succeeded" report.
- **Idempotent, race-safe processing**: the pending→paid transition is one
  atomic `findOneAndUpdate` filtered on the _old_ status, not a
  read-then-write — a concurrently-duplicated webhook delivery (Stripe's
  own retry behavior) can't double-credit a startup. Covered by
  `test/integration/payments-webhook.test.js`, including an explicit
  duplicate-delivery test.

## Error handling & logging

- One centralized handler (`common/middleware/errorHandler.js`) — stack
  traces are logged server-side only (and only outside
  `NODE_ENV=production`), never sent to the client; unrecognized errors
  return a generic `500 INTERNAL_ERROR` with no internal detail.
- No log statement includes a password, token, or full request body —
  verified by grep, not just by convention (`grep -rn "logger\." src/ | grep -i "password\|token"` returns nothing beyond field _names_ in code, no logged _values_).
- Structured JSON access log per request (`common/middleware/requestLogger.js`)
  with a request correlation id (`X-Request-Id`). Incoming ids are accepted
  only if they match a strict pattern, so a client can't inject text into logs.
  Query strings, headers and bodies are never logged; neither are email addresses.

## Configuration & secrets

- Every environment variable is schema-validated at startup (`config/env.js`).
  The app refuses to boot rather than fall back to an insecure default, which is
  how the original codebase's hardcoded `"secret"` JWT went unnoticed. Production
  additionally requires 32+ character JWT secrets, a non-`*` CORS allowlist,
  and Stripe/SMTP credentials.
- `trust proxy` comes from `TRUST_PROXY` and is off by default. It used to be
  hardcoded to `1`, which let a client rotate `X-Forwarded-For` to bypass every
  rate limiter when the app was reachable directly (regression test:
  `test/integration/rate-limit.test.js`).
- No secret is committed: verified by grepping for Stripe/AWS key shapes
  and PEM headers across the repository (see `FINAL_PROJECT_REPORT.md` for
  the exact command run and its empty result), and `.env` is gitignored.

## Known, accepted residual risks

- A moderate `qs` advisory transitive through Express 4's `body-parser`.
  Express 5 was evaluated and deferred for a concrete, verified reason
  (`express-mongo-sanitize` breaks under Express 5's read-only `req.query`)
  — see the README's "Express 4 vs 5" section.
- File upload validation is MIME+extension, not magic-byte content
  sniffing (see File uploads above).
- Socket.IO presence/room delivery is single-process (in-memory), not
  designed for horizontal scaling without adding a Redis adapter.

None of the above are HIGH/CRITICAL; all are documented rather than
silently left for someone else to discover.
