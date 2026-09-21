# Current Project Status

## Authority

This is the canonical mutable **product/task status** document for Báo giảng. Historical phase reports, `README.md`, `docs/PROJECT_CONTEXT.md` and roadmap text may summarize this status but must not contradict it.

It is **not** a self-referential registry of the latest Git commit. Exact current `main`, branch HEAD and divergence must always be read directly from Git/GitHub at the start of every task. SHAs recorded here are evidence for the stated baseline or last closed major task.

**Status snapshot date:** 2026-09-21

## Active / next critical path

`P2-060` — School-wide effective teaching schedule architecture closure — is **CLOSED** by `SYNC-P2-060` following parent PR #154 merge (`fe22ab373536814cfe279d66d58418df0143e44e`) and authoritative post-merge CI #490 SUCCESS. `ADR-051` is **Accepted**.

Active major task:
- `P4-070` — Special-programme workbook slot bridge architecture — is currently `IN_REVIEW` on branch `docs/special-programme-workbook-slot-bridge-070`, not yet `CLOSED`.

Eligible next task:
- `P2-061` — School-wide effective teaching schedule read model + Teacher Workspace — is **READY** (unlocked by `P2-060` closure; implementation not yet started; must not be described as implemented).

Remain:
- `P2-010` — PPCT real-workbook contract/security audit — **BLOCKED_EVIDENCE** (pending authoritative school PPCT workbook/template).
- `P2-020` — PPCT native importer implementation — **PLANNED** (pending `P2-010`).

Production environment remains strictly **PRE-OPERATIONAL**. No production deployment or mutation has occurred. P2-060 delivered strictly docs-only architecture and specification closures (`ADR-051`, `P2-060-SCHOOL-WIDE-EFFECTIVE-TEACHING-SCHEDULE-ARCHITECTURE.md`, `P2-061-SCHOOL-WIDE-EFFECTIVE-TEACHING-SCHEDULE-IMPLEMENTATION-TASK.md`) with zero runtime, schema, migration, API, UI, capability catalog, CI/CD, or deployment mutation.

## Last closed major task

`P2-060` — School-wide effective teaching schedule architecture closure — **CLOSED** by `SYNC-P2-060`.

Closure evidence:
- dedicated architecture branch: `docs/school-wide-effective-schedule-authority-060`;
- canonical starting main base: `162ebbaa05d3755dca9c8308ffcaf37fc19d44c3`;
- final independently reviewed parent HEAD: `9ada66aad842d029435b9924a1f1f4cfaa63d773`;
- parent PR: #154 (`docs(timetable): require school-wide effective teacher schedule`);
- exact-head PR CI: CI #486 (run `35554722752`), SUCCESS on attempt 1;
- merge/main commit: `fe22ab373536814cfe279d66d58418df0143e44e`;
- normal merge: YES;
- GitHub verified merge signature: YES;
- authoritative post-merge main CI: CI #490 (run `35573948097`), SUCCESS on attempt 1 (event: `push`, branch: `main`, exact SHA: `fe22ab373536814cfe279d66d58418df0143e44e`);
- post-merge CI #490 passed all suites: Windows deployment contract, lint, typecheck, API unit tests, Web unit tests, capability integration, API integration, builds, and Playwright smoke;
- delivered scope:
  - strictly docs-only architecture specification (5 docs files, 589 additions, 0 deletions);
  - `ADR-051-SCHOOL-WIDE-EFFECTIVE-TEACHING-SCHEDULE-READ-MODEL.md` (Accepted);
  - `P2-060-SCHOOL-WIDE-EFFECTIVE-TEACHING-SCHEDULE-ARCHITECTURE.md` (CLOSED);
  - `P2-061-SCHOOL-WIDE-EFFECTIVE-TEACHING-SCHEDULE-IMPLEMENTATION-TASK.md` (READY for implementation);
  - canonical `SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1` read profile;
  - authenticated `TEACHER_BASE` explicit school-wide read authority;
  - effective occupancy composed from timetable + overlays + make-up + SpecialActivity (including materialized GDĐP/HĐTN-HN);
  - fail-closed blocked/ambiguous semantics (never rendered as empty or `Trống`);
  - real-time interval comparison (`So sánh với lịch của tôi`) providing informational occupancy overlap without claiming mutation eligibility;
  - centralized mutation authority preserved (read-only; no teacher-side mutation; `SYSTEM_ADMIN` does not imply teacher authority);
  - Vietnamese Teacher Workspace UX and data minimization rules;
  - zero runtime, schema, migration, API, UI, auth, capability catalog, CI/CD, or deployment mutation;
- independent exact-diff review: PASS; no correction or re-entry task emerged;
- closed by administrative closure: `SYNC-P2-060`;
- downstream: `P2-061` unlocked to `READY`;
- production remains strictly **PRE-OPERATIONAL**.

Predecessor closed major task: `P4-050` — Special-activity workload/reporting projection — **CLOSED** by `SYNC-P4-050`.

Closure evidence:
- dedicated implementation branch: `feat/special-programme-workload-reporting-050`;
- canonical starting main base: `8709b12253fbbb8ba2e4f65be3e6d5d5f5e5372e`;
- final feature head: `5a7659a9d242a9b50c487259b348cb1dce082d88`;
- parent PR: #152 (`feat(reporting): add P4-050 special programme workload projection`);
- exact-head PR CI: CI #482 (run `35504549933`), SUCCESS on attempt 1;
- merge/main commit: `8501ea3ce8920b5bccdb3e43273c51b493319496`;
- normal merge: YES;
- GitHub verified merge signature: YES;
- authoritative post-merge main CI: CI #483 (run `35504905999`), SUCCESS on attempt 1 (event: `push`, branch: `main`, exact SHA: `8501ea3ce8920b5bccdb3e43273c51b493319496`);
- delivered scope:
  - schema-free on-demand special-programme workload projection;
  - ACTIVE-at-as-of execution plus existential qualifying programme-attestation dual gate;
  - exact maximum one contribution per `(plannedOccurrenceSlotId, actualTeacherUserId)`;
  - no class-target or attestation-count workload fan-out;
  - reversal/replacement as-of semantics;
  - fail-closed retained provenance and duplicate/ambiguous identity handling;
  - strict `SPECIAL_PROGRAMME_WORKLOAD` / `v1` / `ACADEMIC_YEAR` business policy with no default or fallback coefficient;
  - Reporting Statement `SNAPSHOT_V3` with workload, execution, programme, policy and attestation provenance;
  - V1/V2 historical readability retained;
  - generic ad-hoc `SpecialActivity` without programme materialization receives no programme workload;
  - P4-060/P4-061 adjustment and reduction semantics untouched;
  - no workload schema or migration added;
  - no production deployment or mutation;
- bounded correction story: initial implementation/review line reached `fe63c12d5f26ddbf183964a2fdf05b656996ce85`; independent remote audit hardening `475dffbe94a288dc76464689827e2fe31f86dbd8`; CI fixture alignment `1d66230b1a60b57b01b46bcca418f6cb1e7348d9`; final HTTP V3 and CI artifact guard correction `5a7659a9d242a9b50c487259b348cb1dce082d88`;
- feature PR legitimately changed `.github/workflows/ci.yml` to avoid a false secondary screenshot-artifact failure when Playwright was skipped while retaining fail-closed upload behavior when Playwright runs;
- closed by administrative closure: `SYNC-P4-050`;
- production remains strictly **PRE-OPERATIONAL**.

Predecessor closed major task: `P4-040` — Programme-to-SpecialActivity runtime bridge — **CLOSED** by `SYNC-P4-040`.

Closure evidence:
- dedicated implementation branch: `feat/programme-runtime-bridge-040`;
- starting canonical main base: `3564b5a5c2f8659c1bc2b19d779ce83cb621f65e`;
- final independently reviewed HEAD: `591192fa635fd3a10ec3379a29f8450700c804d4`;
- independent review + forward-fix story: initial remote audit required explicit retained relational evidence on historical staffing to restore named check constraint `special_activity_staffing_eligibility_shape_check` and complete homeroom assignment provenance verification in `programme_materialized_activity_guard`; all findings absorbed via forward migration `20260920010000_programme_runtime_bridge_staffing_homeroom_evidence` and forward commit `591192fa635fd3a10ec3379a29f8450700c804d4`; final exact-remote audit returned `AUDIT PASS`;
- parent PR: #150 (`feat(programme): add P4-040 runtime bridge and attestation`);
- PR details: exact base `3564b5a5c2f8659c1bc2b19d779ce83cb621f65e`, exact head `591192fa635fd3a10ec3379a29f8450700c804d4`, normal merge to main;
- exact-head PR CI: CI #476 (run id: `35482927399`), SUCCESS on attempt 1;
- merge/main commit: `107bf295a4c7031062b0b37bf7bd343f1f667066`;
- normal merge: YES;
- GitHub verified signature: YES;
- authoritative post-merge main CI: CI #477 (run id: `35483252074`), SUCCESS on attempt 1 (event: `push`, branch: `main`, exact SHA: `107bf295a4c7031062b0b37bf7bd343f1f667066`);
- delivered scope:
  - deterministic materialization of published occurrences into 1..N SpecialActivity roots (v1: 1 root per exact planned slot);
  - exact Slot -> Set<Teacher> preservation;
  - collision/eligibility reuse and target class freezing;
  - HĐTN CLASS homeroom resolution with historical retrospective rule;
  - explicit retained relational evidence via `SpecialActivityStaffing.historicalHomeroomAssignmentId` backed by restored `special_activity_staffing_eligibility_shape_check` constraint;
  - dedicated retained `ProgrammeMaterializedActivity` bridge model with enhanced `programme_materialized_activity_guard` validating coherent provenance and complete homeroom assignment provenance;
  - command idempotency via `ProgrammePlanningCommand`;
  - post-materialization CAS reversal and replacement root creation (T43);
  - `ProgrammeOccurrenceAttestation` persistence, qualification seam consumption, retained reversal, actor-scoped idempotency keys, and existential confirmation gate read model (T44);
  - guarded HTTP surface under `/api/programme-planning`;
  - zero workload calculation or UI;
  - production remains strictly PRE-OPERATIONAL;
  - closed by administrative closure: `SYNC-P4-040`;
  - downstream: `P4-050` was unlocked to `READY` and is now **CLOSED** by `SYNC-P4-050`.

Predecessor closed major task: `P4-030` — Programme coordinator authorization — **CLOSED** by `SYNC-P4-030`.

Closure evidence:
- dedicated implementation branch: `feat/programme-coordinator-authorization-030`;
- starting canonical main base: `ab4324e0094203bcab9fbfef9d4c4e952f46f48f`;
- final independently reviewed HEAD: `1f49f7f4d3cda83126373bb4df7ac6d31ce54859`;
- independent review + forward-fix story: initial exact-remote review found (1) stale/mutually inconsistent governance state, (2) stale ADR-050 downstream ownership wording, (3) stale T12/T15/T16/T17 state, (4) wrong ADR filenames in requirement doc, and (5) insufficient persisted PostgreSQL evidence for denial/no-inference cases; all findings were absorbed by forward commits `7ac3afe38cf6919716061b57947f56af632195c5` and `1f49f7f4d3cda83126373bb4df7ac6d31ce54859`; final exact-remote audit before PR returned `AUDIT PASS` with zero remaining implementation/governance findings;
- parent PR: #148 (`feat(programme): implement P4-030 coordinator authorization`);
- PR details: exact base `ab4324e0094203bcab9fbfef9d4c4e952f46f48f`, exact head `1f49f7f4d3cda83126373bb4df7ac6d31ce54859`, 16 changed files, 4 commits, no unresolved review submission or thread at merge gate;
- exact-head PR CI: CI #472 (run id: `35420533601`), SUCCESS on attempt 1;
- merge/main commit: `08d235ded260e38171f38409e7e2783c9c1f41f2`;
- normal merge: YES;
- GitHub verified signature: YES;
- authoritative post-merge main CI: CI #473 (run id: `35420832787`), SUCCESS on attempt 1 (event: `push`, branch: `main`, exact SHA: `08d235ded260e38171f38409e7e2783c9c1f41f2`);
- post-merge CI #473 evidence includes:
  - `Windows deployment contract`: SUCCESS;
  - `Lint · Typecheck · Test · Build`: SUCCESS;
  - production dependency security gate: SUCCESS;
  - Prisma validate/generate: SUCCESS;
  - schema/static gates: SUCCESS;
  - secret scan: SUCCESS;
  - capability catalog synchronization integration: SUCCESS;
  - full API integration: SUCCESS;
  - contracts/config/API/Web builds: SUCCESS;
  - Playwright smoke: SUCCESS;
  - `Upload Playwright report on failure`: SKIPPED by design because no failure occurred;
- local/review verification evidence:
  - local Programme Planning unit suite: `92/92` PASS;
  - local capabilities integration: `6/6` PASS;
  - local coordinator authorization PostgreSQL integration: `31/31` PASS;
  - capability-catalog CI gate: SUCCESS;
  - git diff --check PASS;
- delivered scope:
  - exact coordinator authority: `ACTIVITY + exact ProgrammeMaster.id`;
  - `GDDDP_COORDINATOR` only for GDDP;
  - `HĐTN_COORDINATOR` only for HDTN_HN;
  - BGH professional fallback: `APPROVAL_PRINCIPAL / SCHOOL_WIDE` or `APPROVAL_VICE_PRINCIPAL / SCHOOL_WIDE`;
  - BGH-only ProgrammeMaster bootstrap invariant;
  - coordinator grant target/kind normalization hardening in `CapabilitiesService`;
  - deterministic programme planning authorization service (`ProgrammePlanningAuthorizationService`);
  - authorized façade (`AuthorizedProgrammePlanningService`);
  - raw P4-020 service encapsulated (internal provider only);
  - guarded `/api/programme-planning` HTTP surface (`SessionAuthGuard` + `CsrfOriginGuard`);
  - server-owned child relation resolution;
  - body/route mismatch rejection before service mutation;
  - query list isolation ensuring non-BGH coordinators view only authorized masters;
  - `mustChangePassword` fail-closed;
  - persisted denial audit (`action: 'AUTHORIZATION_DENIED'`, `result: 'DENIED'`, zero secrets);
  - P4-040 attestor-qualification seam only (`isQualifyingProgrammeAttestor`);
- zero schema/migration, zero Web UI, zero SpecialActivity materialization, zero attestation persistence/runtime, zero workload/reporting projection, zero deployment or production mutation;
- no correction or re-entry task emerged from independent review or CI;
- production remains strictly PRE-OPERATIONAL;
- closed by administrative closure: `SYNC-P4-030`;
- downstream: `P4-040` is unlocked to `READY`; `P4-050` remains dependency-gated by `P4-040`.

Predecessor closed major task: `P4-020` — Special-programme persistence + control plane — **CLOSED** by `SYNC-P4-020`.

Closure evidence:
- dedicated implementation branch: `feat/programme-persistence-control-plane-020`;
- starting canonical main base: `969d12d4f2f3e8ea3c66768daa3b35b4ccaa2fc0`;
- final independently reviewed HEAD: `d8cb42614514f81ae16239a59c69e2da1f8ef246`;
- independent exact-diff review: `AUDIT PASS`, zero BLOCKER/HIGH/MEDIUM/LOW findings after bounded forward fixes for PostgreSQL verification fixtures, partial occurrence target persistence, and exact plan-successor lineage;
- parent PR: #146 (`feat(programme): implement P4-020 planning persistence control plane`);
- exact-head PR CI: CI #468 (run id: `35370624212`), SUCCESS on attempt 1;
- merge/main commit: `b68064e887f8646515e2820bd26423a5f9483f09`;
- normal merge: YES;
- GitHub verified signature: YES;
- authoritative post-merge main CI: CI #469 (run id: `35409557624`), SUCCESS on attempt 1;
- post-merge CI #469 evidence includes:
  - `Lint · Typecheck · Test · Build`: SUCCESS;
  - `Windows deployment contract`: SUCCESS;
  - all substantive workflow steps SUCCESS;
  - `Upload Playwright report on failure`: SKIPPED by design because no failure occurred;
- delivered scope:
  - retained `ProgrammeMaster`, `ProgrammePlanVersion`, `ProgrammeTopicItem`, `PlannedProgrammeOccurrence`, `PlannedOccurrenceSlot`, `PlannedSlotStaffing`, and planning-command receipt persistence;
  - retained `DRAFT -> PUBLISHED -> SUPERSEDED` plan/occurrence lifecycle with forward lineage rather than overwrite;
  - exact `PlannedOccurrenceSlot -> Set<Teacher>` staffing topology with no Cartesian slot/teacher multiplication;
  - target-shape and GDDP/HDTN mode invariants, academic-year and civil-date weekday slot integrity, retained-history guards, and immutable published children;
  - optimistic/CAS revision checks, PostgreSQL `SERIALIZABLE` transactions, bounded retry, deterministic idempotency fingerprint + command type, and same-transaction audit;
  - successor-plan publication guard requiring exact predecessor/current-published authority match before supersession;
  - partial occurrence edits persist against resolved target mode so omitted `mode` cannot null a valid GRADE/CLASS target;
- verification evidence includes 39/39 targeted programme-planning unit tests, PostgreSQL integration, both special-programme SQL verifiers, Prisma validate/generate, lint, typecheck and static gates, followed by authoritative CI #468/#469;
- no public HTTP controller, coordinator/BGH capability binding, SpecialActivity materialization, attestation persistence/runtime, workload/reporting projection, deployment, or production mutation was introduced;
- no correction or re-entry task emerged from independent review or CI;
- production remains strictly PRE-OPERATIONAL;
- closed by administrative closure: `SYNC-P4-020`;
- downstream: `P4-030` is unlocked to `READY`; `P4-040` and `P4-050` remain dependency-gated.

Predecessor closed major task: `P4-010` — GDĐP/HĐTN programme architecture closure — **CLOSED** by `SYNC-P4-010`.

Closure evidence:
- dedicated architecture branch: `docs/gddp-hdtn-programme-architecture-010`;
- starting canonical main base: `df8fdadc7e57d284e92cd336e234d95e8820cdc4` (PR #143 post-closure CI #463 SUCCESS);
- final independently reviewed HEAD: `0763d15b428ebfa09ca551493deb0d872fcf1287`;
- independent GitHub review: PASS after four bounded forward-fix commits following the initial architecture commit; all review findings were absorbed before parent merge;
- parent PR: #144 (`docs(architecture): define GDĐP HĐTN programme authority`);
- exact-head PR CI: CI #464 (run id: `35329948987`), SUCCESS on attempt 1;
- merge/main commit: `10de700723610efb6a79a0f62f8d6fc9f4ce44a3`;
- normal merge: YES;
- GitHub verified signature: YES;
- authoritative post-merge main CI: CI #465 (run id: `35331263693`), SUCCESS on attempt 1;
- post-merge CI #465 evidence includes:
  - Windows deployment contract: SUCCESS
  - Lint · Typecheck · Test · Build: SUCCESS
  - all substantive steps SUCCESS
  - `Upload Playwright report on failure`: SKIPPED by design because no failure occurred;
- local/review verification evidence:
  - workflow contract PASS (`verify-workflow-contract.cjs`)
  - git diff --check PASS;
- delivered scope (strictly docs-only under `docs/**`):
  - delivered `ADR-050-GDDP-HDTN-PROGRAMME-ARCHITECTURE.md` (Accepted) and `docs/requirements/P4-010-GDDP-HDTN-PROGRAMME-ARCHITECTURE-CLOSURE.md`;
  - closed upstream programme layer placed upstream of `SpecialActivity`;
  - GDĐP programme authority bounded by `AcademicYear + Grade` (Grades 10, 11, 12) with versioned content plan independent of weekly rotation;
  - HĐTN educational programme operating under distinct business modes: `CLASS` (tied to date-effective homeroom responsibility), `GRADE`, and `SCHOOL_WIDE`;
  - exact per-slot staffing ($\text{Slot} \to \text{Set<Teacher>}$) strictly prohibiting Cartesian $\text{Slots} \times \text{Teachers}$ multiplication;
  - materialization bridge partitioning: one planned occurrence materializes into $1 \to N$ `SpecialActivity` roots partitioned by identical scheduled staffing sets;
  - HĐTN `CLASS` deterministically consumes date-effective `HomeroomAssignment` via fail-closed resolver and freezes homeroom provenance upon materialization;
  - decoupled absence and scheduled staffing: absence does not delete scheduled staffing, rewrite planning truth, or auto-cancel occurrences; absent teacher receives zero execution and zero workload;
  - replacement representation: substitutes cannot execute on original staffing records; pre-materialization replacement reflects via planning lifecycle; post-materialization replacement uses standard CAS reverse + replacement `SpecialActivity` root;
  - existential programme confirmation gate: satisfied if and only if $\ge 1$ qualifying current, non-reversed attestation exists from qualifying Programme Coordinator OR qualifying BGH professional authority (no role/title/department inference); dual confirmation satisfies gate exactly once;
  - official workload eligibility requires BOTH valid individual teacher-slot participation execution AND satisfied programme confirmation gate; at most one contribution source per exact slot before valid policy/coefficients;
  - anti-double-counting invariants: class cardinality never multiplies teacher workload ($\text{Workload} \ne \text{Slots} \times \text{ClassCount}$); attestation count never multiplies workload ($\text{Workload} \ne \text{Slots} \times \text{AttestationCount}$);
  - exact authorization binding belongs to `P4-030` (current catalog keys are authorization intent/evidence only);
  - exact attestation runtime persistence, schema, and status representation belong to `P4-040`;
  - workload calculation logic and policy coefficients belong to `P4-050`;
- zero runtime, schema, migration, contracts, API, UI, capability catalog, CI/CD, or deployment mutation;
- no correction or re-entry task emerged from independent review or CI;
- production remains strictly PRE-OPERATIONAL;
- closed by administrative closure: `SYNC-P4-010`.

Predecessor closed major task: `P1-032` — Operational-start admin UI integration — **CLOSED** by `SYNC-P1-032`.

Closure evidence:
- dedicated implementation branch: `feat/operational-start-admin-ui-integration-032`;
- starting canonical main base: `95d88867e85e7177ce7ae12adc4ec942f1567656` (PR #141 post-closure CI #459 SUCCESS);
- final independently reviewed HEAD: `d510982250aa1d54e2aa63594a30ba78af76f971`;
- independent GitHub review: PASS after one bounded forward correction round (`d510982250aa1d54e2aa63594a30ba78af76f971` `fix(policy): correct P1-032 review evidence and error copy`);
- parent PR: #142 (`feat(policy): add operational-start administration UI`);
- exact-head PR CI: CI #460, SUCCESS;
- merge/main commit: `adfa62e9a92dcfc83cf0ab2e805d206a86a682e6`;
- normal merge: YES;
- GitHub verified signature: YES;
- authoritative post-merge main CI: CI #461 (run id: `35249023817`), SUCCESS on attempt 1;
- post-merge CI #461 evidence includes:
  - Production dependency security gate PASS
  - Prisma validate PASS
  - Prisma generate PASS
  - schema/static verification PASS
  - auth secret scan PASS
  - deployment static/behavior verification PASS
  - workflow contract PASS
  - PowerShell parser verification PASS
  - UI foundation static verification PASS
  - migration foundation tests PASS
  - lint packages/contracts PASS
  - lint packages/config PASS
  - lint apps/api PASS
  - lint apps/web PASS
  - typecheck packages/contracts PASS
  - typecheck packages/config PASS
  - typecheck apps/api PASS
  - typecheck apps/web PASS
  - API unit tests PASS
  - Web unit tests PASS
  - isolated auth DB preparation PASS
  - capability catalog synchronization integration PASS
  - API integration tests PASS
  - contracts/config/API/Web builds PASS
  - isolated Playwright DB preparation PASS
  - Reporting Statement fixture PASS
  - API/UI technical admin bootstrap PASS
  - Playwright browser install PASS
  - API/Web startup + readiness PASS
  - Playwright smoke PASS
  - UI screenshot artifact PASS
  - Windows deployment contract PASS
  - Windows PowerShell parsing PASS
  - Windows deployment behavior fixtures PASS
  (`Upload Playwright report on failure` SKIPPED by design due to no test failures);
- local/review verification evidence:
  - targeted Business Configuration workspace: 56/56 PASS
  - full Web unit: 288/288 PASS across 18/18 suites
  - Web lint PASS (0 warnings)
  - Web typecheck PASS (0 errors)
  - Web build PASS (clean dist)
  - workflow contract PASS
  - git diff --check PASS;
- delivered scope: `OPERATIONAL_START/v1/ACADEMIC_YEAR` production adapter in `apps/web/src/lib/business-policy-ui-registry.ts`, AcademicYear options read picker via P1-031C endpoint (`GET /api/business-configuration/academic-year-options`) and `supersedeScheduledAuthority` client method in `apps/web/src/lib/business-configuration-api.ts`, server-owned `allowedActions` authority (`actionEvaluationCivilDate` displayed without browser-clock inference), dedicated scheduled-authority supersession workflow (`SUPERSEDE_SCHEDULED_AUTHORITY`), open-ended create without `effectiveUntil`, effectivity-preserving correction, `SUPERSEDED_BEFORE_EFFECTIVE` retained audit and lineage rendering;
- zero backend (`apps/api/**`), contracts (`packages/contracts/**`), schema/migration (`prisma/**`), auth/capability, CI/CD, or deployment mutation;
- no correction or re-entry task emerged from independent review or CI;
- production remains strictly PRE-OPERATIONAL;
- closed by administrative closure: `SYNC-P1-032`.

Predecessor closed major task: `P1-031C` — Operational-start Academic-Year options read-model enablement — **CLOSED** by `SYNC-P1-031C`.

Closure evidence:
- dedicated implementation branch: `feat/business-configuration-academic-year-options-031c`;
- starting canonical main base: `2df682f2eb76f813418560673bbdabe4c31e9154`;
- implementation commit: `01c6f28e1cbdeb3cf4a29f9c3df929111546df9a`;
- final independently reviewed HEAD: `ee478c5a7e6976a554c738482ba580b23784a2c8`;
- independent GitHub review: PASS after one bounded docs-only forward correction round;
- parent PR: #140 (`feat(policy): add AcademicYear options read model`);
- exact-head PR CI: CI #456 (run id: `35209248425`), SUCCESS;
- merge/main commit: `1403906282c5ef63d17d1053c72e5ed47b4fa080`;
- authoritative post-merge main CI: CI #457 (run id: `35229426600`), SUCCESS on attempt 1;
- post-merge CI #457 evidence includes:
  - production dependency security gate PASS
  - Prisma validate/generate PASS
  - schema/static verification PASS
  - workflow contract PASS
  - contracts/config/API/Web lint PASS
  - contracts/config/API/Web typecheck PASS
  - API unit tests PASS
  - Web unit tests PASS
  - isolated capability synchronization integration PASS
  - API integration tests PASS
  - contracts/config/API/Web builds PASS
  - Playwright preparation/bootstrap PASS
  - Playwright smoke PASS
  - Windows deployment contract PASS;
- local implementation evidence already recorded:
  - Business Configuration service suite: 72/72 PASS
  - exactly 5 new focused academicYearOptions unit tests
  - local PostgreSQL integration was NOT_RUN because no certified isolated `TEST_DATABASE_URL` was available
  - authoritative integration evidence was supplied by GitHub CI #456 and post-merge CI #457;
- delivered scope: `GET /api/business-configuration/academic-year-options` under existing `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` capability; shared contracts `BusinessPolicyAcademicYearOption` and `BusinessPolicyAcademicYearOptionListResponse`; bounded DTO `ListBusinessPolicyAcademicYearOptionsDto` (`page >= 1`, `1 <= pageSize <= 100`, default page 1, default pageSize 20); deterministic ordering `code ASC` then `id ASC`; payload includes `id`, `code`, `name`;
- no correction or re-entry task emerged from independent review or CI;
- zero schema/migration/auth/capability/UI/deploy/production mutation occurred;
- production remains strictly PRE-OPERATIONAL;
- closed by administrative closure: `SYNC-P1-031C`;
- downstream: unlocked `P1-032` (now `CLOSED` by `SYNC-P1-032`).

Predecessor closed major task: `P1-031A` — Operational-start authority continuity correction — **CLOSED** by `SYNC-P1-031A`.

Closure evidence:
- dedicated implementation branch: `fix/operational-start-authority-continuity-031a-v2`;
- starting canonical main base: `adeade858c2bc7aeac22ee77f8b2a08faf5c438b`;
- final independently reviewed HEAD: `38055d4489ea89d764a56b605ef65598c4218013`;
- independent GitHub review: PASS;
- parent PR: #137 (`feat(policy): enforce operational-start authority continuity`);
- exact-head PR CI: CI #450 (run id: `35119301326`), SUCCESS on attempt 1;
- merge/main commit: `f19ec01d293c1c3da6ff46ebc257c9a43630112e`;
- authoritative post-merge main CI: CI #451 (run id: `35120681315`), SUCCESS on attempt 1;
- CI #451 passed: schema migration foundation, all lint, all typecheck, API unit, Web unit, isolated API integration, contracts/config/API/Web builds, Playwright preparation/bootstrap, Playwright smoke, UI screenshot artifact, and Windows deployment contract;
- review/CI corrections absorbed before parent merge:
  1. `1c79328134c83c5051711b57c50e1f88714950d9` `fix(policy): split scheduled authority enum migration` (resolved PostgreSQL enum transaction sequencing defect exposed by CI #448);
  2. `38055d4489ea89d764a56b605ef65598c4218013` `fix(test): verify deferred scheduled authority constraints` (resolved Prisma 5.14 deferred-COMMIT test observability discovered by CI #449; production migration/runtime semantics were not weakened);
- delivered scope: finite-authority and replacement-continuity corrections, complete P1-031B scheduled-authority lifecycle (`SUPERSEDE_SCHEDULED_AUTHORITY` command / `SUPERSEDED_BEFORE_EFFECTIVE` terminal state), additive zero-backfill migration, database family backstop, exact same-start open successor, dedicated repeated lineage (`supersedesScheduledVersionId`), guarded HTTP/shared contracts, resolver/read serialization, server-owned actions, atomic audit/idempotency/concurrency behavior, and comprehensive regression coverage;
- no residual runtime correction/re-entry task remains from review/CI;
- zero production deployment/configuration/data mutation; production remains strictly PRE-OPERATIONAL;
- closed by administrative closure: `SYNC-P1-031A`;
- downstream: `P1-031A` is CLOSED; downstream `P1-031C` is CLOSED by `SYNC-P1-031C`; `P1-032` is `CLOSED` by `SYNC-P1-032`.

Predecessor closed major task: `P1-031B` — Operational-start scheduled-authority supersession architecture — **CLOSED** by `SYNC-P1-031B`.

Closure evidence:
- dedicated architecture branch: `docs/operational-start-scheduled-authority-supersession-031b`;
- starting canonical main base: `f1b160be25045d0f4c661e154ece24c92a3e0fc9`;
- architecture commits: `4c6292f93ab2c50d79f415d0291b3f0c84118108`, `b23afcf18dbd69bde8227b4c5b06adb49554bfcc`, `17e36cdfc75906eb4ba5dcf3ad67941caf3c8d43`;
- final reviewed HEAD: `17e36cdfc75906eb4ba5dcf3ad67941caf3c8d43`;
- independent GitHub architecture review: PASS after two bounded forward corrections;
- parent PR: #135 (`docs(policy): define scheduled authority supersession`);
- exact-head PR CI: CI #444 (run id: `35059422741`), SUCCESS on attempt 1;
- merge/main commit: `59fef75bfed7e96bb8ca2a396603256f2285402f`;
- authoritative post-merge main CI: CI #445 (run id: `35059916674`), SUCCESS on attempt 1;
- accepted architecture: distinct `SUPERSEDE_SCHEDULED_AUTHORITY` / `SUPERSEDED_BEFORE_EFFECTIVE` lifecycle, exact-same-start open successor, dedicated and repeatable retained lineage, exact guarded HTTP/DTO/result/shared-read contracts, server-owned actions, SERIALIZABLE/CAS/idempotency/audit atomicity, and OPERATIONAL_START-only database family-scope backstop without weakening generic GiST overlap protection; `CORRECTION` is not expanded;
- strictly docs-only architecture/governance scope; zero runtime/schema/migration/API implementation/UI/auth/CI/deploy/production mutation;
- production remains strictly PRE-OPERATIONAL; no production `OPERATIONAL_START` authority is configured/deployed and production backfill is zero;
- closed by administrative closure: `SYNC-P1-031B`;
- unlocks `P1-031A` to `READY` (now `CLOSED` by `SYNC-P1-031A`); `P1-031C` was registered as `READY` (now `CLOSED` by `SYNC-P1-031C`); `P1-032` is `CLOSED` by `SYNC-P1-032`.

Predecessor closed major task: `P1-031` — Operational-start policy implementation — **CLOSED** by `SYNC-P1-031`.

Closure evidence:
- dedicated implementation branch: `feat/operational-start-policy-implementation-031`;
- starting canonical main base: `13a87538b38312a2dfb482c358b17ac23f4b2ee8`;
- final reviewed implementation HEAD: `2bf98156f93db47bb986e8e803a137563eadcf18`;
- independent GitHub review: PASS after bounded forward corrections;
- parent PR: #133 (`feat(policy): implement operational-start authority`);
- exact-head PR CI: CI #440 (run id: `34856758210`), SUCCESS;
- merge/main commit: `a5ee3190171bd5f617a4f32f029328547a0dd37a`;
- authoritative post-merge main CI: CI #441 (run id: `34857669684`), SUCCESS on attempt 2;
- CI #441 attempt 1 failed one existing Web `auth-flow` unit assertion while the merge tree had zero file delta from reviewed PR head; the same tree had already passed complete CI #440 and passed the full post-merge workflow on #441 attempt 2, so that CI incident required no P1-031 semantic correction or re-entry. The later continuity finding was discovered independently and is registered under P1-031A/P1-031B;
- delivered scope: code-defined `OPERATIONAL_START` production family (`v1`, `ACADEMIC_YEAR`), strict payload validator, active-calendar validation, lifecycle restrictions (no RETIRE, initial-publish guard, prospective REPLACE, retained CORRECTION), typed fail-closed operational-start resolver, ordinary curricular execution guards, retained historical PPCT allocator replay, pre-operational no-auto-debt filtering, one live reporting policy authority per evaluation, ReportingStatement `REPORTING_STATEMENT_SNAPSHOT_V2` with pinned operational-start provenance, and retained V1 read compatibility;
- no Prisma schema/migration change, no public API contract expansion, no Web UI implementation, no deploy/VPS mutation;
- production remains strictly PRE-OPERATIONAL;
- closed by administrative closure: `SYNC-P1-031`;
- initially unlocked downstream P1-032; P1-031 branches into scheduled supersession (P1-031B -> P1-031A, both CLOSED) and the options read seam P1-031C (now CLOSED by `SYNC-P1-031C`); `P1-032` is `CLOSED` by `SYNC-P1-032`.

Predecessor closed major task: `P1-030` — Delayed go-live / operational-start architecture — **CLOSED** by `SYNC-P1-030`.

Closure evidence:
- dedicated task branch: `docs/delayed-go-live-operational-start-architecture-030`;
- starting canonical main base: `fafd104c9af5b83833b8a6f324021cea226ffe63`;
- final reviewed implementation HEAD: `c807d26a6a53609ac5259384661db52271460053`;
- independent GitHub architecture review: PASS after bounded forward corrections;
- parent PR: #131 (`docs(architecture): define operational-start policy`);
- exact-head PR CI: CI #435 (run id: `34707601649`), SUCCESS;
- merge/main commit: `c4ce704a67fab8e24e5bae3ac2ce81dbcb36c27d`;
- authoritative post-merge main CI: CI #436 (run id: `34728703082`), SUCCESS;
- accepted architecture: `ADR-049-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md` Accepted;
- closed by administrative closure: `SYNC-P1-030`;
- scope delivered: defined canonical `OPERATIONAL_START` policy family (`v1`, `ACADEMIC_YEAR`, payload `{ operationalStartDate: CivilDateString }`), locked Product Owner authorities PO-1..PO-4, expected PPCT progression via timetable replay, no-auto-debt invariants (`PRE_OPERATIONAL_UNCONFIRMED` excluding past unconfirmed periods from debt/late calculations), fail-closed missing policy, single boundary for CORE/SPECIALIZED_STUDY, and explicit boundaries with P1-031, P1-032, P3-010/020, and P4;
- strictly docs-only scope under `docs/**` (zero runtime, schema, migration, UI, auth, CI, or deployment mutation);
- no correction or re-entry task emerged from review or CI;
- production remains strictly PRE-OPERATIONAL;
- unlocks downstream: `P1-031` (`READY`, now CLOSED by `SYNC-P1-031`).

Predecessor closed major task: `P2-004` — Specialized-study class-subject administration workspace — **CLOSED** by `SYNC-P2-004`.

Closure evidence:
- dedicated implementation branch: `feat/ppct-specialized-study-admin-workspace-004`;
- starting canonical main base: `b5ccfb2b563ea0633aae97a03ac62076a102bb98`;
- final reviewed implementation HEAD: `7847b93de75b16d2a64e0e695705b5cdbd3b1cfb`;
- implementation evidence commits:
  - `98b977b0853e10d23da3e8af59088b35e53214ea` docs(ppct): define P2-004 administration workspace contract
  - `e7e71384ce34c02bcad2e5fd34be9ee5c787962e` docs(ppct): correct P2-004 workspace read model contract
  - `73cf71156c7e88ecee8fa9754a62450480f59d8c` feat(ppct): add administration workspace options
  - `521426189876a308cf729759cb05fce1d4a29ed1` test(ppct): correct workspace options integration fixtures
  - `94c36239c1ee1c5b2561d0d9ea98eaea2ce40fb5` feat(ppct): add specialized-study administration workspace
  - `5eb1ffcf645e817bff7a2a6d6919eae6ff3f8d7f` fix(ppct): harden workspace error and history semantics
  - `e40e2116c2e103a5c98ac0f930436ca7232cc9bd` docs(governance): move P2-004 to in review
  - `7847b93de75b16d2a64e0e695705b5cdbd3b1cfb` fix(ppct): close administration workspace review findings;
- independent GitHub review: PASS after one forward correction round absorbing review findings;
- parent PR: #129 (`feat(ppct): add specialized-study administration workspace`);
- exact-head PR CI: CI #428 (run id: `34695635149`), SUCCESS;
- merge/main commit: `a7b4a9035f04238d931f3e28f1dbac25f9b329ce`;
- authoritative post-merge main CI: CI #429 (run id: `34696063973`), SUCCESS;
- closed by administrative closure: `SYNC-P2-004`;
- delivered scope includes: `PPCT_MANAGE` capability-gated administration workspace, `SCHOOL_WIDE` and exact `SUBJECT` scoped authority, PPCT-specific academic-year/class/subject options read model (`/ppct-options/academic-years` and `/ppct-options/academic-years/:academicYearId`), route `/quan-tri/ppct/ap-dung-chuyen-de` (navigation "Áp dụng chuyên đề"), `CORE_ONLY` vs `CORE_PLUS_SPECIALIZED_STUDY` administration, target PUBLISHED PPCT version selection, specialized-content preflight query, retained class-subject association history table (latest distinction, open-ended `effectiveUntil=null`), CAS concurrency via `expectedLatestAssociationId`, server-side `PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT` error preservation with semantic error display;
- Windows integration caveat: full local Windows integration was not used as authoritative closure evidence due to intermittent PostgreSQL connectivity instability (default pool occasionally triggers P1001 `Can't reach database server at 127.0.0.1:5432`; controlled temporary process-local `connection_limit=1` eliminated P1001 but caused transaction acquisition starvation / timeouts across 4 suites; environment restored; no repo mutation; conclusion: "Evidence is consistent with Windows-local connection-pressure instability. Root transport mechanism is not proven"). Authoritative integration/E2E evidence was provided by canonical Linux CI #428 (PR) and #429 (post-merge main), both SUCCESS;
- zero schema/migration changes;
- no production deploy;
- no correction or re-entry task remains;
- production remains PRE-OPERATIONAL;
- unlocks downstream: next critical path `P1-030` (`READY`, now CLOSED by `SYNC-P1-030`).

Predecessor closed major task: `P2-003` — Component-aware PPCT allocation and curricular projections — **CLOSED** by `SYNC-P2-003`.

Closure evidence:
- dedicated implementation branch: `feat/ppct-component-aware-allocation-projections-003`;
- final reviewed implementation HEAD: `7348221f38ac2cb9b87fa18d169e0198041a23b7`;
- independent GitHub review: PASS after one forward correction round absorbing 4 correctness findings (One-opportunity week, Future calendar look-ahead, Future structural blockers/overlap, Forward-only week blockers);
- parent PR: #127 (`feat(ppct): add component-aware allocation and curricular projections`);
- exact-head PR CI: CI #423 (run id: `34626664097`), SUCCESS;
- merge/main commit: `c6c6a294f102f125306fdfc65ac64750d49b91cb`;
- authoritative post-merge main CI: CI #424 (run id: `34627529544`), SUCCESS;
- closed by administrative closure: `SYNC-P2-003`;
- runtime scope: deterministic component-aware weekly routing allocator (`PPCT_OCCURRENCE_ALLOCATION_V2`), independent progression coverage and completed/debt/gap projection (`TEACHING_PROGRESS_DEBT_V2`), timetable component readiness (`NORMAL_BASE_PPCT_COMPONENT_V2`), transaction-aware execution allocator for normal and makeup teaching, and ordinary reporting combining CORE and SPECIALIZED_STUDY totals;
- no schema/migration added;
- no production deploy;
- no correction or re-entry task remains;
- production remains PRE-OPERATIONAL;
- unlocks downstream: `P2-004` became `READY` (now `CLOSED` by `SYNC-P2-004`).

Predecessor closed major task: `P2-002` — PPCT component persistence + control-plane realignment — **CLOSED** by `SYNC-P2-002`.

Closure evidence:
- starting canonical base: `main@0594bbab58bf49a058ab4a744499366f3acbaf78`;
- baseline CI: CI #408 SUCCESS;
- dedicated implementation branch: `feat/ppct-component-persistence-control-plane-002`;
- final independently reviewed implementation head: `3d00ebc2bc5b3600104c3889b41c7e1432ae74d6`;
- independent GitHub review: PASS, including final referential-action correction (`onUpdate: Restrict`) and bounded scope verification;
- parent PR: #124 (`feat(ppct): add curricular component persistence control plane`);
- exact-head PR CI: CI #409 (run id: `34468164396`), SUCCESS;
- merge/main commit: `a3151b049d02f6cae9677d7b93b7df2086d421b3`;
- authoritative post-merge main CI: CI #410 (run id: `34468753060`), SUCCESS;
- merged file set: 24 changed files (1356 additions, 162 deletions), covering schema/migration, PPCT control plane/contracts/tests, CI verifiers/replay and governance docs;
- legacy PPCT data migration preserves retained UUIDs/business values while mapping existing item/revision/lineage rows to `CORE` and class associations to `CORE_ONLY`;
- component-bearing provenance FKs are explicitly `ON DELETE RESTRICT ON UPDATE RESTRICT`; stable item component is immutable; sequence uniqueness is component-scoped;
- `PpctClassCurricularProfile` and server-side `AcademicWeek`/segment-envelope split prevention are implemented;
- `TeachingAssignment`, `TimetableEntry`, `CurricularTeachingExecution` and `MakeupTeachingSchedule` remain component-free;
- no P2-003 allocator/progress/readiness runtime or P2-004 UI was smuggled into P2-002;
- no correction/re-entry task emerged from review or CI; no deployment/production mutation occurred;
- closed by administrative closure: `SYNC-P2-002`;
- downstream at P2-002 closure: `P2-003` was unlocked to `READY` (now `CLOSED` by `SYNC-P2-003`); `P2-004` is `CLOSED` by `SYNC-P2-004`; `P2-010` remains `BLOCKED_EVIDENCE` and therefore `P2-020` remains `PLANNED`.

Predecessor closed major task: `P2-001` — PPCT Curricular-Component Architecture Re-Entry — **CLOSED** by `SYNC-P2-001`.

Closure evidence:
- starting canonical `origin/main` base: `a58ba312913a519ed665d1d7fc701f87a7beccfb`;
- pre-task main CI: CI #400 (run id: `34250442087`), SUCCESS;
- dedicated task branch: `docs/ppct-curricular-component-architecture-001`;
- semantically final independently reviewed architecture head: `562ea83b41d2f6c123df08a01a48a0a0082ff92a`;
- independent architecture review: PASS;
- external dependency security-gate incident: CI #401 (run id: `34320711905`) failed at npm audit high gate due to upstream Multer advisory on pinned multer 2.2.0; repaired independently via PR #122 (`540c05d512de83f91598bfb1307baaaa8dbf6651`, CI #402 SUCCESS, merge `ff77a625abc51c89e782282241e5a3633e6391bf`, post-merge main CI #403 SUCCESS) without modifying P2-001 architecture semantics;
- final PR head after forward-merging security baseline: `b7585272558cfa872168f12e1a7c37357894bea8`;
- parent PR: PR #121 (`docs(ppct): close curricular-component architecture`);
- exact-head PR CI: CI #404 (run id: `34338997019`), SUCCESS;
- merge/main commit: `719bef92e58412da9ebd149663e6890da7626a85`;
- authoritative post-merge main CI: CI #405 (run id: `34340490592`), SUCCESS;
- closed by administrative closure: `SYNC-P2-001`;
- merged file set: 15 changed files (1125 additions, 39 deletions), strictly docs-only under `docs/**` (zero runtime/schema/migration/API/UI/auth/CI/deploy/production mutation);
- accepted authority: `ADR-048-PPCT-CURRICULAR-COMPONENT-ARCHITECTURE.md` Accepted;
- all 15 architecture questions from P0-900 Section 15 resolved;
- downstream delivery stream at P2-001 closure: `P2-002` (now `CLOSED` by `SYNC-P2-002`), `P2-003` (now `CLOSED` by `SYNC-P2-003`), `P2-004` (now `CLOSED` by `SYNC-P2-004`), `P1-030` (`READY`, now CLOSED by `SYNC-P1-030`), `P4-010` (now `CLOSED` by `SYNC-P4-010`), parallel workbook path `P2-010` (`BLOCKED_EVIDENCE`) -> `P2-020`.

Predecessor closed major task: `P0-900` — Authoritative specification rebase audit (PPCT Curricular Component Product-Authority Realignment) — **CLOSED** by `SYNC-P0-900` (merge `eb1fc74686b0070935f8dcf23c13a5623b94ca1a`, PR #119, PR CI #397 SUCCESS, post-merge main CI #398 SUCCESS).

Closure evidence:
- starting canonical main/base: `bdcfecbc92d9f129247ec40c7128bc6adc6ef8cf`;
- dedicated task branch: `docs/p0-900-ppct-curricular-component-rebase`;
- final independently reviewed parent head: `79532ff2ba621ab6d2c43ba7818e04c560d617ce`;
- independent GitHub review: PASS after two forward correction rounds;
- parent PR: #119 (`docs(governance): rebase PPCT curricular-component authority`);
- exact-head PR CI: CI #397 (run id: `34246372215`), SUCCESS;
- merge/main commit: `eb1fc74686b0070935f8dcf23c13a5623b94ca1a`;
- authoritative post-merge main CI: CI #398 (run id: `34247079386`), SUCCESS;
- closed by administrative closure `SYNC-P0-900`;
- merged file set: 14 changed files (6 forward commits), strictly bounded to `docs/` (zero apps/packages/prisma/.github/deploy/scripts changes, zero runtime/schema/migration/API/UI/auth/CI/deploy/production mutation);
- authoritative source blobs verified and unchanged: v1.2 (`c2c61a4e8acb9fde0e5fc5232467662048fd3380`), v1.3 (`5876af5920d12ea6fcecf42d1b8a392cc4825f16`); trigger was explicit Product Owner authority on 2026-09-08;
- no additional correction/re-entry task emerged from review or CI;
- downstream delivery stream registered at P0-900 closure: `P2-001`–`P2-004` (P2-001, P2-002, P2-003, and P2-004 are now `CLOSED`), parallel workbook path `P2-010` (`BLOCKED_EVIDENCE`) -> `P2-020`.

- Core realignment principles accepted into baseline:
  1. Normal curricular component taxonomy: `CORE` (phần cốt lõi) vs `SPECIALIZED_STUDY` (chuyên đề học tập). Specialized study is curricular, not an ad-hoc `SpecialActivity`.
  2. Shared master plan foundation: Both components belong to `AcademicYear + Subject + Grade` within the same curricular Subject domain; exact component lifecycle and version packaging model is defined by accepted ADR-048 and realized at persistence/control-plane layer by closed P2-002.
  3. Single Teaching Assignment: `TeachingAssignment` covers the class-subject; the assigned teacher teaches both `CORE` and `SPECIALIZED_STUDY`.
  4. Administrative applicability: Class-subject specialized study applicability is configured explicitly by administration; non-applicable items are `NOT_APPLICABLE` (not debt).
  5. Component-free TimetableEntry: Timetable assigns periods to subjects; `TimetableEntry` remains component-free.
  6. Weekly last-opportunity routing: In an `AcademicWeek`, for enabled class-subjects, chronologically LAST normal opportunity is `SPECIALIZED_STUDY`; earlier opportunities are `CORE`. Runtime realization belongs to P2-003. Operational disruptions do not dynamically reclassify planned components.
  7. Independent progression: `CORE` and `SPECIALIZED_STUDY` maintain independent sequential progression cursors; runtime realization belongs to P2-003.
  8. Combined reporting: Ordinary curricular statements report combined totals; downstream realization remains governed by P2-003.
  9. Preferred source direction: One workbook with separate logical content/sheets for ordinary PPCT (logical component CORE) and Chuyên đề học tập (logical component SPECIALIZED_STUDY); exact physical sheet names, spellings, and workbook structure remain unapproved and evidence-bound to P2-010.

Predecessor closed major task: `P2-050` — Morning/afternoon selective update and carry-forward (CLOSED by `SYNC-P2-050`, merge `42a0f058381a5b8faa6eb2d233481e48156523c6`, PR #116, PR CI #390 SUCCESS, post-merge main CI #391 SUCCESS).

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

P1-010 review also recovered and registered Special Programme boundaries T43/T44. P4-010 architecture, P4-020 planning persistence/control plane, P4-030 coordinator/BGH authorization, P4-040 runtime materialization/attestation, and P4-050 workload projection are now CLOSED.

## Accepted Business Configuration domain

`P1-020` (architecture), `P1-021` (persistence/control plane), `P1-022` (administration workspace), `P1-031` (operational-start backend family/runtime integration), `P1-031B` (scheduled-authority supersession architecture), `P1-031A` (authority continuity correction), `P1-031C` (Academic-Year options read-model enablement), and `P1-032` (Operational-start admin UI integration) are **CLOSED**. ADR-046 remains the generic Business Configuration architecture authority and ADR-049 remains the accepted operational-start authority. The foundation includes:

- separate retained `BusinessPolicyStream` / `BusinessPolicyVersion` / `BusinessPolicyCommand` persistence topology;
- `SCHOOL_WIDE` / `ACADEMIC_YEAR` exact resource semantics;
- DRAFT / PUBLISHED / REVERSED retained lifecycle;
- strict civil-date intervals;
- DB-backed published overlap prevention;
- exact historical validator-version resolution;
- prospective replacement and retirement in the generic platform, with the `OPERATIONAL_START` family applying its stricter no-RETIRE lifecycle;
- retained correction/reversal lineage;
- immutable published semantics;
- dedicated `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` authorization;
- capability-gated route `/quan-tri/chinh-sach-nghiep-vu`;
- `SYSTEM_ADMIN` alone does not grant access;
- typed code-defined UI adapters with triple identity (familyKey + validatorVersion + resourceKind);
- current versus historical validator handling;
- lifecycle workflows: create draft, edit, publish, prospective replace, retire, correct;
- exact-date resolver UI for families with implemented adapters;
- strict civil-date client arithmetic without local timezone drift;
- retained lifecycle/lineage evidence display;
- explicit query failures with retry;
- sanitized unknown server errors;
- fail-closed unsupported family/version/resource behavior;
- same-transaction audit;
- command idempotency receipts;
- bounded Serializable mutation retry;
- typed fail-closed resolver;
- `SystemSetting` exclusion;
- technical config/secrets exclusion (no raw JSON, no generic key/value editor);
- code-defined backend production registration of `OPERATIONAL_START / v1 / ACADEMIC_YEAR`, active-calendar validation, family-specific lifecycle restrictions, and typed resolver consumed by execution/progress/reporting paths.

The backend production policy registry contains only the reviewed `OPERATIONAL_START` family enabled by P1-031. P1-031C is CLOSED by `SYNC-P1-031C`, providing the Business Configuration-owned AcademicYear options read model (`GET /api/business-configuration/academic-year-options` under `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE`). The production Web UI adapter registry includes the reviewed `OPERATIONAL_START / v1 / ACADEMIC_YEAR` adapter delivered and CLOSED by `P1-032` (`SYNC-P1-032`). The generic administration workspace continues to fail closed for any unsupported policy editing UI. No production policy value has been configured or deployed.

## Accepted native timetable workbook architecture

`P2-030` (architecture), `P2-040` (native adapter implementation), and `P2-050` (morning/afternoon selective update and carry-forward) are **CLOSED**. `ADR-047-TKB-NATIVE-WORKBOOK-ARCHITECTURE.md` is accepted architecture authority for the real Đam San four-sheet timetable workbook and selective session workflow.

The authoritative Đam San timetable workbook (`TKB-LAN-1-TUAN-1-03.9.26-in.xlsx`, SHA-256 `3ea242433d1d291912749cf9f2f6b39b700847bfc09384dec9c6849b15597c72`, 38,974 bytes) was audited locally and implemented in `DamSanNativeTimetableAdapter`:
- dedicated `DamSanNativeTimetableAdapter` positioned upstream of canonical timetable importer;
- strict recognition of 4 sheets: `TKB THEO LỚP BUỔI SÁNG`, `TKB-GV-SANG`, `TKB THEO LỚP BUỔI CHIỀU`, `TKB-GV-CHIỀU`;
- strict boundary enforcement: class grid rows 7–36 (cols C..T, 18 classes), teacher grid rows 8–45 (cols B..AE, 38 staff rows), with non-slot headers (1–6) and footers (rows ≥ 37 in class, rows ≥ 46 in teacher) excluded;
- locked cell parser precedence: normalize -> blank (unscheduled) -> exact special non-peer allowlist (`CC`, `GDĐP`, `TN-HN`) -> teacher-linked token (`<SubjectCode>-<TeacherCode>` split at last hyphen with mandatory peer evidence); `TN-HN` is intercepted before hyphen-split;
- mandatory bidirectional peer reconciliation between class view and teacher view:
  - Morning: 402 teacher-linked slots reconcile 1:1 with 0 duplicate and 0 orphan (including 18 `SH` teacher-linked and 384 non-SH teacher-linked); 120 permitted non-peer special activity slots (`CC` = 18, `GDĐP` = 48, `TN-HN` = 54);
  - Afternoon: 53 teacher-linked slots reconcile 1:1 with 0 duplicate and 0 orphan (all non-SH teacher-linked);
  - Total across sessions: exactly 455 teacher-linked slots (= 437 non-SH teacher-linked + 18 SH teacher-linked);
  - Saturday schedule: Period 1 = `SH-<TeacherCode>` (18 slots, teacher-linked, reconciles 1:1; business label not asserted by P2-030 evidence); Periods 2–4 = `TN-HN` (54 slots, permitted non-peer); Period 5 = blank across all 18 classes in this workbook evidence (treated as evidence, not an immutable format invariant);
- teacher identity derivation contract:
  - teacher rows modeled structurally as `TeacherSourceRowRef = (sheet, rowNumber)`; Column A display text is untrusted source decoration / audit evidence only, never canonical identity authority;
  - active teacher rows structurally derive exactly one `TeacherCode` from matched class-view peers (33 morning rows and 4 afternoon rows each derive exactly 1 distinct code; any row with multiple codes fails closed with `TKB_NATIVE_TEACHER_CODE_CONFLICT`);
  - zero-allocation staff row (Row 25) is inert roster evidence (no derived code, no canonical User resolution, no failure);
  - canonical User resolution resolves the derived `TeacherCode` through exact `StaffProfile.staffCode` or approved `TimetableImportEntityAlias` (TEACHER) per ADR-024 (no fuzzy matching, no display-name matching, disagreement fails closed);
- fail-closed mismatch taxonomy (13 structured domain error codes);
- effective date extraction (`2026-09-07`) and server-side raw XLSX SHA-256 participating in `confirm-request-v1` request fingerprinting without persisting raw bytes or adding new receipt columns;
- sanitized structural test fixture `apps/api/test/fixtures/tkb/sanitized-dam-san-tkb-fixture.xlsx` generated with zero real teacher names and zero raw teacher codes (using synthetic `Giáo viên 01`..`Giáo viên 38` and `GV01`..`GV38`), preserving 100% of grid topology and reconciliation counts;
- selective morning/afternoon session authoring and carry-forward (P2-050):
  - `nativeSessionMode` (`BOTH` / `MORNING` / `AFTERNOON`), defaulting to `BOTH` when omitted; rejected on generic importer with `TIMETABLE_IMPORT_INVALID_SOURCE_FORMAT`;
  - source authority: `BOTH` requires exact four-sheet source; `MORNING` uses selected morning pair (Sheets 1 & 2); `AFTERNOON` uses selected afternoon pair (Sheets 3 & 4); unselected sheets are non-authoritative in selective mode;
  - ADR-020 date-effective canonical baseline lookup at `target.effectiveFrom` (`status in ['ACTIVE', 'SUPERSEDED']`, `effectiveFrom <= targetDate`, `effectiveUntil null OR >= targetDate`); fails closed with `TKB_NATIVE_CARRY_FORWARD_BASELINE_MISSING` if no effective baseline exists;
  - exact carry-forward of unauthored session rows preserving original canonical provenance IDs (`timeSlotDefinitionId`, `schoolClassId`, `subjectId`, `teachingAssignmentId`, `teacherUserId`); missing retained provenance fails closed with `TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID` without fabricated fallback objects;
  - full composed canonical validation (`evaluateTimetableEntries` mapped into preview issue vocabulary) blocking cross-session class/teacher wall-clock collisions (`CLASS_TIME_OVERLAP`, `TEACHER_TIME_OVERLAP`) and invalid entity states (`SLOT_NOT_ACTIVE`, `SLOT_NOT_REGULAR_TEACHING`, `CLASS_INACTIVE`, `SUBJECT_INACTIVE`, `TEACHER_INACTIVE`, `TEACHER_NOT_TEACHING_STAFF`, `ASSIGNMENT_COVERAGE_GAP`);
  - explicit selected-session clear/removal semantics (authored=0, carried=53, final=53, canConfirm=true);
  - full semantic checksum across composed canonical rows;
  - server-owned sentinels (`ALL_SHEETS`, `MORNING_SHEETS`, `AFTERNOON_SHEETS`) for request replay/idempotency;
  - bounded preview composition metadata (`mode`, `baselineTimetableVersionId`, `authoredEntryCount`, `carriedForwardEntryCount`, `finalEntryCount`).

`P2-040` and `P2-050` are closed by `SYNC-P2-040` and `SYNC-P2-050` respectively.

## Accepted governance authority

The following remain current governance/product authorities:

- `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md`;
- `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`;
- `docs/governance/PRE-PILOT-TASK-REGISTER.md`;
- `docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`;
- `docs/decisions/ADR-044-PRE-PILOT-PRODUCT-REALIGNMENT-GOVERNANCE.md`;
- `docs/decisions/ADR-045-HOMEROOM-RESPONSIBILITY.md`;
- `docs/decisions/ADR-046-BUSINESS-CONFIGURATION-CONTROL-PLANE.md`;
- `docs/decisions/ADR-047-TKB-NATIVE-WORKBOOK-ARCHITECTURE.md`;
- `docs/decisions/ADR-048-PPCT-CURRICULAR-COMPONENT-ARCHITECTURE.md`;
- `docs/decisions/ADR-049-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md`;
- `docs/decisions/ADR-050-GDDP-HDTN-PROGRAMME-ARCHITECTURE.md`.

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
- **native Đam San timetable workbook adapter (`DamSanNativeTimetableAdapter`), bidirectional peer reconciliation runtime, and selective session authoring with explicit carry-forward** on top of canonical import pipeline, four-sheet structural validation, selective morning/afternoon mode (`BOTH` / `MORNING` / `AFTERNOON`), locked parser precedence, `TeacherSourceRowRef` structural identity, exact derived teacher code resolution, fail-closed class/subject code + alias conflict handling, 455 normal curricular teacher-linked rows persisted to `TimetableEntry`, 120 special non-peer slots structurally validated without fabricating teacher assignments, transient raw XLSX SHA-256 participating in confirm request fingerprinting per ADR-021/026, ADR-020 date-effective canonical baseline resolution, exact unauthored-session carry-forward preserving canonical provenance without fallback fabrication, full composed canonical validation (`evaluateTimetableEntries`) and semantic checksum, and privacy-sanitized structural test fixture;
- component-aware PPCT persistence/control plane closed by P2-002, including stable component identity on `PpctItem`, component-aware revision/lineage provenance, per-component sequence uniqueness, `PpctClassCurricularProfile`, legacy CORE/CORE_ONLY migration and server-side business-week profile split prevention;
- operational overlays;
- SpecialActivity minimum-core persistence/runtime with exact slots, frozen classes, staffing and class/teacher/time collision checks;
- **retained GDĐP/HĐTN programme planning persistence/control plane closed by P4-020 and coordinator/BGH authorization closed by P4-030**, including `ProgrammeMaster`, retained plan versions/topic items, prospective planned occurrences, exact slots and `Slot -> Set<Teacher>` staffing, DRAFT/PUBLISHED/SUPERSEDED lineage, DB hardening, CAS, SERIALIZABLE bounded retry, idempotency receipts and same-transaction audit; exact coordinator authority (`ACTIVITY + exact ProgrammeMaster.id`), `GDDDP_COORDINATOR` and `HĐTN_COORDINATOR` strict binding, BGH professional authority (`APPROVAL_PRINCIPAL` / `APPROVAL_VICE_PRINCIPAL`, `SCHOOL_WIDE`), BGH-only bootstrap invariant, coordinator grant target/kind normalization hardening, guarded `/api/programme-planning` HTTP surface, server-owned relation resolution, body/route mismatch rejection, list/query isolation, fail-closed `mustChangePassword`, persisted denial audit, qualification seam for attestation validation, runtime materialization and attestation persistence closed by P4-040, and downstream workload/reporting projection closed by P4-050;
- PPCT occurrence allocation (P2-003 component-aware weekly routing, independent progression and downstream projection runtime closed by P2-003 and merged to main);
- specialized-study class-subject administration workspace (P2-004 capability-gated applicability administration, options read model, target version selection, specialized-content preflight, retained association history and CAS concurrency closed by P2-004 and merged to main);
- curricular TeachingExecution and SpecialActivityParticipationExecution evidence;
- proof-based progress/debt/late projection;
- reporting projection and public reporting read path;
- Personal Reporting Projection;
- Reporting Statement persistence/control plane/UI enablement/product UI work;
- **retained Business Configuration persistence, control plane and administration workspace** (separate BusinessPolicyStream / BusinessPolicyVersion / BusinessPolicyCommand topology, strict civil-date intervals, DB-level non-overlapping published exclusion, retained replacement and reversal/correction lineage, immutable published payload, exact historical validator-version resolution, dedicated `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` capability, capability-gated route `/quan-tri/chinh-sach-nghiep-vu`, typed/version-aware UI adapter architecture with triple identity, lifecycle UI for draft/edit/publish/replace/retire/correct, historical typed rendering, exact-date resolver UI, bounded Serializable mutation retry, idempotency receipts, same-transaction audit, sanitized errors and typed fail-closed resolver);
- **operational-start backend authority and UI integration**: backend closed by P1-031 (`OPERATIONAL_START / v1 / ACADEMIC_YEAR` production registration, strict validator/calendar/lifecycle rules, typed fail-closed resolver, execution guards, pre-op no-auto-debt projection, retained allocator replay, single-authority reporting integration, and ReportingStatement SNAPSHOT_V2 provenance); P1-031B defines the distinct never-effective scheduled-authority lifecycle, and its P1-031A runtime realization is CLOSED by `SYNC-P1-031A`; `P1-031C` is CLOSED by `SYNC-P1-031C` (providing AcademicYear options read model); and `P1-032` is CLOSED by `SYNC-P1-032` (delivering production Web UI integration for operational-start administration);
- hardened Windows production deployment control-plane/runbooks through PR #90.

Homeroom architecture, persistence, control plane/capability, historical read model and administration workspace UI are closed for the registered pre-pilot scope. Business Configuration architecture (P1-020), persistence/control plane (P1-021), administration workspace (P1-022), and operational-start backend implementation (P1-031) are closed for their registered pre-pilot scopes. P2-030 native timetable workbook architecture/evidence, P2-040 native adapter runtime implementation, P2-050 selective morning/afternoon update and carry-forward, P2-002 PPCT component persistence/control plane, P2-003 component-aware allocation/projections runtime, P2-004 specialized-study administration workspace, P4-010 special-programme architecture, P4-020 special-programme planning persistence/control plane, P4-030 programme coordinator authorization, P4-040 programme runtime bridge, and P4-050 special-programme workload/reporting projection are closed.

## Pre-pilot verdict

**NOT READY FOR TEACHER PILOT YET.**

The registered implementation, data-evidence, product and production-readiness tasks remain.

## Critical pre-pilot gaps

1. GDĐP/HĐTN programme architecture (P4-010), retained planning persistence/control plane (P4-020), coordinator/BGH authorization (P4-030), runtime materialization + attestation (P4-040), and workload/reporting projection (P4-050) are CLOSED; workload reduction/adjustment semantics remain trigger-gated under P4-060/P4-061.
2. GDĐP `AcademicYear + Grade` and HĐTN `CLASS/GRADE/SCHOOL_WIDE` planning models and mutation commands are guarded by authorized HTTP surfaces (`/api/programme-planning`) and coordinator/BGH domain authorization (P4-030); Web UI remains downstream.
3. Exact programme `Slot -> Set<Teacher>` planning persistence, authorization, deterministic materialization and provenance into SpecialActivity are closed by P4-020/P4-030/P4-040; downstream workload/reporting projection is closed by P4-050.
4. Special-program absence/replacement and programme-level confirmation architecture is closed (T43/T44); prospective planning replacement and qualification seam are closed by P4-030; post-materialization CAS reversal/replacement and attestation persistence/runtime are closed by P4-040.
5. Coordinator and BGH professional authorization bindings are CLOSED by P4-030 (`ACTIVITY + exact ProgrammeMaster.id`, `APPROVAL_PRINCIPAL` / `APPROVAL_VICE_PRINCIPAL`, `SCHOOL_WIDE`); programme attestation persistence/runtime is closed by P4-040 and workload eligibility/reporting projection by P4-050.
6. Operational-start backend/runtime authority (P1-031), scheduled-authority supersession architecture (P1-031B), authority continuity correction (P1-031A), options read-model enablement (P1-031C), and administration Web UI integration (P1-032) are CLOSED; while historical evidence workflow remains P3-010/P3-020.
7. PPCT real-school import is intentionally blocked pending an authoritative workbook contract; preferred direction is one workbook with separate logical content for ordinary PPCT (CORE) and Chuyên đề học tập (SPECIALIZED_STUDY), with exact physical sheet names and structure evidence-bound to P2-010.
8. Workload reduction, percentage, override and manual adjustment semantics remain trigger-gated/deferred under P4-060/P4-061.
9. WorkloadAdjustmentRule remains trigger-gated/deferred.
10. Installable PWA baseline is absent.
11. Dedicated Báo giảng Telegram bot/linking/notification lifecycle is absent.
12. First-certificate HTTP-01/Nginx authority for the Báo giảng subdomain is incomplete.
13. Actual VPS Stage 1 evidence has not yet been collected for first deployment.
14. Curricular component realignment (`P2-001`–`P2-004`): PPCT architecture (`P2-001`), component persistence/control plane (`P2-002`), weekly routing/allocation/projection runtime (`P2-003`), and admin applicability workspace (`P2-004`) are **CLOSED**.

## Production VPS topology decision

The final production-host topology is intentionally unresolved and explicitly deferred by the Product Owner:

- Supported candidate topologies are `SHARED_VPS` (coexisting with DamSanV5 / Quản lí nội trú on the existing Windows Server 2022 VPS, retaining shared-host isolation, Nginx coexistence, and process/port/database/TLS neighbour protection) and `DEDICATED_VPS` (a separate newly rented Windows Server 2022 VPS dedicated to Báo giảng, with application/domain/business architecture preserved, requiring production runbooks and P6 authority to be audited and realigned for dedicated-host topology before use).
- Both topologies target Windows Server 2022.
- The choice between `SHARED_VPS` and `DEDICATED_VPS` is an explicit Product Owner decision, not an agent inference. No agent may infer a topology from existing infrastructure.
- A mandatory HARD STOP exists immediately before `P6-010`: `P6-010` cannot start until `P6-005` is `CLOSED`.

## Tasks currently active or eligible to start

`P4-050` is CLOSED by `SYNC-P4-050`; no major task is currently active or eligible to start.

Active in progress:
- None.

Active in review:
- None.

Eligible to start:
- None.

Not eligible to start:
- `P2-020` — `PLANNED`, blocked until `P2-010` evidence is provided.

`P2-020` remains blocked by `P2-010` evidence (`BLOCKED_EVIDENCE`).

Note: `P2-010` remains `BLOCKED_EVIDENCE` pending actual authoritative school PPCT workbook/template evidence.

Eligibility does not imply permission to bypass one-task-per-branch, review, CI or mandatory closure-sync gates. No next major task is inferred by this closure; P6 remains blocked by P6-005.

## Decisions/evidence still blocking other paths

- `P0-002` — stale PR #11 closure: Product Owner decision required.
- `P0-003` — CORE vs FULL BUSINESS pilot scope: Product Owner decision required before P5 freeze.
- `P0-004` — GitHub main branch protection/ruleset: Product Owner decision required before repository-settings mutation.
- `P2-010` — authoritative PPCT workbook/template evidence required.
- `P6-005` — Production VPS topology decision: explicit Product Owner selection of `SHARED_VPS` vs `DEDICATED_VPS` required; HARD STOP blocks `P6-010`.

## Authoritative source-change gate

Accepted P0 fingerprints:

- PA-B v1.2 DOCX blob: `c2c61a4e8acb9fde0e5fc5232467662048fd3380`;
- PA-B v1.3 addendum blob: `5876af5920d12ea6fcecf42d1b8a392cc4825f16`.

The contradiction trigger under T42 fired on 2026-09-08 via explicit Product Owner authority on curricular components; task `P0-900` was completed and closed by `SYNC-P0-900`. Future blob changes or contradictory decisions will require another registered rebase audit.

## Repository protection gap

Direct P0 inspection found `main` is currently not protected server-side. This is registered as `P0-004`; no repository-setting mutation was performed implicitly.

## Production state

Production remains **pre-operational**. No production deployment has occurred. P1-020, P1-021, P1-022, P1-031, P1-031B, P1-031A, P1-031C, P1-032, P4-010, P4-020, and P4-030 are CLOSED and canonical. P4-030 authorization and guarded HTTP surface implementation are merged to canonical `main` but have not been deployed or applied to production. P4-020 schema/migrations and planning control-plane implementation are merged to canonical `main` but have not been deployed or applied to production. The backend production policy registry contains only the reviewed `OPERATIONAL_START` family enabled by P1-031, and the Web UI registry includes the corresponding production adapter enabled by P1-032. No production operational-start policy value has been configured or deployed, so the additive P1-031A migration performed zero production data backfill and has not been applied to production. P1-031C introduced zero schema or migration change and zero production data mutation. P1-032 delivered administration Web UI integration with zero backend/contracts/schema/migration mutation. P2-030 architecture/evidence, P2-040 native adapter runtime implementation, P2-050 selective session authoring and carry-forward, P2-002 PPCT component persistence/control plane, P2-003 component-aware allocation/projection runtime, and P2-004 specialized-study administration workspace are merged to canonical `main`, but did NOT deploy or mutate VPS, database, Nginx, TLS, scheduled tasks, or application process state. P2-001 architecture remains accepted authority under ADR-048. P6 remains blocked by the explicit P6-005 topology decision gate.

## Protected external system boundary

Pre-pilot work must not modify or infer ownership over:

- `D:\Quan_li_noi_tru`;
- `D:\Edu_DamSan`;
- DamSanV5/Quản lí nội trú application processes, database, Scheduled Tasks or application configuration;
- current Nội trú TLS renewal/monitoring state except in a separately authorized and explicitly isolated infrastructure task.
