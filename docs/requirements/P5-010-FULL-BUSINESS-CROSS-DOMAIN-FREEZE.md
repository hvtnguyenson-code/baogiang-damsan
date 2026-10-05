# P5-010 — Full Business Pilot Cross-Domain Freeze

## Status

`IN_REVIEW` on branch `feat/p5-010-full-business-cross-domain-freeze` (Review Correction 002 applied: traceability & evidence alignment)

## Canonical Start

- **Repository**: `hvtnguyenson-code/baogiang-damsan`
- **Expected canonical origin/main SHA**: `c4321d5630b60296279e7a054206a80a093aa97a`
- **Task branch**: `feat/p5-010-full-business-cross-domain-freeze`
- **Governing ADR**: `docs/decisions/ADR-054-FIRST-OPERATIONAL-PILOT-SCOPE.md`
- **Parent Task**: `P5-010` (`Pilot business scope + cross-domain freeze`)

## Direct Dependencies

All eight direct dependencies confirmed `CLOSED`:
- `P0-003`: Pilot scope decision closure (`FULL BUSINESS PILOT`)
- `P1-032`: Delayed go-live & operational start admin UI integration
- `P2-020`: Real PPCT workbook contract & security audit
- `P2-061`: School-wide effective teaching schedule implementation
- `P3-020`: Pre-operational historical teaching runtime & ingestion
- `P3-031`: Public make-up scheduling runtime & reconciliation
- `P4-061`: Workload adjustment persistence & calculation control plane
- `P4-074`: Special programme ingestion, publication, and materialization

## Traceability Audit Matrix

The canonical authority for traceability row semantics is `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`. The table below aligns all P5-010 cross-domain freeze evidence to the exact canonical definitions without redefining canonical IDs.

| Traceability ID | Domain / Requirement (Canonical Meaning) | Governing Authority | Status in P5-010 | Integration Seam & Authoritative Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **T08** | Make-up fulfills original obligation; consumes no new PPCT item | PA-B v1.2 §§8–9; ADR-031/038; ADR-055/056; P3-030; P3-031 | `VERIFIED` | Scenario 4: Proven open debt -> production `MakeupSchedulesService.create` -> execution via production `TeachingExecutionsService.confirmMakeup` -> debt resolved via `ProgressDebtService.resolve`; original obligation resolved; PPCT item count invariant preserved (before/after count invariant verified). |
| **T13** | HĐTN class-level activity uses effective homeroom responsibility | LOCAL-FC-05A0; ADR-010/012; ADR-045; P1-010..P1-013; P4-074 | `VERIFIED` | Scenario 5: `HDTN_HN` CLASS mode resolves date-effective homeroom teacher (GVCN) at occurrence civil date via production `ProgrammePlanningService.materializeOccurrence` and awards workload credit to the effective GVCN. Supported by retained authority in `apps/api/test/programme-planning/programme-runtime-bridge.integration.spec.ts` (test 60: "HĐTN CLASS uses resolved effective GVCN for SpecialActivityStaffing without rewriting planned staffing"). |
| **T14** | Historical homeroom responsibility must not drift after teacher or current account-state change | ADR-010/012/038; ADR-045; P1-011..P1-013; P4-040; P4-074 | `VERIFIED` | Scenario 5: Historical GVCN A valid on occurrence date remains assigned and credited (1.0 credit); subsequent reassignment of the class to GVCN B does not rewrite historical staffing or drift workload credit (Teacher B receives 0 credit). Supported by `apps/api/test/programme-planning/programme-runtime-bridge.integration.spec.ts` (tests 21..24: "Resolves and freezes date-effective GVCN provenance, resilient to later assignment changes"). |
| **T19** | Confirmed special-activity participation contributes to teacher workload under explicit policy | PA-B v1.2; ADR-038; P4-050; P4-061 | `VERIFIED` | Scenarios 5, 6, 7: Confirmed participation contributes to workload under explicit `SPECIAL_PROGRAMME_WORKLOAD` policy. Dual gate verified in Scenario 6: active teacher execution plus qualifying programme attestation produces official workload credit via production `SpecialProgrammeWorkloadProjectionService.resolve`; execution without attestation or attestation without execution produces 0 credit. |
| **T20** | Frozen class targets must not multiply teacher workload | ADR-038; P4-050 | `VERIFIED` | Scenarios 5, 6, 7: Anti-class fan-out verified in Scenario 6: single occurrence targeting multiple classes (10A and 10B) does not multiply workload credit (exactly 1.0 credit awarded). Anti-Cartesian verified in Scenario 7: single planned occurrence slot staffed with {Teacher A, Teacher B} across 2 class targets awards exactly 1.0 credit to each teacher without multiplying by class count or teacher count. |
| **T21** | Business policy/configuration is data-driven where school rules change | PA-B v1.2 Appendix D; ADR-057; P4-050; P4-060; P4-061 | `VERIFIED` | Scenario 9: Typed `WORKLOAD_ADJUSTMENT / v1 / ACADEMIC_YEAR` policy rules are resolved dynamically via production `OfficialWorkloadProjectionService.resolve`. Scenario 11: Missing configuration policy returns `BLOCKED` status without silent fallback; invalid/malformed rules return `BLOCKED` with explicit findings. Supported by existing authoritative suite `apps/api/test/official-workload/official-workload.integration.spec.ts` (tests 1, 10). |
| **T23** | Workload reduction / percentage / override rules configurable before official workload claims | PHASE-01-IDENTITY-ACCESS-SPEC; ADR-057; P4-060; P4-061 | `VERIFIED` | Scenario 9: Base weekly norm (17) is adjusted via configurable typed rules with strict priority ordering: Priority 1 `HOMEROOM_RESPONSIBILITY` with `GHI_DE = 20`, Priority 2 `ADDITIONAL_DUTY` with `TRU_TIET = 4` (16.0), Priority 3 `ADDITIONAL_DUTY` with `TRU_PHAN_TRAM = 25%` (12.0), and calendar interruption proration (Tuesday holiday, denominator K=2 -> required credit = 6.0). Supported by existing authoritative suite `apps/api/test/official-workload/official-workload.integration.spec.ts` (tests 1, 2, 3, 9). |
| **T24** | Authoritative school PPCT workbook/import uses template and must not guess timetable-import contracts | ADR-027; P0-900; P2-010; P2-020 | `VERIFIED (Reused Authoritative Evidence)` | Authoritative workbook `Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx` contract and security audit closed under P2-010/P2-020. Proved by existing authoritative integration suite `apps/api/test/ppct/ppct-import.integration.spec.ts`: "imports PPCT_V1 atomically into DRAFT and replays identical create requests without duplicate drafts" (PASS) and "fails closed when the confirm fingerprint does not match the preview package" (PASS). |
| **T28** | Delayed go-live after school year started (system may go live after school year started) | Product Owner requirement; ADR-049; ADR-055; P1-030..P1-032; P3-010; P3-020 | `VERIFIED` | Scenario 3: Delayed go-live boundary (`OPERATIONAL_START`) is resolved dynamically; historical truth is ingested pre-operational boundary via production `HistoricalTeachingService` (`preview` -> `confirm`); pre-operational period strictly guards against automatic debt generation (`openDebtCount = 0`). |
| **T29** | Confirmed pre-operational historical teaching consumes correct historical PPCT and counts workload | Product Owner requirement; ADR-055; P3-010; P3-020; P4-061 | `VERIFIED` | Scenario 3: Confirmed historical executions via production `HistoricalTeachingService` (`preview` -> `confirm`) create canonical `CurricularTeachingExecution` rows linked to retained `HistoricalTeachingImportBatch/Row` provenance, consume correct historical PPCT items, and contribute towards official earned workload (`earnedTotalCredit = 1.0`). |
| **T30** | Unconfirmed pre-operational history must not become debt merely due elapsed time | ADR-038/040; ADR-049; ADR-055; P1-031; P3-010; P3-020 | `VERIFIED` | Scenario 3: Pre-operational period enforces no-auto-debt; missing historical execution proof does not fabricate debt or late flags. Supported by existing authoritative historical teaching integration suite `apps/api/test/historical-teaching/historical-teaching.integration.spec.ts`: reconciliation surfaces CONFIRMED/UNCONFIRMED/CONFLICT without auto-debt ("reconciles confirmed/unconfirmed state and supports reverse then lineage replacement", "confirms NORMAL pre-operational evidence into canonical execution and retains provenance", "keeps ordinary pre-operational confirmation fail-closed"). |
| **T43** | Special-program absence, replacement, and substitute-teacher semantics explicit rather than inferred from curricular substitution | LOCAL-FC-05A0; ADR-038; ADR-050; P4-010..P4-040 | `VERIFIED (Reused Authoritative Evidence)` | Scheduled staffing and actual execution are distinct; absence does not delete scheduled staffing or auto-cancel occurrences; absent teacher receives no workload credit; replacement reverses affected SpecialActivity root via CAS (ACTIVE -> REVERSED) and creates replacement root with replacesId. Proved by existing authoritative suite `apps/api/test/programme-planning/programme-runtime-bridge.integration.spec.ts`: test line 923 ("28..39: Reverses root via CAS, creates replacement root with replacesId, retains old staffing without in-place mutation"), test line 408 ("7: Rejects materialization when teacher is inactive or non-teaching"), test line 1211 ("58. P4-050 negative boundary: P4-040 materialization, attestation, and reversal never mutate reporting statements or produce workload credit"), and test line 1272 ("59. Authorization Separation: Programme Coordinator cannot call generic SpecialActivity mutation endpoints"). |
| **T44** | Special-program confirmation authority/topology reconciles coordinator/BGH confirmation with teacher participation and prevents double counting | LOCAL-FC-05A0; ADR-038; ADR-050; P4-010; P4-030; P4-040; P4-050 | `VERIFIED` | Scenario 6: Existential confirmation gate is verified: execution without attestation produces pending confirmation (0 credit); attestation added by qualifying Coordinator or BGH satisfies existential gate and produces official workload credit (1.0 credit); duplicate or multi-actor attestations and class targets never multiply workload contribution units. Supported by `apps/api/test/programme-planning/programme-runtime-bridge.integration.spec.ts` (test line 1057: "40..57: Handles attestation lifecycle, multi-actor coexistence, CAS reversal, and Existential Gate"). |
| **T45** | Normal curricular CORE/SPECIALIZED_STUDY component model and class-subject applicability (non-applicable items are NOT_APPLICABLE, not debt) | Product Owner requirement; P0-900; ADR-048; P2-001..P2-004; P2-010; P2-020 | `VERIFIED (Scenario 2 + Reused Authoritative Evidence)` | Scenario 2 proves component routing and independent progression behavior (Monday CORE allocated and executed; Tuesday SPECIALIZED_STUDY allocated; zero cross-consumption; specialized study remains curricular). Class applicability and NOT_APPLICABLE semantics are proved by existing authoritative suites: `apps/api/test/ppct/ppct.integration.spec.ts` (retained class applicability, version control plane, mid-week split fail-closed `PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`), `apps/api/test/ppct-occurrence-allocation/ppct-occurrence-allocation-v2.integration.spec.ts` (historical retained profile split fail-closed), and `apps/web/src/__tests__/ppct-specialized-study-page.test.tsx` (class-subject specialized-study administration workspace). Scenario 2 alone does not prove all of T45. |
| **T46** | Weekly specialized routing and independent progression: LAST canonical normal opportunity is SPECIALIZED_STUDY, earlier are CORE; independent cursors | Product Owner requirement; ADR-048; P2-001..P2-004; P2-020 | `VERIFIED` | Scenario 2: Within AcademicWeek, chronologically earlier normal opportunity is classified as `CORE` and chronologically LAST normal opportunity of enabled class-subject is classified as `SPECIALIZED_STUDY`; production `TeachingExecutionsService.confirmNormal` and `ProgressDebtService.resolveV2` advance independent progression cursors without cross-consumption. |
| **T47** | Teacher Workspace school-wide effective schedule, peer read, compare, read-only | Product Owner / BGH requirement; ADR-051; P2-060; P2-061 | `VERIFIED (Scenario 12 Seam + Reused Authoritative Evidence)` | Scenario 12 proves the composite backend read seam: production `EffectiveScheduleService.getWeeklySchedule` unites `BASE_TIMETABLE`, `MAKEUP_TEACHING`, and `SPECIAL_ACTIVITY` read-only without database mutation. Scenario 12 alone does NOT prove all four Teacher Workspace surfaces; the complete surfaces, peer read, compare, and fail-closed semantics are proved by existing authoritative suites:<br>- Backend API: `apps/api/test/effective-schedule/effective-schedule.integration.spec.ts` (21 tests, Items 1..20, self read, peer read, school-wide matrix, real half-open interval comparison, fail-closed BLOCKED states, mutation prohibition) (PASS);<br>- Web UI: `apps/web/src/__tests__/effective-schedule-page.test.tsx` (10 tests: "Lịch của tôi", "Toàn trường", "So sánh với lịch của tôi", fail-closed alerts, Vietnamese copy) (PASS);<br>- E2E: `tests/e2e/specs/effective-schedule.spec.ts` (authoritative retained E2E: renders all four semantic surfaces, Vietnamese copy, responsive viewports, and fail-closed comparison). |
| **T48** | HĐTN-HN and GDĐP week-level workbooks deterministically bound to exact retained civil-date/time-slot timetable authority | Product Owner requirement; ADR-052; P4-070..P4-074 | `VERIFIED (Reused Authoritative Evidence)` | Authoritative workbook -> materialization lifecycle and retained exact timetable evidence proved by existing authoritative integration suite `apps/api/test/programme-planning/special-programme-lifecycle-e2e.integration.spec.ts`: executes full pipeline from workbook to materialization and enforces P4-050 attestation gates, collapses marker coverage into 1 logical GRADE occurrence without class fan-out, collapses all active classes into 1 logical SCHOOL_WIDE slot, executes 5-column GDĐP workbook to materialization, enforces failure matrix A..G, and retains complete relational evidence linking workbook package, plan, occurrence, and SpecialActivity. |
| **T49** | Official exact multi-teacher workload credits curricular teaching to actual teacher and combines with accepted special-programme credit before comparing against adjusted required norm | P0-003; ADR-031; ADR-038; ADR-057; P4-060; P4-061 | `VERIFIED` | Scenario 8: Under `SAME_SUBJECT_SUBSTITUTION`, actual teacher B (`actualTeacherUserId`) earns 1.0 curricular credit while nominal/responsible teacher A earns 0 credit; Teacher B combines curricular credit (1.0) + special programme credit (1.0) = 2.0 total earned credits.<br>Scenario 9: Total earned credit (2.0) is compared against adjusted required norm derived from data-driven adjustment policy chain (Priority 1 `GHI_DE`, Priority 2 `TRU_TIET`, Priority 3 `TRU_PHAN_TRAM`) with Tuesday calendar interruption proration yielding adjusted required credit = 6.0 (variance = -4.0).<br>Scenario 10: Production `ReportingStatementsService.preview` and `.submit` freezes official combined workload, curricular & special programme contributions, adjustment segments, and applied rules into immutable canonical JSON under `REPORTING_STATEMENT_SNAPSHOT_V4` with cryptographic semantic hash verification. Supported by existing authoritative suite `apps/api/test/official-workload/official-workload.integration.spec.ts` (tests 4, 5, 8, 11, 12). |

## Full Business Pilot Freeze Scope

1. **Curricular Execution & Progression**:
   - `AcademicYear` / `Calendar` -> `TeachingAssignment` -> native PPCT -> native TKB -> curricular opportunity -> production `TeachingExecutionsService.confirmNormal` -> `ProgressDebtService.resolve`.
   - `CORE` and `SPECIALIZED_STUDY` routing verified under `CORE_PLUS_SPECIALIZED_STUDY` profile.
   - Specialized study progresses independently and remains curricular (count in `SpecialActivity` is strictly 0).
2. **Delayed Go-Live (Operational Start)**:
   - `OPERATIONAL_START` boundary resolved dynamically via business configuration.
   - Historical truth ingested via production `HistoricalTeachingService` (`preview` -> `confirm`).
   - Retained `HistoricalTeachingImportBatch` and `HistoricalTeachingImportRow` link to canonical `CurricularTeachingExecution`.
   - Pre-operational periods do not fabricate debt. Confirmed historical executions count towards earned workload.
3. **Public Make-Up Scheduling**:
   - Proven open debt -> production `MakeupSchedulesService.create` -> execution via production `TeachingExecutionsService.confirmMakeup` -> debt resolved via `ProgressDebtService.resolve`.
   - Preserves original PPCT obligation without consuming new PPCT items (verified before/after count invariant).
4. **GDĐP / HĐTN-HN Special Programmes**:
   - Scopes tested: `HĐTN-HN CLASS`, `HĐTN-HN GRADE`, `HĐTN-HN SCHOOL_WIDE`, `GDĐP GRADE`.
   - Date-effective homeroom resolution: historical GVCN A preserved at occurrence date; subsequent reassignment to GVCN B does not rewrite historical staffing or drift workload.
   - Dual-gate attestation: execution without attestation produces pending confirmation (0 credit); attestation added produces official credit; attestation without execution produces 0 credit.
   - Anti-class fan-out: occurrence targeting multiple classes (10A and 10B) does not multiply workload credit.
   - Multi-teacher staffing: single planned occurrence slot staffed with {Teacher A, Teacher B} across multiple classes; each teacher earns exactly 1.0 credit (anti-Cartesian verified).
5. **Workload Adjustment & Official Workload**:
   - Base weekly norm (17) adjusted via rule chain:
     - Priority 1: `HOMEROOM_RESPONSIBILITY` with `GHI_DE = 20` (overrides base norm to 20, non-terminating chain per ADR-057).
     - Priority 2: `ADDITIONAL_DUTY` with `TRU_TIET = 4` (20 - 4 = 16).
     - Priority 3: `ADDITIONAL_DUTY` with `TRU_PHAN_TRAM = 25%` (16 * (1 - 0.25) = 12.0).
   - Calendar interruption proration: Tuesday interrupted holiday proration with denominator K = 2 yields required credit = 12.0 / 2 = 6.0.
   - Actual-teacher attribution: on `SAME_SUBJECT_SUBSTITUTION`, credit is earned strictly by substitute teacher B (`actualTeacherUserId`), zero curricular credit for nominal teacher A.
   - Mixed earned workload: combined curricular (1) + special programme (1) = 2.0 earned credit.
6. **Reporting Statement Snapshot V4**:
   - Production `ReportingStatementsService.preview` and `.submit` freezes official workload, curricular contributions, special programme contributions, adjustment segments, and applied rules into immutable canonical JSON under `REPORTING_STATEMENT_SNAPSHOT_V4`.
   - Cryptographic semantic hash verified (`assertFrozenReportingStatementIntegrity`).
   - Source mutation immunity: subsequent live execution additions do not mutate frozen snapshot or invalidate hash.
   - Backward compatibility: V1, V2, and V3 snapshots verified readable and structurally intact via existing authoritative suite `test/reporting-statements/reporting-statements.integration.spec.ts` (`CP5-30`, `CP5-31`, `CP5-32`, `CP5-33`, `CP5-34`).
7. **Teacher Workspace Effective Schedule**:
   - Production `EffectiveScheduleService.getWeeklySchedule` retrieves read-only composite weekly schedule.
   - Verified that `BASE_TIMETABLE`, `MAKEUP_TEACHING`, and `SPECIAL_ACTIVITY` occupancies are composed seamlessly without database mutations.
8. **Fail-Closed Guarantees**:
   - Missing configuration policies return `BLOCKED` status without silent fallback.
   - Invalid or malformed policy rules (e.g. referencing unassigned duty definition ID) return `BLOCKED` with explicit findings.
   - Additional edge-case and tamper validation verified via existing authoritative suite `test/official-workload/official-workload.integration.spec.ts`.

## Cross-Domain Test Matrix

The cross-domain integration suite is implemented in:
`apps/api/test/pilot-business-freeze/p5-010-full-business-freeze.integration.spec.ts`

| Scenario | Title | Production Path Used | Exact Invariants Verified |
| :--- | :--- | :--- | :--- |
| **1** | Normal curriculum happy path | `TeachingExecutionsService.confirmNormal`, `ProgressDebtService.resolve`, `ReportingProjectionService.resolve` | `outcome: 'CREATED'`, canonical identities preserved, `completedCount >= 1`, `openDebtCount = 0` |
| **2** | CORE + SPECIALIZED_STUDY routing & progression | `PpctOccurrenceAllocationService.resolveV2`, `TeachingExecutionsService.confirmNormal`, `ProgressDebtService.resolveV2` | Monday CORE allocated & executed; Tuesday SPECIALIZED_STUDY pending; zero cross-consumption; independent progression |
| **3** | Delayed go-live & historical ingestion | `HistoricalTeachingService.preview`, `HistoricalTeachingService.confirm`, `OfficialWorkloadProjectionService.resolve` | Real ingestion path (`preview` -> `confirm`); retained `HistoricalTeachingImportBatch/Row`; `CurricularTeachingExecution` canonical; earned credit = 1; zero pre-op auto-debt |
| **4** | Public make-up scheduling & debt resolution | `MakeupSchedulesService.create`, `TeachingExecutionsService.confirmMakeup`, `ProgressDebtService.resolve` | Open debt -> makeup schedule created -> makeup executed; original obligation resolved; PPCT item count invariant preserved |
| **5** | HĐTN CLASS historical homeroom retention | `ProgrammePlanningService.materializeOccurrence`, `TeachingExecutionsService.confirmActivity`, `SpecialProgrammeWorkloadProjectionService.resolve` | `HDTN_HN` CLASS mode; historical GVCN A valid on occurrence date; subsequent reassignment to GVCN B; GVCN A receives 1 credit; GVCN B receives 0 credit (no drift) |
| **6** | HĐTN GRADE & SCHOOL_WIDE dual gate | `ProgrammePlanningService.materializeOccurrence`, `TeachingExecutionsService.confirmActivity`, `SpecialProgrammeWorkloadProjectionService.resolve` | Dual gate verified: execution without attestation -> pending (0 credit); attestation added -> 1 credit; attestation without execution -> 0 credit; anti-class fan-out verified |
| **7** | GDĐP multi-teacher staffing & anti-Cartesian | `ProgrammePlanningService.materializeOccurrence`, `TeachingExecutionsService.confirmActivity`, `SpecialProgrammeWorkloadProjectionService.resolve` | Single occurrence slot with {Teacher A, Teacher B} across 2 class targets; Teacher A = 1 credit, Teacher B = 1 credit; zero Cartesian multiplication |
| **8** | Actual teacher credit on substitution & mixed workload | `TeachingExecutionsService.confirmNormal`, `TeachingExecutionsService.confirmActivity`, `OfficialWorkloadProjectionService.resolve` | Substitution: actual teacher B earns 1 curricular credit, nominal teacher A earns 0; Teacher B combines curricular (1) + special (1) = 2 earned credits |
| **9** | Workload adjustment (GHI_DE, TRU_TIET, TRU_PHAN_TRAM, priority, proration) | `OfficialWorkloadProjectionService.resolve` | Rule 1: `GHI_DE = 20`; Rule 2: `TRU_TIET = 4` (16); Rule 3: `TRU_PHAN_TRAM = 25%` (12.0); Tuesday interruption with denominator K = 2 yields required credit = 6.0 |
| **10** | Reporting Statement Snapshot V4 freeze | `ReportingStatementsService.preview`, `ReportingStatementsService.submit`, `assertFrozenReportingStatementIntegrity` | Snapshot V4 canonical JSON; cryptographic semantic hash verified; live post-freeze execution addition does not mutate frozen statement |
| **11** | Fail-closed policy & provenance validation | `OfficialWorkloadProjectionService.resolve` | Missing policy -> `BLOCKED`; missing duty definition ID -> `BLOCKED` with `ADDITIONAL_DUTY_DEFINITION_MISSING` |
| **12** | Teacher Workspace effective schedule (backend composition seam) | `EffectiveScheduleService.getWeeklySchedule` | Composite weekly schedule contains `BASE_TIMETABLE`, `MAKEUP_TEACHING`, and `SPECIAL_ACTIVITY` read-only; complete 4 Teacher Workspace surfaces substantiated by retained domain suites |

## Existing Authoritative Test Suites Reused for Supporting Evidence

1. **PPCT Native Workbook Import & CAS Verification (T24)**:
   - File: `apps/api/test/ppct/ppct-import.integration.spec.ts`
   - Tests (2/2 PASS):
     - `imports PPCT_V1 atomically into DRAFT and replays identical create requests without duplicate drafts`
     - `fails closed when the confirm fingerprint does not match the preview package`
2. **Historical Teaching Reconciliation & Ingestion Integrity (T30)**:
   - File: `apps/api/test/historical-teaching/historical-teaching.integration.spec.ts`
   - Tests (11/11 PASS):
     - `confirms NORMAL pre-operational evidence into canonical execution and retains provenance`
     - `keeps ordinary pre-operational confirmation fail-closed`
     - `creates exact historical substitution provenance for DAY_THAY`
     - `uses date-effective historical subject proof instead of current teacher status for DAY_THAY`
     - `creates exact historical make-up provenance for DAY_BU`
     - `reconciles confirmed/unconfirmed state and supports reverse then lineage replacement`
     - `fails closed when a DAY_BU coordinate has multiple retained slot revisions`
     - `does not reverse an existing substitution overlay reused as historical provenance`
     - `does not reverse an existing make-up schedule reused as historical provenance`
     - `blocks DAY_THAY when the substitute already has another canonical lesson at the same time`
     - `requires exact SCHOOL_WIDE execution-management authority`
3. **Special-Programme Absence, Replacement & Attestation Lifecycle (T13, T14, T43, T44)**:
   - File: `apps/api/test/programme-planning/programme-runtime-bridge.integration.spec.ts`
   - Tests (17/17 PASS):
     - `1, 2, 3, 4: Materializes PUBLISHED occurrence 1 & 2 slots, preserves exact non-Cartesian staffing and persists topic provenance`
     - `5 & 6: Rejects materialization on DRAFT or SUPERSEDED occurrence`
     - `7: Rejects materialization when teacher is inactive or non-teaching`
     - `8 & 9: Collision with existing SpecialActivity rolls back transaction with zero partial roots`
     - `11: Same commandId with different payload produces conflict`
     - `13, 14, 15, 16, 17, 18, 19, 20: Authorization boundaries, mustChangePassword and Audit Event`
     - `21, 22, 23, 24: Resolves and freezes date-effective GVCN provenance, resilient to later assignment changes`
     - `25, 26, 27: Fails closed when homeroom assignment is missing, ambiguous, or teacher is ineligible`
     - `28..39: Reverses root via CAS, creates replacement root with replacesId, retains old staffing without in-place mutation`
     - `40..57: Handles attestation lifecycle, multi-actor coexistence, CAS reversal, and Existential Gate`
     - `58. P4-050 negative boundary: P4-040 materialization, attestation, and reversal never mutate reporting statements or produce workload credit`
     - `59. Authorization Separation: Programme Coordinator cannot call generic SpecialActivity mutation endpoints`
     - `60: HĐTN CLASS uses resolved effective GVCN for SpecialActivityStaffing without rewriting planned staffing`
     - `61: Retrospective HĐTN CLASS allows historical inactive GVCN but fails closed for current/future`
     - `62: Attestation request keys are actor-scoped so different actors can reuse same commandId`
     - `63: Materialization rejects DRAFT and future SUPERSEDED plans, but allows historical retained SUPERSEDED`
     - `64: DB trigger enforces coherent provenance, homeroom pairing, immutable history, and active root exclusivity`
4. **Special-Programme Import Lifecycle & Timetable Evidence (T48)**:
   - File: `apps/api/test/programme-planning/special-programme-lifecycle-e2e.integration.spec.ts`
   - Tests (12/12 PASS):
     - `executes full pipeline from workbook to materialization and enforces P4-050 attestation gates`
     - `collapses marker coverage into 1 logical GRADE occurrence and projects individual teacher credits without class fan-out`
     - `collapses all active classes into 1 logical SCHOOL_WIDE slot and does not multiply credit by class count`
     - `executes 5-column GDĐP workbook to materialization and verifies workload projection`
     - `A. Stale preview: rejects confirm when timetable markers mutate after preview`
     - `B. Calendar authority ambiguity is prevented by the database invariant`
     - `C. Marker count changes: fails closed when marker topology changes`
     - `D. Teacher identity changes: fails closed when GVCN homeroom authority changes`
     - `E. Existing active programme version conflict: importing new plan when master already has active PUBLISHED version fails closed`
     - `F. Materialization collision: deterministic conflict when materializing same occurrence twice`
     - `G. Repeated command: exact same commandId + same payload produces idempotent replay; different payload fails`
     - `retains complete relational evidence linking workbook package, plan, occurrence, and SpecialActivity`
5. **Teacher Workspace Effective Schedule Surfaces & Compare (T47)**:
   - Backend Integration: `apps/api/test/effective-schedule/effective-schedule.integration.spec.ts` (21/21 PASS)
     - Items 1..20, self read, peer read, school-wide matrix, real half-open interval comparison, fail-closed `BLOCKED` states, mutation prohibition
   - Web UI Tests: `apps/web/src/__tests__/effective-schedule-page.test.tsx` (10/10 PASS)
     - 4 Teacher Workspace surfaces ("Lịch của tôi", "Toàn trường", selected-teacher schedule, "So sánh với lịch của tôi"), fail-closed alerts, Vietnamese copy
   - Retained E2E: `tests/e2e/specs/effective-schedule.spec.ts`
     - Authoritative retained E2E: renders all four semantic surfaces, Vietnamese copy, responsive viewports, and fail-closed comparison
6. **Curricular Component Model & Class Applicability (T45)**:
   - File: `apps/api/test/ppct/ppct.integration.spec.ts` (21/21 PASS)
     - Component persistence, version control plane, class-subject profile applicability, mid-week split fail-closed `PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`
   - File: `apps/api/test/ppct-occurrence-allocation/ppct-occurrence-allocation-v2.integration.spec.ts` (7/7 PASS)
     - Historical retained profile split fail-closed
   - File: `apps/web/src/__tests__/ppct-specialized-study-page.test.tsx`
     - Class-subject specialized-study administration workspace (`/quan-tri/ppct/ap-dung-chuyen-de`)
7. **Snapshot Backward Compatibility (V1, V2, V3) (T49)**:
   - File: `apps/api/test/reporting-statements/reporting-statements.integration.spec.ts`
   - Tests (19/19 PASS, including CP5-30..34):
     - `CP5-30 new submit persists SNAPSHOT_V3 with canonical provenance and pinned asOf`
     - `CP5-31 HCM anchor resolves policy effective on 2026-09-13 when asOf is 2026-09-12T17:00:00.000Z`
     - `CP5-32 frozen statement remains byte-stable and retains original provenance after later policy replacement`
     - `CP5-33 historical V1 revision is accepted, readable, and verified without V2 provenance`
     - `CP5-34 idempotent replay succeeds even when current policy is deleted or unavailable`
8. **Workload Tamper and Provenance Integrity (T21, T23, T49)**:
   - File: `apps/api/test/official-workload/official-workload.integration.spec.ts`
   - Tests (12/12 PASS):
     - `1. WORKLOAD_ADJUSTMENT create/publish/resolve`
     - `2. AdditionalDuty effective window`
     - `3. Homeroom effective window`
     - `4. ACTIVE NORMAL actual-teacher credit`
     - `5. SAME_SUBJECT_SUBSTITUTION credits substitute only`
     - `6. MAKEUP execution-date ownership`
     - `7. REVERSED execution exclusion`
     - `8. combined curricular + P4-050 credit`
     - `9. arbitrary partial-range/calendar proration`
     - `10. policy change inside report range`
     - `11. Reporting Statement submit persists SNAPSHOT_V4`
     - `12. later policy/duty/homeroom mutation does not rewrite frozen V4`

## Review Correction Log

- **Correction 001**:
  - Addressed Independent Review rejection of HEAD `211d77277d6893003252caefffd0cfae3697f841`.
  - Replaced direct Prisma executions in Scenario 3 with production `HistoricalTeachingService.preview` and `.confirm`.
  - Replaced direct Prisma scheduling in Scenario 4 with production `MakeupSchedulesService.create` and `TeachingExecutionsService.confirmMakeup`.
  - Upgraded Scenario 5 to `kind: HDTN_HN`, `mode: CLASS`, using `ProgrammePlanningService.materializeOccurrence` and verifying historical GVCN assignment retention without drift after reassignment.
  - Upgraded Scenario 6 to `HDTN_HN` with GRADE and SCHOOL_WIDE modes, verifying positive and negative dual-gate attestation gates and anti-class fan-out.
  - Implemented exact multi-teacher staffing on a single planned occurrence slot in Scenario 7, verifying anti-Cartesian double-counting prevention.
  - Proved actual-teacher curricular credit attribution in Scenario 8 under `SAME_SUBJECT_SUBSTITUTION` where `responsibleTeacher != actualTeacher`.
  - Consolidated `GHI_DE`, `TRU_TIET`, `TRU_PHAN_TRAM`, priority order, canonical duty definitions, and Tuesday holiday calendar proration in Scenario 9.
  - Aligned Scenario 12 with production `EffectiveScheduleService.getWeeklySchedule` asserting `BASE_TIMETABLE`, `MAKEUP_TEACHING`, and `SPECIAL_ACTIVITY`.
  - Aligned all documentation to eliminate overclaims; verified existing domain suites for Snapshot V1/V2/V3 compatibility and deep tamper checks.
  - Zero production code edits; zero schema changes; zero migration; zero deployment mutation.
- **Correction 002 (Traceability & Evidence Alignment)**:
  - Addressed root cause where `docs/requirements/P5-010-FULL-BUSINESS-CROSS-DOMAIN-FREEZE.md` assigned incorrect requirement definitions to canonical traceability IDs.
  - Aligned the entire P5-010 Traceability Audit Matrix with canonical definitions in `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`:
    - T08 -> Make-up fulfills original obligation; no new PPCT item (Scenario 4)
    - T13 -> HĐTN CLASS uses effective homeroom responsibility (Scenario 5 + `programme-runtime-bridge.integration.spec.ts`)
    - T14 -> Historical homeroom responsibility must not drift (Scenario 5 + `programme-runtime-bridge.integration.spec.ts`)
    - T19 -> Confirmed special-activity participation contributes workload under explicit policy (Scenarios 5, 6, 7)
    - T20 -> Frozen class targets must not multiply teacher workload (Scenarios 5, 6, 7)
    - T21 -> Business policy/configuration is data-driven where school rules change (Scenario 9 + `official-workload.integration.spec.ts`)
    - T23 -> Workload reduction / percentage / override rules configurable before official claims (Scenario 9 + `official-workload.integration.spec.ts`)
    - T24 -> Authoritative school PPCT workbook/import (reused authoritative `ppct-import.integration.spec.ts` suite)
    - T28 -> Delayed go-live after school year started (Scenario 3)
    - T29 -> Confirmed pre-operational historical teaching consumes correct PPCT and counts workload (Scenario 3)
    - T30 -> Unconfirmed pre-operational history must not become debt (Scenario 3 + `historical-teaching.integration.spec.ts`)
    - T43 -> Special-program absence, replacement, substitute semantics (reused authoritative `programme-runtime-bridge.integration.spec.ts` suite)
    - T44 -> Special-program confirmation topology / dual gate / anti-double-count (Scenario 6 + `programme-runtime-bridge.integration.spec.ts`)
    - T45 -> CORE/SPECIALIZED_STUDY component model + class applicability (Scenario 2 routing + P2-002/P2-003/P2-004 integration evidence; Scenario 2 alone does not prove all of T45)
    - T46 -> Weekly specialized routing + independent progression (Scenario 2)
    - T47 -> Teacher Workspace school-wide effective schedule, peer read, compare, read-only (Scenario 12 backend seam + `effective-schedule.integration.spec.ts` + `effective-schedule-page.test.tsx` + `effective-schedule.spec.ts`; Scenario 12 alone does not prove all 4 surfaces)
    - T48 -> HĐTN/GDĐP workbook -> exact retained civil-date/time-slot timetable authority (reused authoritative `special-programme-lifecycle-e2e.integration.spec.ts` suite)
    - T49 -> Actual-teacher curricular workload + special-program workload vs adjusted required norm (Scenarios 8, 9, 10 + Snapshot V4 supporting evidence)
  - Eliminated overclaims: accurately separated cross-domain integration scenario coverage from retained domain suites.
  - Re-executed and verified all targeted authoritative suites locally with 100% pass rate.
  - Zero production code edits; zero schema changes; zero migration; zero deployment mutation.

## Production Code Changes

- **None**: All production services behaved strictly in accordance with accepted ADRs and specifications.
- No schema changes or migrations.
- No authentication or capability architecture changes.

## Zero-Production-Mutation Boundary

- Strictly zero modifications to production VPS, Nginx, PostgreSQL, or system services.
- Protected systems (`D:\Quan_li_noi_tru`, `D:\Edu_DamSan`, DamSanV5) were completely unreferenced and untouched.
- Production environment status remains `PRE-OPERATIONAL`.
