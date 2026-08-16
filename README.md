# Recruitment & Investment Platform API

[![CI](https://github.com/mohatab/recruitment-investment-api/actions/workflows/ci.yml/badge.svg)](https://github.com/mohatab/recruitment-investment-api/actions/workflows/ci.yml)

A Node.js/Express REST API combining a recruitment platform (job postings, CV-based
applications) with an investor–startup management system, real-time notifications,
and in-app messaging.

## Overview

This API was built as three related backend modules sharing one Express app,
one MongoDB database, and one Swagger/OpenAPI spec:

- **Recruitment** (`/api/mahmoud/*`) — job postings, CV/manual signup, job
  applications, contact capture, and a simple startup-success prediction endpoint.
- **Investor & Startup management** (`/api/matrix/*`) — investor and startup
  profiles, investment criteria, password reset, and Stripe-based payments.
- **Notifications & Messaging** (`/api/mohamed/*`) — real-time notifications and
  chat over Socket.IO, user profiles, work experience, and story sharing.

The route prefixes (`mahmoud`, `matrix`, `mohamed`) are the original module names
from development and are kept as-is below since they match the routes in the code.

## Features

- JWT-based authentication, including CV-upload signup (`multipart/form-data`)
- Job posting, browsing, and application workflow
- Startup and investor profile management
- Stripe payment methods, charges, and refunds
- Real-time notifications and chat via Socket.IO
- Password reset via emailed links (Nodemailer)
- Swagger/OpenAPI docs generated from route annotations

## Tech Stack

- **Node.js** / **Express**
- **MongoDB** + **Mongoose**
- **Socket.IO** — real-time notifications and chat
- **JWT** + **bcrypt** — authentication
- **Stripe** — payments
- **Multer** — file uploads (CVs, images)
- **Nodemailer** — password-reset emails
- **Joi** — request validation
- **swagger-jsdoc** + **swagger-ui-express** — API documentation

## Project Structure

```
mahmoud/    # Recruitment module: routes + models (User, Job)
matrix/     # Investor/startup module: routes + models, payments, email utility
mohamed/    # Notifications, chat, experience, and user-profile module
shared/     # Shared MongoDB connection (shared/db.js)
swagger.js  # OpenAPI spec generation from JSDoc route comments
index.js    # App entry point: mounts all routes, Socket.IO, error handling
```

## Getting Started

### Prerequisites

- Node.js v14+
- MongoDB (local or hosted)

### Setup

```bash
git clone https://github.com/mohatab/recruitment-investment-api.git
cd recruitment-investment-api
npm install
cp .env.example .env   # fill in real values
node index.js          # or: npx nodemon index.js (dev, dev-only dependency)
```

The API runs at `http://localhost:3000`, with interactive Swagger docs at
`http://localhost:3000/api-docs`.

## Environment Variables

See [`.env.example`](./.env.example). Every variable listed there is read
directly by the app (verified against source, not just documentation):

| Variable          | Used for                                              |
| ------------------ | ------------------------------------------------------ |
| `PORT`             | HTTP server port (defaults to `3000`)                  |
| `MONGODB_URI`      | MongoDB connection string                               |
| `JWT_SECRET`       | Signing secret for auth tokens — **required**, the app refuses to start without it (no default fallback) |
| `STRIPE_SECRET_KEY`| Stripe API key for payments                              |
| `BASE_URL`         | Base URL used to build password-reset links             |
| `HOST` / `SERVICE` | SMTP host/service for outgoing email (Nodemailer)        |
| `USER` / `PASS`    | SMTP credentials for outgoing email                      |

## API Documentation

Full interactive documentation (generated from the route annotations) is served
at `/api-docs` when the app is running. Authentication uses a JWT bearer token:

```
Authorization: Bearer {token}
```

### Example: register a user

```
POST /api/mahmoud/signup/register-manually
Content-Type: application/json

{ "username": "string", "email": "string", "password": "string" }
```

Response `201`:

```json
{ "message": "Registered successfully", "token": "JWT_TOKEN" }
```

### Example: create a startup profile

```
POST /api/matrix/forms/startup/startup
Content-Type: application/json

{ "name": "string", "email": "string", "description": "string" }
```

Response `201`:

```json
{ "_id": "string", "name": "string", "email": "string", "description": "string", "createdAt": "date" }
```

### Endpoint groups

| Module | Base path | Covers |
| --- | --- | --- |
| Recruitment | `/api/mahmoud/*` | signup/login, job posting & listing, applications, contact form, success prediction |
| Investor/Startup | `/api/matrix/*` | users, startups, investors, investment criteria, password reset, payments |
| Notifications & Messaging | `/api/mohamed/*` | notifications, chat (Socket.IO), experience, stories, user profiles, investors |

### Common status codes

`200` success · `201` created · `400` invalid input · `401` unauthorized ·
`403` forbidden · `404` not found · `500` server error

### Error response shape

```json
{ "error": "message", "status": 400 }
```

## Database

MongoDB via Mongoose. Each module currently defines its own models — there is
some duplication across modules (see Future Improvements):

- **mahmoud**: `User`, `Job`
- **matrix**: `User`, `Investor`, `Startup`, `Token` (password-reset tokens)
- **mohamed**: `User`, `Investor`, `Experience`, `Notification`, `Message`, story/content models

## Testing

```bash
npm test
```

Runs a Jest + Supertest smoke suite covering request validation and auth
guards (missing-field validation, missing-token rejection, 404 handling).
These run against the Express app directly and don't require a live
database connection. Database-backed integration tests are not in place
yet (see Future Improvements).

## CI

GitHub Actions runs the test suite on every push and pull request to
`master` — see [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

## Deployment

Not currently deployed.

## License

MIT — see [`LICENSE`](./LICENSE).

## Future Improvements

- Add database-backed integration tests (e.g. with an in-memory MongoDB
  instance) covering the routes that read/write data
- Consolidate the duplicate per-module `User` models into a single shared
  auth/user model
- Move uploaded files out of the repository into a dedicated storage service
- Centralize error handling into shared middleware for a consistent error
  response shape across all three modules
