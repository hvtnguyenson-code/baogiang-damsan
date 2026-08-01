# ADR-003: Prototype Chỉ Là Tham Khảo

**Ngày:** 2026-07-28  
**Trạng thái:** ĐƯỢC CHẤP NHẬN  
**Giai đoạn:** Phase 00 — Foundation, áp dụng cho mọi phase

## Bối cảnh

`docs/prototypes/ui-reference-phuong-an-b.html` được tạo để thảo luận bố cục và phong cách UI. Prototype có một số logic giả lập không phù hợp nghiệp vụ và không được dùng làm source production.

## Các nội dung không được sao chép

### Role selector giả lập

Prototype có mô hình `Level_1`, `Level_2`, `Level_Max` và cho phép đổi vai trò trên giao diện.

Quyết định:

- không có role selector trong production;
- quyền là capability cộng dồn và có scope;
- một người có thể đồng thời có nhiều chức năng;
- frontend không được tự quyết định quyền.

### Logic PPCT sai

Không dùng logic khóa hoặc đóng băng toàn bộ PPCT khi một tiết bị bỏ lỡ. Nợ tiết phải được quản lý độc lập và PPCT các tiết tiếp theo vẫn tiếp tục.

### Phê duyệt sai thẩm quyền

Không cho phép self-approval. Tổ trưởng, Hiệu trưởng hoặc Phó Hiệu trưởng vẫn phải đi qua luồng phê duyệt phù hợp đối với hồ sơ cá nhân.

### Dữ liệu và JavaScript mẫu

Không sao chép:

- dữ liệu mẫu;
- JavaScript của prototype;
- logic phân quyền;
- logic trạng thái;
- logic PPCT;
- logic phê duyệt.

## Nội dung có thể tham khảo

- cấu trúc header;
- nhóm điều hướng;
- cách trình bày bảng, badge và trạng thái;
- định hướng màu sắc;
- bố cục notification panel, nhưng không dùng logic mẫu.

## Thứ tự ưu tiên nguồn yêu cầu

1. Addendum `PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md`.
2. ADR hiện hành.
3. Đặc tả chính thức `PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx`.
4. Governance, policy, requirements traceability và tài liệu phase đã review.
5. Prototype HTML — chỉ tham khảo UI/UX.

Khi có mâu thuẫn, nguồn có thứ tự cao hơn luôn thắng.

## Hệ quả

- Prototype không phải source code production.
- Frontend nghiệp vụ phải được xây từ đặc tả và capability matrix.
- Mọi component UI phải được review độc lập về authorization, scope, trạng thái, accessibility và responsive.
- Không sửa prototype để biến nó thành ứng dụng thật.
