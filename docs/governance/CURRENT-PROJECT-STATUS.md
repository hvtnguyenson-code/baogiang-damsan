# Current Project Status

## Authority

This is the canonical mutable current-state document for Báo giảng. Historical phase reports, `README.md`, `docs/PROJECT_CONTEXT.md` and roadmap text may summarize this status but must not contradict it.

**Status snapshot date:** 2026-09-03

## Canonical repository state at P0 start

- Repository: `hvtnguyenson-code/baogiang-damsan`
- Stable branch: `main`
- Canonical starting SHA for P0: `4bcf2e7fb2104304fd044693a0bf8838f6038d85`
- Merge at that SHA: PR #90, production operator-evidence authority hardening
- Exact post-merge main CI observed before P0: CI #318 — success
- P0 task branch: `docs/pre-pilot-spec-realignment-001`
- Production state: pre-operational; no P0 deployment/migration/VPS mutation authorized

## Current implemented foundation on starting main

The repository currently contains reviewed implementation for:

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
- Reporting Statement persistence/control plane/UI enablement/product UI work already present on current main;
- hardened Windows production deployment control-plane/runbooks through PR #90.

Therefore any document that says the entire PPCT -> execution -> progress/debt -> reporting/statement chain is “not implemented” is stale.

## Pre-pilot verdict

**NOT READY FOR TEACHER PILOT YET.**

Reason: product/business alignment is incomplete even though the backend foundation is substantial. P0 is correcting authority and re-entry planning before further implementation.

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
12. WorkloadAdjustmentRule remains deferred.
13. Installable PWA baseline is absent.
14. Dedicated Báo giảng Telegram bot/linking/notification lifecycle is absent.
15. First-certificate HTTP-01/Nginx authority for the Báo giảng subdomain is incomplete.
16. Actual VPS Stage 1 evidence has not yet been collected for first deployment.

## Active task

`P0-001` — BAOGIANG-PRE-PILOT-SPEC-REALIGNMENT-001

Current state: **IN_PROGRESS** on `docs/pre-pilot-spec-realignment-001`.

Allowed work: documentation/governance only.

No schema, runtime, UI, CI/CD behavior, VPS, TLS, database or production mutation is authorized by P0.

## Next-task gate

No P1-P6 implementation task should begin until:

1. P0 PR receives independent GitHub review;
2. Product Owner explicitly authorizes merge;
3. merge completes;
4. authoritative post-merge CI succeeds where applicable;
5. P0 post-merge documentation sync changes `P0-001` to `CLOSED`.

After P0 closes, common foundations P1 and evidence-gathering P2 audits may proceed according to `PRE-PILOT-TASK-REGISTER.md`.

## Canonical planning/authority files

- Product baseline: `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md`
- Traceability: `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`
- Task register: `docs/governance/PRE-PILOT-TASK-REGISTER.md`
- Documentation sync rule: `docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`
- Proposed governance ADR: `docs/decisions/ADR-044-PRE-PILOT-PRODUCT-REALIGNMENT-GOVERNANCE.md`

## Protected external system boundary

Pre-pilot work must not modify or infer ownership over:

- `D:\Quan_li_noi_tru`;
- `D:\Edu_DamSan`;
- DamSanV5/Quản lí nội trú application processes, database, Scheduled Tasks or application configuration;
- current Nội trú TLS renewal/monitoring state except in a separately authorized and explicitly isolated infrastructure task.
