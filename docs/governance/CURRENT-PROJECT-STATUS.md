# Current Project Status

## Authority

This is the canonical mutable **current product/task status** document for Báo giảng.

Per `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`, this file is intentionally concise. Detailed historical closure evidence belongs in `PRE-PILOT-TASK-REGISTER.md`, requirement/ADR closure records, traceability, PR/CI history and Git history.

Exact current `main`, branch HEAD and divergence must always be read directly from Git/GitHub. SHAs here are evidence for already-established task states, never a self-referential claim that this document contains its own current commit.

**Status snapshot date:** 2026-10-01

## Executive status

- Production state: **PRE-OPERATIONAL**.
- Core build implementation required for the current path is substantially complete.
- `P2-020` PPCT native importer has been implemented and merged, but remains **`MERGED_AWAITING_DOC_SYNC`** until `SYNC-P2-020` is completed.
- Product Owner explicitly selected **`SHARED_VPS`** on 2026-10-01 for `P6-005`.
- Repository formalization of that topology decision is **`IN_REVIEW`** on PR #174; `P6-010` remains non-startable until `P6-005` is formally `CLOSED`.
- No production deployment, production migration, TLS issuance, Nginx mutation, Scheduled Task mutation, ACL mutation or application restart has been authorized by the current documentation work.

## Active / next critical path

### Active in review

`P6-005` — Production VPS topology decision — **`IN_REVIEW`**.

Product Owner authority:

- selected topology: `SHARED_VPS`;
- selected on: 2026-10-01;
- production OS remains Windows Server 2022;
- branch: `docs/p6-005-shared-vps-topology`;
- parent PR: #174 (`docs(production): select shared VPS topology`);
- canonical task start: `main@2d6cb02d4bf9bb4529e0e8eaf83e10d6a67ef043`;
- authority documents: `ADR-053-PRODUCTION-VPS-TOPOLOGY.md` and `P6-005-PRODUCTION-VPS-TOPOLOGY-DECISION-CLOSURE.md`.

`P6-005` is not yet `CLOSED`. `P6-010` MUST NOT start until parent review/merge, authoritative post-merge main CI and `SYNC-P6-005` are complete.

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

Delivered implementation includes:

- dedicated `PPCT_V1` XLSX parser/security profile;
- `/api/ppct-import/inspect`, `/preview`, `/confirm`;
- fail-closed workbook/package/security validation;
- component mapping `PPCT -> CORE` and `CHUYEN_DE -> SPECIALIZED_STUDY` under the closed P2-010 contract;
- whole-workbook atomic DRAFT import, actor-scoped replay and exact-draft CAS update;
- Vietnamese administration UI `/quan-tri/ppct/nhap`;
- integration coverage through XLSX inspect -> preview -> confirm -> database assertions -> identical replay;
- fingerprint mismatch fail-closed behavior.

Mandatory administrative microtask `SYNC-P2-020` remains pending. Therefore dependent major tasks must not consume `P2-020` as `CLOSED` yet.

### Eligible to start

No new major task that depends on `P2-020` or `P6-005` is eligible until the applicable closure sync completes.

### Trigger-gated / decision-blocked

- `P4-060` / `P4-061` — workload adjustment architecture/runtime: **`DEFERRED_WITH_TRIGGER`**.
- `P0-002` — stale PR #11 hosting-portability direction: **`BLOCKED_DECISION`**.
- `P0-003` — CORE vs FULL BUSINESS pilot scope: **`BLOCKED_DECISION`**; required before P5 pilot freeze.
- `P0-004` — GitHub main branch protection/ruleset: **`BLOCKED_DECISION`**.
- `P6-020` — actual Stage 1 passive production evidence: **`DEFERRED_WITH_TRIGGER`** until the exact business/pilot build is an approved production candidate and upstream P6 authority is closed.

## Last formally closed major task

`P2-010` — PPCT real-workbook contract/security audit — **`CLOSED`** by `SYNC-P2-010`.

Canonical closure evidence is recorded in `PRE-PILOT-TASK-REGISTER.md` and `docs/requirements/P2-010-PPCT-REAL-WORKBOOK-CONTRACT-SECURITY-AUDIT.md`.

Key parent evidence:

- parent PR #169;
- parent merge/main `7c48971d32840764c7274e544438ba1bf7aa983e`;
- exact-head PR CI #537 — SUCCESS;
- authoritative post-merge main CI #538 — SUCCESS;
- authoritative workbook `Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx` SHA-256 `9a8cc9b62b02cae5c81163bf7afca12be5f0ee66eb5316fd236294adb1b56692`;
- strictly docs/contract scope with zero production mutation.

Later implementation `P2-020` has merged successfully but is not counted as the last **formally CLOSED** task until `SYNC-P2-020` is merged.

## Implemented foundation relevant to pilot

The canonical repository includes reviewed implementation for:

- identity/session/authentication, capability/scope default-deny authorization and audit;
- retained AcademicYear/calendar/week/segment/interruption/class authority;
- date-effective TeachingAssignment and retained HomeroomAssignment history/control plane/UI;
- retained TimeSlotDefinition and timetable history;
- native Đam San timetable adapter, class/teacher peer reconciliation and selective morning/afternoon carry-forward;
- PPCT component-aware persistence, applicability, weekly routing, independent CORE/SPECIALIZED_STUDY progression and combined curricular projection;
- PPCT real-workbook contract and now merged native PPCT_V1 importer/UI (`P2-020`, closure sync pending);
- operational overlays and make-up foundation;
- SpecialActivity exact-slot/frozen-class/staffing/collision foundation;
- GDĐP/HĐTN programme planning, coordinator/BGH authorization, workbook importers, lifecycle workspace, materialization/attestation and workload projection;
- curricular and special-programme execution evidence;
- proof-based progress/debt/late projection;
- Reporting Statement retained/frozen projection;
- Business Configuration control plane and operational-start authority/UI;
- school-wide effective teaching schedule read model and Vietnamese Teacher Workspace;
- hardened Windows production deployment control plane/runbooks and evidence tooling.

Detailed closure evidence for each domain remains in `PRE-PILOT-TASK-REGISTER.md`, ADRs, requirements, PR/CI and Git history.

## Production VPS topology decision

### Selected authority

The Product Owner explicitly selected **`SHARED_VPS`** on 2026-10-01.

Target host class:

- existing Windows Server 2022 VPS currently hosting DamSanV5 / Quản lí nội trú;
- 6 logical processors;
- 16 GB RAM;
- system drive approximately 49.9 GB total with 31.07 GB free at the read-only audit time.

Sanitized capacity evidence is recorded in `ADR-053-PRODUCTION-VPS-TOPOLOGY.md`. The operator-held source audit package is not committed.

The audit also retained Nginx/PostgreSQL evidence for the 2026-09-30 19:00–20:00 high-load window. Historical PerfMon CPU/RAM capture did **not** exist for that hour, so the repository must not claim historical peak CPU/RAM saturation values that were not measured.

### Shared-host isolation invariants

`SHARED_VPS` means host sharing only. Báo giảng must retain separate authority for at least:

- application root;
- Node/API runtime port;
- Scheduled Task/startup authority;
- environment/secrets boundary;
- logs and backups;
- PostgreSQL database;
- PostgreSQL application role;
- Nginx managed server-block/include authority;
- domain, certificate, renewal and reload lifecycle.

DamSanV5 / Quản lí nội trú roots, processes, Scheduled Tasks/services, database resources, Nginx/TLS configuration and monitoring state are protected neighbours and must not be mutated implicitly.

### Remaining topology gate

The Product Owner decision is made, but repository closure is not complete:

1. PR #174 must pass exact-head review/CI and merge normally;
2. authoritative post-merge main CI must succeed;
3. `SYNC-P6-005` must record closure evidence;
4. only then may `P6-010` become `READY` and define/verify the shared-host HTTP-01/TLS authority.

The capacity audit supporting `SHARED_VPS` is decision evidence, not a substitute for later registered production inventory/preflight evidence.

## Critical pre-pilot gaps

The project is **NOT READY FOR TEACHER PILOT YET**. Remaining registered gaps include:

1. `SYNC-P2-020` must formally close the already-merged PPCT native importer before dependent major work consumes it.
2. `P0-003` must select CORE vs FULL BUSINESS pilot scope before P5 pilot freeze.
3. `P3-010` / `P3-020` pre-operational historical execution architecture/runtime remain registered; they cannot start until their dependencies, including P2-020, are CLOSED.
4. PWA production baseline (`P5-020`) remains absent.
5. Dedicated Báo giảng Telegram integration (`P5-030`) remains absent.
6. `P6-005` selected topology must complete formal repository closure.
7. `P6-010` shared-host first-certificate HTTP-01/Nginx/TLS authority remains incomplete and blocked by P6-005 closure.
8. Actual production Stage 1 passive discovery/preflight (`P6-020`) remains trigger-gated and has not been executed as official deployment evidence.
9. Production bootstrap/first controlled deploy (`P6-030`) has not occurred.
10. Teacher pilot go-live verification (`P6-050`) has not occurred.
11. Workload adjustment rules P4-060/P4-061 remain trigger-gated unless official pilot/reporting scope requires them.

## Production state

Production remains strictly **PRE-OPERATIONAL**.

The repository has not deployed `main@2d6cb02d4bf9bb4529e0e8eaf83e10d6a67ef043` or the P2-020 importer to production. The current P6-005 branch is documentation/governance only and has performed no VPS mutation.

No production operational-start policy value has been configured or deployed through this task. No production database migration, TLS issuance, Nginx reload/configuration change, Scheduled Task creation/change, ACL mutation, deployment or application restart is authorized by P6-005.

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

Applicable accepted architecture/decision authorities include ADR-044 through ADR-053 as registered by their parent tasks. Exact task/closure state always follows the canonical task register and this current-status snapshot; exact Git state always follows Git/GitHub directly.
