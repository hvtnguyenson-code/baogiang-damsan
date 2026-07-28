# ADR-004: AI chủ động có kiểm soát và AI thụ động cho giáo viên

- Trạng thái: Accepted
- Ngày: 28/07/2026

## Bối cảnh

Hệ thống có nhiều người dùng giáo viên. Mở chatbot hoặc prompt tự do cho toàn bộ giáo viên làm tăng rủi ro truy cập sai phạm vi, khó kiểm soát hành vi và chi phí nhà cung cấp AI. AI chỉ được dùng để giảm thao tác, không thay thế thẩm quyền.

## Quyết định

1. Chỉ BGH, tổ trưởng và điều phối viên có thể được cấp quyền AI chủ động.
2. Quyền chủ động được cấp bằng capability riêng và luôn có scope.
3. Giáo viên chỉ dùng AI thụ động qua các gợi ý, phân tích hoặc bản nháp do hệ thống tạo theo policy.
4. Giáo viên không có ô chat/prompt tự do.
5. Mọi tác vụ phải thuộc `AiTaskCatalog`, có prompt template version, data contract, model class, quota và ngân sách.
6. AI không ghi trực tiếp dữ liệu; người dùng xác nhận và backend nghiệp vụ kiểm tra lại trước khi ghi.
7. AI có ba kill switch độc lập: toàn hệ thống, active mode và passive mode.
8. Usage/cost ledger là bắt buộc.

## Hệ quả tích cực

- kiểm soát chi phí;
- kiểm soát dữ liệu và scope;
- giảm prompt injection từ người dùng phổ thông;
- dễ audit và bàn giao;
- vẫn hỗ trợ giáo viên ngay trong ngữ cảnh công việc;
- có thể thay provider/model mà không đổi nghiệp vụ lõi.

## Đánh đổi

- cần xây task catalog và policy engine;
- không linh hoạt như chatbot mở;
- cần thiết kế trigger và UX gợi ý thụ động;
- cần theo dõi usage, cache, batch và ngân sách.

## Phương án bị loại

### Chatbot tự do cho mọi giáo viên

Bị loại vì khó kiểm soát scope, dữ liệu, chi phí và trách nhiệm.

### AI tự động thực hiện hành động

Bị loại vì AI không được có thẩm quyền quyết định hoặc ghi dữ liệu chính thức.

### Chỉ khóa theo role tĩnh

Bị loại vì một người có nhiều capability và phạm vi thay đổi theo thời gian; quyền phải là capability + scope + hiệu lực.
