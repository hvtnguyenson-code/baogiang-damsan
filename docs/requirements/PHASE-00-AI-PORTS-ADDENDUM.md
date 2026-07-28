# Phụ lục Phase 00: Cổng AI phải chừa sẵn

Tài liệu này bổ sung cho Phase 00. Không triển khai tính năng AI thật và không gọi provider.

## 1. Interface/port tối thiểu

- `AiAssistantPort`
- `AiContextQueryPort`
- `AiPolicyGuard`
- `AiTaskCatalog`
- `PromptTemplateRegistry`
- `AiQuotaGuard`
- `AiBudgetGuard`
- `AiUsageMeter`
- `AiPassiveTriggerPort`
- `AiSuggestionDeliveryPort`
- `AiProviderAdapter`
- `AiOutputValidator`
- `AiSuggestionStore`
- `AiAuditService`
- `AiResultCache`
- `DisabledAiAssistantAdapter`

Các port có thể là interface và implementation disabled/no-op. Không tạo business schema hoặc provider integration trong Phase 00.

## 2. Capability constants

- `AI_ACTIVE_USE_SCHOOL`
- `AI_ACTIVE_USE_DEPARTMENT`
- `AI_ACTIVE_USE_ACTIVITY`
- `AI_RECEIVE_SUGGESTION`
- `AI_CONFIRM_SUGGESTION`
- `AI_EDIT_DRAFT`
- `AI_CONFIGURE_POLICY`
- `AI_VIEW_USAGE`
- `AI_VIEW_COST`
- `AI_VIEW_AUDIT`
- `AI_DISABLE_SYSTEM`

## 3. Feature flags

- `AI_ENABLED=false`
- `AI_ACTIVE_MODE_ENABLED=false`
- `AI_PASSIVE_MODE_ENABLED=false`

## 4. Contract nguyên tắc

- giáo viên không có active prompt endpoint;
- không có chatbot UI trong Phase 00;
- disabled adapter không gọi mạng;
- core không phụ thuộc provider;
- mọi interface phải typecheck và có contract/unit test tối thiểu;
- không tạo secret hoặc `.env` AI;
- không tạo bảng AI production trong baseline Phase 00 nếu schema lõi chưa được khóa.

## 5. Tiêu chí kiểm tra sau Phase 00

- [ ] Các port/constant/flag tồn tại hoặc có ADR giải thích vì sao hoãn.
- [ ] `DisabledAiAssistantAdapter` trả trạng thái disabled an toàn.
- [ ] Unit test xác nhận không gọi provider/network.
- [ ] Không có endpoint active cho giáo viên.
- [ ] Build/lint/typecheck vẫn đạt khi AI bị tắt.
