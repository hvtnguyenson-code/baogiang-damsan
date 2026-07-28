# Checklist bàn giao thiết kế AI

Người tiếp nhận phải xác nhận từng mục trước khi thay đổi hoặc triển khai Phase 11.

## A. Nguyên tắc

- [ ] AI triển khai sau cùng, không thuộc MVP.
- [ ] AI chỉ hỗ trợ, không quyết định.
- [ ] AI không ghi trực tiếp dữ liệu nghiệp vụ.
- [ ] Giáo viên không có chatbot/prompt tự do.
- [ ] BGH/tổ trưởng/điều phối viên chỉ dùng AI chủ động khi có capability và scope.
- [ ] Hệ thống lõi hoạt động đầy đủ khi AI tắt.

## B. Kiến trúc

- [ ] Có `AiTaskCatalog` và prompt template version.
- [ ] Có `AiPolicyGuard` kiểm tra mode/capability/scope.
- [ ] Có quota và budget guard.
- [ ] Có context builder với sourceRefs.
- [ ] Có provider adapter thay thế được.
- [ ] Có output validator.
- [ ] Có suggestion store, audit và usage/cost ledger.
- [ ] Có cache/batch/chống trùng.
- [ ] Có disabled adapter trong Phase 0-10.

## C. Quyền

- [ ] `AI_ACTIVE_USE_SCHOOL` chỉ cấp có chủ đích.
- [ ] `AI_ACTIVE_USE_DEPARTMENT` có scope tổ và hiệu lực.
- [ ] `AI_ACTIVE_USE_ACTIVITY` có scope điều phối.
- [ ] Giáo viên chỉ có capability thụ động phù hợp.
- [ ] `SYSTEM_ADMIN` không mặc định có quyền AI nghiệp vụ.

## D. Chi phí

- [ ] Quota và ngân sách cấu hình được.
- [ ] Có ngưỡng cảnh báo/hạn chế/ngắt.
- [ ] Có model routing.
- [ ] Có context/output limit.
- [ ] Có usage/cost report.
- [ ] Cache/batch không vượt scope.

## E. UX và thao tác

- [ ] Gợi ý có nhãn AI, nguồn và giới hạn.
- [ ] Giáo viên nhận gợi ý tại đúng màn hình nghiệp vụ.
- [ ] Không có menu chatbot mở cho giáo viên.
- [ ] BGH/tổ trưởng/điều phối viên ưu tiên task catalog.
- [ ] Xác nhận gọi lại use case nghiệp vụ và revalidate.

## F. Kiểm thử

- [ ] Giáo viên không gọi được endpoint active.
- [ ] Scope bypass bị từ chối ở backend.
- [ ] Quota/budget được thực thi.
- [ ] Ba kill switch hoạt động.
- [ ] Prompt injection/file injection được kiểm thử.
- [ ] AI lỗi không ảnh hưởng core.
- [ ] Không có secret hoặc dữ liệu ngoài scope trong log.

## G. Tài liệu nguồn bắt buộc

- `docs/specifications/PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx`
- `docs/architecture/AI_GOVERNANCE_AND_ACCESS_MODEL.md`
- `docs/decisions/ADR-004-CONTROLLED-AI-ACTIVE-PASSIVE.md`
- `docs/policies/AI_USAGE_AND_COST_CONTROL_POLICY.md`
- `docs/requirements/AI_REQUIREMENTS_TRACEABILITY.md`
- `docs/requirements/PHASE-00-AI-PORTS-ADDENDUM.md`
