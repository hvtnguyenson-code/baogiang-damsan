# P5-010 — Full Business Pilot Cross-Domain Freeze

## Status

`IN_REVIEW` on branch `feat/p5-010-full-business-cross-domain-freeze` (Correction 001 applied)

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

| Traceability ID | Domain / Requirement | Governing Authority | Status in P5-010 | Integration Seam Covered |
| :--- | :--- | :--- | :--- | :--- |
| **T08** | Operational start & delayed go-live | ADR-054, P1-031 | `VERIFIED` | Production `HistoricalTeachingService` (preview -> confirm) ingests canonical historical execution; pre-op period guards against automatic debt; confirmed executions contribute to earned workload |
| **T13** | Native PPCT import & versioning | P2-010, P2-020 | `VERIFIED` | Authoritative PPCT plan/version lineage, grade/subject applicability, item revisions |
| **T14** | Curricular component routing (CORE vs SPECIALIZED_STUDY) | P2-001D, P2-003 | `VERIFIED` | Deterministic weekly occurrence allocation; independent progression via production `TeachingExecutionsService.confirmNormal` and `ProgressDebtService.resolveV2`; zero cross-consumption; zero SpecialActivity creation |
| **T19** | Native TKB & timetable management | P2-030, P2-060 | `VERIFIED` | Retained timetable versions, time slots, entries, teacher-class assignments |
| **T20** | School-wide effective teaching schedule | P2-060, P2-061 | `VERIFIED` | Production `EffectiveScheduleService.getWeeklySchedule` verifies union of `BASE_TIMETABLE`, `MAKEUP_TEACHING`, and `SPECIAL_ACTIVITY` |
| **T21** | Teacher Workspace schedule views | P2-061 | `VERIFIED` | Read-only weekly schedule view with zero database mutation |
| **T23** | Public make-up scheduling | P3-030, P3-031 | `VERIFIED` | Open debt -> production `MakeupSchedulesService.create` -> `TeachingExecutionsService.confirmMakeup` -> debt resolved via `ProgressDebtService.resolve`; PPCT item count invariant preserved |
| **T24** | Historical ingestion & reconciliation | P3-010, P3-020 | `VERIFIED` | Production `HistoricalTeachingService` ingestion happy path; retained `HistoricalTeachingImportBatch/Row` linkage; detailed conflict/unconfirmed edge cases verified in `test/historical-teaching/historical-teaching.integration.spec.ts` |
| **T28** | GDĐP programme lifecycle | P4-010, P4-074 | `VERIFIED` | Master -> plan version -> topic items -> occurrence slots -> staffing -> publish -> materialize via production `ProgrammePlanningService.materializeOccurrence` -> SpecialActivity |
| **T29** | HĐTN-HN programme lifecycle | P4-010, P4-074 | `VERIFIED` | CLASS, GRADE, SCHOOL_WIDE scopes; dual-gate attestation + execution; anti-class fan-out |
| **T30** | Date-effective homeroom resolution | P1-010, P1-012A | `VERIFIED` | HĐTN-HN CLASS occurrence resolves historical GVCN A at occurrence civil date; subsequent reassignment to GVCN B preserves historical staffing and credit on Teacher A |
| **T43** | Multi-teacher staffing & anti-Cartesian double-count | P4-020, P4-050 | `VERIFIED` | Single slot with staffing {Teacher A, Teacher B} across 2 class targets; each teacher receives exactly 1.0 credit; no Cartesian multiplication |
| **T44** | Special programme workload projection | P4-050 | `VERIFIED` | Production `SpecialProgrammeWorkloadProjectionService.resolve` verifies dual gate positive/negative and attestation validation |
| **T45** | Workload adjustment policies | P4-060, P4-061 | `VERIFIED` | Production `OfficialWorkloadProjectionService.resolve` proves `GHI_DE`, `TRU_TIET`, `TRU_PHAN_TRAM`, priority order (1, 2, 3), and calendar interruption proration |
| **T46** | Canonical adjustment source matching | P4-060, P4-061 | `VERIFIED` | Homeroom responsibility and AdditionalDuty definition UUID matching; fail-closed on unassigned or nonexistent duty ID |
| **T47** | Official combined workload calculation | P4-061, P4-050 | `VERIFIED` | Combined earned credit: Curricular (1) + Special Programme (1) = Total Earned (2); adjusted norm and required credit derived |
| **T48** | Actual teacher vs nominal teacher attribution | P4-061 | `VERIFIED` | Under `SAME_SUBJECT_SUBSTITUTION`, curricular credit is awarded strictly to substitute teacher B (`actualTeacherUserId`), zero credit to nominal teacher A |
| **T49** | Reporting Statement Snapshot V4 | LOCAL-FC-05I0D | `VERIFIED` | Production `ReportingStatementsService.preview` and `.submit` freezes official workload, adjustment segments, cryptographic semantic hash; post-freeze source mutation immunity verified; V1/V2/V3 backward readability verified via existing authoritative integration suite `test/reporting-statements/reporting-statements.integration.spec.ts` |

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
| **12** | Teacher Workspace effective schedule | `EffectiveScheduleService.getWeeklySchedule` | Composite weekly schedule contains `BASE_TIMETABLE`, `MAKEUP_TEACHING`, and `SPECIAL_ACTIVITY` read-only |

## Existing Authoritative Test Suites Reused for Supporting Evidence

1. **Snapshot Backward Compatibility (V1, V2, V3)**:
   - File: `apps/api/test/reporting-statements/reporting-statements.integration.spec.ts`
   - Tests:
     - `CP5-30 new submit persists SNAPSHOT_V3 with canonical provenance and pinned asOf` (PASS)
     - `CP5-31 HCM anchor resolves policy effective on 2026-09-13 when asOf is 2026-09-12T17:00:00.000Z` (PASS)
     - `CP5-32 frozen statement remains byte-stable and retains original provenance after later policy replacement` (PASS)
     - `CP5-33 historical V1 revision is accepted, readable, and verified without V2 provenance` (PASS)
     - `CP5-34 idempotent replay succeeds even when current policy is deleted or unavailable` (PASS)
2. **Workload Tamper and Provenance Integrity**:
   - File: `apps/api/test/official-workload/official-workload.integration.spec.ts`
   - Tests:
     - `1. WORKLOAD_ADJUSTMENT create/publish/resolve` (PASS)
     - `2. AdditionalDuty effective window` (PASS)
     - `3. Homeroom effective window` (PASS)
     - `4. ACTIVE NORMAL actual-teacher credit` (PASS)
     - `5. SAME_SUBJECT_SUBSTITUTION credits substitute only` (PASS)
     - `6. MAKEUP execution-date ownership` (PASS)
     - `7. REVERSED execution exclusion` (PASS)
     - `8. combined curricular + P4-050 credit` (PASS)
     - `9. arbitrary partial-range/calendar proration` (PASS)
     - `10. policy change inside report range` (PASS)
     - `11. Reporting Statement submit persists SNAPSHOT_V4` (PASS)
     - `12. later policy/duty/homeroom mutation does not rewrite frozen V4` (PASS)

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

## Production Code Changes

- **None**: All production services behaved strictly in accordance with accepted ADRs and specifications.
- No schema changes or migrations.
- No authentication or capability architecture changes.

## Zero-Production-Mutation Boundary

- Strictly zero modifications to production VPS, Nginx, PostgreSQL, or system services.
- Protected systems (`D:\Quan_li_noi_tru`, `D:\Edu_DamSan`, DamSanV5) were completely unreferenced and untouched.
- Production environment status remains `PRE-OPERATIONAL`.
