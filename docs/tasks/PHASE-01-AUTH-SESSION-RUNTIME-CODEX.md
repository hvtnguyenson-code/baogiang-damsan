# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-AUTH-SESSION-RUNTIME-001`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `phase/01-auth-session-runtime`  
Base bắt buộc: `4cd141d88f47e20bcf0cd88f22fa0a92306899f9`

## Mục tiêu

Triển khai authentication/session runtime an toàn cho Phase 01 trên schema đã merge: password hashing, login/logout/logout-all/me/change-password, first-login password change, lockout, server-side session cookie, audit và bootstrap admin một lần. Không triển khai authorization capability guard, user-management CRUD, frontend UI hoặc deploy.

## Bắt buộc đọc

- `AGENTS.md`
- `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md`
- `docs/requirements/PHASE-01-IDENTITY-ACCESS-SPEC.md`
- `docs/decisions/ADR-006-PHASE-01-ID-SESSION-MIGRATION-BASELINE.md`
- `docs/handover/PHASE-01-CODEX-HANDOVER.md`
- schema, contracts, config, error filter, Prisma module và CI hiện hành.

## An toàn

- Không reset/clean/stash/rebase/amend/squash/force-push.
- Không merge, deploy, truy cập VPS hoặc database chính thức.
- Không sửa schema/migration trừ khi phát hiện blocker bắt buộc; nếu có, dừng và báo cáo thay vì tự mở rộng.
- Không triển khai capability authorization, UI, user CRUD, catalog CRUD hoặc additional-duty API.
- Không log password, session token, cookie, hash, connection string hoặc secret.

## Phạm vi kỹ thuật

### 1. Dependencies/config

- Dùng Argon2id từ package được duy trì.
- Session token tạo bằng `crypto.randomBytes` đủ entropy; chỉ lưu SHA-256 hash trong DB.
- Bổ sung config có validation, không hardcode rải rác:
  - session TTL;
  - idle/last-seen update interval;
  - cookie name/path/domain/secure/sameSite;
  - lockout threshold/duration;
  - password minimum policy;
  - login rate limit.
- Production cookie: `HttpOnly`, `Secure`, `SameSite=Lax`; local/test cấu hình được nhưng không giảm mặc định production.
- CORS không wildcard; cookie auth phải bật credentials đúng origin.
- Đánh giá CSRF và triển khai biện pháp phù hợp. Tối thiểu kiểm tra `Origin`/`Referer` cho unsafe authenticated methods hoặc cơ chế CSRF token có test; không chỉ ghi tài liệu.

### 2. Services/modules

Tạo module/service/guard/decorator tối thiểu:

- `AuthModule`
- `PasswordService`
- `SessionTokenService`
- `AuthService`
- session authentication guard/middleware dùng thống nhất
- current-user decorator/context
- audit writer dùng transaction khi sự kiện gắn với thay đổi auth quan trọng

Yêu cầu:

- username chuẩn hóa lowercase trước lookup;
- response login không phân biệt username không tồn tại và password sai;
- timing path hợp lý cho unknown user;
- user chỉ login khi `ACTIVE`; xử lý rõ `LOCKED`, `DISABLED`, `PENDING` nhưng không hỗ trợ dò tài khoản;
- failed login tăng transaction-safe; đạt ngưỡng thì khóa tạm;
- login thành công reset failed count/lockedUntil, cập nhật lastLoginAt và tạo session;
- session hợp lệ khi user active, token hash khớp, chưa revoke, chưa hết hạn;
- logout revoke session hiện tại;
- logout-all revoke tất cả session của user;
- change-password verify mật khẩu hiện tại, áp policy, thay hash và revoke các session khác; session hiện tại chỉ giữ hoặc thay mới theo policy được ghi rõ và test;
- first-login bắt buộc đổi mật khẩu: `/me` phản ánh `mustChangePassword`; chỉ cho phép endpoint auth cần thiết cho đến khi đổi xong ở task authorization/UI sau;
- không lưu token raw; cookie chỉ chứa token raw gửi client;
- lastSeenAt không ghi DB mỗi request; throttle theo config;
- audit metadata redaction mặc định-deny đối với password/token/cookie/hash.

### 3. API

Triển khai đúng contract chuẩn lỗi hiện hành:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

DTO validation chặt, whitelist/mass-assignment safe. Không trả `passwordHash`, `tokenHash`, failed-login internals hoặc security fields không cần thiết.

Login đặt cookie; logout xóa cookie với cùng attributes/path. Unauthorized/expired/revoked session trả 401 nhất quán. Disabled/locked user với session cũ bị từ chối.

### 4. Bootstrap admin một lần

Tạo CLI/script an toàn:

- đọc username/display name/password từ environment hoặc interactive local execution;
- không có default password;
- không in password;
- chuẩn hóa username;
- tạo `User` + `StaffProfile` + capability grants kỹ thuật cần thiết trong transaction;
- idempotency rõ: nếu username tồn tại thì dừng, không overwrite;
- `mustChangePassword=true`;
- không seed người thật và không tự chạy trong production startup.

Không mặc định cấp quyền phê duyệt chuyên môn. `SYSTEM_ADMIN` không kéo theo approval capability.

### 5. Audit bắt buộc

Ghi tối thiểu:

- `AUTH_LOGIN_SUCCESS`
- `AUTH_LOGIN_FAILURE`
- `AUTH_LOGIN_LOCKED`
- `AUTH_LOGOUT`
- `AUTH_LOGOUT_ALL`
- `AUTH_PASSWORD_CHANGED`
- `AUTH_SESSION_REJECTED` cho expired/revoked/invalid quan trọng
- bootstrap admin success/failure phù hợp

Audit không chứa password/token/cookie/hash. Login failure actor nullable; metadata chỉ chứa thông tin an toàn như normalized username fingerprint/username khi policy cho phép, IP rút gọn hoặc reason code không làm lộ tài khoản.

### 6. Contracts/docs

- Cập nhật shared contracts cho auth request/response public-safe.
- Tạo ADR mới nếu có quyết định session/cookie/CSRF chưa được ADR-006 khóa đủ.
- Tạo `docs/phase-reports/PHASE-01-AUTH-SESSION-RUNTIME-REPORT.md`.
- Cập nhật `.env.example` bằng placeholder/config mô tả, không secret.

## Tests bắt buộc

### Unit

- Argon2id hash/verify và password policy;
- token entropy/hash, không lưu raw;
- lockout threshold/duration/reset;
- unknown-user login không lộ khác biệt response;
- session validity/revocation/expiry/user status;
- lastSeen throttling;
- audit redaction;
- cookie options theo environment;
- CSRF/origin policy.

### Integration trên PostgreSQL CI

- login success/failure/unknown/locked/disabled/pending;
- lockout transaction-safe;
- cookie flags;
- `/me` valid/expired/revoked;
- logout và logout-all;
- change-password đúng/sai, mustChangePassword và session revocation;
- session token raw không xuất hiện trong DB/audit/log response;
- audit events bắt buộc;
- bootstrap admin idempotency và capability không bao gồm professional approval.

### E2E API/browser tối thiểu

- login bằng cookie → `/me`;
- unauthenticated `/me` bị 401;
- logout làm mất session;
- đổi mật khẩu lần đầu và login lại bằng mật khẩu mới;
- unsafe authenticated request bị CSRF/origin policy chặn khi sai origin.

## CI/quality gates

Giữ toàn bộ migration gates hiện có. Chạy tối thiểu:

- Prisma validate/generate;
- `npm run lint`;
- `npm run typecheck`;
- targeted unit/integration/E2E;
- `npm run build`;
- `git diff --check`;
- secret scan và staged-file inspection.

CI final head phải xanh. Không dùng database VPS hoặc production secret.

## Commit/push

Commit theo lát hợp lý, push branch. Không tạo PR, không merge, không deploy. Dừng sau push.

## Báo cáo cuối

- branch/base/final HEAD;
- auth/session/cookie/CSRF decisions;
- endpoint và bootstrap implementation;
- audit/redaction evidence;
- unit/integration/E2E/CI evidence;
- files/commits/push;
- limitations;
- xác nhận: schema/migration changed NO, authorization capability guard NO, UI NO, VPS NO, official DB NO, deploy NO, PR NO, merge NO.
