# ADR-038 — Teaching Execution Evidence

- **Status:** Accepted architecture on the documentation branch; awaiting independent GitHub review
- **Date:** 2026-08-16
- **Scope:** LOCAL-FC-05F0 Teaching Execution architecture closure; no implementation authorization
- **Audit:** `docs/requirements/LOCAL-FC-05F0-TEACHING-EXECUTION-ARCHITECTURE-AUDIT.md`
- **Decision closure:** `docs/requirements/LOCAL-FC-05F0D-TEACHING-EXECUTION-DECISION-CLOSURE.md`

## Context

ADR-027 separates planning, operational reality, execution evidence, derived progress/debt and immutable official statements. ADR-031 retains operational dispositions and exact make-up schedule provenance. ADR-034 retains an atomic Special Activity root with exact slots, frozen class targets and staffing. ADR-036 provides a recomputed structural read model, and ADR-037 plus the implemented 05E2B `PPCT_OCCURRENCE_ALLOCATION_V1` provide exact direct distribution obligations without assessing execution, completion, debt or reporting.

The repository has no TeachingExecution persistence or runtime. This ADR closes the evidence boundary required before 05F1 and 05F2 without changing the 05E2B coverage profile.

## Decision

### Evidence boundary and persistence families

Teaching execution is authoritative evidence that teaching or participation actually occurred. It is not planning, operational disposition, a mutable Báo giảng line, progress/debt state or an official statement. Future Báo giảng/report detail is projected from planning, operational facts, allocation and execution. Submission/approval later freezes its own immutable snapshot/manifest.

Persistence must use two families:

1. `CurricularTeachingExecution` for exact fulfillment of one direct PPCT distribution obligation by eligible normal or make-up teaching;
2. `SpecialActivityParticipationExecution` for one scheduled teacher's participation in one exact selected activity slot.

Curricular execution has only `NORMAL | MAKEUP`. It remains one family because both kinds share one obligation and exactly-once fulfillment topology. Activity participation is separate because it has no PPCT, distribution, completion, debt or class-subject progress meaning. A nullable God aggregate is rejected.

### Curricular source and content

Every curricular execution pins exact `AcademicYear`, `SchoolClass`, `Subject`, `sourceNormalOccurrenceKey`, `PpctClassAssociation`, `PpctPlan`, `PpctVersion`, `PpctItem` and exact `PpctItemRevision`. It also pins exact timetable version/entry, source civil date, calendar version, slot, TeachingAssignment and responsible teacher. The deterministic `distributionObligationKey` may be retained for convenience, indexing and diagnostics but cannot replace the authoritative relational tuple.

For NORMAL, execution is eligible only when allocation is `ALLOCATED` and operational meaning is BASE_TIMETABLE or SAME_SUBJECT_SUBSTITUTION. Base actual teacher is the responsible teacher; substitution actual teacher is the exact active disposition assigned teacher. The client never chooses an actual teacher, and substitution never transfers TeachingAssignment ownership.

No execution is allowed for interruption, exception, Special Activity suppression, authorized cancellation, absence without replacement, different-subject supervision, `BLOCKED`, `NOT_CONSUMED`, exhaustion or ambiguous/blocked history.

V1 actual curricular content is exactly the allocated item/revision. MAKEUP content is exactly the retained original obligation item/revision. A bounded note may provide context but changes no PPCT identity, distribution, completion, debt or progress. Alternate items, free-text replacement lessons, sequence overrides and manual completion are prohibited pending explicit architecture re-entry.

### Make-up and exactly-once fulfillment

MAKEUP requires an exact ACTIVE `MakeupTeachingSchedule`, exact class/subject/year and target date/slot, and allocation source state `MATCH`. `MISMATCH` and `NOT_ASSESSED_HISTORY_BLOCKED` fail closed. Actual teacher is the exact scheduled teacher. It fulfills the original direct obligation, consumes no new item and never chooses a current next PPCT item.

Across NORMAL and MAKEUP, one exact direct distribution obligation has zero or one ACTIVE curricular fulfillment. Reversed evidence remains immutable history but no longer owns current-authoritative completion credit; a separately validated linked replacement may become ACTIVE. No mutable completion flag is written to PPCT or overlay rows.

Persistence of `MakeupTeachingSchedule` does not authorize public schedule creation. That runtime remains deferred until authoritative incomplete-obligation/debt proof is closed.

### Special Activity participation

The participation unit is exact `SpecialActivity + SpecialActivityStaffing + SpecialActivityTimeSlot`. Confirmation requires an ACTIVE root, two exact children belonging to it, the staffing scheduled teacher, retained calendar/date/slot provenance, and no structural corruption/collision blocker that makes the occurrence untrustworthy. Actual teacher equals the scheduled teacher in the minimum core; arbitrary substitution is rejected.

Class-target cardinality never multiplies teacher workload. For two teachers and three slots, the maximum planned confirmation count is six regardless of the number of frozen target classes. Database uniqueness must allow at most one ACTIVE participation for each activity/staffing/activity-slot.

### Time, calendar and historical display

Execution cannot be confirmed before the retained exact slot end. The server combines the civil date with retained wall-clock slot end in `Asia/Ho_Chi_Minh` and requires the resulting instant to be at or before its current instant. Retrospective confirmation is allowed while exact retained provenance remains valid. Civil DATE values are never treated as host-local midnight.

Curricular confirmation resolves exactly one retained `AcademicCalendarVersion`, `AcademicWeekSegment` and `AcademicWeek` containing the execution date; missing or ambiguous mapping fails closed. Activity always retains calendar/date/slot, while week/segment may be null for a valid explicit activity outside an academic-week segment. ISO week derivation is forbidden.

Curricular evidence retains bounded class code/name, subject code/name and responsible/actual teacher display-name snapshots. Activity participation retains bounded activity title and scheduled/actual teacher name. Exact IDs remain authoritative; immutable PPCT revision supplies sequence/title/lesson type. Other upstream objects are not copied wholesale.

### Lifecycle, correction and source drift

Both families use immutable `ACTIVE -> REVERSED`. Creation is ACTIVE; there is no DRAFT, SUBMITTED, APPROVED, COMPLETED, LOCKED, DELETED or physical delete. Correction CAS-reverses active evidence, records actor/instant/bounded reason, retains predecessor/replacement linkage, and optionally creates a separately validated replacement. Semantic fields never change in place.

Creation validates current-authoritative retained sources. Later accepted changes to dispositions, make-up schedules, activities, PPCT binding/replay or other upstream facts never silently mutate or rebind accepted execution. A later disagreement is downstream source drift/reconciliation, not a mutable `SOURCE_DRIFTED` execution status.

Time passing or missing execution does not itself prove absence, cancellation, supervision, debt or late. Negative facts come from operational sources; future progress/debt policy derives consequences from allocation, operational meaning, active execution and time.

### Authorization

Future authorization introduces:

- `TEACHING_EXECUTION_RECORD`, allowed only at `PERSONAL`;
- `TEACHING_EXECUTION_MANAGE`, allowed at `SUBJECT` and `SCHOOL_WIDE`.

PERSONAL requires the actor to equal the server-derived actual teacher; for activity participation this is the exact scheduled staffing teacher. SUBJECT management applies only to curricular evidence for the exact persisted subject. SCHOOL_WIDE may manage all curricular and activity participation evidence. Activity has no SUBJECT semantics.

Actor and actual-teacher identity remain separate for manager commands. No authority is inferred from `TEACHER_BASE`, `SYSTEM_ADMIN`, `TIMETABLE_MANAGE`, `PPCT_MANAGE`, `TEACHING_OPERATION_MANAGE`, `SPECIAL_ACTIVITY_MANAGE`, role/title, TeachingAssignment, StaffSubject, SubjectGroupMembership, AdditionalDuty or frontend visibility. This ADR does not implement or seed capabilities.

### Reliability and one transaction snapshot

Every mutation uses request identity plus deterministic semantic fingerprint. Same key/same fingerprint replays; same key/different fingerprint conflicts. Reversal uses CAS. Create/reverse/replace, fulfillment uniqueness and activity participation uniqueness use `SERIALIZABLE` unless a later implementation proves an equally safe narrower mechanism. Database constraints backstop active uniqueness, request identity and correction linkage. Business writes and sanitized success `AuditEvent` evidence share the transaction; failed commands emit no success audit.

05F2 must add a tx-aware allocation boundary equivalent to `PpctOccurrenceAllocationService.resolveInTransaction(tx, input)`. Existing `resolve(input)` remains and opens its own read-only `RepeatableRead`. Execution confirmation opens one outer `SERIALIZABLE` transaction and reuses allocation, structural resolution, calendar/week resolution and source validation through the same transaction client. It must not call `resolve()` inside that command or permit a TOCTOU gap before insert.

## Consequences

05F1 may implement the two persistence families, exact provenance, bounded snapshots, immutable lifecycle, request/correction identity and database uniqueness. 05F2 remains a separate control-plane/runtime slice and must implement server-derived teacher/content, eligibility/time/week gates, exact authorization and one-transaction confirmation.

Future Progress derives distribution from allocation/operations, completion from valid ACTIVE curricular execution and debt from distributed-but-unfulfilled obligations under separately accepted policy. Activity participation never contributes to curricular completion/debt. Reporting projection and immutable statement workflow remain later slices; reversing execution never silently rewrites a submitted statement.

## Alternatives rejected

- One polymorphic execution table with nullable curricular/make-up/activity fields.
- A report row, PPCT flag, overlay flag, debt counter or elapsed time as execution truth.
- Arbitrary actual teacher or alternate PPCT content from the client.
- Absence, supervision, cancellation, activity, move or swap as curricular execution kinds.
- Class fan-out participation rows or teacher workload multiplied by class targets.
- In-place execution edit/delete or mutable source-drift status.
- Nested allocation transaction or validation/insert TOCTOU window.

## Explicit non-scope

This ADR authorizes no schema, migration, application source, API, contract, capability seed/catalog, UI, workflow, deployment or production mutation. Progress/debt/late, workload/report totals, reporting projection, submission/approval snapshots, PPCT import, move/swap, arbitrary content divergence, attendance/roster, Room/Location, notifications and AI remain outside scope.

TEACHING EXECUTION ARCHITECTURE CLOSED — READY FOR 05F1 PERSISTENCE FOUNDATION
