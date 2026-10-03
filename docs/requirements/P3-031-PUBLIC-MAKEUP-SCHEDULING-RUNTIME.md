# P3-031 — Public Make-Up Scheduling Runtime

## 1. Task Authority and Governance

- **Task ID:** `P3-031`
- **Parent Task / Direct Predecessor:** `P3-030` (`CLOSED` by `SYNC-P3-030`)
- **Direct Architecture Authority:** `ADR-056-PUBLIC-MAKEUP-SCHEDULING-ARCHITECTURE.md` (Accepted)
- **Traceability Tag:** `T08`
- **Canonical Main Base:** `85a147927a8fec03d06852896e77a575a3addd20`
- **Dedicated Branch:** `feat/p3-031-public-makeup-runtime`
- **Governance Status:** `CLOSED` by `SYNC-P3-031`

---

## 2. Delivered Runtime Surface

### 2.1 Contracts (`packages/contracts`)
Added canonical contracts in `packages/contracts/src/index.ts`:
- `CreateMakeupScheduleRequest`: Shared contract requiring `academicYearId`, `sourceNormalOccurrenceKey` (`NORMAL:<uuid>:YYYY-MM-DD`), `targetCivilDate`, `targetTimeSlotDefinitionId`, `scheduledTeacherUserId`, optional `replacesId`, optional `note`, and `requestKey`. Contains zero client-side PPCT coordinates or source disposition coordinates.
- `ReverseMakeupScheduleRequest`: Reversal input with `expectedUpdatedAt`, `reversalReason`, and `requestKey`.
- `MakeupTargetOptionsResponse`, `MakeupTargetSlotOption`, `MakeupTargetTeacherOption`: Human-readable advisory options read model for target slot and teacher selection.
- `MakeupTeachingScheduleRecord`: Authoritative state of a scheduled make-up lesson with exact source and target provenance.
- `MakeupTeachingCandidateRecord`: Advisory candidate read model for obligations proven as open debt (`PROVEN_OPEN_DEBT`).
- `MakeupTeachingCandidateListResponse`, `MakeupTeachingScheduleCreateResult`, `MakeupTeachingScheduleReverseResult`, `MakeupTeachingScheduleListResponse`.

### 2.2 Control Plane Service & Controller (`apps/api`)
- `MakeupSchedulesService` (`apps/api/src/operational-overlays/makeup-schedules.service.ts`):
  - `listCandidates`: Scans allocated normal lesson occurrences within bounded query filters, calculates `TEACHING_PROGRESS_DEBT_V2`, and returns candidates having `PROVEN_OPEN_DEBT` and matching disposition (`ABSENCE_NO_REPLACEMENT` or `DIFFERENT_SUBJECT_SUPERVISION`). Cross-subject queries without `subjectId` strictly require `SCHOOL_WIDE` authority.
  - `getTargetOptions`: Advisory endpoint returning eligible same-subject teachers and prospective target slots (`allowMakeupTeaching = true`) for a selected candidate and target civil date. Enforces caller subject authority.
  - `create`: Runs in a `SERIALIZABLE` transaction:
    - Authorizes caller against exact resolved source subject (`TEACHING_OPERATION_MANAGE` scoped to `SUBJECT` or `SCHOOL_WIDE`).
    - For idempotent replay: fetches retained record and authorizes caller against `replay.subjectId` before comparing request fingerprint.
    - Resolves active calendar authority using bounded `academicCalendarVersion.findMany`, failing closed if 0 or >1 active calendars match.
    - Revalidates post-operational start date, exact `PROVEN_OPEN_DEBT` classification, and prospective target slot timing in `Asia/Ho_Chi_Minh`.
    - Verifies teacher eligibility via active `StaffSubject` on the target date.
    - Reuses canonical `ResolvedLessonOccurrencesService.resolveInTransaction(tx, ...)` and `extractCanonicalOccupancies()` to evaluate class and teacher collision. Fails closed with sanitized reason if resolution is `BLOCKED`.
    - Handles replacement lineage and preserves the partial unique database invariant.
  - `list`: Bounded queries with pagination, filtering by status (`ACTIVE`, `REVERSED`), academic year, class, and subject. Cross-subject queries require `SCHOOL_WIDE`.
  - `get`: Retrieves exact schedule by ID.
  - `reverse`: Runs in a `SERIALIZABLE` transaction with CAS on `expectedUpdatedAt`. Blocks reversal if an ACTIVE `CurricularTeachingExecution(kind=MAKEUP)` references this schedule.
- `OperationalOverlaysService` (`apps/api/src/operational-overlays/operational-overlays.service.ts`):
  - Reciprocal guard in `reverseLessonDisposition`: Prevents reversal of a source disposition if an ACTIVE `MakeupTeachingSchedule` references it.
- `MakeupSchedulesController` (`apps/api/src/operational-overlays/makeup-schedules.controller.ts`):
  - Mounted at `@Controller(['operational-overlays/makeup-schedules', 'makeup-teaching-schedules'])`.
  - Guarded by `SessionAuthGuard`, `CsrfOriginGuard`, and `CapabilityGuard` checking `TEACHING_OPERATION_MANAGE` (scoped to `SUBJECT` or `SCHOOL_WIDE`).

### 2.3 Management UI (`apps/web`)
- `MakeupSchedulingPage` (`apps/web/src/pages/MakeupSchedulingPage.tsx`):
  - Mounted at `/quan-tri/lich-day-bu` and guarded by `canManageTeachingOperation`.
  - Supports both `SCHOOL_WIDE` (cross-subject browsing with optional subject filter) and `SUBJECT` (automatically binds queries to authorized subject; displays subject selector for multiple SUBJECT grants).
  - Operator selects from human-readable target slot dropdowns (`Tiết {ordinal} — {displayLabel} ({startTime}–{endTime})`) and teacher dropdowns (`{displayName} ({staffCode})`) populated via the advisory `getTargetOptions` endpoint. No raw UUIDs required for input.
  - Submits exact canonical `sourceNormalOccurrenceKey` (`NORMAL:<uuid>:YYYY-MM-DD`). Sends zero PPCT coordinates.
  - Supports candidate selection, prospective target scheduling, clear collision/validation feedback, viewing active/reversed schedules, reversal with required reason, and creating replacement schedules from reversed ones.
- API Client & Routing:
  - `makeupSchedulesApi` in `apps/web/src/lib/makeup-schedules-api.ts` importing contracts from `@baogiang/contracts`.
  - Navigation registration in `managementRoutes` via `canManageTeachingOperation` in `apps/web/src/lib/capabilities.ts`.

---

## 3. Invariants Enforced (ADR-056 Compliance)

1. **Source Obligation:**
   - Schedulable source must be exact `PROVEN_OPEN_DEBT` under canonical `TEACHING_PROGRESS_DEBT_V2`.
   - `UNCONFIRMED_COMPLETION_GAP` and unexcused absences without disposition are strictly rejected.
   - Requires valid retained normal opportunity with effective disposition (`ABSENCE_NO_REPLACEMENT` or `DIFFERENT_SUBJECT_SUPERVISION`).
   - Source date must be on or after the operational start date (`sourceCivilDate >= operationalStartDate`).
2. **Client Never Selects PPCT Coordinates:**
   - Client passes only occurrence key. PPCT plan, version, item revision, sequence, and curricular component are derived server-side.
3. **Prospective Target Only:**
   - Target slot start time must be strictly in the future compared to command time evaluated in `Asia/Ho_Chi_Minh`. Backdated scheduling is prohibited.
   - Target slot definition must have `allowMakeupTeaching = true` and match target weekday.
   - Target date/time must not intersect calendar interruptions or active calendar exceptions.
4. **Target Calendar Authority:**
   - Authoritative active calendar is resolved via bounded query requiring exactly 1 active version covering the target date. Fails closed on 0 or >1 versions without picking arbitrary versions.
5. **Teacher Eligibility:**
   - Scheduled teacher must be an active user, teaching staff, and hold a date-effective `StaffSubject` for the source subject on target date.
   - Eligibility snapshot is frozen in database record (`eligibilityCheckedAt`, `eligibilityStaffSubjectId`, etc.).
6. **Canonical Collision Reuse:**
   - Evaluates wall-clock interval overlap for both school class and scheduled teacher reusing canonical `ResolvedLessonOccurrencesService.resolveInTransaction()` and shared `extractCanonicalOccupancies()`. Does not maintain a separate collision engine.
   - Fails closed if canonical resolution returns `BLOCKED`.
7. **Reciprocal Guards:**
   - ACTIVE `CurricularTeachingExecution(kind=MAKEUP)` blocks `MakeupTeachingSchedule` reversal.
   - ACTIVE `MakeupTeachingSchedule` blocks source `OperationalLessonDisposition` reversal.
8. **Concurrency, Idempotency & Authorization:**
   - Enforced under `SERIALIZABLE` isolation.
   - Idempotent replay verifies caller capability on `replay.subjectId` before comparing fingerprints.
   - Request key replay returns `IDEMPOTENT_REPLAY` if fingerprint matches, HTTP 409 Conflict if payload differs.
   - Existing unique constraint `makeup_teaching_schedules_one_active_obligation_key` strictly preserved.
9. **Scheduling Does Not Imply Execution:**
   - Creating a make-up schedule creates zero teaching executions, consumes zero additional PPCT items, and does not close debt until execution occurs.

---

## 4. Test Evidence

- **API Unit Suite:** 90 test suites passed, 1677 tests passed (including 51 dedicated service tests in `makeup-schedules.service.spec.ts` with comprehensive negative authorization matrix and canonical collision reuse).
- **Web Unit Suite:** 23 test suites passed, 351 tests passed (including 7 dedicated UI tests in `makeup-scheduling-page.test.tsx` verifying canonical key payload, absence of client PPCT coords, human-readable dropdowns, single/multi SUBJECT and SCHOOL_WIDE authorization).
- **Integration Suite:** Focused PostgreSQL integration coverage at `apps/api/test/operational-overlays/makeup-schedules.integration.spec.ts` passed authoritatively in exact-head PR CI #622 (run `37113263889`) and again in post-merge main CI #623 (run `37113742941`).
- **Typecheck:** 0 errors across `@baogiang/contracts`, `@baogiang/config`, `@baogiang/api`, and `@baogiang/web`.
- **Lint:** 0 warnings and 0 errors across all workspaces.
- **Production Builds:** `@baogiang/api` and `@baogiang/web` build cleanly.

---

## 5. Closure Evidence

- Final independently reviewed implementation HEAD: `2fc5c48d445af75961f94609edd1551530504063`.
- Parent PR: #187 (`feat(makeup): implement P3-031 public make-up scheduling runtime`).
- Exact-head PR CI: #622 / run `37113263889` — SUCCESS; Linux full lint/typecheck/unit/integration/build/Playwright and Windows deployment contract both passed.
- Normal merge/main: `f8612a7e15be3dd8b45079f30860f56c37a943cb`.
- Authoritative post-merge main CI: #623 / run `37113742941` — SUCCESS; integration, build, Playwright and Windows deployment contract all passed on the merged tree.
- Review corrections before merge were forward-only and absorbed into the reviewed HEAD: shared Web/API contract alignment and canonical collision reuse, integration fixture/route repair, valid MAKEUP execution persistence shape, and deterministic module-scoped AuditService test binding.
- Zero schema/migration/deploy/VPS/production mutation was introduced by P3-031.
- `SYNC-P3-031` is the single non-recursive governance closure. P3-031 is CLOSED. P5-010 remains blocked only by `P4-061` among its direct unresolved dependencies.
