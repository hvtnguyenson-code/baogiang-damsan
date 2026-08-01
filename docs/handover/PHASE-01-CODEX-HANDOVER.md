# Phase 01 — Codex Handover

## Trạng thái bàn giao

Repository đã được phục hồi khỏi phiên Antigravity bị gián đoạn. Không có implementation Phase 01 nào từ phiên đó được giữ lại. Task kế tiếp phải bắt đầu bằng audit mới trên branch/task riêng và không được chạy goal Antigravity đã deprecated.

## Nguồn bắt buộc và thứ tự ưu tiên

1. `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md`
2. `docs/decisions/ADR-005-OFFICIAL-VPS-CI-CD.md` và các ADR hiện hành khác
3. `docs/specifications/PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx`
4. `docs/requirements/PHASE-01-IDENTITY-ACCESS-SPEC.md`
5. `AGENTS.md`, runbook operations và tài liệu phase

Khi nguồn thấp hơn mâu thuẫn, dùng nguồn cao hơn và ghi lại quyết định trong báo cáo task.

## Phạm vi Codex cho Phase 01

Codex chịu trách nhiệm schema/migration, auth/session/authorization, capability/scope, audit, API/contracts, CI, security, integration/E2E và các thay đổi kiến trúc. Nền móng Phase 01 phải gồm catalog/assignment kiêm nhiệm động nhưng chưa áp dụng quy tắc giảm định mức; `WorkloadAdjustmentRule` chỉ là kiến trúc cho phase nghiệp vụ sau.

## Gate trước khi code

- Xác minh branch mới dành riêng cho task và working tree rõ nguồn gốc.
- Đọc đầy đủ nguồn bắt buộc, không dựa vào báo cáo PASS cũ.
- Lập traceability từ acceptance case tới implementation/test.
- Nếu có frontend, thực hiện UI/UX gate trong addendum v1.3 và ghi principal skill/design direction.
- Không truy cập VPS, deploy hoặc chạy migration trên database chính thức nếu task không cấp quyền riêng.

## Evidence bàn giao bắt buộc

Task implementation sau này phải báo cáo file thay đổi, migration path từ Phase 00, unit/integration/E2E results, CI final-head evidence, security checks, diff/secret inspection và các trạng thái commit/push/PR. Merge và deploy là các quyết định riêng sau independent GitHub review.
