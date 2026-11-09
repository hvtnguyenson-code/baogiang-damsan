# P5-057 / WS1-B — B1 source/support shadow inspection (09/11/2026)

**Trạng thái: LOCAL IMPLEMENTATION ONLY — NOT API-WIRED, NOT MERGED, NOT DEPLOYED.**
**Đúng commit nguồn:** `origin/main@8f496d012a884a5285d5c213c32e564b4e615860` (CI #919, deploy #43 đã nghiệm thu).
**Worktree cô lập:** `D:\baogiang-damsan\.worktrees\ws1-b-b1-preview-20261109`, nhánh `feat/p5-057-ws1-b-source-evidence-preview-20261109`.
**Không thay đổi:** root working tree, B1 schema, auth evaluator, controller, API contract, user/CapabilityGrant, CI/CD, VPS, Nội trú.

## 1. Bổ sung mã thử nghiệm (fail-closed)

- `apps/api/src/capabilities/b1-source-evidence-inspector.ts`: hàm thuần `inspectB1SourceEvidence()`, không Prisma, không IO, không endpoint, không mutation.
- Đầu vào là lịch sử **đầy đủ do server tự truy vấn và xác minh**, gồm grant, coordinate, projection revision/slice/support và source revision. **KHÔNG tin dữ liệu client**; cờ `historiesComplete` là điều kiện tiên quyết của caller server, không phải dấu kiểm tự xác thực.
- Từ chối grant legacy `coordinateId=NULL`, bản ghi history không đầy đủ, revision/projection lặp, sai user/coordinate, grant revoked/expired, projection cũ, source revision cũ hoặc support đã hết hiệu lực tại thời điểm kiểm tra.
- Khi đủ dấu hiệu, trả `SUPPORT_CANDIDATE` — **chỉ là chứng cứ ứng viên**, không chứng minh tất cả nguồn quyền đã được kiểm kê hay grant có thể thu hồi. Bất biến ở **mọi nhánh**: `canConfirm:false`, `provenanceVerified:false`. Không được dùng kết quả để mở writer.
- Giữ giới hạn: kiểm tra latest revision theo số revision và projection version; chưa có nguồn `source.kind`/seat authority từ DB, chưa chứng minh đủ mọi `GrantSupport`, chưa có snapshot DB nhất quán, chưa so với evaluator trong transaction thật.

## 2. Bộ kiểm thử cục bộ

- `apps/api/test/capabilities/b1-source-evidence-inspector.spec.ts`: 14 case covering 1 nguồn, 2 nguồn độc lập, legacy NULL, incomplete snapshot, stale source revision, nửa mở `[from, until)`, latest projection, cross-user/cross-coordinate/duplicate, expired/revoked/wrong grant, deterministic no mutation.
- **Standalone Node assertions (transpile cùng mã từ tệp test Jest): 10/10 PASS**, 0 lỗi.
- **TypeScript strict typecheck (source + test): PASS**.
- **Jest focused (temporary isolated TypeScript transform): 14/14 PASS**, 1 suite PASS; temporary Jest config removed. Original project-wide Jest config has not passed locally (OOM and StackOverflow before test results). This focused result does not replace default CI validation.
- Không chạy DB production, không tạo mới DB, không chạy CI GitHub.

## 3. Các bước bắt buộc trước khi mở PR hoặc bật preview trong API

1. Jest scoped 14/14 is now PASS with an isolated transpile config. The standard Jest configuration and full regression remain to be proven in CI before merge.
2. Thiết kế `B1RepositoryInspector` bằng truy vấn **chỉ đọc**, có giới hạn kích thước/budget và ảnh chụp nhất quán trong một transaction PostgreSQL có `READ ONLY`, lấy `latest projection/source revisions` và đầy đủ grant/support theo coordinate. Không cho client truyền `historiesComplete=true`.
3. Chạy integration test PostgreSQL 17 cô lập cho trường hợp hai nguồn, stale/unknown/legacy, không dùng dữ liệu production.
4. Chỉ sau đó cân nhắc gắn kết quả vào `AppointmentPreflightService` dưới nhãn `ADVISORY_ONLY`; giữ contract `mode=READ_ONLY`, `canConfirm=false`, `provenanceVerified=false`. Không biến evidence thành authorization.
5. Đối chiếu chính sách PO ngày 08/11: Admin bổ nhiệm/miễn nhiệm PHT, PHT bổ nhiệm/miễn nhiệm TTCM; không bắt nộp giấy tờ; audit tự ghi actor từ session; chưa có writer thật.
6. Review độc lập + CI exact-head + một PR nhỏ trước merge; deploy bằng workflow cũ, không thay CI/CD.

**Kết luận:** Đây là gói nền tảng để thẩm tra chứng cứ B1, **chưa phải WS1-B hoàn chỉnh** và không làm thay đổi chức năng production. Mục đích là cố định các bất biến an toàn trước khi nối dữ liệu DB và UI.

## 4. Truy vấn bằng chứng B1 từ PostgreSQL — kiểm thử cục bộ

**Trạng thái:** mã đọc nội bộ B1RepositoryInspector, không đăng ký NestJS DI,
không có endpoint, không nối vào AppointmentPreflightService, không writer.

- Tệp: apps/api/src/capabilities/b1-repository-inspector.ts. Nhận ID grant đã
  được server xác thực; truy vấn grant, coordinate, tất cả source revision,
  projection, slice và support bằng SQL có tham số, không nhận history từ client.
- Cùng một PostgreSQL transaction REPEATABLE READ, SET TRANSACTION READ ONLY
  trước mọi SELECT, statement timeout 4.000 ms, transaction timeout 6.000 ms,
  chờ transaction tối đa 1.500 ms.
- Giới hạn: 32 sources, 256 source revisions, 64 projections, 512 slices,
  1.024 supports. LIMIT + 1 để không bỏ sót tràn ngân sách. Khi thiếu, lỗi,
  quá giới hạn hay timeout: UNVERIFIED, canConfirm=false,
  provenanceVerified=false. Legacy coordinate_id NULL chưa được xác minh.
- Kiểm tra user/coordinate/capability/scope, coordinate CAS version khớp latest
  projection, source ownership, revision và support tham chiếu hợp lệ.
  SUPPORT_CANDIDATE vẫn chỉ là chỉ báo chưa đủ để writer thay đổi quyền.

### Bằng chứng kiểm thử

- Jest 25/25 PASS: 14 ca logic nguồn B1 và 11 ca repository giả lập Prisma.
  TypeScript strict PASS. Jest chạy bằng isolated transformer để tránh lỗi OOM
  do ts-jest cấu hình chung; chưa thay thế hồi quy chuẩn của CI.
- PostgreSQL 17.10 8/8 PASS: cụm tạm độc lập cổng 55439, cấu trúc bảng B1
  tối thiểu khớp cột thực tế; chạy SQL trực tiếp qua Prisma. Chứng minh
  hai nguồn hỗ trợ độc lập, stale revision, legacy, mismatch revision và
  coordinate/projection; PostgreSQL thực tế từ chối UPDATE trong READ ONLY.
  Chưa phải kiểm thử toàn bộ migration ứng dụng.
- Đã dừng và xóa cụm PostgreSQL, bảng dữ liệu và script/log giả lập.
  Không kết nối production/VPS; không chạm dữ liệu thật.

### Chốt phạm vi

Đây là phần repository B1 hoàn thành ở nhánh cục bộ, không phải nghiệm thu
toàn bộ WS1. Mọi kết quả tiếp tục chỉ advisory, không tự mở quyền bổ nhiệm
hoặc thu hồi. Chỉ cân nhắc nối preflight ADVISORY_ONLY theo gate đã thống
nhất sau review, hồi quy và CI. Không mở writer khi nguồn quyền B1 chưa đủ
bằng chứng theo đặc tả.
- Review độc lập (Codex, task 27d03d09-e11c-4c34-a833-ab551d6a0086):
  REVIEW_PASS_NO_BLOCKER. Phạm vi đúng bốn tệp B1 đã giao, không phải
  kiểm toán toàn bộ repository. Review chỉ đọc, changedFiles=[].