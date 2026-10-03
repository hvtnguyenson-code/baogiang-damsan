# ADR-056 — Public Make-up Scheduling Architecture

- **Status:** Proposed — P3-030 IN_REVIEW
- **Date:** 2026-10-03
- **Task:** P3-030
- **Trigger:** T08 public make-up re-entry for FULL BUSINESS PILOT
- **Authority:** ADR-031, ADR-038, ADR-040, ADR-049, ADR-055, P2-003, P3-010/P3-020 closure evidence

## Context

The repository already has the canonical make-up persistence and downstream semantics:

- `MakeupTeachingSchedule` retains the original curricular obligation, exact PPCT provenance, target date/calendar/slot, scheduled teacher, frozen eligibility evidence, immutable lifecycle, request identity and replacement lineage.
- PPCT occurrence allocation can prove whether a retained make-up schedule still matches the exact original distribution obligation.
- Progress/debt projection distinguishes `PROVEN_OPEN_DEBT` from `UNCONFIRMED_COMPLETION_GAP`.
- `CurricularTeachingExecution(kind=MAKEUP)` is the only completion evidence; scheduling alone never completes PPCT or closes debt.
- resolved occurrences, SpecialActivity and effective-schedule projections already understand ACTIVE make-up occupancy.
- P3-020 may reconstruct already-performed historical make-up only inside its retrospective evidence boundary.

The missing product capability is an authorized operational control plane that creates, reads, reverses and corrects make-up schedules for real post-operational incomplete obligations without inventing a second debt ledger, a PPCT cursor or a parallel collision engine.

## Decision

### D1 — Existing canonical aggregate is reused

P3-031 must use the existing `MakeupTeachingSchedule` aggregate. No parallel make-up table, mutable current-state row, manual debt row, completion flag or report counter is introduced.

The current schema is expected to be sufficient. P3-031 is schema-free unless implementation proves that an invariant cannot be enforced with the retained model and existing database constraints.

### D2 — Exact source proof is server-derived `PROVEN_OPEN_DEBT`

A public make-up schedule may be created only for one exact post-operational direct curricular obligation that the canonical `TEACHING_PROGRESS_DEBT_V2` projection classifies as `PROVEN_OPEN_DEBT` at command time.

`UNCONFIRMED_COMPLETION_GAP` is not debt proof and is not schedulable. Missing execution alone never authorizes make-up.

For the current operational semantics, schedulable debt therefore originates from an exact retained normal opportunity whose effective disposition is `ABSENCE_NO_REPLACEMENT` or `DIFFERENT_SUBJECT_SUPERVISION`. The server must derive and persist the matching `sourceDispositionId`.

The client must not supply or choose PPCT plan/version/item/revision/component identities. The server replays allocation/progress in the mutation transaction and derives the exact retained source bundle.

### D3 — Candidate reads are advisory; create always revalidates

P3-031 may expose a bounded candidate/read model for authorized users. A candidate identifies the exact source occurrence and human-readable PPCT/class/subject context and may expose whether an ACTIVE make-up schedule already exists.

Candidate output is not mutation authority. Create re-runs source proof, active-execution checks, active-schedule uniqueness, target resolution, teacher eligibility and collision validation inside one `SERIALIZABLE` transaction.

### D4 — Public create is prospective and operational-period only

P3-031 public create is for operational scheduling, not retrospective evidence reconstruction.

The original source obligation must satisfy:

- `sourceCivilDate >= operationalStartDate`;
- source slot has ended before the command can become `PROVEN_OPEN_DEBT`;
- no ACTIVE curricular execution already fulfills the obligation;
- no ACTIVE `MakeupTeachingSchedule` already claims the same exact PPCT obligation.

The target slot must start strictly after command time in `Asia/Ho_Chi_Minh`. Backdated/already-performed make-up belongs to P3-020 historical evidence ingestion, not P3-031.

### D5 — Target authority is server-derived and exact

Create input may select target civil date, canonical make-up-eligible time slot and scheduled teacher, but the server derives all retained authority around them.

The target must:

- be inside the academic year and resolve to exactly one authoritative retained calendar for that date;
- use an exact `TimeSlotDefinition` for the target weekday with `allowMakeupTeaching=true`;
- not fall inside `CalendarInterruption`;
- not be suppressed for the target class/time by an applicable ACTIVE `CalendarException`;
- retain the exact target calendar and slot identities on the schedule.

Target class and subject are inherited from the source obligation and cannot be changed by the client.

### D6 — Same-subject teacher eligibility is frozen at scheduling time

The scheduled teacher must, at command time:

- be an ACTIVE user;
- have a teaching `StaffProfile`;
- have exactly one valid date-effective `StaffSubject` proof for the source subject covering the target date.

The schedule freezes the eligibility instant, result and exact `StaffSubject` identity. Later staff changes do not rewrite retained scheduling history.

Eligibility never grants mutation authority.

### D7 — Collision semantics reuse canonical occupancy

P3-031 must not build a second collision engine. It must reuse the canonical resolved-occurrence/effective occupancy semantics and exact wall-clock overlap rules.

Create fails closed on class or teacher collision with:

- date-effective normal timetable occupancy after interruption/exception/disposition precedence;
- ACTIVE make-up schedules;
- ACTIVE SpecialActivity occurrences, including materialized GDĐP/HĐTN-HN;
- any other canonical occupancy already required by the current effective-schedule collision contract.

Suppressed/cancelled/absence-without-replacement normal occupancy does not occupy the released source slot by itself.

If implementation audit finds an existing mutation path that could create a new conflicting occupancy after an ACTIVE make-up schedule exists, P3-031 must add the narrow reciprocal guard before closure rather than inventing parallel state.

### D8 — One ACTIVE claim per obligation remains authoritative

The existing database partial unique invariant
`makeup_teaching_schedules_one_active_obligation_key`
remains the concurrency backstop.

Create is idempotent by request key + semantic fingerprint. Same key/same fingerprint replays; changed fingerprint conflicts. Competing creates run under `SERIALIZABLE`; exactly one may commit.

### D9 — Immutable correction is reverse + replacement

A schedule is immutable `ACTIVE -> REVERSED`. There is no update, delete, unreverse, draft or approval state.

Reversal requires:

- exact schedule authorization after resolving its persisted subject;
- `expectedUpdatedAt` CAS;
- nonblank bounded reversal reason;
- request key + fingerprint;
- `SERIALIZABLE` transaction and success audit.

An ACTIVE schedule referenced by an ACTIVE `CurricularTeachingExecution(kind=MAKEUP)` cannot be reversed. Execution must be corrected/reversed first so progress/debt never sees an ACTIVE execution whose schedule has been invalidated.

Replacement is a new fully validated schedule referencing exactly one REVERSED predecessor for the same original obligation. It may change target date/slot/teacher but may not change the original obligation.

### D10 — Source-disposition dependency is protected

Because public scheduling is authorized only from `PROVEN_OPEN_DEBT`, the schedule depends on the exact absence/supervision disposition that proves the debt.

An ACTIVE source disposition referenced by an ACTIVE public make-up schedule cannot be reversed first. The schedule must be reversed before the disposition is corrected. P3-031 must add this narrow reciprocal lifecycle guard to the disposition reversal path.

This rule prevents a retained ACTIVE schedule from silently losing the operational fact that made its obligation schedulable.

### D11 — Scheduling and execution remain separate

Creating a make-up schedule:

- does not create `CurricularTeachingExecution`;
- does not mark completion;
- does not close debt;
- does not consume a new PPCT item;
- does not increment workload or reporting counts.

After the target slot ends, existing TeachingExecution confirmation may create `CurricularTeachingExecution(kind=MAKEUP)` only when the retained schedule still has an exact allocator source match. That execution fulfills the original obligation exactly once.

### D12 — Authorization reuses `TEACHING_OPERATION_MANAGE`

No new capability is introduced.

Create/read/reverse for one exact subject requires:

- `TEACHING_OPERATION_MANAGE / SUBJECT` for that persisted subject, or
- `TEACHING_OPERATION_MANAGE / SCHOOL_WIDE`.

Broad cross-subject enumeration requires SCHOOL_WIDE authority.

No authority is inferred from `SYSTEM_ADMIN`, `TIMETABLE_MANAGE`, `PPCT_MANAGE`, `TEACHING_EXECUTION_MANAGE`, role/title, TeachingAssignment, StaffSubject, SubjectGroup membership, creator identity or frontend visibility.

Mutations require authenticated session plus CSRF/origin validation. Reads require authenticated session. Denials remain default-deny and sanitized.

### D13 — P3-020 historical ownership remains separate

P3-031 does not replace or broaden P3-020.

Any source obligation before `operationalStartDate` is outside P3-031 mutation authority even if a retained historical schedule exists. Historical already-performed make-up correction continues through the P3-020 reverse/replacement workflow.

P3-031 must not reinterpret `HistoricalTeachingImportBatch/Row` as a scheduling source or second debt ledger.

### D14 — Public runtime surface

P3-031 may expose only bounded authorized operations:

1. candidate/read model for schedulable proven debt;
2. create make-up schedule;
3. bounded list/get;
4. reverse schedule;
5. replacement through a new create referencing a reversed predecessor.

No generic PATCH/DELETE, bulk mutation, manual PPCT selector, debt waiver/editor, move/swap, teacher self-request, approval workflow or execution shortcut is authorized by P3-030.

A usable management UI may consume this API but must not invent broader authority or semantics.

## Required P3-031 implementation evidence

P3-031 is not merge-ready without tests proving at least:

- `PROVEN_OPEN_DEBT` source accepted;
- `UNCONFIRMED_COMPLETION_GAP` rejected;
- completed obligation rejected;
- pre-operational source rejected;
- no client-selected PPCT identity;
- target slot/calendar/weekday/`allowMakeupTeaching` validation;
- CalendarInterruption and CalendarException rejection;
- normal timetable class collision and teacher collision;
- SpecialActivity class/teacher collision;
- ACTIVE make-up class/teacher collision;
- same-subject teacher eligibility and frozen StaffSubject provenance;
- exact SUBJECT vs SCHOOL_WIDE authorization;
- duplicate ACTIVE obligation race/idempotent replay;
- reverse CAS/idempotency;
- reverse blocked by ACTIVE MAKEUP execution;
- source disposition reversal blocked by ACTIVE public make-up;
- valid reverse + replacement lineage;
- existing TeachingExecution/progress/debt/reporting semantics remain unchanged;
- P3-020 historical path remains isolated.

## Consequences

The FULL BUSINESS pilot gains a real make-up scheduling lifecycle without weakening the existing evidence architecture. The system schedules only proven debt, keeps scheduling distinct from actual teaching, preserves exact PPCT provenance, and reuses canonical collision/authorization primitives.

## Non-scope

P3-030 does not authorize runtime/schema/API/UI mutation itself. It does not authorize production/VPS/deploy mutation. It does not add debt waivers, enrichment teaching, move/swap, teacher request/approval flows, notifications or automated execution confirmation.
