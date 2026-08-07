# Phase 01 Production CD First Deploy — Correction 002 Report

## Scope and safety

This correction audits the complete delivery chain around artifact creation, remote transfer, identity, runtime environment, backup, migration, restart, health, rollback, inventory and evidence. No VPS was accessed, no production secret was configured/read, no production database was used, no migration or deployment was run, and no PR/merge was created.

## Implemented correction (repository evidence only)

- Deterministic `git archive --format=zip` from the exact target SHA; remote checksum verification; no working-tree/untracked package content.
- Full absolute executable contract for Node/npm/npx/psql/pg_dump/pg_restore/Nginx and lifecycle-enabled `npm ci` with an argon2 native smoke check.
- Shared identity return contract is explicit (`canonicalRoot` plus `marker`); release switch/rollback validate every existing junction target as an exact lowercase-SHA directory below the dedicated releases root.
- Existing bootstrapped `releases`/`staging` parents are verified rather than recreated. Startup runtime bundle identity now requires both wrapper/helper paths and reviewed hashes.
- `start-baogiang-api.ps1` loads and validates the server-side environment without echoing values, then runs the exact Node executable and current entry point.
- PostgreSQL backup uses parsed URL fields plus short-lived `PGPASSWORD`, custom format, non-zero size, SHA-256 and `pg_restore --list`; reports contain no credentials.
- Migration evidence records `_prisma_migrations` state before/after, distinguishes expected pending status from fatal errors, marks attempts before execution, and blocks automatic code rollback without explicit compatibility approval.
- Exact process/PID/port verification before and after restart; bounded health checks for local/public live/ready, `/`, and `/trang-thai-he-thong`; reparse-point-safe switch/rollback and redacted deploy report.
- Remote workflow first performs a read-only UTF-16LE `-EncodedCommand` marker handshake, then uses a unique verified incoming directory and SFTP; report retrieval is evidence-required after remote execution.
- Windows CI now executes deployment path/junction, encoded-command and stale-`LASTEXITCODE` fixtures in addition to parser checks. Local execution cannot prove the Windows hosted runner gate until CI runs.

## Remaining inventory and manual gates

Still unverified until the user runs the read-only inventory on the VPS: host/IP, SSH port/user/host key, dedicated canonical root and all subdirectories/ACLs, exact task/service host/action/account, startup wrapper and entry point, absolute executable paths, Nginx config/server block, log/backup paths, PostgreSQL service/listen/database/role/extensions/migration state, DNS/TLS evidence, and collision evidence against DamSanV5/boarding-management. GitHub `production` Environment values remain unconfigured by Codex.

First deploy remains blocked until the staged runbook is completed, the marker/env/wrapper/task-or-service are reviewed, backup/restore drill is reviewed, exact SHA CI is green, and an independent GitHub review/merge is performed by an authorized party.

## Verification record

| Gate | Result |
|---|---|
| Deployment static, behavioral fixtures, workflow contract, PowerShell parser | Pending final local/CI execution for Correction-002 |
| Schema, repository secret, UI static checks | PASS |
| Lint, typecheck, unit tests | PASS — 99 tests |
| Build | PASS |
| Prisma validate | PASS |
| Prisma generate | NOT_RUN for Correction-002 at time of report edit |
| Migration foundation, API integration, Playwright E2E | NOT_RUN for Correction-002; authoritative isolated CI evidence required |
| `git diff --check`, staged-file inspection, staged secret scan | Required final gate before commit |

The blocked local gates are environment blockers, not PASS claims. Authoritative integration/migration/E2E evidence must come from CI after push. No blocked local database or PowerShell environment may be reported as PASS.
