# P1-012 — Homeroom Control Plane

## Status

**CLOSED — implementation, independent review, exact-head PR CI, merge, post-merge main CI and `SYNC-P1-012` closure evidence satisfied.**

- Task: `P1-012`
- Branch: `feat/homeroom-control-plane-012`
- Exact starting main: `1d51580ddc501a5cf132688a66d6b7b1941570d0`
- Dependency: `P1-011` — CLOSED
- Governing authority: `ADR-045-HOMEROOM-RESPONSIBILITY.md`
- Traceability: T13, T14
- Scope: dedicated HomeroomAssignment capability, API/control plane, exact resolver, workspace-safe read model, calendar-activation compatibility and regression coverage.

Closure evidence:

- exact starting main: `1d51580ddc501a5cf132688a66d6b7b1941570d0`;
- final reviewed implementation head: `6af8bb27367763bec143a6bf26e7af22115394e1`;
- PR #97: `feat(homeroom): add P1-012 control plane`;
- independent GitHub diff review: PASS;
- exact-head PR CI #343 (workflow run `33825153273`): SUCCESS;
- merge/main: `3bf0589db17534700d8c8a15ce59645663d3ef40`;
- authoritative post-merge main CI #344 (workflow run `33825691809`, event `push`, exact head `3bf0589db17534700d8c8a15ce59645663d3ef40`): SUCCESS;
- independent-review and CI #341/#342 corrections were absorbed as forward commits before merge; no separate correction/re-entry task was required;
- administrative closure: `SYNC-P1-012`.

P1-012 implemented the accepted ADR-045 authority without reopening P1-010/P1-011 business decisions. No Homeroom administration workspace UI, Special Programme runtime, workload/reporting semantics, deployment/VPS/TLS/production mutation, or DamSanV5/Quản lí nội trú mutation was authorized or introduced.

## 1. Existing foundations to preserve

P1-012 must reuse rather than rebuild:

- P1-011 `HomeroomAssignment` / `HomeroomAssignmentStatus` persistence and DB constraints;
- session authentication, CSRF and capability default-deny enforcement;
- `AuditService` same-transaction success evidence pattern;
- inclusive civil-date validation utilities;
- existing serializable/retry patterns for date-effective command concurrency;
- AcademicYear / SchoolClass / AcademicCalendarVersion authority;
- immutable downstream SpecialActivity/execution/Reporting Statement boundaries.

Do not reuse TeachingAssignment as Homeroom authority, and do not require Subject, StaffSubject or AdditionalDuty membership for GVCN.

## 2. Dedicated capability authority

Add exactly one new capability key:

`HOMEROOM_ASSIGNMENT_MANAGE`

Allowed scope: `SCHOOL_WIDE` only.

Requirements:

- add the key to shared `CapabilityKey` contracts;
- add it to canonical capability catalog synchronization;
- add bounded presentation/label support where the existing capability-grant UI would otherwise display the raw key;
- update catalog/static/integration regression expectations;
- **do not add it to `BOOTSTRAP_TECHNICAL_CAPABILITIES`**;
- `SYSTEM_ADMIN`, job title, current GVCN status, `ACADEMIC_STRUCTURE_MANAGE`, `SUBJECT_MANAGE`, `USER_MANAGE`, activity staffing, or any other key is not an implicit bypass;
- an operator receives this business authority only through an explicit active capability grant.

Every public Homeroom management/read/resolve/options endpoint in this task is guarded by `HOMEROOM_ASSIGNMENT_MANAGE / SCHOOL_WIDE`.

## 3. Public API surface

No generic PATCH and no public physical DELETE.

Provide an explicit bounded surface equivalent to:

### Assignment commands/history

- `GET /api/academic-years/:academicYearId/homeroom-assignments`
- `POST /api/academic-years/:academicYearId/homeroom-assignments`
- `GET /api/homeroom-assignments/:id`
- `POST /api/homeroom-assignments/:id/end`
- `POST /api/homeroom-assignments/:id/change-teacher`
- `POST /api/homeroom-assignments/:id/correct`

### Exact resolver

- `GET /api/academic-years/:academicYearId/homeroom-assignments/resolve?schoolClassId=<uuid>&on=<civil-date>`

### Workspace-safe options/read model for P1-013

P1-013 is UI-only and must not need `ACADEMIC_STRUCTURE_MANAGE` or `USER_MANAGE` merely to populate a Homeroom workspace. Therefore P1-012 must expose Homeroom-authorized read-model endpoints, following the existing TeachingAssignment-options pattern, sufficient to provide:

- paginated AcademicYear options;
- one selected AcademicYear summary;
- active calendar summary or `null`;
- all SchoolClass rows for that year, including current status, because historical rows must remain visible;
- historical teacher identities already referenced by HomeroomAssignment for that year;
- paginated currently eligible teacher candidates for a requested current/future interval.

The exact path grouping may follow `homeroom-assignment-options/...`, but all such endpoints use the dedicated Homeroom capability only. P1-013 must not have to invent a new backend endpoint to perform its registered UI task.

## 4. Shared public contracts

Create explicit public-safe contracts for at least:

- `HomeroomAssignmentRecord`;
- `HomeroomAssignmentListResponse`;
- `HomeroomAssignmentChangeResult`;
- `HomeroomAssignmentCorrectionResult`;
- typed `HomeroomResolutionResult`;
- option/read-model responses required by §3.

`HomeroomAssignmentRecord` must expose enough retained evidence for authorized history inspection without recursive expansion:

- exact IDs: assignment, AcademicYear, SchoolClass, teacher, creator, reverser and `replacesId`;
- `validFrom`, nullable `validUntil`;
- `ACTIVE | REVERSED`;
- note and historical `entryReason`;
- reversal timestamp/reason;
- created/updated timestamps;
- public-safe SchoolClass summary;
- public-safe teacher identity + **current** account/teaching-staff state for operator context only.

Current teacher/account state in a record is diagnostic. It must never change historical resolution truth.

Do not return recursive replacement objects. Lineage is represented by stable IDs/history rows.

## 5. Server-owned business civil date

Historical-vs-current validation depends on the **server-owned business civil date** in canonical timezone `Asia/Ho_Chi_Minh`.

- client input must never supply or override the command business date;
- use a bounded reusable/pure helper so unit tests are deterministic;
- service code obtains the current instant server-side and converts it to the canonical business civil date;
- do not import this business rule from an unrelated progress/debt domain merely because a similar helper exists there.

Classification for a resulting assignment interval:

- **BOUNDED_HISTORICAL** iff `validUntil !== null && validUntil < businessDate`;
- otherwise **CURRENT_OR_FUTURE**.

An interval ending on the business date is not historical-only.

## 6. Active calendar and envelope rules

Every create/change/end/correct mutation requires exactly one active AcademicCalendarVersion for the affected AcademicYear and validates relevant civil intervals inside its envelope.

Reads/list/history/resolution/options history must remain usable without an active calendar. Candidate-teacher queries for a current/future authoring interval may require the active calendar because they validate a write candidate.

If active-calendar data is missing or corrupt/ambiguous, writes fail closed with deterministic conflict semantics.

## 7. Class and teacher validation: historical truth is distinct from current eligibility

### 7.1 Always required

For any new ACTIVE assertion/replacement:

- exact SchoolClass exists;
- SchoolClass belongs to the requested/retained AcademicYear;
- exact teacher User exists;
- interval lies within the active calendar envelope;
- no StaffSubject, Subject or AdditionalDuty requirement is allowed.

### 7.2 CURRENT_OR_FUTURE result

If the resulting interval is current/future-facing:

- SchoolClass must currently be operationally active;
- teacher must currently have `User.status = ACTIVE`;
- canonical StaffProfile must exist;
- `isTeachingStaff = true`;
- `entryReason` is reserved for historical backfill and must not be silently accepted as a substitute for current eligibility.

### 7.3 BOUNDED_HISTORICAL result

If the resulting interval is entirely before the business date:

- current SchoolClass status does not invalidate the historical class identity;
- current teacher User/Profile/teaching-staff flags do not prove or disprove past eligibility and must not be used to reject the row;
- the exact User identity must still exist because the retained FK is authoritative;
- nonblank explicit administrative `entryReason` is mandatory;
- the command never infers the historical teacher from current class state, current user state, timetable text, TeachingAssignment, AdditionalDuty or SpecialActivity staffing.

Use bounded input lengths and trim/normalize optional notes/reasons consistently.

## 8. Create command

Input must include:

- `schoolClassId`;
- `teacherUserId`;
- `validFrom`;
- optional `validUntil`;
- optional bounded note;
- optional `entryReason`, conditionally required only by the historical rules above.

Behavior:

1. require AcademicYear and active calendar;
2. validate interval and same-year class;
3. classify resulting interval using server business date;
4. apply §7 current/future or historical rules;
5. create one ACTIVE row;
6. write one success AuditEvent in the same serializable transaction.

DB overlap conflicts must map to deterministic HTTP conflict; no success audit survives a failed command.

## 9. End command

Input: exact `endDate` only.

Rules:

- source must exist and be `ACTIVE`;
- require active calendar and envelope;
- `endDate >= validFrom`;
- cannot extend an existing `validUntil`;
- exact same end date may be treated as deterministic no-op and audited as such;
- ending does not create correction lineage and does not re-check teacher current eligibility;
- ending a row must remain possible even if teacher/class current mutable status changed.

## 10. Real-world change-teacher command

This command represents an actual responsibility change, not a data correction.

Input:

- `newTeacherUserId`;
- exact `effectiveFrom`;
- optional note for the replacement;
- optional `entryReason`, conditionally required if the resulting replacement interval is bounded historical.

Rules:

- source must be `ACTIVE`;
- new teacher must differ from current teacher;
- `effectiveFrom > source.validFrom` and must lie within the retained source interval/calendar envelope;
- transactionally shorten source to the previous civil date;
- create one new ACTIVE replacement interval from `effectiveFrom` to the old `validUntil`;
- this real-world change uses **`replacesId = null`**; correction lineage is reserved for §11;
- classify the new interval under §5 and apply §7 eligibility/backfill rules;
- do not re-evaluate historical truth of the shortened source using current account state;
- audit old/new teacher, split date, prior new end and new assignment ID atomically.

## 11. Explicit correction command

Correction fixes a false stored assertion while retaining evidence. It is not generic editing.

Input shape must be explicit and bounded, equivalent to:

```text
reason: required nonblank correction/reversal reason
replacements: 1..50 items
  - teacherUserId
  - validFrom
  - validUntil? / null
  - note?
  - entryReason? (conditional historical provenance)
```

The client must not provide replacement IDs, status, `replacesId`, reversal actor/timestamp, AcademicYear or SchoolClass.

Rules:

1. source exists and is `ACTIVE`; correcting an already `REVERSED` row fails deterministically;
2. source lineage is inspected fail-closed; repeated/cyclic/corrupt ancestry or an already-replaced ACTIVE source must block rather than be guessed through;
3. every replacement remains in the source's exact AcademicYear + SchoolClass;
4. every replacement interval must be fully contained inside the source assertion's original inclusive interval;
5. replacement intervals must not overlap each other; gaps are allowed because ADR-045 explicitly allows GVCN gaps;
6. every replacement lies inside active calendar envelope;
7. each replacement independently receives historical/current validation from §7;
8. transactionally mark source `REVERSED` with exact actor/time/mandatory reason;
9. create all new ACTIVE rows with `replacesId = source.id`;
10. DB current-truth overlap constraint remains final protection against conflicts with other ACTIVE rows;
11. one reversed source may legitimately have more than one replacement child — `replacesId` must remain non-unique;
12. write one same-transaction success audit containing source ID, correction reason and exact replacement IDs/intervals.

A note-only correction can be represented by reversing the source and recreating an equivalent teacher/date assertion with corrected note. No physical delete or silent in-place truth rewrite is allowed.

This task must include command-layer regression that proves more than one replacement can reference one reversed source, addressing the P1-011 review-hardening observation.

## 12. Exact resolver

Provide a reusable internal resolver and guarded public endpoint for:

`AcademicYear + SchoolClass + civilDate`.

Resolver behavior:

- validate exact AcademicYear/Class identity relationship;
- do **not** require an active calendar for historical read;
- query current-truth `ACTIVE` rows whose inclusive interval contains the date;
- current User/Profile status does not participate in historical identity selection;
- never fall back to latest row, TeachingAssignment, AdditionalDuty, timetable/import text, SpecialActivity staffing, current teacher, fuzzy names or title-based inference.

Typed result must fail closed, at minimum:

- `RESOLVED` — exactly one exact retained assignment;
- `MISSING` — no ACTIVE assertion covers the date;
- `AMBIGUOUS` — more than one candidate is observed, even though DB invariants should prevent this;
- `CORRUPT` — retained data/provenance is structurally unusable and no safe identity can be asserted.

Do not silently collapse impossible states to `MISSING`.

The internal resolver is data resolution only. It is not an authorization bypass for future P4 callers; each public caller/domain retains its own authorization boundary.

## 13. Calendar activation compatibility

P1-012 must extend the existing AcademicCalendarVersion activation transaction so a candidate calendar is not activated if it would place retained HomeroomAssignment evidence outside the candidate envelope.

Requirements:

- validate **all HomeroomAssignment rows for the AcademicYear, including `REVERSED` retained correction evidence**;
- interval comparison only; do not re-check current teacher User/Profile status or current SchoolClass status during calendar activation;
- open-ended rows are interpreted against the candidate calendar end for envelope compatibility without rewriting stored null ends;
- activation failure must not mutate HomeroomAssignment history;
- preserve the existing TeachingAssignment activation compatibility gate; Homeroom validation is additional, not a replacement.

## 14. Concurrency and deterministic conflict handling

All create/end/change/correct mutations must use PostgreSQL `SERIALIZABLE` or an equivalently strong accepted pattern with bounded retry for serialization/deadlock races.

Map at least:

- retained ACTIVE overlap/exclusion conflicts -> deterministic `409 Conflict`;
- stale/reversed lifecycle conflicts -> deterministic `409 Conflict`;
- invalid civil dates/interval bounds -> `400 Bad Request`;
- missing exact AcademicYear/Class/User/Assignment -> `404 Not Found` where appropriate;
- missing/ambiguous active calendar for a write -> fail-closed conflict;
- unauthorized/default-deny -> existing `403` authorization path.

Do not expose raw Prisma/PostgreSQL internals in API messages.

## 15. Audit requirements

Mutation success audit must be written in the same transaction as the business mutation. Failed transactions/commands must leave no success audit.

Use stable actions equivalent to:

- `HOMEROOM_ASSIGNMENT_CREATED`;
- `HOMEROOM_ASSIGNMENT_ENDED`;
- `HOMEROOM_ASSIGNMENT_TEACHER_CHANGED`;
- `HOMEROOM_ASSIGNMENT_CORRECTED`.

Audit metadata must contain exact business coordinates and command outcome/no-op details but no secrets.

Read/list/resolve endpoints do not need success mutation audit merely for reads unless an existing repository rule specifically requires it.

## 16. Regression gates

P1-012 may not enter review unless tests establish at least:

### Capability/default deny

1. `HOMEROOM_ASSIGNMENT_MANAGE` exists exactly once and allows only `SCHOOL_WIDE`.
2. shared capability contracts/catalog synchronization remain aligned.
3. bootstrap technical administrator list is **not** silently expanded with this business capability.
4. no grant / SYSTEM_ADMIN-only / wrong capability -> 403 on Homeroom endpoints.
5. explicit active Homeroom SCHOOL_WIDE grant -> authorized.

### Create/history eligibility

6. current/future create requires active class + active teaching-staff User/Profile.
7. no StaffSubject coverage is required.
8. bounded historical create succeeds for exact retained teacher even if that teacher is now inactive/non-teaching, when explicit entryReason is supplied.
9. bounded historical create fails without nonblank entryReason.
10. current/future create cannot bypass eligibility by supplying entryReason.
11. same teacher may overlap across different classes.
12. same class/year ACTIVE overlap returns deterministic conflict.

### Change/end/correction

13. real change splits inclusive intervals exactly and sets no correction lineage.
14. historical real change applies bounded-historical eligibility/provenance to its replacement.
15. end cannot extend an existing interval and can still close a row after current teacher/class state changes.
16. correction retains source as REVERSED with actor/time/reason.
17. correction creates 1..N ACTIVE children with `replacesId = source.id`; at least one test uses multiple children.
18. replacement set cannot overlap itself, escape source interval, or conflict with another ACTIVE row.
19. correction preserves allowed gaps.
20. corrupt/cyclic lineage is rejected fail-closed by command-layer validation.
21. failed mutation leaves no success audit.

### Resolver/read semantics

22. list/get/history expose retained ACTIVE and REVERSED evidence deterministically.
23. exact resolver returns RESOLVED for exactly one covering ACTIVE row.
24. resolver returns MISSING for a gap.
25. current User/Profile status change after the historical assignment does not change RESOLVED identity.
26. resolver contains explicit AMBIGUOUS/CORRUPT fail-closed handling and has bounded unit coverage even if normal DB constraints make those states unreachable through public commands.
27. no active calendar is required for retained read/resolve.

### Calendar activation

28. candidate calendar outside any retained ACTIVE Homeroom interval is blocked.
29. candidate calendar outside retained REVERSED evidence is also blocked.
30. compatibility check does not reject a historical assignment because teacher/current class status later changed.
31. existing TeachingAssignment calendar compatibility remains green.

### Workspace-safe options

32. Homeroom-only operator can obtain year/class/history/eligible-teacher options without unrelated USER/ACADEMIC_STRUCTURE capability.
33. historical teacher options retain disabled/inactive identities already referenced in history.
34. eligible-teacher options include only current ACTIVE teaching-staff users and do not require StaffSubject.

### Repository regression

35. lint/typecheck/unit/integration/build/Playwright/static/migration suites remain green.
36. `git diff --check` passes.

## 17. Expected file/domain scope

Likely allowed changes include only what is required for this control plane:

- `packages/contracts/src/index.ts` and bounded shared contract tests;
- `prisma/capability-catalog.cjs` and capability-catalog/static tests;
- bounded capability label/presentation support in existing grant UI utilities if needed;
- new `apps/api/src/homeroom-assignments/**` module/controller/service/policy/dto/options/read-model code;
- `apps/api/src/app.module.ts` module registration;
- `apps/api/src/academic-structure/academic-structure.service.ts` plus bounded policy/test changes needed to add Homeroom calendar-activation compatibility while preserving TeachingAssignment compatibility;
- bounded API unit/integration tests;
- task register/current status/traceability docs required by governance before review.

Do not alter P1-011 migration or weaken its DB constraints. A new migration is not expected unless implementation proves an unavoidable persistence defect; if that occurs, stop and report rather than silently rewriting persistence authority.

## 18. Forbidden scope

Do not modify in P1-012:

- P1-013 Homeroom administration workspace/pages/routes as a product UI feature;
- GDĐP/HĐTN programme planning/runtime/materialization;
- SpecialActivity business semantics;
- teaching workload/reporting/statement calculations;
- PPCT/TKB importer product behavior;
- Business Configuration tasks P1-020+;
- delayed-go-live tasks P1-030+;
- deployment workflow, Nginx, TLS, VPS, Scheduled Tasks or production database/application state;
- DamSanV5/Quản lí nội trú repository or production.

## 19. Documentation synchronization before review

Before P1-012 is ready for independent review, its branch must:

- mark P1-012 `IN_REVIEW` in `PRE-PILOT-TASK-REGISTER.md`;
- update `CURRENT-PROJECT-STATUS.md` to describe the branch as pending review, not merged/closed;
- update T13/T14 implementation coverage in `PRE-PILOT-TRACEABILITY-MATRIX.md` without claiming closure before merge;
- record the exact reviewed branch HEAD in external Git/GitHub review and CI evidence after the final commit; do not embed a self-referential SHA in the commit that creates it;
- update this task document with the changed-file list and local test evidence;
- update README/PROJECT_CONTEXT/roadmap only if they would otherwise become false;
- register any genuinely discovered deferred/follow-up item with an exact task/trigger in the same PR; plain `later`/`future`/orphan deferral is prohibited.

No Product Baseline or new ADR change is expected because P1-012 implements already-accepted ADR-045 authority. If implementation discovers a true semantic contradiction, stop and register an architecture correction rather than silently deciding it in code.

### 19.1 Branch implementation evidence

Changed files for P1-012 are limited to:

- `apps/api/src/academic-structure/academic-structure.service.ts`;
- `apps/api/src/app.module.ts`;
- `apps/api/src/homeroom-assignments/dto.ts`;
- `apps/api/src/homeroom-assignments/homeroom-assignment-policy.ts`;
- `apps/api/src/homeroom-assignments/homeroom-assignments.controller.ts`;
- `apps/api/src/homeroom-assignments/homeroom-assignments.module.ts`;
- `apps/api/src/homeroom-assignments/homeroom-assignments.service.ts`;
- `apps/api/test/helpers/phase01-test-harness.ts`;
- `apps/api/test/homeroom-assignments/homeroom-assignment-policy.spec.ts`;
- `apps/api/test/homeroom-assignments/homeroom-assignments.integration.spec.ts`;
- `apps/api/test/homeroom-assignments/homeroom-assignments.service.spec.ts`;
- `apps/api/test/homeroom-assignments/homeroom-capability.spec.ts`;
- `apps/web/src/lib/capabilities.ts`;
- `packages/contracts/src/index.ts`;
- `prisma/capability-catalog.cjs`;
- `scripts/ci/verify-schema-foundation.cjs`;
- `scripts/ci/verify-phase-01-schema.sql`;
- this task document plus `CURRENT-PROJECT-STATUS.md`, `PRE-PILOT-TASK-REGISTER.md` and `PRE-PILOT-TRACEABILITY-MATRIX.md`.

Local evidence on the task branch:

- Prisma schema validation: PASS using a non-connecting placeholder URL required only for schema parsing;
- schema static gates: PASS;
- repository lint: PASS;
- repository typecheck: PASS;
- complete unit suites: PASS — web 14 suites/157 tests; API 63 suites/914 tests;
- targeted Homeroom unit regression: PASS — 3 suites/11 tests;
- affected Homeroom/academic-structure/capability unit regression: PASS — 11 suites/59 tests;
- production build: PASS;
- `git diff --check`: PASS;
- isolated PostgreSQL integration and canonical full suite: **NOT RUN / BỊ CHẶN DO MÔI TRƯỜNG** — no explicitly certified isolated PostgreSQL environment with the current schema was available; no production or uncertified database was used.

### 19.2 Independent-review correction evidence

The forward correction after independent review closes the following branch findings without changing P1-011 persistence: `end` now requires exactly one active calendar and validates its resulting interval in the same SERIALIZABLE transaction; resolver input is DTO-validated and verifies the exact AcademicYear/SchoolClass relationship; correction audit metadata now retains each replacement's exact ID, teacher and interval; explicit `null` end values are normalized as open-ended for command-layer self-overlap rejection.

Additional bounded regression covers wrong-capability denial, invalid resolver dates and identities, missing active calendar on end, command-layer corrupt lineage, external ACTIVE correction conflict, explicit-null self-overlap, correction audit intervals, and a fixed business-date spy for integration semantics. Local correction gates: Homeroom unit PASS (3 suites/15 tests), affected academic-structure/capability unit PASS (3 suites/23 tests), API lint/typecheck/build PASS, and `git diff --check` PASS. Isolated PostgreSQL integration remains **NOT RUN / BỊ CHẶN DO MÔI TRƯỜNG**.

PR CI #341 identified a stale Phase-01 capability-count verifier: the canonical catalog contains 37 entries after `HOMEROOM_ASSIGNMENT_MANAGE`, while the SQL verifier still expected 36. The verifier was synchronized to 37 and now asserts that this key allows exactly `SCHOOL_WIDE`; this correction changed neither migration nor retained persistence.

PR CI #342 passed the migration-verifier correction, then exposed a Homeroom integration fixture that generated lowercase UUID fragments for `AcademicYear.code`. Both year fixtures were changed to reuse the existing `normalizedCode` helper; production semantics, schema and migrations were unchanged. Exact-head PR CI #343 subsequently passed the complete workflow at reviewed head `6af8bb27367763bec143a6bf26e7af22115394e1`.

## 20. Closure rule

P1-012 required:

`implementation -> independent GitHub diff review -> exact-head PR CI SUCCESS -> merge -> exact merge/main SHA -> post-merge main CI SUCCESS -> SYNC-P1-012`.

All gates are satisfied. P1-013 may become `READY` only after the `SYNC-P1-012` closure PR itself is independently reviewed, merged and its post-merge main CI is green under the non-recursive governance protocol. P1-013 has not started.
