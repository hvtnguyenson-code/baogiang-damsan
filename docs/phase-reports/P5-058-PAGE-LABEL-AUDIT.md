# P5-058 — Kiểm kê trang và nhãn, lát cắt 3–7

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
| AcademicCalendarPage | Lát cắt 5: đã đọc toàn file | Danh sách/chi tiết/sao chép/tạo/kích hoạt lịch; form học kỳ/tuần/khoảng/gián đoạn và lỗi 400; giới hạn nghiệm thu bên dưới |
| AcademicYearsPage | Lát cắt 5: đã đọc toàn file | Danh sách/tạo/sửa năm học, sparse patch, chuẩn hóa mã, tải/rỗng/lỗi và mở lịch; giới hạn nghiệm thu bên dưới |
| AccessDeniedPage | Lát cắt 7: đã đọc toàn file | Hướng dẫn từ chối quyền và hai liên kết phục hồi; bỏ khẳng định phiên còn hiệu lực khi chưa có chứng cứ |
| AuditPage | Lát cắt 6: đã đọc toàn file | Bộ lọc/thời gian/phân trang, tải/rỗng/lỗi, kết quả/action và metadata được máy chủ lọc; giữ nguyên mã/filter và bằng chứng nhật ký |
| BusinessConfigurationPage | Lát cắt 6: đã đọc toàn file | Bảy luồng mutation, adapter/version/allowedActions, danh sách/chi tiết/truy vết, tra cứu và mọi outcome; HTTP an toàn, nhãn tiếng Việt; không thay hợp đồng hoặc lifecycle |
| CapabilitiesPage | Lát cắt 6: đã đọc toàn file | Năm truy vấn phân trang, retention danh mục, cấp/thu hồi và lịch sử; nhãn phạm vi, chưa tới hiệu lực/hết hạn/thu hồi, tải/rỗng/lỗi; giữ payload/predicate/xác nhận |
| DispositionPreviewPanel | Lát cắt 7: đã đọc toàn file | Nguồn/phương án/giáo viên, preview PASS/BLOCKED; HTTP, reason hữu hạn, loading/rỗng; giữ request/payload |
| DutyAssignmentsPage | Lát cắt 7: đã đọc toàn file | Lọc/tạo/sửa/kết thúc, lookup tải/lỗi/thiếu tên, future khác hết hiệu lực; giữ quyền/DTO |
| DutyCatalogPage | Lát cắt 7: đã đọc toàn file | Danh mục/lọc/tạo/sửa/vô hiệu hóa, nhãn trạng thái; giữ sparse patch/xác nhận/lịch sử |
| FirstPasswordChangePage | Lát cắt 7: đã đọc toàn file | Validation, HTTP, recovery và logout; bổ sung hướng dẫn 403, giữ auth/policy |
| HistoricalTeachingPage | Lát cắt 4: đã đọc toàn file | Đã sửa các đường hiển thị rủi ro; phạm vi đã kiểm chứng/chưa nghiệm thu bên dưới |
| HomeroomAssignmentsPage | Lát cắt 5: đã đọc toàn file | Tạo/kết thúc/đổi/hiệu chỉnh, danh tính lịch sử, trạng thái hiện tại và truy vết; HTTP/tải/rỗng; giới hạn nghiệm thu bên dưới |
| LoginPage | Lát cắt 7: đã đọc toàn file | Validation, intended path, HTTP và recovery; bổ sung hướng dẫn 403, giữ auth/session |
| MakeupSchedulingPage | Lát cắt 4: đã đọc toàn file | Đã sửa các đường hiển thị rủi ro; phạm vi đã kiểm chứng/chưa nghiệm thu bên dưới |
| NotFoundPage | Lát cắt 7: đã đọc toàn file | Hướng dẫn trang không tồn tại và liên kết thật; không đổi route |
| OperationalHistoryPanel | Lát cắt 7: đã đọc toàn file | Tải lịch sử/giới hạn 50/hoàn tác, HTTP và unknown; giữ scope/CAS/requestKey/reason |
| PpctSpecializedStudyPage | Lát cắt 7: đã đọc toàn file | Năm/lớp/môn/phiên bản/hồ sơ/ngày, preflight/lịch sử/conflict; HTTP, nhãn chính khóa/ban hành, unknown |
| ProfilePage | Lát cắt 4: đã đọc toàn file | Đã sửa các đường hiển thị rủi ro; phạm vi đã kiểm chứng/chưa nghiệm thu bên dưới |
| SchoolClassesPage | Lát cắt 5: đã đọc toàn file | Danh sách/tạo/sửa lớp, lọc khối/trạng thái, xác nhận kích hoạt/vô hiệu hóa; giới hạn nghiệm thu bên dưới |
| SpecialProgrammeWorkspacePage | Lát cắt 7: đã đọc toàn file | Inspect/preview/confirm HĐTN-HN/GDĐP, durable review/publish/materialize; 46 finding, severity/dòng, HTTP; giữ command/revision/lifecycle |
| SystemStatusPage | Lát cắt 6: đã đọc toàn file | Public live/ready, tải/retry/suy giảm/lỗi; lưu thông báo 401 qua cache purge, không hiện lỗi hoặc chi tiết cache cũ khi kiểm tra thất bại; không đổi auth/API/interval |
| TeachingAssignmentsPage | Lát cắt 5: đã đọc toàn file | Chọn năm, lọc, tạo/kết thúc/đổi giáo viên, điều kiện chọn ứng viên, HTTP và ngày hiệu lực; giới hạn nghiệm thu bên dưới |
| TeachingOperationsPage | Lát cắt 4: đã đọc toàn file | Đã sửa các đường hiển thị rủi ro; phạm vi đã kiểm chứng/chưa nghiệm thu bên dưới |
| UsersPage | Lát cắt 6: đã đọc toàn file | Danh sách/tìm trong trang/tạo/sửa/kích hoạt/khóa/đặt lại mật khẩu, đối soát, mẫu trách nhiệm và snapshot, bộ chọn điều phối, preflight/xác nhận xóa; lỗi HTTP/copy/trạng thái và quyền giữ nguyên; giới hạn nghiệm thu bên dưới |

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


## Lát cắt 5 — dữ liệu năm học và phân công (24/10/2026)

Baseline `0a96ed07941d1f0cd5ca2d7dd841b4571e8e889b`; main remote `ea80f078c8a1297c562c8f4319540e3417d6e651`; cùng nhánh/PR #249 draft. GitHub xác minh CI #833 / run `40082860054` SUCCESS chỉ cho baseline. Sau lát cắt này: **20/35 module đã audit toàn file, 15 module vẫn cần audit toàn file**. Không coi việc đọc mã là nghiệm thu dữ liệu thật/persona.

| File / đường hiển thị | Phát hiện trước sửa | Xử lý / kiểm chứng |
| --- | --- | --- |
| AcademicYears / header, form, empty | “phiên lịch bất biến”, thiếu ví dụ mã/tên | Giải thích lịch/học kỳ/tuần/lớp, ví dụ định danh nghiệp vụ; mã uppercase/trim và sparse patch không đổi; unit exact payload và 409 giữ nháp |
| AcademicCalendar / create error 400 | In trực tiếp ApiError.message | Chỉ lời hướng dẫn kiểm tra cấu trúc lịch cố định; giữ bản nháp; test phản hồi cố ý có SQL/host/UUID không xuất hiện, tạo thất bại rồi kích hoạt thành công |
| AcademicCalendar / header, builder, list/detail | “bất biến”, “ngày dân sự YYYY-MM-DD”, inactive “Chưa kích hoạt” có thể sai với lịch từng kích hoạt | Giải thích mỗi lần lưu là phiên mới không sửa phiên cũ; ngày giữ nguyên theo thiết bị; inactive “Không áp dụng”; hướng dẫn khung tuần và ghi chú rỗng rõ ràng |
| SchoolClasses / code, confirmation | Thiếu ví dụ mã; xác nhận không nêu tên lớp/hệ quả | Ví dụ mã; xác nhận nêu lớp và giữ lịch sử; giữ cả activate/deactivate và generic confirmation button, không thêm delete |
| TeachingAssignments / create/change candidate prompt | Select bị khóa nhưng không nói bước trước; nhãn dài bị cắt trên mobile | Nhãn ngắn và lời hướng dẫn ngoài select khi chưa đủ môn/ngày; ngày kết thúc có thể trống; toàn bộ candidateRequest/payload/reset/invalidation/bounds giữ nguyên |
| Homeroom / account status | In ACTIVE/DISABLED/LOCKED/PENDING; có thể nhầm trạng thái tài khoản với lịch sử | Từ điển tiếng Việt có fallback an toàn kể cả constructor; trạng thái hiện tại không thay lịch sử. ACTIVE của bản ghi hiện “Phân công chưa bị đảo”, không khẳng định đang hiệu lực tại ngày xem |
| Homeroom / trace | UUID người đảo/bản ghi thay thế và timestamp ISO trong bảng chính | Giữ nguyên thông tin, chuyển vào details “Thông tin kỹ thuật để tra cứu”, đóng mặc định; format giờ vi-VN theo business timezone hiện hữu; lý do đảo/ghi chú/nguồn vẫn đọc trực tiếp |
| Homeroom / candidate pending | Hiện “Đang tìm” khi query chưa đủ điều kiện chạy | Ưu tiên nhắc chọn khoảng ngày hoặc nhập từ khóa lịch sử trước; không đổi enabled/disabled, khoảng hiệu lực hoặc truy vấn |

Điều hướng đã đối chiếu registry, App và AcademicYearWorkspace: cấu trúc năm học/lịch/lớp dùng ACADEMIC_STRUCTURE_MANAGE/SCHOOL_WIDE; phân công giảng dạy dùng SUBJECT_MANAGE/SCHOOL_WIDE; chủ nhiệm dùng HOMEROOM_ASSIGNMENT_MANAGE/SCHOOL_WIDE. Giữ mọi predicate/route/link và không suy quyền từ chức danh. Năm route đều có smoke thiếu grant → trang không có quyền; bộ unit navigation hiện hữu kiểm tra grant/scopes và SYSTEM_ADMIN không tự có quyền nghiệp vụ.

Wireframe giữ nguyên: desktop tiêu đề → chọn năm/phạm vi → thông báo → form → bộ lọc → bảng và phân trang; lịch/lớp có hai link con hiện hữu. Mobile một cột, bảng cuộn ngang trong vùng bảng, nút/form xuống dòng; không đổi CSS/theme/tokens/primitives. Ảnh/mock, kiểm tra bàn phím/reduced motion/axe và số test chính xác nằm trong `P5-058-SLICE-5-REPORT.md`.

Phạm vi nghiệm thu còn mở trong A/C/D của P5-058: dữ liệu lịch dày nhiều học kỳ/tuần/gián đoạn và clone chi tiết có dữ liệu thật; tên/mã rất dài; thao tác phân công qua API thật, race/409 với dữ liệu cạnh tranh, persona thực tế và Android thật. Bằng chứng local mock không chứng minh toàn backend hoặc quyền production. Không tạo deferral ngoài task; không đóng P5-058.


## Lát cắt 6 — Quản trị và người dùng (25/35 module đã audit toàn file)

T57, cùng nhánh P5-058, baseline `f7f01906821b12db8d95d14bad557937b6bd5165`. Mỗi module ở năm dòng thật bên trên đã được đọc toàn file trước sửa; không dùng danh sách riêng thay cho bảng kiểm kê. Còn 10 module cần audit toàn file; tất cả phần chưa nghiệm thu vẫn thuộc A/C/D P5-058 IN_PROGRESS.

| Trang / đường hiển thị | Trước sửa | Đã xử lý và ranh giới |
| --- | --- | --- |
| Users / preview, apply, bộ chọn điều phối, delete | Một số lỗi dùng err.message; apply còn in 409 kỹ thuật; lỗi danh mục có thể lộ SQL/host | Giữ Error/ApiError cho feedback HTTP; 401/403/409/500 phân biệt, không render raw response kể cả trong details; 409 mẫu nhắc kiểm tra lại; giữ stale-response/snapshot/cache và toàn bộ mutation/payload |
| Users / counter, empty, template permission | Chưa tải hoặc lỗi hiện 0; pending ở truy vấn mẫu bị disabled vì thiếu quyền; danh sách thật rỗng lẫn filtered | Chưa xác định khác zero; thông báo chưa được cấp quyền khác loading; empty khác không khớp lọc trong trang; không đổi quyền hoặc truy vấn |
| Users / scope, quyền và nội dung mẫu | SUBJECT gọi nhầm tổ; vài quyền/notes/description in key, scope hoặc jargon Anh | Mapping nhãn chính xác SUBJECT=môn, SUBJECT_GROUP=tổ, ACTIVITY=hoạt động; mapping exact catalog copy đã đối chiếu source backend, không dịch payload/constant hoặc suy quyền; unknown không in mã trạng thái |
| Users / đối soát, xóa | “100%” dù có conflict/excluded; “tài khoản sạch”, “xóa vật lý”, “an toàn tuyệt đối”; blocker code/reason thô | Wording theo danh sách thiếu thực tế và snapshot preflight; blocker mapping từ enum đã xác minh, unknown an toàn; giữ username confirmation, dual capability, preflight/invalidate và mọi thao tác nhạy cảm; applied=false không báo thành công |
| Capabilities / lịch sử quyền và lookup | UUID thay tên phạm vi thiếu quyền đọc; quyền future gắn nhãn hết hiệu lực; Phase 01/học phần | Nhãn thiếu tên/quyền xem; future/expired/revoked riêng; môn học/tổ chuyên môn; không đổi isActiveWindow, điều kiện revoke hay DTO |
| BusinessConfiguration / mutation và lookup | Chuyển Error thành chuỗi làm mất 401/403; outcome in raw enum; jargon ngày dân sự và scope raw | Giữ Error cho feedback status, outcome mapping hữu hạn với fallback an toàn; ngày cần tra cứu/phạm vi tiếng Việt; giữ draft/revision/command IDs, allowedActions, adapter triple identity và audit lineage |
| Audit / filter, result, detail | Metadata tiếng Anh, mốc cuối khó hiểu; unknown bị gắn thất bại | Hướng dẫn lọc exact code và mốc cuối exclusive; nhãn metadata tiếng Việt, action quản trị biết tên có nhãn; unknown kết quả không giả thất bại; mã action/entity/request và metadata đã lọc vẫn là bằng chứng hợp lệ cho AUDIT_VIEW |
| SystemStatus / HTTP và stale data | Error generic không phân biệt status; cache purge do 401 làm mất lỗi và trở lại loading; cache cũ có thể còn chi tiết | Feedback HTTP; state trình bày giữ 401 tới người dùng tải lại; không thay session boundary; không hiện cached details lỗi; service/db chưa xác nhận khác ready, giữ endpoint/interval |

Wireframe giữ bố cục có sẵn: Users desktop danh sách trái và chi tiết phải, mobile chuyển danh sách/chi tiết; quyền và cấu hình dùng form → bảng/lịch sử; nhật ký bộ lọc → bảng → phân trang; trạng thái tóm tắt → hai thành phần. Không CSS/token/font/primitive mới. Số kiểm thử và QA ảnh: `P5-058-SLICE-6-REPORT.md`.

Giới hạn A/C/D còn mở: mọi mutation nhạy cảm qua backend thật, cạnh tranh/xóa/refetch thực tế, catalog notes mới ngoài exact mapping, metadata nghiệp vụ toàn bộ domain, persona đầy đủ, Android thật và zoom 200%. Mã audit, UUID truy vết và payload chính sách có mục đích quản trị được giữ theo contract, không bị coi là lỗi thô để xóa chứng cứ. Không có nghiệm thu toàn task hoặc production.


## Lát cắt 7 — mười module cuối (25/10/2026)

Tiếp tục working tree phiên mất kết nối trên baseline `96d5c0e13f1153f57240fbd49d85f28f296b6e63`; đã đọc toàn file mười module ở các dòng thật bên trên và đối chiếu diff trước sửa tiếp. Tổng **35/35 module có bằng chứng audit mã qua các lát cắt**, 25 mục navigation đã đối chiếu; không đồng nghĩa nghiệm thu mọi persona/runtime. Ba module lát cắt 2 dùng bằng chứng đã ghi, không tuyên bố đọc lại trong lát cắt 7.

| Đường hiển thị | Xử lý / bằng chứng / giới hạn |
| --- | --- |
| Login / FirstPasswordChange / AccessDenied / NotFound | Hướng dẫn 403; từ chối quyền không tự khẳng định phiên hợp lệ; 404 có bước tiếp theo. Hồi quy exact password policy, refresh, expired session, intended path/logout; không thay auth/route |
| DispositionPreview | Giữ ApiError, reason hữu hạn đối chiếu workspace service, unknown trung tính; empty giáo viên riêng. Unit năm HTTP status giữ note/payload/số call; giữ preview-only, không command ghi |
| OperationalHistory | Tải lỗi không hiện empty, unknown không giả REVERSED; own-property lookup loại xử lý; nhãn lý do 5 ký tự. Giữ scope, CAS/requestKey, giới hạn 50 và thông báo chưa đủ lịch sử. Browser hoàn tác backend thật còn cần nghiệm thu |
| DutyCatalog / DutyAssignments | Nhãn isActive khác cửa sổ hiệu lực; future khác hết hạn; lookup có tải/lỗi và thiếu tên thay UUID. Giữ sparse patch/no-op/null note, filter, scope, create/edit/end/disable; lookup giới hạn 100 hiện hữu, không thêm API hoặc thay quyền |
| PpctSpecializedStudy | HTTP an toàn, giữ xử lý week-split/stale và form; chính khóa/ban hành; số phiên bản từ danh sách hiện hữu, thiếu số nói chưa tra cứu được; unknown không giả chuyên đề/ban hành. Unit exact DTO/date/CAS/refetch/preflight. Phiên bản ngoài danh sách 100 dùng fallback, không suy số |
| SpecialProgrammeWorkspace | Mapping 46 code đối chiếu hai workbook importer, không in finding.message; giữ severity/dòng/canConfirm. Lỗi HTTP giữ object, diễn giải viết tắt; không dùng UUID hoặc chỉ số hàng thay số tiết. Form GDĐP và danh sách chương trình co đúng mobile; nút chọn chi tiết >=44px. Giữ command IDs/revision, exact grade/preview invalidation/lifecycle, không đổi parser/workflow |
| Public health smoke | CI #835 fail nhãn API cũ. Assert heading Dịch vụ ứng dụng, cảnh báo Việt, hai Chưa xác nhận, không Sẵn sàng và nút Thử lại; không tăng timeout hoặc bỏ assertion lỗi. Local dùng health-only fixture, không phải production readiness |

Wireframe giữ hiện hữu: desktop tiêu đề → phạm vi → dữ liệu/bằng chứng → hành động/xác nhận → lịch sử; auth hướng dẫn bên trái, form bên phải; mobile một cột, bảng cuộn nội bộ. Giữ token/font/primitive. Kết quả kiểm thử và ảnh thực tế: `P5-058-SLICE-7-REPORT.md`.

Các giới hạn ở lát cắt 3–6 vẫn thuộc nghiệm thu A/C/D của P5-058: toàn persona/dữ liệu thật, backend E2E command nhạy cảm, lịch/bảng dày, finding mới ngoài mapping, Android thật và zoom 200%. Không tạo deferral ngoài task. Giữ IN_PROGRESS, cần commit checkpoint/CI exact-head/review độc lập; chưa merge/deploy.
