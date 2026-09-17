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
- `Job.{recruiter}`, `Job.{status, expirationDate}` (compound), `Job.{title, role, tags}` (text) — owner lookups, the default "open, not expired" list filter, and free-text search
- `Application.{job, applicant}` — **unique**, the duplicate-prevention constraint; also serves job-scoped and applicant-scoped lookups since both fields are index prefixes
- `Startup.{owner}` — unique; `Startup.{industries, stage}` — the matching-endpoint filter
- `Investment.{investor}`, `Investment.{startup}`, `Investment.{stripePaymentIntentId}` (unique, sparse) — the webhook's lookup key
- `Notification.{user, createdAt}` and `Notification.{targetRole, createdAt}` — `listMine` queries `$or: [{user}, {targetRole}]` sorted by `createdAt`; Mongo satisfies an `$or` by index union, running each branch against its own index, so each branch gets its own compound index with the sort key included, rather than one lone single-field index per branch that can't also serve the sort
- `Message.{roomId, createdAt}` — every message query filters by `roomId` and sorts by `createdAt`; this single compound index serves both (a separate single-field index on `roomId` alone would be redundant, since this compound index's `roomId`-only prefix already serves a `roomId`-alone query — an earlier version of this schema had exactly that redundant index, removed once the query patterns were checked against it)
- `RefreshToken`/`AuthToken.{expiresAt}` — TTL indexes for automatic expiry; `AuthToken.{user, purpose, createdAt}` serves the supersede and cooldown lookups

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
