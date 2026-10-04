# ADR-057 — Workload Adjustment and Official Teacher Workload Architecture

- **Status:** Accepted — P4-060 CLOSED by `SYNC-P4-060`
- **Task:** P4-060
- **Traceability:** T21, T23, T49
- **Canonical start:** `main@e1be4a486caf57357c0fcec6f47eceb6b873ec0a`
- **Parent reviewed head:** `7bf3ca2b30b27f257035acf814cdeca10a708da0`
- **Parent PR:** #189
- **Exact-head parent CI:** #626 / run `37168759382` — **SUCCESS**
- **Parent merge/main:** `db5f08912f41606d80c4b7c66fbfea42b3f7d039`
- **Authoritative parent post-merge CI:** #627 / run `37169147105` — **SUCCESS**
- **Closure:** `SYNC-P4-060`

## Context

The FULL BUSINESS pilot requires official workload figures that are correct when teachers have additional duties, percentage reductions or an override norm. Phase 01 deliberately deferred `WorkloadAdjustmentRule` while reserving `TRU_TIET`, `TRU_PHAN_TRAM`, `GHI_DE`, `priority` and effectivity. P1-020/P1-021 later established retained typed Business Configuration as the only authority for school business policy that changes over time.

Current runtime already has two important workload ingredients but not the complete official workload claim:

1. `P4-050` computes confirmed GDĐP/HĐTN-HN teacher-slot workload credits from actual execution plus programme attestation, using the retained `SPECIAL_PROGRAMME_WORKLOAD` policy.
2. `CurricularTeachingExecution` retains exact actual teacher and execution date for ordinary, substitute and make-up teaching, but ADR-041 explicitly deferred actual curricular workload aggregation.

Therefore applying only a norm reduction would still leave the FULL BUSINESS claim incomplete. P4-060 closes both the required-norm adjustment semantics and the missing actual curricular workload aggregation needed by P0-003.

## Decision

### D1. One official workload projection, two independent sides

P4-061 must expose a deterministic official teacher workload projection with two independent quantities in the same unit, **teaching-period equivalents**:

- **earned workload credit** — work actually evidenced as performed by the target teacher in the requested period;
- **required workload credit** — the teacher's date-effective adjusted norm for the same period.

`varianceCredit = earnedCredit - requiredCredit`.

Curricular progress/completion remains a separate responsibility/accounting domain. Workload never rewrites PPCT ownership, TeachingAssignment responsibility, debt or completion.

### D2. Earned curricular workload belongs to the actual teacher

Each current-authoritative ACTIVE `CurricularTeachingExecution` contributes exactly `1` earned credit to its `actualTeacherUserId`, using `executionCivilDate` for period inclusion.

This applies to:

- base `NORMAL` execution — actual teacher receives 1;
- `NORMAL / SAME_SUBJECT_SUBSTITUTION` — substitute actual teacher receives 1; responsible teacher receives no workload credit for that execution;
- `MAKEUP` — actual teacher receives 1 on the make-up execution date; the original PPCT obligation is still fulfilled exactly once and no new PPCT item is created.

`REVERSED` executions contribute zero. Replacement chains credit only the current ACTIVE execution. Absence, cancellation and different-subject supervision do not fabricate curricular execution credit.

### D3. Special-programme earned workload is reused, not recomputed

P4-061 must reuse the accepted P4-050 `SpecialProgrammeWorkloadProjection` result. It must not build a second GDĐP/HĐTN workload engine.

`earnedCredit = curricularExecutionCredit + specialProgrammeWorkload.totalCredit`.

Generic ad-hoc `SpecialActivity` without accepted programme materialization provenance remains outside official special-programme workload.

### D4. `WORKLOAD_ADJUSTMENT` is a closed Business Configuration family

Adjustment authority is a new typed family:

- family: `WORKLOAD_ADJUSTMENT`;
- resource: exact `ACADEMIC_YEAR`;
- validator: `v1`;
- publication: enabled;
- management authority: existing `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE`.

No `SystemSetting`, environment value, title/role string, hard-coded duty name, caller payload or fallback constant is authority.

No separate Prisma `WorkloadAdjustmentRule` table is required. A logical rule is retained inside the immutable/versioned Business Configuration payload, while assignments/responsibilities remain in their canonical source domains.

### D5. V1 payload

V1 payload shape is closed as:

```json
{
  "baseWeeklyNorm": 17,
  "rules": [
    {
      "ruleId": "homeroom",
      "source": { "kind": "HOMEROOM_RESPONSIBILITY" },
      "calculation": "TRU_TIET",
      "value": 4,
      "priority": 100
    },
    {
      "ruleId": "additional-duty-example",
      "source": {
        "kind": "ADDITIONAL_DUTY",
        "dutyDefinitionId": "<uuid>"
      },
      "calculation": "TRU_PHAN_TRAM",
      "value": 20,
      "priority": 200
    }
  ]
}
```

Rules are a finite ordered list. `ruleId`, `priority` and source selector are unique within one policy version. `baseWeeklyNorm` and numeric values are finite and non-negative. `TRU_PHAN_TRAM` is bounded to `0..100`.

### D6. Rule source authority

V1 supports exactly two source kinds:

1. `ADDITIONAL_DUTY` — the rule references one exact retained `AdditionalDutyDefinition.id`; it applies on a civil date when the target teacher has at least one qualifying date-effective `StaffAdditionalDutyAssignment` for that definition.
2. `HOMEROOM_RESPONSIBILITY` — the rule derives directly from canonical date-effective `HomeroomAssignment` history. No duplicate AdditionalDuty assignment is required for GVCN.

One rule applies at most once per teacher/date even if multiple assignments/scopes or multiple homeroom classes match. Source cardinality must never multiply the reduction.

Additional-duty scope remains organizational assignment provenance; it is not authorization and does not multiply a rule. Current `isActive` catalog state must not erase retained historical assignment meaning.

Because AdditionalDuty definition/assignment validity is persisted as absolute instants while this projection is civil-date based, P4-061 must project those boundaries to `Asia/Ho_Chi_Minh` civil dates: start date is inclusive; the civil date of a non-null `validUntil` is exclusive. Host timezone, UTC date slicing and an arbitrary time-of-day probe are forbidden. HomeroomAssignment keeps its canonical civil-date semantics.

### D7. Calculation order and formulas

Applicable rules are sorted by ascending unique `priority`. Starting value is `baseWeeklyNorm`.

For running value `N`:

- `TRU_TIET(v)` => `N = max(0, N - v)`;
- `TRU_PHAN_TRAM(p)` => `N = max(0, N * (1 - p / 100))`;
- `GHI_DE(v)` => `N = v`.

`GHI_DE` does not terminate the chain; lower-priority rules still apply. This makes `priority` an explicit and testable part of the business result.

Calculations use deterministic decimal arithmetic. Inputs support at most four fractional decimal places; no binary floating-point drift may change semantic hashes. Intermediate computation is not rounded; published projection values are rounded to four decimal places only at defined output boundaries.

### D8. Date-effective adjusted weekly norm

For every workload-eligible civil date, P4-061 resolves the exact authoritative `WORKLOAD_ADJUSTMENT` policy version for that AcademicYear/date, derives applicable source facts for that teacher/date, applies the ordered chain and produces an `adjustedWeeklyNorm` with complete provenance.

A policy change, duty-assignment change or homeroom change may split the reporting range into different adjustment segments. No latest/current shortcut may rewrite an earlier date.

### D9. Required workload for an arbitrary reporting range

Reporting already accepts inclusive arbitrary civil-date ranges, so required workload must be partition-additive rather than assuming whole calendar weeks.

For each civil date `d` in the requested range:

1. resolve exactly one authoritative AcademicCalendarVersion for the AcademicYear/date;
2. `d` is workload-eligible only when its weekday is in that calendar version's `teachingWeekdays` and no `CalendarInterruption` suppresses that date;
3. let `W(d)` be the adjusted weekly norm and `K(d)` be the number of configured teaching weekdays in that calendar version;
4. daily required credit is `W(d) / K(d)`;
5. `requiredCredit` is the sum across eligible dates, rounded to four decimals at the final output boundary.

An empty `teachingWeekdays` authority is corrupt and blocks. `CalendarException` and class-specific schedule suppression do not silently change the employment norm; only the school calendar/interruption authority participates in this V1 denominator.

This civil-date formulation makes adjacent reporting ranges additive and handles mid-week duty/policy changes deterministically.

### D10. Missing or corrupt authority fails closed only where required

If a reporting range contains at least one workload-eligible date, missing/ambiguous/corrupt `WORKLOAD_ADJUSTMENT` authority blocks the official workload projection. There is no default `baseWeeklyNorm`.

If the range contains zero workload-eligible dates, required credit is exactly zero and absence of adjustment policy does not fabricate a blocker solely for that empty target.

Source reference corruption, ambiguous retained assignment/responsibility or calendar ambiguity blocks with typed findings; it never silently skips a rule.

### D11. Snapshot V4 freezes official workload provenance

P4-061 must introduce `REPORTING_STATEMENT_SNAPSHOT_V4`, preserving V1/V2/V3 readability and V3 special-programme data while adding an immutable official-workload section containing at least:

- curricular earned contribution identities: execution ID, kind, execution date, actual teacher;
- curricular earned total;
- existing special-programme workload total/provenance by exact V3 authority;
- total earned credit;
- required credit and variance;
- every adjustment segment's date range, base weekly norm, adjusted weekly norm, policy version/validator/effectivity;
- applied rule ID/type/value/priority;
- rule source provenance: duty-definition identity/code snapshot plus matching assignment IDs/windows, or HomeroomAssignment IDs/class/windows;
- calendar version and teaching-weekday denominator provenance sufficient to reproduce required credit.

Later edits to policy, duty catalogs, assignments or homeroom history do not rewrite submitted/approved V4 statements.

### D12. No double counting across domains

One ACTIVE curricular execution contributes once. One P4-050 special-programme contribution contributes once. A teacher being responsible for the same class, holding multiple matching duty assignments, appearing in multiple class targets, or having multiple attestations must not fan out workload.

Curricular execution and special-programme execution are distinct evidence families and must not be merged by display labels, dates or teacher names.

### D13. Authorization

Business policy mutation uses only existing `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE`.

Personal workload preview/statement submission continues through the existing personal Reporting Statement authority. Existing authorized statement readers may read the frozen professional workload section according to Reporting Statement authorization. No new permission is inferred from AdditionalDuty, HomeroomAssignment, StaffSubject, title, role or `SYSTEM_ADMIN`.

### D14. Administration UI

P4-061 may add a typed `WORKLOAD_ADJUSTMENT` adapter to the existing Business Configuration workspace. It must use human-readable AdditionalDuty options and the fixed Homeroom source option; administrators must not type backend UUIDs or edit raw JSON.

The Reporting Statement UI may present earned/required/variance and rule provenance in Vietnamese but may not invent formulas or local calculations.

### D15. Schema strategy

P4-061 is expected to be schema-free: Business Configuration already retains versioned JSON policy authority; AdditionalDuty/Homeroom sources already exist; Reporting Statement already freezes canonical JSON snapshots.

If implementation proves a relational invariant cannot be protected without schema change, P4-061 must stop for architecture re-entry rather than adding an unreviewed persistence model.

### D16. Historical compatibility and non-scope

V1-V3 statements remain readable and immutable; no backfill is required.

P4-060/P4-061 do not change PPCT completion/debt rules, do not create executions, do not infer workload from timetable rows, do not credit different-subject supervision, do not add payroll/salary calculation, overtime pay, leave accounting or legal HR compliance logic.

## Consequences

- P4-061 becomes the sole implementation task for T23 and the newly registered T49 actual-curricular-workload closure.
- P4-061 must depend on P1-021, P4-050 and P4-060.
- P5-010 remains blocked until P4-061 closes.
- Production remains PRE-OPERATIONAL; P4-060 authorizes no runtime/schema/deploy/VPS mutation.

## Required P4-061 evidence

P4-061 is not merge-ready without deterministic tests for:

- all three formulas and priority order, including override followed by lower-priority rules;
- zero floor, percentage bounds and fixed decimal behavior;
- missing/ambiguous/corrupt policy fail-closed;
- multiple assignment matches apply one rule once;
- homeroom rule derives from HomeroomAssignment without duplicate AdditionalDuty truth;
- policy/source effectivity changes inside one report range;
- calendar teaching-day proration and interruption exclusion;
- NORMAL base actual-teacher credit;
- SAME_SUBJECT_SUBSTITUTION credits substitute only;
- MAKEUP credits actual teacher on execution date without creating a second PPCT completion;
- REVERSED/replaced execution behavior;
- P4-050 special-programme projection reuse and anti-double-counting;
- combined earned/required/variance arithmetic;
- Snapshot V4 canonicalization, hash integrity and V1-V3 backward compatibility;
- exact Business Configuration authorization and typed UI without raw UUID/JSON editing.

## Implementation authorization

None. P4-060 is docs/architecture only. Runtime implementation begins only after P4-060 merges, authoritative post-merge CI succeeds and `SYNC-P4-060` closes the task.