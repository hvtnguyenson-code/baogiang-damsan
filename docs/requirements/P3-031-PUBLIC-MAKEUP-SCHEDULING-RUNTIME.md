# P3-031 — Public Make-Up Scheduling Runtime

## 1. Task Authority and Governance

- **Task ID:** `P3-031`
- **Parent Task / Direct Predecessor:** `P3-030` (`CLOSED` by `SYNC-P3-030`)
- **Direct Architecture Authority:** `ADR-056-PUBLIC-MAKEUP-SCHEDULING-ARCHITECTURE.md` (Accepted)
- **Traceability Tag:** `T08`
- **Canonical Main Base:** `85a147927a8fec03d06852896e77a575a3addd20`
- **Dedicated Branch:** `feat/p3-031-public-makeup-runtime`
- **Governance Status:** `IN_REVIEW`

---

## 2. Delivered Runtime Surface

### 2.1 Contracts (`packages/contracts`)
Added canonical contracts in `packages/contracts/src/index.ts`:
- `MakeupTeachingScheduleRecord`: Represents the authoritative state of a scheduled make-up lesson with exact source and target provenance.
- `MakeupTeachingCandidateRecord`: Advisory candidate read model for obligations proven as open debt (`PROVEN_OPEN_DEBT`).
- `MakeupTeachingCandidateListResponse`, `MakeupTeachingScheduleCreateResult`, `MakeupTeachingScheduleReverseResult`, `MakeupTeachingScheduleListResponse`.

### 2.2 Control Plane Service & Controller (`apps/api`)
- `MakeupSchedulesService` (`apps/api/src/operational-overlays/makeup-schedules.service.ts`):
  - `listCandidates`: Scans allocated normal lesson occurrences within bounded query filters, calculates `TEACHING_PROGRESS_DEBT_V2`, and returns candidates having `PROVEN_OPEN_DEBT` and matching disposition (`ABSENCE_NO_REPLACEMENT` or `DIFFERENT_SUBJECT_SUPERVISION`).
  - `create`: Runs in a `SERIALIZABLE` transaction, revalidating exact post-operational source obligation, `PROVEN_OPEN_DEBT`, prospective target time slot in `Asia/Ho_Chi_Minh`, teacher eligibility via active `StaffSubject`, canonical collision coverage, replacement lineage, and deterministic idempotency.
  - `list`: Bounded queries with pagination, filtering by status (`ACTIVE`, `REVERSED`), academic year, class, and subject.
  - `get`: Retrieves exact schedule by ID.
  - `reverse`: Runs in a `SERIALIZABLE` transaction with CAS on `expectedUpdatedAt`. Blocks reversal if an ACTIVE `CurricularTeachingExecution(kind=MAKEUP)` references this schedule.
- `OperationalOverlaysService` (`apps/api/src/operational-overlays/operational-overlays.service.ts`):
  - Added reciprocal guard to `reverseLessonDisposition`: Prevents reversal of a source disposition if an ACTIVE `MakeupTeachingSchedule` references it.
- `MakeupSchedulesController` (`apps/api/src/operational-overlays/makeup-schedules.controller.ts`):
  - Mounted at `@Controller(['operational-overlays/makeup-schedules', 'makeup-teaching-schedules'])`.
  - Guarded by `SessionAuthGuard`, `CsrfOriginGuard`, and `CapabilityGuard` checking `TEACHING_OPERATION_MANAGE` (scoped to `SUBJECT` or `SCHOOL_WIDE`).

### 2.3 Management UI (`apps/web`)
- `MakeupSchedulingPage` (`apps/web/src/pages/MakeupSchedulingPage.tsx`):
  - Mounted at `/quan-tri/lich-day-bu` and guarded by `canManageTeachingOperation`.
  - Conforms strictly to `.codex/skills/damsan-ui/SKILL.md` and `DESIGN.md` in task-oriented Vietnamese.
  - Supports candidate selection, prospective target scheduling, clear collision/validation feedback, viewing active/reversed schedules, reversal with required reason, and creating replacement schedules from reversed ones.
- API Client & Routing:
  - `makeupSchedulesApi` in `apps/web/src/lib/makeup-schedules-api.ts`.
  - Navigation registration in `managementRoutes` via `canManageTeachingOperation` in `apps/web/src/lib/capabilities.ts`.

---

## 3. Invariants Enforced (ADR-056 Compliance)

1. **Source Obligation:**
   - Schedulable source must be exact `PROVEN_OPEN_DEBT` under canonical `TEACHING_PROGRESS_DEBT_V2`.
   - `UNCONFIRMED_COMPLETION_GAP` and unexcused absences without disposition are strictly rejected.
   - Requires valid retained normal opportunity with effective disposition (`ABSENCE_NO_REPLACEMENT` or `DIFFERENT_SUBJECT_SUPERVISION`).
   - Source date must be on or after the operational start date (`sourceCivilDate >= operationalStartDate`).
2. **Client Never Selects PPCT Coordinates:**
   - Client passes only occurrence and disposition identities. PPCT plan, version, item revision, sequence, and curricular component are derived server-side.
3. **Prospective Target Only:**
   - Target slot start time must be strictly in the future compared to command time evaluated in `Asia/Ho_Chi_Minh`. Backdated scheduling is prohibited.
   - Target slot definition must have `allowMakeupTeaching = true` and match target weekday.
   - Target date/time must not intersect calendar interruptions or active calendar exceptions.
4. **Teacher Eligibility:**
   - Scheduled teacher must be an active user, teaching staff, and hold a date-effective `StaffSubject` for the source subject on target date.
   - Eligibility snapshot is frozen in database record (`eligibilityCheckedAt`, `eligibilityStaffSubjectId`, etc.).
5. **Canonical Collision Reuse:**
   - Evaluates wall-clock interval overlap for both school class and scheduled teacher against normal timetable entries, active make-up schedules, active special activities (including GDĐP/HĐTN-HN), and operational exceptions.
6. **Reciprocal Guards:**
   - ACTIVE `CurricularTeachingExecution(kind=MAKEUP)` blocks `MakeupTeachingSchedule` reversal.
   - ACTIVE `MakeupTeachingSchedule` blocks source `OperationalLessonDisposition` reversal.
7. **Concurrency & Idempotency:**
   - Enforced under `SERIALIZABLE` isolation.
   - `requestKey` + deterministic SHA-256 semantic fingerprint: same request returns idempotent replay; conflicting payload with same key returns HTTP 409 Conflict.
   - Existing unique constraint `makeup_teaching_schedules_one_active_obligation_key` strictly preserved.
8. **Scheduling Does Not Imply Execution:**
   - Creating a make-up schedule creates zero teaching executions, consumes zero additional PPCT items, and does not close debt until execution occurs.

---

## 4. Test Evidence

- **API Unit Suite:** 90 test suites passed, 1662 tests passed (including 36 dedicated service tests in `makeup-schedules.service.spec.ts` and reciprocal guard tests in `operational-overlays.service.spec.ts`).
- **Web Unit Suite:** 23 test suites passed, 349 tests passed (including 5 dedicated UI and capability routing tests in `makeup-scheduling-page.test.tsx`).
- **Typecheck:** 0 errors across `@baogiang/contracts`, `@baogiang/config`, `@baogiang/api`, and `@baogiang/web`.
- **Lint:** 0 warnings and 0 errors across all workspaces.
- **Production Builds:** `@baogiang/api` and `@baogiang/web` build cleanly.
