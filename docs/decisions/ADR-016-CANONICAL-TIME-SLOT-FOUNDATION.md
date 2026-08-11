# ADR-016 — Canonical Time-Slot Foundation

- **Status:** Accepted
- **Date:** 2026-08-11
- **Scope:** LOCAL-FC-04A1 canonical time-slot persistence foundation

## Context

The timetable requirements audit in `LOCAL-FC-04-TIMETABLE-DOMAIN-SPEC.md`, PA-B v1.2 sections 5–9 and Appendix D, the v1.3 implementation addendum, and ADR-010 through ADR-015 require configurable morning, afternoon and evening periods, stable historical identity, and collision checks based on real wall-clock intervals. ADR-015 deliberately left slot revision/effectivity, weekday-specific grids, and break representation unresolved pending this decision.

A canonical slot must later be reusable by exact-revision timetable references, calendar exceptions, make-up teaching, self-study windows, and other collision participants without coupling its identity to a mutable calendar version.

## Decision

- `TimeSlotDefinition` belongs directly to `AcademicYear`. It does not belong to `AcademicCalendarVersion`, `AcademicWeek`, `Semester`, class, or teaching assignment. The AcademicYear foreign key uses `ON DELETE RESTRICT`.
- One row represents one immutable revision of one logical coordinate: AcademicYear + explicit `AcademicWeekday` + `TimeSlotSession` + positive ordinal.
- `TimeSlotSession` has exactly `MORNING`, `AFTERNOON`, and `EVENING`. Session is descriptive grouping; actual wall-clock occupancy remains authoritative.
- Weekday is stored on each row, not in an array. Different weekdays may use different clock grids without a schema migration.
- `startTime` and `endTime` are PostgreSQL `TIME(0) WITHOUT TIME ZONE` school wall-clock coordinates. They are neither dates nor UTC instants and must not pass through `BUSINESS_UTC_OFFSET`, `Asia/Ho_Chi_Minh`, browser-local conversion, or `Date.toISOString()`.
- Intervals are half-open `[startTime, endTime)`. `startTime < endTime` is required, cross-midnight slots are excluded, and an end boundary equal to the next start boundary is valid.
- Breaks are gaps between schedulable intervals. This foundation introduces no break row, break flag, or fake timetable entry. Named break metadata, if later required, needs a separate decision.
- Clock or semantic changes create a new positive revision for the same logical coordinate. Revision numbers are unique per logical coordinate, historical revisions remain stored, and at most one revision may be active.
- `isActive` means the current/selectable revision for new authoring or configuration. It does not mean that the row was operational on a civil date. Slot rows have no `validFrom`, `validUntil`, `effectiveFrom`, or `effectiveUntil`.
- Usage is represented by three explicit flags: regular teaching, make-up teaching, and self-study. At least one flag must be true. No open-ended usage string or speculative special-activity flag is introduced.
- Active display labels are unique within AcademicYear + weekday + session. Inactive historical rows may retain repeated labels.
- The active grid is internally non-overlapping for each AcademicYear + weekday, across session labels. PostgreSQL enforces this with an active-only GiST exclusion over a half-open integer range derived from the two `TIME(0)` boundaries.
- The database also preserves a composite unique identity `(id, academicYearId)` so a later same-year composite foreign key can reference an exact slot revision.
- No active AcademicCalendarVersion is required to define a slot. Future timetable activation validates entry weekdays against the applicable calendar's `teachingWeekdays`; calendar changes do not replace slot identity.

## Immutability rule

Once a slot revision is referenced by a history-bearing downstream domain, its semantic fields must not be rewritten. These fields are weekday, session, ordinal, revision, display label, start/end time, and usage flags. Future APIs must retire the old revision and create a new revision. Only lifecycle metadata such as `isActive` may change.

LOCAL-FC-04A1 provides persistence constraints only. It adds no API and no trigger; the future control plane owns transactional retirement/creation and referenced-history immutability enforcement.

## Enforcement boundary

The database guarantees that the current active slot configuration for one AcademicYear and weekday is internally non-overlapping. It intentionally permits inactive historical revisions to overlap active or other inactive rows.

This foundation does not prove that a future `TimetableVersion` uses a mutually compatible set of exact historical slot revisions. LOCAL-FC-04A2 defines timetable persistence, and LOCAL-FC-04B activation validation must reject incompatible mixtures and recheck calendar and downstream collision rules.

## Consequences

- Slot identity and historical clock meaning remain stable across configuration changes.
- Weekday-specific grids, gaps for breaks, sequential periods, and usage-specific windows require data changes rather than schema changes.
- Calendar versions and slot revisions remain independently versioned aggregates under the same AcademicYear.
- Future timetable entries can reference exact revisions without dynamically reinterpreting old schedules.

## Explicit non-scope

`TimetableVersion`, `TimetableEntry`, timetable lifecycle/API/UI/import, `CalendarException`, substitution, cancellation, make-up events, PPCT, special-activity storage, capability changes, seed changes, deployment, and production migration are outside 04A1.
