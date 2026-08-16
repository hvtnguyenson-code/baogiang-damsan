# LOCAL-FC-05F0 — Teaching Execution / Báo giảng Architecture Audit

## 1. Status and scope

**Status:** Architecture audit implemented on `docs/local-fc-05f0-teaching-execution-architecture`; awaiting independent GitHub review.

This task closes only the Teaching Execution evidence architecture. It authorizes no schema, migration, application source, API, contract, capability catalog/seed, UI, workflow, deployment or production mutation. Progress, debt, late, workload, reporting projection, submission, approval and statement snapshots remain downstream.

## 2. Canonical baseline and predecessor status

- Canonical repository: `hvtnguyenson-code/baogiang-damsan`
- Canonical baseline: `07cba9d15b4335ac7d167ef11fa3ef21b66ee28a`
- LOCAL-FC-05E2: **CLOSED / GREEN** — PR #53, PR CI #210 PASS, merge `641d0ed94cf56b948888d1fc2870d60e5fc3f53f`, post-merge CI #211 PASS.
- LOCAL-FC-05E2B: **CLOSED / GREEN** — PR #54, final PR head `1731b7496c98961a96c09fd3b4aa7d397f7c679d`, authoritative PR CI #213 PASS, merge/current canonical main `07cba9d15b4335ac7d167ef11fa3ef21b66ee28a`, post-merge CI #214 PASS.

The 05E2B profile remains `PPCT_OCCURRENCE_ALLOCATION_V1` with `teachingExecution`, `completion`, `debt` and `reporting` all `NOT_ASSESSED`. 05F0 does not retroactively change that profile.

## 3. Authority and evidence inspected

The audit read the implementation addendum, 05A0 audit, 05A0D closure, ADR-027, ADR-031, ADR-034, ADR-036 and ADR-037 in full. It also inspected `prisma/schema.prisma`, the resolved-occurrence, PPCT allocation, operational-overlay and Special Activity modules, `packages/contracts/src/index.ts`, and the existing authorization, idempotency, CAS, transaction and audit conventions. Prototype UI was not treated as architecture authority.

Repository evidence confirms:

1. PPCT persistence retains the shared `AcademicYear + Subject + Grade` plan, exact version, stable item UUID, immutable item revision, lineage and date-effective class association.
2. Structural resolution is recomputed and separates `NORMAL_TIMETABLE_OPPORTUNITY`, `MAKEUP_TEACHING` and `SPECIAL_ACTIVITY`; a structural occurrence is not execution evidence.
3. `PPCT_OCCURRENCE_ALLOCATION_V1` deterministically emits exact direct distribution-obligation provenance and exact `PpctItemRevision`, while classifying normal allocation as `ALLOCATED`, `NOT_CONSUMED` or `BLOCKED` and make-up source state as `MATCH`, `MISMATCH` or `NOT_ASSESSED_HISTORY_BLOCKED`.
4. `NormalStructuralOccurrence.disposition.id` exposes the exact accepted `OperationalLessonDisposition` together with its type and assigned teacher. Operational dispositions retain responsible and assigned teacher identities separately; same-subject substitution is distinct from absence, supervision and authorized cancellation.
5. `MakeupStructuralOccurrence.target.id` is the exact `MakeupTeachingSchedule` identity. The schedule already retains separate original-obligation coordinates, optional original `sourceDispositionId`, target date/calendar/slot and scheduled teacher, but no public creation runtime exists.
6. Special Activity is one atomic root with exact slot children, frozen class targets and roleless staffing children. Class targets do not define teacher workload cardinality.
7. Existing mutation conventions use request key plus deterministic fingerprint, CAS reversal, `SERIALIZABLE` where competing facts are decided, database backstops and transactionally coupled success audit.
8. Authorization is default-deny and exact-scope. `PERSONAL` normalizes to the actor; `SUBJECT` needs an exact resource; `SCHOOL_WIDE` is explicit. No cross-scope or role/title inference exists.
9. There is no TeachingExecution model, contract, controller, capability or runtime.
10. The current allocation service opens its own read-only `RepeatableRead` transaction. Its internal snapshot method is not an exposed `resolveInTransaction(tx, input)` contract, which is the precise future 05F2 refactor boundary.

No repository evidence contradicts the locked 05F0 decisions or requires reopening ADR-027, ADR-031, ADR-034, ADR-036 or ADR-037.

## 4. Domain boundary

Teaching execution is authoritative evidence that teaching or participation actually occurred. It is not a timetable row, PPCT row, mutable Báo giảng line, progress counter, debt row, submitted statement or approval row.

```text
planning + operational facts + allocation + execution evidence
  -> future Báo giảng/report projection
  -> future immutable submitted/approved statement snapshot or manifest
```

A report row never becomes the source of execution truth. A later immutable statement may continue to reference an execution that is subsequently reversed; correction of source evidence does not rewrite that historical statement.

## 5. Two execution evidence families

### 5.1 `CURRICULAR_TEACHING_EXECUTION`

The conceptual persistence family is `CurricularTeachingExecution`. It covers eligible normal teaching and make-up teaching and fulfills exactly one direct PPCT distribution obligation. Its minimum source discriminator is only `NORMAL | MAKEUP`.

It is not split into separate normal/make-up tables: both kinds share the same curricular obligation topology and exactly-once fulfillment invariant. A nullable polymorphic God aggregate spanning curricular and Special Activity semantics is prohibited.

### 5.2 `SPECIAL_ACTIVITY_PARTICIPATION_EXECUTION`

The conceptual persistence family is `SpecialActivityParticipationExecution`. It represents actual participation by one exact scheduled staffing teacher in one exact selected activity slot. It has no PPCT distribution, completion, debt or class-subject progress meaning and therefore remains physically separate from curricular execution.

## 6. Closed decision audit D1–D20

| ID | Accepted architecture | Repository consistency evidence |
|---|---|---|
| D1 | Execution is immutable evidence of reality, not report state. Reports are downstream projections; official statements are later immutable snapshots/manifests. | ADR-027 separates execution, derived progress and official snapshots; no report/execution persistence exists. |
| D2 | Two persistence families: curricular fulfillment and Special Activity teacher-slot participation. No nullable God aggregate. | ADR-034 makes activity independent and PPCT-free; ADR-036 keeps independent structural families. |
| D3 | Curricular execution pins two non-collapsible bundles: exact original distribution-obligation/base provenance and exact actual-execution date/calendar/slot/week/segment/teacher provenance. The deterministic obligation key is convenience only. | Schema and 05E2B expose the original tuple; structural normal and make-up results expose the exact actual occurrence source coordinates. |
| D4 | Normal execution is allowed only for `ALLOCATED` base teaching or `ALLOCATED` `SAME_SUBJECT_SUBSTITUTION`. Every suppression, cancellation, absence, supervision, `BLOCKED`, `NOT_CONSUMED`, exhaustion or ambiguous replay fails closed. | ADR-031 outcome table and allocation `consumptionDecision()` distinguish distribution from completion eligibility. |
| D5 | Actual teacher is server-derived: responsible teacher for base; exact active disposition assigned teacher for same-subject substitution. A substitution execution also retains that exact disposition identity. Responsible ownership is unchanged. | Structural occurrence returns responsible teacher plus exact `disposition.id`, type and assigned teacher; ADR-027/031 forbid assignment mutation. |
| D6 | V1 actual curricular content is exactly the allocated item/revision for normal and the retained original item/revision for make-up. A bounded note has no semantic effect. | Exact immutable revision is available; no approved alternate-content source exists. |
| D7 | Make-up requires exact ACTIVE schedule and source allocation `MATCH`; execution retains exact `makeupTeachingScheduleId`, its target execution coordinates and scheduled teacher separately from the original obligation bundle. It consumes no item. Public schedule creation remains deferred. | Structural `target.id` and persisted schedule provide exact schedule identity plus separate original/target provenance; 05E2B exposes the three source-match states. |
| D8 | At most one ACTIVE curricular execution across NORMAL and MAKEUP fulfills one exact direct obligation. Reversed evidence retains history and relinquishes current completion credit. | ADR-027/031 require exactly-once fulfillment; allocation emits one exact direct obligation identity. |
| D9 | Curricular kinds are only `NORMAL` and `MAKEUP`; base/substitution are retained normal provenance, not extra execution kinds. | Other operational types represent negative or incomplete facts, and Special Activity is separate. |
| D10 | Special Activity participation unit is exact `SpecialActivity + SpecialActivityStaffing + SpecialActivityTimeSlot`. | Current root has separate unique staffing and slot children; class targets are separate frozen provenance. |
| D11 | Activity must be ACTIVE; both children must belong to it; scheduled teacher must match staffing; corrupt/colliding structure fails closed. One teacher-slot counts once, unaffected by class-target count. | ADR-034 and current schema enforce root/child ownership and activity scheduling cardinality. |
| D12 | No future execution. In `Asia/Ho_Chi_Minh`, retained slot end on the execution civil date must be at or before the server instant. Civil dates remain DATE semantics. | Time slots retain wall-clock end and civil dates use PostgreSQL DATE; repository conventions avoid host-local-midnight meaning. |
| D13 | Lifecycle is immutable `ACTIVE -> REVERSED`; creation is ACTIVE. Correction uses CAS reversal and optional separately validated replacement with linkage. No edit/delete or report-state statuses. | Overlay/activity lifecycle, CAS and replacement conventions provide the accepted precedent. |
| D14 | Creation validates current-authoritative retained facts; later reversal/replacement of the accepted disposition or make-up schedule does not mutate or rebind execution to a replacement source. Disagreement is downstream source drift/reconciliation, not a new execution status. | ADR-031 retains immutable source identities; ADR-036/037 require future execution to pin accepted exact provenance. |
| D15 | Curricular confirmation pins one unambiguous retained calendar/week-segment/week containing the civil date. Missing/ambiguous mapping fails closed. Activity calendar/date/slot is mandatory; week/segment may be absent outside academic segments. Never derive ISO week. | Calendar schema retains exact weeks/segments; ADR-034 permits explicit activity independently of normal teaching availability. |
| D16 | Retain bounded display snapshots: curricular class code/name, subject code/name and responsible/actual teacher names; activity title and scheduled/actual teacher name. IDs remain authority; PPCT revision retains sequence/title/type. | Mutable master labels exist while exact PPCT revision fields are immutable. |
| D17 | Passage of time or missing execution is not a negative fact. No debt/late state is stored by 05F. | ADR-031 owns absence/supervision/cancellation facts; ADR-027 makes progress/debt derived. |
| D18 | Future capabilities are `TEACHING_EXECUTION_RECORD / PERSONAL` and `TEACHING_EXECUTION_MANAGE / SUBJECT, SCHOOL_WIDE`, with exact actor/actual-teacher and subject rules. Activity has no SUBJECT semantics. No authority inference. | Existing authorization supports exact PERSONAL/SUBJECT/SCHOOL_WIDE matching and default deny. Capability implementation remains future work. |
| D19 | Every mutation uses request key + semantic fingerprint; replay/conflict semantics, CAS reversal, `SERIALIZABLE`, uniqueness and success audit in the business transaction are mandatory. | Operational overlay and Special Activity services implement the same accepted pattern. |
| D20 | 05F2 must add a tx-aware allocation boundary and run resolution/validation/insert in one outer `SERIALIZABLE` transaction. Existing `resolve(input)` remains read-only `RepeatableRead`. | Current service exposes `resolve(input)` and a private snapshot path; a public tx-aware allocation method does not yet exist. |

### 6.1 Original-obligation and actual-execution coordinate bundles

Every `CurricularTeachingExecution` must keep two explicitly named and non-collapsible provenance bundles.

**Original distribution-obligation provenance** retains exact:

- `AcademicYear`, `SchoolClass`, `Subject` and `sourceNormalOccurrenceKey`;
- `PpctClassAssociation`, `PpctPlan`, `PpctVersion`, `PpctItem` and `PpctItemRevision`;
- original/base `TimetableVersion`, `TimetableEntry`, source civil date, source `AcademicCalendarVersion`, source `TimeSlotDefinition`, `TeachingAssignment` and responsible teacher.

**Actual execution occurrence provenance** retains exact:

- execution civil date;
- execution `AcademicCalendarVersion` and `TimeSlotDefinition`;
- execution `AcademicWeek` and `AcademicWeekSegment`;
- actual teacher.

For NORMAL, actual execution date/calendar/slot are those of the exact resolved normal occurrence and therefore equal the original occurrence coordinates. For MAKEUP, actual execution date/calendar/slot are the exact schedule target and can differ from the original obligation. Equality in NORMAL does not authorize collapsing the conceptual bundles; MAKEUP requires both.

### 6.2 Constrained curricular source shape

Future persistence must express discriminator-backed source provenance equivalent to:

| Curricular kind/source | `operationalLessonDispositionId` | `makeupTeachingScheduleId` | Required relational meaning |
|---|---|---|---|
| `NORMAL / BASE_TIMETABLE` | MUST be null | MUST be null | Actual teacher is the responsible teacher; original and execution coordinates identify the same resolved normal occurrence. |
| `NORMAL / SAME_SUBJECT_SUBSTITUTION` | MUST be non-null | MUST be null | References the exact accepted disposition for the same source normal occurrence; actual teacher is that disposition's assigned teacher. |
| `MAKEUP` | Not independently authored from the schedule | MUST be non-null | References the exact accepted schedule; target date/calendar/slot and scheduled teacher equal the execution bundle. |

The NORMAL operational source classification is constrained to `BASE_TIMETABLE | SAME_SUBJECT_SUBSTITUTION`. Absence, supervision and cancellation are not execution variants. A substitution row cannot retain only an actual-teacher ID or classification string: it must retain relational provenance to the exact disposition, with 05F1 responsible for a composite FK or equally strong database backstop preventing an unrelated disposition.

For MAKEUP, `makeupTeachingScheduleId` is the authoritative execution-opportunity source. The schedule's optional `sourceDispositionId` already preserves the original incomplete operational fact. Execution should access that frozen provenance through the exact schedule. If 05F1 denormalizes `sourceDispositionId`, database invariants must keep it exactly equal to the schedule value and clients cannot author it independently.

## 7. Curricular confirmation semantics

### 7.1 NORMAL

Within one future outer `SERIALIZABLE` transaction, the server identifies exact year/class/subject/normal occurrence key; resolves allocation through the civil date; finds the exact normal allocation; requires `ALLOCATED`; accepts only base or same-subject substitution; retains `BASE_TIMETABLE` with null disposition identity or retains the exact accepted substitution `OperationalLessonDisposition` identity; derives actual teacher; sets execution date/calendar/slot from the exact normal occurrence; checks the retained slot end gate; resolves exact execution week/segment; checks no ACTIVE fulfillment owns the exact obligation; and inserts immutable execution plus sanitized audit atomically.

The client supplies neither a replacement PPCT item nor an actual teacher.

### 7.2 MAKEUP

Within that same transaction, the server loads and retains the exact ACTIVE `makeupTeachingScheduleId`, derives source/target stream, resolves allocation through target date, requires source `MATCH`, keeps the original obligation bundle separate from the schedule target execution bundle, checks target slot end, derives the scheduled teacher, resolves exact target week/segment, verifies no ACTIVE execution fulfills the original direct obligation, and inserts immutable MAKEUP evidence plus audit atomically.

The operation never chooses the current next item and never creates a second distribution obligation.

## 8. Special Activity confirmation semantics

Within one future `SERIALIZABLE` transaction, the server loads the exact ACTIVE activity; verifies exact staffing and activity-slot children; validates retained calendar/date/slot provenance and structural trustworthiness; derives the actual teacher from staffing; checks that exact slot has ended; enforces no existing ACTIVE participation for the same activity/staffing/activity-slot; and inserts immutable participation plus audit atomically.

No class fan-out execution rows are created.

## 9. Time, week and display evidence

The business timezone is `Asia/Ho_Chi_Minh`. Slot-end validation must combine the retained civil date and exact retained wall-clock slot end in that timezone, then compare the resulting instant with the server clock. Host timezone and local-midnight arithmetic are not authoritative.

Curricular execution requires exactly one valid `AcademicWeekSegment -> AcademicWeek` mapping for the date and pins both identities plus the calendar version. Activity participation always pins calendar/date/slot; its week/segment is nullable only when the explicit activity validly falls outside an academic-week segment.

Exact IDs remain authority. Bounded label snapshots prevent later class, subject, user or activity label changes from rewriting evidence. The exact PPCT revision remains the source for sequence, title and lesson type.

Future Báo giảng/reporting must be able to distinguish original curricular obligation date/slot from actual execution date/slot, responsible teacher from actual teacher, and the exact substitution disposition or make-up schedule when applicable. This evidence-sufficiency requirement does not implement reporting.

## 10. Authorization matrix

| Command/resource | Capability and scope | Mandatory resource rule |
|---|---|---|
| Own curricular confirm/read/correct | `TEACHING_EXECUTION_RECORD / PERSONAL` | Server-derived actual teacher must equal actor. |
| Own activity participation confirm/read/correct | `TEACHING_EXECUTION_RECORD / PERSONAL` | Actor must equal exact staffing scheduled teacher. |
| Manage curricular execution for another teacher | `TEACHING_EXECUTION_MANAGE / SUBJECT` | Exact persisted curricular subject must match the grant resource. |
| Manage all curricular execution | `TEACHING_EXECUTION_MANAGE / SCHOOL_WIDE` | School-wide explicit grant. |
| Manage activity participation for another teacher | `TEACHING_EXECUTION_MANAGE / SCHOOL_WIDE` | Activity participation has no SUBJECT meaning. |

`TEACHER_BASE`, `SYSTEM_ADMIN`, `TIMETABLE_MANAGE`, `PPCT_MANAGE`, `TEACHING_OPERATION_MANAGE`, `SPECIAL_ACTIVITY_MANAGE`, role/title, TeachingAssignment, StaffSubject, SubjectGroupMembership, AdditionalDuty and frontend visibility imply nothing. Actor and actual-teacher identities stay distinct when a manager acts.

## 11. Idempotency, concurrency and one-snapshot runtime boundary

Create, reverse and replace commands require bounded request keys and deterministic semantic fingerprints. Same key/same fingerprint is replay; same key/different fingerprint is conflict. Reversal is CAS against ACTIVE evidence. Database constraints must backstop one ACTIVE curricular fulfillment per exact direct obligation, one ACTIVE activity participation per activity/staffing/activity-slot, request identities, and reversal/replacement linkage.

Business writes and sanitized `AuditEvent` success evidence share the same transaction; failed commands emit no success audit. Execution decisions use `SERIALIZABLE` unless implementation proves an equally safe narrower mechanism.

05F2 must refactor allocation equivalently to:

```text
PpctOccurrenceAllocationService.resolveInTransaction(tx, input)
```

`resolve(input)` must remain and keep opening its own read-only `RepeatableRead`. Execution confirmation opens the one outer `SERIALIZABLE` transaction and reuses allocation, structural resolution, calendar/week resolution and source validation on that same transaction client. It must never call `resolve()` and thereby open a nested transaction or introduce a validation/insert TOCTOU gap.

## 12. Scenario matrix

| ID | Scenario | Expected outcome |
|---|---|---|
| A | BASE normal allocated A; responsible teacher confirms after slot. | Create ACTIVE NORMAL execution; actual teacher is responsible teacher; A is fulfilled. |
| B | BASE normal before slot end. | Reject as premature/future evidence. |
| C | SAME_SUBJECT_SUBSTITUTION allocated A. | Create only with assigned substitute as actual teacher; retain base responsible teacher. |
| D | ABSENCE_NO_REPLACEMENT allocated A. | Reject execution; A remains incomplete for downstream projection. |
| E | DIFFERENT_SUBJECT_SUPERVISION allocated A. | Reject curricular execution; A remains incomplete. |
| F | AUTHORIZED_CANCELLATION. | No allocation and no execution. |
| G | SpecialActivity-suppressed normal. | No normal execution. |
| H | Active make-up schedule; source `MATCH`. | MAKEUP fulfills original A; consumes no new item. |
| I | Make-up source `MISMATCH`. | Reject fail-closed. |
| J | Make-up source `NOT_ASSESSED_HISTORY_BLOCKED`. | Reject fail-closed. |
| K | NORMAL already actively fulfills A; make-up tries A. | Exactly-once conflict. |
| L | MAKEUP actively fulfills A; another make-up/normal tries A. | Exactly-once conflict. |
| M | Execution for A is REVERSED. | Retain history; a separately validated replacement may become ACTIVE. |
| N | One activity: 2 classes x 2 teachers x 3 slots. | Maximum planned participation confirmations are 2 x 3 = 6, not 12. |
| O | Same activity teacher-slot confirmed concurrently twice. | Exactly one ACTIVE participation commits. |
| P | Master display name changes after execution. | Pinned IDs/snapshots and immutable PPCT revision preserve accepted evidence. |
| Q | Upstream overlay is later reversed. | Existing execution is unchanged; downstream reconciliation reports source drift. |
| R | Client supplies another actual teacher or alternate PPCT item. | Reject or do not accept the fields. |

### 12.1 Source-provenance correction scenarios

| ID | Scenario | Expected outcome |
|---|---|---|
| S1 | BASE normal execution. | Original and execution coordinates are equal; `operationalLessonDispositionId` and `makeupTeachingScheduleId` are null. |
| S2 | SAME_SUBJECT_SUBSTITUTION. | Original and execution coordinates are equal; exact disposition identity is retained; actual teacher is derived from that disposition. |
| S3 | Accepted substitution disposition is later reversed/replaced. | Existing execution still references the original accepted disposition and is never rebound. |
| S4 | MAKEUP fulfills obligation A from 2026-09-07 at target 2026-09-21. | Original bundle remains 2026-09-07; execution bundle is 2026-09-21; exact make-up schedule identity is retained. |
| S5 | Accepted make-up schedule is later reversed/replaced. | Existing execution remains pinned to the original accepted schedule and is never rebound. |
| S6 | Persistence collapses a MAKEUP original and target into one date/slot bundle. | Invalid topology; 05F1 must reject the design because both temporal bundles are mandatory. |

## 13. Downstream and make-up boundaries

05F does not create weekly/monthly/semester/annual reports, statements, submission, approval, hash, lock or snapshot. Future report projections may display execution. A later statement freezes its own historical evidence and is never silently regenerated after execution correction.

05F also persists no distributed/completed/debt counts, open debt, late, ahead/behind or `debtClosed`. Future Progress derives distribution from allocation/operations, completion from valid ACTIVE curricular execution and open debt from accepted policy. Special Activity participation never enters curricular completion or debt.

Although `MakeupTeachingSchedule` persistence exists, public runtime creation remains deferred until authoritative incomplete-obligation/debt proof is closed. 05F evidence is an input to that later proof; 05F1/05F2 must not expose or broaden make-up scheduling without a separate decision.

## 14. Implementation sequence and non-scope

Required sequence:

```text
05F0 Teaching Execution architecture closure
-> 05F1 Teaching Execution persistence foundation
-> 05F2 Teaching Execution control plane / Báo giảng evidence runtime
-> 05G0 Progress / Debt / Late architecture closure
-> Progress / Debt / Late implementation
-> Reporting projection
-> Submission / Approval snapshot
-> Cross-domain closure
-> CORE BACKEND FREEZE
-> UI business completion
```

05F1 and 05F2 remain distinct. Exact physical field names are implementation concerns, but the two persistence families, provenance, lifecycle, uniqueness and transaction invariants are mandatory.

Hard non-scope includes schema/migration/runtime/API/contracts/capability seed/UI; progress/debt/late/workload/report totals; reporting/submission/approval/snapshot; PPCT import; move/swap; alternate content/item/teacher; attendance/roster; Room/Location; notifications; AI; deployment; production migration; and production data mutation.
