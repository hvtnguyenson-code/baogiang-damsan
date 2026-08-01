# PHASE 01 — Interrupted Agent Recovery

## Mục đích và mốc kiểm tra

Tài liệu này ghi inventory tại thời điểm phục hồi phiên Antigravity bị gián đoạn, trước khi thực hiện targeted restore/delete. Branch được kiểm tra là `phase/01-identity-access`; HEAD `edb9733` trùng `origin/phase/01-identity-access` (`0` commit mỗi phía).

## Inventory

| Nhóm | File/trạng thái quan sát được | Quyết định |
|---|---|---|
| Line ending | Tám tài liệu được chỉ định có index LF và working tree CRLF, nhưng tại mốc kiểm tra không có content diff được Git báo cáo: `docs/PROJECT_CONTEXT.md`, `docs/architecture/PHASE-00-FOUNDATION.md`, `docs/decisions/ADR-001-TECH-STACK.md`, `docs/decisions/ADR-003-PROTOTYPE-REFERENCE-ONLY.md`, `docs/handover/PHASE-01-ANTIGRAVITY-GOAL.md`, `docs/phase-reports/PHASE-00-INDEPENDENT-REVIEW.md`, `docs/phase-reports/PHASE-00-REPORT.md`, `docs/requirements/PHASE-01-IDENTITY-ACCESS-SPEC.md`. | Đưa từng file về HEAD trước khi áp dụng nội dung tài liệu mới; không broad renormalize. Chỉ các file thực sự sửa trong task mới chịu quy tắc LF mới. |
| Source/schema/contracts/package dở | `apps/api/package.json`, `package-lock.json`, `packages/contracts/src/index.ts`, `prisma/schema.prisma`, `scripts/db/Initialize-LocalDatabase.ps1`. | Targeted restore từng file về HEAD. Task phục hồi này không giữ bất kỳ implementation Phase 01 nào. |
| Source hỏng | `apps/api/src/common/services/password.service.ts` là file untracked, có byte NUL và không dùng được. | Xóa đúng file sau khi ghi inventory. |
| Migration dở/không an toàn | `prisma/migrations/20260729013441_phase_01_identity_access/migration.sql` tạo lại bảng `system_settings` đã thuộc baseline Phase 00; `prisma/migrations/migration_lock.toml` cũng là untracked. Migration này không an toàn để tiếp tục hoặc deploy. | Xóa đúng thư mục migration Phase 01 dở và lock file untracked; không chạy migration. |
| ADR implementation dở | `docs/decisions/ADR-005-IDENTITY-ACCESS-STRATEGY.md` là untracked và thuộc đợt triển khai Phase 01 bị gián đoạn. | Xóa file dở. Số ADR `005` sau đó trở lại là số tiếp theo chưa dùng và được dành cho quyết định chính thức về VPS/CI/CD của task tài liệu này. |
| Scratch/extracted tạm | `scratch_pa_a.txt`, `scratch_pa_b.txt` tồn tại và là bản trích tạm. Hai file `PA-A-GAS-Google-Sheets-v1.2-AI-governance.extracted.txt` và `PA-B-VPS-PostgreSQL-v1.2-AI-governance.extracted.txt` không tồn tại tại mốc kiểm tra. | Xóa đúng hai scratch đang tồn tại. Không có thao tác đối với hai extracted file đã vắng mặt; không xóa file nào khác. |

## Ranh giới phục hồi

- Giữ nguyên toàn bộ lịch sử commit và mọi file ngoài inventory.
- Không reset, clean, stash, rebase, amend, squash hoặc force-push.
- VPS không được truy cập; không deploy, không chạy migration và không thay đổi database.
- Sau phục hồi chỉ sửa tài liệu, quy tắc repository và cấu hình line ending thuộc task `PHASE-01-RECOVERY-SPEC-ALIGNMENT-001`.

## Kết quả phục hồi

- Năm file source/schema/contracts/package/script đã được targeted restore về HEAD.
- Tám tài liệu được chỉ định đã được targeted restore về HEAD trước khi áp dụng nội dung mới.
- File NUL, migration Phase 01 dở, ADR implementation dở và hai scratch file đã được xóa đúng inventory.
- Không có file ngoài danh sách bị xóa; không có source feature, schema, migration, package hoặc workflow nào được giữ/thay đổi bởi task tài liệu này.
