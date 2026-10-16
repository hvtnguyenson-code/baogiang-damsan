# P5-051 — Professional Access Baseline, Responsibility Templates & Safe User Lifecycle

**Status:** PLANNED  
**Depends on:** P5-050  
**Traceability:** T50

## Objective

Make a newly activated school professional immediately usable without weakening capability-based authorization.

## Required outcomes

1. A server-owned, idempotent baseline access invariant grants the approved professional baseline, including `TEACHER_BASE / PERSONAL`.
2. Existing applicable ACTIVE users receive an auditable reconciliation/backfill path.
3. The account administration UI distinguishes:
   - personnel profile/title;
   - work responsibility template;
   - effective capability grants.
4. Initial responsibility templates must cover, at minimum:
   - Giáo viên;
   - Tổ trưởng chuyên môn;
   - Phó Hiệu trưởng phụ trách chuyên môn;
   - Hiệu trưởng;
   - Điều phối GDĐP;
   - Điều phối HĐTN-HN;
   - Quản trị tài khoản/kỹ thuật where applicable.
5. Before applying a template, the UI shows the exact grant delta in Vietnamese.
6. Applying a template materializes ordinary capability grants with normal scope/effectivity/audit semantics.
7. A template must not silently revoke unrelated manually granted authority.
8. `positionTitle`, display name, subject membership, assignment, duty, or UI label must never authorize backend access.
9. No template may imply `SYSTEM_ADMIN`, `CAPABILITY_GRANT`, `USER_MANAGE`, or other sensitive authority unless explicitly included in the approved template definition.
10. PHT reporting approval must include every explicit prerequisite required by the existing authorization contract; administrators must not be expected to discover capability combinations by trial and error.
11. User administration must provide a **safe delete** workflow for accidental/test accounts, while preserving business history for real accounts.

## Required test evidence

- create -> activate -> first login baseline;
- repeat reconciliation is idempotent;
- PHT template preview and apply;
- unrelated grants preserved;
- title-only user receives no authority;
- template does not bypass backend guards;
- audit records identify actor, target, template/version and exact grant changes;
- Web persona test confirms expected workspace routes become reachable without direct URL knowledge.

## Forbidden shortcuts

- no role/title switcher in the client;
- no hardcoded bypass in route guards;
- no blanket `SYSTEM_ADMIN` or "all permissions" PHT template;
- no direct database grant insertion outside the normal service/transaction path.


## Safe user deletion contract

Physical deletion is a narrow clean-slate operation, not the normal way to end employment or access.

### Eligible delete

The server may permit physical deletion only after an authoritative preflight proves all of the following:

- the target is not the current actor and is not a protected/bootstrap account;
- the target has never established an operational login history (`lastLoginAt` is null and no retained `AuthSession`);
- the target has no retained capability-grant history as subject and has not acted as grant/revoke authority;
- the target has no audit events as business actor;
- the target has no teaching assignment, homeroom responsibility, additional duty, timetable/import authority, PPCT authority, calendar/operational command, execution evidence, reporting history, programme-planning history, Telegram state, notification state, or other retained operational/business provenance;
- every remaining dependent row belongs to an explicitly approved **clean-slate setup allowlist**. The initial allowlist may include only profile/catalog setup rows such as `StaffProfile`, `SubjectGroupMembership` and `StaffSubject`; any expansion requires review of the actual FK graph.

If any blocker exists, the delete command must fail closed and the UI must direct the administrator to **Vô hiệu hóa** instead.

### Delete UX

Before deletion the UI must show, in Vietnamese:

- exact username and display name;
- whether physical deletion is allowed;
- blocking business references, if any;
- exact clean-slate rows that will be removed;
- a warning that physical deletion is irreversible.

The final destructive confirmation must require the exact username (or an equally explicit confirmation contract) and must not be a one-click row action.

### Transaction and audit

- Re-evaluate eligibility inside the same database transaction used for deletion.
- Delete only the server-owned allowlisted setup rows, then the User record.
- Never use unrestricted cascade deletion across the business graph.
- Emit a retained audit record owned by the administrator actor with the deleted user ID/username/display-name snapshot and the exact cleanup categories; do not retain password hashes or secrets.
- Concurrency must fail closed if another transaction creates a protected reference after preview.

### Required test evidence

In addition to the access/template tests above:

- pristine test account with profile only -> deletable;
- pristine test account with allowlisted subject-group/subject setup -> deletable atomically;
- self-delete -> denied;
- bootstrap/protected account -> denied;
- account with login session/history -> denied;
- account with capability history -> denied;
- account with teaching/homeroom/operational/reporting/programme/Telegram/notification history -> denied;
- preview-to-confirm stale race -> denied with zero partial cleanup;
- blocked account can still be disabled through the existing lifecycle;
- successful delete leaves zero orphaned allowlisted rows and preserves unrelated users/data.
