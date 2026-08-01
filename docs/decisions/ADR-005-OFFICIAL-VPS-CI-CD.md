# ADR-005 — Official VPS, CI/CD and Pre-operational Database

- **Status:** Accepted
- **Date:** 2026-08-01
- **Supersedes:** Các tuyên bố tương ứng coi VPS/domain là dự kiến hoặc production chưa được kích hoạt

## Context

Dự án đã có VPS Windows Server, PostgreSQL và domain chính thức. Cần dùng một delivery model nhất quán trong khi chưa đưa dữ liệu vận hành thực tế vào hệ thống, đồng thời cô lập Báo giảng khỏi DamSanV5 và hệ thống Quản lí nội trú cùng máy chủ.

## Decision

1. VPS Windows Server, PostgreSQL và `baogiang.dtnt-damsan.edu.vn` là hạ tầng production chính thức ở trạng thái **pre-operational**.
2. Database là database chính thức nhưng chỉ chứa tài khoản/dữ liệu giả cho đến quyết định go-live.
3. Delivery đi qua branch → GitHub → CI → review → `main` → CD → migration có kiểm soát → restart riêng Báo giảng → health check.
4. VPS chỉ nhận source từ commit GitHub xác định. Không copy working tree local.
5. CI chạy trên branch/PR; CD mặc định chỉ từ `main` xanh. Khởi chạy thủ công cần phê duyệt và vẫn giữ đầy đủ gate.
6. Prisma Migrate là nguồn thay đổi schema; VPS chỉ chạy `prisma migrate deploy` trong đợt được phép.
7. Báo giảng có toàn bộ tài nguyên runtime/database/proxy/log/backup riêng. Deploy chỉ restart đúng process Báo giảng đã nhận dạng.

## Consequences

- Tài liệu và task mới phải ưu tiên addendum v1.3; phát biểu Phase 00 chỉ còn giá trị lịch sử.
- Push không bảo đảm deploy, nhưng có thể khởi đầu chuỗi CI/CD sau khi các gate được thỏa mãn.
- Mọi deploy, truy cập VPS và production migration vẫn cần chỉ thị riêng; ADR này định nghĩa kiến trúc, không tự cấp quyền thao tác.
- Workflow CD sẽ được thiết kế trong task riêng, không thuộc task recovery/spec alignment.
