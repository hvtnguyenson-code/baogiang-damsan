# P5-057 / WS1-B — Gắn B1 vào preflight chỉ đọc (09/11/2026)

**Trạng thái:** triển khai trong nhánh riêng; **chưa nghiệm thu WS1-B/WS1, chưa mở writer**. Đây là bước 4 của tài liệu `P5-057-WS1-B1-SOURCE-EVIDENCE-SHADOW-20261109.md`, không phải luồng UX Admin mới.

## Nền tảng đã phát hành

- PR #278 / main commit `9e00377aed8a364da12e68e31d487c457a7c8757`, CI và auto-deploy VPS đã thành công. Bộ phân tích và bộ truy vấn B1 read-only có 25/25 Jest, 8/8 thử nghiệm PostgreSQL 17 cục bộ, review Codex đạt.
- Kiểm kê production ngày 08/11 ghi nhận 9/9 grant bootstrap đang hoạt động có `coordinateId=NULL`, chưa có bản ghi nguồn B1. Dữ liệu này là snapshot lịch sử, không suy ra số liệu hiện tại hoặc tự backfill.

## Phạm vi thay đổi lần này

- `AppointmentPreflightService` lấy **ID grant từ query server**, không nhận ID/histories/source từ client. Chỉ sau khi auth actor, kiểm tra template và đối tượng, mới gọi bộ đọc B1.
- Với tối đa **4 grant có coordinate**, gọi `B1RepositoryInspector.inspect(id)` qua transaction PostgreSQL `REPEATABLE READ` và `SET TRANSACTION READ ONLY`; các truy vấn này vốn đã có giới hạn số dòng và timeout theo bộ đọc được nghiệm thu.
- Nếu không có linked grant: `NO_LINKED_GRANTS`, không chạy transaction B1. Nếu có hơn 4: `DEFERRED_LIMIT`, không đọc dở một tập không đầy đủ. Nếu đọc được: `INSPECTED` và chỉ trả số lượng grant có `SUPPORT_CANDIDATE` so với `UNVERIFIED`; ngoại lệ cũng tính là chưa xác minh.
- API thêm **một trường optional** `evidence.b1Advisory` chỉ chứa thống kê, không ID, dữ liệu cá nhân, tên nguồn, thời điểm hay quyền có thể thu hồi. Client cũ tương thích.
- **Bất biến:** `mode=READ_ONLY`, `canConfirm=false`, `confirmationBlocker=B1_SOURCE_WRITER_NOT_ACTIVE`, `authorityBasis=CAPABILITY_PRECHECK_ONLY`, `evidence.provenanceVerified=false`. Không thay evaluator, writer, grant, source, schema, UI, CI/CD hay DB production.
- Chế độ `ADVISORY_ONLY` không phải bằng chứng thẩm quyền và không được sử dụng để bật command bổ nhiệm/miễn nhiệm. Mẫu quyền, nguồn nghiệp vụ, `TEACHER_BASE`, grant legacy và audit cũ vẫn giữ nguyên.

## Bằng chứng và gate phát hành

- 7 unit case mới về nguồn từ server, 2 nguồn ứng viên/chưa xác minh, giới hạn 4, quyền actor, legacy, lỗi DB, và từ chối dữ liệu cố nâng quyền.
- 5 case preflight cũ vẫn phải đạt (tổng 12/12 unit PASS bằng isolated Jest transformer). API integration có kiểm chứng legacy, CSRF, quyền actor và không có mutation, sẽ kiểm tra trên CI với PostgreSQL test.
- TypeScript local theo project vượt giới hạn tài nguyên; chỉ coi **CI chuẩn exact-head** là chứng cứ typecheck/build hợp lệ. Không được tự ghi nhận typecheck full PASS.
- Merge chỉ khi CI, compatibility, review và file diff chính xác PASS. Không thêm tuyến deploy, không restart tay; mã auto-deploy không chạy migration.
- **WS1 vẫn IN_PROGRESS**: inventory mới trên production khi mở writer, policy 9 key nhạy cảm, actor/target/scope, B1 union thời gian, idempotency/CAS, rollback, UAT Admin/PHT và 7 persona còn là gate tiếp theo. Không tuyên bố P5-057/P6-050 hoàn tất.

## Truy vết

- Task: `P5-057`, `T56`; nguồn quyết định D2/D3 ngày 07–08/11; bước B1/WS1-B trong kế hoạch 4 giai đoạn.
- Bản sửa không thay đổi thẩm quyền: Admin chỉ bổ nhiệm/miễn nhiệm PHT, PHT mới bổ nhiệm/miễn nhiệm TTCM, không tự bổ nhiệm, không phải nộp chứng từ hành chính. Quy tắc này vẫn là định hướng nghiệp vụ, **chưa có writer thực thi**.
