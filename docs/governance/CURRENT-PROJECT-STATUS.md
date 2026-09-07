# Current Project Status

## Authority

This is the canonical mutable **product/task status** document for Báo giảng. Historical phase reports, `README.md`, `docs/PROJECT_CONTEXT.md` and roadmap text may summarize this status but must not contradict it.

It is **not** a self-referential registry of the latest Git commit. Exact current `main`, branch HEAD and divergence must always be read directly from Git/GitHub at the start of every task. SHAs recorded here are evidence for the stated baseline or last closed major task.

**Status snapshot date:** 2026-09-07

## Active major task

`P2-040` — Đam San TKB native adapter implementation — **IN_REVIEW**.

Active branch: `feat/tkb-native-adapter-040`, based on canonical `origin/main@54f5a61b2045e866cd566290cf38c6273e7c28ff`. Traceability: T25, T26. Implementation complete and tested: native 4-sheet structural parser (`damsan-native-parser.ts`), bidirectional peer reconciliation (`damsan-native-reconciler.ts`), derived teacher-code resolution (`damsan-native-adapter.service.ts`), upstream integration into canonical import pipeline (`timetable-import-workbook.service.ts`), 36 native tests + 1021 unit tests passing, zero schema changes; P2-050 remains separate and unimplemented.

## Last closed major task

`P2-030` — Đam San TKB native-workbook architecture audit — **CLOSED** by `SYNC-P2-030`.

Closure evidence: exact starting main `7e99a245f2b1dcf112d63721563d1082a0ea237f`; privacy-clean feature branch `docs/tkb-native-workbook-architecture-030-clean`; final reviewed head `bd7021ce8944848edbe1c3f10342a0a644b78f47`; independent GitHub diff/privacy review PASS; PR #111; exact-head PR CI #375 (run `34076797404`) SUCCESS; merge/main `6fde93eaf12a2dceb3bb9bc5ea3ccc46e27878b2`; authoritative post-merge main CI #376 (run `34077121063`) SUCCESS; the pre-PR README privacy defect on the superseded working branch was removed by reconstructing a clean one-commit branch from the exact canonical base rather than rewriting history; no separate semantic correction/re-entry task required; administrative closure `SYNC-P2-030`; no schema, runtime, UI, deployment or production mutation claimed.

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

## Accepted Business Configuration domain

`P1-020` (architecture), `P1-021` (persistence/control plane), and `P1-022` (administration workspace) are **CLOSED**. ADR-046 is accepted architecture authority, P1-021 is closed persistence/control-plane implementation, and P1-022 is closed capability-gated administration workspace for a separate typed/allowlisted, version-aware and civil-date-effective Business Configuration domain. It implements:

- separate retained `BusinessPolicyStream` / `BusinessPolicyVersion` / `BusinessPolicyCommand` persistence topology;
- `SCHOOL_WIDE` / `ACADEMIC_YEAR` exact resource semantics;
- DRAFT / PUBLISHED / REVERSED retained lifecycle;
- strict civil-date intervals;
- DB-backed published overlap prevention;
- exact historical validator-version resolution;
- prospective replacement and retirement;
- retained correction/reversal lineage;
- immutable published semantics;
- dedicated `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` authorization;
- capability-gated route `/quan-tri/chinh-sach-nghiep-vu`;
- `SYSTEM_ADMIN` alone does not grant access;
- typed code-defined UI adapters with triple identity (familyKey + validatorVersion + resourceKind);
- current versus historical validator handling;
- lifecycle workflows: create draft, edit, publish, prospective replace, retire, correct;
- exact-date resolver UI;
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
- technical config/secrets exclusion (no raw JSON, no generic key/value editor).

The production policy family registry and production UI adapter registry remain intentionally empty: generic P1-020/P1-021/P1-022 platform capability does not enable operational-start, workload, or reporting policy semantics. Therefore, the current production workspace legitimately shows no approved editable policy family; this reflects intentional empty production registration, not incomplete implementation. Concrete production policy families are enabled only by their owner tasks (operational-start under P1-030–P1-032, workload under P4-060/P4-061).

## Accepted native timetable workbook architecture

`P2-030` is **CLOSED**. `ADR-047-TKB-NATIVE-WORKBOOK-ARCHITECTURE.md` is accepted architecture authority for the real Đam San four-sheet timetable workbook. Runtime implementation remains owned by P2-040 and selective morning/afternoon carry-forward remains owned by P2-050.

The authoritative Đam San timetable workbook (`TKB-LAN-1-TUAN-1-03.9.26-in.xlsx`, SHA-256 `3ea242433d1d291912749cf9f2f6b39b700847bfc09384dec9c6849b15597c72`, 38,974 bytes) was audited locally. The accepted architecture defines:
- dedicated `DamSanNativeTimetableAdapter` positioned upstream of canonical timetable importer (runtime adapter owned by P2-040);
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
- effective date extraction (`2026-09-07`) and SHA-256 provenance recording;
- sanitized structural test fixture `apps/api/test/fixtures/tkb/sanitized-dam-san-tkb-fixture.xlsx` generated with zero real teacher names and zero raw teacher codes (using synthetic `Giáo viên 01`..`Giáo viên 38` and `GV01`..`GV38`), preserving 100% of grid topology and reconciliation counts.

P2-030 was architecture/evidence only: no schema, migration, runtime importer, UI, deployment or production mutation was performed. P2-040 is now eligible to implement the accepted native adapter contract on its own dedicated branch.

## Accepted governance authority

The following remain current governance/product authorities:

- `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md`;
- `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`;
- `docs/governance/PRE-PILOT-TASK-REGISTER.md`;
- `docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`;
- `docs/decisions/ADR-044-PRE-PILOT-PRODUCT-REALIGNMENT-GOVERNANCE.md`;
- `docs/decisions/ADR-045-HOMEROOM-RESPONSIBILITY.md`;
- `docs/decisions/ADR-046-BUSINESS-CONFIGURATION-CONTROL-PLANE.md`;
- `docs/decisions/ADR-047-TKB-NATIVE-WORKBOOK-ARCHITECTURE.md`.

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
- accepted ADR-047 native Đam San timetable workbook architecture and privacy-sanitized structural fixture; native adapter runtime remains intentionally absent until P2-040;
- PPCT persistence/control plane, stable item identity/revisions/lineage and exact class-subject version association;
- operational overlays;
- SpecialActivity minimum-core persistence/runtime with exact slots, frozen classes, staffing and class/teacher/time collision checks;
- PPCT occurrence allocation;
- curricular TeachingExecution and SpecialActivityParticipationExecution evidence;
- proof-based progress/debt/late projection;
- reporting projection and public reporting read path;
- Personal Reporting Projection;
- Reporting Statement persistence/control plane/UI enablement/product UI work;
- **retained Business Configuration persistence, control plane and administration workspace** (separate BusinessPolicyStream / BusinessPolicyVersion / BusinessPolicyCommand topology, strict civil-date intervals, DB-level non-overlapping published exclusion, retained replacement and reversal/correction lineage, immutable published payload, exact historical validator-version resolution, dedicated `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` capability, capability-gated route `/quan-tri/chinh-sach-nghiep-vu`, typed/version-aware UI adapter architecture with triple identity, lifecycle UI for draft/edit/publish/replace/retire/correct, historical typed rendering, exact-date resolver UI, bounded Serializable mutation retry, idempotency receipts, same-transaction audit, sanitized errors and typed fail-closed resolver, with backend production registry and production UI adapter registry intentionally empty);
- hardened Windows production deployment control-plane/runbooks through PR #90.

Homeroom architecture, persistence, control plane/capability, historical read model and administration workspace UI are closed for the registered pre-pilot scope. Business Configuration architecture (P1-020), persistence/control plane (P1-021) and administration workspace (P1-022) are closed for the registered pre-pilot scope. P2-030 native timetable workbook architecture/evidence is closed; P2-040/P2-050 runtime work remains separate.

## Pre-pilot verdict

**NOT READY FOR TEACHER PILOT YET.**

The registered implementation, data-evidence, product and production-readiness tasks remain.

## Critical pre-pilot gaps

1. Current SpecialActivity is a valid runtime occurrence primitive but not a complete GDĐP/HĐTN programme model.
2. GDĐP grade/year plan and HĐTN CLASS/GRADE/SCHOOL programme semantics are absent.
3. Programme planning cannot assign different exact teacher sets to different exact slots.
4. Special-program absence/replacement and programme-level confirmation authority remain explicitly registered for P4 closure (T43/T44).
5. Existing `GDDDP_COORDINATOR` / `HĐTN_COORDINATOR` capability intent is not wired to programme-resource authority.
6. Delayed go-live / operational-start policy and historical pre-operational evidence workflow are absent.
7. PPCT real-school import is intentionally blocked pending an authoritative workbook contract.
8. Native Đam San timetable adapter runtime and enforced class-view/teacher-view peer reconciliation are absent (architecture accepted under P2-030; implementation is P2-040).
9. Morning/afternoon selective timetable update with explicit carry-forward is absent.
10. Special-activity participation is not yet integrated into official workload/reporting aggregation.
11. WorkloadAdjustmentRule remains trigger-gated/deferred.
12. Installable PWA baseline is absent.
13. Dedicated Báo giảng Telegram bot/linking/notification lifecycle is absent.
14. First-certificate HTTP-01/Nginx authority for the Báo giảng subdomain is incomplete.
15. Actual VPS Stage 1 evidence has not yet been collected for first deployment.

## Production VPS topology decision

The final production-host topology is intentionally unresolved and explicitly deferred by the Product Owner:

- Supported candidate topologies are `SHARED_VPS` (coexisting with DamSanV5 / Quản lí nội trú on the existing Windows Server 2022 VPS, retaining shared-host isolation, Nginx coexistence, and process/port/database/TLS neighbour protection) and `DEDICATED_VPS` (a separate newly rented Windows Server 2022 VPS dedicated to Báo giảng, with application/domain/business architecture preserved, requiring production runbooks and P6 authority to be audited and realigned for dedicated-host topology before use).
- Both topologies target Windows Server 2022.
- The choice between `SHARED_VPS` and `DEDICATED_VPS` is an explicit Product Owner decision, not an agent inference. No agent may infer a topology from existing infrastructure.
- A mandatory HARD STOP exists immediately before `P6-010`: `P6-010` cannot start until `P6-005` is `CLOSED`.

## Tasks currently eligible to start

The following registered tasks are eligible to start, each only on its own dedicated branch:

- `P1-030` — Delayed go-live / operational-start architecture.
- `P2-040` — Đam San TKB native adapter implementation.
- `P4-010` — GDĐP/HĐTN programme architecture closure.

Eligibility does not imply concurrent execution or permission to bypass one-task-per-branch, review, CI or mandatory closure-sync gates. P2-040 must implement only the accepted ADR-047/P2-030 contract; P4 runtime work remains gated by its registered dependencies, and P6 remains blocked by P6-005.

## Decisions/evidence still blocking other paths

- `P0-002` — stale PR #11 closure: Product Owner decision required.
- `P0-003` — CORE vs FULL BUSINESS pilot scope: Product Owner decision required before P5 freeze.
- `P0-004` — GitHub main branch protection/ruleset: Product Owner decision required before repository-settings mutation.
- `P2-010` — authoritative PPCT workbook/template evidence required.
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

Production remains **pre-operational**. P1-020, P1-021, and P1-022 implementations are merged and canonical, but backend production policy registry and production UI adapter registry remain intentionally empty and no production business policy family is enabled. P2-030 architecture/evidence is merged and accepted but introduced no runtime or production behavior. No production database migration, VPS, Nginx, TLS, or application process mutation occurred from P2-030. P6 remains blocked by the explicit P6-005 topology decision gate.

## Protected external system boundary

Pre-pilot work must not modify or infer ownership over:

- `D:\Quan_li_noi_tru`;
- `D:\Edu_DamSan`;
- DamSanV5/Quản lí nội trú application processes, database, Scheduled Tasks or application configuration;
- current Nội trú TLS renewal/monitoring state except in a separately authorized and explicitly isolated infrastructure task.