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

1. Verify repository path, branch, `git status -sb`, remote divergence, and untracked files.
2. Read the applicable specification, addendum, ADRs, and handover before implementation.
3. Make only task-scoped changes. Use Prisma Migrate for schema changes and commit migrations; never use `prisma db push` as the official migration path.
4. Run the checks required by the task, plus proportionate lint/type/test checks. Inspect `git diff --check`, the final diff, and the staged file list.
5. Commit only files belonging to the task and push the task branch. A push is an input to CI; deployment occurs only through an authorized CD path.
6. Obtain an independent GitHub review before merge. Agent self-review is supporting evidence, not approval.

## Correction protocol

When a review finds a defect, audit the surrounding feature and all downstream assumptions instead of patching only the reported line. The next execution prompt must consolidate the full correction scope, acceptance evidence, regression checks, and forbidden actions. Corrections remain on a dedicated task branch and repeat the test, commit, push, and independent-review gates.

## Delivery and infrastructure safety

- CI runs on branches and pull requests. CD normally runs only from a green `main`; controlled `workflow_dispatch` is an exception requiring explicit authorization.
- VPS source must come from an identified GitHub commit, never from a copied local working tree.
- A Báo giảng deployment may restart only the process whose command line/entry point belongs to Báo giảng. Never reboot the VPS, restart PostgreSQL, stop DamSanV5, kill all `node.exe` processes, or restart all of Nginx without a separately justified need.
- Production schema changes use `prisma migrate deploy` after backup/review gates. Never run `prisma migrate reset` against the official database.
