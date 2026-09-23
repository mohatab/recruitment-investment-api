# FINAL_AUDIT.md — Production-readiness rebuild report

> **Historical record.** This is the report from the _first_ rebuild pass, when
> the suite stood at 43 tests across 11 suites. The project has moved well
> beyond it since (677 tests across 36 suites at the time of writing), so the
> figures, setup commands and Docker notes below are a snapshot, not current
> instructions — `docker compose up` no longer publishes the database port, for
> one. For how to run the project today see [README.md](./README.md) and
> [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

Companion to `AUDIT.md` (the before-state). This is the after-state: what
changed, why, and how it was verified.

## What was wrong (summary — see AUDIT.md for the full, verified list)

Three independent mini-APIs (`mahmoud/`, `matrix/`, `mohamed/`) glued
together in one `index.js`, each with its own `User` model and JWT scheme.
Confirmed critical bugs: a JWT secret hardcoded as the string `"secret"`;
a password-reset path that saved plaintext passwords (no hashing hook on
that model); `GET /api/matrix/users` returning bcrypt hashes; an
unauthenticated Socket.IO layer that let any client join any user's private
room or read any conversation; a missing `body-parser` dependency that made
`npm install && node index.js` crash on startup; and a fake in-memory
password-change endpoint that silently did nothing for real users.

## What changed

### Architecture

Replaced the three author-named folders with a layered module structure
under `src/`: `routes → controller → service → model`, one `common/` layer
for cross-cutting middleware/errors/utils/storage, shared by every module.
No route handler talks to Mongoose directly anymore. See the README's
Architecture section for the full tree and a diagram.

### Authentication & authorization

- Consolidated 4 duplicate user documents into one `User` model with a
  single `role` enum, one JWT auth middleware, and `authorize(...roles)`
  for RBAC. Role is read only from the verified JWT, never the request body.
- Access tokens (15 min default) + rotating opaque refresh tokens, stored
  hashed, single-use (reuse of a rotated token is rejected).
- Password reset: single-use, TTL-expired (1 hour), revokes all refresh
  tokens on reset, and the forgot-password endpoint responds identically
  whether or not the email exists (no enumeration oracle).
- Fixed the hardcoded `"secret"` JWT and the plaintext-password reset bug
  by construction — there's now exactly one `User` model with exactly one
  hashing hook, so there's nowhere left for that class of bug to hide.

### Database / domain models

Every domain model now has a real foreign key: `Job.recruiter`,
`Application.job` + `Application.applicant` (unique compound index —
duplicate applications rejected at the database level), `Startup.owner`,
`Investor.owner`, `Investment.investor` + `Investment.startup`,
`Experience.user`, `Notification.user`, `Message.sender/receiver`. The old
orphaned `your` profile collection was folded into `User` (it was personal
profile data with no owner reference — now it has one, trivially: it's
part of the user document).

### API design

Standardized response envelope (`{success, data, message}` /
`{success, data, meta, message}` for lists / `{success, error}`), Joi
validation on every write endpoint via one shared `validate()` middleware,
consistent status codes, pagination (`page`/`limit`/`sort`) on every list
endpoint.

### Recruitment domain

Job → Application lifecycle with enforced status transitions
(`submitted → under_review → shortlisted → interview → accepted`,
`rejected` reachable from any non-terminal state; skipping steps returns 400) and authorization boundaries (a candidate applies once per job — a
second attempt is a 409, not a silent duplicate; only the owning recruiter
can view/manage applications for their job).

### Investment domain

Startup fundraising profiles + investor criteria + a matching endpoint
(a plain filter query against saved criteria — deliberately not dressed up
as a recommendation engine, since nothing in this data would make one
meaningful). The old "success prediction" endpoint is now honestly
documented as a rule-based heuristic (`method: "rule_based_heuristic"` in
its response), not implied ML, and it's stateless (its old persisted
records weren't linked to anything real anyway).

### Payments

Investments are Stripe PaymentIntents confirmed client-side with
Stripe.js; the server never touches a raw card number (the old code built
one server-side from a hardcoded test number — a real integration
anti-pattern even though the number itself was Stripe's own test card).
Payment status is only ever advanced by a **signature-verified webhook**
(`POST /api/payments/webhook`), and webhook processing is idempotent
(a duplicate `payment_intent.succeeded` delivery won't double-credit a
startup's `raisedSoFar`).

### Real-time (Socket.IO)

Sockets authenticate with the same JWT at handshake time; every room a
socket can join (`user_<id>`, `role_<role>`, a conversation room) is
derived from that verified identity, never from a client-supplied payload.
This directly closes the "join anyone's room" and "read anyone's messages"
vulnerabilities in `AUDIT.md`. Ephemeral online-presence moved from a
persisted Mongo collection to an in-memory map (documented ceiling:
single-process only — see the `ponytail:`-style comment in
`src/realtime/presence.js` for the upgrade path if this ever needs to scale
horizontally).

### File uploads / storage

Multer with memory storage + a MIME/extension allowlist + 5MB limit;
filenames are always server-generated (`crypto.randomUUID()` + validated
extension), so a crafted client filename can't cause a path-traversal or
overwrite. Storage is an interface (`src/common/storage`) with a `local`
driver (default, no cloud account needed) and an `s3` driver
(`@aws-sdk/client-s3`, S3-compatible — AWS, R2, MinIO) selected by
`STORAGE_DRIVER`.

### Security hardening

Helmet, CORS allowlist, `express-mongo-sanitize`, `express-rate-limit`
(300/15min general, 20/15min on auth routes), a centralized error handler
that never leaks stack traces to the client, request correlation IDs
(`X-Request-Id`), and a full secret scan (nothing hardcoded remains —
verified by re-running the same grep from `AUDIT.md` against the final
codebase).

### Testing

43 tests across 11 suites: unit tests for JWT signing/verification, the
application status-transition table, pagination parsing, and the
success-assessment heuristic; integration tests (Supertest + an in-memory
MongoDB via `mongodb-memory-server`, no external DB needed) covering
registration/login/refresh-rotation/logout, role-based authorization
boundaries, job/application CRUD, duplicate-application prevention,
recruiter-vs-candidate access, startup/investor profiles and matching,
notification ownership, and the full password-reset flow including
single-use enforcement. Coverage reporting via `npm run test:coverage`.

### DevOps

`Dockerfile` (multi-stage-free, `npm install --omit=dev`, a real
`HEALTHCHECK` against `/health`), `docker-compose.yml` (API + MongoDB),
`.dockerignore`. CI now runs install → lint → format check → tests with
coverage → `npm audit` → a real `docker build`, on every push/PR. The old
`daily-activity.yml` workflow (a scheduled job that committed a synthetic
line to `activity.md` purely to keep the GitHub contribution graph green)
was deleted — it added nothing but the appearance of activity, which
undercuts the honesty of everything else here.

### Documentation

README rewritten to describe what actually exists (architecture diagram,
ER diagram, real request/response examples, verified setup/test/Docker
commands). The old hand-written `API_DOCUMENTATION.md` (a second,
partially-Arabic, hand-maintained doc that would drift from the real API
the moment either source changed) was deleted in favor of Swagger as the
single source of truth.

## Verification performed (not claimed — actually run)

- `npm install` — clean install, 0 high/critical vulnerabilities after
  bumping `nodemailer` to v10 (see Known limitations for the one remaining
  moderate advisory)
- `npm run lint` — 0 errors
- `npm run format:check` — passes
- `npm test` — **43/43 passing**, 11 suites
- `docker build` — succeeds
- `docker compose up` — API + MongoDB both start; container reports
  `healthy`
- Live smoke test against the running container: `/health` → `200`
  `{"status":"ok","db":"connected"}`; register → real JWT returned with no
  password field; job creation with a bearer token → `201`; public job
  listing → `200` with the created job; `/api/users/me` with no token →
  `401`; `/api-docs` → `200`
- Live header check: Helmet headers present (`Strict-Transport-Security`,
  `X-Content-Type-Options`, `X-Frame-Options`); rate-limit headers present
  (`RateLimit-Limit`/`Remaining`/`Reset`)
- Live injection probe: a NoSQL-operator login payload
  (`{"email":{"$gt":""}}`) is rejected with `400 VALIDATION_ERROR`, not a
  `500` or a bypass

## Known limitations / accepted trade-offs

- **`qs` moderate advisory**: transitive through Express 4's own
  `body-parser` dependency; no non-breaking fix exists upstream at the time
  of writing. An Express 5 migration would resolve it — not done here to
  avoid an unrequested framework-major-version change; tracked in the
  README's Future Improvements.
- **Socket.IO presence is single-process** (in-memory `Map`, not Redis) —
  correct for one instance, documented as the ceiling in
  `src/realtime/presence.js`. Add a Redis adapter if this ever runs on more
  than one Node process.
- **No admin bootstrap script**: `admin` accounts are provisioned directly
  in the database (`db.users.updateOne(..., {$set:{role:"admin"}})`) since
  the public register endpoint deliberately rejects self-service admin
  registration. There's no seed script for this — a real deployment would
  add one.
- **E2E browser tests are not included** — this is an API, verified at the
  API level (integration tests + live smoke tests above); no frontend
  exists to drive end-to-end.

## Running it

```bash
npm install
cp .env.example .env   # set real JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / MONGODB_URI
npm run dev             # or: npm start
```

```bash
docker compose up --build   # API on :3000, MongoDB on :27017
```

## Running the tests

```bash
npm test               # 43 tests, in-memory MongoDB, no external DB needed
npm run test:coverage
npm run lint
npm run format:check
```

## Recommended GitHub presentation

- Repository description: "Recruitment + startup-investment platform API —
  JWT auth with refresh rotation, RBAC, Stripe payments with webhook
  verification, real-time Socket.IO, Docker, CI, 43 tests."
- Topics: `nodejs`, `express`, `mongodb`, `jwt`, `stripe`, `socket-io`,
  `rest-api`, `docker`, `jest`
- Pin `AUDIT.md` and `FINAL_AUDIT.md` in the repo description or README
  top — a documented before/after is a stronger interview artifact than a
  clean-looking repo with no visible history of judgment calls.
- Do not restore the daily-activity workflow.

## CV bullet points

- Redesigned a fragmented 3-module Node.js/Express codebase (3 duplicate
  auth systems, no service layer) into a layered architecture
  (routes/controllers/services/models) with one shared auth system and
  role-based authorization.
- Found and fixed critical security vulnerabilities including a hardcoded
  JWT secret, a plaintext-password reset path, and an unauthenticated
  Socket.IO layer that allowed cross-user data access; documented the full
  audit trail.
- Implemented JWT authentication with rotating, hashed refresh tokens and a
  single-use, TTL-expiring password-reset flow.
- Built a Stripe-backed investment workflow with signature-verified,
  idempotent webhook processing — payment state is never trusted from the
  client.
- Designed a recruitment application lifecycle with an enforced state
  machine and database-level duplicate-application prevention.
- Wrote a 43-test Jest/Supertest suite (unit + integration against an
  in-memory MongoDB) and a CI pipeline (lint, format, test, coverage,
  dependency audit, Docker build) that runs on every push.
- Containerized the application with Docker/Docker Compose, including a
  functional container health check wired to a real `/health` endpoint
  that checks database connectivity.
