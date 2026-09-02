# ADR-045 — Homeroom Responsibility

- **Status:** Proposed by `P1-010`; becomes Accepted only after explicit Product Owner approval and merge.
- **Date:** 2026-09-03
- **Scope:** Canonical GVCN responsibility semantics, history, authorization boundary, and downstream HĐTN `CLASS` resolution.
- **Task baseline:** `main@dd8ee41a3edb3eff04802d405bd402dd046528dd`
- **Traceability:** T13, T14

## Context

The original product requirements and reviewed source audits establish that class-level HĐTN uses the **effective homeroom teacher**. `LOCAL-FC-05A0-PPCT-TEACHING-EXECUTION-REPORTING-ARCHITECTURE-AUDIT.md` classified that rule as CONFIRMED while classifying the canonical homeroom domain itself as unresolved. ADR-010 and ADR-012 both explicitly deferred `HomeroomAssignment`; the defer was never re-entered before the original SpecialActivity minimum core was implemented.

P0/ADR-044 now requires that gap to be closed before HĐTN `CLASS` programme semantics may be implemented. This ADR defines the product/domain authority only. It does not create schema, migration, API, capability seed, UI, or runtime implementation.

## Decision

### 1. `HomeroomAssignment` is its own canonical responsibility domain

Homeroom responsibility is not a subtype of normal `TeachingAssignment`, not a free-text duty, and not an implicit property of `SchoolClass` or `User`.

The canonical business key is:

`AcademicYear + SchoolClass + effective civil-date interval -> one homeroom Teacher User`.

The domain is scoped directly to `AcademicYear`, not to `AcademicCalendarVersion`. Calendar revisions must not duplicate or rewrite homeroom responsibility history.

### 2. Civil-date effectivity is inclusive and retained

Each responsibility interval has:

- an inclusive `validFrom` civil `DATE`;
- an inclusive nullable `validUntil` civil `DATE`;
- one exact class within the same AcademicYear;
- one exact teacher User identity.

A null `validUntil` means open-ended within the operational academic-year envelope; it is not stored as a synthetic maximum date.

At most one non-reversed/current-truth homeroom assignment may be effective for the same `AcademicYear + SchoolClass` on any civil date.

Adjacent history is valid when the next interval begins on the civil day after the previous inclusive end.

Gaps are allowed in the data model. A downstream workflow that requires a GVCN on a date must fail closed when the date falls in a gap.

### 3. No unsupported uniqueness is invented on the teacher side

The source requirement establishes one effective GVCN for a class. It does **not** establish that one teacher can never be homeroom teacher of more than one class at the same time.

Therefore P1 must not add a teacher-side overlap/uniqueness rule without a separate Product Owner decision.

The first product contract also does not introduce co-homeroom teachers. If a future policy requires two simultaneous GVCN identities for one class/date, that is a new product requirement and must be registered before implementation; it must not be simulated by weakening the one-effective-GVCN invariant.

### 4. Teacher eligibility is professional, but not subject-specific

Creating or changing a homeroom assignment must require the selected teacher to be operationally eligible as teaching staff at command time:

- exact existing `User`;
- `User.status = ACTIVE`;
- canonical `StaffProfile` exists;
- `isTeachingStaff = true`.

No `StaffSubject` coverage is required merely to be GVCN, because homeroom responsibility is not a subject assignment.

A later User/profile status change does not rewrite historical HomeroomAssignment rows. Future workflows that need the assignment must validate current operational eligibility and fail closed rather than silently choosing another teacher.

### 5. SchoolClass and calendar rules

New/change commands require:

- the exact `SchoolClass` belongs to the same AcademicYear;
- the class is operationally usable at command time;
- exactly one active `AcademicCalendarVersion` exists for write validation;
- requested effectivity lies inside that active calendar's civil-date envelope.

Reads and historical resolution remain available even if there is no active calendar.

A candidate calendar activation must revalidate retained homeroom intervals against its operational envelope before activation. Calendar activation must never rewrite homeroom responsibility history.

This mirrors the established separation used by TeachingAssignment while keeping homeroom identity independent of calendar versions.

### 6. Responsibility changes preserve historical meaning

The public business lifecycle is explicit and bounded:

- create an initial/historical assignment;
- change teacher effective on an exact civil date;
- end an assignment on an exact civil date;
- read/list history;
- resolve the effective GVCN for one exact class/date.

There is no generic PATCH and no physical-delete public command for historically meaningful rows.

A legitimate teacher change is a transactional interval split: the prior responsibility ends on the civil day before the new assignment begins, and the replacement begins on the requested date.

Backdated entry is permitted inside the validated AcademicYear/calendar envelope so pre-operational history can be established explicitly. It is never inferred from the current teacher, current UI, AdditionalDuty, TeachingAssignment, timetable text, or activity staffing.

### 7. Data correction is explicit and must retain evidence

A data-entry correction is different from a real-world change of GVCN.

P1-011/P1-012 must provide a correction/reversal representation and command that:

- records actor, timestamp and mandatory reason;
- retains evidence of the prior assertion;
- produces a non-overlapping corrected current-truth interval set;
- never physically deletes historically referenced responsibility evidence;
- does not silently rewrite already materialized downstream activities, executions, or frozen Reporting Statements.

The exact physical columns/lineage mechanism are delegated to registered task `P1-011`; the semantic requirements above are binding and are not a new deferred item.

### 8. Dedicated management capability

Homeroom management receives a dedicated capability key:

`HOMEROOM_ASSIGNMENT_MANAGE`

The first supported management scope is `SCHOOL_WIDE` only, because the existing authorization model has no `CLASS` or `ACADEMIC_YEAR` scope and neither `SUBJECT`, `SUBJECT_GROUP`, nor `ACTIVITY` correctly represents school-wide GVCN administration.

`SYSTEM_ADMIN`, job title, being a vice principal, being a homeroom teacher, or being activity staff does not imply this capability.

A Phó Hiệu trưởng or other business administrator may operate the homeroom workspace only through an explicit active capability grant.

Capability catalog/seed/runtime changes are reserved to registered task `P1-012`; P1-010 only fixes the authority.

### 9. Internal resolution is exact and fail-closed

The domain must expose an internal deterministic resolver conceptually equivalent to:

`resolveEffectiveHomeroomTeacher(academicYearId, schoolClassId, civilDate)`.

It returns exactly one canonical assignment + teacher identity or a typed missing/invalid result. It must never:

- select the newest row regardless of date;
- fall back to `TeachingAssignment`;
- infer from `AdditionalDutyAssignment` or a duty label;
- infer from timetable/import text;
- infer from the current teacher when historical data is missing;
- use fuzzy name matching.

Public callers remain subject to their own capability rules. An internal resolver is not an authorization bypass.

### 10. HĐTN `CLASS` consumes homeroom responsibility, then freezes provenance

P4 HĐTN `CLASS` planning must resolve the effective GVCN on the exact planned occurrence civil date.

Before materialization:

- missing effective GVCN blocks the class-level occurrence;
- an ineligible effective teacher blocks the occurrence rather than silently selecting another teacher.

Current ADR-038 SpecialActivity participation minimum-core explicitly requires actual teacher to equal scheduled teacher and rejects arbitrary substitution. The earlier 05A0 audit separately recorded activity absence/substitution as unresolved. Therefore `P4-010` must explicitly close special-program absence/substitution and confirmation authority before `P4-040` may implement any broader replacement behavior. Until that accepted authority exists, homeroom resolution has **no fallback substitution rule**.

When a planned HĐTN class occurrence is materialized into the existing SpecialActivity runtime, downstream persistence must retain at least:

- the resolved teacher User identity;
- the exact HomeroomAssignment source identity/revision or equivalent immutable provenance required by P1-011/P4 architecture;
- the planned occurrence date.

A later GVCN change or correction must not silently rewrite already materialized SpecialActivity staffing, confirmed participation execution, or frozen statements. Any required downstream correction uses that downstream domain's explicit correction/reversal workflow.

### 11. `AdditionalDuty` is not a second GVCN identity source

Generic AdditionalDuty data may later participate in configurable workload adjustment/reporting policy, but it must not become a competing authority for **who is GVCN of a class on a date**.

If GVCN workload reduction/credit is implemented later, the policy must derive from canonical HomeroomAssignment history or an explicitly linked rule rather than requiring administrators to maintain the same homeroom identity independently in two authoritative places.

`HomeroomAssignment` existence by itself is **not evidence that an HĐTN teaching period occurred** and must not be counted as a teaching execution. HĐTN period credit comes only from the accepted special-program occurrence/participation execution evidence. A separate configurable GVCN duty-reduction policy, if applicable, belongs to the registered Business Configuration/workload path.

Workload calculation itself remains governed by registered Business Configuration / workload tasks and is not implemented by P1-010.

### 12. Historical and frozen downstream outputs remain stable

Homeroom data is a source of responsibility/provenance, not a mechanism for retroactively recalculating already frozen official records.

- current non-frozen planning may use corrected current-truth homeroom history;
- materialized activity staffing remains frozen until explicitly corrected in its own domain;
- confirmed participation execution retains its teacher evidence;
- submitted/approved Reporting Statements remain immutable under ADR-041–043.

## Persistence requirements delegated to P1-011

P1-011 must map this authority into Prisma/PostgreSQL with regression coverage for at least:

- same-AcademicYear class integrity;
- inclusive civil-date intervals;
- open-ended intervals;
- at most one effective current-truth GVCN per class/date;
- allowed teacher responsibility across different classes;
- retained correction/reversal evidence;
- parent deletion protection;
- indexes required for exact class/date resolution.

P1-011 may choose the exact correction-lineage/status column topology, but it may not weaken the invariants in this ADR.

## Control-plane requirements delegated to P1-012

P1-012 must implement and test:

- dedicated capability catalog/runtime authority;
- exact professional eligibility checks;
- create/change/end/correct/read/resolve commands;
- serializable or equivalently safe mutation semantics;
- same-transaction success audit;
- failed command writes no success audit;
- calendar-envelope and calendar-activation revalidation;
- no generic delete/PATCH;
- deterministic typed conflict handling.

## UI requirements delegated to P1-013

P1-013 may build a bounded administration workspace only after P1-012 closes. It must show effective history and gaps clearly and must not invent role/title-based authorization or local GVCN truth.

## Rejected alternatives

- Store `homeroomTeacherUserId` directly on `SchoolClass` as mutable current state.
- Reuse normal TeachingAssignment for GVCN.
- Infer GVCN from AdditionalDuty labels/assignments.
- Treat the latest row as the teacher for all historical dates.
- Permit two active GVCN identities for the same class/date without new authority.
- Require StaffSubject coverage for homeroom responsibility.
- Make `ACADEMIC_STRUCTURE_MANAGE`, `SUBJECT_MANAGE`, `SYSTEM_ADMIN`, job title, or HĐTN staffing implicitly authorize homeroom changes.
- Invent HĐTN substitute staffing inside HomeroomAssignment.
- Let a later GVCN change rewrite historical HĐTN staffing or frozen reporting.
- Hardcode a particular Phó Hiệu trưởng or position title as the manager.

## Implementation authorization

None. P1-010 is architecture authority only. Schema/migration is `P1-011`; control plane/capability changes are `P1-012`; administration UI is `P1-013`; HĐTN programme consumption and the unresolved special-program absence/substitution/confirmation boundary are `P4-010` and later registered P4 tasks.
