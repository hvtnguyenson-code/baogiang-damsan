# PHASE 01 — IDENTITY & ACCESS SPECIFICATION

## 1. Mục tiêu

Phase 01 xây dựng nền móng định danh và kiểm soát truy cập cho Hệ thống Báo giảng Đam San:

- người dùng và hồ sơ nhân sự cơ bản;
- tổ chuyên môn và môn học;
- membership có thời gian hiệu lực;
- authentication bằng tài khoản nội bộ;
- capability cộng dồn;
- scope theo tài nguyên và phạm vi;
- authorization default-deny;
- session phía server;
- audit log nền móng.

Phase này chưa triển khai TKB, PPCT, nợ tiết, báo giảng, bảng kê, phê duyệt chuyên môn, notification hoặc AI thật.

## 2. Nguồn yêu cầu bắt buộc

Agent phải đọc trực tiếp trước khi code:

1. `docs/specifications/PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx`
2. `docs/specifications/PA-A-GAS-Google-Sheets-v1.2-AI-governance.docx` để đối chiếu, không dùng làm phương án chính
3. `docs/PROJECT_CONTEXT.md`
4. `docs/architecture/PHASE-00-FOUNDATION.md`
5. `docs/architecture/AI_GOVERNANCE_AND_ACCESS_MODEL.md`
6. `docs/decisions/ADR-001-TECH-STACK.md`
7. `docs/decisions/ADR-002-AI-READY-BUT-DISABLED.md`
8. `docs/decisions/ADR-003-PROTOTYPE-REFERENCE-ONLY.md`
9. `docs/decisions/ADR-004-CONTROLLED-AI-ACTIVE-PASSIVE.md`
10. `docs/policies/AI_USAGE_AND_COST_CONTROL_POLICY.md`
11. `docs/requirements/AI_REQUIREMENTS_TRACEABILITY.md`
12. `prisma/schema.prisma`
13. `packages/contracts/src/index.ts`
14. toàn bộ cấu trúc và test Phase 00 hiện hành.

Khi có mâu thuẫn: đặc tả Phương án B v1.2 > ADR/governance hiện hành > tài liệu phase > prototype.

## 3. Nguyên tắc bất biến

### 3.1 Capability và scope

- Không hardcode quyền theo tên role.
- Mọi người làm chuyên môn có `TEACHER_BASE`.
- Capability được cộng dồn, không thay thế nhau.
- Mọi grant có scope và thời gian hiệu lực.
- Default deny.
- Frontend chỉ ẩn/hiện UI; backend mới là nơi quyết định quyền.
- `SYSTEM_ADMIN` không mặc nhiên có quyền phê duyệt chuyên môn.
- Không có role selector trong production.
- Không cho phép self-approval; Phase 01 phải chuẩn bị dữ liệu để các phase sau kiểm tra nguyên tắc này.

### 3.2 AI

- Không triển khai provider, endpoint, chatbot, prompt hoặc tác vụ AI thật.
- Giữ nguyên ba kill switch `false`.
- Không sửa kiến trúc AI trừ khi cần tương thích type, và không kích hoạt AI.

### 3.3 Production

- Không deploy.
- Không kết nối VPS.
- Không sửa Nginx, service, Scheduled Task, PostgreSQL production hoặc hệ thống nội trú.
- Không thêm workflow deploy.

### 3.4 Database

- Dùng Prisma Migrate.
- Không dùng `prisma db push` làm cơ chế migration chính thức.
- Không dùng `prisma migrate reset` trên database có dữ liệu.
- Không chạy SQL tùy ý ngoài migration do Prisma sinh, trừ script test cô lập và có giải thích.
- Mọi bảng nghiệp vụ có `createdAt`, `updatedAt` khi phù hợp.
- Dùng UUID hoặc CUID thống nhất; Agent phải chọn một chuẩn và ghi ADR ngắn nếu Phase 00 chưa chốt.

## 4. Domain model tối thiểu

### 4.1 User

Trường tối thiểu:

- `id`
- `username` duy nhất, chuẩn hóa lowercase
- `passwordHash`
- `status`: `PENDING`, `ACTIVE`, `LOCKED`, `DISABLED`
- `mustChangePassword`
- `failedLoginCount`
- `lockedUntil`
- `lastLoginAt`
- `createdAt`, `updatedAt`

Không lưu password plaintext, recovery answer hoặc token thô.

### 4.2 StaffProfile

- `id`
- `userId` duy nhất
- `staffCode` duy nhất khi có
- `displayName`
- `email` tùy chọn
- `phone` tùy chọn
- `positionTitle` chỉ là thông tin hồ sơ, không quyết định quyền
- `isTeachingStaff`
- `createdAt`, `updatedAt`

### 4.3 SubjectGroup

- `id`
- `code` duy nhất
- `name`
- `status`
- `createdAt`, `updatedAt`

### 4.4 Subject

- `id`
- `code` duy nhất
- `name`
- `status`
- `createdAt`, `updatedAt`

### 4.5 SubjectGroupMembership

- `id`
- `userId`
- `subjectGroupId`
- `validFrom`
- `validUntil` tùy chọn
- `isPrimary`
- unique/index bảo đảm không tạo membership trùng hiệu lực vô nghĩa

Membership không tự sinh quyền tổ trưởng. Quyền tổ trưởng phải là capability grant riêng.

### 4.6 StaffSubject

- `id`
- `userId`
- `subjectId`
- `validFrom`
- `validUntil` tùy chọn
- `isPrimary`

### 4.7 CapabilityDefinition

- `key` duy nhất
- `description`
- `allowedScopeTypes`
- `isSystem`
- `isActive`

Catalog phải seed idempotent, tối thiểu gồm các capability foundation hiện có. Agent được bổ sung capability quản trị cần thiết nhưng phải có tên rõ nghĩa, không dùng level hoặc role chung chung.

### 4.8 CapabilityGrant

- `id`
- `userId`
- `capabilityKey`
- `scopeType`
- `scopeResourceId` nullable chỉ khi scope không cần tài nguyên cụ thể
- `validFrom`
- `validUntil` tùy chọn
- `grantedByUserId`
- `revokedAt`, `revokedByUserId`, `revokeReason`
- `createdAt`, `updatedAt`

Không xóa vật lý grant đã dùng; revoke để giữ audit.

### 4.9 AuthSession

- `id`
- `userId`
- `tokenHash`, không lưu token thô
- `expiresAt`
- `revokedAt`
- `lastSeenAt`
- `ipAddress` và `userAgent` có giới hạn độ dài
- `createdAt`

### 4.10 AuditEvent

- `id`
- `actorUserId` nullable cho system/bootstrap
- `action`
- `entityType`
- `entityId`
- `requestId`
- `result`: `SUCCESS`, `DENIED`, `FAILURE`
- `metadata` JSONB đã loại secret
- `createdAt`

Audit phải ghi tối thiểu cho login success/failure, logout, password change, user create/update/status change, grant/revoke capability và denied authorization quan trọng.

## 5. Authentication

- Username/password nội bộ.
- Hash bằng Argon2id hoặc thư viện tương đương đã được duy trì; ưu tiên Argon2id.
- Session phía server.
- Cookie `HttpOnly`; production `Secure`; `SameSite=Lax`; path phù hợp.
- Không lưu access token/session token trong `localStorage`.
- Token session tạo bằng CSPRNG và chỉ lưu hash.
- Rate limit login.
- Khóa tạm thời sau số lần sai có cấu hình, không hardcode rải rác.
- Đổi mật khẩu lần đầu.
- Đổi/reset password phải revoke các session còn lại theo policy.
- Không lộ lý do chi tiết giúp dò username trong response login.

## 6. Authorization

Xây một authorization service/guard dùng thống nhất:

```text
hasCapability(user, capabilityKey, requestedScope, resourceId, atTime)
```

Phải kiểm tra đồng thời:

- user active;
- capability key;
- grant chưa revoke;
- `validFrom <= now`;
- `validUntil` chưa hết hạn;
- scope phù hợp;
- resource ID phù hợp;
- read/write mode nếu có.

Không copy logic permission sang từng controller.

## 7. API tối thiểu

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

### Users

- `GET /api/users`
- `POST /api/users`
- `GET /api/users/:id`
- `PATCH /api/users/:id`
- `POST /api/users/:id/activate`
- `POST /api/users/:id/disable`
- `POST /api/users/:id/unlock`

### Subject groups and subjects

- CRUD có kiểm soát cho subject groups và subjects.
- API membership và staff-subject assignments có thời gian hiệu lực.

### Capabilities

- `GET /api/capabilities`
- `GET /api/users/:id/capability-grants`
- `POST /api/users/:id/capability-grants`
- `POST /api/capability-grants/:id/revoke`

### Audit

- `GET /api/audit-events` với filter và pagination.

Tất cả DTO phải validate; list endpoint phải pagination; error dùng standard API error contract.

## 8. UI tối thiểu

- Login page.
- First-login password change.
- Hồ sơ cá nhân.
- User management.
- Subject group management.
- Subject management.
- Membership assignment.
- Capability grant/revoke theo scope.
- Audit viewer.
- Navigation cá nhân hóa theo capability.

UI phải:

- dùng tiếng Việt rõ ràng;
- phù hợp giáo viên không chuyên công nghệ;
- không dùng role selector;
- không dùng một dashboard giống nhau cho mọi người;
- có loading, empty, error, disabled, unauthorized và expired-session states;
- keyboard accessible và responsive;
- không sao chép JavaScript/logic từ prototype.

## 9. Bootstrap và seed

- Có lệnh bootstrap admin một lần, đọc secret từ environment hoặc interactive local execution.
- Không commit default password.
- Seed capability catalog idempotent.
- Seed subject/subject-group mẫu chỉ khi test environment; không đưa dữ liệu giả vào production seed.

## 10. Test bắt buộc

### Unit

- password hashing và verification;
- session token hashing;
- lockout policy;
- capability accumulation;
- scope matching;
- validity window;
- revocation;
- default deny;
- audit redaction.

### Integration

- login success/failure/locked/disabled;
- logout và logout-all;
- expired/revoked session;
- create/update/disable user;
- grant/revoke capability;
- cross-scope denial;
- pagination và validation;
- audit records;
- migration trên PostgreSQL thật.

### E2E

- login và đổi password lần đầu;
- quản trị tạo user;
- gán membership;
- cấp quyền theo tổ;
- user chỉ thấy và gọi được chức năng trong scope;
- unauthorized route/API bị chặn;
- logout làm mất session.

## 11. Security checks

- Không secret trong source/log/test snapshot.
- Không password/token trong audit metadata.
- Cookie flags được test.
- CSRF threat được đánh giá và có biện pháp tương ứng với cookie auth.
- CORS không dùng wildcard production.
- Validation chống mass assignment.
- Query list có giới hạn page size.
- Unique constraint và transaction cho thao tác grant/membership quan trọng.
- Không trả passwordHash, tokenHash hoặc internal security fields qua API.

## 12. Deliverables

- Prisma schema và migration Phase 01.
- API modules, guards, services, DTOs.
- Web pages/components.
- contracts/config cập nhật.
- bootstrap/seed scripts an toàn.
- unit, integration, E2E tests.
- ADR cho session/auth strategy và ID strategy nếu cần.
- `docs/phase-reports/PHASE-01-REPORT.md`.
- `docs/handover/PHASE-01-HANDOVER.md`.

## 13. Acceptance criteria

Phase 01 chỉ PASS khi:

1. CI final head xanh.
2. Không endpoint protected nào thiếu auth/authorization.
3. Backend default deny.
4. Capability kiểm tra key + scope + resource + hiệu lực + revocation.
5. Không role selector hoặc hardcoded role authorization.
6. Không password/token plaintext.
7. Session revoke hoạt động.
8. Audit đầy đủ cho sự kiện bắt buộc.
9. Migration chạy được trên database Phase 00 và database mới.
10. AI vẫn tắt hoàn toàn.
11. Không có deploy production.
12. Báo cáo chỉ tuyên bố PASS với bằng chứng test/CI cụ thể.
