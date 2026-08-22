# ADR-041 — Reporting Projection

- **Status:** Accepted
- **Date:** 2026-08-22
- **Scope:** LOCAL-FC-05H0D reporting-projection architecture closure; no implementation authorization.
- **Authority:** Product Owner acceptance recorded in LOCAL-FC-05H0D.

## Decision

Reporting is downstream and source-derived. Live reporting never changes PPCT, timetable, operational facts, execution evidence or progress/debt truth. Exact retained provenance is mandatory; an immutable submitted/approved statement is a later boundary.

05H1 is an internal deterministic, schema-free and on-demand Reporting Projection. It accepts one AcademicYear, an explicit finite bounded set of AcademicYear + SchoolClass + Subject roots, an inclusive custom civil-date range wholly within that AcademicYear, and explicit non-future asOfInstant. No wildcard school-wide selector or cross-AcademicYear range is allowed.

The projection is current-authoritative live reporting only. Historical reconstruction, week/month/year/semester presets, and Semester reporting defer. Semester exists structurally under AcademicCalendarVersion but calendar-version-change reporting semantics are not accepted.

Canonical traceable curricular detail is the exclusive source of every aggregate. It retains original/actual execution coordinates and responsible/actual teacher provenance, and preserves 05G1 completion, proven-debt, gap and late semantics. Aggregates fully reconcile to that detail.

MAKEUP is presented with both coordinates. Original/source coordinate owns curricular obligation/progress/completion accounting; actual coordinate is execution evidence/presentation. MAKEUP creates no second distribution or independent curricular completion. Curricular responsibility remains with responsible teacher; actual teacher does not transfer TeachingAssignment ownership. Workload aggregation is deferred.

Suppression, authorized cancellation and activity suppression with no upstream direct obligation create no curricular distribution/completion/debt. Different-subject supervision never completes the original subject; a proven original debt remains curricular and cannot be replaced by a non-curricular diagnostic.

Special Activity reporting is deferred and remains separate from curricular PPCT/progress/debt/late with no target fan-out.

A BLOCKED upstream result blocks only its affected root/section. PASS roots retain trustworthy detail and own totals. Any aggregate whose covered scope includes a BLOCKED root is unavailable/null/explicitly blocked; the projection never supplies a combined partial total as complete or silently omits, rebinds, repairs or credits evidence.

Curricular detail order is source civil date -> retained slot start -> retained slot end -> occurrence key. It uses no incidental database order, createdAt or current labels.

A bounded multi-root report uses one outer RepeatableRead-or-stronger transaction and tx-aware upstream resolvers/projections, with no nested independent snapshots. This is a 05H0D architecture decision; each 05G1 root retains its accepted coherent snapshot semantics.

05H1 has no report persistence, cache, materialized read model or mutable persisted draft. It has no public route/controller, capability/seed, UI, schema/migration/Prisma change, deployment or production work. 05H2 is the later public reporting read/control-plane slice. Immutable statement, submission and approval are later independent work.

## Consequences

The initial projection is bounded, reproducible and fail-closed without exposing public reporting or turning a report into source truth. Numeric maximum roots/days, public pagination and large-scale optimization require later performance closure; no number is implied here.

REPORTING PROJECTION ARCHITECTURE CLOSED — READY FOR A SEPARATELY AUTHORIZED 05H1 INTERNAL IMPLEMENTATION TASK.
