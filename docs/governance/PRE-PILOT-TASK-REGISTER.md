# Pre-Pilot Task Register

## Status

**CANONICAL PRE-PILOT WORK REGISTER — ACCEPTED.**

Starting baseline: `main@4bcf2e7fb2104304fd044693a0bf8838f6038d85`.

This register exists to prevent planned or deferred work from disappearing between phases. No pre-pilot requirement may be left only in prose such as “later”, “deferred”, “future slice” or “out of scope”. It must have a row here.

## Status vocabulary

- `PLANNED` — accepted work exists but dependencies are not yet all closed.
- `READY` — dependencies closed; task may be started with a dedicated branch.
- `IN_PROGRESS` — active task branch exists.
- `IN_REVIEW` — implementation/docs complete on branch; independent review/CI pending.
- `MERGED_AWAITING_DOC_SYNC` — implementation merged, but canonical post-merge status synchronization is not yet complete.
- `CLOSED` — merge, authoritative post-merge CI and mandatory documentation sync are complete.
- `BLOCKED_DECISION` — Product Owner decision required.
- `BLOCKED_EVIDENCE` — source workbook/VPS/other evidence required.
- `DEFERRED_WITH_TRIGGER` — intentionally outside current path; exact re-entry trigger is recorded.
- `CANCELLED` — explicitly cancelled by Product Owner; reason must remain recorded.

**Plain `DEFERRED` is prohibited.**

## Global gate

A dependent major task must not start if:

1. any dependency is not `CLOSED`;
2. any immediately preceding required major task is `MERGED_AWAITING_DOC_SYNC`;
3. the task would consume a traceability row marked `RESTORE`, `REALIGN` or `NEW_PRODUCT_AUTHORITY` without an accepted architecture/decision closure for that row;
4. the task creates a new deferred item without adding a registered re-entry task and trigger in the same PR.

Dependency cells below contain **task IDs only**. Conditions/evidence triggers belong in the notes/trigger column, not in the dependency graph.

## P0 — Product/spec realignment and governance

| Task | Status | Depends on | Deliverable / closure | Trigger / notes |
|---|---|---|---|---|
| `P0-001` BAOGIANG-PRE-PILOT-SPEC-REALIGNMENT-001 | `CLOSED` | none | Product baseline, traceability, task register, current status authority, sync protocol, ADR, stale status normalization | PR #91; reviewed head `475418e62879bfe70c6d56d7154da8522ffad623`; merge/main `7ae5e6bf86dc5d2bedd9329996235b17a3643ff7`; PR CI #327 SUCCESS; post-merge main CI #328 SUCCESS; closed by `SYNC-P0-001` |
| `P0-002` Close stale PR #11 hosting-portability direction | `BLOCKED_DECISION` | `P0-001` | Close PR #11 as superseded if Product Owner explicitly authorizes | Must not merge old standalone-Linux direction into current Windows/shared-Nginx architecture |
| `P0-003` Pilot scope decision: CORE vs FULL BUSINESS | `BLOCKED_DECISION` | `P0-001` | Record Product Owner decision before P5 pilot freeze | Does not block common P1-P3 foundations |
| `P0-004` GitHub main branch protection/ruleset enforcement | `BLOCKED_DECISION` | `P0-001` | Review and, only with explicit Product Owner authorization, enforce server-side protection against accidental direct-main bypass and require the agreed PR/CI gates | Baseline inspection shows `main` currently `protected: false`; repository-settings mutation must not be performed implicitly |
| `P0-900` Authoritative specification rebase audit | `DEFERRED_WITH_TRIGGER` | `P0-001` | Re-read changed authoritative source, reconcile baseline/ADR/traceability/register before dependent product work continues | Trigger if PA-B v1.2 blob changes from `c2c61a4e8acb9fde0e5fc5232467662048fd3380`, PA-B v1.3 blob changes from `5876af5920d12ea6fcecf42d1b8a392cc4825f16`, or an explicit Product Owner decision contradicts the accepted baseline; T42 |

## P1 — Governance/business foundation

### Homeroom responsibility

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P1-010` Homeroom responsibility architecture closure | `CLOSED` | `P0-001` | Date-effective retained GVCN product/authorization/history semantics; no schema yet | T13, T14; PR #93; reviewed head `c125a0b1224c23fa1cf15d31123a9f5338ab8a4f`; independent GitHub diff review PASS after historical-eligibility correction; PR CI #333 SUCCESS; merge/main `5cbfe8b25c1e40b1fb7d0a5b524b823c689c0463`; post-merge main CI #334 SUCCESS; closed by `SYNC-P1-010`; follow-up boundaries T43/T44 registered in P4 |
| `P1-011` Homeroom persistence foundation | `CLOSED` | `P1-010` | Schema/migration/invariants for retained HomeroomAssignment history | T13, T14; PR #95; reviewed head `ae5515d63fb38987e9479ea69b3425b1e910a11a`; independent GitHub diff review PASS; exact-head PR CI #337 SUCCESS including isolated PostgreSQL migration behavior; merge/main `7530022d9027e0ba94add9ca25b70822c87b792a`; post-merge main CI #338 SUCCESS; closed by `SYNC-P1-011`; no correction/re-entry task required |
| `P1-012` Homeroom control plane | `CLOSED` | `P1-011` | Capability-controlled create/change/end/correct/read/resolve, same-transaction audit, bounded SERIALIZABLE conflict handling, retained historical resolution and command-layer regression for correction lineage | T13, T14; PR #97; final reviewed head `6af8bb27367763bec143a6bf26e7af22115394e1`; independent GitHub diff review PASS; exact-head PR CI #343 (run `33825153273`) SUCCESS; merge/main `3bf0589db17534700d8c8a15ce59645663d3ef40`; post-merge main CI #344 (run `33825691809`) SUCCESS; closed by `SYNC-P1-012`; review/CI forward corrections absorbed before merge, no separate correction/re-entry task required |
| `P1-012A` Homeroom historical identity read-model correction | `CLOSED` | `P1-012` | Homeroom-capability-scoped bounded historical User identity discovery plus server-owned business-date read model required by P1-013; no new GVCN authority and no `USER_MANAGE` dependency | T13, T14; registration commit `c7f3d860549b324eb5daf65eed79c9c534096be5`; PR #99; reviewed head `a13a69dca60bef6f99c124f420affa8196b7822a`; independent GitHub review PASS; exact-head PR CI #347 (run `33832457894`) final SUCCESS after attempt 1 npm-registry 503 and successful targeted retry, with no dependency/vulnerability finding; merge/main `530f418d3e144826cd801f572d6367bb679d398a`; post-merge main CI #348 (run `33834641625`) SUCCESS; closed by `SYNC-P1-012A`; no separate correction/re-entry task required |
| `P1-013` Homeroom administration workspace | `READY` | `P1-012A` | Bounded admin/PHT UI using frozen backend contracts; no UI-invented authority | T13, T14 |

### Business configuration

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P1-020` Business Configuration Control Plane architecture | `READY` | `P0-001` | Typed/versioned business-policy families, effectivity/history, capability boundary and explicit separation from technical secrets/env | T21, T22 |
| `P1-021` Business Configuration persistence/control plane | `PLANNED` | `P1-020` | Approved policy persistence, lifecycle, authorization, audit and exact historical reads | T21, T22 |
| `P1-022` Business Configuration administration workspace | `PLANNED` | `P1-021` | PHT/admin UI for approved business policy only; no access to secrets/TLS/database/process settings | T21, T22 |

### Delayed go-live policy

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P1-030` Delayed go-live / operational-start architecture | `PLANNED` | `P1-020` | Exact business semantics for operational start, historical boundary and no-auto-debt invariants | T28, T30 |
| `P1-031` Operational-start policy implementation | `PLANNED` | `P1-021`, `P1-030` | Typed/versioned policy runtime and read authority using Business Configuration foundation | T28, T30 |
| `P1-032` Operational-start admin UI integration | `PLANNED` | `P1-022`, `P1-031` | Safe business UI for authorized start policy with effectivity/audit visibility | T28, T30 |

## P2 — School data ingestion

| Task | Status | Depends on | Deliverable / closure | Trigger / traceability |
|---|---|---|---|---|
| `P2-010` PPCT real-workbook contract/security audit | `BLOCKED_EVIDENCE` | `P0-001` | Read authoritative school PPCT workbook/template; define sheet/column/identity/replay/error contract | Trigger: actual authoritative workbook supplied; T24 |
| `P2-020` PPCT native importer implementation | `PLANNED` | `P2-010` | Import pipeline using approved PPCT contract; no guessed mapping | T24 |
| `P2-030` Đam San TKB native-workbook architecture audit | `BLOCKED_EVIDENCE` | `P0-001` | Read actual four-sheet school TKB format; define matrix parsing, identities, markers, source reconciliation | Trigger: authoritative current workbook supplied; T25–T27 |
| `P2-040` Đam San TKB native adapter implementation | `PLANNED` | `P2-030` | Native adapter on top of canonical importer; class/teacher peer cross-check; fail-closed mismatch | T25, T26 |
| `P2-050` Morning/afternoon selective update and carry-forward | `PLANNED` | `P2-040` | Independently author morning or afternoon while creating one coherent retained canonical version; untouched session explicitly carried forward | T27 |

## P3 — Historical go-live and continuity

| Task | Status | Depends on | Deliverable / closure | Trigger / traceability |
|---|---|---|---|---|
| `P3-010` Pre-operational historical execution architecture | `PLANNED` | `P1-031`, `P2-020`, `P2-050` | Historical evidence/reconciliation contract; provenance, correction, PPCT allocation and no-auto-debt invariants | T28–T30 |
| `P3-020` Pre-operational history ingestion/reconciliation runtime | `PLANNED` | `P3-010` | Controlled import/confirmation API and bounded UI for historical taught evidence; exact audit and reconciliation | T29, T30 |
| `P3-030` Public make-up scheduling re-entry architecture | `DEFERRED_WITH_TRIGGER` | `P3-010` | Re-audit exact incomplete-obligation proof, authority, collision and correction before public scheduling | Trigger: chosen pilot scope requires public make-up scheduling; T08 |
| `P3-031` Public make-up scheduling runtime | `DEFERRED_WITH_TRIGGER` | `P3-030` | Create/reverse/read runtime only after P3-030 closes | Same trigger as P3-030; remains non-startable unless trigger fires and P3-030 becomes CLOSED; T08 |

## P4 — Special programmes and workload

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P4-010` GDĐP/HĐTN programme architecture closure | `READY` | `P0-001`, `P1-010` | Programme/version/item/occurrence topology; GDĐP grade plans; HĐTN CLASS/GRADE/SCHOOL; exact per-slot staffing; absence/replacement semantics; confirmation topology | T12, T15–T17, T43, T44 |
| `P4-020` Special-programme persistence + control plane | `PLANNED` | `P1-012`, `P4-010` | Retained plan history, planning commands, audit, no overload of SpecialActivity runtime primitive | T16, T17 |
| `P4-030` Programme coordinator authorization | `PLANNED` | `P4-020` | Exact coordinator resource/scope semantics using explicit capabilities; no role/title inference | T18, T44 |
| `P4-040` Programme-to-SpecialActivity runtime bridge | `PLANNED` | `P4-030` | Deterministic materialization/provenance into existing SpecialActivity collision/runtime foundation | T12, T17, T31, T43, T44 |
| `P4-050` Special-activity workload/reporting projection | `PLANNED` | `P4-040` | Confirmed teacher-slot participation contributes exactly once; no class-target fan-out multiplication; statement policy defined | T19, T20, T44 |
| `P4-060` Workload adjustment architecture | `DEFERRED_WITH_TRIGGER` | `P1-020` | Close reduction/percentage/override semantics, effectivity and frozen-report provenance | Trigger: chosen pilot/official reporting scope claims adjusted workload; T23 |
| `P4-061` Workload adjustment implementation | `DEFERRED_WITH_TRIGGER` | `P1-021`, `P4-060` | Implement accepted adjustment policy without hardcoded fallback | Same trigger as P4-060; remains non-startable unless trigger fires and P4-060 becomes CLOSED; T23 |

## P5 — Pilot product closure

| Task | Status | Depends on | Deliverable / closure | Notes |
|---|---|---|---|---|
| `P5-010` Pilot business scope + cross-domain freeze | `PLANNED` | `P0-003` | End-to-end regression closure for the exact chosen pilot claim; exact additional P1-P4 dependencies must be registered when P0-003 closes | CORE vs FULL decision controls required domain set; no hidden partial-total claim |
| `P5-020` PWA production baseline | `PLANNED` | `P5-010` | Manifest/icons/service worker/update strategy; no offline caching of sensitive `/api`/auth/reporting data | T32 |
| `P5-030` Dedicated Báo giảng Telegram integration | `PLANNED` | `P5-010` | Dedicated bot/token/webhook; one-time short-lived linking; idempotent notifications; no DamSanV5 bot reuse | T33 |

## P6 — Production readiness and controlled pilot

| Task | Status | Depends on | Deliverable / closure | Trigger / traceability |
|---|---|---|---|---|
| `P6-010` Pre-deploy TLS/HTTP-01 authority | `READY` | `P0-001` | Repo-side port-80 ACME challenge + redirect authority, separate Báo giảng PEM/renewal/reload lifecycle, collision tests | T34 |
| `P6-020` Production Stage 1 passive VPS evidence | `DEFERRED_WITH_TRIGGER` | `P5-010`, `P6-010` | PASS1 passive neighbour discovery + reviewed PASS2 exact readonly preflight | Trigger: exact pilot commit is a production deployment candidate; T35 |
| `P6-030` Production bootstrap + first controlled deploy | `PLANNED` | `P6-020` | Root/ACL/task/env/Nginx/DB/TLS bootstrap, first certificate activation as applicable, migration gates, exact commit deploy, rollback and health evidence | No mutation before separate explicit approval |
| `P6-040` TLS monitor multi-certificate refactor | `PLANNED` | `P6-030` | Extend existing monitor by certificate groups after Báo giảng certificate exists, without breaking Nội trú monitoring | Isolated infrastructure task only |
| `P6-050` Teacher pilot go-live verification | `PLANNED` | `P5-020`, `P5-030`, `P6-030` | Real pilot smoke, installability, Telegram linking, reporting/statement sanity and rollback evidence | Final pre-operational -> pilot decision remains explicit |

## Deferred/non-pilot register

These are not forgotten. They are deliberately outside the first pilot unless the trigger fires.

| Task | Status | Re-entry trigger |
|---|---|---|
| `D-ROOM-001` Room/Location resource + collision | `DEFERRED_WITH_TRIGGER` | Product requires room booking, room conflict detection or authoritative location occupancy |
| `D-ROSTER-001` Student/enrollment/participant roster | `DEFERRED_WITH_TRIGGER` | Product requires individual attendance, student targeting or arbitrary activity groups |
| `D-AI-001` Active AI business integration | `DEFERRED_WITH_TRIGGER` | Explicit Product Owner activation decision after pilot stability/security/cost policy review |
| `D-ACTIVITY-CATEGORY-001` Managed activity category catalogue | `DEFERRED_WITH_TRIGGER` | Product needs typed categories with downstream semantics beyond GDĐP/HĐTN programme identity |
| `D-EXPORT-001` Official export/archive/final retention closure | `DEFERRED_WITH_TRIGGER` | Pilot or regulatory workflow requires signed/archived export beyond current statement freeze |

## Mandatory task-start rule

Every future execution prompt for a major task must include:

- exact task ID from this register;
- current task status and dependencies;
- exact canonical main SHA fetched directly from Git/GitHub;
- traceability row IDs affected;
- files/domains allowed and forbidden;
- required tests/evidence;
- documentation files that must be synchronized before review;
- explicit statement that merge/deploy remains separately authorized.

If an implementation task depends on a `DEFERRED_WITH_TRIGGER` architecture task, the implementation task remains non-startable until the trigger fires and the architecture task is `CLOSED`.

If the requested work is not in this register, create/register it first. Do not begin implementation and “document it later”.
