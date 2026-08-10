# ADR-010 — Academic Calendar and Class Foundation

- **Status:** Accepted
- **Date:** 2026-08-10
- **Scope:** Local Phase 02A academic structure schema foundation

## Context

Teaching assignments, timetables, weekly teaching reports and approval workflows need a stable academic structure before their own schemas or APIs can be introduced. The school calendar cannot be derived from ISO week numbers: official weeks and reserve weeks are configured business units, and one official week may span multiple non-contiguous civil-date segments around a long interruption. Calendar edits must also preserve historical meaning through versioning.

## Decision

- `AcademicYear` is the stable identity for a school year. It contains no global `currentYear` flag and no universal week-count default.
- Mutable scheduling configuration belongs to `AcademicCalendarVersion`. Version numbers are unique within an academic year, and a PostgreSQL partial unique index permits at most one active version per year.
- Academic-year, calendar-version, semester, week-segment and interruption boundaries use PostgreSQL `DATE`, because they are civil school dates. `createdAt`, `updatedAt` and `activatedAt` remain absolute instants stored as `TIMESTAMPTZ(3)`. The application business timezone remains `Asia/Ho_Chi_Minh` for wall-clock semantics, but a civil date is not converted to a midnight instant.
- Teaching weekdays are explicit `AcademicWeekday` enum values stored on each calendar version. Monday-to-Friday behavior is not implicit.
- `AcademicWeek` is a business week and is never derived from PostgreSQL, JavaScript, operating-system or ISO week calculations. `OFFICIAL` and `RESERVE` are distinct kinds with mutually exclusive number fields. A reserve label such as DP1 never becomes official Week N+1.
- Real date ranges belong to `AcademicWeekSegment`, not `AcademicWeek`. A composite foreign key binds every segment to both its week and that week's calendar version. PostgreSQL permits gaps but rejects overlapping segments within one calendar version, so Week 5 may contain non-contiguous segments 5a and 5b.
- `CalendarInterruption` represents a long pause in academic-week progression. It is distinct from a local exception affecting a day, session, period, grade, class or activity.
- `Semester` is a configurable reporting grouping within a calendar version. Its code and ordinal are version-scoped, and source code does not assume exactly two semesters or fixed codes such as HK1/HK2.
- `SchoolClass` is master data scoped to `AcademicYear`. Class codes are normalized and unique only within that year, allowing the same displayed code in another academic year. THPT grade levels are constrained to 10 through 12.
- Robust, local invariants use CHECK constraints, unique or partial indexes, `btree_gist` exclusion constraints and `ON DELETE RESTRICT`. No trigger is introduced.

## Database-enforced invariants

- normalized non-empty identifiers and names;
- positive calendar version and semester ordinals, positive official week count, and non-negative reserve week count;
- non-empty configured teaching weekdays;
- valid inclusive civil-date ranges;
- unique calendar version number and at most one active version per academic year;
- unique semester code/ordinal and no overlapping semesters within one version;
- exact OFFICIAL/RESERVE discriminator integrity, unique official/reserve numbers, labels and sort order within one version;
- unique segment label/order within one week, same-version week/segment identity, and no overlapping week segments within one version;
- unique interruption code and no overlapping interruptions within one version;
- unique class code within one academic year and valid THPT grade level;
- parent deletion protection for history-bearing relationships.

## Application invariants deferred to Local Phase 02B

These rules require cross-table reads or lifecycle coordination and are intentionally not claimed as database-enforced:

- semester, week-segment and interruption ranges must stay within the parent calendar-version range;
- official/reserve week numbers and row counts must not exceed the version's configured counts;
- week order, segment order and dates must form a valid business chronology consistent with configured teaching weekdays;
- interruptions must align with segment gaps, and any resume-week pointer must reference the same calendar version;
- calendar activation and historical edits must be transactional: edits create a new version, and active or historically referenced versions are not silently overwritten or physically deleted;
- configured teaching weekday values must not contain duplicates;
- local calendar exceptions require canonical time-slot and downstream scope models before they can be represented safely.

## Deferred domain models

`CalendarException`, `HomeroomAssignment`, `TeachingAssignment`, `Timetable`, students/enrollment, time slots and period configuration are outside 02A and will be introduced only by later approved slices.

## Consequences

- Timetable and reporting code will resolve stored business-week identities and version-addressed civil dates rather than calculate ISO weeks.
- PostgreSQL migration/integration tests are authoritative for constraints Prisma cannot express.
- Calendar lifecycle services in 02B must implement and test every deferred invariant above before exposing mutation APIs.
