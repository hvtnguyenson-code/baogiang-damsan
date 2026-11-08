# P5-057 / WS1 — Quyết định PO ngày 08/11/2026: ghi nhận trách nhiệm, không yêu cầu minh chứng hành chính

**Trạng thái:** ACCEPTED — chính sách nghiệp vụ D2–D3. Văn bản này **thay thế các yêu cầu nhập hoặc kiểm tra giấy tờ nhân sự** trong các bản dự thảo D2–D3 ngày 07/11/2026. Các rào bảo mật nghiệp vụ và ranh giới triển khai chưa thay đổi.

## 1. Mục tiêu

Báo giảng là công cụ hỗ trợ nhà trường theo dõi tiến trình dạy học, phân công chuyên môn, kê khai tiết dạy và kiểm tra tiến độ, không phải hệ thống ký/lưu trữ quyết định hành chính.

**Không bắt buộc** số/ký hiệu quyết định, ngày ban hành, người ký, bản quét, tệp tải lên, hoặc xác minh văn bản bổ nhiệm/miễn nhiệm trước khi giao quyền. Không dựng luồng ký số hoặc duyệt hồ sơ pháp lý cho D2–D3.

## 2. Thao tác tối thiểu

Người có thẩm quyền đăng nhập, chọn nhân sự, chọn chức trách/quyền và phạm vi, xem trước quyền sẽ được thêm/thu hồi, sau đó xác nhận. **Ghi chú tùy chọn**; không bắt buộc cung cấp lý do bổ nhiệm/miễn nhiệm thông thường.

Backend tự lưu: (1) tài khoản **người quyết định và xác nhận**, (2) tài khoản bị tác động, (3) bổ nhiệm/miễn nhiệm/cấp/thu hồi/chuyển giao, (4) chức trách và quyền/phạm vi bị tác động, (5) thời điểm xác nhận theo máy chủ, (6) nguồn cấp/thu hồi và trạng thái hiệu lực trước/sau. Các trường idempotency, revision, fingerprint, projection, audit vẫn là nội bộ, không bắt người dùng nhập.

Không cho nhập tên 'người quyết định' dưới dạng chữ tự do để mạo nhận quyết định: hệ thống lấy danh tính từ **phiên đăng nhập đã xác thực**. Người thao tác hộ chỉ có thể chuẩn bị bản nháp; **người thực sự có thẩm quyền phải xác nhận** nếu hai người khác nhau. Trong phạm vi UI tối giản chưa hỗ trợ thao tác hộ, người quyết định chính là người bấm xác nhận.

## 3. Thẩm quyền và an toàn

- Admin bổ nhiệm và miễn nhiệm PHT; không tự bổ nhiệm bản thân, không bổ nhiệm/miễn nhiệm TTCM.
- PHT bổ nhiệm và miễn nhiệm TTCM theo phạm vi chuyên môn; không tự bổ nhiệm/miễn nhiệm bản thân hoặc cấp quyền kỹ thuật.
- Người có thẩm quyền quyết định thay đổi quyền học thuật thì chỉ được cấp/thu hồi đúng phạm vi và danh mục cho phép. Generic capability endpoint không được là đường vòng.
- Quyền hiệu lực **ngay khi xác nhận thành công trên máy chủ**, không hồi tố.
- Thu hồi một chức trách chỉ chấm dứt **nguồn quyền thuộc chức trách đó**; giữ quyền giáo viên nền tảng và quyền có nguồn độc lập, cùng lịch sử audit.
- Dữ liệu quyền legacy không rõ nguồn không được tự động suy diễn và thu hồi.
- Với can thiệp khẩn cấp Hiệu trưởng **D4**, quy tắc lý do, thời hạn và thông báo PHT vẫn áp dụng riêng; không nhầm với bổ nhiệm thông thường.

## 4. Tác động tiến độ

**G-D2b** (chứng cứ nhân sự) và **G-D3c** (ngày hiệu lực văn bản) được đóng bằng quyết định PO này. Các gate còn lại về policy từng capability nhạy cảm, phân quyền đúng actor/target/scope, nguồn quyền B1, race/idempotency, hồi quy API và UAT vẫn phải kiểm thử. WS1 chưa được kết luận hoàn thành; không có quyền backend mới tự động được cấp chỉ vì thay đổi tài liệu.

Quy tắc giao hàng: **một nhánh, một commit, một PR**, chạy kiểm thử local rồi mới push; CI xanh và review mới merge, chỉ dùng auto-deploy hiện hữu.
