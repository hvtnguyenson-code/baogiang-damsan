# Phase 01 Capability Authorization Runtime Report

## Scope

Work packet: `PHASE-01-CAPABILITY-AUTHORIZATION-RUNTIME-001` on `phase/01-capability-authorization-runtime`, based on `d6f3a4decd539f5586ec3a4f31f28fb7b08f5d83`.

This slice implements the capability evaluator, route metadata/decorator, fail-closed guard, denial auditing, and effective-capability output on `/api/auth/me`. It adds no business CRUD endpoint or production authorization probe. PostgreSQL integration uses a test-only controller that is not part of the application module.

## Runtime behavior

- `CapabilityAuthorizationService.evaluate()` pins one clock value and returns a public-safe allow/deny decision with a stable reason code.
- User state, definition state, allowed scopes, grant revocation, and half-open validity windows are all mandatory.
- `SCHOOL_WIDE` covers narrower requests; narrower grants never cover school-wide requests.
- Resource scopes require exact UUID matches. `PERSONAL` is normalized to the authenticated user. Cross-scope inference is prohibited.
- Malformed definitions, persisted grants, resources, and decorator metadata deny without repair or mutation.
- `SYSTEM_ADMIN`, position, membership, subject assignment, and additional duty never imply another capability.
- `CapabilityGuard` uses server authentication context and route parameters only. Multiple requirements use ALL semantics.
- First-login users are blocked from capability-protected routes until password change; existing auth routes remain available.

## Public contract and audit

`GET /api/auth/me` now includes `capabilities: ScopedCapability[]`. Entries expose only `key`, `scope`, and an optional `resourceId`; invalid, inactive, future, expired, revoked, or duplicate grants are excluded and output order is deterministic.

Guard denials write `AUTHORIZATION_DENIED` with a generic 403 response. Stable reasons cover missing auth context, first-login restriction, inactive/locked user, unknown/inactive capability, disallowed scope, required/invalid resource, missing/inactive/malformed grants, and invalid requirements. Audit metadata contains only the requested capability boundary, reason, route, and method and passes through the existing secret sanitizer.

## Verification coverage

- Unit tests cover the scope matrix, personal normalization, resource validation, user and definition state, grant validity boundaries, malformed grants, deterministic deduplication, no `SYSTEM_ADMIN` bypass, first-login restriction, metadata default-deny, ALL semantics, route-only resources, and denial audit payloads.
- Isolated PostgreSQL integration covers exact and mismatched resources, school-wide directionality, personal access, future/expired/revoked/malformed grants, inactive definitions, inactive/locked users, membership/duty non-inference, technical-admin separation, first-login auth-route continuity, effective `/auth/me` output, and persisted denial audits.
- Existing Playwright auth and smoke tests remain the E2E acceptance because no suitable production business route exists; no debug endpoint was added.
- Existing CI provisions isolated PostgreSQL and automatically discovers the new integration suite. Integration suites run serially to keep shared test fixtures deterministic.

Final command results, final commit, push status, and GitHub Actions final-head status are recorded in the task delivery report after push.

## Boundaries

Schema/model change: **NO**. Migration change: **NO**. User/grant/catalog CRUD: **NO**. UI: **NO**. Production test endpoint: **NO**. VPS/official database access: **NO**. Deploy/PR/merge: **NO**.
