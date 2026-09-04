# P1-013 — Homeroom administration workspace

## Identity and boundary

- Task: `P1-013` — Homeroom administration workspace.
- Branch: `feat/homeroom-administration-workspace-013`.
- Canonical starting main: `3f8a1763991cc53c9767638ba380aff7ce66e4f2`.
- Dependency: `P1-012A` — CLOSED.
- Governing authority: `ADR-045-HOMEROOM-RESPONSIBILITY.md`.
- Traceability: `T13`, `T14`.

## Goal

Provide the bounded administrator/PHT web workspace for retained, date-effective HomeroomAssignment history. The UI consumes the frozen P1-012/P1-012A contracts only. It must show the server-owned business date, preserve historical identity distinctions, and provide explicit create, end, change-teacher and correction workflows.

## Allowed scope

- `apps/web` route, capability-gated navigation, API client, workspace page, tests and strictly necessary existing UI styles;
- task/governance/traceability documentation needed to record this branch's pre-review state.

## Forbidden scope

- API/service/controller/policy changes; Prisma/schema/migrations; capability seed or semantics; contract changes; user-directory UI; deployment, CI/CD or production changes;
- inferring authority from `SYSTEM_ADMIN` or another capability;
- generic edit/delete actions, date-time conversion, local business-date calculation, or alternate Homeroom authority.

## Functional contract

The route is `/quan-tri/phan-cong-chu-nhiem` and is visible/accessible only to `HOMEROOM_ASSIGNMENT_MANAGE / SCHOOL_WIDE`. It uses the P1-012A academic-year/options, historical identity discovery, eligible-teacher, history and mutation endpoints. The page supports filtering/pagination and resilient read failures; no active calendar leaves history readable but disables mutation and candidate lookup. Candidate source is selected strictly by whether the relevant end date is before the workspace `businessDate`: current/future uses eligible teachers; bounded historical uses historical identities with a trimmed search of at least two characters and required entry reason.

## Evidence state

This branch is ready for independent review. Local lint, TypeScript checking, targeted Homeroom API/navigation unit tests and production build were run; the full web suite also encountered an existing WebSocket-port contention in this local environment and is not represented as a green CI claim. This document does not claim PR approval, CI success, merge, deployment, or production behavior.
