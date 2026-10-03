# Current Project Status

## Authority

This is the canonical mutable **current product/task status** document for Báo giảng.

Per `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`, this file is intentionally concise. Detailed historical closure evidence belongs in `PRE-PILOT-TASK-REGISTER.md`, requirement/ADR closure records, traceability, PR/CI history and Git history.

Exact current `main`, branch HEAD and divergence must always be read directly from Git/GitHub. SHAs here are evidence for already-established task states, never a self-referential claim that this document contains its own current commit.

**Status snapshot date:** 2026-10-01

## Executive status

- Production state: **PRE-OPERATIONAL**.
- Core build implementation required for the current path is substantially complete.
- `P2-020` PPCT native importer is **`CLOSED` by `SYNC-P2-020`**; PR #173, exact-head CI #549, merge `2d6cb02d4bf9bb4529e0e8eaf83e10d6a67ef043` and post-merge CI #550 are the parent evidence.
- `P6-005` Production VPS topology decision is **`CLOSED` by `SYNC-P6-005`**.
- Canonical production topology: **`SHARED_VPS`** on the existing Windows Server 2022 host, with strict protected-neighbour isolation.
- `P6-010` Pre-deploy TLS/HTTP-01 authority is **`CLOSED` by `SYNC-P6-010`**; parent PR #176 and authoritative post-merge CI #578 are SUCCESS, with zero production/VPS mutation.
- No production deployment, production migration, TLS issuance, Nginx mutation, Scheduled Task mutation, ACL mutation or application restart has been performed by P6-005 or its closure sync.

## Last formally closed major task

`P3-020` — Pre-operational history ingestion/reconciliation runtime — **`CLOSED`** by `SYNC-P3-020`.

Closure evidence:

- parent branch: `feat/p3-020-preop-history-runtime`;
- canonical parent start: `main@2ffcb9db61017a179c3f26662130f05d341514fa`;
- final reviewed parent head: `e188a421fb1be6e79e3a1816fef4969eb55e916e`;
- parent PR: #183 (`feat(history): implement pre-operational teaching ingestion`);
- exact-head parent PR CI: #612 / run `37025720391` — **SUCCESS**;
- normal merge/main: `c20e6950327d79844117c18416b904e23436df1e`;
- authoritative post-merge main CI: #613 / run `37028176259` — **SUCCESS**;
- parent diff: 26 files, +3605 / -16;
- independent GitHub diff audit: **PASS**; zero unresolved review threads;
- no residual correction/re-entry task emerged from P3-020 closure audit;
- no production/VPS/deploy mutation; production remains PRE-OPERATIONAL.

P3-020 is formally closed. P3-030 is now IN_REVIEW on `docs/p3-030-public-makeup-architecture`; P4-060 remains READY; P3-031 remains PLANNED behind P3-030.

## Active / next critical path

### In review

- `P3-030` — public make-up scheduling architecture — **`IN_REVIEW`** on `docs/p3-030-public-makeup-architecture`; canonical start `main@5c0faa7f945bd636abf9a40ecdc1d0cf8bc41cbe`; ADR-056 + P3-030 requirement lock proven-debt-only prospective scheduling, exact authority/collision/correction boundaries.

### Ready

- `P4-060` — workload adjustment architecture — **`READY`**; FULL BUSINESS completeness directive fired T23 and `P1-020` is CLOSED.

### Planned behind open dependencies

- `P3-031` — public make-up scheduling runtime — **`PLANNED`** behind P3-030.
- `P4-061` — workload adjustment implementation — **`PLANNED`** behind P4-060.

### Trigger-gated / decision-blocked
- `P0-002` — stale PR #11 hosting-portability direction: **`BLOCKED_DECISION`**.
- `P0-004` — GitHub main branch protection/ruleset: **`BLOCKED_DECISION`**.
- `P6-020` — actual Stage 1 passive production evidence: **`DEFERRED_WITH_TRIGGER`** until the exact business/pilot build is an approved production candidate and upstream P6 authority is closed.

## Production VPS topology

The Product Owner selected **`SHARED_VPS`** on 2026-10-01 and P6-005 is now formally closed.

Target host evidence used for the decision:

- Windows Server 2022;
- 6 logical processors;
- 16 GB RAM;
- system drive approximately 49.9 GB total with 31.07 GB free at the read-only audit time;
- retained Nginx/PostgreSQL evidence for the 2026-09-30 19:00–20:00 high-load window;
- no historical PerfMon CPU/RAM capture existed for that hour, so no unmeasured historical saturation claim is made.

`SHARED_VPS` means host sharing only. Báo giảng retains separate authority for application/runtime, database/role, secrets, logs/backups, Nginx managed configuration and TLS lifecycle. DamSanV5 / Quản lí nội trú remain protected neighbours.

The capacity audit is decision evidence, not production-readiness evidence. Official Stage 1 passive discovery/preflight remains separately registered under P6-020.

## Implemented foundation relevant to pilot

Canonical `main` contains reviewed implementation for identity/auth, authorization/audit, retained calendar and teaching responsibility history, HomeroomAssignment, timetable/native TKB ingestion, component-aware PPCT, operational overlays, SpecialActivity, GDĐP/HĐTN planning/import/lifecycle/workload, execution evidence, progress/debt/late, Reporting Statement, Business Configuration/operational-start, school-wide effective teaching schedule and the hardened Windows production deployment control plane.

`P2-020` additionally delivers the native PPCT_V1 workbook parser/importer and Vietnamese administration UI and is formally CLOSED by `SYNC-P2-020`.

Detailed domain closure evidence remains in `PRE-PILOT-TASK-REGISTER.md`, ADRs, requirements, PR/CI and Git history.

## Critical pre-pilot gaps

The project is **NOT READY FOR TEACHER PILOT YET**. Remaining registered gaps include:

1. `P3-030` is IN_REVIEW and `P4-060` remains READY; `P3-020` is CLOSED by `SYNC-P3-020`.
2. `P3-031` and `P4-061` remain unresolved direct dependencies of the complete FULL BUSINESS `P5-010` freeze.
3. Public make-up scheduling T08 and adjusted-workload T23 are mandatory re-entry paths; their triggers fired on 2026-10-02.
4. PWA production baseline (`P5-020`) remains absent.
5. Dedicated Báo giảng Telegram integration (`P5-030`) remains absent.
6. Official production Stage 1 passive discovery/preflight (`P6-020`) remains trigger-gated and has not been executed.
7. Production bootstrap/first controlled deploy (`P6-030`) has not occurred.
8. Teacher pilot go-live verification (`P6-050`) has not occurred.

## Production state

Production remains strictly **PRE-OPERATIONAL**.

Neither P6-005 nor P6-010 (including PR #176 and their closure syncs) authorized or performed VPS access/mutation, production database migration, TLS issuance, Nginx production reload/configuration change, Scheduled Task creation/change, ACL mutation, deployment or application restart.

## Protected external-system boundary

Pre-pilot work must not modify or infer ownership over protected neighbour resources unless a separately authorized exact-scope infrastructure task permits it:

- `D:\Quan_li_noi_tru`;
- `D:\Edu_DamSan`;
- DamSanV5 / Quản lí nội trú application processes;
- their databases/roles;
- their Scheduled Tasks/services;
- their application configuration;
- current Nội trú Nginx/TLS/monitoring state.

## Current governance authority

Current canonical authority surfaces:

1. `PRE-PILOT-TASK-REGISTER.md`;
2. this `CURRENT-PROJECT-STATUS.md`;
3. `PRE-PILOT-TRACEABILITY-MATRIX.md`;
4. `PRE-PILOT-PRODUCT-BASELINE.md`;
5. `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`.

Applicable accepted architecture/decision authorities include ADR-044 through ADR-053 as registered by their parent tasks. Exact task/closure state follows the canonical task register and this current-status snapshot; exact Git state follows Git/GitHub directly.
