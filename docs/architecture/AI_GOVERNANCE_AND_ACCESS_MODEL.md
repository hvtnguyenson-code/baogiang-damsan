# Mô hình quản trị, quyền truy cập và tích hợp AI

## 1. Trạng thái tài liệu

- Dự án: Hệ thống Báo giảng và thống kê tiết dạy tự động
- Đơn vị: Trường PTDTNT THPT Đam San
- Phiên bản: 1.0
- Ngày: 28/07/2026
- Trạng thái: Kiến trúc bắt buộc cho Phase 11; các cổng tích hợp phải được chừa sẵn từ Phase 0

## 2. Nguyên tắc bất biến

1. AI là phân hệ triển khai cuối cùng, sau khi toàn bộ phân hệ lõi đã kiểm thử, pilot, nghiệm thu và vận hành ổn định.
2. AI chỉ hỗ trợ phân tích, tóm tắt, diễn giải và soạn nháp; AI không ra quyết định chuyên môn hoặc quản lý.
3. AI không truy cập trực tiếp PostgreSQL, Google Sheets, filesystem hoặc công cụ ghi dữ liệu.
4. Mọi thay đổi chính thức phải đi qua use case nghiệp vụ hiện có, kiểm tra lại quyền, trạng thái và ràng buộc tại thời điểm ghi.
5. Giáo viên không có chatbot hoặc ô prompt tự do.
6. Quyền sử dụng AI chủ động chỉ cấp cho BGH, tổ trưởng và điều phối viên theo capability và phạm vi được giao.
7. Hệ thống lõi phải hoạt động đầy đủ khi AI bị tắt, hết quota, timeout hoặc nhà cung cấp lỗi.
8. Mọi lần gọi AI phải đo được usage, chi phí ước tính, nguồn dữ liệu, actor, scope, task type và kết quả.

## 3. Hai chế độ sử dụng

### 3.1. ACTIVE — chủ động có kiểm soát

Đối tượng có thể được cấp quyền:

- BGH: phạm vi toàn trường;
- tổ trưởng chuyên môn: phạm vi tổ đang có hiệu lực;
- điều phối viên: phạm vi hoạt động, khối hoặc lớp được giao.

Người dùng chỉ được:

- chọn task type trong danh mục đã phê duyệt;
- nhập tham số nghiệp vụ được định nghĩa trước;
- sử dụng câu hỏi tự nhiên nếu tính năng đó đã bật, nhưng câu hỏi vẫn phải được phân loại về một task type, scope và data contract hợp lệ.

Không được:

- gọi model trực tiếp;
- yêu cầu dữ liệu ngoài scope;
- tự tạo tool/action mới;
- bỏ qua quota, ngân sách hoặc audit;
- biến kết quả AI thành quyết định chính thức mà không xác nhận.

### 3.2. PASSIVE — thụ động theo chính sách

Đối tượng chính: giáo viên.

Trigger hợp lệ:

- sự kiện nghiệp vụ đã định nghĩa;
- lịch định kỳ đã được BGH phê duyệt;
- tác vụ do người có quyền chủ động yêu cầu;
- batch job có chống trùng và quota.

Giáo viên nhận:

- tóm tắt việc cần làm;
- diễn giải cảnh báo;
- bản nháp ghi chú, giải trình hoặc đề nghị;
- gợi ý xử lý theo dữ liệu cá nhân;
- nút xem nguồn, chỉnh sửa, xác nhận hoặc bỏ qua.

Giáo viên không có:

- ô chat tự do;
- prompt tùy ý;
- quyền yêu cầu phân tích hàng loạt;
- quyền gọi AI liên tục;
- quyền mở rộng scope dữ liệu.

## 4. Capability bắt buộc

| Capability | Mục đích |
|---|---|
| `AI_ACTIVE_USE_SCHOOL` | AI chủ động phạm vi toàn trường |
| `AI_ACTIVE_USE_DEPARTMENT` | AI chủ động phạm vi tổ chuyên môn |
| `AI_ACTIVE_USE_ACTIVITY` | AI chủ động phạm vi điều phối |
| `AI_RECEIVE_SUGGESTION` | Nhận gợi ý thụ động |
| `AI_CONFIRM_SUGGESTION` | Xác nhận gợi ý để gọi use case nghiệp vụ |
| `AI_EDIT_DRAFT` | Chỉnh sửa bản nháp AI |
| `AI_CONFIGURE_POLICY` | Cấu hình task, model, quota, ngân sách |
| `AI_VIEW_USAGE` | Xem usage |
| `AI_VIEW_COST` | Xem chi phí |
| `AI_VIEW_AUDIT` | Xem nhật ký AI |
| `AI_DISABLE_SYSTEM` | Tắt AI hoặc từng chế độ |

Không suy quyền AI từ tên chức danh. `SYSTEM_ADMIN` không mặc định có quyền xem dữ liệu chuyên môn hoặc dùng AI nghiệp vụ.

## 5. Luồng kiến trúc

```text
User action / Domain event / Schedule
              |
              v
        AiTaskCatalog
              |
              v
         AiPolicyGuard
     mode + capability + scope
              |
              v
 AiQuotaGuard + AiBudgetGuard
              |
              v
      AiContextQueryPort
  snapshot tối thiểu + sourceRefs
              |
              v
      AiProviderAdapter
 structured output + usage metadata
              |
              v
      AiOutputValidator
              |
              v
 AiSuggestionStore + AiUsageLedger
              |
              v
  UI: xem nguồn / sửa / xác nhận / bỏ qua
              |
              v
 Existing business command/use case
 revalidate quyền + dữ liệu + idempotency
```

## 6. Cổng tích hợp phải tồn tại

- `AiAssistantPort`
- `AiContextQueryPort`
- `AiPolicyGuard`
- `AiTaskCatalog`
- `PromptTemplateRegistry`
- `AiQuotaGuard`
- `AiBudgetGuard`
- `AiUsageMeter`
- `AiCostLedger`
- `AiPassiveTriggerPort`
- `AiSuggestionDeliveryPort`
- `AiProviderAdapter`
- `AiOutputValidator`
- `AiSuggestionStore`
- `AiAuditService`
- `AiResultCache`
- `DisabledAiAssistantAdapter`

Trong Phase 0-10, các cổng có thể là interface/port và adapter disabled; không gọi provider thật.

## 7. Feature flags và kill switch

Tối thiểu:

- `AI_ENABLED=false`
- `AI_ACTIVE_MODE_ENABLED=false`
- `AI_PASSIVE_MODE_ENABLED=false`

Có thể tắt thêm theo:

- task type;
- capability;
- tổ/hoạt động;
- provider/model;
- môi trường;
- kỳ ngân sách.

## 8. Kiểm soát chi phí

Mọi giá trị đều cấu hình, không hard-code:

- quota theo user/capability/task/scope/kỳ;
- ngân sách theo tháng, học kỳ hoặc năm;
- ngưỡng cảnh báo, hạn chế và ngắt;
- giới hạn context và output;
- model routing theo độ phức tạp;
- timeout và retry;
- cache theo `task_type + scope + source_hash + prompt_version + model_version`;
- batch và chống gọi trùng cho tác vụ thụ động;
- không dùng model mạnh nhất cho tác vụ đơn giản.

## 9. Dữ liệu và audit

Mỗi request phải ghi tối thiểu:

- request ID;
- actor ID;
- capability và scope;
- mode ACTIVE/PASSIVE;
- task type và prompt version;
- sourceRefs/source hash;
- provider/model;
- input/output usage;
- chi phí ước tính;
- cache hit/miss;
- trạng thái, timeout, retry;
- suggestion ID;
- hành động chấp nhận/chỉnh sửa/bỏ qua;
- command/use case phát sinh sau xác nhận.

Không ghi secret. Việc lưu prompt/output thô phải theo retention và masking policy.

## 10. Điều kiện mở Phase 11

Chỉ mở khi:

- Phase 0-10 đã nghiệm thu và vận hành ổn định;
- regression core xanh khi AI tắt;
- BGH phê duyệt task catalog, capability, scope, dữ liệu, provider/model, quota và ngân sách;
- có kill switch, runbook và audit;
- có test prompt injection, leakage, scope bypass và chi phí;
- pilot theo thứ tự: governance → passive → active → mở rộng.
