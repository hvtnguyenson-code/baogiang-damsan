# P5-057 / WS1 — Phiếu đối chiếu quyết định 06/11/2026

**Phạm vi:** Tài liệu PR #264 trên nền main sau WS2/B1. **DRAFT / NON-NORMATIVE**, không chỉnh backend, cấp quyền, DB, CI/CD, VPS hoặc Nội trú.

## Đã được Product Owner xác nhận

- **D1 (ACCEPTED 05/11):** PHT chuyên môn trực tiếp quyết định và thao tác công việc chuyên môn trong phạm vi. Không cấp `CAPABILITY_GRANT/SCHOOL_WIDE`, `USER_MANAGE`, `SYSTEM_ADMIN` cho PHT.
- **D3 (PARTIAL ACCEPTED 05/11):** Hiện 01 PHT chuyên môn chính; PHT khác không có quyền chuyên môn mặc định, có thể nhận grant chuyên môn giới hạn. Admin kỹ thuật tạo tài khoản và gán template ban đầu (kể cả PHT chính) theo phân công. Không hardcode số người trong engine.
- **B1:** schema provenance inert đã deploy; **WS2:** PR #263 gán nhiều lớp code-only đã deploy `bd79173a1180c26cbd33555ff081c015ef515bff` (CI #891 / VPS #33). UAT nghiệp vụ vẫn mở.

## Bằng chứng backend trên main sau WS2

1. `capabilities.controller.ts` và `responsibility-templates.controller.ts` yêu cầu `CAPABILITY_GRANT/SCHOOL_WIDE`: PHT chưa thể thao tác cấp quyền chuyên môn qua endpoint generic.
2. `capabilities.service.ts:create()` kiểm tra definition/scope và audit nhưng chưa kiểm tra căn cứ quyết định chuyên môn, không chống actor tự cấp quyền tại method này.
3. `access-baseline.service.ts:applyTemplate()` khóa user row và **chỉ thêm grant thiếu**: gán mẫu khác không đồng nghĩa thu hồi grant từ mẫu cũ. Không dùng UI đổi tên template để tuyên bố đã thu hồi.
4. `responsibility-template-catalog.ts` có `VICE_PRINCIPAL_ACADEMIC` nhưng chưa có mẫu `VICE_PRINCIPAL` riêng. **Phát hiện D4:** mẫu `PRINCIPAL` còn trải `...PHT_OPERABILITY_GRANTS`, mang theo quyền mutation quản trị chuyên môn dù thiết kế D4 chỉ giám sát; phải đối soát và chuyển quyền theo nguồn trước khi đổi template thật.

## Cổng quyết định chưa phê duyệt (đề xuất kỹ thuật, không tự áp dụng)

| Gate | Cần chốt | Phương án cần xem xét |
|---|---|---|
| D2 | Phạm vi Admin gán mẫu ban đầu, giới hạn generic grant, chuyển PHT theo phân công | Backend kiểm tra nguồn phân công và allowlist, chặn tự cấp/tự phong; PHT cấp quyền học thuật trực tiếp; không có luồng cứu hộ do thiếu PHT |
| D3 còn lại | Bổ nhiệm/chuyển giao PHT chính | Preview grant chênh lệch theo nguồn; thu hồi grant mẫu cũ đúng thời điểm, bảo toàn grant độc lập/historical audit |
| D4 — đã chốt nguyên tắc 06/11 | Hiệu trưởng giám sát độc lập; không mặc nhiên sửa/cấp quyền thay PHT, không buộc mọi quyết định PHT qua duyệt cấp 2 | Ngoại lệ khẩn cấp cần căn cứ, scope, giới hạn thời gian và audit. **Còn OPEN**: ai phê chuẩn, cách thực thi, thời hạn tối đa, thu hồi/khôi phục |
| D5 | Tự duyệt/tự ủy quyền và duyệt báo cáo BGH | Chặn tại backend, phủ cả API gọi trực tiếp; duyệt độc lập theo tuyến |
| D6 | TKB/import là đề xuất hay quyết định phân công | Chỉ hỗ trợ đối chiếu/preview; người có quyền xác nhận ghi, bảo toàn phiên bản lịch sử |

**Gate:** D4 đã PARTIAL ACCEPTED về nguyên tắc ngày 06/11/2026; D2/D5/D6, phần còn lại D3 và cơ chế cứu hộ D4 vẫn OPEN. Không đóng WS1 hoặc triển khai quyền WS3/WS4 trước khi chốt các quy tắc còn thiếu; P6-050 vẫn BLOCKED.

## Cập nhật quyết định D4 — 06/11/2026

Product Owner đã đồng ý với đề xuất ngay sau CI #892: Hiệu trưởng giám sát chuyên môn, không tự động nhận quyền cấp/sửa quyền thay PHT; ngoại lệ khẩn cấp chỉ theo phạm vi, thời hạn và căn cứ được kiểm soát và lưu audit. Đây là **PARTIAL ACCEPTED ở tầng chính sách**, không phải phê duyệt triển khai. Chưa thay đổi principal template, quyền production, tuyến duyệt bảng kê hay backend.

## Xác nhận thực tế vận hành 06/11/2026

Product Owner xác nhận trường **luôn bố trí PHT phụ trách chuyên môn**. D2/D3/D5 không xây dựng cơ chế 'mất PHT' hay Admin cứu hộ. Chuyển giao vai trò chỉ thực hiện theo phân công nhân sự thực tế, giữ hiệu lực hợp lệ, đúng nguồn grant và audit. Phần D4 đã chốt nguyên tắc can thiệp khẩn cấp vào quyết định nghiệp vụ là vấn đề khác, không phải cơ chế thay thế PHT.

## Đối chiếu D2 theo danh mục mã nguồn

Đã kiểm kê 38/38 capability từ `prisma/capability-catalog.cjs` và kiểm tra các đường writer (`CapabilitiesService.create/revoke`, `AccessBaselineService.applyTemplate/applyReconciliation`). Ma trận phân loại ứng viên, vấn đề `PRINCIPAL` kế thừa PHT operability và test cụ thể ở `docs/phase-reports/P5-057-WS1-D2-CODE-AND-CAPABILITY-AUDIT-20261106.md`. Đây là bằng chứng code và đề xuất kỹ thuật, không phải phân quyền mới hoặc quyết định PO đã chốt.
