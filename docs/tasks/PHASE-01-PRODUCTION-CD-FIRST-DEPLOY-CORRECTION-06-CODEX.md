# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-PRODUCTION-CD-FIRST-DEPLOY-CORRECTION-006`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `ops/phase-01-cd-first-deploy`  
Reviewed implementation HEAD: `5285784230add6b4e5543e2d7f3ab089d96d5d69`  
Base `main`: `42d56d420f22cfaf77947f4eb46b283da06965de`

## Verdict

Correction-005 đã sửa đúng safe-stop polling và database evidence classification helper. Independent review còn đúng một runtime blocker greenfield trong PostgreSQL inventory và một chỉnh sửa evidence report nhỏ. Không refactor, không mở rộng scope.

## Safety gate

1. Đúng repository và branch.
2. `git status -sb`; tracked tree sạch, chỉ `.codex/config.toml` untracked.
3. HEAD chứa `5285784230add6b4e5543e2d7f3ab089d96d5d69` và packet này.
4. Divergence không behind.
5. Không đọc/sửa/xóa/stage/commit `.codex/config.toml`.
6. Không reset, clean, stash, rebase, amend, squash, force-push.
7. Không VPS, production secrets, production DB, inventory VPS, migration, deploy, PR hoặc merge.

## Finding 1 — greenfield inventory SQL vẫn tham chiếu relation `_prisma_migrations` khi relation chưa tồn tại

Current `Get-DatabaseSnapshot` chạy một `psql --command` chứa đại ý:

```sql
SELECT CASE WHEN to_regclass('_prisma_migrations') IS NULL
THEN '0|0'
ELSE (
  SELECT ... FROM _prisma_migrations
)
END;
```

PostgreSQL phải parse/resolve relation reference trong statement trước khi evaluate nhánh `CASE`. Vì vậy trên database greenfield chưa có `_prisma_migrations`, statement có thể fail `relation does not exist` thay vì trả evidence `PARTIAL / NOT_APPLIED` như contract Correction-005 yêu cầu.

Đây là blocker thực sự cho read-only inventory trước first deploy.

### Yêu cầu

1. Không được tham chiếu trực tiếp `_prisma_migrations` trong bất kỳ SQL statement nào được chạy khi chưa xác minh table tồn tại.
2. Thực hiện read-only evidence theo hai bước an toàn:
   - Query A luôn hợp lệ: actual database/role, extensions, và `to_regclass(...)` presence.
   - Chỉ khi Query A xác minh table `PRESENT`, mới chạy Query B có `FROM _prisma_migrations` để lấy safe summary.
3. Nếu table absent:
   - không chạy Query B;
   - aggregate state `PARTIAL`;
   - `migrationState = NOT_APPLIED`;
   - không `CONFLICT` chỉ vì greenfield chưa migrate.
4. Nếu Query B fail dù table present:
   - state `PARTIAL` hoặc `NOT_VERIFIED` theo existing classification contract;
   - không fake `EXISTS AND VERIFIED`;
   - không expose logs/checksums/secrets.
5. Nếu summary clean, identity/role/port/extensions match và table present:
   - verified classification theo helper hiện có.
6. Unfinished/rolled-back blocking rows => `CONFLICT` như hiện tại.
7. Giữ `Clear-PostgresProcessEnvironment` trong `finally`.
8. Không production DB để test.

### Test bắt buộc

Bổ sung deterministic test/fixture không cần PostgreSQL production để chứng minh control-flow contract:

- absence path không chứa/chạy migration-table summary query;
- presence path mới cho phép summary query;
- classification absent => `PARTIAL / NOT_APPLIED`;
- clean summary => verified;
- summary unavailable/error => PARTIAL/NOT_VERIFIED;
- unfinished/rolled-back => CONFLICT.

Có thể extract pure helper/query-builder hoặc mock invocation phù hợp. Không chỉ grep một token trong source.

## Finding 2 — phase report phải phản ánh exact Correction-005/006 run

Current report đã đổi title thành Correction-005 và sửa diff/staged/secret PASS, nhưng app rows vẫn ghi `NOT_RUN in Correction-004`/`NOT_RUN in Correction-003/004` dù final Correction-005 report cho biết app-wide lint/typecheck/unit/build/Prisma/migration/integration/E2E đều `NOT_RUN` trong Correction-005.

### Yêu cầu

Sau Correction-006:

- deployment-specific gates: ghi kết quả thực tế Correction-006;
- app-wide gates không chạy trong Correction-006: ghi `NOT_RUN in Correction-006`, và prior evidence/blocker có thể ghi riêng ngắn gọn;
- authoritative Linux/Windows CI vẫn `PENDING` cho tới PR CI;
- không overclaim.

## Allowed scope

Chỉ:

- `scripts/deploy/windows/production-preflight-readonly.ps1`
- `scripts/deploy/windows/deployment-common.ps1` chỉ nếu cần pure helper, không thay runtime behavior ngoài inventory classification
- deployment-specific tests dưới `scripts/ci/`
- `docs/phase-reports/PHASE-01-PRODUCTION-CD-FIRST-DEPLOY-REPORT.md`
- `package.json` chỉ nếu thật sự cần test command

Không sửa workflow deploy, business UI/API/auth/schema/migration files.

## Required local-safe gates

1. deployment static;
2. deployment behavioral;
3. workflow contract;
4. PowerShell parser;
5. Windows deployment fixture;
6. new greenfield migration-table control-flow fixture;
7. `git diff --check`;
8. changed/staged-file inspection;
9. staged secret scan.

App-wide gates có thể `NOT_RUN`; authoritative full CI chạy sau PR.

## Completion

Nếu local-safe gates PASS:

1. commit cùng branch;
2. push origin;
3. không PR;
4. không merge;
5. không VPS/inventory/deploy;
6. dừng sau push.

Final report: final HEAD, divergence, changed files, từng gate, authoritative CI state, xác nhận `.codex/config.toml` untouched.