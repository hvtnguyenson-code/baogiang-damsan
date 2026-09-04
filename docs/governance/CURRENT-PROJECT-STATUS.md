# Current Project Status

## Authority

This is the canonical mutable **product/task status** document for Báo giảng. Historical phase reports, `README.md`, `docs/PROJECT_CONTEXT.md` and roadmap text may summarize this status but must not contradict it.

It is **not** a self-referential registry of the latest Git commit. Exact current `main`, branch HEAD and divergence must always be read directly from Git/GitHub at the start of every task. SHAs recorded here are evidence for the stated baseline or last closed major task.

**Status snapshot date:** 2026-09-04

## Last closed major task

`P1-012` — Homeroom control plane — **CLOSED** by `SYNC-P1-012`.

Closure evidence:

- exact starting main: `1d51580ddc501a5cf132688a66d6b7b1941570d0`;
- implementation branch: `feat/homeroom-control-plane-012`;
- final reviewed head: `6af8bb27367763bec143a6bf26e7af22115394e1`;
- PR: #97 `feat(homeroom): add P1-012 control plane`;
- independent GitHub diff review: PASS;
- exact-head PR CI: #343 (workflow run `33825153273`) — SUCCESS;
- merge/main SHA: `3bf0589db17534700d8c8a15ce59645663d3ef40`;
- authoritative post-merge main CI: #344 (workflow run `33825691809`, event `push`, exact head `3bf0589db17534700d8c8a15ce59645663d3ef40`) — SUCCESS;
- administrative closure: `SYNC-P1-012`;
- independent-review and CI #341/#342 corrections were absorbed as forward commits before merge; no separate correction/re-entry task was required.

P1-012 added the dedicated `HOMEROOM_ASSIGNMENT_MANAGE / SCHOOL_WIDE` capability, capability-controlled create/change/end/correct/read/options control plane, exact fail-closed resolver, calendar compatibility, same-transaction audit and bounded SERIALIZABLE conflict handling. It did not add the P1-013 administration UI, Special Programme runtime, workload/reporting behavior, deployment behavior, VPS/TLS state or production database state.

## Active major task

`P1-012A` — Homeroom historical identity read-model correction — **IN_PROGRESS** on `fix/homeroom-historical-identity-read-model-012a`, from canonical main `9ac9ae1e510858bc1039da313af90f908b773a93`.

P1-012 remains CLOSED. A post-closure audit found that the frozen P1-012 workspace read model cannot discover an exact historical User who is currently inactive/non-teaching or lacks a current StaffProfile unless that User is already referenced by HomeroomAssignment. It also does not expose the server-owned Homeroom business civil date. P1-012A corrects those bounded read-model gaps without changing ADR-045 product authority, schema, migrations, Homeroom command/resolver semantics or current/future eligibility.

P1-013 is **PLANNED** and has not started. It now depends on P1-012A so the administration workspace can remain UI-only and avoid `USER_MANAGE`, generic user-directory access, raw UUID entry or browser-local business-date inference.

## Accepted product/domain authority

`ADR-045-HOMEROOM-RESPONSIBILITY.md` remains accepted authority for canonical homeroom responsibility:

- separate AcademicYear-owned, SchoolClass/date-effective `HomeroomAssignment` domain;
- inclusive civil-date history with one effective current-truth GVCN per class/date and fail-closed gaps;
- current/future operational eligibility is distinct from bounded historical truth;
- current account/profile state cannot silently invalidate or replace a historically correct GVCN;
- no TeachingAssignment, AdditionalDuty, timetable-text or SpecialActivity-staffing inference as alternate GVCN authority;
- dedicated future `HOMEROOM_ASSIGNMENT_MANAGE / SCHOOL_WIDE` management capability;
- HĐTN `CLASS` resolves exact GVCN by occurrence date and downstream materialization freezes source provenance;
- `HomeroomAssignment` existence alone is not teaching-execution evidence or HĐTN period credit.

P1-010 review also recovered and registered Special Programme boundaries T43/T44: absence/replacement/substitution semantics and programme-level confirmation authority/topology. Those remain for P4; they were not silently solved inside HomeroomAssignment.

## Accepted governance authority

The following remain current governance/product authorities:

- `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md`;
- `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`;
- `docs/governance/PRE-PILOT-TASK-REGISTER.md`;
- `docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`;
- `docs/decisions/ADR-044-PRE-PILOT-PRODUCT-REALIGNMENT-GOVERNANCE.md`;
- `docs/decisions/ADR-045-HOMEROOM-RESPONSIBILITY.md`.

Every major task must be registered before implementation, cite applicable traceability rows, obey dependency gates, and complete post-merge documentation synchronization before dependent major work starts. Untracked plain `DEFERRED`/`later`/`future slice` is prohibited.

## Current implemented foundation

The repository contains reviewed implementation for:

- identity, session/authentication, capability/scope authorization and audit;
- academic years, versioned retained calendars, business weeks/segments/reserve weeks/interruptions and classes;
- date-effective TeachingAssignment history;
- **retained HomeroomAssignment persistence** with inclusive civil DATE intervals, ACTIVE/REVERSED history, same-class/date ACTIVE overlap prevention, exact retained teacher/actor identities and correction lineage;
- **Homeroom control plane and capability** with dedicated `HOMEROOM_ASSIGNMENT_MANAGE / SCHOOL_WIDE` authority, explicit lifecycle commands, workspace-safe reads/options, exact typed historical resolution, calendar compatibility and same-transaction audit;
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

Homeroom architecture, persistence and control plane/capability are now closed. Only the Homeroom **administration workspace UI** remains to be implemented by P1-013.

## Pre-pilot verdict

**NOT READY FOR TEACHER PILOT YET.**

The registered implementation, data-evidence, product and production-readiness tasks remain.

## Critical pre-pilot gaps

1. Current SpecialActivity is a valid runtime occurrence primitive but not a complete GDĐP/HĐTN programme model.
2. HomeroomAssignment administration workspace/UI remains absent; architecture, persistence and control plane/capability are closed through ADR-045/P1-011/P1-012.
3. GDĐP grade/year plan and HĐTN CLASS/GRADE/SCHOOL programme semantics are absent.
4. Programme planning cannot assign different exact teacher sets to different exact slots.
5. Special-program absence/replacement and programme-level confirmation authority remain explicitly registered for P4 closure (T43/T44).
6. Existing `GDDDP_COORDINATOR` / `HĐTN_COORDINATOR` capability intent is not wired to programme-resource authority.
7. Typed/versioned Business Configuration Control Plane is absent.
8. Delayed go-live / operational-start policy and historical pre-operational evidence workflow are absent.
9. PPCT real-school import is intentionally blocked pending an authoritative workbook contract.
10. Native Đam San timetable adapter and class-view/teacher-view peer reconciliation are absent.
11. Morning/afternoon selective timetable update with explicit carry-forward is absent.
12. Special-activity participation is not yet integrated into official workload/reporting aggregation.
13. WorkloadAdjustmentRule remains trigger-gated/deferred.
14. Installable PWA baseline is absent.
15. Dedicated Báo giảng Telegram bot/linking/notification lifecycle is absent.
16. First-certificate HTTP-01/Nginx authority for the Báo giảng subdomain is incomplete.
17. Actual VPS Stage 1 evidence has not yet been collected for first deployment.

## Tasks currently eligible to start

While P1-012A is active, dependency gates permit these other registered tasks to start on their own branches:

- `P1-020` — Business Configuration Control Plane architecture;
- `P4-010` — GDĐP/HĐTN programme architecture closure;
- `P6-010` — Pre-deploy TLS/HTTP-01 authority.

Readiness is not permission to bypass one-task-per-branch, review, CI or mandatory closure-sync gates. P1-013 remains blocked on P1-012A closure; P4 runtime work remains gated by its registered dependencies.

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

Production remains **pre-operational**. P1-012 and `SYNC-P1-012` do not authorize or perform deployment, production migration, VPS/Nginx/TLS change, PostgreSQL production mutation or application-process mutation.

## Protected external system boundary

Pre-pilot work must not modify or infer ownership over:

- `D:\Quan_li_noi_tru`;
- `D:\Edu_DamSan`;
- DamSanV5/Quản lí nội trú application processes, database, Scheduled Tasks or application configuration;
- current Nội trú TLS renewal/monitoring state except in a separately authorized and explicitly isolated infrastructure task.
