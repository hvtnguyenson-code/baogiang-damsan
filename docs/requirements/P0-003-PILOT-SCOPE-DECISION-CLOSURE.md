# P0-003 — Pilot Scope Decision Closure

## Status

`IN_REVIEW`

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
- delayed-go-live historical evidence/reconciliation before freeze.

The choice is a pilot-claim decision, not permission to mutate production.

## Exact P5-010 direct dependencies

`P5-010` must be registered with:

- `P0-003`;
- `P1-032`;
- `P2-020`;
- `P2-061`;
- `P3-020`;
- `P4-074`.

All are CLOSED except `P3-020`; therefore P5-010 does not become READY merely because this decision is selected.

## Deferred boundaries preserved

- `P4-060` / `P4-061` remain trigger-gated unless adjusted workload semantics are explicitly required.
- `P3-030` / `P3-031` remain trigger-gated unless public make-up scheduling is explicitly required.
- P5/P6 production-readiness work remains separate.
- Production remains `PRE-OPERATIONAL`.

## Parent closure requirements

P0-003 becomes `CLOSED` only after:

1. this decision branch is reviewed;
2. exact-head PR CI succeeds;
3. parent PR merges normally;
4. authoritative post-merge main CI succeeds;
5. `SYNC-P0-003` records final closure evidence.

Until then P0-003 remains `IN_REVIEW`.
