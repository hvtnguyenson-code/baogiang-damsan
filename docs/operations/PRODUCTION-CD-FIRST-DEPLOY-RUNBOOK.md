# Production CD First Deploy Runbook

This runbook is manual and fail-closed. Codex does not access the VPS, configure GitHub secrets, run migrations, or activate the workflow. Stop at every review gate and return the redacted output for independent review.

## 1. Read-only inventory

On the VPS, copy the versioned `production-preflight-readonly.ps1` from the approved GitHub commit and run it with a report path in an already existing operator-owned directory. Provide `-CandidateRoot`, `-ExpectedTaskName`, and `-ExpectedServiceName` only after they are known. Use `-RequireVerifiedIdentity` only when all three are verified. The script must not create its report directory, read environment files, print credentials, or restart anything.

Classify each item as `EXISTS AND VERIFIED`, `MISSING`, or `CONFLICT`: host/IP and SSH port/user; root/releases/current/previous/shared/logs/backups; Node/npm/npx; task/service and exact entry point; Nginx executable/config/server block; PostgreSQL service/listen address/port/database/role; DNS/TLS/HTTP; and collision checks against DamSanV5 and boarding-management.

## 2. Manual bootstrap after inventory PASS

Create only the dedicated Báo giảng directories and ACLs. Create the server-side environment file directly on the VPS; never put its values in GitHub or a command transcript. Validate the redacted file for production mode, API loopback `127.0.0.1:3100`, proxy hops `1`, secure cookie, exact CORS domain, and AI/Web Push disabled.

Create or verify `BaoGiangBackend` as the identified Scheduled Task/service. Its action must point to `current\apps\api\dist\apps\api\src\main.js`, use the approved environment file, and run under the approved account. Do not stop a process until its command line matches this identity.

Create or verify a dedicated Nginx server block for `baogiang.dtnt-damsan.edu.vn`, SPA fallback, `/api` proxy to `127.0.0.1:3100`, forwarded headers, and appropriate request limits. Run `nginx -t` against the dedicated config before a targeted reload. Never stop/restart all Nginx.

Verify the PostgreSQL database and `baogiang_app` role with read-only queries. Do not expose PostgreSQL or use the official database for automated tests. Record a restore-drill plan before the first migration.

## 3. First deploy gates

Before `workflow_dispatch`, obtain independent review and confirm: inventory PASS; Environment secrets/variables configured and host key pinned; server env ACL and redacted validation PASS; dedicated identities PASS; exact target SHA reachable from `main`; exact target CI success; backup/restore plan reviewed; migration compatibility reviewed; current/previous release recorded; and public DNS/TLS available.

The workflow requires the literal confirmation `DEPLOY-BAOGIANG-PRODUCTION`. It checks the exact SHA and CI conclusion, transfers a checksum-verified archive, runs `npm ci`, Prisma generate/build, backup, optional `prisma migrate deploy`, atomic release pointer switch, targeted restart, and bounded local/public health checks. It never seeds or bootstraps an admin.

## 4. Failure and rollback

If failure occurs after switching or restarting, the script rolls back the code pointer and restarts only the identified Báo giảng task/service. If a migration was applied, code rollback does not imply schema rollback: record migration state, stop, and use a separately reviewed compatible plan. Do not invent reverse SQL. Keep current and previous releases; cleanup is a separate reviewed action and may not delete either pointer or a backup.
