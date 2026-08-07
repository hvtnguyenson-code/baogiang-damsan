# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-PRODUCTION-CD-FIRST-DEPLOY-CORRECTION-005`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `ops/phase-01-cd-first-deploy`  
Reviewed implementation HEAD: `f43b37856ccb8d82c9495afe0d44cc45bc26f845`  
Base `main`: `42d56d420f22cfaf77947f4eb46b283da06965de`

## Verdict

Correction-004 đã đóng gần hết các blocker. Independent review còn đúng ba điểm hẹp trước PR. Không refactor delivery chain, không mở rộng scope, không chạm business code.

## Safety gate

1. Đúng repository và branch.
2. `git status -sb`; tracked tree sạch, chỉ `.codex/config.toml` untracked.
3. HEAD chứa `f43b37856ccb8d82c9495afe0d44cc45bc26f845` và packet này.
4. Divergence không behind.
5. Không đọc/sửa/xóa/stage/commit `.codex/config.toml`.
6. Không reset, clean, stash, rebase, amend, squash hoặc force-push.
7. Không VPS, production secrets, production DB, inventory VPS, migration, deploy, PR hoặc merge.

## Finding 1 — safe-stop hiện có vòng polling nhưng vẫn fail ngay khi exact Báo giảng listener còn sống trong shutdown grace period

Current `Stop-ExactBaoGiangRuntime` sau lệnh stop chạy loop, nhưng mỗi iteration làm:

- lấy exact Báo giảng processes;
- lấy listeners port 3100;
- nếu `listeners.Count -gt 0` thì throw ngay.

Do đó nếu chính process Báo giảng hợp lệ đang shutdown chậm và còn giữ 3100 ở iteration đầu, function không chờ các iteration tiếp theo. Khi safe-stop throw, first-deploy failure path không quarantine `current`, làm retry semantics không fail-closed như thiết kế.

### Yêu cầu

1. Trong mỗi polling iteration, phân loại listeners theo owner PID:
   - listener do exact Báo giảng process hiện tại sở hữu: được phép chờ đến bounded timeout;
   - listener do process khác sở hữu: `CONFLICT`/throw ngay, tuyệt đối không kill process đó.
2. PASS chỉ khi đồng thời:
   - zero exact Báo giảng process;
   - zero listener trên 3100.
3. Nếu exact process/listener vẫn tồn tại tới `MaxAttempts`: timeout fail closed.
4. Không generic Node kill/taskkill.
5. Không dựa vào stale `$LASTEXITCODE`.
6. Return structured non-secret result có `attempts`, process/listener count.
7. First-deploy catch chỉ quarantine sau khi safe-stop thật sự PASS.

### Test bắt buộc

Bổ sung deterministic Windows/PowerShell fixture cho helper, tối thiểu mô phỏng được logic polling bằng injectable/pure helper hoặc testable classification function:

- iteration 1: exact Báo giảng PID còn process + listener 3100 => WAIT, không conflict;
- iteration sau: zero process/listener => PASS;
- foreign PID owns 3100 => fail ngay, không kill;
- exact process không listener nhưng chưa exit => tiếp tục bounded wait;
- timeout exact process => fail.

Không được chỉ grep source token.

## Finding 2 — PostgreSQL inventory state tự mâu thuẫn: `EXISTS AND VERIFIED` nhưng `migrationState = NOT_VERIFIED`

Current `Get-DatabaseSnapshot` xác minh actual database, role, port và required extensions. Đây là đúng hướng. Tuy nhiên nếu `_prisma_migrations` table chỉ tồn tại, report trả:

- `state = EXISTS AND VERIFIED`
- `migrationState = NOT_VERIFIED`

Điều này vi phạm semantic-honesty của inventory: migration state chưa verify thì aggregate database snapshot không thể được hiểu là production deployment state đã verified hoàn toàn.

### Yêu cầu

1. Tách rõ evidence layers:
   - database identity/role/port/extensions;
   - migration table existence;
   - migration summary/state.
2. Chỉ dùng aggregate `EXISTS AND VERIFIED` nếu toàn bộ evidence mà runbook coi là required cho gate đó đã được kiểm.
3. Nếu DB/role/extensions match nhưng migration table/state chưa được xác minh đầy đủ:
   - aggregate state phải `PARTIAL` hoặc `REQUIRES_REVIEW`/`NOT_VERIFIED`;
   - vẫn report `identityState = EXISTS AND VERIFIED` hoặc equivalent nested field nếu hữu ích.
4. Query `_prisma_migrations` read-only safe summary nếu có thể: row count, unfinished count, rolled-back count; không export checksum/logs/secret fields.
5. Nếu table chưa tồn tại trên greenfield DB: ghi `MISSING`/`NOT_APPLIED` đúng nghĩa, không CONFLICT chỉ vì chưa migrate.
6. Nếu query migration summary fail: `PARTIAL`/`NOT_VERIFIED`, không PASS.
7. Required extension mismatch vẫn `CONFLICT`.

### Test bắt buộc

Thêm pure/deterministic classification fixture cho các case:

- identity + extensions match, migration table absent => PARTIAL/NOT_APPLIED;
- table present, summary clean => verified state phù hợp;
- unfinished migration > 0 => CONFLICT hoặc explicit blocking state;
- identity mismatch => CONFLICT;
- missing required extension => CONFLICT.

Không cần production DB; không được dùng production để test.

## Finding 3 — phase report final evidence chưa phản ánh exact Correction-004 completion

Current report vẫn có title `Correction 003 Report`, trong khi body đã nói Correction-004. Dòng `git diff --check`, staged-file inspection, staged secret scan vẫn ghi `Required final gate before commit`, nhưng final Codex report cho exact HEAD `f43b378...` đã báo các gate này PASS.

### Yêu cầu

1. Đổi title thành `Correction 004 Report` hoặc `Correction 005 Report` theo exact run cuối; ưu tiên Correction-005 sau task này.
2. Bảng gate phải ghi evidence đúng của Correction-005:
   - deployment static/behavior/workflow/PowerShell/Windows fixture: kết quả run thực tế;
   - diff/staged/secret scan: PASS nếu run PASS;
   - app gates không chạy trong Correction-005 phải `NOT_RUN`, giữ prior evidence riêng;
   - authoritative CI = PENDING cho tới khi GitHub CI thực sự xong.
3. Không overclaim Build/Prisma/integration/E2E.

## Allowed scope

Chỉ được sửa nếu cần:

- `scripts/deploy/windows/deployment-common.ps1`
- `scripts/deploy/windows/production-preflight-readonly.ps1`
- deployment-specific CI fixtures/tests dưới `scripts/ci/`
- `docs/phase-reports/PHASE-01-PRODUCTION-CD-FIRST-DEPLOY-REPORT.md`
- `package.json` chỉ nếu cần thêm deployment test script.

Không sửa workflow deploy trừ khi test chứng minh phải sửa để support đúng finding trên. Không sửa business UI/API/auth/schema/migration files.

## Required local-safe gates

Chạy:

1. deployment static;
2. deployment behavioral;
3. workflow contract;
4. PowerShell parser;
5. Windows deployment fixture;
6. relevant new deterministic classification/polling tests;
7. `git diff --check`;
8. changed/staged-file inspection;
9. staged secret scan.

App-wide lint/typecheck/unit/build/Prisma/migration/integration/E2E có thể `NOT_RUN` trong correction hẹp này; không được fake PASS. Authoritative full Linux + Windows CI sẽ chạy sau PR.

## Completion

Nếu safe gates PASS:

1. commit trên cùng branch;
2. push origin;
3. không PR;
4. không merge;
5. không VPS/inventory/deploy.

Dừng sau push và báo final HEAD, divergence, changed files, từng local-safe gate, authoritative CI state, và xác nhận `.codex/config.toml` untouched.
