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
4. `responsibility-template-catalog.ts` có `VICE_PRINCIPAL_ACADEMIC` nhưng chưa có mẫu `VICE_PRINCIPAL` riêng.

## Cổng quyết định chưa phê duyệt (đề xuất kỹ thuật, không tự áp dụng)

| Gate | Cần chốt | Phương án cần xem xét |
|---|---|---|
| D2 | Phạm vi admin gán mẫu ban đầu, giới hạn generic grant, recovery khi mất PHT | Backend kiểm tra nguồn quyết định chuyên môn, chống admin tự cấp/tự phong; luồng cứu hộ có phê chuẩn và audit độc lập |
| D3 còn lại | Bổ nhiệm/chuyển giao PHT chính | Preview grant chênh lệch theo nguồn; thu hồi grant mẫu cũ đúng thời điểm, bảo toàn grant độc lập/historical audit |
| D4 | Quyền giám sát/override của Hiệu trưởng | Mặc định xem/giám sát; override chỉ với căn cứ, phạm vi, thời hạn và audit rõ |
| D5 | Tự duyệt/tự ủy quyền và duyệt báo cáo BGH | Chặn tại backend, phủ cả API gọi trực tiếp; duyệt độc lập theo tuyến |
| D6 | TKB/import là đề xuất hay quyết định phân công | Chỉ hỗ trợ đối chiếu/preview; người có quyền xác nhận ghi, bảo toàn phiên bản lịch sử |

**Gate:** Không đóng WS1 hoặc chuyển sang sửa quyền WS3/WS4 khi D2/D4/D5/D6 và phần còn lại của D3 chưa được chốt; không cho phép P6-050 pilot.
