# P5-057 / WS1-B1 — Kiểm kê bootstrap Admin legacy chỉ đọc

**Ngày 21/11/2026. Trạng thái: STAGED — chưa phê duyệt bootstrap, không chạy trên production.**

## Mục đích

Cung cấp bản kiểm kê có thể đối soát trước/sau chuyển đổi Admin legacy, mà không gán nguồn quyền bằng suy đoán, không cấp/thu hồi quyền và không cần sửa PostgreSQL schema.

Các thành phần:
- `scripts/ops/b1-bootstrap-readonly-preflight.cjs`: chỉ đọc qua transaction PostgreSQL `REPEATABLE READ`, đặt `SET TRANSACTION READ ONLY`, kiểm tra `current_setting('transaction_read_only') = 'on'` trước mọi truy vấn dữ liệu. Không có endpoint, cron hoặc lệnh ghi.
- `scripts/ops/b1-bootstrap-readonly-preflight.test.cjs`: tám kiểm thử đơn vị về 9 grant, trùng quyền, dấu vân tay, phân biệt chứng cứ kỹ thuật với xác nhận nhân sự và kiểm soát transaction đọc.
- `scripts/ops/b1-bootstrap-readonly-rehearsal.cjs`: diễn tập bằng dữ liệu tổng hợp **chỉ** trên DB cục bộ `baogiang_test`; script tạo schema UUID riêng, migrate, seed giả, kiểm tra và xóa schema trong `finally`. Không chạy script rehearsal với dữ liệu production.

## Đầu ra không chứa thông tin cá nhân

- Tổng số grant hiệu lực, số grant legacy thiếu `coordinateId`, số tài khoản **ứng viên** đang có cả `USER_MANAGE` và `CAPABILITY_GRANT` (không công nhận là Admin B1).
- Số `TECHNICAL_ACCOUNT_ADMIN` seat hoạt động, số bản ghi bổ nhiệm B1 còn hiệu lực, số bản ghi lệnh B1 và số coordinate/source/projection.
- `grantRightsFingerprintSha256`: SHA-256 của ID grant, người hưởng quyền (không xuất ID), capability, phạm vi, hiệu lực và người cấp quyền. **Không** gồm `coordinateId`. Dùng so sánh nội dung quyền trước/sau.
- `grantLinkageFingerprintSha256`: SHA-256 có thêm `coordinateId`. Dùng phát hiện thay đổi liên kết nguồn.
- `canConfirm=false` và `provenanceVerified=false` trong mọi trường hợp. Chỉ có bằng chứng DB không thay được xác nhận nhân sự độc lập.
- Giới hạn 10.000 grant: nếu vượt, không xuất dấu vân tay và chặn kết luận.

Khi chạy kiểm kê **chỉ đọc** trên một kết nối đã được người có thẩm quyền cung cấp riêng, thiết lập `B1_PREFLIGHT_ACK=READ_ONLY`, `B1_PREFLIGHT_DATABASE_URL` và hai giá trị đối chiếu độc lập `B1_PREFLIGHT_EXPECT_HOST`, `B1_PREFLIGHT_EXPECT_DATABASE`. Cổng/sơ đồ có thể chỉ rõ qua `B1_PREFLIGHT_EXPECT_PORT` (mặc định 5432) và `B1_PREFLIGHT_EXPECT_SCHEMA` (mặc định public). Khi host, port, database hoặc schema lệch thì công cụ từ chối kết nối. Sau đó gọi:

```powershell
node scripts/ops/b1-bootstrap-readonly-preflight.cjs
```

Nếu thiếu các biến bắt buộc hoặc đích PostgreSQL không khớp, công cụ từ chối chạy. Không in chuỗi kết nối hoặc thông tin định danh người dùng. Nên dùng tài khoản PostgreSQL chỉ có quyền `SELECT`, ngoài lớp transaction read-only.

Bước CI mới thực hiện rehearsal thực trên PostgreSQL 17 với schema thử nghiệm riêng, sau bước chuẩn bị database test. CI không chạy công cụ đối với production.

## Diễn tập đã thực hiện

- `node --test scripts/ops/b1-bootstrap-readonly-preflight.test.cjs`: **8/8 PASS**.
- PostgreSQL 17 localhost, database `baogiang_test`, schema `b1ready_<UUID>`: **B1_BOOTSTRAP_SCRATCH_REHEARSAL_PASS**.
- 9 grant legacy tổng hợp: phát hiện đúng `legacyUnlinked=9`, không gán seat hoặc nguồn quyền.
- Thử liên kết một grant tổng hợp: quyền và grant ID giữ nguyên (rights fingerprint bất biến), liên kết thay đổi (linkage fingerprint thay đổi).
- Sau thử nghiệm `B1_READY_SCHEMA_REMAINS=0`.
- Không dùng tài khoản/thông tin/ID production; không tác động VPS. Không coi kết quả này là diễn tập phát hành hoặc rollback production.

## Những việc vẫn bị chặn

1. **G1/G3/G4:** chủ sở hữu nghiệp vụ chưa duyệt quy tắc bổ nhiệm Hiệu trưởng, hai nguồn `AUDIT_VIEW` và quyền danh mục kiêm nhiệm PHT. Không tự bật các policy flags.
2. **Bootstrap độc lập:** Admin hiện hữu có 9 grant legacy thiếu coordinate theo kiểm kê production chỉ đọc trước đó; chưa có technical seat. Cần **một người thực được ủy quyền độc lập**, không giả lập actor khác, xác nhận bổ nhiệm Admin kỹ thuật ban đầu; phải lưu được chứng cứ ngoài hệ thống và lệnh B1 có kiểm toán. Không sử dụng `SYSTEM_ADMIN` làm chứng cứ tự suy.
3. **Nguồn của 9 legacy grant:** tuyệt đối không tự chuyển thành `ROLE_TEMPLATE` hay `TECHNICAL_DIRECT`. Chỉ cập nhật linkage sau đối soát, phê duyệt riêng và test nguồn phù hợp. Việc có coordinate không tự chứng nhận lịch sử nguồn, và writer hiện vẫn từ chối nguồn `LEGACY_UNCLASSIFIED`.
4. **Reconciliation & khôi phục:** lấy hai fingerprint trước/sau, đảm bảo không thay đổi quyền hiệu lực ngoài danh mục đã phê duyệt; backup có kiểm tra phục hồi, diễn tập rollback trên clone, rồi kiểm tra đầy đủ hậu chuyển đổi.
5. **Nghiệm thu:** bảy vai trò trên giao diện thật/PWA, phân quyền API, PG16/17 CI, review bảo mật, vận hành theo lịch và phê duyệt cutover.
6. **Production:** không bật `B1_ROLE_COMMANDS_ENABLED`, `B1_LEGACY_PROVENANCE_RECONCILED`, `B1_FULL_ROLE_SOURCE_CUTOVER_APPROVED` hay các cờ PO khác khi những điều kiện trên chưa hoàn tất.

**Đề nghị bước phát triển tiếp:** một thủ tục bootstrap nguồn Admin B1 **tách biệt và không có đường truy cập public**, chỉ sinh lệnh một lần sau khi có quyết định nguồn quyền độc lập và đủ chứng cứ rollback. Thủ tục này không thuộc công cụ kiểm kê chỉ đọc nói trên.
