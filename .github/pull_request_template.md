# Pull Request

## Task identity

- Task ID: `...`
- Task register status before PR: `IN_PROGRESS`
- Exact base/canonical main SHA read directly from Git/GitHub: `...`
- Branch: `...`
- Relevant traceability rows: `...`

For an administrative closure-sync PR, use derived ID `SYNC-<parent-task-id>` and state the parent task explicitly. Closure-sync PRs follow the non-recursive exception in `docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`.

## Scope

Describe exactly what this PR changes and what it deliberately does not change.

## Authority read

Confirm the task reviewed the current applicable authorities:

- [ ] `docs/governance/CURRENT-PROJECT-STATUS.md`
- [ ] `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md`
- [ ] `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`
- [ ] `docs/governance/PRE-PILOT-TASK-REGISTER.md`
- [ ] `docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`
- [ ] applicable specification/addendum/ADRs/task-specific authority
- [ ] exact current `main` was read directly from Git/GitHub; no copied status-document SHA was treated as current Git authority

## Dependency gate

- [ ] Every registered dependency is `CLOSED`.
- [ ] No required predecessor is `MERGED_AWAITING_DOC_SYNC`.
- [ ] This PR does not extend a minimum-core primitive into a broader requirement marked `RESTORE`, `REALIGN` or `NEW_PRODUCT_AUTHORITY` without the required accepted closure.

## Deferred/re-entry gate

- [ ] This PR introduces no unregistered `deferred` / `later` / `future slice` / `not assessed` product work.
- [ ] Every new deferral, if any, has a stable task ID, dependency and explicit re-entry trigger in `PRE-PILOT-TASK-REGISTER.md`.
- [ ] The traceability matrix is updated if requirement disposition or coverage changed.

## Verification

List exact checks/tests performed and their results. Agent/local PASS is supporting evidence only; independent GitHub review and applicable CI remain required.

## Documentation Sync — major task PR

Before marking a major PR ready for review:

- [ ] Task register row is updated to `IN_REVIEW`.
- [ ] `CURRENT-PROJECT-STATUS.md` reflects this branch as pending review and does not claim the work is already merged/closed.
- [ ] `PRE-PILOT-TRACEABILITY-MATRIX.md` is synchronized if applicable.
- [ ] Product baseline / ADRs are synchronized if authority changed.
- [ ] README / PROJECT_CONTEXT / roadmap are synchronized if their summary would otherwise become false.
- [ ] Any new follow-up/correction/re-entry work is registered now, not left to memory.

## Closure Sync — administrative sync PR only

If this is `SYNC-<parent-task-id>`:

- [ ] It changes only status/documentation evidence for the already-merged parent task.
- [ ] It records the parent major-task merge SHA and authoritative post-merge CI, not a guessed future SHA for this docs-only merge.
- [ ] It marks the parent `CLOSED` only if independent review/post-merge evidence is complete.
- [ ] It introduces no new business semantics/runtime correction.
- [ ] If a new defect/semantic decision was discovered, this sync stops and a normal registered task is created instead.
- [ ] No recursive closure-sync task is created; exact current Git state is read directly at the next task start.

## Merge and production safety

- [ ] This PR does **not** treat a major-task merge as automatic task closure.
- [ ] After a major-task merge, parent status will be `MERGED_AWAITING_DOC_SYNC` until its administrative closure-sync PR is merged.
- [ ] Merge requires separate explicit authorization.
- [ ] Deploy/migration/production mutation requires separate explicit authorization.
- [ ] No unrelated DamSanV5 / Quản lí nội trú resources were modified.
