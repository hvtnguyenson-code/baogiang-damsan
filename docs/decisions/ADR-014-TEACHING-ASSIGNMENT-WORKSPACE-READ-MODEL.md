# ADR-014 — Teaching Assignment Workspace Read Model

- **Status:** Accepted
- **Date:** 2026-08-11
- **Scope:** LOCAL-FC-03C0 teaching-assignment workspace read model

## Context

Teaching-assignment management requires `SUBJECT_MANAGE` at `SCHOOL_WIDE`, while the generic academic-structure and user-management APIs intentionally require different capabilities. A teaching-assignment workspace therefore cannot populate its filters and candidate controls through those generic APIs without creating an unnecessary capability escalation.

## Decision

- A dedicated read-only projection under `/api/teaching-assignment-options` requires exactly `SUBJECT_MANAGE` at `SCHOOL_WIDE`. Generic AcademicYear, SchoolClass and User controller permissions remain unchanged, and `SYSTEM_ADMIN` is not an implicit bypass.
- Year options expose only identity fields. Workspace options expose the selected year, the active calendar envelope, all year-scoped classes, all subjects and distinct historical teachers used in that year.
- Historical teacher options preserve current public-safe display metadata even when a teacher is no longer operationally eligible. Eligible-teacher candidates are a separate projection restricted to active teaching users with one exact-subject `StaffSubject` row covering the full requested interval.
- Candidate eligibility reuses the canonical 03B mapping from inclusive civil dates to business-midnight StaffSubject half-open coverage. Omitted `validUntil` uses the active calendar end as an operational horizon without rewriting any TeachingAssignment date.
- An active calendar is required for candidate eligibility, but not for year listing or historical workspace reads.
- The projection has no mutation route and writes no domain audit event. It introduces no capability, schema, migration or seed change.
- The consuming UI remains deferred to LOCAL-FC-03C.

## Consequences

`SUBJECT_MANAGE` users can operate the future teaching-assignment workspace without receiving generic user or academic-structure privileges. Responses remain narrow, deterministic and safe for historical filters while operational candidate selection continues to enforce the accepted temporal eligibility rules.
