# LOCAL-FC-05E0D — Resolved Lesson Occurrence Decision Closure

## 1. Status and authority

**Status:** Accepted architecture decision closure; documentation only.

This closure is the product-owner architecture authority for minimum-core LOCAL-FC-05E. It preserves the evidence in `LOCAL-FC-05E0-RESOLVED-LESSON-OCCURRENCE-ARCHITECTURE-AUDIT.md` and closes D1–D19 exactly as recorded below. ADR-036 is the concise accepted decision record.

**Baseline:** `331caf162dded4ae148542b5649a9e913107f85d`.

This closure authorizes no application code, schema, migration, API, capability, execution/progress/report mutation, deployment or production operation. LOCAL-FC-05E1 requires a separate implementation task.

## 2. Accepted decisions

### D1 — Nature and persistence

`RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1` is a **derived read model** recomputed from retained authoritative sources.

05E1 must not add a `ResolvedLessonOccurrence` Prisma model, `resolved_lesson_occurrences` table, migration, cache, certification, persisted read snapshot, materialized occurrence UUID, or mutation/audit event for evaluation. This closes the former materialization question for Structural V1 only.

### D2 — Read consistency

One structural response uses one Prisma interactive transaction at `RepeatableRead`. Every source read for that response occurs inside the same snapshot. Externally visible collections are deterministically sorted.

`evaluatedAt` may vary; business semantics for an unchanged source snapshot are deterministic. `Serializable` is not required because evaluation is read-only.

### D3 — Current-authoritative historical meaning

The read model reconstructs a business civil date from retained date-effective historical source identities and the current authoritative lifecycle state of reversible operational rows. It is not a transaction-time/as-of-system-time historical database.

A later accepted correction may change a later recomputation. Future submitted/approved report snapshots will freeze official historical statements; Structural V1 claims no stronger historical guarantee.

### D4 — Three structural occurrence families

The response represents three independent families:

1. `NORMAL_TIMETABLE_OPPORTUNITY`;
2. `MAKEUP_TEACHING`;
3. `SPECIAL_ACTIVITY`.

They are not forced into one persistence aggregate. One response may expose normal suppression evidence and an independent Special Activity in the same civil-date/time context.

### D5 — Deterministic derived identity

Structural occurrences use no generated UUID. Their canonical source-derived keys are:

```text
NORMAL:<timetableEntryId>:<civilDate>
MAKEUP:<makeupTeachingScheduleId>
SPECIAL_ACTIVITY:<specialActivityId>
```

A disposition attaches operational resolution to the same exact normal opportunity and never replaces its identity. Keys are machine identifiers, not user-visible business labels.

### D6 — Normal timetable candidate

For every exact date-effective base `TimetableEntry` candidate in resolver scope, retain exact `AcademicYear`, retained `AcademicCalendarVersion`, `TimetableVersion`, `TimetableEntry`, civil date, `TimeSlotDefinition`, `SchoolClass`, `Subject`, `TeachingAssignment` and `responsibleTeacherUserId` provenance.

A suppressed candidate remains visible with its resolution/suppression state; it is not silently deleted. A structural candidate does not assert that teaching execution occurred.

### D7 — Normal-teaching resolution precedence

The effective state order for **normal teaching only** is:

1. `CalendarInterruption`;
2. `CalendarException`;
3. active `SpecialActivity` suppression;
4. exact active `OperationalLessonDisposition`;
5. `BASE_TIMETABLE`.

Applicable lower-level evidence may remain in structured provenance/findings, but the effective normal state follows this order. Special Activity is an independent occurrence family and is never deleted by one global precedence chain.

### D8 — CalendarInterruption and CalendarException

An applicable interruption or CalendarException suppresses normal teaching. It does not prohibit or suppress an explicit Special Activity. Multiple compatible suppression facts may be surfaced deterministically.

Structural V1 infers no PPCT distribution or completion from interruption/exception.

### D9 — Special Activity interaction

An active `SpecialActivity` suppresses matching normal opportunities for its frozen target classes and selected exact retained half-open slot intervals.

The root remains one activity occurrence with exact id, academic year/calendar, civil date, title/note, frozen class-target IDs, exact slot IDs/intervals and scheduled staffing provenance. It is never fanned out into class × slot occurrences. Special Activity has no PPCT item foreign key or state in this profile.

### D10 — Disposition interaction

When normal teaching is not already suppressed by interruption, CalendarException or Special Activity, apply the exact active `OperationalLessonDisposition`. Expose its id/type, original responsible teacher, assigned teacher when present, and frozen substitution/supervision provenance already persisted. Do not mutate or reinterpret `TimetableEntry` or `TeachingAssignment`.

Valid canonical state cannot contain an active Special Activity and an exact mutually exclusive active disposition for the same suppressed normal opportunity. Observed corrupt or ambiguous state fails closed with a structured `BLOCKER`; the resolver never silently chooses one.

### D11 — PPCT structural binding

For every normal class-subject candidate, resolve the exact date-effective:

`PpctClassAssociation → PpctVersion → PpctPlan`

under accepted PPCT historical-binding rules. Missing association, ambiguous association, or an invalid/DRAFT target not permitted by those rules is a `BLOCKER`. A legitimate retained association to an exact `SUPERSEDED` version remains valid. 05E1 exposes exact association/version/plan provenance.

### D12 — PPCT item allocation is NOT_ASSESSED

Structural V1 must not claim an expected normal `PpctItem`. Profile coverage exposes `PPCT_ITEM_ALLOCATION = NOT_ASSESSED` or an equivalently strong typed boundary.

It must not select “next sequence” heuristically, count timetable rows as sequence, infer completed/distributed state, reinterpret the current `PUBLISHED` head, or traverse split/merge lineage as an allocation rule without a later accepted decision. This is deliberate bounded honesty and does not make an otherwise valid structural result `BLOCKED`.

### D13 — Make-up occurrence

Every active `MakeupTeachingSchedule` is a separate structural occurrence with identity `MAKEUP:<makeupTeachingScheduleId>`.

Expose the exact retained target date/calendar/slot/class/subject and scheduled teacher; original timetable/date/calendar/slot/class/subject/assignment/responsible teacher; original exact PPCT association/version/item obligation; and source-disposition provenance where present.

A make-up occurrence consumes no new sequential `PpctItem`; it addresses its already-retained exact original obligation. 05E neither creates nor reverses make-up schedules. Public make-up mutation remains deferred under ADR-031/ADR-033.

### D14 — Special Activity versus make-up and corrupt occupancy

Current mutation control planes fail closed on activity/make-up resource collision. If structural resolution nevertheless observes impossible overlapping active state that violates accepted cross-domain invariants, it returns a structured `BLOCKER` and does not silently override either source.

### D15 — Structural result status

The resolver distinguishes `PASS` and `BLOCKED` and emits deterministic structured findings/provenance for blockers. Intentional profile exclusion of PPCT item allocation remains `NOT_ASSESSED` and does not itself become `BLOCKED`.

### D16 — Authorization and HTTP boundary

05E1 is **internal service/read model only**. It adds no public HTTP endpoint and no capability.

Permission must not be inferred from `TIMETABLE_MANAGE`, `PPCT_MANAGE`, `TEACHING_OPERATION_MANAGE`, `SPECIAL_ACTIVITY_MANAGE`, `SYSTEM_ADMIN`, role/title or assignment. A future public occurrence-read boundary requires its own accepted authorization decision. The internal service is reserved for later trusted backend consumers.

### D17 — No execution, progress or report mutation

05E1 must not create or mutate `TeachingExecution`, Báo giảng, distributed/completed PPCT state, Progress, Debt, Late state, workload totals, report rows, or submission/approval snapshots. It is read-only structural resolution.

### D18 — Future TeachingExecution boundary

Future `TeachingExecution` must not assume a foreign key to a materialized `ResolvedLessonOccurrence` table. It must retain sufficient exact upstream provenance and/or the deterministic source-derived occurrence identity.

The exact TeachingExecution persistence shape remains downstream and is neither implemented nor fully decided by 05E0.

### D19 — Deferred PPCT allocation closure

Before TeachingExecution may claim an expected normal PPCT item, a separate accepted architecture slice must close at least:

1. class-subject distribution cursor semantics;
2. PPCT version-switch carry-forward semantics;
3. stable `PpctItem` UUID behavior across versions;
4. split lineage after predecessor distribution;
5. merge lineage with zero, partial or all predecessor distribution;
6. whether/how a SpecialActivity-suppressed normal opportunity distributes an expected PPCT obligation;
7. exact debt-obligation identity required for future make-up runtime.

These rules must not be inferred in 05E0 or 05E1. The planned architecture prerequisite is **LOCAL-FC-05E2 — PPCT Occurrence Allocation Architecture**.

## 3. Accepted Structural V1 profile

`RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1` covers:

- exact normal candidates and their effective structural resolution/suppression state;
- independent active make-up and Special Activity occurrences;
- exact retained provenance for every family;
- exact date-effective PPCT association/version/plan binding for normal candidates;
- deterministic `PASS`/`BLOCKED` status and structured findings;
- explicit `PPCT_ITEM_ALLOCATION = NOT_ASSESSED` coverage.

It does not assert execution, allocation, completion, debt, progress, workload or report meaning.

## 4. Implementation entry boundary

LOCAL-FC-05E1 is architecture-ready only for an internal, derived-only structural read model with no schema and no public HTTP/authorization contract. It must preserve D1–D19 without adding downstream semantics.

PPCT item allocation remains deferred to LOCAL-FC-05E2. TeachingExecution/Báo giảng remains downstream of that accepted allocation closure.

RESOLVED LESSON OCCURRENCE STRUCTURAL ARCHITECTURE CLOSED — READY FOR 05E1 STRUCTURAL READ MODEL
