# LOCAL-FC-05E0 — Resolved Lesson Occurrence Architecture Audit

## 1. Status and scope

**Status:** Architecture evidence consolidation for the accepted LOCAL-FC-05E0D closure. Documentation only.

This audit records the canonical evidence available at baseline `331caf162dded4ae148542b5649a9e913107f85d`. It does not reopen or redesign accepted PPCT, timetable-readiness, operational-overlay or Special Activity decisions. It authorizes no application code, schema, migration, API, capability, execution/progress/report state, deployment or production operation.

Classifications used here are:

- **CANONICAL:** fixed by an Accepted ADR, accepted decision closure or retained implementation.
- **EVIDENCE GAP:** a fact required for a later decision is not represented by the current canonical sources. This is architecture evidence, not an implementation defect in a completed upstream slice.

The accepted minimum-core decisions derived from this evidence are recorded in `LOCAL-FC-05E0D-RESOLVED-LESSON-OCCURRENCE-DECISION-CLOSURE.md` and ADR-036.

## 2. Canonical baseline and completed upstream slices

At the entering baseline, the dependency chain through Special Activity is canonical:

| Slice | Canonical evidence available to 05E |
|---|---|
| PPCT | ADR-027 through ADR-029: shared `AcademicYear + Subject + Grade` plan, immutable version/item history, explicit split/merge lineage, and date-effective exact-version `PpctClassAssociation`. |
| Timetable readiness | ADR-030: bounded deterministic derived read model, exact retained timetable/calendar/PPCT provenance, deterministic ordering and one `RepeatableRead` snapshot. |
| Operational overlays | ADR-031 and ADR-033: retained `CalendarException`, exact `OperationalLessonDisposition`, persisted `MakeupTeachingSchedule`, immutable lifecycle/provenance and fail-closed collision semantics. |
| Special Activity | ADR-034 and ADR-035 plus completed 05D2 runtime: one atomic `SpecialActivity`, frozen exact slot/class/staffing children, `ACTIVE → REVERSED`, and exact half-open interval collision semantics. |

05D2 is closed/green through merged PR #50 and CI #203 PASS. These completed slices retain their own aggregate ownership and are upstream sources; 05E does not merge them into a new persistence aggregate.

## 3. Current implementation inventory

Repository inspection of the canonical Prisma schema and the current timetable, PPCT, operational-overlay and Special Activity runtime confirms:

- no `ResolvedLessonOccurrence` Prisma model exists;
- no `resolved_lesson_occurrences` table or migration exists;
- no resolved-occurrence module, service, controller or contract exists;
- no class-subject `Progress` or `Distribution` ledger exists.

The absence of resolved-occurrence persistence is consistent with ADR-027, which treated the occurrence as a reconstructable read result and deliberately left final precedence/materialization to a downstream slice. The absence of a progress/distribution ledger is an explicit input boundary for 05E, not a defect in the accepted upstream implementations.

## 4. Accepted derived-read-model precedent

ADR-030 and its implementation establish the applicable read-model pattern:

1. reconstruct deterministically from retained authoritative sources;
2. read every source for one response inside one Prisma interactive transaction at `RepeatableRead`;
3. sort externally visible collections deterministically;
4. recompute for each request;
5. allow `evaluatedAt` to vary while keeping business semantics deterministic for an unchanged source snapshot;
6. create no persistence, cache, certification, retained snapshot, mutation or audit event for evaluation.

This precedent supports a structural resolved-occurrence read model without turning that read result into a new source of truth.

## 5. Exact upstream provenance available now

### 5.1 Normal timetable source

The retained normal source can provide the exact date-effective:

- `AcademicYear`;
- `AcademicCalendarVersion` and its `CalendarInterruption` evidence;
- `TimetableVersion` and `TimetableEntry`;
- civil date;
- `TimeSlotDefinition`, including the retained real half-open interval;
- `SchoolClass` and `Subject`;
- `TeachingAssignment`;
- responsible teacher identity retained by the entry/assignment provenance.

ADR-020 supplies inclusive civil-date timetable historical resolution. Current readiness and overlay services already resolve retained calendar/timetable evidence without substituting a current head for historical identity.

### 5.2 PPCT binding source

For an exact `AcademicYear + SchoolClass + Subject + civil date`, the current PPCT reader can return the date-effective:

`PpctClassAssociation → PpctVersion → PpctPlan`.

It preserves exact association/version identity, rejects missing or ambiguous binding, rejects invalid target lifecycle state, and permits a legitimate historical association to a retained `SUPERSEDED` version. `PpctItem` and lineage persistence exist, but the current sources do not establish which item is expected for a normal occurrence.

### 5.3 Operational-overlay source

The retained operational source can provide:

- applicable `CalendarException` with exact scope and time selector;
- exact `OperationalLessonDisposition`, its type, original responsible teacher, optional assigned teacher and frozen eligibility/substitution/supervision provenance;
- persisted `MakeupTeachingSchedule` with exact target date/calendar/slot/class/subject/scheduled teacher and exact original timetable, calendar, slot, assignment, responsible teacher, PPCT association/version/item obligation and source-disposition provenance where present.

The mutation control planes already reject or fail closed on conflicting active facts. Reversal changes current authoritative lifecycle state without deleting retained rows.

### 5.4 Special Activity source

The retained activity source can provide one exact `SpecialActivity` root with:

- id, academic year, retained calendar and civil date;
- title and optional note;
- frozen exact class-target IDs;
- one-or-more retained exact slot IDs and their real half-open intervals;
- scheduled staffing identity and frozen eligibility provenance;
- current authoritative `ACTIVE` or `REVERSED` lifecycle state.

One root remains one activity occurrence even when it owns multiple class targets or slots. Calendar interruption/exception affects normal teaching availability but does not erase an explicit activity occurrence.

## 6. Evidence gap: normal PPCT item allocation

The current repository has no class-subject Progress/Distribution ledger or equivalent authoritative cursor. Therefore a normal candidate's exact expected `PpctItem` cannot be safely reconstructed from current retained sources.

The ambiguity spans all of the following accepted historical facts:

1. which obligations have already been distributed;
2. a class stream switching PPCT versions by civil date;
3. stable carried-forward `PpctItem` UUIDs across versions;
4. split lineage after predecessor distribution;
5. merge lineage with zero, partial or complete predecessor distribution;
6. the distribution meaning of a normal opportunity suppressed by Special Activity.

Sequence order, timetable-row counts and the current `PUBLISHED` head do not answer these questions. Traversing lineage without a distribution rule would also be an invented allocation algorithm.

This is an **EVIDENCE GAP** for a later architecture slice. It is not a defect in PPCT, readiness, overlay or Special Activity implementation, and it must not be hidden behind a heuristic PASS.

## 7. Architecture implications carried into closure

The evidence supports a bounded structural model that can:

- expose normal timetable candidates, including suppressed candidates, with exact source provenance;
- resolve structural normal-teaching state from interruption, exception, active activity suppression, exact active disposition and base timetable;
- expose make-up and Special Activity as independent occurrence families;
- bind normal class-subject candidates to the exact date-effective PPCT association/version/plan;
- distinguish valid structural output from deterministic structured blockers;
- explicitly report PPCT item allocation as `NOT_ASSESSED`.

The evidence does not support claiming teaching occurred, choosing the next normal PPCT item, updating distribution/completion/debt, or freezing an official report statement.

## 8. Historical meaning boundary

The available system is retained business history plus reversible current operational state, not a transaction-time/as-of-system-time database. A structural response for a business civil date uses retained date-effective source identities and the current authoritative lifecycle state of reversible operational rows. A later accepted correction may therefore change a later recomputation for the same civil date.

Future submitted/approved report snapshots, not 05E structural evaluation, will freeze official historical statements.

## 9. Audit conclusion

The upstream sources are sufficient to close and implement a derived structural resolved-occurrence profile, but not sufficient to allocate the expected normal `PpctItem` or establish execution/progress/report semantics.

The minimum-core closure is therefore:

- `RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1` as a derived-only structural read model;
- normal, make-up and Special Activity as three independent occurrence families;
- exact PPCT association/version/plan binding provenance for normal candidates;
- `PPCT_ITEM_ALLOCATION = NOT_ASSESSED`;
- deterministic blockers for corrupt/ambiguous required structure;
- separate LOCAL-FC-05E2 architecture entry before any normal expected-item allocation claim.

Every question closed by LOCAL-FC-05E0D is fixed for 05E1 and is not an implementation choice.
