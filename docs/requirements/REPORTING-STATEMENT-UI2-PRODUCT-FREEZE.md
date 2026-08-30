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

`local candidate → push → independent GitHub review → PR → exact-head CI → merge → post-merge main CI → CLOSED / GREEN`

## Explicit non-scope

Không truy cập production DB/VPS/credentials/data; không deploy; không thay đổi persistence, canonicalizer, projection, lifecycle, migration, capability semantics hoặc requestKey unit authority. Local không có certified isolated test database phải ghi `REAL POSTGRES PLAYWRIGHT: NOT RUN`.
