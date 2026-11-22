# P5-057 / WS1-B1 — Hồ sơ GO/NO-GO trước phát hành
**Lập ngày 22/11/2026. Trạng thái: NO-GO (chưa đủ chứng cứ tổ chức/production).**

Tài liệu kiểm soát việc phát hành phần mềm và **kích hoạt chức trách B1** là hai quyết định riêng, không phải một nút chung. Không biến kết quả CI thành giấy phép thay đổi quyền thực tế.

## 1. Phạm vi và các bất biến

- Repo `hvtnguyenson-code/baogiang-damsan`, phụ thuộc PR #289 (kiểm thử nền) → PR #290 (writer/API/UI), cả hai đang Draft tại thời điểm tạo hồ sơ; #290 là nhánh xếp chồng #289 dù PR base hiện đặt `main` để chạy CI chính quy.
- HEAD của #290 trước đợt kiểm tra này: `59c0abafca8ca039522db77ab481e860e4a1a089`; hai workflow `45014806965` và `45014807004` **SUCCESS**. Mọi lần push sau phải đối chiếu lại **đúng HEAD**; không mượn kết quả xanh của commit cũ.
- G1/G3/G4 đã được PO chốt về **nguyên tắc nghiệp vụ** ngày 22/11; không mở lại. Phê duyệt đó **không** là quyền bootstrap, không chứng thực người cấp quyền độc lập và không hợp thức hóa chín grant legacy.
- Năm quyền AI Phase 11 và toàn bộ cờ B1 trên production vẫn OFF. Không backfill, không thu hồi, không tự tạo lịch sử, không seed trên production khi các cổng chưa đạt.
- Báo giảng chỉ phát hành qua GitHub Actions sau merge `main` đã được cho phép; **không SSH/MCP/Desktop Commander deploy VPS**, không restart Nội trú.

## 2. Các bằng chứng kỹ thuật đã có

| Cổng | Hiện trạng | Đầu ra kiểm chứng |
|---|---|---|
| Nền test #289 + mã B1 #290 | PASS theo exact HEAD 59c0aba | CI PG17, PG16, Web/API, Windows deploy contract, Playwright smoke |
| Nguồn G3 | PASS dữ liệu tổng hợp | Dismiss HT giữ AUDIT_VIEW khi còn nguồn kỹ thuật độc lập |
| Nguồn G4 | PASS dữ liệu tổng hợp | Dismiss PHT giữ ADDITIONAL_DUTY_CATALOG_MANAGE khi còn nguồn kỹ thuật độc lập |
| 7 vai trò trên trình duyệt | PASS trong phạm vi navigation/appointment synthetic | Chromium + Nest HTTP + PostgreSQL thật tại máy thử; **không** thay thế UAT nghiệp vụ của 7 nhân sự thật |
| Bootstrap ban đầu & quyền legacy | PASS test cô lập | Transaction ký Ed25519, rollback, giữ 9 grant tổng hợp nguyên dạng, diễn tập pg_dump/pg_restore |
| Kiểm kê quyền | PASS công cụ read-only | Fingerprint quyền và fingerprint linkage độc lập; nhóm quyền chưa xác định nguồn vẫn là NOT_ESTABLISHED |
| Review độc lập | PARTIAL | Codex read-only xem riêng transactional writer: không tìm lỗi xác nhận; **chưa** có review bảo mật toàn hệ thống |

**Không chấp nhận** dùng các dòng PASS tổng hợp trên để xác nhận nguồn quyền thật hoặc dự đoán hiện trạng production.

## 3. Cổng tổ chức cần xác nhận (không thể tự suy luận từ database)

| Cổng | Chứng cứ hợp lệ tối thiểu | Trạng thái |
|---|---|---|
| A. Người chứng thực bootstrap | Quyết định có thẩm quyền ngoài hệ thống, nêu **người được ủy quyền** chứng thực Admin B1 đầu tiên; xác định actor khác Admin đích, có tài khoản ACTIVE | OPEN |
| B. Khóa ký độc lập | Ed25519 SPKI public key và SHA-256 pin do bên được ủy quyền cung cấp qua **kênh khác với người thực thi**; kiểm soát private key độc lập; ký payload có thời hạn | OPEN |
| C. Nguồn G3/G4 kỹ thuật | Văn bản/biên bản duyệt **chủ thể được cấp/thu hồi** nguồn TECHNICAL_DIRECT; quyền, phạm vi, hiệu lực, xung đột và audit; không dựa vào grant legacy như chứng cứ | OPEN |
| D. Nguồn của 9 grant đang có | Sổ đối soát từng ID quyền trên kênh nội bộ bảo mật, người chịu trách nhiệm xác minh, kết quả phân loại **có chứng cứ** hoặc giữ LEGACY_UNCLASSIFIED; không sửa gộp toàn bộ | OPEN |
| E. Cho phép hoạt động thực tế | Quyết định GO riêng về merge/triển khai mã và quyết định GO **khác** về bootstrap/bật từng cờ B1; nêu người phê duyệt/rollback | OPEN |

Không đưa tên tài khoản, UUID người dùng, đường dẫn chứa mật khẩu, private key hoặc token vào PR/GitHub hay tài liệu kiểm thử. Hash/tài liệu mật được xác nhận và lưu theo quy trình nội bộ của trường.

## 4. Cổng vận hành có thể chuẩn bị nhưng chưa thể đóng ở production

| Cổng | Tiêu chí đạt | Trạng thái |
|---|---|---|
| F. Kiểm kê production mới | DB credential chỉ-SELECT độc lập, transaction READ ONLY, host/port/database/schema khớp, hai fingerprint lưu với mốc thời gian; kết quả không thiếu hoặc cắt cụt | CHỜ CHỨNG CỨ |
| G. Backup/khôi phục production | Backup có mã kiểm tra và kiểm tra **khôi phục trên clone được kiểm soát**, bản thử trước/sau bootstrap đối chiếu grant/fingerprint/epoch và tình huống hoàn tác | CHỜ CHỨNG CỨ |
| H. Nghiệm thu 7 vai trò | Mỗi người đại diện thử ít nhất 1 nghiệp vụ **ghi/đọc hoặc phê duyệt** thuộc thẩm quyền qua PWA/trình duyệt thật; thử đường API trái quyền, đổi ca/chuyển giao, hiển thị lỗi và rollback. Ký biên bản nghiệm thu độc lập | CHỜ UAT THẬT |
| I. Review bảo mật độc lập toàn PR | Đối chiếu tất cả endpoints/generic-bypass, nguồn và cấp/thu hồi, bootstrap, idempotency, khóa CSRF, concurrency, migration/restore, thao tác điện thoại; mọi P0/P1 phải đóng | OPEN |
| J. Chuỗi PR/CI | #289 được xử lý trước #290; verify diff giữa parent và main, kiểm thử lại exact head, không có workflow đỏ; merge chỉ sau lệnh GO | OPEN |

## 5. Chuỗi triển khai an toàn (không phải lệnh thực thi)

1. Đóng A–D, có F–I; chốt danh mục blocker, số grant/seat/source hiện tại và phương án rollback có thể diễn tập.
2. Người có thẩm quyền phê duyệt **GO phát hành mã**. Sau đó review/merge #289 trước, #290 sau; xác minh GitHub CD đúng dự án Báo giảng và HTTPS health PASS, cờ B1/AI OFF. Nếu tự động deploy sau merge, hai merge phải có cửa sổ vận hành đã phê duyệt.
3. Chạy read-only preflight lần cuối trên production và so hai fingerprint với bản đã duyệt. Nếu khác: NO-GO, không cố điều chỉnh dấu vân tay để khớp.
4. Chỉ sau **GO riêng cho bootstrap**, xác nhận public key pin, actor/target, signed approval, grant snapshot, backup/rollback và thực hiện một lệnh bootstrap duy nhất có audit. Mã hiện tại **chưa có entrypoint được phép dùng trên production**; không tạo thủ tục vượt qua A/B/E.
5. Nghiệm thu lại quyền sau bootstrap, truy vết các nguồn kỹ thuật G3/G4 đã được duyệt, xử lý legacy theo từng nguồn, kiểm tra union/revoke và epoch; nếu không đủ chứng cứ, giữ flag OFF.
6. **GO kích hoạt B1** chỉ sau khi toàn bộ nguồn và full-role UAT/rollback đạt. Bật lần lượt các cổng đã duyệt; theo dõi logs/audit/health và có phương án tắt cờ không thu hồi grant trái phép.

## 6. Kết luận tại checkpoint này

**NO-GO cho bootstrap và kích hoạt B1** vì A–E, F–J còn thiếu bằng chứng thực tế hoặc phê duyệt độc lập. Mã có cờ OFF có thể được xây dựng và kiểm thử tiếp, nhưng **không có quyền tự chuyển từ Draft sang merge/deploy** chỉ nhờ CI xanh.

Để giảm việc phải phê duyệt lẻ tẻ, tập hợp **một gói quyết định tổ chức** cho A/B/C/D/E (đúng chủ thể, khóa tin cậy và quy tắc chín nguồn), đồng thời sắp lịch ký nghiệm thu H và review I. Các bí mật và danh tính riêng chỉ trao đổi qua kênh nội bộ bảo mật, không dán vào chat/GitHub.

**P5-057/T56 = IN_PROGRESS; P6-050 = BLOCKED.**
