# P4-050 — Special Programme Workload & Reporting Projection Contract

## Status

**IN_REVIEW**

- Task branch: `feat/special-programme-workload-reporting-050`
- Canonical base: `8709b12253fbbb8ba2e4f65be3e6d5d5f5e5372e`
- Task ID: `P4-050`
- Predecessor: `P4-040` (CLOSED by `SYNC-P4-040`)
- Downstream: `P4-060` (DEFERRED_WITH_TRIGGER)
- Traceability: **T19**, **T20**, **T44**

---

## 1. Scope & System Boundary

P4-050 implements the on-demand, schema-free workload projection and reporting statement freeze for GDĐP and HĐTN-HN special programme activities.

### 1.1 In Scope

1. **Workload Eligibility Gate**:
   An exact teacher-slot contributes official workload if and only if all four conditions hold concurrently:
   - There exists an `ACTIVE` `SpecialActivityParticipationExecution` for the teacher;
   - The execution belongs to an `ACTIVE` programme-materialized `SpecialActivity` root;
   - The root is linked coherently via `ProgrammeMaterializedActivity` to exact `ProgrammeMaster`, `ProgrammePlanVersion`, `ProgrammeTopicItem`, `PlannedProgrammeOccurrence`, and `PlannedOccurrenceSlot`;
   - The `PlannedProgrammeOccurrence` has $\ge 1$ `ACTIVE` qualifying `ProgrammeOccurrenceAttestation`.

2. **Existential Attestation Gate**:
   Attestation acts strictly as an existential gate: whether an occurrence has 1 or 5 active attestations, the gate opens exactly once.
   - If an active execution exists without an active attestation, it contributes zero credit and is categorized as `pendingConfirmation`.
   - If attestations exist without an execution, contribution is zero.

3. **Exact Contribution Identity & Anti-Fan-Out**:
   - At most **one contribution** per unique pair of `(plannedOccurrenceSlotId, actualTeacherUserId)`.
   - No Cartesian multiplication by:
     - `SpecialActivityClassTarget` count (e.g., 18 classes in a grade/school-wide slot with 1 teacher yields exactly 1 contribution, not 18);
     - Number of classes;
     - Number of attestations;
     - ProgrammeMaster target cardinality.
   - Multiple teachers in the same slot each receive at most one separate contribution.

4. **Replacement & Current-Authoritative Topology**:
   - Only current-authoritative active topology receives credit:
     - `REVERSED` `SpecialActivity` root $\to$ zero credit.
     - `REVERSED` `SpecialActivityParticipationExecution` $\to$ zero credit.
     - Replaced root `ACTIVE` + execution `ACTIVE` $\to$ eligible for credit.
   - Historical predecessors remain preserved in the audit trail without double-counting.

5. **Business Policy Family — `SPECIAL_PROGRAMME_WORKLOAD`**:
   - Workload coefficients are managed via the formal business configuration subsystem:
     - Policy Family: `SPECIAL_PROGRAMME_WORKLOAD`
     - Resource Kind: `ACADEMIC_YEAR`
     - Validator: `v1`
     - Publication: Enabled (`true`)
   - Payload schema (v1 strict):
     ```json
     {
       "coefficients": {
         "GDDP": {
           "CLASS": <number>,
           "GRADE": <number>
         },
         "HDTN_HN": {
           "CLASS": <number>,
           "GRADE": <number>,
           "SCHOOL_WIDE": <number>
         }
       }
     }
     ```
   - Rules:
     - Exact keys only;
     - Coefficients must be finite numbers $\ge 0$;
     - GDĐP has no `SCHOOL_WIDE` key (architecturally forbidden);
     - No fallback to 1.0 or system settings; no inference from title/notes.
   - Policy resolution uses `BusinessConfigurationService.resolveEffectiveBusinessPolicy` resolved at the execution's civil date.
   - If an eligible contribution requires a coefficient but the policy is missing, ambiguous, or corrupt, projection **BLOCKS** (does not silently zero).
   - If zero eligible contributions exist, policy absence allows projection to **PASS** with zero total credit.

6. **Reporting Statement Snapshot V3 Freeze**:
   - Introduces `REPORTING_STATEMENT_SNAPSHOT_V3` inheriting all fields from V2 (`operationalStartPolicyVersionId`, `operationalStartDate`) and adding `specialProgrammeWorkload`.
   - Statement submission requires both Curricular personal projection `PASS` and Special Programme Workload projection `PASS`.
   - Frozen snapshot contains full provenance:
     - `executionId`, `specialActivityId`, `specialActivityStaffingId`, `specialActivityTimeSlotId`;
     - `programmeMasterId`, `programmePlanVersionId`, `programmeTopicItemId`, `plannedProgrammeOccurrenceId`, `plannedOccurrenceSlotId`;
     - `programmeKind`, `occurrenceMode`, `executionCivilDate`, `actualTeacherUserId`;
     - `coefficient`, `credit`, `policyVersionId`, `policyValidatorVersion`;
     - Sorted immutable snapshot of qualifying `attestations`.
   - Deterministic canonicalization and SHA-256 semantic hashing protect the statement against post-submission source drift.

7. **Historical Statement Compatibility**:
   - Persisted V1 statements remain readable and unmutated.
   - Persisted V2 statements remain readable and unmutated.
   - V3 statements canonicalize and verify integrity with complete workload facts.
   - No historical backfill.

### 1.2 Boundary & Out of Scope

- **Generic Ad-Hoc SpecialActivity Boundary**:
  Generic ad-hoc `SpecialActivity` entities (lacking `ProgrammeMaterializedActivity` provenance) are not credited with special programme workload and do not receive inferred coefficients.
- **P4-060 Non-Scope**:
  Workload reductions, percentage deductions, allowances, and manual adjustments remain strictly out of scope and deferred under `P4-060`/`P4-061` (`DEFERRED_WITH_TRIGGER`).
- **Zero-Subject Rule**:
  Curricular responsibility policy is untouched; teachers without curricular responsibilities cannot submit statements solely due to special programme activities.
