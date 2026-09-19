# Database design

MongoDB via Mongoose. One collection per model below; no embedding of
one-to-many relationships that can grow unboundedly (e.g. a startup's
investments are their own collection, not an array on `Startup` — an
array field grows forever and every read of the parent document would
drag the whole history along with it).

## Collections

| Collection     | Purpose                                                                            | Owner reference                        |
| -------------- | ---------------------------------------------------------------------------------- | -------------------------------------- |
| `User`         | Single identity source for every role                                              | —                                      |
| `RefreshToken` | Hashed, rotating session tokens                                                    | `user`                                 |
| `AuthToken`    | Hashed one-time email tokens (reset, verify)                                       | `user`                                 |
| `Job`          | Recruiter's job posting                                                            | `recruiter` → User                     |
| `Application`  | A candidate's application to a job                                                 | `job` → Job, `applicant` → User        |
| `Startup`      | One fundraising profile per startup account                                        | `owner` → User (unique)                |
| `Investor`     | One profile + criteria per investor account                                        | `owner` → User (unique)                |
| `Investment`   | A Stripe-backed investment                                                         | `investor` → User, `startup` → Startup |
| `Experience`   | A candidate's work-history entry                                                   | `user` → User                          |
| `Notification` | In-app notification (personal or role-broadcast; per-user `readBy` for broadcasts) | `user` → User (nullable)               |
| `Message`      | A direct message                                                                   | `sender`/`receiver` → User             |
| `Contact`      | Public contact-form submission                                                     | — (no account required)                |

## Why one `User` model

The original codebase had four: `mahmoud.User`, `matrix.user`,
`mohamed.MohamedUser`, and a disconnected `your` profile collection with no
owner at all. Nothing tied "user #123" in one module to "user #123" in
another, which is also how a hardcoded JWT secret and a plaintext-password
reset bug ended up isolated to only one of the four (see `AUDIT.md`). One
`User` document with a `role` enum (`candidate` / `recruiter` / `investor`
/ `startup` / `admin`) is both the fix for that and the natural shape for
a platform where the same person could plausibly hold different roles
across the two products.

Profile fields that used to live in the orphaned `your` collection
(birthdate, nationality, location) are now fields on `User` directly — they
were personal profile data with no separate identity of their own; giving
them their own collection was the original bug, not a design worth keeping.

## Relationships and why they're modeled this way

- **`Application` has a unique compound index on `(job, applicant)`.** This
  is what makes "no duplicate applications" a database guarantee, not an
  application-level check-then-insert race. The original codebase's
  `Application` model had no `job` or `applicant` reference at all — every
  application was an orphaned document, so duplicate prevention wasn't
  just missing, it was structurally impossible to add without this change.
- **`Startup.owner` and `Investor.owner` are `unique`** — one profile per
  account, enforced at the database level. A second `PUT /startups/me`
  updates the existing profile (`findOneAndUpdate` with `upsert`) rather
  than ever attempting to create a second one.
- **`Investment` references both `investor` (a User) and `startup`, not an
  `Investor` document.** An investment is made by an _account_, not by
  the investor's criteria profile — those are separate concerns (criteria
  is "what I'm looking for", an investment is "what I actually did"), and
  an account could in principle invest before ever filling in criteria.
- **`Message.roomId` is computed, not stored as a separate `Conversation`
  document.** `roomIdFor(a, b)` is a pure function of two user ids
  (sorted, joined) — deterministic and collision-free for exactly two
  participants, which is all this messaging feature needs. Adding a
  `Conversation` collection would be justified for group chat; it isn't
  for 1:1 messages.
- **`RefreshToken`/`AuthToken` store a hash, never the raw
  token**, and both have a TTL index (`expireAfterSeconds: 0` on
  `expiresAt`) so expiry is enforced by MongoDB itself, not just
  application logic that could be bypassed by calling the model directly.

## Indexes

Every index below exists because a real query in the codebase needs it —
none were added speculatively.

- `User.email` — unique (login lookup, duplicate-registration check)
- `User.role` — admin user-listing filter
- `Job.{status, createdAt}` (public list, newest first), `Job.{recruiter, createdAt}` (`/jobs/mine`), `Job.{title, role, tags}` (text) — free-text search
- `Application.{job, applicant}` — **unique**, the duplicate-prevention constraint (its `job` prefix also serves lookups by job); `Application.{job, createdAt}` and `Application.{applicant, createdAt}` — the two list endpoints
- `Startup.{owner}` — unique; `Startup.{industries, stage}` — the browse/matching filter
- `Investment.{investor, createdAt}` and `Investment.{startup, createdAt}` — the two list endpoints; `Investment.{stripePaymentIntentId}` (unique, sparse) — the webhook's lookup key
- `StripeEvent.{eventId}` — unique, the webhook idempotency guarantee; `StripeEvent.{investment, createdAt}` — per-investment payment history; `StripeEvent.{createdAt}` — TTL, 90-day retention
- `Notification.{user, createdAt}` and `Notification.{targetRole, createdAt}` — `listMine` queries `$or: [{user}, {targetRole}]` sorted by `createdAt`; Mongo satisfies an `$or` by index union, running each branch against its own index, so each branch gets its own compound index with the sort key included, rather than one lone single-field index per branch that can't also serve the sort
- `Message.{roomId, createdAt}` — every message query filters by `roomId` and sorts by `createdAt`; this single compound index serves both (a separate single-field index on `roomId` alone would be redundant, since this compound index's `roomId`-only prefix already serves a `roomId`-alone query — an earlier version of this schema had exactly that redundant index, removed once the query patterns were checked against it)
- `RefreshToken`/`AuthToken.{expiresAt}` — TTL indexes for automatic expiry; `AuthToken.{user, purpose, createdAt}` serves the supersede and cooldown lookups

## Investment constraints

- **Money is integer minor units** in every field (`*Cents`), validated with
  `Number.isSafeInteger` at the schema level as well as by Joi, so a direct
  model write cannot introduce a fractional amount either.
- **Funding invariant**: `raisedSoFarCents + reservedCents <= totalRaisingCents`,
  enforced by conditional updates using `$expr` on the startup document — never
  by reading, comparing and writing in the service.
- `Investment.stripePaymentIntentId` is **unique and sparse**: one investment
  per PaymentIntent, while investments that have not reached Stripe yet coexist
  without a value.
- `Startup.owner` is unique (one profile per account); `remainingCents` is a
  virtual, not a stored field, so it can never drift from the counters.
- Indexes: `Investment.{investor, createdAt}` and `Investment.{startup, createdAt}`
  for the two list endpoints; `Startup.{industries, stage}` for browsing and
  matching. The previous single-field `investor`/`startup` indexes were replaced
  by those compounds.
- Existing float amounts are converted by
  `scripts/migrate-money-to-minor-units.js` (idempotent, supports `--dry-run`,
  and reports any value that was not a whole number of cents).

## Payment event log

- `StripeEvent.eventId` is **unique**: Stripe delivers at least once, and the
  unique index is what makes a duplicate (or concurrent) delivery a no-op
  rather than a second credit. A failed processing attempt deletes its claim so
  a Stripe retry can reprocess the event.
- `StripeEvent.{investment, createdAt}` supports "what happened to this
  investment's payments", and a TTL index on `createdAt` expires records after
  90 days — far longer than Stripe's own retry window.
- `Investment.stripeRefundId` / `autoRefundedAt` record money going back, from
  an admin refund, a dashboard refund reconciled through `charge.refunded`, or
  the automatic refund of an uncreditable payment.

## Recruitment constraints

- `Application.{job, applicant}` is **unique**: one application per candidate
  per job, enforced by the database rather than a check-then-insert that two
  concurrent requests could both pass. The service turns the duplicate-key
  error into `409`.
- `Job.maxSalary` carries a schema validator (`>= minSalary`); because a
  validator only sees the field being written, `job.service` additionally
  validates the **merged** document on partial updates.
- A job is "accepting applications" only while `status: "open"` **and**
  `expirationDate > now`; there is no scheduled job flipping statuses, so the
  time component is part of every query and of the `isExpired` virtual.
- Applications are never orphaned: deleting a job that has any is refused
  (`409`), so `Application.job` always resolves.
- Indexes follow the actual queries: `Job.{status, createdAt}` (public list),
  `Job.{recruiter, createdAt}` (`/jobs/mine`), the text index for search,
  `Application.{job, applicant}` (unique, and its `job` prefix serves lookups
  by job), `Application.{job, createdAt}` and `Application.{applicant, createdAt}`
  for the two list endpoints. The previous single-field `job`/`applicant`
  indexes were dropped as redundant prefixes.

## Investment constraints

- **Money is integer minor units** in every field (`*Cents`), validated with
  `Number.isSafeInteger` at the schema level as well as by Joi, so a direct
  model write cannot introduce a fractional amount either.
- **Funding invariant**: `raisedSoFarCents + reservedCents <= totalRaisingCents`,
  enforced by conditional updates using `$expr` on the startup document —
  never by reading, comparing and writing in the service.
- `Investment.stripePaymentIntentId` is **unique and sparse**: one investment
  per PaymentIntent, while investments that have not reached Stripe yet
  coexist without a value.
- `Startup.owner` is unique (one profile per account); `remainingCents` is a
  virtual, not a stored field, so it can never drift from the counters.
- Indexes: `Investment.{investor, createdAt}` and `Investment.{startup, createdAt}`
  for the two list endpoints; `Startup.{industries, stage}` for browsing and
  matching. The previous single-field `investor`/`startup` indexes were
  replaced by those compounds.
- Existing float amounts are converted by
  `scripts/migrate-money-to-minor-units.js` (idempotent, `--dry-run`
  supported, reports any value that was not a whole number of cents).

## Known, accepted trade-offs

- `Job.list()`'s `role`/`location` filters use a case-insensitive regex,
  which can't use the text index above and falls back to a collection
  scan. At this project's realistic data volume that's a non-issue; at
  real scale the fix is a dedicated search index (the `search` param
  already uses one via `$text`), not indexing every possible substring
  filter. The regex input is escaped (`common/utils/escapeRegex.js`)
  specifically because an _unescaped_ user-controlled regex is a
  denial-of-service risk (catastrophic backtracking) regardless of
  indexing — that part was a real bug, not a trade-off, and is fixed.
- No sharding/replica-set-specific configuration — out of scope for a
  single-instance deployment; `MONGODB_URI` is the only thing that would
  change to point at a replica set or Atlas cluster.
