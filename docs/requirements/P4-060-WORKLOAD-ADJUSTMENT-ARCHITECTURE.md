# P4-060 — Workload Adjustment Architecture

## 1. Task authority

- **Task ID:** `P4-060`
- **Status:** `CLOSED by SYNC-P4-060`
- **Canonical start:** `main@e1be4a486caf57357c0fcec6f47eceb6b873ec0a`
- **Branch:** `docs/p4-060-workload-adjustment-architecture`
- **Direct predecessor:** `P1-020` (CLOSED)
- **Runtime successor:** `P4-061`
- **Traceability:** T21, T23, T49
- **Decision authority:** ADR-057 — Accepted

## Closure evidence — SYNC-P4-060

- Parent branch: `docs/p4-060-workload-adjustment-architecture`
- Canonical parent start: `main@e1be4a486caf57357c0fcec6f47eceb6b873ec0a`
- Final reviewed parent head: `7bf3ca2b30b27f257035acf814cdeca10a708da0`
- Parent PR #189: `docs(workload): define P4-060 workload adjustment architecture`
- Exact-head parent CI #626 / run `37168759382`: **SUCCESS**
- Independent exact-diff audit: **PASS**; 9 docs-only files; 459 additions / 33 deletions; zero unresolved review threads
- Normal parent merge/main: `db5f08912f41606d80c4b7c66fbfea42b3f7d039`
- Authoritative post-merge main CI #627 / run `37169147105`: **SUCCESS**
- Both Linux `Lint · Typecheck · Test · Build` and `Windows deployment contract`: **SUCCESS**
- Zero runtime/schema/migration/API/UI/auth/CI/deploy/VPS mutation
- ADR-057 is Accepted; T21/T23/T49 architecture authority is closed; `P4-061` becomes READY when this sync lands.

## 2. Problem being closed

Phase 01 preserved `WorkloadAdjustmentRule` only as a deferred boundary: `TRU_TIET`, `TRU_PHAN_TRAM`, `GHI_DE`, `priority` and effectivity linked to additional-duty meaning. FULL BUSINESS activation of T23 now requires those semantics to become explicit.

Independent architecture review also identified a second unresolved workload gap: ADR-041 deferred actual curricular workload aggregation, while P0-003 requires exact multi-teacher workload. A reduction-only implementation would therefore be incomplete. P4-060 binds both missing pieces into one official workload architecture without changing curricular progress ownership.

## 3. Existing authorities reused

P4-061 must reuse rather than duplicate:

- `BusinessPolicyVersion` lifecycle/resolution from P1-021;
- `AdditionalDutyDefinition` + `StaffAdditionalDutyAssignment` retained source facts;
- canonical `HomeroomAssignment` history for GVCN responsibility;
- `CurricularTeachingExecution` as actual curricular teaching evidence;
- P4-050 `SpecialProgrammeWorkloadProjection` as special-programme workload authority;
- authoritative AcademicCalendarVersion/CalendarInterruption semantics;
- Reporting Statement immutable canonical snapshot/hash/lifecycle.

## 4. Locked implementation surface for P4-061

P4-061 is expected to deliver:

1. registered `WORKLOAD_ADJUSTMENT / v1 / ACADEMIC_YEAR` policy family and strict validator;
2. typed Business Configuration UI adapter using AdditionalDuty option discovery and fixed Homeroom source option;
3. internal date-effective workload-adjustment projection;
4. actual curricular workload projection by `actualTeacherUserId` and `executionCivilDate`;
5. combined official workload projection reusing P4-050 special-programme workload;
6. Reporting Statement preview integration;
7. `REPORTING_STATEMENT_SNAPSHOT_V4` canonical freeze and backward-compatible presenter/read paths;
8. Vietnamese UI presentation of earned credit, required credit, variance and applied adjustment provenance;
9. integration/regression coverage proving no change to PPCT/debt/completion semantics.

## 5. V1 policy contract

Canonical payload:

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
    }
  ]
}
```

Allowed calculation values are exactly `TRU_TIET`, `TRU_PHAN_TRAM`, `GHI_DE`. Allowed source kinds are exactly `ADDITIONAL_DUTY` and `HOMEROOM_RESPONSIBILITY`.

No arbitrary expression language, per-user rule, role/title inference, SystemSetting fallback or environment fallback is authorized.

## 6. Earned workload semantics

### 6.1 Curricular

Each ACTIVE `CurricularTeachingExecution` in the requested execution-date range contributes exactly one period-equivalent to its `actualTeacherUserId`.

- base teaching -> actual teacher +1;
- same-subject substitution -> substitute +1 only;
- make-up -> actual teacher +1 on target execution date;
- reversed predecessor -> 0.

This is workload only. PPCT distribution/completion remains anchored to the original obligation.

### 6.2 Special programmes

Use P4-050 result unchanged. Do not rebuild coefficient or attestation logic.

### 6.3 Combined

`earnedCredit = curricularCredit + specialProgrammeCredit`.

## 7. Required workload semantics

For each workload-eligible civil date in the requested range:

- resolve exact calendar authority;
- require weekday in `teachingWeekdays`;
- exclude `CalendarInterruption` dates;
- resolve exact date-effective WORKLOAD_ADJUSTMENT policy;
- resolve target teacher source facts;
- compute adjusted weekly norm via ordered rules;
- daily required credit = adjustedWeeklyNorm / count(teachingWeekdays).

Sum all daily values and round the final required credit to four decimals.

CalendarException/class suppression does not alter the generic teacher norm in V1.

## 8. Source application semantics

`ADDITIONAL_DUTY` rule applies once when at least one exact retained matching StaffAdditionalDutyAssignment is effective for the teacher/date. Multiple assignment scopes do not multiply the adjustment.

For AdditionalDutyDefinition/StaffAdditionalDutyAssignment instant windows, effective civil dates are derived in `Asia/Ho_Chi_Minh`: HCM date(validFrom) is inclusive and HCM date(validUntil) is exclusive. No host-timezone or UTC-date shortcut is allowed.

`HOMEROOM_RESPONSIBILITY` rule applies once when at least one canonical HomeroomAssignment is effective for the teacher/date. It must not require a duplicate AdditionalDuty assignment.

## 9. Rule chain

Sort by unique ascending priority, then apply:

- `TRU_TIET(v)`: `max(0, N - v)`
- `TRU_PHAN_TRAM(p)`: `max(0, N * (1 - p/100))`
- `GHI_DE(v)`: `N = v`

Lower-priority rules continue after GHI_DE. Decimal calculation must be deterministic with at most four fractional input digits and no binary-floating semantic drift.

## 10. Projection failure policy

Block official workload when an eligible date has:

- missing/ambiguous/corrupt workload-adjustment policy;
- missing/ambiguous calendar authority;
- invalid teaching-weekday denominator;
- corrupt referenced AdditionalDutyDefinition;
- irreconcilable source assignment/responsibility evidence.

Do not silently skip an applicable rule.

A range containing zero workload-eligible dates has requiredCredit = 0 without requiring a policy solely for that empty target.

## 11. Reporting Statement V4

V4 preserves V3 and adds:

- curricular workload contribution evidence;
- combined earned credit;
- required credit;
- variance;
- date-effective adjustment segments;
- exact policy/rule/source/calendar provenance.

V1/V2/V3 remain readable; no historical backfill or mutation.

## 12. Authorization

- policy management: existing `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` only;
- personal preview/submit: existing Reporting Statement personal authority;
- frozen reads: existing Reporting Statement read authority;
- no authority from AdditionalDuty, HomeroomAssignment, StaffSubject, title, role or SYSTEM_ADMIN.

## 13. Expected schema impact

Expected: **schema-free**.

Business policy JSON, existing retained source facts and statement JSON snapshot are sufficient. Any proposed migration requires architecture re-entry before implementation.

## 14. Required P4-061 test matrix

At minimum:

- strict v1 payload validation and unknown-field rejection;
- rule/source/priority uniqueness;
- all formula semantics and ordering;
- deterministic decimal rounding;
- date-effectivity and mid-period policy/source changes;
- duplicate duty assignments do not multiply a rule;
- multiple homeroom classes do not multiply the homeroom rule;
- base NORMAL actual teacher credit;
- substitution actual teacher credit only;
- make-up actual teacher execution-date credit;
- reversed/replaced execution exclusion;
- special-programme reuse and exact combined total;
- arbitrary-range calendar proration and CalendarInterruption exclusion;
- missing/corrupt authority blocker behavior;
- V4 frozen provenance and semantic-hash stability;
- V1-V3 compatibility;
- management/read authorization matrix;
- typed Vietnamese UI without raw JSON or UUID entry;
- zero regression to progress/debt/PPCT/reporting responsibility semantics.

## 15. Non-scope

No payroll, salary, overtime pay, leave accounting, tax, HR legal compliance, free-form formula editor, per-user manual adjustment, technical configuration, production deploy or VPS mutation.

## 16. Exit condition

P4-060 can close only after independent docs diff review, exact-head PR CI SUCCESS, normal merge, authoritative post-merge main CI SUCCESS and one non-recursive `SYNC-P4-060`. Only then may P4-061 become READY.