# API Reference

The authoritative, interactive API reference is **Swagger/OpenAPI at
`/api-docs`** when the app is running — generated from the JSDoc comments
directly above each route handler, so it can't describe an endpoint that
doesn't exist or omit one that does (`test/unit/swagger-contract.test.js`
enforces that in CI).

This file is the human-readable index into that: what exists, grouped by
domain, with a link to the exact source for each.

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
- **Status codes**: 400 malformed · 401 no session · 403 not allowed · 404
  unknown · 409 duplicate · 413 too large · 422 business rule · 429 rate
  limited. See the README's status-code table.

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

For request/response examples with real `curl` commands, see the README's
[Example requests](../README.md#example-requests) section. For the
request lifecycle, auth/payment/webhook flow diagrams, and _why_ things are
built this way, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).
