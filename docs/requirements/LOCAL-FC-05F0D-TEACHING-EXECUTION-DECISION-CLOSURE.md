# LOCAL-FC-05F0D — Teaching Execution Decision Closure

## 1. Status and authority

**Status:** Accepted architecture decision closure on the documentation branch; awaiting independent GitHub review.

This closure records the locked product-owner decisions verified by `LOCAL-FC-05F0-TEACHING-EXECUTION-ARCHITECTURE-AUDIT.md`. It closes Teaching Execution architecture only and authorizes no implementation.

## 2. Baseline

- Canonical baseline: `07cba9d15b4335ac7d167ef11fa3ef21b66ee28a`
- LOCAL-FC-05E2: **CLOSED / GREEN**, PR #53, PR CI #210 PASS, merge `641d0ed94cf56b948888d1fc2870d60e5fc3f53f`, post-merge CI #211 PASS.
- LOCAL-FC-05E2B: **CLOSED / GREEN**, PR #54, final head `1731b7496c98961a96c09fd3b4aa7d397f7c679d`, PR CI #213 PASS, merge/main `07cba9d15b4335ac7d167ef11fa3ef21b66ee28a`, post-merge CI #214 PASS.
- 05E2B remains `PPCT_OCCURRENCE_ALLOCATION_V1`; TeachingExecution, completion, debt and reporting remain `NOT_ASSESSED` in that profile.

## 3. Closed decisions

| ID | Decision | Required consequence |
|---|---|---|
| D1 | Execution is evidence, not report state. | Report detail is projected; submitted/approved evidence is a later immutable snapshot/manifest. |
| D2 | Use separate curricular and Special Activity participation families. | No nullable polymorphic God aggregate. |
| D3 | Curricular evidence pins the complete direct-obligation and original normal-source relational tuple, including exact item revision. | `distributionObligationKey` may assist indexing/debugging but is not sole authority. |
| D4 | Eligible normal execution is exactly allocated BASE or allocated SAME_SUBJECT_SUBSTITUTION. | Every suppression, cancellation, absence, supervision, non-allocation, exhaustion or blocked replay rejects execution. |
| D5 | Actual teacher is derived by the server. | BASE uses responsible teacher; substitution uses the exact active disposition assigned teacher. |
| D6 | Actual content V1 equals the exact allocated/retained PPCT item revision. | No alternate item, free-text replacement, sequence override or lesson-swap emulation. |
| D7 | MAKEUP requires exact ACTIVE schedule and allocation source `MATCH`. | It uses scheduled teacher, fulfills the original obligation and consumes no new item; public scheduling stays deferred. |
| D8 | One direct distribution obligation has zero or one ACTIVE curricular fulfillment across NORMAL and MAKEUP. | Reversal relinquishes current credit but preserves history; replacement is separately validated. |
| D9 | Curricular kinds are only NORMAL and MAKEUP. | Operational classification stays provenance; Special Activity is separate. |
| D10 | Activity participation unit is activity + staffing + activity slot. | Partial participation is representable; class-target fan-out is forbidden. |
| D11 | Activity confirmation validates ACTIVE root, exact owned children, scheduled teacher and trustworthy structure. | Participation has no PPCT/distribution/completion/debt/progress effect and counts once per teacher-slot. |
| D12 | Slot end must be at or before server current instant in `Asia/Ho_Chi_Minh`. | No future execution and no host-local-midnight arithmetic. |
| D13 | Lifecycle is immutable ACTIVE to REVERSED. | No draft/report statuses, semantic in-place edit, physical delete or silent replacement. |
| D14 | Creation validates current-authoritative sources; accepted evidence never silently rebinds. | Later disagreement is source drift/reconciliation, not an execution status mutation. |
| D15 | Curricular evidence pins one exact valid calendar/week-segment/week mapping. | Missing/ambiguous mapping fails; activity week/segment may be null outside a valid segment; no ISO week. |
| D16 | Exact IDs plus bounded display snapshots preserve historical display evidence. | Snapshot only mutable labels needed for stability; do not duplicate every upstream object. |
| D17 | Negative facts are not execution. | Time passage/missing execution does not itself prove absence, debt, late, cancellation or supervision. |
| D18 | Future capabilities are RECORD/PERSONAL and MANAGE/SUBJECT,SCHOOL_WIDE. | Own commands require actor = server-derived actual teacher; activity management has no SUBJECT scope; no inferred authority. |
| D19 | Request identity/fingerprint, CAS, serializable concurrency, database uniqueness and transactional success audit are mandatory. | Retry cannot double fulfill or double count participation; failures emit no success audit. |
| D20 | Future confirmation uses one outer SERIALIZABLE snapshot with a tx-aware allocation resolver. | Keep existing `resolve()` RepeatableRead; never nest it inside execution confirmation or leave a TOCTOU gap. |

## 4. Persistence direction

Future persistence uses conceptual families `CurricularTeachingExecution` and `SpecialActivityParticipationExecution`. Curricular evidence uses a constrained `NORMAL | MAKEUP` discriminator in one family. Special Activity participation is separate because it has no curricular-obligation topology.

Database invariants must backstop:

- one ACTIVE curricular fulfillment per exact direct distribution obligation across both kinds;
- one ACTIVE participation per exact activity + staffing + activity-slot;
- unique request identities and deterministic replay/conflict behavior;
- valid predecessor/replacement and reversal linkage.

## 5. Authorization closure

| Capability | Allowed scopes | Meaning |
|---|---|---|
| `TEACHING_EXECUTION_RECORD` | `PERSONAL` only | Confirm/read/correct evidence only when server-derived actual teacher is the actor; activity actor must be the scheduled staffing teacher. |
| `TEACHING_EXECUTION_MANAGE` | `SUBJECT`, `SCHOOL_WIDE` | SUBJECT manages curricular evidence for that exact subject; SCHOOL_WIDE manages all curricular and activity participation evidence. |

No existing capability, technical admin role, professional title, assignment, membership, duty or UI visibility implies these authorities. This closure does not add the keys to contracts, catalog or seed.

## 6. Entry gates for implementation slices

### 05F1 — persistence foundation

05F1 may implement only the two persistence families, exact provenance, bounded snapshots, immutable lifecycle, idempotency identities, replacement/reversal integrity and database-enforced uniqueness. It must not implement public runtime, controllers, capability seed, progress/debt/reporting or UI.

### 05F2 — control plane / Báo giảng evidence runtime

05F2 may implement separately authorized confirmation/read/reversal/replacement behavior and future capability enforcement. It must introduce the tx-aware allocation service boundary so all resolution, time/week/source validation, uniqueness and insert/audit work uses one outer `SERIALIZABLE` transaction. It must not broaden public make-up scheduling.

## 7. Preserved boundaries

1. ADR-027 remains authoritative for execution evidence, actual/responsible teacher separation, derived progress/debt and immutable downstream statements.
2. ADR-031 remains authoritative for negative/incomplete operational facts, same-subject substitution, make-up semantics and scheduling-not-completion.
3. ADR-034 remains authoritative for atomic Special Activity roots, frozen staffing/slot provenance and no PPCT/completion at scheduling time.
4. ADR-036 remains a derived structural read model, never execution evidence.
5. ADR-037 and 05E2B retain the exact allocation/obligation/make-up source semantics and unchanged coverage profile.
6. Progress/debt/late, reporting, submission, approval and snapshots require later architecture/implementation slices.

## 8. Non-authorization

No schema, migration, application source, API, contract, capability seed, UI, workflow, deployment, production migration or production data mutation is authorized here. Move/swap, arbitrary actual-content divergence, alternate PPCT items, arbitrary actual teachers, PPCT import, attendance, Room/Location, notifications and AI remain excluded.
