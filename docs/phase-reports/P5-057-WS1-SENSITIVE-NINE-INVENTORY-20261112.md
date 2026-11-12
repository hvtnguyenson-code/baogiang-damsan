# P5-057 / WS1 — Bằng chứng kiểm kê G-D2-2, 9 capability nhạy cảm (12/11/2026)

**Baseline:** `main@6a42ee4083c6031e406f69b03bf295ec32c996d9` sau PR #282, đã khởi động VPS 10:30 ngày 12/11 theo thông báo Telegram của nhà trường. **Phạm vi PR này: thiết kế chính sách chờ chốt và kiểm thử kiểm kê, không kích hoạt writer.**

## Kết quả

- Đối chiếu catalog: đúng 9 key, mỗi key một khai báo, toàn bộ scope duy nhất `SCHOOL_WIDE`.
- Mẫu cấp sẵn: `PRINCIPAL` có `APPROVAL_PRINCIPAL` + `AUDIT_VIEW`; `VICE_PRINCIPAL_ACADEMIC` có `APPROVAL_VICE_PRINCIPAL`; `TECHNICAL_ACCOUNT_ADMIN` có `AUDIT_VIEW` + `ADDITIONAL_DUTY_CATALOG_MANAGE`. Không có 5 key AI quản trị trong template nào.
- Đã xác minh đường tiêu thụ `APPROVAL_*`, audit và danh mục kiêm nhiệm trên API thật. Nhóm AI ở catalog/contracts, chưa tìm thấy chỗ sử dụng năm key AI ở `apps/api/src`; không suy diễn Phase 11 đã hoạt động.
- Phát hiện **CRITICAL, chưa sửa**: `CapabilitiesService.create/revoke()` chưa có issuer/scope/seat policy cho 9 key; chặn `actor===target` không chặn được Admin có `CAPABILITY_GRANT` cấp cho người khác. `applyTemplate` add-only; không được dùng làm chuyển giao chức trách.
- Chốt quyết định PO ngày 08/11: không yêu cầu giấy tờ nhân sự; backend ghi actor session, target, hành động, thời điểm xác nhận và nguồn/audit. Không suy đoán mẫu từ tên chức danh.
- Ma trận nghiên cứu: `docs/requirements/P5-057-WS1-SENSITIVE-NINE-CAPABILITY-MATRIX-20261112.md`. Trong đó các cột issuer/revoker chưa chốt được đánh dấu **OPEN / ĐỀ XUẤT**, không phải policy có hiệu lực.

## Kiểm thử cục bộ

- `apps/api/test/capabilities/p5-057-sensitive-nine-inventory.spec.ts`: Jest 13/13 PASS bằng transformer cô lập, không sửa cấu hình Jest production.
- TypeScript scoped: PASS.
- Chưa thực hiện review độc lập/CI exact-head đối với nhánh này. Bài kiểm thử static chỉ bảo vệ **drift của baseline**, không chứng minh writer đúng.
- Không dùng PostgreSQL production/VPS, không test DB thật, không thay auth/runtime/schema/API, không chạy migration hay deploy riêng.

## Ràng buộc tiếp theo

Dự thảo G-D2-2 phải được PO quyết định từng key (G1–G9), đặc biệt `APPROVAL_PRINCIPAL`, `AUDIT_VIEW`, catalog kiêm nhiệm và AI. Sau đó mới viết policy issuer/actor-target/source, thử nghiệm các đường generic writer và command chuyên biệt trên PostgreSQL cô lập, xử lý grant legacy và review độc lập. Không mở writer B1, không thay đổi ai đang có quyền; P5-057/T56 vẫn `IN_PROGRESS`, P6-050 `BLOCKED`.

**Quy trình:** 1 nhánh → 1 commit → PR → CI/review; chỉ merge theo lệnh PO; không chỉnh CI/CD và không restart Nội trú.
