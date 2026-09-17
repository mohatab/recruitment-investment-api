# Architecture

## Module structure

Every domain lives under `src/modules/<name>/` with the same internal
shape: `*.routes.js → *.controller.js → *.service.js → *.model.js`, plus
`*.validation.js` for its Joi schemas. Routes never call Mongoose directly;
controllers never contain business logic; authorization checks
(ownership, role) live in the service layer next to the query they guard,
not scattered across middleware.

```
src/
  app.js            Express app: middleware pipeline + route mounting (no server binding)
  server.js         HTTP server + Socket.IO bootstrap, graceful shutdown, process-level error handlers
  config/           env loading/validation, MongoDB connection
  common/           middleware, errors, utils, storage — shared by every module, owned by none
  docs/swagger.js   OpenAPI spec generated from route JSDoc
  realtime/         Socket.IO auth + connection handling, in-memory presence
  modules/          one folder per domain (see README's Architecture section for the full list)
```

`common/` is deliberately the only cross-module dependency. Modules do not
import each other's internals — where one domain needs another's data
(applications need jobs, investments need startups), it imports that
module's `*.service.js`, the same interface any route would use.

## Request lifecycle

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as Middleware (helmet, cors, sanitize, rate limit)
    participant R as Route
    participant V as Joi validate()
    participant A as authenticate/authorize
    participant Ctrl as Controller
    participant Svc as Service
    participant DB as MongoDB

    C->>MW: HTTP request
    MW->>R: passes security/parsing middleware
    R->>V: validate(schema) — strips unknown fields, coerces types
    V->>A: authenticate (JWT) + authorize (role)
    A->>Ctrl: req.user = { id, role } from verified token only
    Ctrl->>Svc: calls service with validated input + req.user
    Svc->>Svc: ownership/business-rule checks
    Svc->>DB: Mongoose query
    DB-->>Svc: result
    Svc-->>Ctrl: domain object
    Ctrl-->>C: { success, data, message }
```

Errors at any stage (`throw new AppError(...)`, a Mongoose `ValidationError`/
`CastError`/duplicate-key error, or an unexpected exception) are all caught
by `asyncHandler` and routed to the single centralized `errorHandler` —
see [Error handling](#error-handling) below.

## Authentication flow

```mermaid
sequenceDiagram
    participant C as Client
    participant Auth as /api/auth
    participant DB as MongoDB

    C->>Auth: POST /register or /login
    Auth->>DB: create/verify User (bcrypt hash)
    Auth->>DB: create RefreshToken (hashed, TTL-indexed)
    Auth-->>C: { accessToken (15m JWT), refreshToken (opaque) }

    Note over C: access token expires
    C->>Auth: POST /refresh { refreshToken }
    Auth->>DB: find by hash, check revokedAt/expiresAt
    Auth->>DB: revoke old token, insert new one
    Auth-->>C: new { accessToken, refreshToken }
```

The access token is a JWT (`sub`, `role`, `exp`), verified statelessly on
every request — no database lookup needed to authenticate a request, only
to authorize a refresh. The refresh token is deliberately **not** a JWT: it's
an opaque random value whose hash is stored server-side, which is what
makes revocation (logout, password reset, rotation) possible without a
JWT blocklist.

## Authorization

Role lives only in the verified JWT payload (`common/middleware/auth.js`),
set once at login/register from the stored `User.role` — never read from
a request body or query string. `authorize(...roles)` is a route-level
gate; ownership checks (`assertOwnership`, inline `String(x.owner) !==
String(userId)` comparisons) live in each service function, right next to
the query they protect, so the check can't be bypassed by hitting the
service through a different route.

## Real-time (Socket.IO)

```mermaid
sequenceDiagram
    participant Alice
    participant IO as Socket.IO server
    participant Bob

    Alice->>IO: connect (auth: { token })
    IO->>IO: verify JWT — reject if missing/invalid
    IO->>IO: socket.join(`user_<aliceId>`), join(`role_<role>`)
    Bob->>IO: connect (auth: { token })
    IO->>IO: socket.join(`user_<bobId>`)

    Alice->>IO: chat:message { receiverId: bobId, body }
    IO->>IO: persist Message(sender=alice, receiver=bob, roomId)
    IO->>Bob: emit "message" to room `user_<bobId>` only
```

Every room a socket can join is derived from its own verified identity at
connect time — never from an event payload. There is no event that takes a
raw room name or another user's id and joins the caller to it. This is the
direct fix for the original codebase's vulnerability (`AUDIT.md` #6/#7):
`joinUserRoom` there trusted a client-supplied `userId`.

Presence (`realtime/presence.js`) is an in-memory `Map`, not a persisted
collection — it's ephemeral by nature and doesn't need to survive a
restart or be queried. This is a single-process design; scaling to more
than one Node process would need a shared store (Redis) for presence and
Socket.IO's Redis adapter for cross-process room delivery — noted at the
point it would matter, not built speculatively.

## Payment / webhook flow

```mermaid
sequenceDiagram
    participant Investor
    participant API as /api/investments
    participant Stripe
    participant Webhook as /api/payments/webhook
    participant DB as MongoDB

    Investor->>API: POST { startupId, amount }
    API->>DB: Investment.create(status="pending")
    API->>Stripe: paymentIntents.create(amount)
    Stripe-->>API: { id, client_secret }
    API-->>Investor: { investment, clientSecret }
    Investor->>Stripe: confirm payment (Stripe.js, client-side)

    Stripe->>Webhook: POST event (signed)
    Webhook->>Webhook: verify signature (webhook secret)
    Webhook->>DB: findOneAndUpdate({paymentIntentId, status:"pending"}, {status:"paid"})
    Note over DB: atomic — a duplicate/concurrent delivery finds no "pending" doc left and no-ops
    Webhook->>DB: Startup.raisedSoFar += amount
    Webhook->>DB: Notification for startup owner
```

Two deliberate choices here, both because a payment workflow gets this
wrong easily elsewhere:

1. **The server never sees a raw card number.** It creates a PaymentIntent
   and hands the client a `client_secret`; Stripe.js/Elements handles card
   data entirely client-side.
2. **Payment state changes only on a signature-verified webhook**, never on
   a client's "it succeeded" callback — a client can lie or the callback
   can simply never fire (closed tab, network drop); the webhook is the
   only source of truth Stripe itself guarantees will eventually arrive.
3. **The pending→paid transition is the atomic operation**
   (`findOneAndUpdate` filtered on the _old_ status), not a
   read-then-check-then-write — Stripe redelivers webhooks, and a
   read-then-write version of this check has a real race under concurrent
   delivery (see `investment.service.js` for the full comment).

## Error handling

One centralized handler (`common/middleware/errorHandler.js`) turns every
error into the same response shape. `normalize()` maps known failure
shapes — a thrown `AppError` subclass, a Mongoose `ValidationError`,
`CastError`, or duplicate-key error, a Multer file-upload error, a body-parser
failure (malformed JSON → `400 INVALID_JSON`, oversized body →
`413 PAYLOAD_TOO_LARGE`) — to a `{statusCode, code, message}` triple;
anything unrecognized becomes a generic `500 INTERNAL_ERROR` with no stack
trace or internal detail sent to the client. Every error body includes the
`requestId`. Rate-limit rejections (`429 TOO_MANY_REQUESTS`) go through the
same handler.

## Logging and request correlation

- `requestId` middleware reuses a client/proxy `X-Request-Id` only if it
  matches `[A-Za-z0-9._:-]{1,128}`; otherwise it generates a UUID. The id is
  echoed in the response header and in error bodies.
- `requestLogger` writes one JSON line per request when the response
  finishes: `requestId`, `method`, `path` (no query string), matched
  `route`, `status`, `durationMs`, `userId` and `errorCode`. Level: `info`
  for 2xx/3xx, `warn` for 4xx, `error` for 5xx. Health probes log at `debug`
  (`warn` when not ready).
- Headers, query strings and bodies are never logged. Only 5xx errors produce
  an extra `error` entry with a stack (stack omitted in production).

## Why layered instead of a simpler flat structure

A CRUD-only API could get away with routes calling Mongoose directly. This
one has real cross-cutting rules — an application can't skip a status, an
investor can't invest below a startup's minimum, a webhook must be
idempotent — that don't belong in a route handler and get copy-pasted if
they're not centralized. The service layer is where those rules live
exactly once. It's also what makes the unit tests for the status
transition table and the success-assessment heuristic possible without
an HTTP layer or a database at all.
