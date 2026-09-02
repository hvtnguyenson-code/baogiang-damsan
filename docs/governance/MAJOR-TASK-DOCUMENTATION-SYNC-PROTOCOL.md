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

Small copy/CSS/doc typo fixes are not major unless they alter product authority or product/task status.

**Administrative closure-sync microtasks defined in §7 are a deliberate exception.** They update status evidence only and do not become another major task; otherwise documentation synchronization would recurse forever.

## 2. Canonical mutable status surfaces

The repository must maintain these as the product/task current-state authorities:

1. `docs/governance/PRE-PILOT-TASK-REGISTER.md` — all planned/blocked/deferred work and exact closure state.
2. `docs/governance/CURRENT-PROJECT-STATUS.md` — concise current product/task status.
3. `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md` — requirement-to-implementation disposition when semantics or scope changes.
4. `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md` — updated only when Product Owner authority changes.

`README.md`, `docs/PROJECT_CONTEXT.md` and `docs/architecture/CORE-BACKEND-ROADMAP.md` are summaries/planning surfaces. They must point to the canonical files above and must not contradict them.

### Exact Git state is never self-reported by a status file

A repository file cannot reliably contain the SHA of the commit that contains that file. Therefore:

- every task start must fetch/read exact current `main` directly from Git/GitHub;
- status docs record the **last closed major-task merge SHA and CI evidence**, not a claim that their embedded SHA equals the latest docs-only commit on `main`;
- when exact current `main` matters, Git/GitHub is the source of truth, never a copied SHA in prose.

This avoids a self-referential status-sync loop.

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

A task is **not CLOSED merely because its implementation/business PR was merged**.

## 4. Before implementation starts

Before any major implementation edit:

1. The task must already exist in `PRE-PILOT-TASK-REGISTER.md`.
2. Every dependency must be `CLOSED`.
3. No preceding required task may be `MERGED_AWAITING_DOC_SYNC`.
4. Exact current `main` must be read directly from Git/GitHub and reviewed; do not trust a copied status-document SHA as current Git state.
5. The task branch must be created from that exact reviewed canonical `main` SHA.
6. The task document/prompt must cite relevant traceability IDs.
7. If the task is reopening a deferred item, its recorded trigger must actually have fired.
8. Status must move to `IN_PROGRESS` in the task branch.

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

Immediately after the major-task PR merges, the task logically becomes:

`MERGED_AWAITING_DOC_SYNC`.

The project must then establish directly from GitHub:

- exact major-task merge/main SHA;
- authoritative post-merge CI run/result for that SHA when applicable;
- actual merged file set;
- whether any correction/re-entry task emerged from review or CI.

No dependent major task may start while this state remains.

## 7. Mandatory post-merge closure sync — non-recursive administrative microtask

After the major-task post-merge CI succeeds, perform exactly one bounded **closure-sync microtask** before starting the next dependent major task.

### 7.1 Identity

The closure sync uses a derived ID:

```text
SYNC-<parent-task-id>
```

Example:

```text
SYNC-P4-050
```

It does **not** need its own permanent task-register row because it is part of the parent task's closure protocol. The parent row remains `MERGED_AWAITING_DOC_SYNC` until the closure-sync PR is merged.

### 7.2 Allowed scope

A closure-sync microtask may change only documentation/status surfaces needed to record already-established evidence, normally:

- `PRE-PILOT-TASK-REGISTER.md`;
- `CURRENT-PROJECT-STATUS.md`;
- traceability/roadmap/README/PROJECT_CONTEXT when required to reflect the already-merged major task.

It must not:

- introduce new business semantics;
- change schema/runtime/UI behavior;
- create a new architecture decision;
- alter production state;
- smuggle a correction into a docs-only closure.

If new semantics or a defect is discovered, stop closure and register a normal correction/architecture task instead.

### 7.3 Required closure evidence

The sync must record for the **parent major task**:

- exact parent merge/main SHA;
- authoritative parent post-merge CI identifier/result when applicable;
- independent GitHub review result;
- exact follow-up/correction/re-entry task IDs, if any;
- parent status -> `CLOSED` only when all closure evidence is satisfied.

`CURRENT-PROJECT-STATUS.md` should record the **last closed major-task SHA/CI**, not pretend to know the future merge SHA of the closure-sync PR itself.

### 7.4 No recursion

The closure-sync PR is administrative evidence recording, not another major task. Once it is independently reviewed and merged:

- the parent major task is `CLOSED`;
- no second `SYNC-SYNC-...` task is created;
- no further docs-only merge SHA needs to be embedded merely to prove that the sync file itself exists.

At the next task start, exact current `main` is read directly from Git/GitHub as required by §4.

## 8. Files synchronized by the closure sync

### Always

- `PRE-PILOT-TASK-REGISTER.md`:
  - parent task -> `CLOSED`;
  - exact parent merge/main SHA;
  - authoritative parent post-merge CI identifier/result;
  - any follow-up task IDs.
- `CURRENT-PROJECT-STATUS.md`:
  - last closed major task + merge SHA/CI;
  - newly closed capability/domain;
  - next permitted tasks;
  - remaining blockers.

### When applicable

- `PRE-PILOT-TRACEABILITY-MATRIX.md` if implementation coverage or disposition changed;
- `PRE-PILOT-PRODUCT-BASELINE.md` if Product Owner authority changed in the parent task;
- applicable ADR/decision closure if already accepted by the parent task;
- `CORE-BACKEND-ROADMAP.md` if sequence/status changed;
- `README.md` if high-level user/developer status changed;
- `PROJECT_CONTEXT.md` if durable architecture/context changed.

## 9. No orphan deferrals

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
2. a new row created in the same major-task PR.

Every deferred row must contain:

- stable task ID;
- `DEFERRED_WITH_TRIGGER` status;
- exact re-entry trigger;
- upstream dependency;
- expected product consequence if never implemented.

If the deferral is intentionally permanent for the current product, use `NON_PILOT`/`CANCELLED` with explicit Product Owner reasoning rather than an unbounded “later”.

## 10. Minimum-core safeguard

If an architecture task defines a “minimum core”, it must also state:

- which broader product requirements the minimum core does **not** satisfy;
- whether those requirements are `NON_PILOT` or `DEFERRED_WITH_TRIGGER`;
- the exact task-register IDs that will re-enter them;
- which current primitive may be reused later and which semantics must not be inferred from it.

A minimum core is never automatically the final product model.

## 11. Correction safeguard

If review or CI finds a defect:

- do not mark the parent `CLOSED`;
- audit the surrounding domain and downstream assumptions;
- register the consolidated correction task if it is not already part of the same branch;
- ensure traceability/status docs show the correction dependency;
- do not allow later dependent work to rely on the failed assumption.

If a defect is discovered during closure sync, the sync must not hide/fix runtime behavior; register the correction and keep the parent non-`CLOSED` until the accepted correction policy permits closure.

## 12. Evidence hierarchy for status claims

A parent major task may claim `CLOSED / GREEN` only when there is direct evidence of:

1. exact reviewed task head;
2. exact merged major-task main SHA;
3. authoritative post-merge CI success for that SHA when CI is applicable;
4. independent review of the actual GitHub diff;
5. merged closure-sync evidence.

Agent prose, script footer text or local-only PASS is supporting evidence, not closure authority.

## 13. Production exception

Emergency production safety work may temporarily interrupt the sequencing only with explicit Product Owner authorization. Even then:

- the emergency task must receive a registered ID;
- its production scope must be isolated;
- normal task status must record the interruption;
- closure sync remains mandatory afterward.

## 14. Pull-request checklist gate

`.github/pull_request_template.md` mirrors this protocol. A major PR with unchecked task-registration or documentation-sync items is not merge-ready. Closure-sync PRs identify themselves as `SYNC-<parent-task-id>` and use the non-recursive exception in §7.
