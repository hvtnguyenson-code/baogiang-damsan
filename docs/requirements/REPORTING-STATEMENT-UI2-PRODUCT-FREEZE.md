# Reporting Statement UI-2 — Product Freeze

## Status

**Candidate.** Baseline là `origin/main` tại `4deb384bd57cbe45c2fa7bc44a8764c2942c3402`. Tài liệu này không tuyên bố CLOSED/GREEN, không cho phép merge, deploy hoặc migration production.

## Authority và scope

UI-2 tuân thủ `DESIGN.md`, UI-1 Product UI, Core Backend Freeze, UI Enablement Closure và các contracts Reporting Statement đã khóa. Phạm vi là fixture Playwright database an toàn, browser E2E cross-role thật, coverage visual deterministic, CI wiring và hồ sơ closure. Không thay đổi domain, Prisma schema/migration, authorization policy, API public contract hay product behavior.

## Cross-role executable matrix

`tests/e2e/setup/reporting-statement-business-fixture.cjs` chỉ chạy trong GitHub Actions của repository canonical, với `NODE_ENV=test`, CI contract đầy đủ, `TEST_DATABASE_URL` loopback và database chính xác `baogiang_test`. Fixture additive, từ chối reuse/overwrite tài khoản test và không seed trực tiếp Reporting Statement revision.

`tests/e2e/specs/reporting-statement-business.spec.ts` chạy không mock `/api/**` và kiểm chứng:

- teacher đăng nhập UI thật, preview PASS, responsibility/counts, submit UI, owner read frozen detail;
- subject reader A đọc được frozen subject A, reader B không thấy và direct read bị từ chối fail-safe;
- approver đọc evidence trước history trước action, xác nhận approve, queue refresh và owner terminal read;
- stale approver UI gặp `409` từ real backend CAS, khóa action cũ, refetch và báo “Báo cáo đã có trạng thái mới”.

## Visual và accessibility evidence

Visual fixture mocked vẫn tách khỏi business E2E để ổn định screenshot. Matrix gồm personal PASS (375×812, 1366×768, 1920×1080), approval detail (375×812, 1366×768), accessible list (375×812, 1366×768), pending queue (375×812, 1366×768). PNG sinh dưới `tests/e2e/test-results/ui-foundation/reporting-statement-ui/` và không commit.

Mỗi major route family chạy axe WCAG A/AA, kiểm serious/critical violations, page overflow 320/375/414 và touch target tối thiểu 44px. Visual review phải kiểm rail basalt có nghĩa cấu trúc, Vietnamese typography, mobile one-column, local table overflow, evidence-before-action và không có template/dashboard treatment.

## CI requirement và progression

Workflow canonical migrate/seed database Playwright cô lập, bootstrap fixture trước khi khởi động API/Web và `Run Playwright smoke tests` chạy cả live business spec lẫn visual fixture. Kết quả PostgreSQL/business authoritative chỉ đến từ GitHub CI.

CI #285 đã PASS các gate security/static, migration, lint/typecheck, unit, PostgreSQL integration, build, isolated Playwright database, Reporting Statement fixture bootstrap và API/Web startup. Bước Playwright thất bại ở ba điểm thuộc hai nhóm test/infrastructure: hai business tests dùng global text locator cho label counts xuất hiện hợp lệ ở cả tổng hợp và evidence section; test quản trị Phase-01 sau đó gặp `HTTP 429` do mọi Playwright context dùng chung loopback rate-limit key. Correction scope semantic locator theo preview evidence, lifecycle identity và history; riêng process API của Playwright đặt `AUTH_LOGIN_RATE_LIMIT_MAX: '50'` để cô lập suite trong khi limiter, real login, cookie/session và authorization vẫn hoạt động. Không phát hiện product, runtime hoặc domain defect.

CI #286 chạy trên exact head `682bcb657388b07e351f888fde68d75ae885c762` và đã vượt qua các failure #285: không còn `HTTP 429`, preview semantic locator PASS, toàn bộ gate trước browser Playwright tiếp tục PASS. Hai failure còn lại được phân loại là E2E assertion/isolation defects: Reader B assertion chưa khớp public-safe 403 copy “Bạn không còn quyền truy cập khu vực này.”; stale-CAS dùng lại logical series tháng 8 nên phụ thuộc lifecycle của workflow test trước. Correction kiểm denial trong semantic alert, giữ assertion không leak submitter, bắt trực tiếp submit HTTP `201`, và tách workflow series `2026-08-01 → 2026-08-31` khỏi stale-CAS series `2026-09-01 → 2026-09-30`. Không phát hiện product, runtime hoặc domain defect.

`local candidate → push → independent GitHub review → PR → exact-head CI → merge → post-merge main CI → CLOSED / GREEN`

## Explicit non-scope

Không truy cập production DB/VPS/credentials/data; không deploy; không thay đổi persistence, canonicalizer, projection, lifecycle, migration, capability semantics hoặc requestKey unit authority. Local không có certified isolated test database phải ghi `REAL POSTGRES PLAYWRIGHT: NOT RUN`.
