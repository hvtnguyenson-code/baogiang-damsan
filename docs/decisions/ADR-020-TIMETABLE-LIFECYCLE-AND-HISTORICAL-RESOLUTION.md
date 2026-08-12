# ADR-020 — Timetable Lifecycle and Historical Resolution

- **Status:** Accepted
- **Date:** 2026-08-12
- **Scope:** LOCAL-FC-04B2 timetable approval, activation, supersession and historical resolution

## Context

ADR-017 established retained timetable lifecycle rows and inclusive effective-history intervals. ADR-019 established immutable `VALIDATED` normal-base snapshots and deferred approval, activation and historical resolution. The control plane now needs concurrency-safe transitions without inventing completeness, PPCT or special-activity models.

The authoritative sources require approval before activation but do not require different actors or separate capabilities. Adding that restriction would create an unsupported operational rule and could prevent one authorized school operator from completing the workflow.

## Decision

- Approval is exactly `VALIDATED` → `APPROVED`; activation is exactly `APPROVED` → `ACTIVE`. Both require the existing `TIMETABLE_MANAGE` capability at `SCHOOL_WIDE`. No approval, activation or publication capability is added.
- The same authorized actor may validate, approve and activate one version. Each stage records its actual actor and timestamp independently. A stricter organizational separation-of-duties policy requires a later explicit decision.
- Approval acknowledges the immutable validated snapshot. It does not rerun mutable dependency validation and does not change target, entries, teacher snapshots, slot identities or checksum.
- Approval and activation require an exact `expectedUpdatedAt` lifecycle token. Activation also requires `expectedActiveVersionId`: a UUID expects that exact active chain head; omitted or null expects no active head.
- Approval and activation use serializable transactions. Activation conditionally claims the approved candidate, reruns the current normal-base evaluator, requires the candidate's exact `AcademicCalendarVersion` to be currently active, verifies the chain-head token and chronology, and commits lifecycle rows plus audit atomically.
- `TIMETABLE_COMPLETENESS`, `PPCT_ASSOCIATION` and `SPECIAL_ACTIVITY_COLLISIONS` remain explicit deferred checks. `ACTIVE` in 04B2 means the canonical normal base timetable passed every currently implementable current-dependency gate; it does not mean the complete PA-B release is operationally ready.
- First activation creates the active chain head. Activating a valid successor automatically changes the predecessor from `ACTIVE` to `SUPERSEDED` and sets its inclusive `effectiveUntil` to the civil day before the successor's `effectiveFrom`.
- A chain head may be activated before its future `effectiveFrom`; no scheduled status is introduced. Status alone never determines effectivity for a requested date.
- No direct supersede, deactivate or reactivate command exists. Rollback creates a new timetable version and follows the normal lifecycle; a historical `SUPERSEDED` row is never reactivated.
- Historical resolution selects only `ACTIVE` or `SUPERSEDED` rows whose inclusive interval contains the requested strict civil date. No match returns null. It does not use version number, activation time, ISO week, process current date or current calendar-active state.
- A calendar interruption does not remove the base timetable version from historical resolution. Later execution/calendar layers decide whether lessons are suppressed on that date.
- Approval, activation evaluation, activation and predecessor supersession audits share their command transaction. Historical GET resolution has no timetable domain audit.
- This decision requires no schema, migration, seed or capability change.

## Consequences

Candidate-level and AcademicYear chain-level optimistic tokens combine with serializable isolation, the one-active-head unique index and the effective-history exclusion constraint. Concurrent commands cannot create two independent heads from one perceived predecessor, and a failed activation cannot leave an orphan superseded chain.

Historical reporting can resolve future-effective heads and retained predecessor intervals deterministically while preserving old calendar references and immutable timetable content.

## Explicit non-scope

Timetable completeness, PPCT storage, special-activity storage, CalendarException, substitutions, cancellations, make-up teaching, Room, Excel import, checksum/idempotency, template mapping/preview, UI, deployment and production migration remain outside 04B2.
