# ADR-035 — Special Activity Persistence Foundation

- **Status:** Accepted
- **Date:** 2026-08-15
- **Scope:** LOCAL-FC-05D1 persistence only
- **Authority:** ADR-034 and LOCAL-FC-05D0D Special Activity Decision Closure

## Decision

SpecialActivity is persisted as one atomic retained occurrence pinned to an
AcademicYear, exact AcademicCalendarVersion, civil DATE, scope selector and
bounded title/note. It has exactly three aggregate-owned child families:

1. SpecialActivityTimeSlot retains exact TimeSlotDefinition identities.
2. SpecialActivityClassTarget retains frozen exact SchoolClass targets.
3. SpecialActivityStaffing retains roleless scheduled teaching-staff identity
   and positive eligibility evidence.

The dedicated enums are SpecialActivityStatus (ACTIVE, REVERSED) and
SpecialActivityScope (SCHOOL_WIDE, GRADE, CLASS). They intentionally do not
reuse operational-overlay or calendar-exception enums.

Root scope shape, lifecycle/reversal shape, normalized request identity,
normalized bounded text, no-self-replacement and positive staffing evidence
are database checks. Every history/provenance foreign key is ON DELETE
RESTRICT. Composite foreign keys prevent cross-year calendar, slot and class
drift. Staffing pins staff_profile_id plus scheduled_teacher_user_id to a
narrow StaffProfile id/user_id provenance key. Root request keys, replacement
links, child membership and staffing membership are unique.

## Consequences

This foundation retains historical scheduling provenance but does not enforce
child completeness, civil-date weekday compatibility, selector expansion,
staff eligibility lookup, request replay semantics, CAS, collision checks or
any command behavior. Those are service-transaction concerns for a separately
authorized runtime slice.

There are no partial unique collision indexes, exclusion constraints, triggers,
or cascade deletion. The persistence model contains no PPCT, subject,
TeachingAssignment, execution, actual-teacher/content, progress/debt,
report/snapshot, Room/Location, category/type catalogue, roster,
attendance/enrollment, notification or approval data.

## Explicit non-scope

No API, runtime command, capability seed, authorization wiring, contract,
service collision logic, audit behavior, UI, import, recurrence, arbitrary
wall-clock, Room model, execution, make-up expansion, PPCT or reporting is
introduced by LOCAL-FC-05D1.
