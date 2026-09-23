# Breaking changes & migrations

The rebuild changed the external contract in a handful of ways that a client or
an existing database would notice. This is that list — not a commit log.

Every change below is already implemented and tested; what follows is what it
means for someone holding an old client or an old database.

---

## API contract

### Everything moved under `/api/v1`

Unversioned paths are gone, with no aliases. `GET /api/jobs` is now
`GET /api/v1/jobs`. Health probes deliberately stay outside the prefix
(`/health`, `/health/ready`): they are infrastructure endpoints, not product
API, and must not move when `v2` arrives.

**Client action:** prefix every call. There is no compatibility shim.

### One response envelope

Every successful response is now:

```json
{ "success": true, "data": {}, "message": "..." }
```

and every list adds a `pagination` block:

```json
{ "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
```

The old `meta` key is gone. `limit` is capped at 100.

**Client action:** read results from `data`, not from the response root.

### One error envelope

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "field": "email", "message": "..." }] },
  "requestId": "0b2ef09f-…"
}
```

`code` is stable and safe to branch on; `message` is for humans. The
`requestId` also comes back in the `X-Request-Id` header, so a user-reported
failure can be found in the logs. Status codes follow HTTP semantics —
notably `422` for a well-formed request the domain refuses, distinct from
`400` for a malformed one.

**Client action:** branch on `error.code`, not on message text.

---

## Money is integer minor units

Every monetary field is an integer number of cents and carries a `Cents`
suffix. Floats never touch money: `10.005` is rejected rather than rounded.

| Old field        | Now                                                                  |
| ---------------- | -------------------------------------------------------------------- |
| `amount`         | `amountCents`                                                        |
| `totalRaising`   | `totalRaisingCents`                                                  |
| `minInvestment`  | `minInvestmentCents`                                                 |
| `raisedSoFar`    | `raisedSoFarCents`                                                   |
| `previousRaised` | `previousRaisedCents`                                                |
| —                | `reservedCents` (new: capacity held by investments awaiting payment) |
| —                | `remainingCents` (virtual: target − raised − reserved)               |

Investor criteria moved the same way: `criteria.minInvestmentCents`,
`criteria.maxInvestmentCents`.

**Client action:** send and read integers in cents. Dividing by 100 for display
is the client's job.

**Database action:** existing float amounts are converted by

```bash
node scripts/migrate-money-to-minor-units.js --dry-run
node scripts/migrate-money-to-minor-units.js
```

Idempotent — only documents that still carry an old field are touched, and the
old field is removed in the same update. Values are rounded to the nearest cent
and anything that was not a whole number of cents is reported so it can be
reviewed.

---

## Files are no longer public URLs

Uploads used to be written under a statically served `/uploads` directory, so
anyone with the URL could read anyone's CV. Static serving is gone.

| Old                              | Now                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `user.cvUrl` (public URL string) | `user.cv` — `{ filename, contentType, sizeBytes, uploadedAt, downloadPath }`             |
| `contact.profileImageUrl`        | `contact.image` — same shape, minus `uploadedAt`                                         |
| `GET /uploads/<file>`            | `GET /api/v1/users/me/cv`, `GET /api/v1/users/{id}/cv`, `GET /api/v1/contact/{id}/image` |

The storage key is internal and never serialized; clients follow
`downloadPath`, which enforces authorization on the request that reads the
bytes. A CV is readable by its owner, an admin, or a recruiter who received an
application from that user to one of their own jobs. Contact images are
admin-only. Responses are always `Content-Disposition: attachment` with
`nosniff`.

`application.resumeUrl` still exists, but when it points at a stored CV it now
holds that authorized endpoint rather than a public file URL.

**Client action:** stop storing file URLs; read `downloadPath` and send the
access token with the request.

**Database action:**

```bash
node scripts/migrate-file-urls-to-keys.js --dry-run
node scripts/migrate-file-urls-to-keys.js
```

Idempotent. The storage key is recovered from the old `/uploads/...` URL and
the size from the file itself, so only rows whose file is actually readable are
migrated; an external or lost URL has the dead field removed and is reported,
and that user re-uploads.

---

## Authentication and sessions

Externally visible changes:

- **Refresh tokens rotate.** Each refresh returns a new pair and invalidates the
  presented token. Presenting a rotated token is treated as theft: every session
  for that user is revoked.
- **Sessions can be revoked.** A password change or reset, `logout-all`, or an
  admin deactivation invalidates every outstanding access token immediately and
  disconnects open sockets — access tokens carry a session version that is
  checked on every request.
- **Email verification gates some actions.** Posting a job and starting an
  investment require a verified address (`403 EMAIL_NOT_VERIFIED`). Registration,
  login and browsing do not.
- **Roles come from the stored user**, never from the token's claim, so a forged
  `role` in a validly signed token changes nothing.
- **Admin accounts are not self-registrable.** They are provisioned directly.

**Client action:** replace both tokens after every refresh, and treat a `401`
after a password change as expected — re-authenticate.

---

## Socket.IO

Not part of OpenAPI; the contract lives in
[ARCHITECTURE.md](./ARCHITECTURE.md#event-contract). What changed externally:
the handshake requires an access token, rooms are derived from the session (no
event joins a room), `chat:message` is validated and rate-limited per socket,
and acks use the same error codes as the REST API.

---

## Data model notes for an existing database

Beyond the two migration scripts above:

- **Indexes changed** in Task 11. Mongoose creates new ones on connect but never
  drops superseded ones — run `node scripts/sync-indexes.js` after deploying.
  See [DATABASE.md](./DATABASE.md#index-maintenance).
- **`Application` gained a unique `(job, applicant)` index.** A database with
  pre-existing duplicate applications must have them removed before that index
  can build.
- **`Startup.owner` and `Investor.owner` are unique** — one profile per account.
- **`StripeEvent`** is new: a processed-event log with a 90-day TTL, which is
  what makes webhook delivery idempotent.
