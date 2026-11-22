# P5-057 / WS1-B1 — Nguồn khởi tạo Admin kỹ thuật lần đầu (STAGED)

**Ngày 21/11/2026. Địa vị: MÃ THỬ NGHIỆM CÔ LẬP, CHƯA CHO PHÉP DÙNG TRÊN HỆ THỐNG THẬT.**

## 1. Phạm vi

Tạo một transaction **duy nhất** trong PostgreSQL để thiết lập chứng cứ B1 đầu tiên cho Admin kỹ thuật hiện hữu, nhưng **không tạo, sửa, thu hồi hoặc nối nguồn bất kỳ grant legacy nào**:

- `authority_seats`: tạo ghế `TECHNICAL_ACCOUNT_ADMIN`, phiên bản chính sách 1.
- `access_commands`: một lệnh `B1_INITIAL_TECHNICAL_ADMIN`, actor là người có tài khoản thật khác Admin đích; bản ghi gồm fingerprint lệnh và biên nhận.
- `role_appointments`: gắn một Admin hiện hữu với ghế, có thời điểm hiệu lực và chứng cứ lệnh.
- `authorization_states`: tăng epoch để phản ánh thay đổi nguồn chức trách.
- `audit_events`: lưu dấu vân tay quyết định và bản ghi, không chứa dữ liệu bí mật.

Mã: `apps/api/src/capabilities/b1-initial-technical-admin-bootstrap.ts`.

Đây là class cô lập: **không được đăng ký trong Nest module, không có controller, API, CLI, lịch chạy hoặc điểm vào sản phẩm**. Đưa tệp vào nhánh không làm bootstrap tự chạy.

## 2. Chứng thực độc lập

- Người thực hiện/issuer phải là tài khoản ACTIVE, không phải chính Admin được gán.
- Có quyết định phê duyệt của cơ quan/người có thẩm quyền **ngoài hệ thống**, thể hiện bằng SHA-256 của văn bản; không sinh quyết định hành chính trong app.
- Nội dung lệnh gồm actor/target, requestKey, hash quyền đang có, hash quyết định, thời hạn phê duyệt; ký bằng **Ed25519** của bên phê duyệt độc lập.
- Public key Ed25519 phải lấy từ nguồn tin cậy bên ngoài, có **SHA-256 SPKI DER pin** độc lập, *không lấy từ yêu cầu của Admin hoặc ứng dụng web*. Private key không được đặt trong source, .env dùng chung, DB hay GitHub.
- Một bản ký chỉ có thời hạn tối đa 24 giờ; không hợp lệ, quá hạn, tự cấp, fingerprint khác: từ chối trước khi ghi.
- Ký số kiểm chứng tính toàn vẹn và quyền sở hữu khóa; **ai được ủy quyền giữ khóa là quyết định tổ chức riêng, chưa chốt**, không suy diễn chỉ từ chữ ký số.

## 3. Chống lặp và an toàn giao dịch

- `SERIALIZABLE` + advisory transaction lock cố định khóa toàn bộ lần bootstrap đầu tiên.
- Bắt buộc chưa tồn tại ghế, bản bổ nhiệm và lệnh bootstrap cùng loại.
- Idempotency trả lại cùng biên nhận nếu trùng requestKey/fingerprint; gửi lại với dữ liệu khác trả lỗi. Chỉ một bản cấp ghế hợp lệ.
- Đối chiếu toàn bộ grant đang hiệu lực theo SHA-256 giống công cụ kiểm kê read-only; không chạy nếu danh sách >10.000, quyền thay đổi hoặc có nhiều ứng viên Admin kỹ thuật.
- Chín grant legacy của Admin (theo kiểm kê trước đây) **không** được tự đánh dấu `ROLE_TEMPLATE`, `TECHNICAL_DIRECT` hay xem là đã xác minh nguồn; việc nguồn `coordinateId IS NULL` vẫn phải đối soát và xử lý sau.
- Admin phải có đúng một grant hiệu lực `USER_MANAGE` và `CAPABILITY_GRANT` SCHOOL_WIDE; actor và Admin đều là tài khoản ACTIVE.
- Transaction không động đến `capability_grants`, `access_coordinates`, `grant_sources`, `grant_source_revisions`, `grant_projection_revisions`.

## 4. Chứng cứ test đã tạo

`apps/api/test/capabilities/b1-initial-technical-admin-bootstrap.integration.spec.ts` chạy trên PostgreSQL được chứng nhận `baogiang_test`, dựng schema mới `b1init_<UUID>`, migrate schema tạm và seed **9 grant tổng hợp**.

Đã chạy cục bộ PostgreSQL 17:
- Chữ ký giả/tự gán/khóa không khớp từ chối.
- Quyền thay đổi so với snapshot từ chối.
- Lệnh hợp lệ tạo đúng một command, seat, appointment và audit.
- Quyền grant trước/sau deep equality, tất cả `coordinateId` legacy không đổi.
- Replay cùng lệnh không sinh bản ghi trùng; requestKey đã dùng với quyết định khác bị chặn.
- Kết quả: **1 test/1 suite PASS**, TypeScript PASS, ESLint PASS; schema thử nghiệm đã dọn sạch (0 tồn dư).

## 5. Điều kiện trước khi viết entrypoint phát hành thật

**Tuyệt đối chưa tạo CLI chạy trên VPS hoặc cờ môi trường cho phép viết.** Để nâng mã này lên thành thủ tục có quyền dùng, cần đồng thời:

1. Quyết định G1/G3/G4 được duyệt; 5 capability AI vẫn OFF.
2. Danh tính bên phê duyệt và cơ chế giữ khóa Ed25519 được người có thẩm quyền phê duyệt; cung cấp trust anchor qua kênh độc lập, không do người thực hiện tự tạo.
3. Đối chiếu real Admin hiện hữu và người cấp/ủy quyền; không đặt mã cứng ID.
4. Kiểm kê production **chỉ đọc** lần cuối và lưu hai fingerprint. Một tài khoản DB riêng chỉ cấp quyền tương ứng với thủ tục, có giám sát độc lập.
5. Backup có kiểm tra khôi phục, diễn tập transaction cùng việc hoàn tác trên DB clone, kiểm thử API/7 persona/PWA, review độc lập.
6. Phát hành mã ứng dụng chỉ sau PR #289 → #290 CI xanh/merge có kiểm soát qua GitHub. **Không SSH/MCP deploy Báo giảng**.
7. Chỉ chạy một lần trên production sau phê duyệt tách biệt; không bật `B1_ROLE_COMMANDS_ENABLED`, `B1_LEGACY_PROVENANCE_RECONCILED`, `B1_FULL_ROLE_SOURCE_CUTOVER_APPROVED` khi chưa hoàn tất đối soát quyền legacy và nghiệp vụ.

**Đây là nghiệm thu mã giao dịch trên schema tổng hợp, không phải xác minh danh tính Admin thật, phê duyệt hành chính, restore database hay nghiệm thu 7 vai trò thực tế.**
