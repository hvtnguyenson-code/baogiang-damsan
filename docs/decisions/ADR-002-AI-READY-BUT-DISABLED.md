# ADR-002: AI-Ready nhưng Tắt Mặc Định

**Ngày:** 2026-07-28  
**Trạng thái:** ĐƯỢC CHẤP NHẬN  
**Giai đoạn:** Phase 00 — Foundation (có hiệu lực đến Phase AI)

---

## Bối cảnh

Hệ thống Báo giảng là một hệ thống nghiệp vụ giáo dục phức tạp với nhiều quy trình phê duyệt, theo dõi và kiểm toán. Tích hợp AI là một tính năng được lên kế hoạch, nhưng phải được triển khai sau cùng khi toàn bộ nghiệp vụ đã ổn định.

---

## Quyết định

### AI được triển khai ở Phase cuối

AI **không được tích hợp** cho đến khi:
1. Toàn bộ phân hệ nghiệp vụ (TKB, PPCT, Bảng kê, Phê duyệt, Thông báo) đã vận hành ổn định
2. Ban lãnh đạo nhà trường phê duyệt kế hoạch tích hợp AI cụ thể

### Chỉ có Ports và Adapters

Trong Phase 00, chỉ tạo:
- **Interfaces (ports):** `AiAssistantPort`, `AiContextQueryPort`, `AiPolicyGuard`, `NotificationPublisherPort`, `PushGatewayPort`
- **Disabled Adapter:** `DisabledAiAssistantAdapter` — không gọi bất kỳ mạng nào

### Feature Flag mặc định

```
AI_ENABLED=false
```

Giá trị này là mặc định và **bắt buộc** trong mọi file `.env.example`.

### Quy tắc bất biến của AI

Dù AI có được kích hoạt trong tương lai, **không bao giờ được phép:**

| Hành động | Trạng thái |
|-----------|------------|
| AUTO_APPROVE (tự duyệt) | ❌ CẤMTUYỆT ĐỐI |
| AUTO_REJECT (tự từ chối) | ❌ CẤM TUYỆT ĐỐI |
| AUTO_MODIFY (tự sửa dữ liệu nghiệp vụ) | ❌ CẤM TUYỆT ĐỐI |
| SUGGEST (gợi ý) | ✅ Chỉ khi AI_ENABLED=true |
| SUMMARIZE (tóm tắt) | ✅ Chỉ khi AI_ENABLED=true |
| DRAFT (soạn nháp) | ✅ Chỉ khi AI_ENABLED=true |

Interface `AiPolicyGuard.isActionPermissible()` thực thi ràng buộc này ở runtime.

---

## Các thành phần AI trong Phase 00

### Interfaces đã tạo (không có implementation thật)

```
apps/api/src/common/ports/ai-ports.ts
  ├── AiRequestContext
  ├── AiSuggestionResult<T>
  ├── AiContextQueryPort
  ├── AiAssistantPort
  ├── AiPolicyGuard
  ├── NotificationPublisherPort
  └── PushGatewayPort

apps/api/src/common/ports/disabled-ai.adapter.ts
  └── DisabledAiAssistantAdapter (no-op, no network)
```

---

## Hệ quả

- Hệ thống lõi hoạt động đầy đủ khi không có AI
- Không có endpoint AI nào được expose ở Phase 00
- Không có API key AI nào được lưu trong codebase
- `DisabledAiAssistantAdapter` được test để xác nhận không gọi mạng
- Khi Phase AI đến, chỉ cần implement ports và đổi adapter trong DI container
