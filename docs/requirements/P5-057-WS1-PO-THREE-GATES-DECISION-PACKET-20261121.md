# P5-057 / WS1 — Phiếu quyết định ba cổng G1/G3/G4 và bootstrap

**Ngày lập: 21/11/2026. Trạng thái: ĐỀ XUẤT ĐỂ CHỦ SỞ HỮU NGHIỆP VỤ CHỐT — CHƯA CÓ HIỆU LỰC.**
Không suy diễn phê duyệt chỉ vì đã có mã nguồn/CI xanh. Không yêu cầu nhập số quyết định nhân sự, tệp đính kèm hoặc ngày ký cho thao tác thông thường.

## G1 — Ai ghi nhận bổ nhiệm/miễn nhiệm Hiệu trưởng?

**Phương án đề nghị:** Admin kỹ thuật được **ghi nhận vào hệ thống** người được cơ quan có thẩm quyền ngoài hệ thống bổ nhiệm làm Hiệu trưởng, không tự bổ nhiệm bản thân. Đây là thao tác ghi nhận chức trách và nguồn quyền kỹ thuật, **không tạo ra quyết định bổ nhiệm hành chính**. Cùng chủ thể được phép miễn nhiệm/chuyển giao trong app; nguồn của Hiệu trưởng cũ đóng tại thời điểm xác nhận. Hệ thống lấy actor từ phiên đăng nhập, ghi thời gian, biên nhận, phiên bản chính sách và audit. Không thêm trường bắt buộc về văn bản nhân sự.

**Cần xác nhận:** Admin kỹ thuật có phải người nhập/thu hồi HT, hay phải có bước xác nhận độc lập khác? Dù chọn phương án nào, không cho HT tự gán `APPROVAL_PRINCIPAL`.

## G3 — `AUDIT_VIEW` có bao nhiêu nguồn?

**Phương án đề nghị:** Hai nguồn tách biệt, chỉ khi được cấp hợp lệ: (1) chức trách Hiệu trưởng, (2) nhiệm vụ Admin kỹ thuật. Nguồn nào kết thúc chỉ kết thúc hỗ trợ của nguồn đó; nếu nguồn còn lại có hiệu lực thì grant và projection `AUDIT_VIEW` phải giữ nguyên. Không cấp mặc định cho PHT, TTCM hoặc nhân sự khác. Mỗi lượt xem/thu hồi có audit riêng.

**Cần xác nhận:** tổ chức chấp thuận cho Admin kỹ thuật tiếp tục xem audit bên cạnh HT, và ai có quyền cấp/thu hồi nguồn kỹ thuật này?

## G4 — Ai quản lý danh mục loại kiêm nhiệm?

**Phương án đề nghị:** PHT chuyên môn quản trị nội dung nghiệp vụ của danh mục `ADDITIONAL_DUTY_CATALOG_MANAGE`, Admin kỹ thuật hỗ trợ vận hành theo nguồn độc lập được phê duyệt. Khi chuyển giao từ Admin legacy sang PHT, không tự thu hồi quyền Admin đang có; đối soát nguồn, lập nguồn/phiên bản mới, rồi xử lý nguồn cũ bằng lệnh riêng được phê duyệt.

**Cần xác nhận:** chấp nhận PHT cùng có quyền quản trị danh mục hay giữ quyền này độc quyền Admin kỹ thuật? Writer hiện **giả định** PHT có quyền này, trong khi template đang phát hành không có — không được bật lệnh PHT trước khi chốt.

## 5 capability AI

Giữ **OFF** mọi `AI_CONFIGURE_POLICY`, `AI_VIEW_USAGE`, `AI_VIEW_COST`, `AI_VIEW_AUDIT`, `AI_DISABLE_SYSTEM` đến khi Phase 11 được duyệt riêng; không gộp cấp/thu hồi vào ba quyết định trên.

## Bootstrap Admin kỹ thuật B1 — ngoại lệ bắt đầu có kiểm soát

- Kiểm kê production chỉ đọc 21/11: 1 user ACTIVE, 9 grant hiệu lực đều `coordinate_id IS NULL`; 0 seat, command, source, projection B1.
- B1 Writer không thể tự chứng thực tài khoản Admin hiện hữu vì không có technical seat/source đầu tiên; **không tự gán, không viết lại lịch sử grant, không dùng actor=target**.
- Phương án thiết kế cần duyệt: một thủ tục cutover một lần do người có thẩm quyền độc lập xác nhận ngoài hệ thống, tạo chứng cứ B1 đầu tiên ghi rõ phương pháp, actor được chứng thực, thời điểm và căn cứ kiểm toán. Không giả danh người dùng, không lấy ngẫu nhiên account ID, không mặc nhiên xác thực từ `SYSTEM_ADMIN`.
- Trước thực thi thật: backup, thử toàn bộ luồng trên DB clone không chứa dữ liệu nhạy cảm, đánh giá bảo mật độc lập, diễn tập rollback, so sánh 9 grant trước/sau, phê duyệt đúng 1 lệnh bootstrap. Không chạy SQL trên VPS trong PR.

## Tiêu chí hết chặn để triển khai

1. Ba quyết định G1/G3/G4 đã được chủ thể nghiệp vụ duyệt, chuyển thành quy tắc có kiểm thử và phiên bản.
2. Full Principal/PHT operability có nguồn và revoke đúng, không chỉ hai key nhạy cảm.
3. Bootstrap technical seat từ legacy được ký nhận và diễn tập an toàn, không thay đổi trái phép grant cũ.
4. Đủ HTTP negative, concurrency, 7-persona UAT, review độc lập, backup/rollback.
5. Chỉ merge/phát hành qua CI xanh và công tắc môi trường sau khi được phê duyệt riêng.

**Không coi tài liệu đề xuất này là phê duyệt chính sách hoặc quyền thao tác production.**
