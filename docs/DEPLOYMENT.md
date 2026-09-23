# Deployment & operations

What this repository actually supports, and — just as importantly — what a real
deployment still has to supply from outside it.

**This repository provides:** a container image, a Compose file for local and
staging use, startup configuration validation, liveness and readiness probes,
graceful shutdown, two persistent volumes, and maintenance scripts for indexes
and data migrations.

**This repository does not provide:** a cloud deployment, infrastructure as
code, a secret manager, TLS termination, log shipping, metrics, alerting, or
backups. Those are named below where they matter, rather than pretended at.

---

## Build and run

```bash
cp .env.example .env     # then set at least JWT_ACCESS_SECRET and JWT_REFRESH_SECRET
docker compose up --build
```

Compose starts two services on a private network:

| Service | Image           | Published         | Notes                                                        |
| ------- | --------------- | ----------------- | ------------------------------------------------------------ |
| `api`   | built from `./` | `3000:3000`       | non-root (uid 1000), read-only root filesystem, tmpfs `/tmp` |
| `mongo` | `mongo:7`       | **not published** | reachable only as `mongo:27017` inside the Compose network   |

The database port is deliberately unpublished: this MongoDB runs without
authentication, so publishing it would put an open database on the host's
network. For a shell, use `docker compose exec mongo mongosh`.

The image pins its base by digest, so a rebuild produces the same image until
the digest is deliberately bumped. It contains the application source and
production dependencies only — no tests, coverage, scripts, `.env` or `.git`.

## Configuration

Every variable is validated at startup by `src/config/env.js`. If anything is
missing or malformed the process prints **all** the problems and exits 1, which
is what makes a misconfigured container fail immediately rather than at the
first request that needs the value.

Always required: `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (the
two secrets must differ).

Additionally required when `NODE_ENV=production`:

| Variable                                     | Why production insists on it                              |
| -------------------------------------------- | --------------------------------------------------------- |
| `CORS_ORIGIN`                                | An explicit allowlist; `*` is rejected outright           |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`   | Must be at least 32 characters                            |
| `APP_URL`                                    | The client app that verification and reset links point at |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments and signed webhooks                              |
| `SMTP_USER`, `SMTP_PASS`                     | Outgoing email                                            |

`TRUST_PROXY` is off by default. Turn it on **only** behind a proxy that
overwrites `X-Forwarded-For`; otherwise a client can spoof its IP and walk past
every rate limiter. See [`.env.example`](../.env.example) for the full list with
descriptions — it holds placeholders, never real values.

Secrets reach the container as environment variables. This repository has no
opinion about where they come from; supply them from your platform's secret
store rather than a committed file.

## Health and readiness

| Endpoint        | Means                                              | Use it for                    |
| --------------- | -------------------------------------------------- | ----------------------------- |
| `/health`       | The process is up and serving HTTP                 | Liveness / container restarts |
| `/health/ready` | MongoDB answers a ping and the app is not draining | Load-balancer traffic gating  |

Liveness deliberately checks no dependencies: a database outage must not get a
healthy process killed and restarted. Readiness answers `503` with
`{"checks":{"mongodb":"down"}}` while MongoDB is unreachable, and during
shutdown.

```bash
curl -s localhost:3000/health        # {"success":true,"data":{"status":"ok",...}}
curl -s localhost:3000/health/ready  # 200 ready, 503 not_ready
```

Note one startup behaviour: the server connects to MongoDB _before_ it listens,
so while the database is unavailable at boot the port refuses connections
rather than answering 503. Once it is serving, the split above applies.

## Logs

Structured JSON on stdout, one line per request, at the level `LOG_LEVEL` sets.
Request lines carry a `requestId` that is also returned to the client in the
`X-Request-Id` header and in every error body, so a user-reported failure can be
found directly.

```bash
docker compose logs -f api
```

Deliberately never logged: request bodies, query strings, headers, email
contents, tokens and SMTP credentials — see
[SECURITY.md](./SECURITY.md#error-handling--logging). There is no log shipping
here; collect stdout with whatever your platform provides.

## Graceful shutdown

`docker compose stop` (or any SIGTERM) starts a drain: readiness begins failing,
Socket.IO and the HTTP server close, MongoDB disconnects, and the process exits
0 — typically within a second. A watchdog forces exit after 10 seconds if a
connection will not close, and Compose allows 15 seconds before SIGKILL, so the
graceful path always finishes first.

## Persistence and backup

Two named volumes hold everything that must survive a container:

| Volume       | Holds                       | Lost if the volume is removed |
| ------------ | --------------------------- | ----------------------------- |
| `mongo-data` | the database                | all application data          |
| `uploads`    | CVs and contact-form images | every stored file             |

`docker compose down` keeps them; `docker compose down -v` destroys them.

Backing up is not automated here. For the local stack, `mongodump` through
`docker compose exec mongo` and a copy of the `uploads` volume are enough; a
real deployment should use the managed database's snapshots and, if
`STORAGE_DRIVER=s3`, object-storage versioning instead of a local volume.

Because file metadata and file bytes live in two places, a restore should
restore both from the same point in time. A row whose file is missing degrades
to a clean `404` rather than an error, so a mismatch is survivable but visible.

## Indexes and migrations

Mongoose creates missing indexes on connect but never drops one a model no
longer declares. After deploying a change that alters indexes:

```bash
node scripts/sync-indexes.js --dry-run   # report what would change
node scripts/sync-indexes.js             # apply it
```

It is idempotent and touches only indexes, never documents. It is deliberately
not part of startup: dropping an index is a decision to take knowingly, and
building one over a large collection is not something a boot sequence should
trigger.

Data migrations for the rebuild's breaking changes are in
[MIGRATIONS.md](./MIGRATIONS.md). `scripts/db-explain.js` reports query plans
against a realistic fixture and is a diagnostic tool, not a deployment step.

## Stripe webhook

Payment state is only ever changed by a signature-verified webhook, never by
anything the client reports. Point a Stripe endpoint at:

```
POST https://<your-host>/api/v1/payments/webhook
```

subscribe it to the `payment_intent.*`, `charge.refunded` and `charge.dispute.*`
events, and set `STRIPE_WEBHOOK_SECRET` to that endpoint's signing secret. The
route reads the raw body — it is mounted before the JSON parser — because the
signature is computed over the exact bytes Stripe sent. Delivery is
at-least-once; every event id is recorded, so a duplicate is acknowledged
without being applied twice. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the
full lifecycle.

For local testing, `stripe listen --forward-to localhost:3000/api/v1/payments/webhook`
gives you a signing secret for that session.

## What a production deployment still needs

None of these are in this repository, and none can be faked by it:

- **A credentialed, network-isolated MongoDB.** The Compose database is an
  unauthenticated development convenience. Use a managed instance or one with
  authentication enabled, reachable only from the API.
- **TLS in front of the app.** The process speaks HTTP and sends HSTS; a proxy
  terminates TLS. Set `TRUST_PROXY` to match that topology.
- **Secret management**, rather than a `.env` file on a host.
- **Log and metric collection** from stdout.
- **Backups and a tested restore**, for both the database and the uploads.

## Scaling limitations

Worth knowing before running more than one instance:

- **Socket.IO is single-process.** Presence lives in an in-memory `Map` and
  rooms use the default adapter, so a second instance would need a Redis
  adapter and a shared presence store before realtime worked across replicas.
- **Rate limits are per process.** Two instances give a client twice the
  allowance; a shared store is the fix when that matters.
- **The local storage driver is per container.** Replicas each get their own
  disk, so `STORAGE_DRIVER=s3` is the multi-instance answer — the metadata
  stored in MongoDB is driver-independent, so switching needs no data change.

These are deliberate: the deployment model here is one container plus a
database, which is what the project's scale calls for.
