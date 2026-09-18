# P4-010 — GDĐP / HĐTN Programme Architecture Closure

- **Task ID:** `P4-010`
- **Starting Canonical SHA:** `df8fdadc7e57d284e92cd336e234d95e8820cdc4`
- **Branch:** `docs/gddp-hdtn-programme-architecture-010`
- **Dependencies:** `P0-001` (CLOSED), `P1-010` (CLOSED)
- **Traceability:** `T12`, `T15`, `T16`, `T17`, `T43`, `T44`
- **Controlling Authorities:** PA-B v1.2, ADR-034, ADR-035, ADR-038, ADR-044, ADR-045, `LOCAL-FC-05A0`, `LOCAL-FC-05D0D`, `LOCAL-FC-05F0D`, `P2-030`, `P0-900`
- **Status:** `IN_REVIEW`

---

## 1. Context and Problem Statement

`SpecialActivity` (ADR-034 / ADR-035) establishes an atomic scheduled occurrence primitive in the repository, and `SpecialActivityParticipationExecution` (ADR-038) provides relational evidence of individual teacher attendance.

However, `SpecialActivity` was intentionally designed without educational programme concepts. It lacks annual planning, grade syllabus structure, weekly topic progression, per-slot teacher assignment, and programme-level confirmation workflows.

Furthermore, several critical pre-pilot requirements remained unclosed:
- **T12 / T15 / T16 / T17**: GDĐP requires an annual grade programme (Grades 10, 11, 12) with rotating weekly execution; HĐTN-HN requires `CLASS`, `GRADE`, and `SCHOOL_WIDE` operating modes; and per-slot staffing must allow different teachers to teach different periods without Cartesian multiplication.
- **T43 (Absence / Replacement)**: Unresolved since `LOCAL-FC-05A0`. Special programmes have no `Subject` or `TeachingAssignment`, rendering curricular substitution rules invalid, while ADR-038 schema foreign keys forbid substitute execution without valid staffing records.
- **T44 (Programme Confirmation & Workload Gate)**: Unresolved since `LOCAL-FC-05A0`. Coordinator and BGH confirmation rules must be reconciled with individual participation evidence without double-counting teacher workload.

`P4-010` closes these architectural requirements through `ADR-050` in a strictly docs-only specification.

---

## 2. Scope Boundaries

### 2.1 Explicit Allowed Scope
- Definition of upstream educational programme architecture for GDĐP and HĐTN-HN in `docs/decisions/ADR-050-GDDP-HDTN-PROGRAMME-ARCHITECTURE.md`.
- Definition of architectural invariants, closure mapping, and acceptance criteria in this document.
- Governance synchronization in `PRE-PILOT-TASK-REGISTER.md`, `PRE-PILOT-TRACEABILITY-MATRIX.md`, and `CURRENT-PROJECT-STATUS.md` moving `P4-010` to `IN_REVIEW`.

### 2.2 Strictly Forbidden Scope
- Zero changes to Prisma schema or database migrations (`prisma/**`).
- Zero changes to contracts, API controllers, services, or DTOs (`apps/api/**`, `packages/**`).
- Zero changes to Web UI components or pages (`apps/web/**`).
- Zero changes to capability catalog seed files (`prisma/capability-catalog.cjs`).
- Zero changes to CI/CD workflows or deployment scripts.
- Zero production mutations; production remains strictly **PRE-OPERATIONAL**.

---

## 3. Traceability Requirement Closure Mapping

| Traceability ID | Description & Source Authority | Current Repository Gap | ADR-050 Architectural Closure | Downstream Implementation Owner |
|---|---|---|---|---|
| **T12** | Special activities may target class/grade/school and involve multiple teachers (PA-B v1.2 §11; 05A0/05D0 audits). | ADR-034 provides a generic runtime primitive with flat staffing and selector expansion, but lacks upstream programme planning. | ADR-050 establishes the upstream Programme Layer (`ProgrammeMaster`, `ProgrammePlanVersion`, `PlannedProgrammeOccurrence`), keeping `SpecialActivity` as a downstream atomic execution target. | `P4-020` (Persistence), `P4-040` (Bridge) |
| **T15** | HĐTN has distinct `CLASS`, `GRADE`, and `SCHOOL_WIDE` business modes (Product Owner direction; ADR-045). | `SpecialActivityScope` exists, but has no binding to annual HĐTN educational plans or homeroom governance. | ADR-050 defines explicit HĐTN Business Modes (`CLASS`, `GRADE`, `SCHOOL_WIDE`). `CLASS` mode deterministically consumes date-effective `HomeroomAssignment` and freezes homeroom provenance upon materialization. | `P4-020` (Planning models), `P4-040` (Homeroom bridge) |
| **T16** | GDĐP requires a year/grade programme with planned weekly/topic content (PA-B v1.2; P2-030 Row 38). | ADR-034 explicitly omitted category, programme, and series. Base timetable treats GDĐP as a non-peer rotating marker without assigned teachers. | ADR-050 defines GDĐP programme authority bounded by `AcademicYear + Grade` ($10, 11, 12$). Content plans (`ProgrammePlanVersion`, `ProgrammeTopicItem`) manage the syllabus independently of operational scheduling, accommodating dynamic weekly class rotation. | `P4-020` (Programme models), `P4-040` (Materialization) |
| **T17** | Different exact slots of one special programme may have different teacher sets (Product Owner direction; ADR-038). | `SpecialActivity` create command accepts flat `slots[]` and `teachers[]`, creating an implied Cartesian product. | ADR-050 mandates exact per-slot staffing ($\text{Slot} \to \text{Set<Teacher>}$). When teacher sets differ across slots, the P4-040 bridge partitions the occurrence into multiple disjoint `SpecialActivity` roots ($1 \to N$ materialization). | `P4-020` (Slot staffing schema), `P4-040` (Bridge partitioning) |
| **T43** | Special-program absence, replacement, and substitute teacher semantics must be explicit and decoupled from curricular substitution (LOCAL-FC-05A0; ADR-038). | Absence/substitution marked UNRESOLVED in 05A0. ADR-038 schema constraint `actualTeacherUserId == scheduledTeacherUserId` blocks direct substitute execution without staffing provenance. | ADR-050 closes replacement semantics: (1) Scheduled staffing and actual execution are distinct; (2) Absence is never inferred from missing execution; (3) Absence does not delete scheduled staffing, invalidate scheduled identity, or auto-cancel occurrences; (4) Absent teacher receives no execution or workload credit; (5) Materialization fails closed only if intended scheduled staffing lacks any valid eligible teacher; (6) Substitutes cannot execute on original staffing; (7) Pre-materialization replacement reflects in planned staffing via planning lifecycle (draft edit under DRAFT or retained forward correction under PUBLISHED authority); (8) Post-materialization replacement uses runtime CAS reverse + replacement root; (9) Substitutions require explicit authorization (qualifying Coordinator or BGH, no department/title inference); (10) Curricular substitution rules do not apply. | `P4-040` (Operational replacement & bridge orchestration) |
| **T44** | Special-program confirmation authority must reconcile coordinator/BGH confirmation with per-teacher-slot participation evidence and prevent double counting (LOCAL-FC-05A0; ADR-038). | Confirmation marked UNRESOLVED in 05A0. Relationship between programme-level confirmation and individual teacher-slot execution was unspecified. | ADR-050 decouples Attestation from Execution and defines the Workload Gate: Official workload requires **BOTH** valid teacher participation execution **AND** a satisfied programme confirmation gate ($\exists$ qualifying current, non-reversed attestation from Coordinator or BGH professional authority; P4-010 does not hard-code exact BGH capability keys, P4-030 owns that binding). One qualifying participation contributes at most once to workload evidence before applying valid policy/coefficients. Dual attestations and class targets never multiply workload. | `P4-030` (Authorization), `P4-040` (Attestation storage), `P4-050` (Workload projection) |

---

## 4. Architectural Invariant Concrete Examples

### Example 1: Non-Cartesian Per-Slot Staffing (T17)
- **Scenario**: A planned GDĐP occurrence on 2026-10-15 has Period 1 taught by Teacher A, and Period 2 taught by Teacher B.
- **Invariant Rule**: The planned occurrence models:
  $$\text{Period 1} \longrightarrow \{\text{Teacher A}\}, \quad \text{Period 2} \longrightarrow \{\text{Teacher B}\}$$
- **Materialization**: Because staffing differs across periods, the P4-040 bridge creates **two** distinct `SpecialActivity` roots:
  - Root 1: `civilDate: 2026-10-15`, `slot: Period 1`, `staffing: [Teacher A]`.
  - Root 2: `civilDate: 2026-10-15`, `slot: Period 2`, `staffing: [Teacher B]`.
- **Cartesian Prevention**: The system **never** creates a single root with `slots: [Period 1, Period 2]` and `staffing: [Teacher A, Teacher B]`, which would falsely claim that Teacher A taught Period 2 and Teacher B taught Period 1.

### Example 2: Absence Without Replacement
- **Scenario A (Single-staffed slot)**: Period 1 is staffed solely by $\{\text{Teacher A}\}$. Teacher A is scheduled, but on the day of the activity Teacher A is absent with no replacement.
- **Invariant Rule**:
  - Scheduled staffing and actual participation are distinct truths. Teacher A remains the scheduled teacher on the planned occurrence and materialized runtime root.
  - Absence does **not** delete scheduled staffing, rewrite planning truth, or auto-cancel the occurrence.
  - Teacher A submits no execution $\to$ no `SpecialActivityParticipationExecution` is created.
  - Teacher A receives **0** workload credit.
  - Programme attestation cannot manufacture execution evidence for Teacher A.
  - If school administration decides to cancel the session entirely, that requires an explicit retained operational/administrative cancellation fact, not a derivation from absence alone.
- **Scenario B (Multi-staffed slot)**: Period 2 is staffed by $\{\text{Teacher A}, \text{Teacher B}\}$. Teacher A attends; Teacher B is absent with no replacement.
- **Invariant Rule**:
  - Teacher A attends and records valid execution $\to$ contributes to eligible workload evidence once programme confirmation is satisfied.
  - Teacher B's absence does not invalidate Teacher A's valid participation.
  - Teacher B records no execution and receives **0** workload credit.
- **Fail-Closed Materialization Boundary**:
  - Materialization FAILS CLOSED only if the command preparing runtime staffing lacks any valid, eligible scheduled teacher (e.g., if planning removed Teacher A without assigning a replacement B, leaving intended scheduled staffing $\emptyset$, or resolved an ineligible teacher).
  - Mere absence of a scheduled teacher does **not** mean the staffing set is empty.

### Example 3: Substitute Replacement Known Before Materialization
- **Scenario**: Teacher A is scheduled for Grade 10 GDĐP on 2026-11-20. On 2026-11-15, Teacher A requests leave, and an actor holding qualifying explicit coordinator capability assigns Teacher C as the replacement.
- **Invariant Rule**:
  - In the planning layer, replacement is recorded through valid planning lifecycle: direct edit if still in `DRAFT`, or retained forward correction/change with lineage if already `PUBLISHED`.
  - In-place mutation of published planning authority without lineage is forbidden.
  - When the bridge materializes the occurrence, it generates a `SpecialActivity` root with `scheduledTeacherUserId = Teacher C`.
  - On 2026-11-20, Teacher C attends and records valid execution under C's own staffing provenance.

### Example 4: Substitute Replacement Arising After Materialization
- **Scenario**: Occurrence on 2026-11-20 was materialized on 2026-11-18 with Teacher A in `SpecialActivityStaffing`. On 2026-11-20 morning, Teacher A falls ill; Teacher C steps in to teach.
- **Invariant Rule**:
  - Teacher C **cannot** record execution on Teacher A's staffing child (blocked by DB foreign key constraint).
  - The system **does not** perform an in-place `UPDATE` of Teacher A's staffing child.
  - An actor holding qualifying explicit replacement capability triggers a runtime replacement:
    1. The active `SpecialActivity` root is transitioned to `REVERSED` with reason "Substitute teacher replacement: C replaces A".
    2. A replacement `SpecialActivity` root is created (`replacesId = oldRoot.id`) containing Teacher C in its staffing child.
  - Teacher C confirms participation on the replacement root's staffing child.

### Example 5: HĐTN `CLASS` GVCN Change Before Materialization
- **Scenario**: Planned HĐTN `CLASS` occurrence for Class 10A1 on 2026-12-05. On 2026-11-01, Teacher X was GVCN. On 2026-11-15, school assigns Teacher Y as new GVCN effective from 2026-12-01 onwards.
- **Invariant Rule**:
  - When the bridge runs for 2026-12-05, `resolveEffectiveHomeroomTeacher('10A1', '2026-12-05')` returns Teacher Y.
  - The occurrence materializes with Teacher Y as scheduled staffing, citing Teacher Y's `HomeroomAssignment` ID as provenance.

### Example 6: HĐTN `CLASS` GVCN Change After Materialization
- **Scenario**: Occurrence for 2026-12-05 was materialized on 2026-12-01 with Teacher Y (effective GVCN). On 2026-12-03, a retroactively dated homeroom reassignment assigns Teacher Z starting 2026-12-02.
- **Invariant Rule**:
  - The existing materialized `SpecialActivity` root is **not** silently overwritten.
  - If the school wishes Teacher Z to conduct the session, an explicit operational reschedule/reversal command is issued.
  - Otherwise, historical materialization provenance remains intact.

### Example 7: Execution Confirmed but Programme Confirmation Gate Unsatisfied
- **Scenario**: Teacher A teaches GDĐP Period 1 on 2026-10-10 and confirms execution on 2026-10-10 evening. No qualifying programme attestation has yet been recorded for the occurrence.
- **Invariant Rule**:
  - Teacher A's `SpecialActivityParticipationExecution` is valid retained evidence.
  - However, the Programme Confirmation gate is **unsatisfied** (no qualifying, non-reversed attestation exists yet).
  - The workload projection engine (`P4-050`) does **not** count this period toward approved official workload until the programme confirmation gate is satisfied.
  - Downstream personal or reporting projections may surface this state as pending programme confirmation (or semantic equivalent); exact UI component, label, wording, color, and status copy belong to downstream UI/product work.

### Example 8: Programme Attested but Teacher Lacks Execution
- **Scenario**: An actor holding qualifying explicit coordinator capability attests the GDĐP occurrence for 2026-10-10. Teacher B was scheduled for Period 2 but forgot to confirm execution or was absent.
- **Invariant Rule**:
  - Programme attestation certifies student curriculum delivery.
  - However, Teacher B has no valid execution record.
  - The workload engine awards Teacher B **zero** workload contribution. Attestation never manufactures unrecorded teacher execution.

### Example 9: Dual Confirmation by Coordinator and BGH
- **Scenario**: For an important school-wide event, an actor holding qualifying explicit coordinator capability attests the occurrence at 16:00. A qualifying BGH actor holding the required explicit professional capability (for example, a vice principal who holds the qualifying explicit professional capability) also attests the occurrence at 17:30.
- **Invariant Rule**:
  - Both attestation records are stored for administrative audit (conceptual attestation entity).
  - The downstream gate evaluates $\exists \text{ qualifying non-reversed attestation} \equiv \text{TRUE}$.
  - Participating teachers receive at most one eligible workload contribution source for that exact slot. Workload contribution is **never** doubled ($1 \times 2 = 2$ is strictly prevented).

### Example 10: School-Wide Activity Targeting 18 Classes (Anti-Fan-Out)
- **Scenario**: A school-wide HĐTN assembly lasts 1 period (Period 1, Monday) and involves all 18 classes of the school. Teacher A is the sole scheduled teacher.
- **Invariant Rule**:
  - The materialized `SpecialActivity` contains 18 `SpecialActivityClassTarget` children.
  - Teacher A records execution for Period 1.
  - Teacher A receives **at most one** eligible workload contribution source for Period 1. Final credited workload is determined by P4-050 applying approved policy/coefficients.
  - Teacher A **never** receives $1 \times 18 = 18$ periods of credit. Class cardinality does not multiply teacher workload.

---

## 5. Downstream Task Ownership

```text
P4-010 (This task)
  └── Architecture, governance invariants, T12/T15/T16/T17/T43/T44 closure (docs-only)
P4-020
  └── Database schema, migrations, ProgrammeMaster, ProgrammePlanVersion, ProgrammeTopicItem,
      PlannedProgrammeOccurrence, PlannedOccurrenceSlot, PlannedSlotStaffing (planning lifecycle and control plane only)
P4-030
  └── Exact coordinator/BGH capability-resource-scope binding and guards;
      current catalog keys are evidence only until P4-030 closes authority
P4-040
  └── Runtime bridge: materialization algorithms, 1->N partitioning, T43 replacement orchestration,
      homeroom provenance binding, conceptual programme-attestation runtime persistence/control, and T44 attestation recording/reversal semantics
P4-050
  └── Workload projection: dual execution + attestation gate, anti-double-counting, reporting integration
P4-060 / P4-061
  └── Workload adjustment rules (deferred with trigger)
```

---

## 6. Architecture Acceptance Matrix

| Acceptance Requirement | Status | Verification Reference |
|---|---|---|
| Upstream separation from `SpecialActivity` | Satisfied | ADR-050 §2.1; `SpecialActivity` unchanged. |
| GDĐP grade-level content authority ($10, 11, 12$) | Satisfied | ADR-050 §2.2; master at `AcademicYear + Grade`. |
| HĐTN business modes (`CLASS`, `GRADE`, `SCHOOL_WIDE`) | Satisfied | ADR-050 §2.2; explicit business modes defined. |
| Decoupled content plan vs operational scheduling | Satisfied | ADR-050 §2.3; syllabus independent of weekly staffing. |
| Immutable published plan lifecycle (`DRAFT -> PUBLISHED -> SUPERSEDED`) | Satisfied | ADR-050 §2.4; lineage retained, no physical delete. |
| Exact per-slot staffing (T17, non-Cartesian) | Satisfied | ADR-050 §2.5; $\text{Slot} \to \text{Set<Teacher>}$. |
| Materialization partitioning ($1 \to N$ SpecialActivity roots) | Satisfied | ADR-050 §2.6; slot grouping on identical staffing sets. |
| HĐTN `CLASS` homeroom resolution and freeze (ADR-045) | Satisfied | ADR-050 §2.7; fail-closed resolver, frozen provenance. |
| Decoupled special programme absence/replacement (T43) | Satisfied | ADR-050 §2.8; scheduled vs execution separation, fail-closed only on empty/invalid scheduled staffing, planning lifecycle, CAS reverse + replacement root. |
| Decoupled confirmation/attestation & existential gate (T44) | Satisfied | ADR-050 §2.9; Coordinator OR BGH, non-reversed attestation condition, no hardcoded capability keys, no double count. |
| Dual-condition workload eligibility gate | Satisfied | ADR-050 §2.10; $\text{Valid Execution} \land (\exists \text{ Non-Reversed Attestation})$; at most once before policy/coefficients. |
| Anti-double-counting invariants | Satisfied | ADR-050 §2.11; no class multiplication, no attestation multiplication. |
| Capability authorization boundary (P4-030 seam) | Satisfied | ADR-050 §2.12; domain capabilities, no role/title/department inference. |
| Zero runtime/schema/production mutation | Satisfied | Strictly docs-only under `docs/**`. Production remains `PRE-OPERATIONAL`. |
