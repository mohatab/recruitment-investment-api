# Project history

Point-in-time records of what this codebase looked like before, and how it got
here. They are kept because the rebuild's decisions only make sense against the
state they were reacting to — a reviewer can check the claims rather than take
them on trust.

**None of these describe the current system.** They are deliberately not
updated, so the field names, routes, file counts and test figures in them are
the ones that were true when each was written. For how the project works today,
start at [`README.md`](../../README.md) and the documents in
[`docs/`](../).

| Document                                                     | Written against                       | What it records                                                                                                                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`ORIGINAL_CODEBASE_AUDIT.md`](./ORIGINAL_CODEBASE_AUDIT.md) | commit `417d982`, 2026-09-08          | The original project: three unrelated mini-APIs named after their authors, each with its own `User` model and JWT scheme, a hardcoded JWT secret, a password reset that stored plaintext, and an unauthenticated Socket.IO layer.    |
| [`FIRST_REBUILD_REPORT.md`](./FIRST_REBUILD_REPORT.md)       | commit `ea636a6`                      | The first rebuild into a layered `src/modules/*` structure with one auth system, Joi validation, Stripe webhooks, Docker and CI — 43 tests at the time.                                                                              |
| [`PRE_HARDENING_AUDIT.md`](./PRE_HARDENING_AUDIT.md)         | working tree on `ea636a6`, 2026-09-17 | The audit that started the current hardening pass: it measured that rebuild against production standards and found the claims that did not hold up under testing. Every defect it lists has since been fixed or explicitly accepted. |

The author-named directories those documents describe (`mahmoud/`, `matrix/`,
`mohamed/`) were removed in `ea636a6` and exist only in Git history, which has
deliberately not been rewritten.
