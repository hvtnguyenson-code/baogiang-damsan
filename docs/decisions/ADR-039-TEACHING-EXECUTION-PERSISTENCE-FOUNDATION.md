# ADR-039 — Teaching Execution Persistence Foundation

- **Status:** Implemented on the LOCAL-FC-05F1 task branch; awaiting independent GitHub/CI review
- **Date:** 2026-08-16
- **Scope:** Prisma/PostgreSQL persistence foundation only
- **Authority:** ADR-038

## Decision

Teaching Execution is persisted in two physical families. `CurricularTeachingExecution` represents immutable fulfillment evidence for one exact direct PPCT distribution obligation. `SpecialActivityParticipationExecution` represents one scheduled teacher's participation in one exact selected activity slot. Activity participation has no class fan-out, subject, PPCT, TeachingAssignment, completion, debt, progress or reporting meaning.

Curricular evidence retains a complete original obligation bundle separately from the actual execution bundle. The original bundle pins year, class, subject, normal occurrence key, original timetable version/entry/date/calendar/slot, TeachingAssignment, responsible teacher, exact PPCT association/plan/version/item and exact immutable item revision. The execution bundle separately pins civil date, retained calendar, slot, academic week, week segment and actual teacher.

`NORMAL` permits only base teaching or exact same-subject substitution. A base row has no disposition or make-up schedule, uses equal original/execution coordinates and requires actual teacher to equal responsible teacher. A substitution row references the exact retained disposition through the complete source tuple and a second composite FK proves that actual teacher equals that disposition's assigned teacher. Absence, supervision and cancellation cannot satisfy the source discriminator.

`MAKEUP` references one exact `MakeupTeachingSchedule` through a single composite source/target FK. That FK proves both the original obligation coordinates and the schedule target date/calendar/slot/scheduled teacher. Original and actual coordinates therefore cannot collapse or drift independently. Exact PPCT revision and exact execution calendar/week/segment are independently retained and relationally backstopped.

Both families use `TeachingExecutionStatus = ACTIVE | REVERSED`. Creation is ACTIVE. Reversal requires actor, instant, bounded reason and reverse request identity/fingerprint; immutable rows are retained. Required create request identity/fingerprint, optional reverse request identity/fingerprint, bounded display snapshots and unique predecessor linkage are persisted. Replacement self-FKs include the complete curricular obligation unit or exact activity/staffing/slot unit, so replacement cannot cross evidence topology.

A partial unique index permits at most one ACTIVE curricular fulfillment for the relational original obligation across NORMAL and MAKEUP. A separate partial unique index permits at most one ACTIVE activity participation for `SpecialActivity + SpecialActivityStaffing + SpecialActivityTimeSlot`; the same teacher may participate in another selected slot.

All history and provenance FKs use `ON DELETE RESTRICT`. The migration uses no trigger and no cascade. Upstream models receive only narrow composite provenance keys and Prisma inverse relation arrays; no execution, completion, actual-teacher, progress, debt or reporting business state is written upstream.

## Non-scope

This foundation implements no runtime service, command behavior, controller, route, DTO/public API, capability/authorization, transactional allocation refactor, AuditEvent write, progress/debt/late, reporting, UI, deployment, production migration or production data mutation.

## Consequence

LOCAL-FC-05F2 may now implement the execution control plane using these persistence invariants, but it must still satisfy every ADR-038 runtime, authorization, time, allocation and one-transaction gate.
