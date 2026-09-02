# Current Project Status

## Authority

This is the canonical mutable **product/task status** document for Báo giảng. Historical phase reports, `README.md`, `docs/PROJECT_CONTEXT.md` and roadmap text may summarize this status but must not contradict it.

It is **not** a self-referential registry of the latest Git commit. Exact current `main`, branch HEAD and divergence must always be read directly from Git/GitHub at the start of every task. SHAs recorded here are evidence for the stated baseline or last closed major task.

**Status snapshot date:** 2026-09-03

## Last closed major task

`P0-001` — `BAOGIANG-PRE-PILOT-SPEC-REALIGNMENT-001` — **CLOSED**.

Closure evidence:

- starting main: `4bcf2e7fb2104304fd044693a0bf8838f6038d85`;
- reviewed PR head: `475418e62879bfe70c6d56d7154da8522ffad623`;
- PR: #91 `docs(governance): establish pre-pilot product realignment authority`;
- exact-head PR CI: #327 — SUCCESS;
- merge/main SHA: `7ae5e6bf86dc5d2bedd9329996235b17a3643ff7`;
- post-merge main CI: #328 — SUCCESS;
- administrative closure: `SYNC-P0-001`.

P0 changed documentation/governance only. It did not change Prisma, migrations, API/runtime, frontend runtime, CI/CD behavior, VPS, TLS, database or production state.

## Accepted authority after P0

The following are now accepted current governance/product authorities:

- `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md`;
- `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`;
- `docs/governance/PRE-PILOT-TASK-REGISTER.md`;
- `docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`;
- `docs/decisions/ADR-044-PRE-PILOT-PRODUCT-REALIGNMENT-GOVERNANCE.md`.

Every major task must be registered before implementation, cite applicable traceability rows, obey dependency gates, and complete post-merge documentation synchronization before dependent major work starts. Untracked plain `DEFERRED`/`later`/`future slice` is prohibited.

## Current implemented foundation

The repository contains reviewed implementation for:

- identity, session/authentication, capability/scope authorization and audit;
- academic years, versioned retained calendars, business weeks/segments/reserve weeks/interruptions and classes;
- date-effective TeachingAssignment history;
- retained exact time-slot revisions and real wall-clock collision semantics;
- retained timetable versions/entries, validation, lifecycle, historical resolution and XLSX canonical import infrastructure;
- PPCT persistence/control plane, stable item identity/revisions/lineage and exact class-subject version association;
- operational overlays;
- SpecialActivity minimum-core persistence/runtime with exact slots, frozen classes, staffing and class/teacher/time collision checks;
- PPCT occurrence allocation;
- curricular TeachingExecution and SpecialActivityParticipationExecution evidence;
- proof-based progress/debt/late projection;
- reporting projection and public reporting read path;
- Personal Reporting Projection;
- Reporting Statement persistence/control plane/UI enablement/product UI work;
- hardened Windows production deployment control-plane/runbooks through PR #90.

Therefore any document that says the entire PPCT -> execution -> progress/debt -> reporting/statement chain is “not implemented” is stale.

## Pre-pilot verdict

**NOT READY FOR TEACHER PILOT YET.**

P0 has closed the product/governance authority gap, but the registered implementation and evidence tasks remain.

## Critical pre-pilot gaps

1. Current SpecialActivity is a valid runtime occurrence primitive but not a complete GDĐP/HĐTN programme model.
2. Canonical date-effective HomeroomAssignment is absent.
3. GDĐP grade/year plan and HĐTN CLASS/GRADE/SCHOOL programme semantics are absent.
4. Programme planning cannot assign different exact teacher sets to different exact slots.
5. Existing `GDDDP_COORDINATOR` / `HĐTN_COORDINATOR` capability intent is not wired to programme-resource authority.
6. Typed/versioned Business Configuration Control Plane is absent.
7. Delayed go-live / operational-start policy and historical pre-operational evidence workflow are absent.
8. PPCT real-school import is intentionally deferred pending an authoritative workbook contract.
9. Native Đam San timetable adapter and class-view/teacher-view peer reconciliation are absent.
10. Morning/afternoon selective timetable update with explicit carry-forward is absent.
11. Special-activity participation is not yet integrated into official workload/reporting aggregation.
12. WorkloadAdjustmentRule remains trigger-gated/deferred.
13. Installable PWA baseline is absent.
14. Dedicated Báo giảng Telegram bot/linking/notification lifecycle is absent.
15. First-certificate HTTP-01/Nginx authority for the Báo giảng subdomain is incomplete.
16. Actual VPS Stage 1 evidence has not yet been collected for first deployment.

## Tasks now eligible to start

After `SYNC-P0-001` merges, the register marks these direct P0 dependents `READY`:

- `P1-010` — Homeroom responsibility architecture closure;
- `P1-020` — Business Configuration Control Plane architecture;
- `P6-010` — Pre-deploy TLS/HTTP-01 authority.

Task sequencing must still follow the register and one-task-per-branch rule. Readiness is not automatic authorization to merge/deploy.

## Decisions/evidence still blocking other paths

- `P0-002` — stale PR #11 closure: Product Owner decision required.
- `P0-003` — CORE vs FULL BUSINESS pilot scope: Product Owner decision required before P5 freeze.
- `P0-004` — GitHub main branch protection/ruleset: Product Owner decision required before repository-settings mutation.
- `P2-010` — authoritative PPCT workbook/template evidence required.
- `P2-030` — authoritative Đam San TKB source evidence must be available to the task in a durable/reviewable form.
- `P0-900` — rebase audit triggers if pinned source blobs change or Product Owner authority contradicts the accepted baseline.

## Authoritative source-change gate

Accepted P0 fingerprints:

- PA-B v1.2 DOCX blob: `c2c61a4e8acb9fde0e5fc5232467662048fd3380`;
- PA-B v1.3 addendum blob: `5876af5920d12ea6fcecf42d1b8a392cc4825f16`.

If either changes, or an explicit Product Owner decision contradicts the accepted baseline, `P0-900` becomes mandatory before dependent product work continues.

## Repository protection gap

Direct P0 inspection found `main` is currently not protected server-side. This is registered as `P0-004`; no repository-setting mutation was performed implicitly.

## Production state

Production remains **pre-operational**. No P0 or SYNC-P0-001 action authorizes or performs deployment, migration, Nginx/TLS change, PostgreSQL mutation or application-process mutation.

## Protected external system boundary

Pre-pilot work must not modify or infer ownership over:

- `D:\Quan_li_noi_tru`;
- `D:\Edu_DamSan`;
- DamSanV5/Quản lí nội trú application processes, database, Scheduled Tasks or application configuration;
- current Nội trú TLS renewal/monitoring state except in a separately authorized and explicitly isolated infrastructure task.
