# Core Backend Roadmap

**Status:** Planning guide after LOCAL-FC-05C0D and ADR-031 closed the operational-overlay architecture decisions. This document is not an accepted requirements source and does not authorize implementation.

## Purpose

The remaining backend must be delivered as one dependency chain, not as independent screens:

```mermaid
flowchart LR
  CAL["Academic calendar"] --> PPCT["PPCT plan"]
  CAL --> TKB["Base timetable"]
  PPCT --> READY["Operational readiness"]
  TKB --> READY
  READY --> OVERLAY["Operational overlays"]
  OVERLAY --> OCC["Resolved lesson occurrence"]
  PPCT --> OCC
  OCC --> EXEC["Teaching execution / Báo giảng"]
  EXEC --> PROG["Progress / debt / late"]
  PROG --> REPORT["Reporting projection"]
  REPORT --> SNAP["Submission / approval snapshot"]
```

An upstream plan is never rewritten to represent a downstream fact. Later facts overlay, fulfill, reverse or supersede earlier facts while retaining their original identity.

## Completed backend foundation

The repository currently contains:

1. Identity, server-side session, capability/scope authorization and audit.
2. AcademicYear, immutable AcademicCalendarVersion aggregates, business weeks, split segments, reserve weeks, interruptions and year-scoped classes.
3. Historical TeachingAssignment responsibility by AcademicYear + class + subject + inclusive civil date.
4. AcademicYear-owned immutable time-slot revisions and real wall-clock collision semantics.
5. AcademicYear-owned TimetableVersion history, normalized normal TimetableEntry rows, DRAFT/validation, approval/activation, supersession and civil-date historical resolution.
6. Timetable XLSX import through LOCAL-FC-04B3D1: immutable profile revisions, typed aliases, bounded parsing, canonical preview, server-side confirmation, semantic/request replay, imported-DRAFT protection and adversarial workbook tests.
7. Bounded deterministic `NORMAL_BASE_PPCT_V1` readiness over retained normal-base evidence and exact date-effective PPCT binding, with all unavailable operational dimensions explicitly `NOT_ASSESSED`.

The accepted timetable meaning remains deliberately partial: `VALIDATED` and `ACTIVE` prove only the implemented normal-base checks. They do not prove timetable completeness, PPCT association or special-activity collision readiness.

## Remaining core sequence

LOCAL-FC-05A0 is merged. LOCAL-FC-05A0D closed the seven PPCT architecture prerequisites and ADR-027 is Accepted. LOCAL-FC-05A1 established the six-model persistence foundation through ADR-028. LOCAL-FC-05A2 established the subject-authorized PPCT control plane, lifecycle commands and exact historical resolution through ADR-029. LOCAL-FC-05B1 established bounded normal-base readiness through ADR-030. LOCAL-FC-05C0 audited the operational-overlay boundary, and LOCAL-FC-05C0D closed R1-R22 through ADR-031 without implementing them. The sequence below remains planning guidance subject to each slice's own authorization and gate.

1. **05A1 — PPCT persistence foundation (established by ADR-028).** The shared `AcademicYear + Subject + Grade` master, immutable version/item history, explicit lineage and date-effective exact-version class association now have database-enforced structural foundations. No API, lifecycle command, capability runtime or import is implied.
2. **05A2 — PPCT control plane and lifecycle (established by ADR-029).** Transactional lifecycle commands, published immutability, correction/supersession, class binding, historical reads and `PPCT_MANAGE` authorization are available. No import, progress, execution, reporting or UI is implied.
3. **PPCT import, if later authorized.** Separate contract/security audit after authoritative workbook/workflow evidence; do not encode it in 05A1 or assume timetable-import formats or identifiers apply.
4. **Bounded timetable readiness foundation (established by ADR-030).** The first pure read profile assesses retained normal-base timetable evidence plus exact PPCT association binding only. It does not assess capacity, overlays, special activities or full operational readiness.
5. **05C1 — operational-overlay persistence foundation (planned next slice).** Implement only the three ADR-031 aggregate families, lifecycle/source/reversal history, database invariants and persistence support for idempotency. No API, capability runtime, resolved-occurrence execution, debt/reporting, move/swap or Special Activity semantics are implied.
6. **05C2 — operational-overlay control plane (planned later slice).** Add the accepted capabilities/scopes, create/reverse/read commands, server-resolved default-deny authorization, idempotency/CAS/concurrency behavior, authoritative source validation, bounded collision checks and historical reads. Activity-aware precedence remains deferred until the Special Activity model exists.
7. **Special-activity minimum core.** Occupancy, participant scope and multi-teacher staffing sufficient for collision, execution and reporting.
8. **Resolved lesson occurrence.** Deterministic read model over historical calendar, timetable, PPCT and overlays.
9. **Teaching execution / Báo giảng.** Immutable evidence of what occurred, expected versus actual content and responsible versus actual teacher.
10. **Progress, debt and late.** Reproducible projections from historical facts; make-up fulfills an original obligation exactly once.
11. **Reporting.** Weekly, monthly, semester, custom-range and annual projections as supported by authoritative rules.
12. **Submission and approval.** Immutable submitted/approved snapshots or immutable reference manifests with explicit capability/scope checks and no self-approval.
13. **Cross-domain closure.** Concurrency, idempotency, correction, replay, historical drift and performance validation across the full chain.
14. **CORE BACKEND FREEZE.** Contracts, state transitions, precedence, source references and capability matrix are accepted and regression-covered.
15. **UI afterward.** Product UI consumes frozen backend contracts and does not invent PPCT, debt, occurrence, approval or correction semantics.

## Layering rule

```mermaid
flowchart TB
  PLAN["Planning facts\nCalendar • PPCT • Base timetable"]
  REALITY["Operational facts\nExceptions • Cancellation • Substitution • Make-up • Special activity"]
  EVIDENCE["Execution evidence\nExpected/actual content • Responsible/actual teacher"]
  DERIVED["Derived state\nProgress • Debt • Late • Workload"]
  OFFICIAL["Official record\nSubmitted/approved report snapshot"]
  PLAN --> REALITY --> EVIDENCE --> DERIVED --> OFFICIAL
```

Dependencies point downward. A lower layer may reference immutable upstream identities and snapshots; it must not update an upstream historical row to make current reporting convenient.

## Planning qualifiers

- Future task IDs, ordering refinements and estimates are planning guidance, not accepted requirements.
- A slice may be split after its architecture audit, but no dependency may be skipped merely to deliver UI sooner.
- No UI business semantics are permitted before the corresponding backend contracts are frozen.
- No “God aggregate” owns PPCT, timetable, operational events, execution and reporting together.
