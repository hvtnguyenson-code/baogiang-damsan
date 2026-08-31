# Production CD First Deploy Runbook

This is an executable, staged runbook for the official Windows VPS in pre-operational state. Codex does not run the inventory, access the VPS, configure GitHub secrets, run migrations, or activate deployment. At every stop point record `EXISTS AND VERIFIED`, `MISSING`, or `CONFLICT`, then obtain independent review before proceeding.

## Stage 0 — repository and authority

1. Confirm the approved application commit is a full SHA reachable from `main` and its authoritative CI run is completed/successful.
2. Confirm the control-plane workflow is still `workflow_dispatch` only, has the protected `production` Environment, and has no production secrets in repository files.
3. Stop if the target branch, commit, CI result, or review state is not independently approved.

## Stage 1 — read-only inventory

Stage 1 has two ordered passes. Both scripts must come from the same reviewed control-plane commit, and both write JSON only into an already existing operator-owned report directory. Do not run either script from Codex or from a local workstation.

### PASS 1 — protected-neighbor discovery

Run `production-protected-neighbor-discovery.ps1` first. It performs read-only discovery of candidate DamSanV5/boarding roots, Node workloads, Scheduled Tasks/Services, Nginx roots/server blocks/upstreams, PostgreSQL process/config/tool metadata and port ownership. It does not authenticate to the database, export raw command lines/task arguments/service command lines, read private host keys or mutate the host. Its conclusion is always `REQUIRES_REVIEW`.

Stop. Operator and ChatGPT review the redacted PASS 1 report and record exact protected `KnownForeignRoot` and `KnownForeignName` values, the candidate Báo giảng root, and reviewed Nginx/PostgreSQL/tool evidence. Discovery candidates are not automatically authoritative.

### PASS 2 — exact verified-first-deploy preflight

Only after PASS 1 review, run `production-preflight-readonly.ps1` with `-RequireReviewedIsolation`, non-empty reviewed `-KnownForeignRoot` and `-KnownForeignName`, the exact candidate root, `-ServiceKind scheduled-task`, and exact `-ExpectedTaskName <exact-name>`. Verified-first-deploy approval accepts Scheduled Task only. Windows Services may appear in PASS 1/default discovery inventory, but `-ServiceKind service -RequireReviewedIsolation` is categorically rejected before a Service candidate runtime identity is accepted. The verified-first-deploy mode rejects missing/ambiguous/unsafe candidate identities and reports case-insensitive exact path/name overlap as `CONFLICT`; it does not fuzzy-match different names. `NOT_RUN` is not a completed isolation result. The default mode remains discovery compatibility only and must not be treated as first-deploy approval.

PASS 2 treats any active `Include` in the selected global `sshd_config` as unresolved effective configuration: port/default-host-key evidence remains `NOT_VERIFIED` until separately reviewed. Without an active `Include`, an absent direct `Port` may use OpenSSH default 22. For a running sshd service, configured and actual listening port sets must agree exactly; firewall evidence uses only that agreed set, never a configured/listener union.

If database verification is authorized, PASS 2 additionally requires `-VerifyDatabase -PsqlExe <reviewed-absolute-psql.exe>`. It refuses PATH resolution, relative/missing paths and any leaf not named exactly `psql.exe` before database authentication.

Record each result as:

| Area | EXISTS AND VERIFIED | MISSING | CONFLICT |
|---|---|---|---|
| Host, SSH service/config/actual listening ports/firewall | exact host, user, numeric port, public host-key algorithm/fingerprint and rule-to-local-port evidence match | any value unavailable or `NOT_VERIFIED` | key, port or firewall belongs to another system |
| Root and `releases`, `staging`, `incoming`, `shared`, `logs`, `backups` | dedicated canonical paths, reparse targets and ACLs reviewed | directory/ACL absent | drive/system/DamSanV5/boarding path or shared ACL |
| Marker, task/service and startup wrapper | exact marker/action/account/wrapper/entry point match | not bootstrapped | action, account, port or entry point mismatch |
| Node/npm/npx/psql/pg_dump/pg_restore/Nginx | existing absolute leaf paths and versions match inventory | executable missing | path points to another installation |
| Port listeners 80/443/3100/5433 | redacted process identity is attributable | no listener where expected | process/port owned by another system |
| Nginx/domain/TLS | server block, SPA root, API upstream and certificate evidence match | not configured | domain/block/certificate conflict |
| PostgreSQL/database/role/extensions/migrations | read-only query succeeds with approved local auth | `NOT_RUN` without auth | database/role/listen/extension belongs elsewhere |
| DamSanV5/boarding isolation | no path/port/task/service/process overlap | evidence unavailable | any overlap |

Stop and send the redacted JSON report for ChatGPT review. Never send raw command lines, environment files, connection strings, passwords, keys, dumps, or unrelated process details.

## Stage 2 — manual bootstrap after inventory PASS

Every P1 root/ACL or startup-bundle plan/verifier report must target an existing operator-owned ordinary directory outside the production root. The directory and an existing report target must not be a reparse point; an existing ordinary report file may be replaced. The startup provenance plan report must also be outside its source repository, and a startup verifier report must be different from the reviewed `PlanPath`. These guards run before any report write and fail closed rather than following a junction or overwriting an authority artifact.

1. Select one exact reviewed lowercase 40-hex Git commit. Run `production-startup-bundle-plan.ps1` from the repository root and review its digest plus value-free JSON. The plan resolves the two fixed repository paths from that commit's Git object database, captures binary blob stdout, and hashes the exact bytes; a dirty working tree is not authority.
2. Bind that plan only to `<root>\shared\startup-bundles\<reviewedCommitSha>\`, containing sibling `start-baogiang-api.ps1` and `deployment-common.ps1`. Reject a direct `shared` wrapper, another SHA directory, traversal, reparse point, partial pair, wrong bytes, or extra file.
3. Operator and independent reviewer confirm the exact non-secret `DeploymentIdentity`, `ApiRuntimeIdentity`, and `WebRuntimeIdentity`. Run `production-root-acl-plan.ps1` with the canonical versioned wrapper path, reviewed root, identities and EnvFile. Review the protected root, six required subdirectories, marker/env leaves, startup-bundles parent, commit directory and both bundle leaves. Neither plan creates a directory, copies a file, or changes an ACL.
4. Under separate explicit operational approval, the operator manually creates the dedicated root/required directories and the new commit directory, copies the exact two reviewed blob bytes, and applies the reviewed ACL plan. There is no automatic installer, overwrite, deletion, repair, marker mutation, task mutation, or garbage collection. Never modify a mismatched existing commit directory.
5. Run `production-root-acl-verify.ps1` with the same inputs. Stop unless its state is `PASS`; missing/type/reparse paths, unprotected DACLs, missing/unexpected/inherited/broad ACEs, DENY, wrong rights or wrong inheritance all fail closed.
6. Run `production-startup-bundle-verify.ps1` with the reviewed plan file and its separately reviewed SHA-256. `INSTALL_REQUIRED` means the operator step is still required and performs no creation. Only `PASS / EXACT_BUNDLE_VERIFIED` proves the exact pair, canonical layout, hashes, non-reparse state and shared ACL policy. Every `CONFLICT` requires review; the verifier never repairs or overwrites.
7. Only after both verifiers pass may a separately approved operator operation create/update `shared\deployment-identity.json` and bind the Scheduled Task to the exact versioned wrapper. The marker schema remains version 1 and continues to store only exact absolute wrapper/common paths and hashes; this startup-bundle authority does not add a commit field.
8. Continue server-side environment evidence with `validate-production-environment.ps1`, then use the existing P0-3 activation contract: exact task verification, explicit enable, re-verification, start and bounded process/port proof. Bootstrap keeps the task disabled until that separately reviewed activation. Windows Service first-deploy remains unsupported.
9. Configure/verify the dedicated Nginx block only under its separate authority: HTTPS domain, SPA fallback, `/api` to `127.0.0.1:3100`, forwarded headers and reviewed limits. Run exact `nginx -t -c <reviewed-config>` before a targeted reload; never restart all Nginx.
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
