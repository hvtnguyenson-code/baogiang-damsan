# P5-058 — Báo cáo lát cắt 6: quản trị và người dùng

Ngày 24/10/2026. P5-058 / T57 **IN_PROGRESS**, dependencies P5-050/P5-052/P5-053 CLOSED. Giữ T51/T52, nhánh duy nhất `feat/p5-058-frontend-vietnamese-ux`, [PR #249](https://github.com/hvtnguyenson-code/baogiang-damsan/pull/249) draft theo bàn giao. Chưa nghiệm thu toàn task, chưa merge/deploy.

## Baseline và phạm vi

- HEAD local và remote task xác minh trực tiếp `f7f01906821b12db8d95d14bad557937b6bd5165`, working tree sạch lúc bắt đầu, divergence task 0/0; main/HEAD 0/7. `git fetch origin main` bị chặn ghi `.git/FETCH_HEAD`; `git ls-remote origin` xác minh main `ea80f078c8a1297c562c8f4319540e3417d6e651`. Không dùng SHA trong docs làm authority thay Git remote.
- CI #834 SUCCESS là bằng chứng baseline do người dùng bàn giao; phiên này không xác minh độc lập CI run/GitHub review. Không phải CI cho working tree mới.
- Đọc AGENTS.md, DESIGN.md, damsan-ui, yêu cầu/audit P5-058 và governance/protocol; đọc toàn file UsersPage, CapabilitiesPage, BusinessConfigurationPage, AuditPage, SystemStatusPage và mã API/catalog/contract liên quan ở chế độ read-only. Chỉ sửa năm trang, unit/E2E và sáu tài liệu đồng bộ; không backend, route/API, payload, SQL/migration, auth/RBAC, dependency, CSS/token/font, CI/CD hoặc hệ thống ngoài dự án.

## Thay đổi và invariant

Users giữ lỗi Error/ApiError qua preview/apply và bộ chọn điều phối để feedback phân biệt 401/403/409/500; không in server message, serverError hoặc requestId trong DOM/details. 409 mẫu nhắc kiểm tra quyền trước khi áp dụng lại. Snapshot matching, stale/ABA response rejection, generation refs, coordinator cache/query predicates, mọi mutation và invalidate vẫn giữ nguyên. Danh sách thật rỗng khác không khớp lọc trong trang; số chưa tải/lỗi hiện “Chưa xác định”, zero thật vẫn 0. Không có quyền cấp quyền hiện lời giải thích thay cho loading của query bị disabled.

Mapping quyền/phạm vi dùng tiếng Việt đúng SUBJECT=môn, SUBJECT_GROUP=tổ, ACTIVITY=hoạt động, kể cả kết quả cấp quyền. Nội dung mẫu/notes kỹ thuật được đối chiếu với catalog backend rồi mapping exact string hoặc key có chủ đích; không dùng bản dịch suy quyền, đổi mã hay payload. Unknown status/key có fallback an toàn. Không khẳng định 100% đã đạt chuẩn khi danh sách thiếu rỗng nhưng vẫn có conflict/excluded.

Preflight xóa giải thích điều kiện theo thời điểm kiểm tra và việc máy chủ kiểm tra lại khi xác nhận. Blocker labels dựa trên enum/code public đã xác minh; không in lý do/code thô. Quyền kép USER_MANAGE + SYSTEM_ADMIN, self/protected/history handling, nhập đúng username, thao tác xóa không hoàn tác và refresh preflight khi 409 đều giữ nguyên. Không cấp thêm quyền, tự gửi lại mutation hay thay trạng thái nghiệp vụ. HTTP 200 có applied=false hiện cảnh báo chưa áp dụng, không hiện thông báo thành công; không đổi xử lý hoặc payload apply.

Capabilities phân biệt chưa tới thời điểm hiệu lực, hết hạn và thu hồi, không dùng UUID thiếu quyền đọc làm tên phạm vi. Giữ năm query phân trang, retained selection, create/revoke DTO và xác nhận thu hồi.

BusinessConfiguration giữ Error thay vì chuyển thành message; feedback theo HTTP status, mọi outcome tra cứu có nhãn Việt và unknown fallback an toàn. Không render payload thô khi thiếu exact adapter. Giữ allowedActions của máy chủ, triple identity/version matching, revision, command IDs, phạm vi, ngày và lineage/audit history, form xác nhận và cả bảy luồng create/edit/publish/replace/retire/correct/supersede. Lỗi HTTP dùng hướng dẫn an toàn theo status, không suy mã nghiệp vụ từ message máy chủ.

Audit giải thích mốc kết thúc exclusive, nhãn thông tin bổ sung tiếng Việt, bổ sung nhãn cho sáu mã hành động quản trị đã xác minh. Mã hành động/đối tượng/người thực hiện/mã tra cứu và metadata được backend lọc vẫn được giữ để tra cứu đúng; không dịch mã filter hoặc đổi audit semantics. Unknown result không bị gắn nhãn thất bại giả.

SystemStatus hiển thị lỗi HTTP chính xác và không hiện chi tiết cache cũ của kiểm tra thất bại. Smoke tìm ra HTTP 401 xóa query cache qua session boundary hiện hữu làm mất lỗi và hiện loading; trang giờ giữ lỗi 401 trong state trình bày đến khi người dùng tải lại. Endpoint, request, auth/session cache purge, read interval 30 giây và retry đọc không đổi; không giữ dữ liệu phiên nghiệp vụ hoặc thay cơ chế xác thực.

Wireframe giữ bố cục hiện hữu: Users danh sách trái/chi tiết phải trên desktop và chuyển danh sách/chi tiết trên mobile; các trang khác tiêu đề → form/bộ lọc → bảng/lịch sử, trạng thái → hai thành phần. Không thay thiết kế.

## Kiểm chứng local

| Kiểm tra | Kết quả / bằng chứng |
| --- | --- |
| Unit mục tiêu | **152/152 PASS**, 6 file; `.tmp-p5-058-slice6-target-handoff.log`, runner exit 0 |
| Unit Web toàn bộ | **717/717 PASS**, 44/44 file, 154,66 giây; `--maxWorkers=2 --minWorkers=1 --testTimeout=20000`, `.tmp-p5-058-slice6-unit-handoff.log`, runner exit 0; không chạy cùng E2E |
| Playwright UI mock | **7/7 PASS**, `.tmp-p5-058-slice6-e2e-verified.log`; cả năm route × HTTP 401/403/409/500, loading/empty/thiếu grant và xóa 409 giữ exact command/confirmation, không tự retry |
| Typecheck | Toàn repository PASS exit 0 sau sửa lỗi type trong test, `.tmp-p5-058-slice6-typecheck-full-final.log`; Web bàn giao PASS exit 0, `.tmp-p5-058-slice6-typecheck-handoff.log` |
| Lint | Toàn repository PASS trước lượt chỉnh cuối; Web cuối PASS exit 0, `.tmp-p5-058-slice6-lint-handoff.log` |
| Static UI/PWA | PASS exit 0, `.tmp-p5-058-slice6-static-handoff.log` |
| Ảnh/accessibility | 25 ảnh, năm trang × 320/375/414/1366/1440, `tests/e2e/test-results/p5-058-slice6`; không tràn ngang trang; reduced motion, Tab/focus form tài khoản, axe không serious/critical trên năm trạng thái mock |
| Diff/staging | PASS `git diff --check`; staged list rỗng; `.git` chỉ đọc, giữ thay đổi cho điều phối viên commit |

40 unit mới kiểm tra lỗi 4 route quản trị × 4 status, 4 status health, 4 status preview mẫu, 4 status create policy giữ nháp/không tự POST lại; bảy kết quả tra cứu và unknown `constructor`, grant future/expired/revoked, thiếu quyền nhạy cảm dù chức danh hiệu trưởng, counter chưa xác định, filter/evidence audit và HTTP 200 có applied=false không báo thành công. Assertion không lộ lỗi dùng `textContent` để kiểm cả nội dung đóng mặc định. Các unit hiện hữu giữ nguyên assertion payload, snapshot/refetch/403/ABA, phân trang, exact adapter/revision/allowedActions và quyền kép xóa; chỉ đổi assertion copy tương ứng.

Lượt toàn Web đầu **716/716 PASS**, 44 file, 154,41 giây, `.tmp-p5-058-slice6-unit-full.log`; sau đó sửa câu blocked preflight và bổ sung regression cho applied=false, scoped bàn giao **152/152 PASS**. Lượt toàn Web cuối sau thay đổi này **717/717 PASS**, 44/44 file, 154,66 giây, `.tmp-p5-058-slice6-unit-handoff.log`; không có failure ở cả hai lượt toàn bộ.

Lịch sử kiểm tra được giữ: các lượt scoped đầu thất bại ở assertion nhãn cũ, rồi một assertion trùng heading/paragraph sau khi dịch RESOLVED. Đã cập nhật locator/nhãn, không bỏ assertion nghiệp vụ. Lượt 150 PASS/1 FAIL có lần chờ heading đăng nhập 401 timeout 1 giây ở module lazy khi chạy cùng E2E; tăng thời gian chờ riêng heading trong test lên 5 giây, không đổi retry/timing ứng dụng. Typecheck phát hiện ba option `exact` của Playwright dùng nhầm trong Testing Library; đã bỏ option không hợp lệ. Static UI phát hiện hai chuỗi nguồn có jargon bị cấm trong mapping; đã chuyển sang mapping theo key cấu trúc, giữ gate nguyên vẹn.

Playwright lượt đầu 5 PASS/2 FAIL: locator trúng option ẩn và public-health 401 loading do cache purge. Đã scope locator tới cell, sửa presentation của 401 và giữ test thực tế. Lượt sau 6 PASS/1 FAIL do fixture version `1.0.0` không khớp adapter production `v1`; sửa fixture, không nới adapter guard. Lượt cuối 7/7 PASS. PowerShell có thể in NativeCommandError do React/NO_COLOR stderr; số PASS dựa vào summary runner và exit được đọc bằng `$LASTEXITCODE`, không nhập nhằng với lần test fail.

Đã xem ảnh Users 414, Capabilities 320, BusinessConfiguration 1366, Audit 375, SystemStatus 1440. Tiếng Việt đọc rõ, focus có viền; bảng dài giữ cuộn ngang trong vùng bảng. Mã quản trị/truy vết có mục đích vẫn hiện; native date/datetime theo locale Chromium có placeholder kiểu Mỹ, không thay cơ chế nhập ngày của trình duyệt. Đây là Chromium giả lập kích thước Android với API mock, không phải Android thật hoặc dữ liệu production.

## Đồng bộ, giới hạn và bàn giao

Đã cập nhật năm dòng thật trong PAGE-LABEL-AUDIT cùng bảng đường hiển thị, CURRENT-PROJECT-STATUS, TASK-REGISTER, T57, yêu cầu và báo cáo này. **25/35 module đã audit toàn file; 10 module còn cần audit toàn file.** Giữ **IN_PROGRESS**, PR draft; mọi nghiệm thu A/C/D còn mở trong task, không tạo orphan deferral. Product baseline/ADR/README/roadmap/project context không thay vì không đổi authority hoặc claim nghiệp vụ.

Chưa có E2E backend thật cho mọi mutation nhạy cảm/race hoặc metadata toàn domain, persona đầy đủ, Android thật/zoom 200%, CI cho working tree mới và independent GitHub review. Bộ mapping exact copy không tự tuyên bố bao phủ catalog text mới do backend bổ sung. Baseline CI không thay thế các gate này.

Không tạo nhánh/PR, không stage/commit/push hoặc dùng GitHub mutation để vượt sandbox, không merge/deploy. Điều phối viên kiểm tra diff và commit một checkpoint scoped trên đúng nhánh/PR hiện hữu, rồi chạy CI/review độc lập. Commit gợi ý: `feat(web): clarify admin Vietnamese UX (P5-058 slice 6)`.


Tập bàn giao: 18 file gồm 5 page, 6 unit (5 hiện hữu + 1 mới), 1 Playwright và 6 docs; không có file ngoài phạm vi. HEAD không đổi vì chưa commit/push.

Bàn giao cuối: remote main/task và local HEAD đọc lại không đổi; `git diff --check` exit 0, staged list rỗng, đúng 18 file thay đổi, không có diff trong apps/api, prisma, packages, scripts, .github hoặc DESIGN.md. Đã dừng phiên Vite local do phiên này khởi chạy; không chạm dịch vụ khác. Không có blocker kiểm thử local; xuất bản checkpoint vẫn cần điều phối viên vì `.git` chỉ đọc, tiếp đó CI/review độc lập theo gate.
