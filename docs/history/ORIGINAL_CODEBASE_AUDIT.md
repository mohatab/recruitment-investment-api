# Original codebase audit

> **Historical record** (formerly `AUDIT.md` at the repository root; see the
> [history index](./README.md)). This describes the repository as it stood on
> 2026-09-08, _before_ the rebuild — three glued-together mini-APIs, a
> hardcoded JWT secret, publicly readable CVs and the rest. It is kept as the
> before-state the rebuild was measured against, and is deliberately not
> updated. Nothing here describes the current system: for that, start at
> [README.md](../../README.md), [docs/ARCHITECTURE.md](../ARCHITECTURE.md) and
> [docs/SECURITY.md](../SECURITY.md).

Audit date: 2026-09-08. Based on a full read of every route, model, middleware,
config, test, and workflow file in the repository (no file skipped).

## 1. Current Architecture

Not a layered architecture — a **workspace of three independent mini-APIs**
glued together in `index.js`, named after the three people who built them:

```
index.js            → creates the Express app + one Socket.IO server,
                       mounts all 19 route files, defines a duplicate
                       "create notification" handler inline in the socket
                       connection handler
shared/db.js         → the only genuinely shared code (mongoose.connect)
mahmoud/  (recruitment)   → routes/ + models/ (User, Job), own JWT middleware,
                            own uploads/ dir with real committed files
matrix/   (investor/startup) → routes/ + models/ (user, Investor, Startup,
                            token), own Stripe + email logic, no JWT issuance
mohamed/  (notifications/chat/profile) → routes/ + models/ (user, investor,
                            Experience, Notification, Message, Userchat, your),
                            own JWT middleware with a hardcoded secret
```

There is no service layer, no controller layer, and (mostly) no separation
between route handling and business logic — handlers talk to Mongoose
directly. Several files (`apply.js`, `contact.js`, `investmentcriteria.js`,
`successprediction.js`) even define their `mongoose.Schema` inline in the
route file instead of in `models/`.

Each of the three folders re-solves the same problems independently: there
are **three separate `User`-shaped models**, **three separate JWT schemes**,
and duplicated CORS/JSON/error middleware.

## 2. Current Features (verified against code, not README claims)

- Recruitment: job posting/listing (`mahmoud/postjop.js`), job application
  (`apply.js` — freestanding, not linked to a job or user), CV-based signup
  (`signupwithcv.js`), a "contact" form with image upload (`contact.js`), a
  toy startup-success predictor (`successprediction.js`), and a standalone
  investment-criteria collector (`investmentcriteria.js`).
- Investor/Startup: user CRUD (`matrix/users.js`), investor/startup profile
  CRUD (no auth), a password-change endpoint that edits an **in-memory fake
  user**, a password-reset-by-email flow, and Stripe payment endpoints
  (list payment methods, create one from a hardcoded test card, create a
  PaymentIntent, refund).
- Notifications/Chat/Profile: CRUD notifications broadcast over Socket.IO,
  a chat system (REST + Socket.IO) with online-presence tracking, a
  duplicate investor-profile CRUD, a duplicate user auth system, a work
  "Experience" collector, and a "tell your story" profile collector (`your`
  model — birthdate/nationality/location/phone, world-readable).
- Cross-cutting: Swagger UI at `/api-docs` generated from JSDoc comments
  across all three folders into one spec; a Jest+Supertest smoke suite (4
  tests); a CI workflow running `npm test`; a second workflow that commits
  a line to `activity.md` every day purely to keep the GitHub contribution
  graph green.

## 3. Strengths (keep these)

- `index.js` already fails fast if `JWT_SECRET` is unset (no insecure
  default), separates `connectDB()`/`server.listen()` from `module.exports`
  so the app is testable with Supertest without a live DB, and has a
  graceful-shutdown handler on `SIGINT`.
- Passwords in `mahmoud`'s `User` model are hashed in a `pre('save')` hook
  with bcrypt — the right pattern (hash in the model, not the route).
- File uploads use `sanitize-filename` + a `multer` file-size limit in the
  `contact.js` upload path, and `mongoose.Types.ObjectId.isValid()` guards
  exist before several `findById` calls (`mohamed/investorRoutes.js`,
  `matrix` startup/investor routes).
- The password-reset token (`matrix/models/token.js`) uses a Mongo TTL
  index (`expires: 3600`) for automatic expiry — a real, working mechanism,
  not just a comment.
- Swagger annotations are present and mostly accurate for the routes they
  document; the OpenAPI spec is generated from real code paths, not typed
  by hand separately (so it can't drift as badly as a hand-maintained spec).
- The Jest smoke tests are honest about their own scope — the file's
  comment says outright they don't hit the DB, rather than pretending to be
  full coverage.
- The README already documents real duplication and gaps instead of
  hiding them ("Future Improvements" section is accurate).

## 4. Weaknesses

- Three parallel, incompatible authentication systems with no shared
  concept of "the current user" or role.
- Route handlers are also the data layer — no services, no repositories,
  validation logic copy-pasted per route instead of shared schemas.
- Heavy per-route duplication: three JWT-verify middlewares, two
  "create notification and emit over socket" implementations (one inline
  in `index.js`, one in `notificationRoutes.js`), two investor CRUD APIs,
  two startup/user "tell me about yourself" collectors.
- Business domains that the brief for this project implies (a job → an
  application → a recruiter decision; a startup → an opportunity → an
  investment) don't actually connect: `Application`, `InvestmentCriteria`,
  `Experience`, and the `your` profile model all stand alone with **no
  foreign key to a `Job`, `User`, `Investor`, or `Startup`**.

## 5. Security Issues (verified in code)

| #   | Issue                                                                                                                                                                                                                                                                                                                                                                                                                        | Location                                                        | Severity                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | JWT secret hardcoded as the literal string `"secret"`, ignoring `process.env.JWT_SECRET` entirely                                                                                                                                                                                                                                                                                                                            | `mohamed/routes/userRoutes.js:41,150`                           | **CRITICAL**                                                                            |
| 2   | Password-reset sets `user.password = req.body.password` and saves — but `matrix/models/user.js` has **no `pre('save')` hashing hook** (unlike `mahmoud`'s User). Every password reset on this model stores the new password **in plaintext**.                                                                                                                                                                                | `matrix/routes/passwordReset.js:91-92`, `matrix/models/user.js` | **CRITICAL**                                                                            |
| 3   | `GET /api/matrix/users` returns full user documents including the bcrypt hash (`.password`) with no field projection                                                                                                                                                                                                                                                                                                         | `matrix/routes/users.js:29-37`                                  | **CRITICAL**                                                                            |
| 4   | Password-reset request endpoint replies `"user with given email doesn't exist"` when the email isn't registered — classic account-enumeration oracle                                                                                                                                                                                                                                                                         | `matrix/routes/passwordReset.js:56`                             | HIGH                                                                                    |
| 5   | `/api/matrix/password/change` doesn't touch the real database at all — it mutates a hardcoded in-process `fakeUser` object, so it silently does nothing meaningful for real users while returning a success-looking 200                                                                                                                                                                                                      | `matrix/routes/password.js`                                     | HIGH (masquerading feature)                                                             |
| 6   | Socket.IO `joinUserRoom` joins the socket to `user_{userId}` and `role_{role}` purely from a client-supplied `userId` in the payload — no token/session check. Any client can join any user's private notification room, or any role's broadcast room, just by sending that id.                                                                                                                                              | `index.js:81-96`                                                | **CRITICAL**                                                                            |
| 7   | Chat REST endpoints (`GET /conversations/:userId`, `GET /messages/:roomId`) and Socket.IO `join room`/`chat message` events read/write another user's messages given only an id — no ownership or membership check                                                                                                                                                                                                           | `mohamed/routes/chat.js` (whole file)                           | **CRITICAL**                                                                            |
| 8   | JWTs issued with no `expiresIn` at all (`signupwithcv.js` register-cv, register-manually, login all call `jwt.sign({id}, secret)` with no options) — tokens never expire                                                                                                                                                                                                                                                     | `mahmoud/routes/signupwithcv.js:65,90,115`                      | HIGH                                                                                    |
| 9   | Failed-login paths return HTTP 200 with a plain string body (`res.send("Invalid credentials")`), not a 401 — a client that checks status codes (correctly) will treat a failed login as success                                                                                                                                                                                                                              | `mohamed/routes/userRoutes.js:92,147`                           | HIGH                                                                                    |
| 10  | Every route accepts a client-supplied `user_type`/role field directly onto the model with no server-side authority check (recruiter vs. candidate, investor vs. startup) — the pattern this project would need for RBAC doesn't exist yet, so nothing currently stops privilege escalation via request body                                                                                                                  | `mohamed/models/user.js`, `mohamed/routes/userRoutes.js:100`    | HIGH                                                                                    |
| 11  | Stripe: no webhook endpoint/signature verification anywhere in the code — `payment.js` treats a client-supplied `paymentMethodId` and a locally-computed `paymentIntent` result as authoritative, with no persisted `Payment`/`Investment` record and no idempotency key                                                                                                                                                     | `matrix/routes/payment.js` (whole file)                         | HIGH                                                                                    |
| 12  | `create-payment-method` builds a raw card number (`4242...`, a Stripe test card, but the _pattern_ is the problem) server-side via `stripe.paymentMethods.create({card:{number:...}})` — real card numbers must never transit your own server; this requires special unrestricted-PCI Stripe permissions in production and is the wrong integration shape (should be Stripe Elements/PaymentIntent client-side confirmation) | `matrix/routes/payment.js:92-108`                               | MEDIUM (pattern risk, not an active leak since the number is a test constant)           |
| 13  | No rate limiting, no `helmet` actually wired into `index.js` despite being an installed dependency, no request size limits beyond multer's per-file limit, no NoSQL-injection sanitization (`req.body` passed straight into Mongoose queries/documents in several places, e.g. `matrix/routes/startupRoutes.js:85` `new MatrixStartup(req.body)` with no allow-list)                                                         | repo-wide                                                       | HIGH                                                                                    |
| 14  | `.gitignore` does not exclude `mahmoud/uploads/` — real uploaded PDFs and images (someone's coursework files, used while testing the CV-upload feature) are sitting in the working tree unignored                                                                                                                                                                                                                            | `.gitignore`, `mahmoud/uploads/*`                               | MEDIUM (portfolio/privacy hygiene, not a live exploit since there's no git history yet) |
| 15  | `helmet` is a declared dependency but never `app.use(helmet())`'d — dead dependency, no security headers applied                                                                                                                                                                                                                                                                                                             | `package.json` vs `index.js`                                    | MEDIUM                                                                                  |

## 6. Code-Quality Issues

- **`body-parser` is `require()`'d in four files (`matrix/forms.js`,
  `matrix/password.js`, `matrix/passwordReset.js` transitively via
  `forms.js`, `matrix/payment.js`) but is not in `package.json`
  dependencies.** A clean `npm install && node index.js` **crashes on
  startup** with `Cannot find module 'body-parser'`. Verified by grepping
  every `require()` in the repo against `package.json`. This is also
  pointless: Express 4.21 has had `express.json()` built in since 4.16,
  and it's already applied globally in `index.js`.
- Duplicate "create + broadcast a notification" logic exists in two
  places with slightly different validation (`index.js`'s
  `newNotification` socket handler vs. `notificationRoutes.js`'s
  `send-notification`) — a change to one silently doesn't apply to the
  other.
- `mohamed/routes/userRoutes.js` projects/queries a `username` field
  (`User.find({}, {_id:1, username:1})`, `findById(id, "email username
phone")`) that doesn't exist anywhere in `mohamed/models/user.js`
  (which has `firstName`/`lastName`, no `username`) — dead/broken code
  that always returns empty for that field.
- `matrix/routes/forms.js` declares an Express error-handling middleware
  (`router.use((err,req,res,next)=>...)`) **before** mounting
  `investorRoutes`/`startupRoutes` — Express only routes errors to
  handlers declared _after_ the throwing middleware, so this handler can
  never catch errors from the routes it's meant to protect.
- Four separate ad-hoc "missing required field" validators
  (`if (!x || !y || ...)`) instead of one shared Joi/validation layer,
  despite `joi` already being a dependency and already used in two files.
- `console.log`/`console.error` used for all logging — no levels, no
  structured output, no way to turn down verbosity in production.
- Global mutable state for the "automatic notifications" toggle
  (`global.notificationInterval`) — a singleton interval shared by every
  request, with no per-user/per-role scoping despite `targetRole` being an
  argument.
- Multiple models exist purely to route around Mongoose's "model already
  compiled" error (`mongoose.models.X || mongoose.model('X', ...)`)
  instead of using a single model-registration module — a symptom of
  files being required in more than one place with no central export.

## 7. Architectural Problems

- No auth/user module shared across the app — three teams built three
  logins. This is the single highest-leverage refactor: consolidating to
  one `User` model + one auth middleware fixes items #1, #2, #8, #9, #10
  above as a side effect.
- No service/business-logic layer — every route function does
  validation, DB access, and response shaping inline, which is why the
  same validation gets re-implemented slightly differently everywhere.
- Domain models that should reference each other don't:
  `Application` has no `job`/`applicant` ref, `InvestmentCriteria` and
  `Experience` have no `user` ref, `Investor`/`Startup` (both versions)
  have no `user` ref. Without these refs, "recruiter reviews applications
  for their own job" or "investor sees startups matching their criteria"
  cannot be built at all — the data model doesn't support the workflow the
  product is supposed to provide.
- Two competing `Investor` models/routes (`matrix` and `mohamed`) with
  different fields and no shared identity.

## 8. Missing Production Features

Health check endpoint, structured logging, centralized error-handling
middleware with typed error classes, rate limiting, security headers
(`helmet` unused), request correlation IDs, Stripe webhook handling,
Docker/docker-compose, environment-based config validation beyond
`JWT_SECRET`, graceful handling of Mongo connection loss after startup,
pagination on any list endpoint (`GET` job list, applications, investors,
startups, notifications, users all currently return every document
unbounded).

## 9. Testing Gaps

4 smoke tests total, all pre-DB-call guard checks (missing-field 400s and
missing-token 401). Zero coverage of: registration/login happy paths,
authorization boundaries (candidate vs. recruiter, investor vs. startup),
duplicate-application prevention (doesn't exist yet), password reset,
payments, Socket.IO events, or any actual database read/write. No test
database setup (e.g. `mongodb-memory-server`) exists.

## 10. Documentation Gaps

Swagger is generated from real route JSDoc, which is good, but it
describes the _current_ fragmented structure (three tag families, three
auth flows) rather than a coherent product. `API_DOCUMENTATION.md` is a
second, hand-written, partially-Arabic doc that will drift from
`swagger.json` the moment either one is edited — two sources of truth for
the same information.

## 11. DevOps/Deployment Gaps

No `Dockerfile`, no `docker-compose.yml`, no `.dockerignore`, no lint
script, no format script, no health-check endpoint for a container
orchestrator to probe, CI only runs `npm test` (no lint, no build step,
no dependency audit). The second workflow (`daily-activity.yml`) commits
a synthetic line to `activity.md` once a day purely to keep the commit
graph green — this is contribution-graph padding, not real activity, and
reads as exactly that to anyone who opens the repo. **Recommend removing
it** before treating this as a portfolio piece; it undercuts the honesty
of everything else here.

## 12. Database/Schema Problems

- 4 different "user" documents across 3 Mongoose connections to the same
  DB, registered as `User`, `user`, `MohamedUser`, plus the standalone
  `your` profile collection — genuinely duplicated identity data with no
  way to know if `matrix`'s user #123 is the same person as `mohamed`'s
  user #123.
- No indexes beyond the ones Mongoose creates automatically for `unique:
true` fields and the one explicit index on `Notification.createdAt`.
  Nothing indexes `Job` fields used for search/filtering, nothing indexes
  foreign keys (because the foreign keys don't exist yet).
- Inconsistent required/validation strictness: `mahmoud.Job` requires
  almost everything; `matrix.Investor` requires nothing at all (an empty
  POST body creates a valid empty investor); `mohamed`'s `investor.js`
  requires `linkedIn` (an odd required field for an optional social link).
- No `timestamps: true` on most schemas (`Job`, `Investor` ×2, `Startup`,
  `Message`, `Userchat`, `your`) — only `mohamed`'s `user` and `investor`
  models have it.

## 13. API Design Problems

- No consistent response envelope — some routes `res.json(doc)`, some
  `res.send(doc)`, some `{message, data}`, some `{success, data}`, some
  plain strings on error (`res.send("Invalid credentials")`).
- Status codes inconsistent: some validation failures return 400, others
  (`mohamed` login/register) return default 200 on failure paths (bug,
  see Security #9).
- No pagination/filtering/sorting on any collection endpoint.
- Route naming/prefixing is by author, not by resource
  (`/api/mahmoud/...`, `/api/matrix/...`, `/api/mohamed/...`) — a
  consumer can't guess where "jobs" or "investors" live without reading
  the source.

## 14. Recommended Improvements (see roadmap for sequencing)

Consolidate to one auth system and one `User` model with a real `role`
enum; add a service layer; wire `helmet`, rate limiting, and Mongo
sanitization; add foreign keys between domain models so the recruitment
and investment lifecycles in the brief actually exist; replace the fake
password-change endpoint and the plaintext-reset bug; add a Stripe
webhook; add real integration tests against an in-memory Mongo; add
Docker + a real CI pipeline; rewrite the README/API docs once the surface
is stable; remove the daily fake-activity workflow.

## 15. Prioritized Roadmap

**CRITICAL** (fix before anything else — active vulnerabilities / broken install)

1. Add missing `body-parser` dependency _or_ (preferred) delete every
   `require("body-parser")` and rely on the already-applied
   `express.json()` — the app cannot `npm install && start` cleanly today.
2. Fix hardcoded JWT secret in `mohamed/routes/userRoutes.js`.
3. Fix plaintext password on reset in `matrix` (`user.password` hashing).
4. Stop returning password hashes from `GET /api/matrix/users`.
5. Authenticate Socket.IO connections; stop trusting client-supplied
   `userId`/room membership for notifications and chat.
6. Consolidate the 4 duplicate User models into one shared `User` model
   - one JWT auth middleware + role-based authorization.

**HIGH** 7. Add `job`/`applicant` refs to `Application`; add duplicate-application
prevention and an application-status state machine. 8. Add `user` refs to `Investor`, `Startup`, `InvestmentCriteria`,
`Experience`. 9. Wire `helmet`, `express-rate-limit`, and Mongo query sanitization. 10. Replace the fake in-memory password-change endpoint with a real one
against the authenticated user. 11. Add Stripe webhook handling + a persisted `Payment`/`Investment`
record; stop building raw card numbers server-side. 12. Give every JWT a real, short expiry + document it. 13. Standardize the response envelope and status codes across all routes. 14. Add `.gitignore` entry for uploads; move real uploaded files out of
the working tree.

**MEDIUM** 15. Add a centralized error-handling middleware + typed error classes. 16. Add pagination/filtering/sorting to list endpoints. 17. Add indexes for query-heavy fields and foreign keys. 18. Replace ad-hoc field-presence checks with shared Joi schemas. 19. Add a `GET /health` endpoint (app + Mongo connectivity). 20. Add structured logging with levels.

**LOW / OPTIONAL** 21. Add Docker + docker-compose for local dev. 22. Expand CI to lint + coverage reporting + `npm audit`. 23. Remove the daily fake-activity-log workflow. 24. Rewrite README/API docs once the surface is stable; delete the
duplicate hand-written `API_DOCUMENTATION.md` in favor of Swagger as
the single source of truth (or vice versa — pick one). 25. Reconsider the "success prediction" endpoint — it's a hardcoded
if/else with no actual model behind it; either relabel it honestly
as a rule-based heuristic in its docs, or drop it. Don't ship it
described as prediction/ML if it isn't.
