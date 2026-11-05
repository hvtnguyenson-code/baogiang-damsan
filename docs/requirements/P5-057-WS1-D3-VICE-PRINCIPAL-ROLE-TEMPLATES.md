# P5-057 / WS1 / D3 — Phân biệt PHT chuyên môn và PHT không phụ trách chuyên môn

**Ngày quyết định nghiệp vụ:** 05/11/2026.
**Trạng thái:** **D3-PARTIAL ACCEPTED** — Product Owner đồng ý **chỉ PHT chuyên môn có thẩm quyền cấu hình/phân quyền chuyên môn**; phải có hai lựa chọn vai trò riêng. Các phần còn lại của D3 và D2/D4/D5/D6 **OPEN**.
**Phạm vi:** Báo giảng; tài liệu kiến trúc/dự thảo triển khai, **không phải cấp quyền runtime**.
**Căn cứ D1:** Product Owner chốt phương án **B** ngày 05/11/2026: PHT chuyên môn tự quyết định **và trực tiếp cấu hình** nghiệp vụ chuyên môn; Admin kỹ thuật không cấu hình thay PHT.

## 1. Hai mẫu trách nhiệm cần thể hiện rõ trên UI

| Nội dung | PHT chuyên môn | PHT thông thường |
| --- | --- | --- |
| Nhãn hiển thị | **Phó Hiệu trưởng phụ trách chuyên môn** | **Phó Hiệu trưởng** |
| Responsibility Template | **`VICE_PRINCIPAL_ACADEMIC`** (đã có) | **`VICE_PRINCIPAL`** (đề xuất bổ sung) |
| Chức danh hành chính | Phó Hiệu trưởng | Phó Hiệu trưởng |
| Quyền điều hành, cấp/thu hồi capability chuyên môn | Có theo scope, hiệu lực, lệnh nghiệp vụ hẹp và audit sau khi triển khai D1–D6 | **Không mặc định** |
| Phân công giáo viên-môn-lớp, TKB, PPCT, lịch ngoại lệ, dạy thay/bù, cấu hình GDĐP/HĐTN-HN | Người **quyết định và thao tác cấu hình** theo thẩm quyền | Không tự có quyền; chỉ tham gia chuyên môn khi được phân công dưới một capability riêng được phép |
| Xem báo cáo trường | Theo quyền chuyên môn đã cấp | Không tự mặc định được xem toàn trường; quyền xem/giám sát nếu có phải độc lập và chỉ đọc theo chính sách |
| Quyền giảng dạy, kê khai cá nhân | Giữ `TEACHER_BASE` và quyền cá nhân nếu là giáo viên thực tế | Giữ `TEACHER_BASE` và quyền cá nhân nếu là giáo viên thực tế |
| `USER_MANAGE`, `SYSTEM_ADMIN`, generic `CAPABILITY_GRANT` | **Không** | **Không** |
| Bảng kê tiết dạy của chính mình | Không tự duyệt, theo tuyến duyệt hiện có | Không tự duyệt, theo tuyến duyệt hiện có |

### Hướng dẫn lựa chọn trong UI

- Trong phần phân công trách nhiệm, hiển thị **hai mục riêng** có chú giải: (1) *Phó Hiệu trưởng*, không phụ trách chuyên môn; (2) *Phó Hiệu trưởng phụ trách chuyên môn*, có quyền chuyên môn theo quyết định hợp lệ.
- Không dùng một checkbox `isVicePrincipal` hoặc nhãn chữ `PHT` để suy luận và tự cấp quyền quản trị.
- Tài khoản chỉ có **một định danh**; một người vẫn có thể đồng thời là giáo viên và giữ nhiệm vụ khác. Không tạo tài khoản đăng nhập thứ hai hay bảng role-engine song song.
- Giao diện thao tác theo capability có hiệu lực. Người không đủ quyền không thấy thao tác và **backend vẫn phải kiểm tra chặn**, kể cả gọi trực tiếp API.

## 2. Ánh xạ sang kiến trúc hiện hữu — không tạo engine thứ hai

Bằng chứng code hiện hành: `apps/api/src/capabilities/responsibility-template-catalog.ts` đã khai báo `VICE_PRINCIPAL_ACADEMIC`, gồm `APPROVAL_VICE_PRINCIPAL/SCHOOL_WIDE` và các capability từ `PHT_OPERABILITY_GRANTS`; catalog **chưa có** template `VICE_PRINCIPAL`. Catalog áp `forbiddenDefaults` để không cấp các quyền kỹ thuật tổng quát cho PHT chuyên môn.

Thiết kế thực thi khi D2–D6 được khóa:
1. **Bổ sung** `VICE_PRINCIPAL` trong type `ResponsibilityTemplateKey` tại `@baogiang/contracts` và `RESPONSIBILITY_TEMPLATE_DEFINITIONS`; cập nhật `materializeTemplateGrants` theo đường xử lý hiện có.
2. Mẫu `VICE_PRINCIPAL` chỉ cấp quyền nguồn/cá nhân phù hợp với tình trạng giáo viên thực tế; **không** có `APPROVAL_VICE_PRINCIPAL`, `SUBJECT_MANAGE`, `TIMETABLE_MANAGE`, `PPCT_MANAGE`, `BUSINESS_CONFIGURATION_MANAGE`, `REPORTING_READ/SCHOOL_WIDE` hay bất kỳ school-wide academic grant mặc định.
3. Mẫu `VICE_PRINCIPAL_ACADEMIC` hiện có vẫn làm nguồn quyền quản trị chuyên môn; bổ sung command chuyên môn hẹp theo **D1-B** khi thiết kế D2 xong. Tuyệt đối **không** giải quyết bằng cách cấp generic `CAPABILITY_GRANT/SCHOOL_WIDE`.
4. Tiếp tục dùng `CapabilityGrant` + evaluator default-deny + scope và `validFrom/validUntil/revokedAt`, CSRF, audit. Template/nhãn chỉ là cơ chế materialize grant và trình bày UI, **không phải điều kiện đủ để qua backend guard**.
5. Việc chuyển `VICE_PRINCIPAL_ACADEMIC` thành `VICE_PRINCIPAL` phải có xác nhận đúng thẩm quyền, preview quyền cần thu hồi, đóng hiệu lực/thu hồi đúng grant, ghi actor + căn cứ + thời điểm; **không tự động xóa dữ liệu lịch sử** hay sửa các bản ghi TKB, PPCT, TeachingAssignment đã phát sinh.
6. Khi nâng từ PHT thường lên PHT chuyên môn, không dựa vào chức danh; phải có quyết định giao phụ trách chuyên môn, nguồn gốc thẩm quyền và phạm vi được duyệt. Chính sách bootstrap người đầu tiên và authority của Hiệu trưởng thuộc **D2/D4/D5 chưa quyết định**.

## 3. Các điểm D3 vẫn OPEN

- Trường có thể có bao nhiêu PHT chuyên môn đồng thời? Có được chia trường, khối, môn, tổ hoặc năm học không? Không tự mặc định một hay nhiều.
- PHT thường có dashboard xem trường **chỉ đọc** không, và nếu có thì phạm vi dữ liệu nào? Không tự cấp `SCHOOL_WIDE`.
- Ai xác nhận quyết định bổ nhiệm/chuyển đổi, phê duyệt bước hai và xử lý trường hợp khẩn cấp? Giữ **D2/D4/D5 OPEN**.
- Thời điểm hiệu lực, việc kết thúc nhiệm kỳ, ủy quyền thay thế khi PHT chuyên môn vắng mặt và xử lý các quyền tồn tại trên tài khoản cũ: cần quy tắc cụ thể, không tự giả định chuyển đổi hàng loạt.

## 4. Ma trận kiểm thử bắt buộc khi triển khai

| Mã | Kịch bản | Kết quả yêu cầu |
| --- | --- | --- |
| VP-01 | Tạo PHT thông thường, không có nhiệm vụ chuyên môn | Không xuất hiện capability quản trị chuyên môn hoặc phê duyệt PHT |
| VP-02 | PHT thường cố gọi API cấu hình TKB/PPCT/phân công lớp | 403/default-deny, audit denial phù hợp |
| VP-03 | PHT thường cố cấp `SUBJECT_MANAGE` hoặc quyền kỹ thuật | 403; không materialize grant |
| VP-04 | PHT chuyên môn được bổ nhiệm hợp lệ, đủ scope | Có thể cấu hình chuyên môn qua **command hẹp**, không cần generic `CAPABILITY_GRANT` |
| VP-05 | PHT chuyên môn thử cấp `SYSTEM_ADMIN`/`USER_MANAGE` | 403 ở backend |
| VP-06 | Giáng từ PHT chuyên môn về PHT thường | Quyền học thuật không còn hiệu lực đúng thời điểm; lịch sử, audit giữ nguyên |
| VP-07 | PHT thường/PHT chuyên môn đang kiêm nhiệm giáo viên | Kê khai cá nhân bình thường; không tự duyệt |
| VP-08 | Admin thay đổi nhãn chức danh PHT trong hồ sơ | Không tự sinh, đổi hoặc phục hồi grant chuyên môn |
| VP-09 | Người dùng truy cập cross-scope hoặc sau hết hạn | 403; không tiết lộ dữ liệu ngoài scope |
| VP-10 | Giao diện PHT thường và PHT chuyên môn | Nhãn phân biệt rõ; quyền thao tác khớp backend; không lộ capability key/UUID |
| VP-11 | Người chỉ có quyền xem báo cáo riêng | Xem theo scope; mọi mutation chuyên môn bị chặn |
| VP-12 | Chuyển đổi template nhiều lần | Idempotent; không cấp trùng, không phục hồi quyền đã thu hồi, không mất lịch sử |

## 5. Cổng triển khai

- **Đã được PO chốt:** hai loại PHT theo phạm vi; **chỉ PHT chuyên môn** được phân quyền và cấu hình chuyên môn trong giới hạn được xác lập.
- **Chưa chốt:** số lượng PHT chuyên môn, scope thực tế, quyền xem PHT thường, người phê duyệt bổ nhiệm, ủy quyền và thời hạn.
- WS1 tiếp tục `IN_PROGRESS`; chỉ triển khai code sau khi D2–D6 (đặc biệt D2/D3/D4/D5) được xác nhận và có bộ test + rollback rõ ràng.
- Không thay đổi runtime, schema, migration, VPS, database, PR #263 hoặc dự án Nội trú/Kiểm tra Online trong bước cập nhật quyết định tài liệu này.
