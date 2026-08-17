# LOCAL-FC-05G0D — Progress / Debt / Late Decision Closure

## 1. Status and authority

**Status:** CLOSED — accepted architecture decision closure; documentation only.

This closure accepts the decisions audited in `LOCAL-FC-05G0-PROGRESS-DEBT-LATE-ARCHITECTURE-AUDIT.md` and ADR-040. It follows LOCAL-FC-05F2, which is **CLOSED / GREEN** through PR #57 at `03bc8e9c08349547f7a447cef9dc4428a0bc55d8`, PR CI #224 SUCCESS, current main `354b1723d45fdb8cadc31aeded05ebcbd88cfdb3`, and post-merge CI #225 SUCCESS.

This closure authorizes no implementation. It creates no schema/migration, persisted debt/progress truth, manual debt process, public make-up runtime, API, controller, capability, report, statement, UI, test, workflow, deployment or production mutation.

## 2. Closed material decisions

| ID | Decision | Required invariant / consequence |
|---|---|---|
| D1 | `TEACHING_PROGRESS_DEBT_V1` is an internal projection rooted at `AcademicYear + SchoolClass + Subject` and evaluated at explicit `asOfInstant`. | Retained facts are truth. No mutable counter, generic ledger or persisted current cursor/state row becomes truth; future materialization is exactly reconcilable. |
| D2 | One projection uses one `RepeatableRead`-or-stronger snapshot and tx-aware dependencies. | No nested allocation/resolution snapshots and no mixed-source read. |
| D3 | Distribution is exact `DIRECT_DISTRIBUTION_OBLIGATIONS` from `PPCT_OCCURRENCE_ALLOCATION_V1` only. | Do not derive from PPCT head/sequence, timetable/execution count, cursor or merge-derived `DISTRIBUTION_COVERED_ITEMS`. |
| D4 | Elapsed means original retained civil date + original retained slot end in `Asia/Ho_Chi_Minh` is at or before `asOfInstant`. | Reject future live `asOfInstant`; no host-zone, UTC-midnight, ISO-week or date-only approximation. |
| D5 | Completion is a valid ACTIVE curricular execution for the exact original direct obligation, with an ended execution slot. | NORMAL or MAKEUP may fulfill; REVERSED does not. MAKEUP fulfills exactly once and consumes no new PPCT item. |
| D6 | Debt requires positive disposition proof. | Only unfulfilled `ABSENCE_NO_REPLACEMENT` or `DIFFERENT_SUBJECT_SUPERVISION` is `PROVEN_OPEN_DEBT`; retain exact disposition provenance. |
| D7 | Missing BASE/SAME_SUBJECT_SUBSTITUTION execution is an explicit uncertainty. | It is `UNCONFIRMED_COMPLETION_GAP`, never implied debt/absence/late. |
| D8 | V1 late has no invented grace/deadline policy. | A still-unfulfilled proven debt is late; `lateCount == openDebtCount`, while the concepts remain distinct for future policy. |
| D9 | Every elapsed direct obligation has one exact class and deterministic counts. | `COMPLETED`, `PROVEN_OPEN_DEBT`, or `UNCONFIRMED_COMPLETION_GAP`; expose distributed-elapsed, completed, open-debt, late and gap counts with exact provenance. |
| D10 | Live/draft results replay current authoritative retained facts. | Reversal/replacement can change the projection; do not mutate historical rows. |
| D11 | Accepted execution stays pinned; disagreement is explicit reconciliation. | Return `RECONCILIATION_REQUIRED / BLOCKED` for mismatch or ambiguous/corrupt topology; never silently rebind or substitute current PPCT state. |
| D12 | Make-up is exact original-obligation fulfillment, not a new source. | Schedule alone does not close debt; ACTIVE MAKEUP closes only the original proven debt and public scheduling remains out of scope. |
| D13 | Special Activity participation is outside curricular projection. | No PPCT distribution/completion/debt/progress effect. |
| D14 | LOCAL-FC-05G1 is the next slice. | It begins as an internal read projection/service; no public controller or capability is defined here. |
| D15 | Non-scope is preserved. | No schema/migration, ledger, waiver, public make-up mutation, reporting/statement/approval, workload, UI, import, Room/Location, notifications, AI or deployment. |

## 3. 05G1 entry criteria

LOCAL-FC-05G1 is **READY for its own separately authorized internal implementation task** only when it preserves every condition below:

1. It consumes `PPCT_OCCURRENCE_ALLOCATION_V1` through a tx-aware boundary and accepts only direct distribution obligations.
2. It evaluates the complete root under one `RepeatableRead`-or-stronger transaction, with no nested source snapshots.
3. It uses explicit `asOfInstant`, rejects future live values and applies retained slot-end instants in `Asia/Ho_Chi_Minh` to both source and execution.
4. It returns all three classifications and five deterministic counts, while excluding not-yet-ended source obligations.
5. It grants completion only to exact ACTIVE curricular fulfillment and enforces exact make-up original-obligation topology.
6. It treats absence/supervision as the only V1 debt proofs and leaves BASE/substitution non-fulfillment visible as `UNCONFIRMED_COMPLETION_GAP`.
7. It fails closed with `RECONCILIATION_REQUIRED / BLOCKED` for current replay disagreement or ambiguous/corrupt fulfillment topology.
8. It remains internal and introduces none of the D15 exclusions.

## 4. Required re-entry triggers

Reopen the affected architecture decision before implementation if any of the following arises:

- an authoritative policy requires grace periods, deadlines, late-age thresholds, waiver/manual-debt workflow, or authoritative ahead semantics;
- a requirement asks a make-up to fulfill anything other than one exact historical direct obligation, or to consume a new PPCT item;
- allocation no longer exposes exact direct obligations/provenance or changes merge-derived coverage semantics;
- execution topology permits more than one active fulfillment or no longer pins exact original provenance;
- source-slot/end-time or timezone policy changes;
- a projection needs a persisted/materialized state that cannot be exactly replayed and reconciled;
- reporting/statement freeze needs historical projection retention or a post-freeze correction policy;
- public API, authorization, public make-up scheduling, workload, UI, import, Room/Location, notifications, AI, deployment or production scope is proposed.

## 5. Preserved downstream boundary

An official historical statement is a later immutable concern. A future source correction must not mutate an already frozen statement; statement generation, snapshot/manifest selection, submission, approval and downstream correction are not decided or implemented by 05G0/05G1.
