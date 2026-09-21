# ADR-051 — School-wide Effective Teaching Schedule Read Model

- **Status:** Proposed under `P2-060`; becomes Accepted only through reviewed/merged P2-060 closure.
- **Date:** 2026-09-21
- **Scope:** school-wide read-only effective teaching schedule authority and Teacher Workspace contract; documentation only.
- **Authority:** explicit Product Owner/BGH product requirement recorded under `P2-060` / `T47`.

## Context

The repository already retains authoritative academic calendar, date-effective timetable versions, operational overlays, make-up schedules, SpecialActivity occupancy/staffing and GDĐP/HĐTN-HN materialization into SpecialActivity. ADR-036 also defines and the repository implements the internal `RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1` derived structural read model.

However, ADR-036 intentionally exposes no public HTTP read boundary and explicitly requires a later authorization decision before such a boundary is created. The historical timetable specification also anticipated a teacher/read-only timetable UI but did not establish school-wide teacher visibility, effective operational occupancy composition or a compare-with-my-schedule product contract.

BGH now requires every teacher to be able to inspect other teachers' effective schedules across the school to support practical coordination for đổi tiết and nhờ coi tiết. The view must be read-only; business mutations remain centralized in the existing administrative/business-control domains.

## Decision

### 1. Canonical public read profile

Introduce a derived, non-persisted public read profile:

`SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1`

It is computed from retained authoritative sources and may reuse `RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1`. It is not a new source of truth and must not be stored as an editable schedule table.

### 2. Effective schedule, not base timetable

Teacher-facing schedule truth is effective operational occupancy after applying current-authoritative calendar/timetable/overlay/activity facts.

For normal opportunities, accepted precedence remains:

1. CalendarInterruption;
2. CalendarException;
3. active SpecialActivity suppression;
4. active OperationalLessonDisposition;
5. base timetable.

Occupancy mapping is exact:

- cancellation, absence-without-replacement and structural suppression create no normal teacher occupancy;
- same-subject substitution and different-subject supervision occupy the exact assigned teacher, not the original responsible teacher;
- base timetable occupies the responsible teacher;
- active make-up teaching occupies its scheduled teacher at the exact target interval;
- active SpecialActivity occupies every exact staffing teacher for every exact activity slot;
- reversed/non-current-authoritative facts contribute no current occupancy.

GDĐP/HĐTN-HN materialized by P4-040 appear through SpecialActivity; no parallel programme-specific schedule truth is created.

### 3. Authorization

Authenticated `TEACHER_BASE` is the explicit school-wide schedule read authority.

This authority is read-only and does not imply `TIMETABLE_MANAGE`, `TEACHING_OPERATION_MANAGE`, `SPECIAL_ACTIVITY_MANAGE`, coordinator authority or any other mutation capability. `SYSTEM_ADMIN` alone does not imply `TEACHER_BASE`.

### 4. Fail-closed ambiguity

If structural/effective resolution is `BLOCKED`, ambiguous or incoherent, the affected public view fails closed. It must never convert unresolved state into an empty schedule or `Trống`.

### 5. Real interval comparison

Busy/free truth and comparison use exact real half-open time intervals, not only slot numbers or labels.

### 6. Mandatory Teacher Workspace surfaces

The Vietnamese Teacher Workspace contains one area named **Lịch dạy** with:

- **Lịch của tôi** as default;
- **Toàn trường**;
- searchable teacher dropdown;
- selected-teacher weekly effective schedule;
- **So sánh với lịch của tôi**.

The compare view is informational only. It describes occupancy states and must not claim swap/substitution eligibility or expose mutation controls.

### 7. Data minimization

The public read surface exposes only schedule-relevant professional information. Personal contact details, username/security state, capability grants, audit history, private notes, workload data and student personal data are excluded.

### 8. Bounded contracts

Public reads must be bounded. Initial required shapes are:

- paginated/searchable teacher options;
- one teacher + one academic week;
- school-wide + one civil date;
- authenticated teacher versus one peer + one bounded week/date context.

Unbounded whole-year school-wide payloads are forbidden.

### 9. Frontend localization

Backend technical identifiers remain canonical English. All normal teacher-facing labels, statuses, messages and selectors must be Vietnamese; raw backend enums must not leak into the Teacher Workspace.

## Consequences

- Teachers gain school-wide schedule visibility without gaining administrative mutation authority.
- The system gains one canonical effective-schedule projection rather than multiple copied timetable interpretations.
- Compare-with-my-schedule becomes reliable for practical coordination because it consumes effective occupancy, including overlays, make-ups and SpecialActivity.
- Any future swap/request workflow remains a separate explicitly authorized task; this ADR does not authorize it.

## Implementation boundary

`P2-061` implements this ADR only after P2-060 is `CLOSED`.

P2-061 must add the derived read model, bounded public API/contracts, authorization tests and fully Vietnamese Teacher Workspace UI, with no schema table for effective schedule and no teacher-side mutation workflow.
