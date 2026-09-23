# P4-030 — Programme Coordinator Authorization Contract

## Status

**CLOSED — IMPLEMENTED AND VERIFIED BY `SYNC-P4-030`.**

- Task branch: `feat/programme-coordinator-authorization-030`
- Canonical base: `ab4324e0094203bcab9fbfef9d4c4e952f46f48f`
- Final independently reviewed HEAD: `1f49f7f4d3cda83126373bb4df7ac6d31ce54859`
- Parent PR: #148 (`feat(programme): implement P4-030 coordinator authorization`)
- Exact-head PR CI: CI #472 (run id: `35420533601`), SUCCESS on attempt 1
- Merge/main commit: `08d235ded260e38171f38409e7e2783c9c1f41f2` (GitHub verified signature)
- Authoritative post-merge main CI: CI #473 (run id: `35420832787`), SUCCESS on attempt 1
- Predecessor: `P4-020` (CLOSED by `SYNC-P4-020`)
- Downstream: `P4-040` (READY, unlocked by `SYNC-P4-030`)
- Architecture authority: `docs/decisions/ADR-050-GDDP-HDTN-PROGRAMME-ARCHITECTURE.md`, `docs/decisions/ADR-008-CAPABILITY-AUTHORIZATION-SEMANTICS.md`, `docs/decisions/ADR-038-TEACHING-EXECUTION-EVIDENCE.md`
- Traceability: **T18**, **T44** (with strict **T43** boundary preservation)

---

## 1. Scope Boundary

### 1.1 In Scope
P4-030 establishes the runtime authorization layer for GDĐP and HĐTN-HN special programme planning:

1. **Exact Coordinator Authorization Binding**:
   - Coordinator authority is bound to `ACTIVITY` capability scope with `scopeResourceId = exact ProgrammeMaster.id`.
   - **GDĐP**: requires active `GDDP_COORDINATOR` grant on `ACTIVITY + exact ProgrammeMaster.id` where `master.kind === 'GDDP'`.
   - **HĐTN-HN**: requires active `HĐTN_COORDINATOR` grant on `ACTIVITY + exact ProgrammeMaster.id` where `master.kind === 'HDTN_HN'`.
   - Strictly isolated across programmes: `GDDP_COORDINATOR` cannot coordinate HĐTN-HN; `HĐTN_COORDINATOR` cannot coordinate GDĐP; coordinator of master A cannot manage master B.

2. **BGH Professional Authority Binding**:
   - BGH professional authority is bound strictly to `APPROVAL_PRINCIPAL / SCHOOL_WIDE` or `APPROVAL_VICE_PRINCIPAL / SCHOOL_WIDE`.
   - Grant constitutes the sole assignment evidence; authority is never inferred from job titles or role names.

3. **Bootstrap Invariant for ProgrammeMaster Creation**:
   - Because coordinator authority is resource-specific and depends on an existing `ProgrammeMaster.id`, `createMaster` is restricted exclusively to BGH professional authority (`APPROVAL_PRINCIPAL` or `APPROVAL_VICE_PRINCIPAL`, `SCHOOL_WIDE`).
   - Flow: (1) BGH creates `ProgrammeMaster`; (2) `CAPABILITY_GRANT` administrator issues coordinator grant for that exact master ID; (3) Coordinator exercises planning authority on that master.

4. **Defense-in-Depth Coordinator Grant Validation**:
   - `CapabilitiesService.normalizeResource()` is hardened specifically for `GDDP_COORDINATOR` and `HĐTN_COORDINATOR` grants to verify that the target resource exists in `ProgrammeMaster` and matches the required `kind` (`GDDP` vs `HDTN_HN`).
   - Other `ACTIVITY` capabilities (e.g., `AI_ACTIVE_USE_ACTIVITY`) remain unchanged.

5. **Programme Authorization Domain Service**:
   - Implements `ProgrammePlanningAuthorizationService` using `CapabilityAuthorizationService` and `AuditService`.
   - Deterministic precedence resolution: (1) matching coordinator; (2) `APPROVAL_PRINCIPAL`; (3) `APPROVAL_VICE_PRINCIPAL`.
   - Fail-closed on `mustChangePassword === true` or inactive/locked user accounts.
   - Rejection triggers generic `ForbiddenException` and an audit event with `action: 'AUTHORIZATION_DENIED'`, `result: 'DENIED'`, zero secrets.
   - Exposes qualification seam (`isQualifyingProgrammeAttestor`) for downstream P4-040 attestation validation without persisting attestation records.

6. **Authorized Command Façade**:
   - Implements `AuthorizedProgrammePlanningService` wrapping `ProgrammePlanningService`.
   - Raw `ProgrammePlanningService` remains internal provider only and is not exported to downstream modules.
   - Enforces DB-resolved resource identity verification on all child operations (plan versions, occurrences, replacements) to prevent request-body target spoofing.
   - Filters queries (`listMasters`, `listOccurrences`) so that non-BGH actors only see resources they are authorized to manage.

7. **Guarded HTTP Surface**:
   - Exposes `/api/programme-planning` endpoints protected by `SessionAuthGuard` (all routes) and `CsrfOriginGuard` (all mutation routes).
   - Validates that route parameters match any redundant DTO properties (`programmeMasterId`, `replacesOccurrenceId`), rejecting mismatches prior to service dispatch.

### 1.2 Explicit Non-Scope
P4-030 explicitly does **not**:
- Create a new `PROGRAMME` capability scope (preserves existing `CapabilityScope` schema);
- Implement `ProgrammeAttestation` storage, state, or reversal (deferred to P4-040);
- Implement `SpecialActivity` materialization, collision checking, or provenance bridge (deferred to P4-040);
- Implement post-materialization replacement reversal and substitute re-materialization (deferred to P4-040; T43);
- Implement workload eligibility calculation or reporting projection (deferred to P4-050; T19, T20, T44);
- Implement web frontend UI components;
- Add schema tables or database migrations;
- Mutate production configuration or perform deployment (production remains **PRE-OPERATIONAL**).

---

## 2. Authority & Security Contracts

### 2.1 Default Deny & No Inference Rule
In accordance with ADR-008, access is denied unless an active, valid, unrevoked capability grant exists for the evaluated context.

Authority is **never** inferred from:
- User role (`role`);
- `StaffProfile.positionTitle` (e.g. string titles "Hiệu trưởng", "Phó Hiệu trưởng", "Tổ trưởng");
- `SUBJECT_GROUP_LEAD` capability or subject-group membership;
- Staff-subject teaching assignment;
- Teacher presence in planned occurrence staffing;
- Past creator identity (`createdByUserId`);
- `SPECIAL_ACTIVITY_MANAGE / SCHOOL_WIDE` (T18);
- `SYSTEM_ADMIN / SCHOOL_WIDE`;
- `CAPABILITY_GRANT / SCHOOL_WIDE`.

### 2.2 Traceability Mapping
| Matrix Item | Description | P4-030 Enforcement |
|---|---|---|
| **T18** | Coordinator authority is distinct from generic school-wide activity mutation | Generic `SPECIAL_ACTIVITY_MANAGE` does not confer programme planning authority. Explicit `GDDP_COORDINATOR` / `HĐTN_COORDINATOR` on exact `ProgrammeMaster.id` or BGH professional authority is required. |
| **T44** | Special-program confirmation authority/topology | Defines existential qualification seam `isQualifyingProgrammeAttestor(actorUserId, master)` verifying whether an actor possesses qualifying Coordinator or BGH professional authority, satisfying the gate definition required by ADR-050 before P4-040 persistence. |
| **T43** | Replacement authority boundary | Preserves planning lifecycle replacement authority (Coordinator/BGH prospective draft replacement on planned occurrences) while strictly deferring post-materialization `SpecialActivity` CAS reversal/re-rooting to P4-040. |

---

## 3. Architecture & Module Seam

```
┌─────────────────────────────────────────────────────────────┐
│                ProgrammePlanningController                  │
│  - SessionAuthGuard + CsrfOriginGuard                       │
│  - Route/body param mismatch rejection                      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             AuthorizedProgrammePlanningService              │
│  - DB-resolved entity identity verification                 │
│  - Query result isolation / filtering                       │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│ProgrammePlanningAuthService │ │   ProgrammePlanningService  │
│ - Coordinator binding       │ │   (Internal Provider Only)  │
│ - BGH binding               │ │ - Retained persistence      │
│ - Qualification seam (P4-040)│ │ - CAS & idempotency         │
│ - Denial audit logging      │ │ - DB integrity hardening    │
└─────────────────────────────┘ └─────────────────────────────┘
```

`ProgrammePlanningModule` exports only `AuthorizedProgrammePlanningService` and `ProgrammePlanningAuthorizationService`. Raw `ProgrammePlanningService` is encapsulated.

---

## 4. Verification & Testing Strategy

A minimum of 32 distinct security and regression test cases must pass:
1. `APPROVAL_PRINCIPAL / SCHOOL_WIDE` creates `ProgrammeMaster`.
2. `APPROVAL_VICE_PRINCIPAL / SCHOOL_WIDE` creates `ProgrammeMaster`.
3. Coordinator cannot bootstrap create `ProgrammeMaster`.
4. GDĐP coordinator mutates/reads authorized GDĐP master.
5. GDĐP coordinator cannot access different GDĐP master.
6. GDĐP coordinator cannot access HĐTN-HN master.
7. HĐTN-HN coordinator mutates/reads authorized HĐTN-HN master.
8. HĐTN-HN coordinator cannot access GDĐP master.
9. Principal BGH accesses existing GDĐP and HĐTN-HN masters.
10. Vice Principal BGH accesses existing GDĐP and HĐTN-HN masters.
11. `SYSTEM_ADMIN / SCHOOL_WIDE` alone is denied.
12. `SPECIAL_ACTIVITY_MANAGE / SCHOOL_WIDE` alone is denied.
13. `SUBJECT_GROUP_LEAD` alone is denied.
14. Title `Hiệu trưởng` / `Phó Hiệu trưởng` without capability grant is denied.
15. Regular role/status without capability grant is denied.
16. Teacher presence in planned slot staffing does not grant management authority.
17. Creator identity alone does not retain authority after grant is removed.
18. Revoked coordinator grant is denied.
19. Expired coordinator grant is denied.
20. Future-dated coordinator grant is denied.
21. `mustChangePassword === true` is denied fail-closed.
22. Body/route master ID mismatch is rejected before mutation.
23. Body/route replacement occurrence ID mismatch is rejected before mutation.
24. Unauthorized query list does not leak other programme masters.
25. `GDDP_COORDINATOR` grant creation rejects non-existent resource.
26. `GDDP_COORDINATOR` grant creation rejects HĐTN-HN master.
27. `HĐTN_COORDINATOR` grant creation rejects GDĐP master.
28. Valid exact coordinator grant creations succeed.
29. Unrelated `AI_ACTIVE_USE_ACTIVITY` grant creation behavior remains unchanged.
30. Attestor qualification seam returns true/provenance for coordinator and BGH, false for others.
31. Denial audit event is persisted without sensitive data.
32. Raw `ProgrammePlanningService` is not exported from `ProgrammePlanningModule`.

Plus real PostgreSQL end-to-end integration lifecycle test.

---

## 5. Acceptance and Closure Evidence

P4-030 acceptance evidence is satisfied by:

- **Feature branch**: `feat/programme-coordinator-authorization-030`
- **Canonical starting base**: `ab4324e0094203bcab9fbfef9d4c4e952f46f48f`
- **Final independently reviewed HEAD**: `1f49f7f4d3cda83126373bb4df7ac6d31ce54859`
- **Independent review**: Initial exact-remote review findings (governance consistency, ADR-050 wording, T12/T15/T16/T17 status, ADR filenames, and persisted PostgreSQL denial audit evidence) were absorbed by forward commits `7ac3afe38cf6919716061b57947f56af632195c5` and `1f49f7f4d3cda83126373bb4df7ac6d31ce54859`. Final exact-remote audit returned `AUDIT PASS` with zero remaining findings.
- **Parent PR**: #148 (`feat(programme): implement P4-030 coordinator authorization`) with 16 changed files, 4 commits, and no unresolved threads.
- **Exact-head PR CI**: CI #472 (run `35420533601`, attempt 1), conclusion `SUCCESS`.
- **Merge commit**: `08d235ded260e38171f38409e7e2783c9c1f41f2` on branch `main` with verified GitHub signature.
- **Authoritative post-merge main CI**: CI #473 (run `35420832787`, attempt 1), conclusion `SUCCESS` across all jobs (`Windows deployment contract` and `Lint · Typecheck · Test · Build`, capability catalog synchronization, full API integration, Playwright smoke).
- **Local verification suites**:
  - Programme Planning unit suite: `92/92` PASS;
  - Capabilities synchronization integration: `6/6` PASS;
  - Coordinator authorization PostgreSQL integration: `31/31` PASS;
  - Capability-catalog CI gate: SUCCESS.
- **Administrative documentation closure**: `SYNC-P4-030`.
- **Downstream impact**: `P4-040` unlocked to `READY`; `P4-050` remains dependency-gated by `P4-040`.

### Non-Scope Confirmation
P4-030 introduced:
- zero schema tables or database migrations;
- zero Web UI components;
- zero `ProgrammeAttestation` storage or lifecycle runtime (owned by P4-040);
- zero `SpecialActivity` runtime materialization or collision bridge (owned by P4-040);
- zero workload calculation or reporting projection (owned by P4-050);
- zero deployment or production configuration mutation (production remains strictly **PRE-OPERATIONAL**).
