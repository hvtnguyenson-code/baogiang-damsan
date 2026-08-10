# ADR-013 — Teaching Assignment Control Plane

- **Status:** Accepted
- **Date:** 2026-08-11
- **Scope:** LOCAL-FC-03B teaching assignment backend control plane

## Decision

- Teaching-assignment endpoints require the existing `SUBJECT_MANAGE` capability at `SCHOOL_WIDE`; `SYSTEM_ADMIN` is never an implicit bypass.
- The public surface is list/create by academic year plus assignment detail, explicit end, and explicit change-teacher commands. There is no generic PATCH, delete, bulk, timetable, or reporting endpoint.
- Assignment identity remains `AcademicYear`-scoped. Write commands require exactly one active `AcademicCalendarVersion`, while reads remain available without an active calendar.
- Assignment dates are inclusive civil `DATE` values. A null `validUntil` remains null in storage; the active calendar end is only an operational horizon for validation.
- Create and replacement-teacher eligibility require an active class and subject, an active User with a teaching StaffProfile, and one `StaffSubject` row covering the entire effective interval.
- Cross-domain eligibility maps civil dates to business-midnight absolute instants using `BUSINESS_UTC_OFFSET`. This mapping applies only to StaffSubject coverage and does not change TeachingAssignment persistence semantics or depend on browser, OS, or process timezones.
- Create, end, and change-teacher run at serializable isolation. PostgreSQL's exclusion constraint remains authoritative for overlap; conflicts and serialization retries return safe 409 responses.
- A teacher change is a transactional historical split: the old row ends on the prior civil day and a replacement row begins on the requested day. A failed replacement rolls back the old-row update and audit.
- Each successful command records its audit event in the same transaction. Failed commands write no success audit.
- Calendar activation revalidates all stored assignment envelopes before switching active versions. For open-ended assignments it rechecks StaffSubject coverage through the candidate calendar end. Incompatible activation rolls back without rewriting assignment history.
- User, Subject, and SchoolClass status changes do not rewrite existing assignment history. Timetable, PPCT, substitute-teacher events, reporting, and UI remain deferred.

## Consequences

- A later management UI can rely on stable history-preserving commands rather than generic row mutation.
- Calendar-version lifecycle and assignment eligibility share one policy implementation, avoiding divergent civil-date and coverage rules.
