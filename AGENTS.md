# Repository Agent Rules

## Authority and assignment

Every execution prompt must begin with exactly one of these lines:

```text
CÔNG CỤ THỰC THI: CODEX
CÔNG CỤ THỰC THI: ANTIGRAVITY IDE
```

- ChatGPT audits the repository, designs the task/prompt, and performs an independent GitHub review. It must not accept an agent's PASS claim without direct evidence.
- Codex owns repository recovery, scaffolding, architecture, schema/migration, authentication/session/authorization, capability/scope, audit, CI/CD, broad refactors, security, integration/E2E work, and complex defects.
- Antigravity IDE may handle only narrow, simple, independently reviewable work: isolated UI components, CSS within an approved design system, Vietnamese copy, loading/empty/error states, mechanical fixtures/tests, and small documentation changes.
- Antigravity must not change schema, migrations, authentication, authorization, deployment, CI/CD, or perform broad refactors unless a prompt grants that exact scope explicitly.

## Current product authority and task registration

Before any major task, read these current-state authorities in addition to the applicable specification/ADRs:

1. `docs/governance/CURRENT-PROJECT-STATUS.md`;
2. `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md`;
3. `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`;
4. `docs/governance/PRE-PILOT-TASK-REGISTER.md`;
5. `docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`.

A major task must already have a stable ID in `PRE-PILOT-TASK-REGISTER.md` before implementation begins. Its execution prompt must state that ID, exact dependencies, relevant traceability row IDs, exact canonical main SHA, allowed/forbidden scope, required tests/evidence and required documentation synchronization.

**Exact current Git state must always be read directly from Git/GitHub at task start.** A SHA copied into `CURRENT-PROJECT-STATUS.md` is evidence for the last closed major task, not authority for the latest docs-only `main` commit.

If the work is not registered, stop and register/audit it first. Do not implement first and document it later.

Plain untracked `deferred`, `later`, `future slice`, `not assessed` or equivalent language is prohibited for current-product/pilot requirements. A deferred item must have a registered `DEFERRED_WITH_TRIGGER` task with an explicit re-entry trigger.

Current implementation proves what exists; it does not, by itself, prove that the broader product requirement is complete. A minimum-core ADR must not be extended into broader product semantics when the traceability matrix marks that area `RESTORE`, `REALIGN` or `NEW_PRODUCT_AUTHORITY`.

## Branch and scope discipline

- One task uses one dedicated branch. Do not mix unrelated work into it.
- Read the task's allowed and forbidden scope before editing. Preserve user changes and stop if ownership of an overlapping change cannot be determined safely.
- Do not read or print `.env` content, credentials, tokens, database dumps, or SSH keys. Never commit secrets.
- Do not modify the folders, services, processes, databases, Nginx configuration, or ports of DamSanV5 or the boarding-management system.
- Do not reset, clean, stash, rebase, amend, squash, or force-push.
- Do not merge, deploy, or run a production migration without a separate explicit authorization.

## UI authority

- Before every UI task, read `.codex/skills/damsan-ui/SKILL.md` and root `DESIGN.md` completely.
- `DESIGN.md` is the project visual authority. Do not choose a different theme, token palette, font, or primitive system without an explicitly approved design decision.
- Antigravity IDE may implement only narrow UI work inside the approved system; it must not redefine the system or introduce another primitive library.

## Required workflow

1. Verify repository path, branch, exact HEAD, canonical `origin/main` fetched directly from Git/GitHub, `git status -sb`, remote divergence, and untracked files.
2. Verify the task exists in `PRE-PILOT-TASK-REGISTER.md`, all dependencies are `CLOSED`, and no required predecessor is `MERGED_AWAITING_DOC_SYNC`.
3. Read the current product/status/traceability authorities plus the applicable specification, addendum, ADRs and handover before implementation.
4. Move the registered task to `IN_PROGRESS` on its task branch and keep the branch scoped to that task.
5. Make only task-scoped changes. Use Prisma Migrate for schema changes and commit migrations; never use `prisma db push` as the official migration path.
6. Run the checks required by the task, plus proportionate lint/type/test checks. Inspect `git diff --check`, the final diff, and the staged file list.
7. Before review, synchronize the task branch's intended current state: task register -> `IN_REVIEW`, current project status, traceability and all other applicable summary/authority documents.
8. Commit only files belonging to the task and push the task branch. A push is an input to CI; deployment occurs only through an authorized CD path.
9. Obtain an independent GitHub review before merge. Agent self-review is supporting evidence, not approval.
10. After merge, the task is `MERGED_AWAITING_DOC_SYNC`, not `CLOSED`. Record the major-task merge SHA and authoritative post-merge CI through the non-recursive `SYNC-<task-id>` closure procedure before any dependent major task starts.

## Major-task documentation closure

`docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md` is mandatory.

For every major task:

- merge alone is not closure;
- exact major-task post-merge evidence must be recorded;
- `PRE-PILOT-TASK-REGISTER.md` and `CURRENT-PROJECT-STATUS.md` must always be synchronized;
- traceability/product-baseline/ADR/roadmap/README/project-context must be synchronized when their claims changed;
- newly deferred work must be registered in the same PR that creates the deferral;
- a parent task cannot be `CLOSED` while it contains an orphan deferral;
- a dependent major task cannot start while its predecessor is `MERGED_AWAITING_DOC_SYNC`.

The administrative `SYNC-<parent-task-id>` closure microtask is deliberately non-recursive: it may update only closure/status evidence, does not receive a permanent task-register row, and does not require another `SYNC-SYNC-...` task. If it discovers new business semantics or a runtime defect, stop and register a normal task instead.

## Correction protocol

When a review finds a defect, audit the surrounding feature and all downstream assumptions instead of patching only the reported line. The next execution prompt must consolidate the full correction scope, acceptance evidence, regression checks, and forbidden actions. Corrections remain on a dedicated task branch and repeat the test, commit, push, independent-review and documentation-sync gates.

A failed/corrected task must remain visible in the task register; do not mark it `CLOSED` until the correction and post-merge documentation sync are complete.

## Delivery and infrastructure safety

- CI runs on branches and pull requests. CD normally runs only from a green `main`; controlled `workflow_dispatch` is an exception requiring explicit authorization.
- VPS source must come from an identified GitHub commit, never from a copied local working tree.
- A Báo giảng deployment may restart only the process whose command line/entry point belongs to Báo giảng. Never reboot the VPS, restart PostgreSQL, stop DamSanV5, kill all `node.exe` processes, or restart all of Nginx without a separately justified need.
- Production schema changes use `prisma migrate deploy` after backup/review gates. Never run `prisma migrate reset` against the official database.
- Green repository CI does not prove VPS readiness. Actual production tasks remain gated by reviewed passive/preflight evidence and explicit mutation authorization.
