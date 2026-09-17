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
  elsewhere.
- **Auth**: `Authorization: Bearer <accessToken>` where required.
- **Response envelope**: `{ success, data, message }`, with a `meta`
  block added for paginated lists (`page`, `limit`, `total`, `totalPages`)
  and `{ success: false, error: { code, message } }` on failure. See
  `common/utils/response.js` and `common/middleware/errorHandler.js`.
- **Pagination/filtering/sorting**: list endpoints accept `page`, `limit`
  (max 100), and `sort` (comma-separated, `-field` for descending) query
  params, parsed by `common/utils/pagination.js`; domain-specific filters
  vary per endpoint (documented in Swagger and in
  [`API_ENDPOINT_INVENTORY.md`](./API_ENDPOINT_INVENTORY.md)).
- **Errors**: every error response carries a machine-readable `code`
  (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
  `CONFLICT`, `INVALID_ID`, `DUPLICATE_KEY`, `UPLOAD_ERROR`, or
  `INTERNAL_ERROR`) — see `common/errors/AppError.js`.

## Domains

| Domain             | Base path                                            | Source                                  | Full inventory                                                                                                           |
| ------------------ | ---------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Auth               | `/api/auth`                                          | `src/modules/auth/`                     | [API_ENDPOINT_INVENTORY.md#auth](./API_ENDPOINT_INVENTORY.md#auth-apiauth--public-rate-limited-2015min)                  |
| Users              | `/api/users`                                         | `src/modules/users/`                    | [#users](./API_ENDPOINT_INVENTORY.md#users-apiusers--all-require-auth-unless-noted)                                      |
| Jobs               | `/api/jobs`                                          | `src/modules/recruitment/jobs/`         | [#jobs](./API_ENDPOINT_INVENTORY.md#jobs-apijobs)                                                                        |
| Applications       | `/api/jobs/:jobId/applications`, `/api/applications` | `src/modules/recruitment/applications/` | [#applications](./API_ENDPOINT_INVENTORY.md#applications--nested-apijobsjobidapplications-and-top-level-apiapplications) |
| Startups           | `/api/startups`                                      | `src/modules/investment/startups/`      | [#startups](./API_ENDPOINT_INVENTORY.md#startups-apistartups)                                                            |
| Investors          | `/api/investors`                                     | `src/modules/investment/investors/`     | [#investors](./API_ENDPOINT_INVENTORY.md#investors-apiinvestors)                                                         |
| Investments        | `/api/investments`                                   | `src/modules/investment/investments/`   | [#investments](./API_ENDPOINT_INVENTORY.md#investments-apiinvestments)                                                   |
| Payments (webhook) | `/api/payments`                                      | `src/modules/payments/`                 | [#payments](./API_ENDPOINT_INVENTORY.md#payments-apipayments--no-auth-verified-by-stripe-signature-instead)              |
| Notifications      | `/api/notifications`                                 | `src/modules/notifications/`            | [#notifications](./API_ENDPOINT_INVENTORY.md#notifications-apinotifications)                                             |
| Messaging          | `/api/messages`                                      | `src/modules/messaging/`                | [#messaging](./API_ENDPOINT_INVENTORY.md#messaging-apimessages)                                                          |
| Experience         | `/api/experiences`                                   | `src/modules/experience/`               | [#experience](./API_ENDPOINT_INVENTORY.md#experience-apiexperiences)                                                     |
| Contact            | `/api/contact`                                       | `src/modules/contact/`                  | [#contact](./API_ENDPOINT_INVENTORY.md#contact-apicontact--public)                                                       |
| Health             | `/health`                                            | `src/modules/health/`                   | [#health](./API_ENDPOINT_INVENTORY.md#health)                                                                            |

For request/response examples with real `curl` commands, see the README's
[Example requests](../README.md#example-requests) section. For the
request lifecycle, auth/payment/webhook flow diagrams, and _why_ things are
built this way, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).
