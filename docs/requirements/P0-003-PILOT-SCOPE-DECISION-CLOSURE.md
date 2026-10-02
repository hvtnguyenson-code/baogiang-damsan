# P0-003 — Pilot Scope Decision Closure

## Status

`CLOSED` by `SYNC-P0-003`

## Canonical start

- `main@cd084f2fc18d9df3fc9abdc952342e27678bf035`
- branch: `docs/p0-003-full-business-pilot`
- parent task: `P0-003`

## Product Owner decision

On 2026-10-02 the Product Owner explicitly selected:

`FULL BUSINESS PILOT`

Reason recorded by Product Owner: the first operational use must run the full system rather than temporarily exclude GDĐP/HĐTN-HN.

## Scope meaning

`FULL BUSINESS PILOT` includes the accepted normal curricular business domain and the accepted special-programme domain:

- PPCT/TKB/import/execution/progress/debt/late/reporting;
- GDĐP;
- HĐTN-HN;
- date-effective homeroom resolution;
- exact multi-teacher staffing/workload;
- official combined reporting;
- school-wide effective Teacher Workspace;
- delayed-go-live historical evidence/reconciliation before freeze;
- public make-up scheduling for real incomplete teaching obligations;
- adjusted-workload rules (reduction / percentage / override) where official workload figures depend on them.

The choice is a pilot-claim decision, not permission to mutate production.

## Exact P5-010 direct dependencies

`P5-010` must be registered with:

- `P0-003`;
- `P1-032`;
- `P2-020`;
- `P2-061`;
- `P3-020`;
- `P3-031`;
- `P4-061`;
- `P4-074`.

The Product Owner clarified that omitted registered business rules must not make real operation or official figures incorrect. Therefore the T08 and T23 triggers are fired:

- `P3-030 -> PLANNED` behind `P3-010`;
- `P3-031 -> PLANNED` behind `P3-030`;
- `P4-060 -> READY` because `P1-020` is CLOSED;
- `P4-061 -> PLANNED` behind `P4-060` (and `P1-021` is already CLOSED).

P5-010 therefore remains non-ready until `P3-020`, `P3-031`, and `P4-061` are all CLOSED, in addition to its already-closed direct dependencies.

## Bounded non-scope

This completeness directive applies to registered school-business semantics required for correctness. It does not automatically activate unrelated optional expansion tracks (room/location booking, student roster/attendance, active AI integration, generic activity-category catalogue, or signed/archive export beyond current reporting authority).

P5/P6 production-readiness work remains separate and production remains `PRE-OPERATIONAL`.

## Closure evidence

- final reviewed parent head: `56863cadbbc83f73fc1cff5ac62b970ac36faa8c`;
- parent PR: #179 (`docs(governance): select full business pilot scope`);
- exact-head parent PR CI: #594 / run `36960980161` — **SUCCESS**;
- normal merge/main: `7b1b29c668b3615c1188d12cc055cd66d03c47e4`;
- authoritative post-merge main CI: #595 / run `36961819309` — **SUCCESS**;
- independent GitHub diff audit: **PASS**;
- unresolved review threads: **0**;
- residual correction/re-entry tasks discovered by closure audit: **none beyond the already registered T08/T23 mandatory re-entry paths**;
- production mutation performed by P0-003: **none**.

P0-003 is formally CLOSED. The complete FULL BUSINESS pilot claim is canonical. P5-010 remains PLANNED until `P3-020`, `P3-031`, and `P4-061` close.
