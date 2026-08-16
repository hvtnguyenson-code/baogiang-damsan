# LOCAL-FC-05E2D — PPCT Occurrence Allocation Decision Closure

## 1. Status and authority

**Status:** Accepted architecture decision closure; documentation only.

This closure records the locked product-owner decisions D1–D18 verified by `LOCAL-FC-05E2-PPCT-OCCURRENCE-ALLOCATION-ARCHITECTURE-AUDIT.md`. ADR-037 is the concise accepted record.

**Canonical baseline:** `92ea9133748f0864ba1d600b76a23d1d18e9e0e3`.

LOCAL-FC-05E0 is CLOSED / GREEN through PR #51 and CI #205 PASS. LOCAL-FC-05E1 is CLOSED / GREEN through PR #52, head `76f0d389358d4f23f2a39e347a329c222d580d3c`, PR CI #208 PASS, canonical merge `92ea9133748f0864ba1d600b76a23d1d18e9e0e3`, and post-merge CI #209 PASS.

This closure authorizes no runtime implementation. LOCAL-FC-05E2B requires a separate task and branch.

## 2. Locked decisions

### D1 — Derived allocation profile

`PPCT_OCCURRENCE_ALLOCATION_V1` is a deterministic, schema-free read projection. It is not a mutable cursor/progress table, sole-source distribution ledger, completion/debt table or persisted occurrence aggregate. No model, migration, cache, snapshot, materialized cursor or evaluation audit mutation is introduced. Future materialization must remain exactly replayable and reconcilable.

### D2 — Stream scope and server replay

Allocation state belongs exactly to `AcademicYear + SchoolClass + Subject`. A bounded request resolves that stream through an exact civil date. The server replays authoritative normal opportunities; a client numeric cursor, last sequence or current progress counter is prohibited.

### D3 — Canonical order and overlap

Replay order is civil date, retained real slot start, retained real slot end, then `NORMAL:<timetableEntryId>:<civilDate>`, all ascending. Half-open adjacent slots are valid. An allocation-eligible same-stream real overlap that prevents trustworthy sequential order blocks; `createdAt`, database order and UUID luck do not resolve it.

### D4 — Consumption classification

`BASE_TIMETABLE`, `ABSENCE_NO_REPLACEMENT`, `SAME_SUBJECT_SUBSTITUTION` and `DIFFERENT_SUBJECT_SUPERVISION` consume at most one next obligation. `CALENDAR_INTERRUPTION`, `CALENDAR_EXCEPTION`, `SPECIAL_ACTIVITY_SUPPRESSED` and `AUTHORIZED_CANCELLATION` consume none. Distribution does not establish completion or debt closure.

### D5 — Special Activity

An active matching Special Activity suppresses the normal opportunity, consumes no PPCT item, does not advance allocation, creates no debt itself and has no subject PPCT allocation. The next later valid opportunity receives the same pending obligation. The activity remains an independent structural occurrence.

### D6 — Pending-set cursor semantics

There is no canonical integer cursor. Logical state is the classification of obligations consumed by prior eligible normal opportunities. In one exact version, the next item is the lowest-sequence exact pending `PpctItemRevision`. Sequence orders but does not identify. One opportunity consumes at most one item; one stream obligation is consumed at most once.

### D7 — Exact date-effective association

Every normal opportunity uses its exact date-effective `PpctClassAssociation → PpctVersion → PpctPlan`. A retained `SUPERSEDED` version is valid when referenced by the exact association. Current published head, latest version, current association and title/sequence matching cannot reinterpret history. Switching acts prospectively by civil date.

### D8 — Stable UUID carry-forward

The same `PpctItem` UUID in a later exact version is the same logical obligation. If already consumed, its later revision is skipped; otherwise it remains pending at its new version-local sequence. Sequence/title/lesson-type changes do not create a new obligation. Historical completion/debt stays pinned to original evidence.

### D9 — New and removed items

A new UUID without applicable predecessor lineage is a new pending obligation; similarity cannot create carry-forward. An item omitted by a later version remains historical but is no longer a future target. Prior distribution/completion/debt remains pinned; an undistributed removed item simply ceases to be required by the successor.

### D10 — Lineage topology

Explicit lineage and implicit same-UUID carry-forward are separate. Complete connected transition shapes are classified; malformed or allocation-ambiguous lineage blocks. `1→N` is split, `N→1` is merge, `1→1` new UUID is explicit replacement, and `N→M` with both sides greater than one is unsupported ambiguity. No last-edge-wins, sequence/title heuristic or arbitrary traversal is permitted.

### D11 — Split

For `1→N`, `N≥2`: if the predecessor was not consumed, all children are pending by target sequence. If it was consumed, block with `PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION`; one historical credit cannot be assigned deterministically among children.

### D12 — Merge

For `N→1`, `N≥2`: zero predecessors consumed means successor pending; all consumed means successor already distributed; partial consumption blocks with `PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION`. Historical predecessor evidence is never collapsed or rewritten.

### D13 — Explicit one-to-one new UUID

An explicit `1→1` lineage to a new UUID creates a new pending obligation and inherits no distribution credit. Semantic identity must use same-UUID `CARRY_FORWARD`. Historical predecessor evidence remains unchanged.

### D14 — Many-to-many

A transition component with multiple predecessors and multiple successors is allocation-ambiguous and blocks with `PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS`. Matching or credit arithmetic is prohibited.

### D15 — Exhaustion and blocked continuation

A consuming occurrence with no pending item emits `PPCT_ALLOCATION_EXHAUSTED` and blocks. No reuse, wrap, future-version borrowing or invented content is allowed. Once allocation-critical history is unknown, later consuming occurrences receive no guessed items; earlier deterministic allocations may remain diagnostic.

### D16 — Distribution-obligation identity

Each consuming normal occurrence defines one exact identity from `AcademicYear + SchoolClass + Subject + normalOccurrenceKey + PpctClassAssociation + PpctVersion + PpctItem`. The result also retains exact `PpctItemRevision`, sequence, title and lesson type. A deterministic text key is allowed; a random materialized UUID is not required. Any future stored UUID must preserve a unique reconstructible provenance tuple.

### D17 — Make-up source match

`MAKEUP_TEACHING` consumes no new item. Its original normal occurrence plus exact association/version/item must match exactly one historical distribution-obligation identity. `MAKEUP_SOURCE_ALLOCATION_MATCH` may be assessed; completion, open debt, closure and fulfillment are not. A mismatch blocks with `PPCT_MAKEUP_SOURCE_ALLOCATION_MISMATCH`.

### D18 — Current-authoritative recomputation

Allocation replays current authoritative retained facts. Accepted overlay corrections may change later recomputation before official downstream history is frozen. Future TeachingExecution pins the exact allocation provenance accepted at creation; later disagreement requires reconciliation/correction and never silently mutates that execution.

## 3. Consistency, result and blocker contract

One complete bounded replay uses one Prisma interactive `RepeatableRead` transaction for structural occurrences, associations, versions, revisions and lineage. Implementation must reuse/refactor ADR-036 structural resolution semantics and must not open independent transactions per date.

The result status is `PASS` or `BLOCKED`. Coverage is `ppctItemAllocation = ASSESSED`, while TeachingExecution, completion, debt and reporting remain `NOT_ASSESSED`. Consuming occurrences expose exact allocation; non-consuming occurrences expose the reason and no item.

At minimum, distinguish:

- `PPCT_ALLOCATION_EXHAUSTED`;
- `PPCT_ALLOCATION_OCCURRENCE_ORDER_AMBIGUOUS`;
- `PPCT_ALLOCATION_HISTORY_BLOCKED`;
- `PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION`;
- `PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION`;
- `PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS`;
- `PPCT_MAKEUP_SOURCE_ALLOCATION_MISMATCH`.

Existing Structural V1 blockers may propagate.

## 4. Preserved boundaries

`RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1` remains unchanged and continues to report `PPCT_ITEM_ALLOCATION = NOT_ASSESSED`. Allocation is a separate downstream profile.

The minimum core is internal only: no controller, route or capability. No authority is inferred from management capabilities, `SYSTEM_ADMIN`, roles, titles or TeachingAssignment. A future association-switch preflight may reuse the transition validator through a safe module boundary, but 05E2 does not modify 05A2 or create circular module coupling.

No TeachingExecution, Báo giảng, progress, completion, debt, late state, reporting, approval, public make-up mutation, PPCT import, UI, Room/Location, notification, deployment or production migration is authorized.

## 5. Implementation entry boundary

LOCAL-FC-05E2B is architecture-ready only for a separately authorized, deterministic internal allocation read model that preserves D1–D18. The next chain is:

```text
05E2B deterministic allocation read model
→ TeachingExecution / Báo giảng
→ Progress / Debt / Late
→ Reporting
→ Submission / Approval
→ Cross-domain closure
→ CORE BACKEND FREEZE
→ UI business completion
```

Architecture closure does not mean LOCAL-FC-05E2 is CLOSED / GREEN; that status requires PR merge and post-merge CI.
