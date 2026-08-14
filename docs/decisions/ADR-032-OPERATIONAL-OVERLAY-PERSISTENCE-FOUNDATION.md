# ADR-032 — Operational Overlay Persistence Foundation

- **Status:** Accepted
- **Date:** 2026-08-14
- **Scope:** LOCAL-FC-05C1 persistence foundation only
- **Authority:** ADR-031 and `LOCAL-FC-05C0D-OPERATIONAL-OVERLAYS-DECISION-CLOSURE.md`

## Context

ADR-031 accepts three independent operational-overlay aggregate families and freezes their business semantics. LOCAL-FC-05C1 needs a PostgreSQL/Prisma representation that retains exact upstream identities, supports forward correction and request replay, and enforces every local invariant that is cleanly representable without triggers. It must not add a public control plane, capability runtime, execution, progress/debt/reporting, Special Activity or move/swap semantics.

## Decision

### Physical decomposition and atomic identity

The persistence consists of exactly three business aggregate roots:

1. `CalendarException`;
2. `OperationalLessonDisposition`;
3. `MakeupTeachingSchedule`.

`CalendarExceptionTimeSlot` is a normalized child membership table, not a fourth business aggregate. There is no generic operational event ledger or mutable current-state row. Every root has a UUID, creator and `TIMESTAMPTZ(3)` create/update instants. Civil source and target dates use PostgreSQL `DATE`.

The shared `OperationalOverlayStatus` enum contains exactly `ACTIVE` and `REVERSED`. Calendar targeting uses `CalendarExceptionScope` (`SCHOOL_WIDE`, `GRADE`, `CLASS`) and `CalendarExceptionTimeSelector` (`WHOLE_DAY`, `SESSION`, `EXACT_SLOTS`). Lesson disposition uses exactly `AUTHORIZED_CANCELLATION`, `ABSENCE_NO_REPLACEMENT`, `SAME_SUBJECT_SUBSTITUTION` and `DIFFERENT_SUBJECT_SUPERVISION`.

### Lifecycle, replacement and idempotency

Creation directly produces `ACTIVE`. A database lifecycle check requires all reversal metadata to be absent while active and requires reversing actor, instant, bounded reason, reverse request key and reverse fingerprint while `REVERSED`. Rows are retained; physical delete is not a correction mechanism.

Each family carries a nullable self-reference `replacesId`. A check rejects self-replacement, `ON DELETE RESTRICT` retains the predecessor, and uniqueness of `replacesId` prevents multiple rows from claiming the same predecessor. A correction therefore reverses the old row and creates a separately validated forward replacement; it does not rewrite semantic payload.

Each root stores a required normalized create request key/fingerprint and an optional normalized reverse request key/fingerprint. Create and reverse keys are independently unique within their aggregate family. LOCAL-FC-05C2 owns fingerprint construction, replay responses, compare-and-swap transitions and command transaction isolation.

### CalendarException

One exception pins one `AcademicYear`, one exact retained `AcademicCalendarVersion`, one civil date, one allowed scope and one allowed time selector. Database checks enforce school/grade/class target shape, THPT grades 10–12 and whole-day/session/exact-slot selector shape. A composite class FK rejects cross-year targets, and a composite calendar FK rejects current-head or cross-year substitution.

Exact-slot membership is normalized in `CalendarExceptionTimeSlot`. Composite parent provenance includes the selector, and the child is constrained to `EXACT_SLOTS`. A same-year composite slot FK pins the exact retained `TimeSlotDefinition`; duplicate membership is rejected. Requiring at least one child cannot be expressed by a normal parent-row constraint, so it remains a 05C2 transactional invariant. Period ordinal or display label is never identity.

### OperationalLessonDisposition

One disposition stores the complete exact source bundle: academic year, timetable version/entry, civil date, calendar version, slot, class, subject, TeachingAssignment and responsible teacher. New composite unique keys on `TimetableVersion` and `TimetableEntry` exist only to support source-provenance FKs; they add no current-head or mutable meaning. The timetable-version key also proves the retained calendar snapshot.

A partial unique index over exact `TimetableEntry + sourceCivilDate` permits at most one `ACTIVE` disposition. Reversed history does not block a separately created replacement.

Type-shape checks require no assigned teacher or eligibility evidence for cancellation/absence. Same-subject substitution requires an assigned teacher, frozen check instant, active and teaching-staff results, `sameSubject = true`, and an exact `StaffSubject` provenance identity. Different-subject supervision requires an assigned teacher and frozen active/teaching-staff evidence with `sameSubject = false`; it does not claim a same-subject `StaffSubject`. A narrow `StaffSubject(id, user, subject)` provenance key backs the same-subject FK. Assigned teacher is never required to own the source TeachingAssignment.

The disposition has no PPCT item, distribution counter, completion flag, debt, execution or reporting state.

### MakeupTeachingSchedule

One make-up schedule pins the complete original timetable/date/calendar/slot/class/subject/assignment/responsible-teacher bundle and one exact PPCT obligation: association, plan, version and item. A narrow additional `PpctClassAssociation` provenance key proves association/year/class/subject/plan/version together, while the existing `PpctItemRevision` provenance key proves exact plan/version/item. An optional source disposition FK is supporting provenance only.

The target pins one civil date, an exact same-year calendar version, an exact same-year slot and a scheduled teacher. Frozen eligibility requires active, teaching-staff and same-subject results to be true and references the exact `StaffSubject` evidence.

A partial unique index over exact association/plan/version/item permits at most one `ACTIVE` make-up claim. Reversed history does not block a later separately validated replacement. Scheduling neither consumes a new PPCT item nor completes PPCT, closes debt or creates TeachingExecution.

### History and deletion policy

All history-bearing domain, actor, replacement and provenance relationships use `ON DELETE RESTRICT`. The new migration introduces no cascade deletion and no trigger. The source keys added to upstream tables exist only to make normal composite foreign keys possible.

## Database versus 05C2 transactional boundary

The database enforces UUID/type/date shape, lifecycle metadata shape, bounded request/reason fields, request-key uniqueness, self/replacement cardinality, exact composite provenance, scope/selector/type shape, duplicate exact slots, one active disposition, one active make-up claim and restricted deletion.

LOCAL-FC-05C2 must transactionally validate:

- source date inside retained timetable and calendar effectivity;
- source/target date weekday against the exact slot;
- interruption/exception/disposition precedence and all occupancy collisions;
- current staff status, teaching-staff state and `StaffSubject` validity at command time;
- at least one child for `EXACT_SLOTS`;
- target slot `allowMakeupTeaching = true`;
- PPCT association date-effectivity and proof that the exact item is the incomplete distributed obligation;
- optional source-disposition type/source coherence;
- lifecycle CAS, legal reversal/replacement transition, fingerprint construction and replay response.

These rules require cross-row or command-time state. No trigger is introduced to emulate the future service transaction.

## Consequences

- Exact retained calendar, timetable, assignment, staff and PPCT sources remain structurally addressable after reversal.
- Concurrency has database backstops without using creation-time priority or last-write-wins.
- The schema is ready for a separately authorized 05C2 control plane without granting authority or defining API contracts.
- Historical migrations remain unchanged; PostgreSQL behavior verification covers the new migration on an isolated database.

## Explicit non-scope

This decision does not authorize or implement public API/controller/service/module code, DTO/contracts, capability definitions/grants/seeds, UI, deployment or production migration. It excludes TeachingExecution, persisted occurrence, PPCT distribution/completion, progress/debt, reports/snapshots, Special Activity, `ACTIVITY` exception scope, move/swap, a generic operational ledger and mutation of upstream timetable, calendar, TeachingAssignment or PPCT history.
