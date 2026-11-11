# P5-057 / WS1-B — B2 kiểm chứng độc lập hợp nhiều nguồn quyền

**Ngày:** 10/11/2026. **Nền:** `main@7ae2f1915ad0ec07149364028773fa9c1b7cca90` sau PR #279. **Phạm vi:** TEST-ONLY / B2 SHADOW, không mở writer, API hay evaluator. **Trạng thái P5-057/T56:** IN_PROGRESS.

## 1. Vì sao đây là chốt tiếp theo

PR #278 đã đưa bộ đọc bằng chứng B1 bất biến vào backend. PR #279 đã gắn **thống kê ADVISORY_ONLY** vào preflight mà **không xác thực quyền nguồn** hoặc cho phép lệnh bổ nhiệm/miễn nhiệm. Thuật toán có sẵn `grant-source-coverage-planner.ts` trả `REVIEW_ONLY` khi được cấp dữ liệu giả lập `provenanceVerified=true`, và `BLOCKED` khi nguồn chưa được xác thực.

Trước khi thiết kế writer B2, phải chứng minh việc kết thúc một nguồn không làm mất quyền được một nguồn khác hỗ trợ; thời điểm hiệu lực theo khoảng nửa mở `[from, until)`; dữ liệu không rõ nguồn phải fail-closed. Không đổi thuật toán hoặc thêm engine thứ hai nếu không có chứng cứ lỗi.

## 2. Kiểm thử mới

Tệp duy nhất chứa logic mới: `apps/api/test/capabilities/grant-source-coverage-oracle.spec.ts`.

- Bộ **oracle độc lập**, dựng số liệu gốc theo các khoảng thời gian và tính tập nguồn đang hoạt động ở mỗi thời điểm, không gọi lại thuật toán production để xác định đáp án.
- Một tập dữ liệu 3 nguồn thể hiện khoảng mất quyền tương lai khi nguồn độc lập hết hạn và có nguồn hỗ trợ khác bắt đầu sau một khoảng trống.
- Mẫu hai chức trách và một `teacher-base`: kết thúc cả hai chức trách không chấm dứt quyền độc lập.
- **500 vòng sinh ca bằng seed cố định `0x5a172026`**, kiểm tra trên **hơn 300** bộ dữ liệu hợp lệ; lấy mẫu tại ranh giới sự kiện, ngay trước và ngay sau ranh giới; so sánh `before`, `after`, `losingCoverage`, `retainedByOtherSources`. Kiểm tra khoảng không giao nhau, sort, coalescing và không thay đổi input.
- Trường hợp `provenanceVerified=false`, legacy unknown và nguồn đã hết hạn tại thời điểm confirm bị chặn; planner luôn `canConfirm=false` và không có API ghi.

## 3. Bằng chứng và giới hạn

- **2 Jest suites, 14/14 PASS**: 9 ca B2 hiện hữu + 5 ca oracle; isolated transform tạm được dọn sau test.
- **TypeScript strict: PASS** đối với planner và oracle test.
- Dữ liệu chỉ là giả lập trong bộ nhớ, **không kết nối production/VPS/PostgreSQL thật** ở PR này. Các fixture transaction PostgreSQL 16/17 B1/CAS đã tồn tại trong repo; không chạy lại môi trường không cần thiết.
- Test mới **không chứng minh** dữ liệu `GrantSource/Revision/Support` đọc từ production đầy đủ hoặc được xác thực, và không cho phép chuyển `provenanceVerified` từ false thành true.
- Không có writer D2/D3, endpoint bổ nhiệm/miễn nhiệm, thay đổi capability, revision, schema, data migration, UI, TLS, Nginx, scheduler, auto-deploy hoặc dịch vụ Nội trú.
- Nếu chạy CI GitHub, chỉ công bố trạng thái exact-head sau khi có kết quả; không suy đoán CI đã xanh.

## 4. Gate tiếp theo, KHÔNG tự kích hoạt

1. Hoàn thiện **chứng minh nguồn từ server** cho từng coordinate: bản ghi liên kết actor/target/seat/scope, revision mới nhất, support theo khoảng, status `UNKNOWN_PROVENANCE` khi thiếu/legacy.
2. Hoàn thiện ma trận **9 capability nhạy cảm** và chính sách actor/target/scope được phê duyệt; generic grant/revoke không được vượt luồng chuyên môn.
3. Chỉ sau đó mới thiết kế một writer dùng B1 union, idempotency key, CAS/lock, audit cùng transaction, hồi quy PostgreSQL 16/17 và UAT đúng 7 persona.
4. Giữ nguyên nguyên tắc **một nhánh – một commit – một PR**, CI exact-head, không thay đổi auto-deploy; không tuyên bố WS1 hoàn thành nhờ kiểm thử thuật toán.

**Liên kết quản trị:** `P5-057` / `T56`, `docs/tasks/P5-057-FOUR-STAGE-OPERABILITY-EXECUTION-PLAN.md`, `docs/requirements/P5-057-WS1-D2-D3-GRANT-SOURCE-TRANSFER-DESIGN-20261107.md`, `docs/requirements/P5-057-WS1-PO-ACCOUNTABILITY-SIMPLIFICATION-20261108.md`.

## 5. Independent review and current merge gate (updated 11/11/2026)

Historical read-only attempts (Codex AGENT_PIN_REQUIRED, Antigravity AGENT_TIMEOUT) did not constitute successful review.

The test-only branch was rebased, without conflict, onto main@ce1124037a0c007f93bc67c6e0abd773a87d2b72 after PR #281 was merged and deployed. Local validation after rebase: 2 targeted Jest suites, 14/14 PASS; strict TypeScript over planner and oracle PASS. Temporary isolated-Jest configuration was deleted.

Antigravity independent READ-ONLY review task cd9f20dc-a10c-4fbf-b3b5-5da7646fa2d1: COMPLETED, REVIEW_PASS. The agent read the entire production planner (168 lines) and oracle test (226 lines) using native file reads without terminal commands; changedFiles=[] and inventory audit complete. Review covered mathematical independence, event boundaries, multiple supporting sources, provenance fail-closed and writer inactivity. An initial overly broad terminal-assisted review task 2f28d52d-f94e-410c-b25b-0e1eb5a3767f failed with AGENT_PERMISSION_DENIED; it was not counted as review evidence.

Review is now PASS; however **exact-head GitHub CI and independent PostgreSQL-16 compatibility must be GREEN before merge**. This is still a DRAFT PR. No business authority, provenance writer, evaluator, API, migration, UI or production database is changed. P5-057/T56 remains IN_PROGRESS, and P6-050 remains gated.
## 6. CI #928 environment-only correction (11/11/2026)

GitHub Actions CI #928 on head 3ee46cf3cd0e264ce0c1e430958aef0fc4cc44db failed on both initial attempt and single failed-job rerun. All lint, typecheck, unit, integration and builds passed; PostgreSQL-16 off-host compatibility #110 passed. Both CI failures occurred only at `npx playwright install --with-deps chromium`: Ubuntu 26.04 runner could not resolve Ubuntu package DNS when apt attempted to fetch 9 font packages (exit 100).

Only `.github/workflows/ci.yml` was updated to pin the existing CI job to `ubuntu-24.04` and use `npx playwright install chromium` without the apt `--with-deps` operation. E2E execution, screenshot artifact requirements, all business tests, PostgreSQL jobs and production deployment workflows remain unchanged. GitHub officially announced the gradual `ubuntu-latest` migration to Ubuntu 26.04 in October-November 2026.

Local verification before pushing: YAML parsed with js-yaml and asserted both runner labels, the Playwright install command, unchanged Windows job; `node scripts/ci/verify-workflow-contract.cjs` PASS; `git diff --check` PASS. No claim of CI green before exact-head runs complete. This is an environment compatibility change, not a production runtime modification. Keep PR in DRAFT pending exact-head CI and PostgreSQL16 verification plus owner merge approval.