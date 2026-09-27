# API Reference

The authoritative, interactive API reference is **Swagger/OpenAPI at
`/api-docs`** when the app is running — generated from the JSDoc comments
directly above each route handler, so it can't describe an endpoint that
doesn't exist or omit one that does (`test/unit/swagger-contract.test.js`
enforces that in CI).

This file is the human-readable index into that: what exists, grouped by
domain, with a link to the exact source for each, plus the conventions,
status codes and worked examples every endpoint shares.

## Conventions (apply to every endpoint)

- **Base URL**: `http://localhost:3000` in development; `BASE_URL` env var
  elsewhere. Every application endpoint is under **`/api/v1`**; `/health` and
  `/health/ready` are deliberately outside the version prefix.
- **Auth**: `Authorization: Bearer <accessToken>` where required.
- **Response envelope**: `{ success, data, message }`, with a `pagination`
  block added for lists (`page`, `limit`, `total`, `totalPages`), and
  `{ success: false, error: { code, message, details? }, requestId }` on
  failure. `204` responses have no body; the Stripe webhook keeps Stripe's own
  shape. See `common/utils/response.js` and `common/middleware/errorHandler.js`.
- **Pagination/filtering/sorting**: list endpoints accept `page` (default 1),
  `limit` (default 20, max 100) and `sort` (comma-separated, `-field` for
  descending) — `sort` is checked against a per-endpoint allowlist, so an
  unknown field is a `400` rather than an arbitrary database sort. Parsed by
  `common/utils/pagination.js`; domain filters vary per endpoint (documented
  in Swagger and in [`API_ENDPOINT_INVENTORY.md`](./API_ENDPOINT_INVENTORY.md)).
- **Errors**: every error response carries a machine-readable `code`
  (`VALIDATION_ERROR`, `INVALID_JSON`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
  `CONFLICT`, `INVALID_ID`, `DUPLICATE_KEY`, `UPLOAD_ERROR`, `PAYLOAD_TOO_LARGE`,
  `TOO_MANY_REQUESTS`, `INTERNAL_ERROR`, or a 422 business-rule code such as
  `JOB_CLOSED` / `INVALID_STATUS_TRANSITION`) plus the `requestId` that is also
  sent as the `X-Request-Id` header. The full list is
  `common/errors/errorCodes.js`, mirrored in the OpenAPI `Error` schema.

### Envelope examples

```json
{ "success": true, "data": {}, "message": "..." }
```

```json
{ "success": true, "data": [], "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }, "message": "OK" }
```

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "field": "email", "message": "..." }] },
  "requestId": "0b2ef09f-90cd-4ac6-bd52-1dbd4a2f0b2f"
}
```

### Status codes

| Code            | Meaning                                                                                                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200 / 201 / 204 | OK · created (including the first `PUT` to a singleton profile) · deleted, no body                                                                                                                                                 |
| 400             | Malformed request: schema violation (`VALIDATION_ERROR` with `details`), `INVALID_JSON`, `INVALID_ID`, `INVALID_TOKEN`                                                                                                             |
| 401             | No valid session (`UNAUTHORIZED`)                                                                                                                                                                                                  |
| 403             | Authenticated but not allowed (`FORBIDDEN`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_DISABLED`)                                                                                                                                              |
| 404             | Unknown route or resource                                                                                                                                                                                                          |
| 409             | Duplicate (`CONFLICT`, `DUPLICATE_KEY`)                                                                                                                                                                                            |
| 413             | Body over 1mb, or an upload over 5MB                                                                                                                                                                                               |
| 422             | Well-formed, but a business rule refuses it: `JOB_CLOSED`, `INVALID_STATUS_TRANSITION`, `MINIMUM_INVESTMENT_NOT_MET`, `INVESTMENT_NOT_REFUNDABLE`, `RESUME_REQUIRED`, `SELF_MESSAGE_NOT_ALLOWED`, `SELF_STATUS_CHANGE_NOT_ALLOWED` |
| 429             | Rate limited (`TOO_MANY_REQUESTS`)                                                                                                                                                                                                 |
| 500 / 503       | Unexpected failure · readiness probe when MongoDB is unreachable                                                                                                                                                                   |

## Domains

| Domain             | Base path                                                  | Source                                  | Full inventory                                                                                                               |
| ------------------ | ---------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Auth               | `/api/v1/auth`                                             | `src/modules/auth/`                     | [API_ENDPOINT_INVENTORY.md#auth](./API_ENDPOINT_INVENTORY.md#auth-apiv1auth--rate-limited-2015min-per-ip)                    |
| Users              | `/api/v1/users`                                            | `src/modules/users/`                    | [#users](./API_ENDPOINT_INVENTORY.md#users-apiv1users--all-require-auth-unless-noted)                                        |
| Jobs               | `/api/v1/jobs`                                             | `src/modules/recruitment/jobs/`         | [#jobs](./API_ENDPOINT_INVENTORY.md#jobs-apiv1jobs)                                                                          |
| Applications       | `/api/v1/jobs/:jobId/applications`, `/api/v1/applications` | `src/modules/recruitment/applications/` | [#applications](./API_ENDPOINT_INVENTORY.md#applications--nested-apiv1jobsjobidapplications-and-top-level-apiv1applications) |
| Startups           | `/api/v1/startups`                                         | `src/modules/investment/startups/`      | [#startups](./API_ENDPOINT_INVENTORY.md#startups-apiv1startups)                                                              |
| Investors          | `/api/v1/investors`                                        | `src/modules/investment/investors/`     | [#investors](./API_ENDPOINT_INVENTORY.md#investors-apiv1investors)                                                           |
| Investments        | `/api/v1/investments`                                      | `src/modules/investment/investments/`   | [#investments](./API_ENDPOINT_INVENTORY.md#investments-apiv1investments)                                                     |
| Payments (webhook) | `/api/v1/payments`                                         | `src/modules/payments/`                 | [#payments](./API_ENDPOINT_INVENTORY.md#payments-apiv1payments--no-auth-verified-by-stripe-signature-instead)                |
| Notifications      | `/api/v1/notifications`                                    | `src/modules/notifications/`            | [#notifications](./API_ENDPOINT_INVENTORY.md#notifications-apiv1notifications)                                               |
| Messaging          | `/api/v1/messages`                                         | `src/modules/messaging/`                | [#messaging](./API_ENDPOINT_INVENTORY.md#messaging-apiv1messages)                                                            |
| Experience         | `/api/v1/experiences`                                      | `src/modules/experience/`               | [#experience](./API_ENDPOINT_INVENTORY.md#experience-apiv1experiences)                                                       |
| Contact            | `/api/v1/contact`                                          | `src/modules/contact/`                  | [#contact](./API_ENDPOINT_INVENTORY.md#contact-apiv1contact--public)                                                         |
| Health             | `/health`, `/health/ready`                                 | `src/modules/health/`                   | [#health](./API_ENDPOINT_INVENTORY.md#health)                                                                                |

## Key flows

**Register → apply to a job**

```
POST /api/v1/auth/register  { firstName, lastName, email, password, role: "candidate" }
POST /api/v1/users/me/cv    multipart/form-data, field "cv"
POST /api/v1/jobs/:jobId/applications  { coverLetter }   # uses the on-file CV if resumeUrl is omitted
```

A job accepts applications only while it is `open` **and** its
`expirationDate` is in the future; an expired posting disappears from the
public list, refuses applications (`422 JOB_EXPIRED`) and is visible to its
recruiter at `GET /api/v1/jobs/mine`, flagged `isExpired`. A job that already
has applications cannot be deleted (`409 JOB_HAS_APPLICATIONS`) — close it
instead, so candidates keep their history.

**Recruiter reviews an application**

```
GET   /api/v1/jobs/:jobId/applications          # owning recruiter only
PATCH /api/v1/applications/:id/status  { "status": "under_review" }
```

Valid transitions: `submitted → under_review → shortlisted → interview →
accepted`, with `rejected` reachable from any non-terminal state. Skipping a
step (e.g. `submitted → accepted`) is rejected with
`422 INVALID_STATUS_TRANSITION`. If two recruiters move the same application at
once, the second gets `409 APPLICATION_STATUS_CONFLICT` instead of silently
overwriting the first.

**Investor invests in a startup**

```
PUT  /api/v1/investors/me  { criteria: { minInvestmentCents, maxInvestmentCents, industries, stages } }
GET  /api/v1/startups/matches                       # startups matching saved criteria
POST /api/v1/investments  { startupId, amountCents }   # -> { investment, clientSecret }
```

The client confirms payment with Stripe.js using `clientSecret`. The
investment is only marked `paid` — and the startup's `raisedSoFarCents`
incremented — when Stripe's **signed** webhook confirms it
(`POST /api/v1/payments/webhook`), never from a client-reported "success".

## Example requests

<details>
<summary>Register + login</summary>

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Jane","lastName":"Doe","email":"jane@example.com","password":"S3cure!Pass","role":"candidate"}'
# 201 { "success": true, "data": { "user": {...}, "accessToken": "...", "refreshToken": "..." } }

curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"S3cure!Pass"}'
# 200 { "success": true, "data": { "user": {...}, "accessToken": "...", "refreshToken": "..." } }
```

</details>

<details>
<summary>Authenticated request, create + list a job</summary>

```bash
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Authorization: Bearer $RECRUITER_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Backend Engineer","role":"Engineer","description":"...","responsibilities":"...","minSalary":60000,"maxSalary":90000,"salaryType":"yearly","expirationDate":"2027-01-01T00:00:00.000Z"}'
# 201 { "success": true, "data": { "_id": "...", "title": "Backend Engineer", ... } }

curl "http://localhost:3000/api/v1/jobs?role=engineer&page=1&limit=20"
# 200 { "success": true, "data": [ ... ], "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 } }
```

</details>

<details>
<summary>Apply to a job</summary>

```bash
curl -X POST http://localhost:3000/api/v1/jobs/<jobId>/applications \
  -H "Authorization: Bearer $CANDIDATE_TOKEN" -H "Content-Type: application/json" \
  -d '{"coverLetter":"I would be a great fit for this role because..."}'
# 201 { "success": true, "data": { "status": "submitted", ... } }
# a second attempt for the same job -> 409 CONFLICT, not a silent duplicate
```

</details>

<details>
<summary>Failure cases</summary>

```bash
# missing/invalid token
curl http://localhost:3000/api/v1/users/me
# 401 { "success": false, "error": { "code": "UNAUTHORIZED", "message": "Authentication token not provided" } }

# authenticated, but wrong role (candidate trying to post a job)
curl -X POST http://localhost:3000/api/v1/jobs -H "Authorization: Bearer $CANDIDATE_TOKEN" -d '{}'
# 403 { "success": false, "error": { "code": "FORBIDDEN", "message": "This action requires one of these roles: recruiter" } }

# invalid input
curl -X POST http://localhost:3000/api/v1/auth/register -H "Content-Type: application/json" -d '{}'
# 400 { "success": false, "error": { "code": "VALIDATION_ERROR", "message": "\"firstName\" is required; ..." } }
```

</details>

All example values above are placeholders — no real credentials or tokens.

For the request lifecycle, auth/payment/webhook flow diagrams, and _why_ things
are built this way, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).
