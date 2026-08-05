# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-PRODUCTION-CD-FIRST-DEPLOY-CORRECTION-002`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `ops/phase-01-cd-first-deploy`  
Reviewed implementation HEAD: `ee573eb36299dd62fc25e08504f0e2467defd98b`  
Base `main`: `42d56d420f22cfaf77947f4eb46b283da06965de`

## Verdict

Không mở PR và không chạy bất kỳ script nào trên VPS. Correction-001 đã cải thiện đáng kể delivery chain nhưng vẫn có lỗi runtime chắc chắn làm first deploy thất bại, lỗi first-deploy greenfield chưa xử lý đầy đủ, inventory còn gắn nhãn `EXISTS AND VERIFIED` khi chưa thực sự xác minh, và behavioral tests vẫn chủ yếu kiểm token thay vì semantics.

Correction-002 phải audit lại toàn bộ chain, sửa tổng hợp và bổ sung deterministic tests cho chính các lỗi dưới đây. Không sửa lẻ từng dòng.

## Safety gate

Trước khi sửa:

1. Đúng repository và branch.
2. `git status -sb`; tracked tree sạch, chỉ `.codex/config.toml` untracked.
3. HEAD chứa `ee573eb36299dd62fc25e08504f0e2467defd98b` và packet này.
4. Divergence không behind.
5. Không đọc/sửa/xóa/stage/commit `.codex/config.toml`.
6. Không reset, clean, stash, rebase, amend, squash hoặc force-push.
7. Không truy cập VPS, GitHub production secrets, database chính thức; không inventory, migration, deploy, PR hoặc merge.

## Finding 1 — `Read-DeploymentIdentity` return type làm switch và rollback hỏng chắc chắn

`Read-DeploymentIdentity` trả marker object. Tuy nhiên:

- `switch-current-release.ps1` gán marker object vào `$canonicalRoot` rồi `Join-Path $canonicalRoot ...`;
- `rollback-release.ps1` làm tương tự;
- `install-release.ps1` cũng đặt tên biến `$canonicalRoot` cho marker, dù hiện chưa dùng biến đó.

Khi chạy thật, switch/rollback không có canonical root string hợp lệ.

### Yêu cầu

- Khóa return contract rõ ràng. Chọn một trong hai:
  1. `Read-DeploymentIdentity` trả object `{ canonicalRoot, marker }`; hoặc
  2. callers tự gọi `Assert-DedicatedRoot` để lấy string và dùng `Read-DeploymentIdentity` chỉ để validate/return marker.
- Không dùng implicit string conversion của marker object.
- Audit tất cả call sites, không chỉ hai file đã nêu.
- Add deterministic PowerShell behavior tests hoặc mockable helper tests chứng minh switch và rollback build exact paths under canonical root.

## Finding 2 — `install-release.ps1` sẽ lỗi vì tạo lại directory bắt buộc đã tồn tại

Marker gate bắt buộc `<root>\releases` tồn tại trước deploy. Sau build, script lại chạy:

`New-Item -ItemType Directory -Path (Split-Path $release) -ErrorAction Stop`

Không có `-Force`; parent đã tồn tại nên có thể phát sinh terminating `item already exists`. Đây là contradiction trong own contract.

### Yêu cầu

- Không tạo lại root/release parent đã bootstrap; chỉ verify exact parent tồn tại và thuộc canonical dedicated root.
- Không dùng `-Force` để che path conflict.
- Add a test fixture với bootstrapped `releases` directory và chứng minh install flow không fail vì parent tồn tại.
- Verify staging/release paths cannot escape root and are exact `<root>\staging\<sha>` / `<root>\releases\<sha>`.

## Finding 3 — Remote execution vẫn chưa có contract an toàn/đáng tin cậy

### Lỗi

- Workflow SCP artifact, JSON và fixed-name scripts vào SSH user home trước khi marker/root identity được xác minh trên VPS.
- Fixed filenames có thể overwrite leftovers hoặc operator files.
- Remote invocation dùng `powershell.exe ... -Command '...'`. Windows OpenSSH thường đi qua configured default shell; single quotes are not a safe cross-shell quoting contract, đặc biệt nếu default shell là `cmd.exe`.
- Cleanup dùng cùng kiểu quoting và `|| true`, có thể silently không chạy.
- Current tests chỉ kiểm relative filename string, không kiểm actual remote-command encoding/argument contract.

### Yêu cầu

- Tạo một pre-transfer read-only handshake bằng explicit PowerShell `-EncodedCommand` (UTF-16LE base64) hoặc một contract tương đương không phụ thuộc default shell quoting. Handshake phải xác minh:
  - candidate root marker tồn tại;
  - `systemId`, canonical root, official domain, API port, service kind/name khớp;
  - dedicated transfer directory đã bootstrap và nằm dưới exact root hoặc một approved dedicated operator staging root;
  - không mutation trước khi handshake PASS.
- Sau handshake, dùng unique transfer directory, ví dụ `<root>\incoming\control-<run-id>-<sha>` hoặc approved equivalent. Không dùng fixed files directly in user home.
- Transfer paths/filenames phải generated from allowlisted values and exact SHA/run id.
- Dùng `-EncodedCommand` hoặc parameter-file invocation với one safe ASCII command token; không dùng single-quoted `-Command` through an unknown Windows default shell.
- Cleanup exact unique transfer directory after report retrieval; cleanup failure phải được recorded, không silently swallowed as full success.
- Add deterministic tests for hostile spaces, apostrophes, `&`, `|`, parentheses, Unicode path segments and Windows OpenSSH command formation.
- Do not create application root or missing bootstrap directories automatically.

## Finding 4 — Startup wrapper bootstrap is incomplete

`start-baogiang-api.ps1` dot-sources `deployment-common.ps1` from `$PSScriptRoot`. Runbook only says configure/copy the startup wrapper. If the sibling helper is absent or a different version, the Scheduled Task cannot start the API.

### Yêu cầu

- Define startup runtime bundle explicitly: at minimum `start-baogiang-api.ps1` and `deployment-common.ps1` together in an approved immutable/shared location.
- Marker must identify both paths and reviewed SHA-256 hashes, or a versioned startup-bundle directory/hash contract.
- Scheduled Task action must point to exact wrapper and marker-approved arguments/account/working directory.
- First-deploy bootstrap runbook must install both files from exact reviewed GitHub commit, verify hashes and ACLs, then create task.
- Workflow must either:
  - treat startup bundle as manually bootstrapped immutable prerequisite and verify exact hashes; or
  - update it atomically after marker verification and before restart, with rollback of the bundle.
- Do not leave an unversioned manually copied helper outside the deploy evidence chain.
- Add behavior test for missing/mismatched sibling helper/hash.

## Finding 5 — First-deploy greenfield failure state is incomplete

The project has never been deployed to VPS. There may be no `current`, `previous`, running API process or existing release. Task/service and marker will be manually bootstrapped only as prerequisites.

Current catch behavior reports `notAvailableFirstDeploy` when no previous release, but after a switch/restart/health failure it can leave:

- `current` pointing at failed first release;
- exact task/service still running or repeatedly starting an unhealthy process;
- no explicit safe stop state.

### Yêu cầu

- Model first deploy explicitly (`previousRelease = null`, no old process required).
- Before first switch, record greenfield state.
- On failure after first switch/restart with no previous release:
  - preserve original error;
  - stop/disable only the exact reviewed Báo giảng task/service where safe and explicitly documented;
  - prove port 3100 no longer belongs to a Báo giảng process or record stop failure separately;
  - keep failed current/release evidence without deleting data;
  - report `firstDeployFailedStopped` or exact equivalent, not merely `notAvailableFirstDeploy`.
- Do not touch Nginx, PostgreSQL, DamSanV5 or boarding resources.
- Add deterministic first-deploy failure tests for install failure, migration failure, restart failure and health failure.

## Finding 6 — Junction/path safety remains incomplete

- `switch-current-release.ps1` resolves existing `current`, `previous`, `current.next` but does not require every target to be exactly `<root>\releases\<40-hex-sha>`.
- `Assert-DedicatedRoot` does not explicitly reject the reviewed Nginx root/prefix.
- Marker validation does not prove root does not overlap Nginx prefix/config or all foreign roots.

### Yêu cầu

- Add `Assert-ReleasePointerTarget` that requires:
  - reparse point;
  - canonical target under exact `<root>\releases`;
  - leaf is full 40-char lowercase SHA;
  - target directory exists;
  - no traversal/prefix ambiguity.
- Use it for all existing pointer operations in switch/rollback.
- Refuse root equal to or nested under Windows/system/Program Files, Nginx installation/config root, DamSanV5 and boarding roots. Also refuse foreign root nested under Báo giảng root.
- Marker must contain reviewed Nginx paths and foreign-root isolation evidence or bootstrap report reference sufficient for fail-closed comparison.
- Add fixtures for arbitrary directory, broken junction, foreign target, prefix-confusion path and valid release pointer.

## Finding 7 — Rollback/restart error handling uses unreliable `$LASTEXITCODE`

`rollback-release.ps1` calls another PowerShell script and then reads `$LASTEXITCODE`. PowerShell script invocation does not provide a reliable native-process exit-code contract; the value can be stale from an earlier native command.

### Yêu cầu

- Child PowerShell scripts must signal failure by throwing and return typed/JSON result on success.
- Do not read `$LASTEXITCODE` after invoking `.ps1` files.
- Audit all scripts for stale `$LASTEXITCODE`; use it only immediately after native executable invocation inside `Invoke-NativeChecked` or an equivalent wrapper.
- Preserve original deployment error and separately record rollback/restart/cleanup error categories.
- Add test that seeds a stale non-zero `$LASTEXITCODE` and proves a successful child script is not treated as failure.

## Finding 8 — Inventory still overclaims verification and misses required evidence

### Current gaps

- Listener snapshot assigns `$rows[0].LocalAddress` to every listener row.
- Nginx config is passed through a generic path snapshot and labeled `EXISTS AND VERIFIED` merely because a file exists; includes/server block are not resolved.
- PostgreSQL verification labels `EXISTS AND VERIFIED` after generic connectivity but does not prove expected database `baogiang`, role `baogiang_app`, server version, listen address/port, required extensions or `_prisma_migrations` state.
- DNS addresses are not reported.
- TLS SANs are not reported, and official host/final HTTPS identity is not enforced before `EXISTS AND VERIFIED`.
- Isolation uses foreign roots only for a narrow prefix comparison; `KnownForeignName` is not checked against task/service/process/database/Nginx resources.
- Redaction still emits command-line text. Regex cannot guarantee masking arbitrary quoting/secret formats.

### Yêu cầu

- Correct per-listener address/PID mapping.
- Replace optimistic states with:
  - `EXISTS` for existence only;
  - `EXISTS AND VERIFIED` only after exact semantic checks;
  - `MISSING`, `CONFLICT`, `NOT_RUN`, `REQUIRES_REVIEW` as appropriate.
- Nginx inventory must resolve approved include chain enough to locate the exact domain server block, SPA root, `/api` upstream, certificate file references (never private-key contents), executable/prefix/config and running process identity.
- PostgreSQL inventory must collect server version/service/listen evidence and, when approved auth is supplied, explicitly compare database=`baogiang`, role=`baogiang_app`, port=5433, expected extensions and migration state. Do not simply echo DATABASE_URL parts as proof.
- Report DNS A/AAAA answers.
- Report TLS subject, SANs, thumbprint, validity window and final official HTTPS host; mismatch is `CONFLICT`.
- Compare foreign names/roots against exact task/service names, process executable paths, listeners, Nginx roots/blocks and database/role names without dumping unrelated raw command lines.
- Prefer command-line hash plus allowlisted identity fields. Omit raw/redacted command line from inventory unless strictly required. Redaction is defense-in-depth, not proof.
- Add hostile redaction fixtures with quotes, spaces, `--password=`, URI query secrets, PowerShell assignments and mixed case.

## Finding 9 — Workflow/report evidence and retry semantics

- Report retrieval uses `|| true` and artifact uses `if-no-files-found: warn`; a deployment can fail without authoritative report evidence.
- Cleanup failures are silently ignored.
- Phase report claims inventory now classifies/validates items that current code does not actually prove.

### Yêu cầu

- Distinguish deploy outcome from evidence retrieval outcome.
- For any workflow that reached remote execution, a missing redacted report must fail an evidence job/gate or clearly conclude `DEPLOY_OUTCOME_UNKNOWN`, never appear as clean success.
- Cleanup can be best-effort but its result must be recorded in job summary/report; never claim complete cleanup without proof.
- Use `if-no-files-found: error` when remote execution occurred and report is contractually required; handle pre-SSH validation failures separately.
- Add GitHub job summary with exact target SHA, CI proof, remote execution status, report retrieval status and no secrets.
- Update phase report only to claims supported by code/tests/CI.

## Finding 10 — Tests must execute semantics, not only search tokens

Current behavioral verifier mostly uses regex/token assertions and did not catch:

- marker object used as root;
- existing releases directory contradiction;
- stale `$LASTEXITCODE` after child script;
- first-deploy unhealthy service left running;
- command quoting through Windows OpenSSH;
- inventory semantic overclaim.

### Yêu cầu

- Keep static forbidden-pattern checks, but add executable deterministic tests for pure helpers and file-system behavior.
- Use PowerShell tests on Windows where Windows-only semantics matter. Add a Windows GitHub Actions job or matrix job for deployment scripts; Ubuntu `pwsh` parser alone is insufficient for junction, Scheduled Task, service and Windows path behavior.
- At minimum Windows CI must validate:
  - parser;
  - canonical root and release pointer helpers using temp dirs/junctions;
  - existing parent install-path logic without running npm;
  - parameter JSON schema;
  - encoded command generation/decoding;
  - redaction fixtures;
  - first-deploy/rollback state machine with mocked restart/health;
  - stale `$LASTEXITCODE` behavior.
- Do not access any VPS/database in these tests.
- Existing Linux CI migration/integration/E2E remains authoritative for application behavior.

## Required greenfield bootstrap contract

The final runbook must explicitly state that Báo giảng has never been deployed to VPS and separate:

1. read-only VPS inventory;
2. manual creation of dedicated root/subdirs/ACLs;
3. exact marker and foreign-system isolation evidence;
4. startup runtime bundle + hashes;
5. stopped/disabled exact Scheduled Task/service bootstrap without assuming `current` exists;
6. production env file + ACL and redacted validation;
7. Nginx domain block/bootstrap and targeted reload;
8. PostgreSQL database/role/extensions verification/bootstrap;
9. backup/restore-list drill;
10. GitHub Environment setup;
11. first workflow dispatch;
12. explicit first-deploy failure stop state.

Do not describe this as an upgrade or as if a previous release/process exists.

## Scope allowed

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-production.yml`
- `scripts/deploy/windows/**`
- `scripts/ci/verify-deployment-*.cjs`
- workflow/PowerShell test fixtures under a dedicated test path
- root `package.json` scripts
- `docs/operations/**`
- `docs/phase-reports/PHASE-01-PRODUCTION-CD-FIRST-DEPLOY-REPORT.md`
- this task packet.

## Scope forbidden

- application business/UI/API/auth/authorization changes;
- Prisma schema or existing migrations;
- production secrets/data;
- VPS access/inventory/mutation;
- deployment/migration;
- PR/merge;
- `.codex/config.toml`.

## Quality gates

Run all feasible local gates and report blockers honestly:

- deployment static + behavioral tests;
- workflow YAML/contract parser;
- PowerShell parser;
- Windows-specific deployment behavior tests if available locally; otherwise CI job must provide them;
- schema/secret/UI static;
- lint/typecheck/unit/build;
- Prisma validate/generate where environment permits;
- migration/integration/E2E only on isolated test environment;
- `git diff --check`;
- staged file list and staged secret scan.

## Required stopping behavior

1. Implement correction-002 completely.
2. Update report to evidence actually proven.
3. Commit and push same branch.
4. Do not create PR, merge, access VPS, configure secrets, run inventory, migration or deploy.
5. Report final HEAD, divergence, changed files, every gate, Windows CI additions and remaining inventory/manual prerequisites.
6. Stop for ChatGPT independent review.
