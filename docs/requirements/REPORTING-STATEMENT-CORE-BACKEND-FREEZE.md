# Reporting Statement Core Backend Freeze

## Status

**Candidate freeze — Slice D local non-DB gates pass; PostgreSQL/HTTP evidence awaits authoritative GitHub CI.** Final CLOSED/GREEN requires an independent GitHub diff review, exact-head PR CI, and post-merge main CI. This record does not authorize deployment or migration.

## Authority

The backend boundary is governed by Product Owner D1–D19 in `LOCAL-FC-05I0D-SUBMISSION-APPROVAL-SNAPSHOT-DECISION-CLOSURE.md`, ADR-041, ADR-042, ADR-043, and Technical Clarifications TC-1–TC-4. TC-1 is retained exactly: retries reuse one pinned command `asOfInstant`, recompute the Personal projection inside the replacement transaction, and never reuse stale projection output.

## Regression-covered boundary

| Boundary | Executable evidence |
| --- | --- |
| Personal responsibility filtering, substitution/MAKEUP ownership, debt, BLOCKED, zero responsibility | `apps/api/test/personal-reporting-projection/personal-reporting-projection.service.spec.ts`; `apps/api/test/reporting-projection/reporting-projection.service.spec.ts` |
| Canonical immutable snapshot and preservation of already-established domain facts | `apps/api/test/reporting-statement-internal/reporting-statement-canonicalizer.spec.ts` |
| Submit replay, one pinned clock across retry, failure-before-persistence | `apps/api/test/reporting-statements/reporting-statements.submit.spec.ts` |
| Lifecycle CAS, correction/supersession, self-decision denial, frozen display, upstream assignment drift | `apps/api/test/reporting-statements/reporting-statements.integration.spec.ts` |
| PostgreSQL initial and successor submit races; competing terminal decision | `apps/api/test/reporting-statements/reporting-statements.integration.spec.ts` |
| Frozen-subject read authority and HTTP session/CSRF/validation boundary | `apps/api/test/reporting-statements/reporting-statements.http.integration.spec.ts` |

The PostgreSQL suites are intentionally gated by `TEST_DATABASE_URL` and are part of the existing `*.integration.spec.ts` CI selector. The test harness now fails closed before Prisma/AppModule startup or cleanup: automatic execution is accepted only for the GitHub Actions contract (`CI=true`, `GITHUB_ACTIONS=true`, `GITHUB_REPOSITORY=hvtnguyenson-code/baogiang-damsan`) with loopback `baogiang_test`; local destructive integration requires `NODE_ENV=test`, loopback, a clearly test-named database, and an explicit `BAOGIANG_ALLOW_DESTRUCTIVE_TEST_DB=1` opt-in present in the current test process. Local execution without a certified isolated database is not evidence for those rows.

The Reporting/Personal Projection suites establish responsibility, substitution/MAKEUP, allocation, execution, and debt semantics. The Statement canonicalizer suite proves only that those accepted facts are retained in the frozen payload; it does not independently establish their upstream semantics. The database safety harness is test-integrity infrastructure, not product business semantics.

## Required progression

`local non-DB candidate → pushed branch → independent GitHub diff review → PR → authoritative PR CI (PostgreSQL/HTTP) → merge → post-merge main CI → CLOSED / GREEN`

## Explicit non-scope

This freeze does not claim UI business completion, a production deployment, export, archive/final retention policy, pagination, SLO/performance closure, numeric scaling limits, quorum/delegation, or a future zero-subject Statement policy. No production database/data mutation is authorized by this document.
