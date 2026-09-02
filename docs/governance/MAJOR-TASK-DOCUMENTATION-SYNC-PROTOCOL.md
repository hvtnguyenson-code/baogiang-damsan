# Major Task Documentation Sync Protocol

## Status

**PROPOSED MANDATORY GOVERNANCE RULE.**

This protocol becomes repository authority only after the P0 realignment PR is explicitly approved and merged. It defines when a major task is actually complete and prevents stale current-state documentation or forgotten deferred work.

## 1. What counts as a major task

A task is **major** if it changes or closes any of the following:

- product/business semantics;
- schema/migration or retained business persistence;
- capability/scope/authorization behavior;
- public API or command contract;
- import format/profile/identity/replay behavior;
- reporting/workload/debt/statement calculations;
- cross-domain precedence or historical-resolution rules;
- a user-visible business workflow or pilot-critical UI;
- PWA/Telegram operational integration;
- deployment/TLS/database/production state;
- any P0–P6 task in `PRE-PILOT-TASK-REGISTER.md`.

Small copy/CSS/doc typo fixes are not major unless they alter an authority statement or current-status claim.

## 2. Canonical mutable status surfaces

The repository must maintain these as the current-state authorities:

1. `docs/governance/PRE-PILOT-TASK-REGISTER.md` — all planned/blocked/deferred work and exact closure state.
2. `docs/governance/CURRENT-PROJECT-STATUS.md` — concise canonical current product/repository status.
3. `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md` — requirement-to-implementation disposition when semantics or scope changes.
4. `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md` — updated only when Product Owner authority changes.

`README.md`, `docs/PROJECT_CONTEXT.md` and `docs/architecture/CORE-BACKEND-ROADMAP.md` are summaries/planning surfaces. They must point to the canonical files above and must not contradict them.

## 3. Required task lifecycle

Major tasks follow exactly this state progression unless cancelled/blocked:

```text
PLANNED
  -> READY
  -> IN_PROGRESS
  -> IN_REVIEW
  -> MERGED_AWAITING_DOC_SYNC
  -> CLOSED
```

A task is **not CLOSED merely because its PR was merged**.

## 4. Before implementation starts

Before any major implementation edit:

1. The task must already exist in `PRE-PILOT-TASK-REGISTER.md`.
2. Every dependency must be `CLOSED`.
3. No preceding required task may be `MERGED_AWAITING_DOC_SYNC`.
4. The task branch must be created from the exact reviewed canonical `main` SHA.
5. The task document/prompt must cite relevant traceability IDs.
6. If the task is reopening a deferred item, its recorded trigger must actually have fired.
7. Status must move to `IN_PROGRESS` in the task branch.

If a requested task is not registered, **stop and register/audit it first**. Do not code first and document later.

## 5. Before a PR may be marked ready for review

The task branch must already contain synchronization of the intended state:

- task register row -> `IN_REVIEW`;
- current project status -> describes the branch as pending review, not as merged/closed;
- traceability rows -> updated if requirement disposition, scope or implementation coverage changed;
- product baseline/ADR -> updated only if authority changed;
- roadmap/README/project context -> updated if their summary would otherwise become false after merge;
- any newly deferred item -> registered with exact trigger and target task.

The PR body must include a **Documentation Sync** section naming every canonical status file touched or stating why a file was not applicable.

## 6. Merge does not close a major task

Immediately after merge, the task logically becomes:

`MERGED_AWAITING_DOC_SYNC`.

The project must then establish:

- exact merge/main SHA;
- authoritative post-merge CI run/result;
- actual merged file set;
- whether any correction/re-entry task emerged from review or CI.

No dependent major task may start while this state remains.

## 7. Mandatory post-merge documentation sync

After post-merge CI succeeds, perform one bounded documentation synchronization before starting the next dependent major task. It may be a small dedicated docs branch/PR.

At minimum update:

### Always

- `PRE-PILOT-TASK-REGISTER.md`:
  - task -> `CLOSED`;
  - exact merge/main SHA;
  - authoritative post-merge CI identifier/result;
  - any follow-up task IDs.
- `CURRENT-PROJECT-STATUS.md`:
  - canonical main SHA;
  - newly closed capability/domain;
  - next permitted tasks;
  - remaining blockers.

### When applicable

- `PRE-PILOT-TRACEABILITY-MATRIX.md` if implementation coverage or disposition changed;
- `PRE-PILOT-PRODUCT-BASELINE.md` if Product Owner authority changed;
- applicable ADR/decision closure if a new accepted decision exists;
- `CORE-BACKEND-ROADMAP.md` if sequence/status changed;
- `README.md` if high-level user/developer status changed;
- `PROJECT_CONTEXT.md` if the durable architecture/context summary changed.

The docs-sync PR itself does not reopen business implementation. It only records already-established evidence.

## 8. No orphan deferrals

A parent task may not close if it introduces language equivalent to:

- later;
- future slice;
- deferred;
- out of scope for now;
- not assessed;
- follow up;
- re-enter later;

without either:

1. an existing task-register row covering the item; or
2. a new row created in the same PR.

Every deferred row must contain:

- stable task ID;
- `DEFERRED_WITH_TRIGGER` status;
- exact re-entry trigger;
- upstream dependency;
- expected product consequence if never implemented.

If the deferral is intentionally permanent for the current product, use `NON_PILOT`/`CANCELLED` with explicit Product Owner reasoning rather than an unbounded “later”.

## 9. Minimum-core safeguard

If an architecture task defines a “minimum core”, it must also state:

- which broader product requirements the minimum core does **not** satisfy;
- whether those requirements are `NON_PILOT` or `DEFERRED_WITH_TRIGGER`;
- the exact task-register IDs that will re-enter them;
- which current primitive may be reused later and which semantics must not be inferred from it.

A minimum core is never automatically the final product model.

## 10. Correction safeguard

If review or CI finds a defect:

- do not mark the parent `CLOSED`;
- audit the surrounding domain and downstream assumptions;
- register the consolidated correction task if it is not already part of the same branch;
- ensure traceability/status docs show the correction dependency;
- do not allow later dependent work to rely on the failed assumption.

## 11. Evidence hierarchy for status claims

A status document may claim `CLOSED / GREEN` only when it has direct evidence of:

1. exact reviewed task head;
2. exact merged canonical main SHA;
3. authoritative post-merge CI success for that SHA when CI is applicable;
4. independent review of the actual GitHub diff;
5. required documentation sync.

Agent prose, script footer text or local-only PASS is supporting evidence, not closure authority.

## 12. Production exception

Emergency production safety work may temporarily interrupt the sequencing only with explicit Product Owner authorization. Even then:

- the emergency task must receive a registered ID;
- its production scope must be isolated;
- normal task status must record the interruption;
- documentation sync remains mandatory afterward.

## 13. Pull-request checklist gate

`.github/pull_request_template.md` mirrors this protocol. A major PR with unchecked task-registration or documentation-sync items is not merge-ready.
