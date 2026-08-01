# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-SCHEMA-MIGRATION-FOUNDATION-001`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `phase/01-schema-migration-foundation`  
Base bắt buộc: `f457c1431581e5c37365b24641170149d946cd97`

## Mục tiêu

Triển khai riêng nền móng database Phase 01: Prisma models, migration history hợp lệ, shared contracts tối thiểu, seed catalog idempotent và CI kiểm chứng migration. Không triển khai controller/service/UI/auth runtime trong task này.

## Bắt buộc đọc

- `AGENTS.md`
- `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md`
- `docs/requirements/PHASE-01-IDENTITY-ACCESS-SPEC.md`
- `docs/handover/PHASE-01-CODEX-HANDOVER.md`
- toàn bộ ADR, schema, contracts và CI hiện hành.

## An toàn

- Không reset/clean/stash/rebase/amend/squash/force-push.
- Không merge, deploy, truy cập VPS hoặc database chính thức.
- Không `prisma db push`; không `migrate reset` trên database ngoài CI cô lập.
- Không sửa frontend, Nginx, deploy workflow hoặc hệ thống Nội trú.
- Dừng nếu working tree không sạch hoặc branch/base sai.

## Phạm vi triển khai

### 1. ID strategy

Dùng UUID thống nhất cho entity Phase 01 (`String @db.Uuid @default(uuid())` khi phù hợp). Tạo ADR kế tiếp chưa dùng, ghi rõ chiến lược ID, auth/session foundation và migration baseline.

### 2. Prisma models

Giữ `SystemSetting`; bổ sung đầy đủ:

- `User`
- `StaffProfile`
- `SubjectGroup`
- `Subject`
- `SubjectGroupMembership`
- `StaffSubject`
- `CapabilityDefinition`
- `CapabilityGrant`
- `AuthSession`
- `AuditEvent`
- `AdditionalDutyDefinition`
- `StaffAdditionalDutyAssignment`

Tuân thủ đặc tả về field, status, scope, validity, revoke, audit và soft-disable/history.

Ràng buộc kỹ thuật:

- map snake_case nhất quán;
- FK/index/unique rõ ràng;
- `validUntil >= validFrom` bằng CHECK constraint trong migration SQL;
- không cascade-delete lịch sử grant, assignment, audit hoặc catalog đã dùng;
- username/code chuẩn hóa và unique;
- token/password chỉ lưu hash;
- metadata dùng JSONB;
- index cho truy vấn active validity, user, scope/resource, audit time;
- chống duplicate exact assignment/grant bằng unique phù hợp;
- overlap thời gian phải được chặn bằng PostgreSQL exclusion constraint hoặc transaction-safe strategy có migration SQL và test chứng minh; không chỉ ghi chú.

Kiêm nhiệm không sinh capability. `WorkloadAdjustmentRule` chưa tạo model trong task này.

### 3. Migration history

Repository chưa có migration Phase 00. Tạo:

1. baseline migration chỉ đại diện đúng `SystemSetting` Phase 00;
2. migration Phase 01 chỉ thêm models/constraints/index Phase 01.

Không tạo lại `system_settings` trong migration Phase 01.

Tạo runbook baseline cho database Phase 00 legacy đã có `system_settings` nhưng chưa có `_prisma_migrations`:

- pre-check chỉ đọc;
- backup gate;
- xác minh schema khớp baseline;
- `prisma migrate resolve --applied <baseline>`;
- `prisma migrate deploy`;
- post-check;
- tiêu chí dừng/rollback.

Không chạy runbook trên VPS.

### 4. Seed/contracts

- Bổ sung contracts/enums/types tối thiểu đồng bộ schema; không hardcode authorization theo role.
- Capability catalog nền móng seed idempotent, gồm capability quản trị user, subject/group, capability grant, audit, additional-duty catalog và assignment.
- Seed không tạo password mặc định, dữ liệu người thật hoặc dữ liệu nghiệp vụ giả cho production.

### 5. CI migration gates

Cập nhật CI để kiểm chứng trên PostgreSQL cô lập:

- fresh database: `prisma migrate deploy` từ rỗng;
- legacy Phase 00 simulation: tạo đúng bảng `system_settings`, đánh dấu baseline applied, rồi deploy Phase 01;
- `prisma migrate status` sạch;
- Prisma validate/generate;
- giữ nguyên lint/typecheck/unit/integration/build/Playwright.

Không dùng database VPS hoặc secret production.

### 6. Tests

Bổ sung targeted tests/scripts chứng minh:

- fresh migration thành công;
- legacy baseline upgrade thành công;
- CHECK validity hoạt động;
- duplicate/overlap membership, staff-subject, capability grant và additional-duty assignment bị chặn theo policy;
- inactive catalog vẫn giữ lịch sử;
- schema không cascade-delete dữ liệu lịch sử quan trọng;
- seed chạy lặp không nhân bản catalog.

## Deliverables

- `prisma/schema.prisma`
- `prisma/migrations/**`
- seed/scripts migration cần thiết
- contracts/config tối thiểu
- CI migration gates
- ADR mới
- `docs/operations/PHASE-00-BASELINE-TO-PHASE-01.md`
- `docs/phase-reports/PHASE-01-SCHEMA-FOUNDATION-REPORT.md`

## Quality gates

Chạy tối thiểu:

- `npx prisma format --schema prisma/schema.prisma`
- `npx prisma validate --schema prisma/schema.prisma`
- migration tests trên PostgreSQL cô lập
- `npm run lint`
- `npm run typecheck`
- targeted tests
- `npm run build`
- `git diff --check`
- kiểm tra secret và staged files.

Nếu local không có PostgreSQL, dùng môi trường cô lập khả dụng hoặc push để CI xác nhận; không kết nối VPS.

## Commit/push

Commit theo nhóm hợp lý, push branch này. Không tạo PR, merge hoặc deploy. Dừng sau push.

## Báo cáo cuối

- branch/base;
- schema/model/constraint decisions;
- baseline và upgrade path;
- migration/test evidence;
- CI changes;
- files/commits/push;
- limitations;
- xác nhận: VPS NO, official DB NO, deploy NO, PR NO, merge NO.
