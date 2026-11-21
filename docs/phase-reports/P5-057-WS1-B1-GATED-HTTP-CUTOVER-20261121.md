# P5-057/WS1 — Cổng HTTP B1 theo nguồn (21/11/2026)

**Trạng thái: STAGED / DRAFT / CHƯA CHO PHÉP PHÁT HÀNH.** Nhánh phát triển này xếp chồng lên PR #289 (bộ test PostgreSQL/HTTP đã xanh), không sửa `main`, migration, phiên DB thật, deploy pipeline hay dữ liệu Nội trú.

## 1. Phần đã mã hóa

- `POST /api/role-appointments/commands`: lệnh APPOINT, DISMISS, TRANSFER cho hai seat PRINCIPAL và VICE_PRINCIPAL_ACADEMIC. DTO whitelist; actor lấy duy nhất từ session xác thực, không có actor/issuer/authority truyền từ client. CSRF Origin và `USER_MANAGE` + `CAPABILITY_GRANT` trường-wide là điều kiện cần; writer tiếp tục kiểm chứng seat kỹ thuật B1, nguồn thời điểm cấp, tính hợp lệ target, transaction SERIALIZABLE, lock/CAS, idempotency và audit.
- `GET /api/role-appointments/command-context?role=...`: chỉ đọc; có guard phiên và hai capability. Trả phiên bản ghế, epoch, danh sách ID bổ nhiệm đang hiệu lực, blockers, tình trạng chứng cứ kỹ thuật. `canConfirm=false` bất kể trạng thái; đây **không phải phê duyệt** hay dữ liệu thay thế kiểm tra lại trong transaction.
- Tất cả endpoint ghi **mặc định DENY**, fail-closed nếu bất kỳ biến kích hoạt cần thiết nào không bằng chuỗi `true`.

## 2. Cổng kích hoạt độc lập — hiện chưa được cho phép

Các biến **chưa được bật ở production**:

| Biến | Ý nghĩa |
|---|---|
| `B1_ROLE_COMMANDS_ENABLED` | Cổng luồng HTTP mới; OFF nếu không khai báo |
| `B1_REJECT_GENERIC_SENSITIVE_WRITES` | Phải chặn đường generic 9 key nhạy cảm và template before cutover |
| `B1_LEGACY_PROVENANCE_RECONCILED` | Người có thẩm quyền đã nghiệm thu đối soát legacy và nguồn Admin B1; cờ không thay thế chứng cứ trong DB |
| `B1_PRINCIPAL_POLICY_APPROVED` | Quyết định G1 về người xác nhận HT |
| `B1_AUDIT_SOURCE_POLICY_APPROVED` | Quyết định G3 về nguồn `AUDIT_VIEW` |
| `B1_PHT_CATALOG_POLICY_APPROVED` | Quyết định G4 về `ADDITIONAL_DUTY_CATALOG_MANAGE` cho PHT |

Để gọi lệnh PRINCIPAL cần 4 cổng chung + G1/G3. Lệnh PHT cần 4 cổng chung + G4. Không dùng một cờ chung để ngầm phê duyệt cả hai chính sách. **Không được tự chỉnh env trên VPS dựa vào việc CI xanh.**

## 3. Dữ liệu production và bootstrap

Lần kiểm tra read-only ngày 21/11: một tài khoản ACTIVE, chín grant hiệu lực, **9/9 có coordinateId=NULL**; không có B1 technical seat, appointment, command, source hay projection.

- Không suy đoán 9 nguồn grant từ template, username, tên người dùng, `SYSTEM_ADMIN`, hoặc `CAPABILITY_GRANT`.
- Không tự gán B1 technical seat, `AUDIT_VIEW`, catalog kiêm nhiệm hoặc quyền AI; cần quyết định xuất xứ bootstrap, người chứng thực độc lập, kế hoạch backup/rehearsal và rollback có audit.
- Khi chưa có technical seat đã chứng thực, ngay cả khi cờ bị bật nhầm, writer từ chối actor legacy.
- Đọc context phục vụ chẩn đoán; tuyệt đối không dùng context như bằng chứng thẩm quyền.

## 4. Phần tiếp tục cần hoàn chỉnh, không được tuyên bố nghiệm thu

1. **Full-role operability:** B1 Writer V2 đã được mã hóa để quản lý quyền SCHOOL_WIDE đầy đủ, nhưng phải đạt CI PostgreSQL 16/17 và cutover gate trước khi kích hoạt; template còn TEACHER_BASE, REPORTING, TIMETABLE, PPCT, TEACHING_OPERATION, điều hành chuyên môn… Không được bật cutover khi chưa chứng minh nguồn/tính hiệu lực cho đủ các key cần có, cũng như giữ được các nguồn quyền độc lập khi chuyển chức trách.
2. **Quyết định policy PO:** G1, G3, G4 và năm key AI chưa chốt; không tự áp dụng đề xuất hoặc thay đổi template hiện hành.
3. **B1 bootstrap:** thiết kế/duyệt chứng cứ Admin kỹ thuật đầu tiên và đối soát legacy không phá lịch sử; 9 grant không rõ nguồn phải fail-closed.
4. **Nhân sự/HTTP UAT:** kiểm thử đủ 7 persona, các lượt nhập sai, bỏ ngỏ session, thay đổi đồng thời, scope, revoke; thử thao tác màn hình thật. Hiện chỉ có integration HTTP trên test DB và các suite writer.
5. **Review độc lập:** Codex/Antigravity MCP đang báo executable không khả dụng; chưa có bằng chứng security review ký nhận. Không coi tự review hay CI là review độc lập.
6. **Triển khai:** tạo bản backup, thực hiện dry run/rollback rehearsal, PO phê duyệt rồi mới điều chỉnh env và phát hành qua GitHub xanh.

**Quyết định hiện tại:** PR ghi chỉ dành cho review. Không merge, không chạy migration, không deploy, không đổi `B1_REJECT_GENERIC_SENSITIVE_WRITES` hoặc các biến B1 tại production. `P5-057/T56=IN_PROGRESS`; `P6-050=BLOCKED`.

## 21/11 — bổ sung đối chiếu vận hành đầy đủ (read only)

- `GET /api/role-appointments/operability-preview?role=PRINCIPAL|VICE_PRINCIPAL_ACADEMIC&targetUserId=<UUID>` có SessionAuthGuard và cả `USER_MANAGE` + `CAPABILITY_GRANT` ở scope SCHOOL_WIDE.
- Đối chiếu **toàn bộ specification** từ `materializeTemplateGrants()` (quyền cá nhân của giáo viên, đọc báo cáo, quản lý thời khóa biểu, PPCT, các năng lực điều hành và các capability nhạy cảm) với grant hiện hiệu lực của target; trả số thiếu, trùng, legacy chưa liên kết, có liên kết nhưng chưa kiểm chứng nguồn, và giới hạn kiểm kê.
- Ngay cả khi mọi capability đã có, `canConfirm=false` và `provenanceVerified=false`: kết quả chỉ là chẩn đoán, không chứng nhận lineage/union source; không thay đổi grant, appointment, audit hoặc policy.
- Kết quả này chứng minh khoảng cách giữa hai key nhạy cảm của writer và full template; nó **không** thay thế việc implement source-aware operability trong transaction trước cutover.
## 21/11 — engine nguồn đầy đủ V2 (đang nghiệm thu)

- Giữ engine `B1RoleCommandWriter` đang có, không tạo cơ chế cấp quyền song song. Mở rộng chế độ `fullTemplate=true`: mọi capability `SCHOOL_WIDE` của catalog `PRINCIPAL` và `VICE_PRINCIPAL_ACADEMIC` được materialize thành một nguồn `ROLE_TEMPLATE` riêng, append-only command/projection/support trong cùng transaction SERIALIZABLE. PHT bổ sung `ADDITIONAL_DUTY_CATALOG_MANAGE` **chỉ sau G4 được duyệt**.
- `TEACHER_BASE` và các capability `PERSONAL` vẫn thuộc nguồn giáo viên độc lập, không nhập vào chức trách HT/PHT, không bị thu hồi khi miễn nhiệm; writer kiểm tra tồn tại một grant cá nhân hiệu lực duy nhất trước khi ghi chức trách. Thiếu/đè grant personal: fail closed, không tự cấp lén.
- Snapshot của chức trách V2 lưu danh sách source key và phiên bản cố định. Nếu nâng cấp chính sách làm lệch snapshot của bổ nhiệm cũ, chuyển giao/miễn nhiệm không tự chạy, yêu cầu reconciliation có audit.
- API write bắt buộc có thêm flag `B1_FULL_ROLE_SOURCE_CUTOVER_APPROVED=true`, bên cạnh các cờ chính sách G1/G3/G4, legacy và chặn generic. Chưa bật bất kỳ flag nào trên production.
- Preview đối chiếu trả riêng phần chỉ được Writer hai-key cũ quản lý, phần được Writer đầy đủ V2 quản lý, và các quyền cá nhân độc lập. Trạng thái `ACTIVE_LINKED_UNVERIFIED` không bao giờ tương đương chứng cứ đủ.
- Test HTTP synthetic full lifecycle và bảo toàn baseline cá nhân chạy trên schema riêng; chờ đúng-head CI trên PostgreSQL 16/17 để xác nhận. Kiểm thử này không phê duyệt thao tác trên tài khoản thật.