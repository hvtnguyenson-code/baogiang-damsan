# ADR-054 — First Operational Pilot Scope

- **Status:** Accepted; `P0-003` CLOSED by `SYNC-P0-003`
- **Date:** 2026-10-02
- **Task:** `P0-003` Pilot scope decision: CORE vs FULL BUSINESS
- **Decision:** `FULL BUSINESS PILOT`

## Context

The pre-pilot product baseline requires an explicit Product Owner decision between:

- `CORE PILOT`: normal curricular PPCT/TKB/execution/reporting plus go-live/PWA/Telegram, while GDĐP/HĐTN official workload remains outside the first operational claim; or
- `FULL BUSINESS PILOT`: the first operational pilot includes the full registered business claim for normal curriculum plus GDĐP, HĐTN-HN, date-effective homeroom resolution, exact multi-teacher special-program workload and official combined reporting.

On 2026-10-02 the Product Owner explicitly selected `FULL BUSINESS PILOT` because the intended first operational use is the complete school workflow, not a reduced pilot that postpones GDĐP/HĐTN-HN.

## Decision

The first operational pilot claim is `FULL BUSINESS PILOT`.

The pilot freeze must therefore cover, at minimum:

1. ordinary curricular PPCT/TKB/import/execution/progress/debt/late/reporting;
2. delayed-go-live / operational-start administration and retained pre-operational history handling;
3. the school-wide effective Teacher Workspace;
4. GDĐP programme import/planning/publish/materialization/execution/workload/reporting;
5. HĐTN-HN CLASS / GRADE / SCHOOL_WIDE import/planning/publish/materialization/execution/workload/reporting;
6. date-effective homeroom resolution for HĐTN CLASS;
7. exact multi-teacher slot staffing and anti-double-counting workload semantics;
8. official combined reporting across the accepted ordinary-curricular and special-programme business domains;
9. public make-up scheduling/runtime for real incomplete teaching obligations, preserving original PPCT obligation provenance;
10. configurable adjusted-workload semantics required by real school workload calculations, including reduction / percentage adjustment / override with retained effectivity and frozen-report provenance;
11. PWA production baseline and dedicated Báo giảng Telegram lifecycle before teacher pilot go-live;
12. the existing P6 production-readiness gates before any production mutation.

## Exact P5-010 dependency set

When P0-003 is formally CLOSED, `P5-010` must carry these direct dependencies:

- `P0-003` — this pilot-scope decision;
- `P1-032` — operational-start administration UI;
- `P2-020` — PPCT native importer;
- `P2-061` — school-wide effective teaching schedule / Teacher Workspace;
- `P3-020` — pre-operational historical evidence ingestion/reconciliation runtime;
- `P3-031` — public make-up scheduling runtime, after P3-030 architecture closes;
- `P4-061` — adjusted-workload implementation, after P4-060 architecture closes;
- `P4-074` — GDĐP/HĐTN-HN special-programme import lifecycle and E2E closure.

This dependency set is intentionally bounded. It references completed aggregate authorities instead of duplicating every transitive dependency.

The Product Owner subsequently clarified on 2026-10-02 that the first operational system must be functionally complete wherever an omitted registered business rule could make real operation or official figures incorrect. This clarification **fires the registered re-entry triggers** for T08 public make-up scheduling and T23 adjusted workload.

Accordingly:

- `P3-030` changes from `DEFERRED_WITH_TRIGGER` to `PLANNED` because its trigger fired, but it still waits for `P3-010` to close;
- `P3-031` changes to `PLANNED` behind `P3-030`;
- `P4-060` changes from `DEFERRED_WITH_TRIGGER` to `READY` because its trigger fired and `P1-020` is already CLOSED;
- `P4-061` changes to `PLANNED` behind `P4-060` (with `P1-021` already CLOSED).

At decision time, the direct P5-010 set therefore has unresolved work in `P3-020`, `P3-031`, and `P4-061`; selecting FULL BUSINESS does not make `P5-010` immediately READY.

## Explicit non-effects

FULL BUSINESS remains bounded to the registered school business model. It does **not** automatically pull in unrelated optional expansion tracks such as room-booking/location authority, student roster/attendance, active AI integration, a generic activity-category catalogue, or signed/archive export beyond the current reporting authority unless their own documented triggers later fire.

The decision also does not authorize VPS access, deployment, TLS issuance, Nginx mutation/reload, database migration, Scheduled Task mutation, ACL mutation or application restart. Production remains `PRE-OPERATIONAL`.

## Consequences

1. P5-010 must freeze a **full cross-domain business claim**; it may not silently omit GDĐP or HĐTN-HN while labelling the pilot FULL BUSINESS.
2. P4-074 is accepted as the aggregate special-programme implementation authority for this decision.
3. P2-061 is mandatory because teacher pilot readiness includes the reviewed school-wide effective schedule/Teacher Workspace.
4. P3-020 is mandatory because production go-live occurs after the school year has already started and the accepted operational-start model delegates controlled pre-operational evidence ingestion/reconciliation to P3.
5. P3-030/P3-031 are mandatory because real incomplete teaching obligations must have a public make-up scheduling lifecycle without inventing new PPCT consumption.
6. P4-060/P4-061 are mandatory because official real-world workload figures must not ignore configured reduction / percentage / override rules.
7. Production readiness remains separately gated by P5-020, P5-030 and P6.

No runtime or production mutation is authorized by this ADR.
