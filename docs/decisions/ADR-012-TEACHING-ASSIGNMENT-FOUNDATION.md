# ADR-012 — Teaching Assignment Foundation

- **Status:** Accepted
- **Date:** 2026-08-10
- **Scope:** LOCAL-FC-03A teaching assignment schema foundation

## Context

The academic structure now provides stable academic-year and class identities, while timetable, PPCT, reporting, and operational teaching-assignment commands remain deferred. The persistence foundation must preserve teacher-responsibility history without coupling that history to mutable calendar versions or permitting an ambiguous teacher for a class and subject on a civil date.

The authoritative requirement audit found no requirement for simultaneous co-teaching, assignment roles, percentage shares, or period-level teacher assignment in this domain. Requirements for multiple teachers in the approved specification apply to separate special-activity models for GDĐP and HĐTN-HN.

## Decision

- `TeachingAssignment` is scoped directly to `AcademicYear`, not `AcademicCalendarVersion`. A calendar revision does not duplicate or rewrite staffing history.
- Teacher identity uses the existing `User` entity. Eligibility through `StaffProfile`, `isTeachingStaff`, operational status, and `StaffSubject` remains an application invariant.
- Every assignment stores both `academicYearId` and `schoolClassId`. A composite foreign key to `SchoolClass(id, academicYearId)` prevents a class from another academic year from being assigned accidentally; the direct `AcademicYear` foreign key is retained.
- `validFrom` and nullable `validUntil` are PostgreSQL `DATE` values representing inclusive civil school dates. A null `validUntil` is an open-ended historical interval. `createdAt` and `updatedAt` remain `TIMESTAMPTZ(3)` instants.
- A PostgreSQL GiST exclusion constraint permits at most one concurrent assignment for the same academic year, class, and subject. Adjacent history is valid only when the next assignment starts after the previous inclusive end date.
- A teacher may concurrently own assignments for different classes or subjects. A later timetable domain is responsible for period-level collision detection.
- This slice does not introduce a co-teaching, role, share, or period-assignment model. Any future requirement for those semantics requires an explicit domain decision and migration rather than weakening this invariant silently.
- Assignment history is append-oriented. Responsibility changes create or end effective intervals; historically meaningful rows are not destructively overwritten or physically deleted through a public API.
- Existing capability `SUBJECT_MANAGE` already covers subject catalog and teaching-assignment management. No capability or seed change is introduced, and `SYSTEM_ADMIN` is not an implicit authorization bypass.
- Database parents use `ON DELETE RESTRICT`, and no trigger is introduced.

## Application invariants deferred to LOCAL-FC-03B

The backend control plane must decide and enforce:

- assignment dates fit the selected academic year's valid operational calendar envelope;
- behavior when no active `AcademicCalendarVersion` exists;
- compatibility when a new calendar version is activated while assignments already exist;
- the class and subject are operationally usable;
- the teacher `User` and required `StaffProfile` are operationally eligible, including `isTeachingStaff` and relevant `StaffSubject` rules;
- create, change, and end commands preserve history transactionally;
- failed mutations emit no success audit;
- historically meaningful assignments have no physical-delete public API;
- authorization uses the existing explicit capability architecture and never treats `SYSTEM_ADMIN` as an implicit bypass.

## Deferred domains

`Timetable`, `HomeroomAssignment`, calendar exceptions, time slots and periods, PPCT, weekly teaching reports, substitute-teacher events, and reporting remain outside LOCAL-FC-03A.

## Consequences

- Downstream code can resolve one canonical teacher for a class and subject on a civil date.
- Calendar-version activation can change scheduling configuration without changing assignment identity.
- PostgreSQL migration regression tests are authoritative for inclusive overlap, open-ended history, same-year class integrity, allowed concurrent assignments, and parent deletion protection.
