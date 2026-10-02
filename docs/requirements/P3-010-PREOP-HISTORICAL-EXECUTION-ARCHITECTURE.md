# P3-010 — Pre-operational Historical Execution Architecture Closure

## Status

`CLOSED` by `SYNC-P3-010`

## Canonical start

- `main@73ec2ee0f9acecc3a02881a8091a0b0b4857c4c5`
- branch: `docs/p3-010-preop-history-architecture`
- task: `P3-010`
- traceability: `T28`, `T29`, `T30`

## Purpose

Close the architecture for controlled retrospective confirmation of curricular teaching that occurred before the configured operational-start boundary.

The architecture must allow correct PPCT/workload/reporting reconstruction without:

- treating missing history as debt;
- inventing manual PPCT progress;
- weakening ordinary execution guards;
- creating a second execution ledger.

## Accepted architecture

ADR-055 is the canonical decision authority.

The core contract is:

`expected replay != actual proof`

Expected pre-operational PPCT progression remains deterministic replay. Actual historical teaching exists only after a controlled P3 confirmation creates canonical retained execution evidence.

## Mandatory P3-020 implementation contract

P3-020 must implement all of the following:

1. dedicated historical preview/confirm flow;
2. `TEACHING_EXECUTION_MANAGE / SCHOOL_WIDE` authorization;
3. retained batch/row import provenance with source hashes and pinned OPERATIONAL_START policy version;
4. server-side class/subject/teacher/timetable/calendar/PPCT resolution;
5. historical direct NORMAL confirmation;
6. historical same-subject substitution reconstruction when exact evidence proves it;
7. historical completed MAKEUP reconstruction when exact original + target provenance is provable;
8. no manual progression/PPCT-item selection;
9. whole selected-set SERIALIZABLE confirmation with idempotency;
10. immutable correction through reverse + replacement, never in-place edit;
11. reconciliation read model with CONFIRMED / UNCONFIRMED / CONFLICT;
12. integration/E2E coverage for no-auto-debt, PPCT progression, workload/reporting inclusion, frozen-statement immutability, concurrency and authorization.

## Explicit boundaries

P3-010/P3-020 do not:

- authorize future public make-up scheduling — P3-030/P3-031 own that;
- own SpecialActivity/GDĐP/HĐTN execution history — P4 owns that;
- add debt from missing evidence;
- create manual PPCT cursor/baseline;
- authorize production/VPS mutation.

## Closure evidence

- canonical parent start: `main@73ec2ee0f9acecc3a02881a8091a0b0b4857c4c5`;
- final reviewed parent head: `3688f951204c657a2d241ef65de75ea2fe4b829e`;
- parent PR: #181 (`docs(history): define pre-operational historical evidence architecture`);
- exact-head parent PR CI: #598 / run `36977893198` — **SUCCESS**;
- normal merge/main: `9fdb30995523ec2267499bf3fe7a76902abddba7`;
- authoritative post-merge main CI: #599 / run `36978888675` — **SUCCESS**;
- independent GitHub diff audit: **PASS** across 8 documentation files;
- unresolved review threads: **0**;
- residual correction/re-entry tasks discovered by closure audit: **none**;
- runtime/schema/migration/API/UI/auth/workflow/deploy/VPS mutation performed by P3-010: **none**.

P3-010 is formally CLOSED. `P3-020` and `P3-030` are READY. `P3-031` remains PLANNED behind P3-030.
