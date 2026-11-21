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

Để gọi lệnh PRINCIPAL cần 3 cổng chung + G1/G3. Lệnh PHT cần 3 cổng chung + G4. Không dùng một cờ chung để ngầm phê duyệt cả hai chính sách. **Không được tự chỉnh env trên VPS dựa vào việc CI xanh.**

## 3. Dữ liệu production và bootstrap

Lần kiểm tra read-only ngày 21/11: một tài khoản ACTIVE, chín grant hiệu lực, **9/9 có coordinateId=NULL**; không có B1 technical seat, appointment, command, source hay projection.

- Không suy đoán 9 nguồn grant từ template, username, tên người dùng, `SYSTEM_ADMIN`, hoặc `CAPABILITY_GRANT`.
- Không tự gán B1 technical seat, `AUDIT_VIEW`, catalog kiêm nhiệm hoặc quyền AI; cần quyết định xuất xứ bootstrap, người chứng thực độc lập, kế hoạch backup/rehearsal và rollback có audit.
- Khi chưa có technical seat đã chứng thực, ngay cả khi cờ bị bật nhầm, writer từ chối actor legacy.
- Đọc context phục vụ chẩn đoán; tuyệt đối không dùng context như bằng chứng thẩm quyền.

## 4. Phần tiếp tục cần hoàn chỉnh, không được tuyên bố nghiệm thu

1. **Full-role operability:** B1 writer hiện cấp hai key nhạy cảm mỗi vai trò, trong khi template thực tế có thêm TEACHER_BASE, REPORTING, TIMETABLE, PPCT, TEACHING_OPERATION, điều hành chuyên môn… Không được bật cutover khi chưa chứng minh nguồn/tính hiệu lực cho đủ các key cần có, cũng như giữ được các nguồn quyền độc lập khi chuyển chức trách.
2. **Quyết định policy PO:** G1, G3, G4 và năm key AI chưa chốt; không tự áp dụng đề xuất hoặc thay đổi template hiện hành.
3. **B1 bootstrap:** thiết kế/duyệt chứng cứ Admin kỹ thuật đầu tiên và đối soát legacy không phá lịch sử; 9 grant không rõ nguồn phải fail-closed.
4. **Nhân sự/HTTP UAT:** kiểm thử đủ 7 persona, các lượt nhập sai, bỏ ngỏ session, thay đổi đồng thời, scope, revoke; thử thao tác màn hình thật. Hiện chỉ có integration HTTP trên test DB và các suite writer.
5. **Review độc lập:** Codex/Antigravity MCP đang báo executable không khả dụng; chưa có bằng chứng security review ký nhận. Không coi tự review hay CI là review độc lập.
6. **Triển khai:** tạo bản backup, thực hiện dry run/rollback rehearsal, PO phê duyệt rồi mới điều chỉnh env và phát hành qua GitHub xanh.

**Quyết định hiện tại:** PR ghi chỉ dành cho review. Không merge, không chạy migration, không deploy, không đổi `B1_REJECT_GENERIC_SENSITIVE_WRITES` hoặc các biến B1 tại production. `P5-057/T56=IN_PROGRESS`; `P6-050=BLOCKED`.
