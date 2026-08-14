# LOCAL-FC-05C0D — Operational Overlays Decision Closure

## 1. Status and authority

**Status:** Accepted architecture decision closure; documentation only.

This closure follows `LOCAL-FC-05C0-OPERATIONAL-OVERLAYS-ARCHITECTURE-AUDIT.md` at parent HEAD `72907d5a5d3cb93750a776af9524264b1b02dfcf`. It closes R1–R22 with product-owner architecture authority and makes the Operational Overlays domain architecture-ready for a separately authorized persistence slice.

The 05C0 audit remains historical evidence of what was previously `CONFIRMED`, `INFERRED` or `UNRESOLVED`. This closure does not rewrite that history. It authorizes no schema, migration, API, contract, seed, capability runtime, test, UI, deployment or production mutation.

ADR-031 records the accepted architecture resulting from this closure. PR #11 remains non-authoritative and out of scope.

## 2. Baseline and preserved upstream facts

- Canonical main: `5e313e91e8b64b63ed352da603292f7b9d0133ce`.
- Parent audit/correction HEAD: `72907d5a5d3cb93750a776af9524264b1b02dfcf`.
- Base timetable, calendar, TeachingAssignment, time-slot and PPCT histories remain immutable and independently owned.
- `NORMAL_BASE_PPCT_V1` remains bounded; operational dimensions remain outside ADR-030.
- No persisted `ResolvedLessonOccurrence`, execution, debt/progress, report or snapshot is introduced.

## 3. Closure matrix

| Decision | Accepted closure | Consequence |
|---|---|---|
| R1 | `CalendarException` is a separate Scheduling / Calendar Overlay aggregate pinned to exact `AcademicYear` and retained `AcademicCalendarVersion`. | It never mutates, migrates, copies or rebinds a calendar version silently. |
| R2 | One atomic civil `DATE`; one `SCHOOL_WIDE`, `GRADE` or `CLASS` target; one `WHOLE_DAY`, `SESSION` or `EXACT_SLOTS` selector. | No ranges or `ACTIVITY` scope; exact slots use retained `TimeSlotDefinition` IDs. |
| R3 | Three aggregate families: `CalendarException`, `OperationalLessonDisposition`, `MakeupTeachingSchedule`. | No God event; Special Activity remains separate; move/swap excluded. |
| R4 | A disposition freezes the exact source bundle through responsible teacher, but does not own/guess a PPCT item. | Server verifies authoritative date-effective source; no persisted occurrence. |
| R5 | Lifecycle is exactly `ACTIVE` and `REVERSED`; semantic payload is immutable. | Correction reverses and optionally creates a separately validated replacement; no physical delete. |
| R6 | Future scheduling and retrospective authoritative correction are allowed within retained source validity. | No hardcoded backdate window; future stale sources require reverse/recreate, never silent migration. |
| R7 | New architecture keys are `CALENDAR_EXCEPTION_MANAGE / SCHOOL_WIDE` and `TEACHING_OPERATION_MANAGE / SUBJECT|SCHOOL_WIDE`. | No group/personal/activity scope; no inference or reuse of timetable/PPCT authority. |
| R8 | Authorized create immediately creates `ACTIVE`; no separate approval state. | Subject/school authority matrix is explicit; teacher self-report is a future separate workflow. |
| R9 | Substitute/supervisor eligibility is checked at command time and its result is frozen. | Same-subject classification does not drift; substitute need not own TeachingAssignment. |
| R10 | At most one active disposition per exact source opportunity. | Explicit reversal is required before another disposition; released time is not automatically reusable. |
| R11 | 05C may operate before Special Activity, validating all currently canonical occupancy. | It must not claim full collision coverage; later activity commands check pre-existing 05C facts. |
| R12 | Make-up is a separate schedule referencing one exact existing incomplete PPCT obligation and source provenance. | Exact target date/calendar/slot/class/subject/teacher; scheduling does not fulfill or close debt. |
| R13 | No obligation means no make-up. | Enrichment/extra/new PPCT opportunity requires separate architecture. |
| R14 | Move/swap is closed as hard non-scope. | No model, enum, API or emulation through other facts. |
| R15 | Precedence: interruption → active exception → exact disposition → base timetable. | No disposition priority because only one can be active; corrupt ambiguity fails closed. |
| R16 | Exception is scope-policy suppression; authorized cancellation targets one exact normal opportunity. | A cancellation is rejected when an applicable exception already suppresses that opportunity. |
| R17 | Every mutation has request identity/fingerprint, CAS transition and semantic uniqueness; conflicting multi-row work normally uses `SERIALIZABLE`. | Replay/conflict rules are deterministic; one competing command commits; failed commands leave no success audit/partial state. |
| R18 | Business provenance and sanitized authorization audit are separate. | No grant internals or mandatory business-event FK to an authorization-decision row. |
| R19 | Future persistence uses the three table families; a constrained four-type disposition table is allowed. | Assigned teacher required only for substitution/supervision; no God ledger or downstream state. |
| R20 | All persisted facts are atomic. | No operational ranges, multi-opportunity disposition or ambiguous partial reversal. |
| R21 | Reversal changes live/draft downstream projections through deterministic recomputation/reconciliation. | It never directly mutates PPCT completion, debt counters, execution, reports or submitted snapshots. |
| R22 | Special Activity precedence is explicitly deferred to its architecture slice. | No full occurrence/readiness claim may include activity coverage before that closure. |

Every R1–R22 is closed exactly once. R14 and R22 are closed by accepted hard non-scope/deferral, not by inventing absent semantics.

## 4. Accepted aggregate model

### 4.1 CalendarException

`CalendarException` is a separate calendar-overlay aggregate. It belongs to Scheduling / Calendar Overlay, not mutable `AcademicCalendarVersion` state, base timetable, lesson disposition or TeachingExecution. It pins exact `academicYearId` and `academicCalendarVersionId` and never rewrites the calendar.

One fact owns exactly one civil `DATE`, one business target (`SCHOOL_WIDE`, `GRADE` or `CLASS`) and one time selector (`WHOLE_DAY`, `SESSION` or `EXACT_SLOTS`). `SESSION` uses the canonical slot session vocabulary. `EXACT_SLOTS` uses exact retained slot identities, never period number/label alone. `ACTIVITY` scope and persisted date ranges are excluded. Batch creation, if later authorized, creates multiple independent atomic facts.

Activating/replacing a calendar version does not copy or rebind exceptions. If a future pinned calendar ceases to be authoritative for the business date, resolution surfaces stale-source/conflict and the operator reverses/recreates the fact.

### 4.2 OperationalLessonDisposition

One disposition targets exactly one normal base opportunity and has exactly one mutually exclusive type:

- `AUTHORIZED_CANCELLATION`;
- `ABSENCE_NO_REPLACEMENT`;
- `SAME_SUBJECT_SUBSTITUTION`;
- `DIFFERENT_SUBJECT_SUPERVISION`.

At most one `ACTIVE` disposition exists for the exact source opportunity. A replacement requires explicit reversal first; there is no implicit replacement, priority within disposition types or last-created winner.

Required source provenance is:

- `academicYearId`;
- `timetableVersionId`;
- `timetableEntryId`;
- `sourceCivilDate`;
- `academicCalendarVersionId`;
- `timeSlotDefinitionId`;
- `schoolClassId`;
- `subjectId`;
- `teachingAssignmentId`;
- `responsibleTeacherUserId`.

The server derives and verifies the complete bundle. The timetable version must be historically effective for the date; a future fact must target the activated date-effective authoritative base source, not merely `VALIDATED` or `APPROVED` content. Inconsistent client coordinates are rejected.

A disposition does not freeze or own a PPCT item. PPCT item selection belongs to deterministic occurrence/progress resolution when stream position is known. This avoids circular planning coupling.

### 4.3 MakeupTeachingSchedule

One make-up schedule references exactly one existing incomplete obligation. Required original provenance includes the exact original timetable version/entry/date/calendar/slot, academic year, class, subject, responsible teacher/assignment, exact PPCT association/version/item, and the source absence/supervision disposition where applicable.

The target retains exact civil `DATE`, exact target calendar version, exact target slot, class, subject and scheduled teacher. `allowMakeupTeaching` must be true. The scheduled teacher must pass same-subject eligibility under the R9 frozen-decision rule.

A vague class+subject request is invalid. If the exact PPCT obligation cannot be proven, creation fails closed. Scheduling consumes no new PPCT item, creates no execution evidence, completes nothing and closes no debt. Downstream valid TeachingExecution fulfills the obligation exactly once.

## 5. Lifecycle, correction and temporal rules

The only core statuses are `ACTIVE` and `REVERSED`. Creation produces an immutable `ACTIVE` business fact; there is no generic editable draft or confirmed state. Future-dated active facts are authoritative schedules whose business effect occurs on their civil date.

Correction is forward-only:

1. conditionally reverse the active fact;
2. retain reversing actor, `reversedAt`, bounded reason and predecessor/replacement linkage;
3. create a separately validated replacement when needed.

Type, source, teacher, date, slot and semantic payload never mutate in place. Reversed facts remain addressable and physical deletion is forbidden. Free text may explain but never determines PPCT/debt outcome.

Future and retrospective facts are allowed only within the academic year, retained calendar validity, retained effective timetable interval and source-specific rules. Creation instant and business date remain distinct. Retrospective create/reverse requires explicit reason and audit. Submitted/approved report snapshots remain immutable.

## 6. Teacher identities and eligibility

- **Responsible teacher:** retained planning identity from `TeachingAssignment`/`TimetableEntry`.
- **Assigned substitute/supervisor:** 05C operational scheduling identity.
- **Actual teacher:** future TeachingExecution evidence.

These identities never collapse.

For `SAME_SUBJECT_SUBSTITUTION`, expected subject comes from the exact retained entry. The assigned teacher must be an active canonical teaching/staff identity eligible for that subject at scheduling time through the canonical eligibility source used by the existing domain. The immutable eligibility result/snapshot keeps the classification stable after `StaffSubject`, status or assignment changes. The substitute need not own the class TeachingAssignment.

For `DIFFERENT_SUBJECT_SUPERVISION`, the assigned supervisor must be an active eligible teaching/staff identity, and same-subject matching is explicitly false/not required. Eligibility is not mutation authorization.

## 7. Authorization model

Architecture accepts, but this task does not implement or seed:

| Capability | Allowed scopes | Authorized core commands |
|---|---|---|
| `CALENDAR_EXCEPTION_MANAGE` | `SCHOOL_WIDE` only | Create/reverse CalendarException. |
| `TEACHING_OPERATION_MANAGE` | `SUBJECT`, `SCHOOL_WIDE` | Subject/school dispositions and make-up schedules. |

`AUTHORIZED_CANCELLATION` requires `TEACHING_OPERATION_MANAGE / SCHOOL_WIDE`. Other dispositions and make-up may use the exact persisted subject or school-wide grant. A successful authorized create directly creates `ACTIVE`; no separate approval state or separation-of-duty rule is imposed. A teacher self-report is not an authoritative disposition and may be designed later as a separate request workflow.

There is no `SUBJECT_GROUP`, `PERSONAL` or `ACTIVITY` authority for these mutations. `TIMETABLE_MANAGE` and `PPCT_MANAGE` do not authorize them. There is no inference from `SYSTEM_ADMIN`, role/title, membership, duty, TeachingAssignment, StaffSubject or frontend visibility. Resources are server-resolved, default-deny and audited under ADR-008.

## 8. PPCT and downstream semantics

| Disposition | Distributed | Completed | Debt consequence |
|---|---:|---:|---|
| `AUTHORIZED_CANCELLATION` | No | No/not applicable | None. |
| `ABSENCE_NO_REPLACEMENT` | Yes | No | Downstream debt. |
| `SAME_SUBJECT_SUBSTITUTION` | Yes | Only after later valid execution | No debt when validly executed. |
| `DIFFERENT_SUBJECT_SUPERVISION` | Yes | Expected subject not completed | Downstream debt. |

05C scheduling persists none of these counters and does not confirm execution. Make-up references an exact obligation, consumes no new item and is fulfilled exactly once only by downstream valid execution.

Reversals affect live/draft projections by deterministic recomputation/reconciliation. They never directly mutate PPCT items, debt counters, report totals, TeachingExecution or immutable statement snapshots.

## 9. Precedence and collision

Accepted 05C precedence is:

1. `CalendarInterruption`: no normal base opportunity exists.
2. Applicable active `CalendarException`: suppresses the affected opportunity.
3. Exact active `OperationalLessonDisposition`: applies only to an existing, unsuppressed opportunity.
4. Base timetable: applies when no accepted suppressing/overriding fact exists.

Substitution/supervision/cancellation against a nonexistent interrupted opportunity is rejected. A calendar-exception-suppressed opportunity cannot receive a disposition until the exception is reversed or no longer applies. An applicable exception also makes an exact authorized cancellation redundant/conflicting, so it is rejected. Corrupt multiple effective dispositions fail closed with an invariant error.

Suppression can remove normal occupancy from deterministic effective occupancy, but it never authorizes replacement occupancy automatically. Every new occupancy requires its own accepted fact, authorization and collision validation.

Before Special Activity exists, commands validate all currently canonical occupancy: effective normal timetable, active substitutions/supervisions, active make-up schedules, calendar suppression and other accepted 05C facts. Results must state that Special Activity collision is unavailable; they cannot claim full coverage.

## 10. Idempotency, concurrency and audit

Every mutation requires a request identity and fingerprint:

- same identity + same fingerprint replays the original result;
- same identity + different fingerprint returns controlled conflict;
- semantic uniqueness is independently enforced.

`ACTIVE → REVERSED` is a conditional CAS transition using the repository convention such as `expectedUpdatedAt`; stale transitions conflict. Multi-row create/reverse/replace and competing disposition commands use `SERIALIZABLE` unless a demonstrably safe narrower level preserves every invariant. Database unique/partial unique/exclusion constraints are backstops where representable. Exactly one conflicting disposition and exactly one active make-up claim per exact obligation may commit. Failure produces no partial state or success audit.

Business rows retain actor, request and source provenance. `AuditEvent` retains sanitized capability key, scope/resource, outcome, request identity and event/action. Grant internals, credentials, session hashes and broad raw requests are forbidden. Correlation is sufficient; no mandatory FK to an authorization-decision row is required.

## 11. Persistence direction for 05C1

The accepted future physical direction is:

1. `CalendarException` table family, with normalized scope/slot children where useful;
2. `OperationalLessonDisposition` table family using one constrained four-type table if database checks enforce type shape;
3. `MakeupTeachingSchedule` table family.

Assigned teacher is required for `SAME_SUBJECT_SUBSTITUTION` and `DIFFERENT_SUBJECT_SUPERVISION`, and absent for cancellation/absence. All facts are atomic: one exception date/scope/time selector, one disposition opportunity, one make-up obligation and target.

No generic operational ledger, Special Activity subtype, occurrence table, debt/progress/report state or mutable current-state row is accepted.

## 12. Special Activity gap and re-entry

Special Activity remains separate. This closure does not decide whether it suppresses, replaces, outranks or coexists with a normal occurrence or 05C fact. Its later slice must define occupancy scopes, staffing/participants, class/grade/school membership, collision, precedence/replacement and interaction with exceptions/dispositions.

Existing 05C facts are not silently invalidated when Special Activity arrives; activity commands must collision-check them. Until R22’s deferred domain is closed, no full `ResolvedLessonOccurrence` precedence or operational-readiness profile may claim activity coverage.

## 13. Explicit forbidden couplings

- Mutating `TimetableEntry` for operations or `TeachingAssignment` for substitution.
- Using current calendar/timetable/assignment/PPCT heads for historical meaning.
- PPCT counters, `debtClosed`, completion, execution confirmation, report totals or snapshot state on overlay rows.
- One mutable current operational-state row or God event spanning domains.
- Move/swap implementation or emulation.
- Inventing Special Activity precedence.
- Capability inference, `TIMETABLE_MANAGE` reuse, `SUBJECT_GROUP` implicit authority or `PERSONAL` authoritative mutation.
- Make-up without an exact obligation or make-up consuming a new PPCT item.
- Silently migrating future facts to new calendar/timetable heads.

## 14. Explicit non-scope

- Schema, migration, API, DTO/contract, seed/runtime capability, tests or UI.
- Move/swap and Special Activity persistence/precedence.
- Resolved occurrence persistence.
- TeachingExecution, progress/debt/late, reporting or snapshots.
- Personal absence-request workflow, enrichment or extra planned lesson.
- Deployment, production access or remote Git operations.

## 15. Implementation entry and sequence

The architecture entry gate is closed. The next planned slices, each requiring separate authorization, are:

1. **05C1 — Operational Overlay Persistence Foundation:** Prisma/schema/migration and database invariants only for the three table families, source/reversal/lifecycle/idempotency-support persistence; no public API, capability runtime, execution/debt/reporting, move/swap or Special Activity.
2. **05C2 — Operational Overlay Control Plane:** accepted capability/scopes, create/reverse/read commands, source validation, idempotency/CAS, bounded collision and deterministic historical reads; no Special Activity precedence claim.
3. Special Activity minimum core → ResolvedLessonOccurrence → TeachingExecution → Progress/debt/late → Reporting → immutable snapshots.

This ordering is planning guidance, not implementation authorization.
