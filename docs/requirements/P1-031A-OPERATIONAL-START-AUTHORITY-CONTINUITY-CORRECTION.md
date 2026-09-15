# P1-031A — Operational-Start Authority Continuity Correction

## Task authority

- **Task:** `P1-031A` — Operational-start authority continuity correction
- **Status:** `BLOCKED_DECISION`
- **Dependency:** `P1-031` — `CLOSED`
- **Traceability:** `T28`, `T30`
- **Dedicated branch:** `fix/operational-start-authority-continuity-031a`
- **Canonical starting main:** `f1b160be25045d0f4c661e154ece24c92a3e0fc9`
- **Controlling authority:** ADR-046, ADR-049 and the closed P1-030/P1-031 requirements
- **Architecture re-entry gate:** `P1-031B` — `BLOCKED_DECISION`

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

Independent review found one additional lifecycle edge that the accepted retained model cannot currently represent:

- `businessDate < source.effectiveFrom == currentOperationalStartDate`;
- ADR-049 permits that initial publication and requires a legitimate prospective adjustment before the current operational boundary;
- generic `REPLACE` requires `replacementEffectiveFrom > source.effectiveFrom` so that the inclusive source interval can close on the preceding civil date;
- P1-031A correctly also requires `replacementEffectiveFrom <= currentOperationalStartDate`.

Those requirements are mutually unsatisfiable when `source.effectiveFrom == currentOperationalStartDate`. Allowing an equal replacement date would require the retained source either to have an invalid empty interval, overlap the replacement, be deleted, or become non-authoritative through a status/lifecycle meaning not currently accepted for ordinary replacement. Marking the source `REVERSED` would reuse the persistence state whose accepted meaning is correction of an erroneous assertion; ADR-046 does not authorize it for a legitimate planned future change.

This is therefore an architecture representation gap, not a bounded P1-031A command-layer bug. No speculative runtime, schema or migration change is authorized on this branch. `P1-031B` is registered as the required architecture/decision re-entry.

## Enforced invariants

1. Initial OPERATIONAL_START publication is always open-ended and cannot self-expire into a gap.
2. RETIRE remains absolutely forbidden.
3. REPLACE closes the source on the previous civil date and creates an open-ended replacement on the next civil date, with no transition gap.
4. REPLACE remains allowed only while `businessCivilDate() < currentOperationalStartDate`.
5. Replacement effectivity satisfies both `replacementEffectiveFrom <= currentOperationalStartDate` and `replacementEffectiveFrom <= newOperationalStartDate`, while the generic invariant `replacementEffectiveFrom > businessCivilDate()` remains enforced.
6. The new operational-start date remains strictly after the server-owned business civil date and within the unique active AcademicCalendarVersion.
7. CORRECTION preserves OPERATIONAL_START effectivity and changes only retained historical payload truth through correction lineage.
8. Missing, ambiguous and corrupt policy authority remains fail closed.

Invariant 3 can be implemented by the current retained lifecycle only when `replacementEffectiveFrom > source.effectiveFrom`. The equality edge above remains blocked pending P1-031B; P1-031A must not claim complete lifecycle closure before that decision is accepted and implemented.

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

The independent-review equality case is not added as a misleading success regression because no accepted lifecycle rule can currently represent it. Existing tests and implementation remain intact as evidence for the already-bounded finite-interval and later-effectivity corrections; they do not prove closure of the newly identified architecture gap.

## Documentation and dependency effect

- `P1-031A` is `BLOCKED_DECISION`; it cannot return to implementation/review until `P1-031B` closes the scheduled-authority representation gap.
- `P1-031B` is the registered architecture re-entry and requires an explicit Product Owner choice of the retained lifecycle representation for a legitimate pre-boundary change when the published source has not yet become effective and `source.effectiveFrom == currentOperationalStartDate`.
- `P1-032` is `PLANNED` and depends on `P1-031A`; it remains non-startable until P1-031B closes, the resulting P1-031A correction is merged, authoritative post-merge CI succeeds, and `SYNC-P1-031A` closes the task.
- ADR-049 semantics are unchanged. This branch does not weaken the permitted `effectiveFrom <= operationalStartDate` rule or silently broaden CORRECTION.
- PRE-PILOT-PRODUCT-BASELINE is unchanged because no new Product Owner authority was introduced.

## Explicit non-scope and production verdict

- no P1-032 UI or production UI adapter;
- no academic-year picker or DESIGN.md change;
- no schema or Prisma migration;
- no payload/family/version/resource/API-shape change;
- no ProgressDebt classification, ReportingStatement contract or authorization change;
- no deploy, VPS, production database, production policy or production data mutation.

No production data remediation is required: production remains strictly PRE-OPERATIONAL, and no operational-start policy has been configured or deployed in production.
