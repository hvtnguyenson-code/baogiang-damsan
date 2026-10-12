# P6-020B — Chốt Windows accounts, ACL, Node 22 và PostgreSQL riêng

**Decision:** DESIGN FROZEN FOR REVIEW. **Live provisioning:** NO-GO until separately approved.
**Date:** 12/10/2026; **baseline:** main ca65061a5a09b6038d14b138b8e328487544598d.
**Purpose:** Báo giảng must have an independent lifecycle on the shared Windows VPS. Nothing in this document authorizes mutation or restart of Quản lí nội trú, shared Nginx, PostgreSQL 16/17 or Windows services.

## 1. Verified host and repository facts

- Host: Windows Server 2022 Datacenter, C: approximately 49.9 GiB total / 29.6 GiB free in the last passive inspection, about 12.5 GiB free RAM. Snapshots are not capacity guarantees.
- No local users named bg_deploy, bg_api or bg_pg; no folders C:\baogiang, C:\baogiang-pg or C:\baogiang-data. No BaoGiangBackend Scheduled Task.
- DamSanV5 is an active task under SYSTEM, uses the existing C:\Program Files\nodejs\node.exe (Node20) on port 3000 and PostgreSQL17/5433. PostgreSQL16/5432 exists; no permission to repurpose it.
- Nginx master PID2308 and worker PID4420 were **directly confirmed under NT AUTHORITY\SYSTEM, SID S-1-5-18**; shared ingress owns 80/443. Its effective absolute prefix remains NOT_VERIFIED by strict PASS1, despite C:\nginx task working directory.
- Canonical Get-ProductionAclPolicy takes DeploymentIdentity, ApiRuntimeIdentity and WebRuntimeIdentity, resolves SIDs and combines ACEs by SID. Existing plans cover application root, six directories, marker/env/startup bundles, **not** external PG data/binary roots.
- Prisma project says PostgreSQL17; the repository CI uses postgres:17. Private PostgreSQL17 is a documented compatibility baseline, not an inference that the existing PG17 can be reused.

## 2. Windows identity decision (proposed names, not existing accounts)

| Identity | Assigned responsibility | Least-privilege restriction |
|---|---|---|
| .\bg_deploy | Dedicated GitHub SSH/CD deploy identity, staging, app-release management, exact BaoGiangBackend task operation | Standard local account, never Administrator or SYSTEM; no write to Nội trú, Nginx, PG16/17 or TLS |
| .\bg_api | Runs only Scheduled Task BaoGiangBackend | Standard local account; Log on as a batch job, only app code read/execute + env read + logs write |
| .\bg_pg | Runs only Windows Service BaoGiangPostgres | Standard local account; Log on as a service, private PG cluster data/logs write; no access to app secrets/foreign roots |
| NT AUTHORITY\SYSTEM (S-1-5-18) | Existing Nginx service and OS-level recovery | **Existing shared ingress exception only**; never task/API/database account for Báo giảng |
| Administrators | Explicit bootstrap/emergency maintenance | Never normal application/runtime account |

**Do not create bg_web.** The real shared Nginx worker is SYSTEM. The truthful candidate mapping for the ACL planner parameter **WebRuntimeIdentity = S-1-5-18**, not a fictitious unused account. This deliberately acknowledges that Nginx is a shared privileged ingress and that SYSTEM cannot be isolated by ordinary application directory ACLs. It does NOT grant SYSTEM rights to bg_api/bg_deploy.

**Required validation before ACL apply:** Add/run a targeted Windows fixture to verify canonical policy when WebRuntimeIdentity equals SYSTEM SID, the merged SYSTEM + WebRuntimeIdentity ACE, strict ACL snapshot verifier behavior, no broad Everyone/Users/Authenticated Users ACEs and no leak into protected roots. A green general CI that did not test the SID overlap is not this evidence. If the test fails, STOP and submit a separately reviewed policy correction before provisioning.

Only after approval create real accounts and record actual SIDs. Do not supply fabricated SIDs, passwords in command arguments, GitHub files/logs, grant the deploy account local Administrators, or grant it broad Task Scheduler management. A minimum-permission security descriptor for starting/stopping exactly BaoGiangBackend is a separately reviewed requirement. If impossible, STOP rather than elevate broadly.

## 3. Canonical application ACL allocation

| Path | SYSTEM / Administrators | bg_deploy | bg_api | bg_pg |
|---|---|---|---|---|
| C:\baogiang root | FullControl | Modify | ReadAndExecute | None |
| releases | FullControl | Modify | ReadAndExecute | None |
| staging, incoming, backups | FullControl | Modify | None | None |
| shared, private runtimes | FullControl | Modify | ReadAndExecute | None |
| logs | FullControl | Modify | Modify | None |
| deployment-identity marker and server env | FullControl | Modify | Read | None |
| versioned startup wrapper/common | FullControl | Modify | ReadAndExecute | None |
| C:\baogiang-pg binaries | FullControl | ReadAndExecute only for exact psql/backup tools; no Modify | No access unless proven necessary | ReadAndExecute; never modify executable |
| C:\baogiang-data\pg17\main and logs | FullControl | None | None | Modify |
| Existing Nội trú/Nginx/PG16/PG17 roots | Current unchanged | No newly granted rights | No newly granted rights | No newly granted rights |

Apply a protected ACL (no broad inherited ACE), ordinary non-reparse ancestors, no symlink/junction escape. Use existing production-root-acl-plan.ps1 and production-root-acl-verify.ps1 **only for C:\baogiang**. Design and independently verify separate ACLs for C:\baogiang-pg and C:\baogiang-data; the application ACL generator cannot certify either root. Admin/SYSTEM are OS-level exceptions, not routine deploy identities.

No Windows account or ACL has been created or changed by this document.

## 4. Node 22 acquisition and immutable deployment decision

**Selected candidate:** official Node.js **v22.23.3 LTS, Windows x64 ZIP**, released 23 September 2026, not MSI. This version exists in the vendor release archive and includes npm10; it remains exact-version pinned until a later reviewed update.

**Destination:** C:\baogiang\shared\runtimes\node-v22.23.3-win-x64\node.exe, with npm.cmd and npx.cmd siblings in exactly that directory. Workflow variables PROD_NODE_EXE, PROD_NPM_EXE and PROD_NPX_EXE must refer to exact reviewed leaves, not PATH or system Node20.

**Verified supply origin to be used when approved:** https://nodejs.org/download/release/v22.23.3/ ; https://nodejs.org/en/blog/release/v22.23.3 . Download the exact node-v22.23.3-win-x64.zip with official signed SHASUMS and verify the ZIP SHA-256 and publisher signature before installation. SHA-256 for the ZIP has **not yet been captured and verified**, so do not invent one or proceed on the version label alone.

Extract only to an absent versioned folder with restricted ACL, never overwrite existing runtime or alter C:\Program Files\nodejs, PATH, npm globals, NVM_HOME or Nội trú task. Verify the binary returns exactly v22.23.3 and nginx/task/PG connections are unchanged. Existing Node22 production guard rejects wrong major and non-private runtime paths; do not treat it as evidence of downloaded-binary provenance.

## 5. PostgreSQL 17 separate cluster and service decision

**Baseline chosen:** PostgreSQL **17.11** Windows x64 binary ZIP, **independent executable tree** and independent data cluster. Use ZIP for controlled private placement, rather than installing a new server over the system PostgreSQL path. The repo CI uses PostgreSQL17 and Prisma schema specifies PostgreSQL17. No new PostgreSQL18 compatibility assumption.

| Component | Intended isolated value |
|---|---|
| Binary folder | C:\baogiang-pg\pg17.11\<verified-build>\bin (prove exact extracted layout) |
| Service | BaoGiangPostgres, bound to local account .\bg_pg |
| Cluster | C:\baogiang-data\pg17\main; separate PG log directory |
| Listener | 127.0.0.1:5434 only; never 0.0.0.0, no public firewall inbound |
| Application database | baogiang; app role baogiang_app with SCRAM-SHA-256 |
| Role privileges | no SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS; restrict cross-database access and direct role membership |
| Tools | exact private PG17 psql.exe / pg_dump.exe / pg_restore.exe from same reviewed distribution |
| Backups | per-Báo giảng backup path and retention, encrypted/restricted, tested independent restore |
| Restart scope | only service BaoGiangPostgres; never existing postgresql/ postgresql17 services |

**Vendor:** https://www.postgresql.org/download/windows/ explicitly links advanced-user ZIP binaries; https://www.enterprisedb.com/download-postgresql-binaries offers packaged Windows binaries. EDB collaborator documented **postgresql-17.11-3-windows-x64-binaries.zip** with SHA-256 **4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf** at https://github.com/EnterpriseDB/edb-installers/issues/682 (closed 07 Oct 2026). This is an **artifact-specific candidate checksum for revision -3 only**; never apply it to -4 or another release. If exact -3 ZIP is not available from the approved vendor URL, independently select/review/hash a new exact revision before installing.

**Important Windows service credential issue:** documented pg_ctl register options allow separate -N service name/-D data path and -U account, but exposing a password via a -P CLI argument, log or PowerShell history is prohibited. Service identity creation and credential handoff require an explicitly reviewed secure Windows provisioning method, with no stored plaintext in repo, scripts or telemetry. If no safe method is available, STOP.

**DB gates:** inspect exact process exe and data dir, service identity, socket ownership, loopback-only listener, application role/database/extension (btree_gist), and separate backup/restore. Database authentication is an independent PASS2 opt-in, not authorized by this documentation PR. Never connect to Nội trú business DB to prove isolation.

## 6. Resource gate and execution sequencing

Only ~29.6 GiB is free on the 49.9 GiB shared C: snapshot. A new binary/cluster, two app releases, backups and logs can exhaust shared disk and disrupt Nội trú.

**Capacity proposal for approval:** maintain a conservative **15 GiB minimum free** after modeled Stage2 binaries, app releases, PostgreSQL growth, backup retention and Windows update buffer. This threshold is a REVIEW PROPOSAL, not a proven production guarantee. Take measured sizes and disk trend; if reserve cannot be met, STOP, design separate storage or reduce Báo giảng retention safely — **never delete or compact protected Nội trú files**. Also review CPU, sustained IO and RAM at busy periods. An empty port alone is not capacity evidence.

**Gate A — review only (this task):** evidence baseline, no new users/dirs; freeze identities, ACL matrix, Node22 and PG17 artifact provenance, disk model and approved change set. Add dedicated ACL SID-merge fixture before applying permissions.

**Gate B — first explicitly authorized change:** create only three reviewed local accounts and three new roots (app, PG binaries, PG data) with independently reviewed ACL plans. No Nginx, Nội trú, shared Node, Task Scheduler changes, database initialization or application activation. Verify exact new SIDs, paths and ACLs; separate approval required for installing executables.

**Gate C — later separately approved:** private Node22 ZIP extraction and hash/contract verification; standalone PG17 binaries and cluster registration, only once safe service credential/account/backup plan has passed review. Stop on any collision/reparse/root mismatch. PG service activation requires explicit approval.

**Gate D — later:** immutable startup bundle and exact marker, BaoGiangBackend task, verified PASS2 based on real resources. Nginx absolute effective prefix is still NOT_VERIFIED; never fabricate it with C:\nginx workingDirectory. Shared Nginx ingress, Mắt Bão DNS A record and free HTTPS renewal belong to **P6-020C** and their own approved change window. No production deploy until P6-030 is explicitly authorized.

**Rollback:** cleanup may only target unmistakably new Báo giảng-owned resources under reviewed change ID, preserving evidence; cannot stop global Node, PG services or Nginx, restart DamSanV5, or change existing firewall, DNS or TLS. Failed PG setup preserves data/backup for review and only touches BaoGiangPostgres after approval. No unattended general cleanup.

## 7. Status and next approvals

**P6-020B design delivered for independent review; accounts, SID verification, ACL application, runtime, cluster and PASS2 have NOT been executed.** Pass/fail verification remains open until dedicated Windows SID overlap fixture and live bootstrap approvals. PR is docs-only; no runtime or VPS mutation. P6-030 remains NO-GO.

Following this PR, the next decision is a written **first mutation authorization limited to accounts and roots** with exact commands, before/after snapshots and rollback. Nginx/DNS/HTTPS changes are NOT part of that authorization.
