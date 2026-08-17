# LOCAL-FC-05G0 — Progress / Debt / Late Architecture Audit

## 1. Status, scope and authority

**Status:** Architecture closure — documentation only.

This audit closes the internal architecture for deterministic curricular progress, proof-backed debt and late projection after LOCAL-FC-05F2. It authorizes no schema, migration, persisted ledger, service, API, capability, UI, reporting, make-up scheduling runtime, test, workflow, deployment or production mutation.

The accepted authority chain is ADR-027 and 05A0D for PPCT/history, ADR-031 for operational dispositions and make-up scheduling, ADR-037 for exact allocation, and ADR-038/ADR-039 plus 05F0D for execution evidence and persistence. ADR-040 records the resulting accepted 05G0 decision.

## 2. Current delivery position

LOCAL-FC-05F2 — Teaching Execution Control Plane — is **CLOSED / GREEN**: PR #57 final head `03bc8e9c08349547f7a447cef9dc4428a0bc55d8`, PR CI #224 SUCCESS, merged/current main `354b1723d45fdb8cadc31aeded05ebcbd88cfdb3`, and post-merge CI #225 SUCCESS.

05G0 is the architecture closure immediately after that runtime slice. LOCAL-FC-05G1 is the next implementation slice and begins only as an internal deterministic read projection/service.

## 3. Authoritative trace and decision verification

| 05G0 decision | Authoritative basis | Closure result |
|---|---|---|
| D1 root and projection-only truth | 05A0D D2/D6; ADR-027 §6; ADR-037 derived stream-local profile | `TEACHING_PROGRESS_DEBT_V1` is evaluated for exactly `AcademicYear + SchoolClass + Subject` at an explicit `asOfInstant`. It derives from retained facts; no mutable progress/debt counter, generic ledger or current cursor/state row is truth. A future materialization must reconcile exactly. |
| D2 one coherent snapshot | ADR-037 snapshot/replay rule; ADR-038 one-transaction tx-aware resolver boundary | 05G1 evaluates one projection in one `RepeatableRead`-or-stronger transaction and reuses tx-aware allocation/resolution boundaries. It must not create nested source snapshots. |
| D3 direct distribution source | ADR-037 direct obligations versus `DISTRIBUTION_COVERED_ITEMS` | Only exact `DIRECT_DISTRIBUTION_OBLIGATIONS` from `PPCT_OCCURRENCE_ALLOCATION_V1` can enter this projection. Current PPCT head, max sequence, timetable count, execution count, client cursor and merge-derived coverage are invalid substitutes. |
| D4 elapsed source policy | ADR-038 exact slot-end policy; 05F0D D12 | A direct obligation enters current totals only after its retained original civil date plus retained original slot end in `Asia/Ho_Chi_Minh` is at or before `asOfInstant`. Live projection rejects a future `asOfInstant`; host timezone, UTC midnight, ISO week and date-only shortcuts are forbidden. |
| D5/D12 completion and make-up | 05A0D D3; ADR-037 make-up provenance; ADR-038 §§44–50; ADR-039 | Credit requires one valid ACTIVE `CurricularTeachingExecution` for the exact original direct obligation and an ended execution slot. NORMAL or MAKEUP may fulfill it; MAKEUP consumes no new PPCT item and must retain the exact original obligation separately from its target. REVERSED evidence has no current credit. |
| D6/D7 positive debt proof and gap | ADR-031 disposition table; ADR-038 §74; 05F0D D17 | Missing execution is not evidence of absence, debt or late. An elapsed, unfulfilled obligation is `PROVEN_OPEN_DEBT` only for exact active authoritative `ABSENCE_NO_REPLACEMENT` or `DIFFERENT_SUBJECT_SUPERVISION`; BASE_TIMETABLE or SAME_SUBJECT_SUBSTITUTION without valid execution is `UNCONFIRMED_COMPLETION_GAP`. Exact disposition provenance is retained. |
| D8/D9 late and classification | ADR-027 §6 projection boundary; ADR-038 §97; ADR-031 PPCT effects | V1 late is a separately named view of an elapsed, still-unfulfilled proven debt, so `lateCount == openDebtCount`. Every elapsed direct obligation is exactly one of `COMPLETED`, `PROVEN_OPEN_DEBT`, or `UNCONFIRMED_COMPLETION_GAP`; `ahead` is not authoritative V1 semantics. |
| D10/D11 recomputation and reconciliation | ADR-031 reversal consequence; ADR-037 current-authoritative replay; ADR-038 §§70–74 | Live/draft results recompute from current authoritative retained facts. Accepted execution remains pinned to accepted historical provenance. If replay cannot reconcile that evidence exactly, or fulfillment topology is ambiguous/corrupt, return `RECONCILIATION_REQUIRED / BLOCKED`; never rebind, silently credit another item, choose the current PPCT head or discard the mismatch. |
| D13 special activity | ADR-038 §§23–26 and 54–58; ADR-039 | `SpecialActivityParticipationExecution` is a separate family and has no PPCT distribution, completion, debt or curricular-progress effect. |
| D14/D15 implementation and non-scope | ADR-037/ADR-038 internal and non-scope boundaries | 05G1 is internal read projection/service only. Public controller/capability, public make-up mutation, reporting/statement/approval, workload, UI, PPCT import, Room/Location, notifications, AI and deployment remain excluded. |

## 4. Why the earlier subtraction formula is narrowed

05A0 recorded the useful initial conceptual expression `openDebt = distributed − completed`, while classifying the physical debt/reconciliation policy as unresolved. In that earlier model, absence and different-subject supervision were already the positive operational sources that create a concrete debt; the expression was not a license to infer a negative operational fact from a missing row.

05F0 then closed the missing proof boundary explicitly: time passing or missing execution does not itself prove absence, cancellation, supervision, debt or late. ADR-038 also distinguishes eligible NORMAL evidence from absence/supervision/cancellation, and ADR-031 separately retains the disposition that explains an incomplete normal opportunity.

Therefore 05G0 preserves the useful distributed/completed measurement but narrows its result:

```text
elapsed direct obligation + valid ACTIVE fulfillment       => COMPLETED
elapsed direct obligation + no fulfillment + debt proof    => PROVEN_OPEN_DEBT
elapsed direct obligation + no fulfillment + no debt proof => UNCONFIRMED_COMPLETION_GAP
```

Only the middle category contributes to `openDebtCount` and `lateCount`. This prevents an incomplete operational record from being silently converted into a factual absence or debt.

## 5. Projection contract

### Inputs and temporal boundary

`TEACHING_PROGRESS_DEBT_V1` takes the conceptual root `AcademicYear + SchoolClass + Subject` and explicit `asOfInstant`. It resolves all retained inputs in one coherent transaction. The live authoritative path rejects an instant after server current time.

The projection uses the exact source civil date and original retained slot end in `Asia/Ho_Chi_Minh`. An obligation whose source slot has not ended is excluded from all elapsed counts. The execution used for completion must likewise have ended by `asOfInstant`.

### Obligation, completion and classification

The only distributable input is an exact direct obligation produced by `PPCT_OCCURRENCE_ALLOCATION_V1`. A merge-derived covered item, even when it affects later allocation coverage, never creates an execution, debt or make-up source.

For every elapsed direct obligation, 05G1 must expose exactly one classification and deterministic counts:

- `distributedElapsedCount`
- `completedCount`
- `openDebtCount`
- `lateCount`
- `unconfirmedGapCount`

An item-level result preserves enough exact retained provenance to trace the PPCT association/plan/version/item/revision; original timetable/date/calendar/slot; disposition where applicable; responsible teacher; fulfillment execution; make-up schedule where applicable; and actual execution/teacher.

An ACTIVE execution credits only its exact pinned original obligation. A valid MAKEUP execution closes that original obligation once and creates no new distribution. A `MakeupTeachingSchedule` is only scheduling provenance and cannot close debt by itself.

### Recompute and fail-closed behavior

Before any later official statement freeze, live/draft projection recomputes from current authoritative retained facts. A reversal/replacement of an overlay can change the live proof outcome; reversal of a MAKEUP execution can reopen a proven debt. Historical source/execution records are never mutated to simplify that result.

When current replay cannot reproduce the exact original obligation accepted by execution evidence, the projection blocks with `RECONCILIATION_REQUIRED / BLOCKED`. The same fail-closed outcome applies to ambiguous/corrupt fulfillment topology. No heuristic current-version lookup, reassignment or silent omission is allowed.

## 6. Scenario consistency check

| Scenario | Required result | Result |
|---|---|---|
| A. BASE + ACTIVE NORMAL execution | `COMPLETED` | PASS |
| B. BASE elapsed + no execution | `UNCONFIRMED_COMPLETION_GAP` | PASS |
| C. SAME_SUBJECT_SUBSTITUTION + ACTIVE NORMAL execution | `COMPLETED` | PASS |
| D. SAME_SUBJECT_SUBSTITUTION + no execution | `UNCONFIRMED_COMPLETION_GAP` | PASS |
| E. ABSENCE_NO_REPLACEMENT + no fulfillment | `PROVEN_OPEN_DEBT` and late | PASS |
| F. DIFFERENT_SUBJECT_SUPERVISION + no fulfillment | `PROVEN_OPEN_DEBT` and late | PASS |
| G. Proven debt + MakeupTeachingSchedule only | debt remains open | PASS |
| H. Proven debt + ACTIVE MAKEUP execution | completed; debt closed; no new distribution | PASS |
| I. Reverse that MAKEUP while proof remains | debt reopens | PASS |
| J. AUTHORIZED_CANCELLATION | no distribution/debt/completion | PASS |
| K. Special Activity suppression | no curricular PPCT distribution/debt | PASS |
| L. Source slot not ended | excluded from elapsed totals | PASS |
| M. Merge-derived PPCT coverage | no direct obligation/debt/execution source | PASS |
| N. Replay disagrees with retained accepted execution | `RECONCILIATION_REQUIRED / BLOCKED` | PASS |
| O. Overlay reversal/replacement | recompute live; do not mutate history | PASS |
| P. Official historical statement | correction cannot mutate frozen statement; implementation deferred | PASS |

## 7. Resolved and deferred questions

### Resolved by 05G0

- Projection root, explicit instant, direct-obligation-only distribution source and source-slot elapsed policy.
- Positive proof required for debt; a separate visible unconfirmed gap state.
- Completion topology, make-up credit, late V1 and exact counts.
- Current-authoritative recomputation plus reconciliation/fail-closed behavior.
- Special Activity exclusion and the 05G1 internal boundary.

### Deferred beyond 05G0

- Physical schema/materialization/cache and any performance strategy.
- API/DTO/controller, capability/scope and public read contract.
- Public make-up scheduling mutation, debt waiver/editing and any manual debt workflow.
- Grace periods, deadline policy, authoritative ahead semantics and policy-versioned debt-age behavior.
- Reporting implementation, statement/snapshot/submission/approval and frozen-statement reconciliation workflow.
- Workload, UI, PPCT import, Room/Location, notifications, AI, deployment and production operations.

## 8. Consistency conclusion

D1–D15 are mutually consistent with the accepted authority chain. They retain immutable historical provenance, separate operational negative facts from execution evidence, preserve exactly-once fulfillment, and make the downstream result reproducible without inventing a ledger or reinterpreting historical rows. No accepted authoritative source contradicts this closure.
