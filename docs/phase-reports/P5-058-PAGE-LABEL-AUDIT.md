# P5-058 — Kiểm kê trang và nhãn, lát cắt 3–4

Ngày 24/10/2026. Lập trước sửa mã; baseline nhánh `8968d50909cc03ca677fe5416dce96bdc517dd0d`, main xác minh remote `ea80f078c8a1297c562c8f4319540e3417d6e651`. T57, dependencies P5-050/P5-052/P5-053 CLOSED. Chỉ copy/presentation/test/docs; không API, route, quyền, trạng thái backend, phép tính, workflow, dependencies, DESIGN.md hoặc VPS. P5-058 vẫn IN_PROGRESS.

## Danh mục đối chiếu cây thực tế

35 module TSX trực tiếp trong `apps/web/src/pages`. “Đã đọc” chỉ chứng minh đọc mã trong lát cắt này, không phải nghiệm thu persona/runtime. Mọi mục chưa nghiệm thu vẫn thuộc A/C/D của P5-058; không phải deferral ra ngoài task.

| Module | Mức review trong phiên này | Phạm vi xử lý |
| --- | --- | --- |
| AccessibleReportingStatementsPage | Đã đọc toàn file | Nhãn danh sách, tải/rỗng/lỗi, bảng dùng chung |
| PendingReportingStatementsPage | Đã đọc toàn file | Hàng đợi duyệt, tải/rỗng/lỗi, bảng dùng chung |
| ReportingStatementsPage | Đã đọc toàn file | Preview/submit, lỗi HTTP, finding |
| ReportingStatementDetailPage | Đã đọc toàn file | Quyết định, lịch sử, lỗi và finding |
| HomePage | Đã đọc toàn file | Hướng dẫn lịch dạy và báo cáo, điều hướng dùng chung |
| CatalogPage | Đã đọc toàn file | Hai biến thể tổ chuyên môn/môn học; không phát hiện tiếng Anh tĩnh cần dịch |
| TemporalAssignmentsPage | Đã đọc toàn file | Hai biến thể phân công tổ/môn; nhãn thiếu tên và hướng dẫn hiệu lực |
| EffectiveSchedulePage | Lát cắt 4: đã đọc toàn file | HTTP, lý do chặn, chờ/rỗng và lưới di động; giới hạn chi tiết bên dưới |
| TimetableAdminPage | Bằng chứng lát cắt 2 | Không review lại toàn trang |
| PpctImportPage | Bằng chứng lát cắt 2 | Không review lại toàn trang |
| DataReadinessPage | Bằng chứng lát cắt 2 | Không review lại toàn trang |
| AcademicCalendarPage | Chỉ xác nhận có file | Chưa audit nhãn |
| AcademicYearsPage | Chỉ xác nhận có file | Chưa audit nhãn |
| AccessDeniedPage | Chỉ xác nhận có file | Chưa audit nhãn |
| AuditPage | Chỉ xác nhận có file | Chưa audit nhãn |
| BusinessConfigurationPage | Chỉ xác nhận có file | Chưa audit nhãn |
| CapabilitiesPage | Chỉ xác nhận có file | Chưa audit nhãn |
| DispositionPreviewPanel | Chỉ xác nhận có file | Chưa audit nhãn |
| DutyAssignmentsPage | Chỉ xác nhận có file | Chưa audit nhãn |
| DutyCatalogPage | Chỉ xác nhận có file | Chưa audit nhãn |
| FirstPasswordChangePage | Chỉ xác nhận có file | Chưa audit nhãn |
| HistoricalTeachingPage | Lát cắt 4: đã đọc toàn file | Đã sửa các đường hiển thị rủi ro; phạm vi đã kiểm chứng/chưa nghiệm thu bên dưới |
| HomeroomAssignmentsPage | Chỉ xác nhận có file | Chưa audit nhãn |
| LoginPage | Chỉ xác nhận có file | Chưa audit nhãn |
| MakeupSchedulingPage | Lát cắt 4: đã đọc toàn file | Đã sửa các đường hiển thị rủi ro; phạm vi đã kiểm chứng/chưa nghiệm thu bên dưới |
| NotFoundPage | Chỉ xác nhận có file | Chưa audit nhãn |
| OperationalHistoryPanel | Chỉ xác nhận có file | Chưa audit nhãn |
| PpctSpecializedStudyPage | Chỉ xác nhận có file | Chưa audit nhãn |
| ProfilePage | Lát cắt 4: đã đọc toàn file | Đã sửa các đường hiển thị rủi ro; phạm vi đã kiểm chứng/chưa nghiệm thu bên dưới |
| SchoolClassesPage | Chỉ xác nhận có file | Chưa audit nhãn |
| SpecialProgrammeWorkspacePage | Chỉ xác nhận có file | Chưa audit nhãn |
| SystemStatusPage | Chỉ xác nhận có file | Chưa audit nhãn |
| TeachingAssignmentsPage | Chỉ xác nhận có file | Chưa audit nhãn |
| TeachingOperationsPage | Lát cắt 4: đã đọc toàn file | Đã sửa các đường hiển thị rủi ro; phạm vi đã kiểm chứng/chưa nghiệm thu bên dưới |
| UsersPage | Chỉ xác nhận có file | Chưa audit nhãn |

## Nhãn và đường hiển thị đã đọc trước sửa

P1 = có thể lộ nội bộ/hiểu nhầm kết quả; P2 = ngôn ngữ/khả năng tìm chức năng. Vị trí theo tên component/biểu thức để không phụ thuộc số dòng sau sửa.

| File / vị trí | Hiện trạng | Quyết định trong lát cắt | Mức / kiểm chứng cần có |
| --- | --- | --- | --- |
| ReportingStatementsPage / previewMutation.error, submitMutation.error | In ApiError.message | Dùng ErrorFeedback HTTP; giữ retry cùng requestKey, 409 buộc xem trước lại | P1; 401/403/409/500, single POST |
| ReportingStatementDetailPage / commandUncertain | In message máy chủ khi 5xx | Thông báo Việt an toàn; giữ retry cùng command/token và xác nhận quyết định | P1; 5xx retry, 409 refetch |
| ReportingStatementsPage + Detail / finding.message | Có thể in mã/English từ server | Mapping 9 code public theo contract và presenter đã đọc, fallback cảnh báo trung tính; không đổi BLOCKED/eligible | P1; known/unknown/malicious message |
| ReportingPresentation / workload.findings | In message có UUID/policy enum từ nguồn workload | Mapping các code đã xác minh; code khác cảnh báo trung tính, không suy readiness | P1; raw-code suppression |
| ReportingPresentation / null credits | Null được hiển thị 0 tiết | Hiện “Chưa xác định”; giữ 0 thật và mọi phép tính backend | P1; null vs zero |
| ReportingPresentation / lifecycle/classification/fulfillment | Nhãn Việt; enum lạ có thể thành ô trống | Lookup an toàn với nhãn chưa xác định, không in mã hoặc suy thành công | P1; unknown enum |
| ReportingPresentation / counts | “Nghĩa vụ còn mở”, “Khoảng trống chưa xác nhận” | “Tiết còn phải hoàn thành”, “Tiết chưa đủ bằng chứng xác nhận”; giữ con số | P2; unit labels |
| ReportingStatementsPage / heading intro | “Xem trước sự thật báo cáo” | “Xem trước số liệu và bằng chứng giảng dạy…” | P2; UI |
| PendingReportingStatementsPage / empty | “phù hợp để tài khoản này quyết định” | “trong phạm vi bạn được phép phê duyệt”; không suy toàn trường đã duyệt hết | P2; empty/loading |
| AccessibleReportingStatementsPage | Copy tĩnh đã Việt; QueryFailure an toàn | Giữ nguyên; kiểm chứng đường dùng chung | P2; list/403/empty |
| HomePage / schedule description | Hứa tiến độ tuần dù route là lịch hiệu lực | Chỉ mô tả lịch cá nhân/toàn trường/đồng nghiệp; không thêm tính năng | P2; home/navigation |
| TemporalAssignmentsPage / missing lookup | UUID hiện thay tên; “Mã kỹ thuật không tra cứu được” | Nhãn thiếu tên người/tổ/môn, không in UUID thay cho tên | P1; regression phân công |
| CatalogPage / toàn bộ nhãn tĩnh | Đã Việt, CRUD/lifecycle phân biệt đúng | Không sửa chỉ để tăng số trang | P2; regression sẵn có |

## Điều hướng

Đã đọc toàn bộ `navigation-registry.ts`: **25 mục thực tế**, khác mô tả baseline 26 (đếm `to` trong NAVIGATION_REGISTRY, không tính các liên kết hồ sơ/hệ thống nằm ngoài registry). Giữ mọi `to`, predicate, familyId, exactEnd, isMatchActive. Chỉ làm rõ nhãn/hint: phân công tổ/môn; phân phối chương trình; chương trình đặc thù; quyền/nhật ký; thay ký hiệu & bằng “và” trong tiêu đề. Mỗi mục còn lại đã là tiếng Việt; không có raw enum trong nhãn tĩnh. Bằng chứng required: test route/predicate hiện hữu và nhãn mới. Không đồng nghĩa đã review các trang đích.

| Route registry | Nhãn sau audit | Quyết định copy |
| --- | --- | --- |
| /lich-day | Lịch dạy | Bỏ lời hứa tiến độ khỏi hint |
| /bao-cao-ke-khai | Báo cáo kê khai | Hint thống nhất “gửi”, giữ nhãn |
| /quan-tri/san-sang-du-lieu | Trung tâm sẵn sàng dữ liệu | Giữ |
| /quan-tri/cau-truc-nam-hoc | Cấu trúc năm học | Giữ |
| /quan-tri/thoi-khoa-bieu | Thời khóa biểu và khung tiết | Thay & bằng và |
| /quan-tri/to-chuyen-mon | Tổ chuyên môn | Giữ |
| /quan-tri/mon-hoc | Môn học | Giữ |
| /quan-tri/phan-cong-to | Phân công tổ chuyên môn | Viết rõ đối tượng |
| /quan-tri/phan-cong-mon | Phân công môn học | Viết rõ đối tượng |
| /quan-tri/phan-cong-giang-day | Phân công giảng dạy | Giữ, không gộp với phân công môn |
| /quan-tri/phan-cong-chu-nhiem | Phân công chủ nhiệm | Giữ |
| /quan-tri/kiem-nhiem/danh-muc | Danh mục kiêm nhiệm | Giữ |
| /quan-tri/kiem-nhiem/phan-cong | Phân công kiêm nhiệm | Giữ |
| /quan-tri/ppct/nhap | Nhập phân phối chương trình (PPCT) | Viết đầy đủ |
| /quan-tri/ppct/ap-dung-chuyen-de | Áp dụng chuyên đề | Giữ |
| /quan-tri/dieu-hanh-chuyen-mon | Điều hành chuyên môn | Giữ |
| /quan-tri/lich-day-bu | Lịch dạy bù | Giữ |
| /quan-tri/lich-su-giang-day | Nạp lịch sử giảng dạy | Giữ |
| /quan-tri/chuong-trinh-dac-thu | Hoạt động trải nghiệm và giáo dục địa phương | Viết đầy đủ, hint giải thích HĐTN-HN/GDĐP |
| /bao-cao-ke-khai/duoc-xem | Báo cáo được phép xem | Giữ |
| /phe-duyet-bao-cao | Phê duyệt báo cáo | Giữ |
| /quan-tri/nguoi-dung | Người dùng | Giữ nhãn/hint |
| /quan-tri/quyen | Cấp quyền | Hint theo phạm vi công việc |
| /quan-tri/chinh-sach-nghiep-vu | Chính sách nghiệp vụ | Giữ |
| /quan-tri/nhat-ky | Nhật ký | Hint “lịch sử thao tác và người thực hiện” |

Wireframe giữ nguyên: desktop tiêu đề → chọn phạm vi → xem trước/bằng chứng → thao tác → danh sách; chi tiết: nhận diện → số liệu → bằng chứng → lịch sử → xác nhận. Mobile một cột, bảng có cuộn nội bộ. Chỉ thay chữ, giữ token/primitive/style. Ảnh mock, keyboard, reduced-motion, axe và viewport ghi kết quả thực tế trong báo cáo phiên.

Phát hiện khi chạy axe: hai nhãn khối lượng dùng fallback màu cũ `#6b7280`, tương phản 4,41:1 trên nền đang dùng; đã chuyển sang `--ink-muted-on-canvas` và viền `--border-card` có sẵn. Không sửa token hay DESIGN.md. Giá trị “Chưa xác định” dùng font sản phẩm để đọc tiếng Việt. Cần nghiệm thu thêm bảng báo cáo dày dữ liệu, ảnh ở 200% zoom và Android thật; ảnh mock ít dòng không chứng minh các trường hợp đó.


## Lát cắt 4 — Luồng công việc hằng ngày của giáo viên

Baseline nhánh `8ae0e9ebed0c1a880a0023d804008b2f36f7d6d0`, main đọc bằng `git ls-remote` và đối chiếu GitHub PR #249: `ea80f078c8a1297c562c8f4319540e3417d6e651`. CI baseline #832 (run `40079434301`) SUCCESS. `git fetch` không ghi được `.git/FETCH_HEAD`; không dùng remote-tracking cũ làm chứng cứ duy nhất. P5-058/T57 vẫn IN_PROGRESS; dependencies P5-050/P5-052/P5-053 CLOSED, giữ nguyên T51/T52. Không thay sản phẩm của P5-054 hoặc khẳng định các workflow điều hành đã hoàn tất.

Đã đọc toàn bộ năm file dưới đây. “Đã đọc” và kiểm thử mock không phải nghiệm thu mọi nội dung động/persona/dữ liệu thật. Các mục còn mở tiếp tục nằm trong A/C/D của P5-058, không chuyển ra task khác.

| Trang / vị trí | Đã review và sửa | Bằng chứng trực tiếp | Còn phải kiểm chứng trong P5-058 |
| --- | --- | --- | --- |
| EffectiveSchedule / context, weekly, school-wide, peer, compare catch; blockedReasons | Giữ ApiError theo HTTP; không in message máy chủ; lý do chặn chỉ nhận các câu đã xác minh trong effective-schedule-policy, fallback yêu cầu kiểm tra nguồn; BLOCKED trong ô tuần không hiện là trống | Unit 401/403/409; bộ test lịch hiện hữu bao phủ bốn chế độ; Playwright 401 redirect, 403/409, BLOCKED và không rò nội bộ | Toàn bộ dữ liệu có tiết thật, so sánh có xung đột và lịch toàn trường đông giáo viên cần nghiệm thu ảnh/persona; sourceLabel/comparisonLabel hiện do policy backend sinh tiếng Việt, không viết lại read model |
| EffectiveSchedule / bộ chọn, tải context, tìm giáo viên, tuần rỗng | Hiển thị chờ context/tìm giáo viên, phân biệt lỗi tìm kiếm và không tìm thấy; tuần rỗng hướng dẫn liên hệ phụ trách; lưới co về chiều rộng khả dụng, nhóm nút đồng nghiệp xuống dòng | Playwright pending→tuần rỗng, không có đồng nghiệp, Tab/focus, 320/375/414/1366/1440 không overflow | Không coi thiếu tuần hoặc BLOCKED là sẵn sàng; ảnh lịch dày và 200% zoom còn phải nghiệm thu |
| TeachingOperations / context, nguồn tiết, liên kết dạy bù | Giữ lỗi HTTP thay thông báo chung; diễn giải PPCT trong đoạn giải thích; liên kết “Quản lý lịch dạy bù”; enum loại tiết lạ có nhãn chưa xác định | Unit HTTP 401/403/409; test hồi quy nguồn, scope và preview hiện hữu; ảnh trang chọn nguồn | Đã đối chiếu reason của workspace service là câu Việt cố định; chưa chuẩn hóa riêng DispositionPreviewPanel và OperationalHistoryPanel, chưa nghiệm thu mọi reason/collision/history reversal qua trình duyệt; hai module này vẫn còn audit trong P5-058 |
| Makeup / mọi catch, candidate BLOCKED, danh sách thiếu tên, lập/thay thế lịch | Không in serverError/message, enum nợ tiết hay ROOT_BLOCKED có UUID; giữ số finding và BLOCKED; dùng tên có trong response hiện hữu hoặc nói rõ chưa có tên; không thay quyền, khóa nguồn hay payload; nhãn tiết dạy bù cụ thể | Test hồi quy canonical occurrence/payload/scope/CAS/reload, assertions không rò mã; Playwright BLOCKED/empty và ảnh responsive | Read model lịch không có tên giáo viên dạy bù khi không có trong options/candidates: hiện “Chưa có tên giáo viên”; không suy từ giáo viên gốc. Phải nghiệm thu danh sách có dữ liệu và tạo/thay thế/hoàn tác trên trình duyệt. Ghi chú mặc định luồng thay thế vẫn chứa mã lịch như baseline để giữ nguyên nội dung payload; đường hiển thị này còn mở trong P5-058 |
| Makeup / tải danh sách lịch | Không hiện “Chưa có lịch” trong lúc đang tải hoặc tải lỗi; chỉ báo tải danh sách riêng ngăn init-year finally tắt sớm trạng thái chờ | Unit giữ promise lịch pending rồi 403; hồi quy request đến sai thứ tự và candidate/schedule độc lập | Chưa thay cơ chế loading/busy điều khiển mutation; chỉ sửa phản hồi hiển thị |
| Historical / catch, preview issue, sourceSession, ppct.component, findings và reverse copy | HTTP an toàn; mapping code đã đọc trong parser/service, giữ severity, số dòng, canConfirm; buổi và thành phần chương trình bằng tiếng Việt; “Hoàn tác để sửa”, bỏ lineage trong hướng dẫn; giữ header CSV và literal mẫu nhập | Unit preview có lỗi server cố ý, buổi/chương trình; confirm 409 chỉ một POST với sourceText/batchRef/fingerprint/requestKey nguyên dạng; ảnh biểu mẫu | Các code chưa có mapping dùng câu trung tính kèm vị trí dòng, không in message; phải rà nốt toàn bộ code validator/allocator để có hướng sửa riêng từng lỗi. Chưa có E2E xác nhận/hoàn tác thành công hoặc đối soát nhiều dòng; giữ toàn bộ trong A/C/D |
| Profile / Telegram query, 3 mutation, testResult, quyền/phạm vi | HTTP an toàn; UNKNOWN/FAILED không in trạng thái kỹ thuật hoặc provider error, không báo gửi thành công; quyền lạ có nhãn chưa có tên; không dùng resourceId làm mô tả công việc | Unit gửi/nhận lỗi và requestKey retry/unlink/relink; Playwright 409 POST đơn và payload; ảnh năm viewport | Luồng Telegram thật và quyền gắn tài nguyên có tên chưa được nghiệm thu. Chỉ dùng nhãn phạm vi được phân công khi thiếu read model tên tài nguyên; không tự gọi API mới hoặc suy quyền |

Helper dùng có chọn lọc: `components/ui/workflow-error.tsx` chỉ nhận lỗi transport hoặc chuỗi validation cục bộ; `lib/teaching-workflow-presentation.ts` giữ mapping buổi/chương trình, lý do lịch và code lịch sử. Fallback giữ nghĩa chưa xác định; tra cứu không nhận thuộc tính prototype. Nút tải lại là thao tác chủ động, có thể bỏ biểu mẫu chưa lưu như ErrorFeedback hiện hữu; không tự retry mutation.

Ảnh mock nằm trong `tests/e2e/test-results/p5-058-slice4` (không commit artifact sinh). Đã kiểm tra trực quan lịch 320, dạy bù 1366, lịch sử 375, hồ sơ 1440: chữ Việt rõ và không tràn trang; tiêu đề/trạng thái lịch ở 320 còn sít khi tên dài, chưa coi là nghiệm thu mật độ lịch thật. Axe kiểm tra cả năm trang ở 1440 không có serious/critical; chưa phải bằng chứng axe cho mọi trạng thái hoặc Android thật. Reduced motion được bật, test Tab/focus tại bộ chọn đồng nghiệp.

Sau lát cắt này: **15/35 module có bằng chứng đọc/audit theo các lát cắt**, **20 module còn cần audit nhãn toàn file**; năm module mới vẫn có các đường động cần nghiệm thu như bảng trên. Không suy ra tỷ lệ hoàn thành sản phẩm. Danh mục 25 mục điều hướng đã được đối chiếu ở lát cắt 3, không có route/registry/auth/API/schema/backend/CI/CD/VPS/nội trú thay đổi.
