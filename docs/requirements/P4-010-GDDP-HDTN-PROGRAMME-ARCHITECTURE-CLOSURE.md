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
| **T43** | Special-program absence, replacement, and substitute teacher semantics must be explicit and decoupled from curricular substitution (LOCAL-FC-05A0; ADR-038). | Absence/substitution marked UNRESOLVED in 05A0. ADR-038 schema constraint `actualTeacherUserId == scheduledTeacherUserId` blocks direct substitute execution without staffing provenance. | ADR-050 closes replacement semantics: (1) Absence is not inferred from missing execution; (2) Substitutes cannot execute on original staffing; (3) Pre-materialization changes update planned staffing; (4) Post-materialization changes use runtime CAS reverse + replacement roots; (5) Substitutions require explicit authorization. | `P4-040` (Operational replacement & bridge orchestration) |
| **T44** | Special-program confirmation authority must reconcile coordinator/BGH confirmation with per-teacher-slot participation evidence and prevent double counting (LOCAL-FC-05A0; ADR-038). | Confirmation marked UNRESOLVED in 05A0. Relationship between programme-level confirmation and individual teacher-slot execution was unspecified. | ADR-050 decouples Attestation from Execution and defines the Workload Gate: Official workload requires **BOTH** ACTIVE teacher participation execution **AND** at least one qualifying ACTIVE programme attestation (Coordinator or BGH). Extra attestations do not duplicate workload. Class count does not multiply workload. | `P4-030` (Authorization), `P4-040` (Attestation storage), `P4-050` (Workload projection) |

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
- **Scenario**: An occurrence has Period 1 staffed by $\{\text{Teacher A}, \text{Teacher B}\}$. Teacher A attends; Teacher B is absent with no replacement.
- **Invariant Rule**:
  - Teacher A submits execution $\to$ `SpecialActivityParticipationExecution` created for A.
  - Teacher B records no execution.
  - Teacher B receives **0** workload credit.
  - The occurrence remains valid; Teacher A receives 1 slot of workload credit once programme attestation is granted.
  - Programme attestation cannot manufacture execution evidence for Teacher B.

### Example 3: Substitute Replacement Known Before Materialization
- **Scenario**: Teacher A is scheduled for Grade 10 GDĐP on 2026-11-20. On 2026-11-15, Teacher A requests leave, and the Coordinator assigns Teacher C as the replacement.
- **Invariant Rule**:
  - In the planning layer, `PlannedSlotStaffing` is prospectively updated to Teacher C with an audit log citing Teacher A and the leave approval.
  - When the bridge materializes the occurrence on 2026-11-19, it generates a `SpecialActivity` root with `scheduledTeacherUserId = Teacher C`.
  - On 2026-11-20, Teacher C attends and records valid execution under C's own staffing provenance.

### Example 4: Substitute Replacement Arising After Materialization
- **Scenario**: Occurrence on 2026-11-20 was materialized on 2026-11-18 with Teacher A in `SpecialActivityStaffing`. On 2026-11-20 morning, Teacher A falls ill; Teacher C steps in to teach.
- **Invariant Rule**:
  - Teacher C **cannot** record execution on Teacher A's staffing child (blocked by DB foreign key constraint).
  - The system **does not** perform an in-place `UPDATE` of Teacher A's staffing child.
  - The authorized operator/coordinator triggers a runtime replacement:
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

### Example 7: Execution Confirmed but Programme Unattested
- **Scenario**: Teacher A teaches GDĐP Period 1 on 2026-10-10 and confirms execution on 2026-10-10 evening. The Programme Coordinator has not yet reviewed or attested the week's occurrences.
- **Invariant Rule**:
  - Teacher A's `SpecialActivityParticipationExecution` is `ACTIVE`.
  - However, the Programme Attestation gate is **unsatisfied**.
  - In Teacher A's personal dashboard, the period displays as "Đã ghi nhận (Chờ điều phối viên xác nhận)".
  - The workload projection engine (`P4-050`) does **not** include this period in approved official workload until attestation is registered.

### Example 8: Programme Attested but Teacher Lacks Execution
- **Scenario**: The Coordinator attests the GDĐP occurrence for 2026-10-10. Teacher B was scheduled for Period 2 but forgot to confirm execution.
- **Invariant Rule**:
  - Programme attestation confirms student curriculum delivery.
  - However, Teacher B has no active execution record.
  - The workload engine awards Teacher B **zero** periods. Attestation never manufactures unrecorded teacher execution.

### Example 9: Dual Confirmation by Coordinator and BGH
- **Scenario**: For an important school-wide event, the HĐTN Coordinator attests the occurrence at 16:00. The Vice Principal also attests the occurrence at 17:30.
- **Invariant Rule**:
  - Both attestation records are stored for administrative audit (`ProgrammeOccurrenceAttestation`).
  - The downstream gate evaluates $\exists \text{ qualifying active attestation} \equiv \text{TRUE}$.
  - Participating teachers receive their exact 1-period credit. Workload is **never** doubled ($1 \times 2 = 2$ is strictly prevented).

### Example 10: School-Wide Activity Targeting 18 Classes (Anti-Fan-Out)
- **Scenario**: A school-wide HĐTN assembly lasts 1 period (Period 1, Monday) and involves all 18 classes of the school. Teacher A is the sole scheduled teacher.
- **Invariant Rule**:
  - The materialized `SpecialActivity` contains 18 `SpecialActivityClassTarget` children.
  - Teacher A records execution for Period 1.
  - Teacher A receives exactly **1 period** of teaching credit (or 1 multiplied by any approved policy coefficient).
  - Teacher A **never** receives $1 \times 18 = 18$ periods of credit. Class cardinality does not multiply teacher workload.

---

## 5. Downstream Task Ownership

```text
P4-010 (This task)
  └── Architecture, governance invariants, T12/T15/T16/T17/T43/T44 closure (docs-only)
P4-020
  └── Database schema, migrations, ProgrammeMaster, ProgrammePlanVersion, ProgrammeTopicItem,
      PlannedProgrammeOccurrence, PlannedOccurrenceSlot, PlannedSlotStaffing, ProgrammeOccurrenceAttestation
P4-030
  └── Capability wiring: GDDDP_COORDINATOR, HĐTN_COORDINATOR, BGH attestation guards, scope checks
P4-040
  └── Runtime bridge: materialization algorithms, 1->N partitioning, T43 replacement orchestration,
      homeroom provenance binding
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
| Decoupled special programme absence/replacement (T43) | Satisfied | ADR-050 §2.8; CAS reverse + replacement root, no in-place child edit. |
| Decoupled confirmation/attestation & existential gate (T44) | Satisfied | ADR-050 §2.9; Coordinator OR BGH, no double count. |
| Dual-condition workload eligibility gate | Satisfied | ADR-050 §2.10; $\text{Active Execution} \land \text{Active Attestation}$. |
| Anti-double-counting invariants | Satisfied | ADR-050 §2.11; no class multiplication, no attestation multiplication. |
| Capability authorization boundary (P4-030 seam) | Satisfied | ADR-050 §2.12; domain capabilities, no role/title inference. |
| Zero runtime/schema/production mutation | Satisfied | Strictly docs-only under `docs/**`. Production remains `PRE-OPERATIONAL`. |
