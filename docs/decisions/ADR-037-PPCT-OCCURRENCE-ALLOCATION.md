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

`PPCT_OCCURRENCE_ALLOCATION_V1` is a schema-free deterministic read projection for exactly one `AcademicYear + SchoolClass + Subject` stream through an exact civil date. The server replays authoritative normal opportunities; it accepts no client cursor, last sequence or current progress counter. It adds no model, migration, cache, snapshot, materialized cursor, mutation or evaluation audit. Future materialization is allowed only when exact replay and reconciliation remain possible.

Structural V1 is unchanged and continues to expose `PPCT_ITEM_ALLOCATION = NOT_ASSESSED`; allocation is a separate downstream profile.

### Snapshot, order and consumption

One complete bounded replay uses one Prisma interactive `RepeatableRead` transaction for structural resolution, PPCT associations, versions, item revisions and lineage. The implementation reuses/refactors ADR-036 semantics instead of duplicating precedence or opening per-date transactions.

Normal opportunities order by civil date, retained real slot start, retained real slot end, then `NORMAL:<timetableEntryId>:<civilDate>`, ascending. Half-open adjacency is valid. Impossible same-stream overlap blocks; creation time, database order and UUID accident never resolve it.

The following consume at most one next item: base timetable, absence without replacement, same-subject substitution and different-subject supervision. Calendar interruption, CalendarException, SpecialActivity suppression and authorized cancellation consume none. Consumption is distribution only; TeachingExecution, completion and debt remain downstream.

An active matching Special Activity suppresses the normal opportunity, advances no allocation, consumes no item, creates no debt itself and carries no subject PPCT allocation. The next later valid opportunity receives the same pending obligation; the activity remains independently visible.

### Exact-version pending obligations

There is no canonical integer cursor. Logical state is the deterministic set/classification of obligations consumed by prior eligible opportunities. Each opportunity selects its date-effective `PpctClassAssociation → exact PpctVersion → PpctPlan`; a retained `SUPERSEDED` binding is valid. Current head/version/association and title/sequence matching cannot reinterpret history.

Within the exact version, the next item is the lowest-sequence pending `PpctItemRevision`. Sequence is order, not identity. One opportunity consumes at most one item and one logical stream obligation is consumed at most once.

Same stable `PpctItem` UUID means the same obligation across versions: prior consumption skips the later revision; otherwise it remains pending at its new sequence. A new UUID without applicable predecessor lineage is pending. A removed item remains historical but is absent from the successor's future target. Historical distribution, completion and debt evidence remains pinned to the original exact provenance.

### Lineage transitions

Implicit same-UUID carry-forward has no lineage edge. Explicit connected transition topology is classified as a whole; malformed or ambiguous lineage blocks, with no last-edge-wins, sequence/title heuristic or arbitrary traversal.

- `1→N` split, predecessor not consumed: all children pending.
- `1→N` split, predecessor consumed: blocked; one credit cannot be assigned among children.
- `N→1` merge, none consumed: successor pending.
- `N→1` merge, all consumed: successor already distributed.
- `N→1` merge, partially consumed: blocked.
- explicit `1→1` new UUID: successor is new and pending; credit is not inherited.
- `N→M` where both sides exceed one: blocked as allocation-ambiguous.

Semantic one-to-one identity must use same-UUID `CARRY_FORWARD`.

### Exhaustion, provenance and make-up

A consuming opportunity with no pending target item emits `PPCT_ALLOCATION_EXHAUSTED` and blocks. It never reuses, wraps, borrows or invents content. After allocation-critical history becomes unknown, later consuming opportunities receive no guessed items; earlier deterministic results may remain diagnostic.

Each consuming normal occurrence defines one distribution-obligation identity from `AcademicYear + SchoolClass + Subject + normalOccurrenceKey + PpctClassAssociation + PpctVersion + PpctItem` and retains exact `PpctItemRevision`, sequence, title and lesson type. A deterministic text key is sufficient; no random materialized UUID is required.

Make-up consumes no new item. Its original normal occurrence and exact association/version/item must match exactly one historical deterministic distribution obligation. The allocation profile may assess that source match, but not completion, debt or fulfillment. Mismatch is structural allocation corruption and blocks.

### Current-authoritative replay and failure contract

Replay uses current authoritative retained facts. Accepted overlay corrections may change later recomputation before official history is frozen. Future TeachingExecution pins the exact allocation provenance it accepted; later disagreement requires explicit reconciliation/correction and never silently changes that execution.

Result status is `PASS` or `BLOCKED`; `ppctItemAllocation` is `ASSESSED`, while TeachingExecution, completion, debt and reporting are `NOT_ASSESSED`. Required distinct blocker semantics cover exhaustion, occurrence-order ambiguity, blocked history, split after distribution, partial merge, ambiguous lineage and make-up source mismatch. Existing structural blockers may propagate.

### Internal and non-scope boundary

The minimum core is internal: no public controller/route and no new capability. No permission is inferred from any management capability, `SYSTEM_ADMIN`, role/title or TeachingAssignment. A future association-switch preflight may reuse the transition validator through a safe dependency boundary, but this decision does not modify 05A2.

TeachingExecution/Báo giảng persistence, progress/completion/debt/late, reporting/snapshots/approval, make-up public mutation, PPCT import, UI, Room/Location, notifications, deployment and production mutation remain excluded. LOCAL-FC-05E2B requires separate authorization.

## Consequences

The repository now has an accepted deterministic bridge from structural opportunities to exact expected PPCT obligations without introducing mutable progress truth. Version changes and lineage are explicit, ambiguous credit is blocked, and future TeachingExecution receives a precise provenance obligation without being prematurely designed.

PPCT OCCURRENCE ALLOCATION ARCHITECTURE CLOSED — READY FOR 05E2B DETERMINISTIC ALLOCATION READ MODEL
