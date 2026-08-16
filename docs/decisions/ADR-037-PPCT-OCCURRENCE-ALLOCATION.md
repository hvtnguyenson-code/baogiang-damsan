# ADR-037 — PPCT Occurrence Allocation

- **Status:** Accepted
- **Date:** 2026-08-16
- **Scope:** LOCAL-FC-05E2 architecture closure; no implementation authorization
- **Authority:** `docs/requirements/LOCAL-FC-05E2D-PPCT-OCCURRENCE-ALLOCATION-DECISION-CLOSURE.md`

## Context

ADR-036 established `RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1` as a derived internal read model and deliberately left expected normal PPCT item allocation `NOT_ASSESSED`. The retained repository now provides exact structural opportunity provenance, exact PPCT association/version/item revisions and lineage, operational disposition meaning, Special Activity suppression and make-up source provenance, but no canonical numeric distribution cursor or progress ledger.

TeachingExecution cannot safely claim an expected normal item until distribution replay, version changes, stable UUID, split/merge and make-up source matching have deterministic fail-closed semantics.

## Decision

### Derived stream-local profile

`PPCT_OCCURRENCE_ALLOCATION_V1` is a schema-free deterministic read projection for exactly one `AcademicYear + SchoolClass + Subject` stream through an inclusive exact civil date. The server replays authoritative normal opportunities; it accepts no client cursor, last sequence or current progress counter. It adds no model, migration, cache, snapshot, materialized cursor, mutation or evaluation audit. Future materialization is allowed only when exact replay and reconciliation remain possible.

Replay begins at the earliest civil date on which that exact stream has an authoritative retained normal timetable opportunity under retained timetable/calendar history and reconstructs every candidate through `throughCivilDate`, inclusive. It never starts at a first PPCT association, current timetable/calendar, caller window or arbitrary lookback. An earlier candidate with missing/invalid PPCT binding still blocks; a gap with no normal opportunity contributes nothing. No opportunities through the upper bound means empty direct distribution state. This is semantic origin, not prescribed SQL design.

Structural V1 is unchanged and continues to expose `PPCT_ITEM_ALLOCATION = NOT_ASSESSED`; allocation is a separate downstream profile.

### Snapshot, order and consumption

One complete bounded replay uses one Prisma interactive `RepeatableRead` transaction for structural resolution, PPCT associations, versions, item revisions and lineage. The implementation reuses/refactors ADR-036 semantics instead of duplicating precedence or opening per-date transactions.

Normal opportunities order by civil date, retained real slot start, retained real slot end, then `NORMAL:<timetableEntryId>:<civilDate>`, ascending. Half-open adjacency is valid. Impossible same-stream overlap blocks; creation time, database order and UUID accident never resolve it.

The following consume at most one next item: base timetable, absence without replacement, same-subject substitution and different-subject supervision. Calendar interruption, CalendarException, SpecialActivity suppression and authorized cancellation consume none. Consumption is distribution only; TeachingExecution, completion and debt remain downstream.

An active matching Special Activity suppresses the normal opportunity, advances no allocation, consumes no item, creates no debt itself and carries no subject PPCT allocation. The next later valid opportunity receives the same pending obligation; the activity remains independently visible.

### Exact-version pending obligations

There is no canonical integer cursor. Replay maintains `DIRECT_DISTRIBUTION_OBLIGATIONS`, created only when a consuming normal occurrence receives an item and carrying the exact D16 tuple, separately from `DISTRIBUTION_COVERED_ITEMS`, the stable UUIDs treated as already distributed for future allocation. Coverage contains directly distributed items plus a merge successor when all predecessor logical UUIDs are covered. Merge-derived coverage creates no synthetic normal occurrence, direct obligation, TeachingExecution, completion or debt evidence.

Each opportunity selects its date-effective `PpctClassAssociation → exact PpctVersion → PpctPlan`; a retained `SUPERSEDED` binding is valid. Current head/version/association and title/sequence matching cannot reinterpret history.

Within the exact version, the next item is the lowest-sequence pending `PpctItemRevision` whose stable UUID is not distribution-covered. Sequence is order, not identity. One opportunity creates at most one direct obligation and one logical stream obligation is directly distributed at most once.

Same stable `PpctItem` UUID means the same obligation across versions: coverage skips the later revision; otherwise it remains pending at its new sequence. A new UUID without applicable predecessor lineage is pending. A removed item remains historical and absent from that version's target, but removal does not erase coverage. If the same UUID legally reappears after one or more absent versions, prior coverage still skips it; a never-covered UUID reappears pending. Historical direct distribution, completion and debt evidence remains pinned to the original exact provenance.

### Exact version context and retained frontier

The first structurally valid normal candidate starts with empty direct obligations and empty coverage; its exact version becomes initial context. No previous version is invented and replay does not begin at version 1 merely because the first binding targets a later version. Its incoming lineage is still validated using empty predecessor coverage.

A later candidate resolving to the same exact version performs no transition. A change from prior `Vs` to later `Vt` processes every same-plan version satisfying `Vs.versionNumber < versionNumber <= Vt.versionNumber` and `status != DRAFT`, ordered by version number. Each retained frontier version applies stable UUID, new/removal and lineage rules before advancing. DRAFT versions are not authoritative frontier steps. A lower target version number blocks as allocation-history corruption, using `PPCT_ALLOCATION_HISTORY_BLOCKED` with an internal reason such as `NON_FORWARD_VERSION_TRANSITION`.

For each frontier target, all incoming lineage whose successor belongs to that version participates in topology classification. A predecessor may name any earlier retained non-DRAFT same-plan revision; adjacency is not required. DRAFT or otherwise impermissible predecessor history blocks. Thus a class can skip binding or normal occurrences for an intermediate version without bypassing that version's authoritative split/merge semantics.

### Lineage transitions

Implicit same-UUID carry-forward has no lineage edge. Explicit connected transition topology is classified as a whole; malformed or ambiguous lineage blocks, with no last-edge-wins, sequence/title heuristic or arbitrary traversal.

- `1→N` split, predecessor not distribution-covered: all children pending.
- `1→N` split, predecessor distribution-covered: blocked; one credit cannot be assigned among children.
- `N→1` merge, no predecessor covered: successor pending.
- `N→1` merge, all predecessors covered: add successor UUID to `DISTRIBUTION_COVERED_ITEMS`, without a direct obligation.
- `N→1` merge, partially covered: blocked.
- explicit `1→1` new UUID: successor is new and pending; credit is not inherited.
- `N→M` where both sides exceed one: blocked as allocation-ambiguous.

Semantic one-to-one identity must use same-UUID `CARRY_FORWARD`. A merge-all-covered successor stays covered through same-UUID carry-forward, participates as covered in a later merge and triggers split-after-distribution if later split.

### Exhaustion, provenance and make-up

A consuming opportunity with no pending target item emits `PPCT_ALLOCATION_EXHAUSTED` and blocks. It never reuses, wraps, borrows or invents content. After allocation-critical history becomes unknown, later consuming opportunities receive no guessed items; earlier deterministic results may remain diagnostic.

Each consuming normal occurrence that receives an item creates one direct distribution-obligation identity from `AcademicYear + SchoolClass + Subject + normalOccurrenceKey + PpctClassAssociation + PpctVersion + PpctItem` and exposes exact `PpctItemRevision`, sequence, title and lesson type. A deterministic text key is sufficient; no random materialized UUID is required. Derived merge coverage creates no such identity.

Make-up consumes no new item. `MakeupTeachingSchedule` stores exact association/plan/version/item coordinates; its composite FK resolves the unique exact revision without a stored `PpctItemRevisionId`. Its original normal occurrence and PPCT coordinates must match exactly one direct historical distribution obligation. Merge-derived coverage cannot manufacture a make-up source; historical predecessor obligations remain exact debt/make-up provenance. The profile may assess source match, but not completion, debt or fulfillment. Mismatch is structural allocation corruption and blocks.

### Current-authoritative replay and failure contract

Replay uses current authoritative retained facts. Accepted overlay corrections may change later recomputation before official history is frozen. Future TeachingExecution pins the exact allocation provenance it accepted; later disagreement requires explicit reconciliation/correction and never silently changes that execution.

Result status is `PASS` or `BLOCKED`; `ppctItemAllocation` is `ASSESSED`, while TeachingExecution, completion, debt and reporting are `NOT_ASSESSED`. Required distinct blocker semantics cover exhaustion, occurrence-order ambiguity, blocked history, split after distribution, partial merge, ambiguous lineage and make-up source mismatch. Existing structural blockers may propagate.

### Internal and non-scope boundary

The minimum core is internal: no public controller/route and no new capability. No permission is inferred from any management capability, `SYSTEM_ADMIN`, role/title or TeachingAssignment. A future association-switch preflight may reuse the transition validator through a safe dependency boundary, but this decision does not modify 05A2.

TeachingExecution/Báo giảng persistence, progress/completion/debt/late, reporting/snapshots/approval, make-up public mutation, PPCT import, UI, Room/Location, notifications, deployment and production mutation remain excluded. LOCAL-FC-05E2B requires separate authorization.

## Consequences

The repository now has an accepted deterministic bridge from complete retained stream history to exact expected PPCT obligations without introducing mutable progress truth. Direct obligations and composable coverage are distinct; skipped versions cannot hide a blocker; removal cannot erase credit; and merge-derived credit cannot fabricate an occurrence or make-up source. Future TeachingExecution receives precise provenance without being prematurely designed.

PPCT OCCURRENCE ALLOCATION ARCHITECTURE CLOSED — READY FOR 05E2B DETERMINISTIC ALLOCATION READ MODEL
