# P4-040 — Programme-to-SpecialActivity Runtime Bridge Contract

## Status

**IN_REVIEW**

- Task branch: `feat/programme-runtime-bridge-040`
- Canonical base: `3564b5a5c2f8659c1bc2b19d779ce83cb621f65e`
- Predecessor: `P4-030` (CLOSED by `SYNC-P4-030`)
- Downstream: `P4-050` (PLANNED, depends on `P4-040`)
- Architecture authority: `docs/decisions/ADR-050-GDDP-HDTN-PROGRAMME-ARCHITECTURE.md`, `docs/decisions/ADR-034-SPECIAL-ACTIVITY-ARCHITECTURE.md`, `docs/decisions/ADR-035-SPECIAL-ACTIVITY-RUNTIME.md`, `docs/decisions/ADR-038-TEACHING-EXECUTION-EVIDENCE.md`, `docs/decisions/ADR-045-HOMEROOM-RESPONSIBILITY.md`
- Traceability: **T12**, **T17**, **T31**, **T43**, **T44**

---

## 1. Scope Boundary

### 1.1 In Scope

P4-040 implements the runtime execution bridge and attestation control plane for GDĐP and HĐTN-HN special programmes:

1. **One Root per Exact Slot Materialization Strategy (v1)**:
   - In accordance with ADR-050 §2.5, every exact `PlannedOccurrenceSlot` belonging to a `PUBLISHED` `PlannedProgrammeOccurrence` materializes into exactly **one** runtime `SpecialActivity` root.
   - For an occurrence with $N$ exact planned slots, exactly $N$ distinct `SpecialActivity` roots are created atomically in a single serializable transaction.
   - No multi-slot collapsing or grouping optimization is applied in v1. This preserves exact $\text{Slot} \to \text{Set<Teacher>}$ staffing topology without Cartesian product fabrication.

2. **Materialization Eligibility & Life-Cycle Validation**:
   - The occurrence must be in status `PUBLISHED` (not `DRAFT`, not `SUPERSEDED`).
   - Every slot must belong to the same `academicYearId`, have a valid weekday for the occurrence's `civilDate`, reference an active `TimeSlotDefinition`, and contain at least one eligible scheduled teacher.
   - Target coherence: mode `CLASS` requires exact `schoolClassId` and null `gradeLevel`; mode `GRADE` requires valid `gradeLevel` and null `schoolClassId`; mode `SCHOOL_WIDE` requires both to be null. GDĐP target grade must match the master's grade.

3. **Collision & Teacher Eligibility Validation**:
   - Reuses the canonical collision validation semantics from `SpecialActivitiesService`:
     - Active SpecialActivity class and teacher collisions;
     - Active makeup teaching schedules (`MakeupTeachingSchedule`);
     - Active operational lesson dispositions (`OperationalLessonDisposition`);
     - Timetable normal teacher occupancy (considering calendar interruptions, exceptions, and dispositions).
   - Reuses teacher eligibility criteria: `status === 'ACTIVE'`, valid `StaffProfile`, and `isTeachingStaff === true`.
   - Authorized under Programme Coordinator / BGH professional authority (P4-030), without requiring `SPECIAL_ACTIVITY_MANAGE`.

4. **Target Class Freezing**:
   - Mode `CLASS`: freezes exact `schoolClassId`.
   - Mode `GRADE`: freezes all active canonical classes of that grade level.
   - Mode `SCHOOL_WIDE`: freezes all active canonical classes in the academic year.

5. **HĐTN `CLASS` — Authoritative Runtime Staffing & Homeroom Resolution**:
   - In accordance with ADR-050 Example 5, for `ProgrammeMaster.kind === 'HDTN_HN'` and `mode === 'CLASS'`, the date-effective resolved GVCN is the authoritative runtime scheduled teacher in `SpecialActivityStaffing` (replacing planned placeholder staffing at materialization time without mutating or rewriting the original `PlannedSlotStaffing` planning rows).
   - Resolves the effective homeroom assignment on the occurrence's `civilDate` using the canonical homeroom resolver (`classifyHomeroomResolutionRows`).
   - Fails closed on missing, ambiguous, or corrupt homeroom assignments.
   - **Retrospective Rule**:
     - For current/future occurrences (`civilDate >= homeroomBusinessDate()` or open-ended assignments): GVCN must be currently `ACTIVE` teaching staff.
     - For historical occurrences (`civilDate < homeroomBusinessDate()`) covered by exact retained historical `HomeroomAssignment` (`validUntil !== null && validUntil < homeroomBusinessDate()`): historical materialization succeeds even if the historical GVCN subsequently became disabled or inactive; truthful historical eligibility snapshot (`eligibilityWasActive: false`) is preserved.
     - Public ad-hoc `SpecialActivity` creation remains strictly gated to currently active teaching staff.
   - Freezes `homeroomAssignmentId` and `homeroomTeacherUserId` as immutable provenance in `ProgrammeMaterializedActivity`.
   - Historical immutability: subsequent homeroom assignment changes do not rewrite previously materialized roots.

6. **Dedicated Immutable Materialization Provenance & DB Hardening**:
   - Implements `ProgrammeMaterializedActivity` relating each materialized `SpecialActivity` root to:
     - `programmeMasterId`
     - `programmePlanVersionId`
     - `programmeTopicItemId`
     - `plannedProgrammeOccurrenceId`
     - `plannedOccurrenceSlotId`
     - `specialActivityId` (1:1 unique relation)
     - `homeroomAssignmentId` (optional, for HĐTN CLASS)
     - `homeroomTeacherUserId` (optional, for HĐTN CLASS)
     - `materializedByUserId`
     - `materializedAt`
   - Retained history with `onDelete: Restrict` foreign keys.
   - **Database Hardening Trigger (`trg_programme_materialized_activity_guard`)**:
     - Prohibits direct `UPDATE` and `DELETE` on `programme_materialized_activities` (enforcing immutable bridge history).
     - Enforces coherent provenance tuple (plan belongs to master, topic belongs to plan, occurrence matches exact tuple, slot belongs to occurrence).
     - Enforces homeroom pair coherence (`homeroomTeacherUserId` matches assignment's `teacherUserId`).
     - Enforces active root exclusivity per planned slot: prevents duplicate `ACTIVE` roots from race conditions, while permitting legitimate replacement lineages where predecessors are `REVERSED`.

7. **Post-Materialization Replacement (T43)**:
   - For an affected materialized slot root, CAS reverses the existing `SpecialActivity` root (`ACTIVE -> REVERSED`).
   - Creates a replacement `SpecialActivity` root with `replacesId = oldSpecialActivity.id` and the replacement scheduled staffing.
   - Creates a new `ProgrammeMaterializedActivity` record linking the replacement root to the same planned slot and occurrence.
   - Unaffected slot roots remain `ACTIVE` and untouched.
   - Idempotent and transactional.

8. **Programme Occurrence Attestation Runtime (T44)**:
   - Implements `ProgrammeOccurrenceAttestation` model:
     - `programmeMasterId`
     - `plannedProgrammeOccurrenceId`
     - `attestedByUserId`
     - Authority provenance: `authorityType`, `capabilityKey`, `scope`, `scopeResourceId`
     - Status: `ACTIVE` vs `REVERSED`
     - Reversal tracking: `reversedByUserId`, `reversedAt`, `reversalReason`
     - Request keys and fingerprints for create and reverse idempotency: uniquely scoped to `(attestedByUserId, createRequestKey)` and `(reversedByUserId, reverseRequestKey)`, matching canonical `ProgrammePlanningCommand` semantics and permitting distinct actors to use the same commandId.
   - Consumes `isQualifyingProgrammeAttestor` from P4-030 to validate attestor eligibility and freeze authority provenance.
   - Existential Confirmation Gate: `hasQualifyingNonReversedAttestation(plannedProgrammeOccurrenceId)` returns `true` if $\ge 1$ `ACTIVE` attestation exists. Multiple attestations satisfy the gate without multiplicative effects.

9. **Guarded HTTP Surface**:
   - Extends `/api/programme-planning` with:
     - `POST /api/programme-planning/occurrences/:id/materialize`
     - `GET  /api/programme-planning/occurrences/:id/materialization`
     - `POST /api/programme-planning/materialized-slots/:id/replacements`
     - `POST /api/programme-planning/occurrences/:id/attestations`
     - `GET  /api/programme-planning/occurrences/:id/attestations`
     - `POST /api/programme-planning/attestations/:attestationId/reverse`
   - All mutations guarded by `SessionAuthGuard`, `CsrfOriginGuard`, and exact programme authority.

### 1.2 Explicit Non-Scope

P4-040 explicitly does **not**:
- Calculate teacher workload, apply coefficients, or update `ReportingStatement` (deferred to P4-050; T19, T20);
- Implement frontend Web UI components;
- Modify public ad-hoc `SpecialActivitiesService` API behavior or weaken `SPECIAL_ACTIVITY_MANAGE`;
- Collapse multiple planned slots into one runtime root;
- Deploy to production or mutate production data/configuration (production remains **PRE-OPERATIONAL**).

---

## 2. Traceability Alignment

| Traceability ID | Description | P4-040 Realization |
|---|---|---|
| **T12** | Special activities may target class/grade/school and involve multiple teachers | Materializes occurrences into `SpecialActivity` roots with exact per-slot staffing ($\text{Slot} \to \text{Set<Teacher>}$) and frozen class targets according to business mode (`CLASS`, `GRADE`, `SCHOOL_WIDE`). |
| **T17** | Different exact slots may have different teacher sets | Implements 1 root per exact planned slot, strictly preventing Cartesian staffing multiplication and allowing slot-independent staffing sets. |
| **T31** | Reuse existing SpecialActivity collision and runtime primitive | Reuses `SpecialActivitiesService` collision detection (special activities, makeups, dispositions, timetable occupancy) and runtime creation logic inside transactional boundaries. |
| **T43** | Post-materialization replacement semantics | Replaces individual slot roots via CAS reversal (`ACTIVE -> REVERSED`) and replacement root creation with `replacesId` linkage, without mutating in-place staffing. |
| **T44** | Programme attestation & existential confirmation gate | Implements `ProgrammeOccurrenceAttestation` persistence, qualification validation, retained reversal, and existential boolean gate evaluation without workload multiplication. |

---

## 3. Reused Repository Seams

1. **Collision & Runtime Primitive**: `SpecialActivitiesService` (internal transactional validation and root creation).
2. **Homeroom Responsibility**: `HomeroomAssignmentsService` and `classifyHomeroomResolutionRows` from `apps/api/src/homeroom-assignments/`.
3. **Programme Authorization**: `ProgrammePlanningAuthorizationService` from `apps/api/src/programme-planning/` (`requireProgrammeAuthority`, `isQualifyingProgrammeAttestor`).
4. **Audit**: `AuditService` from `apps/api/src/audit/`.
5. **Civil Date & Time Helpers**: `parseCivilDate`, `formatCivilDate`, `intervalsOverlap`, `weekdayForCivilDate`.
6. **Command Idempotency**: `ProgrammePlanningCommand` with SERIALIZABLE isolation and retry.
