# P5-056A — Kiến trúc Trung tâm thông báo trong ứng dụng và Web Push

**Trạng thái nhiệm vụ:** IN_REVIEW (đề xuất trong nhánh; chưa được phê duyệt/merge)  
**Loại:** kiến trúc DOCS-ONLY; chưa triển khai runtime  
**Phụ thuộc:** P5-050 — CLOSED; **Truy vết:** T55  
**Canonical baseline:** main@1a90f05b08b2ae189628e2a501dc4e5dc30c1af5 (27/10/2026)  
**Nhánh duy nhất:** docs/p5-056a-inapp-notification-webpush-architecture  
**Quyết định đề xuất:** docs/decisions/ADR-059-INAPP-NOTIFICATION-WEB-PUSH.md  
**Implementation successor:** P5-056 (PLANNED, BLOCKED cho đến khi P5-056A CLOSED).

## 1. Thẩm quyền và hiện trạng được kiểm chứng

V1.3 implementation addendum > ADR có hiệu lực > PA-B v1.2 > governance/requirements; prototype chỉ tham khảo. Các nguồn cần tuân thủ: PRE-PILOT-PRODUCT-BASELINE, PRE-PILOT-TRACEABILITY-MATRIX/T55, ADR-007/008 (session, capability), ADR-058 (Telegram), P5-020 (PWA), DESIGN.md và skill damsan-ui. Tài liệu này chốt phương án kiến trúc; các định nghĩa bên dưới là **hợp đồng đề xuất cho P5-056**, không phải API/schema đang hoạt động.

Hiện trạng tại baseline: NestJS/Prisma PostgreSQL, cookie phiên server-owned và capability/scope default-deny; Web React có AppLayout và điều hướng theo công việc; PWA VitePWA/Workbox generateSW với /api network-only, không có thông báo business offline; Telegram chuyên biệt có bảng TelegramNotificationDelivery chỉ cho kênh Telegram; NotificationPublisherPort và PushGatewayPort trong ai-ports.ts chỉ là interface khung; app.config.ts đọc WEB_PUSH_ENABLED nhưng chưa có hệ thống Web Push sử dụng thực tế. Không suy luận rằng các thành phần này đã hiện thực Trung tâm thông báo T55.

## 2. Bất biến khóa (N01–N12)

1. **N01 — Canonical inbox:** mỗi thông báo được lưu PostgreSQL theo **một tài khoản nhận cụ thể**; là nguồn sự thật duy nhất của hộp thư thông báo, tồn tại qua logout/đổi trình duyệt/không có Push.
2. **N02 — Channel independence:** Web Push là phương thức nhắc; Telegram là tích hợp riêng, không thay thế bản ghi, trạng thái hay quyền của inbox. Tắt/lỗi kênh ngoài không làm mất hoặc rollback bản ghi inbox.
3. **N03 — Identity isolation:** userId người nhận luôn do backend quyết định; tuyệt đối không nhận recipientUserId hoặc device owner từ request phía người dùng như một authority; mọi GET/count/read/subscription chỉ tác động tài khoản phiên hiện tại.
4. **N04 — Authorization twice:** xác minh tư cách và quyền truy cập đối tượng nghiệp vụ ở lúc phát sinh **và mỗi lần đọc/count/detail/deep-link**. Quyền bị thu hồi/hết hiệu lực phải ẩn nội dung kể cả bản ghi đã gửi từ trước. Thông báo không cấp thêm capability nào.
5. **N05 — Read != handled:** đã đọc là hành vi xem; đã xử lý chỉ phản ánh trạng thái nghiệp vụ được nguồn authoritative xác nhận, không đồng nghĩa click hay đã đọc. Không có auto-approval/mutation nghiệp vụ do giao hàng.
6. **N06 — Authoritative provenance:** mỗi thông báo có type và sourceKind/sourceId/version; loại sự kiện và liên kết hành động lấy từ allowlist của backend, không từ URL/HTML tuỳ ý.
7. **N07 — Exactly-once persistence, at-least-once delivery:** dedupe bằng unique key theo người nhận và sự kiện; không tuyên bố Push/TG gửi chính xác một lần. Retry idempotent trong DB, có thể thấy push trùng ở lỗi timeout không rõ kết quả.
8. **N08 — PWA security:** mọi /api/** network-only, không Cache Storage/IndexedDB/localStorage/sessionStorage token hoặc business notification; Service Worker không truy xuất cookie, không đưa nội dung nhạy cảm vào payload.
9. **N09 — Privacy first:** chỉ lưu/hiển thị các trường cần thiết; không log endpoint, p256dh/auth, VAPID private key, cookies, raw stack hoặc nội dung nhạy cảm; không đưa secret vào Business Configuration.
10. **N10 — Safe failure:** lỗi Push, offline, hết quyền, session thay người dùng, hết hạn subscription, và lỗi provider đều có luồng thất bại rõ ràng, không fail-open, không làm mất thông báo.
11. **N11 — No new authority:** không tạo parser, phiên bản lịch, PPCT/projection hoặc workflow phê duyệt thứ hai; trạng thái domain luôn được đọc từ dịch vụ sở hữu dữ liệu.
12. **N12 — Environment isolation:** cấu hình, DB, process, Service Worker và keys thuộc Báo giảng; tuyệt đối không thao tác DamSanV5/Nội trú và không thử migration trên DB production trong nhiệm vụ kiến trúc.

## 3. Hợp đồng sự kiện, người nhận và loại thông báo

Chỉ nguồn nghiệp vụ **đã phát sinh sự kiện thành công** mới được xuất sự kiện; không tạo thông báo từ preview, dự đoán hay trạng thái chưa chứng minh. Registry server-owned gắn mỗi loại vào source domain, rule xác định người nhận, loại action, authorization predicate, chế độ handled, dedupe scope và mẫu thông điệp.

Danh mục bước đầu cho P5-056: REPORTING_SUBMITTED (người được ủy quyền xem xét), REPORTING_DECIDED (chủ báo cáo), TEACHING_SCHEDULE_CHANGED (giáo viên thực sự bị tác động), IMPORT_REQUIRES_ATTENTION (người quản trị có quyền nguồn tương ứng). Đây là danh mục **ứng viên cần đối soát event/capability chính xác trong P5-056**, không được tự động phát nếu chưa tìm được event authoritative. Chức năng SELF_TEST không phải sự kiện nghiệp vụ bắt buộc, và Telegram LINK_SUCCESS/SELF_TEST không được tự động sao chép vào inbox.

Envelope chuẩn tách:
- actor/source: eventType; sourceKind; sourceId UUID; sourceRevision hoặc retained event ID; occurredAt (timestamptz); schemaVersion.
- recipient: userId server-resolved; ownerScope/capability predicate theo nguồn; recipient phải ACTIVE, không locked, trong phạm vi thực tế.
- presentation: category (ACTION_REQUIRED, INFORMATION, SYSTEM), priority (NORMAL, HIGH); title ngắn đã khử khuẩn; message template với dữ liệu được phép xem; actionKey và routeParams đã được backend kiểm tra.
- identity: dedupeKey = canonical sourceEventId + eventType + recipientUserId + semanticVersion (hash định dạng cố định); không dựa vào thời điểm nhận, UI request hay body text.

Bước tạo bản ghi phải xác minh exact capability/scope với resourceId của người nhận và nguồn nghiệp vụ; quyền không chắc chắn -> không phát, có số liệu từ chối không lộ dữ liệu. Phát đến nhiều người: một sự kiện dẫn đến N bản ghi riêng biệt, không dùng chung read/handled flags. Khi quyền hết hạn/thay đổi, các bản ghi bị ẩn khỏi API/list/count mà không xoá bằng chứng; re-grant không tự suy đoán người nhận mới, cần sự kiện hoặc reconciliation có quyền, có dedupe.

## 4. Mô hình lưu trữ dự kiến — Prisma Migrate chỉ trong P5-056

### InAppNotification (canonical)
- id UUID PK, recipientUserId FK User RESTRICT, eventType, category, priority, sourceKind, sourceId, sourceVersion?, sourceEventId, dedupeKey, title, bodySafe, actionKey?, actionParamsJson? (allowlisted), createdAt, readAt?, resolvedAt?, stateVersion.
- UNIQUE(recipientUserId, dedupeKey); index(recipientUserId, createdAt DESC, id DESC); index(recipientUserId, readAt, createdAt); index(sourceKind, sourceId). FK source theo domain có thể polymorphic; resolver bắt buộc xác minh sự tồn tại và quyền.
- Không chứa payload nhạy cảm hoàn chỉnh, không có lệnh nghiệp vụ tùy ý; event immutable; readAt là thay đổi trình bày có kiểm soát.

### WebPushSubscription (mỗi installation/browser)
- id UUID, userId FK User RESTRICT, deviceLabel? (không thu thập fingerprint), endpointCiphertext, endpointDigest (unique), p256dhCiphertext, authCiphertext, createdAt, lastSeenAt, revokedAt?, invalidatedAt?, vapidKeyVersion.
- Chỉ server giải mã endpoint/keys để gửi. Key mã hoá at-rest ở server secret manager/runtime environment, có kế hoạch rotation và migration. Unique endpointDigest; không gắn một subscription đang hoạt động cho hai user, chuyển tài khoản phải chủ động revoke/replace sau xác thực.
- Quản lý tối đa **5 subscriptions active/user** mặc định; thay thế theo policy thông báo rõ, không tuỳ tiện xoá inbox.

### WebPushDelivery (outbox & retry)
- id, notificationId FK, subscriptionId FK, dedupeKey theo notificationId+subscriptionId+payloadVersion, status(PENDING, LEASED, SENT, RETRY_WAIT, DEAD, INVALID_SUBSCRIPTION), attemptCount, nextAttemptAt, leaseOwner?, leaseUntil?, lastErrorCode? (sanitized), createdAt, updatedAt, sentAt?.
- UNIQUE(notificationId, subscriptionId, payloadVersion). Index(status, nextAttemptAt), (leaseUntil); retention riêng. Không dùng TelegramNotificationDelivery hoặc bảng liên kết Telegram.
- Xoá user clean-slate theo P5-051 phải được kiểm toán tác động các FK/history; không âm thầm mở rộng quyền hard-delete user vì bảng mới.

Mọi thay đổi schema cần migration tường minh, backfill/rollback và test PostgreSQL cô lập. Không thể dùng Prisma db push hoặc DB VPS để làm thử.

## 5. Command/event transaction và outbox

Với cùng transaction commit nguồn nghiệp vụ nếu khả thi: publish authoritative event -> resolve recipients -> INSERT ... ON CONFLICT DO NOTHING InAppNotification -> enqueue WebPushDelivery cho thiết bị active. Nếu event đến từ domain không thể cùng giao dịch, dùng persisted domain outbox/commit evidence và reconciler có checkpoint; **không phát trước khi nguồn commit**. Retry event không làm sinh thêm notification. Khi ghi DB thành công nhưng Push chưa gửi, hộp thư vẫn còn bản ghi. Nếu không có subscription, không cần delivery row; inbox vẫn hoạt động.

Đọc count/list được thực thi thông qua server-side recipient + current entitlement; không nhận filter tài khoản khác. Không dùng SELECT rồi INSERT không khóa để chống race; rely on unique constraint/transaction. Khi hai worker cạnh tranh, lease atomically (ví dụ PostgreSQL FOR UPDATE SKIP LOCKED hoặc update CAS), chỉ một lease hợp lệ, lease hết hạn có thể được lấy lại. Process crash trước/giữa/sau provider call không làm mất bản ghi; timeout/UNKNOWN có thể dẫn đến gửi trùng, phải được ghi nhận trung thực.

Retry có jitter/backoff (ví dụ 1, 5, 15, 60 phút, tối đa 5 lần và 24 giờ; con số này là policy khởi đầu, cần test) đối với timeout/429/5xx; tôn trọng Retry-After với giới hạn; 404/410 -> invalidate subscription, không retry; lỗi VAPID/401/403 provider -> dừng gửi, cảnh báo vận hành, không tự xoá inbox. DEAD lưu lỗi đã khử khuẩn và dùng công cụ operator/queue replay có kiểm soát, không tăng job vô hạn. Giám sát queue depth, oldest age, retries/dead và resource/CPU trên VPS chia sẻ; không tạo cron/process nền mới trước review P5-056.

## 6. Trạng thái thông báo và vòng đời

Bản ghi created -> unread; POST mark-read idempotent chuyển readAt từ null sang timestamp (không đổi resolvedAt). ResolvedAt chỉ do trusted domain reconciler/event cập nhật sau khi source authoritative đạt trạng thái đã xử lý; với INFORMATION thì không có nghĩa vụ resolved, UI không hiển thị hành động "Đã xử lý" giả. Action click **chỉ** mở route hợp lệ và có thể đánh dấu đã đọc nếu user yêu cầu; không phê duyệt, không thực hiện tác vụ thay người dùng. Các sự kiện đảo/hủy/correction từ domain phải làm mới/resolution theo evidence; không gán RESOLVED từ một hành động giao diện.

Đề xuất retention ban đầu: INFORMATION/read và domain resolved có thể purge sau 180 ngày từ created/resolved (mốc muộn hơn); ACTION_REQUIRED chưa resolved giữ tối đa 365 ngày trong inbox và nếu cần lưu chứng cứ lâu hơn thì lấy từ **domain ledger**, không lạm dụng inbox làm sổ kiểm toán. Dọn bản ghi bằng batch nhỏ có đo đạc, giám sát và dry-run; bảo toàn FK/outbox; policy cuối cùng cần kiểm thử và thẩm định an toàn dữ liệu trong P5-056. Không xóa dữ liệu domain khi xóa inbox. Người dùng không có chức năng hard-delete mọi thông báo trong nhiệm vụ này.

## 7. API contract đề xuất (cùng origin, session cookie)

| Method | Endpoint | Contract |
| --- | --- | --- |
| GET | /api/notifications?cursor=&limit= | Cursor keyset immutable (createdAt,id), limit 1–50, chỉ những bản ghi người nhận còn có quyền; đáp ứng 200 + items/nextCursor |
| GET | /api/notifications/unread-count | Count chỉ từ cùng predicate authorized; không leak qua counts khi mất quyền |
| POST | /api/notifications/:id/read | Đánh dấu readAt idempotent; UUID hợp lệ; other-user -> 404, revoked source -> 404; reject unauthenticated 401 |
| GET | /api/notifications/:id/action | Server resolve actionKey + route params qua allowlist, re-check nguồn và quyền; no arbitrary redirect, trả internal path đã cho phép |
| GET | /api/notifications/push-config | Trả feature availability, public VAPID key, permission/support trạng thái an toàn; không trả private key |
| GET | /api/notifications/subscriptions | Danh sách thiết bị chỉ gồm id, label do user nhập (nếu có), createdAt/lastSeenAt/status; không trả endpoint/keys |
| POST | /api/notifications/subscriptions | CSRF/same-origin/session required, browser-consent proof theo hợp đồng, register active endpoint, 5-device cap, idempotent |
| DELETE | /api/notifications/subscriptions/:id | Chỉ subscription của user hiện tại, idempotent; revoke server-side dù browser unsubscribe bị lỗi |

Canonical HTTP handling: 400 malformed; 401 anonymous/expired; 403 authenticated-but-not-allowed nơi route scope quy định; 404 cross-account/resource not visible; 409 stale/conflicting subscription binding; 429 bounded rate-limit; 503 retryable unavailable. Unauthenticated, disabled, locked user -> fail closed. Cache-Control: no-store trên mọi response notifications; credentials same-origin và CSRF/origin guard theo ADR-007; input validation/length quotas, no raw URL/HTML. Không cho browser gọi publish API; publisher là server-internal typed interface và chỉ trusted domain service gọi.

## 8. Deep link an toàn

Registry của server map actionKey -> route hiện hữu và resource access predicate. Ví dụ tương ứng các route hiện có: /phe-duyet-bao-cao, /bao-cao-ke-khai, /lich-day, /quan-tri/dieu-hanh-chuyen-mon, /quan-tri/san-sang-du-lieu. Chi tiết ID chỉ được dùng khi route thật hỗ trợ và re-check item cụ thể; không được dựng liên kết giả. Không chấp nhận http(s) từ event, javascript:, //external, encoded redirects, fragment chứa secret hoặc path traversal. Nếu nguồn bị xoá/revoked/stale, hiện thông báo trung tính "Không còn quyền truy cập hoặc công việc đã thay đổi", không tiết lộ dữ liệu.

## 9. Web Push, VAPID, consent, PWA/service worker

- Web Push tùy chọn, opt-in **bằng thao tác trực tiếp của người dùng**, chỉ gọi Notification.requestPermission qua user gesture khi browser hỗ trợ. Nếu denied/unsupported, vẫn dùng đầy đủ inbox qua browser thường; không buộc cài PWA mới được đọc thông báo.
- Một user có thể quản lý nhiều thiết bị/browser installation độc lập; browser A unsubscribe không làm mất subscription browser B hay inbox. Log out/đổi tài khoản: clear in-memory notification queries/push state; server binding không được lộ qua service worker; quản lý đăng ký khi user xác thực, tránh gửi payload nhạy cảm tới trình duyệt chung.
- Push payload chỉ gồm opaque notificationId và nhãn chung như "Báo giảng Đam San có thông báo mới"; không chứa học sinh, báo cáo, dữ liệu giảng dạy, người dùng, action URL hoặc credential. Service worker được phép showNotification generic và mở **cùng-origin** /thong-bao hoặc application shell, không điều hướng URL bất kỳ từ push.
- Đề xuất thiết kế P5-056: truy cập inbox qua icon/chữ "Thông báo" trong authenticated AppLayout, có badge số chưa đọc thực; trang /thong-bao. Trên 320/375/414px có 44x44 touch targets, keyboard focus, 200% zoom, no faux notifications; loading/empty/offline/error/session-expired/unauthorized theo DESIGN.md, không tự reload khi đang soạn báo cáo.
- P5-020 VitePWA hiện generateSW + Workbox NetworkOnly /api. P5-056 phải **kiểm chứng runtime** cách bổ sung push và notificationclick handler cho generated SW (hoặc có ADR change rõ ràng nếu cần chuyển injectManifest), và bảo toàn update prompt, app install, no API cache/offline mutation/background sync. Không gắn notification click với auto-approval.
- WEB_PUSH_ENABLED đang được đọc ở app.config.ts. P5-056 cần rà soát exact env allowlist, thêm VAPID/public origin/encryption key theo hợp đồng cấu hình production; private key chỉ ở server-side runtime secrets, không ở Business Configuration/GitHub/database/log. Feature off không gây lỗi startup và không ảnh hưởng inbox; enabled invalid secrets fail startup có kiểm soát.

## 10. Quyền, bảo mật, dữ liệu cá nhân

Sử dụng session-auth + current-user identity; inbox cá nhân không phải capability school-wide mới. Mọi nguồn thuộc domain kiểm tra capability hiện hữu và scope PERSONAL/SUBJECT_GROUP/SUBJECT/ACTIVITY/SCHOOL_WIDE với exact resource theo ADR-008, dùng backend evaluator hiện hành. Không suy diễn cấp quyền qua chức danh, link Telegram, subscription Push hay thông báo có sẵn. Domain sensitive: quyền đọc bản ghi và quyền thực hiện hành động khác nhau; luôn gọi kiểm tra phía server trên action route.

Không nhúng token/khoá, endpoint hay PII vào Push/browser storage. Encrypt-at-rest endpoint & keys, hạn chế các tài khoản có quyền DB, có kế hoạch key rotation; cân nhắc provider push endpoints như secret; áp dụng rate limit/size limit per user, CSRF/origin/session guard, audit sự kiện nhạy cảm nhưng loại trừ payload. Review threat model: forged event, cross-user fetch, stale scope, shared-device browser, XSS/HTML, redirect spoofing, SSRF qua subscription endpoint (không thực hiện arbitrary server fetch), push subscription hijack, replay, provider outage, worker crash, retention cleanup, notification flooding, user deletion. Không dựa client-side permission hoặc server Push delivery làm bằng chứng doanh nghiệp đã xử lý.

## 11. Kiểm thử và chứng cứ nghiệm thu bắt buộc P5-056

1. Unit: registry source/type/route allowlist, sanitized title/body, dedupe key deterministic, state transitions, retention policy, retry categorization.
2. PostgreSQL isolated integration: INSERT concurrent duplicate recipients/event (đúng 1 inbox row); rollback source command không phát; crash/restart outbox worker; lease expiration, batch cleanup; migration replay/rollback strategy; foreign key và cross-user isolation.
3. Authorization negative: recipient A đọc/cập nhật B -> 404; revoked/expired capability hoặc source mutated -> ẩn detail/list/count; locked/disabled user; cache/session identity change; route valid nhưng command denied.
4. Push: multi-device, opt-in/out, 5-device cap, endpoint takeover, 404/410 remove, 429 Retry-After, 5xx, 401/403, timeout ambiguous, DEAD/replay, feature flag false và invalid configuration true.
5. PWA runtime Playwright: Workbox controlled, /api network-only & zero cache; old/new SW update prompt không bị phá; notificationclick chỉ cùng origin; desktop Chromium, Android thật và iOS supported/unsupported được phân loại minh bạch; inbox vẫn chạy khi Push unsupported.
6. E2E with authoritative test event: nhận thông báo -> đóng browser -> đăng nhập lại -> vẫn còn -> mark read -> truy cập việc được phép -> source handled xác nhận -> resolved; mất quyền ở giữa -> không lộ; disable Push/TG -> inbox còn; server 503/offline không gây mất dữ liệu.
7. 320/375/414 mobile, 1366 laptop, zoom 200%, keyboard/screen-reader focus, loading/empty/error/offline và Vietnamese copy; đo CPU/RAM/queue VPS chỉ trên staging/production-approved plan, không stress test DB production.

**Failure gates:** Không có transaction/idempotent provenance; không kiểm quyền tại read; lưu Push token trong business config; SW cache /api; tạo UI giả/truy cập nghiệp vụ không có authority; bất kỳ HIGH/CRITICAL nào => không merge P5-056.

## 12. Ranh giới thực thi và chuyển giao

P5-056A chỉ sửa requirement, ADR và governance Markdown; không schema/migration/API/UI/CI/deploy/VPS. Chỉ được dùng PR/docs-only, exact-head CI, independent GitHub diff review, merge sau phê duyệt, post-merge main CI, một lần SYNC-P5-056A (non-recursive). **Không coi IN_REVIEW là CLOSED.**

P5-056 triển khai theo đúng ADR sau khi P5-056A CLOSED; chia gói làm việc trên **cùng một nhánh P5-056**, không thêm task/branch rác: (A) Prisma + transactional publisher/outbox/security, (B) push worker/subscription/provider retry, (C) Web UI/PWA, (D) regression + real persona UAT boundary. Migration và security-sensitive changes cần MCP local/CI với Codex escalation theo AGENTS.md; không phát hành hoặc merge theo suy đoán. P5-057 mới chứng minh workflow theo giáo viên, tổ trưởng, BGH, admin trên thiết bị thật trước P6-050.

## 13. Cổng review kiến trúc P5-056A

Review phải xác nhận đủ 11 hạng mục requirement gốc: durable per-account record/retention; type/source; read; handled; route; dedupe; multi-device; retry/dead-letter; privacy; dual-boundary capability; independence Telegram. Kiểm tra trực tiếp GitHub diff cho mọi thay đổi, exact-head CI, không có runtime/schema/config/CI/VPS changes; bảo đảm không gán danh hiệu READY cho P5-056 trước SYNC. Đến trước merge, mọi quyết định ở đây là **proposed**.
