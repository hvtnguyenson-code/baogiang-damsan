# P1-012A — Homeroom Historical Identity Read-Model Correction

## Status

**CLOSED — implementation, independent review, exact-head PR CI, merge, post-merge main CI and `SYNC-P1-012A` closure evidence satisfied.**

- Task: `P1-012A`
- Branch: `fix/homeroom-historical-identity-read-model-012a`
- Exact starting main: `9ac9ae1e510858bc1039da313af90f908b773a93`
- Dependency: `P1-012` — CLOSED
- Governing authority: `ADR-045-HOMEROOM-RESPONSIBILITY.md`, P1-010 and P1-012
- Traceability: T13, T14
- Scope: bounded Homeroom-authorized historical User identity discovery and server-owned Homeroom business-date read model required before P1-013.

Closure evidence:

- exact starting main: `9ac9ae1e510858bc1039da313af90f908b773a93`;
- implementation branch: `fix/homeroom-historical-identity-read-model-012a`;
- governance registration commit: `c7f3d860549b324eb5daf65eed79c9c534096be5`;
- final reviewed head: `a13a69dca60bef6f99c124f420affa8196b7822a`;
- PR #99;
- independent GitHub review: PASS;
- exact-head PR CI #347 (workflow run `33832457894`): final SUCCESS; attempt 1 failed at npm audit because the registry returned 503, with no dependency change or vulnerability finding, and the targeted failed-job rerun completed as successful attempt 2;
- merge/main: `530f418d3e144826cd801f572d6367bb679d398a`;
- authoritative post-merge main CI #348 (workflow run `33834641625`, event `push`, exact head `530f418d3e144826cd801f572d6367bb679d398a`): SUCCESS;
- no separate correction/re-entry task required;
- administrative closure: `SYNC-P1-012A`.

## 1. Audited gap

P1-012 correctly separates bounded historical truth from current eligibility, but its workspace read model exposes only teachers already referenced by HomeroomAssignment and currently eligible teacher candidates. An exact historical User who is currently inactive/non-teaching or lacks a current StaffProfile cannot therefore be selected by a future UI before their first HomeroomAssignment exists. The workspace also omits the server-owned Homeroom business civil date, so a browser cannot safely mirror the server's historical/current classification boundary.

This is a bounded read-model correction. It does not change ADR-045, create another GVCN authority, or weaken current/future eligibility.

## 2. Required contract and API

`HomeroomAssignmentWorkspaceOptionsResponse` adds `businessDate: CivilDateString`, produced server-side by the canonical `homeroomBusinessDate()` helper in timezone `Asia/Ho_Chi_Minh`. Clients cannot supply or override it.

Add a Homeroom-owned endpoint equivalent to:

`GET /api/homeroom-assignment-options/academic-years/:academicYearId/historical-teacher-identities?q=<term>&page=<n>&pageSize=<n>`

The endpoint:

- requires `HOMEROOM_ASSIGNMENT_MANAGE / SCHOOL_WIDE` only;
- requires a nonblank bounded query with minimum length 2;
- uses bounded pagination with `pageSize <= 100`;
- searches exact public identity fields by case-insensitive contains/prefix behavior, without fuzzy matching or automatic resolution;
- verifies that AcademicYear exists but does not require an active calendar;
- may return Users who are inactive, non-teaching or lack a current StaffProfile;
- returns only `userId`, `username`, `displayName`, `staffCode`, `userStatus` and `isTeachingStaff` plus pagination metadata;
- does not return credentials, security/session data, capability grants, email or phone;
- is identity discovery for an explicit historical assertion, never proof of historical eligibility.

Existing `historicalTeachers` remains the history/filter source. Existing `eligible-teachers` remains restricted to current ACTIVE Users with a StaffProfile and `isTeachingStaff=true`, without StaffSubject requirements.

## 3. Authorization and semantic boundaries

No `USER_MANAGE`, `ACADEMIC_STRUCTURE_MANAGE`, `SUBJECT_MANAGE`, `SYSTEM_ADMIN`, job title, StaffSubject, TeachingAssignment or AdditionalDuty grants or inference may authorize or populate this read model. The operator must select an exact returned User identity, and subsequent create/change/correct commands retain their existing calendar, interval, `entryReason` and validation rules.

No schema, migration, capability key/scope, Homeroom lifecycle, resolver, calendar activation, audit mutation, SpecialActivity, workload/reporting or UI behavior changes are authorized.

## 4. Required regression

Targeted tests must prove:

1. workspace `businessDate` uses the canonical server-owned HCM date;
2. the historical identity endpoint permits only an explicit Homeroom SCHOOL_WIDE grant;
3. no grant, SYSTEM_ADMIN-only, USER_MANAGE-only and SUBJECT_MANAGE-only callers receive 403;
4. inactive, non-teaching and profile-less exact Users remain discoverable;
5. StaffSubject is not required;
6. empty/too-short search returns deterministic 400 and pagination is bounded;
7. response fields remain public-safe;
8. `eligible-teachers` remains current/future-only;
9. existing Homeroom command/resolver regressions remain green;
10. no P1-013 UI is introduced.

## 5. Documentation and closure

Before independent review, P1-012A became `IN_REVIEW`; current status and T13/T14 described the correction as pending review/CI; P1-012 remained `CLOSED`; P1-013 remained `PLANNED` and depended on P1-012A.

P1-012A required implementation, independent GitHub review, exact-head CI SUCCESS, merge, authoritative post-merge main CI SUCCESS and non-recursive `SYNC-P1-012A` closure. All gates are satisfied. P1-013 may become `READY` only after the `SYNC-P1-012A` closure PR itself is independently reviewed, merged and its post-merge main CI is green; P1-013 has not started.

## 6. Branch implementation evidence

Changed files are limited to:

- `packages/contracts/src/index.ts`;
- `apps/api/src/homeroom-assignments/dto.ts`;
- `apps/api/src/homeroom-assignments/homeroom-assignments.controller.ts`;
- `apps/api/src/homeroom-assignments/homeroom-assignments.service.ts`;
- `apps/api/test/homeroom-assignments/homeroom-assignments.service.spec.ts`;
- `apps/api/test/homeroom-assignments/homeroom-assignments.integration.spec.ts`;
- this task document;
- `docs/governance/CURRENT-PROJECT-STATUS.md`;
- `docs/governance/PRE-PILOT-TASK-REGISTER.md`;
- `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`.

Implementation provides:

- `businessDate: CivilDateString` on the workspace response, sourced only from `homeroomBusinessDate()`;
- `GET /api/homeroom-assignment-options/academic-years/:academicYearId/historical-teacher-identities` with trimmed 2..100-character search, page >= 1 and pageSize 1..100;
- case-insensitive exact-field discovery across username, display name and staff code;
- public-safe identity summaries for inactive, non-teaching and profile-less Users without current-eligibility filtering;
- the existing class-level `HOMEROOM_ASSIGNMENT_MANAGE / SCHOOL_WIDE` guard, with explicit denial regressions for no grant and unrelated SYSTEM_ADMIN/USER_MANAGE/SUBJECT_MANAGE grants;
- unchanged strict current/future `eligible-teachers` filtering.

Local evidence:

- contracts lint/typecheck: PASS;
- API lint/typecheck: PASS;
- targeted Homeroom unit/capability regression: PASS — 3 suites / 19 tests;
- API build: PASS;
- isolated PostgreSQL Homeroom integration: **NOT RUN / BỊ CHẶN DO MÔI TRƯỜNG** — the safety harness refused execution because no explicitly certified isolated `TEST_DATABASE_URL` was available; no production or uncertified database was used;
- Prisma validate: NOT RUN / not applicable because schema and migrations are unchanged;
- `git diff --check`: PASS.

P1-013 UI was not implemented by P1-012A. Exact-head PR CI #347 and post-merge main CI #348 established the required repository evidence for the merged correction.
