# P5-050 Execution Protocol — Antigravity Primary, ChatGPT Review, Codex Escalation

**Status:** ACTIVE GOVERNANCE FOR P5-050 PROGRAMME  
**Applies to:** P5-051..P5-057 and registered corrections/re-entry tasks  
**Primary implementer:** Antigravity IDE  
**Orchestrator / independent reviewer:** ChatGPT  
**Escalation implementer:** Codex when explicitly assigned by ChatGPT

## 1. Purpose

This protocol keeps the new product-operability programme auditable and prevents branch, CI and production churn.

The implementation agents do not choose the roadmap. The canonical Task Register and Traceability Matrix choose the roadmap; ChatGPT converts the next eligible task into an exact execution prompt.

## 2. Tool responsibilities

### ChatGPT

ChatGPT must:

- read exact GitHub state before every task;
- verify dependencies and current production baseline;
- write the execution prompt with one task ID and one bounded scope;
- decide whether Antigravity is sufficient or Codex escalation is justified;
- independently inspect GitHub diff, CI logs and production evidence;
- issue consolidated correction prompts instead of micro-fix prompts;
- authorize merge only after evidence is complete;
- never treat an agent's self-reported PASS as independent review.

ChatGPT should not implement the normal task code itself while this programme is using Antigravity as the primary implementer.

### Antigravity IDE

Antigravity is the default coder. For each prompt it must:

- start from a clean local checkout synchronized to the exact prompt baseline;
- use exactly one task branch;
- edit only prompt-authorized files/surfaces;
- preserve all existing domain invariants;
- run local checks before the first push;
- batch related corrections;
- report exact branch, HEAD, changed files, tests, remaining risks and any blocked assumption;
- stop before merge/deploy.

Antigravity must never infer extra authority from nearby TODOs or broaden a UI task into backend/schema/auth changes unless the prompt explicitly includes them.

### Codex

Codex is optional. ChatGPT may assign all or a bounded slice to Codex when the risk/complexity is materially higher, including:

- schema/migration/FK/concurrency work;
- authentication/session/authorization/capability semantics;
- security-sensitive code;
- CI/CD/deployment control plane;
- broad cross-domain refactors;
- difficult race/failure-injection/integration/E2E defects;
- repository recovery where exact history matters.

Codex follows the same one-branch, local-check, no-merge/no-deploy rules.

## 3. Clean baseline definition

Before a new implementation task begins, all three authorities must be reconciled.

### GitHub

- canonical `main` SHA is read directly from GitHub;
- the predecessor task is canonically `CLOSED`;
- no overlapping open task branch/PR exists;
- required CI on canonical main is green.

### Local workstation

The local repository used by Antigravity must report:

- expected repository path and remote;
- checked-out `main`;
- `git fetch origin --prune`;
- local `main == origin/main == canonical GitHub main`;
- `git status --short` empty;
- no unexpected untracked task artifacts;
- no stash/rebase/amend/reset/force operation used to manufacture cleanliness.

If local has legitimate user work, stop and report it; do not delete or hide it.

### VPS

For runtime tasks, before implementation/deployment review record:

- `C:\baogiang\current` release SHA;
- API health on port 3100;
- public HTTPS ready health;
- protected Nội trú health and PID on port 3000;
- production DB authority remains Báo giảng PostgreSQL on port 5434;
- no manual source edit exists on VPS.

The target clean runtime baseline is GitHub-controlled release provenance. Direct VPS code edits are prohibited.

A docs-only main commit may still be auto-deployed by current CD. If that happens, treat it as infrastructure evidence only; never infer a business/runtime change from documentation content.

## 4. Branch and CI budget

For each task:

1. one registered task -> one active branch;
2. create the PR only after a meaningful locally checked checkpoint exists;
3. normally one PR CI run for the initial checkpoint;
4. if review/CI finds defects, inspect all findings first and push one consolidated correction checkpoint whenever practical;
5. never create retry/correction branches for the same unmerged task;
6. never create no-op commits to trigger Actions;
7. never rerun an unchanged SHA unless failure is demonstrably runner/infrastructure transient;
8. after merge, only the authoritative main CI, auto-CD/deploy (when current workflow triggers it), and the mandatory closure-sync CI are expected;
9. delete the merged remote task branch when supported.

GitHub Actions is a verifier, not an interactive debugger.

## 5. Prompt contract

Every ChatGPT execution prompt must include:

- first line `CÔNG CỤ THỰC THI: ANTIGRAVITY IDE` or `CÔNG CỤ THỰC THI: CODEX`;
- task ID and title;
- exact canonical main SHA;
- exact dependency/traceability authorities;
- files/modules to read before edit;
- allowed changes;
- forbidden changes;
- business/security invariants;
- required local tests;
- required full/regression tests;
- branch name;
- commit language/convention;
- expected report format;
- explicit stop condition: **do not merge/deploy**.

## 6. Review contract

ChatGPT review must inspect:

- branch/base divergence;
- complete changed-file list and diff;
- implementation against the task requirement, not only test results;
- auth/scope and history invariants;
- test quality including negative/race cases where applicable;
- whether docs/status are synchronized to `IN_REVIEW`;
- exact-head CI;
- downstream regressions;
- production impact.

A review finding must be classified at least CRITICAL/HIGH/MEDIUM/LOW. HIGH/CRITICAL blocks merge. Related findings should be consolidated into one correction prompt.

## 7. Merge, deploy and closure

- Antigravity/Codex stop at review-ready state.
- ChatGPT recommends merge only after independent review and green exact-head CI.
- Production deployment occurs only through canonical GitHub CD; no copied local build.
- After runtime deployment verify current release identity, API/public health and Nội trú isolation.
- A major task is `MERGED_AWAITING_DOC_SYNC` after merge.
- Execute exactly one non-recursive `SYNC-<task>` closure microtask with merge SHA and authoritative post-merge CI.
- Only then mark the task `CLOSED` and unlock dependents.

## 8. Reporting language

- Commit messages, code identifiers, test names and routes may remain English.
- Antigravity/Codex task completion reports to the Product Owner must be Vietnamese.
- Reports must be evidence-based and concise: baseline, diff, tests, CI/PR, risks, stop state.

## 9. Initial programme order

Unless a new audit finding changes dependencies, the intended implementation sequence is:

1. P5-051 — professional baseline, responsibility templates, safe user lifecycle;
2. P5-052 — task-oriented workspace/information architecture;
3. P5-053 — timetable/time-slot administration;
4. P5-054 — teaching operations;
5. P5-055 — data readiness/import center;
6. P5-056A then P5-056 — in-app notification/Web Push;
7. P5-057 — persona operability freeze.

P0-005 historical T31 reconciliation is a docs-only governance repair and may be scheduled independently when it does not create branch/CI noise for the active product task.
