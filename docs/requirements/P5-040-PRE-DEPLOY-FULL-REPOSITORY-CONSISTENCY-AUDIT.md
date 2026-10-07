# P5-040 — Pre-Deploy Full-Repository Consistency Audit

## 1. Audit Identity & Context

- **Task ID:** `P5-040`
- **Task Title:** Pre-Deploy Full-Repository Consistency Audit
- **Audit Date:** 2026-10-07
- **Candidate Commit SHA:** `6e6b76f15998c4a7d70b61502bda932571d46ea0`
- **Audit Branch:** `audit/p5-040-predeploy-consistency`
- **Repository:** `hvtnguyenson-code/baogiang-damsan`
- **Mode:** Read-only, full-repository, cross-domain consistency audit
- **Predecessor Dependencies:**
  - `P5-020` = `CLOSED` (by `SYNC-P5-020`)
  - `P5-030` = `CLOSED` (by `SYNC-P5-030`)
- **Downstream Gates:**
  - `P6-020` = `DEFERRED_WITH_TRIGGER` (trigger: `P5-040` CLOSED và candidate build được Product Owner phê duyệt rõ ràng cho production deployment)
- **Production State:** Strictly `PRE-OPERATIONAL`
- **Mutation Boundary:** Zero production implementation changes, zero schema changes, zero database mutations, zero VPS access.

---

## 2. Exact Candidate Main SHA

Candidate main SHA được xác minh trực tiếp từ canonical `origin/main` tại thời điểm bắt đầu task:

```text
6e6b76f15998c4a7d70b61502bda932571d46ea0
```

- Local working tree sạch: `nothing to commit, working tree clean`.
- Branch audit được tạo tách biệt: `audit/p5-040-predeploy-consistency`.

---

## 3. Authority Set

Audit được thực hiện dựa trên việc đối chiếu với toàn bộ tập tài liệu thẩm quyền bắt buộc:

1. `AGENTS.md` — Quy tắc kỷ luật repo, phân công trách nhiệm, quy trình branch/review/sync;
2. `docs/governance/PRE-PILOT-TASK-REGISTER.md` — Sổ bộ task chính thức, trạng thái và dependencies;
3. `docs/governance/CURRENT-PROJECT-STATUS.md` — Trạng thái hiện tại của dự án, snapshot 2026-10-07;
4. `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md` — Ma trận truy vết từ T01 đến T49;
5. `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md` — Baseline sản phẩm chuẩn tắc tiền thử nghiệm;
6. `docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md` — Giao thức đồng bộ hóa tài liệu sau merge;
7. `docs/PROJECT_CONTEXT.md` & `docs/architecture/CORE-BACKEND-ROADMAP.md`;
8. Toàn bộ các Architecture Decision Records (ADR-001 đến ADR-058), đặc biệt các ADR tiền đề:
   - `ADR-044` — Pre-Pilot Product Realignment Governance;
   - `ADR-045` — Homeroom Responsibility Architecture;
   - `ADR-046` — Business Configuration Control Plane;
   - `ADR-047` — TKB Native Workbook Architecture;
   - `ADR-048` — PPCT Curricular Component Architecture;
   - `ADR-049` — Delayed Go-Live Operational-Start Architecture;
   - `ADR-050` — GDĐP / HĐTN Programme Architecture;
   - `ADR-051` — School-Wide Effective Teaching Schedule Read Model;
   - `ADR-052` — Special Programme Workbook Slot Bridge;
   - `ADR-053` — Production VPS Topology (SHARED_VPS);
   - `ADR-054` — First Operational Pilot Scope (FULL BUSINESS);
   - `ADR-055` — Pre-Op Historical Curricular Evidence;
   - `ADR-056` — Public Makeup Scheduling Architecture;
   - `ADR-057` — Workload Adjustment and Official Workload Architecture;
   - `ADR-058` — Dedicated Telegram Integration Architecture.

---

## 4. Methodology

Audit áp dụng phương pháp kiểm tra toàn diện, đa lớp, độc lập với các khẳng định tự phong:

1. **Static Source Inspection:** Rà soát mã nguồn toàn bộ 37 modules trong `apps/api/src`, 30 trang giao diện trong `apps/web/src`, các gói dùng chung `packages/contracts` và `packages/config`.
2. **Schema & Migration Audit:** Thẩm định toàn bộ 29 migration files trong `prisma/migrations`, kiểm tra tính toàn vẹn của DDL PostgreSQL, constraints (CHECK, FOREIGN KEY, RESTRICT/CASCADE), chỉ mục bán phần (partial unique index), phạm vi loại trừ (GiST exclusion), và trigger hàm.
3. **API ↔ Contract ↔ UI Alignment:** Lập bản đồ ánh xạ từ REST controller endpoints qua DTO, Shared Contracts, API client adapters đến các React components và trang quản trị/nghiệp vụ.
4. **Cross-Domain Invariant Verification:** Phân tích 10 chuỗi nghiệp vụ xuyên suốt (End-to-End Chains) từ lịch học đến phân bổ PPCT, thời khóa biểu, thực hiện giảng dạy, nợ/tiến độ, chương trình đặc thù, định mức lao động và đóng băng báo cáo.
5. **Static Verification & Test Evidence Execution:**
   - Kiểm tra tĩnh cấu trúc schema: `npm run test:schema:static` (PASS);
   - Quét bí mật xác thực: `npm run test:secrets` (PASS);
   - Kiểm tra tĩnh và hành vi kịch bản triển khai: `npm run test:deploy:static`, `npm run test:deploy:behavior`, `npm run test:deploy:powershell` (PASS);
   - Kiểm tra hợp đồng workflow CI/CD: `npm run test:workflow:contract` (PASS);
   - Thẩm tra tĩnh UI & PWA baseline: `npm run test:ui:static` (PASS);
   - Kiểm tra hệ thống kiểu tĩnh (Typecheck) toàn repo: `npm run typecheck` (PASS trên cả 4 workspaces);
   - Kiểm tra quy tắc mã nguồn (Linting): `npm run lint` (PASS trên cả 4 workspaces);
   - Chạy toàn bộ Unit Test suite: `npm run test:unit` (PASS 371/371 tests web, PASS 1815/1815 tests api, tổng cộng 2186 tests).

---

## 5. Severity Taxonomy

Mọi phát hiện trong audit được phân loại theo thang mức độ:

- **BLOCKER:** Làm sai lệch dữ liệu chính thức, phá vỡ lịch sử lưu giữ, sai báo cáo/snapshot, leo thang đặc quyền, trùng lặp/thất thoát thực hiện/thông báo, phá vỡ an toàn triển khai/migration, làm hỏng dữ liệu sản xuất, vi phạm nguyên tắc chỉ đạo nghiệp vụ cốt lõi.
- **HIGH:** Sai lệch nghiệp vụ đáng kể, fail-open, hợp đồng API/UI sai lệch ngữ nghĩa, trôi dạt ngữ nghĩa lịch sử/ngày hiệu lực, thiếu chốt chặn database, race condition có tác động nghiệp vụ, giả định môi trường triển khai không chính xác.
- **MEDIUM:** Khuyết tật thực tế nhưng trong phạm vi hẹp, có giải pháp dự phòng (workaround), không làm sai lệch dữ liệu chính thức trên luồng xử lý chuẩn.
- **LOW:** Các khoản nợ tài liệu, ghi chú môi trường cục bộ, cảnh báo hoặc khuyến nghị cải tiến với rủi ro thấp.

---

## 6. Domain-by-Domain Findings

### E1. Identity / Auth / Authorization / Audit
- **Thẩm quyền đối chiếu:** ADR-006, ADR-007, ADR-008, ADR-009, T22.
- **Hiện trạng triển khai:**
  - Session auth bảo vệ chặt chẽ qua cookie HTTP-only, token sinh bằng crypto ngẫu nhiên, hash SHA-256 lưu DB, kiểm tra thời hạn và trạng thái thu hồi.
  - CSRF/Origin Guard bắt buộc trên tất cả mutation HTTP methods (POST, PUT, PATCH, DELETE), kiểm tra `Origin` và `Referer` khớp với danh sách allowlist `corsOrigins`.
  - Cơ chế `mustChangePassword` fail-closed: người dùng chưa đổi mật khẩu ban đầu bị chặn ngay tại `CapabilityGuard` và các controller riêng lẻ (`assertPasswordNotRequired`).
  - Phân quyền theo Capability & Scope: mặc định từ chối (`default-deny`). Phân biệt rành mạch giữa `SCHOOL_WIDE`, `SUBJECT_GROUP`, `SUBJECT`, `ACTIVITY`, `PERSONAL`. Phạm vi hẹp không thể leo thang lên phạm vi rộng.
  - Vai trò/chức danh không bao giờ âm thầm thay thế capability; không có đặc quyền ngầm dựa trên vai trò hệ thống.
  - Ghi nhật ký kiểm toán (Audit log) cùng giao dịch (same-transaction) cho mọi hành động nhạy cảm và mọi trường hợp từ chối quyền truy cập (`AUTHORIZATION_DENIED`).
- **Đánh giá:** **PASS** — Không có finding.

---

### E2. Academic Calendar / Business Date / Effectivity
- **Thẩm quyền đối chiếu:** ADR-010, ADR-011, ADR-049, T01.
- **Hiện trạng triển khai:**
  - `AcademicYear`, `AcademicCalendarVersion`, `AcademicWeek`, phân đoạn tuần (`CalendarSegment`) và gián đoạn (`CalendarInterruption`) được ràng buộc chặt chẽ tại `calendar-invariants.ts`.
  - Mọi ngày dạy học trong khoảng trống giữa các tuần bắt buộc phải được `CalendarInterruption` bao phủ đầy đủ; các học kỳ và tuần không được chồng lấn.
  - Ngày nghiệp vụ chuẩn tắc (`businessDate`) do máy chủ sở hữu, tính toán theo múi giờ `Asia/Ho_Chi_Minh` (`en-CA` format YYYY-MM-DD), không phụ thuộc vào múi giờ client.
  - Phân định ranh giới ngày dân sự (civil date string format) khép kín/nửa mở nhất quán; dữ liệu lịch sử lưu giữ phiên bản bất biến, không bị ghi đè bởi cấu hình hiện tại.
- **Đánh giá:** **PASS** — Không có finding.

---

### E3. TeachingAssignment / HomeroomAssignment
- **Thẩm quyền đối chiếu:** ADR-012, ADR-013, ADR-014, ADR-045, T03, T13, T14.
- **Hiện trạng triển khai:**
  - `TeachingAssignment` có hiệu lực theo thời gian (`validFrom`, `validUntil`), kiểm tra chặt chẽ nằm trong khung thời gian của phiên lịch đang áp dụng (`requireCalendarEnvelope`). Ràng buộc giáo viên phải là nhân sự giảng dạy đang hoạt động (`isTeachingStaff: true`) và có phân công chuyên môn môn học (`StaffSubject`).
  - `HomeroomAssignment` hỗ trợ phân định giữa phân công hiện tại/tương lai (`CURRENT_OR_FUTURE`) và phân công lịch sử quá khứ (`BOUNDED_HISTORICAL`). Trong phân công lịch sử, cho phép ghi nhận giáo viên đã chuyển trường/nghỉ dạy mà không đòi hỏi tài khoản phải đang `ACTIVE`.
  - Phân công chủ nhiệm trong quá khứ được đóng băng, không bị thay đổi ngữ nghĩa khi giáo viên chuyển lớp hoặc thay đổi tài khoản sau này.
- **Đánh giá:** **PASS** — Không có finding.

---

### E4. PPCT
- **Thẩm quyền đối chiếu:** ADR-027, ADR-028, ADR-029, ADR-048, T05, T45, T46.
- **Hiện trạng triển khai:**
  - Hỗ trợ đầy đủ hai thành phần môn học: `CORE` (cốt lõi) và `SPECIALIZED_STUDY` (chuyên đề học tập).
  - Tính bất biến của đầu mục PPCT (`PpctItem`) và revision lineage: quan hệ kế thừa huyết thống (lineage) nghiêm cấm chuyển đổi chéo giữa các thành phần (`CROSS_COMPONENT_LINEAGE` bị chặn).
  - Áp dụng chuyên đề theo lớp (`PpctClassCurricularProfile`): quản lý lớp học có học chuyên đề hay không; lớp không học chuyên đề coi chuyên đề là `NOT_APPLICABLE`, tuyệt đối không tính thành nợ tiết.
  - Định tuyến phân bổ tuần: cơ hội bình thường cuối cùng trong tuần theo thứ tự thời gian được gán cho `SPECIALIZED_STUDY`, các cơ hội trước đó gán cho `CORE`.
  - Tiến độ độc lập: hai con trỏ tuần tự riêng biệt cho `CORE` và `SPECIALIZED_STUDY`.
  - Importer chuẩn `Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx` kiểm tra chặt chẽ metadata sheet `THONG_TIN`, cấu trúc `PPCT` và `CHUYEN_DE`, CAS preview/confirm an toàn.
- **Đánh giá:** **PASS** — Không có finding.

---

### E5. Timetable / Effective Schedule
- **Thẩm quyền đối chiếu:** ADR-015 đến ADR-026, ADR-047, ADR-051, T02, T04, T25, T26, T27, T47.
- **Hiện trạng triển khai:**
  - Lưu giữ đầy đủ các phiên bản thời khóa biểu `TimetableVersion`, gắn với `TimeSlotDefinition` xác định thời gian thực nửa mở `[startTime, endTime)`.
  - Adapter thời khóa biểu Đam San (`DamSanNativeTimetableAdapter`) đối soát hai chiều giữa bảng xem theo lớp và bảng xem theo giáo viên; bất kỳ sai lệch nào đều chặn import (fail-closed).
  - Cơ chế cập nhật chọn lọc buổi sáng/buổi chiều (`selective session carry-forward`): giữ nguyên vẹn buổi không chỉnh sửa và tạo phiên bản hợp nhất có kiểm tra checksum ngữ nghĩa.
  - Giữ lại các đánh dấu chương trình đặc thù (`TimetableSpecialProgrammeMarker`) cho `GDDP` và `HDTN_HN`.
  - Lịch dạy hiệu lực toàn trường (`SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1`): tổng hợp thực tế vận hành từ TKB gốc, gián đoạn, ngoại lệ lịch, hoán đổi/nghỉ/dạy thay, lịch dạy bù và SpecialActivity.
  - Không gian làm việc của giáo viên (Teacher Workspace) được bảo vệ bằng quyền đọc `TEACHER_BASE`, hoàn toàn ở chế độ chỉ đọc (read-only), không cho phép giáo viên tự ý sửa đổi lịch.
- **Đánh giá:** **PASS** — Không có finding.

---

### E6. Teaching Execution / Historical Ingestion
- **Thẩm quyền đối chiếu:** ADR-038, ADR-039, ADR-055, T07, T28, T29.
- **Hiện trạng triển khai:**
  - Phân loại rõ ràng các loại chứng cứ thực hiện: `NORMAL`, `SUBSTITUTION`, `MAKEUP`.
  - Nhập liệu lịch sử tiền vận hành (`P3-020`): luồng preview/confirm với `batchRef` và mã băm dấu vân tay request, tái lập lịch sử PPCT tự động qua allocator replay mà không cho phép client tự chọn con trỏ PPCT.
  - Sửa đổi dữ liệu thực hiện chỉ qua cơ chế hủy và thay thế bất biến (`reverse + replace`), không cập nhật đè tại chỗ.
  - Dữ liệu tiết dạy trong quá khứ không có chứng cứ chỉ ở trạng thái `UNCONFIRMED`, tuyệt đối không tự biến thành nợ tiết.
- **Đánh giá:** **PASS** — Không có finding.

---

### E7. Progress / Debt / Late
- **Thẩm quyền đối chiếu:** ADR-040, ADR-049, ADR-055, T06, T08, T09, T30.
- **Hiện trạng triển khai:**
  - Cơ chế tính tiến độ nhận biết thành phần môn học (`TEACHING_PROGRESS_DEBT_PROFILE_V2`), theo dõi song song cả `CORE` và `SPECIALIZED_STUDY`.
  - Ranh giới ngày bắt đầu vận hành chính thức (`operationalStartDate`): các tiết học trước ranh giới này nếu thiếu bằng chứng sẽ được bỏ qua (`isPreOperational -> continue`), hoàn toàn không phát sinh nợ tự động (`no-auto-debt`).
  - Chỉ các cơ hội dạy sau ngày bắt đầu vận hành có trạng thái nghỉ không dạy thay (`ABSENCE_NO_REPLACEMENT`) hoặc trông lớp khác môn (`DIFFERENT_SUBJECT_SUPERVISION`) mới trở thành `PROVEN_OPEN_DEBT`.
- **Đánh giá:** **PASS** — Không có finding.

---

### E8. Reporting / Reporting Statement
- **Thẩm quyền đối chiếu:** ADR-041, ADR-042, ADR-043, T10.
- **Hiện trạng triển khai:**
  - Báo cáo cá nhân và báo cáo tổng hợp phản ánh chính xác từ dữ liệu thực hiện.
  - Đóng gói báo cáo đóng băng (`freezeReportingStatementSnapshot`): lưu trữ chuỗi JSON chuẩn tắc `canonicalSnapshotJson` và mã băm `semanticHash` SHA-256.
  - Khả năng đọc tương thích ngược hoàn hảo cho cả 4 phiên bản snapshot: `SNAPSHOT_V1`, `SNAPSHOT_V2`, `SNAPSHOT_V3`, `SNAPSHOT_V4`.
  - Khi xem lại snapshot đã đóng băng, hệ thống giải mã trực tiếp từ payload đã ký và kiểm tra khớp byte-for-byte; tuyệt đối không gọi lại resolver động để tránh làm trôi dạt ngữ nghĩa lịch sử.
- **Đánh giá:** **PASS** — Không có finding.

---

### E9. Business Configuration / Operational Start
- **Thẩm quyền đối chiếu:** ADR-046, ADR-049, T21, T22, T28.
- **Hiện trạng triển khai:**
  - Cơ chế cấu hình nghiệp vụ theo kiểu chặt chẽ (typed policy registry) bao gồm: `OPERATIONAL_START`, `SPECIAL_PROGRAMME_WORKLOAD`, `WORKLOAD_ADJUSTMENT`.
  - Quản lý hiệu lực theo ngày (`effectiveFrom`, `effectiveUntil`), lưu giữ toàn bộ dòng dõi sửa đổi và phiên bản thay thế.
  - Hỗ trợ thay thế thẩm quyền đã lập lịch trước ngày hiệu lực (`SUPERSEDED_BEFORE_EFFECTIVE`), giữ nguyên chuỗi lịch sử kiểm toán.
  - Tách bạch hoàn toàn giữa cấu hình nghiệp vụ và bí mật kỹ thuật: không có tham số nhạy cảm (database URL, token, khóa TLS, cổng mạng) nào lọt vào cấu hình nghiệp vụ.
- **Đánh giá:** **PASS** — Không có finding.

---

### E10. Public Make-up Scheduling
- **Thẩm quyền đối chiếu:** ADR-031, ADR-056, T08.
- **Hiện trạng triển khai:**
  - Lập lịch dạy bù công khai chỉ chấp nhận nguồn là nghĩa vụ nợ thực sự đã được chứng minh (`PROVEN_OPEN_DEBT`) và nằm trong giai đoạn vận hành chính thức (sau `operationalStartDate`).
  - Tái sử dụng bảng `MakeupTeachingSchedule`, kiểm tra xung đột thời gian thực trên tiết mục tiêu cho phép dạy bù (`allowMakeupTeaching: true`).
  - Tiết mục tiêu bắt buộc phải là thời điểm tương lai (`prospective target slot`).
  - Thực hiện dạy bù thành công sẽ ghi nhận `CurricularTeachingExecution (MAKEUP)`, giúp giải trừ nghĩa vụ nợ trong tiến độ mà không tiêu tốn tiết PPCT mới.
- **Đánh giá:** **PASS** — Không có finding.

---

### E11. Workload
- **Thẩm quyền đối chiếu:** ADR-050, ADR-057, T19, T20, T21, T23, T49.
- **Hiện trạng triển khai:**
  - Áp dụng chính sách `WORKLOAD_ADJUSTMENT/v1/ACADEMIC_YEAR`: định mức tuần cơ sở, các quy tắc giảm trừ (`TRU_TIET`, `TRU_PHAN_TRAM`, `GHI_DE`) sắp xếp theo thứ tự ưu tiên nghiêm ngặt.
  - Tín chỉ giảng dạy thông thường được tính cho **giáo viên thực dạy** (`actualTeacherUserId`) dựa trên chứng cứ thực hiện giảng dạy đang hoạt động, không lấy từ giáo viên kế hoạch khi có dạy thay (T49).
  - Tín chỉ chương trình đặc thù (GDĐP, HĐTN-HN) tái sử dụng cổng kép P4-050: chỉ tính khi có cả chứng cứ thực hiện của giáo viên và xác nhận của điều phối viên/BGH.
  - Phân bổ tỷ lệ định mức tuần yêu cầu theo từng ngày làm việc thực tế của lịch năm học (loại trừ các ngày gián đoạn).
  - Sử dụng số học phân số chính xác (`exact-decimal`), tính toán `earnedCredit`, `requiredCredit`, `varianceCredit` không bị sai số dấu phẩy động.
- **Đánh giá:** **PASS** — Không có finding.

---

### E12. GDĐP / HĐTN-HN / Special Programmes
- **Thẩm quyền đối chiếu:** ADR-050, ADR-052, T11, T12, T15, T16, T17, T18, T43, T44, T48.
- **Hiện trạng triển khai:**
  - Mô hình phân lớp chương trình: `ProgrammeMaster` (GDDP, HDTN_HN) cấp năm học/khối.
  - Phân quyền điều phối viên chặt chẽ: `GDDP_COORDINATOR` chỉ cho GDDP, `HĐTN_COORDINATOR` chỉ cho HDTN_HN, gắn với scope `ACTIVITY` và ID chương trình cụ thể. BGH có thẩm quyền phê duyệt trường học.
  - HĐTN-HN hỗ trợ 3 chế độ: `CLASS` (đóng băng GVCN lịch sử theo ngày), `GRADE`, `SCHOOL_WIDE` (gộp thành các tiết logic duy nhất, không nhân bản theo lớp).
  - Ánh xạ chính xác tiết dạy với tập hợp giáo viên: $\text{Slot} \to \text{Set<Teacher>}$, ngăn chặn tích Descartes sai lệch.
  - Hiện thực hóa thành `SpecialActivity` và cơ chế xác nhận tham gia (`ProgrammeOccurrenceAttestation`) đóng vai trò điều kiện tồn tại để tính định mức lao động.
- **Đánh giá:** **PASS** — Không có finding.

---

### E13. PWA
- **Thẩm quyền đối chiếu:** P5-020, T32.
- **Hiện trạng triển khai:**
  - Web App Manifest đầy đủ thông tin: Tên 'Báo giảng CM Đam San', màu theme `#1F4358`, nền `#F3F6F7`, các kích thước biểu tượng chuẩn (192, 512, maskable).
  - Service Worker (Workbox GenerateSW) cấu hình danh sách cấm fallback điều hướng: `navigateFallbackDenylist: [/^\/api/]`.
  - Định tuyến runtime: `/^\/api/` sử dụng chiến lược `NetworkOnly`, hoàn toàn không cache dữ liệu API, xác thực, báo cáo hoặc dữ liệu nghiệp vụ.
  - Khi offline, các yêu cầu API thất bại tự nhiên theo mạng, không có bộ nhớ tạm cục bộ lưu trữ đột biến nghiệp vụ offline.
  - Giao diện thông báo cập nhật bản mới hiển thị thân thiện, rõ ràng: 'Có phiên bản mới của Báo giảng.', nút 'Tải lại để cập nhật' và 'Để sau'.
- **Đánh giá:** **PASS** — Không có finding.

---

### E14. Telegram
- **Thẩm quyền đối chiếu:** ADR-058, P5-030A, P5-030, T33.
- **Hiện trạng triển khai:**
  - Tách biệt ranh giới cấu hình kỹ thuật: cấu hình Telegram nằm trong `AppConfig`, mặc định tắt (`enabled: false`) trên môi trường sản xuất.
  - Mã liên kết thử thách (link challenge) sinh ngẫu nhiên dùng một lần, thời hạn sống 10 phút, hash SHA-256 lưu DB.
  - Webhook xác thực secret token bằng so sánh hash an toàn thời gian (`crypto.timingSafeEqual`).
  - Parser giới hạn biên, chống chiếm quyền tài khoản (takeover prevention): kiểm tra `telegramUserId` và `telegramChatId` chưa được liên kết bởi tài khoản khác.
  - Máy trạng thái thông báo bền vững: `RESERVED -> ATTEMPTING -> SENT / FAILED / UNKNOWN`. Đảm bảo chiếm quyền gửi đơn nguyên trước khi gọi nhà cung cấp, ghi nhận biên nhận `IGNORED` fail-safe khi thông tin không khớp.
  - Khôi phục tiến trình khi khởi động/sập nguồn chuyển về `UNKNOWN`, tuyệt đối không tự ý gửi lặp lại.
- **Đánh giá:** **PASS** — Không có finding.

---

### E15. Schema / Migrations / DB Invariants
- **Thẩm quyền đối chiếu:** ADR-006, ADR-011, ADR-017, ADR-028, ADR-032, ADR-035, ADR-039, ADR-042, ADR-045, ADR-048, ADR-050.
- **Hiện trạng triển khai:**
  - Toàn bộ 29 migrations trong `prisma/migrations` được đánh số thứ tự thời gian chuẩn xác, có file khóa `migration_lock.toml` dành cho PostgreSQL.
  - Sử dụng các tính năng cao cấp của PostgreSQL: kiểu dữ liệu khoảng ngày `daterange`, chỉ mục loại trừ `GiST` ngăn chặn trùng lặp thời gian, các chỉ mục duy nhất có điều kiện (`partial unique indexes`), và các trigger kiểm tra tính toàn vẹn ngữ nghĩa trước khi commit.
  - Ràng buộc khóa ngoại với chính sách xóa an toàn (`ON DELETE RESTRICT` cho dữ liệu lưu giữ, `CASCADE` chỉ cho dữ liệu phụ thuộc nội bộ).
- **Đánh giá:** **PASS** — Không có finding.

---

### E16. API ↔ Contracts ↔ Web UI
- **Thẩm quyền đối chiếu:** Toàn bộ specifications & UI guidelines.
- **Hiện trạng triển khai:**
  - Hợp đồng DTO và responses được định nghĩa thống nhất tại `@baogiang/contracts`.
  - Các client trong `apps/web/src/lib/` gọi đúng tiền tố `/api/...`, truyền đúng tham số và xử lý phản hồi khớp kiểu dữ liệu.
  - Giao diện người dùng tuân thủ trạng thái `BLOCKED` của hệ thống (hiển thị thông báo chặn rõ ràng thay vì giả lập dữ liệu trống).
  - Không có hiện tượng frontend tự ý tạo quyền hoặc bỏ qua lỗi từ máy chủ.
- **Đánh giá:** **PASS** — Không có finding.

---

### E17. Deployment / Environment / Security Boundary
- **Thẩm quyền đối chiếu:** ADR-001, ADR-005, ADR-053, ADR-054, P6-005, P6-010.
- **Hiện trạng triển khai:**
  - Kiến trúc máy chủ mục tiêu: Windows Server 2022 theo hình thái `SHARED_VPS`.
  - Cổng dịch vụ: Node.js/NestJS API chạy trên loopback `127.0.0.1:3100`, Nginx đóng vai trò reverse proxy lắng nghe cổng 80/443.
  - Bảo vệ láng giềng an toàn (Protected neighbours): Các thư mục `D:\Quan_li_noi_tru`, `D:\Edu_DamSan`, tiến trình ứng dụng, cơ sở dữ liệu và cấu hình Nginx của Đam San V5 và Quản lí nội trú được cô lập hoàn toàn trong kịch bản phát hiện và tiền kiểm tra.
  - Các kịch bản PowerShell (`scripts/deploy/windows/*.ps1`) đã vượt qua kiểm tra tĩnh cú pháp, phân tích tham số và kiểm tra hành vi không có lỗi.
  - Hoàn toàn không truy cập VPS hay thay đổi môi trường sản xuất trong task P5-040.
- **Đánh giá:** **PASS** — Không có finding.

---

## 7. Cross-Domain Invariant Matrix

| Chuỗi nghiệp vụ (Chain) | Thành phần tham gia | Thẩm quyền cốt lõi | Kết quả thẩm định | Trạng thái |
|---|---|---|---|---|
| **Chain 1:** Curricular Pipeline | Calendar → Timetable → PPCT allocation → Execution → Progress/Debt → Reporting | ADR-010, ADR-017, ADR-048, ADR-038, ADR-040, ADR-041 | Định tuyến tuần chính xác, `CORE` và `SPECIALIZED_STUDY` chạy độc lập, thực hiện giảng dạy ánh xạ chuẩn tắc, tính toán nợ/tiến độ khớp và đóng băng báo cáo nhất quán. | **PASS** |
| **Chain 2:** Historical Ingestion | Operational Start → Historical Ingestion → PPCT replay → Execution → Debt → Reporting Statement | ADR-049, ADR-055, ADR-040, ADR-042 | Replay xác định bài dạy kỳ vọng, thiếu chứng cứ ghi nhận `UNCONFIRMED`, không tự sinh nợ trước ngày vận hành; đóng băng báo cáo V2/V3/V4 ghim chặt phiên bản chính sách ngày bắt đầu. | **PASS** |
| **Chain 3:** Responsibility & Schedule | TeachingAssignment / HomeroomAssignment → execution responsibility → effective schedule → workload → reporting | ADR-012, ADR-045, ADR-051, ADR-057 | Giáo viên thực dạy nhận tín chỉ giảng dạy thực tế; GVCN lớp được xác định theo ngày và đóng băng lịch sử; Teacher Workspace chỉ đọc. | **PASS** |
| **Chain 4:** Special Programmes | HĐTN/GDĐP plan → timetable marker → materialization → SpecialActivity → attestation → workload → reporting | ADR-050, ADR-052, T48, T44, T19, T20 | Kế hoạch tuần ánh xạ marker TKB; hiện thực hóa slot-to-teachers không nhân bản; xác nhận cổng kép kiểm soát định mức lao động và snapshot V3/V4. | **PASS** |
| **Chain 5:** Public Make-up | Public Make-up → resolved obligation → schedule → execution → completion → debt removal → reporting | ADR-056, T08 | Chỉ giải quyết nghĩa vụ `PROVEN_OPEN_DEBT` sau ngày vận hành; tiết tương lai hợp lệ; thực hiện bù giải trừ nợ mà không tốn bài PPCT mới. | **PASS** |
| **Chain 6:** Workload Adjustment | WorkloadAdjustment → actual execution → special-programme credit → required norm → official statement snapshot | ADR-057, T23, T49 | Quy tắc giảm trừ phân bổ theo ngày dạy học thực tế; tổng hợp tín chỉ thực dạy và chuyên đề đặc thù; số học phân số chính xác không sai số. | **PASS** |
| **Chain 7:** Access & Capability | Auth/capability → controller → service → data scope → UI action visibility | ADR-008, ADR-007 | Kiểm soát `default-deny`; `mustChangePassword` fail-closed; ghi log kiểm toán cùng transaction; UI hiển thị nút thao tác đồng bộ với `allowedActions`. | **PASS** |
| **Chain 8:** PWA Boundary | PWA → API → auth/session → cache boundary | P5-020, T32 | Cấm điều hướng fallback vào `/api`; NetworkOnly toàn bộ API; không cache dữ liệu phiên và báo cáo; không lưu đột biến offline. | **PASS** |
| **Chain 9:** Telegram Lifecycle | Telegram Profile UI → personal API → account link → webhook → durable delivery → transport provider | ADR-058, P5-030 | Ranh giới cấu hình độc lập; liên kết thử thách 10 phút dùng 1 lần; xác thực webhook chống timing leak; máy trạng thái gửi tin bền vững chống gửi lặp. | **PASS** |
| **Chain 10:** Production Deployment | Production env contract → app config → deployment validator → runtime assumptions | ADR-001, ADR-005, ADR-053, P6-010 | Shared VPS Windows Server 2022; cổng 3100 loopback; bảo vệ tuyệt đối láng giềng Đam San V5 và Quản lí nội trú; kịch bản PowerShell sẵn sàng và được kiểm chứng. | **PASS** |

---

## 8. API ↔ Contracts ↔ Web UI Consistency Matrix

| Nhóm chức năng | Tuyến API (Backend Route) | Hợp đồng trao đổi (Shared Contract) | Client Adapter (Frontend) | Trang/Thành phần UI | Quyền hạn kiểm soát (Capability Guard) |
|---|---|---|---|---|---|
| **Xác thực** | `/api/auth/login`, `/me`, `/logout` | `LoginRequest`, `AuthenticatedUser` | `apiClient` | `LoginPage`, `App.tsx` | Công khai / Session Cookie |
| **Đổi mật khẩu** | `/api/auth/change-password` | `ChangePasswordRequest` | `apiClient` | `FirstPasswordChangePage` | Session Cookie + `mustChangePassword` |
| **Lịch năm học** | `/api/academic-years`, `/calendar-versions` | `AcademicYear`, `AcademicCalendarVersion` | `academicStructureApi` | `AcademicYearsPage`, `AcademicCalendarPage` | `ACADEMIC_STRUCTURE_MANAGE` (SCHOOL_WIDE) |
| **Phân công dạy** | `/api/teaching-assignments` | `TeachingAssignmentRecord` | `teachingAssignmentApi` | `TeachingAssignmentsPage` | `TEACHING_ASSIGNMENT_MANAGE` (SCHOOL_WIDE) |
| **Phân công CN** | `/api/homeroom-assignments` | `HomeroomAssignmentRecord` | `homeroomAssignmentApi` | `HomeroomAssignmentsPage` | `HOMEROOM_MANAGE` (SCHOOL_WIDE) |
| **Áp dụng chuyên đề**| `/api/ppct/specialized-study-classes` | `PpctClassApplicabilityProfile` | `ppctApi` | `PpctSpecializedStudyPage` | `PPCT_MANAGE` (SCHOOL_WIDE / SUBJECT) |
| **Nhập PPCT** | `/api/ppct/import/inspect`, `/preview`, `/confirm` | `PpctImportInspectResponse`, `Preview` | `ppctApi` | `PpctImportPage` | `PPCT_MANAGE` (SCHOOL_WIDE / SUBJECT) |
| **Lịch hiệu lực** | `/api/effective-schedule/...` | `IndividualWeeklyScheduleResponse`, ... | `effectiveScheduleApi` | `EffectiveSchedulePage` | `TEACHER_BASE` (PERSONAL) - Read-only |
| **Lịch sử dạy** | `/api/historical-teaching/...` | `HistoricalTeachingPreviewResponse`, ... | `historicalTeachingApi` | `HistoricalTeachingPage` | `TEACHING_EXECUTION_MANAGE` (SCHOOL_WIDE) |
| **Lịch dạy bù** | `/api/operational-overlays/makeup-schedules` | `MakeupTeachingCandidateListResponse`, ... | `makeupSchedulesApi` | `MakeupSchedulingPage` | `TEACHING_OPERATION_MANAGE` (SUBJECT / SCHOOL_WIDE) |
| **Cấu hình nghiệp vụ**| `/api/business-configuration/...` | `BusinessPolicyStreamRecord`, ... | `businessConfigurationApi` | `BusinessConfigurationPage` | `BUSINESS_CONFIGURATION_MANAGE` (SCHOOL_WIDE) |
| **Chương trình ĐT** | `/api/programme-planning/...` | `ProgrammeWorkspaceResponse`, ... | `programmePlanningApi` | `SpecialProgrammeWorkspacePage` | `GDDP_COORDINATOR` / `HĐTN_COORDINATOR` / BGH |
| **Báo cáo giảng dạy** | `/api/reporting-statements/...` | `ReportingStatementDetailResponse`, ... | `reportingStatementsApi` | `ReportingStatementsPage`, `Detail` | `REPORTING_STATEMENT_READ` / `SUBMIT` / `APPROVE` |
| **Tích hợp Telegram**| `/api/integrations/telegram/...` | `TelegramIntegrationStatusResponse`, ... | `managementApi` | `ProfilePage` | Session Cookie + `mustChangePassword === false` |

Mọi ánh xạ giữa route, hợp đồng, client và UI đều nhất quán 100%, không phát hiện route drift hay enum mismatch.

---

## 9. Schema & Migration Findings

- **Tổng số migration:** 29 migrations được lưu giữ tuần tự từ `20260728000000_phase_00_baseline` đến `20261006120000_p5_030_telegram_integration`.
- **DDL & Invariants:**
  - Không có migration nào chạy ngoài luồng hoặc phá vỡ thứ tự commit.
  - Toàn bộ các bảng nghiệp vụ có khóa ngoại liên kết bảo đảm tính toàn vẹn tham chiếu.
  - Các ràng buộc CHECK và hàm TRIGGER của PostgreSQL đảm bảo tính hợp lệ của trạng thái dòng đời (ví dụ: `business_policy_versions_lifecycle_evidence_check`, `special_activity_staffing_eligibility_shape_check`).
  - Lịch sử di trú hoàn toàn sạch và khớp với `schema.prisma`.
- **Đánh giá:** **PASS** — Không có finding.

---

## 10. Deployment & Config Findings

- **Tách biệt bí mật:** Tập tin mẫu `.env.production.example` phân định rõ ràng các biến hệ thống; các kịch bản kiểm tra `scan-auth-secrets.cjs` bảo đảm không có mật khẩu hay token nào bị đưa vào mã nguồn.
- **Kịch bản PowerShell:** Các tệp `.ps1` hỗ trợ xử lý lỗi an toàn (`$ErrorActionPreference = 'Stop'`), phân tích chính xác đầu ra không phụ thuộc định dạng bản địa hóa tiếng Anh hay tiếng Việt.
- **Cấu hình Nginx & Chứng chỉ:** Cơ chế xác thực HTTP-01 được cô lập trên cổng 80 cho win-acme, các include của Nginx được thiết kế có ranh giới rõ ràng, không làm ảnh hưởng đến khối cấu hình của Quản lí nội trú.
- **Đánh giá:** **PASS** — Không có finding.

---

## 11. Test-Evidence Assessment

| Nhóm kiểm tra (Test Suite) | Lệnh thực thi | Kết quả | Chi tiết bằng chứng |
|---|---|---|---|
| **Cấu trúc Schema tĩnh** | `npm run test:schema:static` | **PASS** | 4 bộ kiểm tra (Foundation, Academic, Business Config, Telegram) thành công |
| **Quét bí mật xác thực** | `npm run test:secrets` | **PASS** | Không phát hiện bí mật hay chuỗi hardcode nhạy cảm |
| **Triển khai tĩnh & hành vi** | `npm run test:deploy:static` & `test:deploy:behavior` | **PASS** | 20 kịch bản triển khai và các fixture mô phỏng hành vi vượt qua toàn bộ |
| **Hợp đồng Workflow CI** | `npm run test:workflow:contract` | **PASS** | Cấu trúc trigger, job, quyền hạn và ma trận môi trường chuẩn xác |
| **Giao diện & PWA tĩnh** | `npm run test:ui:static` | **PASS** | Thẩm tra manifest, icons, service worker routing và giao diện update |
| **Kiểm tra kiểu tĩnh (Typecheck)** | `npm run typecheck` | **PASS** | 4/4 workspaces (`contracts`, `config`, `api`, `web`) không có lỗi type |
| **Quy chuẩn mã nguồn (Lint)** | `npm run lint` | **PASS** | 4/4 workspaces sạch sẽ, không có warning hoặc error |
| **Unit Tests — Web** | `npm run test:unit -w apps/web` | **PASS** | 27/27 test files passed, 371/371 tests passed (100%) |
| **Unit Tests — API** | `npm run test:unit -w apps/api` | **PASS** | 99/99 test suites passed, 1815/1815 tests passed (100%) |
| **Tổng cộng Unit Tests** | `npm run test:unit` | **PASS** | **126 test files, 2186 tests passed (100%)** |

---

## 12. Findings Register

| ID | Severity | Lĩnh vực | Thẩm quyền liên quan | Bằng chứng thực tế | Đánh giá tác động | Yêu cầu khắc phục |
|---|---|---|---|---|---|---|
| *None* | — | — | — | — | Không phát hiện lỗi BLOCKER, HIGH hoặc MEDIUM. | Không có |

### Các quan sát vận hành không gây nghẽn (Non-blocking Operational Observations):
1. **Observation 01 (Low):** *Môi trường tích hợp PostgreSQL cục bộ trên Windows:* Đã được ghi chú chính thức tại P2-004; hệ thống CI chuẩn tắc trên Linux (CI #428, #429) và toàn bộ các bộ test tĩnh/unit/integration trên repo đã xác thực tính đúng đắn đầy đủ.
2. **Observation 02 (Low):** *Trạng thái Telegram trên môi trường sản xuất:* Mặc định tắt (`TELEGRAM_ENABLED=false`). Đây là hành vi an toàn có chủ đích (fail-safe by default), chỉ được kích hoạt khi Product Owner cấu hình bot token thực tế.
3. **Observation 03 (Low):** *Cổng tiền kiểm tra môi trường sản xuất:* Nhiệm vụ P6-020 (Stage 1 passive production evidence) vẫn ở trạng thái `DEFERRED_WITH_TRIGGER` và chưa được kích hoạt; kết quả PASS của P5-040 không thay thế cho tiền kiểm tra thực tế trên VPS.

---

## 13. Required Correction Tasks

Do không có bất kỳ phát hiện nào ở mức **BLOCKER** hoặc **HIGH**, không có yêu cầu mở task sửa lỗi (Correction Task) nào trước khi đưa P5-040 vào trạng thái `IN_REVIEW`.

---

## 14. Residual Risks

1. **Rủi ro môi trường thực tế tại VPS (Stage 1 Passive Evidence):**
   - Repository code và cấu hình triển khai hoàn toàn nhất quán. Tuy nhiên, tình trạng thực tế của máy chủ Windows Server 2022 (cấu hình dịch vụ, quyền hạn ACL, trạng thái Nginx hiện tại) phải được thẩm định độc lập tại bước `P6-020` trước khi thực hiện bất kỳ thao tác bootstrap nào (`P6-030`).
2. **Kích hoạt tài khoản Telegram trong vận hành:**
   - Cần đảm bảo khi đưa vào sử dụng thực tế, webhook secret và bot token được bảo vệ bí mật, tuân thủ đúng quy trình đã được kiểm chứng tại `P5-030`.

---

## 15. Final Audit Disposition

Căn cứ trên toàn bộ kết quả kiểm tra tĩnh, phân tích mã nguồn, đối chiếu thẩm quyền, thẩm tra sơ đồ dữ liệu và chạy toàn bộ 2186 bài kiểm tra đơn vị:

```text
DISPOSITION: PASS — NO BLOCKER/HIGH FINDINGS
```

P5-040 đủ điều kiện chuyển trạng thái sang `IN_REVIEW`.
Môi trường sản xuất tiếp tục duy trì trạng thái **PRE-OPERATIONAL**.
Task `P6-020` tiếp tục duy trì trạng thái **DEFERRED_WITH_TRIGGER**.
