# ADR-017 — Timetable Schema Foundation

- **Status:** Accepted
- **Date:** 2026-08-11
- **Scope:** LOCAL-FC-04A2 timetable version, normal-entry and history persistence

## Context

PA-B v1.2 sections 5–9, 12 and 14 and Appendices A–D require retained timetable versions, the exact lifecycle `DRAFT` → `VALIDATED` → `APPROVED` → `ACTIVE` → `SUPERSEDED`, effectivity from a school-defined academic week, checksum-supported import idempotency, normal rows containing weekday/slot/class/subject/teacher, real-time collision checks and date-correct historical resolution. The v1.3 addendum, ADR-010 through ADR-016, and the LOCAL-FC-04 audit establish independently versioned calendars, AcademicYear-scoped teaching assignments and immutable time-slot revisions.

ADR-015 remains Proposed because completeness, import contracts, editing workflow, separation of duties and abandoned-draft retention still need product/control-plane decisions. This ADR accepts only the persistence foundation needed by later 04B work.

## Decision

### Version ownership, target and lifecycle

- `TimetableVersion` belongs directly to `AcademicYear`. An `AcademicCalendarVersion` is an activation-time snapshot and validation dependency, not the ownership parent.
- Version numbers are positive and unique within one AcademicYear. A composite unique identity `(id, academicYearId)` supports same-year downstream references.
- Status has exactly `DRAFT`, `VALIDATED`, `APPROVED`, `ACTIVE`, and `SUPERSEDED`.
- The activation target is an all-or-none triplet: `calendarVersionId`, `effectiveAcademicWeekId`, and `effectiveFrom DATE`. A draft may omit or preselect the complete triplet; every non-draft version requires it.
- Composite foreign keys prove that the calendar belongs to the same AcademicYear and the effective week belongs to that calendar version.
- `effectiveUntil DATE` is the inclusive last business date of a closed history interval. `ACTIVE` requires a null upper bound. `SUPERSEDED` requires a non-null upper bound and `supersededAt`.
- Validation, approval and activation each use an optional actor/timestamp pair. Lifecycle checks require the cumulative metadata appropriate to each status and reject partial pairs.
- There is at most one `ACTIVE` chain head per AcademicYear. A partial unique index enforces that cardinality.
- `ACTIVE` and `SUPERSEDED` intervals use inclusive PostgreSQL `daterange(..., '[]')` semantics and a GiST exclusion constraint to prohibit overlap within an AcademicYear. A null upper bound is unbounded.
- Future activation is representable without a scheduled status: the one `ACTIVE` chain head may begin on a future `effectiveFrom`, while date resolution continues to select the unique interval containing the requested civil date. A predecessor may already be `SUPERSEDED` with an inclusive `effectiveUntil` immediately before that future start.
- Rollback never reactivates or mutates an older version. It creates a new version containing the selected historical content and follows the normal lifecycle.
- `contentChecksum` is nullable and indexed for lookup. Non-null values must be trimmed and non-empty, but are not globally unique because idempotency scope and import response behavior belong to 04B.
- Lifecycle actors, target parents and retained history use `ON DELETE RESTRICT`. Activated/superseded semantic immutability remains a 04B command invariant; no trigger is introduced.

### Normal timetable entries

- `TimetableEntry` represents only a normal lesson and exactly one exact `TimeSlotDefinition` revision. Multi-period authoring, if later required, expands to one entry per slot.
- A row stores `timetableVersionId`, duplicated `academicYearId`, explicit `weekday`, `timeSlotDefinitionId`, `schoolClassId`, `subjectId`, `teachingAssignmentId`, immutable `teacherUserId`, and `createdAt`. It has no civil date, calendar/week effectivity, room, span array, polymorphic kind or mutable `updatedAt`.
- Composite foreign keys bind the entry to a version in the same AcademicYear; a slot with the same AcademicYear and weekday; a class in the same AcademicYear; and a `TeachingAssignment` with the same AcademicYear, class, subject and teacher snapshot.
- Direct Subject and teacher User foreign keys remain explicit and use `ON DELETE RESTRICT`.
- Within one version and exact slot identity, a class may appear at most once and a teacher may appear at most once. Separate unique indexes enforce both collision coordinates.
- Query indexes support version/class, version/teacher, version/subject, version/assignment and AcademicYear/weekday/slot access paths.
- Real-time collision across different slot IDs is intentionally not a 04A2 database invariant. Historical/inactive slot revisions may overlap, and a cross-table clock-range comparison cannot be expressed by a normal entry unique constraint. 04B activation must load the referenced slot intervals and reject overlapping class, teacher, locked or special-activity occupancies transactionally.

### Special-activity boundary

GDĐP, HĐTN-HN and other grade/school/multi-teacher coordinates do not share the normal `TimetableEntry` row. Their scope, participant staffing, workload and collision claims require a separate future special-activity model. This avoids nullable or polymorphic fields that weaken normal assignment provenance.

## Enforcement boundary

The database guarantees version numbering, lifecycle row shape, actor/timestamp pairing, target provenance, one active chain head, non-overlapping effective history, normalized checksum values, same-year entry provenance, exact-slot class/teacher uniqueness and deletion restriction.

LOCAL-FC-04B owns transactional lifecycle commands, dependency-state rechecks, timetable completeness, teaching-assignment date coverage, weekday/calendar eligibility, real-time collision across different slot identities, checksum idempotency behavior, concurrency, authorization and historical read resolution. Import parsing, UI and special-activity integration remain later slices.

## Consequences

- Historical timetable, calendar target and responsible-teacher evidence remain self-contained and cannot be silently reinterpreted by later staffing or calendar changes.
- Sequential and future-dated version history has a database-enforced, date-resolvable shape.
- Normal entry integrity is strong without embedding operational exceptions or special-activity semantics.
- 04B must perform real interval collision and activation compatibility checks; exact-slot uniqueness alone is deliberately insufficient.

## Explicit non-scope

API/contracts, capability or seed changes, import templates/parsers, completeness policy, manual/bulk editing, approval/activation authorization policy, UI/E2E, CalendarException, substitution, cancellation, make-up teaching, PPCT/reporting, special-activity storage, deployment and production migration are outside 04A2.
