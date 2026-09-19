# P4-020 — Special-programme persistence + control-plane contract

## Status

**IMPLEMENTATION CONTRACT — P4-020 IN PROGRESS.**

Task branch: `feat/programme-persistence-control-plane-020`  
Canonical starting main: `969d12d4f2f3e8ea3c66768daa3b35b4ccaa2fc0`  
Architecture authority: ADR-050 and P4-010 closure.  
Traceability: T16, T17.

This document locks the physical persistence and command-layer boundaries for P4-020. It does not create coordinator/BGH authorization authority, runtime materialization, attestation persistence, execution semantics, workload projection, UI, deployment, or production mutation.

## 1. Scope boundary

P4-020 owns only:

- retained programme-master identity;
- retained versioned programme content plans;
- retained programme topic items;
- retained prospective occurrence schedules;
- exact planned occurrence slots;
- exact per-slot staffing (`Slot -> Set<Teacher>`);
- planning lifecycle commands, optimistic/CAS conflict detection, bounded SERIALIZABLE retry, idempotency, and same-transaction audit;
- read primitives required by later P4 tasks.

P4-020 explicitly does **not**:

- modify or overload `SpecialActivity`, `SpecialActivityTimeSlot`, `SpecialActivityStaffing`, or participation execution;
- materialize programme occurrences into runtime roots (P4-040);
- persist or reverse programme attestations (P4-040);
- bind coordinator/BGH capability keys, resources, or scopes (P4-030);
- infer authority from role, job title, department, subject-group leadership, or `SYSTEM_ADMIN`;
- project official workload (P4-050);
- deploy, backfill, or mutate production data.

No public mutation HTTP route is introduced by P4-020. The service/command layer remains an authorization-neutral domain seam until P4-030 binds explicit programme capabilities.

## 2. Physical persistence model

### 2.1 `ProgrammeMaster`

Canonical programme authority identity.

- `GDDP`: exactly one master identity per `AcademicYear + Grade`, where grade is 10, 11, or 12.
- `HDTN_HN`: exactly one master identity per `AcademicYear`; grade is null.
- Free-text labels never identify programme kind.
- Business deletion is prohibited; all foreign keys use retained-history-safe `RESTRICT` semantics.

Database partial unique indexes enforce the two different natural identities because nullable grade cannot safely express both with a single ordinary unique constraint.

### 2.2 `ProgrammePlanVersion`

Immutable-publishing lifecycle:

`DRAFT -> PUBLISHED -> SUPERSEDED`

- Draft structure may be edited using a CAS `draftRevision` token.
- Published and superseded versions are immutable in place.
- A successor version carries explicit predecessor/replacement lineage and an audit reason.
- At most one published version is current for one programme master.
- Version numbers are monotonic within a master and unique.
- Publish metadata and supersession metadata are retained.

### 2.3 `ProgrammeTopicItem`

Version-owned syllabus evidence containing:

- intended sequence;
- title/topic text;
- required period allocation;
- optional guideline academic-week range and optional guideline segment label.

Guideline placement is advisory content-planning metadata, not an exact runtime date/slot binding. Items of a published/superseded version are immutable and are never physically deleted through business commands.

### 2.4 `PlannedProgrammeOccurrence`

Prospective operational planning authority, separate from runtime `SpecialActivity`.

Occurrence lifecycle:

`DRAFT -> PUBLISHED -> SUPERSEDED`

This physical lifecycle is selected by P4-020 to satisfy ADR-050's rule that planning remains prospectively mutable before materialization while changes to already-published planning authority must retain lineage rather than overwrite history.

Each occurrence binds exactly one programme master, plan version, and topic item plus:

- exact civil date;
- business mode: `CLASS`, `GRADE`, or `SCHOOL_WIDE`;
- exact target shape;
- optional planning note;
- CAS `draftRevision`;
- create/publish/supersede metadata;
- optional `replacesOccurrenceId` lineage and explicit change reason.

Target invariants:

- `CLASS`: exactly one `SchoolClass`; grade field is null.
- `GRADE`: exactly one grade in 10..12; class field is null.
- `SCHOOL_WIDE`: class and grade are both null.
- `GDDP`: `CLASS` or `GRADE` only; target grade must equal the grade owned by the `ProgrammeMaster`; `SCHOOL_WIDE` is invalid because a GDĐP master is grade-scoped.
- `HDTN_HN`: `CLASS`, `GRADE`, and `SCHOOL_WIDE` are valid.
- Any CLASS target must belong to the same academic year as the programme master. For GDDP it must additionally belong to the master's grade.

Published occurrences are immutable in place. A prospective correction after publish creates a successor occurrence and marks the predecessor `SUPERSEDED` atomically.

### 2.5 `PlannedOccurrenceSlot`

An exact scheduled slot child of one occurrence.

- stores the occurrence academic year explicitly as provenance;
- references an exact `TimeSlotDefinition` from that same academic year;
- one time-slot definition may occur at most once within one occurrence;
- slot rows belonging to a published/superseded occurrence are immutable.

### 2.6 `PlannedSlotStaffing`

Exact staffing child of one planned slot.

- relation shape is `PlannedOccurrenceSlot -> Set<Teacher>`;
- duplicate teacher membership within one slot is prohibited;
- a staffing row belongs to exactly one slot, never to the occurrence root as a Cartesian teacher set;
- teacher identity is retained by FK to `User` with delete restriction;
- staffing of published/superseded occurrences is immutable; prospective replacement uses occurrence forward correction lineage.

An empty teacher set may exist while a DRAFT occurrence is being assembled. P4-020 does not claim runtime validity from that draft. P4-040 must fail closed at materialization if an occurrence being materialized lacks one or more valid eligible scheduled staffing children as required by ADR-050.

## 3. Database invariants

The migration must enforce, at minimum:

1. grade range checks (10..12 where grade exists);
2. programme-master kind/grade shape;
3. natural master uniqueness via partial unique indexes;
4. version uniqueness and predecessor lineage restricted to the same master;
5. version lifecycle metadata consistency;
6. topic sequence uniqueness within one version and positive required-period count;
7. occurrence target-shape consistency;
8. occurrence programme/version/item provenance consistency via composite foreign keys;
9. occurrence successor lineage restricted to the same programme master;
10. exact academic-year integrity for CLASS targets and time slots;
11. one slot identity per occurrence;
12. one teacher per exact planned slot;
13. retained-history `ON DELETE RESTRICT` behavior throughout;
14. no foreign key or new column from programme planning into `SpecialActivity` in P4-020.

Cross-row semantic checks that PostgreSQL cannot express with ordinary `CHECK` constraints (for example GDDP target grade matching the programme-master grade) are enforced in the command layer and covered by integration tests. Where a stable database trigger can enforce the same invariant without coupling to runtime tables, P4-020 may add one as a defense-in-depth backstop.

## 4. Command layer

The P4-020 service exposes authorization-neutral commands for P4-030 to guard later. Commands must never inspect roles/titles/departments to infer programme authority.

Required command families:

- create or resolve canonical programme master;
- create a draft plan version;
- replace the complete draft topic-item set under CAS revision;
- publish a draft plan version;
- create a successor draft from a published version with explicit reason;
- create a draft planned occurrence;
- replace draft target/date/topic/slots/staffing under CAS revision;
- publish a planned occurrence;
- create a forward-correction successor occurrence from a published occurrence with explicit reason;
- bounded retained reads by programme master/version/date/status.

## 5. Concurrency, idempotency and audit

Mutation commands must follow repository control-plane conventions:

- PostgreSQL `SERIALIZABLE` transaction;
- bounded retry for retryable serialization/deadlock conflicts;
- CAS revision/state predicates for stale-writer detection;
- caller-supplied command/request id plus deterministic fingerprint for idempotency;
- same actor + same request id + same fingerprint returns the retained prior result;
- same actor + same request id + different fingerprint fails closed as an idempotency conflict;
- successful state mutation, command receipt, and `AuditEvent` are committed in the same transaction;
- no success audit is emitted for a rolled-back mutation.

The command-receipt persistence is an internal P4-020 control-plane mechanism and does not grant authorization.

## 6. Audit vocabulary

P4-020 uses explicit programme-domain audit actions rather than generic `UPDATE` actions, including semantic equivalents of:

- `PROGRAMME_MASTER_CREATE`
- `PROGRAMME_PLAN_DRAFT_CREATE`
- `PROGRAMME_PLAN_DRAFT_TOPICS_REPLACE`
- `PROGRAMME_PLAN_PUBLISH`
- `PROGRAMME_PLAN_SUCCESSOR_CREATE`
- `PROGRAMME_OCCURRENCE_DRAFT_CREATE`
- `PROGRAMME_OCCURRENCE_DRAFT_REPLACE`
- `PROGRAMME_OCCURRENCE_PUBLISH`
- `PROGRAMME_OCCURRENCE_SUCCESSOR_CREATE`

Audit metadata contains identifiers, lifecycle transition evidence, target classification, CAS revision, and lineage IDs where applicable. Sensitive credentials/tokens are never recorded.

## 7. P4-030 handoff

P4-020 deliberately leaves command authorization unbound. P4-030 must define and test:

- exact coordinator/BGH capability keys;
- exact resource identity;
- exact scope semantics;
- guards around the P4-020 command service / future HTTP surface;
- denial cases proving role/title/department/subject-group/system-admin inference does not grant authority.

P4-030 must not need to redesign P4-020 persistence semantics to add authorization.

## 8. P4-040 handoff

P4-040 consumes only published/current planning authority. It owns:

- materialization into `1 -> N` runtime `SpecialActivity` roots;
- frozen programme/version/topic/occurrence/slot-staffing provenance;
- HĐTN CLASS homeroom resolution/freeze;
- post-materialization replacement orchestration;
- programme-attestation runtime persistence/control.

P4-020 must not add programme provenance columns to `SpecialActivity`; that schema bridge belongs to P4-040.

## 9. Acceptance evidence required before P4-020 review

P4-020 cannot enter `IN_REVIEW` until branch evidence covers:

- Prisma schema validation/generation;
- isolated PostgreSQL migration application from canonical migration history;
- migration behavior for retained-history and database constraints;
- service tests for plan lifecycle, occurrence lifecycle, exact slot staffing, lineage, idempotency, stale CAS and transaction audit;
- regression proof that P4-020 did not modify `SpecialActivity` semantics or introduce attestation/workload/capability binding;
- lint/typecheck/unit/integration/build gates applicable to changed packages;
- documentation synchronization for P4-020 implementation state.

Authoritative exact-head GitHub CI remains required because the current execution environment cannot directly clone `github.com`. Merge and deployment remain separately authorized.