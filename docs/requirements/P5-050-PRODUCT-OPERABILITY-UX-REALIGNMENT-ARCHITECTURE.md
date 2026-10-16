# P5-050 — Product Operability & UX Realignment Architecture

**Status:** IN_REVIEW  
**Type:** docs-only architecture / product-governance registration  
**Canonical start:** `main@c61103d08a1324def8a9949e6a74b00e4d6cb905`  
**Trigger:** Product Owner live operability review on 2026-10-16 after creating, activating and granting permissions to a Vice Principal account.  
**Production mutation:** FORBIDDEN in this task.

## 1. Purpose

P5-050 reopens product operability before teacher pilot. The repository has strong domain/backend foundations, but live administrator use exposed a systemic mismatch between implemented backend authority and reachable, understandable end-user workflows.

This is a **product integration and UX realignment**, not a backend rewrite.

P5-050 establishes the mandatory work graph P5-051..P5-057 and prevents any future "pilot-ready" claim from being inferred solely from backend services, integration tests, or historical task labels marked CLOSED.

## 2. Mandatory authorities

Read in this order before any child task:

1. `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md`;
2. `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md`;
3. `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`;
4. `docs/specifications/PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx`;
5. `DESIGN.md`;
6. current implementation on the exact task baseline.

The original v1.2 specification remains authoritative for the following product expectations unless explicitly superseded: every school professional begins from teacher work, cumulative capability authorization, import preview-before-commit, no re-entry of technical IDs by ordinary users, TKB/PPCT/calendar/operational administration surfaces, retained per-account notifications, Web Push delivery, and desktop/mobile basic operability.

## 3. Evidence on starting main

The following are evidence of current-state gaps, not implementation prescriptions:

1. `UsersService.create/activate` does not materialize the baseline `TEACHER_BASE / PERSONAL` grant for an activated school professional.
2. `positionTitle` is profile text only; it does not create a coherent work responsibility bundle.
3. `CapabilitiesPage` requires an administrator to reason directly about low-level capability/scope/resource combinations.
4. `UsersPage` supports create/edit/activate/disable/unlock/password reset but has no safe account-deletion workflow; physical deletion must be restricted to clean-slate accidental/test accounts rather than exposed as unrestricted CRUD.
5. Native timetable ingestion is implemented in `apps/api/src/timetable-import`, `timetables`, and `time-slots`, but `apps/web` has no timetable-import administration page or route and does not consume `TIMETABLE_MANAGE`.
6. PPCT native import has a UI, but discoverability is entirely dependent on exact low-level grants.
7. `CALENDAR_EXCEPTION_MANAGE`, `TIMETABLE_MANAGE`, `TEACHING_EXECUTION_RECORD`, and `REPORTING_READ` do not currently have coherent Web navigation surfaces matching their backend authority.
8. `AppLayout` renders a flat capability-filtered navigation. Current route catalogs allow up to 18 management links plus 4 professional links, in addition to fixed links.
9. `HomePage` is primarily a route index; it is not an action/readiness workspace.
10. The v1.2 mandatory per-account notification center and Web Push business channel are not implemented as an end-user product surface. Telegram is a separate channel and is not authority to remove the original in-app notification requirement.
11. P4-040 documentation references traceability row T31 while the canonical traceability matrix does not currently contain T31. P5-050 MUST NOT reuse or redefine T31. Historical T31 reconciliation is registered separately under P0-005.

## 4. Audit baseline

For planning only, the 2026-10-16 product audit estimated:

- domain/backend implementation: approximately 85–90%;
- end-to-end reachable product workflows: approximately 55–60%;
- overall functional product conformance: approximately 61%;
- new Vice Principal self-operability: approximately 35–45%.

These percentages are **diagnostic estimates, not closure criteria**. P5-057 replaces them with binary persona/workflow evidence.

## 5. Locked product principles

### 5.1 Authorization remains capability-based

Titles such as "Phó Hiệu trưởng" MUST NOT become backend authorization rules. Existing capability/scope default-deny semantics remain authoritative.

Responsibility templates introduced by P5-051 are an administration usability layer that materializes explicit capability grants. They are never a hidden alternate authorization engine.

### 5.2 Baseline professional access is server-owned

An activated school professional account must receive the approved baseline professional grant set, including `TEACHER_BASE / PERSONAL`, through a server-owned idempotent invariant. Existing applicable accounts require a controlled backfill/reconciliation path.

Pure technical/service identities, if any, require an explicit documented exception; omission must never be accidental.

### 5.3 A backend capability is not product-complete when its required UI is absent

If the authoritative specification requires ordinary school users to perform a workflow through the product, backend services/tests alone cannot close that product requirement. The required UI, navigation, loading/error/empty/unauthorized states, and persona E2E evidence are part of closure.

### 5.4 Navigation follows school work, not the capability catalog

The primary information architecture must group work by real school tasks. Capabilities decide access to actions and data; they must not directly dictate a flat top-level menu.

### 5.5 Importers remain single-source

P5-053/P5-055 must reuse existing TKB/PPCT/history/special-programme import authorities. No second parser, second import ledger, or client-side business authority is permitted.

### 5.6 Telegram does not replace the retained notification center

Telegram remains an optional dedicated integration. P5-056A/P5-056 restore the in-app per-account notification requirement and Web Push delivery without coupling the two channels.

## 6. Mandatory task graph

| Task | Scope | Depends on |
|---|---|---|
| P5-051 | Professional baseline access + responsibility templates + safe user lifecycle | P5-050 |
| P5-052 | Task-oriented information architecture + role-aware workspace | P5-050, P5-051 |
| P5-053 | Timetable + time-slot administration workspace | P5-050, P2-050 |
| P5-054 | Teaching-operations workspace closure | P5-050, P2-050, P3-031 |
| P5-055 | Unified data-readiness & import center | P5-052, P5-053, P2-020, P3-020, P4-074 |
| P5-056A | In-app notification + Web Push architecture | P5-050 |
| P5-056 | In-app notification + Web Push implementation | P5-056A |
| P5-057 | Persona operability E2E freeze | P5-051..P5-056 + existing pilot foundations |

No child task may start before P5-050 is CLOSED.

## 7. Pilot gate

`P6-050 Teacher pilot go-live verification` must depend on `P5-057`.

Infrastructure/CD work may continue under its own P6 gates, but **teacher pilot authorization is prohibited** until product operability is frozen by P5-057.

## 8. Closure criteria for P5-050

P5-050 is CLOSED only when:

1. this architecture is independently reviewed;
2. T50–T56 are registered in the canonical traceability matrix;
3. P5-051..P5-057 and P5-056A are registered in the canonical task register, with P5-051 covering safe clean-slate user deletion;
4. P6-050 dependency includes P5-057;
5. current project status reflects the reopened product-operability path;
6. no runtime/schema/API/UI/deployment/VPS mutation is present in the P5-050 PR;
7. exact-head CI and post-merge CI are successful;
8. mandatory documentation sync is complete.

