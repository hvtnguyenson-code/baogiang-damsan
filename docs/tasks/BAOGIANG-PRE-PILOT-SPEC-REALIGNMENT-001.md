# BAOGIANG-PRE-PILOT-SPEC-REALIGNMENT-001

## Status

**CLOSED — documentation/governance only.**

- Repository: `hvtnguyenson-code/baogiang-damsan`
- Canonical starting baseline: `main@4bcf2e7fb2104304fd044693a0bf8838f6038d85`
- Task branch: `docs/pre-pilot-spec-realignment-001`
- Reviewed head: `475418e62879bfe70c6d56d7154da8522ffad623`
- PR: #91
- PR CI: #327 — SUCCESS
- Merge/main: `7ae5e6bf86dc5d2bedd9329996235b17a3643ff7`
- Post-merge main CI: #328 — SUCCESS
- Closure synchronization: `SYNC-P0-001`
- Product state remains pre-operational; no production deployment was authorized by this task.

## Purpose

Reconcile the original product specification, later ADRs, implemented code and current pre-pilot requirements before any further business implementation. The task exists because several intentionally bounded/deferred backend slices were later treated as if they were the complete product model, while mutable status documents also fell behind the implemented repository.

The task created a durable governance mechanism that prevents both failure modes from recurring:

1. **semantic drift** — a minimum-core ADR silently becomes the full product model;
2. **orphaned deferral** — a requirement is deferred with no tracked re-entry task and is later forgotten.

## Allowed scope

Only repository documentation and repository contribution/governance metadata changed:

- `docs/governance/**`;
- this task document;
- governance/realignment ADR-044;
- `AGENTS.md`;
- current-state documentation such as `README.md`, `docs/PROJECT_CONTEXT.md`, and `docs/architecture/CORE-BACKEND-ROADMAP.md`;
- `.github/pull_request_template.md`.

## Forbidden scope preserved

P0 did not change:

- Prisma schema or migrations;
- seed/capability catalog runtime;
- API/controller/service/application source;
- frontend runtime/UI;
- tests that establish business behavior;
- CI/CD workflow behavior;
- Nginx, TLS, VPS, Scheduled Task, PostgreSQL or production data;
- DamSanV5 / Quản lí nội trú resources;
- existing historical ADR text merely to make history look cleaner.

Historical ADRs remain historical evidence. Changed product authority is expressed through ADR-044, the accepted product baseline, traceability and registered re-entry tasks.

## Delivered authority

1. `PRE-PILOT-PRODUCT-BASELINE.md` — accepted normative product baseline and explicit KEEP/REOPEN boundaries.
2. `PRE-PILOT-TRACEABILITY-MATRIX.md` — original requirement → later decision → current implementation → disposition → re-entry task.
3. `PRE-PILOT-TASK-REGISTER.md` — canonical register for planned, blocked and deferred pre-pilot tasks.
4. `CURRENT-PROJECT-STATUS.md` — canonical mutable product/task status surface.
5. `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md` — mandatory post-task synchronization and orphan-deferral prevention.
6. ADR-044 — accepted governance/realignment decision without implementation authorization.
7. Current-state documents normalized so they no longer claim implemented modules are absent.
8. Repository agent/PR rules updated so a major task cannot close while register/status documentation is stale.
9. Source fingerprints and `P0-900` rebase trigger added.
10. `P0-004` registered for the discovered unprotected-main server-side enforcement gap.

## Acceptance evidence

The final reviewed branch satisfied the P0 gates:

- known pre-pilot gaps are represented in the task register;
- every intentional deferral has an explicit re-entry trigger/dependency/task; plain untracked `DEFERRED` is prohibited;
- traceability distinguishes `KEEP`, `RESTORE`, `REALIGN`, `NEW_PRODUCT_AUTHORITY`, `DEFERRED_WITH_TRIGGER`, and `NON_PILOT`;
- current SpecialActivity code remains a reusable runtime primitive while programme-level GDĐP/HĐTN semantics are explicitly reopened;
- HomeroomAssignment, delayed go-live, PPCT import, native Đam San timetable import, per-slot special-program staffing, coordinator authority, activity workload/reporting, PWA, Telegram and pre-deploy TLS work are registered;
- major-task documentation sync is repository authority, not a recommendation;
- independent GitHub diff review was performed and correction findings were incorporated before final CI;
- exact-head PR CI #327 succeeded;
- Product Owner explicitly authorized merge;
- PR #91 merged as `7ae5e6bf86dc5d2bedd9329996235b17a3643ff7`;
- exact post-merge main CI #328 succeeded;
- `SYNC-P0-001` records closure evidence and transitions the task to `CLOSED`.

## Closure rule established for future tasks

A merged major-task PR is **not** sufficient to call a task `CLOSED`. After authoritative post-merge CI succeeds, the repository must complete the bounded administrative documentation synchronization defined in `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`. Until then the task remains `MERGED_AWAITING_DOC_SYNC`, and dependent major work is blocked.
