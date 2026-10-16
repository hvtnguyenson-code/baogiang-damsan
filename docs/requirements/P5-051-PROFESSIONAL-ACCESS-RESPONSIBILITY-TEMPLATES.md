# P5-051 — Professional Access Baseline & Responsibility Templates

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
