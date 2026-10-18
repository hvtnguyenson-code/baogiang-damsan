# P5-051 Parent Pre-Merge Review & Governance Closure Summary

## 1. Executive Summary & Governance Context

- **Task Identifier:** `P5-051` (Traceability: `T50`).
- **Parent Task:** `P5-050` (`CLOSED` by `SYNC-P5-050`).
- **Target Branch:** `feat/p5-051-professional-baseline-responsibility-templates`.
- **Pull Request:** PR #240 (Trạng thái: **DRAFT / UNMERGED**; auto-merge: disabled).
- **Exact Baseline Reviewed Commit:** `854bdb5d6f0a2818b5e5deec7f1b0ef2dacf1722`.
- **Baseline CI Verification:**
  - `CI` Run ID: `39137629512` — **SUCCESS** (Run #798).
  - `P6-021 off-host compatibility` Run ID: `39137629459` — **SUCCESS** (Run #52).
- **Current Lifecycle Status:** `IN_PROGRESS` (READY FOR PARENT MERGE APPROVAL).
  - Deliberately unmerged awaiting Product Owner / Lead Reviewer explicit approval.
  - Closed status is strictly forbidden before parent merge; post-merge closure will follow the canonical `SYNC-P5-051` protocol.

---

## 2. Phase & Slice Implementation Breakdown

### Slice A — Professional Access Baseline & Responsibility Templates
- **Delivered Scope:**
  - Implemented server-owned baseline access invariant (`TEACHER_BASE / PERSONAL`) applied idempotently upon activation.
  - Built approved Responsibility Templates catalog:
    - Giáo viên: template `TEACHER`, grant nền `TEACHER_BASE / PERSONAL` và các quyền nghiệp vụ được khai báo;
    - Tổ trưởng chuyên môn: template `SUBJECT_LEADER`, grant `SUBJECT_GROUP_LEAD / SUBJECT_GROUP` cùng các quyền được giới hạn theo tổ/môn;
    - Phó Hiệu trưởng phụ trách chuyên môn: template `VICE_PRINCIPAL_ACADEMIC`, grant phê duyệt `APPROVAL_VICE_PRINCIPAL / SCHOOL_WIDE` và quyền nghiệp vụ được khai báo;
    - Hiệu trưởng: template `PRINCIPAL`, grant phê duyệt `APPROVAL_PRINCIPAL / SCHOOL_WIDE` và quyền nghiệp vụ được khai báo;
    - Điều phối viên GDĐP: template `GDDP_COORDINATOR`, grant `GDDP_COORDINATOR / ACTIVITY` theo ProgrammeMaster được chỉ định;
    - Điều phối viên HĐTN-HN: template `HDTN_COORDINATOR`, grant `HĐTN_COORDINATOR / ACTIVITY` theo ProgrammeMaster được chỉ định;
    - Quản trị tài khoản/kỹ thuật: template `TECHNICAL_ACCOUNT_ADMIN`, grant `USER_MANAGE / SCHOOL_WIDE`, `CAPABILITY_GRANT / SCHOOL_WIDE` và các quyền kỹ thuật trong catalog; **không tự cấp `SYSTEM_ADMIN`**.
  - Idempotent reconciliation API endpoint for backfilling baseline grants across existing active users.
- **Review Checkpoint:** Reviewed at commit `d0c9f0d3ea9b032962ad258606d2b8809e742542` (PR CI #783 / compatibility #49 SUCCESS).

### Slice B — Safe Clean-Slate User Deletion Backend
- **Delivered Scope:**
  - Preflight verification and execution endpoints for physical clean-slate user deletion (`DELETE /api/users/:id`).
  - Strict allowlist of setup-only dependent relations: `StaffProfile`, `SubjectGroupMembership`, `StaffSubject`.
  - Fail-closed denial when operational business history exists:
    - Login sessions (`lastLoginAt` not null or `AuthSession` records exist);
    - Capability grant history as subject or granting actor;
    - Teaching assignments, homeroom responsibilities, timetable entries, or timetable import history;
    - Curricular teaching executions, substitutions, make-up records, or progress debts;
    - Special programme planning, occurrences, slot staffing, materialization, or attestations;
    - Workload adjustment policies or historical reporting statement records;
    - In-app notification or Telegram linkage state.
  - Atomic deletion executed inside a dedicated database transaction with retained actor-owned audit events.
- **Review Checkpoint:** Documented in `docs/phase-reports/P5-051-SLICE-B-REPORT.md`.

### Slice C — User Administration Workspace & Visual Redesign
- **Delivered Scope:**
  - Vietnamese user management workspace (`/quan-tri/nguoi-dung`) providing complete account lifecycle operations.
  - Aesthetic overhaul adhering strictly to `DESIGN.md` (warm corporate aesthetic, tailored elevation, token-driven palette, responsive cards and dialogs, clear status badges).
  - Administrative Read-Model for GDĐP and HĐTN coordinator options with bounded scope resolution.
  - Interactive Vietnamese grant preview showing exact capability changes before template application.
  - Explicit two-step modal confirmation for safe physical deletion requiring exact username confirmation.

### Corrections 001 & 002 — Coordinator Fail-Closed & Cache Hardening
- **Correction 001:** Bổ sung phân trang đầy đủ cho danh mục năm học/chương trình, sửa quy tắc tự chọn năm học theo tổng số bản ghi và kiểm tra membership/fail-closed cho coordinator.
- **Correction 002:**
  - Strict fail-closed on in-flight refetch: Apply button disabled while queries are pending, resolving, or in error.
  - Isolation of placeholder/cached data to prevent applying stale or unverified template configurations.
  - Per-programme-type cache isolation (`gddp` vs `hdtn`) to eliminate cross-scope contamination.
  - Same-key refetch trả lỗi 403: ngay khi refetch bắt đầu, Preview/Apply bị khóa và snapshot cũ bị hủy; nếu lỗi xảy ra, hành động tiếp tục bị chặn và thông báo lỗi được hiển thị.
- **Review Checkpoint:** Verified on commit `854bdb5d6f0a2818b5e5deec7f1b0ef2dacf1722`.

---

## 3. Mock Screenshots vs. Real PostgreSQL CI Evidence

- **Aesthetic & UI/UX Validation (Mock Harness):**
  - Các trạng thái UI, bố cục responsive và một số tình huống điều hướng/tương tác được kiểm tra bằng mock fixtures trong Vite/Playwright; ảnh mock không chứng minh pixel-perfect trên mọi thiết bị hoặc hành vi với dữ liệu production.
- **Backend Invariant & Transaction Validation (Real PostgreSQL):**
  - Bộ 680 bài kiểm thử tích hợp trên PostgreSQL cô lập của CI kiểm tra các ràng buộc FK, điều kiện chặn xóa, khóa/giao dịch cạnh tranh và các nghiệp vụ khác; không suy diễn rằng mọi tình huống production đã được kiểm chứng.
  - No database mocks were used for authorization, transactional audit, or deletion preflight verification.

---

## 4. Scope, Capability & Deletion Guards

1. **Capability-Only Authorization:**
   - Authority is derived solely from active, scoped `CapabilityGrant` records.
   - Job titles (`positionTitle`), display names, or department labels never authorize access to backend resources or administrative routes.
2. **Template Materialization Contract:**
   - Responsibility templates are purely client/server catalog helpers that materialize explicit, auditable `CapabilityGrant` entries.
   - Applying a template never bypasses capability validation and never grants undeclared administrative privileges.
3. **Safe Deletion Invariant:**
   - Accounts with real operational footprint cannot be physically deleted; administrators are guided to disable (`Vô hiệu hóa`) the account instead.
   - Deletion removes only allowlisted setup metadata and records an immutable audit record without credential retention.

---

## 5. Diff Summary & Test Metrics

- **Repository Diff:** 40 changed files (+11,627 / -281 lines).
- **Database Schema & Migrations:**
  - **Zero database migrations** (`prisma/migrations` untouched).
  - Không thay đổi schema/migration. CI xác nhận PostgreSQL 16 cô lập; kiểm thử PostgreSQL 17 cục bộ được ghi nhận ở Slice B. Đây không phải chứng nhận tương thích trên cơ sở dữ liệu production.
- **Automated Test Results (Exact Baseline SHA):**
  - Web Unit & Component Tests: **493 / 493 PASS**.
  - API Integration Tests: **680 / 680 PASS** (PostgreSQL ephemeral suite).
  - End-to-End Smoke Tests: **15 / 15 PASS** (Playwright test suite).

---

## 6. Deployment & Pilot Boundary Non-Claims

- **PR #240 Status:** Open Draft, unmerged.
- **Production Isolation:**
  - Zero deployment actions performed.
  - Zero access or modifications to production VPS, Nginx configurations, or the protected DamSanV5 / Nội trú system (ports 3000/3100).
  - Production database on port 5434 untouched.
- **Downstream Programme Gate:**
  - `P5-052` (Task-oriented workspace navigation) remains `PLANNED` and blocked until `P5-051` is merged and closed via `SYNC-P5-051`.
  - `P5-057` and `P6-050` remain strictly pre-pilot.
