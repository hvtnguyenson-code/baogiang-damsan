# P5-057 / T56 - WS1-B1 leadership UI and isolated recovery checkpoint (2026-11-22)

## Scope and baseline

Registered task P5-057 remains IN_PROGRESS; P6-050 remains BLOCKED. Worktree branch feat/p5-057-b1-gated-command-api-20261121, Draft PR #290, base HEAD d82e22e7ed8a20b929e3fd098be0fa5c0a41036a (CI 44983027935 and PG16 44983027937 SUCCESS). Canonical main at task start: 54c1916b81c7271614eeadcbc8ef6fb5de1789cd. G1/G3/G4 accepted in PR #290 comment 7073734866; no additional business authority assumed.

## Delivered

- Users workspace: leadership tab for Admin with USER_MANAGE and CAPABILITY_GRANT, existing B1 Principal/PHT appointment, dismissal and transfer commands, named incumbents, read-only precheck and explicit confirmation. No self-appointment; missing prerequisites, unresolved legacy conflicts and incomplete prechecks block UI submission. Exact request key/payload retained on ambiguous failure; conflict requires fresh inspection.
- Additive command context exposes submission readiness without changing canConfirm=false. Transactional writer remains the authorization boundary. Generic responsibility-template preview reflects the same existing gate as its apply method; teacher template stays eligible. No flag activation, migration, scope expansion or production data changes.
- Bootstrap integration fixture includes local-only, explicitly opted-in native pg_dump/pg_restore recovery on its uniquely generated b1init schema within baogiang_test. Archive hashed and restored transactionally; prior grants, audit, epoch and absence of new B1 entities verified. No production backup or real-user restore implied.

## Verified local evidence

- API and Web TypeScript PASS.
- Web: 34/34 tests across existing Users workspace and new leadership panel suites.
- API: 16/16 tests across four targeted suites, isolated PostgreSQL 17, all migrations applied (existing 33). Actual native backup/restore verified 9 identical legacy grant rows, original epoch and audit, zero new B1 command/seat/source after restore. Acceptance and fixture schemas removed (read-only post-check: zero matching namespaces).
- Local browser fixture provisioning was refused by MCP (SECRET_CONTENT_DENIED). No bypass attempted. Separate credential-free mock-browser trial reached a healthy Vite HTTP 200, but Playwright did not produce results after more than two minutes; local session stopped. This is NOT browser acceptance or real seven-persona UAT. Unverified candidate excluded from commit.

## Release gates

Before any activation: independent issuer/trusted bootstrap and technical-source authority evidence; actual legacy/source reconciliation; authorized seat provisioning; verified production backup and real seven-persona UAT; exact-head CI and independent review. All production flags remain OFF. PR #290 stays Draft. No merge, VPS change, deployment or change to CI/CD. Only GitHub automatic CD after separately authorized green main merge.

Scoped API/Web ESLint PASS; local Vite process stopped. Browser candidate preserved in ignored test-results/p5-057-b1-local-run/browser-candidate.spec.ts.

CI follow-up: f9c4626 PG16 44991260201 and Windows deployment contract PASS; CI 44991260291 stopped before tests at UI foundation static verification because an API-client source comment contained a prohibited technical word. Comment-only correction; canonical scripts/ui/verify-ui-foundation.cjs PASS locally. No rule or behavior changed. New exact-head CI required.
