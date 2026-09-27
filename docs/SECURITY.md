# Security

A consolidated view of what's actually implemented, where, and why — the
security-relevant subset of `docs/ARCHITECTURE.md`, gathered in one place.
Every control below is real code, not aspirational; the file path is given
so it can be checked directly.

## Authentication

- **Password hashing**: bcrypt, in a single `pre('save')` hook on the one
  `User` model (`src/modules/users/user.model.js`) — the pattern the
  original codebase's `matrix` module was missing, which is exactly how it
  ended up storing a plaintext password on reset ([original codebase
  audit](./history/ORIGINAL_CODEBASE_AUDIT.md) #2).
- **JWT algorithm pinned** (`src/modules/auth/jwt.js`): both sign and
  verify are locked to `HS256` explicitly, not left to library defaults —
  closes algorithm-confusion attacks (a token crafted with `alg: none` or a
  mismatched algorithm) regardless of what `jsonwebtoken`'s own defaults
  do. Covered by `test/unit/jwt.test.js`.
- **Access tokens** are short-lived JWTs (15 min default) carrying a session
  generation (`ver`). Each request re-checks the stored user: an inactive
  account or a `ver` that no longer matches `User.tokenVersion` is rejected.
  **Refresh tokens** are opaque random values stored as SHA-256 hashes
  (`RefreshToken.tokenHash`), never the raw value.
- **Refresh rotation with reuse detection**: consuming a token is a single
  atomic update, so concurrent requests with one token cannot both succeed.
  Replaying a rotated token revokes every session of the user. Concurrency and
  replay are tested in `auth.test.js`.
- **Session revocation** (`auth.service.revokeAllSessions`): password change,
  password reset, admin deactivation, logout-all and refresh-token reuse bump
  `User.tokenVersion`, revoke refresh tokens and disconnect sockets.
- **Deactivated accounts** cannot log in (`403 ACCOUNT_DISABLED`, returned only
  after a correct password), refresh, call the API, or open sockets.
- **Login timing**: unknown emails are compared against a dummy bcrypt hash, so
  response time doesn't reveal whether an account exists. Wrong password and
  unknown email return the identical 401.
- **Password policy**: 8+ characters, at most 72 bytes (bcrypt ignores input
  beyond that, so it's rejected instead of silently truncated). Changing it
  requires the current password and a different new one.
- **Password reset**: `forgot-password` responds before doing any work, so
  neither body nor timing depends on the email. Tokens are single use (atomic
  consumption), expire after 1 hour (TTL index), are superseded by a newer
  request, are limited to one email per account per minute, are never sent to
  deactivated accounts, and are delivered in the URL fragment
  (`${APP_URL}/reset-password#token=…`) so they don't reach server logs.
- **Email verification**: same one-time token mechanism (24 h). Posting jobs and
  starting investments require a verified email (`EMAIL_NOT_VERIFIED`).
- **Registration** returns 409 for an existing email. That reveals registration
  status; it's accepted because registration returns a session immediately, and
  it's covered by the auth rate limiter.
- **No self-service privilege escalation at registration**: `admin` is not
  in the public registration schema's allowed roles
  (`auth.validation.js`); provisioning one requires direct database access.

## Authorization

### Layers, in the order they run

| Layer          | Where                                                                                                                           | Failure                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Session        | `authenticate` → `auth.service.authenticateAccessToken`: JWT signature/expiry, user exists, active, `ver` = `User.tokenVersion` | `401 UNAUTHORIZED`                          |
| Role           | `authorize(...roles)` against the **stored** role (never the JWT `role` claim or the request)                                   | `403 FORBIDDEN`                             |
| Verified email | `requireVerifiedEmail` (job posting, investments)                                                                               | `403 EMAIL_NOT_VERIFIED`                    |
| Input          | Joi `validate()` with `stripUnknown` — ownership/state fields can't be sent                                                     | `400 VALIDATION_ERROR`                      |
| Resource       | Services: `assertOwner` (`common/utils/assertOwner.js`) or a query filter scoped to `req.user`                                  | `403 FORBIDDEN` (exists, not yours) / `404` |

401 always means "no valid session"; 403 means "valid session, not allowed".
Admin is **not** a superuser: admin can do only the operations listed below.

### Rules per resource

| Resource                                | Who                                | Rule                                                                                                            |
| --------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Own profile `/users/me*`                | any authenticated                  | self only; `role`, `email`, `isActive`, verification and `tokenVersion` are not writable                        |
| `GET /users/:id`                        | any authenticated                  | public projection only (name, role, createdAt)                                                                  |
| `GET /users`, `PATCH /users/:id/status` | admin                              | an admin cannot change their own status                                                                         |
| Jobs create                             | recruiter, verified email          | `recruiter` = caller                                                                                            |
| Jobs update/delete                      | recruiter                          | owner of the job only                                                                                           |
| Apply to a job                          | candidate                          | `applicant` = caller; status always starts at `submitted`                                                       |
| Applications of a job / change status   | recruiter                          | owner of the job only (a deleted job owns nothing)                                                              |
| `GET /applications/mine`                | candidate                          | caller's applications only                                                                                      |
| Startup profile `/startups/me`          | startup                            | one profile, `owner` = caller; `raisedSoFarCents` not writable                                                  |
| Investor profile `/investors/me`        | investor                           | `owner` = caller                                                                                                |
| `GET /investors/:id`                    | any authenticated                  | public projection: **criteria are private** to the owner                                                        |
| `GET /startups/matches`                 | investor                           | against the caller's own criteria                                                                               |
| Create investment                       | investor, verified email           | `investor` = caller; status always `pending`                                                                    |
| `GET /investments/mine` / `/startup`    | investor / startup                 | caller's own / caller's startup's only                                                                          |
| Refund                                  | **admin only** (audit decision D3) | investors can't reclaim money credited to a startup                                                             |
| Notifications list                      | any authenticated                  | personal (`user` = caller) + broadcasts to the caller's role                                                    |
| Mark notification read                  | recipient                          | personal: recipient only; role broadcast: members of that role, recorded **per user** (`readBy`, never exposed) |
| Send notification                       | admin                              | direct target must exist                                                                                        |
| Messages send                           | any authenticated                  | `sender` = caller; recipient must be another active user                                                        |
| Message history / conversations         | any authenticated                  | room derived from the caller + the other user id                                                                |
| Experience                              | any authenticated                  | `user` = caller; delete by owner only                                                                           |
| Stripe webhook                          | Stripe signature                   | no user                                                                                                         |

### Socket.IO (same rules as REST)

- Handshake: the same session check as HTTP; deactivation, logout-all,
  password change/reset and token expiry disconnect open sockets.
- `chat:message` calls the same service and schema as `POST /api/v1/messages`
  (sender = session user, same recipient rules, same error codes in the ack).
- Rooms are derived from the session only: `user_<id>` (personal delivery),
  `role_<role>` (admin role broadcasts, the same audience as
  `GET /notifications`). No event lets a client join a room.
- Presence (online/offline) is sent only to users who share a conversation
  with the user — the same audience that sees `isOnline` in
  `GET /api/v1/messages/conversations`. It is reference-counted per user, so
  one tab closing never reports a still-connected user as offline.
- Every client event is rate-limited per socket (30 per 10s → a
  `TOO_MANY_REQUESTS` ack) and the transport caps a frame at 64KB, well under
  the 1MB default, so an authenticated client cannot flood handlers or buffers
  (`realtime/socket.js`). Limiting the _number of connections_ per client is
  deliberately left to the proxy/infrastructure layer: an in-process counter
  is trivially bypassed by reconnecting elsewhere.
- Acks carry the same error codes as REST and never a stack, a driver message
  or any internal detail.

### How it's enforced by tests

- The OpenAPI spec is the declared policy: every operation states `security`,
  and role-restricted ones `x-required-roles` (plus
  `x-requires-verified-email`). `test/unit/swagger-contract.test.js` checks
  the routers declare exactly that middleware.
- `test/integration/authorization-matrix.test.js` enumerates every route from
  the real routers and checks the **running app** against the documented
  policy: 7 kinds of invalid session → 401 on every protected route; every
  role → allowed or `403 FORBIDDEN` per route; a validly signed token whose
  `role` claim says admin is still refused; unverified users →
  `EMAIL_NOT_VERIFIED`; public routes never 401/403.
- `test/integration/authorization-ownership.test.js` covers cross-user
  access (IDOR/BOLA) and client-supplied ownership/role/state fields for
  every resource above.

## Payments

- The webhook authenticates as **Stripe, by signature over the raw body**, not
  as a user; it is the only unauthenticated write path and it accepts nothing
  else. Missing, malformed, tampered or replayed signatures are refused with
  400 before any domain code runs.
- **Replay and double-processing** are blocked by a durable processed-event log
  (unique Stripe event id) _and_ by idempotent domain transitions.
- **Events are verified against the record**: the PaymentIntent must map to an
  investment, and the event's amount and currency must match it, before money
  state changes. Client-reported payment status is never accepted anywhere.
- **Outbound calls are idempotent** (keys derived from the investment id), so a
  retry cannot charge or refund twice.
- **No Stripe secret, signature, payload or error message is logged or
  returned.** Provider failures become a generic `502 PAYMENT_PROVIDER_ERROR`;
  only the Stripe error type, code and request id go to the log.

## Recruitment rules that are also security controls

- `resumeUrl` accepts **http(s) only**: a `javascript:` or `data:` URL would
  otherwise be stored and later opened by the recruiter reviewing it.
- Application status moves through one conditional update filtered on the
  status it was validated against, so a concurrent transition is refused
  (`409`) instead of overwriting; the applicant, job and status of an
  application are always server-set.
- Job search filters (`role`, `location`) are regex-escaped and `sort` is
  allowlisted, so neither becomes a query-injection or ReDoS vector.
- A candidate's application list never exposes other applicants, and the
  applicant's contact details are visible only to the owning recruiter.

## Input handling

- **Joi validation on every write endpoint**, via one shared `validate()`
  middleware (`common/middleware/validate.js`) with `stripUnknown: true` —
  this is what prevents mass assignment: a client can't set `role`,
  `owner`, `raisedSoFarCents`, etc. through a body field the schema doesn't
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

- **Helmet** — the standard header set, asserted header by header in
  `test/integration/security-headers.test.js`: a CSP with `default-src 'self'`,
  `object-src 'none'` and no `unsafe-inline`/`unsafe-eval` in `script-src`;
  HSTS (180 days, `includeSubDomains`); `X-Content-Type-Options: nosniff`;
  `X-Frame-Options: SAMEORIGIN`; `Referrer-Policy: no-referrer`;
  `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`;
  `X-XSS-Protection: 0` (the legacy auditor is off in modern browsers and
  introduced bugs of its own); no `X-Powered-By`. The same headers are sent on
  error responses, which is where header middleware is usually skipped.
  Swagger UI loads every script as a separate file, so it renders under that
  CSP without an `unsafe-inline` exception.
- **`Permissions-Policy`** — Helmet sets none, so the app adds
  `camera=(), microphone=(), geolocation=(), payment=(), usb=()`. A JSON API
  and its docs page need none of them.
- **CORS**: configurable allowlist (`CORS_ORIGIN`), defaults to `*` — safe
  specifically because auth is a bearer token, never a cookie
  (`credentials: true` is never set); a deployment that adds cookie auth
  must also set a real origin allowlist.
- **Rate limiting** (`express-rate-limit`, per IP, 15-minute windows):

  | Scope                                | Limit                  | Why                                                                            |
  | ------------------------------------ | ---------------------- | ------------------------------------------------------------------------------ |
  | Everything under `/api/v1`           | 300                    | General abuse/scraping brake                                                   |
  | `/api/v1/auth/*`                     | 20                     | Brute force, credential stuffing, mail-bombing via forgot-password             |
  | `POST /users/me/cv`, `POST /contact` | 20                     | Each request can write 5MB to storage, and the contact form is unauthenticated |
  | Socket.IO events                     | 30 per 10s, per socket | Event flooding                                                                 |

  Which policy guards which route is introspected from the real routers in
  `security-headers.test.js`, and the limits themselves are exercised in
  `rate-limit.test.js`. Limiters are disabled only under `NODE_ENV=test` so
  the suite's own volume doesn't self-throttle.

  Deliberately **not** limited: `/health*` (an orchestrator probe must never
  be throttled into a false "unhealthy") and `POST /payments/webhook`, which is
  mounted before the limiter because Stripe retries a delivery it cannot
  complete — an unsigned request there is rejected by an HMAC check before any
  database work happens.

- **Request size limit**: `express.json({ limit: "1mb" })`.

## File uploads and downloads

Originally the upload directory was served by `express.static` at
`/uploads`, so every CV — a résumé with a name, address and phone number —
was readable by anyone with the URL, and uploads were validated only on
values the client controls. Both are fixed; `test/integration/files.test.js`
is the regression suite.

**Accepting a file** (`common/middleware/upload.js`):

- `multer.memoryStorage()` — nothing reaches disk before validation, so a
  rejected upload cannot leave a partial file behind.
- Allowlist per kind (CV: pdf/doc/docx; images: jpg/jpeg/png/webp), 5MB,
  `files: 1`, bounded parts and field size. SVG and HTML are deliberately
  excluded: browsers execute them.
- **Content verification** (`common/utils/fileType.js`): the magic bytes must
  agree with both the declared type and the extension. This is the check the
  client cannot forge — an executable renamed `cv.pdf` and declared
  `application/pdf` is rejected here, as are empty and truncated files.
- A body that is not valid multipart at all (e.g. a null byte in the part
  header) is a 400, not a 500.
- **Storage keys are server-generated**: `${kind}/${randomUUID()}${ext}`.
  Client filenames, client-supplied paths and any injected `key`/owner field
  are ignored, which is what rules out traversal, absolute paths, null bytes,
  reserved names, duplicate-name collisions and overwriting another user's
  file — by construction rather than by sanitizing.
- The filename is kept only as a display name for `Content-Disposition`,
  stripped of separators and control characters.

**Storing it** (`common/storage/`): the driver resolves every key against the
upload root and refuses anything that escapes it — defense in depth, since
keys are already generated. The upload directory is outside any served path;
`express.static` is gone. A replacement writes the new file, updates the row,
then deletes the old file; a failed write leaves the old CV referenced and
intact.

**Serving it** (`common/utils/fileResponse.js`): authorization is enforced in
the service on the request that reads the bytes — owner, admin, or a recruiter
who received an application from that user to one of their own jobs (that rule
exactly, not wider). Responses are always
`Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` +
`Cache-Control: private, no-store`, so uploaded content is never rendered
inline or sniffed into something executable. A missing file is a 404 that
discloses no filesystem path, and storage keys are never serialized to
clients.

**Not done, deliberately**: virus/malware scanning (a ClamAV sidecar is the
next increment if this ever accepted files from untrusted parties at scale)
and deep format parsing — a PDF with a valid header is accepted as a PDF.

## Real-time (Socket.IO)

- Every socket authenticates at handshake with the same check as HTTP
  (`realtime/socket.js`): no anonymous, deactivated or revoked sessions. A
  socket is disconnected when its token expires or its sessions are revoked.
- **Event handlers cannot crash the process** (pre-hardening audit, finding C1): every client event
  goes through `onEvent`, which validates the payload with Joi, catches
  synchronous throws and async rejections, logs them, and replies with an error
  ack. Internal error messages are never sent to the client.
  `test/integration/socket.test.js` covers malformed payloads and failing
  handlers; `server-lifecycle.test.js` sends malformed events to the real
  `node src/server.js` process and asserts it stays up.
- Presence is sent only to conversation partners (it used to go to every user
  with the same role).
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
- No secret is committed: verified by grepping the repository for Stripe/AWS
  key shapes and PEM headers, which matches nothing, and `.env` is gitignored.

## Dependencies

`npm audit` reports **0 vulnerabilities**. The three moderate `qs` advisories
that Express 4 pinned transitively are resolved by an `overrides` entry
(`qs: ^6.16.0`) rather than by migrating framework: `qs` 6.16 is a patch
within the range Express already expects, and the whole suite plus the live
container verify that request parsing still behaves. Express 5 remains deferred on
its own merits, investigated rather than assumed: `express-mongo-sanitize@2.2.0`
— the middleware providing NoSQL-injection protection on every request —
reassigns `req.query` wholesale (`req.query = target`), and Express 5 defines
`req.query` as a read-only getter, so that assignment throws at runtime on
every request that reaches it. That is a concrete break in a security control
this project actively relies on, confirmed by reading the installed
middleware's source. `helmet`, `express-rate-limit` and `swagger-ui-express`
all declare or are compatible with Express 5; this one dependency is the
blocker. Revisit when `express-mongo-sanitize` ships an Express-5-compatible
release, or when this project replaces it with a sanitizer that mutates
`req.query`'s existing keys in place instead of reassigning the object.

`multer` is on the 1.x LTS line, which upstream has deprecated in favour of
2.x. It carries no open advisory today, and this project uses only
`memoryStorage` with its own validation on top, so the upgrade is a scheduled
maintenance item rather than a vulnerability.

## Deployment requirements (not enforceable by the code)

- **The database must require authentication and must not be reachable from
  the internet.** The `mongo` service in `docker-compose.yml` runs without
  credentials because it is a development convenience, so its port is not
  published to the host at all: the API reaches it over the Compose network by
  service name, and a developer who needs a shell uses
  `docker compose exec mongo mongosh`. `docker compose up` therefore cannot put
  an open database on the host's network. A real deployment uses a managed or
  credentialed MongoDB, reachable only from the API's network.
- **`TRUST_PROXY` must match the actual topology.** It is off by default; turn
  it on only behind a proxy that overwrites `X-Forwarded-For`, otherwise
  clients can spoof their IP and walk past every rate limiter.
- **TLS terminates in front of the app.** HSTS is sent, but the process itself
  speaks HTTP.

## Known, accepted residual risks

- **Registration discloses whether an email is already registered** (409
  `CONFLICT`). Login, password reset and the "recipient not found" paths are
  all deliberately non-disclosing, but a signup form that cannot say "this
  address is taken" is not usable. Rate limiting (20/15min) is what stops it
  becoming a bulk enumeration oracle.
- **No malware scanning of uploads.** Content is verified against its declared
  type by magic bytes, stored outside any served path, and only ever returned
  as an attachment with `nosniff` — but a valid PDF containing something
  hostile is still stored. A scanning sidecar is the next increment if this
  ever accepted files from untrusted parties at scale.
- **Archive/image decompression bombs are not applicable**: no archive format
  is accepted and no image is ever decoded or resized server-side. Uploads are
  size-capped at 5MB and stored as opaque bytes.
- **Socket.IO connection counts are not limited in-process.** Per-socket event
  flooding is, but a client can open many sockets; capping connections belongs
  at the proxy, since an in-process counter is bypassed by reconnecting.
- **Presence and room delivery are single-process** (in-memory), by design.

None of these are HIGH/CRITICAL, and each is a documented decision rather than
something left for someone else to discover.
