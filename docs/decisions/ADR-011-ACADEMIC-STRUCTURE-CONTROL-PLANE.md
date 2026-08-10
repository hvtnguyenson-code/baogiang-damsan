# ADR-011 — Academic Structure Control Plane

- **Status:** Accepted
- **Date:** 2026-08-10
- **Scope:** Local Phase 02B academic structure backend

## Context

ADR-010 established the PostgreSQL foundation for academic years, versioned calendars, business weeks, civil-date segments, interruptions and year-scoped classes. The public backend must now enforce the cross-row invariants and lifecycle rules that the database foundation intentionally deferred, without weakening immutable calendar history.

## Decision

- Academic-structure management requires one explicit `ACADEMIC_STRUCTURE_MANAGE` grant at `SCHOOL_WIDE`. `SYSTEM_ADMIN` is not an implicit bypass. The bootstrap technical administrator receives this capability only because it is explicitly listed and granted.
- Public civil dates use strict, real Gregorian `YYYY-MM-DD` strings. They are parsed and formatted with UTC calendar fields solely to preserve PostgreSQL `DATE` values; they are not instants and are never converted through an Asia/Ho_Chi_Minh midnight.
- An `AcademicCalendarVersion` is an immutable aggregate through the public API. Semester, week, segment and interruption children have no independent mutation endpoints. A schedule change creates a new version whose per-year `versionNumber` is assigned server-side in a serializable transaction.
- Before persistence and activation, application logic validates parent containment, configured teaching weekdays, exact official/reserve number sets, discriminators, week/segment chronology, semester rules and interruption separation. Segment start and end boundaries must both be configured teaching weekdays. An internal gap containing configured teaching dates is valid only when interruptions cover every such teaching date; a weekend/non-teaching-only gap needs no interruption. Every interruption aligns with an actual internal segment gap and contains at least one configured teaching date, though it may also include adjacent non-teaching days. Gap coverage uses UTC civil-date arithmetic and configured weekdays, never ISO-week calculations, process locale or process timezone. These are application invariants, not claimed database constraints.
- Activation reloads and revalidates the stored aggregate, then atomically switches the single active version and records the success audit. Reactivating a historical version is an explicit audited rollback; an already-active command is an audited no-op.
- No calendar-history delete endpoint exists. Previously stored schedule content is never rewritten by activation.
- `SchoolClass` is managed under its `AcademicYear`, uses year-scoped code uniqueness and explicit idempotent activate/deactivate commands.
- Every successful mutation and its domain audit event share one database transaction. Failed operations write no success audit.

## Consequences

- `CalendarException`, time slots, teaching assignments, timetables, PPCT, reporting and approval workflows remain deferred until their canonical downstream models exist.
- Frontend management surfaces remain a later slice.
- The accepted 02A schema and migrations remain unchanged.
