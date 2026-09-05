# Current Project Status

## Authority

This is the canonical mutable **product/task status** document for Báo giảng. Historical phase reports, `README.md`, `docs/PROJECT_CONTEXT.md` and roadmap text may summarize this status but must not contradict it.

It is **not** a self-referential registry of the latest Git commit. Exact current `main`, branch HEAD and divergence must always be read directly from Git/GitHub at the start of every task. SHAs recorded here are evidence for the stated baseline or last closed major task.

**Status snapshot date:** 2026-09-06

## Last closed major task

`P1-013` — Homeroom administration workspace — **CLOSED** by `SYNC-P1-013`.

Closure evidence: exact starting main `3f8a1763991cc53c9767638ba380aff7ce66e4f2`; implementation branch `feat/homeroom-administration-workspace-013`; final reviewed head `7f8514237bef5868162f19941b31cef9ca9ff9b3`; independent GitHub diff review PASS; PR #101; exact-head PR CI #351 (run `33885773354`) SUCCESS; merge/main `b5bda19f79029851dda323f2cf20ee86308fdd04`; authoritative post-merge main CI #352 (run `33886718375`) SUCCESS; administrative closure `SYNC-P1-013`; no correction/re-entry task, deployment, or production evidence is claimed.

## Homeroom chain

The registered pre-pilot Homeroom chain is closed: P1-010 architecture, P1-011 persistence, P1-012 control plane, P1-012A historical identity/business-date read model, and P1-013 capability-gated administration workspace. The implemented foundation includes retained history/filter/pagination; explicit create/end/change/correction workflows; current/future versus bounded-historical candidate authority; and exact retained correction lineage plus historical identity behavior. This does not make the project teacher-pilot ready; production remains pre-operational.

## Accepted product/domain authority

`ADR-045-HOMEROOM-RESPONSIBILITY.md` remains accepted authority for canonical homeroom responsibility:

- separate AcademicYear-owned, SchoolClass/date-effective `HomeroomAssignment` domain;
- inclusive civil-date history with one effective current-truth GVCN per class/date and fail-closed gaps;
- current/future operational eligibility is distinct from bounded historical truth;
- current account/profile state cannot silently invalidate or replace a historically correct GVCN;
- no TeachingAssignment, AdditionalDuty, timetable-text or SpecialActivity-staffing inference as alternate GVCN authority;
- dedicated `HOMEROOM_ASSIGNMENT_MANAGE / SCHOOL_WIDE` management capability;
- HĐTN `CLASS` resolves exact GVCN by occurrence date and downstream materialization freezes source provenance;
- `HomeroomAssignment` existence alone is not teaching-execution evidence or HĐTN period credit.

P1-010 review also recovered and registered Special Programme boundaries T43/T44: absence/replacement/substitution semantics and programme-level confirmation authority/topology. Those remain for P4; they were not silently solved inside HomeroomAssignment.

## Business Configuration architecture under review

`P1-020` is **IN_REVIEW** on branch `docs/business-configuration-architecture-020`, based on exact canonical start `28fc52dd0f62a78eda97a3e631770be47d465efa`. Proposed ADR-046 defines a separate typed/allowlisted, version-aware and civil-date-effective Business Configuration authority with retained correction history, exact fail-closed resolution and dedicated future `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` authorization. It explicitly excludes `SystemSetting`, environment/secrets and technical/deployment configuration from business-policy authority.

This is proposed architecture/docs only: no schema, migration, capability seed, resolver, API/runtime, UI, deployment or production behavior is implemented. P1-021 remains `PLANNED` and non-startable until P1-020 is independently reviewed, merged, has authoritative post-merge CI, and is closed through `SYNC-P1-020`. P1-022 remains `PLANNED` behind P1-021.

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
- **Homeroom control plane and capability** with dedicated `HOMEROOM_ASSIGNMENT_MANAGE / SCHOOL_WIDE` authority, explicit lifecycle commands, workspace-safe reads/options, bounded historical identity discovery without `USER_MANAGE`, server-owned business date, exact typed historical resolution, calendar compatibility and same-transaction audit;
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

Homeroom architecture, persistence, control plane/capability, historical read model and administration workspace UI are closed for the registered pre-pilot scope.

## Pre-pilot verdict

**NOT READY FOR TEACHER PILOT YET.**

The registered implementation, data-evidence, product and production-readiness tasks remain.

## Critical pre-pilot gaps

1. Current SpecialActivity is a valid runtime occurrence primitive but not a complete GDĐP/HĐTN programme model.
2. GDĐP grade/year plan and HĐTN CLASS/GRADE/SCHOOL programme semantics are absent.
3. Programme planning cannot assign different exact teacher sets to different exact slots.
4. Special-program absence/replacement and programme-level confirmation authority remain explicitly registered for P4 closure (T43/T44).
5. Existing `GDDDP_COORDINATOR` / `HĐTN_COORDINATOR` capability intent is not wired to programme-resource authority.
6. Typed/versioned Business Configuration architecture is in review under P1-020; persistence, control plane and administration UI remain absent.
7. Delayed go-live / operational-start policy and historical pre-operational evidence workflow are absent.
8. PPCT real-school import is intentionally blocked pending an authoritative workbook contract.
9. Native Đam San timetable adapter and class-view/teacher-view peer reconciliation are absent.
10. Morning/afternoon selective timetable update with explicit carry-forward is absent.
11. Special-activity participation is not yet integrated into official workload/reporting aggregation.
12. WorkloadAdjustmentRule remains trigger-gated/deferred.
13. Installable PWA baseline is absent.
14. Dedicated Báo giảng Telegram bot/linking/notification lifecycle is absent.
15. First-certificate HTTP-01/Nginx authority for the Báo giảng subdomain is incomplete.
16. Actual VPS Stage 1 evidence has not yet been collected for first deployment.

## Production VPS topology decision

The final production-host topology is intentionally unresolved and explicitly deferred by the Product Owner:

- Supported candidate topologies are `SHARED_VPS` (coexisting with DamSanV5 / Quản lí nội trú on the existing Windows Server 2022 VPS, retaining shared-host isolation, Nginx coexistence, and process/port/database/TLS neighbour protection) and `DEDICATED_VPS` (a separate newly rented Windows Server 2022 VPS dedicated to Báo giảng, with application/domain/business architecture preserved, requiring production runbooks and P6 authority to be audited and realigned for dedicated-host topology before use).
- Both topologies target Windows Server 2022.
- The choice between `SHARED_VPS` and `DEDICATED_VPS` is an explicit Product Owner decision, not an agent inference. No agent may infer a topology from existing infrastructure.
- A mandatory HARD STOP exists immediately before `P6-010`: `P6-010` cannot start until `P6-005` is `CLOSED`.

## Tasks currently eligible to start

With P1-020 already in review, dependency gates continue to permit this independent registered task to start on its own branch:

- `P4-010` — GDĐP/HĐTN programme architecture closure.

P1-021 is not eligible: P1-020 has not merged or completed `SYNC-P1-020`. Readiness is not permission to bypass one-task-per-branch, review, CI or mandatory closure-sync gates. P4 runtime work remains gated by its registered dependencies.

## Decisions/evidence still blocking other paths

- `P0-002` — stale PR #11 closure: Product Owner decision required.
- `P0-003` — CORE vs FULL BUSINESS pilot scope: Product Owner decision required before P5 freeze.
- `P0-004` — GitHub main branch protection/ruleset: Product Owner decision required before repository-settings mutation.
- `P2-010` — authoritative PPCT workbook/template evidence required.
- `P2-030` — authoritative Đam San TKB source evidence must be available to the task in a durable/reviewable form.
- `P6-005` — Production VPS topology decision: explicit Product Owner selection of `SHARED_VPS` vs `DEDICATED_VPS` required; HARD STOP blocks `P6-010`.
- `P0-900` — rebase audit triggers if pinned source blobs change or Product Owner authority contradicts the accepted baseline.

## Authoritative source-change gate

Accepted P0 fingerprints:

- PA-B v1.2 DOCX blob: `c2c61a4e8acb9fde0e5fc5232467662048fd3380`;
- PA-B v1.3 addendum blob: `5876af5920d12ea6fcecf42d1b8a392cc4825f16`.

If either changes, or an explicit Product Owner decision contradicts the accepted baseline, `P0-900` becomes mandatory before dependent product work continues.

## Repository protection gap

Direct P0 inspection found `main` is currently not protected server-side. This is registered as `P0-004`; no repository-setting mutation was performed implicitly.

## Production state

Production remains **pre-operational**. P1-020 is architecture/docs only and does not authorize or perform deployment, production migration, VPS/Nginx/TLS changes, PostgreSQL production mutation, or application-process mutation. P6 remains blocked by the explicit P6-005 topology decision gate.

## Protected external system boundary

Pre-pilot work must not modify or infer ownership over:

- `D:\Quan_li_noi_tru`;
- `D:\Edu_DamSan`;
- DamSanV5/Quản lí nội trú application processes, database, Scheduled Tasks or application configuration;
- current Nội trú TLS renewal/monitoring state except in a separately authorized and explicitly isolated infrastructure task.
