# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-PRODUCTION-CD-FIRST-DEPLOY-CORRECTION-001`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `ops/phase-01-cd-first-deploy`  
Reviewed implementation HEAD: `b5a2d88fa51cff6e54413f31ad0d14fe6f30136e`  
Base `main`: `42d56d420f22cfaf77947f4eb46b283da06965de`

## Verdict dẫn tới correction

Không mở PR và tuyệt đối không kích hoạt workflow hiện tại. Review độc lập phát hiện nhiều lỗi làm first deploy chắc chắn thất bại hoặc chưa đủ an toàn để chạm VPS. Correction phải audit rộng toàn bộ delivery chain, không sửa lẻ từng dòng.

Giữ nguyên mục tiêu manual, fail-closed, exact commit, GitHub Environment, Windows VPS, PostgreSQL chính thức pre-operational và cô lập tuyệt đối khỏi DamSanV5/hệ thống Quản lí nội trú.

## Safety gate

Trước khi sửa:

1. Xác minh đúng repository và branch.
2. `git status -sb`; chỉ chấp nhận tracked tree sạch và `.codex/config.toml` untracked.
3. Xác minh exact HEAD chứa `b5a2d88fa51cff6e54413f31ad0d14fe6f30136e` và packet này.
4. Fetch ngoài sandbox nếu cần; xác minh divergence không behind.
5. Không đọc/sửa/xóa/stage/commit `.codex/config.toml`.
6. Không reset, clean, stash, rebase, amend, squash hoặc force-push.
7. Không truy cập VPS, production secrets/database, không migration/deploy, không PR/merge.

## Finding 1 — Package/executable contract hiện chắc chắn không chạy

### Lỗi hiện tại

- Workflow tạo `release.tar.gz` nhưng `install-release.ps1` dùng `Expand-Archive`, chỉ phù hợp ZIP trong Windows PowerShell contract hiện tại.
- Workflow truyền `-NpmExe 'npm' -NodeExe 'node' -NpxExe 'npx'`, trong khi parameter validation yêu cầu `Test-Path ... -PathType Leaf`; workflow sẽ fail trước orchestration.
- `npm ci --ignore-scripts` có thể bỏ qua native install của `argon2`, làm API không khởi động.
- Các native commands `npm`, `node`, `npx`, `nginx`, `pg_dump` chưa được kiểm `$LASTEXITCODE` đầy đủ; Windows PowerShell 5.1 không tự biến mọi native non-zero thành terminating error.

### Yêu cầu

- Dùng một artifact format thực sự tương thích và deterministic. Ưu tiên `git archive --format=zip` từ exact target commit và `Expand-Archive` trên Windows. Không package working tree hoặc untracked files.
- Artifact phải chỉ chứa tracked content của exact `TARGET_SHA`; checksum SHA-256 trước/sau transfer.
- Bổ sung GitHub Environment variables đã inventory xác minh:
  - `PROD_NODE_EXE`
  - `PROD_NPM_EXE`
  - `PROD_NPX_EXE`
  - `PROD_PSQL_EXE`
  - `PROD_PG_DUMP_EXE`
  - `PROD_PG_RESTORE_EXE`
- Mọi executable path phải là Windows absolute existing leaf path trên VPS và khớp inventory; không dùng bare command names.
- Dùng `npm ci` từ lockfile với lifecycle scripts cần thiết. Sau install, chạy một native-runtime smoke check chứng minh `argon2` load được trên Windows trước build/switch.
- Sau từng native command, kiểm exit code ngay và fail closed. Không dựa riêng vào `$ErrorActionPreference`.
- Theo dõi chính xác `Push-Location` bằng flag/finally; không `Pop-Location` khi chưa push.

## Finding 2 — Runtime service không nhận production environment

### Lỗi hiện tại

`invoke-production-deploy.ps1` load env vào process SSH PowerShell, nhưng service/Scheduled Task được Service Control Manager/Task Scheduler khởi động sẽ không kế thừa process environment đó. Node/Nest cũng không tự biết đường dẫn `PROD_ENV_FILE` tùy ý. Do đó build/migration có thể chạy nhưng API production thiếu `DATABASE_URL` và auth configuration.

### Yêu cầu

- Tạo project-owned `scripts/deploy/windows/start-baogiang-api.ps1`.
- Script startup phải:
  - nhận exact `NodeExe`, `EnvFile`, `Root`, `ExpectedEntryPoint`;
  - load env server-side mà không echo value;
  - reject duplicate/invalid lines;
  - dùng allowlist đầy đủ tương ứng `apps/api/.env.example`, gồm toàn bộ auth/session/lockout/rate-limit/cookie/log/feature variables cần thiết;
  - validate `NODE_ENV=production`, loopback API, port 3100, proxy hops 1, exact CORS, secure cookie, AI/Web Push false và non-empty `DATABASE_URL`;
  - không ghi secret vào log/command line;
  - chạy exact `node.exe` với exact current entrypoint và trả đúng exit code.
- Manual bootstrap/runbook phải cấu hình Scheduled Task/service action qua startup wrapper đã duyệt, không gọi Node trần mà mất env.
- Với `scheduled-task`, verify exact Execute, Arguments, WorkingDirectory, account và startup wrapper.
- Với `service`, chỉ hỗ trợ sau khi inventory chứng minh wrapper/service host cụ thể. Không giả định Node script tự là Windows Service.

## Finding 3 — Secret leakage qua pg_dump và báo cáo inventory

### Lỗi hiện tại

- `pg_dump --dbname $DATABASE_URL` đưa connection string/password vào process command line.
- Inventory xuất raw process command lines, có thể làm lộ credentials hoặc token của process khác trên VPS.

### Yêu cầu

- Không đưa full `DATABASE_URL` vào argument list của bất kỳ native process nào.
- Parse URL trong memory an toàn; truyền host/port/database/user không nhạy cảm qua args hoặc `PG*` process environment, password qua `PGPASSWORD`/approved server-local passfile; clear sensitive process env trong `finally`.
- Không print URL, password hoặc parsed credential.
- Backup phải dùng custom format, size > 0, SHA-256 và `pg_restore --list` PASS.
- Backup directory phải tồn tại từ bootstrap, có identity/ACL đã review; deploy script không tự tạo một backup root tùy ý.
- Inventory phải redact hoặc omit raw command lines. Chỉ xuất normalized identity fields cần review và mask URI userinfo/password, secret flags, tokens và environment assignments.
- Add deterministic redaction tests with hostile fixture strings.

## Finding 4 — Root/SSH/remote-command identity chưa fail-closed

### Lỗi hiện tại

- Workflow chỉ kiểm path absolute; một cấu hình sai như drive root/system/shared folder vẫn có thể bị dùng để tạo `incoming`, `current`, `previous` và xóa/move junction.
- Workflow tạo remote directory trước khi xác minh dedicated Báo giảng identity.
- SSH host key chỉ được kiểm non-empty; wildcard hoặc host/port không khớp vẫn có thể lọt.
- Remote `New-Item` giả định default SSH shell là PowerShell.
- Deploy command ghép chuỗi từ variables và quote thủ công, có rủi ro parse/injection/path-with-space.
- `scp` Windows path/backslash contract chưa được kiểm chứng.

### Yêu cầu

- Bootstrap tạo thủ công dedicated marker tại `<root>\shared\deployment-identity.json`, không chứa secret, tối thiểu có:
  - `systemId = baogiang-damsan`
  - exact canonical root
  - official domain
  - API port 3100
  - service kind/name
  - approved env/startup wrapper paths.
- Workflow và every mutating script phải verify marker trước mutation. Refuse drive root, Windows/System32, Program Files, Nginx root, DamSanV5/boarding roots, missing marker hoặc mismatch.
- `<root>\incoming`, `releases`, `staging`, `shared`, `logs`, `backups` phải được bootstrap và ACL-reviewed trước; workflow không tự tạo application root.
- Validate SSH port numeric 1–65535, host/user safe syntax and service name safe syntax.
- Validate pinned known-hosts entry:
  - exactly one approved host entry;
  - no wildcard, `@cert-authority`, empty/multiline injection;
  - host and non-default port representation match `PROD_SSH_HOST/PORT`;
  - approved key type and valid base64 payload.
- Invoke remote commands explicitly through `powershell.exe`; do not depend on default OpenSSH shell.
- Stop interpolating unescaped variables into `-Command`. Use a parameter JSON file with strict schema and no secrets, or UTF-16LE `-EncodedCommand` generated from safely quoted literals. Add hostile path/value tests.
- Normalize Windows remote transfer paths and use a tested OpenSSH/SFTP/SCP contract. Do not use unverified backslash destinations. Add a deterministic path-conversion test.
- Upload/call only scripts from reviewed current control-plane commit and application content from exact target SHA.

## Finding 5 — Process/service restart can accept zero or wrong process

### Lỗi hiện tại

- `Assert-ProcessIdentity` only rejects more than one match; zero matching processes passes.
- Service/task identity accepts root OR entrypoint broad match.
- No fail-closed check that port 3100 before/after restart belongs to exact Báo giảng PID/process.

### Yêu cầu

- Before stop/start, verify exact task/service action/config against marker and approved wrapper/entrypoint; broad root substring is insufficient.
- Inspect port 3100 owner. Abort if occupied by a nonmatching process.
- After start, bounded wait must prove exactly one expected process, exact executable/command line, start time after restart and ownership of port 3100.
- Do not kill generic processes. Only stop the exact reviewed task/service.
- Service/task names must be exact and safely escaped; avoid WMI filter injection.
- Health success cannot substitute for process identity.

## Finding 6 — Migration pre-check/rollback state is unsafe

### Lỗi hiện tại

- `prisma migrate status` commonly exits non-zero when migrations are pending—the exact situation before `migrate deploy`; current script can block a legitimate first migration.
- `$migrationApplied` is set only after migration script returns. A partial/uncertain migration failure is mislabeled as “not applied”.
- After migration, code rollback is attempted without an explicit compatibility gate.
- Rollback does not re-run health and can lose the original failure.

### Yêu cầu

- Record migration inventory before mutation without treating expected pending migrations as a generic fatal status. Connectivity/fatal errors must still fail closed.
- Set `migrationAttempted` before invoking deploy and distinguish `notStarted`, `attemptedUnknown`, `completed`.
- Run `prisma migrate deploy` only after verified backup and explicit production migration approval; run `migrate status` after deploy and require clean success.
- Record `_prisma_migrations` state before/after through safe server-side tooling without exposing credentials.
- Never claim automatic database rollback.
- Automatic code rollback after a migration attempt requires a separate explicit compatibility approval/input and recorded previous release. Otherwise stop, preserve evidence and require operator review.
- First deploy with no previous release must have an explicit failure path; do not call a nonexistent rollback and overwrite the original error.
- Rollback must preserve original error, record rollback error separately, restart only exact Báo giảng identity and re-run bounded local/public health checks.
- Junction operations must verify reparse-point identity and targets before remove/move; never recurse into an arbitrary directory/junction target.

## Finding 7 — Health and deployed-version evidence incomplete

- Parameterize health script with exact approved base URL and expected API port instead of silently hardcoding while ignoring orchestration parameters.
- Test local live/ready, public live/ready, `/`, and `/trang-thai-he-thong`.
- Reject redirect to another host and verify final URI remains official HTTPS host.
- Verify current junction target is exact target SHA release and process uses current entrypoint.
- Record bounded timing/attempts and safe error categories, not raw secret-bearing exceptions.
- Emit a redacted deploy report containing exact SHA, previous release, backup metadata (no DB URL), migration state, switch/restart/process identity, health outcomes and rollback state.
- Workflow must retrieve and upload this redacted report with `if: always()`. Never upload env files or database backups.

## Finding 8 — Read-only inventory chưa đáp ứng packet

Expand `production-preflight-readonly.ps1` so it actually inventories and classifies:

- actual SSH service/listening port(s), sshd config path and firewall evidence; no hardcoded 22 assumption;
- full executable paths/versions for Node/npm/npx/git/Nginx/psql/pg_dump/pg_restore;
- listeners 80/443/3100/5433 with redacted process identity;
- root/current/previous/releases/staging/incoming/shared/logs/backups, reparse targets and ACL summaries;
- exact Scheduled Task/service action/account/state;
- Nginx executable, prefix/config, domain server-block references, SPA/static root and `/api` upstream without reading certificate private key;
- PostgreSQL service/version/listen port/address and optional read-only DB/role/extension/migration verification using approved local auth; classify `NOT_RUN` if credentials are unavailable;
- DNS addresses, TLS subject/SAN/expiry/thumbprint and HTTP results;
- conflict evidence against DamSanV5 and boarding-management resources without dumping raw unrelated command lines.

Fix `RequireVerifiedIdentity`: it must verify actual marker/root/task-or-service/action/port isolation, not merely non-empty input strings. Add tests for missing, mismatch and conflict. Report writing may only target an existing operator-owned directory; stdout output remains redacted.

## Finding 9 — Static checks currently prove presence, not behavior

Expand deployment tests to catch the reviewed failure classes:

- TAR.GZ + `Expand-Archive` mismatch;
- bare `npm/node/npx` passed where leaf paths are required;
- `--ignore-scripts` with native runtime dependency;
- unchecked native exit codes;
- raw DATABASE_URL in `pg_dump` args or logs;
- workflow mutation before identity marker verification;
- wildcard/mismatched host key;
- remote commands relying on default shell or unsafe interpolation;
- process identity allowing zero matches;
- broad root-only service acceptance;
- hardcoded SSH port 22 in inventory;
- raw commandline output without redaction;
- migration pending treated as unconditional fatal pre-check;
- migration state flag set too late;
- rollback without health recheck/compatibility gate;
- missing deploy report upload;
- missing startup wrapper/env inheritance contract.

Parse workflow structure rather than relying only on token inclusion. Add PowerShell parser checks in CI and deterministic self-tests/fixtures for pure helper logic. Keep all existing CI gates.

Add `ops/**` to branch CI push trigger or otherwise ensure the corrected branch gets authoritative CI before PR, while retaining PR/main CI.

## Runbook and Environment contract

Rewrite the currently minimal runbook into executable, staged operational guidance with explicit stop points:

1. run redacted read-only inventory;
2. ChatGPT review;
3. manually bootstrap dedicated root/subdirs/ACL/identity marker;
4. create server env and startup wrapper/task/service identity;
5. verify Nginx server block and targeted reload procedure;
6. verify DB/role/extensions/migration state;
7. perform backup + `pg_restore --list` and document restore drill;
8. configure GitHub `production` Environment secrets/variables including all executable paths;
9. dry-run validation without mutation where possible;
10. independent PR/CI review;
11. exact workflow dispatch and post-deploy evidence.

Every stage must classify `EXISTS AND VERIFIED`, `MISSING`, or `CONFLICT`. Do not include real secret values.

## Scope

Allowed:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-production.yml`
- `scripts/deploy/windows/**`
- `scripts/ci/verify-deployment-static.cjs` and additional deployment-only tests/helpers
- root package scripts/lockfile only as required for deploy validation dependencies
- `docs/operations/**`
- related phase report and this task file.

Forbidden:

- business/UI/API/auth/authz behavior changes;
- Prisma schema or existing migration edits;
- production access/mutation/deploy;
- automatic production deploy on push;
- DamSanV5/boarding changes;
- `.codex/config.toml` or any secret.

## Required verification

Run:

- deployment static/behavioral fixtures;
- PowerShell parser checks for every `.ps1`;
- workflow parse/contract tests;
- root secret/schema/UI static checks;
- lint/typecheck/unit/build;
- Prisma validate/generate when environment allows;
- full integration/migration/E2E through authoritative GitHub CI after push/PR;
- `git diff --check`, staged file/secret inspection.

Local environment blocks must be reported honestly and cannot be labeled PASS. Do not use official DB to compensate.

## Commit and stop

- Commit one correction commit with a clear message and push same branch.
- Do not create PR, merge, configure secrets, access VPS, run migration or deploy.
- Report final HEAD, all changed files, test evidence, remaining inventory/manual gates and divergence.
- Stop after push for independent GitHub review.
