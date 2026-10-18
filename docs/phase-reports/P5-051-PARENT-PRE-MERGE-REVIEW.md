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
    - Giáo viên (`TEACHER_BASE / PERSONAL`);
    - Tổ trưởng chuyên môn (`SUBJECT_HEAD / SUBJECT`);
    - Phó Hiệu trưởng phụ trách chuyên môn (`VICE_PRINCIPAL / SCHOOL_WIDE` with reporting & operational view);
    - Hiệu trưởng (`PRINCIPAL / SCHOOL_WIDE`);
    - Điều phối viên GDĐP (`GDDP_COORDINATOR / ACTIVITY`);
    - Điều phối viên HĐTN-HN (`HDTN_COORDINATOR / ACTIVITY`);
    - Quản trị viên (`SYSTEM_ADMIN / SCHOOL_WIDE`).
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
- **Correction 001:** Scope/capability boundaries tightened; query option filtering guarded; raw ID leakage prevented.
- **Correction 002:**
  - Strict fail-closed on in-flight refetch: Apply button disabled while queries are pending, resolving, or in error.
  - Isolation of placeholder/cached data to prevent applying stale or unverified template configurations.
  - Per-programme-type cache isolation (`gddp` vs `hdtn`) to eliminate cross-scope contamination.
  - Same-key 403 error suppression when a user lacks permission for one coordinator family while administering another.
- **Review Checkpoint:** Verified on commit `854bdb5d6f0a2818b5e5deec7f1b0ef2dacf1722`.

---

## 3. Mock Screenshots vs. Real PostgreSQL CI Evidence

- **Aesthetic & UI/UX Validation (Mock Harness):**
  - Web persona journeys, responsive layouts, and visual redesign components were validated using Vite/Playwright mock test fixtures to confirm pixel-perfect visual styling, keyboard focus, and accessibility.
- **Backend Invariant & Transaction Validation (Real PostgreSQL):**
  - All foreign key constraints, deletion block invariants, concurrency compare-and-set (CAS), and transaction isolation were validated against real ephemeral PostgreSQL instances across 680 integration tests on GitHub Actions CI.
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
  - Full schema compatibility maintained with PostgreSQL 16/17 production databases.
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
