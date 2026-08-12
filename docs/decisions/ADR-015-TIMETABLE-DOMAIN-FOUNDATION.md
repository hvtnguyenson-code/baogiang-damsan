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

Rejected as the ownership model. It couples two separately versioned aggregates and risks making a calendar replacement appear to replace timetable meaning. ADR-017 accepts a nullable activation-target calendar snapshot for audit and composite integrity without changing AcademicYear ownership.

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

## Time-slot questions resolved by ADR-016

[ADR-016](ADR-016-CANONICAL-TIME-SLOT-FOUNDATION.md) accepts the canonical time-slot foundation without accepting this broader Timetable ADR. A slot is an AcademicYear-owned immutable revision with no civil business effectivity; its active flag means current/selectable configuration for new authoring only, and future timetable history will reference the exact revision. Weekday is explicit on each slot so clock grids may differ by weekday. Breaks are gaps between half-open schedulable intervals, not rows or timetable entries.

## Schema questions resolved by ADR-017

[ADR-017](ADR-017-TIMETABLE-SCHEMA-FOUNDATION.md) accepts the 04A2 persistence subset without accepting this broader control-plane ADR. Normal lessons use exactly one `TimetableEntry` per exact slot revision. `TimetableVersion` remains AcademicYear-owned and stores a nullable, all-or-none calendar/week/effective-date activation target. The lifecycle has one `ACTIVE` chain head per year; `ACTIVE` and `SUPERSEDED` inclusive date ranges cannot overlap, so a future-dated active head is representable and date resolution remains interval-based. `effectiveUntil` is stored as the inclusive last date of a superseded interval. Rollback creates a new version rather than reactivating historical content.

Normal entries retain both composite `TeachingAssignment` provenance and the immutable `teacherUserId` snapshot. Special-activity coordinates require a separate future table/domain and do not weaken the normal-entry shape. Exact-slot class/teacher collisions are database invariants; real-time collisions across different slot identities remain an activation invariant for 04B.

## Control-plane questions resolved by ADR-018

[ADR-018](ADR-018-TIMETABLE-TIME-SLOT-CONTROL-PLANE.md) accepts `TIMETABLE_MANAGE` at `SCHOOL_WIDE` as the dedicated professional capability for the time-slot management control plane. It also accepts create-only-for-new-coordinate, immutable revision, stale-source rejection, retirement and retired-coordinate restoration semantics for canonical `TimeSlotDefinition` history. These decisions do not accept this broader Timetable ADR, whose status remains **Proposed**.

## Unresolved questions

ADR-017 and ADR-018 resolve the binding schema and time-slot control-plane choices. [ADR-019](ADR-019-TIMETABLE-DRAFT-AND-VALIDATION-CONTROL-PLANE.md) accepts the canonical backend DRAFT authoring primitive, target derivation, current-scope validation, optimistic draft concurrency and `DRAFT` to `VALIDATED` behavior. Atomic replace-all normalized entries are a backend primitive; this does not decide that a future UI must support manual or bulk editing. This ADR remains **Proposed**.

These product/control-plane questions remain unresolved and belong to later 04B slices:

1. What constitutes a complete timetable for classes, weekdays, slots and reserve `DP` weeks?
2. What are the official import columns, template versions, row error contract and atomicity rules?
3. Are manual cell editing and bulk editing required?
4. Must approval and activation use different actors/capabilities or separation-of-duties rules?
5. What retention policy applies to abandoned drafts?

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
- Future-effective activation requires transactional 04B commands and date-resolution tests even though its persistence semantics are fixed by ADR-017.
- Import, activation and calendar replacement need transactional/concurrency tests.

## Dependencies

- ADR-008 capability and scope semantics.
- ADR-010 AcademicCalendarVersion, AcademicWeek, segments, interruptions and civil-date rules.
- ADR-011 academic-structure control-plane guarantees.
- ADR-012 TeachingAssignment invariant and collision ownership.
- ADR-013/014 teaching-assignment commands and read model.
- ADR-016 and the accepted 04A1 time-slot schema foundation.
- Later PPCT/reporting, special-activity and operational-event specifications.

## Explicit non-scope

- Accepting this ADR automatically; its status remains **Proposed**.
- API, UI, capability seed or control-plane implementation beyond the accepted ADR-017 schema subset.
- CalendarException, substitution, cancellation, period swap or make-up implementation.
- PPCT sequence/progress, teaching debt, lesson content, statements or approvals.
- Special-activity participants, confirmation or workload.
- Room scheduling and automated timetable generation.
- Import template design, deployment, production database or VPS work.
