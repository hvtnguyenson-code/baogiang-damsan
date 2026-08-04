# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-CAPABILITY-AUTHORIZATION-RUNTIME-001`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `phase/01-capability-authorization-runtime`  
Base bắt buộc: `d6f3a4decd539f5586ec3a4f31f28fb7b08f5d83`

## Mục tiêu

Triển khai authorization runtime dùng capability grant có scope và thời gian hiệu lực trên authentication/session đã merge. Tạo một service/guard/decorator dùng thống nhất, default-deny, có audit và test đầy đủ. Không triển khai user CRUD, grant-management API, catalog API, UI hoặc deploy.

## Bắt buộc đọc

- `AGENTS.md`
- `docs/requirements/PHASE-01-IDENTITY-ACCESS-SPEC.md`
- `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md`
- `docs/decisions/ADR-006-PHASE-01-ID-SESSION-MIGRATION-BASELINE.md`
- `docs/decisions/ADR-007-AUTH-SESSION-COOKIE-CSRF.md`
- `docs/phase-reports/PHASE-01-AUTH-SESSION-RUNTIME-REPORT.md`
- `prisma/schema.prisma`
- capability seed, shared contracts, AuthModule/AuthService/SessionAuthGuard/AuditService và CI hiện hành.

## An toàn

- Không reset, clean, stash, rebase, amend, squash hoặc force-push.
- Không merge, deploy, truy cập VPS hoặc database chính thức.
- Không sửa schema/migration; nếu schema là blocker thật, dừng và báo cáo.
- Không triển khai user/subject/group/additional-duty CRUD, grant/revoke API, audit-list API hoặc frontend.
- Không thêm AI endpoint/provider và không bật kill switch AI.
- Không hardcode quyền theo role, chức danh, tổ, môn hoặc kiêm nhiệm.
- `SYSTEM_ADMIN` không phải bypass và không kéo theo quyền phê duyệt chuyên môn.

## Invariants bắt buộc

Authorization phải tương đương:

```text
hasCapability(userId, capabilityKey, requestedScope, resourceId, atTime)
```

Được phép khi và chỉ khi:

1. user tồn tại và `ACTIVE`;
2. user không bị khóa tạm tại `atTime`;
3. capability definition tồn tại và `isActive=true`;
4. requested scope nằm trong `allowedScopeTypes`;
5. có grant cùng capability key, chưa revoke;
6. `validFrom <= atTime`;
7. `validUntil IS NULL OR atTime < validUntil` — khoảng nửa mở `[from, until)`;
8. scope/resource match theo policy dưới đây.

Không suy quyền từ `positionTitle`, `isTeachingStaff`, subject-group membership, staff-subject hoặc additional-duty assignment. Capability cộng dồn; không có negative role override trong Phase 01.

## Scope policy phải khóa bằng ADR và test

### `SCHOOL_WIDE`

- Grant `SCHOOL_WIDE` cùng capability key được phép đáp ứng request cùng key ở mọi scope.
- Request `SCHOOL_WIDE` chỉ được đáp ứng bởi grant `SCHOOL_WIDE`.
- `scopeResourceId` phải null.

### Resource scopes

`SUBJECT_GROUP`, `SUBJECT`, `ACTIVITY`:

- request bắt buộc có UUID resource ID hợp lệ;
- grant exact scope phải có cùng resource ID;
- grant `SCHOOL_WIDE` cùng key có thể bao phủ;
- không tự suy quan hệ chéo, ví dụ `SUBJECT_GROUP` không tự bao phủ `SUBJECT` nếu chưa có resolver nghiệp vụ rõ ràng.

### `PERSONAL`

- Chỉ dùng cho dữ liệu của chính user;
- normalize request resource thành current user ID;
- grant `PERSONAL` của user hoặc `SCHOOL_WIDE` cùng key có thể đáp ứng;
- không cho client tùy ý dùng PERSONAL để tác động user khác.

### Catalog/grant integrity

- Nếu definition không cho scope được yêu cầu: deny.
- Grant có scope ngoài catalog hoặc resource shape không hợp lệ: không được dùng để allow; ghi audit reason an toàn.
- Không sửa dữ liệu lỗi trong authorization path.

## Phạm vi implementation

### 1. Authorization module

Tạo cấu trúc tối thiểu, tên có thể điều chỉnh theo convention:

- `AuthorizationModule`
- `CapabilityAuthorizationService`
- `CapabilityGuard`
- `RequireCapability` decorator/metadata
- types cho request/evaluation/decision
- clock abstraction nhỏ hoặc cách tương đương để test thời gian deterministic

`AuthModule` phải export phần authentication cần thiết; tránh circular dependency.

Service phải có API rõ ràng:

```ts
evaluate(request): Promise<AuthorizationDecision>
hasCapability(request): Promise<boolean>
```

Decision nội bộ có `allowed` và reason code chuẩn hóa. Client chỉ nhận 403 chung; reason chi tiết chỉ vào audit an toàn.

### 2. Guard/decorator contract

Hỗ trợ ít nhất:

```ts
@RequireCapability('USER_MANAGE', { scope: 'SCHOOL_WIDE' })
@RequireCapability('SUBJECT_GROUP_LEAD', {
  scope: 'SUBJECT_GROUP',
  resourceParam: 'subjectGroupId'
})
@RequireCapability('TEACHER_BASE', { scope: 'PERSONAL' })
```

Yêu cầu:

- guard chạy sau `SessionAuthGuard` và dùng authenticated user ID từ server context;
- resource ID chỉ lấy từ server-owned context hoặc route param đã validate; không tin body/query làm authorization identity trong foundation này;
- metadata thiếu/sai phải deny, không allow ngầm;
- hỗ trợ nhiều required capabilities theo policy rõ: mặc định ALL; nếu hỗ trợ ANY phải khai báo explicit và test;
- không copy permission logic vào controller.

Không tạo production debug/probe endpoint. Dùng test-only controller trong test module để kiểm tra guard.

### 3. First-login restriction

User có `mustChangePassword=true` không được truy cập endpoint nghiệp vụ/capability-protected cho đến khi đổi mật khẩu.

- `SessionAuthGuard` vẫn chỉ làm authentication.
- `CapabilityGuard` deny với reason `PASSWORD_CHANGE_REQUIRED` trước capability evaluation.
- Các endpoint auth cần thiết (`/me`, change-password, logout, logout-all) tiếp tục hoạt động vì không gắn CapabilityGuard.
- Không tạo role selector hoặc bypass bằng SYSTEM_ADMIN.

### 4. Effective capabilities cho `/auth/me`

Mở rộng public-safe auth response để UI sau này có thể dựng navigation nhưng backend vẫn là authority:

- trả danh sách effective active capabilities tại thời điểm request;
- mỗi item chỉ gồm `key`, `scope`, `resourceId?`;
- loại grant future/expired/revoked, inactive definition hoặc malformed scope/resource;
- deduplicate deterministic;
- không trả grant ID, người cấp, thời gian nội bộ, revoke reason hoặc dữ liệu security không cần thiết;
- login response có thể giữ tối thiểu hiện tại; `/me` là nguồn refresh chuẩn. Ghi quyết định rõ trong ADR.

Không dùng dữ liệu trả về frontend để quyết định authorization backend.

### 5. Audit

Ghi `AUTHORIZATION_DENIED` tối thiểu khi guard từ chối endpoint được bảo vệ.

Metadata chỉ chứa dữ liệu an toàn:

- capability key;
- requested scope;
- resource ID khi phù hợp;
- reason code;
- route/method dạng chuẩn hóa nếu cần.

Không ghi cookie, token, password, hash, authorization header hoặc raw body/query.

Reason codes tối thiểu:

- `AUTH_CONTEXT_MISSING`
- `PASSWORD_CHANGE_REQUIRED`
- `USER_INACTIVE`
- `USER_LOCKED`
- `CAPABILITY_UNKNOWN`
- `CAPABILITY_INACTIVE`
- `SCOPE_NOT_ALLOWED`
- `RESOURCE_REQUIRED`
- `RESOURCE_INVALID`
- `GRANT_NOT_FOUND`
- `GRANT_NOT_ACTIVE`
- `GRANT_SCOPE_MALFORMED`

Có thể tinh gọn nếu vẫn phân biệt đủ cho test/audit, nhưng client luôn nhận thông báo 403 chung.

### 6. Query/performance/safety

- Không N+1 cho một authorization decision.
- Dùng Prisma query có index hiện hành; không load password/session hash.
- `atTime` được chốt một lần cho mỗi evaluation.
- Không cache permission qua request hoặc qua lần thay đổi grant trong task này; correctness ưu tiên.
- Không mutate grant/catalog trong authorization service.
- Nếu Prisma không biểu đạt sạch một điều kiện, xử lý phần nhỏ sau query nhưng giữ deny-by-default.

### 7. Contracts/docs

- Cập nhật shared auth/capability contracts public-safe.
- Tạo `ADR-008` cho authorization semantics và scope matrix.
- Tạo `docs/phase-reports/PHASE-01-CAPABILITY-AUTHORIZATION-RUNTIME-REPORT.md`.
- Không sửa DOCX v1.2.

## Tests bắt buộc

### Unit

- scope matrix exact/SCHOOL_WIDE/PERSONAL;
- invalid/missing UUID resource;
- user inactive/locked;
- unknown/inactive capability definition;
- requested scope không nằm trong allowed scopes;
- revoked/future/expired/boundary-at-validUntil grant;
- malformed persisted grant không allow;
- multiple grants cộng dồn và deterministic dedupe;
- `SYSTEM_ADMIN` không đáp ứng approval capability;
- position/membership/duty không sinh quyền;
- first-login restriction;
- metadata/decorator default-deny;
- denied audit không có secret.

### PostgreSQL integration trong CI cô lập

- active exact-scope grant allow;
- resource mismatch deny;
- SCHOOL_WIDE grant bao phủ narrower request nhưng không ngược lại;
- PERSONAL chỉ tác động current user;
- grant future/expired/revoked deny;
- inactive definition deny;
- user disabled/locked deny kể cả có grant;
- `SYSTEM_ADMIN` không cho phép `APPROVAL_PRINCIPAL`;
- additional-duty assignment và subject-group membership không thay đổi kết quả;
- `/auth/me` chỉ trả effective public-safe capabilities;
- CapabilityGuard trả 403 và ghi `AUTHORIZATION_DENIED`;
- `mustChangePassword=true` bị chặn ở protected test route, trong khi `/me`, change-password và logout vẫn dùng được.

### E2E

Dùng test fixture hiện hành và một route nghiệp vụ thật chỉ khi đã tồn tại; không thêm debug endpoint production. Nếu chưa có route phù hợp, integration test với test-only controller là acceptance chính và Playwright phải giữ toàn bộ auth/smoke hiện có xanh.

## Quality gates

Giữ nguyên toàn bộ gates hiện có:

- Prisma validate/generate;
- schema static và migration fresh/legacy;
- secret scan;
- lint;
- typecheck;
- unit;
- PostgreSQL integration;
- build;
- Playwright auth/smoke;
- `git diff --check`;
- staged-file/secret inspection.

CI final head phải xanh. Không dùng VPS hoặc production secrets.

## Commit/push

Commit theo lát hợp lý và push branch. Không tạo PR, không merge, không deploy. Dừng sau push.

## Báo cáo cuối

1. branch/base/final HEAD và divergence;
2. authorization service/guard/decorator design;
3. scope matrix và first-login policy;
4. `/auth/me` effective-capability contract;
5. audit reason codes/redaction;
6. unit/integration/E2E/CI evidence;
7. files/commits/push;
8. limitations;
9. xác nhận: schema/migration NO, user/grant CRUD NO, UI NO, VPS NO, official DB NO, deploy NO, PR NO, merge NO.