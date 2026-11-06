# D2 — Phân định quyền kỹ thuật và chuyên môn (đề xuất WS1)

**Ngày:** 06/11/2026. **Phạm vi:** Báo giảng, tài liệu độc lập. **Trạng thái:** Product Owner xác nhận tiền đề trường luôn có PHT chuyên môn; thiết kế chi tiết chưa được duyệt triển khai.

**Không thiết kế:** tình huống không có PHT chuyên môn, tài khoản cứu hộ cho Admin, cấp quyền chuyên môn cho Admin vì thiếu PHT, tự thêm vai trò quyền PHT hoặc hệ thống quyền thứ hai.

**Admin kỹ thuật:** tạo/quản lý tài khoản, gán hoặc đổi mẫu vai trò theo phân công thực tế; không tự cấp từng capability chuyên môn, tự bổ nhiệm hoặc dùng lệnh nghiệp vụ PHT. Mọi đổi mẫu phải kiểm tra trước tập grant thêm/thu hồi, giao dịch nguyên tử và audit.

**PHT chuyên môn chính:** trực tiếp cấu hình và cấp/đổi/thu hồi quyền học thuật của giáo viên, tổ trưởng, điều phối và PHT khác theo phạm vi/thời điểm. Command chuyên môn hẹp, không cấp quyền kỹ thuật, không tự cấp hoặc tự trao quyền cấp tiếp.

**D2 cần code (chưa phê duyệt; xem phụ lục đối chiếu 38 capability tại `docs/phase-reports/P5-057-WS1-D2-CODE-AND-CAPABILITY-AUDIT-20261106.md`):** phân loại allowlist kỹ thuật/chuyên môn ngay tại backend; chặn Admin dùng generic CAPABILITY_GRANT để cấp grant học thuật lẻ; có API hẹp cho gán mẫu vai trò; command chuyên môn riêng cho PHT; anti-self-promotion; ghi nguồn phân công và audit; phân biệt grant do mẫu với grant độc lập để thu hồi đúng khi đổi vai trò; kiểm kê quyền legacy trước cutover. B1 provenance schema đã deploy nhưng chưa kích hoạt writer/logic, không được giả định đã thực thi chính sách này.

**Tiêu chuẩn nghiệm thu:** Admin gán PHT cho người khác đúng phân công PASS; Admin tự gán PHT/cấp quyền chuyên môn lẻ DENY; PHT cấp quyền học thuật đúng scope PASS; PHT cấp quyền kỹ thuật hoặc tự cấp DENY; đổi vai trò giữ quyền độc lập, thu hồi grant cũ, giữ lịch sử; sai scope hoặc quyền hết hạn DENY. Không can thiệp Nội trú/VPS; không đóng WS1 khi D2/D3/D5/D6 còn các cổng chưa duyệt.
