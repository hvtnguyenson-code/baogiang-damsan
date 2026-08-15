# LOCAL-FC-05D0D — Special Activity Decision Closure

## 1. Status and authority

**Status:** Accepted architecture decision closure; documentation only.

This closure follows and preserves `LOCAL-FC-05D0-SPECIAL-ACTIVITY-ARCHITECTURE-AUDIT.md` as historical evidence. It closes D1–D10 exactly once and establishes the accepted architecture entry criteria for a separately authorized 05D1 persistence foundation. It authorizes no schema, migration, API, capability seed/runtime, contract, test, UI, workflow, deployment or production mutation.

**Baseline:** `867f554b793a7a1c181fe99cef35448cbdcd0110` on parent audit commit `6e1dc2f303a6f64d01613c0286b215de4182380e`.

## 2. Closure mapping

| Decision | Affected audit questions | Accepted result |
|---|---|---|
| D1 | R1, R2, R17, R24 | No category enum/catalogue; title plus optional note only. |
| D2 | R1, R3, R4, R5, R18, R23 | One atomic root: year, retained calendar, civil date and one-or-more exact slot children. |
| D3 | R6, R7, R18, R23 | One CLASS/GRADE/SCHOOL_WIDE selector expands into frozen exact class targets. |
| D4 | R8, R9, R18, R19, R23 | One-or-more roleless scheduled teaching-staff children; frozen eligibility evidence. |
| D5 | R11, R14, R16, R18 | Activity suppresses targeted normal opportunities; mutually exclusive with disposition on the same opportunity. |
| D6 | R12, R13, R16, R18 | Interruption/exception suppress normal teaching only, not an explicit activity occurrence. |
| D7 | R15, R17, R19 | No PPCT item, completion, debt, progress or report semantics on activity scheduling. |
| D8 | R20, R22, R23 | Immutable `ACTIVE → REVERSED`, CAS reversal and forward correction. |
| D9 | R21, R22 | `SPECIAL_ACTIVITY_MANAGE / SCHOOL_WIDE`, default deny. |
| D10 | R10, R11, R14–R16, R22, R24 | `CANONICAL_CLASS_TEACHER_TIME_V1`; room/location is NOT_ASSESSED. |

## 3. Accepted aggregate topology and category boundary

The minimum core has one separate `SpecialActivity` aggregate root. The root itself is one atomic scheduled activity occurrence; there is no authored-event parent, occurrence/session subaggregate, multi-day root or recurring-series model.

The future persistence direction has exactly these aggregate-owned children:

1. `SpecialActivityTimeSlot` for exact retained `TimeSlotDefinition` identities.
2. `SpecialActivityClassTarget` for frozen exact `SchoolClass` identities.
3. `SpecialActivityStaffing` for scheduled teacher identities and frozen eligibility evidence.

There is no canonical activity category enum/catalogue in this minimum core. A root requires a bounded nonblank business title/label and may have an optional bounded note/description. Examples such as GDĐP, HĐTN-HN, ceremony, examination, training and extracurricular activity are not persisted as an authoritative type. A client-defined category string has no PPCT, execution, reporting or other downstream semantic effect. Future typed/catalogued classification requires a separate slice and must not rewrite historical activity identity.

## 4. Exact temporal and calendar provenance

One root pins exactly one `AcademicYear`, one exact retained `AcademicCalendarVersion`, one civil `DATE`, and one-or-more exact retained `TimeSlotDefinition` IDs. Selected slots belong to the same AcademicYear, match the civil-date weekday and are valid retained canonical slot evidence. Their real half-open intervals are the collision authority.

The root is reversed or corrected as one unit: its selected slots do not become separate activity roots and cannot be partly reversed. `AcademicWeek` remains derived read evidence, not stored activity identity.

The minimum core excludes session-only persistence, arbitrary wall-clock authoring, cross-midnight and partial-slot activity, multi-day roots and recurrence/series. Future activity does not silently migrate when calendar, slot, class or teacher state changes; stale future facts are corrected by reverse plus separately validated recreation.

## 5. Participant scope and frozen class targets

Each root has exactly one business target selector:

| Scope | Root selector shape | Frozen class-target expansion at creation |
|---|---|---|
| `SCHOOL_WIDE` | No grade or class selector | Every canonical class in the AcademicYear. |
| `GRADE` | Exact grade level 10, 11 or 12 | Every canonical class in that grade at command time. |
| `CLASS` | Exact SchoolClass in the AcademicYear | Exactly that class. |

Frozen class-target children are historical occupancy provenance. They are never recomputed from later class metadata. If class structure changes materially, existing facts remain historical and future-dated stale scope is corrected only by reverse plus recreate.

This is a business target model, not an authorization model. The minimum core excludes arbitrary multi-class selection, arbitrary groups, students, individual rosters, teacher-only activities and mixed custom participant sets. No deferred feature may be emulated through free text.

## 6. Staffing and eligibility

Every activity has one-or-more `SpecialActivityStaffing` children. Staffing is roleless: every child names one scheduled teacher occupied by the activity; there is no lead, assistant or supervisor enum. Duplicate teacher staffing in one activity is forbidden.

At command time each scheduled teacher must be an active canonical user/staff identity with a canonical `StaffProfile` and canonical teaching-staff flag. Staffing requires neither `TeachingAssignment` ownership nor subject/`StaffSubject` match because Special Activity has no expected subject. Eligibility is not mutation authorization.

The command freezes enough eligibility evidence/provenance to prevent later user, StaffProfile or status changes from rewriting historical staffing classification. Actual teacher participation and execution are future `TeachingExecution` evidence and are not stored as execution on `SpecialActivity`.

## 7. Cross-domain occupancy and normal-opportunity resolution

### 7.1 Accepted collision profile

The accepted minimum profile is `CANONICAL_CLASS_TEACHER_TIME_V1`:

- frozen target-class occupancy;
- scheduled-teacher occupancy;
- exact activity civil date plus retained slot half-open interval.

Activity creation checks currently canonical occupancy: effective normal timetable, active disposition, active make-up target, active Special Activity, calendar/exception normal-opportunity state, and teacher occupancy implied by effective normal/substitution/supervision/make-up state. Activity-vs-activity overlap on any frozen class target or scheduled teacher in overlapping slot time fails. An active make-up target is separate occupancy: activity never suppresses or consumes it; either creation order fails until the earlier fact is reversed or rescheduled.

The activity intentionally suppresses its own targeted base normal class opportunity. That base class occupancy is therefore not a rejection reason. Teacher collision remains real: a scheduled activity teacher occupied elsewhere by an effective normal lesson, substitution/supervision, make-up or activity in overlapping time causes failure.

### 7.2 Normal teaching semantics

For a target class/date/slot, `CalendarInterruption` may remove the normal opportunity and `CalendarException` may suppress it. If neither applies, an active `SpecialActivity` suppresses the normal opportunity. If no activity applies, an exact active `OperationalLessonDisposition` applies; otherwise base timetable applies.

An activity and an active disposition are mutually exclusive for the same effective normal opportunity. Creating an activity that would suppress an existing active disposition fails closed; creating a disposition against an activity-suppressed opportunity also fails closed. The operator must explicitly reverse/correct the prior fact. There is no silent override, automatic reversal, last-write-wins or coexistence mode. A corrupt ambiguous state fails closed.

### 7.3 Independent activity occurrence

`CalendarInterruption` and `CalendarException` define availability/suppression of normal teaching opportunities. They do not delete, hide or reverse an explicitly scheduled Special Activity. An activity may exist on a date/slot affected by either fact, while retained year/calendar/date/slot validity remains mandatory. It does not resurrect a normal lesson.

Future `ResolvedLessonOccurrence` must be able to expose both the normal-opportunity suppression source and the independent active activity occurrence. The system must not use one simplistic linear precedence chain that hides Special Activity behind interruption or exception.

## 8. PPCT and make-up boundary

Special Activity scheduling has no `ppctItemId`, distribution, completion, debt, `debtClosed`, progress or report-total state. Suppressing a normal lesson does not automatically complete, cancel, excuse or replace its original PPCT obligation. A later deterministic `ResolvedLessonOccurrence`, `TeachingExecution` and accepted progress/debt rules determine any consequence.

Activity neither manufactures a make-up obligation nor consumes a new PPCT item. Make-up remains ADR-031’s exact incomplete-obligation domain. Activity collision with active make-up is occupancy only, never precedence or fulfillment.

## 9. Lifecycle, correction, idempotency and audit

The only scheduling lifecycle is `ACTIVE → REVERSED`. Authorized creation produces immutable `ACTIVE` directly. There are no `DRAFT`, `CONFIRMED`, `APPROVED`, `CANCELLED` or `COMPLETED` Special Activity statuses.

Correction is forward-only:

1. CAS-reverse the active fact.
2. Retain reversing actor, `reversedAt` and bounded reason.
3. Optionally create a separately validated replacement.
4. Link predecessor/replacement where appropriate.

There is no physical delete or in-place semantic edit. Future scheduling and retrospective create/correction are permitted only within retained AcademicYear/calendar/date/slot validity.

Every mutation uses request identity and deterministic fingerprint: same key plus same fingerprint replays; the same key with another fingerprint conflicts. Reversal uses CAS. `SERIALIZABLE` protects mutation/collision decisions unless a stronger accepted repository mechanism applies. Child uniqueness, active-history/integrity backstops and useful semantic payload fingerprints are persistence requirements. Cross-resource collisions that cannot be expressed as a database constraint remain authoritative service-transaction invariants. Business rows and sanitized `AuditEvent` success evidence are transactional; no partial success or duplicate success audit is permitted.

## 10. Authorization

The minimum-core capability is exactly `SPECIAL_ACTIVITY_MANAGE` at `SCHOOL_WIDE` only. It authorizes create and reverse. Management read/list/get uses this same exact capability in 05D2 unless a later explicit read-only capability is designed. Authorization is default deny.

No authority is inferred from `SYSTEM_ADMIN`, `TIMETABLE_MANAGE`, `PPCT_MANAGE`, `CALENDAR_EXCEPTION_MANAGE`, `TEACHING_OPERATION_MANAGE`, generic `ACTIVITY` scope, role/title, TeachingAssignment, StaffSubject, staffing membership or frontend visibility. Business target CLASS/GRADE/SCHOOL_WIDE does not alter the mutation authority.

## 11. Historical drift and retained meaning

Retained calendar version, exact slot children, frozen class targets, staffing identity and eligibility evidence preserve the activity’s historical meaning. Later calendar, slot, class, user or staff-profile changes must not silently rebind or reinterpret it. A future fact whose source is no longer authoritative is corrected by reverse plus recreate; history is not migrated.

## 12. Room limitation and deferred scope

The repository has no authoritative Room/Location model. Therefore `ROOM COLLISION = NOT ASSESSED / NOT REPRESENTABLE` in 05D. This limitation must remain visible in architecture and future read-model claims; `CANONICAL_CLASS_TEACHER_TIME_V1` is not full physical-occupancy coverage. No Room table or location-collision rule is implied.

Deferred/non-scope: activity category catalogue/enum; arbitrary multi-class groups; student roster/enrollment and individual targeting; teacher-only activity; Room/Location; arbitrary wall-clock and recurring/multi-day activity; import; attachments; notifications; attendance; external participants; approval workflow; actual execution/teacher evidence; PPCT completion; progress/debt; reporting; snapshots; UI; make-up runtime expansion; and move/swap.

## 13. Explicit forbidden couplings

- Do not mutate `TimetableEntry`, `TimetableVersion`, `TeachingAssignment`, calendar or PPCT history to record activity.
- Do not reuse `CalendarException` or `OperationalLessonDisposition` as an activity subtype.
- Do not add PPCT, execution, progress/debt, report or snapshot state to activity scheduling.
- Do not invent category, roster, Room or authorization semantics through free text.
- Do not treat activity as a make-up obligation or normal subject completion.
- Do not claim full collision coverage or let interruption/exception erase a separately scheduled activity.

SPECIAL ACTIVITY ARCHITECTURE CLOSED — READY FOR 05D1 PERSISTENCE FOUNDATION
