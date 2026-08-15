# ADR-036 — Resolved Lesson Occurrence Structural Read Model

- **Status:** Accepted
- **Date:** 2026-08-16
- **Scope:** LOCAL-FC-05E0D structural architecture closure; no implementation authorization
- **Authority:** `docs/requirements/LOCAL-FC-05E0D-RESOLVED-LESSON-OCCURRENCE-DECISION-CLOSURE.md`

## Context

ADR-020 retains exact date-effective timetable history; ADR-027 through ADR-029 retain PPCT plan/version/item/association history; ADR-031/ADR-033 retain operational overlays and make-up source provenance; ADR-034/ADR-035 plus 05D2 retain independent Special Activity occupancy. ADR-030 establishes a deterministic `RepeatableRead`, recomputed, non-persisted read-model precedent.

There is no ResolvedLessonOccurrence model/module/table and no class-subject Progress/Distribution ledger. Exact normal PPCT item allocation therefore cannot be reconstructed safely across prior distribution, version switches, stable UUID carry-forward, split/merge lineage and Special Activity suppression.

## Decision

### Structural profile and consistency (D1–D3)

`RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1` is a derived read model. It is recomputed from retained authoritative sources inside one Prisma interactive `RepeatableRead` transaction; all source reads share that snapshot and all external collections are deterministically sorted. `evaluatedAt` may vary, but unchanged-snapshot business semantics are deterministic. Read-only evaluation needs no `Serializable` requirement.

05E1 adds no Prisma model/table/migration, cache, certification, persisted snapshot, materialized occurrence UUID, mutation or evaluation audit. Historical meaning is current-authoritative reconstruction: retained date-effective source identities plus current lifecycle state of reversible operational rows, not transaction-time history. Later accepted corrections may change later recomputation; future official report snapshots freeze statements.

### Families and derived keys (D4–D5)

The independent structural families and machine keys are:

```text
NORMAL_TIMETABLE_OPPORTUNITY  → NORMAL:<timetableEntryId>:<civilDate>
MAKEUP_TEACHING               → MAKEUP:<makeupTeachingScheduleId>
SPECIAL_ACTIVITY              → SPECIAL_ACTIVITY:<specialActivityId>
```

They are not one persistence aggregate. A disposition attaches to the same normal key. A response may expose suppression of a normal candidate and an independent activity in the same date/time context.

### Normal candidates and precedence (D6–D10)

Every exact date-effective normal candidate remains visible, including when suppressed, and retains exact year, calendar, timetable version/entry, civil date, slot, class, subject, assignment and responsible-teacher provenance. It is a structural opportunity, not proof teaching occurred.

Effective precedence for normal teaching only is:

1. CalendarInterruption;
2. CalendarException;
3. active SpecialActivity suppression using frozen target classes and retained real half-open slot intervals;
4. exact active OperationalLessonDisposition;
5. base timetable.

Interruption/exception does not erase an explicit Special Activity. The activity root remains one occurrence with its exact id, date/calendar, title/note, frozen classes, slots/intervals and staffing; it is never fanned out by class × slot and carries no PPCT state. A disposition exposes type, responsible/assigned teacher and frozen staffing provenance without mutating timetable/assignment. Impossible active activity/disposition ambiguity fails closed with a structured blocker.

### PPCT binding and allocation boundary (D11–D12)

Each normal class-subject candidate resolves the exact date-effective `PpctClassAssociation → PpctVersion → PpctPlan`. Missing, ambiguous or impermissible DRAFT/invalid binding is a blocker; a legitimate retained binding to `SUPERSEDED` remains valid. Exact association/version/plan provenance is returned.

Expected normal `PpctItem` allocation is explicitly `NOT_ASSESSED`. No next-sequence heuristic, timetable-row count, inferred distribution/completion, current-head substitution or unapproved lineage traversal is permitted. This intentional coverage boundary does not itself block the structural result.

### Make-up, collision and status (D13–D15)

Every active make-up schedule is an independent structural occurrence retaining exact target date/calendar/slot/class/subject/teacher and exact original timetable/calendar/slot/class/subject/assignment/responsible-teacher, PPCT association/version/item obligation and optional source disposition. It consumes no new item and 05E performs no make-up mutation.

Impossible active activity/make-up or other invariant-violating occupancy fails closed. Structural status is `PASS` or `BLOCKED`, with deterministic structured blocker findings/provenance; excluded PPCT item allocation remains `NOT_ASSESSED`.

### Boundary and downstream obligations (D16–D19)

05E1 is an internal service/read model only: no public HTTP endpoint and no new capability. No permission is inferred from existing management capabilities, `SYSTEM_ADMIN`, role/title or assignment. A future public boundary requires its own accepted authorization decision.

05E1 creates or mutates no TeachingExecution/Báo giảng, PPCT distribution/completion, Progress, Debt, Late, workload, report or submitted/approved snapshot. Future TeachingExecution cannot assume a foreign key to a materialized occurrence table; it must retain exact upstream provenance and/or the deterministic source key. Its physical shape remains downstream.

Before any expected normal PPCT item claim, LOCAL-FC-05E2 must accept exact distribution-cursor, version-switch/carry-forward, stable UUID, split, merge, activity-suppression and future debt-obligation identity semantics.

## Consequences

05E1 may implement an honest structural composition boundary without creating a new source of truth or inventing allocation/execution semantics. Normal suppression remains observable, while make-up and Special Activity retain their independent identities and provenance.

PPCT item allocation and the full execution/progress/report architecture are not closed by this ADR.

## Explicit non-scope

Schema/migration, persistence/cache/snapshot, public API/capability, make-up mutation, PPCT item allocation, TeachingExecution/Báo giảng, distribution/completion, progress/debt/late, workload, reporting/approval, UI, deployment and production operations are excluded.

RESOLVED LESSON OCCURRENCE STRUCTURAL ARCHITECTURE CLOSED — READY FOR 05E1 STRUCTURAL READ MODEL
