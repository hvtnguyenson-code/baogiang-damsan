# P6-021 — Kiểm thử PostgreSQL 16 và Nginx ngoài VPS

**Phạm vi:** chỉ GitHub Actions (Linux container PostgreSQL 16 + Windows fixture trên runner tạm thời).
**Trạng thái production:** NO-GO; tuyệt đối không truy cập Nội trú/VPS từ workflow.

## Kiểm thử đã bổ sung

1. Workflow .github/workflows/p6-021-offhost-compatibility.yml chạy PostgreSQL **16 thực** bằng Docker service của GitHub runner. Kiểm tra server_version_num, tạo role không phải superuser chỉ trong CI, chạy toàn bộ scripts/ci/test-phase-01-migrations.sh (fresh, legacy, replay, SQL assertions), sau đó tạo một database API CI riêng và chạy Prisma migrate deploy, capability-catalog, API integration.
2. Job Windows chạy scripts/ci/test-p6-021-first-include-win.ps1 trong thư mục %TEMP% của runner. Mô phỏng hai vhost Nội trú và case chưa có include: file baogiang-http01.conf đơn độc không được nạp; chèn một include ở cấp http trong fixture làm xuất hiện đúng một HTTP01 server mới, không có Báo giảng 443; duplicate được phát hiện; include wildcard thiếu file bị từ chối; trả lại main-file byte-for-byte.
3. Công cụ Nginx dùng lại deployment-common.ps1 và p6-010-http01-tls-common.ps1 hiện hữu. Không thực thi nginx.exe, không syntax-test runtime Nginx của VPS và không cấp certificate.

## Những điều tuyệt đối chưa được chứng minh

- Database OID 16397 trong PostgreSQL 16 VPS thuộc ai, tài khoản DBA có ủy quyền hay không.
- Migrating thật sang PostgreSQL 16 trên VPS; quyền/ACL/role/database riêng; sức chịu tải của cả hai cluster khi cùng hoạt động.
- Effective -p/-c Nginx chung; vòng đời include/SSL thật; DNS Mắt Bão.
- An toàn tuyệt đối trên chung máy vật lý; kể cả khi dùng riêng cluster, CPU/RAM/disk vẫn dùng chung. CI chỉ chứng minh tương thích logic.

## Quy tắc GO/NO-GO

- Chỉ khẳng định PostgreSQL 16 tương thích khi job PG16 **SUCCESS**, migration/schema/integration thật vượt qua và không có sửa code che lấp lỗi.
- Chỉ khẳng định bootstrap include giả lập đúng khi Windows job **SUCCESS**; điều đó KHÔNG chứng minh Nginx trên VPS đã có active include hay đủ thẩm quyền thay đổi.
- Khi CI fail: chỉ sửa code/test trên nhánh riêng, không thực thi kiểm thử lỗi trên VPS.
- Không dùng production secrets, không SSH, không sửa Nginx, không tạo tài khoản/DB, không restart PG16/PG17 hoặc DamSanV5.
- Trước mọi bước vận hành sau này phải có quyền phê duyệt phạm vi cụ thể, host-metrics guard, timeout/cancellation, backup/rollback và kiểm tra Nội trú trước/sau.

**Quyết định:** P6-030 chưa được phép triển khai cho đến khi các cổng xác minh VPS và vận hành sau này được chốt. Đây chỉ là bằng chứng compatibility ngoài production.
