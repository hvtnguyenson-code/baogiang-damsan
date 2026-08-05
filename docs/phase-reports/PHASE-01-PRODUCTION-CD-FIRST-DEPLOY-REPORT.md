# Phase 01 Production CD First Deploy — Correction 001 Report

## Scope and safety

This correction audits the complete delivery chain around artifact creation, remote transfer, identity, runtime environment, backup, migration, restart, health, rollback, inventory and evidence. No VPS was accessed, no production secret was configured/read, no production database was used, no migration or deployment was run, and no PR/merge was created.

## Implemented correction

- Deterministic `git archive --format=zip` from the exact target SHA; remote checksum verification; no working-tree/untracked package content.
- Full absolute executable contract for Node/npm/npx/psql/pg_dump/pg_restore/Nginx and lifecycle-enabled `npm ci` with an argon2 native smoke check.
- Shared identity marker and fail-closed checks for dedicated root, pre-created directories, ACL-reviewed paths, exact task/service action, startup wrapper, port ownership and neighboring-system isolation.
- `start-baogiang-api.ps1` loads and validates the server-side environment without echoing values, then runs the exact Node executable and current entry point.
- PostgreSQL backup uses parsed URL fields plus short-lived `PGPASSWORD`, custom format, non-zero size, SHA-256 and `pg_restore --list`; reports contain no credentials.
- Migration evidence records `_prisma_migrations` state before/after, distinguishes expected pending status from fatal errors, marks attempts before execution, and blocks automatic code rollback without explicit compatibility approval.
- Exact process/PID/port verification before and after restart; bounded health checks for local/public live/ready, `/`, and `/trang-thai-he-thong`; reparse-point-safe switch/rollback and redacted deploy report.
- Read-only inventory now classifies SSH/config/ports, tools, listeners, paths/ACLs/reparse targets, task/service actions, Nginx references, database verification, DNS/TLS/HTTP and isolation evidence without raw command-line output.
- Behavioral fixtures, workflow contract parser, PowerShell parser and expanded static checks wired into CI; `ops/**` branch pushes now receive authoritative CI.

## Remaining inventory and manual gates

Still unverified until the user runs the read-only inventory on the VPS: host/IP, SSH port/user/host key, dedicated canonical root and all subdirectories/ACLs, exact task/service host/action/account, startup wrapper and entry point, absolute executable paths, Nginx config/server block, log/backup paths, PostgreSQL service/listen/database/role/extensions/migration state, DNS/TLS evidence, and collision evidence against DamSanV5/boarding-management. GitHub `production` Environment values remain unconfigured by Codex.

First deploy remains blocked until the staged runbook is completed, the marker/env/wrapper/task-or-service are reviewed, backup/restore drill is reviewed, exact SHA CI is green, and an independent GitHub review/merge is performed by an authorized party.

## Verification record

| Gate | Result |
|---|---|
| Deployment static, behavioral fixtures, workflow contract, PowerShell parser | PASS |
| Schema, repository secret, UI static checks | PASS |
| Lint, typecheck, unit tests | PASS — 99 tests |
| Build | PASS |
| Prisma validate | PASS |
| Prisma generate | BLOCKED — Windows `EPERM` while renaming the locked Prisma engine file |
| Migration foundation | BLOCKED — local Bash launcher returned `E_ACCESSDENIED`; no database mutation |
| API integration | BLOCKED — isolated loopback port `5434` has no PostgreSQL server |
| Playwright E2E | BLOCKED — 1/3 passed; two auth flows require the unavailable local API/database fixture |
| `git diff --check`, staged-file inspection, staged secret scan | Required final gate before commit |

The blocked local gates are environment blockers, not PASS claims. Authoritative integration/migration/E2E evidence must come from CI after push. No blocked local database or PowerShell environment may be reported as PASS.
