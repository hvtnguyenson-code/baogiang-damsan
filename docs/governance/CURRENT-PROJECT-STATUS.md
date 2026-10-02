# Current Project Status

## Authority

This is the canonical mutable **current product/task status** document for Báo giảng.

Per `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`, this file is intentionally concise. Detailed historical closure evidence belongs in `PRE-PILOT-TASK-REGISTER.md`, requirement/ADR closure records, traceability, PR/CI history and Git history.

Exact current `main`, branch HEAD and divergence must always be read directly from Git/GitHub. SHAs here are evidence for already-established task states, never a self-referential claim that this document contains its own current commit.

**Status snapshot date:** 2026-10-01

## Executive status

- Production state: **PRE-OPERATIONAL**.
- Core build implementation required for the current path is substantially complete.
- `P2-020` PPCT native importer has been implemented and merged, but remains **`MERGED_AWAITING_DOC_SYNC`** until its separate `SYNC-P2-020` is completed.
- `P6-005` Production VPS topology decision is **`CLOSED` by `SYNC-P6-005`**.
- Canonical production topology: **`SHARED_VPS`** on the existing Windows Server 2022 host, with strict protected-neighbour isolation.
- `P6-010` Pre-deploy TLS/HTTP-01 authority is **`IN_REVIEW`** on PR #176; exact-head CI #569 is SUCCESS and no production/VPS mutation has occurred.
- No production deployment, production migration, TLS issuance, Nginx mutation, Scheduled Task mutation, ACL mutation or application restart has been performed by P6-005 or its closure sync.

## Last formally closed major task

`P6-005` — Production VPS topology decision — **`CLOSED`** by `SYNC-P6-005`.

Closure evidence:

- selected authority: `SHARED_VPS`;
- selected by Product Owner: 2026-10-01;
- parent branch: `docs/p6-005-shared-vps-topology`;
- canonical parent start: `main@2d6cb02d4bf9bb4529e0e8eaf83e10d6a67ef043`;
- final reviewed parent head: `c9a56a7a3fff613f823c3540463d8bcfaa6442ee`;
- parent PR: #174 (`docs(production): select shared VPS topology`);
- exact-head parent PR CI: #557 / run `36877744658` — **SUCCESS**;
- normal merge/main: `5de8ba3b862405c7fcc215021bb5d2f3bb0122f7`;
- authoritative post-merge main CI: #558 / run `36880358944` — **SUCCESS**;
- parent diff: 8 files, all under `docs/**`;
- zero runtime, schema, migration, workflow, deploy-script or production-state mutation;
- no residual correction/re-entry task emerged from review or CI.

Accepted decision authority is recorded in `ADR-053-PRODUCTION-VPS-TOPOLOGY.md` and `P6-005-PRODUCTION-VPS-TOPOLOGY-DECISION-CLOSURE.md`.

## Active / next critical path

### Ready

`P6-010` — Pre-deploy TLS/HTTP-01 authority — **`IN_REVIEW`**.

Required boundary:

- topology is `SHARED_VPS`;
- use shared-host/protected-neighbour semantics;
- preserve separate Báo giảng application root, runtime port, Scheduled Task/startup authority, environment/secrets boundary, logs/backups, PostgreSQL database/role, Nginx managed include/server block, domain, certificate and renewal lifecycle;
- do not mutate DamSanV5 / Quản lí nội trú neighbour resources implicitly;
- `READY` does not authorize VPS mutation; P6-010 itself remains a separately reviewed repository task.

### Merged awaiting mandatory closure sync

`P2-020` — PPCT native importer implementation — **`MERGED_AWAITING_DOC_SYNC`**.

Established parent evidence:

- branch: `feat/ppct-native-importer-020`;
- final reviewed parent head: `dea50a938decf9bc5e4ca1dbd03ef1a451f91fac`;
- parent PR: #173 (`feat(ppct): implement native workbook importer`);
- exact-head parent PR CI: #549 — **SUCCESS**;
- normal merge/main: `2d6cb02d4bf9bb4529e0e8eaf83e10d6a67ef043`;
- authoritative post-merge main CI: #550 — **SUCCESS**;
- no schema/migration and no production mutation.

Mandatory administrative microtask `SYNC-P2-020` remains pending. Therefore dependent major tasks must not consume `P2-020` as `CLOSED` yet.

### Trigger-gated / decision-blocked

- `P4-060` / `P4-061` — workload adjustment architecture/runtime: **`DEFERRED_WITH_TRIGGER`**.
- `P0-002` — stale PR #11 hosting-portability direction: **`BLOCKED_DECISION`**.
- `P0-003` — CORE vs FULL BUSINESS pilot scope: **`BLOCKED_DECISION`**; required before P5 pilot freeze.
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

`P2-020` additionally delivers the native PPCT_V1 workbook parser/importer and Vietnamese administration UI, but its administrative closure sync remains pending.

Detailed domain closure evidence remains in `PRE-PILOT-TASK-REGISTER.md`, ADRs, requirements, PR/CI and Git history.

## Critical pre-pilot gaps

The project is **NOT READY FOR TEACHER PILOT YET**. Remaining registered gaps include:

1. `SYNC-P2-020` must formally close the already-merged PPCT native importer before dependent major work consumes it.
2. `P0-003` must select CORE vs FULL BUSINESS pilot scope before P5 pilot freeze.
3. `P3-010` / `P3-020` pre-operational historical execution architecture/runtime remain registered and depend on P2-020 closure.
4. PWA production baseline (`P5-020`) remains absent.
5. Dedicated Báo giảng Telegram integration (`P5-030`) remains absent.
6. `P6-010` shared-host first-certificate HTTP-01/Nginx/TLS authority is READY but not implemented.
7. Official production Stage 1 passive discovery/preflight (`P6-020`) remains trigger-gated and has not been executed.
8. Production bootstrap/first controlled deploy (`P6-030`) has not occurred.
9. Teacher pilot go-live verification (`P6-050`) has not occurred.
10. Workload adjustment P4-060/P4-061 remains trigger-gated unless the selected official pilot/reporting scope requires it.

## Production state

Production remains strictly **PRE-OPERATIONAL**.

Neither PR #174 nor `SYNC-P6-005` authorized or performed VPS access/mutation, production database migration, TLS issuance, Nginx reload/configuration change, Scheduled Task creation/change, ACL mutation, deployment or application restart.

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
