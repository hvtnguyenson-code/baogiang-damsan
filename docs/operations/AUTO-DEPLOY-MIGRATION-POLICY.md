# Báo giảng — GitHub-driven production CD, including reviewed migrations

Status: P5-057 infrastructure change **in review**; no production migration or deployment authorization follows from this document.

## One durable GitHub path without Desktop Commander

- Develop and test in the registered local Báo giảng repository, open one bounded PR, and require exact-head PR CI success before merging.
- Merging to `main` triggers CI on the merge SHA. The existing `auto-deploy-production.yml` listens only for successful **push/main** CI, verifies canonical main HEAD, then classifies the migration delta.
- **No migration files introduced by this main change:** dispatch the existing `deploy-vps.yml` code-only worker. That worker executes short pinned SSH sessions and a detached, idempotent, exact-SHA worker on the Báo giảng VPS. It backs up and verifies schema and startup; it does not restart Nội trú.
- **Exactly one new, previously approved SQL migration:** dispatch the existing `deploy-production.yml` through GitHub Actions SSH/SFTP, with an automatic, SHA-bound maintenance window, verified backup, service-specific quiescence, migration, schema verification, release switch and health checks.
- **Any changed/deleted/unapproved migration, multiple migrations in one delta, or concurrent changes to deployment control-plane files:** fail closed before dispatch. These require technical review and an explicit operator-controlled migration action via GitHub, not edits to scripts on the VPS.

The local laptop and Desktop Commander are not required after GitHub receives the commit. All mandatory deployment SSH credentials belong to GitHub Actions environment/repository settings. An approved release can be monitored in GitHub Actions and via the durable redacted deploy report. The already existing Telegram notifier runs **only after verified successful release**; bot configuration is separate. Failure is reported by a red GitHub workflow, never masked as a successful Telegram send.

## Migration approval protocol (configuration, not rewriting the pipeline)

1. Review a candidate migration SQL with its exact SHA256, integrity constraints, CI replay and rollback behavior, then add its **path and SHA256** to `docs/operations/approved-automatic-migrations.json` in a **separate PR merged before the migration PR**. An entry absent from the last deployed release is not an approval, even if it appears in an intermediate main commit.
2. A new migration is auto-eligible only under `QUIESCED_ADDITIVE`, matching the previously DEPLOYED policy hash byte-for-byte. Adding the metadata is itself a policy change needing substantive human review; a hash alone is **not** proof of SQL safety. Do not approve destructive DDL, backfills or privilege-changing migrations in this list.
3. B1 reference: `20261105150000_p5_057_b1_provenance_foundation` from code PR #265 is reviewed as inert additive schema; its hash is pinned in policy. If its SQL changes in any way, automatic promotion stops.
4. Reviewers must re-check the migration against the **current physical production schema** and deployment readiness. Auto migration executes only if the GitHub release succeeds through all existing runtime safety guards.
5. Keep `deploy-vps.yml` code-only fail-closed contract unchanged, with `MigrationRequested=false`. Never modify VPS shared scripts to bypass migration approval.

## Guarantees and limitations

- The classifying diff is between the **actually deployed BaoGiang SHA** (verified through pinned read-only SSH) and the target main SHA. The code-only VPS verifier independently checks the entire Prisma history against the database and refuses to deploy if an older migration is still pending. A failed or skipped prior migration therefore **does not silently turn into a code-only release**; a single outstanding, already approved SQL may be reconciled by the normal migration workflow; multiple outstanding SQL files still require review. This is a safe-stop rather than automatic reconciliation of every possible missed release.
- **Database backlog gate:** after verified backup and before stopping the Báo giảng service, the production worker runs the existing read-only `assert-no-pending-migrations.ps1` against the previous deployed release and isolated database port 5434. Any pre-existing pending/drifted migration blocks the operation before quiescence. Combined with the GitHub exact-one-approved-SQL diff, `prisma migrate deploy` cannot silently apply an older unapproved backlog.
- Production migration uses a maintenance window tied to the exact SHA. It may temporarily stop **only Báo giảng**. The window expires automatically; a queued job that misses its window fails safely instead of running outside the authorization.
- A post-migration failure without proof of older binary compatibility requires **safe stop and explicit recovery**, not unconditional code rollback onto a changed schema. Do not promise zero downtime or fully automatic rollback for schema changes.
- The existing `backup-database.ps1` checks a custom-format dump, archive list and SHA256; an independently tested full restore is a stronger optional gate before the first production migration rollout and remains recommended.
- Neither the classifier nor GitHub Actions accesses or mutates the Nội trú database on 5433. Báo giảng database is isolated on 5434 and API on 3100. Nginx/other services may not be restarted as a workaround.
- Green PR CI is only pre-merge validation. Green main CI authorizes dispatch; **the actual deployment workflow must also finish successfully** and persist its release report before the release can be called deployed.
- A PR that changes the control plane and adds a migration in one merge is intentionally held; merge in separate, reviewed slices.

**Mandatory extra guard for approved migration:** GitHub performs a read-only pinned-SSH inspection of the dedicated Báo giảng deployment marker and `current` junction. The deployed SHA must be an ancestor of target. Exactly one pending migration can be automatically applied only if its SQL hash was approved in the already deployed baseline; unknown pointer, SSH failure, unapproved SQL or multiple pending migrations blocks before any SQL or service stop. This is a conservative safe-stop; reconcile missed releases through GitHub Actions, not by ignoring the check.

## First rollout sequence

1. Merge/test the **code-only control-plane PR** first, confirm main CI success and the pre-existing code-only GitHub deploy path. This makes the classifier available before the B1 migration PR.
2. Reconfirm that #265 still targets an approved reviewed SQL hash, then authorize its merge/production migration through the newly configured GitHub policy. Confirm backup report, quiescence, PostgreSQL #32, B1 fingerprint `dcc2a3bb3c84234d62d617e8128bcbfb`, 84 inbound FKs, both live/ready and persisted deploy report.
3. Only after B1 technical acceptance, discuss B2 source-aware writer and legacy/cutover separately.

## Operations when Desktop Commander is unavailable

- Use repository GitHub Actions: CI run, `Auto deploy production after green CI` dispatch run, then `Deploy Bao giang VPS` for code-only or `Deploy production` for approved migrations.
- To investigate a failure, read job log/artifacts and the redacted release report. Re-run only after diagnosing the failure; do not blindly create new PRs or manually run database commands.
- If GH SSH credentials/host key/environment permissions are missing or invalid, deployment **fails closed**. Reconnecting Desktop Commander is not a prerequisite to fix GitHub workflow configuration.
- Telegram delivery is best-effort and cannot replace GitHub report/health verification.
