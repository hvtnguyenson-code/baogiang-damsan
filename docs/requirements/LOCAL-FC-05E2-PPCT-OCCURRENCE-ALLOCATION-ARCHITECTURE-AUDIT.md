# LOCAL-FC-05E2 — PPCT Occurrence Allocation Architecture Audit

## 1. Status and scope

**Status:** Architecture evidence consolidation for LOCAL-FC-05E2D and ADR-037. Documentation only; implemented on the task branch and awaiting independent GitHub review.

**Canonical baseline:** `92ea9133748f0864ba1d600b76a23d1d18e9e0e3`.

LOCAL-FC-05E0 is **CLOSED / GREEN** through PR #51 and CI #205 PASS. LOCAL-FC-05E1 is **CLOSED / GREEN** through PR #52 at head `76f0d389358d4f23f2a39e347a329c222d580d3c`, authoritative PR CI #208 PASS, merge commit/canonical main `92ea9133748f0864ba1d600b76a23d1d18e9e0e3`, and post-merge main CI #209 PASS.

This audit verifies the locked D1–D18 allocation decisions against the accepted architecture and retained implementation. It authorizes no application code, schema, migration, contract, capability, public API, cache, persistence, audit mutation, TeachingExecution, progress/debt/reporting state, UI, CI/CD, deployment or production operation. It does not change `RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1`; that profile still reports `PPCT_ITEM_ALLOCATION = NOT_ASSESSED`.

## 2. Authority and method

The following sources were read in full before this document was written:

- `LOCAL-FC-05A0-PPCT-TEACHING-EXECUTION-REPORTING-ARCHITECTURE-AUDIT.md` and 05A0D;
- ADR-027, ADR-028, ADR-029, ADR-031 and ADR-034;
- LOCAL-FC-05E0, LOCAL-FC-05E0D and ADR-036;
- `prisma/schema.prisma`;
- current `apps/api/src/ppct/**`, `resolved-occurrences/**`, `operational-overlays/**` and `special-activities/**`.

Accepted decision closures and ADRs outrank roadmap prose. Implementation is evidence of representability and current boundaries, not authority to broaden those decisions.

## 3. Canonical evidence inventory

| Required allocation fact | Repository evidence | Audit result |
|---|---|---|
| Stream scope | ADR-027/028 and `PpctClassAssociation` bind exact `AcademicYear + SchoolClass + Subject` intervals. | Supports stream-local replay; no plan-global progress owner exists. |
| Stable obligation identity | `PpctItem.id` is the stable UUID; `PpctItemRevision` owns version-local `sequence`, `title`, and `lessonType`. | Supports same-UUID carry-forward without sequence/title identity heuristics. |
| Exact version history | Association composite provenance pins exact plan/version; historical `SUPERSEDED` binding is accepted by ADR-029 and Structural V1. | Supports date-effective historical allocation without current-head substitution. |
| Split/merge provenance | `PpctItemLineage` links exact predecessor and successor revisions; same-UUID carry-forward has no edge. | Supports explicit topology classification; does not itself invent credit semantics. |
| Chronological opportunity evidence | Structural V1 retains civil date, real slot start/end, normal key and exact timetable provenance. | Supports deterministic order and real-overlap detection. |
| Operational meaning | ADR-031 fixes the four disposition PPCT effects; Structural V1 fixes precedence. | Supports the consuming/non-consuming table without inferring completion. |
| Special Activity meaning | ADR-034 and ADR-036 retain an independent activity and suppress matching normal opportunities. | Supports no allocation, no cursor advance and no debt creation by the activity itself. |
| Make-up source | `MakeupTeachingSchedule` retains original normal/association/version/item/revision provenance. | Supports source-allocation validation; does not prove completion or debt closure. |
| Read consistency | Structural V1 already uses one interactive `RepeatableRead` transaction. | Supports a single bounded replay snapshot; per-date transactions would be a semantic regression. |
| Absence of ledger/cursor | Schema and services contain no Progress/Distribution ledger or canonical numeric cursor. | Consistent with schema-free deterministic replay; not a blocker. |

No exact repository evidence contradicts or makes any locked decision impossible.

## 4. Allocation boundary

The accepted downstream profile is `PPCT_OCCURRENCE_ALLOCATION_V1`. It is a deterministic derived read projection, recomputed for one exact stream through a requested civil date. Its logical input is equivalent to:

```text
academicYearId
schoolClassId
subjectId
throughCivilDate
```

It is not a mutable cursor, progress table, distribution ledger as sole truth, completion/debt table, or `ResolvedLessonOccurrence` aggregate. The initial implementation is schema-free: no Prisma model, migration, cache, snapshot, materialized cursor or evaluation audit mutation. A future optimization may use a reconcilable materialized projection only if exact replay remains possible.

The server, never the client, reconstructs the stream. It does not accept a numeric cursor, last sequence or current progress counter. Structural V1 remains a separate unchanged profile with allocation explicitly not assessed.

## 5. Deterministic bounded replay

All structural occurrence, PPCT association/version/revision and lineage reads for the complete bounded replay use one Prisma interactive `RepeatableRead` transaction. The allocation implementation must reuse or refactor the ADR-036 structural resolution semantics; it must not duplicate a second precedence engine that can drift. One transaction per civil date is prohibited.

Eligible normal opportunities are ordered by:

1. civil date ascending;
2. retained real slot start time ascending;
3. retained real slot end time ascending;
4. deterministic normal key `NORMAL:<timetableEntryId>:<civilDate>` ascending.

Retained time slots are half-open, so adjacency is valid. If two allocation-eligible normal occurrences for the same stream have a real overlap that prevents trustworthy sequential allocation, the result is blocked with `PPCT_ALLOCATION_OCCURRENCE_ORDER_AMBIGUOUS`. `createdAt`, database return order and UUID accident are never tie-breakers for an impossible simultaneous order.

## 6. Consumption audit

Allocation means distribution only. It does not mean TeachingExecution, completion or debt closure.

| Resolved normal meaning | Allocation effect | Accepted source alignment |
|---|---|---|
| `BASE_TIMETABLE` | `CONSUMES_NEXT_ITEM` | Normal valid opportunity distributes at most one next obligation. |
| `OPERATIONAL_DISPOSITION / ABSENCE_NO_REPLACEMENT` | `CONSUMES_NEXT_ITEM` | ADR-031: distributed, not completed, downstream debt. |
| `OPERATIONAL_DISPOSITION / SAME_SUBJECT_SUBSTITUTION` | `CONSUMES_NEXT_ITEM` | ADR-031: distributed; completion requires later execution. |
| `OPERATIONAL_DISPOSITION / DIFFERENT_SUBJECT_SUPERVISION` | `CONSUMES_NEXT_ITEM` | ADR-031: distributed, expected subject incomplete, downstream debt. |
| `CALENDAR_INTERRUPTION` | `DOES_NOT_CONSUME_ITEM` | No normal opportunity. |
| `CALENDAR_EXCEPTION` | `DOES_NOT_CONSUME_ITEM` | Normal opportunity is suppressed. |
| `SPECIAL_ACTIVITY_SUPPRESSED` | `DOES_NOT_CONSUME_ITEM` | Activity suppresses normal teaching and carries no PPCT state. |
| `OPERATIONAL_DISPOSITION / AUTHORIZED_CANCELLATION` | `DOES_NOT_CONSUME_ITEM` | ADR-031: not distributed, not completed, no debt. |

An active matching Special Activity therefore does not advance allocation, consume an item or create debt. The next later valid subject opportunity receives the same next pending obligation. The activity remains an independent structural occurrence with no subject allocation of its own.

## 7. Exact-version pending-set semantics

There is no canonical integer cursor. Stream state is the deterministic classification of logical PPCT obligations already consumed by earlier allocation-eligible normal occurrences. For each occurrence, the exact civil-date association selects:

```text
PpctClassAssociation → exact PpctVersion → PpctPlan
```

A retained exact `SUPERSEDED` version is valid. The current published head, latest version number, current association, title or sequence must not reinterpret history. Within the selected exact version, the next item is the lowest-sequence exact `PpctItemRevision` whose logical obligation remains pending. One normal occurrence consumes at most one item; one logical stream obligation is consumed at most once.

Association switches act prospectively according to their exact civil-date intervals. Target-version items are classified as follows:

- same stable `PpctItem` UUID already consumed: already consumed and skipped, even if sequence/title/lesson type changed;
- same UUID not consumed: pending at its target-version sequence;
- new UUID with no applicable predecessor lineage: new pending obligation;
- removed item: retained in history but absent from the successor's future pending target.

Historical distribution, completion and debt evidence stays pinned to the original exact version/item/revision/occurrence. Allocation replay never rewrites it.

## 8. Lineage transition matrix

Implicit same-UUID carry-forward is separate from explicit lineage and creates no lineage edge. The allocator must classify the complete connected transition shape; malformed or allocation-ambiguous lineage blocks replay. There is no last-edge-wins, arbitrary traversal, title/sequence heuristic or matching algorithm.

| Transition | Prior consumption state | Target allocation classification |
|---|---|---|
| `1 → N`, `N ≥ 2` split | predecessor not consumed | all successor child UUIDs pending by target sequence |
| `1 → N`, `N ≥ 2` split | predecessor consumed | `PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION`; blocked |
| `N → 1`, `N ≥ 2` merge | zero predecessors consumed | merged successor pending |
| `N → 1`, `N ≥ 2` merge | all predecessors consumed | successor already distributed; consumes no later opportunity |
| `N → 1`, `N ≥ 2` merge | only some consumed | `PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION`; blocked |
| explicit `1 → 1` to a new UUID | any predecessor state | successor is a new pending obligation; no automatic credit |
| `N → M`, `N > 1`, `M > 1` | any | `PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS`; blocked |

If semantic identity is intended across a one-to-one correction, the author must preserve the UUID with `CARRY_FORWARD`. A consumed split cannot assign one credit among children, and a partial merge cannot safely choose pending or consumed, without inventing semantics.

## 9. Exhaustion, blockers and fail-closed continuation

When a consuming occurrence has no pending allocatable item in its exact target version, emit `PPCT_ALLOCATION_EXHAUSTED` and block. The allocator never reuses the last item, wraps sequence, borrows from a future version or invents content.

Required bounded categories are:

- `PPCT_ALLOCATION_EXHAUSTED`;
- `PPCT_ALLOCATION_OCCURRENCE_ORDER_AMBIGUOUS`;
- `PPCT_ALLOCATION_HISTORY_BLOCKED`;
- `PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION`;
- `PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION`;
- `PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS`;
- `PPCT_MAKEUP_SOURCE_ALLOCATION_MISMATCH`.

Existing Structural V1 blockers remain authoritative and may propagate. Once an allocation-critical blocker makes stream state unknown, later consuming occurrences receive no guessed items. Earlier deterministic allocations may remain visible as diagnostic provenance.

## 10. Distribution-obligation and make-up provenance

Every consuming normal occurrence defines exactly one logical distribution-obligation identity from:

```text
AcademicYear
SchoolClass
Subject
normalOccurrenceKey
PpctClassAssociation
PpctVersion
PpctItem
```

The result also retains exact `PpctItemRevision` plus version-local `sequence`, `title` and `lessonType`. A deterministic textual key may encode the tuple. 05E2 requires no random materialized obligation UUID; future persistence may add one only if the provenance tuple remains uniquely constrained and reconstructible.

`MAKEUP_TEACHING` consumes no new item. Its retained original normal occurrence plus exact association/version/item must match exactly one deterministic historical distribution-obligation identity. `MAKEUP_SOURCE_ALLOCATION_MATCH` may be assessed, but completion, open debt, fulfillment and debt closure remain not assessed. A mismatch emits `PPCT_MAKEUP_SOURCE_ALLOCATION_MISMATCH` and blocks as structural allocation corruption.

## 11. Current-authoritative recomputation

Allocation is recomputed from current authoritative retained facts. A later accepted overlay reversal/correction may change later replay before downstream official history is frozen; 05E2 mutates no old allocation because it stores none.

Future TeachingExecution must pin the allocation provenance it accepted: normal key, exact association/version/item/revision and distribution-obligation identity. Later recomputation disagreement is a reconciliation/correction problem and must never silently mutate the historical TeachingExecution.

## 12. Result, authorization and switch boundary

The result status is `PASS` or `BLOCKED`. Recommended coverage is:

```text
ppctItemAllocation = ASSESSED
teachingExecution  = NOT_ASSESSED
completion         = NOT_ASSESSED
debt               = NOT_ASSESSED
reporting          = NOT_ASSESSED
```

Consuming normal occurrences expose exact expected PPCT allocation. Non-consuming normal occurrences expose an explicit reason and no expected item.

The 05E2 minimum core remains internal: no controller, route or capability. No permission is inferred from `PPCT_MANAGE`, `TIMETABLE_MANAGE`, `TEACHING_OPERATION_MANAGE`, `SPECIAL_ACTIVITY_MANAGE`, `SYSTEM_ADMIN`, roles, titles or TeachingAssignment.

An association switch can cross an unsafe split/merge frontier. Runtime allocation always fails closed. A future switch preflight may reuse the same transition validator, but 05E2 does not require changing the 05A2 runtime, must not introduce a circular PPCT/occurrence module dependency, and cannot eliminate ambiguity introduced later by accepted operational corrections.

## 13. Consistency conclusion

| Authority | Verified consistency |
|---|---|
| ADR-027 | Distribution remains distinct from completion/debt; at most one next item per normal opportunity; make-up consumes none. |
| ADR-028 | Stable UUID, version-local revision and explicit split/merge lineage remain the physical provenance foundation. |
| ADR-029 | Every date uses its exact association/version, including legitimate retained `SUPERSEDED` bindings. |
| ADR-031 | Base, cancellation, absence, same-subject substitution and different-subject supervision follow the accepted PPCT-effect table exactly. |
| ADR-034 | Special Activity remains an independent aggregate, suppresses matching normal opportunity and owns no PPCT state. |
| ADR-036 | Structural V1 remains derived/read-only with allocation `NOT_ASSESSED`; 05E2 is a separate downstream profile and reuses its precedence. |

**Conclusion:** all D1–D18 decisions are internally consistent and representable. No hard-stop contradiction was found. LOCAL-FC-05E2D and ADR-037 may encode the locked closure without application or persistence changes.

## 14. Hard non-scope

TeachingExecution persistence, Báo giảng submission, completion, debt/late/progress counters, report totals/snapshots, approval, make-up public mutation, PPCT import, UI, Room/Location, notifications, deployment and production migration remain excluded. Only sufficient downstream provenance obligations are defined.
