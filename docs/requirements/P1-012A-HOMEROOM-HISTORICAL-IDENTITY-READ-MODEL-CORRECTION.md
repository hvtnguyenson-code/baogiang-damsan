# P1-012A — Homeroom Historical Identity Read-Model Correction

## Status

**IN_PROGRESS.**

- Task: `P1-012A`
- Branch: `fix/homeroom-historical-identity-read-model-012a`
- Exact starting main: `9ac9ae1e510858bc1039da313af90f908b773a93`
- Dependency: `P1-012` — CLOSED
- Governing authority: `ADR-045-HOMEROOM-RESPONSIBILITY.md`, P1-010 and P1-012
- Traceability: T13, T14
- Scope: bounded Homeroom-authorized historical User identity discovery and server-owned Homeroom business-date read model required before P1-013.

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

Before independent review, P1-012A becomes `IN_REVIEW`; current status and T13/T14 must describe the correction as pending review/CI; P1-012 remains `CLOSED`; P1-013 remains `PLANNED` and depends on P1-012A.

P1-012A becomes `CLOSED` only after implementation, independent GitHub review, exact-head CI SUCCESS, merge, authoritative post-merge main CI SUCCESS and non-recursive `SYNC-P1-012A` closure. Only then may P1-013 become `READY` again.
