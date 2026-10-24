# P5-058 — Kiểm kê trang và nhãn, lát cắt 3

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
| EffectiveSchedulePage | Đọc khảo sát, chưa audit toàn file | Phát hiện err.message, blockedReasons và nhãn động; chưa sửa trong lát cắt này |
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
| HistoricalTeachingPage | Chỉ xác nhận có file | Chưa audit nhãn |
| HomeroomAssignmentsPage | Chỉ xác nhận có file | Chưa audit nhãn |
| LoginPage | Chỉ xác nhận có file | Chưa audit nhãn |
| MakeupSchedulingPage | Chỉ xác nhận có file | Chưa audit nhãn |
| NotFoundPage | Chỉ xác nhận có file | Chưa audit nhãn |
| OperationalHistoryPanel | Chỉ xác nhận có file | Chưa audit nhãn |
| PpctSpecializedStudyPage | Chỉ xác nhận có file | Chưa audit nhãn |
| ProfilePage | Chỉ xác nhận có file | Chưa audit nhãn |
| SchoolClassesPage | Chỉ xác nhận có file | Chưa audit nhãn |
| SpecialProgrammeWorkspacePage | Chỉ xác nhận có file | Chưa audit nhãn |
| SystemStatusPage | Chỉ xác nhận có file | Chưa audit nhãn |
| TeachingAssignmentsPage | Chỉ xác nhận có file | Chưa audit nhãn |
| TeachingOperationsPage | Chỉ xác nhận có file | Chưa audit nhãn |
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
