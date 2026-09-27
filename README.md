# Recruitment & Investment Platform API

[![CI](https://github.com/mohatab/recruitment-investment-api/actions/workflows/ci.yml/badge.svg)](https://github.com/mohatab/recruitment-investment-api/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-5FA04E?logo=node.js&logoColor=white)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A REST API for a platform with two connected sides: **recruitment** (recruiters
post jobs, candidates apply with a stored CV, applications move through an
enforced status lifecycle) and **investment** (startups publish fundraising
rounds, investors save criteria and get matched, and an investment is a real
Stripe-backed payment confirmed by a signed webhook).

Built with Node.js, Express, MongoDB and Socket.IO. It covers authentication
and user management, jobs and applications, startups and investments, Stripe
payments, private file storage, transactional email, in-app notifications and
real-time messaging — documented with OpenAPI and verified by an automated
suite that includes authorization, contract, concurrency and query-plan tests.

This is a portfolio project, engineered to production standards rather than
deployed as a commercial service. [What a real deployment still has to
supply](./docs/DEPLOYMENT.md#what-a-production-deployment-still-needs) is
written down rather than implied.

## At a glance

| Measure      | Verified in the final audit                                                         |
| ------------ | ----------------------------------------------------------------------------------- |
| Tests        | 683 across 37 suites, run against an in-memory MongoDB                              |
| Coverage     | 97.64% statements · 88.30% branches · 97.77% functions · 98.46% lines               |
| API surface  | 46 documented paths · 57 operations · 60 OpenAPI schemas                            |
| Dependencies | `npm audit` reports 0 vulnerabilities                                               |
| Tooling      | ESLint and Prettier clean; CI runs lint, format, coverage, audit and a Docker build |

## Engineering highlights

The parts worth reading first, each with the file that implements it:

- **Concurrency-safe funding reservations.** A pending investment reserves
  capacity, and the reservation is one conditional update whose filter _is_ the
  invariant (`$expr` over the startup's own fields), so MongoDB refuses an
  oversubscription instead of the process deciding. Tested by racing real
  writers, not by mocking. → `investment.service.js`,
  [DATABASE.md](./docs/DATABASE.md#investment-constraints)
- **Money as integer minor units.** Every monetary field is an integer number
  of cents with a `Cents` suffix, end to end through Mongo and Stripe. A
  fractional amount is rejected, never rounded. → `common/utils/money.js`
- **Idempotent Stripe webhooks.** Signature verified over the raw body,
  at-least-once delivery absorbed by a unique processed-event log with a TTL,
  outbound idempotency keys on every call, and event amount/currency checked
  against the stored investment before anything moves. →
  [ARCHITECTURE.md](./docs/ARCHITECTURE.md#investment--payment-flow)
- **Authorization tested as a matrix.** Every protected route is enumerated
  from the real routers and driven through invalid-session shapes, wrong roles,
  forged role claims and ownership/IDOR cases, so an unguarded new route fails
  the suite. → `test/integration/authorization-matrix.test.js`
- **Revocable sessions.** Access tokens carry a session version; a password
  change, reset, `logout-all`, admin deactivation or refresh-token reuse
  invalidates every outstanding token and disconnects open sockets. →
  [SECURITY.md](./docs/SECURITY.md#authentication)
- **Private file storage.** No static serving: uploads are typed by magic
  bytes, stored under server-generated keys, and readable only through
  endpoints that authorize the request that reads the bytes. →
  [ARCHITECTURE.md](./docs/ARCHITECTURE.md#file-storage)
- **Indexes proven by query plans.** Index-sensitive queries assert the winning
  index and the absence of collection scans and in-memory sorts via
  `explain("executionStats")` — a removed index breaks the build. →
  [DATABASE.md](./docs/DATABASE.md#query-plans-and-how-they-were-checked)
- **The OpenAPI document is tested against the code.** Documented parameters
  and bodies must equal what the Joi schemas accept, and no response schema may
  leak a secret. → `test/unit/swagger-contract.test.js`
- **Mutation-tested invariants.** Security and domain rules were re-verified by
  breaking them on purpose: 48 of 49 mutants killed, with the one survivor
  documented in place as a redundant guard.
- **Hardened container.** Non-root, read-only root filesystem, no new
  privileges, one writable volume, and a MongoDB with no published host port. →
  [DEPLOYMENT.md](./docs/DEPLOYMENT.md)

## Tech stack

| Area                | Used                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| Runtime & framework | Node.js 20 (≥18 supported), Express 4                                        |
| Database            | MongoDB 7, Mongoose                                                          |
| Auth & security     | JWT, bcrypt, Helmet, Joi, `express-rate-limit`, `express-mongo-sanitize`     |
| Payments            | Stripe (PaymentIntents + webhooks)                                           |
| Real-time           | Socket.IO                                                                    |
| Files & email       | Multer (memory storage), local disk or any S3-compatible service, Nodemailer |
| Docs                | swagger-jsdoc, Swagger UI                                                    |
| Testing             | Jest, Supertest, `mongodb-memory-server`, `socket.io-client`                 |
| DevOps              | Docker, Docker Compose, GitHub Actions                                       |

## Quick start

### With Docker (nothing else to install)

```bash
cp .env.example .env    # set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET at minimum
docker compose up --build
```

The API listens on `http://localhost:3000`. MongoDB runs on the Compose
network only — its port is deliberately not published to the host, because the
development container runs without authentication. Reach it with
`docker compose exec mongo mongosh`.

### Without Docker

```bash
npm install
cp .env.example .env    # set MONGODB_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
npm run dev             # nodemon; or npm start
```

Needs a MongoDB instance you can point `MONGODB_URI` at. Every environment
variable is validated at startup (`src/config/env.js`): the process exits with
code 1 and a message listing every problem rather than starting misconfigured.
`NODE_ENV=production` additionally requires a `CORS_ORIGIN` allowlist, 32+
character JWT secrets, `APP_URL`, Stripe keys and SMTP credentials. See
[`.env.example`](./.env.example) for the annotated list.

### Run the tests

```bash
npm test                # 683 tests, 37 suites, in-memory MongoDB — no services needed
npm run test:coverage   # same, with a coverage report
npm run lint
npm run format:check
npm audit --audit-level=high
```

## API surface

| Path            | Purpose                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/*`     | Every application endpoint. The version prefix is part of the contract; there are no unversioned aliases.                                |
| `/api-docs`     | Interactive Swagger UI, generated from the route annotations, so it cannot document an endpoint that does not exist.                     |
| `/health`       | Liveness: the process serves HTTP. Checks no dependencies, so a database outage never restarts a healthy container.                      |
| `/health/ready` | Readiness: MongoDB answers a ping and the server is not draining. `503` otherwise — this is what a load balancer should gate traffic on. |

Health probes sit outside `/api/v1` on purpose: they are infrastructure
endpoints, not product API, and must not move when `v2` arrives.

Responses use one envelope — `{ success, data, message }`, plus `pagination`
on lists, and `{ success, error: { code, message, details }, requestId }` on
failures. The conventions, status codes and `curl` examples are in
[docs/API.md](./docs/API.md); the per-route authorization rules and the test
covering each one are in
[docs/API_ENDPOINT_INVENTORY.md](./docs/API_ENDPOINT_INVENTORY.md).

## Security

Implemented controls, in short — the full contract, including what deployment
must supply and which risks are accepted, is in
[docs/SECURITY.md](./docs/SECURITY.md):

- JWT access tokens with server-side session revocation; opaque, single-use,
  hashed refresh tokens with reuse detection
- Role and ownership authorization enforced in services, never by hiding a URL
- Joi validation on every input, with NoSQL operator sanitization and a sort
  allowlist so no user string reaches the database as a field name
- Rate limiting globally and tighter on auth routes, plus per-socket limits
- Helmet security headers, a CORS allowlist, and no stack traces in production
  responses
- Stripe webhooks authenticated by signature over the raw body; payment state
  never accepted from a client
- Private file downloads authorized on the request that reads the bytes, with
  magic-byte content verification on upload (no malware scanning — that is not
  implemented, and not claimed)
- Container hardening and an unpublished database port

## Testing

The suite runs against `mongodb-memory-server`, so it needs no external
services, and exercises real request cycles through Supertest and a real
Socket.IO server on an ephemeral port. Beyond happy paths it covers:

- **Authorization as a matrix** — every protected route × invalid-session
  shapes, wrong roles, forged claims, ownership and IDOR rules
- **API contract** — the OpenAPI document validated and compared against the
  routers and Joi schemas in both directions
- **Concurrency** — real races: oversubscribed rounds, duplicate webhook
  deliveries, double refunds, refresh-token reuse, duplicate applications
- **Query plans** — which index wins, and that no collection scan or in-memory
  sort appears; never elapsed milliseconds
- **Mutation testing** — invariants re-verified by breaking them on purpose
- **Determinism** — the suite passes under `jest --randomize`, which is how
  order-dependent and polluting tests were found and fixed
- **Live container checks** — the built image is exercised end to end
  (authenticated flows, authorization denials, upload/download, Socket.IO
  delivery, webhook signature rejection) before a release is called done

## Project structure

```
src/        application code — app/server bootstrap, config, shared middleware
            and utilities, OpenAPI generation, Socket.IO layer, and one folder
            per domain under modules/
test/       unit and integration suites plus shared fixtures and helpers
scripts/    operational scripts: index sync, query-plan report, data migrations
docs/       architecture, API, database, security, deployment, migrations
.github/    CI workflow
```

Every module follows the same path — `*.routes.js` → `*.controller.js` →
`*.service.js` (business rules and authorization) → `*.model.js` — with its Joi
schemas beside it. Routes never touch Mongoose directly. The module list and
the reasoning behind the layering are in
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md#module-structure).

## Documentation

| Topic                                                                  | Document                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| API conventions, status codes, `curl` examples                         | [docs/API.md](./docs/API.md)                                       |
| Every route with its authorization rule and covering test              | [docs/API_ENDPOINT_INVENTORY.md](./docs/API_ENDPOINT_INVENTORY.md) |
| Request lifecycle, auth/payment/realtime flows, error handling         | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)                     |
| Collections, relationships, indexes and their query plans              | [docs/DATABASE.md](./docs/DATABASE.md)                             |
| Authentication, authorization, upload/payment controls, accepted risks | [docs/SECURITY.md](./docs/SECURITY.md)                             |
| Building, configuring and operating the container                      | [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)                         |
| Breaking changes and the migration scripts for an existing database    | [docs/MIGRATIONS.md](./docs/MIGRATIONS.md)                         |
| Point-in-time audit and rebuild records                                | [docs/history/](./docs/history/)                                   |

[`docs/history/`](./docs/history/) holds snapshots of earlier states of this
codebase — the original version, the first rebuild, and the audit that started
the current hardening pass. They are deliberately not updated and describe the
past, not the current system; they are kept so the decisions in the documents
above can be checked against what they were reacting to.

## Deliberately not built

Each of these is a product decision or a scale threshold this project has not
reached, not an oversight. The reasoning is recorded where the constraint
lives — [DATABASE.md](./docs/DATABASE.md#known-accepted-trade-offs),
[DEPLOYMENT.md](./docs/DEPLOYMENT.md#scaling-limitations),
[SECURITY.md](./docs/SECURITY.md#known-accepted-residual-risks):

- A denormalized `Conversation` collection (measured, and left until deep
  message history justifies the schema change)
- Cursor pagination — the `page`/`limit` contract is public API, so replacing
  it is an API decision rather than a database one
- Horizontal real-time scaling: presence and Socket.IO rooms are per process,
  so a second instance would need a shared adapter first
- A durable notification/message outbox — delivery is best-effort after a
  committed write, and the record is always readable over REST
- Message read receipts, editing, deletion, search and attachments
- Push notifications, admin moderation tooling, and browser-level E2E tests

## License

MIT — see [`LICENSE`](./LICENSE).
