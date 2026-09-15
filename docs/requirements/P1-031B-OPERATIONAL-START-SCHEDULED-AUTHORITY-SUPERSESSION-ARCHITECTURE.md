# P1-031B — Operational-Start Scheduled-Authority Supersession Architecture

## Task authority

- **Task:** `P1-031B` — Operational-start scheduled-authority supersession architecture
- **Status:** `BLOCKED_DECISION`
- **Dependency:** `P1-031` — `CLOSED`
- **Traceability:** `T28`, `T30`
- **Triggered by:** independent review of P1-031A at branch head `05aa56b56d66678aaec0426bd3af4536d2e02257`
- **Canonical main observed at registration:** `f1b160be25045d0f4c661e154ece24c92a3e0fc9`
- **Controlling authority:** ADR-046, ADR-049, P1-030 §5 and P1-031

## Representational contradiction

Accepted authority permits initial publication with `effectiveFrom <= operationalStartDate` and requires a legitimate prospective adjustment before the current operational boundary. The retained generic replacement lifecycle uses inclusive civil-date intervals and requires a later replacement start so the source can close on the preceding civil date.

For the exact valid state:

```text
businessDate = 2026-09-10
source.effectiveFrom = 2026-09-20
currentOperationalStartDate = 2026-09-20
```

a no-gap replacement must start no later than `2026-09-20`, while the current retained replacement model requires it to start after `2026-09-20`. Starting on the same date cannot be represented by closing the inclusive source interval: the source would end on `2026-09-19`, before its immutable `effectiveFrom`.

The existing schema/model offers no accepted alternative:

- leaving both rows `PUBLISHED` creates overlap;
- closing the source on or after its start overlaps the replacement;
- closing it before its start violates the interval constraint;
- changing the published source start rewrites immutable authority;
- deletion violates retained history;
- `REVERSED` plus `correctsVersionId` is accepted only for correction of an erroneous assertion, not a legitimate planned future change;
- using `REVERSED` with replacement lineage would introduce a new lifecycle meaning and conflicts with the resolver's current replacement-lineage contract.

## Exact Product Owner decision required

The Product Owner must authorize the exact retained representation for superseding a published but not-yet-effective `OPERATIONAL_START` authority when its `effectiveFrom` equals the current `operationalStartDate`.

The decision must explicitly choose and define one of these semantic directions, or an equivalently precise retained model:

1. a distinct scheduled-authority supersession operation/state with exact status, lineage, audit, resolver and database invariants; or
2. an explicit expansion of CORRECTION authority to cover legitimate planned future adjustment, including why that no longer means only correction of an erroneous assertion and how audit consumers distinguish the cases.

Neither direction is preselected. The decision must not prohibit the ADR-049-valid equality publication merely to fit the current implementation, delete history, rewrite elapsed authority, create a gap/overlap, or infer a hidden default.

## Required architecture closure

Before P1-031A may resume, P1-031B must produce accepted authority that defines:

- command name and eligibility predicate using the server-owned HCM business date;
- exact source and successor persisted states;
- interval behavior for a source that has never become effective;
- lineage and audit evidence distinct enough to avoid semantic ambiguity;
- resolver behavior before, on and after the scheduled effective date;
- concurrency and database constraints;
- interaction with frozen ReportingStatement provenance and the prohibition on rewriting elapsed authority;
- required schema/migration verdict and migration/backfill rules if persistence changes;
- unit, isolated integration, static-schema and workflow-contract acceptance evidence.

## Dependency effect and forbidden work

- `P1-031A` remains `BLOCKED_DECISION` until P1-031B is accepted and closed.
- `P1-032` remains non-startable through its P1-031A dependency.
- No runtime, schema, migration, UI, deploy, VPS, production policy or production data mutation is authorized by this registration document.
- ADR-049 is not modified merely to accommodate the current generic lifecycle.
