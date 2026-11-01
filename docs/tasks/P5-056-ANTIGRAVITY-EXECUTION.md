CÔNG CỤ THỰC THI: ANTIGRAVITY IDE

# P5-056 / T55 — Triển khai Trung tâm thông báo trong ứng dụng và Web Push

**Nguồn thực thi:** laptop DEVELOPMENT, repository `hvtnguyenson-code/baogiang-damsan` đã checkout sẵn; không tạo thư mục dự án mới. 
**Baseline chính xác:** `origin/main@088041952796e9628ae7aeed1026393525e35705` (SYNC-P5-056A CLOSED, parent CI #852 và deploy #28 SUCCESS).
**NHÁNH DUY NHẤT:** `feat/p5-056-notification-center-webpush` (ChatGPT đã tạo trên GitHub từ baseline và cập nhật status/handoff).
**Truy vết/phụ thuộc:** P5-056A CLOSED; ADR-059 ACCEPTED; T55 RESTORE cho runtime; P5-057/P6-050 vẫn chặn. Chỉ P5-056, không mở thêm task/branch/PR thừa.

## 1. Preflight bắt buộc (STOP nếu không đạt)

- Đọc toàn bộ `AGENTS.md`, `docs/governance/P5-050-EXECUTION-PROTOCOL-ANTIGRAVITY-CODEX.md`, `docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`, `PRE-PILOT-TASK-REGISTER.md`, `CURRENT-PROJECT-STATUS.md`, `PRE-PILOT-TRACEABILITY-MATRIX.md`, `PRE-PILOT-PRODUCT-BASELINE.md`, `docs/requirements/P5-056-NOTIFICATION-CENTER-WEB-PUSH-IMPLEMENTATION.md`, `docs/requirements/P5-056A-NOTIFICATION-CENTER-WEB-PUSH-ARCHITECTURE.md`, `docs/decisions/ADR-059-INAPP-NOTIFICATION-WEB-PUSH.md`; trước UI đọc **đầy đủ** `DESIGN.md` và `.codex/skills/damsan-ui/SKILL.md`.
- Chỉ làm trên đúng existing local clone Báo giảng; kiểm tra `git remote -v`, `git status -sb`, untracked, branch, `git fetch origin --prune`, exact `origin/main`. Nếu local changes/user work hiện hữu, STOP và báo, không stash/reset/clean/force.
- `origin/main` phải đúng baseline nêu trên (nếu đã đổi phải báo ChatGPT, không tự rebase). `git switch --track origin/feat/p5-056-notification-center-webpush` khi branch local chưa tồn tại; nếu đã tồn tại thì kiểm tra ancestry/HEAD, không ghi đè. Đọc trạng thái IN_PROGRESS/handoff trên branch trước chỉnh code.
- KHÔNG thao tác VPS, cấu hình production, `C:\baogiang`, Nginx, PostgreSQL production, hệ thống Nội trú/DamSanV5; không in hay đọc `.env`, password, secret, dump. Không deploy/migrate lên production.

## 2. Hiện trạng nguồn đã đối chiếu tại baseline

- NestJS API: `apps/api/src/app.module.ts`, `apps/api/src/auth/{auth.controller.ts,auth.module.ts,session-auth.guard.ts,csrf-origin.guard.ts}`, `apps/api/src/authorization/{capability-authorization.service.ts,capability.guard.ts}`, `apps/api/src/config/app.config.ts`, `apps/api/src/prisma/`; PostgreSQL source `prisma/schema.prisma`, migrations có sẵn. `WEB_PUSH_ENABLED` đang chỉ là flag thô, không chứng minh Web Push đã tồn tại.
- Domain hiện hữu: `apps/api/src/reporting-statements/`, `apps/api/src/reporting-projection/`, `apps/api/src/operational-overlays/`, `apps/api/src/telegram/`; `TelegramNotificationDelivery` là kênh độc lập; `apps/api/src/common/ports/ai-ports.ts` chứa khung port, không phải feature.
- Web: `apps/web/src/App.tsx`, `apps/web/src/layouts/AppLayout.tsx`, `apps/web/src/lib/navigation-registry.ts`, `apps/web/src/lib/api-client.ts`, `apps/web/src/pwa/pwa-manager.tsx`, `apps/web/vite.config.ts`; VitePWA Workbox `generateSW`, `/api` phải NetworkOnly.
- **Không tự giả định** các event ứng viên trong spec đã hiện hữu. Phải tìm exact nguồn command/transaction, khả năng theo resource và capability thực tế trước khi phát thông báo; nếu không có evidence, không tự bắn event.

## 3. Phạm vi cấp phép rõ ràng cho một task P5-056

**A — PostgreSQL + backend canonical inbox:** cập nhật `prisma/schema.prisma`, thêm migration Prisma Migrate có kiểm thử trong PostgreSQL test cô lập. Bản ghi `InAppNotification` riêng theo user + event identity, unique dedupe per recipient, readAt khác resolvedAt authoritative; indexes + integrity và retention an toàn. Internal publisher chỉ sau committed domain event, idempotent transactional/outbox hoặc durable evidence/reconciler; không có publication API phía client. Chứng minh quyền lúc tạo và khi đọc/list/count/action kể cả revoked/locked/resource stale. Dùng `SessionAuthGuard`, `CsrfOriginGuard`, exact current capability/scope evaluator thay vì tự chế RBAC.
**B — Push:** multi-device `WebPushSubscription` (endpoint/keys at-rest encryption, key rotation plan, max 5 active/user), `WebPushDelivery` unique+lease+retry/dead-letter, provider error 404/410/429/5xx/timeout, không assume exactly-once send; VAPID/env server secrets, fail-closed config khi bật; OFF vẫn giữ inbox. Không dùng chung bảng/identity Telegram. Logout/account change thiết bị dùng chung phải revoke old subscription server-side dù browser unsubscribe thất bại.
**C — Same-origin API + Web UI:** `/api/notifications` list/cursor/count/read/action/config/subscriptions theo P5-056A, origin/CSRF/no-store, no cross-user leaks; payload Push generic và same-origin allowlisted click. Trang `/thong-bao` cùng app shell, icon/badge số thật, tiếng Việt, phân biệt chưa đọc và nguồn xử lý, keyboard/màn hình 320/375/414 px, empty/loading/offline/error và 200% zoom. Browser permission chỉ xác định tại client, yêu cầu direct gesture, opt-out độc lập inbox. Không làm giả nội dung hoặc route/capability.
**D — PWA/Workbox:** giữ nguyên network-only `/api`, hiện trạng update/install/no offline mutation; muốn thay `generateSW` sang `injectManifest` phải kiểm chứng ảnh hưởng và báo trước nếu cần ADR change. Không giấu JS listener trong file không được build, không cache payload nhạy cảm.
**Allowed code surfaces:** `prisma/schema.prisma`, new migrations under `prisma/migrations`, `apps/api/src/notifications/**` mới, các auth/app/config và source-domain service **chỉ nơi cần tích hợp sự kiện có thật**, `packages/contracts/src/**`, `apps/web/src/**` liên quan route/layout/inbox/PWA, `apps/web/vite.config.ts` và tối thiểu `package.json`/lockfile nếu cần dependency; tests cho mỗi phần. Task status/governance trên **chính nhánh này**.

## 4. Bất biến cấm thay đổi

- Không đụng Nội trú: cổng 3000, DB, PIDs, service/task và Node process của Nội trú; không restart shared Nginx hoặc PostgreSQL. Báo giảng production API 3100, DB port 5434; **không kết nối production** trong phát triển.
- Không schema migration/reset/db push production; không chạy lệnh migration ngoài PostgreSQL test; không đổi cơ chế auth/capability scope ngoài tích hợp tối thiểu đã chứng minh và test âm tính.
- Không tự sửa .github CI/CD/workflows, deploy script, Business Configuration secrets, TLS; không push private keys/VAPID secrets/cookies/endpoints trong source/tests/logs.
- Không gộp event giả, không dùng thông báo làm bằng chứng phê duyệt, không coi click/mark-read là handled, không sửa business workflow/source ledgers.
- Không tự merge, không deploy, không tạo branch khác, không force-push/rebase/reset/clean/stash/amend. Không tăng tài nguyên quá mức trên VPS chung.

## 5. Cổng kiểm thử bắt buộc trước push

- Unit: event registry/recipient/routing, sanitizer, deterministic dedupe, read vs resolved, retention, retry policy, Workbox/no-cache.
- PostgreSQL integration **isolated**: migrations, FK, concurrent inserts = 1 inbox row/recipient/event, source rollback not published, outbox crash/lease/replay, 404/410, 429/5xx, missing source and rollback behavior.
- Security negative: another account 404 on list/read/count/actions/subscriptions; lost capability/locked account/stale scope cannot leak content or counts; forged event rejected; off-origin redirect/CSRF/SSRF blocked; shared-device logout/account-switch and unsubscribe network failure.
- Workbox/PWA runtime: API NetworkOnly, old/new SW update, notificationclick same-origin, generic Push payload. In-app inbox must remain operational without Push, without PWA install and without Telegram.
- Repo commands: `git diff --check`, focused lint/typecheck/unit/integration, Prisma generate+validate, web build/tests, API build/tests; chạy full repo regression theo workspace scripts; nêu rõ test nào chưa thể chạy và lý do. Test vật lý không có máy thật thì ghi unverified; không tự coi browser mock là Android/iOS UAT.
- Trước push kiểm tra diffs và stage files; **đẩy 1 checkpoint có ý nghĩa** lên branch duy nhất, tránh từng commit nhỏ tốn CI. Chuyển task register và current status sang `IN_REVIEW` **chỉ sau code/test readiness**, cập nhật T55 theo mức triển khai thực.

## 6. Kết quả bắt buộc để ChatGPT review

1. Push branch `feat/p5-056-notification-center-webpush` lên origin; tạo tối đa **một PR sang main** khi đã có code/test checkpoint đủ nghĩa.
2. Báo cáo tiếng Việt: exact HEAD/base SHA, PR URL, danh sách tệp thay đổi, bảng unit/integration/E2E PASS/FAIL/SKIP, migration rollback plan, config/env flags (không có secret), quyền/capability/event mapping chứng minh từ source, tình trạng SW, rủi ro và blocking conditions.
3. **STOP** sau push/PR để ChatGPT đối chiếu GitHub diff và CI. Không merge/deploy production dưới mọi hình thức. Nếu schema migration cần chạm production hoặc domain event chưa được xác nhận, dừng và nêu blocker cụ thể; không suy diễn.

**Ghi chú điều phối:** ChatGPT đã dựng nhánh/handoff trên GitHub, nhưng không thể gọi thực thi Antigravity CLI qua MCP hiện tại (`EXECUTABLE_UNAVAILABLE`); prompt này chỉ bắt đầu khi người vận hành mở Antigravity IDE trên laptop và giao tệp. Không tự nhận đã chạy.
