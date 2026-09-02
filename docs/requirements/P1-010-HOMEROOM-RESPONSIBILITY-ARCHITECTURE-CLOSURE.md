# P1-010 — Homeroom Responsibility Architecture Closure

## Status

**PROPOSED / IN_REVIEW.**

- Task: `P1-010`
- Branch: `docs/homeroom-responsibility-architecture-010`
- Exact starting main: `dd8ee41a3edb3eff04802d405bd402dd046528dd`
- Primary traceability: T13, T14
- Additional deferred boundaries discovered and registered during review: T43, T44
- Scope: architecture/docs only
- No schema, migration, capability seed, API/runtime, UI, CI/CD, VPS or production mutation is authorized.

## 1. Why this task exists

The pre-pilot audit found that HĐTN `CLASS` was always expected to use the effective homeroom teacher, but the canonical homeroom responsibility model had been deferred repeatedly and never re-entered.

Evidence chain:

1. `ADR-010-ACADEMIC-CALENDAR-AND-CLASS-FOUNDATION.md` explicitly deferred `HomeroomAssignment` from the academic-structure foundation.
2. `ADR-012-TEACHING-ASSIGNMENT-FOUNDATION.md` explicitly deferred `HomeroomAssignment` again and separately established that multi-teacher GDĐP/HĐTN semantics do not belong in normal TeachingAssignment.
3. `LOCAL-FC-04-TIMETABLE-DOMAIN-SPEC.md` directly read the authoritative v1.2 OOXML and confirmed the special-activity boundary rather than forcing GDĐP/HĐTN into normal timetable staffing.
4. `LOCAL-FC-05A0-PPCT-TEACHING-EXECUTION-REPORTING-ARCHITECTURE-AUDIT.md` directly read the same pinned v1.2 source and states: class HĐTN uses the effective homeroom teacher; grade/school HĐTN and GDĐP may use multiple assigned teachers. The same audit marked the canonical homeroom domain unresolved.
5. P0 traceability rows T13/T14 therefore classify HomeroomAssignment as `RESTORE`, and accepted ADR-044 requires P1-010 before HĐTN programme implementation.

No source change trigger fired: the authoritative v1.2/v1.3 fingerprints remain those accepted by P0.

## 2. Existing architecture that must remain valid

P1-010 must not reopen or rebuild:

- `AcademicYear` / `SchoolClass` identity;
- retained/versioned calendar history;
- `TeachingAssignment` class+subject responsibility;
- capability default-deny semantics;
- SpecialActivity exact runtime/collision primitive;
- SpecialActivityParticipationExecution evidence;
- immutable/frozen Reporting Statement semantics.

Homeroom responsibility is added between those foundations; it does not replace them.

## 3. Questions closed by P1-010

| ID | Question | Closure |
|---|---|---|
| H1 | What is the canonical GVCN authority? | A separate date-effective `HomeroomAssignment` domain. Not SchoolClass current-state field, TeachingAssignment, AdditionalDuty text, timetable text or activity staffing. |
| H2 | Ownership | Direct `AcademicYear` ownership with same-year `SchoolClass`; not owned by calendar version. |
| H3 | Time semantics | Inclusive civil `DATE` interval `validFrom..validUntil`; null end is open-ended within operational year envelope. |
| H4 | Cardinality | At most one effective current-truth GVCN per class/date. Gaps allowed. No teacher-side one-class-only invariant is invented. |
| H5 | Co-homeroom | Not part of current authority. Do not simulate by weakening H4. A future explicit requirement must be registered first. |
| H6 | Teacher eligibility | ACTIVE User + canonical StaffProfile + `isTeachingStaff=true`; no StaffSubject requirement. |
| H7 | Calendar relationship | Writes validate against exactly one active calendar envelope; reads/history survive without an active calendar; calendar replacement does not rewrite assignments. |
| H8 | Real teacher change | Transactional interval split/end; explicit civil effective date. |
| H9 | Backdated history | Allowed through explicit command within validated envelope; never inferred from present state. |
| H10 | Data-entry correction | Explicit audited correction/reversal with retained prior evidence; no physical delete or silent in-place reassignment. Physical lineage shape belongs to P1-011. |
| H11 | Management authorization | New dedicated `HOMEROOM_ASSIGNMENT_MANAGE`, first supported at `SCHOOL_WIDE` only; no implicit SYSTEM_ADMIN/title/GVCN bypass. |
| H12 | Historical resolution | Exact `AcademicYear + SchoolClass + civilDate`; exactly one assignment or typed missing/invalid result; fail closed. |
| H13 | HĐTN `CLASS` | Resolve GVCN for exact occurrence date, then freeze resolved teacher + source homeroom provenance when the downstream occurrence is materialized. |
| H14 | Later GVCN change | Must not silently rewrite already materialized activity staffing, participation execution or frozen statements. |
| H15 | Workload relationship | Homeroom identity is one authority only. AdditionalDuty may not become a duplicate GVCN identity source; later workload policy derives from canonical homeroom data or an explicit linked rule. |

## 4. Why a separate domain is necessary

### Not a `SchoolClass.homeroomTeacherUserId`

A mutable current-teacher field cannot answer historical questions after a GVCN change and would cause previous HĐTN staffing to drift.

### Not a normal `TeachingAssignment`

TeachingAssignment answers one class + subject + date responsible teacher. GVCN has no subject dimension. Reusing that model would either require a fake subject or produce ambiguous ownership.

### Not `AdditionalDutyAssignment`

A generic duty can support configured workload policy, but a textual/catalog duty assignment is not safe authority for exact class/date identity. Using both would force administrators to maintain the same truth twice and create drift.

### Not SpecialActivity staffing

HĐTN `CLASS` needs homeroom responsibility **before** a SpecialActivity occurrence is materialized. Staffing is the downstream frozen result, not the upstream GVCN master authority.

## 5. Historical model and correction distinction

P1-010 distinguishes:

### A. Real-world lifecycle change

Example: GVCN A is responsible through 31/12; GVCN B takes over on 01/01.

Canonical history remains:

```text
A | 01/09..31/12
B | 01/01..open
```

The command is a business change, not a correction of the old history.

### B. Data-entry correction

Example: the system recorded A for 01/09..30/09, but signed school evidence shows B was actually GVCN for that interval.

The application must retain correction evidence and establish B as corrected current truth. It must not physically delete the old assertion or silently mutate already frozen downstream records.

The exact persistence topology for status/lineage/reversal is intentionally assigned to existing registered task `P1-011`. This is not an orphan deferral: P1-011 is the direct dependency-gated persistence task and may not weaken this closure.

## 6. Downstream HĐTN `CLASS` contract

The future P4 programme layer must use this sequence:

```text
AcademicYear + SchoolClass + occurrence civil date
                    |
                    v
       HomeroomAssignment resolver
                    |
          exact GVCN or BLOCK
                    |
                    v
      planned HĐTN CLASS occurrence
                    |
                    v
 materialize SpecialActivity runtime
                    |
      freeze teacher + source provenance
```

The resolver may not substitute another teacher because the assigned GVCN is inactive or missing. Missing/invalid responsibility is a data-readiness problem and blocks materialization unless a later explicitly accepted exception/substitution policy is introduced.

A later GVCN change affects later unresolved occurrences according to date effectivity. It does not alter already materialized occurrences.

## 7. Authorization closure

Current supported capability scopes are `PERSONAL`, `SUBJECT_GROUP`, `SUBJECT`, `ACTIVITY`, `SCHOOL_WIDE`; there is no class scope.

Reusing `SUBJECT_MANAGE` would be wrong because GVCN is not subject-owned. Reusing `ACTIVITY` would be wrong because the assignment exists independently of one activity. Reusing `ACADEMIC_STRUCTURE_MANAGE` would unnecessarily grant calendar/class-structure mutation to a person who may only need GVCN administration.

Therefore the architecture introduces a dedicated capability authority:

`HOMEROOM_ASSIGNMENT_MANAGE / SCHOOL_WIDE`.

This permits the Product Owner's intended operational model: a Phó Hiệu trưởng or other designated business administrator can manage GVCN data through an explicit grant, without hardcoding their title and without becoming a technical administrator.

P1-012 owns the capability catalog/seed/runtime implementation and must preserve ADR-008 default-deny behavior.

## 8. Required P1-011 persistence gates

P1-011 is not allowed to merge unless tests demonstrate:

- same-year class integrity;
- inclusive range semantics;
- open-ended range semantics;
- no overlapping effective current-truth rows for one class;
- adjacent assignment history is allowed;
- same teacher across different classes is not rejected merely by identity;
- retained correction evidence;
- parent deletion protection;
- deterministic indexable exact-date resolution.

It must not add a broad schema rewrite or couple homeroom rows to `AcademicCalendarVersion` ownership.

## 9. Required P1-012 control-plane gates

P1-012 must include:

- explicit create/change/end/correct/read/resolve commands;
- `HOMEROOM_ASSIGNMENT_MANAGE / SCHOOL_WIDE` checks on management endpoints;
- no implicit `SYSTEM_ADMIN` bypass;
- professional eligibility validation;
- active-calendar write envelope validation;
- candidate-calendar activation revalidation;
- concurrency-safe interval changes;
- same-transaction success audit;
- no success audit on failed mutation;
- no public generic PATCH/delete;
- exact conflict/error results.

## 10. Required P1-013 UI gates

The administration workspace must:

- show one AcademicYear at a time;
- show class, teacher and exact effective dates;
- display gaps and history rather than only the current teacher;
- expose explicit change/end/correct actions instead of arbitrary row editing;
- show that authority comes from capability, not position title;
- never infer or auto-fill historical GVCN from the current teacher.

## 11. Downstream dependency gate

`P4-010` may consume the HomeroomAssignment architecture after P1-010 is `CLOSED`, but P4 runtime implementation cannot materialize class HĐTN safely until the required P1 persistence/control plane dependencies are also closed according to the task register.

P4 must cite the exact HomeroomAssignment source identity/revision semantics accepted by P1-011 when it defines programme occurrence provenance.

## 12. No new orphan deferrals

P1-010 leaves no discovered current-pilot requirement only in prose.

- persistence details -> already registered `P1-011`;
- control plane/capability -> already registered `P1-012`;
- admin workspace -> already registered `P1-013`;
- HĐTN programme consumption -> already registered `P4-010` and downstream P4 tasks;
- workload adjustment -> already registered trigger-gated P4 workload tasks;
- special-program absence/replacement/substitute-teacher semantics discovered in 05A0 review -> traceability T43 and binding to `P4-010` / `P4-040`;
- special-program confirmation authority/topology discovered in 05A0 review -> traceability T44 and binding to `P4-010` / `P4-030` / `P4-040` / `P4-050`.

Co-homeroom is not a known current product requirement and is therefore not falsely registered as planned work. If the Product Owner later requires it, governance requires a new traceability/register entry before implementation.

## 13. Proposed authority

If this closure is explicitly approved and merged, `ADR-045-HOMEROOM-RESPONSIBILITY.md` becomes the controlling homeroom product/domain authority. P1-011/P1-012/P1-013 must implement it without reopening the closed business decisions unless new evidence triggers a registered architecture correction.
