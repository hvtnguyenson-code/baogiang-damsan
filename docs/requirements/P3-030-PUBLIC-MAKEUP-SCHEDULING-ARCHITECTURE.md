# P3-030 — Public Make-up Scheduling Re-entry Architecture

## Status

**IN_REVIEW**

Canonical start: `main@5c0faa7f945bd636abf9a40ecdc1d0cf8bc41cbe`

Branch: `docs/p3-030-public-makeup-architecture`

Trigger: T08 fired on 2026-10-02 when the Product Owner selected complete FULL BUSINESS PILOT.

## Purpose

Re-enter the previously deferred public make-up control plane only after the repository gained deterministic PPCT allocation, progress/debt projection, TeachingExecution, delayed-go-live authority and historical reconciliation.

The architecture must prove that a make-up schedule can be created from one exact real incomplete curricular obligation without:

- treating missing execution as debt;
- letting the client select PPCT identity;
- creating a second debt/completion ledger;
- bypassing collision or authorization rules;
- mixing prospective scheduling with P3-020 retrospective evidence ingestion.

## Read-only audit result

P3-030 audited current `main` and confirmed:

1. `MakeupTeachingSchedule` already persists the complete original obligation + target + teacher eligibility + lifecycle/request/replacement provenance.
2. Database constraints already enforce one ACTIVE claim per PPCT obligation and request/replacement uniqueness.
3. PPCT allocation V2 already emits exact make-up source matches.
4. Progress/debt V2 is the canonical proof layer that distinguishes `PROVEN_OPEN_DEBT` from `UNCONFIRMED_COMPLETION_GAP`.
5. TeachingExecution already confirms MAKEUP against an ACTIVE retained schedule and exact allocator match.
6. Resolved occurrences/effective schedule already include ACTIVE make-up occupancy.
7. SpecialActivity/calendar-exception paths already recognize make-up collision in the opposite direction.
8. P3-020 owns retrospective already-performed historical make-up and must remain isolated.
9. The missing surface is create/reverse/read management for post-operational proven debt.

No new persistence family or manual PPCT/debt state is justified.

## Locked architecture

ADR-056 is the authority for P3-031.

The core flow is:

```text
TEACHING_PROGRESS_DEBT_V2
  -> exact PROVEN_OPEN_DEBT item
  -> server revalidation in SERIALIZABLE transaction
  -> exact target calendar / make-up slot / teacher eligibility / collision checks
  -> ACTIVE MakeupTeachingSchedule
  -> target slot occurs
  -> existing CurricularTeachingExecution(kind=MAKEUP)
  -> original obligation completed exactly once
```

Important boundaries:

- candidate reads are advisory only;
- create is prospective and post-operational;
- `UNCONFIRMED_COMPLETION_GAP` is never schedulable;
- schedule creation does not complete teaching or close debt;
- correction is reverse + replacement;
- ACTIVE execution blocks schedule reversal;
- ACTIVE make-up blocks reversal of the source absence/supervision disposition;
- authority is existing `TEACHING_OPERATION_MANAGE / SUBJECT|SCHOOL_WIDE`;
- no new capability, PPCT selector, debt editor or collision engine.

## P3-031 implementation scope authorized after P3-030 closes

P3-031 may implement:

- bounded candidate/read API derived from proven debt;
- create/list/get/reverse make-up schedule runtime;
- replacement through new create against a reversed predecessor;
- reciprocal source-disposition reversal guard;
- canonical collision and teacher-eligibility reuse;
- shared contracts and deterministic tests;
- a bounded management UI consuming the same backend authority, if included in the implementation slice.

P3-031 must remain schema-free unless an implementation-time invariant is demonstrably impossible with the retained model; such a finding requires architecture re-entry before migration work.

## Explicit non-scope

P3-030/P3-031 do not authorize:

- historical pre-operational reconstruction outside P3-020;
- manual PPCT cursor/item/revision/component input;
- debt waiver/editing;
- enrichment/new teaching without an existing obligation;
- generic update/delete/unreverse;
- move/swap;
- teacher self-request or approval workflow;
- automatic execution confirmation;
- production/VPS/deployment mutation.

## Closure gate

P3-030 remains `IN_REVIEW` until all are true:

1. independent branch diff review passes;
2. exact-head PR CI succeeds;
3. parent PR merges normally;
4. authoritative post-merge main CI succeeds;
5. one non-recursive `SYNC-P3-030` records final evidence and marks ADR-056 Accepted / P3-030 CLOSED.

Only then may P3-031 become READY/startable.
