# ADR-050 — GDĐP / HĐTN Programme Architecture

- **Status:** Proposed / Pending explicit merge authorization
- **Date:** 2026-09-18
- **Scope:** P4-010 Architecture Closure; documentation only (zero runtime, schema, migration, contracts, API, UI, capability catalog, CI/CD, or deployment mutation)
- **Authority:** PA-B v1.2, ADR-034, ADR-035, ADR-038, ADR-044, ADR-045, `LOCAL-FC-05A0`, `LOCAL-FC-05D0D`, `LOCAL-FC-05F0D`, `P2-030`
- **Traceability:** T12, T15, T16, T17, T43, T44

---

## 1. Context

The repository foundation includes an atomic operational runtime primitive for special activities (`SpecialActivity`, ADR-034 / ADR-035), teacher-slot participation execution evidence (`SpecialActivityParticipationExecution`, ADR-038), date-effective homeroom responsibility resolution (`HomeroomAssignment`, ADR-045 / P1-010), native timetable workbook evidence (`P2-030`), and curricular component realignment (`P0-900`, ADR-048).

However, `SpecialActivity` is strictly a downstream single-occurrence runtime primitive: it represents one atomic scheduled execution event on an exact civil date with frozen class targets and flat roleless staffing. It possesses no category catalog, no multi-day or annual series concept, no topic/lesson content plan, and no concept of annual educational programmes.

Under PA-B v1.2 and the current product baseline:
- **Giáo dục địa phương (GDĐP)** requires an annual year+grade programme with planned weekly/topic content, grade-level scope (Grades 10, 11, 12), and rotating weekly execution with dynamic scheduling (as recorded in Row 38 of the authoritative Đam San timetable workbook, `P2-030`).
- **Hoạt động trải nghiệm, hướng nghiệp (HĐTN-HN)** requires an annual educational programme operating under three distinct business modes: `CLASS` (tied to date-effective homeroom responsibility), `GRADE`, and `SCHOOL_WIDE`.
- **Per-Slot Staffing (T17)**: Different slots within one special programme occurrence may have different teacher assignments (e.g., Slot 1 taught by Teacher A; Slot 2 taught by Teacher B). Flat root-level staffing causes an unacceptable Cartesian product if interpreted as every teacher teaching every slot.
- **Absence, Replacement, and Substitution (T43)**: Marked unresolved in `LOCAL-FC-05A0`. Curricular substitution rules (`SAME_SUBJECT_SUBSTITUTION` / `DIFFERENT_SUBJECT_SUPERVISION`) cannot apply because special programmes have neither `Subject` nor `TeachingAssignment`. Furthermore, ADR-038 database constraints enforce `actualTeacherUserId == scheduledTeacherUserId` for `SpecialActivityParticipationExecution`, forbidding arbitrary substitute execution without valid staffing provenance.
- **Programme Confirmation and Workload Gate (T44)**: Marked unresolved in `LOCAL-FC-05A0`. Source audit records that "one qualifying coordinator-or-BGH confirmation is enough and extra confirmation must not double count", while ADR-038 requires personal teacher-slot participation execution. The relationship between programme-level attestation, teacher-slot execution evidence, and teacher workload eligibility must be settled before runtime implementation.

This ADR closes the upstream programme architecture for GDĐP and HĐTN-HN without mutating existing runtime primitives.

---

## 2. Decision

### 2.1 Layered Architecture Principles

The programme domain is strictly **UPSTREAM** of `SpecialActivity`. `SpecialActivity` is **NOT** a programme master and must **NOT** be overloaded with programme, category, topic, or syllabus semantics.

The architecture strictly separates educational planning from operational scheduling and runtime execution:

```text
PROGRAMME AUTHORITY (ProgrammeMaster, e.g. GDDP, HDTN_HN)
    ↓
VERSIONED CONTENT PLAN (ProgrammePlanVersion, ProgrammeTopicItem)
    ↓
PLANNED OCCURRENCE (PlannedProgrammeOccurrence, mode: CLASS | GRADE | SCHOOL_WIDE)
    ↓
EXACT OCCURRENCE SLOT (PlannedOccurrenceSlot)
    ↓
EXACT SLOT STAFFING (PlannedSlotStaffing: Slot -> Set<Teacher>)
    ↓ [P4-040 Materialization Bridge]
SPECIAL ACTIVITY RUNTIME (SpecialActivity roots, SpecialActivityTimeSlot, SpecialActivityStaffing)
    ↓ [ADR-038 Confirmation]
PARTICIPATION EXECUTION (SpecialActivityParticipationExecution)
    +
PROGRAMME ATTESTATION (ProgrammeOccurrenceAttestation)
    ↓ [P4-050 Workload Projection]
OFFICIAL WORKLOAD CREDIT
```

### 2.2 Programme Identity and Authority Boundaries

1. **Programme Kind**: Defined by canonical enum/discriminator:
   - `GDDP` (Giáo dục địa phương)
   - `HDTN_HN` (Hoạt động trải nghiệm, hướng nghiệp)
   Free-text labels, activity titles, and note strings must never be used to identify programme kinds.

2. **GDĐP Programme Authority**:
   - Master authority boundary: `AcademicYear + Grade` (where Grade $\in \{10, 11, 12\}$).
   - GDĐP content is owned at the grade level across the academic year. Each individual class does **not** become an independent GDĐP programme master.
   - Individual class targets within that grade are selected at the operational occurrence scheduling layer. This permits flexible class-level rotation and modular topic sequencing across classes without fragmenting grade-level curriculum authority.

3. **HĐTN-HN Programme Authority**:
   - Master authority boundary: `AcademicYear`.
   - Each planned occurrence operates under an explicit **Business Mode**:
     - `CLASS`: Targets one exact `SchoolClass`.
     - `GRADE`: Targets one exact Grade level ($10, 11, 12$).
     - `SCHOOL_WIDE`: Targets the entire school.
   - Business Mode is a target and scheduling classification, **never** an authorization scope or security role.

### 2.3 Separation of Content Planning and Operational Scheduling

To reconcile the requirement for an annual versioned content plan with the reality of dynamic, weekly teacher assignment and class rotation:

1. **Versioned Programme Content Plan**:
   - Owns the syllabus: topics, lesson titles, required period allocations, intended sequence, and guideline academic week/segment placements.
   - Reusable across classes of the same grade.
   - Does **not** mandate rigid upfront teacher assignments or calendar dates for the entire year.

2. **Planned Occurrence Scheduling**:
   - Owns the physical operational plan: exact civil date, exact class/grade/school targets, exact time slots, and exact slot staffing.
   - Staffing can be assigned in advance during initial term planning or assigned/adjusted prospectively in the weeks prior to execution.
   - Planning remains prospective and mutable within the planning layer until materialized into runtime.

### 2.4 Version and Item Lifecycle

1. **Programme Plan Versions** follow a formal immutable publishing lifecycle:
   - `DRAFT`: Open for structural edits, item additions, sequence reordering, and period allocation adjustments.
   - `PUBLISHED`: Effective educational authority. Immutable in-place; neither items nor metadata can be edited without lineage.
   - `SUPERSEDED`: Replaced by a newer published version of the plan.
2. In-place mutation of published plans is forbidden. Any modification to a published plan requires creating a successor version with retained lineage (`predecessorVersionId` / `replacesVersionId`) and an explicit audit reason.
3. Historical plan versions and topics are never physically deleted (`ON DELETE RESTRICT`).

### 2.5 Exact Per-Slot Staffing (T17 Invariant)

Programme planning must model exact slot-level staffing:
$$\text{PlannedOccurrence} \longrightarrow \{\text{Slot}_i \longrightarrow \text{TeacherSet}_i\}$$

- Example: Period 1 is staffed by $\{\text{Teacher A}\}$; Period 2 is staffed by $\{\text{Teacher B}\}$.
- Flat Cartesian staffing ($\text{Slots} \times \text{Teachers}$) is strictly prohibited. The system must not represent Period 1 and Period 2 as jointly staffed by $\{\text{Teacher A}, \text{Teacher B}\}$, which would fabricate false teaching responsibilities ($A$ on Period 2, $B$ on Period 1).

### 2.6 Materialization Bridge to SpecialActivity (P4-040 Boundary)

The bridge from a `PlannedProgrammeOccurrence` into the runtime `SpecialActivity` primitive adheres to the following semantic invariants:

1. **Multiplicity ($\mathbf{1 \to N}$ Partitioning)**:
   - One planned programme occurrence may materialize into **one or more** `SpecialActivity` roots. It is not constrained to a $1:1$ mapping.
   - A single runtime `SpecialActivity` root with multiple time-slots is valid **if and only if** the exact scheduled teacher set is identical across all slots in that root.
   - Whenever teacher sets differ across slots within an occurrence, the materialization bridge **must** partition the occurrence into multiple disjoint `SpecialActivity` roots (e.g., one root per slot, or grouping slots having identical targets and identical teacher sets).
2. **Retained Materialization Provenance**:
   - Every materialized `SpecialActivity` root must retain immutable provenance linking back to:
     - `ProgrammeMasterId`
     - `ProgrammePlanVersionId`
     - `ProgrammeTopicItemId`
     - `PlannedProgrammeOccurrenceId`
     - `PlannedSlotStaffingId` (or constituent slot ids)
   - For HĐTN `CLASS`, the root must also retain the exact resolved `HomeroomAssignment` provenance.

### 2.7 HĐTN `CLASS` and Homeroom Responsibility (ADR-045 Alignment)

For any occurrence operating under mode `CLASS`:
1. **Resolver Resolution**: The bridge resolves the effective homeroom teacher on the occurrence civil date via `resolveEffectiveHomeroomTeacher(academicYearId, schoolClassId, civilDate)`.
2. **Fail-Closed Operational Safety**:
   - For current/future materialization: missing GVCN, ambiguous assignments, or an assigned teacher who is not currently active/eligible fails closed (`FAIL CLOSED`). The system must never fall back to another teacher or assign a random substitute.
   - For retrospective/pre-operational reconstruction: the exact historical GVCN is resolved and preserved; subsequent account deactivation or status changes do not invalidate historical assignment truth.
3. **Immutability of Materialized GVCN**:
   - Upon materialization, the resolved GVCN identity and source `HomeroomAssignment` record ID are frozen into the runtime staffing.
   - Subsequent changes in homeroom assignment (e.g., a new GVCN taking over next month) do **not** rewrite already materialized or executed occurrences.

### 2.8 Absence, Replacement, and Substitution Semantics (T43)

Special programme activities possess no subject or teaching assignment context. Curricular substitution rules (`SAME_SUBJECT_SUBSTITUTION`, `DIFFERENT_SUBJECT_SUPERVISION`) are inapplicable.

1. **Negative Evidence Rule**: Missing `SpecialActivityParticipationExecution` proves only the absence of execution evidence; it does **not** inherently prove absence or misconduct. An official absence requires an explicit retained operational fact.
2. **Absence Without Replacement**:
   - If scheduled Teacher A is absent and no replacement is assigned:
     - The occurrence planning truth is preserved.
     - Scheduled staffing retains Teacher A as scheduled.
     - Teacher A records no participation execution.
     - Teacher A receives **zero** workload credit.
     - The occurrence is not cancelled solely because one scheduled teacher was absent.
     - Programme-level attestation cannot fabricate or replace individual participation execution for Teacher A.
3. **Replacement Representation**:
   - Teacher B cannot create execution evidence referencing Teacher A's staffing child. ADR-038 schema foreign key constraints (`actualTeacherUserId == scheduledTeacherUserId`) strictly prevent this at the database level.
   - Teacher B must be established as an explicit, authorized scheduled staffing record for that exact slot before Teacher B can confirm execution.
4. **Replacement Prior to Materialization**:
   - Handled cleanly in the planning layer: the planned staffing record records the change/reassignment with actor, timestamp, and reason.
   - The occurrence materializes with Teacher B as the authoritative scheduled staffing.
5. **Replacement After Materialization (Runtime Correction)**:
   - In-place mutation (`UPDATE` of `scheduledTeacherUserId` from A to B) on an active `SpecialActivityStaffing` child is **strictly forbidden**.
   - The runtime bridge applies the standard CAS reversal and replacement pattern: the affected `SpecialActivity` root is transitioned `ACTIVE -> REVERSED`, and a linked replacement `SpecialActivity` root is created with Teacher B in its staffing child.
   - If only one slot is affected, the materialization partitioning ensures only the affected slot root is reversed and replaced, leaving unaffected slot roots intact.
6. **Replacement Authorization**:
   - Assigning a substitute teacher is a professional administrative action requiring explicit capability (e.g., Programme Coordinator or BGH). It cannot be performed by regular teachers or inferred from system administrator roles.

### 2.9 Programme Confirmation and Attestation Semantics (T44)

1. **Decoupled Responsibilities**:
   - **Authorization**: Actor holds explicit capability to attest.
   - **Programme-Level Attestation**: Certifies that the educational activity took place as planned for the target student cohort.
   - **Teacher-Slot Execution**: Certifies that an individual teacher fulfilled their assigned teaching slot.
   - **Workload Projection**: Calculates recognized teaching workload from valid execution and attestation facts.
   - **Statement Freeze**: Freezes aggregated teacher workload for official submission/lock.
2. **Qualifying Attestation (Existential Rule)**:
   - A programme occurrence can be attested by:
     - An authorized **Programme Coordinator** (`GDDDP_COORDINATOR` or `HĐTN_COORDINATOR`); OR
     - An authorized **BGH member** (`APPROVAL_PRINCIPAL` or `APPROVAL_VICE_PRINCIPAL`).
   - Confirmation is **existential**: $\exists \text{ qualifying active attestation}$.
   - If both the Coordinator and BGH attest the same occurrence, the occurrence is confirmed exactly once. Extra attestations are retained for audit but **never** duplicate completion status or multiply workload.
3. **Attestation Lifecycle and Correction**:
   - Programme attestations use an immutable lifecycle: `ACTIVE -> REVERSED`.
   - Data-entry errors in attestation are corrected by CAS-reversing the attestation with a mandatory reason. In-place editing is forbidden.

### 2.10 Official Workload Eligibility Gate

To reconcile v1.2's coordinator confirmation requirement with ADR-038's individual teacher execution evidence, official teacher workload credit for GDĐP/HĐTN requires **BOTH** conditions to be satisfied:

$$\text{Workload Eligible} \iff (\text{ACTIVE } \text{SpecialActivityParticipationExecution}) \land (\text{ACTIVE } \text{ProgrammeOccurrenceAttestation})$$

- **Execution without Attestation**: Individual teacher execution is recorded and visible in personal drafts, but remains unconfirmed at the programme level; it does **not** count as approved official workload until programme attestation is provided.
- **Attestation without Execution**: Programme attestation confirms student activity completion, but cannot grant workload credit to any teacher who lacks active participation execution evidence.

### 2.11 Anti-Double-Counting Invariants

1. **Class-Target Non-Multiplication (T20 / ADR-038 §58)**:
   - When an activity targets a grade (e.g., 6 classes) or the whole school (e.g., 18 classes), the teacher workload unit is strictly based on the **time-slot duration**.
   - Workload is **NEVER** multiplied by the number of target classes ($\text{Workload} \ne \text{Slots} \times \text{ClassCount}$).
2. **Attestation Non-Multiplication**:
   - Workload is **NEVER** multiplied by the number of attestations recorded ($\text{Workload} \ne \text{Slots} \times \text{AttestationCount}$).

### 2.12 Authorization Boundaries (P4-030 Seam)

1. **No Role/Title Inference**: Capability grants are the sole authority. Being a principal, vice principal, homeroom teacher, or coordinator by job title confers zero system authority without explicit capability records.
2. **Domain-Specific Capabilities**:
   - `GDDDP_COORDINATOR`: Authorizes planning, staffing, and attesting GDĐP programmes within granted scope.
   - `HĐTN_COORDINATOR`: Authorizes planning, staffing, and attesting HĐTN-HN programmes within granted scope.
   - `SPECIAL_ACTIVITY_MANAGE`: Retains school-wide authority for ad-hoc operational events (assemblies, exams).
   - `APPROVAL_PRINCIPAL` / `APPROVAL_VICE_PRINCIPAL`: Institutional school-wide oversight and attestation.
3. P4-010 establishes these boundaries; P4-030 will implement the exact capability wiring, resource scopes, and guard contracts.

---

## 3. Rejected Alternatives

1. **Using `SpecialActivity` as Annual Programme Master**:
   - *Rejected*: Violates ADR-034/035. `SpecialActivity` is an atomic operational execution primitive. Forcing curriculum plans, topics, and annual versions into it causes schema pollution, concurrency contention, and loss of clean temporal boundaries.
2. **Using Free-Text Titles or Client Category Strings to Identify Programme Kinds**:
   - *Rejected*: Free text has zero downstream semantic guarantees. Programme kinds must be typed enumerations (`GDDP`, `HDTN_HN`).
3. **Cartesian Product Staffing (`Slots[] \times Teachers[]`)**:
   - *Rejected*: Fails T17. Fabricates false teacher-slot duties and breaks individual accountability.
4. **Direct Substitution on Execution (`actualTeacher != scheduledTeacher`)**:
   - *Rejected*: Violates ADR-038 relational schema constraints (`SpecialActivityParticipationExecution` foreign key to `SpecialActivityStaffing`).
5. **Inferring Teacher Absence from Missing Execution Evidence**:
   - *Rejected*: Violates ADR-038 negative evidence principle. Absence is an operational fact requiring positive record, not a derivation from the passage of time.
6. **In-Place Mutation of `SpecialActivityStaffing` for Substitute Teachers**:
   - *Rejected*: Destroys auditability and breaks active execution foreign keys. Runtime corrections must follow the established CAS reverse + replacement pattern.
7. **Applying Curricular Substitution Rules (`SAME_SUBJECT_SUBSTITUTION`) to Special Programmes**:
   - *Rejected*: Special programmes lack `Subject` and `TeachingAssignment` structures.
8. **Programme Attestation Fabricating Teacher Execution**:
   - *Rejected*: Would allow coordinators to create unverified workload claims for teachers who were not present.
9. **Multiplying Teacher Workload by Number of Target Classes**:
   - *Rejected*: Grossly inflates teaching workload; a teacher supervising a 45-minute assembly for 18 classes teaches for 45 minutes, not 810 minutes.
10. **Multiplying Teacher Workload by Number of Attestations**:
    - *Rejected*: Dual confirmation by Coordinator and Principal would falsely double teacher workload.
11. **Inferring Coordinator Authority from User Roles or Job Titles**:
    - *Rejected*: Violates repository-wide capability authorization rules (ADR-008).
12. **Physical Deletion of Historical Programme Data**:
    - *Rejected*: Violates repository-wide historical audit integrity. All models use soft reversal and lineage links.

---

## 4. Consequences and Downstream Ownership

- **P4-010 (Current)**: Closed architecture and governance specification. Docs-only.
- **P4-020 (Next Major Task)**: Implements persistence models for ProgrammeMaster, ProgrammePlanVersion, ProgrammeTopicItem, PlannedProgrammeOccurrence, PlannedOccurrenceSlot, PlannedSlotStaffing, and ProgrammeOccurrenceAttestation.
- **P4-030**: Implements coordinator and BGH authorization wiring, capability scope definitions, and guard integration.
- **P4-040**: Implements the materialization bridge service transforming planned occurrences into `SpecialActivity` roots with exact partitioning, T43 replacement handling, and homeroom provenance.
- **P4-050**: Implements workload calculation logic enforcing the dual execution + attestation gate and anti-double-counting rules.
- **P4-060 / P4-061**: Workload adjustment policy (remains trigger-gated, unaffected).

---

## 5. Explicit Non-Scope

- No Prisma schema, migrations, or seed changes.
- No NestJS controller, service, module, or DTO implementation.
- No Web UI or React component creation.
- No capability catalog seed updates.
- No production deployment, VPS mutation, or data backfill.
- Production environment remains strictly **PRE-OPERATIONAL**.
