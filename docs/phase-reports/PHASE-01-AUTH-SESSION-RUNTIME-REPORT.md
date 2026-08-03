# Phase 01 Auth & Session Runtime Report

## Scope

Work packet: `PHASE-01-AUTH-SESSION-RUNTIME-001` on `phase/01-auth-session-runtime`, based on `4cd141d88f47e20bcf0cd88f22fa0a92306899f9`.

This slice implements internal username/password authentication, server-side sessions, first-login password change, temporary lockout, auth audit events, and a one-time technical-admin bootstrap command. It does not implement capability authorization, user/catalog CRUD, UI, deployment, or official-database operations.

## Security decisions

- Passwords use maintained Argon2id with an explicit minimum policy (default 12 characters, upper/lowercase and digit).
- Session tokens contain 256 random bits; only SHA-256 digests are persisted.
- Login responses are generic for unknown usernames, wrong passwords, inactive accounts, and locks; unknown users execute an Argon2 verification path.
- Production cookies must be `HttpOnly`, `Secure`, and `SameSite=Lax`; cookie and TTL values are validated environment configuration.
- CORS rejects wildcard origins and permits credentials only for explicit origins.
- Unsafe authenticated requests enforce an allow-listed Origin/Referer policy.
- Password change retains the current session and revokes all other sessions.
- Audit metadata uses recursive default-deny redaction for password/token/cookie/hash/authorization keys.

## API and bootstrap

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `npm run bootstrap:admin -w apps/api` reads required values from runtime environment, has no defaults, never prints the password, refuses overwrite, and grants only technical capabilities. It never grants professional approval capabilities.

## Verification evidence

- Prisma schema/models and migrations: unchanged.
- Unit suite covers Argon2id, password policy, token entropy/hash, audit redaction, cookie policy, CSRF policy and login rate limiting.
- PostgreSQL integration suite covers generic failures, all user states, lockout, cookie/session lifecycle, expiry/revocation, `lastSeenAt` throttling, password change/session revocation, raw-token absence, audit events and bootstrap idempotency/capability boundaries.
- Playwright API E2E covers unauthenticated rejection, cookie login to `/me`, first-password change/re-login, logout invalidation and wrong-origin rejection.
- CI retains migration gates, provisions only isolated PostgreSQL databases, and prepares dedicated integration/E2E data.

Final command results and GitHub Actions final-head status are recorded in the task delivery report after push.

## Boundaries

Schema/migration change: **NO**. Capability authorization guard: **NO**. UI: **NO**. VPS/official database access: **NO**. Deploy/PR/merge: **NO**.
