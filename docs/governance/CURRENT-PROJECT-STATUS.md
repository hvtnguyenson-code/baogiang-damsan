# Current Project Status

## Authority

This is the canonical mutable **current product/task status** document for Báo giảng.

Per `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`, this file is intentionally concise. Detailed historical closure evidence belongs in `PRE-PILOT-TASK-REGISTER.md`, requirement/ADR closure records, traceability, PR/CI history and Git history.

Exact current `main`, branch HEAD and divergence must always be read directly from Git/GitHub. SHAs here are evidence for already-established task states, never a self-referential claim that this document contains its own current commit.

**Status snapshot date:** 2026-10-07

## Executive status

- Production state: **PRE-OPERATIONAL**.
- Core build implementation required for the current path is substantially complete.
- `P2-020` PPCT native importer is **`CLOSED` by `SYNC-P2-020`**; PR #173, exact-head CI #549, merge `2d6cb02d4bf9bb4529e0e8eaf83e10d6a67ef043` and post-merge CI #550 are the parent evidence.
- `P6-005` Production VPS topology decision is **`CLOSED` by `SYNC-P6-005`**.
- Canonical production topology: **`SHARED_VPS`** on the existing Windows Server 2022 host, with strict protected-neighbour isolation.
- `P6-010` Pre-deploy TLS/HTTP-01 authority is **`CLOSED` by `SYNC-P6-010`**; parent PR #176 and authoritative post-merge CI #578 are SUCCESS, with zero production/VPS mutation.
- No production deployment, production migration, TLS issuance, Nginx mutation, Scheduled Task mutation, ACL mutation or application restart has been performed by P6-005 or its closure sync.

## Last formally closed major task

`P5-030` — Dedicated Báo giảng Telegram integration — **`CLOSED`** by `SYNC-P5-030`.

Parent closure evidence:

- parent branch: `feat/p5-030-telegram-integration`;
- canonical parent start: `main@6cee4babf8779ff12c7cea51be9a8be315ed42cf`;
- final reviewed parent head: `f1b5dd9790b6b685170f57b59a5c8655e40fe064`;
- Review Correction 001: đã hấp thụ vào parent branch trước merge;
- Review Correction 002: đã hấp thụ vào parent branch trước merge;
- CI Correction 001: commit `f1b5dd9790b6b685170f57b59a5c8655e40fe064` (`test(auth): update AppConfig fixture for Telegram`);
- parent PR #200 (`feat(telegram): implement dedicated Telegram integration`);
- final exact-head parent CI #653 / run `37573713270` — **SUCCESS**;
- independent implementation review: **PASS**; zero unresolved review threads;
- normal parent merge/main: `3bcd0d7fc1ffd0eedb8f2186271e2596a1581e5a`;
- authoritative parent post-merge CI #654 / run `37576373644` (attempt 1) — **SUCCESS**;
- delivered dedicated Telegram integration scope within approved ADR-058 authority (technical config boundary, authenticated personal endpoints, one-time short-lived linking challenge, webhook trust boundary, bounded parser, retained Telegram account-link lifecycle, ACTIVE uniqueness and takeover prevention, atomic webhook receipt/inbox handling, durable notification delivery state machine RESERVED/ATTEMPTING/SENT/FAILED/UNKNOWN, atomic RESERVED -> ATTEMPTING send ownership, ACTIVE-link condition inside atomic send claim, durable DB-owned destination identity, fail-safe IGNORED receipt persistence, crash/startup reconciliation to UNKNOWN without automatic resend, unlink/send race semantics, server-owned self-test notification, ProfilePage integration, PostgreSQL integration/race tests 14/14 PASS);
- docs and configuration wiring updated with zero real Telegram activation, no real bot token/webhook secret configured, no VPS deployment, no production database mutation, no Nginx/TLS/Scheduled Task/app restart;
- production remains strictly **PRE-OPERATIONAL**;
- no residual P5-030 correction/re-entry task emerged from review or post-merge CI.

`P5-030` is **`CLOSED`** by `SYNC-P5-030`. `P5-040` is **`IN_REVIEW`** on `audit/p5-040-predeploy-consistency` (report `docs/requirements/P5-040-PRE-DEPLOY-FULL-REPOSITORY-CONSISTENCY-AUDIT.md`, candidate SHA `6e6b76f15998c4a7d70b61502bda932571d46ea0`, result `PASS — NO BLOCKER/HIGH FINDINGS`, 0 BLOCKER, 0 HIGH, 0 MEDIUM, 0 LOW). `P6-020` remains **`DEFERRED_WITH_TRIGGER`** until `P5-040` is closed and the exact pilot build is explicitly approved by the Product Owner as a production deployment candidate.

## Active / next critical path

### In Review

- `P5-040` — pre-deploy full-repository consistency audit: **`IN_REVIEW`** (candidate `6e6b76f15998c4a7d70b61502bda932571d46ea0`, branch `audit/p5-040-predeploy-consistency`, audit report `docs/requirements/P5-040-PRE-DEPLOY-FULL-REPOSITORY-CONSISTENCY-AUDIT.md`, result `PASS — NO BLOCKER/HIGH FINDINGS`, zero production mutation).

### Ready

- None.

### Planned behind open dependencies

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
4. Dedicated Telegram integration (`P5-030`) is **`CLOSED` by `SYNC-P5-030`** after PR #200, exact-head CI #653 SUCCESS, merge/main `3bcd0d7fc1ffd0eedb8f2186271e2596a1581e5a` và authoritative post-merge CI #654 (run `37576373644`) SUCCESS.
5. Pre-deploy full-repository consistency audit (`P5-040`) is in review (**`IN_REVIEW`**) with full consistency audit report completed (`PASS — NO BLOCKER/HIGH FINDINGS`), awaiting independent review and closure before VPS deployment.
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
