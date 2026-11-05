# P5-057 / WS1 / D3 — Phân biệt PHT chuyên môn và PHT không phụ trách chuyên môn

**Ngày quyết định nghiệp vụ:** 05/11/2026.
**Trạng thái:** **D3-PARTIAL ACCEPTED — bổ sung quyết định PO 05/11/2026:** Hiện tại **01 PHT phụ trách chuyên môn chính**, PHT còn lại có mẫu PHT thông thường; hệ thống **cho phép gán thêm từng quyền chuyên môn theo phạm vi, thời hạn và quyết định hợp lệ** cho PHT còn lại khi nhiệm vụ thay đổi. **Không khóa cứng giới hạn 01 người trong engine**, không cấp quyền toàn trường tự động, không tự biến PHT được ủy quyền thành người phụ trách chính. D2/D4/D5/D6 và phần quy trình cấp/thu hồi của D3 vẫn **OPEN**.
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

## 3. D3 — Một PHT phụ trách chính, quyền bổ sung linh hoạt

### 3.1. Quyết định đã được Product Owner chốt ngày 05/11/2026

- **Cấu hình vận hành hiện tại:** có **một PHT phụ trách chuyên môn chính**. PHT còn lại mang trách nhiệm `VICE_PRINCIPAL`, không mặc định có quyền cấu hình hoặc duyệt chuyên môn.
- **Linh hoạt khi phân công thay đổi:** PHT còn lại **có thể nhận một hoặc nhiều capability chuyên môn bổ sung**, ví dụ quản lý HĐTN-HN, GDĐP, một nhóm môn hoặc một phần công tác TKB, theo quyết định hợp lệ. Chỉ được thực hiện đúng scope, thời điểm hiệu lực và lệnh nghiệp vụ được cấp, **không tự nhận toàn bộ `PHT_OPERABILITY_GRANTS`**.
- **Không khóa số lượng bằng mã:** hệ thống không được hardcode `MAX_ACADEMIC_VICE_PRINCIPALS=1` trong type/template/capability evaluator hoặc schema. Quy tắc **một người phụ trách chính tại thời điểm hiện tại** thuộc cấu hình và quy trình phân công được kiểm soát, không phải giới hạn bất biến của kiến trúc.
- **Tách chức trách với quyền:** `VICE_PRINCIPAL_ACADEMIC` là mẫu trách nhiệm PHT chuyên môn chính; `VICE_PRINCIPAL` là mẫu PHT thông thường. Các capability nghiệp vụ cấp thêm cho PHT thông thường là **grant có nguồn gốc và hiệu lực riêng**, không phải hành động tự nâng nhãn lên PHT chuyên môn chính.
- **Chuyển giao chính thức:** có thể đổi người phụ trách chuyên môn chính qua giao dịch chuyển giao được ủy quyền, preview quyền thay đổi, kích hoạt grant phù hợp cho người mới, kết thúc/thu hồi grant không còn hợp lệ của người cũ và ghi audit. Không xóa lịch sử TKB, PPCT, TeachingAssignment hay bản ghi quyền cũ. Chống khoảng trống hoặc chồng chéo thẩm quyền ở cùng scope/thời điểm.
- **Mở rộng tương lai:** nếu trường sau này phân công nhiều PHT cùng phụ trách các mảng chuyên môn, có thể sử dụng grant theo scope và cấu hình chức trách thay vì viết lại engine. Quyết định cho phép đồng thời nhiều **người phụ trách chính toàn trường** chưa được đưa ra; không tự kích hoạt trường hợp này.

### 3.2. Mô hình quyền kỹ thuật đề xuất (chưa triển khai)

`EffectivePermission = base responsibility grants + scoped additive grants - expired/revoked/denied grants`, kiểm tra tại backend theo capability + scope + hiệu lực + nguồn quyết định; đây là diễn giải logic, **không phải công thức hay cơ chế đã được xác minh trong code**.

- Dùng các scope hiện có nếu phù hợp (chẳng hạn `SCHOOL_WIDE`, `SUBJECT_GROUP`, `SUBJECT`, `ACTIVITY`); không sáng tạo scope mới hoặc migration khi chưa đánh giá schema/contracts.
- Quyền bổ sung cần có **người nhận, loại nghiệp vụ, phạm vi, người/căn cứ quyết định, `validFrom`, `validUntil` nếu có hạn, trạng thái thu hồi và audit**. Cần đối chiếu cấu trúc `CapabilityGrant` hiện tại trước khi thiết kế chứng từ.
- Khi quyền hỗ trợ hết hạn hoặc bị thu hồi, thao tác mới phải bị backend từ chối; dữ liệu và thao tác lịch sử vẫn giữ nguyên.
- Admin kỹ thuật và PHT thông thường không thể tự cấp quyền cho mình; không cấp `SYSTEM_ADMIN`, `USER_MANAGE`, generic `CAPABILITY_GRANT/SCHOOL_WIDE` để đạt mục tiêu.
- Quyền bổ sung có thể là **thao tác** hoặc **chỉ xem**; không suy luận quyền phê duyệt từ quyền xem hay tên vai trò. Xung đột chỉnh sửa cùng nghiệp vụ cần quy tắc ownership/effective time và audit rõ ràng.

### 3.3. Những nội dung D3 còn OPEN

- Ai có thẩm quyền phê duyệt và thực thi việc giao thêm quyền cho PHT thứ hai, chuyển giao chính thức hoặc kích hoạt chế độ thay thế khi người phụ trách vắng mặt? Liên quan D2/D4/D5.
- PHT thường có quyền xem dashboard toàn trường không, hay chỉ xem theo phạm vi được giao? Không tự cấp `SCHOOL_WIDE`.
- Quy định thời hạn mặc định của quyền giao thêm, nguồn quyết định và yêu cầu gia hạn/thu hồi, quản lý xung đột khi hai PHT cùng được quyền trên một mảng.
- Cách biểu diễn “PHT chuyên môn chính” trong dữ liệu, thao tác chuyển giao nguyên tử, thời điểm hiệu lực khi đổi năm học và quy trình cứu hộ khi không có PHT chính. Chưa tự chọn migration/schema.

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
| VP-13 | 01 PHT chuyên môn chính + 01 PHT thường | Chỉ người chính có quyền điều hành chuyên môn toàn trường theo grant; người còn lại mặc định không có |
| VP-14 | PHT thường nhận grant quản lý HĐTN-HN theo ACTIVITY | Chỉ được phép tác động đúng chương trình/scope, không được quản lý TKB/PPCT toàn trường |
| VP-15 | PHT thường nhận quyền chuyên môn bổ sung rồi hết hạn | Sau hạn backend chặn thao tác mới, lịch sử và audit được bảo toàn |
| VP-16 | PHT thường tìm cách tự cấp/chỉnh scope grant hoặc sửa vai trò thành PHT chính | Backend từ chối, audit denial; không thay đổi hiệu lực quyền |
| VP-17 | Chuyển người phụ trách chính sang PHT còn lại | Preview, ghi căn cứ và actor, chuyển grant có kiểm soát; không còn thẩm quyền chính cũ ngoài hiệu lực |
| VP-18 | Hai PHT có grant giao nhau cùng scope | Không cho ghi đè im lặng; kiểm tra conflict/version/effective time và lưu audit |
| VP-19 | Thêm capability cho PHT thường không thay đổi mẫu base | Chỉ cấp quyền cụ thể, không tự nâng thành `VICE_PRINCIPAL_ACADEMIC` hoặc có `CAPABILITY_GRANT` |
| VP-20 | Tương lai tăng số PHT phụ trách theo mảng | Không phải thay engine/schema chỉ để tăng số người; vẫn buộc quyết định phân công và kiểm tra scope |

## 5. Cổng triển khai

- **Đã được PO chốt:** hai loại PHT theo phạm vi; **chỉ PHT chuyên môn** được phân quyền và cấu hình chuyên môn trong giới hạn được xác lập.
- **Đã chốt bổ sung:** hiện tại chỉ **01 PHT chuyên môn chính**, nhưng PHT còn lại có thể được giao thêm quyền chuyên môn **hẹp, theo scope và hiệu lực**, không tự chuyển mẫu vai trò. Không giới hạn cứng số người trong engine.
- **Chưa chốt:** thẩm quyền cấp/thu hồi quyền bổ sung, phạm vi chi tiết, quyền xem PHT thường, quy trình chuyển giao/chữa cháy, thời hạn, xung đột chỉnh sửa và khả năng có nhiều người phụ trách chính trong tương lai.
- WS1 tiếp tục `IN_PROGRESS`; chỉ triển khai code sau khi D2–D6 (đặc biệt D2/D3/D4/D5) được xác nhận và có bộ test + rollback rõ ràng.
- Không thay đổi runtime, schema, migration, VPS, database, PR #263 hoặc dự án Nội trú/Kiểm tra Online trong bước cập nhật quyết định tài liệu này.
