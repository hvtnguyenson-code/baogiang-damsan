# P5-010 — Full Business Pilot Cross-Domain Freeze

## Status

`IN_REVIEW` on branch `feat/p5-010-full-business-cross-domain-freeze`

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
| **T08** | Operational start & delayed go-live | ADR-054, P1-031 | `VERIFIED` | Guard pre-operational period; historical ingestion without auto-debt; confirmed executions count towards earned workload |
| **T13** | Native PPCT import & versioning | P2-010, P2-020 | `VERIFIED` | Authoritative PPCT plan/version lineage, grade/subject applicability, item revisions |
| **T14** | Curricular component routing (CORE vs SPECIALIZED_STUDY) | P2-001D, P2-003 | `VERIFIED` | Deterministic weekly occurrence allocation; independent progression; specialized study is curricular, never SpecialActivity |
| **T19** | Native TKB & timetable management | P2-030, P2-060 | `VERIFIED` | Retained timetable versions, time slots, entries, teacher-class assignments |
| **T20** | School-wide effective teaching schedule | P2-060, P2-061 | `VERIFIED` | Canonical effective schedule over raw TKB; reflects normal, makeup, special activity, calendar suppressions |
| **T21** | Teacher Workspace schedule views | P2-061 | `VERIFIED` | "Lịch của tôi", "Toàn trường", selected teacher schedule, comparative views fed strictly by effective schedule read paths |
| **T23** | Public make-up scheduling | P3-030, P3-031 | `VERIFIED` | Proven open debt -> candidate -> schedule -> occupancy/collision -> execution -> debt resolution without consuming new PPCT items |
| **T24** | Historical ingestion & reconciliation | P3-010, P3-020 | `VERIFIED` | `CONFIRMED`, `UNCONFIRMED`, `CONFLICT` semantics; exact PPCT provenance; actual teacher credit; no silent overwrite |
| **T28** | GDĐP programme lifecycle | P4-010, P4-074 | `VERIFIED` | Master -> plan version -> topic items -> occurrence slots -> staffing -> publish -> materialize -> SpecialActivity |
| **T29** | HĐTN-HN programme lifecycle | P4-010, P4-074 | `VERIFIED` | CLASS, GRADE, SCHOOL_WIDE scopes; dual-gate attestation + execution; anti-class fan-out |
| **T30** | Date-effective homeroom resolution | P1-010, P1-012A | `VERIFIED` | Historical GVCN resolved strictly at occurrence date; subsequent GVCN reassignment does not rewrite past occurrences |
| **T43** | Multi-teacher staffing & anti-Cartesian double-count | P4-020, P4-050 | `VERIFIED` | Exact Slot -> Set<Teacher> preserved; individual valid evidence credit; class targets and attestations do not multiply workload |
| **T44** | Special programme workload projection | P4-050 | `VERIFIED` | Eligible participation executions, coefficient resolution, attestation gate, projection profile |
| **T45** | Workload adjustment policies | P4-060, P4-061 | `VERIFIED` | `TRU_TIET`, `TRU_PHAN_TRAM`, `GHI_DE`, calendar proration, strict typed policy rules |
| **T46** | Canonical adjustment source matching | P4-060, P4-061 | `VERIFIED` | Homeroom responsibility, additional duties; no inferring from title/role text; fail closed on invalid source |
| **T47** | Official combined workload calculation | P4-061, P4-050 | `VERIFIED` | Curricular earned + special programme earned = total earned; adjusted required workload; variance = earned - required |
| **T48** | Actual teacher vs nominal teacher attribution | P4-061 | `VERIFIED` | Workload credit attributed strictly to `actualTeacherUserId` on valid execution |
| **T49** | Reporting Statement Snapshot V4 | LOCAL-FC-05I0D | `VERIFIED` | Full freeze of official workload, adjustment segments, cryptographic semantic hash, tamper detection, post-freeze mutation immunity |

## Full Business Pilot Freeze Scope

1. **Curricular Execution & Progression**:
   - `AcademicYear` / `Calendar` -> `TeachingAssignment` -> native PPCT -> native TKB -> curricular opportunity -> `TeachingExecution` -> progression/debt/late -> reporting.
   - `CORE` and `SPECIALIZED_STUDY` routing verified under `CORE_PLUS_SPECIALIZED_STUDY` profile.
   - Specialized study progresses independently and remains curricular (count in `SpecialActivity` is strictly 0).
2. **Delayed Go-Live (Operational Start)**:
   - `OPERATIONAL_START` boundary resolved dynamically via business configuration.
   - Pre-operational periods do not fabricate debt or late marks.
   - Valid historical executions count towards earned workload.
3. **Public Make-Up Scheduling**:
   - Proven open debt -> candidate -> schedule make-up -> collision detection -> execution -> debt resolution.
   - Preserves original PPCT obligation without consuming new PPCT items.
4. **GDĐP / HĐTN-HN Special Programmes**:
   - Four distinct scopes: `GDDP GRADE`, `HDTN CLASS`, `HDTN GRADE`, `HDTN SCHOOL_WIDE`.
   - Date-effective homeroom resolution: historical GVCN preserved at occurrence date; subsequent reassignment does not mutate historical occurrence staffing.
   - Grade and School-Wide scopes do not fan out workload by class targets.
   - Multi-teacher staffing credits each teacher exactly once per valid participation execution without Cartesian multiplication.
5. **Workload Adjustment & Official Workload**:
   - Strict typed policy with `TRU_TIET` and `TRU_PHAN_TRAM`.
   - Homeroom responsibility and additional duty source provenance matching.
   - Combined earned credit: Curricular (T49) + Special Programme (P4-050) = Total Earned.
   - Required credit derived from base weekly norm minus proration/deductions.
   - Variance credit = Earned - Required.
6. **Reporting Statement Snapshot V4**:
   - Freezes official workload, curricular contributions, special programme contributions, adjustment segments, and applied rules into immutable canonical JSON.
   - Validates cryptographic semantic hash and frozen subject integrity.
   - Demonstrates complete immunity against subsequent source mutations (live execution changes do not rewrite frozen snapshot).
7. **Fail-Closed Guarantees**:
   - Missing configuration policies return `BLOCKED` status without silent fallback.
   - Invalid or malformed policy rules throw descriptive validation errors.

## Cross-Domain Test Matrix

The integration suite is implemented in:
`apps/api/test/pilot-business-freeze/p5-010-full-business-freeze.integration.spec.ts`

| Scenario | Title | Production Seam Tested | Database State Verified |
| :--- | :--- | :--- | :--- |
| **1** | Normal curriculum happy path | `ProgressDebtService`, `ReportingProjectionService` | `completedCount >= 1`, `openDebtCount = 0`, `lateCount = 0` |
| **2** | CORE + SPECIALIZED_STUDY routing | `PpctOccurrenceAllocationService.resolveV2` | Independent progression; `specialActivityCount = 0` |
| **3** | Delayed go-live & pre-op ingestion | `BusinessConfigurationService`, `OfficialWorkloadProjectionService` | Pre-op has 0 auto-debt; historical execution earns credit |
| **4** | Public make-up scheduling | `ProgressDebtService`, `CurricularTeachingExecution` | Debt resolved; PPCT item lineage unchanged |
| **5** | HĐTN CLASS historical homeroom | `SpecialProgrammeWorkloadProjectionService` | GVCN A preserved; subsequent GVCN B does not rewrite history |
| **6** | HĐTN GRADE & SCHOOL_WIDE dual gate | `SpecialProgrammeWorkloadProjectionService` | Dual gate verified; anti-class fan-out verified |
| **7** | GDĐP multi-teacher staffing | `SpecialProgrammeWorkloadProjectionService` | 2 teachers credit exactly 1.0 each; no Cartesian multiplication |
| **8** | Mixed earned workload | `OfficialWorkloadProjectionService` | Curricular (1) + Special (1) = Earned (2) |
| **9** | Workload adjustment (TRU_TIET, TRU_PHAN_TRAM) | `OfficialWorkloadProjectionService` | Base 17 - 4 = 13; applied rules verified; variance verified |
| **10** | Reporting Statement Snapshot V4 freeze | `ReportingStatementsService`, canonicalizer | Immutable JSON snapshot; semantic hash verified; mutation immunity |
| **11** | Fail-closed policy & provenance validation | `OfficialWorkloadProjectionService`, `BusinessConfigurationService` | Missing policy -> `BLOCKED`; invalid policy -> throws |
| **12** | Teacher Workspace effective schedule | `EffectiveScheduleService` | Normal, makeup, and special activity slots merged accurately |

## Defects Discovered

- **None**: All production services (`ProgressDebtService`, `ReportingProjectionService`, `OfficialWorkloadProjectionService`, `SpecialProgrammeWorkloadProjectionService`, `ReportingStatementsService`, `EffectiveScheduleService`, `BusinessConfigurationService`, `PpctOccurrenceAllocationService`) behaved strictly in accordance with accepted ADRs and specifications.
- No schema changes or migrations were required.
- No authentication or capability architecture redesign was required.

## Zero-Production-Mutation Boundary

- Strictly zero modifications to production VPS, Nginx, PostgreSQL, or system services.
- Protected systems (`D:\Quan_li_noi_tru`, `D:\Edu_DamSan`, DamSanV5) were completely unreferenced and untouched.
- Production environment status remains `PRE-OPERATIONAL`.
