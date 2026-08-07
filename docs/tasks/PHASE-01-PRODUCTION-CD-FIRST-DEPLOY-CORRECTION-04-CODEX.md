# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-PRODUCTION-CD-FIRST-DEPLOY-CORRECTION-004`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `ops/phase-01-cd-first-deploy`  
Reviewed implementation HEAD: `6c060409e4154fe5681e2fe4930c1fb46d4adb08`  
Base `main`: `42d56d420f22cfaf77947f4eb46b283da06965de`

## Verdict

Correction-003 đã đóng các blocker lớn nhưng independent review vẫn còn bốn điểm cụ thể trước PR. Đây là correction hẹp cuối cùng; không refactor lại delivery chain và không mở rộng business scope.

## Safety gate

1. Đúng repository và branch.
2. `git status -sb`; tracked tree sạch, chỉ `.codex/config.toml` untracked.
3. HEAD chứa `6c060409e4154fe5681e2fe4930c1fb46d4adb08` và packet này.
4. Divergence không behind.
5. Không đọc/sửa/xóa/stage/commit `.codex/config.toml`.
6. Không reset, clean, stash, rebase, amend, squash, force-push.
7. Không VPS, production secrets, production DB, inventory, migration, deploy, PR hoặc merge.

## Finding 1 — SFTP contract vẫn không đúng với path có khoảng trắng

Current helper `windowsRootToSftp()` cho phép `C:\Báo giảng Đam San`, và Windows fixture tuyên bố path này được hỗ trợ. Nhưng workflow batch vẫn phát lệnh dạng:

`put <local> <remote>`

qua `printf 'put %s %s\n'` mà không quote/escape SFTP batch paths. Root có spaces sẽ bị tokenizer của SFTP tách field.

### Yêu cầu

Chọn contract đơn giản, fail-closed cho greenfield first deployment:

- Production application root chỉ cho phép absolute Windows path với mỗi segment thuộc `[A-Za-z0-9._-]+`, không spaces, quotes, Unicode, control chars hoặc shell/batch metacharacters.
- Ví dụ hợp lệ: `C:\baogiang` hoặc `D:\apps\baogiang`.
- Vì root chưa bootstrap nên restriction này không phá production hiện hữu.
- Cập nhật workflow environment validation để reject root ngoài contract trước SSH.
- Cập nhật `windowsRootToSftp()` cùng contract.
- Xóa/không overclaim support path có spaces/Unicode.
- Tests phải PASS với `C:\baogiang`, reject `C:\Báo giảng Đam San`, quote, CR/LF, relative path, malformed drive.
- Remote transfer vẫn phải nằm exact `<root>\incoming\<transfer>`.
- Không cần thêm một quoting layer phức tạp nếu root charset restriction giải quyết deterministic contract.

## Finding 2 — read-only inventory vẫn overclaim PostgreSQL / TLS / Nginx

`production-preflight-readonly.ps1` hiện vẫn có semantic overclaim:

- DB query output bị discard; report dùng DB/role lấy từ URL rồi gắn `EXISTS AND VERIFIED`.
- required extensions và `_prisma_migrations` actual state chưa được report đầy đủ.
- Nginx chỉ đọc direct references, chưa chứng minh include chain/server block hoàn chỉnh.
- TLS/HTTP có thể gắn `EXISTS AND VERIFIED` dù chưa capture/validate DNS records và certificate SAN/domain mapping đầy đủ.

### Yêu cầu

Inventory phải tuyệt đối read-only và semantic-honest:

1. Thêm explicit expected parameters/default contract phù hợp destination đã duyệt:
   - expected database `baogiang`;
   - expected application role `baogiang_app`;
   - expected PostgreSQL port `5433`;
   - required extension tối thiểu từ schema/migration thực tế, bao gồm `btree_gist` nếu migrations yêu cầu.
2. Khi `-VerifyDatabase`:
   - query actual `current_database()` và `current_user`;
   - compare actual với expected;
   - query actual extension names;
   - query/read-only `_prisma_migrations` existence and safe summary/count/state without secrets;
   - chỉ `EXISTS AND VERIFIED` nếu actual DB/role/required extensions đều match;
   - mismatch => `CONFLICT`;
   - migration evidence chưa đủ => explicit `PARTIAL`/`NOT_VERIFIED`, không giả PASS.
3. Nginx:
   - direct config file/reference extraction chỉ ghi `PARTIAL` hoặc `REQUIRES_REVIEW` trừ khi include-chain/server-block validation thực sự được implement;
   - không claim complete verification từ vài dòng regex.
4. DNS/TLS/HTTP:
   - report những gì thực sự capture được (HTTP status/final host/cert subject/thumbprint/expiry nếu có);
   - nếu chưa verify DNS A/AAAA và SAN hostname đầy đủ thì state `PARTIAL`/`REQUIRES_REVIEW`, không `EXISTS AND VERIFIED`.
5. `KnownForeignName` không được biến thành isolation PASS nếu chỉ là input chưa programmatically checked.
6. Không xuất raw unrelated command line, env, connection string, password hoặc secret.
7. Không mutation trong inventory.

Tests/static/behavioral phải bắt overclaim literals/semantics tối thiểu cho DB/TLS/Nginx states.

## Finding 3 — `Stop-ExactBaoGiangRuntime` thiếu bounded verification

Hiện helper stop task/service rồi ngay lập tức kiểm process/listener một lần. Scheduled Task/process shutdown có thể asynchronous.

### Yêu cầu

- Thêm bounded polling với defaults nhỏ, ví dụ max attempts + delay, parameter validate range.
- Sau exact stop/disable, mỗi attempt chỉ quan sát:
  - exact Báo giảng API processes theo marker nodeExe + entryPoint;
  - listener port 3100.
- PASS chỉ khi zero exact process và zero listener.
- Nếu listener còn là foreign process: report/throw conflict; không kill.
- Hết bounded window vẫn còn exact process/listener => throw safe-stop timeout.
- Không generic `taskkill`, không kill all Node.
- Structured result gồm attempts, zero counts.
- Không dựa stale `$LASTEXITCODE` sau PowerShell cmdlets.

Windows fixture phải deterministic; mock/safe temp fixture nếu có thể, tối thiểu phải kiểm function contract/polling path thực thi mà không production access.

## Finding 4 — phase report có dòng gate mâu thuẫn/duplicate

Correction-003 report hiện còn cả dòng cũ `Build PASS` / `Prisma validate PASS` và dòng mới mô tả BLOCKED/NOT_RUN.

### Yêu cầu

Bảng final chỉ có một dòng cho mỗi gate và phản ánh chính xác bằng chứng:

- deployment static/behavior/workflow/PowerShell: `LOCAL PASS; authoritative CI PENDING`;
- Windows deployment fixture: `LOCAL PASS; authoritative windows-latest CI PENDING`;
- schema/secret/UI/lint/typecheck/unit: nếu Correction-003/004 không chạy lại thì ghi `NOT_RUN in Correction-004; prior evidence exists` thay vì PASS mới;
- Build: `LOCAL BLOCKED in Correction-002 due timeout; NOT_RUN in Correction-003/004` nếu không chạy lại;
- Prisma generate: `LOCAL PASS in Correction-002; NOT_RUN in Correction-003/004` nếu không chạy lại;
- Prisma validate: `LOCAL BLOCKED in Correction-002 due missing local DATABASE_URL; NOT_RUN in Correction-003/004` nếu không chạy lại;
- migration/integration/E2E: `NOT_RUN locally; authoritative isolated CI required`;
- authoritative CI: `PENDING` until actual evidence exists.

Không duplicate rows, không overclaim.

## Required tests

Chạy tối thiểu:

1. deployment static;
2. deployment behavioral;
3. workflow contract + negative fixtures;
4. PowerShell parser;
5. Windows deployment fixture local;
6. `git diff --check`;
7. changed/staged file inspection;
8. staged secret scan.

Nếu nhanh và môi trường cho phép, chạy schema/secret/UI/lint/typecheck/unit/build/Prisma generate/validate; nếu không thì ghi đúng `NOT_RUN` hoặc `BLOCKED`. Migration/integration/E2E chỉ isolated environment.

Sau push, authoritative Linux + Windows GitHub CI phải được để chạy; không gọi production deploy workflow.

## Allowed scope

Chỉ sửa:

- `.github/workflows/deploy-production.yml`
- `scripts/ci/*deployment*`
- `scripts/ci/*workflow*`
- `scripts/deploy/windows/production-preflight-readonly.ps1`
- `scripts/deploy/windows/deployment-common.ps1`
- production CD runbook/environment contract/report nếu cần đồng bộ contract
- `package.json` chỉ khi test script cần thiết.

Không sửa business UI/API/auth/schema/migrations.

## Completion

Nếu safe gates đạt:

1. commit cùng branch;
2. push origin;
3. không PR;
4. không merge;
5. không inventory VPS;
6. không deploy;
7. dừng sau push.

Final report: final HEAD, divergence, changed files, từng finding, gate status, authoritative CI state, production inventory còn thiếu, xác nhận không chạm VPS/secrets/production DB/deploy, `.codex/config.toml` untouched.