# P5-057 / WS1-B1 — Snapshot thẩm quyền nguồn quyền trên server, chỉ đọc (12/11/2026)

**Bản thực hiện:** nhánh `feat/p5-057-sensitive-policy-advisory-20261112` trong PR #284, trên baseline `main@6a42ee4083c6031e406f69b03bf295ec32c996d9`. Tài liệu này ghi checkpoint **advisory only**, không triển khai quyền thật và không thay auth/API/schemas.

## Phạm vi

- Thêm `apps/api/src/capabilities/sensitive-authority-repository-preflight.ts`: lớp **không đăng ký NestJS**, không có route, không được gọi bởi writer.
- Hàm nhận `actorUserId` (phải do lớp session trusted truyền trong thiết kế tương lai), target, key/scope, command và exact sourceId khi thu hồi. **Không** nhận actor role, target role, seat, source kind hoặc chứng minh nguồn từ UI.
- Bên trong một PostgreSQL `REPEATABLE READ` và `SET TRANSACTION READ ONLY` trước câu SELECT đầu tiên, dùng `transaction_timestamp()` của server; giới hạn rows/thời gian.
- Đọc từ DB: trạng thái user (Admin phải ACTIVE và đã đổi mật khẩu; target ACTIVE/PENDING khi chuẩn bị bổ nhiệm hoặc có thể đã khóa khi thu hồi), hai technical capability đang hiệu lực, active `TECHNICAL_ACCOUNT_ADMIN` appointment với `AuthoritySeat` enabled/version/command và đối tượng khớp.
- Với `REMOVE_SOURCE`: chỉ dùng explicit source UUID, đối chiếu `GrantSource → AccessCoordinate → RoleAppointment → AuthoritySeat`, hai command source/appointment, bản revision mới nhất đã ACCEPTED tại snapshot. Source legacy, sai target/key/scope, cancelled/expired, command tự cấp đều bị từ chối.
- Hàm thuần `inspectSensitiveCapabilityPolicy` chỉ được gọi với actor responsibility **được đọc từ server** và expected target/source role derived từ capability. Không xác nhận legal office holder, nguồn và phê duyệt toàn cục, không tạo/thu hồi grant, không tính union nguồn theo khoảng thời gian.
- Mọi đường trả về có `canConfirm=false`, `provenanceVerified=false`, `writerEnabled=false`; kết quả tốt nhất là `SOURCE_CANDIDATE`. Tài khoản Admin chỉ có technical grant mà không có B1 appointment/seat thì trả `UNVERIFIED`, không tự động suy ra thẩm quyền.

## Kiểm thử

- 2 Jest suites: **40/40 PASS**, gồm policy 26 và server-source snapshot 14. Kiểm tra READ ONLY là câu SQL đầu tiên, giới hạn row/timeout, self/scope/invalid command, 5 AI, actor không có seat, multi-seat mâu thuẫn, technical grant thiếu, nguồn legacy, sai người/sai key/cancelled/expired, exact source, thiếu DB, target PENDING và thu hồi khi target DISABLED.
- TypeScript scoped: PASS. ESLint non-type-aware scoped: PASS.
- **PostgreSQL thực trên Windows: CHƯA ĐẠT KẾT LUẬN.** Lượt đầu không initdb được do locale `Vietnamese_Vietnam.1252`; lượt `--locale=C` đã tạo được cụm ephemeral trên `127.0.0.1:55497`, nhưng tool terminal timeout trước khi báo PASS/FAIL của runtime smoke. Không được khẳng định SQL đã vượt integration test. Sau timeout, PID của cụm tạm không còn chạy, `pg_isready` trên 55497 không phản hồi và toàn bộ data/scripts/log tạm đã được dọn. Không kết nối DB ứng dụng thật.
- CI và PostgreSQL 16 off-host phải chạy lại với **HEAD mới** sau khi cập nhật PR; code review độc lập phải xét cả lớp mới. Không rerun workflow đã xanh trên HEAD cũ.

## Phần chưa được chứng minh / không thể coi là writer

1. Actor issuer/seat hiện chỉ được đọc tại thời điểm kiểm chứng; chưa có CAS/idempotency giữa đọc và thay đổi thực tế, chưa kiểm tra hợp lệ của **tất cả** command trong lịch sử, chưa truy vết union nguồn chính xác qua mọi revision.
2. Khi chuẩn bị bổ nhiệm, expected target role lấy từ key là **mục đích đề xuất**, không phải sự xác minh người đó đã có chức danh. Cần có command bổ nhiệm đúng thẩm quyền, validate hồ sơ/nguồn và rollback.
3. Hai nguồn `AUDIT_VIEW` của HT/Admin kỹ thuật cần tính union có hiệu lực, chứ không tạo hai grant chồng lấn hoặc revoke theo template name. Nguồn technical legacy không được thay đổi tự động.
4. Các đường production `CapabilitiesService.create/revoke`, `AccessBaselineService.applyTemplate`, baseline và bootstrap **không thay đổi**; generic writer bypass còn OPEN/CRITICAL. Không được tuyên bố hệ thống hiện đã chặn cấp quyền chéo hoàn toàn.
5. Không đụng VPS, DB/schema thật, không sửa GitHub Actions, không restart Nội trú. Chưa nghiệm thu 7 persona, chưa merge/deploy.

**Trạng thái:** chính sách ba nhóm đã được PO chốt; **server-side preflight chỉ đọc IN_PROGRESS/ADVISORY_ONLY**; `P5-057/T56=IN_PROGRESS`, `P6-050=BLOCKED`.
