# ADR-040 — Progress / Debt / Late Projection

- **Status:** Accepted
- **Date:** 2026-08-17
- **Scope:** LOCAL-FC-05G0 architecture closure; no implementation authorization
- **Authority:** `docs/requirements/LOCAL-FC-05G0D-PROGRESS-DEBT-LATE-DECISION-CLOSURE.md`

## Context

ADR-037 provides exact `DIRECT_DISTRIBUTION_OBLIGATIONS` without assessing completion, debt or reporting. ADR-038/ADR-039 retain immutable curricular execution evidence with exact original and actual provenance; ADR-031 retains the operational dispositions that can positively explain incomplete teaching. The next downstream read must distinguish a proven debt from an absence of evidence without inventing a mutable ledger or changing historical source rows.

The earlier 05A0 conceptual subtraction `distributed − completed` was useful as a high-level measure, but 05F0 subsequently accepted that missing execution or elapsed time does not itself prove absence, cancellation, supervision, debt or late. This ADR closes that missing-proof boundary.

## Decision

### Derived internal profile

`TEACHING_PROGRESS_DEBT_V1` is a schema-free internal deterministic projection for exactly one `AcademicYear + SchoolClass + Subject` root at an explicit `asOfInstant`. It derives progress, debt and late from retained facts. It creates no mutable progress/debt counter as truth, generic ledger, persisted current cursor/state row, API/controller or capability. A future materialization is allowed only when complete replay and exact reconciliation remain possible.

The evaluator uses one `RepeatableRead`-or-stronger transaction for the whole root and reuses tx-aware allocation and resolution boundaries. It does not compose nested source snapshots. The live authoritative projection rejects a future `asOfInstant`.

### Direct distribution and elapsed source

The only distribution input is an exact `DIRECT_DISTRIBUTION_OBLIGATION` from `PPCT_OCCURRENCE_ALLOCATION_V1`. Current PPCT version, PPCT maximum sequence, timetable count, execution count, client cursor and `DISTRIBUTION_COVERED_ITEMS` are not distribution inputs. In particular, merge-derived coverage is not a direct obligation and creates no execution, debt or make-up source.

An allocated direct obligation enters current elapsed totals only when its retained original source civil date combined with its retained original slot end in `Asia/Ho_Chi_Minh` is at or before `asOfInstant`. Host timezone, UTC midnight, ISO week and date-only arithmetic are forbidden. An obligation whose original slot has not ended is excluded.

### Completion and make-up

Completion credit exists only for a valid ACTIVE `CurricularTeachingExecution` whose retained original-obligation bundle exactly matches the direct obligation. Its actual execution slot must also have ended by `asOfInstant`. NORMAL and MAKEUP are eligible; REVERSED evidence receives no current credit.

MAKEUP fulfills the exact historical original obligation once, consumes no new PPCT item and retains its separate make-up schedule/actual target provenance. `MakeupTeachingSchedule` alone does not grant completion or close debt.

### Proof-backed debt, gap and late

Every elapsed direct obligation is exactly one of:

1. `COMPLETED` when it has valid ACTIVE exact fulfillment;
2. `PROVEN_OPEN_DEBT` when it lacks such fulfillment and its exact current-authoritative disposition is `ABSENCE_NO_REPLACEMENT` or `DIFFERENT_SUBJECT_SUPERVISION`;
3. `UNCONFIRMED_COMPLETION_GAP` when it lacks such fulfillment and its operational meaning is `BASE_TIMETABLE` or `SAME_SUBJECT_SUBSTITUTION`.

Missing execution alone is never debt proof. The disposition identity/provenance is retained for a proven debt. `AUTHORIZED_CANCELLATION`, calendar suppression/interruption and Special Activity suppression create no direct obligation in the first place.

V1 late is a separately named projection of a `PROVEN_OPEN_DEBT` whose original source slot has elapsed and remains unfulfilled at `asOfInstant`. No grace period, arbitrary deadline or authoritative ahead policy is introduced. Therefore V1 has `lateCount == openDebtCount`; debt age may be diagnostic only.

The result exposes deterministic `distributedElapsedCount`, `completedCount`, `openDebtCount`, `lateCount` and `unconfirmedGapCount`. Item-level output retains exact PPCT association/plan/version/item/revision, original timetable/date/calendar/slot, disposition if any, responsible teacher, fulfillment execution, make-up schedule if any, and actual execution/teacher provenance.

### Recompute, reconciliation and failure

Before official statement freeze, the projection recomputes from current authoritative retained facts. Overlay reversal/replacement may change live classification. Reversal of an ACTIVE MAKEUP may reopen a proven debt. No historical source or execution row is mutated for projection convenience.

Accepted execution remains pinned to the exact historical provenance accepted at creation. If current-authoritative replay no longer reconciles that original obligation exactly, or fulfillment topology is ambiguous/corrupt, the result is `RECONCILIATION_REQUIRED / BLOCKED`. It must never silently move evidence to another obligation, credit another item, choose a current PPCT head or discard a mismatch.

`SpecialActivityParticipationExecution` has no PPCT distribution, completion, debt or curricular-progress effect.

### Internal implementation boundary

LOCAL-FC-05G1 may implement this decision only as an internal read projection/service. It must not define a public controller/capability and does not authorize schema/migration, persisted ledger, manual debt editing/waiver, public make-up mutation, reporting, statement/submission/approval, workload, UI, PPCT import, Room/Location, notifications, AI, deployment or production work.

## Consequences

The repository has a deterministic, proof-backed progression boundary: completion stays exact and evidence-based; operational negative facts, not omissions, establish debt; unresolved missing evidence remains visible; and late can evolve later without relabeling debt as a counter. Later statement workflows must freeze their own historical output and cannot mutate it from live source corrections.

PROGRESS / DEBT / LATE ARCHITECTURE CLOSED — READY FOR LOCAL-FC-05G1 INTERNAL DETERMINISTIC PROJECTION
