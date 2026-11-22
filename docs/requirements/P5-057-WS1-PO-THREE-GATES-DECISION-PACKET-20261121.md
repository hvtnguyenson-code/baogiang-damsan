# P5-057 / WS1 — Phiếu quyết định ba cổng G1/G3/G4 và bootstrap

**Ngày lập: 21/11/2026. PO phê duyệt ngày 22/11/2026: “Chốt G1, G3, G4”. Trạng thái: NGUYÊN TẮC NGHIỆP VỤ ACCEPTED; THỰC THI B1 VÀ CUTOVER VẪN GATED.**
Không suy diễn phê duyệt chỉ vì đã có mã nguồn/CI xanh. Không yêu cầu nhập số quyết định nhân sự, tệp đính kèm hoặc ngày ký cho thao tác thông thường.

## G1 — Ai ghi nhận bổ nhiệm/miễn nhiệm Hiệu trưởng?

**Quyết định đã duyệt:** Admin kỹ thuật được **ghi nhận vào hệ thống** người được cơ quan có thẩm quyền ngoài hệ thống bổ nhiệm làm Hiệu trưởng, không tự bổ nhiệm bản thân. Đây là thao tác ghi nhận chức trách và nguồn quyền kỹ thuật, **không tạo ra quyết định bổ nhiệm hành chính**. Cùng chủ thể được phép miễn nhiệm/chuyển giao trong app; nguồn của Hiệu trưởng cũ đóng tại thời điểm xác nhận. Hệ thống lấy actor từ phiên đăng nhập, ghi thời gian, biên nhận, phiên bản chính sách và audit. Không thêm trường bắt buộc về văn bản nhân sự.

**Chốt:** Admin kỹ thuật ghi nhận, miễn nhiệm, chuyển giao trên hệ thống theo quyết định của cấp có thẩm quyền. Không bổ sung bước xác nhận hành chính nội bộ bắt buộc cho thao tác thông thường; không cho HT tự gán `APPROVAL_PRINCIPAL`.

## G3 — `AUDIT_VIEW` có bao nhiêu nguồn?

**Quyết định đã duyệt:** Hai nguồn tách biệt, chỉ khi được cấp hợp lệ: (1) chức trách Hiệu trưởng, (2) nhiệm vụ Admin kỹ thuật. Nguồn nào kết thúc chỉ kết thúc hỗ trợ của nguồn đó; nếu nguồn còn lại có hiệu lực thì grant và projection `AUDIT_VIEW` phải giữ nguyên. Không cấp mặc định cho PHT, TTCM hoặc nhân sự khác. Mỗi lượt xem/thu hồi có audit riêng.

**Chốt:** HT và Admin kỹ thuật có hai nguồn độc lập; không mặc định cấp cho PHT/TTCM. **Chưa duyệt** chủ thể/quy trình cấp hoặc thu hồi nguồn kỹ thuật riêng; không suy diễn phê duyệt nguồn legacy hay cho phép tự cấp.

## G4 — Ai quản lý danh mục loại kiêm nhiệm?

**Quyết định đã duyệt:** PHT chuyên môn quản trị nội dung nghiệp vụ của danh mục `ADDITIONAL_DUTY_CATALOG_MANAGE`, Admin kỹ thuật hỗ trợ vận hành theo nguồn độc lập được phê duyệt. Khi chuyển giao từ Admin legacy sang PHT, không tự thu hồi quyền Admin đang có; đối soát nguồn, lập nguồn/phiên bản mới, rồi xử lý nguồn cũ bằng lệnh riêng được phê duyệt.

**Chốt:** PHT chuyên môn quản trị danh mục nghiệp vụ và Admin kỹ thuật giữ nguồn hỗ trợ vận hành độc lập đã được xác nhận. Định nghĩa G4 áp dụng trong B1 có kiểm soát; không mở quyền G4 qua template legacy/generic. Không tự động thu hồi grant hiện hữu.

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

**Phê duyệt G1/G3/G4 chỉ chốt nguyên tắc nghiệp vụ. Không phải phê duyệt nguồn quyền bootstrap Admin, key ký, danh tính issuer, đối soát legacy, cấp/thu hồi nguồn kỹ thuật, merge, deploy hoặc bật biến B1.**

### Mốc xác nhận và bàn giao 22/11/2026

- PR #290 exact HEAD `c53f98941d1a4d75063ba8d2d08bc376c69b87f3`; CI `44978705253` và P6-021 PG16 `44978705271` đều SUCCESS; PR #289/#290 Draft.
- P5-057/T56 IN_PROGRESS; P6-050 chưa đủ điều kiện. PO approval ghi tại PR #290 comment `7073734866`.
- Phần còn lại: CI checkpoint chuẩn hóa policy; UAT 7 persona thực tế; xác định issuer/trust bootstrap thật; đối soát legacy; backup/restore; phê duyệt production riêng.
- Policy `WS1-B1-G1-G3-G4-20261122`: `b1-approved-role-policy.ts` thống nhất source-seat owners của 4 key, G4 chỉ bổ sung trong đặc tả B1; từ chối drift capability nhạy cảm ngoài chính sách. Writer/preview dùng chung đặc tả; giữ key set, snapshot WS1-B1-v2, cổng mặc định OFF và template legacy. Không thêm quyền ghi nguồn kỹ thuật.
- TypeScript, ESLint scoped PASS; Jest 3 suite, 43/43 test PASS. PG17: 2 suite tự tạo schema (real writer concurrency và HTTP success) PASS, gồm vòng đời HT/PHT, nguồn AUDIT_VIEW độc lập, bảo toàn baseline; 2 suite HTTP boundary/writer ban đầu đỏ vì local public thiếu cột/bảng B1. Dựng riêng schema b1policy UUID trong baogiang_test, migrate đủ 33/33, chỉ chạy lại 2 suite: 11/11 PASS. Psql báo NOTICE lúc dọn schema; truy vấn pg_namespace xác nhận schema cụ thể còn 0. Không sửa migration hay dữ liệu thật.
- Antigravity headless từ chối command permission; không mở quyền bỏ qua kiểm soát. Mã chỉnh qua MCP trong phạm vi duyệt, kiểm tra trực tiếp diff và local tests. Exact-head CI và review trước merge vẫn cần; chưa tuyên bố independent agent review mới.
