# Reporting Statement — Release / Production Deployment Readiness

**Trạng thái:** Candidate — **NO-GO / CORRECTION NEEDED**

**Ngày audit:** 2026-08-30

**Phạm vi:** audit source-controlled release/deployment readiness; không deploy, không truy cập production và không chạy migration.

## 1. Mục đích và phạm vi

Tài liệu này trả lời liệu một deployment theo đường production canonical có tạo ra một release Reporting Statement xác định (deterministic) và fail-closed hay không. Nó đánh giá migration, capability catalog, deployment controller, backup/rollback, các fact chỉ operator mới xác minh được, và kế hoạch smoke sau deploy.

Đây không phải runbook cho phép deploy. Repository không thể chứng minh trạng thái database hoặc hạ tầng production hiện tại.

## 2. Frozen release baseline

Candidate được audit là commit `67f98ee0739ddd8ab625b8e6b8ffacadd487afb7` trên `main`, merge commit của PR #76. Bằng chứng CI được cung cấp cho baseline là CI #288 PASS. Tài liệu này chỉ coi đây là evidence đầu vào; khi deploy, workflow vẫn tự kiểm exact-target CI success cho SHA được nhập.

## 3. Evidence đã đọc

- Authority: `docs/decisions/ADR-042-SUBMISSION-APPROVAL-SNAPSHOT.md`, `docs/decisions/ADR-043-PERSONAL-REPORTING-PROJECTION.md`, các freeze `REPORTING-STATEMENT-CORE-BACKEND-FREEZE.md`, `REPORTING-STATEMENT-UI1-PRODUCT-UI.md`, `REPORTING-STATEMENT-UI2-PRODUCT-FREEZE.md`, và `docs/operations/DEVELOPMENT-DEPLOYMENT-DATABASE.md`.
- Migration/schema/catalog: `prisma/schema.prisma`, toàn bộ `prisma/migrations/**`, migration Reporting bên dưới, `prisma/seed.cjs`, `package.json`.
- Production controller: `.github/workflows/deploy-production.yml` cùng `scripts/deploy/windows/{deployment-common,install-release,backup-database,run-migrations,switch-current-release,restart-baogiang-api,start-baogiang-api,test-production-health,rollback-release,invoke-production-deploy}.ps1`.
- Verification: `scripts/ci/verify-deployment-static.cjs`, `scripts/ci/verify-deployment-behavior.cjs`, `scripts/ci/verify-workflow-contract.cjs`, `scripts/ci/test-deployment-windows.ps1`.

## 4. Migration inventory và an toàn persistence

Migration Reporting hiện có là `20260817010000_reporting_statement_persistence_schema_foundation`, đứng sau các migration baseline, academic structure, assignment, timetable, PPCT, overlay, special activity và teaching execution. Không có migration Reporting nào sau nó tại baseline.

Migration này là append-only với database hiện hữu: chỉ `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, và `ALTER TABLE ... ADD CONSTRAINT` cho các object mới; không có `DROP`, `TRUNCATE`, hay DML xoá dữ liệu. Nó tạo sáu persistence object theo logical model:

| Logical object | Bảng | Bằng chứng integrity chính |
| --- | --- | --- |
| `ReportingStatementSeries` | `reporting_statement_series` | logical unique `(statement_profile, submitter_user_id, academic_year_id, from_civil_date, to_civil_date)`; date/profile checks |
| `ReportingStatementRevision` | `reporting_statement_revisions` | series-paired FKs, unique predecessor, self-reference checks, semantic-hash format |
| `ReportingStatementLifecycleState` | `reporting_statement_revision_states` | revision/series FK và partial unique một `SUBMITTED`, một `APPROVED` cho mỗi series |
| `ReportingStatementRevisionSubject` | `reporting_statement_revision_subjects` | composite PK và frozen revision/subject FKs |
| `ReportingStatementCommand` | `reporting_statement_commands` | unique `(actor_user_id, command_type, request_key)` và command-shape check |
| `ReportingStatementHistory` | `reporting_statement_histories` | event-shape check, series/revision/actor/command/caused-by FKs và history indexes |

Các FK Reporting dùng `ON DELETE RESTRICT ON UPDATE CASCADE`. Đây bảo vệ series/revision/state/subject/command/history và các reference frozen khỏi deletion ngầm. Vì migration không backfill hay thay đổi dữ liệu cũ, migration persistence này được đánh giá **READY**, với điều kiện canonical backup và migration gate bên dưới chạy thành công.

## 5. Capability catalog: phát hiện quyết định

### Khai báo và cơ chế cài đặt hiện có

`prisma/seed.cjs` khai báo chính xác:

| CapabilityDefinition | `allowedScopeTypes` |
| --- | --- |
| `REPORTING_STATEMENT_SUBMIT` | `PERSONAL` |
| `REPORTING_STATEMENT_READ` | `PERSONAL`, `SUBJECT`, `SCHOOL_WIDE` |
| `APPROVAL_PRINCIPAL` | `SCHOOL_WIDE` |
| `APPROVAL_VICE_PRINCIPAL` | `SCHOOL_WIDE` |

Hàm `seedCapabilityCatalog` dùng một `$transaction` của `capabilityDefinition.upsert`, cập nhật/create key, description, allowed scopes, `isSystem: true` và `isActive: true`. Toàn file chỉ thực hiện catalog definition này: không tạo demo user, role grant, academic data hay fake Reporting record; không cleanup/destructive delete. Vì upsert theo `key`, seed idempotent và về mặt dữ liệu là catalog-only.

Tuy vậy, nó không có production guard/environment policy riêng. `package.json` chỉ expose command `npm run prisma:seed`; command không được gọi bởi canonical production workflow hay controller. Search toàn `prisma/migrations/**`, `apps/api/src/**`, `scripts/**` và `.github/workflows/deploy-production.yml` không tìm thấy Reporting capability insert/upsert trong migration, runtime startup synchronizer, hoặc production deployment seed step.

### Kết luận catalog

- **Question A — database production hiện có các row không?** **OPERATOR VERIFICATION REQUIRED.** Source repository không có quyền và cũng không thể chứng minh fact này.
- **Question B — canonical production deployment có bảo đảm tạo/cập nhật chúng không?** **Không.** Canonical path chạy `prisma migrate deploy`, nhưng không cài catalog definitions bằng migration, startup sync hay seed catalog an toàn cho production.

**NO-GO — CAPABILITY CATALOG INSTALLATION IS NOT GUARANTEED BY THE CANONICAL DEPLOYMENT PATH.** Đây là blocker release-readiness. Việc production có thể từng chạy seed thủ công không đóng blocker này.

`CapabilityDefinition` chỉ là catalog xác định key/scope được phép. Nó không phải `CapabilityGrant`; catalog tồn tại cũng không cấp quyền cho người dùng thật. Không được suy grant từ role, title, tổ chuyên môn, duty hoặc `SYSTEM_ADMIN`. Operator phải quyết định và cấp grants nghiệp vụ riêng cho giáo viên, hiệu trưởng, phó hiệu trưởng và các user khác trước khi feature được dùng.

## 6. Deployment và migration contract

`deploy-production.yml` chỉ có `workflow_dispatch`, environment `production`, concurrency group không hủy run đang chạy, và yêu cầu `commit_sha`, confirmation, `run_migrations`, `allow_code_rollback_after_migration`. Workflow kiểm SHA lowercase 40 ký tự, ancestor của `origin/main`, exact target CI success; tạo Git archive exact commit và SHA-256; pin SSH host key, dùng `StrictHostKeyChecking=yes`, truyền parameter JSON giới hạn, và dùng domain chính xác `https://baogiang.dtnt-damsan.edu.vn`.

`invoke-production-deploy.ps1` thực thi theo thứ tự thực tế:

```text
validate deployment/runtime identity và nginx config
→ install exact checked artifact
→ verified database backup
→ migration (khi được yêu cầu)
→ switch current release
→ restart Báo giảng API
→ production health
```

`run-migrations.ps1` fail-closed: yêu cầu `AllowProductionMigration` và `BackupVerified`, validate identity/environment/executable, ép PostgreSQL port `5433`, rồi chạy:

```text
migration state before
→ prisma migrate status
→ prisma migrate deploy
→ migration state after deploy
→ prisma migrate status after deploy
```

Status lỗi chỉ được chấp nhận là pending theo pattern đã phân loại; lỗi bất thường dừng. Không dùng `prisma migrate dev`, `prisma migrate reset`, `prisma db push`, hay seed fake data. **Migration deployment contract: READY.**

`backup-database.ps1` yêu cầu thư mục backup tồn tại (đã bootstrap/ACL review), đọc environment đã validate, ép DB port `5433`, tạo unique UTC filename `baogiang-<timestamp>.dump` định dạng custom, kiểm non-empty, `pg_restore --list`, SHA-256 và trả metadata. Bất kỳ lỗi nào dừng controller trước migration. `pg_restore --list` là verification đọc cấu trúc archive, không phải restore thử đầy đủ; operator vẫn phải ghi nhận kết quả và khả năng phục hồi theo quy trình được phê duyệt riêng.

Khi fail trước switch, current pointer chưa đổi. Khi fail sau switch/restart:

- first deployment: controller dừng exact Báo giảng runtime và quarantine failed release;
- migration đã attempt nhưng `RollbackCompatibilityApproved` false: dừng, không code rollback mù;
- không migration attempt, hoặc compatibility được approval explicit: mới gọi canonical rollback;
- rollback script cũng tự chặn nếu migration attempted mà thiếu approval.

Không có reverse migration được suy diễn hay thực hiện tự động.

## 7. Operator prerequisites — OPERATOR VERIFICATION REQUIRED

Repository không thể tự chứng minh checklist này. Operator phải xác minh và lưu evidence trước deploy:

- [ ] current production release SHA
- [ ] production service identity
- [ ] current Prisma migration state
- [ ] Reporting Statement migration pending/applied state
- [ ] capability definitions current state và đúng `allowedScopeTypes`
- [ ] capability grants cho user dự kiến sử dụng feature
- [ ] `DATABASE_URL`/production environment validity
- [ ] PostgreSQL port/identity contract (port `5433`)
- [ ] backup directory/storage availability
- [ ] backup artifact generated và `pg_restore --list` result
- [ ] service/task identity
- [ ] nginx config
- [ ] TLS/domain health
- [ ] API health trước deployment

Catalog prerequisite và operational authorization prerequisite là hai gate độc lập. Không tự động grant cho bất kỳ người dùng production nào.

## 8. GO / NO-GO matrix

| Gate | Evidence source | Status | Blocking? |
| --- | --- | --- | --- |
| main exact SHA / CI | baseline và workflow exact-target check | READY, cần operator chọn exact SHA | Có |
| Reporting migration | migration `20260817010000...` | READY | Có |
| migration safety | SQL append-only, constraints/FKs, `run-migrations.ps1` | READY | Có |
| backup-before-migrate | `invoke-production-deploy.ps1`, `backup-database.ps1` | READY | Có |
| capability catalog deterministic installation | seed/search/workflow audit | **BLOCKER** | **Có** |
| production capability catalog state | production-only DB fact | OPERATOR VERIFICATION REQUIRED | Có |
| operational grants | production-only authorization fact | OPERATOR VERIFICATION REQUIRED | Có |
| exact deployment artifact | workflow Git archive + SHA-256 | READY | Có |
| rollback compatibility | controller input/guards | READY; approval required after migration | Có |
| pre-deploy health | operator-only fact | OPERATOR VERIFICATION REQUIRED | Có |
| post-deploy smoke | plan bên dưới | PENDING future approved deploy | Có |
| production approval | human/business authorization | OPERATOR VERIFICATION REQUIRED | Có |

## 9. Post-deploy smoke plan (không chạy trong audit này)

Ưu tiên read-only; operator chỉ dùng account thật/được chỉ định và không tạo fake business record.

1. Infrastructure: kiểm HTTPS health, API health, web static load, và login.
2. Reporting workspace: route chỉ hiện khi capability đúng; workspace context và academic-year labels tải được; không lộ raw technical ID.
3. Read-only Statement: nếu đã có Statement, dùng owner hoặc user được read-authorized mở frozen detail, lifecycle/history và kiểm không lộ dữ liệu kỹ thuật. Nếu chưa có Statement, không tạo Statement giả chỉ để smoke.
4. Mutating smoke (submit/approve/reject) mặc định không chạy. Chỉ làm khi có một real scenario được business phê duyệt explicit; không tạo test business record trên production.

## 10. Rollback decision tree

```text
Failure
├─ Chưa attempt migration → canonical code rollback khi cần
└─ Đã attempt migration
   ├─ compatibility chưa review/approve → stop, giữ evidence, operator intervention
   ├─ migration backwards-compatible + allow_code_rollback_after_migration=true
   │  → canonical code rollback có thể chạy
   └─ migration không backwards-compatible → không automatic code rollback;
      DB recovery chỉ theo recovery procedure được phê duyệt riêng
```

## 11. Known blocker và required next action

**Blocker:** deployment path canonical không bảo đảm Reporting Statement capability definitions được cài/cập nhật, dù `prisma:seed` hiện kỹ thuật là catalog-only và idempotent.

**Correction principle (không implement trong audit branch này):** cung cấp một bước capability-catalog installation/synchronization deterministic, production-safe, fail-closed, nằm trong reviewed canonical deployment path; kèm test/contract coverage chứng minh ordering và failure behavior. Thiết kế correction phải vẫn tách catalog definition khỏi operational `CapabilityGrant` và không tự cấp quyền nghiệp vụ.

Sau correction, cần audit/review độc lập lại từ commit exact, xác nhận test/contract, rồi operator hoàn thành toàn bộ checklist production-only trước khi có thể kết luận GO.

## 12. Verdict

**CORRECTION NEEDED.** Persistence migration và deployment controller có các guard cần thiết, nhưng release không sẵn sàng production vì capability catalog installation chưa được canonical deployment path bảo đảm. Không có deploy, production access, production DB access, migration execution hoặc runtime code change trong audit này.
