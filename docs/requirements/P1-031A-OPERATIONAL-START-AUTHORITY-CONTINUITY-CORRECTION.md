# P1-031A — Operational-Start Authority Continuity Correction

## Task authority

- **Task:** `P1-031A` — Operational-start authority continuity correction
- **Status:** `IN_REVIEW`
- **Dependency:** `P1-031` — `CLOSED`
- **Traceability:** `T28`, `T30`
- **Dedicated branch:** `fix/operational-start-authority-continuity-031a`
- **Canonical starting main:** `f1b160be25045d0f4c661e154ece24c92a3e0fc9`
- **Controlling authority:** ADR-046, ADR-049 and the closed P1-030/P1-031 requirements

## Defect and root cause

The P1-031 implementation did not fully enforce ADR-049 authority continuity:

1. `createDraft` accepted `OPERATIONAL_START` with a finite `effectiveUntil`.
2. `publish` did not reject a retained legacy/stale finite draft.
3. `RETIRE` was correctly forbidden.
4. `REPLACE` correctly required the source authority to be open-ended.

Together, those rules allowed an initially published finite authority to expire into a policy gap while neither RETIRE nor normal REPLACE could repair it. The generic Business Configuration schema intentionally permits finite intervals and deliberate gaps for other families, so this is a family-specific command-layer enforcement defect, not a schema defect.

The replacement command also enforced `replacementEffectiveFrom > businessCivilDate()` and future current/new operational-start payload dates, but did not enforce that the replacement itself became authoritative before both operational boundaries. A replacement could therefore start after the current or new `operationalStartDate`.

## Lifecycle and downstream audit

| Surface | Audit result | P1-031A action |
|---|---|---|
| `createDraft` | Accepted finite OPERATIONAL_START interval | Reject supplied `effectiveUntil` with `OPERATIONAL_START_EFFECTIVE_UNTIL_FORBIDDEN` before persistence |
| `editDraft` | Edits payload only; cannot mutate effectivity | No runtime change |
| `publish` | Validated payload/calendar/initial start, but not open-ended effectivity | Reject any retained draft whose `effectiveUntil !== null` with the same stable code |
| `replace` | Required open-ended source and continuous next-day handoff; current boundary and new future-date guards existed | Additionally require `replacementEffectiveFrom <= currentOperationalStartDate` and `replacementEffectiveFrom <= newOperationalStartDate`; reject with `OPERATIONAL_START_REPLACEMENT_EFFECTIVITY_AFTER_BOUNDARY_FORBIDDEN` |
| `retire` | Correctly forbidden with `OPERATIONAL_START_RETIRE_FORBIDDEN` | Preserve unchanged |
| `correct` | Preserves exact source effectivity and retained correction lineage | Preserve unchanged |
| `resolveEffectiveBusinessPolicy` | Exact-date single-candidate resolution; missing/ambiguous/corrupt outcomes fail closed | Preserve unchanged |
| `resolveOperationalStartPolicy` | Typed adapter maps missing/ambiguous/corrupt outcomes to stable fail-closed exceptions | Preserve unchanged |
| Database constraints | Generic interval validity, published overlap exclusion, lineage and immutable-published guards; deliberate gaps remain valid for generic families | No schema or migration change; command layer owns the OPERATIONAL_START specialization |
| ProgressDebt | Uses one resolved authority, retains historical PPCT replay, omits only unconfirmed pre-operational obligations and preserves corrupt/ambiguous evidence findings | No change |
| TeachingExecution | Resolves command-time authority once and rejects ordinary pre-operational confirmation | No change |
| Reporting | Resolves one live/frozen authority and pins policy provenance in SNAPSHOT_V2 | No change |

No additional lifecycle defect with the same root cause was found.

## Enforced invariants

1. Initial OPERATIONAL_START publication is always open-ended and cannot self-expire into a gap.
2. RETIRE remains absolutely forbidden.
3. REPLACE closes the source on the previous civil date and creates an open-ended replacement on the next civil date, with no transition gap.
4. REPLACE remains allowed only while `businessCivilDate() < currentOperationalStartDate`.
5. Replacement effectivity satisfies both `replacementEffectiveFrom <= currentOperationalStartDate` and `replacementEffectiveFrom <= newOperationalStartDate`, while the generic invariant `replacementEffectiveFrom > businessCivilDate()` remains enforced.
6. The new operational-start date remains strictly after the server-owned business civil date and within the unique active AcademicCalendarVersion.
7. CORRECTION preserves OPERATIONAL_START effectivity and changes only retained historical payload truth through correction lineage.
8. Missing, ambiguous and corrupt policy authority remains fail closed.

## Regression evidence

Added regression coverage proves:

- finite OPERATIONAL_START draft creation is rejected before persistence/audit;
- direct database-seeded legacy finite DRAFT publication is rejected and remains unchanged;
- valid initial open-ended publication remains accepted;
- RETIRE remains rejected;
- replacement effectivity after the current boundary is rejected;
- replacement effectivity after the new boundary is rejected;
- boundary-valid replacement closes the source at the previous civil date and keeps the replacement open-ended;
- resolver transition dates remain contiguous without a gap;
- existing correction effectivity/lineage and `POLICY_NOT_CONFIGURED`, `POLICY_AMBIGUOUS`, `POLICY_CORRUPT` behavior remain unchanged.

Local evidence:

- targeted Business Configuration command/registry unit regression: 2 suites, 72 tests passed;
- affected ProgressDebt, TeachingExecution and Reporting unit regression: 11 suites, 258 tests passed;
- broader API unit regression: 74 suites, 1,243 tests passed;
- API lint: PASS;
- API typecheck: PASS;
- `npm run test:schema:business-configuration:static`: PASS;
- `npm run test:workflow:contract`: PASS;
- Business Configuration integration suite contains the new database regressions, but local execution is safety-blocked when no explicitly certified isolated `TEST_DATABASE_URL` is supplied; no unapproved database was used.

## Documentation and dependency effect

- `P1-031A` is registered as the active correction.
- `P1-032` is `PLANNED` and depends on `P1-031A`; it remains non-startable until the correction implementation is merged, authoritative post-merge CI succeeds, and `SYNC-P1-031A` closes the task.
- ADR-049 semantics are unchanged; this correction makes implementation conform to its existing no-gap authority.
- PRE-PILOT-PRODUCT-BASELINE is unchanged because no new Product Owner authority was introduced.

## Explicit non-scope and production verdict

- no P1-032 UI or production UI adapter;
- no academic-year picker or DESIGN.md change;
- no schema or Prisma migration;
- no payload/family/version/resource/API-shape change;
- no ProgressDebt classification, ReportingStatement contract or authorization change;
- no deploy, VPS, production database, production policy or production data mutation.

No production data remediation is required: production remains strictly PRE-OPERATIONAL, and no operational-start policy has been configured or deployed in production.
