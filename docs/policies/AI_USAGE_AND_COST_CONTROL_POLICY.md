# Chính sách sử dụng và kiểm soát chi phí AI

## 1. Phạm vi

Áp dụng cho mọi provider, model, tác vụ chủ động, tác vụ thụ động, batch job và chức năng AI trong hệ thống.

## 2. Quyền sử dụng

- BGH: chỉ khi có `AI_ACTIVE_USE_SCHOOL`.
- Tổ trưởng: chỉ khi có `AI_ACTIVE_USE_DEPARTMENT` và scope tổ hợp lệ.
- Điều phối viên: chỉ khi có `AI_ACTIVE_USE_ACTIVITY` và scope hợp lệ.
- Giáo viên: chỉ có quyền nhận, xem nguồn, chỉnh sửa hoặc xác nhận gợi ý thụ động theo policy.
- Quản trị kỹ thuật: không mặc định có quyền AI nghiệp vụ.

## 3. Danh mục tác vụ

Không gọi AI ngoài task type đã phê duyệt. Mỗi task type phải định nghĩa:

- mã và phiên bản;
- mode ACTIVE/PASSIVE;
- đối tượng và capability;
- scope;
- dữ liệu vào/ra;
- prompt template version;
- model class;
- context/output limit;
- timeout/retry;
- cache policy;
- thao tác UI cho phép;
- retention và masking.

## 4. Quota và ngân sách

Quota có thể cấu hình theo:

- user;
- capability;
- task type;
- scope;
- ngày/tháng/học kỳ/năm.

Ngân sách có thể cấu hình theo:

- toàn hệ thống;
- tổ/hoạt động;
- task type;
- provider/model;
- kỳ ngân sách.

Ngưỡng cảnh báo, hạn chế và ngắt phải cấu hình; không hard-code trong mã nguồn.

## 5. Giảm chi phí

- ưu tiên rule engine/SQL cho kết quả xác định;
- model routing theo độ phức tạp;
- giới hạn context/output;
- cache theo source hash và version;
- batch cho tác vụ thụ động;
- chống gọi trùng;
- không retry vô hạn;
- tắt tác vụ không thiết yếu khi đạt ngưỡng hạn chế;
- dừng gọi provider khi đạt ngưỡng ngắt.

## 6. Dữ liệu

- chỉ gửi dữ liệu tối thiểu;
- không gửi credential, secret hoặc connection string;
- không gửi dữ liệu ngoài scope;
- file tải lên là dữ liệu không tin cậy;
- context phải có sourceRefs;
- không cho provider tự truy cập database/filesystem.

## 7. Human-in-the-loop

Mọi kết quả AI phải:

- gắn nhãn “Gợi ý của AI”;
- có nguồn và giới hạn;
- cho phép xem nguồn;
- có thao tác chỉnh sửa/chấp nhận/bỏ qua phù hợp;
- chỉ phát sinh thay đổi chính thức sau khi backend kiểm tra lại.

## 8. Audit và báo cáo

Báo cáo usage/cost phải hỗ trợ:

- theo thời gian;
- theo user/capability;
- theo task type;
- theo scope;
- theo provider/model;
- cache hit/miss;
- lỗi/timeout/retry;
- chi phí ước tính;
- gợi ý được chấp nhận/chỉnh sửa/bỏ qua.

## 9. Tắt khẩn cấp

- `AI_ENABLED=false`: tắt toàn bộ.
- `AI_ACTIVE_MODE_ENABLED=false`: tắt gọi chủ động.
- `AI_PASSIVE_MODE_ENABLED=false`: dừng tác vụ nền/thụ động.

Tắt AI không được làm mất dữ liệu nghiệp vụ hoặc ngăn người dùng hoàn thành công việc bằng chức năng chuẩn.
