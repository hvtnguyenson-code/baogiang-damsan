# ADR-031 — Operational Overlays Architecture

- **Status:** Accepted
- **Date:** 2026-08-14
- **Scope:** Architecture authority for Operational Overlays; no implementation authorization
- **Audit:** `docs/requirements/LOCAL-FC-05C0-OPERATIONAL-OVERLAYS-ARCHITECTURE-AUDIT.md`
- **Decision closure:** `docs/requirements/LOCAL-FC-05C0D-OPERATIONAL-OVERLAYS-DECISION-CLOSURE.md`

## Context

ADR-020 retains exact immutable base timetable history, ADR-029 retains exact date-effective PPCT associations, and ADR-030 intentionally leaves operational overlays `NOT_ASSESSED`. The 05C0 audit confirmed cancellation, absence, substitution/supervision and make-up outcomes but left their aggregate ownership, authority, correction, concurrency, precedence and persistence unresolved.

This ADR accepts the product-owner closure of R1–R22. Operational facts overlay retained planning sources; they never rewrite calendar, timetable, TeachingAssignment or PPCT history.

## Decision

### Aggregate families and atomic scope (R1–R3, R19–R20)

Operational Overlays has three separate aggregate families:

1. `CalendarException`, a Scheduling / Calendar Overlay aggregate;
2. `OperationalLessonDisposition`, a Teaching Operations aggregate;
3. `MakeupTeachingSchedule`, a separate obligation-linked scheduling aggregate.

`CalendarException` pins exact `AcademicYear` and retained `AcademicCalendarVersion`. It owns one civil `DATE`, one target (`SCHOOL_WIDE`, `GRADE` or `CLASS`) and one time selector (`WHOLE_DAY`, `SESSION` or `EXACT_SLOTS`). Session uses canonical slot vocabulary and exact slots use retained `TimeSlotDefinition` identities. There are no persisted ranges or activity scope. Calendar replacement never copies, migrates or reinterprets it.

`OperationalLessonDisposition` targets one exact normal base opportunity and has one mutually exclusive type: `AUTHORIZED_CANCELLATION`, `ABSENCE_NO_REPLACEMENT`, `SAME_SUBJECT_SUBSTITUTION` or `DIFFERENT_SUBJECT_SUPERVISION`. A constrained single table is permitted if database checks enforce type-specific shape. Assigned teacher is required only for substitution/supervision.

`MakeupTeachingSchedule` links one exact existing incomplete obligation to one exact target date/slot. It remains separate from dispositions.

There is no generic operational God ledger, multi-opportunity aggregate, mutable current-state row, Special Activity subtype, persisted occurrence, or debt/progress/report state. Batch workflows create independently identified atomic facts.

### Historical source provenance and PPCT boundary (R4, R6, R9, R12)

A disposition retains exact:

- academic year;
- timetable version and entry;
- source civil date;
- calendar version;
- slot definition;
- class and subject;
- TeachingAssignment and responsible teacher.

The server derives and verifies these coordinates. The timetable must be historically effective for the date; a future source must be the activated date-effective authoritative base, not merely validated/approved. Later source drift does not rebind an event. A future stale source becomes an explicit conflict requiring reversal/recreation; past history continues through retained identities.

A disposition does not guess or own a PPCT item. PPCT obligation selection remains downstream deterministic occurrence/progress work. Make-up is the exception because its meaning requires an exact already-existing obligation: it retains the original timetable/date/calendar/slot, class/subject, responsible teacher/assignment, exact PPCT association/version/item and source absence/supervision fact.

Responsible teacher, assigned substitute/supervisor and future actual teacher are distinct identities. Same-subject eligibility is checked at command time against the canonical teaching/staff eligibility source and the decision result is frozen. A substitute need not own TeachingAssignment. Historical classification is unaffected by later staff, subject or assignment changes.

### Lifecycle, reversal and temporal behavior (R5–R6, R21)

The lifecycle is `ACTIVE → REVERSED`. Creation directly produces immutable `ACTIVE`; there is no draft or confirmed state. Future scheduling and retrospective authoritative correction are permitted within exact source validity, with creation instant distinct from business `DATE`.

Correction conditionally reverses the active fact and may create a separately validated replacement. Type, source, teacher, date, slot and semantic payload never mutate. Reversal records actor, instant, bounded reason and predecessor/replacement linkage. Physical delete is forbidden.

Reversal updates live/draft downstream views through deterministic recomputation/reconciliation. It never directly changes PPCT completion, debt counters, execution, report totals or submitted/approved snapshots.

### Authorization boundary (R7–R8, R18)

Architecture accepts two future professional mutation capabilities:

- `CALENDAR_EXCEPTION_MANAGE`, `SCHOOL_WIDE` only;
- `TEACHING_OPERATION_MANAGE`, `SUBJECT` and `SCHOOL_WIDE` only.

`AUTHORIZED_CANCELLATION` requires school-wide teaching-operation authority. Other dispositions and make-up scheduling may be authorized for the exact persisted subject or school-wide. Calendar exception commands require school-wide calendar-exception authority. A successful create command is authoritative; no separate approval state or create/reverse separation of duty is required.

There is no `SUBJECT_GROUP`, `PERSONAL` or `ACTIVITY` authoritative scope. `TIMETABLE_MANAGE`, `PPCT_MANAGE`, `SYSTEM_ADMIN`, role/title, membership, duty, TeachingAssignment, StaffSubject and frontend visibility do not imply overlay authority. Teacher absence self-report is a future separate request workflow.

Business events retain actor/request/domain provenance. Sanitized `AuditEvent` records capability, scope/resource, outcome, request and event/action. It stores no grant internals, credentials, session hashes or broad raw request. No mandatory business-row FK to an authorization-decision row is required.

### Competing facts, precedence and occupancy (R10–R11, R15–R16, R22)

At most one active disposition exists for an exact source opportunity. Another requires reversal first. There is no type priority, implicit replacement or last-created winner. Corrupt ambiguity fails closed.

Accepted precedence is:

1. `CalendarInterruption`: no normal opportunity;
2. applicable active `CalendarException`: suppresses the opportunity;
3. exact active `OperationalLessonDisposition`: applies only to an existing unsuppressed opportunity;
4. base timetable otherwise.

An interruption-targeted disposition and a disposition against an exception-suppressed opportunity are rejected. Calendar exception is policy/scope suppression; authorized cancellation is an exact-opportunity fact. If the exception already applies, cancellation is redundant/conflicting and rejected.

Suppression may remove normal occupancy from effective calculation but grants no automatic replacement occupancy. New occupancy needs its own fact, authority and collision checks.

05C may operate before Special Activity by checking all currently canonical timetable, disposition, make-up and suppression occupancy, while explicitly not claiming activity collision completeness. Later Special Activity commands check existing 05C facts. Activity precedence remains deferred and no occurrence/readiness profile may claim it before its own ADR.

### Make-up and PPCT outcomes (R12–R13)

Make-up requires an exact existing incomplete obligation. No obligation means no make-up; enrichment or newly planned teaching requires separate architecture. The target pins exact date, calendar, make-up-eligible slot, class, subject and scheduled same-subject-eligible teacher. Scheduling does not complete PPCT, close debt or create execution evidence, and consumes no new item. Future valid TeachingExecution fulfills exactly once.

Disposition semantics are:

| Type | PPCT effect |
|---|---|
| `AUTHORIZED_CANCELLATION` | Not distributed, not completed, no debt. |
| `ABSENCE_NO_REPLACEMENT` | Distributed, not completed, downstream debt. |
| `SAME_SUBJECT_SUBSTITUTION` | Distributed; completed only by later valid execution. |
| `DIFFERENT_SUBJECT_SUPERVISION` | Distributed; expected subject incomplete; downstream debt. |

05C stores no distribution/completion/debt counters and confirms no execution.

### Idempotency and concurrency (R17)

Every mutation uses request identity plus fingerprint. Same identity/fingerprint replays; changed fingerprint conflicts. Semantic uniqueness remains independent. `ACTIVE → REVERSED` uses CAS following repository convention such as `expectedUpdatedAt`. Multi-row create/reverse/replace and competing disposition commands use `SERIALIZABLE` unless a proven narrower level preserves all invariants. Unique/partial unique/exclusion constraints backstop concurrency. Exactly one conflicting disposition and one active make-up claim per obligation may commit; failure produces no success audit or partial state.

### Hard non-scope and deferred decision (R14, R22)

Move/swap is hard non-scope: no model, enum, API or emulation by cancellation, make-up, replacement, substitution or base mutation.

Special Activity remains a separate future architecture slice. This ADR does not decide whether it suppresses, replaces, outranks or coexists with normal/05C facts.

## R1–R22 decision mapping

| ID | Accepted result |
|---|---|
| R1 | Separate retained-calendar `CalendarException` aggregate. |
| R2 | Atomic date/scope/time selector; school/grade/class only. |
| R3 | Three aggregate families. |
| R4 | Exact source bundle; PPCT item remains downstream. |
| R5 | Immutable `ACTIVE → REVERSED`. |
| R6 | Future and retrospective facts; stale future source conflicts. |
| R7 | Two exact capability keys and scope matrices. |
| R8 | Authoritative create; no separate approval state. |
| R9 | Command-time teacher eligibility with frozen result. |
| R10 | One active disposition; no automatic occupancy reuse. |
| R11 | Bounded pre-activity collision validation allowed. |
| R12 | Exact-obligation make-up and same-subject scheduled teacher. |
| R13 | Reject make-up without obligation. |
| R14 | Move/swap hard non-scope. |
| R15 | Interruption → exception → disposition → base precedence. |
| R16 | Policy exception and exact cancellation remain distinct. |
| R17 | Idempotency/fingerprint, CAS, serializable concurrency. |
| R18 | Separate business provenance and sanitized authorization audit. |
| R19 | Three physical table families; constrained disposition shape. |
| R20 | Atomic facts; no persisted ranges/multi-opportunity aggregate. |
| R21 | Source reversal plus downstream recomputation. |
| R22 | Special Activity precedence explicitly deferred. |

## Alternatives rejected

- Mutating `AcademicCalendarVersion`, `TimetableEntry` or `TeachingAssignment` to represent operations.
- Current-head lookup or silent future-event migration.
- A generic mutable event/state row spanning calendar, operations, execution, debt and reports.
- PPCT counters, `debtClosed`, completion, execution or report/snapshot fields on overlay rows.
- `TIMETABLE_MANAGE` reuse, subject-group/personal overlay mutation or inferred authority.
- Make-up without exact original obligation or make-up consuming a new PPCT item.
- Move/swap emulation and invented Special Activity precedence.

## Consequences

- 05C1 can design only the persistence foundation for the three accepted families and database invariants.
- 05C2 can later add the accepted authorization/control-plane behavior.
- Historical event meaning is stable across timetable, calendar, assignment, staff and PPCT head changes.
- `NORMAL_BASE_PPCT_V1` remains unchanged; no full operational readiness is claimed.
- Special Activity must reconcile against existing 05C facts rather than rewrite them.

## Downstream boundaries

Operational overlays provide immutable source facts to later resolved-occurrence and execution layers. TeachingExecution owns actual teacher and fulfillment evidence. Progress/debt/late owns reproducible projections. Reporting and statement workflows own derived totals and immutable official snapshots. None of those states belongs to 05C.

## Explicit non-scope and non-authorization

This ADR does not implement or authorize schema, migration, API, DTO/contract, seed/capability runtime, tests, UI, deployment or production mutation. It also excludes move/swap, Special Activity persistence/precedence, occurrence persistence, execution, debt/progress, reporting and snapshots. Each implementation slice requires separate authorization.
