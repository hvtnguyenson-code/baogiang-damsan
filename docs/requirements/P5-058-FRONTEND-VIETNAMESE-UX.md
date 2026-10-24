# P5-058 — Việt hóa toàn diện và đơn giản hóa trải nghiệm frontend

**Trạng thái:** IN_PROGRESS — PR #249 draft; lát cắt 4 luồng giáo viên trên cùng nhánh; chưa nghiệm thu toàn task, chưa merge/deploy.
**Authority:** Yêu cầu người dùng 24/10/2026; T57; P5-050; P5-052; P5-053; `DESIGN.md`.
**Baseline:** `main@6f1e83a8f021db1ab23f9902981a6b32f36d65ab`.
**Nhánh duy nhất:** `feat/p5-058-frontend-vietnamese-ux`.

## Mục tiêu và tiêu chí hoàn thành

Hệ thống phải có tiếng Việt nhất quán, đúng ngữ cảnh quản lý trường phổ thông. Người sử dụng đủ thẩm quyền tìm được nghiệp vụ cần làm bằng tên chức năng, thao tác và nhận biết bước tiếp theo mà không cần biết mã nghiệp vụ, route, UUID hay thuật ngữ dành cho lập trình viên.

Các nhóm persona nghiệm thu: giáo viên, tổ trưởng chuyên môn, phó hiệu trưởng, hiệu trưởng, quản trị viên, điều phối GDĐP và HĐTN-HN. Không dùng tài khoản/chức vụ để suy đoán quyền; mọi capability/scope được giữ nguyên.

## Phạm vi kiểm kê

Kiểm kê mã tại `apps/web/src/pages` (**35 tệp TSX**), thanh điều hướng `apps/web/src/lib/navigation-registry.ts` (**26 mục điều hướng tại baseline**), các thành phần `apps/web/src/components/ui`, lớp giao tiếp `apps/web/src/lib/api-client.ts` và các bảng trạng thái/nhãn theo nghiệp vụ.

Nhóm công việc:
1. **Đăng nhập & công việc cá nhân:** Login, FirstPasswordChange, Home, Profile, lịch dạy và các chức năng báo cáo cá nhân.
2. **Dữ liệu năm học:** AcademicYears, AcademicCalendar, Catalog, SchoolClasses, TeachingAssignments, HomeroomAssignments, TimetableAdmin, DataReadiness, PpctImport, PpctSpecializedStudy.
3. **Điều hành giảng dạy:** TeachingOperations, EffectiveSchedule, MakeupScheduling, HistoricalTeaching, SpecialProgramme, TemporalAssignments, DutyAssignments/Catalog.
4. **Báo cáo & phê duyệt:** ReportingStatements, ReportingStatementDetail, PendingReportingStatements, AccessibleReportingStatements, ReportingPresentation và các bảng tổng hợp.
5. **Quản trị:** Users, Capabilities, BusinessConfiguration, Audit, SystemStatus, AccessDenied, NotFound và thành phần dùng chung.

Danh sách file cụ thể phải được sinh/đối soát từ cây thực tế, không dùng danh sách mô tả này thay bằng chứng đã review từng trang.

## Từ điển hiển thị bắt buộc

| Mã kỹ thuật hoặc cách gọi cũ | Tiếng Việt dành cho người sử dụng | Lưu ý |
| --- | --- | --- |
| READY | Sẵn sàng | Chỉ khi backend kết luận đủ chứng cứ |
| NOT_ASSESSED | Chưa đủ dữ liệu để đánh giá | Không đồng nghĩa đã sẵn sàng |
| ATTENTION_REQUIRED | Cần kiểm tra, xử lý | Giữ nguyên mức cảnh báo thật |
| NO_DATA | Chưa có dữ liệu | Không phải lỗi hệ thống |
| DRAFT | Bản nháp | Không đồng nghĩa đã ban hành |
| VALIDATED | Đã kiểm tra hợp lệ | Không đồng nghĩa đã phê duyệt |
| APPROVED | Đã phê duyệt | Không đồng nghĩa đang áp dụng |
| PUBLISHED | Đã ban hành | Không tự đổi trạng thái |
| ACTIVE | Đang áp dụng | Khi đúng ngữ cảnh nghiệp vụ |
| SUPERSEDED | Đã được thay thế | Dữ liệu lịch sử vẫn được giữ |
| Import Profile | Mẫu nhận diện tệp nhập | Chỉ hiển thị tiếng Việt |
| Metadata | Thông tin kỹ thuật | Ẩn bớt với người dùng thường |
| Request ID | Mã tra cứu lỗi | Chỉ khi có ích cho hỗ trợ |
| Conflict / CAS mismatch | Dữ liệu đã thay đổi. Hãy tải lại trước khi lưu. | Không tự động ghi đè |
| Forbidden / 403 | Tài khoản chưa được cấp quyền thực hiện thao tác này. | Không làm mất thông tin quyền |
| Unauthorized / 401 | Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại. | Không tự lặp thao tác |
| TKB | Thời khóa biểu (TKB) | Viết đầy đủ lần đầu |
| PPCT | Phân phối chương trình (PPCT) | Viết đầy đủ lần đầu |
| GDĐP | Giáo dục địa phương (GDĐP) | Viết đầy đủ lần đầu |
| HĐTN-HN | Hoạt động trải nghiệm, hướng nghiệp (HĐTN-HN) | Viết đầy đủ lần đầu |

Nguyên tắc dùng từ: một hành động chỉ có một nhãn chuẩn; phân biệt **Lưu bản nháp**, **Gửi duyệt**, **Phê duyệt**, **Ban hành**, **Áp dụng** và **Xóa**. Không dịch mã lưu trữ, event name, API key, URL/route, test key hoặc trạng thái kỹ thuật trong hợp đồng backend.

## Phân kỳ trên cùng một task

**A. Audit và đặc tả** — kiểm kê từng trang, tổ hợp vai trò, nhãn chưa chuẩn, lỗi hiển thị raw enum, thiếu CTA, mâu thuẫn wording; tạo mapping và thứ tự sửa. Bằng chứng: đường dẫn/file, vị trí, hiện trạng, đề xuất, mức độ, test.

**B. Thành phần chung & điều hướng** — chuẩn hóa thông báo tải/chờ/lỗi/không có dữ liệu; nhãn dùng chung; đường dẫn từ Trung tâm sẵn sàng dữ liệu trực tiếp tới tab `Nhập TKB Đam San` qua query `?tab=import`, nhưng route vẫn yêu cầu `TIMETABLE_MANAGE`. Việc không có quyền phải xử lý như cũ. Test chuyển tab, F5, back, quyền và mục rỗng.

**C. Từng nhóm giao diện** — ưu tiên BGH & dữ liệu năm học, sau đó giáo viên, tổ trưởng, báo cáo và quản trị. Bản dịch phải sát nghiệp vụ; không thay logic.

**D. Nghiệm thu toàn bộ** — xác minh tất cả 35 trang, 26 mục điều hướng và thành phần chung; screenshot desktop 1366×768, Android 320/375/414, keyboard/focus, 401/403/404/409/500, empty/loading/retry, quyền tác vụ theo persona. Chạy typecheck, ESLint, unit, tích hợp, E2E/smoke liên quan; CI exact-head xanh; independent review trước merge.

## Ràng buộc không thay đổi

Không sửa database, migration, API, auth/RBAC, định tuyến canonical, ledger, workflow phê duyệt, cơ chế nhập dữ liệu, môi trường VPS, nội trú, deployment hoặc thiết kế màu/font vượt `DESIGN.md`. Không dùng thông báo giả, metrics giả, dữ liệu mẫu trong production; không che lỗi nguy hiểm bằng nhãn thành công. Không đổi tiếng Việt trong giao diện bằng thay thế chuỗi tự động thiếu ngữ cảnh.

## Trạng thái thực thi

P5-058 giữ nguyên `IN_PROGRESS` trên nhánh duy nhất đã đăng ký theo chỉ thị người dùng. Dependencies `P5-050`, `P5-052`, `P5-053` đều `CLOSED`; traceability T57, giữ nguyên T51/T52. Lát cắt đầu tiên chỉ sửa frontend và kiểm thử giao diện:

- `ErrorFeedback` dùng lại trong `QueryFailure`, `MutationNotice` và Data Readiness; chỉ dựa vào HTTP status trong `ApiError`, không in message/serverError/requestId thô. 401 dẫn về đăng nhập, 403 về trang công việc, 404/409 có thao tác tải lại rõ ràng; không tự gửi lại mutation, không suy quyền/trạng thái thành công từ nội dung phản hồi. Tải lại toàn trang có thể bỏ dữ liệu biểu mẫu chưa lưu; người dùng chủ động chọn thao tác.
- TKB giữ lỗi dạng đối tượng để bảo toàn 401/403/409 qua các mutation. EmptyState hỗ trợ hành động thật; danh sách phiên bản rỗng có nút vào luồng nhập hiện hữu.
- CTA TKB của Data Readiness mở `/quan-tri/thoi-khoa-bieu?tab=import`. Tab đọc/ghi query và giữ query khác, hỗ trợ F5/Back; không có query hoặc tab lạ vẫn mở phiên bản. Route guard `TIMETABLE_MANAGE / SCHOOL_WIDE` không đổi; BGH không có grant này vẫn bị từ chối.

### Công việc tiếp theo trong P5-058 đang IN_PROGRESS

Tiếp tục phân kỳ A/C/D trên cùng nhánh trước nghiệm thu toàn bộ: lập bảng audit từng trang và điều hướng; áp dụng từ điển theo nghiệp vụ; kiểm tra mọi persona và trạng thái tải/rỗng/lỗi. Không coi thành phần dùng chung là bằng chứng đã Việt hóa 35 trang. Ảnh mock của lát cắt này cho thấy tab TKB hiện hữu còn sít nhau, nhãn biểu mẫu còn thuật ngữ Anh (Native Workbook, Session Mode, Effective Week, Inspect/Preview); đây là đầu vào audit C, chưa phải nghiệm thu tiếng Việt toàn bộ. Không thay thiết kế, parser hoặc quyền để giải quyết các nhãn này.

Nghiệm thu còn phải có đầy đủ bằng chứng desktop/Android, tích hợp/E2E liên quan, CI exact-head và independent review. Không được tự nhận hoàn thành P5-058; trạng thái `CLOSED` chỉ được chốt sau merge, main CI, nghiệm thu triển khai và `SYNC-P5-058` theo quy định. Báo cáo lát cắt: `docs/phase-reports/P5-058-FIRST-SLICE-REPORT.md`.


### Cập nhật lát cắt dữ liệu/nhập liệu — 24/10/2026

Audit chi tiết và các nhãn đã sửa của TimetableAdmin/PpctImport/DataReadiness nằm trong phần Lát cắt 2 của báo cáo P5-058. Dùng “tệp Excel”, “trang tính”, “bản nháp”, “chương trình chính khóa”, “chế độ buổi áp dụng”, “tuần học bắt đầu áp dụng”, “kiểm tra tệp”, “xem trước đối soát”, “mã chống nhập trùng”; giải thích bản xem trước thay cho fingerprint trong hướng dẫn. Giữ nguyên tên mẫu PPCT_V1/trang THONG_TIN và mọi mã/payload. Readiness không khẳng định mọi importer kiểm tra phòng học hay findings rỗng đồng nghĩa sẵn sàng. Scope này không xử lý state/hook hoặc correction P5-055.

Tại lát cắt 2: giữ IN_PROGRESS, PR draft; chưa nghiệm thu 32 module còn lại, navigation và mọi persona. CI #40052855139 từng bị chặn tại audit dependency production body-parser/multer (2 high); đây là bằng chứng lịch sử, được cập nhật bên dưới.

### Cập nhật lát cắt 3 — Báo cáo, bàn làm việc và điều hướng

Canonical main đọc trực tiếp remote là `ea80f078c8a1297c562c8f4319540e3417d6e651`; HEAD bắt đầu `8968d50909cc03ca677fe5416dce96bdc517dd0d`, PR #249 draft. CI cho HEAD này `40068828206` SUCCESS; security PR #250 đã tích hợp qua main trước phiên này. Không sửa dependencies hoặc gate trong P5-058; CI baseline xanh không phải CI cho working tree mới.

Inventory trước sửa tại `docs/phase-reports/P5-058-PAGE-LABEL-AUDIT.md` ghi 35 module, từng mức review, từng nhãn cần sửa và ranh giới. Đã đọc thêm 7 module: ReportingStatements, ReportingStatementDetail, PendingReportingStatements, AccessibleReportingStatements, Home, Catalog, TemporalAssignments. Chỉ 5 module cần sửa trực tiếp; Catalog/Accessible không sửa để tăng số lượng. Registry thực tế có **25 mục** thay vì mô tả baseline 26; đã đối chiếu từng route/nhãn/predicate từ mã, giữ nguyên mọi quyền/route.

Reporting dùng feedback HTTP an toàn cho preview/submit/decision; mapping finding từ code public đã xác minh, không in message/code máy chủ. 409 submit vẫn phải xem trước lại; thông báo nằm ngoài preview để không mất khi preview bị xóa. Retry chưa rõ kết quả giữ nguyên requestKey/token và chỉ chạy khi người dùng chọn. Khối lượng/định mức null hiện “Chưa xác định”, zero thật vẫn là 0, không tính lại số liệu hoặc thay trạng thái backend. Hai nhãn khối lượng dùng token tương phản hiện hữu sau khi axe phát hiện màu cũ không đạt. Phân công tổ/môn không dùng UUID thay tên thiếu; hint điều hướng mô tả đúng chức năng đang có.

Còn 25 module cần audit nhãn đầy đủ (EffectiveSchedule mới đọc khảo sát), cộng kiểm chứng nội dung động/biểu mẫu/ảnh và persona toàn sản phẩm. Chưa có nghiệm thu Android thật, dữ liệu báo cáo thật hoặc CI cho thay đổi mới; giữ A/C/D đang mở trong P5-058, không đóng task. Kết quả kiểm tra và giới hạn commit/push ghi trong phần Lát cắt 3 của báo cáo.

Checkpoint lát cắt 3 chưa commit/push: local `.git` chỉ đọc; connector GitHub từ chối create_tree vì yêu cầu approval trong môi trường policy `never`. Nội dung đã kiểm tra vẫn ở working tree, remote PR HEAD không thay đổi; không được gọi là đã xuất bản hoặc đã được CI/review độc lập.


### P5-058 — Cập nhật lát cắt 4 (24/10/2026)

Tiếp tục trên `feat/p5-058-frontend-vietnamese-ux`, PR #249 DRAFT, HEAD bắt đầu `8ae0e9ebed0c1a880a0023d804008b2f36f7d6d0`; main xác minh trực tiếp `ea80f078c8a1297c562c8f4319540e3417d6e651`; GitHub CI baseline #832 (`40079434301`) SUCCESS. Lát cắt 3 đã có trên baseline này; đoạn ghi “chưa commit/push” trước đây chỉ là lịch sử phiên trước.

Lát cắt 4 đã đọc toàn file EffectiveSchedule, TeachingOperations, MakeupScheduling, HistoricalTeaching và Profile; xử lý lỗi HTTP, nhãn enum/finding lịch sử, UUID thay tên, Telegram UNKNOWN/FAILED, và phân biệt tải/lỗi/rỗng của lịch dạy bù. Không đổi route/API/payload/auth/RBAC/read model hoặc trạng thái nghiệp vụ. Bổ sung unit và Playwright; phạm vi từng đường đã review và còn mở ghi tại `docs/phase-reports/P5-058-PAGE-LABEL-AUDIT.md`, kết quả kiểm tra/trạng thái xuất bản tại `docs/phase-reports/P5-058-SLICE-4-REPORT.md`.

Giữ P5-058 IN_PROGRESS: 20 module còn cần audit toàn file, năm trang mới vẫn cần nghiệm thu dữ liệu động/persona đã liệt kê. Không chuyển task sang IN_REVIEW vì đây là checkpoint một phần trên PR draft; chưa đủ A/C/D, CI cho thay đổi mới hoặc independent review. Chưa merge/deploy/đóng task; không thay authority baseline/ADR hoặc claim nghiệp vụ của T51/T52.
