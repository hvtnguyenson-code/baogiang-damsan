# Current Project Status

## Authority

This is the canonical mutable **current product/task status** document for Báo giảng.

Per `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`, this file is intentionally concise. Detailed historical closure evidence belongs in `PRE-PILOT-TASK-REGISTER.md`, requirement/ADR closure records, traceability, PR/CI history and Git history.

Exact current `main`, branch HEAD and divergence must always be read directly from Git/GitHub. SHAs here are evidence for already-established task states, never a self-referential claim that this document contains its own current commit.

**Status snapshot date:** 2026-10-12

## Executive status

- Production state: **PRE-OPERATIONAL**.
- Core build implementation required for the current path is substantially complete.
- `P2-020` PPCT native importer is **`CLOSED` by `SYNC-P2-020`**; PR #173, exact-head CI #549, merge `2d6cb02d4bf9bb4529e0e8eaf83e10d6a67ef043` and post-merge CI #550 are the parent evidence.
- `P6-005` Production VPS topology decision is **`CLOSED` by `SYNC-P6-005`**.
- Canonical production topology: **`SHARED_VPS`** on the existing Windows Server 2022 host, with strict protected-neighbour isolation.
- `P6-010` Pre-deploy TLS/HTTP-01 authority is **`CLOSED` by `SYNC-P6-010`**; parent PR #176 and authoritative post-merge CI #578 are SUCCESS, with zero production/VPS mutation.
- No production deployment, production migration, TLS issuance, Nginx mutation, Scheduled Task mutation, ACL mutation or application restart has been performed by P6-005 or its closure sync.

## 2026-10-12 final audit and P6-020 exact candidate decision

Last formally CLOSED major task: `P5-040` (PR #202, exact parent merge `1282f24a5300da88c155c7dc5523644d14bd53c8`, post-merge CI #658 SUCCESS, closed by `SYNC-P5-040`). `P5-030` Telegram and `P5-020` PWA also remain formally CLOSED. Historical evidence is retained in the canonical register.

Subsequent audit results: AUD-02B PR #207 merged at `8e32d392cebe378f39b232c396408026c3bf7525`; AUD-05 PR #208 merged at `6cea05ab1b952994ceed3dbb5e3b6f320593a7d6` with independently verified post-merge main CI run `38203229334` SUCCESS (both jobs); HAR-01 test-harness suspicion **REFUTED / NO ACTION** after read-only independent review; AUD-03 workload suspicion REFUTED under ADR-057. These follow-up audit labels are not substitutes for registered P0-P6 major-task closure protocol.

Final Pre-Pilot Readiness Audit (2026-10-12): **CONDITIONAL GO** for preparation and passive production preflight; **NO-GO** for actual deployment or teacher pilot until P6 gates and live acceptance evidence are complete.

Product Owner explicitly approved `main@6cea05ab1b952994ceed3dbb5e3b6f320593a7d6` as the **exact P6-020 readonly discovery candidate** on 2026-10-12. Authorized scope: PASS 1 passive neighbour discovery followed only after review by PASS 2 exact readonly preflight. This is not authorization to change VPS resources, install, deploy, migrate database, mutate/reload Nginx, issue TLS, edit Scheduled Tasks, or change the protected Nội trú application.

Preliminary Desktop Commander read-only metadata: Windows Server 2022, 6 logical CPUs, 16 GiB RAM; DamSanV5 protected Scheduled Task running on Node port 3000, Nginx port 80/443, PostgreSQL 16 loopback port 5432, PostgreSQL 17 loopback port 5433, no observed port-3100 listener. **Effective Nginx -p prefix and -c configuration NOT_VERIFIED** from running process arguments. This reconnaissance is not a formal PASS 1/PASS 2 result. Evidence record: `docs/operations/P6-020-PRELIMINARY-READONLY-EVIDENCE-2026-10-12.md`.

## Active / next critical path

### In Progress

- `P6-020` — **IN_PROGRESS: preliminary passive host reconnaissance only**; formal PASS 1/PASS 2 NOT EXECUTED. Exact deployment candidate approved for read-only scope above.

### In Review

- None.

### Ready

- None.

### Planned behind open dependencies

- `P6-030` — production bootstrap + first controlled deploy: **`PLANNED`** (depends on `P6-020`).
- `P6-040` — TLS monitor multi-certificate refactor: **`PLANNED`** (depends on `P6-030`).
- `P6-050` — teacher pilot go-live verification: **`PLANNED`** (depends on `P5-020`, `P5-030`, `P6-030`).

### Trigger-gated / decision-blocked
- `P0-002` — stale PR #11 hosting-portability direction: **`BLOCKED_DECISION`**.
- `P0-004` — GitHub main branch protection/ruleset: **`BLOCKED_DECISION`**.
- `P6-020` — trigger fired 2026-10-12; now IN_PROGRESS for read-only evidence only. Formal PASS 1/PASS 2 outstanding.

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
4. Dedicated Telegram integration (`P5-030`) is **`CLOSED` by `SYNC-P5-030`** after PR #200, exact-head CI #653 SUCCESS, merge/main `3bcd0d7fc1ffd0eedb8f2186271e2596a1581e5a` và authoritative post-merge CI #654 (run `37576373644`) SUCCESS.
5. Pre-deploy full-repository consistency audit (`P5-040`) is **`CLOSED` by `SYNC-P5-040`** (PR #202; exact-head CI #657 SUCCESS; merge/main `1282f24a5300da88c155c7dc5523644d14bd53c8`; authoritative post-merge CI #658 SUCCESS; remediating confirmed findings CX-01..CX-06 across Corrections 001..009; independent GitHub review PASS).
6. P6-020 exact-candidate readonly approval is recorded, but formal PASS 1/PASS 2, reviewer acceptance, and Nginx prefix/config resolution are still mandatory. No deploy or production mutation approval.
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
