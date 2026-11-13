# P5-057 WS1 — Phê duyệt trước migration GiST cho nhiều PHT

**Tính chất:** thay đổi governance độc lập, không chứa migration SQL và không triển khai chức năng B1.
**Migration dự kiến:** `prisma/migrations/20261113160000_p5_057_ws1_multi_vice_seat/migration.sql`.
**SHA-256 chính xác:** `a19dd175524388aac7beefdbad0ed715963e459e49d5f7fdfb72a43e9833f79b`.

## Cơ sở và phạm vi phê duyệt
Migration thay thế exclusion GiST một-seat bằng hai exclusion trong cùng transaction PostgreSQL: HT và Admin kỹ thuật vẫn độc quyền theo seat; nhiều PHT khác nhau được đồng thời giữ chức trách, cùng một người không được bổ nhiệm trùng khoảng. Đây là **mở rộng ngữ nghĩa tập trạng thái hợp lệ**, không phải SQL chỉ thêm câu lệnh. Có `DROP CONSTRAINT` + `ADD CONSTRAINT`, cần lock/quiescence và backup trước khi triển khai. Không sửa dữ liệu `users`, `role_appointments` hay `capability_grants`.

Danh mục hiện có chỉ hỗ trợ `QUIESCED_ADDITIVE`; chính sách này áp dụng vì **tính tương thích ngữ nghĩa của dữ liệu và yêu cầu quiescence**, không được hiểu là triển khai online/không khóa bảng. Nếu không đủ điều kiện cô lập và phục hồi thì **fail closed**.

## Bằng chứng và kiểm soát
- PostgreSQL 17.10 cô lập: 33 migration PASS, 2 integration test B1 writer PASS, 22 unit test PASS, ESLint scoped PASS.
- Review độc lập Antigravity của PR #285 còn `REVIEW_BLOCKED` vì cổng phát hành; cần kiểm tra chính xác mã và các hạn chế đã ghi nhận.
- Policy phải được merge **và deploy đến VPS Báo giảng trước** khi merge commit có migration; phân loại dùng policy trong deployed baseline, không tự phê duyệt từ target.
- Trước merge migration #285: exact-head CI, PG16 compatibility, migration chain và API integration đều xanh; backup/cửa sổ bảo trì/chuyển trạng thái theo kiểm soát production có sẵn. Không sửa workflow, không bỏ qua yêu cầu xác minh backup hay baseline.
- Tài liệu này không cho phép nâng `B1_REJECT_GENERIC_SENSITIVE_WRITES=true`; writer vẫn là staged class chưa đăng ký. Bật quyền là một cuộc nghiệm thu riêng.
- Tuyệt đối không ảnh hưởng Quản lí Nội trú hoặc restart chung PostgreSQL/Nginx.

## Tiêu chí xác minh sau deploy migration
Đúng commit SHA, `_prisma_migrations` có migration mới; hai constraint `role_appointments_seat_no_overlap` và `role_appointments_vice_same_holder_no_overlap` hợp lệ; API live/ready và HTTPS PASS; Telegram BaoGiangBackend báo đúng phiên bản. Nếu bất kỳ bước nào thất bại, production worker phải giữ fail-safe và báo lỗi rõ ràng.
