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
| Make-up source | `MakeupTeachingSchedule` pins original normal opportunity plus exact association/plan/version/item. Its composite FK to unique `(ppctVersionId, ppctItemId, ppctPlanId)` revision coordinates proves and resolves the exact `PpctItemRevision`; there is no stored `PpctItemRevisionId` column. | Supports direct source-allocation validation; does not prove completion or debt closure. |
| Non-adjacent version history | PPCT draft commands accept `CARRY_FORWARD` from any earlier non-DRAFT revision and explicit predecessors from any lower-numbered non-DRAFT version of the same plan. Association switching targets the currently `PUBLISHED` version but imposes no adjacency or every-version binding rule. | Requires a full retained non-DRAFT frontier after an initial stream version context exists; target-only inspection is insufficient. |
| Read consistency | Structural V1 already uses one interactive `RepeatableRead` transaction. | Supports a single bounded replay snapshot; per-date transactions would be a semantic regression. |
| Absence of ledger/cursor | Schema and services contain no Progress/Distribution ledger or canonical numeric cursor. | Consistent with schema-free deterministic replay; not a blocker. |

No exact repository evidence contradicts or makes any locked decision impossible.

## 4. Allocation boundary

The accepted downstream profile is `PPCT_OCCURRENCE_ALLOCATION_V1`. It is a deterministic derived read projection, recomputed for one exact stream through a requested civil date. `throughCivilDate` is inclusive. Its logical input is equivalent to:

```text
academicYearId
schoolClassId
subjectId
throughCivilDate
```

It is not a mutable cursor, progress table, distribution ledger as sole truth, completion/debt table, or `ResolvedLessonOccurrence` aggregate. The initial implementation is schema-free: no Prisma model, migration, cache, snapshot, materialized cursor or evaluation audit mutation. A future optimization may use a reconcilable materialized projection only if exact replay remains possible.

The server, never the client, reconstructs the stream. It does not accept a numeric cursor, last sequence or current progress counter. Structural V1 remains a separate unchanged profile with allocation explicitly not assessed.

## 5. Canonical replay origin and deterministic order

All structural occurrence, PPCT association/version/revision and lineage reads for the complete bounded replay use one Prisma interactive `RepeatableRead` transaction. The allocation implementation must reuse or refactor the ADR-036 structural resolution semantics; it must not duplicate a second precedence engine that can drift. One transaction per civil date is prohibited.

The semantic replay origin is:

```text
REPLAY_ORIGIN = earliest civil date on which the exact
AcademicYear + SchoolClass + Subject stream has an authoritative
retained NORMAL timetable opportunity under retained timetable/calendar history
```

The allocator reconstructs every authoritative normal candidate from `REPLAY_ORIGIN` through `throughCivilDate`, inclusive. It must not start at the first PPCT association, current timetable, current calendar, first date in a caller-selected result window or arbitrary lookback. A prior normal candidate before the first valid PPCT association still propagates Structural V1's missing/invalid-binding blocker; choosing a later origin cannot erase it.

A civil-date gap without a normal opportunity contributes nothing and is not itself a blocker. If no authoritative normal opportunity exists through the inclusive upper bound, direct distribution state is empty. This defines semantic history coverage, not a physical SQL enumeration algorithm.

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

## 7. Composable distribution state and exact-version pending semantics

There is no canonical integer cursor. Replay maintains two distinct derived concepts:

1. `DIRECT_DISTRIBUTION_OBLIGATIONS`: exact allocations created only when a consuming normal occurrence receives an item. Every member has the D16 provenance tuple and one exact historical normal occurrence.
2. `DISTRIBUTION_COVERED_ITEMS`: stable logical `PpctItem` UUIDs considered already distributed for future allocation. It contains every directly distributed item and any merge successor derived under D12 when all predecessor logical items are already covered.

Merge-derived coverage is credit propagation only. It creates no synthetic normal occurrence, D16 distribution-obligation identity, TeachingExecution, completion or debt evidence. Every D8/D11/D12/D13 test of “consumed” or “already distributed” uses `DISTRIBUTION_COVERED_ITEMS`, allowing transition outcomes to compose across later versions.

For each occurrence, the exact civil-date association selects:

```text
PpctClassAssociation → exact PpctVersion → PpctPlan
```

A retained exact `SUPERSEDED` version is valid. The current published head, latest version number, current association, title or sequence must not reinterpret history. Within the selected exact version, the next item is the lowest-sequence exact `PpctItemRevision` whose logical UUID is not distribution-covered and remains pending. One normal occurrence creates at most one direct distribution obligation; one logical stream obligation is directly distributed at most once.

Association switches act prospectively according to their exact civil-date intervals. Target-version items are classified as follows:

- same stable `PpctItem` UUID already distribution-covered: covered and skipped, even if sequence/title/lesson type changed;
- same UUID not distribution-covered: pending at its target-version sequence;
- new UUID with no applicable predecessor lineage: new pending obligation;
- removed item: retained in history but absent from the successor's future pending target.

Removal does not erase coverage. If a covered UUID is absent from one or more intermediate versions and legally reappears later as the same stable UUID, it remains covered and is skipped. If it was never covered, it reappears pending. No title or sequence matching participates. Historical direct distribution, completion and debt evidence stays pinned to the original exact version/item/revision/occurrence; allocation replay never rewrites it.

For the first structurally valid normal candidate, both sets start empty and its exact target version becomes the initial allocation context. There is no invented prior version and no replay from version 1 merely because the first binding targets a later version. Incoming lineage for that initial target is still structurally validated using empty predecessor coverage: uncovered split children and zero-covered merge successor are pending, explicit `1→1` new UUID is pending, and many-to-many remains blocked.

## 8. Lineage transition matrix

Implicit same-UUID carry-forward is separate from explicit lineage and creates no lineage edge. The allocator must classify the complete connected transition shape; malformed or allocation-ambiguous lineage blocks replay. There is no last-edge-wins, arbitrary traversal, title/sequence heuristic or matching algorithm.

| Transition | Prior coverage state | Target allocation classification |
|---|---|---|
| `1 → N`, `N ≥ 2` split | predecessor not distribution-covered | all successor child UUIDs pending by target sequence |
| `1 → N`, `N ≥ 2` split | predecessor distribution-covered | `PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION`; blocked |
| `N → 1`, `N ≥ 2` merge | zero predecessors distribution-covered | merged successor pending |
| `N → 1`, `N ≥ 2` merge | all predecessors distribution-covered | add successor UUID to `DISTRIBUTION_COVERED_ITEMS`; create no direct obligation |
| `N → 1`, `N ≥ 2` merge | only some distribution-covered | `PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION`; blocked |
| explicit `1 → 1` to a new UUID | any predecessor state | successor is a new pending obligation; no automatic credit |
| `N → M`, `N > 1`, `M > 1` | any | `PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS`; blocked |

If semantic identity is intended across a one-to-one correction, the author must preserve the UUID with `CARRY_FORWARD`. A covered split cannot assign one credit among children, and a partial merge cannot safely choose pending or covered, without inventing semantics. A merge-all-covered successor remains covered through later same-UUID carry-forward, acts as a covered predecessor in a later merge, and causes the D11 blocker if later split.

## 9. Retained non-DRAFT version frontier

Chronological replay retains the exact PPCT version context last encountered by the stream. When a later valid normal candidate resolves to the same exact version, no transition occurs. When it resolves from `Vs` to a later `Vt`, the allocator processes every same-plan version satisfying:

```text
versionNumber > Vs.versionNumber
AND versionNumber <= Vt.versionNumber
AND status != DRAFT
```

The frontier is ordered by `versionNumber ASC`; deterministic id order is used only for corruption diagnosis. Each frontier target applies stable UUID, new/removal and complete lineage topology rules before advancing. Thus a non-DRAFT split/merge in a skipped version cannot be hidden by jumping directly to `Vt`. DRAFT versions are not authoritative transition steps.

At each frontier target, inspect all applicable incoming lineage whose successor belongs to that version. A predecessor may be any earlier retained non-DRAFT revision permitted by ADR-029; adjacency to `targetVersionNumber - 1` is not required. Predecessor state is evaluated by logical UUID membership in `DISTRIBUTION_COVERED_ITEMS`. A DRAFT or otherwise impermissible predecessor is malformed history and blocks.

If `Vt.versionNumber` is lower than the prior exact context, fail closed with `PPCT_ALLOCATION_HISTORY_BLOCKED` and a structured internal reason such as `NON_FORWARD_VERSION_TRANSITION`; no new public contract is implied. Frontier replay begins only after a prior exact stream version exists. The first valid candidate uses its target as initial context, as defined in section 7.

## 10. Mandatory composition scenarios

| Scenario | Chain | Deterministic result |
|---|---|---|
| A | V1 A directly distributed → V2/V3 same-UUID A | A remains covered in V2/V3; no redistribution. |
| B | V1 A directly distributed → V2 split A→B,C → V3 carries B,C | Replay blocks at V2 with split-after-distribution; V3 cannot hide it. |
| C | V1 A uncovered → V2 split A→B,C → V3 carries B,C | B and C remain pending. |
| D | covered A and X → V2 merge A+X→M → V3 carries M | M gains derived coverage at V2 and remains covered; no direct obligation or redistribution. |
| E | scenario D, then V3 splits M→P,Q | M is covered, so split-after-distribution blocks. |
| F | V1 A directly distributed → V2 explicit `1→1` A→B → V3 carries B | B is new and remains pending until directly distributed by a normal occurrence. |
| G | V1 A directly distributed → V2 removes A → V3 legally reintroduces same UUID A | Removal does not erase coverage; A is skipped. |
| H | prior context V1 → V2 DRAFT only → V3 non-DRAFT target | V2 is excluded from the authoritative frontier. |
| I | prior context V1 → class later resolves V3 while V2 non-DRAFT contains split/merge | V2 transition is processed even without a normal occurrence directly targeting V2. |
| J | normal opportunity precedes first valid PPCT association | Structural missing-binding blocker remains; replay origin cannot move later to hide it. |

These cases also cover carry-forward→split, split→carry-forward, merge→carry-forward, merge→split, remove→reappear, explicit `1→1`→carry-forward, skipped non-DRAFT/DRAFT versions and non-adjacent lineage. Split→merge, merge→merge and any partial merge use the same coverage set: uncovered/covered predecessor membership composes, partial coverage blocks, and no transition fabricates a direct occurrence.

## 11. Exhaustion, blockers and fail-closed continuation

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

## 12. Direct distribution-obligation and make-up provenance

Every consuming normal occurrence that receives an item adds exactly one member to `DIRECT_DISTRIBUTION_OBLIGATIONS`, with a logical distribution-obligation identity from:

```text
AcademicYear
SchoolClass
Subject
normalOccurrenceKey
PpctClassAssociation
PpctVersion
PpctItem
```

The result also exposes the exact `PpctItemRevision` plus version-local `sequence`, `title` and `lessonType`. A deterministic textual key may encode the tuple. 05E2 requires no random materialized obligation UUID; future persistence may add one only if the provenance tuple remains uniquely constrained and reconstructible. Merge-derived coverage adds no member to this set.

`MAKEUP_TEACHING` consumes no new item. `MakeupTeachingSchedule` physically pins exact association/plan/version/item coordinates; its composite FK resolves the unique exact revision without a stored revision-id column. Its retained original normal occurrence plus those coordinates must match exactly one `DIRECT_DISTRIBUTION_OBLIGATION` created by an actual historical consuming normal occurrence. Merge-derived coverage cannot manufacture a make-up source. Historical predecessor obligations remain the exact debt/make-up provenance. `MAKEUP_SOURCE_ALLOCATION_MATCH` may be assessed, but completion, open debt, fulfillment and debt closure remain not assessed. A mismatch emits `PPCT_MAKEUP_SOURCE_ALLOCATION_MISMATCH` and blocks as structural allocation corruption.

## 13. Current-authoritative recomputation

Allocation is recomputed from current authoritative retained facts. A later accepted overlay reversal/correction may change later replay before downstream official history is frozen; 05E2 mutates no old allocation because it stores none.

Future TeachingExecution must pin the allocation provenance it accepted: normal key, exact association/version/item/revision and distribution-obligation identity. Later recomputation disagreement is a reconciliation/correction problem and must never silently mutate the historical TeachingExecution.

## 14. Result, authorization and switch boundary

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

## 15. Consistency conclusion

| Authority | Verified consistency |
|---|---|
| ADR-027 | Distribution remains distinct from completion/debt; at most one next item per normal opportunity; make-up consumes none. |
| ADR-028 | Stable UUID, version-local revision and explicit split/merge lineage remain the physical provenance foundation. |
| ADR-029 | Every date uses its exact association/version, including legitimate retained `SUPERSEDED` bindings. |
| ADR-031 | Base, cancellation, absence, same-subject substitution and different-subject supervision follow the accepted PPCT-effect table exactly. |
| ADR-034 | Special Activity remains an independent aggregate, suppresses matching normal opportunity and owns no PPCT state. |
| ADR-036 | Structural V1 remains derived/read-only with allocation `NOT_ASSESSED`; 05E2 is a separate downstream profile and reuses its precedence. |

The corrected rules were also checked across carry-forward→split, split→carry-forward/merge, merge→carry-forward/split/merge, remove→reappear, explicit `1→1`→carry-forward, skipped non-DRAFT/DRAFT versions and non-adjacent lineage. No chain distributes a logical obligation twice, erases coverage, fabricates a direct occurrence, assigns split credit, resolves a partial merge, bypasses a skipped-version blocker or creates a make-up source from merge-derived credit.

**Conclusion:** all corrected D1–D18 decisions are internally consistent and representable. No hard-stop contradiction was found. LOCAL-FC-05E2 remains implemented on the docs branch awaiting independent GitHub review; it is not CLOSED / GREEN.

## 16. Hard non-scope

TeachingExecution persistence, Báo giảng submission, completion, debt/late/progress counters, report totals/snapshots, approval, make-up public mutation, PPCT import, UI, Room/Location, notifications, deployment and production migration remain excluded. Only sufficient downstream provenance obligations are defined.
