# ADR-034 — Special Activity Architecture

- **Status:** Accepted
- **Date:** 2026-08-15
- **Scope:** LOCAL-FC-05D0D architecture closure; no implementation authorization
- **Authority:** `LOCAL-FC-05D0D-SPECIAL-ACTIVITY-DECISION-CLOSURE.md`

## Context

ADR-031 deferred Special Activity because its participant scope, staffing, occupancy and precedence had not been closed. The 05D0 audit identified D1–D10 as blocking decisions. This ADR accepts that closure without adding persistence or runtime.

## Decision

### Aggregate and provenance

`SpecialActivity` is a separate operational aggregate. One root is one atomic scheduled occurrence pinned to one `AcademicYear`, one retained `AcademicCalendarVersion`, one civil date and one-or-more exact retained time-slot children. Slots share the root and are corrected/reversed together. There is no session-only, arbitrary wall-clock, cross-midnight, multi-day, recurring or occurrence-subaggregate model.

The root has one `SCHOOL_WIDE`, `GRADE` or `CLASS` business selector. The server expands it at creation into frozen exact class-target children: all year classes, all grade classes or the one selected class. Frozen targets remain historical provenance. There are no arbitrary multi-class groups, student rosters, teacher-only activities or mixed participants.

There is no category enum/catalogue. A bounded title is required and a bounded note is optional; category-like client text has no downstream PPCT or reporting semantics.

### Staffing, lifecycle and authority

Every root has one-or-more roleless scheduled teaching-staff children. Each child is one occupied teacher; duplicates are forbidden. Command-time eligibility requires an active canonical user, StaffProfile and teaching-staff status, and retains sufficient evidence to prevent later drift. No TeachingAssignment, subject or StaffSubject relation is required. Actual teacher/execution remains downstream.

Lifecycle is immutable `ACTIVE → REVERSED`. Creation produces `ACTIVE`; correction conditionally reverses with CAS and may create a separately validated, linked replacement. There is no draft, confirmation, approval, cancellation, completion or physical delete.

Mutation authority is exactly `SPECIAL_ACTIVITY_MANAGE / SCHOOL_WIDE`, default deny. Existing capabilities, generic `ACTIVITY` scope, roles, assignments and staffing eligibility grant no implied authority.

### Occupancy and resolution

The minimum collision profile is `CANONICAL_CLASS_TEACHER_TIME_V1`: frozen target class, scheduled teacher and exact date plus retained half-open slot interval. Creation checks active normal, disposition, make-up and Special Activity occupancy and all applicable teacher occupancy. Activity-vs-activity class or teacher overlap fails. Active make-up is separate occupancy and collision, never suppression.

An active activity suppresses normal teaching for its exact target class/date/slot; its own base class opportunity does not block creation. It never mutates the base timetable or TeachingAssignment. An activity and an active `OperationalLessonDisposition` are mutually exclusive for the same normal opportunity; either second command fails until the earlier fact is explicitly reversed/corrected.

`CalendarInterruption` and `CalendarException` suppress normal teaching availability only. They do not prohibit, hide or reverse an explicit Special Activity. Future `ResolvedLessonOccurrence` must expose normal-opportunity status/suppression and the independent activity occurrence; it must not use one simplistic precedence chain that hides activity behind interruption or exception.

### Downstream boundary and reliability

Special Activity carries no PPCT item, distribution, completion, debt, progress, report total, execution or snapshot state. It does not create or satisfy a make-up obligation. Later resolved occurrence, execution and accepted progress/debt rules own those effects.

Commands use request identity plus deterministic fingerprint, replay/conflict rules, CAS reversal, `SERIALIZABLE` collision decisions, database backstops where representable, and transactionally coupled sanitized audit evidence. Retained calendar, slots, targets and eligibility prevent current-head drift.

Room/location has no authoritative resource: `ROOM COLLISION = NOT ASSESSED / NOT REPRESENTABLE`. The profile is not full physical-occupancy coverage.

## Consequences

05D1 may design a persistence foundation containing the root, exact-slot, frozen-class-target and roleless-staffing families with retained lifecycle/provenance and constraints. It may not add runtime, execution, PPCT/progress/reporting, Room, roster, import, recurrence, UI or make-up expansion without separate authorization.

## Explicit non-scope

Category catalogue, arbitrary groups/rosters, Room/Location, arbitrary wall-clock and recurring/multi-day activity, attachments, notifications, attendance, external participants, approval, actual execution, PPCT completion, progress/debt, reporting, snapshots, UI, make-up runtime expansion and move/swap remain outside this ADR.
