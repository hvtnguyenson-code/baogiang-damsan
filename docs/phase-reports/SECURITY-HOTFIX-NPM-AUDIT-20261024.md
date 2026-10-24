# Security hotfix — npm audit high-severity gate (2026-10-24)

## Scope and reason
PR #249, CI #826/#827 failed during `npm audit --omit=dev --audit-level=high` before any application tests. Main remained `6f1e83a8f021db1ab23f9902981a6b32f36d65ab` at branch creation. This hotfix is isolated on `fix/security-parser-multer-20261024` and must be integrated separately, then P5-058 rebased or otherwise brought up to date without losing its existing work.

## Dependency remediation
- Existing runtime: NestJS 10.4.22, Express 4.22.1, body-parser 1.20.4, multer 2.3.0.
- Set explicit root overrides: `body-parser: 1.20.9`, `multer: 2.5.0`; update nested platform-express override for multer from 2.3.0 to 2.5.0.
- Update package-lock.json via `npm update multer body-parser --package-lock-only --ignore-scripts --no-audit`. No NestJS major upgrade, no `--force`, no API/backend edits, no security gate change.
- Clean `npm ci --ignore-scripts --no-audit` succeeds; installed dependency graph shows 1.20.9/2.5.0 with no invalid entries. Prisma Client regenerated locally after scripts were skipped.

## Independent checks
- `npm audit --omit=dev --audit-level=high`: PASS, exit 0; 0 high, 0 critical, 10 moderate remaining.
- Root `npm run typecheck`: PASS all workspaces.
- Root `npm run lint`: PASS all workspaces.
- API timetable-import unit suites: 12 PASS, 243 tests PASS.
- API PPCT unit suites: 4 PASS, 56 tests PASS.
- API workbook-importer unit suite(s): PASS (see local invocation log).
- Auth HTTP boundary: 1 suite, 11/11 tests PASS, including 50 concurrent logins and aborted request.
- Root `npm run build`: PASS, API, Web and packages.
- Workflow contract: PASS.

## Release and risk
No database migrations, authentication changes, HTTP body-limit policy changes, production restart/deploy, or Boarding edits. Remote CI must run `npm ci`, audit and full integration/browser tests at the hotfix HEAD prior to merge. Remaining 10 moderate findings are recorded for later independent dependency review, not silently declared fixed. Do not merge P5-058 until it inherits this fix and gets clean full CI. Rollback is a revert of this dependency-only commit, subject to the normal deploy release rollback if ever deployed.
