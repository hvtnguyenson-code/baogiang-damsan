# Reporting Statement UI-1 — Product UI

## Status

**Candidate.** Baseline `main` tại `15b1fb4478aa01c82211a9204b3c14e5efaba53a`. Candidate cần independent GitHub review và CI trên exact branch head; tài liệu này không tuyên bố Product UI Freeze CLOSED, không cho phép merge hoặc deploy.

## User jobs

- Giáo viên chọn năm học và khoảng ngày trong active calendar, chủ động lập bản xem trước, đọc counts/phạm vi/bằng chứng, gửi bản chính thức khi đủ điều kiện và xem lịch sử revision của mình.
- Người đọc được ủy quyền xem danh sách do backend cho phép và mở frozen detail.
- Người phê duyệt mở hàng đợi, đọc evidence và history trước hành động, xác nhận quyết định, và xem lại trạng thái mới khi CAS conflict.

## Routes và capability matrix

| Route | Mục đích | Điều kiện hiển thị/guard phía client |
| --- | --- | --- |
| `/bao-cao-ke-khai` | Workspace cá nhân và danh sách của tôi | `REPORTING_STATEMENT_SUBMIT / PERSONAL` hoặc `REPORTING_STATEMENT_READ / PERSONAL` |
| `/bao-cao-ke-khai/duoc-xem` | Danh sách ngoài workflow cá nhân | `REPORTING_STATEMENT_READ / SUBJECT` hoặc `SCHOOL_WIDE` |
| `/bao-cao-ke-khai/:revisionId` | Frozen detail dùng chung | Ít nhất một `REPORTING_STATEMENT_READ / PERSONAL`, `SUBJECT`, `SCHOOL_WIDE` |
| `/phe-duyet-bao-cao` | Hàng đợi phê duyệt | `APPROVAL_PRINCIPAL` hoặc `APPROVAL_VICE_PRINCIPAL / SCHOOL_WIDE`, đồng thời có read non-personal |

Route family nằm trong `professionalRoutes`, tách khỏi `managementRoutes`. Client không suy quyền từ role, title, assignment, duty hoặc `SYSTEM_ADMIN`; backend vẫn là authorization boundary và `HTTP 403` được xử lý fail-safe.

## Preview và submit

Workspace lấy năm học, active calendar, lớp và môn qua `workspaceContext`. Chỉ tự chọn khi response có đúng một năm học. Nhiều năm yêu cầu người dùng chọn; năm không có active calendar hiển thị trạng thái rõ và khóa preview. Hai native date inputs có `min`/`max`, kiểm tra required, canonical civil date, thứ tự và calendar envelope.

Preview chỉ chạy sau nút “Xem trước báo cáo”. Mọi thay đổi year/from/to làm mất hiệu lực preview và pending submit command cũ.

- `ZERO_RESPONSIBILITY` là kết quả hợp lệ với counts bằng 0, không dùng error tone và không cho submit.
- `PASS + RESPONSIBILITY_PRESENT + eligibleForSubmission` hiển thị counts, current catalog labels, responsibility intervals và evidence trước nút gửi.
- `BLOCKED` chỉ hiển thị `finding.message` public-safe, không hiển thị code, entity ID hoặc provenance nội bộ.

Submit nhắc rõ server sẽ kiểm tra lại dữ liệu tại thời điểm gửi chính thức. Nút chỉ dùng preview khớp exact fingerprint hiện tại. Success/replay được hợp nhất thành một logical success và làm mới danh sách cá nhân. Sau khi bắt đầu gửi, giao diện khóa lệnh đó: trong lúc chờ hoặc chưa xác định được kết quả chỉ có thể thử lại đúng yêu cầu cũ; không thể tạo thêm yêu cầu từ bản xem trước cũ. Khi thành công, bản xem trước cũ không thể được gửi lại. Link mở chính revision vừa gửi chỉ xuất hiện khi actor có `REPORTING_STATEMENT_READ / PERSONAL`; quyền đọc `SUBJECT` hoặc `SCHOOL_WIDE` không thay thế quyền đọc bản cá nhân của owner.

## requestKey retry và stale CAS

Một submit command tạo đúng một `requestKey`. Network error hoặc server failure chưa rõ kết quả giữ nguyên command và nút “Thử gửi lại” gửi cùng key và cùng year/from/to. Success xóa pending key. `HTTP 409` không blind retry: pending key và preview bị xóa, danh sách được làm mới, người dùng phải xem trước lại; command mới tạo key mới.

Decision chỉ được tạo sau bước xác nhận, với một `requestKey` và lifecycle token đang đọc. Khi kết quả chưa rõ, giao diện ẩn xác nhận và mọi hành động thông thường; chỉ có thể thử lại đúng quyết định cũ. Sau success hoặc `HTTP 409`, mọi hành động cũ bị khóa đến khi chi tiết mới tải xong. Chỉ dữ liệu mới quyết định các hành động được phép hiển thị tiếp theo. `HTTP 409` xóa pending command, tải lại detail/hàng đợi, thông báo báo cáo đã có trạng thái mới và yêu cầu đọc lại. Với lỗi 4xx xác định khác 409, UI xóa command và confirmation cũ, hiển thị thông báo an toàn theo 400/401/403/404, không retry lệnh cũ và không tự tạo lệnh thay thế; nếu detail hiện tại vẫn có action thì người dùng có thể chủ động bắt đầu một command mới. Quyết định mới sau review tạo key mới. Khi từ chối, hệ thống hiện không yêu cầu nhập lý do.

## Evidence-before-action và read workflows

Danh sách cá nhân, accessible và pending đều dùng pagination backend và status label có text. Frozen detail sắp xếp: identity/range/status → counts → responsibility → detailed evidence → history → actions. Current class/subject labels chỉ hỗ trợ đọc và có fallback khi danh mục không còn nhãn; copy không gọi chúng là frozen truth. Đường quay lại trên shared detail phản ánh đúng quyền hiện có: báo cáo cá nhân, danh sách được phép xem và hàng đợi phê duyệt chỉ xuất hiện khi người dùng thực sự đi được tới nơi đó; các đường phù hợp có thể cùng xuất hiện. UUID, lifecycle token, requestKey, canonical JSON, semantic hash và provenance IDs không xuất hiện trên product surface.

## Responsive, accessibility và design

UI tuân `DESIGN.md`: long-form/ledger, Be Vietnam Pro, IBM Plex Mono cho dates/time/tabular values, semantic colors, divider và basalt rail có ý nghĩa workflow. Không card grid, sidebar, role selector, gradient, icon tile hoặc decorative rail. Navigation giữ native `NavLink`; controls có touch target 44px; bảng cuộn trong vùng có nhãn; page không overflow ở 320/375/414; focus-visible và reduced motion dùng foundation hiện có; async/error/success có live-region semantics.

## Screenshot evidence

Visual fixture có dữ liệu đại diện, tách rõ khỏi business E2E:

- `personal-pass-375x812.png`;
- `personal-pass-1366x768.png`;
- `personal-pass-1920x1080.png`;
- `approval-detail-375x812.png`;
- `approval-detail-1366x768.png`.

Ảnh được sinh dưới `tests/e2e/test-results/ui-foundation/reporting-statement-ui/` và không stage. Visual critique kiểm tra template-like composition, rail semantics, density, chữ Việt, local table overflow, touch targets và evidence/action order.

## Test evidence

Candidate có unit integration cho capability routing và navigation, ZERO/PASS/BLOCKED, label/evidence, input invalidation, requestKey submit/decision retry, replay, allowed actions, confirmation, no raw ID và stale refetch bị trì hoãn sau success/409. Playwright visual fixture chạy axe WCAG A/AA, page overflow, touch targets và screenshot matrix. Real PostgreSQL cross-role/lifecycle E2E chỉ được tính khi có certified isolated database; visual fixture không thay thế bằng chứng business E2E.

Local final evidence:

- web full unit: 14 files, 157 tests PASS;
- web lint, typecheck, build và UI foundation static gate: PASS;
- Reporting Statement Playwright visual fixture: 2 tests PASS, 5 screenshots;
- contracts lint, typecheck, build: PASS;
- API lint, typecheck, build: PASS;
- API Reporting Statement non-DB regression: 6 suites, 81 tests PASS.

## Known limitation

Không có certified isolated `TEST_DATABASE_URL` trong phiên local nên PostgreSQL Reporting Statement HTTP/E2E không chạy. UI dùng nguyên live contracts đã đóng; không thay đổi `apps/api`, `packages/contracts`, Prisma/schema/migration, workflow hoặc deployment.

## Delivery boundary

Task này không thay đổi backend/domain semantics, không production access và không deploy. Push branch chỉ là input cho CI và independent GitHub review.
