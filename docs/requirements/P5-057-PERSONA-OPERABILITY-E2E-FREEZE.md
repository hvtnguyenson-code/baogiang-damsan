# P5-057 — Persona Operability E2E Freeze

**Status:** PLANNED  
**Depends on:** P5-051, P5-052, P5-053, P5-054, P5-055, P5-056, P5-020, P5-030, P5-010  
**Traceability:** T56

## Objective

Replace subjective completion claims with end-to-end evidence that real school personas can discover and complete their work through the product UI.

## Mandatory personas

- Giáo viên;
- Tổ trưởng chuyên môn;
- Phó Hiệu trưởng phụ trách chuyên môn;
- Hiệu trưởng;
- Admin/quản trị tài khoản;
- Điều phối GDĐP;
- Điều phối HĐTN-HN.

A persona may share a test fixture with another persona only when the distinct authorization/workspace behavior is still explicitly asserted.

## Mandatory PHT journey

From a clean controlled fixture:

1. Admin creates the PHT account.
2. Account is activated.
3. Approved PHT responsibility template is previewed/applied.
4. PHT completes first-login password change.
5. PHT lands in a usable workspace, not an empty route index.
6. PHT can discover and enter:
   - personal teacher work;
   - TKB administration;
   - PPCT import/management;
   - school data readiness;
   - professional teaching operations;
   - reporting/approval;
   - special-programme administration allowed by authority.
7. Unauthorized technical/account-security operations remain absent/denied unless separately granted.

## General acceptance rules

- No mandatory workflow requires typing a URL.
- No ordinary user must enter a raw UUID or capability key.
- No page may claim a task is available when its backend authorization will deterministically reject the actor.
- Denied/empty/error/loading/session-expired states are tested.
- Desktop 1366×768 and representative Android widths are tested.
- Keyboard navigation and visible focus are tested for principal paths.
- Long Vietnamese strings and basic 200% zoom behavior are reviewed.
- Existing domain invariants remain green; UX closure must not weaken backend safety.

## Closure gate

P5-057 requires:

1. automated persona E2E suite;
2. deterministic screenshots/walkthrough evidence for principal pages;
3. independent UX/product review against `DESIGN.md`;
4. complete cross-domain regression;
5. exact-head CI success;
6. post-merge main CI success;
7. documentation sync;
8. zero open HIGH/CRITICAL operability finding.

Only after P5-057 is CLOSED may P6-050 claim teacher-pilot operability.
