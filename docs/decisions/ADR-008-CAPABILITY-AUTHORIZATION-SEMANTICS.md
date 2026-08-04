# ADR-008 — Capability authorization semantics and scope matrix

## Status

Accepted for `PHASE-01-CAPABILITY-AUTHORIZATION-RUNTIME-001`.

## Context

Phase 01 already persists users, capability definitions, scoped grants, validity windows, and revocation state. Runtime authorization needs one deterministic, fail-closed interpretation of those records. Position, subject-group membership, staff-subject assignment, additional duty, and the `SYSTEM_ADMIN` capability are contextual data; none implicitly creates a different capability grant.

## Decision

`CapabilityAuthorizationService` is the single runtime evaluator. Each decision pins one `atTime`, reads only the user state, requested definition, and grants for the requested capability, and never mutates catalog or grant records. Access is allowed only when the user is active and not temporarily locked; the definition exists, is active, and permits the requested scope; and at least one matching grant is not revoked and satisfies `validFrom <= atTime < validUntil` when `validUntil` exists.

Persisted scopes or resource shapes that contradict the catalog are malformed and deny access. A missing, invalid, or malformed decorator requirement also denies access. Authorization does not cache decisions across requests in this slice.

### Scope matrix

| Requested scope | Valid request resource | Grant that covers it |
| --- | --- | --- |
| `SCHOOL_WIDE` | no resource | same capability at `SCHOOL_WIDE` only |
| `SUBJECT_GROUP` | exact subject-group UUID | same capability for the exact group, or `SCHOOL_WIDE` |
| `SUBJECT` | exact subject UUID | same capability for the exact subject, or `SCHOOL_WIDE` |
| `ACTIVITY` | exact activity UUID | same capability for the exact activity, or `SCHOOL_WIDE` |
| `PERSONAL` | server-normalized current user ID | same capability at `PERSONAL`, or `SCHOOL_WIDE` |

There is no inference between `SUBJECT_GROUP`, `SUBJECT`, and `ACTIVITY`, and a narrower grant never covers a `SCHOOL_WIDE` request. The client cannot select another user for a `PERSONAL` request. Route-scoped resources come only from server route parameters or server-owned context, never request body or query data.

`CapabilityGuard` runs after `SessionAuthGuard`, uses the authenticated server-side user ID, and evaluates every declared requirement with ALL semantics. It blocks `mustChangePassword=true` before capability evaluation. Authentication endpoints remain available so first-login users can inspect `/auth/me`, change their password, and log out.

Denied guard decisions return a generic HTTP 403 and write `AUTHORIZATION_DENIED`. Audit metadata is restricted to capability key, requested scope, normalized resource, reason code, route, and method; the existing recursive sanitizer removes secret-bearing keys. No grant ID, password/session hash, cookie, credential, or database URL is loaded or recorded.

`GET /api/auth/me` is the refresh source for public effective capabilities. It returns only `{ key, scope, resourceId? }`, filters inactive definitions and future, expired, revoked, or malformed grants, removes duplicates, and sorts deterministically.

## Consequences

- `SYSTEM_ADMIN` remains technical administration only and does not imply professional approval.
- Roles, position, memberships, subjects, and additional duties do not authorize an action without an explicit capability grant.
- Missing metadata, inconsistent catalog/grant data, and unsupported resource shapes fail closed.
- Protected modules import the authorization module and compose `SessionAuthGuard` before `CapabilityGuard`.
- CRUD for users, grants, catalogs, and duties remains outside this decision and work packet.
