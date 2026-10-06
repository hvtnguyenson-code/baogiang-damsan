# Current Project Status

## Authority

This is the canonical mutable **current product/task status** document for Báo giảng.

Per `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`, this file is intentionally concise. Detailed historical closure evidence belongs in `PRE-PILOT-TASK-REGISTER.md`, requirement/ADR closure records, traceability, PR/CI history and Git history.

Exact current `main`, branch HEAD and divergence must always be read directly from Git/GitHub. SHAs here are evidence for already-established task states, never a self-referential claim that this document contains its own current commit.

**Status snapshot date:** 2026-10-06

## Executive status

- Production state: **PRE-OPERATIONAL**.
- Core build implementation required for the current path is substantially complete.
- `P2-020` PPCT native importer is **`CLOSED` by `SYNC-P2-020`**; PR #173, exact-head CI #549, merge `2d6cb02d4bf9bb4529e0e8eaf83e10d6a67ef043` and post-merge CI #550 are the parent evidence.
- `P6-005` Production VPS topology decision is **`CLOSED` by `SYNC-P6-005`**.
- Canonical production topology: **`SHARED_VPS`** on the existing Windows Server 2022 host, with strict protected-neighbour isolation.
- `P6-010` Pre-deploy TLS/HTTP-01 authority is **`CLOSED` by `SYNC-P6-010`**; parent PR #176 and authoritative post-merge CI #578 are SUCCESS, with zero production/VPS mutation.
- No production deployment, production migration, TLS issuance, Nginx mutation, Scheduled Task mutation, ACL mutation or application restart has been performed by P6-005 or its closure sync.

## Last formally closed major task

`P5-030A` — Dedicated Telegram integration architecture closure — **`CLOSED`** by `SYNC-P5-030A`.

Parent closure evidence:

- parent branch: `docs/p5-030a-telegram-architecture`;
- canonical parent start: `main@a8f49f7048b879cc8ad01627643c33a2429f4f05`;
- architecture commit: `b47670ab3be6b2804a8e569a37db955d6806b061`;
- Review Correction 001: `38310867286fa8b288ee12b1f3a1fc75eb40d8ff`;
- Review Correction 002: `bbe93c25e7e2090d9b6b5ca97b7bcef53dd90c9b`;
- final reviewed parent head: `bbe93c25e7e2090d9b6b5ca97b7bcef53dd90c9b`;
- parent PR #198;
- exact-head parent CI #648 / run `37467652218` — **SUCCESS**;
- independent exact-code/evidence review: **PASS** after bounded Review Corrections 001–002; zero unresolved review threads;
- normal parent merge/main: `9ef04c4e8383b77049d2947bb6999a17505698bd`;
- authoritative parent post-merge CI #649 / run `37469729094` (attempt 1) — **SUCCESS**;
- delivered dedicated Telegram integration architecture closure (ADR-058 Accepted, 12 invariants F1–F12, technical env/config boundary, webhook trust, bounded UUID v4 requestKey, atomic send claim compare-and-set, 20-test acceptance matrix, dedicated bot isolation);
- docs-only scope; no runtime/schema/migration/API/UI/config/CI/deploy/VPS mutation; production remains PRE-OPERATIONAL;
- no residual P5-030A correction/re-entry task emerged from review or post-merge CI.

`P5-030A` is **`CLOSED`** by `SYNC-P5-030A`. `P5-030` is **`IN_REVIEW`** on branch `feat/p5-030-telegram-integration`. `P5-040` is **`PLANNED`** (depends on `P5-020` and `P5-030`). `P6-020` remains **`DEFERRED_WITH_TRIGGER`** until `P5-040` is closed and the exact pilot build is explicitly approved by the Product Owner as a production deployment candidate.

## Active / next critical path

### In Review

- `P5-030` — dedicated Báo giảng Telegram integration: **`IN_REVIEW`** on branch `feat/p5-030-telegram-integration` (all registered dependencies `P5-010` and `P5-030A` are CLOSED).

### Ready

- None.

### Planned behind open dependencies

- `P5-040` — pre-deploy full-repository consistency audit: **`PLANNED`** (depends on `P5-020`, `P5-030`).
- `P6-030` — production bootstrap + first controlled deploy: **`PLANNED`** (depends on `P6-020`).
- `P6-040` — TLS monitor multi-certificate refactor: **`PLANNED`** (depends on `P6-030`).
- `P6-050` — teacher pilot go-live verification: **`PLANNED`** (depends on `P5-020`, `P5-030`, `P6-030`).

### Trigger-gated / decision-blocked
- `P0-002` — stale PR #11 hosting-portability direction: **`BLOCKED_DECISION`**.
- `P0-004` — GitHub main branch protection/ruleset: **`BLOCKED_DECISION`**.
- `P6-020` — actual Stage 1 passive production evidence: **`DEFERRED_WITH_TRIGGER`** until `P5-040` is closed and the exact business/pilot build is explicitly approved by the Product Owner as a production candidate.

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

Canonical `main` contains reviewed implementation for identity/auth, authorization/audit, retained calendar and teaching responsibility history, HomeroomAssignment, timetable/native TKB ingestion, component-aware PPCT, operational overlays, SpecialActivity, GDĐP/HĐTN planning/import/lifecycle/workload, execution evidence, progress/debt/late, Reporting Statement, Business Configuration/operational-start, school-wide effective teaching schedule, P4-061 official workload/adjustment runtime, the P5-010 FULL BUSINESS cross-domain regression/evidence freeze, the P5-020 installable PWA production baseline and the hardened Windows production deployment control plane.

`P2-020` additionally delivers the native PPCT_V1 workbook parser/importer and Vietnamese administration UI and is formally CLOSED by `SYNC-P2-020`.

Detailed domain closure evidence remains in `PRE-PILOT-TASK-REGISTER.md`, ADRs, requirements, PR/CI and Git history.

## Critical pre-pilot gaps

The project is **NOT READY FOR TEACHER PILOT YET**. Remaining registered gaps include:

1. `P3-030`, `P3-031`, `P4-060`, `P4-061` and `P5-010` are CLOSED by their non-recursive sync closures; the complete FULL BUSINESS cross-domain freeze is established.
2. Public make-up scheduling T08 and adjusted-workload T23 re-entry paths are fulfilled by the closed P3-031 and P4-061 chains and were re-verified in P5-010.
3. PWA production baseline (`P5-020`) is **`CLOSED` by `SYNC-P5-020`** after PR #195, exact-head CI #644 SUCCESS, merge/main `fa54eaea5c2055517428d18559f652001999d0e4` and authoritative post-merge CI #645 SUCCESS.
4. Dedicated Telegram integration architecture closure (`P5-030A`) is **`CLOSED` by `SYNC-P5-030A`** (ADR-058 Accepted); implementation (`P5-030`) is **`IN_REVIEW`** on branch `feat/p5-030-telegram-integration`.
5. Pre-deploy full-repository consistency audit (`P5-040`) is registered and **`PLANNED`** as a mandatory prerequisite before VPS deployment.
6. Official production Stage 1 passive discovery/preflight (`P6-020`) remains trigger-gated behind `P5-040` closure and explicit Product Owner approval; P5-010 closure alone does not authorize production access.
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

Applicable accepted architecture/decision authorities include ADR-044 through ADR-058 as registered by their parent tasks. Exact task/closure state follows the canonical task register and this current-status snapshot; exact Git state follows Git/GitHub directly.
