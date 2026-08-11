# ADR-015: Timetable Domain Foundation

**Date:** 2026-08-11

**Status:** Proposed

**Phase:** LOCAL-FC-04 — Timetable

## Context

The authoritative v1.2 specification requires versioned timetables, academic-week effectivity, configurable morning/afternoon/evening periods, real-time collision validation, Excel import, retained history and date-correct downstream reporting. Accepted ADRs already establish an immutable business calendar and a civil-date TeachingAssignment history, while deliberately assigning period-level collision to Timetable.

The current repository has no timetable or canonical time-slot model and no timetable-management capability. ADR-010 explicitly deferred local calendar exceptions until stable slot and downstream scope identities exist. A schema copied from the UI prototype would therefore be unsafe; ADR-003 makes that prototype reference-only.

The supporting audit is [LOCAL-FC-04 Timetable Domain Specification](../requirements/LOCAL-FC-04-TIMETABLE-DOMAIN-SPEC.md). Authoritative inputs are PA-B v1.2 §§5–9, 11–12, 14 and Appendices A–D; the [v1.3 addendum](../specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md); ADR-008; and ADR-010 through ADR-014.

## Confirmed requirements

- Timetable is independently versioned; uploads create retained versions with checksum/idempotency support.
- Lifecycle vocabulary is `DRAFT`, `VALIDATED`, `APPROVED`, `ACTIVE`, `SUPERSEDED`.
- Business effect begins at a selected AcademicWeek, not an ISO week; selecting a civil date resolves to and displays that week/effective date.
- Rows identify weekday, time slot, class, subject and teacher within a version.
- Periods have configurable real wall-clock intervals across morning, afternoon and evening. Collision uses interval overlap, not period label equality.
- A class cannot occupy overlapping normal lessons and a teacher cannot teach overlapping classes. Locked/special activities and later operational events also participate in applicable collision checks.
- TeachingAssignment owns the canonical responsible normal-subject teacher over AcademicYear + class + subject + civil date; Timetable owns period-level placement/collision.
- Calendar interruptions and later local exceptions suppress scheduled execution without rewriting the base timetable.
- Active historical content is retained so reports resolve the calendar/timetable effective on each date.
- GDĐP/HĐTN-HN multi-teacher staffing and workload are separate from normal TeachingAssignment.
- Excel import requires mapping, validation, comparison/preview, approval and activation. The authoritative source does not specify a fixed column template.
- Backend capability/scope is authoritative; `SYSTEM_ADMIN` is not a professional bypass.

## Proposed decisions

These are proposals, not accepted repository rules until this ADR is approved.

1. Scope `TimetableVersion` directly to AcademicYear and give it an independent identity. Calendar versions are validation/resolution dependencies, not ownership parents.
2. Model the base timetable as a weekly recurring pattern selected by the version effective for a business AcademicWeek, then projected onto eligible civil dates.
3. Establish a separate AcademicYear-owned canonical time-slot foundation before timetable schema. Each slot has stable identity, session, ordinal/label and half-open wall-clock interval.
4. Make activated versions and entries immutable. Corrections create new versions; superseded history remains addressable.
5. For a normal entry, retain both the source `TeachingAssignment` reference and an immutable resolved `teacherUserId` snapshot. Activation proves equality and coverage; later assignment changes never rewrite history.
6. Store Subject directly on a normal entry, as required by v1.2, while validating class/subject/assignment/year consistency.
7. Keep base timetable, CalendarException, substitution/cancellation, make-up and special-activity staffing as separate concepts.
8. Permit a generic special-activity occupancy coordinate only through a discriminated model that does not weaken normal-entry constraints; its participant staffing and workload remain external.
9. Introduce a future `TIMETABLE_MANAGE` capability with `SCHOOL_WIDE` scope instead of reusing academic-structure or subject-dictionary mutation rights.
10. Separate database, application and activation enforcement. Prefer `UNIQUE`, `CHECK`, composite FK, partial index, optional GiST exclusion and `ON DELETE RESTRICT`; do not introduce triggers without a later demonstrated necessity.
11. Require transactional activation with a current-dependency recheck and concurrency guard. At most one timetable version may be effective for an AcademicYear on any business date.

## Alternatives considered

### Parent TimetableVersion to AcademicCalendarVersion

Rejected as the default proposal. It couples two separately versioned aggregates and risks making a calendar replacement appear to replace timetable meaning. A calendar-version snapshot for audit remains an open option.

### Copy AcademicCalendarVersion lifecycle mechanically

Rejected. Timetable has future week effectivity, checksum/import and approval semantics that are not established for the calendar aggregate.

### Resolve teacher dynamically from class and subject

Rejected. A later TeachingAssignment split/change could silently alter historical timetable meaning.

### Persist only `teacherUserId`

Not preferred. It matches the v1.2 row shape but loses explicit provenance to the current canonical TeachingAssignment unless separately recorded.

### Reference only TeachingAssignment

Not preferred. It does not make the historical resolved teacher self-contained and can invite dynamic reinterpretation.

### Use period number as the slot identity

Rejected. The specification requires configurable sessions and collision by real time range; equal numbers across sessions are not sufficient.

### Add Room now

Rejected/deferred. No authoritative room domain exists.

### Put substitutions, make-up and exceptions into base entries

Rejected. The specification treats them as operational/calendar overlays, and mixing them would destroy stable base-version history.

## Unresolved questions

Approval of this ADR should either answer or explicitly defer these items before binding Prisma design:

1. Are time slots versioned/effective, and can clock grids differ by weekday?
2. How are breaks represented, if at all?
3. Is a multi-period lesson stored as one authoring row, one row per slot, or an authoring row plus normalized occupancies?
4. Does a TimetableVersion retain an activation-time AcademicCalendarVersion snapshot?
5. Can multiple future versions be scheduled, and what status applies before their effective week?
6. Is `effectiveUntil` stored or derived?
7. Is rollback a new clone/version or reactivation of old content?
8. Is assignment-reference plus teacher snapshot accepted, including the coverage horizon for an open-ended version?
9. Do special coordinates use a discriminated TimetableEntry or a separate occupancy table?
10. What constitutes a complete timetable for classes, weekdays, slots and reserve `DP` weeks?
11. What are the official import columns, row-span semantics, atomicity and error format?
12. Are manual cell editing and bulk editing required?
13. Must approval and activation use different actors/capabilities?
14. What retention policy applies to abandoned drafts?

## Consequences

### Positive

- Historical reports remain stable across calendar and staffing changes.
- Calendar, staffing, timetable and operational events retain clear ownership.
- A canonical real-time slot model can later support CalendarException, make-up and special-activity collision.
- Activation becomes the deliberate compatibility boundary between independently versioned aggregates.
- A dedicated capability limits professional authority to the intended school-wide workflow.

### Costs and risks

- Assignment reference plus teacher snapshot introduces deliberate denormalization and validation complexity.
- Real-time collision is not fully expressible through simple uniqueness if separate slot definitions may overlap.
- Future-effective activation and slot effectivity require additional product decisions.
- Import, activation and calendar replacement need transactional/concurrency tests.

## Dependencies

- ADR-008 capability and scope semantics.
- ADR-010 AcademicCalendarVersion, AcademicWeek, segments, interruptions and civil-date rules.
- ADR-011 academic-structure control-plane guarantees.
- ADR-012 TeachingAssignment invariant and collision ownership.
- ADR-013/014 teaching-assignment commands and read model.
- A new 04A1 time-slot decision and schema foundation.
- Later PPCT/reporting, special-activity and operational-event specifications.

## Explicit non-scope

- Accepting this ADR automatically; its status remains **Proposed**.
- Prisma schema, migration, seed, API, UI or tests.
- CalendarException, substitution, cancellation, period swap or make-up implementation.
- PPCT sequence/progress, teaching debt, lesson content, statements or approvals.
- Special-activity participants, confirmation or workload.
- Room scheduling and automated timetable generation.
- Import template design, deployment, production database or VPS work.
