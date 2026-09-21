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
| `P0-900` Authoritative specification rebase audit | `CLOSED` | `P0-001` | Dedicated task branch `docs/p0-900-ppct-curricular-component-rebase`; final reviewed head `79532ff2ba621ab6d2c43ba7818e04c560d617ce`; independent GitHub diff review PASS after two forward correction rounds; PR #119 (`docs(governance): rebase PPCT curricular-component authority`); exact-head PR CI #397 (run `34246372215`) SUCCESS; merge/main commit `eb1fc74686b0070935f8dcf23c13a5623b94ca1a`; authoritative post-merge main CI #398 (run `34247079386`) SUCCESS; CLOSED by `SYNC-P0-900`; strictly docs-only scope (6 forward commits, 14 changed files under `docs/`, zero runtime/schema/migration/API/UI/auth/CI/deploy mutation); no additional correction/re-entry task emerged from review/CI; P2-001..P2-004 registered for downstream delivery | Trigger fired 2026-09-08 via explicit Product Owner authority; T42, T45, T46 |

## P1 — Governance/business foundation

### Homeroom responsibility

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P1-010` Homeroom responsibility architecture closure | `CLOSED` | `P0-001` | Date-effective retained GVCN product/authorization/history semantics; no schema yet | T13, T14; PR #93; reviewed head `c125a0b1224c23fa1cf15d31123a9f5338ab8a4f`; independent GitHub diff review PASS after historical-eligibility correction; PR CI #333 SUCCESS; merge/main `5cbfe8b25c1e40b1fb7d0a5b524b823c689c0463`; post-merge main CI #334 SUCCESS; closed by `SYNC-P1-010`; follow-up boundaries T43/T44 registered in P4 |
| `P1-011` Homeroom persistence foundation | `CLOSED` | `P1-010` | Schema/migration/invariants for retained HomeroomAssignment history | T13, T14; PR #95; reviewed head `ae5515d63fb38987e9479ea69b3425b1e910a11a`; independent GitHub diff review PASS; exact-head PR CI #337 SUCCESS including isolated PostgreSQL migration behavior; merge/main `7530022d9027e0ba94add9ca25b70822c87b792a`; post-merge main CI #338 SUCCESS; closed by `SYNC-P1-011`; no correction/re-entry task required |
| `P1-012` Homeroom control plane | `CLOSED` | `P1-011` | Capability-controlled create/change/end/correct/read/resolve, same-transaction audit, bounded SERIALIZABLE conflict handling, retained historical resolution and command-layer regression for correction lineage | T13, T14; PR #97; final reviewed head `6af8bb27367763bec143a6bf26e7af22115394e1`; independent GitHub diff review PASS; exact-head PR CI #343 (run `33825153273`) SUCCESS; merge/main `3bf0589db17534700d8c8a15ce59645663d3ef40`; post-merge main CI #344 (run `33825691809`) SUCCESS; closed by `SYNC-P1-012`; review/CI forward corrections absorbed before merge, no separate correction/re-entry task required |
| `P1-012A` Homeroom historical identity read-model correction | `CLOSED` | `P1-012` | Homeroom-capability-scoped bounded historical User identity discovery plus server-owned business-date read model required by P1-013; no new GVCN authority and no `USER_MANAGE` dependency | T13, T14; registration commit `c7f3d860549b324eb5daf65eed79c9c534096be5`; PR #99; reviewed head `a13a69dca60bef6f99c124f420affa8196b7822a`; independent GitHub review PASS; exact-head PR CI #347 (run `33832457894`) final SUCCESS after attempt 1 npm-registry 503 and successful targeted retry, with no dependency/vulnerability finding; merge/main `530f418d3e144826cd801f572d6367bb679d398a`; post-merge main CI #348 (run `33834641625`) SUCCESS; closed by `SYNC-P1-012A`; no separate correction/re-entry task required |
| `P1-013` Homeroom administration workspace | `CLOSED` | `P1-012A` | Bounded admin/PHT UI using frozen backend contracts; no UI-invented authority | T13, T14; branch `feat/homeroom-administration-workspace-013`; canonical start `3f8a1763991cc53c9767638ba380aff7ce66e4f2`; final reviewed head `7f8514237bef5868162f19941b31cef9ca9ff9b3`; independent GitHub diff review PASS; PR #101; exact-head PR CI #351 (run `33885773354`) SUCCESS; merge/main `b5bda19f79029851dda323f2cf20ee86308fdd04`; post-merge main CI #352 (run `33886718375`) SUCCESS; closed by `SYNC-P1-013`; no correction/re-entry task required |

### Business configuration

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P1-020` Business Configuration Control Plane architecture | `CLOSED` | `P0-001` | Typed/versioned business-policy families, effectivity/history, capability boundary and explicit separation from technical secrets/env | T21, T22; ADR-046 accepted; canonical start `28fc52dd0f62a78eda97a3e631770be47d465efa`; branch `docs/business-configuration-architecture-020`; original architecture commit `03475e28e09bb414b692d9ba375805f76a1298b6`; final reviewed head `21d4e743ec34a654f046d23eb701427f8f4dac64`; independent GitHub architecture review PASS; PR #104; final exact-head CI #360 / run `33984667141` SUCCESS; merge/main `98e06d65d68f15c63009596d8a164f0d53f2c872`; post-merge main CI #361 / run `33985130852`) SUCCESS; CLOSED by `SYNC-P1-020`; existing Playwright harness defect was independently corrected through PR #105 before final P1-020 CI; no P1-020 semantic correction/re-entry task required |
| `P1-021` Business Configuration persistence/control plane | `CLOSED` | `P1-020` | Approved policy persistence, lifecycle, authorization, audit and exact historical reads | T21, T22; branch `feat/business-configuration-persistence-control-plane-021`; canonical start `836e56ca3277986c72139080a8da70ea78796a3f`; final reviewed head `b188d02ffb1ecd974e72ead205f26ccc9f6f308d`; independent GitHub review PASS; PR #107; exact-head PR CI #367 (run `34032770124`) SUCCESS; merge/main `04dcafa80b2ce0142e258e5d587a60c48df3f418`; post-merge main CI #368 (run `34034146835`) SUCCESS; CLOSED by `SYNC-P1-021`; review/CI forward corrections absorbed before merge; no separate correction/re-entry task required; production registry intentionally empty; no deployment/production behavior claimed |
| `P1-022` Business Configuration administration workspace | `CLOSED` | `P1-021` | PHT/admin UI for approved business policy only; no access to secrets/TLS/database/process settings | T21, T22; branch `feat/business-configuration-administration-workspace-022`; canonical start `d9e546f3ee3f29dba139eeed400ea888eaf5e902`; final reviewed head `cf1ec8c394edcdd0c4a0e416c6a35708fa6f331d`; independent GitHub review PASS; PR #109; exact-head PR CI #371 (run `34044755481`) SUCCESS; merge/main `fd3248e57124c948998bd78ec69d1341da2a08c1`; post-merge main CI #372 (run `34045209071`) SUCCESS; CLOSED by `SYNC-P1-022`; review forward corrections absorbed before merge; no separate correction/re-entry task; production backend family registry intentionally empty; production UI adapter registry intentionally empty; no deployment/production mutation |

### Delayed go-live policy

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P1-031` Operational-start policy implementation | `CLOSED` | `P1-021`, `P1-030`, `P2-003` | Dedicated task branch `feat/operational-start-policy-implementation-031`; starting canonical base `13a87538b38312a2dfb482c358b17ac23f4b2ee8`; final reviewed head `2bf98156f93db47bb986e8e803a137563eadcf18`; independent GitHub review PASS after bounded forward corrections; PR #133 (`feat(policy): implement operational-start authority`); exact-head PR CI #440 (run `34856758210`) SUCCESS; merge/main `a5ee3190171bd5f617a4f32f029328547a0dd37a`; authoritative post-merge main CI #441 (run `34857669684`) SUCCESS on attempt 2 after attempt 1 exposed one unrelated/flaky existing Web auth-flow unit assertion; same merge tree contained no file delta from reviewed PR head and the complete workflow passed on rerun. Delivered scope: `OPERATIONAL_START` production family, v1 strict validator, `ACADEMIC_YEAR` resource, active-calendar validation, lifecycle restrictions (no RETIRE, prospective REPLACE, post-boundary CORRECTION, direct-publish guard), typed resolver, ordinary curricular execution guards, ProgressDebt pre-op no-auto-debt, historical allocator replay retained, live reporting single policy authority, ReportingStatement SNAPSHOT_V2, V1 backward compatibility, pinned operational-start provenance. No schema/migration, no public contract expansion, no Web UI change, no deploy; production remains strictly PRE-OPERATIONAL; CLOSED by `SYNC-P1-031`. A post-closure continuity audit registered P1-031A, P1-031B, and P1-031C (now all CLOSED; P1-032 is CLOSED by `SYNC-P1-032`) | T28, T30 |
| `P1-031A` Operational-start authority continuity correction | `CLOSED` | `P1-031`, `P1-031B` | Dedicated implementation branch `fix/operational-start-authority-continuity-031a-v2`; canonical starting main `adeade858c2bc7aeac22ee77f8b2a08faf5c438b`; final independently reviewed head `38055d4489ea89d764a56b605ef65598c4218013`; independent GitHub review PASS; parent PR #137 (`feat(policy): enforce operational-start authority continuity`); exact-head PR CI #450 (run id: `35119301326`) SUCCESS on attempt 1; merge/main commit `f19ec01d293c1c3da6ff46ebc257c9a43630112e`; authoritative post-merge main CI #451 (run id: `35120681315`) SUCCESS on attempt 1; CLOSED by `SYNC-P1-031A`. Review/CI forward corrections absorbed before merge: (1) `1c79328134c83c5051711b57c50e1f88714950d9` `fix(policy): split scheduled authority enum migration` (resolved PostgreSQL enum transaction sequencing defect exposed by CI #448); (2) `38055d4489ea89d764a56b605ef65598c4218013` `fix(test): verify deferred scheduled authority constraints` (resolved Prisma 5.14 deferred-COMMIT test observability discovered by CI #449; production migration/runtime semantics were not weakened). Delivered finite-authority and replacement-continuity corrections plus complete P1-031B scheduled-authority lifecycle: additive zero-backfill migration/DB constraints, retained status/lineage/evidence, guarded exact HTTP/shared contracts, resolver/read serialization, server-owned actions, atomic audit/idempotency/concurrency behavior and regression coverage. No residual correction/re-entry task emerged from review/CI; zero production deploy/config/data mutation; production remains strictly PRE-OPERATIONAL. The old branch `fix/operational-start-authority-continuity-031a` at remote head `6b7b804a5e82fc54fb280424e82b66d4b48db955` remains bounded pre-architecture evidence only, not canonical. Downstream `P1-032` is CLOSED by `SYNC-P1-032` following closure of `P1-031A` and options read seam `P1-031C` (`CLOSED` by `SYNC-P1-031C`) | T28, T30 |
| `P1-031B` Operational-start scheduled-authority supersession architecture | `CLOSED` | `P1-031` | Docs-only architecture on `docs/operational-start-scheduled-authority-supersession-031b`; starting canonical base `f1b160be25045d0f4c661e154ece24c92a3e0fc9`; architecture commits `4c6292f93ab2c50d79f415d0291b3f0c84118108`, `b23afcf18dbd69bde8227b4c5b06adb49554bfcc`, `17e36cdfc75906eb4ba5dcf3ad67941caf3c8d43`; final reviewed head `17e36cdfc75906eb4ba5dcf3ad67941caf3c8d43`; independent GitHub architecture review PASS after two bounded forward corrections; PR #135 (`docs(policy): define scheduled authority supersession`); exact-head PR CI #444 (run `35059422741`) SUCCESS attempt 1; merge/main `59fef75bfed7e96bb8ca2a396603256f2285402f`; authoritative post-merge main CI #445 (run `35059916674`) SUCCESS attempt 1; CLOSED by `SYNC-P1-031B`. Accepted command/status/same-start open successor/dedicated lineage, repeated retained chain, guarded HTTP/shared/read/action authority, SERIALIZABLE/CAS/idempotency/audit contract and OPERATIONAL_START-only DB family backstop without weakening GiST; `CORRECTION` is not expanded. Strictly docs-only; zero runtime/schema/migration/API implementation/UI/auth/CI/deploy/production mutation; production remains PRE-OPERATIONAL with zero backfill | T28, T30 |
| `P1-031C` Operational-start Academic-Year options read-model enablement | `CLOSED` | `P1-021`, `P1-031` | Dedicated implementation branch `feat/business-configuration-academic-year-options-031c`; starting canonical base `2df682f2eb76f813418560673bbdabe4c31e9154`; implementation commit `01c6f28e1cbdeb3cf4a29f9c3df929111546df9a`; final independently reviewed head `ee478c5a7e6976a554c738482ba580b23784a2c8`; independent GitHub review PASS after one bounded docs-only forward correction round; parent PR #140 (`feat(policy): add AcademicYear options read model`); exact-head PR CI #456 (run id: `35209248425`) SUCCESS; merge/main commit `1403906282c5ef63d17d1053c72e5ed47b4fa080`; authoritative post-merge main CI #457 (run id: `35229426600`) SUCCESS on attempt 1; CLOSED by `SYNC-P1-031C`. Delivered `GET /api/business-configuration/academic-year-options` under existing `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` capability; shared contracts `BusinessPolicyAcademicYearOption` and `BusinessPolicyAcademicYearOptionListResponse`; bounded DTO `ListBusinessPolicyAcademicYearOptionsDto` (`page >= 1`, `1 <= pageSize <= 100`); deterministic ordering `code ASC` then `id ASC`; 5 new focused unit tests (72/72 service unit tests pass); integration suite updated with complete 7-case authorization matrix, 4-item fixture pagination and non-mutation assertions; no correction or re-entry task; zero schema/migration/auth/capability/UI/deploy/production mutation; production remains strictly PRE-OPERATIONAL. Unlocks downstream `P1-032` (now `CLOSED` by `SYNC-P1-032`) | T21, T28 |
| `P1-032` Operational-start admin UI integration | `CLOSED` | `P1-022`, `P1-031`, `P1-031A`, `P1-031C` | Dedicated task branch `feat/operational-start-admin-ui-integration-032`; starting canonical base `95d88867e85e7177ce7ae12adc4ec942f1567656` (PR #141 post-closure CI #459 SUCCESS); final independently reviewed head `d510982250aa1d54e2aa63594a30ba78af76f971`; independent GitHub diff review PASS after one bounded forward correction round (`d510982250aa1d54e2aa63594a30ba78af76f971` `fix(policy): correct P1-032 review evidence and error copy`); parent PR #142 (`feat(policy): add operational-start administration UI`); exact-head PR CI #460 SUCCESS; merge/main commit `adfa62e9a92dcfc83cf0ab2e805d206a86a682e6`; authoritative post-merge main CI #461 (run id: `35249023817`) SUCCESS on attempt 1; CLOSED by `SYNC-P1-032`. Delivered `OPERATIONAL_START/v1/ACADEMIC_YEAR` production UI adapter, AcademicYear options read picker via P1-031C endpoint, server-owned `allowedActions` authority, dedicated scheduled-authority supersession workflow, open-ended create (no `effectiveUntil`), effectivity-preserving correction, `SUPERSEDED_BEFORE_EFFECTIVE` retained audit/lineage rendering; targeted Business Configuration workspace: 56/56 PASS, full Web unit: 288/288 PASS across 18/18 suites, Web lint/typecheck/build PASS, workflow contract PASS; zero backend/contracts/schema/auth/migration/deploy mutation; production remains strictly PRE-OPERATIONAL | T28, T30 |

## P2 — School data ingestion

### Curricular component realignment

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P2-001` PPCT curricular-component architecture re-entry | `CLOSED` | `P0-900` | Architectural re-entry closure: `docs/requirements/P2-001-PPCT-CURRICULAR-COMPONENT-ARCHITECTURE-AUDIT.md`, `docs/requirements/P2-001D-PPCT-CURRICULAR-COMPONENT-DECISION-CLOSURE.md`, and accepted `docs/decisions/ADR-048-PPCT-CURRICULAR-COMPONENT-ARCHITECTURE.md`; all 15 P0-900 architecture decisions closed (component topology, immutable item UUID component with `(id, ppctPlanId, component)`, duplicated revision coordinate with composite FK `(ppctItemId, ppctPlanId, component)`, database-backed lineage coordinate `component` with composite FKs, `(ppctVersionId, component, sequence)` uniqueness, atomic single-version package, `PpctClassCurricularProfile` on class association with inclusive `effectiveFrom`/`effectiveUntil` and PostgreSQL daterange/GiST exclusion backstop, mid-week split fail-closed `PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`, deterministic weekly routing on `AcademicWeekSegment` union, CalendarInterruption-gap non-consumption semantics, mid-week cutover with calendar split fail-closed `PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`, atypical week fail-closed `PPCT_COMPONENT_WEEK_CAPACITY_INVALID`, planning classification preceding operational suppression, prohibited cross-component lineage `PPCT_COMPONENT_LINEAGE_CROSS_COMPONENT`, legacy mapping to CORE/CORE_ONLY, derived execution/report provenance); strictly docs-only; branch `docs/ppct-curricular-component-architecture-001`; P2-001 CLOSED by `SYNC-P2-001` | T45, T46 |
| `P2-002` PPCT component persistence + control-plane realignment | `CLOSED` | `P2-001` | Component persistence and control-plane realization | T45, T46 |
| `P2-003` Component-aware PPCT allocation and curricular projections | `CLOSED` | `P2-002` | Deterministic component-aware weekly routing allocator, independent progression coverage, progress/debt/late projection realignment, and execution/report provenance | T45, T46 |
| `P2-004` Specialized-study class-subject administration workspace | `CLOSED` | `P2-003` | Capability-gated administrative UI for managing class-subject specialized-study applicability with effectivity and audit trails | T45, T46 |

### School PPCT workbook ingestion

| Task | Status | Depends on | Deliverable / closure | Trigger / notes |
|---|---|---|---|---|
| `P2-010` PPCT real-workbook contract/security audit | `BLOCKED_EVIDENCE` | `P2-001` | Read authoritative school PPCT workbook/template; determine exact physical sheet names, columns, identity, replay, and error contracts mapping physical sheets to logical CORE and SPECIALIZED_STUDY components | Trigger: actual authoritative school workbook supplied; T24, T45 |
| `P2-020` PPCT native importer implementation | `PLANNED` | `P2-002`, `P2-010` | Import pipeline using approved PPCT contract; no guessed mapping | T24, T45 |

### Native timetable workbook adapter (CLOSED)

| Task | Status | Depends on | Deliverable / closure | Trigger / traceability |
|---|---|---|---|---|
| `P2-030` Đam San TKB native-workbook architecture audit | `CLOSED` | `P0-001` | Authoritative four-sheet school TKB audit and accepted ADR-047 | T25-T27 |
| `P2-040` Đam San TKB native adapter implementation | `CLOSED` | `P2-030` | Native adapter on top of canonical importer; class/teacher peer cross-check; fail-closed mismatch | T25, T26 |
| `P2-050` Morning/afternoon selective update and carry-forward | `CLOSED` | `P2-040` | Independently author morning or afternoon while creating one coherent retained canonical version; untouched session explicitly carried forward | T27 |

### School-wide effective teaching schedule

| Task | Status | Depends on | Deliverable / closure | Trigger / traceability |
|---|---|---|---|---|
| `P2-060` School-wide effective teaching schedule architecture closure | `IN_PROGRESS` | `P2-050`, `P4-040` | Docs-only closure on branch `docs/school-wide-effective-schedule-authority-060` from canonical main `162ebbaa05d3755dca9c8308ffcaf37fc19d44c3`; define `SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1`, explicit `TEACHER_BASE` school-wide read authority, effective occupancy composition from timetable + overlays + make-up + SpecialActivity, fail-closed blocked/ambiguous semantics, real-interval comparison, Vietnamese Teacher Workspace UX, data minimization and P2-061 regression contract; deliver `P2-060-SCHOOL-WIDE-EFFECTIVE-TEACHING-SCHEDULE-ARCHITECTURE.md` + proposed ADR-051; zero runtime/schema/API/UI/deploy mutation | Explicit Product Owner/BGH requirement 2026-09-21; T47 |
| `P2-061` School-wide effective teaching schedule read model + Teacher Workspace | `PLANNED` | `P2-060` | Implement schema-free effective-schedule projection, bounded public read-only API/contracts guarded by `TEACHER_BASE`, searchable teacher dropdown, `Lịch của tôi`, `Toàn trường`, selected-teacher weekly view and `So sánh với lịch của tôi`; fully Vietnamese UI; no teacher-side mutation and no change to admin business authority | T47; non-startable until P2-060 is `CLOSED` |

## P3 — Historical go-live and continuity

| Task | Status | Depends on | Deliverable / closure | Trigger / traceability |
|---|---|---|---|---|
| `P3-010` Pre-operational historical execution architecture | `PLANNED` | `P1-031`, `P2-003`, `P2-020`, `P2-050` | Historical evidence/reconciliation contract; provenance, correction, PPCT allocation and no-auto-debt invariants | T28–T30 |
| `P3-020` Pre-operational history ingestion/reconciliation runtime | `PLANNED` | `P3-010` | Controlled import/confirmation API and bounded UI for historical taught evidence; exact audit and reconciliation | T29, T30 |
| `P3-030` Public make-up scheduling re-entry architecture | `DEFERRED_WITH_TRIGGER` | `P3-010` | Re-audit exact incomplete-obligation proof, authority, collision and correction before public scheduling | Trigger: chosen pilot scope requires public make-up scheduling; T08 |
| `P3-031` Public make-up scheduling runtime | `DEFERRED_WITH_TRIGGER` | `P3-030` | Create/reverse/read runtime only after P3-030 closes | Same trigger as P3-030; remains non-startable unless trigger fires and P3-030 becomes CLOSED; T08 |

## P4 — Special programmes and workload

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P4-010` GDĐP/HĐTN programme architecture closure | `CLOSED` | `P0-001`, `P1-010` | Accepted ADR-050 programme architecture | T12, T15–T17, T43, T44 |
| `P4-020` Special-programme persistence + control plane | `CLOSED` | `P1-012`, `P4-010` | Retained programme master/version/topic/occurrence/slot/staffing persistence and lifecycle | T16, T17 |
| `P4-030` Programme coordinator authorization | `CLOSED` | `P4-020` | Coordinator/BGH authority, guarded programme planning surface | T18, T44 |
| `P4-040` Programme-to-SpecialActivity runtime bridge | `CLOSED` | `P4-030` | Deterministic materialization into SpecialActivity, historical GVCN provenance, replacement and attestation runtime | T12, T17, T31, T43, T44 |
| `P4-050` Special-activity workload/reporting projection | `CLOSED` | `P4-040` | Execution + attestation workload gate, strict policy coefficients, anti-fan-out and reporting freeze | T19, T20, T44 |
| `P4-060` Workload adjustment architecture | `DEFERRED_WITH_TRIGGER` | `P1-020` | Close reduction/percentage/override semantics, effectivity and frozen-report provenance | Trigger: chosen pilot/official reporting scope claims adjusted workload; T23 |
| `P4-061` Workload adjustment implementation | `DEFERRED_WITH_TRIGGER` | `P1-021`, `P4-060` | Implement accepted adjustment policy without hardcoded fallback | Same trigger as P4-060; remains non-startable unless trigger fires and P4-060 becomes CLOSED; T23 |
| `P4-070` Special-programme workbook / timetable-slot bridge architecture | `IN_REVIEW` | `P2-050`, `P4-040`, `P4-050` | Accepted ADR-052 and P4-070 architecture: retained timetable-owned `GDDP`/`HDTN_HN` marker evidence; AcademicWeek/date-effective slot resolution; HĐTN CLASS/GRADE/SCHOOL_WIDE collapse; GDĐP grade collapse; exact count and identity fail-closed rules; DRAFT-only import confirmation; P4-040/P4-050 reuse; fully Vietnamese frontend contract; docs only | T48 |
| `P4-071` Retained TKB special-programme marker bridge | `PLANNED` | `P4-070`, `P2-050` | Schema/migration + native TKB persistence for exact GDDP/HDTN_HN marker children; semantic checksum integration; morning/afternoon carry-forward; internal retained marker resolver; no fake TimetableEntry/teacher/workload | T48 |
| `P4-072` HĐTN-HN workbook importer | `PLANNED` | `P4-071`, `P4-020`, `P4-030`, `P1-012` | Vietnamese inspect/preview/confirm flow for agreed 7-column HĐTN-HN workbook; official-week resolution; CLASS historical GVCN; GRADE/SCHOOL_WIDE exact marker collapse; exact teacher identity; exact-count blockers; idempotent DRAFT programme import only | T48 |
| `P4-073` GDĐP workbook importer | `PLANNED` | `P4-071`, `P4-020`, `P4-030` | Vietnamese inspect/preview/confirm flow for agreed 5-column GDĐP workbook; PPCT/week parsing; exact staff-code resolution; complete grade marker collapse; exact-count blockers; idempotent DRAFT programme import only | T48 |
| `P4-074` Special-programme import lifecycle and E2E closure | `PLANNED` | `P4-072`, `P4-073`, `P4-040`, `P4-050` | Admin/coordinator workspace, explicit confirm, bounded publish/materialize orchestration through existing P4 lifecycle, provenance/idempotency, end-to-end HĐTN CLASS/GRADE/SCHOOL_WIDE and GDĐP GRADE regression, no class fan-out, downstream workload/effective-schedule verification | T48 |

## P5 — Pilot product closure

| Task | Status | Depends on | Deliverable / closure | Notes |
|---|---|---|---|---|
| `P5-010` Pilot business scope + cross-domain freeze | `PLANNED` | `P0-003` | End-to-end regression closure for the exact chosen pilot claim; exact additional P1-P4 dependencies must be registered when P0-003 closes | CORE vs FULL decision controls required domain set; no hidden partial-total claim |
| `P5-020` PWA production baseline | `PLANNED` | `P5-010` | Manifest/icons/service worker/update strategy; no offline caching of sensitive `/api`/auth/reporting data | T32 |
| `P5-030` Dedicated Báo giảng Telegram integration | `PLANNED` | `P5-010` | Dedicated bot/token/webhook; one-time short-lived linking; idempotent notifications; no DamSanV5 bot reuse | T33 |

## P6 — Production readiness and controlled pilot

| Task | Status | Depends on | Deliverable / closure | Trigger / traceability |
|---|---|---|---|---|
| `P6-005` Production VPS topology decision | `BLOCKED_DECISION` | `P0-001` | Explicit Product Owner selection of exactly one topology: `SHARED_VPS` or `DEDICATED_VPS`. Production OS remains Windows Server 2022 in either topology; domain may remain `baogiang.dtnt-damsan.edu.vn`; no application/business-layer redesign is implied by choosing a dedicated VPS. No agent may infer a topology from current infrastructure. P6-010 MUST NOT start until P6-005 is CLOSED. The Product Owner must be explicitly asked for the choice when this gate is reached. | Topology decision gate; T34 |
| `P6-010` Pre-deploy TLS/HTTP-01 authority | `PLANNED` | `P6-005` | Repo-side port-80 ACME challenge + redirect authority, separate Báo giảng PEM/renewal/reload lifecycle, collision tests. Decision behavior: If `SHARED_VPS` is selected: continue P6-010 using shared-host/protected-neighbour semantics. If `DEDICATED_VPS` is selected: before P6-010 implementation/authority work, audit existing production/TLS/runbook assumptions for shared Nginx, protected foreign roots, foreign tasks/processes and shared PostgreSQL/Nginx topology; determine whether the explicit Product Owner decision triggers `P0-900` under T42; if P0-900 is triggered, STOP until that governance rebase is CLOSED. Neither outcome is pre-selected. | T34 |
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
