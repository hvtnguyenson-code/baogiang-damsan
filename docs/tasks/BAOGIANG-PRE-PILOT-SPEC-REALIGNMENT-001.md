# BAOGIANG-PRE-PILOT-SPEC-REALIGNMENT-001

## Status

**IN_REVIEW — documentation/governance only. Independent GitHub review and CI/merge gates remain.**

- Repository: `hvtnguyenson-code/baogiang-damsan`
- Canonical starting baseline: `main@4bcf2e7fb2104304fd044693a0bf8838f6038d85`
- Task branch: `docs/pre-pilot-spec-realignment-001`
- Product state at start: pre-operational; no production deployment is authorized by this task.

## Purpose

Reconcile the original product specification, later ADRs, implemented code and current pre-pilot requirements before any further business implementation. The task exists because several intentionally bounded/deferred backend slices were later treated as if they were the complete product model, while mutable status documents also fell behind the implemented repository.

The task must create a durable governance mechanism that prevents both failure modes from recurring:

1. **semantic drift** — a minimum-core ADR silently becomes the full product model;
2. **orphaned deferral** — a requirement is deferred with no tracked re-entry task and is later forgotten.

## Allowed scope

Only repository documentation and repository contribution/governance metadata may change:

- `docs/governance/**`;
- this task document;
- a proposed governance/realignment ADR;
- `AGENTS.md`;
- current-state documentation such as `README.md`, `docs/PROJECT_CONTEXT.md`, and `docs/architecture/CORE-BACKEND-ROADMAP.md`;
- `.github/pull_request_template.md`.

## Forbidden scope

This task must not change:

- Prisma schema or migrations;
- seed/capability catalog runtime;
- API/controller/service/application source;
- frontend runtime/UI;
- tests that establish business behavior;
- CI/CD workflow behavior;
- Nginx, TLS, VPS, Scheduled Task, PostgreSQL or production data;
- DamSanV5 / Quản lí nội trú resources;
- existing historical ADR text merely to make history look cleaner.

Historical ADRs remain historical evidence. Any changed product authority must be expressed as a new explicit decision/re-entry record.

## Required deliverables

1. `PRE-PILOT-PRODUCT-BASELINE.md` — proposed normative product baseline and explicit KEEP/REOPEN boundaries.
2. `PRE-PILOT-TRACEABILITY-MATRIX.md` — original requirement → later decision → current implementation → disposition → re-entry task.
3. `PRE-PILOT-TASK-REGISTER.md` — one canonical register for every planned, blocked and deferred pre-pilot task.
4. `CURRENT-PROJECT-STATUS.md` — one canonical mutable status surface.
5. `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md` — mandatory post-task synchronization and orphan-deferral prevention.
6. New ADR recording the governance/realignment rule without authorizing implementation.
7. Current-state documents normalized so they do not claim implemented modules are absent.
8. Repository agent/PR rules updated so a major task cannot close while its register/status documentation is stale.

## Acceptance gates

The task is not complete until all of the following are true:

- every known pre-pilot gap from the September 2026 audit is represented in the task register;
- every `DEFERRED` item has an explicit re-entry trigger, dependency and target task; plain untracked `DEFERRED` is prohibited;
- the traceability matrix distinguishes `KEEP`, `RESTORE`, `REALIGN`, `NEW_PRODUCT_AUTHORITY`, `DEFERRED_WITH_TRIGGER`, and `NON_PILOT`;
- current Special Activity code is preserved as a runtime primitive while programme-level GDĐP/HĐTN semantics are explicitly reopened;
- HomeroomAssignment, delayed go-live, PPCT import, native Đam San timetable import, per-slot special-program staffing, coordinator authority, activity workload/reporting, PWA, Telegram and pre-deploy TLS work are all visible in the register;
- major-task documentation sync is a repository rule, not merely a recommendation;
- no implementation or production mutation occurs;
- an independent GitHub diff review is performed before merge;
- merge remains a separate explicit user decision.

## Review-state evidence

The branch now contains all required governance/current-state deliverables and is ready for independent GitHub diff review. This status does **not** claim P0 is merged or closed.

## Closure rule

A merged implementation PR is **not** sufficient to call a major task `CLOSED`. After its authoritative post-merge CI succeeds, the repository must complete the documentation synchronization defined in `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`. Until then the task remains `MERGED_AWAITING_DOC_SYNC`, and the next dependent major task is blocked.
