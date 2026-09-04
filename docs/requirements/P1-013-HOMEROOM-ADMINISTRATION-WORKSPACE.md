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

Confirmed local evidence: Homeroom page regression is PASS (1 file / 23 tests); Homeroom API plus capability-navigation targeted suites are PASS (2 files / 30 tests); web lint, TypeScript typecheck, production build, and diff-check are PASS. The final page regression covers historical create/change entry-reason DTOs, bounded and open-ended correction source dates, overlapping versus gapped replacement periods, replacement-specific candidate isolation, correction-lineage refetch and refresh boundaries, workflow reset on academic-year changes, and the 50-replacement ceiling.

The canonical aggregate web unit-suite invocation did not terminate cleanly in this local Windows runner because of recurring Vite/Vitest WebSocket lifecycle/port-conflict behavior. Serial, temporary-port, and isolated-runner evidence attempts did not yield a reliable complete aggregate result. This is `LOCAL INCONCLUSIVE`, not PASS; it did not demonstrate a production-code defect. Exact-head GitHub PR CI is required for clean-runner aggregate-suite evidence before merge. This remains local evidence only: no exact-head PR CI success, PR approval, merge, deployment, or production evidence is claimed. P1-013 remains `IN_REVIEW`.
