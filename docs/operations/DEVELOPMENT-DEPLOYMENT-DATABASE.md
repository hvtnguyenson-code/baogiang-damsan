# Development, Deployment and Database Runbook

## Mục đích

Runbook này diễn giải đường đi chính thức từ thay đổi local tới hạ tầng Báo giảng pre-operational. Nó không phải lệnh cho phép deploy, truy cập VPS hoặc chạy migration. Mỗi thao tác thay đổi hạ tầng cần task và phê duyệt riêng.

## Phân tách môi trường

### Local workstation

- Dùng để viết code bằng editor/Codex/Antigravity và chạy lint, typecheck, targeted unit tests.
- Không bắt buộc cài hoặc chạy PostgreSQL.
- `DATABASE_URL` không có giá trị mặc định trong repository; environment cần database phải tự cấp connection string.
- Kết nối tới database VPS không phải workflow local mặc định. Mọi ngoại lệ cần phương thức an toàn và phê duyệt riêng.
- Không mở PostgreSQL trên VPS ra Internet chỉ để local kết nối.

### CI/test environment

- Dựng PostgreSQL 17 cô lập, dùng credential và dữ liệu test chỉ tồn tại trong môi trường CI.
- Chạy integration tests, migration tests và E2E có database.
- Không trỏ automated test suite hoặc destructive test vào database chính thức.

### Official VPS environment

- PostgreSQL trên VPS là database chính thức pre-operational, chỉ có tài khoản/dữ liệu giả cho đến go-live.
- Sau CD, smoke/health/application checks dùng domain chính thức và không biến database thành test fixture phá hủy.
- Deploy, migration và truy cập VPS luôn cần task/phê duyệt riêng.

## Delivery path

1. Viết code local trên branch riêng cho một task.
2. Chạy lint, typecheck và targeted unit tests local theo phạm vi; kiểm tra diff và secret.
3. Commit và push branch lên GitHub.
4. CI chạy trên branch/PR, dựng PostgreSQL cô lập cho integration/migration/E2E có database.
5. Có review GitHub độc lập; chỉ merge `main` khi được phép.
6. CD lấy đúng commit từ GitHub sang thư mục riêng của Báo giảng trên VPS.
7. Thực hiện backup/review gate, chạy `prisma migrate deploy`, rồi synchronize và verify capability catalog từ exact release.
8. Chỉ khi catalog verification thành công mới switch release; sau đó restart riêng service/Scheduled Task/process Báo giảng bằng entry point đã xác minh.
9. Kiểm tra process, log, database migration state và health endpoint tại `https://baogiang.dtnt-damsan.edu.vn`.

`CapabilityDefinition` synchronization bảo đảm system catalog, không phải provisioning `CapabilityGrant`. Deploy không tự cấp/sửa/thu hồi quyền người dùng; grants là prerequisite nghiệp vụ do operator quyết định.

Không copy working tree local lên VPS. `workflow_dispatch` chỉ là cơ chế khởi chạy có kiểm soát, không thay thế review/phê duyệt.

## Isolation checklist

Trước deploy phải xác nhận Báo giảng có thư mục, port, entry point, database, PostgreSQL role, Nginx server block, domain, workflow, log và backup riêng. Lệnh dừng/restart phải lọc theo command line hoặc entry point Báo giảng, không theo tên chung `node.exe`.

Không reboot VPS, restart PostgreSQL, dừng DamSanV5, sửa hệ thống Quản lí nội trú hoặc restart toàn bộ Nginx nếu thay đổi server block riêng không yêu cầu việc đó.

## Database change policy

- Prisma schema và migration đã commit là nguồn sự thật.
- CI dựng PostgreSQL cô lập và kiểm tra migration từ baseline hợp lệ.
- Database chính thức chỉ nhận `prisma migrate deploy` trong đợt được phê duyệt.
- Database chính thức không phục vụ automated test suite hoặc kiểm thử phá hủy.
- Không dùng `prisma db push` làm migration chính thức và không dùng `prisma migrate reset` trên database chính thức.
- Thay đổi phá hủy cần backup có thể phục hồi, review SQL và xác nhận riêng.
- Dữ liệu pre-operational chỉ là tài khoản/dữ liệu giả cho tới quyết định go-live.
- Không log/commit secret, connection string thật hoặc dump.

## Manual VPS command contract

Nếu cần SQL/PowerShell thủ công, ChatGPT soạn runbook gồm: mục tiêu, phạm vi chính xác, pre-check chỉ đọc, backup/rollback, câu lệnh, post-check và tiêu chí dừng. Người dùng chạy trực tiếp trên VPS. Kết quả phải được kiểm tra trước khi bước tiếp theo bắt đầu; agent không tự kết nối hoặc chạy thay.
