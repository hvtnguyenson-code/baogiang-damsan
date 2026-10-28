# Current Project Status

## Authority

This is the canonical mutable **current product/task status** document for Báo giảng.

Per `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`, this file is intentionally concise. Detailed historical closure evidence belongs in `PRE-PILOT-TASK-REGISTER.md`, requirement/ADR closure records, traceability, PR/CI history and Git history.

Exact current `main`, branch HEAD and divergence must always be read directly from Git/GitHub. SHAs here are evidence for already-established task states, never a self-referential claim that this document contains its own current commit.

**Status snapshot date:** 2026-10-27

## P5-056A / T55 — IN_REVIEW, architecture proposal (docs-only)

On the existing branch docs/p5-056a-inapp-notification-webpush-architecture based on canonical main@1a90f05b08b2ae189628e2a501dc4e5dc30c1af5, proposed ADR-059 and the expanded P5-056A requirement specify one durable per-account notification record with authoritative source, two-boundary capability checks, read vs source-confirmed resolved, allowlisted internal action routes, deterministic dedupe, safe Web Push subscriptions/outbox/retries, data minimization and independent Telegram/PWA boundaries. **Architecture is not yet approved and no runtime code has changed.** GitHub diff review, exact-head CI, authorized merge, authoritative post-merge CI, and one SYNC-P5-056A closure remain required. P5-056 implementation remains PLANNED and blocked; P5-057/P6-050 pilot stay gated. This branch must not trigger manual deployment.

## P5-055 — CLOSED by SYNC-P5-055 (Data Readiness & Import Center)

Parent PR #248 final HEAD `a5efc02735cdf9101ad14e007c448493bac75bc8` includes READY fail-closed correction `006d1e23a06e0a5764bc7087f6e13aa4465ce3e7`; exact-head CI #824 (`39969087899`) and P6-021 off-host #71 (`39969087920`) SUCCESS. Parent merged 23/10/2026 at `6f1e83a8f021db1ab23f9902981a6b32f36d65ab` with main CI #825 (`39971195093`), auto-deploy #23 (`39972403934`) and VPS deploy #20 (`39972416299`) SUCCESS, exact deploy SHA verified in log. A retrospective independent ChatGPT GitHub-diff technical review (24 parent PR files) found no new HIGH/CRITICAL blocker and is recorded as COMMENT `5661587622` on #248; it is **not** a formal third-party `APPROVE`. Prior task register `IN_PROGRESS` was stale after the 23/10 merge and is corrected by `SYNC-P5-055`. The correction report's original pre-merge status remains historical evidence, not the current task state.

T54 delivers one BGH/Admin readiness/import workspace for **TKB, PPCT, historical teaching, GDĐP, HĐTN-HN**, with authority-preserving navigation, version/import findings, and fail-closed status. TKB ACTIVE alone remains **NOT_ASSESSED** until the date-scoped evaluator proves readiness; a history import receipt alone does not prove fulfillment; missing policies, PPCT assignments/versions or published special-programme plans cannot be advertised READY. Local correction tests include API 1,968 PASS, Web 588 PASS and isolated PostgreSQL 11/11 PASS. No database schema/migrations, second parser, new ledger or production DB-write operation; the parent did adjust CI job timeout 20→35 minutes for Playwright install. P5-055 is **CLOSED for bounded technical scope**, not a blanket school readiness or persona UAT certificate. P5-056A/T55 is the next architecture task; P5-057 user/device UAT and P6-050 pilot remain gated. Full evidence: `docs/phase-reports/SYNC-P5-055-CLOSURE.md`.

## P5-054 — CLOSED by SYNC-P5-054 (Teaching Operations Workspace)

P5-054/T53 is **CLOSED for its bounded technical/product-workspace scope** following independent ChatGPT GitHub-diff review PASS recorded as PR #252 COMMENT review `5655583109` (not formal third-party approval). Parent PR #252 final reviewed head `200f38d9fdf753310e7fc892bc3919defc1d38d8` merged as `fe6e4b367dc6dbc9746394353b07851f3ff2dbf2`. Authoritative main CI #843 (`40354422393`), auto-deploy #27 (`40356330143`) and VPS deploy #24 (`40356346940`) all SUCCESS; VPS release verifier recorded that exact SHA. Operator's PowerShell 2026-10-26 23:27 +07:00 independently confirmed release/current, rollback/previous, release folder, `/api/health/live` HTTP 200, `/api/health/ready` HTTP 200 with database healthy (52 ms), Node listening at `127.0.0.1:3100` (six of six PASS).

Delivered calendar-exception, substitution/supervision, make-up and reversal workflows in Vietnamese, retaining PPCT/ProgressDebt/OfficialWorkload authority and SERIALIZABLE commit revalidation; invalid/unresolved evidence remains BLOCKED/NOT_ASSESSED. Final code gates: API 2,069/2,069, Web 744/744, PostgreSQL 13 suites (184 PASS/1 SKIP) and live Playwright separately 1/1 PASS; P5-010 correction 12/12 PASS. No schema/migration/auth/CI/CD change. This technical closure **does not authorize teacher pilot**: end-to-end real persona, mobile/Android, dense data and user acceptance remain P5-057/T56; P6-050 stays PLANNED. GitHub deployment does safety-guarded best-effort pruning of stale releases/archives, but actual bytes reclaimed on VPS were not independently measured. See `docs/phase-reports/SYNC-P5-054-CLOSURE.md`.

## P5-058 — CLOSED by SYNC-P5-058 (frontend Vietnamese UX technical release)

P5-058/T57 parent PR #249 completed code audit for all **35/35 page modules** and checked **25 actual navigation registry items** (the requirement's original 26 was reconciled against the live registry). Exact-head `40f41046abeaea137a84231b6d235d6e52d4bf1d` passed PR CI #836 (`40157839224`), focused P5-058 Playwright **34/34 PASS**, and independent source-diff review found no new blocking regression. Merged to `main` at `13b3b6f23a12615d2f72f3457b512fac851dc586`; authoritative post-merge main CI `40168988159` had both jobs SUCCESS. On 2026-10-25 VPS `C:\baogiang\current` pointed to that exact release, `/api/health/live` and `/api/health/ready` returned HTTP 200, PostgreSQL ready check OK (53 ms). No backend/API/DB/auth/RBAC/deployment or Nội trú code mutation in P5-058.

**Closure boundary:** P5-058 is CLOSED for frontend scope and deployed technical smoke only. Mock-browser coverage does not prove real Android device, 200% zoom, dense live tables, all authentic role accounts, or real backend command/CAS/race semantics. These outstanding user-workflow/field UAT requirements stay explicitly in `P5-057` (T56), mandatory before P6-050 teacher pilot. No blanket product/persona acceptance is claimed. Full evidence: `docs/phase-reports/SYNC-P5-058-CLOSURE.md`.

## P5-053 — CLOSED by SYNC-P5-053 (Timetable & Time-Slot Administration Workspace)

P5-053 (T52) is **CLOSED by SYNC-P5-053** after independent review of parent PR #244, Correction 001, and the final targeted fix. Reviewed PR-head `8f957217926c55362df036daf5b8cdd8437c6767` passed PR CI run `39383450017` (554 Web unit tests, 680 API integration, 19 Playwright E2E tests). Parent PR #244 merged at `481003357c6261368dcb9566b1388617563c61bb`; authoritative main CI `39398772244`, auto-deploy `39399972160` and VPS deploy `39399986101` all SUCCESS. VPS `current` pointed to the merge SHA; local/public Báo giảng readiness and protected Nội trú health returned HTTP 200. Scope delivered: capability-guarded Vietnamese time-slot and native Đam San timetable administration, server-owned class/teacher reconciliation, BOTH/MORNING/AFTERNOON selective session import, draft/version lifecycle and bounded readiness. No backend/schema/migration/CI/CD code changes. VPS housekeeping completed: three stale releases/ZIPs, unused staging, and historical quarantine cleaned, while `current`, `previous`, `failed-release`, backups, deploy logs, database and protected Nội trú remained intact. **No teacher-pilot authorization. P5-054 was subsequently completed; see the newer closure section above.**

## P5-051 — CLOSED by SYNC-P5-051

P5-051 (T50) is **CLOSED by SYNC-P5-051**. Parent PR #240 merged to `main` at `cd0e67d342276f1e3e1baa2bb1de9078f4b2e5c7`; authoritative post-merge CI #799 (run `39143647086`) SUCCESS, auto-deploy #14 (run `39144276217`) SUCCESS, and Deploy VPS #12 (run `39144282062`) SUCCESS. Independent review of Slice A/B/C and Corrections 001/002 passed; 493 Web unit tests, 680 API integration tests and 15 smoke tests passed on the reviewed PR head. Scope: professional baseline, audited responsibility templates, safe clean-slate deletion, Users Administration UI and coordinator read-model. Zero DB migrations. VPS verified `current` pointed to the merge SHA, Báo giảng and protected Nội trú health endpoints returned HTTP 200; no teacher pilot authorization follows from this deployment. P5-052 is now READY by dependency; P5-057 and P6-050 remain blocked by their other prerequisites. See `docs/phase-reports/P5-051-PARENT-PRE-MERGE-REVIEW.md` for parent implementation evidence.

## P5-052 — CLOSED by SYNC-P5-052 (Task-Oriented Workspace & Information Architecture)

P5-052 (T51) is **CLOSED by SYNC-P5-052**. Parent PR #242 merged as `0711bd8e6edaca38c7e3840ff66de20f353bdcd8` after independent review and Corrections 001/002. Authoritative post-merge main CI run `39238435454`, auto-deploy run `39239589746`, and VPS deployment run `39239601301` all SUCCESS. VPS `current` points to this exact merge SHA; Báo giảng local/public readiness and protected Nội trú returned HTTP 200. No backend, migration, or CI/CD changes; no teacher pilot authorization. P5-053 subsequently merged and closed (see newer section above).
- Delivered task-oriented information architecture with 5 coherent work families (`my-work`, `academic-data`, `teaching-operations`, `reporting-approval`, `administration`) mapping 22/22 canonical routes with exact capabilities predicates.
- Replaced flat navigation links with responsive desktop dropdowns and accessible mobile drawer with keyboard support (Escape dismiss, auto-close on navigate, WCAG AA contrast and touch target).
- Transformed HomePage into an actionable workspace with real bounded pending approval queue for PHT/BGH and teaching queue for teachers; honest zero and error handling without fake numbers.
- Respectful, helpful Access Denied UX without leaking technical keys.
- Verification: final reviewed PR-head CI `39231694123` passed 511 Web unit tests, 680 API integration tests, and 19 Playwright E2E tests; 16 MOCK screenshots captured across 5 viewports; post-merge CI/deploy succeeded.
- Zero backend, database, migration or CI/CD code changes in parent PR. Authorized code-only production deployment completed successfully after merge; no production database migration.


## 2026-10-16 product operability audit — product path reopened

Live administrator testing with a newly created/activated Vice Principal account exposed a product-level gap that was not represented by backend/domain closure evidence. The repository contains deep backend foundations, but several required workflows are absent from Web UI, difficult to discover, or require low-level capability knowledge that a school administrator should not need.

`P5-050` is **CLOSED by `SYNC-P5-050`**. Parent PR #238 final reviewed head `ce583b123a8aba98a6e221df89346339030f00eb` passed exact-head CI #777, merged as `e393cbd3ba1167e19c5e4bfb67efd7f6233f4c29`, and authoritative post-merge CI #778 succeeded. It registers T50–T56 and tasks P5-051..P5-057, including safe clean-slate user deletion, professional baseline/responsibility templates, task-oriented workspace/navigation, TKB/time-slot UI, teaching-operations UI, unified data-readiness/import center, in-app notification/Web Push, and persona-level E2E operability freeze.

Diagnostic audit estimate on the starting main: domain/backend approximately 85–90%, reachable end-to-end product workflows approximately 55–60%, overall functional product conformance approximately 61%, and new PHT self-operability approximately 35–45%. These are planning estimates only; P5-057 must replace them with binary persona/workflow evidence.

Infrastructure/CD reconciliation remains a separate P6 concern and may proceed only under its existing gates. **Teacher pilot P6-050 must not close until P5-057 is CLOSED.**

A separate governance anomaly was also observed: P4-040 cites traceability row T31 while the canonical matrix omits T31. This branch does not redefine T31; `P0-005` is registered for a docs-only historical reconciliation.


## 2026-10-16 live CD/runtime evidence — supersedes older CD NO-GO host assertions

The GitHub→VPS code-only deployment path is now operational in live evidence, while **teacher pilot remains PRE-OPERATIONAL**. The following facts supersede only older host/CD observations that said canonical pointers/identity/dispatch were absent:

- PR #236 merged as `24e6e9b6d0fd8c4756838fd48c893cbaa8adb63e`; exact-head PR CI #771 and P6-021 compatibility #44 SUCCESS; main CI #772, auto-deploy #10 and Deploy VPS #8 SUCCESS.
- PR #237 merged as `c61103d08a1324def8a9949e6a74b00e4d6cb905`; exact-head PR CI #774 and P6-021 compatibility #46 SUCCESS; main CI #775, auto-deploy #11 and Deploy VPS #9 SUCCESS.
- P5-050 docs merge `e393cbd3ba1167e19c5e4bfb67efd7f6233f4c29` passed main CI #778; auto-deploy #12 and Deploy VPS #10 SUCCESS. VPS `C:\\baogiang\\current` and deploy source both resolved to that exact SHA; deployment status returned `BAOGIANG_DEPLOY_VERIFIED`.
- Báo giảng remained healthy on port 3100 and public HTTPS; protected Nội trú remained healthy on port 3000 with PID 5888 unchanged during the verified deploy.
- Báo giảng production PostgreSQL authority is the dedicated database on port 5434; protected Nội trú database/runtime remain separate.
- Nginx serves the Báo giảng frontend from the stable `C:/baogiang/current/apps/web/dist` authority established during the reviewed cutover.

**Governance note:** P6-020/P6-025/P6-030 task-register lifecycle/evidence has not yet been formally reconciled to these later authorized production actions. Do not repeat the obsolete claim that no controlled deployment occurred, but also do not infer that those P6 parent tasks are canonically CLOSED or that teacher pilot is authorized. Their formal reconciliation remains separate governance work.

## 2026-10-14 follow-up — main updated; CD still NO-GO

The latest GitHub compare identifies `main@c2d7be8db7a5f85486f333fa187c694707dceb5a`, after merged PR #220 (dedicated PostgreSQL port 5434 in production backup/migration wrappers) and PR #221 (code-only `run_migrations=false` plus read-only Prisma drift gate). PR #221 exact-head CI #721 and P6-021 compatibility #9 were SUCCESS. This is repository-only progress, not a deployment or a post-merge main CI certification. PR #219 remains DRAFT, 5 ahead / 12 behind main at this audit. The earlier main/CI evidence below is an explicitly dated snapshot.

Read-only VPS recheck: Báo giảng API and Nội trú HTTP 200; both Scheduled Tasks running; ports 3100/5434 (Báo giảng) and 3000/5433 (Nội trú) remain separate; canonical `current`, `previous`, deployment identity, startup bundles, and task `BaoGiangBackend` are still missing. Shared Nginx config hash unchanged. **P6-025 repository corrections are in progress; host adoption, CD dispatch, migration and pilot remain NO-GO** until independent review and explicit scope-limited authorization. Full evidence: `docs/operations/P6-025-LIVE-CD-RECONCILIATION-20261014.md`.

## 2026-10-14 live-production evidence and CD reconciliation proposal

**Initial 2026-10-14 GitHub snapshot:** canonical main `b9d0d68fb4affa74545272e18525f8950c2ec4f6`; CI #713 (run 38344476487) SUCCESS. GitHub branch `main` reports `protected=false`, and the repository rulesets endpoint returns an empty list. GitHub `production` Environment/secret names and SSH authentication have **not** been verified.

**New VPS observation:** the official Báo giảng website at `https://baogiang.dtnt-damsan.edu.vn/`, its ready API and the protected Nội trú site all returned HTTP 200. Báo giảng runs as a separate `BaoGiangBackendPreDomain` Scheduled Task on `127.0.0.1:3100` with release directory named after the canonical main commit and dedicated PostgreSQL 5434; its Nginx vhost and valid HTTPS certificate are already live. This is an out-of-band activation, **not** evidence that GitHub CD was executed.

**CD readiness is still NO-GO:** `current`, `previous`, deployment marker, startup bundles and expected `BaoGiangBackend` task are absent. Current `nginx.conf` carries inline shared-host vhosts; the repository's managed-include assumptions need explicit reconciliation. The manual live deployment must not be treated as formally completing P6-020 PASS 1/PASS 2, P6-030, P6-050 or authorizing teacher pilot.

**Next governance task:** P6-025 Live production CD contract reconciliation is **IN_PROGRESS (repository-only; host NO-GO)**, dependent on P6-020. Read-only evidence and detailed acceptance gates are in `docs/operations/P6-025-LIVE-CD-RECONCILIATION-20261014.md`. P6-030 remains blocked until P6-020 and P6-025 are formally accepted; all production mutations need separate explicit approval. Current official sites remain in service.

This newer live-evidence section supersedes only the *point-in-time host assertions* made before 2026-10-14 below. It does not silently alter historical Git/CI closure facts or task status.


## Executive status

- Pilot authorization: **PRE-OPERATIONAL (no teacher go-live approval)**. The official site is online and canonical GitHub→VPS code-only CD is operational as verified on 2026-10-16; this does not establish product-operability or teacher-pilot readiness.
- Core domain/backend implementation is substantially complete, but product operability is reopened by P5-050; backend closure alone is not sufficient for teacher-pilot readiness.
- `P2-020` PPCT native importer is **`CLOSED` by `SYNC-P2-020`**; PR #173, exact-head CI #549, merge `2d6cb02d4bf9bb4529e0e8eaf83e10d6a67ef043` and post-merge CI #550 are the parent evidence.
- `P6-005` Production VPS topology decision is **`CLOSED` by `SYNC-P6-005`**.
- Canonical production topology: **`SHARED_VPS`** on the existing Windows Server 2022 host, with strict protected-neighbour isolation.
- `P6-010` Pre-deploy TLS/HTTP-01 authority is **`CLOSED` by `SYNC-P6-010`**; parent PR #176 and authoritative post-merge CI #578 are SUCCESS. Later separately authorized production adoption/deployment evidence is recorded in the 2026-10-16 section above and must not be attributed retroactively to P6-005/P6-010.

## 2026-10-12 final audit and P6-020 exact candidate decision

Last formally CLOSED major task: `P5-040` (PR #202, exact parent merge `1282f24a5300da88c155c7dc5523644d14bd53c8`, post-merge CI #658 SUCCESS, closed by `SYNC-P5-040`). `P5-030` Telegram and `P5-020` PWA also remain formally CLOSED. Historical evidence is retained in the canonical register.

Subsequent audit results: AUD-02B PR #207 merged at `8e32d392cebe378f39b232c396408026c3bf7525`; AUD-05 PR #208 merged at `6cea05ab1b952994ceed3dbb5e3b6f320593a7d6` with independently verified post-merge main CI run `38203229334` SUCCESS (both jobs); HAR-01 test-harness suspicion **REFUTED / NO ACTION** after read-only independent review; AUD-03 workload suspicion REFUTED under ADR-057. These follow-up audit labels are not substitutes for registered P0-P6 major-task closure protocol.

Final Pre-Pilot Readiness Audit (2026-10-12): **CONDITIONAL GO** for preparation and passive production preflight; **NO-GO** for actual deployment or teacher pilot until P6 gates and live acceptance evidence are complete.

Product Owner explicitly approved `main@6cea05ab1b952994ceed3dbb5e3b6f320593a7d6` as the **exact P6-020 readonly discovery candidate** on 2026-10-12. Authorized scope: PASS 1 passive neighbour discovery followed only after review by PASS 2 exact readonly preflight. This is not authorization to change VPS resources, install, deploy, migrate database, mutate/reload Nginx, issue TLS, edit Scheduled Tasks, or change the protected Nội trú application.

Preliminary Desktop Commander read-only metadata: Windows Server 2022, 6 logical CPUs, 16 GiB RAM; DamSanV5 protected Scheduled Task running on Node port 3000, Nginx port 80/443, PostgreSQL 16 loopback port 5432, PostgreSQL 17 loopback port 5433, no observed port-3100 listener. **Effective Nginx -p prefix and -c configuration NOT_VERIFIED** from running process arguments. This reconnaissance is not a formal PASS 1/PASS 2 result. Evidence record: `docs/operations/P6-020-PRELIMINARY-READONLY-EVIDENCE-2026-10-12.md`.

## Active / next critical path

### In Progress



- `P5-051` — **CLOSED by `SYNC-P5-051`**: PR #240 merged at `cd0e67d342276f1e3e1baa2bb1de9078f4b2e5c7`, main CI #799 SUCCESS, auto-deploy #14 and Deploy VPS #12 SUCCESS; parent implementation and review evidence retained.
- `P6-020` — **IN_PROGRESS: preliminary passive host reconnaissance only**; formal PASS 1/PASS 2 NOT EXECUTED. Exact deployment candidate approved for read-only scope above.

### In Review

- None for the P5-050 product-operability programme; P5-053 is CLOSED by SYNC-P5-053.

### Ready

- `P5-056A` — IN_REVIEW docs-only architecture on existing GitHub branch; no approval/merge or runtime yet.
- `P0-005` — docs-only historical T31 traceability reconciliation; independent of the product-operability implementation path.

### Planned behind open dependencies

- `P5-056A` -> `P5-056` — in-app notification center + Web Push architecture then implementation.
- `P5-057` — persona operability E2E freeze; mandatory product predecessor of teacher pilot.
- `P6-030` — production bootstrap + first controlled deploy: **`PLANNED`** (depends on `P6-020` and P6-025 acceptance).
- `P6-040` — TLS monitor multi-certificate refactor: **`PLANNED`** (depends on `P6-030`).
- `P6-050` — teacher pilot go-live verification: **`PLANNED`** (depends on `P5-020`, `P5-030`, `P5-057`, `P6-030`).

### Trigger-gated / decision-blocked
- `P0-002` — stale PR #11 hosting-portability direction: **`BLOCKED_DECISION`**.
- `P0-004` — GitHub main branch protection/ruleset: **`BLOCKED_DECISION`**.
- `P6-020` — trigger fired 2026-10-12; now IN_PROGRESS for read-only evidence only. Formal PASS 1/PASS 2 outstanding.

## Production VPS topology

The Product Owner selected **`SHARED_VPS`** on 2026-10-01 and P6-005 is now formally closed.

Target host evidence used for the decision:

- Windows Server 2022;
- 6 logical processors;
- 16 GB RAM;
- system drive approximately 49.9 GB total with 31.07 GB free at the read-only audit time;
- retained Nginx/PostgreSQL evidence for the 2026-09-30 19:00–20:00 high-load window;
- no historical PerfMon CPU/RAM capture existed for that hour, so no unmeasured historical saturation claim is made.

`SHARED_VPS` means host sharing only. Báo giảng retains separate authority for application/runtime, database/role, secrets, logs/backups, Nginx managed configuration and TLS lifecycle. DamSanV5 / Quản lí nội trú remain protected neighbours.

The capacity audit is decision evidence, not production-readiness evidence. Official Stage 1 passive discovery/preflight remains separately registered under P6-020.

## Implemented foundation relevant to pilot

Canonical `main` contains reviewed implementation for identity/auth, authorization/audit, retained calendar and teaching responsibility history, HomeroomAssignment, timetable/native TKB ingestion, component-aware PPCT, operational overlays, SpecialActivity, GDĐP/HĐTN planning/import/lifecycle/workload, execution evidence, progress/debt/late, Reporting Statement, Business Configuration/operational-start, school-wide effective teaching schedule, P4-061 official workload/adjustment runtime, the P5-010 FULL BUSINESS cross-domain regression/evidence freeze, the P5-020 installable PWA production baseline and the hardened Windows production deployment control plane.

`P2-020` additionally delivers the native PPCT_V1 workbook parser/importer and Vietnamese administration UI and is formally CLOSED by `SYNC-P2-020`.

Detailed domain closure evidence remains in `PRE-PILOT-TASK-REGISTER.md`, ADRs, requirements, PR/CI and Git history.

## Critical pre-pilot gaps

The project is **NOT READY FOR TEACHER PILOT YET**. Remaining registered gaps include:
0. Product operability has been reopened under `P5-050`: missing/reachable UI and persona-workflow gaps must close through `P5-051`..`P5-057`; in particular the native TKB backend lacks a complete Web administration surface, navigation is overly capability-shaped, and the original in-app notification/Web Push requirement is not yet closed.

1. `P3-030`, `P3-031`, `P4-060`, `P4-061` and `P5-010` are CLOSED by their non-recursive sync closures; the complete FULL BUSINESS cross-domain freeze is established.
2. Public make-up scheduling T08 and adjusted-workload T23 re-entry paths are fulfilled by the closed P3-031 and P4-061 chains and were re-verified in P5-010.
3. PWA production baseline (`P5-020`) is **`CLOSED` by `SYNC-P5-020`** after PR #195, exact-head CI #644 SUCCESS, merge/main `fa54eaea5c2055517428d18559f652001999d0e4` and authoritative post-merge CI #645 SUCCESS.
4. Dedicated Telegram integration (`P5-030`) is **`CLOSED` by `SYNC-P5-030`** after PR #200, exact-head CI #653 SUCCESS, merge/main `3bcd0d7fc1ffd0eedb8f2186271e2596a1581e5a` và authoritative post-merge CI #654 (run `37576373644`) SUCCESS.
5. Pre-deploy full-repository consistency audit (`P5-040`) is **`CLOSED` by `SYNC-P5-040`** (PR #202; exact-head CI #657 SUCCESS; merge/main `1282f24a5300da88c155c7dc5523644d14bd53c8`; authoritative post-merge CI #658 SUCCESS; remediating confirmed findings CX-01..CX-06 across Corrections 001..009; independent GitHub review PASS).
6. P6 governance reconciliation remains outstanding: later authorized production work established canonical pointers/identity, Nginx stable-root authority and successful code-only GitHub CD, but P6-020/P6-025/P6-030 lifecycle rows have not yet been formally closure-synchronized to that evidence.
7. Controlled production deploys **have occurred successfully** (#8, #9, #10); this corrects the older pre-cutover status text and does not by itself authorize teacher pilot.
8. Teacher pilot go-live verification (`P6-050`) has not occurred.

## Production state

Production remains **PRE-OPERATIONAL with respect to teacher/pilot authorization**, but the official site and isolated code-only CD path are live. The current runtime is GitHub-release controlled; the latest verified release at this sync baseline is `e393cbd3ba1167e19c5e4bfb67efd7f6233f4c29`. P6-005/P6-010 themselves remain historical design/authority tasks and must not be misdescribed as having performed the later production mutations.

## Protected external-system boundary

Pre-pilot work must not modify or infer ownership over protected neighbour resources unless a separately authorized exact-scope infrastructure task permits it:

- `D:\Quan_li_noi_tru`;
- `D:\Edu_DamSan`;
- DamSanV5 / Quản lí nội trú application processes;
- their databases/roles;
- their Scheduled Tasks/services;
- their application configuration;
- current Nội trú Nginx/TLS/monitoring state.

## Current governance authority

Current canonical authority surfaces:

1. `PRE-PILOT-TASK-REGISTER.md`;
2. this `CURRENT-PROJECT-STATUS.md`;
3. `PRE-PILOT-TRACEABILITY-MATRIX.md`;
4. `PRE-PILOT-PRODUCT-BASELINE.md`;
5. `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`.

Applicable accepted architecture/decision authorities include ADR-044 through ADR-058 as registered by their parent tasks. Exact task/closure state follows the canonical task register and this current-status snapshot; exact Git state follows Git/GitHub directly.


### P5-058 — Cập nhật lát cắt 4 (24/10/2026)

Tiếp tục trên `feat/p5-058-frontend-vietnamese-ux`, PR #249 DRAFT, HEAD bắt đầu `8ae0e9ebed0c1a880a0023d804008b2f36f7d6d0`; main xác minh trực tiếp `ea80f078c8a1297c562c8f4319540e3417d6e651`; GitHub CI baseline #832 (`40079434301`) SUCCESS. Lát cắt 3 đã có trên baseline này; đoạn ghi “chưa commit/push” trước đây chỉ là lịch sử phiên trước.

Lát cắt 4 đã đọc toàn file EffectiveSchedule, TeachingOperations, MakeupScheduling, HistoricalTeaching và Profile; xử lý lỗi HTTP, nhãn enum/finding lịch sử, UUID thay tên, Telegram UNKNOWN/FAILED, và phân biệt tải/lỗi/rỗng của lịch dạy bù. Không đổi route/API/payload/auth/RBAC/read model hoặc trạng thái nghiệp vụ. Bổ sung unit và Playwright; phạm vi từng đường đã review và còn mở ghi tại `docs/phase-reports/P5-058-PAGE-LABEL-AUDIT.md`, kết quả kiểm tra/trạng thái xuất bản tại `docs/phase-reports/P5-058-SLICE-4-REPORT.md`.

Giữ P5-058 IN_PROGRESS: 20 module còn cần audit toàn file, năm trang mới vẫn cần nghiệm thu dữ liệu động/persona đã liệt kê. Không chuyển task sang IN_REVIEW vì đây là checkpoint một phần trên PR draft; chưa đủ A/C/D, CI cho thay đổi mới hoặc independent review. Chưa merge/deploy/đóng task; không thay authority baseline/ADR hoặc claim nghiệp vụ của T51/T52.
