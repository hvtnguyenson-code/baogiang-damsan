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

1. `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md`
2. `docs/decisions/ADR-005-OFFICIAL-VPS-CI-CD.md`
3. `docs/specifications/PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx`
4. `docs/specifications/PA-A-GAS-Google-Sheets-v1.2-AI-governance.docx` để đối chiếu, không dùng làm phương án chính
5. `docs/PROJECT_CONTEXT.md`
6. `docs/architecture/PHASE-00-FOUNDATION.md`
7. `docs/architecture/AI_GOVERNANCE_AND_ACCESS_MODEL.md`
8. `docs/decisions/ADR-001-TECH-STACK.md`
9. `docs/decisions/ADR-002-AI-READY-BUT-DISABLED.md`
10. `docs/decisions/ADR-003-PROTOTYPE-REFERENCE-ONLY.md`
11. `docs/decisions/ADR-004-CONTROLLED-AI-ACTIVE-PASSIVE.md`
12. `docs/policies/AI_USAGE_AND_COST_CONTROL_POLICY.md`
13. `docs/requirements/AI_REQUIREMENTS_TRACEABILITY.md`
14. `prisma/schema.prisma`
15. `packages/contracts/src/index.ts`
16. `AGENTS.md`
17. toàn bộ cấu trúc và test Phase 00 hiện hành.

Khi có mâu thuẫn: addendum Phương án B v1.3 > ADR hiện hành > Phương án B v1.2 > governance/tài liệu phase > prototype.

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

- VPS, PostgreSQL và domain là hạ tầng production chính thức ở trạng thái pre-operational.
- Chỉ dùng tài khoản và dữ liệu giả cho đến quyết định go-live.
- Delivery chuẩn là branch → GitHub → CI → review → merge được phép → CD → migration có kiểm soát → restart riêng Báo giảng → health check domain chính thức.
- Mọi task truy cập VPS, deploy, sửa Nginx/service/Scheduled Task hoặc chạy migration trên database chính thức phải có phạm vi và phê duyệt riêng.
- Task recovery/spec alignment không triển khai workflow CD; workflow thuộc task Codex riêng.

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

### 4.11 AdditionalDutyDefinition

Catalog kiêm nhiệm động có các trường:

- `id`;
- `code` duy nhất và không được đổi tùy tiện sau khi đã được sử dụng;
- `name`;
- `description`;
- `category`;
- `isActive`;
- `sortOrder`;
- `validFrom`;
- `validUntil` tùy chọn;
- `createdAt`, `updatedAt`.

Loại kiêm nhiệm là dữ liệu quản trị, không phải enum đóng trong source. Thêm loại mới, gồm Tổ phó hoặc chức danh tương lai, không cần sửa code. Dropdown lấy catalog tại runtime và chỉ hiển thị loại active còn hiệu lực; loại đã vô hiệu hóa vẫn được giữ để hiển thị lịch sử. Không xóa vật lý loại đã được sử dụng.

### 4.12 StaffAdditionalDutyAssignment

- `id`;
- `staffProfileId`;
- `dutyDefinitionId`;
- `scopeType`;
- `scopeResourceId` tùy theo loại scope;
- `validFrom`;
- `validUntil` tùy chọn;
- `note`;
- `createdByUserId`;
- `createdAt`, `updatedAt`.

Dùng `staffProfileId` vì kiêm nhiệm thuộc hồ sơ nhân sự, không thuộc tài khoản đăng nhập. Một giáo viên có thể có nhiều kiêm nhiệm; mỗi assignment có scope và thời gian hiệu lực. Validation/constraint phải ngăn bản ghi trùng hoặc các khoảng hiệu lực chồng lấn vô nghĩa cho cùng hồ sơ, loại và scope. Kết thúc assignment bằng thời điểm hiệu lực, không xóa lịch sử.

### 4.13 WorkloadAdjustmentRule — kiến trúc phase sau

Phase 01 không triển khai tác động định mức. Nó chỉ giữ ranh giới kiến trúc để phase nghiệp vụ sau liên kết quy tắc với `AdditionalDutyDefinition` và hỗ trợ các kiểu phép tính:

- `TRU_TIET`;
- `TRU_PHAN_TRAM`;
- `GHI_DE`;
- `priority` để giải quyết thứ tự áp dụng;
- khoảng hiệu lực.

Tên loại kiêm nhiệm và loại phép tính định mức là hai khái niệm độc lập; không đưa `TRU_TIET`, `TRU_PHAN_TRAM` hoặc `GHI_DE` vào tên/catalog kiêm nhiệm.

### 4.14 Ranh giới kiêm nhiệm và quyền

- Kiêm nhiệm là dữ liệu tổ chức/phân công; capability là quyền hệ thống.
- Kiêm nhiệm không tự cấp capability.
- Không viết authorization theo dạng `if duty == ...`.
- `SYSTEM_ADMIN` không tự có quyền chuyên môn.
- Capability quản trị catalog và assignment phải tách riêng, default-deny và được audit.
- Audit tối thiểu các hành động create, update, disable, assign và end.
- Phase 01 chỉ xây catalog và assignment foundation; mọi ảnh hưởng đến định mức thuộc phase nghiệp vụ sau.

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

### Additional duties

- API quản trị catalog: list/create/update/disable; list cho dropdown chỉ trả loại active còn hiệu lực, còn API quản trị/lịch sử có thể truy xuất loại inactive.
- API quản trị assignment: list theo hồ sơ/scope/thời gian, assign và end.
- Endpoint dùng capability quản trị riêng cho catalog và assignment; assignment không thay đổi capability grant.

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
- lọc catalog active/còn hiệu lực và giữ lịch sử loại inactive;
- kiểm tra khoảng hiệu lực assignment, duplicate/overlap vô nghĩa;
- xác nhận assignment kiêm nhiệm không sinh capability;
- mô hình phép tính định mức không bị trộn với catalog kiêm nhiệm.

### Integration

- login success/failure/locked/disabled;
- logout và logout-all;
- expired/revoked session;
- create/update/disable user;
- grant/revoke capability;
- cross-scope denial;
- pagination và validation;
- audit records;
- migration trên PostgreSQL cô lập do CI/test environment cấp.
- CRUD/disable catalog và assign/end kiêm nhiệm;
- catalog mới tự xuất hiện trong truy vấn dropdown mà không sửa code;
- audit create/update/disable/assign/end;
- capability quản trị kiêm nhiệm default-deny và tách khỏi quyền chuyên môn.

### E2E

- login và đổi password lần đầu;
- quản trị tạo user;
- gán membership;
- cấp quyền theo tổ;
- user chỉ thấy và gọi được chức năng trong scope;
- unauthorized route/API bị chặn;
- logout làm mất session.
- quản trị tạo loại kiêm nhiệm mới, loại xuất hiện trong dropdown active;
- gán nhiều kiêm nhiệm có scope/hiệu lực cho một giáo viên;
- vô hiệu hóa loại ngăn assignment mới nhưng lịch sử cũ vẫn xem được;
- người không có capability riêng không thể quản trị catalog/assignment.

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
- catalog và assignment foundation cho kiêm nhiệm động; chưa có workload-adjustment execution.
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
11. Phase implementation không tự truy cập/deploy/migrate hạ tầng chính thức; mọi thao tác đó thuộc task được phê duyệt riêng theo addendum v1.3.
12. Báo cáo chỉ tuyên bố PASS với bằng chứng test/CI cụ thể.
13. Loại kiêm nhiệm mới hoạt động theo dữ liệu, không cần sửa code; inactive/expired filtering và lịch sử được bảo toàn.
14. Assignment hỗ trợ nhiều kiêm nhiệm, scope/hiệu lực, chống trùng/chồng lấn vô nghĩa và không tự cấp capability.
15. Unit, integration và E2E bao phủ catalog, assignment, audit và authorization riêng.
