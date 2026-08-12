# ADR-018 — Timetable Time-Slot Control Plane

- **Status:** Accepted
- **Date:** 2026-08-11
- **Scope:** LOCAL-FC-04B0 time-slot management backend

## Context

ADR-016 established AcademicYear-owned immutable `TimeSlotDefinition` revisions and PostgreSQL invariants for the active wall-clock grid. ADR-017 established that `TimetableEntry` references an exact slot revision. The repository still needs a narrowly scoped management API, explicit professional authorization, transactional revision commands and auditable lifecycle behavior before later timetable authoring work can safely consume those identities.

## Decision

- Add exactly one professional capability, `TIMETABLE_MANAGE`, allowed only at `SCHOOL_WIDE`. It is cumulative and explicit; `SYSTEM_ADMIN`, academic-structure, subject, user and grant-management capabilities do not imply it.
- Expose only list/create under an AcademicYear, exact-revision read, revise and retire routes. There is no generic update, delete or reactivation route.
- List reads include active and inactive revisions by default. All historical revisions remain directly queryable, while only the active/current revision is selectable for new authoring by policy.
- CREATE is permitted only for a logical coordinate with no historical row and explicitly creates revision 1 as active. A coordinate with any history must use REVISE.
- REVISE preserves AcademicYear, weekday, session and ordinal; it never rewrites source semantics. The latest source becomes inactive when necessary and a new active revision is inserted. A retired latest revision may be revised to restore the coordinate, but no old row is reactivated. Stale source IDs cannot branch history.
- RETIRE changes only `isActive` on the latest revision. Retiring an already inactive latest revision is an audited no-op. Rows are never deleted, including when referenced by `TimetableEntry`.
- The external TIME format is exactly `HH:mm:ss`, matching PostgreSQL `TIME(0)`. Values are school-local wall-clock coordinates, not instants or civil dates. A neutral `1970-01-01` UTC anchor is used only for Prisma driver transport, with UTC component getters for formatting. No business-offset or timezone conversion applies.
- Slot configuration remains owned by AcademicYear and requires no active `AcademicCalendarVersion`.
- Mutations use serializable transactions. The logical-revision unique constraint, active-coordinate and active-label indexes, and active wall-clock GiST exclusion remain the final concurrency-safe invariants. Known Prisma serialization and slot-constraint conflicts map to safe HTTP 409 responses; unknown failures propagate.
- `TIME_SLOT_CREATED`, `TIME_SLOT_REVISED` and `TIME_SLOT_RETIRED` audit events are written in the same transaction as each successful command, including request ID and useful coordinate/revision metadata. Reads do not emit domain audit events.
- This slice needs no schema change or migration.

## Deferred decisions

The following remain later work:

1. **04B1:** timetable draft and entry commands plus the validation engine.
2. **04B2:** approve, activate, supersede, historical resolution and lifecycle concurrency.
3. **04B3:** Excel import, checksum, mapping and preview orchestration.

Timetable completeness, the import contract, manual/bulk entry, approval/activation separation of duties and abandoned-draft retention remain unresolved. Calendar exceptions, substitutions, cancellations, make-up teaching, PPCT, special activities and Room are also outside this decision.

## Consequences

The system gains a stable, explicitly authorized slot-management boundary while preserving every exact historical identity consumed by timetable entries. PostgreSQL remains authoritative for active-grid collision under concurrency, and later timetable slices can select current revisions without reinterpreting historical schedules.
