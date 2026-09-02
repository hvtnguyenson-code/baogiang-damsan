# ADR-044 — Pre-Pilot Product Realignment Governance

- **Status:** Proposed on P0 branch; becomes Accepted only after explicit Product Owner approval and merge.
- **Date:** 2026-09-03
- **Scope:** Product/spec governance and pre-pilot re-entry control only
- **Starting baseline:** `main@4bcf2e7fb2104304fd044693a0bf8838f6038d85`

## Context

The repository contains a substantial retained-history backend and current production delivery foundation. Independent pre-pilot audit found two governance failure modes:

1. several deliberately bounded/minimum-core slices were later treated as if they represented the complete product requirement, especially around Special Activity and special-program planning;
2. several intentionally deferred requirements remained only in prose and did not have a durable re-entry task, while mutable status documents also became stale relative to code already merged.

This ADR does not declare the existing implementation invalid. It establishes how the project must distinguish reusable primitives from incomplete product semantics and how all future/deferred work is tracked to closure.

## Decision

### 1. Realign, do not rebuild

Current foundations explicitly listed as `KEEP` in `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md` remain valid. No task may use this realignment as justification for a broad rewrite of identity, calendar, timetable, PPCT, operational overlays, execution, debt or statement history without a separate evidence-backed decision.

### 2. SpecialActivity is bounded runtime authority

ADR-034/035 and current SpecialActivity implementation remain authoritative for the runtime primitive they actually define:

- one atomic active/reversed scheduled activity occurrence;
- exact retained slots;
- frozen exact class targets;
- scheduled teacher occupancy;
- canonical class/teacher/time collision checks;
- immutable/corrective history.

They are **not sufficient authority for complete GDĐP/HĐTN programme planning**. Future programme semantics must be introduced as an upstream domain and may bridge into the existing runtime primitive.

Therefore no future task may infer from current SpecialActivity that the product has already solved:

- GDĐP annual/grade programme planning;
- HĐTN CLASS/GRADE/SCHOOL programme modes;
- date-effective homeroom responsibility;
- per-slot programme staffing;
- coordinator programme authority;
- special-program workload/reporting aggregation.

### 3. Deferred work must be registered, not merely mentioned

`docs/governance/PRE-PILOT-TASK-REGISTER.md` is the canonical work register.

Plain prose such as `deferred`, `later`, `future slice`, `not assessed`, or `out of scope for now` is insufficient for any requirement that may matter to the current product or pilot.

Every such item must have:

- a stable task ID;
- an explicit status;
- dependency;
- re-entry trigger;
- expected deliverable or accepted non-pilot disposition.

A parent major task cannot close while it has created an unregistered deferral.

### 4. Traceability is a merge gate for business semantics

`docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md` is mandatory for cross-domain product work.

Every major task must cite the traceability row IDs it changes or relies upon. If a task discovers a new requirement, changes a disposition, or creates a new deferral, the same PR must update both traceability and the task register.

Current implementation is evidence of what exists. It is never, by itself, proof that the complete product requirement has been satisfied.

### 5. One canonical current-state authority

`docs/governance/CURRENT-PROJECT-STATUS.md` becomes the canonical mutable current-state document.

`README.md`, `docs/PROJECT_CONTEXT.md` and `docs/architecture/CORE-BACKEND-ROADMAP.md` may summarize current state but must point to the canonical status and must not independently maintain contradictory phase chronology.

Historical ADRs, phase reports and old task files remain historical evidence. They are not rewritten merely to make current history look consistent.

### 6. Major task completion includes post-merge documentation synchronization

The mandatory lifecycle is:

`PLANNED -> READY -> IN_PROGRESS -> IN_REVIEW -> MERGED_AWAITING_DOC_SYNC -> CLOSED`.

A merge is not task closure. After authoritative post-merge CI succeeds, exact merge SHA/CI/current status and any follow-up work must be synchronized according to `docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`.

No dependent major task may begin while the previous required task is `MERGED_AWAITING_DOC_SYNC`.

### 7. Minimum-core decisions require explicit re-entry accounting

Every future minimum-core architecture decision must list:

- broader product requirements it does not satisfy;
- whether each item is non-pilot or deferred-with-trigger;
- exact re-entry task IDs;
- which primitive is safe to reuse later;
- which broader semantics are forbidden to infer from the minimum core.

A minimum core is not automatically the product model.

### 8. New pre-pilot product authorities to close separately

This ADR records the required re-entry sequence but does not define physical schemas or runtime for:

- HomeroomAssignment;
- Business Configuration Control Plane;
- delayed go-live/operational-start policy;
- real PPCT import contract;
- native Đam San timetable adapter and morning/afternoon carry-forward;
- pre-operational historical execution/reconciliation;
- GDĐP/HĐTN programme planning;
- coordinator resource authority;
- special-activity workload/reporting;
- WorkloadAdjustmentRule;
- PWA and Telegram pilot integration;
- Báo giảng first-cert HTTP-01/TLS production authority and actual VPS evidence.

Those items remain separate tasks with separate architecture, implementation, review and merge gates.

## Authority relationship

This ADR does **not** retroactively rewrite historical ADRs.

Where `PRE-PILOT-TRACEABILITY-MATRIX.md` marks an earlier minimum-core decision as `REALIGN` or `RESTORE`, the earlier implementation remains the current runtime contract until its re-entry task is accepted. However, no new product feature may extend the narrower primitive as if the reopened broader requirement were already solved.

For product semantics after acceptance of this ADR, the active pre-pilot product baseline and traceability matrix must be read before relying on older bounded ADR scope.

The v1.3 addendum remains authoritative for production environment and delivery constraints.

## Consequences

- The next phase is governed by a finite task register instead of an open-ended chain of prose “later” items.
- Current status documentation cannot be called closed while post-merge sync is pending.
- SpecialActivity runtime can be reused instead of rebuilt, while special-program planning is reintroduced at the correct layer.
- Existing debt/history/statement invariants are protected from ad-hoc go-live shortcuts.
- Production deployment remains blocked by its existing operator-evidence gates and separate business/pilot readiness gates.

## Alternatives rejected

- Rebuild the backend from scratch because product completeness is imperfect.
- Treat every Accepted minimum-core ADR as proof that all broader source requirements are permanently removed.
- Keep deferred items only in historical audit prose.
- Use `SystemSetting` as an untyped catch-all for all business policy.
- Infer coordinator/professional authority from role/title or `SYSTEM_ADMIN`.
- Patch real school PPCT/TKB formats directly into core tables without a reviewed import contract.
- Start the next major task immediately after merge while current-state documentation still describes the previous baseline.

## Implementation authorization

None. This ADR is governance/product realignment only. Schema, runtime, UI, CI/CD behavior, production configuration and data mutation require separately registered tasks and explicit authorization.
