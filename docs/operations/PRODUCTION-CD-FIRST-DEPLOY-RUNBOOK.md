# Production CD First Deploy Runbook

## P2 pre-transfer authority

Production CD không còn marker parser riêng trong workflow hoặc command builder. Runner lấy exact bytes của `start-baogiang-api.ps1` và `deployment-common.ps1` bằng `git cat-file` từ commit của active startup bundle, yêu cầu commit đó thuộc first-parent `origin/main`, rồi tính SHA-256 trên chính blob bytes. Remote kiểm exact layout, non-reparse ancestor chain và hai hash trước khi dot-source common; common phải cung cấp `Get-DeploymentMarkerAuthorityContractVersion` bằng `1`.

Read-only handshake gọi duy nhất shared `Read-DeploymentIdentity` với toàn bộ workflow bindings. `prepare-transfer` lặp lại cùng trust bootstrap và shared validation trong chính invocation tạo thư mục transfer, đóng khoảng TOCTOU trước `New-Item`. Không SFTP trước cả hai PASS. Bootstrap hợp lệ vẫn được phép chưa có `current`; handshake không import environment và không khởi động runtime.

Root production, kể cả planned root chưa tồn tại, không được đi qua junction/reparse tại bất kỳ existing ancestor nào. Artifact transfer bị thay bằng junction phải để lại cho operator xử lý; guarded cleanup không recursive-delete qua reparse target.

This is an executable, staged runbook for the official Windows VPS in pre-operational state. Codex does not run the inventory, access the VPS, configure GitHub secrets, run migrations, or activate deployment. At every stop point record `EXISTS AND VERIFIED`, `MISSING`, or `CONFLICT`, then obtain independent review before proceeding.

## Production topology hard gate

> [!CAUTION]
> **MANDATORY HARD STOP — TOPOLOGY DECISION GATE P6-005**
>
> - **DO NOT** execute Stage 0, Stage 1, Stage 2, or any later production action in this runbook until `P6-005` is **CLOSED**.
> - The production-host topology decision (`SHARED_VPS` vs `DEDICATED_VPS`) has been explicitly deferred by the Product Owner. If topology is unresolved: **STOP** and request an explicit Product Owner decision.
> - **`SHARED_VPS`**: this runbook may proceed only after the applicable shared-host P6 authority (`P6-010`) is reviewed and accepted.
> - **`DEDICATED_VPS`**: this current runbook contains shared/protected-neighbour assumptions (such as protected foreign roots, shared Nginx, foreign tasks/processes, and shared PostgreSQL) and **MUST** be independently audited and realigned before execution.
> - Never treat the absence of DamSanV5 / Quản lí nội trú resources on a dedicated VPS as a failed deployment condition merely because current shared-host runbook expects foreign-neighbour evidence.
> - **No VPS access, inventory, TLS issuance, Nginx change, PostgreSQL mutation or deployment is authorized by this documentation task.**

## Stage 0 — repository and authority

1. Confirm the approved application commit is a full SHA reachable from `main` and its authoritative CI run is completed/successful.
2. Confirm the control-plane workflow is still `workflow_dispatch` only, has the protected `production` Environment, and has no production secrets in repository files.
3. Stop if the target branch, commit, CI result, or review state is not independently approved.

## Stage 1 — read-only inventory

Stage 1 has two ordered passes. Wait until the protected Nội trú production state is final/stable. Both scripts must come from the same independently reviewed Git commit, and both may write JSON only to an already existing operator-owned ordinary directory outside the Báo giảng root, repository, reviewed/discovered Nginx roots, every known/discovered foreign root, and PostgreSQL data directory. The complete report ancestor chain and any existing target must be non-reparse. Do not run either script from Codex or from a local workstation.

### PASS 1 — protected-neighbor discovery

Run `production-protected-neighbor-discovery.ps1` first. It performs strictly passive discovery of candidate DamSanV5/boarding roots, Node workloads, Scheduled Tasks/Services, Nginx process bindings/server blocks/upstreams, PostgreSQL process/config/tool metadata and port ownership. Discovered executables are not executed (`NOT_EXECUTED`). It does not authenticate to the database, make a public HTTP request, export raw command lines/task arguments/service command lines, read private host keys or mutate the host. Nginx process without explicit `-p` or with relative `-p` is reported as `NOT_VERIFIED` (`NGINX_DISCOVERY_PREFIX_NOT_PROVEN` / `NGINX_DISCOVERY_RELATIVE_PREFIX_UNPROVEN`) without inferring prefix from the executable directory or reading active configuration. When running Nginx processes contain mixed proven and unproven bindings, discovery fails closed as `AMBIGUOUS` or `NOT_VERIFIED` with no active configuration represented as uniquely authoritative. Explicit absolute `-p` evidence remains `DISCOVERY`/`PARTIAL`; ambiguous bindings are reported rather than resolved using the `C:\nginx` hint. Config/include and PostgreSQL data/config reads fail closed at reparse boundaries. Its conclusion is always `REQUIRES_REVIEW`.

Stop. Operator and ChatGPT review the redacted PASS 1 report and record exact protected `KnownForeignRoot`/`KnownForeignName`, shared Nginx prefix/config, PostgreSQL instance/port/data directory (`ReviewedPostgresDataDirectory`), protected database/role names when available, and absolute paths for Node, npm, npx, psql, pg_dump, pg_restore and Nginx. Discovery candidates are not automatically authoritative.

### PASS 2 — exact verified-first-deploy preflight

Only after PASS 1 review, run `production-preflight-readonly.ps1` with `-RequireReviewedIsolation`, non-empty reviewed `-KnownForeignRoot` and `-KnownForeignName`, the exact candidate root, `-ServiceKind scheduled-task`, exact `-ExpectedTaskName <exact-name>`, reviewed `-ReviewedPostgresDataDirectory`, and reviewed absolute `-NodeExe`, `-NpmExe`, `-NpxExe`, `-PsqlExe`, `-PgDumpExe`, `-PgRestoreExe`, `-NginxExe`, `-NginxPrefix`, and `-NginxConfig` inputs as applicable. PASS 2 never derives reviewed Nginx prefix from the `nginx.exe` directory; `NginxPrefix` is an exact reviewed input. The `tools` section is exact reviewed evidence; `discoveryTools` is PATH discovery only and never authority. `-RequireVerifiedIdentity` binds Node and Nginx inputs (including `reviewedNginxPrefix`) to the marker. Verified-first-deploy approval accepts Scheduled Task only. Windows Services may appear in PASS 1/default discovery inventory, but `-ServiceKind service -RequireReviewedIsolation` is categorically rejected. `NOT_RUN` is not a completed isolation result.

PASS 2 remains passive by default. Without `-VerifyDatabase`, it does not read `DATABASE_URL` or invoke psql authentication. Without `-VerifyPublicEndpoint`, it does not call the public endpoint and records an explicit `NOT_RUN`. Each switch requires separate operator approval. Public DNS/TLS/HTTP probing occurs only after the exact Nginx/domain plan has been reviewed.

PASS 2 treats any active `Include` in the selected global `sshd_config` as unresolved effective configuration: port/default-host-key evidence remains `NOT_VERIFIED` until separately reviewed. Without an active `Include`, an absent direct `Port` may use OpenSSH default 22. For a running sshd service, configured and actual listening port sets must agree exactly; firewall evidence uses only that agreed set, never a configured/listener union.

If database verification is later authorized, PASS 2 requires `-VerifyDatabase -PsqlExe <reviewed-absolute-psql.exe>`. The ambient `libpq` process environment (all 40 PostgreSQL 17 connection, SSL, GSSAPI, session defaults `PGDATESTYLE`/`PGTZ`/`PGGEQO`, and `PGLOCALEDIR` variables) is snapshotted, cleared, and restored in `finally`. Database evidence queries are executed through centralized helper authority (`Invoke-ReviewedPostgresEvidenceQuery`) with mandatory `-X` / `--no-psqlrc` to categorically disable ambient system/user psql startup files (`psqlrc`), `--tuples-only`, `--no-align`, `--set=ON_ERROR_STOP=1`, and `--command <sql>`. Ambient psql/libpq configuration is never evidence authority. It verifies the expected database/role/port, extensions and migration state via structured JSON object output (`json_build_object`), plus that the current role is not superuser, CREATEDB, CREATEROLE, replication, BYPASSRLS, and has zero direct role memberships via `pg_auth_members` (`directMembershipCount = 0`). When cross-database isolation is requested, provide reviewed `-KnownForeignDatabase` and `-KnownForeignDatabaseRole` arrays with `-RequireForeignDatabaseIsolation`. Evidence strictly binds each returned foreign record to the exact requested database name via `ConvertTo-ReviewedForeignDatabaseEvidence` and checks only `CONNECT` metadata from the Báo giảng connection; it never connects to, queries tables in, or enumerates unrelated databases. A missing protected database is `MISSING/NOT_VERIFIED`, not PASS. The reviewed PostgreSQL data directory (`ReviewedPostgresDataDirectory`) is protected from report overwrites.

Record each result as:

| Area | EXISTS AND VERIFIED | MISSING | CONFLICT |
|---|---|---|---|
| Host, SSH service/config/actual listening ports/firewall | exact host, user, numeric port, public host-key algorithm/fingerprint and rule-to-local-port evidence match | any value unavailable or `NOT_VERIFIED` | key, port or firewall belongs to another system |
| Root and `releases`, `staging`, `incoming`, `shared`, `logs`, `backups` | dedicated canonical paths, reparse targets and ACLs reviewed | directory/ACL absent | drive/system/DamSanV5/boarding path or shared ACL |
| Marker, task/service and startup wrapper | exact marker/action/account/wrapper/entry point match | not bootstrapped | action, account, port or entry point mismatch |
| Node/npm/npx/psql/pg_dump/pg_restore/Nginx | existing absolute leaf paths and versions match inventory | executable missing | path points to another installation |
| Port listeners 80/443/3100/reviewed PostgreSQL port | redacted process identity is attributable and PostgreSQL listener uses `ExpectedPostgresPort` | no listener where expected | process/port owned by another system |
| Nginx/domain/TLS | server block, SPA root, API upstream and certificate evidence match | not configured | domain/block/certificate conflict |
| PostgreSQL/database/role/extensions/migrations/isolation | read-only query proves exact identity, safe cluster flags and requested foreign `CONNECT=false` evidence | `NOT_RUN` without auth; missing foreign database remains not verified | identity mismatch, unsafe role flag, foreign role alias or `CONNECT=true` |
| DamSanV5/boarding isolation | no path/port/task/service/process overlap | evidence unavailable | any overlap |

Stop and send the redacted JSON report for ChatGPT review. Never send raw command lines, environment files, connection strings, passwords, keys, dumps, or unrelated process details.

## Stage 2 — manual bootstrap after inventory PASS

Every P1 root/ACL or startup-bundle plan/verifier report must target an existing operator-owned ordinary directory outside the production root. Every existing directory component from the report parent through the drive root, plus an existing report target, must be non-reparse; an existing ordinary report file may be replaced. The startup provenance plan report must also be outside its source repository, and a startup verifier report must be different from the reviewed `PlanPath`. These guards run before any report write and fail closed rather than following a junction ancestor or overwriting an authority artifact.

1. Select one exact reviewed lowercase 40-hex Git commit. Run `production-startup-bundle-plan.ps1` from the repository root and review its digest plus value-free JSON. The plan resolves the two fixed repository paths from that commit's Git object database, captures binary blob stdout, and hashes the exact bytes; a dirty working tree is not authority.
2. Bind that plan only to `<root>\shared\startup-bundles\<reviewedCommitSha>\`, containing sibling `start-baogiang-api.ps1` and `deployment-common.ps1`. Reject a direct `shared` wrapper, another SHA directory, traversal, reparse point, partial pair, wrong bytes, or extra file.
3. Operator and independent reviewer confirm the exact non-secret `DeploymentIdentity`, `ApiRuntimeIdentity`, and `WebRuntimeIdentity`. Run `production-root-acl-plan.ps1` with the canonical versioned wrapper path, reviewed root, identities and EnvFile. Review the protected root, six required subdirectories, marker/env leaves, startup-bundles parent, commit directory and both bundle leaves. Neither plan creates a directory, copies a file, or changes an ACL.
4. Under separate explicit operational approval, the operator manually creates the dedicated root/required directories and the new commit directory, copies the exact two reviewed blob bytes, and applies the reviewed ACL plan. There is no automatic installer, overwrite, deletion, repair, marker mutation, task mutation, or garbage collection. Never modify a mismatched existing commit directory.
5. Run `production-root-acl-verify.ps1` with the same inputs. Stop unless its state is `PASS`; missing/type/reparse paths, unprotected DACLs, missing/unexpected/inherited/broad ACEs, DENY, wrong rights or wrong inheritance all fail closed.
6. Run `production-startup-bundle-verify.ps1` with the reviewed plan file and its separately reviewed SHA-256. `INSTALL_REQUIRED` means the operator step is still required and performs no creation. Only `PASS / EXACT_BUNDLE_VERIFIED` proves the exact pair, canonical layout, hashes, non-reparse state and shared ACL policy. Every `CONFLICT` requires review; the verifier never repairs or overwrites.
7. Only after both verifiers pass may a separately approved operator operation create/update `shared\deployment-identity.json` and bind the Scheduled Task to the exact versioned wrapper. The marker schema remains version 1 and continues to store only exact absolute wrapper/common paths and hashes; this startup-bundle authority does not add a commit field.
8. Continue server-side environment evidence with `validate-production-environment.ps1`, then use the existing P0-3 activation contract: exact task verification, explicit enable, re-verification, start and bounded process/port proof. Bootstrap keeps the task disabled until that separately reviewed activation. Windows Service first-deploy remains unsupported.
9. Use the dedicated Nginx authority in this exact sequence:
   1. Generate and review `production-nginx-plan.ps1` outside the production root, reviewed Nginx prefix, and source repository.
   2. If the managed include already exists, preserve its exact bytes at a separately reviewed rollback-snapshot path and regenerate the plan until it is `READY_FOR_MANUAL_APPLY`. The snapshot must remain outside the production root, Nginx prefix and source repository, and must not alias the managed config, Nginx executable/config, marker, plan/report, TLS certificate or TLS private key.
   3. Obtain independent review of the plan digest, include boundary, neighbor hashes, desired bytes, and structured command vectors.
   4. Manually apply only the exact managed Báo giảng include; do not patch the main config or neighboring files.
   5. Run `production-nginx-verify.ps1 -Mode Desired`; it rechecks that the exact reviewed rollback snapshot still exists as an ordinary non-reparse file with the original SHA-256 immediately before reload authorization. A deleted, tampered, substituted or reparse snapshot is a mandatory STOP. Require `EXACT_NGINX_AUTHORITY_VERIFIED` and the exact prefix-bound syntax test `<exe> -p <prefix> -t -c <config>`.
   6. After explicit operator approval, the operator manually executes the exact reload vector recorded in the plan and then performs health/evidence checks.
   7. On failure, manually restore only the managed target to its recorded pre-state, run the exact syntax test, manually run the same planned reload vector, run `production-nginx-verify.ps1 -Mode Restored`, and repeat health/evidence checks.

Nginx reload re-reads configuration for the exact reviewed Nginx instance; it does not reload an individual server block. Neither Nginx P1 tool writes production config nor executes reload.
10. For commit B, generate and review a new plan and install only `startup-bundles\<B>`. Keep verified commit A byte-for-byte unchanged. After B verifies, marker/task re-binding is a separate approval; rollback may re-bind to a prior verified directory. Do not overwrite, rename or delete earlier versions.

Stop for independent review of the provenance plan/digest, ACL plan, both verifier reports, marker, wrapper action, env validation, Nginx test and isolation evidence. The plan/verifier tools write reports only; every production filesystem, ACL, marker, task and Nginx mutation remains a separately approved manual operator action.

## Stage 3 — database and recovery gates

1. Verify PostgreSQL 17 listen address/port, `baogiang` database, `baogiang_app` role, least privilege and required extensions with approved read-only local authentication.
2. Run the versioned backup script only after the backup directory and ACL are verified. It produces PostgreSQL custom format, non-zero size, SHA-256 and a passing `pg_restore --list` check. It never prints or places the full `DATABASE_URL` in an argument list.
3. Record the restore-drill command and operator/maintenance window. Do not restore into the official database as a test.
4. Review migration compatibility and the pre/post `_prisma_migrations` evidence. `prisma migrate deploy` is allowed only with explicit workflow input and a verified backup. A pending status is not automatically fatal; connectivity/fatal errors are.

Stop if backup, restore-list, migration review, or database isolation is not PASS.

## Stage 4 — GitHub Environment and dry validation

Configure the value-free contract in `PRODUCTION-ENVIRONMENT-CONFIGURATION.md` using only inventory-reviewed values. `PROD_SERVICE_KIND` must be exactly `scheduled-task`. Pin the single known-hosts entry. Do not configure or reveal values through Codex.

Run static, behavioral, workflow-contract and PowerShell-parser checks. A dry validation may verify SHA, CI, paths and host-key shape without SSH mutation. The workflow must not create the application root or remote directories before marker verification.

## Stage 5 — first deploy dispatch and evidence

After independent PR/CI review and merge by the authorized party, dispatch manually with the exact SHA, `DEPLOY-BAOGIANG-PRODUCTION`, `run_migrations=true`, and a compatibility approval only if separately reviewed. The workflow accepts only `PROD_SERVICE_KIND=scheduled-task`; `service` fails closed in initial contract validation before SSH preparation, marker handshake, transfer-directory creation, SFTP upload, or remote deploy invocation. It then packages tracked content from `git archive --format=zip`, verifies SHA-256, performs a read-only marker handshake through UTF-16LE `powershell.exe -EncodedCommand`, then creates one verified `<root>\incoming\control-<run-id>-<sha>` directory and transfers only into it with SFTP. Every remote invocation is encoded and independent of the OpenSSH default shell.

The deploy script runs `npm ci` with lifecycle scripts, an argon2 native smoke check, Prisma generate/build, backup, migration gates, exact release switch, exact Scheduled Task restart, and bounded local/public health checks for live, ready, `/`, and `/trang-thai-he-thong`. The reviewed controller explicitly authorizes activation: verify the exact task contract, enable, re-fetch and verify it again, start, then prove that the exact Báo giảng process owns port 3100. A successful task remains enabled/running with its single Boot trigger, so Task Scheduler has the reboot-persistence contract. It writes only a redacted report containing SHA, release pointers, backup metadata, migration state, value-free lifecycle evidence, process identity, health outcomes and rollback state. The workflow retrieves and uploads that report with `if: always()`; it never uploads the env file or database backup.

## Stage 6 — failure and rollback

Before switch/restart, a failure preserves evidence and does not claim rollback. First-deploy failure semantics are authorized only for the Scheduled Task path. A Scheduled Task safe-stop always verifies identity/configuration first, then disables the exact task before stopping it, verifies runtime/listener shutdown, re-fetches it and proves its final state is Disabled. It remains disabled until the next explicit reviewed activation; operators do not run ad-hoc `Enable-ScheduledTask`. On a first deploy with no previous pointer, any failure after switch/restart disables/stops only the exact marker-approved Báo giảng task, verifies port 3100 is no longer occupied, retains failed release/current evidence, and records `firstDeployFailedStopped` (or an explicit stop failure) with the original error. After a switch, code rollback requires an existing verified previous release. After any migration attempt, automatic code rollback additionally requires explicit compatibility approval; database rollback is never automatic. An approved rollback uses the same explicit Scheduled Task activation state machine (verify, enable, reverify, start and health) and never bypasses the trigger verifier. Without compatibility approval after a migration attempt, the runtime stays stopped/disabled. Generic Service implementation in deployment scripts is not Stage 2 approved first-deploy authority. Record original and rollback/cleanup error categories separately.
