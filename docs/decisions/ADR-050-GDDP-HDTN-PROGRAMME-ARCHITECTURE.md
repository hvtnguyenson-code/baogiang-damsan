# ADR-050 — GDĐP / HĐTN Programme Architecture

- **Status:** Accepted (accepted through parent PR #144, reviewed head `0763d15b428ebfa09ca551493deb0d872fcf1287`, merge/main `10de700723610efb6a79a0f62f8d6fc9f4ce44a3`, exact-head PR CI #464 SUCCESS, post-merge main CI #465 SUCCESS, independent GitHub review PASS; closure recorded by `SYNC-P4-010`)
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
PROGRAMME ATTESTATION (Conceptual: at least one qualifying, non-reversed attestation)
    ↓ [Workload Gate: Execution AND Attestation Condition Satisfied]
ELIGIBLE WORKLOAD CONTRIBUTION SOURCE (At most once per exact teacher-slot)
    ↓ [P4-050 Policy / Coefficients Projection]
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
3. Historical authoritative plan/version/item evidence must not be physically deleted through business workflows. P4-020 must select database constraints that enforce retained history; exact FK/on-delete representation belongs to persistence design.

### 2.5 Exact Per-Slot Staffing (T17 Invariant)

Programme planning must model exact slot-level staffing:
$$\text{PlannedOccurrence} \longrightarrow \{\text{Slot}_i \longrightarrow \text{TeacherSet}_i\}$$

- Example: Period 1 is staffed by $\{\text{Teacher A}\}$; Period 2 is staffed by $\{\text{Teacher B}\}$.
- Flat Cartesian staffing ($\text{Slots} \times \text{Teachers}$) is strictly prohibited. The system must not represent Period 1 and Period 2 as jointly staffed by $\{\text{Teacher A}, \text{Teacher B}\}$, which would fabricate false teaching responsibilities ($A$ on Period 2, $B$ on Period 1).

### 2.6 Materialization Bridge to SpecialActivity (P4-040 Boundary)

The bridge from a `PlannedProgrammeOccurrence` into the runtime `SpecialActivity` primitive adheres to the following semantic invariants:

1. **Multiplicity ($\mathbf{1 \to N}$ Partitioning)**:
   - One planned programme occurrence may materialize into **one or more** `SpecialActivity` roots. It is not constrained to a $1:1$ mapping.
   - One `SpecialActivity` per exact slot is always a valid and safe materialization implementation.
   - Grouping multiple slots into a single runtime `SpecialActivity` root is valid **if and only if** all grouped slots share:
     - identical occurrence civil date and calendar context;
     - identical business target and scope (same exact classes or grade);
     - exact identical scheduled teacher sets ($\text{TeacherSet}_i = \text{TeacherSet}_j$); and
     - satisfaction of all existing `SpecialActivity` runtime validity invariants.
   - Whenever scheduled teacher sets differ across slots within an occurrence, the materialization bridge **must** partition the occurrence into multiple disjoint `SpecialActivity` roots.
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
2. **Absence Without Replacement & Scheduled Staffing Separation**:
   - **Scheduled Staffing vs Actual Execution**: Scheduled staffing and actual participation are two distinct truths.
   - An explicit absence fact does **not** automatically:
     - remove scheduled staffing;
     - rewrite planning truth;
     - reverse runtime roots;
     - cancel programme occurrences; or
     - invalidate scheduled teacher identity.
   - If scheduled Teacher A is absent and no replacement is assigned:
     - The occurrence planning truth is preserved.
     - Scheduled staffing retains Teacher A as scheduled.
     - Teacher A records no participation execution.
     - Teacher A receives **zero** workload contribution.
     - The absence of one scheduled teacher does not automatically cancel the entire programme occurrence.
     - Programme-level attestation cannot fabricate, substitute, or compensate for individual participation execution for Teacher A.
   - **Multi-Teacher Slots**: If an occurrence slot is staffed by multiple teachers (e.g., $\{\text{Teacher A}, \text{Teacher B}\}$) and Teacher B is absent, Teacher B's absence does not invalidate Teacher A's valid participation; Teacher A may execute and receive credit, while Teacher B records no execution and receives zero credit.
   - **Fail-Closed Runtime Staffing Boundary**:
     - Materialization FAILS CLOSED **if and only if** the command preparing to create runtime actually fails to satisfy the invariant of having one or more valid, eligible scheduled staffing children.
     - For example, if planning authorities forward-corrected staffing by removing Teacher A without assigning a replacement B, leaving the intended scheduled staffing set empty ($\emptyset$), materialization FAILS CLOSED.
     - "Teacher A is absent" does **not** mean "staffing set is empty".
   - **Cancellation Semantics**: If institutional policy or business authority determines that an occurrence is cancelled, that requires an explicit retained operational/correction fact. Cancellation is never inferred from absence alone. P4-010 does not invent a physical cancellation schema.
3. **Replacement Representation**:
   - Teacher B cannot create execution evidence referencing Teacher A's staffing child. ADR-038 schema foreign key constraints (`actualTeacherUserId == scheduledTeacherUserId`) strictly prevent this at the database level.
   - Teacher B must be established as an explicit, authorized scheduled staffing record for that exact slot before Teacher B can confirm execution.
4. **Replacement Prior to Materialization**:
   - Prior to materialization, replacement is reflected in canonical planned slot staffing through the valid lifecycle of the planning layer:
     - direct edit when the plan/assignment is still in `DRAFT`; or
     - retained forward correction/change with audit lineage when the planning authority is already `PUBLISHED`.
   - In-place semantic mutation of published plans without lineage is forbidden. Exact physical persistence mechanisms belong to `P4-020`.
   - The occurrence then materializes with Teacher B as the authoritative scheduled staffing.
5. **Replacement After Materialization (Runtime Correction)**:
   - In-place mutation (`UPDATE` of `scheduledTeacherUserId` from A to B) on an active `SpecialActivityStaffing` child is **strictly forbidden**.
   - The runtime bridge applies the standard CAS reversal and replacement pattern: the affected `SpecialActivity` root is transitioned `ACTIVE -> REVERSED`, and a linked replacement `SpecialActivity` root is created with Teacher B in its staffing child.
   - If only one slot is affected, the materialization partitioning ensures only the affected slot root is reversed and replaced, leaving unaffected slot roots intact.
6. **Replacement Authorization**:
   - Assigning a substitute teacher is a professional administrative action requiring explicit capability (qualifying Programme Coordinator or BGH professional authority).
   - Replacement authority must never be inferred from regular teaching staff, subject group leadership (`SUBJECT_GROUP_LEAD` / Tổ trưởng chuyên môn), user roles, or system administrator (`SYSTEM_ADMIN`) status.

### 2.9 Programme Confirmation and Attestation Semantics (T44)

1. **Decoupled Responsibilities**:
   - **Authorization**: Actor holds explicit capability to attest.
   - **Programme-Level Attestation**: Certifies that the educational activity took place as planned for the target student cohort.
   - **Teacher-Slot Execution**: Certifies that an individual teacher fulfilled their assigned teaching slot.
   - **Workload Projection**: Calculates recognized teaching workload from valid execution and attestation facts.
   - **Statement Freeze**: Freezes aggregated teacher workload for official submission/lock.
2. **Qualifying Attestation (Existential Gate)**:
   - A programme occurrence confirmation condition is satisfied **if and only if** there exists at least one qualifying current, non-reversed programme attestation:
     $$\text{Programme Confirmation Gate Satisfied} \iff \exists \text{ qualifying, non-reversed programme attestation}$$
   - Qualifying attestors are strictly limited to:
     - An authorized **Programme Coordinator** (associated with the specific programme domain); OR
     - An authorized **BGH professional authority**.
   - **No Hardcoded Capability Key in P4-010**:
     - BGH attestation requires an explicit qualifying professional capability. Existing catalog keys (such as `APPROVAL_PRINCIPAL` and `APPROVAL_VICE_PRINCIPAL`) represent current catalog evidence, but P4-010 does **not** bind the exact capability key. `P4-030` owns the exact key/resource/scope binding.
     - Similarly, the current catalog contains coordinator capability keys (`GDDP_COORDINATOR`, `HĐTN_COORDINATOR`) as programme authorization intent/evidence. Their exact P4 command authority is NOT yet active merely because the keys exist; `P4-030` owns their exact runtime binding, resource identity, and scope semantics.
   - **No Inference from Department Leadership or Job Titles**:
     - Programme coordinator authority is specialized to the programme. It must **never** be inferred from subject group leadership (`SUBJECT_GROUP_LEAD` / Tổ trưởng chuyên môn), department roles, position titles, user roles, or system administrator (`SYSTEM_ADMIN`) status.
   - **Existential Non-Multiplication**: Confirmation is existential, not additive. If both the Coordinator and BGH attest the same occurrence, the confirmation condition is satisfied exactly once. Multiple attestations are retained for audit but **never** duplicate completion status or multiply workload.
3. **Conceptual Attestation Entity & Status Lifecycle**:
   - In this architecture, `ProgrammeOccurrenceAttestation` is a **conceptual** entity name representing retained attestation evidence. P4-010 does **not** mandate a specific physical table name or physical status enum (such as `ACTIVE`).
   - Exact physical name, status representation, database schema, and runtime persistence/control for attestation belong to `P4-040` (Traceability T44), while `P4-020` owns planning lifecycle and control plane models only.
   - Downstream attestation persistence must satisfy the semantic invariants that:
     - historical attestations must not be mutated in-place or physically deleted; and
     - correction/reversal semantics must ensure that an invalidated/reversed attestation no longer satisfies the existential gate.

### 2.10 Official Workload Eligibility Gate

To reconcile v1.2's coordinator confirmation requirement with ADR-038's individual teacher execution evidence, official teacher workload credit for GDĐP/HĐTN requires **BOTH** conditions to be satisfied:

$$\text{Eligible Workload Contribution Source} \iff (\text{Valid Teacher-Slot Participation Execution}) \land (\exists \text{ Qualifying Non-Reversed Programme Attestation})$$

1. **At-Most-Once Contribution Source**:
   - One qualifying exact teacher-slot participation contributes **at most once** to the eligible workload contribution source evidence before applying valid policy/coefficients.
2. **No Hardcoded 1.0 Unit**:
   - P4-010 does **not** lock the final workload credit to a hardcoded 1.0 unit.
   - Final workload calculation, period weighting, and applicable coefficients belong to `P4-050` and the applicable business configuration/policy authority (which may define legitimate coefficients).
3. **Execution without Attestation**:
   - Valid teacher-slot participation execution remains retained source evidence. Before programme attestation it may appear in personal/reporting projections as unconfirmed-at-programme-level source evidence, but its own execution lifecycle remains ADR-038 ACTIVE/REVERSED; it does **not** count as approved official workload until the programme confirmation gate is satisfied.
4. **Attestation without Execution**:
   - Programme attestation confirms student activity completion, but cannot grant workload credit to any teacher who lacks active participation execution evidence.

### 2.11 Anti-Double-Counting Invariants

1. **Class-Target Non-Multiplication (T20 / ADR-038 §58)**:
   - When an activity targets a grade (e.g., 6 classes) or the whole school (e.g., 18 classes), the teacher workload contribution source is strictly based on the **time-slot duration**.
   - Workload contribution is **NEVER** multiplied by the number of target classes:
     $$\text{Workload Contribution} \ne \text{Slots} \times \text{ClassCount}$$
2. **Attestation Non-Multiplication**:
   - Workload contribution is **NEVER** multiplied by the number of attestations recorded:
     $$\text{Workload Contribution} \ne \text{Slots} \times \text{AttestationCount}$$
   - Dual confirmation by Coordinator and BGH satisfies the gate exactly once.
3. **Idempotency**:
   - Retry or repeated execution submission / attestation recording must never create duplicate workload contribution sources.

### 2.12 Authorization Boundaries (P4-030 Seam)

1. **No Role/Title/Department Inference**:
   - Capability grants are the sole authority.
   - Being a principal, vice principal, homeroom teacher, subject group leader (`SUBJECT_GROUP_LEAD` / Tổ trưởng chuyên môn), or coordinator by job title confers zero system authority without explicit capability records.
   - `SYSTEM_ADMIN` confers no implicit programme coordinator or professional attestation authority.
2. **Catalog Evidence vs P4-030 Binding**:
   - The repository's current capability catalog contains coordinator and administrative capability keys:
     - `GDDP_COORDINATOR` / `HĐTN_COORDINATOR`: Exist in capability contracts reflecting programme coordination intent/evidence.
     - `APPROVAL_PRINCIPAL` / `APPROVAL_VICE_PRINCIPAL`: Institutional school-wide approval keys reflecting current catalog evidence.
     - `SPECIAL_ACTIVITY_MANAGE`: Baseline school-wide authority for ad-hoc operational events.
   - The current catalog contains coordinator capability keys as programme authorization intent/evidence. Their exact P4 command authority is NOT yet active merely because the keys exist; P4-030 owns exact runtime binding (exact capability key, resource identity, ACTIVITY/scope semantics, guard, default deny, and coordinator/BGH binding).
   - Similarly, BGH keys represent current catalog evidence, not a mandatory or active P4 binding.

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
8. **Programme Attestation Fabricating Teacher Execution or Compensating for Missing Execution**:
   - *Rejected*: Would allow coordinators or BGH to create unverified workload claims for teachers who were not present.
9. **Multiplying Teacher Workload by Number of Target Classes**:
   - *Rejected*: Grossly inflates teaching workload; a teacher supervising an assembly for 18 classes teaches for 1 session, not 18 sessions.
10. **Multiplying Teacher Workload by Number of Attestations, or Hardcoding 1.0 Unit Ignoring Policy Coefficients**:
    - *Rejected*: Dual confirmation by Coordinator and Principal must not double-count workload, nor should architecture artificially lock workload values away from legitimate policy coefficients.
11. **Inferring Coordinator Authority from User Roles, Job Titles, or Subject Group / Department Leadership (`SUBJECT_GROUP_LEAD` / Tổ trưởng)**:
    - *Rejected*: Violates repository-wide capability authorization rules (ADR-008). Being a subject group lead or department chair confers no authority over special programmes. Special programme coordination and attestation require explicit programme coordinator or BGH capabilities.
12. **Physical Deletion of Historical Programme Data**:
    - *Rejected*: Violates repository-wide historical audit integrity. Destructive removal of retained historical authority is rejected; downstream persistence tasks must enforce retained history, lineage links, and forward corrections.

---

## 4. Consequences and Downstream Ownership

- **P4-010 (Closed)**: Architecture closed and accepted by `SYNC-P4-010`; docs-only.
- **P4-020 (Closed)**: Persistence/control plane closed by `SYNC-P4-020`; implemented persistence models for ProgrammeMaster, ProgrammePlanVersion, ProgrammeTopicItem, PlannedProgrammeOccurrence, PlannedOccurrenceSlot, and PlannedSlotStaffing (planning lifecycle and control plane only).
- **P4-030 (In Review)**: Exact coordinator and BGH capability-resource-scope binding, guard contracts, and default-deny implementation under review.
- **P4-040 (Downstream)**: Implements the materialization bridge service transforming planned occurrences into `SpecialActivity` roots with exact partitioning, T43 runtime replacement/reversal handling, retained materialization provenance, and conceptual programme-attestation runtime persistence/control (T44 attestation recording/reversal semantics).
- **P4-050 (Downstream)**: Implements workload calculation logic enforcing the dual execution + attestation gate and anti-double-counting rules (execution + attestation gate projection, workload/anti-double-counting).
- **P4-060 / P4-061 (Downstream)**: Workload adjustment policy (remains trigger-gated, unaffected).

### 4.1 Downstream Realization Note: P4-030 (Programme Coordinator Authorization)
- P4-030 establishes exact runtime authorization binding for GDĐP and HĐTN-HN programme planning:
  - Coordinator authority is bound strictly to `ACTIVITY` capability scope with `scopeResourceId = exact ProgrammeMaster.id` (`GDDP_COORDINATOR` for GDDP, `HĐTN_COORDINATOR` for HDTN_HN).
  - BGH professional authority is bound strictly to `APPROVAL_PRINCIPAL / SCHOOL_WIDE` or `APPROVAL_VICE_PRINCIPAL / SCHOOL_WIDE`.
  - Bootstrap invariant: only BGH professional authority can create canonical `ProgrammeMaster` records. Exact coordinator grants can only be issued once a master exists.
  - Guarded façade `AuthorizedProgrammePlanningService` encapsulates raw `ProgrammePlanningService`; guarded `/api/programme-planning` HTTP surface is exposed.
  - Exposes qualification seam (`isQualifyingProgrammeAttestor`) without attestation persistence.
  - No change to P4-040 (materialization/attestation storage) or P4-050 (workload/reporting projection) boundaries.

---

## 5. Explicit Non-Scope of the P4-010 Architecture Closure

- P4-010 itself introduced no Prisma schema, migrations, or seed changes.
- P4-010 itself introduced no NestJS controller, service, module, or DTO implementation.
- P4-010 itself introduced no Web UI or React component creation.
- P4-010 itself introduced no capability catalog seed updates.
- P4-010 itself introduced no production deployment, VPS mutation, or data backfill.
- Production environment remains strictly **PRE-OPERATIONAL**.
