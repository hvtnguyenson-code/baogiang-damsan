# P5-057 / WS1 — Đặc tả triển khai kỹ thuật hợp nhất

> **Bổ sung chính sách 07/11/2026 (PO ACCEPTED):** D2–D6 đã chốt nguyên tắc, trong đó D6 cho phép tự cập nhật `TeachingAssignment` từ nguồn TKB đã được PHT phê duyệt trước. Các mệnh đề mô tả D2–D6 là OPEN hoặc TKB chỉ được phép gợi ý dưới đây phản ánh **baseline lịch sử 06/11**, không còn là chính sách mới nhất. Xem `docs/requirements/P5-057-WS1-D2-D6-PO-DECISIONS-20261107.md`. Cổng triển khai và kiểm thử vẫn OPEN; không sửa runtime bằng tài liệu này.

**Ngày:** 06/11/2026. **Trạng thái:** TECHNICAL DESIGN READY / POLICY SIGN-OFF PENDING. **Phạm vi:** chỉ hệ thống Báo giảng. **Reference implementation:** `main@bd79173a1180c26cbd33555ff081c015ef515bff`; tài liệu PR #264. Không thay đổi API/DB/VPS/Nội trú bằng hồ sơ này.

## 1. Quyết định đã chốt, không hỏi lại

- **D1 ACCEPTED (05/11):** PHT phụ trách chuyên môn tự quyết định và cấu hình nghiệp vụ; Admin không bấm hộ, PHT không nhận generic `CAPABILITY_GRANT`.
- **D3 PARTIAL (05–06/11):** hiện một PHT phụ trách chuyên môn chính; trường luôn có PHT chuyên môn, không giả định thiếu PHT, không tạo tài khoản cứu hộ; các PHT khác chỉ có quyền học thuật được giao. Admin tạo tài khoản và gán mẫu vai trò ban đầu theo phân công.
- **D4 PARTIAL (06/11):** Hiệu trưởng giám sát chuyên môn, không mặc nhiên trở thành PHT hay sửa/cấp quyền; không thêm phê duyệt cấp hai cho mọi thao tác PHT. Can thiệp khẩn cấp chỉ có căn cứ, scope, thời hạn và audit, **chưa có quy trình triển khai được phê duyệt**.
- **D5 bất biến:** cấm tự cấp, tự nâng, tự duyệt, tự ủy quyền tiếp.
- **D6 bất biến:** dữ liệu TKB/import không tự quyết định quyền chuyên môn hay phân công chính thức.

## 2. Kết luận kiểm toán mã đã có (tránh phát triển trùng)

| Nội dung | Trạng thái thực tế | Việc còn phải làm |
|---|---|---|
| Grant API | `CapabilitiesService.create/revoke` dùng guard generic `CAPABILITY_GRANT/SCHOOL_WIDE`, service chưa có policy theo actor/loại grant | Chặn self-grant và quyền academic/technical theo lệnh, cả khi gọi API trực tiếp |
| Gán mẫu vai trò | `AccessBaselineService.applyTemplate()` chỉ bổ sung grant thiếu, không revoke nguồn cũ | Command đổi mẫu nguyên tử, preview diff, nguồn và audit |
| D3 phân PHT | `VICE_PRINCIPAL_ACADEMIC` có; `VICE_PRINCIPAL` chưa có | Thêm mẫu sau khi chốt tập quyền, giữ grant độc lập/historical |
| Quyền Hiệu trưởng | `PRINCIPAL` đang kế thừa `PHT_OPERABILITY_GRANTS` | Không tự xóa quyền cũ; inventory và chuyển quyền theo nguồn trước cutover D4 |
| D5 tự duyệt | `ReportingStatementsService.decide()` **đã chặn** `submitterUserId === actor`; integration test phủ approve/reject | Giữ nguyên, không viết lại |
| D5 tuyến duyệt BGH | `requireApproval()` chỉ nhận `APPROVAL_PRINCIPAL` hoặc `APPROVAL_VICE_PRINCIPAL` / school-wide | Đặc tả TTCM thẩm định HT/PHT chưa tương thích; KHÔNG cấp quyền BGH cho TTCM để lách |
| D6 import | `inspect` → `preview` → `confirm` tạo `TimetableVersion(DRAFT)`; rồi validate/approve/activate | Giữ quy trình, thêm đối soát với `TeachingAssignment` và PHT xác nhận |
| Phân công nhiều lớp WS2 | PR #263 đã deploy kỹ thuật qua CI #891/VPS #33 | UAT người dùng thực; không đụng code WS2 trong WS1 |

Đã kiểm kê **38/38 capability**, gồm 3 technical-root, 15 academic-operations, 11 academic-personal/programme và 9 nhạy cảm/giao thoa. Phân nhóm chỉ là **ứng viên review**, không tự tạo policy từ tên nhóm. Chi tiết: `docs/phase-reports/P5-057-WS1-D2-CODE-AND-CAPABILITY-AUDIT-20261106.md`.

## 3. Hợp đồng triển khai WS3/WS4 (phương án kỹ thuật)

1. **Giữ một authorization engine** dựa trên `CapabilityGrant`, scope, hiệu lực, audit, evaluator default-deny; B1 provenance chưa kích hoạt writer. Không tạo phân quyền song song.
2. **Command Admin** chỉ tạo/sửa tài khoản và gán/chuyển **mẫu vai trò theo quyết định nhân sự**, cấm gán chính mình hay tự phong PHT. Preview `added/removed/unchanged/unknown provenance`, kiểm tra xung đột và audit. `applyTemplate()` add-only không được tái sử dụng làm role transfer.
3. **Command PHT chính** chỉ cấp, điều chỉnh, thu hồi **capability học thuật thuộc allowlist chi tiết**, scope và hiệu lực được giao. Cấm quyền kỹ thuật, tự cấp, cấp tiếp quyền cấp grant và scope không được kiểm chứng.
4. **Chuyển giao người giữ PHT** theo phân công thực tế, giao dịch nguyên tử có xác minh quyền hiện tại và nguồn grant, không kết thúc toàn bộ quyền của người cũ một cách suy đoán, giữ `TEACHER_BASE`, grant độc lập và lịch sử.
5. **Hiệu trưởng** có quyền xem/giám sát và luồng phê duyệt hợp lệ riêng; không tự mặc nhiên nhận `TIMETABLE_MANAGE`/`PPCT_MANAGE`/`SUBJECT_MANAGE` từ mẫu PHT; không tự chỉnh quyền production trước khi xử lý quyền legacy.
6. **TTCM** kiểm tra bảng kê đúng người/đúng tổ qua lệnh thẩm định hẹp nếu được nhà trường duyệt; khác quyền phê duyệt BGH cấp trường. Không thiết kế lại kiểm tra chống tự duyệt đã có.
7. **TKB** là nguồn dữ liệu tham chiếu; import chỉ tạo bản nháp TKB, không tự sinh grant, không tự thay `TeachingAssignment`. Trường ngày hiệu lực phân công là `validFrom`/`validUntil`.

## 4. Gate thuộc thẩm quyền nhà trường còn mở — không tự chốt thay

1. **Nguồn phân công chính thức khi Admin gán/chuyển mẫu:** thông tin bắt buộc và người xác nhận; giới hạn tự bổ nhiệm; xử lý trường hợp hồ sơ chưa có chứng cứ.
2. **Nhóm 9 capability nhạy cảm/giao thoa:** chủ sở hữu, quyền cấp và thu hồi cụ thể, nhất là `APPROVAL_PRINCIPAL`, `APPROVAL_VICE_PRINCIPAL`, `AUDIT_VIEW`, catalog kiêm nhiệm và AI policy. Trước khi được chốt, không thêm grant mới qua generic route.
3. **D5 thẩm định báo cáo BGH:** tổ trưởng nào thẩm định nếu HT/PHT sinh hoạt tổ, có phê duyệt cuối riêng hay không, xử lý khi chính TTCM là người nộp.
4. **D4 ngoại lệ khẩn cấp:** trường hợp hợp lệ, ai xác nhận, thời hạn tối đa, phạm vi can thiệp, điều kiện thu hồi; *không* làm giả định thiếu PHT.
5. **D3/D6:** thời hạn ủy quyền, kiểm soát chuyển giao grant theo nguồn và mức độ PHT có thể chấp nhận gợi ý TKB theo lô.

**Không tuyên bố WS1 CLOSED hoặc thay đổi runtime khi 5 gate chưa được phê duyệt.** Phần thiết kế kỹ thuật đã hoàn tất đủ để đưa vào review/chia PR backend, nhưng quyết định nghiệp vụ còn mở không thể tự thay PO.

## 5. Kế hoạch delivery một lần cho mỗi PR

- **WS3 preparatory:** kiểm kê writer, inventory grant legacy, đề xuất mô hình phân biệt source; read-only preflight, targeted fixture; không migrate production.
- **WS4a:** backend guard cho quyền admin/PHT và anti-self-grant, test matrix fail-closed; code-only nếu không cần schema.
- **WS4b:** role-template transfer và `VICE_PRINCIPAL`, provenance B1 chỉ sau policy/writer được duyệt; backup/rollback tương thích; giữ một PR có CI xanh rồi merge, không chạy migration B1 lần nữa.
- **WS4c / D5 / D6:** tuyến TTCM, đối soát TKB + UX PHT; dùng hành vi đã có, không dựng lại importer hoặc chống tự duyệt.
- **Acceptance:** 12 kiểm thử D2 trong audit, test 7 persona; không làm mất quyền học thuật hợp lệ/không nâng quyền cho Admin/Hiệu trưởng; không thay đổi `C:\damsan`, port 3000/5433, Nginx hoặc VPS ACL.
- **Git:** một nhánh/một PR/một CI chính cho một thay đổi có ý nghĩa; nếu fail, điều tra tại chỗ trước khi push sửa; no-op docs merge **không cần** tạo một lượt VPS deploy chỉ để cập nhật hồ sơ.

**Đọc cùng hồ sơ gốc và code audit; khi nội dung cũ xung đột, trạng thái thực tế và ranh giới kỹ thuật trong tài liệu hợp nhất này là bản đính chính kỹ thuật, không thay thế quyết định PO chưa chốt.**
