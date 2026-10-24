# P5-058 — Báo cáo lát cắt frontend đầu tiên

> Phần đầu ghi lịch sử lát cắt 1–2. Phần “Lát cắt 3” cuối tài liệu là bằng chứng phiên mới nhất; inventory tại `P5-058-PAGE-LABEL-AUDIT.md`. Không dùng trạng thái working tree/HEAD hoặc CI blocker lịch sử bên dưới làm trạng thái hiện tại.

Ngày thực thi: 24/10/2026. Trạng thái task: **IN_PROGRESS**, theo chỉ thị người dùng; chưa đề nghị đóng task hoặc nghiệm thu toàn bộ frontend.

## Baseline và phạm vi

- Nhánh duy nhất: `feat/p5-058-frontend-vietnamese-ux`.
- HEAD lúc bắt đầu: `6f1e83a8f021db1ab23f9902981a6b32f36d65ab`; GitHub `main` được xác minh trực tiếp bằng `git ls-remote origin refs/heads/main`, khớp SHA này. Local `HEAD...origin/main`: 0/0. Fetch bị từ chối ghi `.git/FETCH_HEAD`; không suy canonical SHA từ tài liệu.
- Dependencies `P5-050`, `P5-052`, `P5-053` đều CLOSED; T57 là authority chính, giữ nguyên T51/T52.
- Ba tài liệu có sẵn lúc bắt đầu được bảo toàn và bổ sung trong phạm vi task: đăng ký P5-058, traceability T57, yêu cầu P5-058. Sửa lỗi cấu trúc đăng ký: hàng P5-058 bị chèn lặp giữa hàng P5-056; giữ đúng một hàng P5-058 và khôi phục hàng P5-056 theo HEAD.
- Chỉ frontend, kiểm thử UI và tài liệu task; không backend/API/auth/schema/CI/CD/VPS. Không merge/deploy.

## Thay đổi và giới hạn

1. `ErrorFeedback` trình bày lỗi tiếng Việt dựa vào HTTP status, không hiển thị message/serverError/requestId từ backend. `QueryFailure`, `MutationNotice`, Data Readiness dùng lại. 401 có liên kết đăng nhập, 403 về công việc, 404/409 có tải lại, lỗi query thông thường có thử lại. Không tự gửi lại mutation hoặc coi nội dung phản hồi là quyền/trạng thái thành công. Tải lại toàn trang là hành động chủ động và có thể làm mất biểu mẫu chưa lưu.
2. TKB giữ đối tượng lỗi, tránh làm mất status khi chuyển lỗi thành chuỗi rồi bọc Error. EmptyState nhận hành động thật; phiên bản TKB rỗng mở được luồng nhập hiện hữu.
3. CTA TKB tại Data Readiness dẫn thẳng `?tab=import`; query điều khiển tab, giữ tham số khác và hỗ trợ refresh/Back. Mặc định hoặc query tab lạ mở phiên bản. Không sửa route/capability guard; chỉ `TIMETABLE_MANAGE / SCHOOL_WIDE` được vào. Quyền đọc Data Readiness không cấp thêm quyền nhập.
4. Đồng bộ register/status/traceability/yêu cầu, giữ `IN_PROGRESS`. Baseline sản phẩm/ADR/README/roadmap không thay vì không đổi authority hay tuyên bố hoàn thành sản phẩm.

## Bằng chứng kiểm tra

- `npm.cmd run lint -w apps/web`: PASS.
- `npm.cmd run typecheck -w apps/web`: PASS cả kiểm tra đầu và kiểm tra cuối; lint cuối cũng PASS.
- Nhóm mục tiêu ban đầu: 5 file, 76/76 PASS (`vietnamese-feedback`, `timetable-admin-page`, `data-readiness-page`, `data-readiness-navigation`, `api-client`). Sau bổ sung test mutation 403/409 và điều hướng từ readiness: TKB + Data Readiness 43/43 PASS. Bao gồm refresh/remount, Back, tab mặc định/lạ, query khác, quyền school-wide, không có grant nhập, giữ biểu mẫu sau lỗi và chỉ một lần POST, không lộ technical content hay suy READY từ lỗi.
- `npm.cmd run test:ui:static`: PASS (UI foundation + PWA baseline).
- `npm.cmd run test:e2e -w tests/e2e -- p5-058-vietnamese-feedback.spec.ts`: 1/1 PASS, trình duyệt Chromium với API mock, không backend. Xác minh F5/Back, keyboard/focus, reduced motion, query retry thực sự phục hồi, 0 request ghi, không lộ raw error, không tràn vùng lỗi; nút thử lại >=44px; axe không có serious/critical violation trên trạng thái lỗi.
- 10 ảnh mock tại `tests/e2e/test-results/p5-058/{import,error}-{320,375,414,1366,1440}.png` (artifact được ignore). Đã xem trực tiếp import/error tại 320 và 1366: chữ lỗi rõ, thao tác dùng được, bố cục một cột trên điện thoại. Đây không phải ảnh dữ liệu production hoặc nghiệm thu mọi persona.
- Chạy toàn bộ Web lần đầu: 604/607 PASS; hai kỳ vọng copy cũ được cập nhật trong `capabilities-page` và `academic-structure-pages`, giữ nguyên kiểm tra retry/state. Một lỗi tại auth-flow bước đổi mật khẩu: heading tìm thấy rồi không còn trong DOM; không sửa auth để xử lý lỗi này. Log đầy đủ: `tmp/p5-058-web-unit.log`. Chạy lại toàn bộ với tối đa 2 worker để xác minh sau cập nhật test; ghi kết quả cuối bên dưới.

## Công việc đang tiếp tục thuộc P5-058

Trước review toàn task, hoàn thành phân kỳ A/C/D của yêu cầu trên cùng nhánh: inventory từng trang và điều hướng, glossary theo nghiệp vụ, các nhóm persona, toàn bộ trạng thái error/empty/loading/recovery, kiểm thử và independent review/CI exact-head. Các ảnh hiện có phát hiện tab TKB còn sít nhau và nội dung biểu mẫu còn Native Workbook/Session Mode/Effective Week/Inspect/Preview; đưa vào audit C của P5-058, không mở rộng lát cắt này thành thay thiết kế hoặc importer. Không coi reusable feedback là bằng chứng đã Việt hóa cả 35 trang.

## Kết quả cuối

- Vitest toàn Web với `--maxWorkers=2 --minWorkers=1`: **39 file, 609/609 PASS**, không có test failure/unhandled error; log `tmp/p5-058-web-unit-final.log`. Luồng auth-flow thất bại trong lượt đầu đã PASS ở lượt này, không thay đổi mã auth. Không kết luận nguyên nhân của lần thất bại đầu chỉ từ việc chạy lại thành công.
- Lượt ghi log bằng PowerShell `> ... 2>&1` trả shell exit 1 do stderr bị bọc thành NativeCommandError (React Router warning); phân biệt kết quả shell này với kết quả Vitest 609 PASS. Lượt kiểm tra riêng copy cũng PASS assertion nhưng gặp cảnh báo WebSocket trùng cổng khi hai Vitest chạy đồng thời. Không đổi cấu hình/CI hoặc chiếm cổng hệ thống để xử lý.
- Nhóm mục tiêu cuối chạy trực tiếp, không redirect và không chồng Vitest: **7 file, 106/106 PASS, exit code 0** (`academic-structure-pages`, `capabilities-page`, `vietnamese-feedback`, `timetable-admin-page`, `data-readiness-page`, `data-readiness-navigation`, `api-client`, `--maxWorkers=2 --minWorkers=1`). Bao gồm kỳ vọng xóa thông báo lỗi mới khi mở biểu mẫu khác, không chỉ kỳ vọng xuất hiện thông báo.
- `git diff --check`: PASS. Kiểm tra complete diff và tập file chỉ thuộc task. Mọi thay đổi vẫn được giữ trong working tree trên nhánh được giao; chưa merge/deploy hoặc chứng nhận CI/independent review.
- Sau các kiểm tra, thử stage đúng 15 file thuộc task bằng `git add -- <explicit paths>` bị chặn: `Unable to create 'D:/baogiang-damsan/.git/index.lock': Permission denied`. Không commit/push, không đổi nhánh hoặc tìm cách vượt giới hạn ghi `.git`. HEAD vẫn `6f1e83a8f021db1ab23f9902981a6b32f36d65ab`; trạng thái P5-058 vẫn IN_PROGRESS. Chỉ tiếp tục commit/push checkpoint này khi môi trường cho phép ghi Git và sau kiểm tra diff/staged list; independent review/CI vẫn chưa có.


## Lát cắt 2 — Dữ liệu năm học và nhập liệu, 24/10/2026

### Baseline và hợp đồng thực thi

- Task P5-058 / T57, giữ **IN_PROGRESS**; dependencies P5-050/P5-052/P5-053 đều CLOSED. T51/T52 không đổi authority. Không phụ thuộc việc hoàn tất P5-055 để sửa nhãn của màn hình hiện có; lỗi nghiệp vụ P5-055 vẫn thuộc PR #248.
- Local bắt đầu sạch tại `cb3018b743d54e276134fd80afa8f9b09146720a`, nhánh `feat/p5-058-frontend-vietnamese-ux`; remote branch cùng SHA (0/0), canonical main xác minh trực tiếp `6f1e83a8f021db1ab23f9902981a6b32f36d65ab` bằng `git ls-remote`, PR #249 API xác nhận OPEN/DRAFT, base/head đúng. `git fetch origin` bị từ chối ghi `.git/FETCH_HEAD`; không lấy SHA tài liệu thay bằng chứng remote.
- Allowed: ba page `TimetableAdminPage.tsx`, `PpctImportPage.tsx`, `DataReadinessPage.tsx`, test liên quan và đồng bộ authority/report P5-058. Chỉ copy/presentation, gồm giữ nguyên đối tượng lỗi PPCT để thành phần lỗi dùng chung đọc HTTP status. Không sửa API/hook/parser/validation/RBAC/route/backend, điều kiện xác nhận, vòng đời nhập, token DESIGN.md, manifest/lockfile hay CI/CD. Không merge/deploy.
- Công việc người dùng: nhận biết dữ liệu nào cần chuẩn bị, chọn đúng tệp/buổi/lịch/tuần, kiểm tra và đối chiếu trước khi ghi bản nháp. Wireframe giữ nguyên ở desktop: tiêu đề → năm học → tab → cấu hình tệp và lịch → kết quả → xác nhận; mobile xếp một cột, bảng có vùng cuộn. Không thay hệ primitive/layout/token.

### Inventory hiện tại của đúng ba màn hình

Mức ưu tiên: P1 = gây nhầm bước hoặc trạng thái; P2 = thuật ngữ/khả năng đọc. Mỗi hàng dưới đây được đối chiếu mã trực tiếp; không phải bằng chứng đã nghiệm thu toàn frontend.

| Màn hình / vị trí mã | Audit trước lát cắt | Xử lý hiện tại và ranh giới | Mức / bằng chứng |
| --- | --- | --- | --- |
| TKB / `TimetableVersionsTab`, bộ lọc trạng thái | DRAFT/VALIDATED/APPROVED/ACTIVE/SUPERSEDED lặp sau nhãn | Chỉ hiện Bản nháp/Đã kiểm tra hợp lệ/Đã phê duyệt/Đang áp dụng/Đã thay thế; option value và điều kiện lifecycle giữ nguyên; trạng thái lạ hiện chưa xác định | P1; timetable-admin unit |
| TKB / `VersionDetailPanel`, thao tác kiểm tra/duyệt/áp dụng | Validate/Approve/Activate lẫn trong nút và thông báo | Nút tiếng Việt; tiếp tục tách kiểm tra, phê duyệt và áp dụng; không bỏ hộp xác nhận, không đổi trạng thái backend | P1; activation confirmation, cancel, 409 unit |
| TKB / đánh giá sẵn sàng | PASS/FAIL/NOT_ASSESSED dễ hiểu thành nghiệm thu toàn bộ | Kết quả đạt/chưa đạt ghi rõ trong phạm vi đánh giá; chưa được đánh giá vẫn không tính đạt; giữ số chiều, ngày, provenance và mã hồ sơ | P1; dynamic dimension/date race unit |
| TKB / `TimetableImportTab`, tiêu đề và hướng dẫn | Native Workbook, Class-view, Teacher-view, sheet | Tệp Excel Đam San, lịch theo lớp/giáo viên, trang tính; tên trang tính thực tế không đổi | P2; import screenshot và inspection unit |
| TKB / chọn buổi và tuần | Session Mode, Effective Week, baseline | Chế độ buổi áp dụng, Tuần học bắt đầu áp dụng; chỉ nhập một buổi thì giữ buổi kia từ bản gốc; BOTH/MORNING/AFTERNOON và payload không đổi | P1; đổi session/year/file và stale response unit |
| TKB / kiểm tra, xem trước, xác nhận | Inspect, Preview, Confirm Import | Kiểm tra tệp, Xem trước đối soát, Xác nhận nạp vào bản nháp; không thêm bắt buộc inspect trước preview vì luồng hiện tại cho preview trực tiếp | P1; import success, wrong-state và 401/403/409 unit |
| TKB / kết quả đối chiếu và thành phần | Peer Reconciliation Report, Composition, raw mode, Diff | Kết quả đối chiếu lịch theo lớp và giáo viên; số tiết nhập mới/giữ từ bản gốc; mode được ánh xạ tiếng Việt, số liệu giữ nguyên | P1; composition/diff unit |
| TKB / xác nhận và biên nhận | Idempotency Key, DRAFT | Mã chống nhập trùng, Bản nháp; readonly/copy/retry key không đổi; biên nhận kỹ thuật vẫn nằm trong details | P1; key across 5xx + successful confirm unit |
| TKB / `TimeSlotsTab` | Sửa (Revise), Revision | Sửa khung tiết, lần sửa; tọa độ, giờ, quyền mục đích, retire confirmation không đổi | P2; create/filter/retire unit |
| PPCT / tiêu đề, chọn tệp, rỗng | workbook, sheet; PPCT chưa viết đầy đủ trong h1 | Nhập phân phối chương trình (PPCT) từ Excel; tệp Excel/trang tính; giữ PPCT_V1, THONG_TIN vì là tên mẫu/trang tính phải đối chiếu chính xác | P2; PPCT unit/E2E |
| PPCT / bảng preview, đích nhập | CORE, draft, fingerprint | Chương trình chính khóa, bản nháp, giải thích bản xem trước gắn với tệp/người nhập/lựa chọn; thay đích phải xem trước lại | P1; dirty preview disabled và refresh unit/E2E |
| PPCT / xác nhận, kết quả | nhập vào DRAFT, tạo/cập nhật/dùng lại draft | Nhập vào bản nháp; kết quả khối/số phiên bản và chưa tự công bố rõ; requestFingerprint, targetMode, expectedUpdatedAt không đổi | P1; FormData assertion và single confirm unit |
| PPCT / lỗi API | raw serverError/message | Dùng ErrorFeedback theo HTTP status; giữ lỗi cấu trúc tệp tại chỗ và bảng issue nghiệp vụ; không suy thành công, không tự gửi lại mutation | P1; 401/403/409, failed preview, blocker unit |
| Readiness / hướng dẫn 6 bước | Khẳng định mọi importer giống nhau, có kiểm tra phòng học | Hướng dẫn định hướng tùy luồng/quyền; chỉ nhắc lỗi/cảnh báo mà luồng đó hỗ trợ; không hứa kiểm tra phòng học | P1; unit và readiness screenshots |
| Readiness / phiên bản gần nhất | Khi thiếu statusLabel có thể hiện raw enum hoặc Đang lưu | Ánh xạ 6 trạng thái phổ biến; trạng thái lạ/thiếu có nhãn trung tính, không suy ready; nhãn chuyên biệt server vẫn được ưu tiên | P1; 7 trường hợp status unit |
| Readiness / findings rỗng và CTA | Không có finding bị diễn đạt thành không có rào cản vận hành | Chỉ khẳng định không ghi nhận cảnh báo trong kết quả; yêu cầu xem trạng thái/hướng dẫn; CTA/route/gate không đổi | P1; NOT_READY + no findings, unauthorized navigation unit |

### Những điểm còn tồn tại, vẫn thuộc P5-058 đang IN_PROGRESS

- Ba màn hình: thông điệp issue nghiệp vụ, tên profile/template, tên trang tính, mã lỗi, UUID/provenance và nhãn server-owned vẫn được giữ để đối chiếu chính xác; chưa có mapping đã duyệt cho mọi mã/hồ sơ có thể trả về. Không dịch mã giao thức hay viết lại validation server trong lát cắt copy. Cần audit khả năng hiểu của nội dung động cùng persona thật trước nghiệm thu toàn task.
- TKB: secondary-nav hiện có còn sát nhau, chưa chứng minh toàn bộ touch target/focus/200% zoom của cả page; thiếu lịch/tuần trong fixture ảnh import là chủ ý mock rỗng, không phải readiness thực tế. PPCT: bảng nhiều cột cuộn ngang ở 320px; cần nghiệm thu thao tác đích nhập trên Android thực tế. Native file input hiển thị Choose File theo locale của trình duyệt thử nghiệm; không thay lifecycle/control để ép nhãn hệ điều hành trong lát cắt này.
- Data Readiness: vẫn dùng backend summary/status/stepper/counters hiện hữu; không chứng nhận thuật toán READY, xử lý dữ liệu cũ khi refresh lỗi hay race khi đổi năm. Correction PR #248/P5-055 là authority riêng; không âm thầm sửa state/hook trong P5-058.
- Còn 32/35 module chưa có inventory chi tiết theo từng nhãn trong lát cắt này (đã liệt kê từ cây thực tế): AcademicCalendarPage, AcademicYearsPage, AccessDeniedPage, AccessibleReportingStatementsPage, AuditPage, BusinessConfigurationPage, CapabilitiesPage, CatalogPage, DispositionPreviewPanel, DutyAssignmentsPage, DutyCatalogPage, EffectiveSchedulePage, FirstPasswordChangePage, HistoricalTeachingPage, HomePage, HomeroomAssignmentsPage, LoginPage, MakeupSchedulingPage, NotFoundPage, OperationalHistoryPanel, PendingReportingStatementsPage, PpctSpecializedStudyPage, ProfilePage, ReportingStatementDetailPage, ReportingStatementsPage, SchoolClassesPage, SpecialProgrammeWorkspacePage, SystemStatusPage, TeachingAssignmentsPage, TeachingOperationsPage, TemporalAssignmentsPage, UsersPage. Một số đã hưởng feedback từ lát cắt 1; không đồng nghĩa đã audit/Việt hóa toàn trang.
- 26 mục điều hướng, toàn bộ persona (giáo viên/tổ trưởng/BGH/admin/điều phối), tích hợp backend/importer thật, zoom/keyboard/a11y toàn diện, CI exact-head và independent review vẫn là tiêu chí đang mở trong A/C/D của P5-058. Không tạo hạng mục deferred ngoài đăng ký; chưa đề nghị IN_REVIEW/CLOSED.

### Blocker CI bảo mật — tách khỏi thay đổi copy

Đã đọc trực tiếp danh sách job/step và toàn bộ log job `120749129443` của [CI run 40052855139](https://github.com/hvtnguyenson-code/baogiang-damsan/actions/runs/40052855139), gắn PR #249 checkpoint `cb3018b743d54e276134fd80afa8f9b09146720a` (PR API xác minh HEAD).

- Step 6 **Production dependency security gate** chạy `npm audit --omit=dev --audit-level=high`, exit 1 lúc 2026-10-24 02:08:24 UTC. Báo cáo production: **12 vulnerabilities (10 moderate, 2 high)**. Số 42 vulnerabilities trong bước npm install gồm dev, không phải kết quả gate production.
- `body-parser <=1.20.8`, **high**, tại `node_modules/body-parser`: GHSA-v422-hmwv-36x6 (invalid limit vô hiệu giới hạn kích thước), GHSA-27r3-jxmh-p828 (trailing bytes sau compressed body).
- `multer 2.0.0 - 2.4.0`, **high**, tại `node_modules/multer`: GHSA-3pph-fpjx-jg34 (orphaned disk writes khi upload bị ngắt), GHSA-q7qp-rjg7-q26m (pending asynchronous fileFilter sau request teardown).
- Chuỗi phụ thuộc log nêu `@nestjs/core` / `@nestjs/platform-express` / `@nestjs/terminus`; platform-express phụ thuộc body-parser và multer. Các mục moderate khác trong report: file-type/@nestjs/common, qs, react-router/react-router-dom, uuid/exceljs. Đây không phải chứng cứ frontend copy gây lỗi.
- Lint/typecheck/unit/integration/build/Playwright của job Linux **SKIPPED** sau gate, không được gọi PASS. Job Windows deployment contract **SUCCESS**. Không rerun SHA cũ, không bỏ gate.
- **Khuyến nghị task bảo mật riêng, chưa đăng ký/chưa thực thi:** đăng ký và audit dependency production trước remediation; xác minh version thực tế/đường phụ thuộc/advisory; đề xuất bản vá tương thích Nest/Express, multipart, giới hạn body và upload teardown; prompt riêng phải chỉ rõ allowed manifest/lock/backend surface, invariants, regression HTTP/upload/auth/import, migration/rollback/compatibility. Gate audit production phải xanh cùng CI đầy đủ trước merge. Không dùng npm audit fix/force hoặc mặc nhiên nhận nâng Nest major mà report gợi ý. P5-058 không sửa package.json/package-lock.json/backend/CI/CD để giải blocker.


### Bằng chứng kiểm tra local của lát cắt 2

- `npm.cmd run test:unit -w apps/web -- timetable-admin-page data-readiness-page data-readiness-navigation ppct-import-page --maxWorkers=2 --minWorkers=1`: **4 file, 72/72 PASS**, exit 0; log `tmp/p5-058-academic-unit.log`. Có kiểm tra nhãn, payload FormData không đổi, lỗi 401/403/409 cả TKB và PPCT, không tự lặp confirm/không báo thành công, blocking inspection, previewDirty, đổi tệp/buổi/năm, phản hồi cũ, activation 409 và readonly/idempotency retry. Các failure ban đầu do selector copy cũ/nhãn trùng option và badge đã sửa kỳ vọng vào đúng nội dung; không sửa auth hoặc importer để làm xanh.
- Typecheck Web, ESLint Web và `npm.cmd run test:ui:static`: PASS. Không chạy backend integration/migration vì không có thay đổi backend và đây là bằng chứng frontend/mock có giới hạn.
- `npm.cmd run test:e2e -w tests/e2e -- p5-058-vietnamese-feedback.spec.ts p5-058-academic-import.spec.ts`: **2/2 PASS** trên Chromium với API mock. Luồng PPCT inspect → preview → đổi đích (confirm bị khóa) → xem trước lại bằng keyboard → confirm đúng một lần → xóa preview; Data Readiness vẫn NOT_READY dù phiên bản là bản nháp. Test cũ kiểm tra F5/Back/deeplink/retry, keyboard/focus, reduced-motion và axe serious/critical ở trạng thái lỗi tiếp tục qua.
- E2E mới lần đầu hết giới hạn 30s sau khi hoàn tất PPCT và chuyển sang readiness; error-context cho thấy đang kiểm tra phiên đăng nhập, không có kết luận lỗi runtime từ lần đó. Đặt timeout riêng 90s cho test chụp 10 ảnh và đi qua 2 trang; không sửa CI/cấu hình timeout chung. Lượt sau PASS 2/2; không force rerun CI.
- 20 ảnh mock được tạo tại `tests/e2e/test-results/p5-058/{import,error,ppct-preview,readiness}-{320,375,414,1366,1440}.png`, artifact ignore. Đã xem trực tiếp PPCT preview và TKB import ở 320/1366, readiness 320. Chữ Việt đọc được và cấu trúc tác vụ giữ nguyên; bảng PPCT cuộn ngang, tab TKB còn sát nhau, native file input theo locale trình duyệt. Không tuyên bố PASS mọi viewport/a11y/toàn persona chỉ từ ảnh này.
- Đã đọc diff mã, test mới, tài liệu và danh sách file; `git diff --check` PASS. Tập file cấm (package.json/package-lock.json/apps/api/.github/DESIGN.md) không có diff. Baseline sản phẩm/ADR/README/roadmap không đổi vì không đổi authority hay tuyên bố sản phẩm hoàn tất; register/status/T57/requirement/report được đồng bộ và giữ IN_PROGRESS.


### Trạng thái bàn giao cuối lát cắt 2

Lượt cuối chạy nối tiếp `typecheck -w apps/web` → `lint -w apps/web` → `test:ui:static` → hai spec P5-058 đều PASS, exit 0 (E2E 2/2, 22.1s). Unit mục tiêu cuối 72/72 PASS. Không dùng CI làm vòng thử lỗi.

Sau khi kiểm tra diff và danh sách đúng 12 file, `git add -- <12 explicit task paths>` bị chặn: `fatal: Unable to create 'D:/baogiang-damsan/.git/index.lock': Permission denied`. Staged list vẫn rỗng. Không commit/push, không sửa quyền hoặc tìm cách ghi vòng qua `.git`; mọi thay đổi lát cắt 2 đang ở working tree (10 modified + 2 untracked test files). Local HEAD và remote task branch xác minh lại bằng Git vẫn `cb3018b743d54e276134fd80afa8f9b09146720a`; main vẫn `6f1e83a8f021db1ab23f9902981a6b32f36d65ab`. PR #249 giữ DRAFT, P5-058 giữ IN_PROGRESS. Khi môi trường cho phép ghi Git, kiểm tra diff/staged list rồi commit và push cùng nhánh, không tạo nhánh/PR khác. Chưa có CI cho phần chưa push hoặc independent review; không merge/deploy.

## Lát cắt 3 — Báo cáo, bàn làm việc, tổ/môn và điều hướng

### Git và authority đầu phiên

- Ngày 24/10/2026, đúng workspace `D:\baogiang-damsan`; nhánh `feat/p5-058-frontend-vietnamese-ux`, local HEAD/remote task HEAD `8968d50909cc03ca677fe5416dce96bdc517dd0d`. Working tree ban đầu sạch, không untracked; main trực tiếp `ea80f078c8a1297c562c8f4319540e3417d6e651`, divergence 4/0. GitHub PR #249 OPEN/DRAFT, không merge. `git fetch origin` bị chặn ghi FETCH_HEAD; `git ls-remote` và connector PR xác minh SHA độc lập.
- Git log cho thấy security PR #250/main đã được tích hợp vào nhánh bằng commit `5d12cc2`; vì vậy blocker dependency của lát cắt 2 là lịch sử. Đọc trực tiếp GitHub workflow cho HEAD đầu phiên: [CI #831 / 40068828206 SUCCESS](https://github.com/hvtnguyenson-code/baogiang-damsan/actions/runs/40068828206). Đây không phải CI của thay đổi lát cắt 3.
- Đọc AGENTS.md, DESIGN.md, damsan-ui skill, yêu cầu/report/register/T57 và năm authority governance, execution protocol P5-050; đối chiếu contract/presenter báo cáo, ADR-041/ADR-057 và addendum v1.3. P5-050/P5-052/P5-053 CLOSED. Không thay authority workload, snapshot hay phép tính.
- Inventory được lập trước sửa: [P5-058-PAGE-LABEL-AUDIT.md](P5-058-PAGE-LABEL-AUDIT.md). Có đầy đủ 35 module và mức review. Đã đọc thêm 7 module: 4 trang báo cáo, Home, Catalog, TemporalAssignments; chỉ 5 cần sửa trực tiếp, 2 giữ nguyên và dùng component chung. Navigation thực tế **25 mục**, đã ghi từng route/nhãn; con số 26 trong baseline cũ không khớp mã hiện tại. Không nhận đã nghiệm thu 35 trang.

### Kết quả triển khai

1. Preview/gửi/duyệt báo cáo dùng nội dung lỗi Việt an toàn; không in ApiError.message, serverError hoặc mã yêu cầu. 401/403 có lối điều hướng; 409 vẫn phải tải lại/xem trước. Thông báo submit đặt ngoài phần preview nên vẫn thấy sau khi 409 xóa preview cũ. Không đổi hook, request body, lifecycle, capability, token hay điều kiện allowedActions; không tự retry mutation.
2. Bảng mapping riêng cho 9 finding code public, đối chiếu union trong contracts và backend presenter. Workload mapping các code đã xác minh (lịch thiếu/trùng, thiếu ngày dạy, thiếu nhiệm vụ, tổng hợp đặc thù bị chặn); mã khác có cảnh báo Việt trung tính và hướng liên hệ chuyên môn. Không phân tích/hiển thị raw message, không suy thành công từ cảnh báo. Lifecycle/phân loại/cách thực hiện lạ có fallback Việt; lookup không nhận prototype properties.
3. Null workload/định mức hiện **Chưa xác định**, không ngầm đổi thành 0 hoặc dùng định mức gốc thay kết quả điều chỉnh chưa xác định. Zero thật, dấu chênh lệch, mọi số liệu backend và phân biệt live projection/snapshot được giữ. Không tính lại định mức, không sửa nguồn báo cáo hoặc dữ liệu đóng băng. Tên nhiệm vụ thiếu không hiển thị mã kỹ thuật thay tên.
4. Nhãn số liệu dùng “Tiết còn phải hoàn thành”, “Tiết chưa đủ bằng chứng xác nhận”. Giải thích GDĐP/HĐTN-HN bằng tên đầy đủ. Home/navigation không còn hứa tiến độ giảng dạy trên route lịch hiệu lực. Phân công tổ/môn có fallback tên rõ ràng, không dùng UUID thay tên; quyền tra cứu, tạo/sửa/kết thúc và dữ liệu submit giữ nguyên.
5. Navigation chỉ đổi label/actionHint và tiêu đề family: phân công tổ chuyên môn/môn học, phân phối chương trình, chương trình đặc thù; hint cấp quyền/nhật ký dễ hiểu hơn. Mọi `to`, `familyId`, `exactEnd`, predicate và matcher giữ nguyên; vẫn có test exact scope và không suy quyền từ SYSTEM_ADMIN/chức vụ.
6. Axe phát hiện hai nhãn workload cũ dùng fallback `#6b7280` chỉ đạt 4,41:1. Chuyển đúng hai nhãn sang `--ink-muted-on-canvas`, viền dùng `--border-card`, đều token đã có. Chữ “Chưa xác định” dùng font sản phẩm. Không sửa DESIGN.md/token/palette hay layout/primitive.

### Bằng chứng local

- `npm.cmd run typecheck -w apps/web`, `npm.cmd run lint -w apps/web`, `npm.cmd run test:ui:static`: PASS, exit 0; chạy lại nối tiếp sau sửa token cũng PASS.
- Nhóm reporting/navigation/management đầu: **7 file, 113/113 PASS**, exit 0. Bao gồm preview 401/403/409 không lộ message và không submit; submit409 còn thông báo sau xóa preview; 500 quyết định chỉ retry cùng token/key khi chủ động; lifecycle/finding lạ; null khác zero; các persona, scope, keyboard và routing cũ. Ca preview401 inject ApiError ở client boundary để kiểm tra copy; hết phiên thật vẫn do auth hiện hữu xử lý, được kiểm tra trong full unit/session-cache-isolation.
- Toàn bộ Web: `npm.cmd run test:unit -w apps/web -- --maxWorkers=2 --minWorkers=1`: **41 file, 638/638 PASS**, exit 0, 143,17s. Sau đó thêm đúng 2 regression cho fallback thiếu tên ở cả phân công tổ và phân công môn: `management-pages` **15/15 PASS**, exit 0; xác minh không fetch users khi thiếu grant, không in UUID ở bảng hoặc biểu mẫu sửa. Không gộp hai lượt thành tuyên bố full suite 640.
- Playwright mock lần đầu 4 ca: 3 PASS, 1 FAIL do axe contrast trên hai nhãn workload; đã đọc toàn bộ lỗi/nodes rồi sửa token, không tắt rule. Lượt kiểm tra lại spec báo cáo: **2/2 PASS**, exit 0, 17,3s. Hai spec P5-058 nhập liệu/feedback cũ đã PASS trong lượt 4 ca đầu; không dùng CI làm vòng thử lỗi.
- Lượt cuối chạy lại cả 3 spec P5-058 trên nội dung đã sửa: **4/4 PASS**, exit 0, 23,8s (reporting 2 ca, import 1, feedback 1). Không có thay đổi runtime sau lượt này. `git diff --check` PASS; danh sách xuất bản đúng 21 path frontend/test/tài liệu P5-058, không có path cấm.
- Spec mới kiểm tra giáo viên nhập ngày/xem trước bằng keyboard, finding có message cố ý chứa internals không bị lộ, workload null, submit409 chỉ một POST/payload đúng và không báo thành công; BGH loading/list/detail, xác nhận trước quyết định, 409 refetch ra trạng thái backend mới không báo quyết định thành công, 403 an toàn, empty có giới hạn phạm vi, admin links/keyboard Escape và trả focus. Reduced-motion bật; axe không serious/critical trên hai trạng thái đã kiểm tra sau sửa.
- 10 ảnh mock `tests/e2e/test-results/p5-058/reporting-{preview,detail}-{320,375,414,1366,1440}.png`, artifacts ignore. Kiểm tra overflow tự động cả 5 width. Đã xem trực tiếp preview/detail ở 320 và 1366: nhãn dài xuống dòng, một cột trên điện thoại, không cắt chữ hoặc tràn trang; nút quyết định tách biệt. Chi tiết fixture ít dòng/chưa có section và history nên ảnh không chứng minh bố cục báo cáo dày dữ liệu. Control ngày theo locale trình duyệt (ảnh có MM/DD/YYYY) không phải thay đổi hợp đồng ngày.
- Không chạy database/integration/backend thật; không dùng VPS hoặc dữ liệu thật. Không sửa dependencies, backend, schema, auth, route guard, CI/CD hoặc importer/worksheet/protocol identifiers.

### Documentation sync và phần còn mở

Đồng bộ requirement, register, status, T57 và inventory/report. Giữ **IN_PROGRESS/DRAFT**, chưa đề nghị IN_REVIEW toàn task vì còn 25 module cần audit nhãn đầy đủ và nghiệm thu persona toàn sản phẩm. Baseline sản phẩm/ADR/README/roadmap không đổi: không thay quyền, semantics hay claim sản phẩm hoàn tất.

EffectiveSchedule mới đọc khảo sát: còn `err.message`, blockedReasons/sourceLabel/comparisonLabel động; cần audit toàn file và fail-closed presentation riêng trong P5-058. Các trang quản trị đích ngoài Catalog/Temporal chưa được audit vì đọc navigation không chứng minh trang đích hoàn tất. Cần kiểm tra bảng báo cáo nhiều dòng, zoom200%, Android thật, toàn bộ state/per-role, unknown finding cụ thể còn fallback trung tính và importer/server-owned label trong lát cắt 2. Tất cả vẫn là A/C/D đang hoạt động của P5-058, không phải hạng mục deferred chưa đăng ký. Không sửa P5-055 READY correction hoặc state/race ngoài phạm vi copy.

### Phương thức bàn giao checkpoint

Local `.git` chỉ đọc nên không thể fetch/index/commit theo CLI. Đã chuẩn bị đúng 21 nội dung tệp được review, chuẩn hóa LF theo `.gitattributes`, dự kiến dùng connector GitHub với base tree `ad5d6f4bca58ce88be8610bbe436bc4c1b8c2b9a` / parent HEAD đầu phiên và fast-forward cùng nhánh có expected SHA. **Chưa xuất bản:** lời gọi `github_create_tree` bị từ chối ngay với thông báo **“MCP tool call requires approval, but approval policy is never”**. Không có tree/commit/ref mới được xác nhận; không tiếp tục thử cơ chế ghi khác hoặc sửa quyền.

Local và remote task HEAD vẫn `8968d50909cc03ca677fe5416dce96bdc517dd0d`; cả 21 thay đổi giữ nguyên trong working tree, không có commit/push của lát cắt 3. PR #249 giữ DRAFT. Cần môi trường cho phép ghi Git/GitHub để commit/push bộ thay đổi này sau đối chiếu lại remote và diff; không tạo nhánh/PR khác. Chưa có CI cho nội dung mới hoặc independent coordinator review; CI baseline #831 không thay thế các gate này. Không merge/deploy.
