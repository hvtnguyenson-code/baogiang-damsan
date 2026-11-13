# BÁO CÁO REVIEW ĐỘC LẬP MÃ NGUỒN, BẢO MẬT VÀ TÍNH TOÀN VẸN GIAO DỊCH POSTGRESQL (PR #285 / P5-057 WS1-B1)

---

## 1. Metadata và Phạm vi Kiểm tra

### 1.1. Thông tin chung
- **Dự án:** Báo giảng Đam San (`hvtnguyenson-code/baogiang-damsan`)
- **Nhiệm vụ:** P5-057 (WS1 / B1 Staged Role Writer)
- **Pull Request liên quan:** PR #285 (GitHub)
- **Môi trường review bắt buộc:** Worktree cô lập tại `D:\baogiang-damsan\.worktrees\ws1-b1-writer-20261112`
- **Nhánh làm việc:** `feat/p5-057-ws1-b1-writer-20261112`
- **Git HEAD SHA:** `5f9b747d61813d426c45e2bf8ac82b9fc527ec61`
- **Thời điểm thực hiện review:** 2026-11-13T19:05:00+07:00
- **Công cụ thực thi review:** Antigravity IDE (chế độ kiểm tra độc lập, read-only đối với mã nguồn)
- **Tài liệu nhiệm vụ đầu vào:** `docs/phase-reports/PR285-B1-ANTIGRAVITY-INDEPENDENT-REVIEW-REQUEST-20261113.md`

### 1.2. Hiện trạng Git Worktree
Kiểm tra trực tiếp tại `D:\baogiang-damsan\.worktrees\ws1-b1-writer-20261112` qua `git status -sb`:
- **Branch status:** `## feat/p5-057-ws1-b1-writer-20261112...origin/feat/p5-057-ws1-b1-writer-20261112`
- **6 tệp đã sửa đổi nhưng chưa commit (Uncommitted Modified Files):**
  1. [apps/api/src/bootstrap/bootstrap-admin.ts](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/bootstrap/bootstrap-admin.ts#L48-L56)
  2. [apps/api/src/capabilities/access-baseline.service.ts](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/access-baseline.service.ts#L475-L485)
  3. [apps/api/src/capabilities/b1-role-command-writer.ts](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/b1-role-command-writer.ts#L1-L597)
  4. [apps/api/src/capabilities/capabilities.service.ts](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/capabilities.service.ts#L330-L380)
  5. [apps/api/test/capabilities/b1-role-command-writer.spec.ts](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/test/capabilities/b1-role-command-writer.spec.ts#L1-L328)
  6. [docs/phase-reports/P5-057-WS1-B1-STAGED-ROLE-WRITER-20261112.md](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/docs/phase-reports/P5-057-WS1-B1-STAGED-ROLE-WRITER-20261112.md#L1-L101)
- **6 tệp mới chưa theo dõi (Untracked Files):**
  1. [apps/api/src/capabilities/sensitive-generic-writer-gate.ts](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/sensitive-generic-writer-gate.ts#L1-L27)
  2. [apps/api/test/capabilities/b1-role-command-writer.integration.spec.ts](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/test/capabilities/b1-role-command-writer.integration.spec.ts#L1-L145)
  3. [apps/api/test/capabilities/sensitive-generic-writer-gate.spec.ts](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/test/capabilities/sensitive-generic-writer-gate.spec.ts#L1-L53)
  4. [apps/api/test/capabilities/sensitive-generic-writer-ingress.spec.ts](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/test/capabilities/sensitive-generic-writer-ingress.spec.ts#L1-L76)
  5. [docs/phase-reports/PR285-B1-ANTIGRAVITY-INDEPENDENT-REVIEW-REQUEST-20261113.md](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/docs/phase-reports/PR285-B1-ANTIGRAVITY-INDEPENDENT-REVIEW-REQUEST-20261113.md#L1-L118)
  6. [prisma/migrations/20261113160000_p5_057_ws1_multi_vice_seat/migration.sql](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/prisma/migrations/20261113160000_p5_057_ws1_multi_vice_seat/migration.sql#L1-L20)

### 1.3. Phương pháp tiếp cận và Giới hạn kiểm tra
- **Phương pháp:** Đọc toàn bộ mã nguồn TypeScript, phân tích luồng thực thi giao dịch, đối chiếu cấu trúc schema Prisma và các câu lệnh SQL DDL/DML, kiểm tra ràng buộc trigger/GiST/CHECK trong PostgreSQL, kiểm tra tính toán lock ordering, CAS, idempotency và phân tích bao phủ kiểm thử.
- **Giới hạn môi trường cục bộ:**
  - Không truy cập database production, staging hoặc VPS.
  - Lệnh kiểm tra kiểu toàn bộ dự án (`npm run typecheck` tại `apps/api`) gặp lỗi tràn ngăn xếp V8 Node.js (`RangeError: Maximum call stack size exceeded`), do đó không thể xác nhận tính toàn vẹn kiểu mức tổng thể toàn monorepo chỉ bằng lệnh tsc cục bộ.
  - GitHub Actions CI (đặc biệt là P6-021 PostgreSQL 16 off-host compatibility) chưa chạy trên tập hợp mã uncommitted/untracked hiện tại.

---

## 2. Kết luận Tổng quan

### Kết luận Review: `REVIEW_BLOCKED`
*(Số lượng blocker chặn merge: **4**)*

### Tóm tắt lý do:
1. **Chất lượng mã nguồn chuyên môn nội tại (Code Quality & Security Invariants):** Bản sửa cục bộ trong worktree thể hiện tư duy kiến trúc giao dịch và bảo mật chặt chẽ. Cả **6/6 phát hiện gốc** từ đợt review trước đã được giải quyết triệt để và chính xác trong mã nguồn TypeScript cũng như migration SQL.
2. **Lý do Chặn Merge (Blockers):**
   - **Blocker 1 (Quy trình Git & CI):** Toàn bộ bản sửa, bài test mới và migration quan trọng đang ở trạng thái `uncommitted` và `untracked` trên máy cục bộ. PR #285 trên GitHub hiện tại chỉ chứa mã cũ (`5f9b747d61`), do đó chưa thể merge.
   - **Blocker 2 (Kiểm thử tương thích PostgreSQL 16 Off-Host P6-021):** Migration mới `20261113160000_p5_057_ws1_multi_vice_seat` sửa đổi ràng buộc GiST exclusion constraint (`role_appointments_seat_no_overlap` và thêm `role_appointments_vice_same_holder_no_overlap`). Migration này chưa được kiểm chứng qua workflow P6-021 trên PostgreSQL 16.
   - **Blocker 3 (Lỗi biên dịch Typecheck toàn bộ dự án):** Quy trình kiểm tra tĩnh `tsc --noEmit` của API bị crash do tràn stack V8. Cần được dọn dẹp hoặc kiểm thử trong môi trường CI tiêu chuẩn để đảm bảo không có xung đột type ẩn nào.
   - **Blocker 4 (Bản chất Staged / Chưa tích hợp Ingress NestJS):** `B1RoleCommandWriter` là một staged class, chưa được đăng ký trong module NestJS và chưa có HTTP controller / CLI entry point. Khi kích hoạt cờ cắt chuyển `B1_REJECT_GENERIC_SENSITIVE_WRITES=true`, toàn bộ API sẽ từ chối cấp quyền lãnh đạo mà chưa có đường dẫn thay thế hoạt động trên production.

---

## 3. Đánh giá Chi tiết 6 Phát hiện Gốc

| ID | Tên phát hiện | Trạng thái | Tệp & Dòng mã chứng minh | Ý nghĩa logic & Đánh giá giải pháp |
| :--- | :--- | :---: | :--- | :--- |
| **F-01** | Vi phạm trigger append-only `access_commands` | **RESOLVED** | [b1-role-command-writer.ts#L106-L121](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/b1-role-command-writer.ts#L106-L121), [L341-L373](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/b1-role-command-writer.ts#L341-L373) | **Hoàn toàn khắc phục.** Trước đây tác giả thực hiện `insert` rồi `update` kết quả lên `access_commands`, vi phạm trigger `access_commands_retained` (chặn mọi `UPDATE/DELETE`). Giải pháp mới sử dụng hàm thuần túy `planSummary()` tính toán trước toàn bộ kết quả receipts, ghi `access_commands` đúng **1 lần duy nhất**, sau đó đối chiếu số lượng thực tế (`assertSummaryMatches`). Nếu lệch sẽ ném lỗi `B1_PLAN_ACTUAL_RESULT_MISMATCH` làm rollback toàn bộ giao dịch. |
| **F-02** | Vòng đời miễn nhiệm (DISMISS) dùng sai `cancelledAt` | **RESOLVED** | [b1-role-command-writer.ts#L559-L576](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/b1-role-command-writer.ts#L559-L576) | **Hoàn toàn khắc phục.** Ràng buộc CHECK PostgreSQL quy định `cancelled_at <= valid_from` (chỉ dùng cho hủy bổ nhiệm trước/ngay thời điểm có hiệu lực). Trước đây DISMISS gán `cancelled_at = at` khi `at > valid_from` dẫn đến vi phạm CHECK. Bản sửa chuyển sang cập nhật `validUntil: at` trên `role_appointments` và ghi `grant_source_revisions` với `disposition = 'ENDED'`, giữ `cancelledAt = null`. |
| **F-03** | Ràng buộc loại trừ Phó Hiệu trưởng (Vice Principal GiST) | **RESOLVED** | [migration.sql#L1-L20](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/prisma/migrations/20261113160000_p5_057_ws1_multi_vice_seat/migration.sql#L1-L20) | **Hoàn toàn khắc phục.** Migration mới đã DROP exclusion constraint cũ trên `seat_id`, tạo lại `role_appointments_seat_no_overlap` loại trừ `VICE_PRINCIPAL_ACADEMIC` (`WHERE template_key <> 'VICE_PRINCIPAL_ACADEMIC'`), đồng thời bổ sung ràng buộc GiST mới `role_appointments_vice_same_holder_no_overlap` đảm bảo một cá nhân không thể giữ cùng 1 ghế Phó Hiệu trưởng chồng lấn thời gian. Kiểm thử tích hợp tại [b1-role-command-writer.integration.spec.ts#L118-L144](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/test/capabilities/b1-role-command-writer.integration.spec.ts#L118-L144) xác nhận tạo đồng thời 2 Phó Hiệu trưởng thành công trên PostgreSQL. |
| **F-04** | Xác minh nguồn gốc (Provenance) & Thẩm quyền người ban hành | **RESOLVED** | [b1-role-command-writer.ts#L158-L186](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/b1-role-command-writer.ts#L158-L186), [L470-L508](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/b1-role-command-writer.ts#L470-L508) | **Hoàn toàn khắc phục.** Hàm `wasTechnicalIssuer()` truy vấn trực tiếp DB trong giao dịch, kiểm tra diễn viên (actor) tại thời điểm `effectiveAt` phải có ghế bổ nhiệm `TECHNICAL_ACCOUNT_ADMIN` còn hiệu lực đồng thời sở hữu cả 2 capability trực tiếp `USER_MANAGE` và `CAPABILITY_GRANT`. Nếu người ban hành bổ nhiệm cũ là nguồn không hợp lệ, hệ thống áp dụng chính sách fail-closed, từ chối thực hiện lệnh. |
| **F-05** | Ngăn chặn bypass qua Generic Ingress Writer | **RESOLVED** | [sensitive-generic-writer-gate.ts#L1-L27](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/sensitive-generic-writer-gate.ts#L1-L27), [capabilities.service.ts#L341](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/capabilities.service.ts#L341), [access-baseline.service.ts#L476](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/access-baseline.service.ts#L476) | **Hoàn toàn khắc phục.** Đã tạo chốt chặn trung tâm `assertGenericGrantSourceSafe` và `assertGenericTemplateSourceSafe`. Chốt chặn này được đặt ngay đầu các hàm nhạy cảm của `CapabilitiesService.create/revoke`, `AccessBaselineService.applyTemplate` và `bootstrapAdmin`. Có cờ `B1_REJECT_GENERIC_SENSITIVE_WRITES` (mặc định `false` trong giai đoạn shadow, kích hoạt `true` khi cutover) đảm bảo không gây gián đoạn hệ thống hiện tại. |
| **F-06** | Cơ chế CAS / Epoch / Chống xung đột đồng thời & Idempotency | **RESOLVED** | [b1-role-command-writer.ts#L80-L105](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/b1-role-command-writer.ts#L80-L105), [L200-L215](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/b1-role-command-writer.ts#L200-L215) | **Hoàn toàn khắc phục.** Lệnh bắt buộc truyền `expectedAuthorizationEpoch` và `expectedSeatVersion`. Hệ thống lock dòng `authorization_states` (`id = 'B1_GLOBAL'`), so sánh epoch hiện tại, cập nhật tăng `epoch + 1n`. Xử lý idempotency chuẩn xác: nếu trùng `requestKey`, kiểm tra fingerprint SHA-256; nếu khớp hoàn toàn thì trả lại receipt đã lưu trong `access_commands.result`, nếu không khớp ném `COMMAND_IDEMPOTENCY_CONFLICT`. |

---

## 4. Phát hiện Mới và Các Rủi ro Tiềm ẩn

### 4.1. [BLOCKER / HIGH] Mã nguồn và Migration mới chưa được commit & push lên PR #285
- **Mức độ:** `HIGH` (Ngăn chặn tiến trình merge).
- **Điều kiện kích hoạt:** Bất kỳ nỗ lực nào nhằm merge PR #285 trên GitHub vào lúc này.
- **Ảnh hưởng:** PR #285 trên remote vẫn ở trạng thái cũ (`5f9b747d61`), chứa đầy đủ các lỗi trigger, CHECK và GiST exclusion constraint. CI trên GitHub chưa hề kiểm tra các file sửa đổi và untracked này.
- **Khuyến nghị:** Tác giả cần thực hiện `git add` toàn bộ các file liên quan (gồm cả migration và test mới), commit một checkpoint có ý nghĩa và push lên remote để kích hoạt CI.

### 4.2. [HIGH] Nguy cơ Deadlock giữa B1 Writer và Generic Writers trong chế độ Shadow
- **Mức độ:** `HIGH`
- **Điều kiện kích hoạt:** Chạy song song B1 Writer và các generic endpoints (`CapabilitiesService`, `AccessBaselineService`, hoặc `UsersService`) khi `B1_REJECT_GENERIC_SENSITIVE_WRITES` vẫn đang là `false`.
- **Dòng mã liên quan:** [b1-role-command-writer.ts#L123-L200](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/b1-role-command-writer.ts#L123-L200)
- **Ảnh hưởng:**
  - Trong `B1RoleCommandWriter`, thứ tự khóa hàng nghiêm ngặt được thiết lập:
    `authority_seats` -> `users (theo ID tăng dần)` -> `grant_coordinates (theo userId, capabilityKey tăng dần)` -> `authorization_states (B1_GLOBAL)`.
  - Tuy nhiên, trong `AccessBaselineService.applyTemplate` ([access-baseline.service.ts#L488-L510](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/access-baseline.service.ts#L488-L510)), giao dịch đọc `users` trước rồi mới ghi `capability_grants` mà không khóa `authority_seats` hoặc `grant_coordinates`.
  - Nếu hai luồng giao dịch can thiệp cùng một lúc trên cùng đối tượng người dùng, PostgreSQL có thể phát hiện Deadlock (`40P01`) và buộc hủy một giao dịch.
- **Khuyến nghị:** Tài liệu hóa rõ ràng rằng chế độ Shadow chỉ an toàn cho việc thử nghiệm cô lập. Khi đưa vào production, cờ `B1_REJECT_GENERIC_SENSITIVE_WRITES=true` phải được bật đồng thời để chặn đứng generic writers đối với các quyền nhạy cảm này.

### 4.3. [MEDIUM] Lỗi Tràn Ngăn Xếp khi Typecheck Cục bộ (`RangeError: Maximum call stack size exceeded`)
- **Mức độ:** `MEDIUM`
- **Điều kiện kích hoạt:** Chạy `npm run typecheck` trong thư mục `apps/api`.
- **Ảnh hưởng:** Trình biên dịch TypeScript cục bộ bị crash do kích thước union type hoặc quan hệ tham chiếu phức tạp giữa Prisma Client và các file DTO/NestJS. Mặc dù `jest` và `ts-jest` biên dịch thành công từng file test cô lập, việc không hoàn thành `tsc --noEmit` toàn diện là một điểm mù về type safety trước khi merge.
- **Khuyến nghị:** Cần xác nhận kết quả chạy `npm run typecheck` trong container sạch của CI GitHub Actions trước khi phê duyệt merge.

### 4.4. [MEDIUM] B1 Writer hoàn toàn là Staged Class — Chưa có Cổng Ingress Thực tế
- **Mức độ:** `MEDIUM` (Kiến trúc / Kỳ vọng vận hành).
- **Ảnh hưởng:** `B1RoleCommandWriter` không được inject vào NestJS container, không có controller, không có route REST API. Khi người vận hành bật `B1_REJECT_GENERIC_SENSITIVE_WRITES=true`, các tính năng bổ nhiệm Hiệu trưởng / Phó Hiệu trưởng trên Web UI sẽ lập tức nhận lỗi 403 Forbidden mà không có đường dẫn B1 writer nào thay thế.
- **Khuyến nghị:** Giữ nguyên cờ `B1_REJECT_GENERIC_SENSITIVE_WRITES=false` trên production cho đến khi WS2 (hoàn thiện API controller và giao diện UI cho B1 writer) được triển khai và nghiệm thu.

### 4.5. [LOW] Độ nhạy Timestamp của Cơ chế Idempotency Fingerprint
- **Mức độ:** `LOW`
- **Dòng mã liên quan:** [b1-role-command-writer.ts#L30](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/b1-role-command-writer.ts#L30)
- **Ảnh hưởng:** Fingerprint SHA-256 tính toán dựa trên `operation`, `role`, `targetUserId`, `previousUserId`, `requestKey`, và `at.toISOString()`. Nếu client gửi lại cùng một `requestKey` với mục đích retry nhưng không truyền cùng một đối tượng `Date` (hoặc caller dùng `new Date()` tự sinh ở mỗi lần gọi), fingerprint sẽ bị lệch, kích hoạt lỗi `COMMAND_IDEMPOTENCY_CONFLICT` thay vì trả về kết quả cũ.
- **Khuyến nghị:** Khi xây dựng HTTP DTO cho B1 writer, nên quy định client truyền timestamp rõ ràng hoặc controller phải chịu trách nhiệm chuẩn hóa `effectiveAt` theo request ID.

---

## 5. Đánh giá Migration & Tính Toàn vẹn PostgreSQL

### 5.1. Phân tích Migration `20261113160000_p5_057_ws1_multi_vice_seat`
Nội dung file migration:
```sql
ALTER TABLE "role_appointments"
  DROP CONSTRAINT IF EXISTS "role_appointments_seat_no_overlap";

ALTER TABLE "role_appointments"
  ADD CONSTRAINT "role_appointments_seat_no_overlap"
  EXCLUDE USING gist (
    seat_id WITH =,
    tstzrange(valid_from, COALESCE(valid_until, 'infinity'::timestamptz), '[)') WITH &&
  )
  WHERE (cancelled_at IS NULL AND template_key <> 'VICE_PRINCIPAL_ACADEMIC');

ALTER TABLE "role_appointments"
  ADD CONSTRAINT "role_appointments_vice_same_holder_no_overlap"
  EXCLUDE USING gist (
    seat_id WITH =,
    user_id WITH =,
    tstzrange(valid_from, COALESCE(valid_until, 'infinity'::timestamptz), '[)') WITH &&
  )
  WHERE (cancelled_at IS NULL AND template_key = 'VICE_PRINCIPAL_ACADEMIC');
```

### 5.2. Đánh giá tính toàn vẹn DDL:
1. **Tính tương thích toán tử GiST:**
   - Trường `seat_id` (UUID) và `user_id` (UUID) yêu cầu toán tử `=` trong GiST. Điều này đã được đảm bảo thông qua extension `btree_gist` (đã được khởi tạo từ baseline migration `20260728000000_phase_00_baseline`).
   - Ràng buộc phân tách rạch ròi bằng mệnh đề `WHERE`:
     - Ghế đơn vị thông thường (`template_key <> 'VICE_PRINCIPAL_ACADEMIC'`): Đảm bảo tại một thời điểm chỉ có tối đa 1 người giữ ghế (ví dụ: Hiệu trưởng - `PRINCIPAL`).
     - Ghế Phó Hiệu trưởng (`template_key = 'VICE_PRINCIPAL_ACADEMIC'`): Cho phép nhiều người khác nhau cùng giữ ghế đồng thời, nhưng ngăn chặn việc 1 người được bổ nhiệm trùng lặp 2 khoảng thời gian đè lên nhau trên cùng một ghế.
2. **Khả năng Rollback / Down Migration:**
   - Nếu rollback về migration trước, cần tạo lại ràng buộc không có mệnh đề `WHERE template_key <> '...'`. Khi đó, nếu DB đã chứa >1 Phó Hiệu trưởng thì lệnh thêm constraint cũ sẽ thất bại. Đây là tính chất bình thường của forward migration; dữ liệu trường học thực tế có nhiều Phó Hiệu trưởng nên không được quay lại ràng buộc ghế đơn.
3. **Tuân thủ Invariant Append-Only của B1 Foundation:**
   - Bảng `access_commands`: Trigger `access_commands_retained` (từ migration `20261105150000_p5_057_b1_provenance_foundation`) hoàn toàn không bị vi phạm bởi bản sửa mới, do lệnh `create` thực hiện duy nhất 1 lần chứa sẵn `result`.
   - Bảng `grant_source_revisions`: Không có UPDATE, chỉ INSERT các revision với `disposition = 'ACTIVE'` hoặc `'ENDED'`.
   - Bảng `grant_coordinates`: Cập nhật trạng thái `ACTIVE / CLOSED` hoàn toàn hợp lệ qua update có điều kiện version.

---

## 6. Đánh giá Nguồn gốc (Provenance) & Cấp quyền kép (Dual AUDIT_VIEW)

### 6.1. Xử lý trường hợp đặc biệt: `AUDIT_VIEW` có thể đến từ 2 nguồn
- Trong mô hình phân quyền Đam San:
  - Hiệu trưởng (`PRINCIPAL`) nhận `AUDIT_VIEW` thông qua nguồn `ROLE_TEMPLATE`.
  - Quản trị viên kỹ thuật (`TECHNICAL_ACCOUNT_ADMIN`) nhận `AUDIT_VIEW` thông qua nguồn `TECHNICAL_DIRECT`.
- **Đánh giá mã thực thi ([b1-role-command-writer.ts#L350-L370](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/b1-role-command-writer.ts#L350-L370) & [L519-L592](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/b1-role-command-writer.ts#L519-L592)):**
  1. Khi một người vừa là Admin kỹ thuật (đã có `AUDIT_VIEW`), vừa được bổ nhiệm làm Hiệu trưởng:
     - Hệ thống kiểm tra tọa độ (`coordinate`). Đã có sẵn grant `AUDIT_VIEW`, do đó `context.grantId` đã tồn tại.
     - Hàm `openSource()` **không** tạo thêm bản ghi `capability_grants` trùng lặp (tránh vi phạm unique constraint), mà tạo một `grant_sources` mới liên kết với `grantId` hiện tại, kèm `grant_supports` tương ứng.
     - Số lượng `grantsCreated` trong receipt được tính chính xác là `0` cho quyền này (chỉ `sourcesOpened` tăng lên).
  2. Khi người này bị miễn nhiệm Hiệu trưởng (`DISMISS`):
     - Hàm `closeAppointment()` đóng nguồn `ROLE_TEMPLATE`.
     - Hệ thống kiểm tra xem còn nguồn nào khác đang chống lưng cho `AUDIT_VIEW` của người này không (`remaining.length > 0`).
     - Do nguồn `TECHNICAL_DIRECT` vẫn còn hiệu lực, hệ thống **không thu hồi** (`do not revoke`) bản ghi `capability_grants` gốc. Người này vẫn giữ quyền `AUDIT_VIEW` hợp pháp với tư cách kỹ thuật.
     - `grantsRevoked` được tính chính xác là `0`.
  - **Kết luận:** Logic giải quyết bài toán nguồn gốc kép của `AUDIT_VIEW` đạt độ chính xác tuyệt đối, không làm mất quyền của tài khoản kỹ thuật và không sinh bản ghi mồ côi.

### 6.2. Kiểm tra thẩm quyền người ban hành (`wasTechnicalIssuer`)
- Tại dòng [b1-role-command-writer.ts#L470-L508](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/apps/api/src/capabilities/b1-role-command-writer.ts#L470-L508):
  - Kiểm tra bổ nhiệm quá khứ có được ban hành bởi một `TECHNICAL_ACCOUNT_ADMIN` hợp lệ tại thời điểm đó hay không.
  - Phải có cả 2 quyền `USER_MANAGE` và `CAPABILITY_GRANT` bao phủ thời điểm `effectiveAt`.
  - Nếu bản ghi bổ nhiệm cũ được tạo bởi một nguồn không rõ ràng (legacy/untrusted), lệnh `TRANSFER` hoặc `DISMISS` sẽ chủ động ném lỗi `ISSUER_NOT_AUTHORITATIVE_AT_EFFECTIVE_TIME` (fail-closed), bảo vệ hệ thống khỏi việc kế thừa trạng thái quyền lực bất hợp pháp.

---

## 7. Đánh giá Tính Bất Biến, CAS, Epoch và Xung Đột Đồng Thời

### 7.1. Thứ tự khóa tài nguyên (Lock Ordering)
Để ngăn ngừa tình trạng Deadlock giữa các lệnh B1 writer chạy đồng thời trên nhiều tiến trình hoặc worker, `B1RoleCommandWriter` tuân thủ một trật tự khóa tài nguyên đơn điệu nghiêm ngặt:
1. **Ghế thẩm quyền (`authority_seats`):** Khóa dòng của ghế được chỉ định (ví dụ ghế `PRINCIPAL` hoặc `VICE_PRINCIPAL_ACADEMIC`).
2. **Người dùng liên quan (`users`):** Sắp xếp danh sách `[actorUserId, targetUserId, previousUserId]` theo thứ tự tăng dần của `userId` (ASCII/UUID order) và dùng `SELECT ... FOR UPDATE` từng dòng theo đúng thứ tự đó.
3. **Tọa độ quyền (`grant_coordinates`):** Sắp xếp theo cặp khóa `(userId, capabilityKey)` tăng dần trước khi truy vấn và khóa.
4. **Trạng thái phân quyền toàn cục (`authorization_states`):** Khóa dòng `id = 'B1_GLOBAL'` ở bước cuối cùng để kiểm tra CAS epoch.

Trật tự này đảm bảo rằng giữa các lệnh B1 writer với nhau, không bao giờ xảy ra chu trình chờ đợi tài nguyên chéo (No cyclic wait condition).

### 7.2. Cơ chế CAS (Compare-And-Swap) Epoch
- Người gọi bắt buộc phải cung cấp:
  - `expectedSeatVersion`: Phiên bản chính sách của ghế.
  - `expectedAuthorizationEpoch`: Phiên bản trạng thái cấp quyền toàn cục.
- Trong giao dịch:
  ```ts
  const state = await tx.authorizationState.findUniqueOrThrow({ where: { id: 'B1_GLOBAL' } });
  if (state.epoch !== BigInt(input.expectedAuthorizationEpoch)) {
    this.error('STALE_AUTHORIZATION_EPOCH', { current: state.epoch.toString() });
  }
  await tx.authorizationState.update({
    where: { id: 'B1_GLOBAL' },
    data: { epoch: state.epoch + 1n, lastCommandId: command.id },
  });
  ```
- Nếu có một giao dịch khác vừa commit làm tăng epoch, giao dịch hiện tại sẽ fail ngay lập tức với lỗi `STALE_AUTHORIZATION_EPOCH`, ngăn chặn hoàn toàn hiện tượng Lost Update.

---

## 8. Đánh giá Kiểm thử & Vùng Mù (Blind Spots)

### 8.1. Đánh giá Bộ Kiểm thử Hiện có
1. **Kiểm thử Đơn vị (`b1-role-command-writer.spec.ts` - 328 dòng):**
   - Đã bao phủ các nhánh: APPOINT, DISMISS, TRANSFER, CAS epoch mismatch, seat version mismatch, idempotency replay, idempotency conflict, tự bổ nhiệm (self-assignment), người dùng không hoạt động (INACTIVE), nhân sự không phải giáo viên, và kiểm tra quyền của người ban hành.
   - Sử dụng Mock Transaction Client mô phỏng đầy đủ dữ liệu trong bộ nhớ.
2. **Kiểm thử Tích hợp với PostgreSQL Thật (`b1-role-command-writer.integration.spec.ts` - 145 dòng):**
   - Rất xuất sắc: Sử dụng giao dịch ngoài mức `SERIALIZABLE` và ném lỗi `rollback` có chủ đích ở cuối mỗi bài test. Cơ chế này giúp kiểm tra trực tiếp toàn bộ trigger, CHECK, FK và GiST constraint thật của PostgreSQL mà **không làm ô nhiễm cơ sở dữ liệu**.
   - Đã xác nhận:
     - Tạo lệnh thành công trên các trigger append-only thực tế.
     - Cho phép 2 Phó Hiệu trưởng hoạt động đồng thời dưới constraint GiST mới.
3. **Kiểm thử Chốt chặn Ingress (`sensitive-generic-writer-gate.spec.ts` & `sensitive-generic-writer-ingress.spec.ts`):**
   - Kiểm tra hành vi khi cờ `B1_REJECT_GENERIC_SENSITIVE_WRITES` bật/tắt.
   - Xác nhận chặn `CapabilitiesService.create`, `CapabilitiesService.revoke`, `AccessBaselineService.applyTemplate` và `bootstrapAdmin`.

### 8.2. Vùng mù kiểm thử còn thiếu (Test Blind Spots)
1. **Chưa có kiểm thử đa kết nối đồng thời thật (Multi-connection Concurrent Race Spec):**
   - Mặc dù trật tự khóa đã được tính toán trên lý thuyết, hiện chưa có bài test tự động mở 2 kết nối database song song để bắn 2 lệnh đối đầu nhau (ví dụ: 2 yêu cầu cùng tranh giành bổ nhiệm vào 1 ghế Hiệu trưởng tại cùng một mili-giây) để quan sát cơ chế chờ khóa và thông báo lỗi `STALE_AUTHORIZATION_EPOCH`.
2. **Chưa kiểm thử tương thích với PostgreSQL 16 (PG16 Off-Host Compatibility):**
   - Cần chạy kiểm thử trên GitHub Actions với runner PostgreSQL 16 theo chuẩn workflow P6-021 để đảm bảo các extension và cú pháp GiST partial index hoạt động hoàn hảo trên engine PG16 của môi trường triển khai.

---

## 9. Danh sách Blocker Trước khi Merge & Thứ tự Xử lý

Dưới đây là các hạng mục bắt buộc phải xử lý trước khi PR #285 có thể được phê duyệt merge vào nhánh `main`:

| Thứ tự ưu tiên | Hạng mục Blocker | Phân loại | Giải pháp cụ thể |
| :---: | :--- | :--- | :--- |
| **1** | **Commit và Push toàn bộ thay đổi cục bộ lên PR #285** | Quy trình / Git | Thực hiện `git add` toàn bộ 6 file đã sửa và 6 file untracked (bao gồm migration SQL và các test spec). Commit với thông điệp rõ ràng và push lên nhánh `feat/p5-057-ws1-b1-writer-20261112`. |
| **2** | **Kích hoạt và xác nhận CI xanh (bao gồm P6-021 PG16)** | CI / Tương thích | Theo dõi GitHub Actions trên PR #285 sau khi push. Bắt buộc workflow `CI` và workflow `p6-021-offhost-compatibility` phải đạt trạng thái PASS, đặc biệt ở bước chạy migration trên PostgreSQL 16. |
| **3** | **Khắc phục lỗi Typecheck của `apps/api`** | Biên dịch / Type safety | Kiểm tra nguyên nhân gây tràn ngăn xếp của `tsc` trong `apps/api` (có thể do cấu hình `tsconfig.json` include quá rộng hoặc đệ quy kiểu phức tạp trong type mappings), đảm bảo lệnh kiểm tra kiểu chạy trơn tru trong CI. |
| **4** | **Xác nhận cấu hình môi trường Production an toàn** | Vận hành / An toàn | Đảm bảo trong tài liệu bàn giao ghi rõ: Biến môi trường `B1_REJECT_GENERIC_SENSITIVE_WRITES` phải được giữ ở giá trị `false` (hoặc không khai báo) trên môi trường production cho đến khi WS2 hoàn thành việc gắn endpoint HTTP cho B1 writer. |

---

## 10. Tuyên bố Kết thúc & Cam kết Thực thi

1. **Danh sách tệp duy nhất được tạo/chỉnh sửa trong phiên làm việc này:**
   - [docs/phase-reports/PR285-B1-ANTIGRAVITY-INDEPENDENT-REVIEW-RESULT-20261113.md](file:///D:/baogiang-damsan/.worktrees/ws1-b1-writer-20261112/docs/phase-reports/PR285-B1-ANTIGRAVITY-INDEPENDENT-REVIEW-RESULT-20261113.md)
2. **Cam kết tuân thủ phạm vi:**
   - Tuyệt đối không chỉnh sửa bất kỳ tệp mã nguồn, kiểm thử, migration, tài liệu quản trị hay tệp cấu hình nào khác.
   - Không thực hiện lệnh `git commit`, `git push`, `git merge`, không thao tác GitHub Actions, không deploy, không kết nối VPS production và không thay đổi dữ liệu database thật.
   - Báo cáo này phản ánh kết quả thẩm định khách quan, độc lập để ChatGPT và các bên liên quan tiếp tục điều phối theo đúng quy trình.
