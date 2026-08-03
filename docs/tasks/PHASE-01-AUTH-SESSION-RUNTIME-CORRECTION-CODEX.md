# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-AUTH-SESSION-RUNTIME-CORRECTION-001`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `phase/01-auth-session-runtime`  
Reviewed implementation head: `f868e3cd0979eb4a507e1ef884169f4c53a43dda`

## Mục tiêu

Sửa toàn bộ điểm còn yếu trong auth HTTP boundary trước PR. Giữ nguyên schema/migration, API contract nghiệp vụ và policy session hiện tại.

## Lý do correction

1. `requestMeta()` đang tin trực tiếp `X-Forwarded-For`; client có thể spoof IP, vượt rate limit và làm sai audit/session metadata nếu reverse proxy append header.
2. `LoginRateLimitService` giữ `Map` không giới hạn và không dọn key hết hạn; có nguy cơ tăng bộ nhớ vô hạn.
3. `SessionAuthGuard` giữ raw session token trong `request.auth` dù không endpoint nào cần; tăng bề mặt rò rỉ.
4. `decodeURIComponent` trên cookie malformed có thể ném lỗi và biến request unauthenticated thành 500.
5. Audit sanitizer chưa chứng minh đệ quy an toàn qua array/object lồng nhau.

## An toàn

- Không reset/clean/stash/rebase/amend/squash/force-push.
- Không merge, deploy, truy cập VPS hoặc database chính thức.
- Không sửa Prisma schema/migration, capability authorization, user CRUD, UI hoặc workflow deploy.
- Không log/in cookie, token, password, hash, connection string hoặc secret.
- Tiếp tục trên cùng branch vì đây là correction của cùng task.

## Phạm vi bắt buộc

### 1. Trusted proxy và client IP

- Không đọc/parsing `X-Forwarded-For` trực tiếp trong `requestMeta`.
- Dùng `request.ip` do Express tính sau cấu hình `trust proxy` rõ ràng.
- Bổ sung config số hop tin cậy, tên rõ nghĩa như `HTTP_TRUST_PROXY_HOPS`:
  - integer không âm;
  - development/test mặc định `0`;
  - production topology hiện tại là API bind loopback sau đúng một Nginx proxy, mặc định production `1` hoặc bắt buộc khai báo `1`; quyết định phải ghi ADR/report;
  - không cho wildcard/function trust tùy tiện.
- Cấu hình Express `trust proxy` trước khi nhận request.
- Cập nhật `.env.example` bằng placeholder/chú thích, không secret.
- Test bắt buộc:
  - trust proxy `0`: header XFF do client gửi không được dùng làm client IP;
  - trust proxy `1`: request qua một proxy tin cậy lấy đúng client IP;
  - session metadata/rate-limit key dùng IP đã chuẩn hóa, không dùng raw header.

### 2. Rate limiter có giới hạn

- Giữ fixed-window policy hiện tại nhưng không để state tăng vô hạn.
- Dọn entry hết hạn theo cách bounded/opportunistic.
- Bổ sung giới hạn số key đang theo dõi bằng config, ví dụ `AUTH_LOGIN_RATE_LIMIT_MAX_KEYS`, positive integer.
- Khi đầy:
  - prune entry hết hạn trước;
  - nếu vẫn đầy, fail closed bằng 429 hoặc policy an toàn tương đương;
  - không xóa ngẫu nhiên entry còn hiệu lực để attacker mở khóa chính mình.
- Không làm response phân biệt username tồn tại.
- Unit test cleanup, capacity và window reset.

### 3. Cookie/session token boundary

- `readCookie` không được ném lỗi với percent-encoding malformed; trả undefined và dẫn tới 401 nhất quán.
- Xác thực hình dạng token trước khi hash/DB lookup: token 32-byte base64url do hệ thống phát hành; reject format/length khác mà không phản chiếu token.
- Xóa `rawToken` khỏi `AuthenticatedRequest.auth` và khỏi request context sau authenticate.
- Không thay đổi token entropy/hash, cookie attributes hoặc endpoint contracts.
- Unit/integration test malformed cookie, invalid token format và xác nhận không có 500/raw token trong request/audit/response.

### 4. Audit sanitizer

- Sanitize đệ quy qua object và array lồng nhau.
- Loại mọi key nhạy cảm theo policy hiện hành, tối thiểu password/token/cookie/secret/hash/authorization; bổ sung alias rõ ràng như credential/bearer/apiKey/databaseUrl nếu cần.
- Không mutate input.
- Có giới hạn depth hoặc xử lý cycle an toàn để audit không crash process.
- Test nested arrays/objects, cycle/depth và safe values.

### 5. Docs/report

Cập nhật:

- `docs/decisions/ADR-007-AUTH-SESSION-COOKIE-CSRF.md`
- `docs/phase-reports/PHASE-01-AUTH-SESSION-RUNTIME-REPORT.md`

Ghi rõ:

- trusted proxy boundary;
- API chỉ bind loopback, production sau một Nginx hop;
- không tin raw forwarding headers;
- rate limiter là single-process bounded in-memory foundation; nếu scale nhiều process phải thay bằng shared store trong task riêng;
- raw token chỉ tồn tại ở cookie/request parsing đủ lâu để hash, không gắn vào auth context.

## Audit rộng trước sửa

Chạy và kiểm tra mọi match liên quan:

```text
git status -sb
git rev-list --left-right --count HEAD...origin/phase/01-auth-session-runtime
git grep -n -I -E "x-forwarded-for|request\.ip|trust proxy|rawToken|decodeURIComponent|LoginRateLimitService|attempts = new Map|sanitize\("
```

Dừng nếu branch sai, working tree bẩn ngoài task hoặc remote divergence khác `0/0` sau pull fast-forward.

## Quality gates

Chạy tối thiểu:

- Prisma validate/generate và schema static verification;
- auth unit tests;
- PostgreSQL auth integration tests;
- Playwright auth/smoke tests;
- secret scan;
- migration gates hiện có;
- toàn bộ lint/typecheck/build;
- `git diff --check`;
- staged-file và secret inspection.

CI final head phải xanh. Không dùng VPS/official DB.

## Commit/push

Commit correction theo nhóm hợp lý, push cùng branch. Không tạo PR, merge hoặc deploy. Dừng sau push.

## Báo cáo cuối

1. Audit match ban đầu.
2. Trusted-proxy/IP decisions.
3. Rate-limiter bounded behavior.
4. Cookie/token context fixes.
5. Audit sanitizer fixes.
6. Test/CI evidence.
7. Commit SHA và push status.
8. Xác nhận: schema/migration NO, capability authorization NO, UI NO, VPS NO, official DB NO, deploy NO, PR NO, merge NO.