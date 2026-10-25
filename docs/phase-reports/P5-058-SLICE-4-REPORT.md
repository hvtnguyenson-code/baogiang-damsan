# P5-058 — Báo cáo lát cắt 4: luồng giáo viên

Ngày 24/10/2026. Công cụ thực thi CODEX theo chỉ thị người dùng; một nhánh `feat/p5-058-frontend-vietnamese-ux`, PR #249 DRAFT. Task P5-058/T57 tiếp tục IN_PROGRESS; dependencies P5-050/P5-052/P5-053 CLOSED; không mở task phụ hoặc nhánh khác.

## Baseline và quyền thay đổi

- Repository `D:\baogiang-damsan`, working tree sạch khi bắt đầu.
- HEAD/local/remote nhánh: `8ae0e9ebed0c1a880a0023d804008b2f36f7d6d0`; main trực tiếp remote và GitHub: `ea80f078c8a1297c562c8f4319540e3417d6e651`.
- GitHub PR #249 open/draft, đúng head/base. CI baseline #832, run `40079434301`, SUCCESS; đây không phải CI cho thay đổi local.
- `git fetch origin` không ghi được `.git/FETCH_HEAD`; xác minh SHA bằng `git ls-remote` và connector GitHub đọc PR/workflow. Không dùng GitHub create_tree hoặc cơ chế ghi thay thế.
- Đã đọc AGENTS.md, DESIGN.md, damsan-ui, yêu cầu/audit P5-058 và các authority governance. Chỉ frontend/presentation/test/docs; giữ route/API/payload/auth/RBAC/read model, trạng thái nghiệp vụ và điều kiện thao tác. Không backend/schema/dependencies/CI/CD/VPS/nội trú, không merge/deploy.

## Thay đổi và kết quả review cục bộ

Năm trang được đọc toàn file: EffectiveSchedule, TeachingOperations, MakeupScheduling, HistoricalTeaching, Profile. Dùng lại ErrorFeedback qua WorkflowError để giữ HTTP status mà không hiển thị message/serverError. Mapping lịch sử đã đối chiếu parser/service, mapping buổi/thành phần chương trình có fallback chưa xác định; giữ severity/count/canConfirm. Lịch bị chặn không được diễn giải là trống. Hồ sơ không in lỗi nhà cung cấp Telegram hoặc enum giao nhận; UNKNOWN/FAILED vẫn là lỗi gửi, không suy thành SENT. Tên thiếu được nói rõ, không dùng UUID để giả làm tên.

Chỉ báo tải lịch dạy bù riêng sửa việc init-year finally tắt busy sớm trong khi lịch còn pending. Đây là trạng thái trình bày; không sửa quyết định nghiệp vụ hoặc cơ chế request, khóa nguồn, idempotency/CAS, quyền hay payload.

Các màn hình giữ cấu trúc hiện hữu: tiêu đề → phạm vi tuần/ngày/năm → trạng thái tải/lỗi/rỗng → dữ liệu và thao tác được phép. Lưới lịch co theo chiều rộng, nhóm nút đồng nghiệp xuống dòng. Không thay theme/font/primitives/tokens.

Kiểm tra trực tiếp diff xác nhận không có file trong backend/prisma/packages/.github. Test hồi quy giữ kiểm tra canonical occurrence key, subject scope, payload và form cũ bị chặn khi reload; không chỉ thay assertion để bỏ kiểm tra nghiệp vụ. Agent tự review chỉ là bằng chứng hỗ trợ, không thay independent review GitHub.

## Kiểm chứng

| Kiểm tra | Kết quả / bằng chứng |
| --- | --- |
| Web typecheck | PASS (exit 0); `.tmp/p5-058-slice4-typecheck.log` |
| Web lint | PASS, không cảnh báo (exit 0); `.tmp/p5-058-slice4-lint.log` |
| Unit tập trung | 51/51 PASS, 5 file; `.tmp/p5-058-slice4-targeted3.log` |
| Unit toàn Web | 653/653 PASS, 42/42 file, 209,25 giây với `--maxWorkers=2 --minWorkers=1`; `.tmp/p5-058-slice4-unit-bounded.log`. Lượt worker mặc định trước đó 643 PASS / 10 FAIL, gồm timeout 5 giây và chờ phần tử tại users/capabilities/reporting (log đã đọc). Giới hạn worker giải quyết lần chạy này; không sửa test ngoài phạm vi hoặc tăng timeout, chưa khẳng định mọi runner mặc định ổn định |
| Playwright slice 4 | 6/6 PASS (35,3 giây); `.tmp/p5-058-slice4-playwright.log` |
| UI/PWA static | PASS; `.tmp/p5-058-slice4-ui-static.log` |
| Ảnh và accessibility | 25 ảnh mock ở 320/375/414/1366/1440, không tràn ngang; reduced motion; Tab/focus bộ chọn đồng nghiệp; axe không có serious/critical trên năm trang ở 1440 |
| git diff --check | PASS; staged list ban đầu rỗng |

Unit mới kiểm tra HTTP 401/403/409 trên lịch dạy/điều hành/lịch sử; preview lịch sử có issue/mã nội bộ cố ý, buổi và chương trình tiếng Việt; confirm 409 một POST đúng payload; Telegram UNKNOWN không lộ provider error; lịch dạy bù pending/403 không giả thành empty; fallback không nhận thuộc tính prototype. Playwright kiểm tra 401 đi theo session boundary về đăng nhập, 403/409 có hành động, chặn raw reason/finding, profile POST 409 đúng requestKey và không tự retry, context pending → không có tuần, route guard vẫn từ chối khi thiếu grant.

Ảnh sinh tại `tests/e2e/test-results/p5-058-slice4` (không commit artifact). Đã nhìn ảnh lịch 320, lịch bù 1366, lịch sử 375, hồ sơ 1440, điều hành 414: không overflow, tiếng Việt rõ; tiêu đề/trạng thái lịch 320 còn sít với tên dài, cần nghiệm thu lịch dày. Đây là desktop Chromium giả lập viewport Android với API mock, không phải Android thật hoặc dữ liệu vận hành thật.

## Phạm vi chưa nghiệm thu và đồng bộ tài liệu

Audit từng trang và từng đường còn mở: `P5-058-PAGE-LABEL-AUDIT.md`, phần Lát cắt 4. Có 15/35 module đã đọc/audit theo các lát cắt; 20 module vẫn cần audit toàn file. Các panel nhúng DispositionPreviewPanel/OperationalHistoryPanel, lịch dày/so sánh/toàn trường đông giáo viên, tên tài nguyên/giáo viên thiếu trong read model, phần mapping issue chưa chuyên biệt, E2E tạo/thay thế/hoàn tác/đối soát và Telegram thật vẫn nằm trong A/C/D của P5-058. Ghi chú mặc định thay thế lịch bù còn chứa mã lịch để bảo toàn nội dung payload hiện hữu; chưa coi trang này Việt hóa toàn diện.

Đồng bộ register + CURRENT-PROJECT-STATUS + T57 + yêu cầu + per-page audit trong cùng checkpoint. Giữ IN_PROGRESS vì PR vẫn draft, checkpoint chưa phải toàn task IN_REVIEW. Không sửa Product Baseline/ADR/roadmap/README/PROJECT_CONTEXT vì không thay authority hoặc claim nghiệp vụ; giữ T51/T52. Không tạo deferral ra ngoài task, không đóng P5-058 hoặc dùng baseline CI thay CI exact-head mới.

## Trạng thái bàn giao

Các kiểm tra local cuối đã đạt. Thử `git add --` đúng 17 file bị chặn: `fatal: Unable to create 'D:/baogiang-damsan/.git/index.lock': Permission denied`. Không có file nào được stage, không tạo commit, không push, không gọi GitHub create_tree hoặc xin cơ chế ghi vượt sandbox. Giữ nguyên 17 file tại working tree để điều phối viên tạo **một commit scoped** và push lên nhánh hiện hữu.

HEAD local/remote cuối vẫn `8ae0e9ebed0c1a880a0023d804008b2f36f7d6d0`, main remote vẫn `ea80f078c8a1297c562c8f4319540e3417d6e651`; nhánh hiện tại 5 commit ahead / 0 behind main, 0/0 với remote task. CI #832 chỉ thuộc baseline. Không có CI/review độc lập cho working tree mới; P5-058 còn IN_PROGRESS, PR #249 draft, chưa merge/deploy.

Tập file bàn giao:

- Năm trang trong `apps/web/src/pages`: EffectiveSchedulePage.tsx, TeachingOperationsPage.tsx, MakeupSchedulingPage.tsx, HistoricalTeachingPage.tsx, ProfilePage.tsx.
- Hai helper: `apps/web/src/components/ui/workflow-error.tsx`, `apps/web/src/lib/teaching-workflow-presentation.ts`.
- Ba unit file: `apps/web/src/__tests__/teacher-workflow-vietnamese.test.tsx`, `apps/web/src/__tests__/makeup-scheduling-page.test.tsx`, `apps/web/src/__tests__/pages/ProfilePage.test.tsx`.
- Playwright: `tests/e2e/specs/p5-058-teacher-workflows.spec.ts`.
- Sáu tài liệu: CURRENT-PROJECT-STATUS, PRE-PILOT-TASK-REGISTER, PRE-PILOT-TRACEABILITY-MATRIX, P5-058-FRONTEND-VIETNAMESE-UX, P5-058-PAGE-LABEL-AUDIT và báo cáo này.

Commit gợi ý: `feat(web): standardize teacher workflow Vietnamese (P5-058 slice 4)`. Trước push, điều phối viên kiểm tra đủ năm file mới trong staged list và diff scoped; không tạo nhánh hoặc PR thay thế.
