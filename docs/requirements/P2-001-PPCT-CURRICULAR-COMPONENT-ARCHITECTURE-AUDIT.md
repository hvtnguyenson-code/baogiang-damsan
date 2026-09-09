# P2-001 — Kiểm tra và Thiết kế Kiến trúc Tái nhập: Phân định Thành phần Chương trình PPCT (Curricular-Component Architecture Re-Entry)

## 1. Trạng thái và Định danh Nhiệm vụ

- **Mã nhiệm vụ (Task ID):** `P2-001`
- **Tên nhiệm vụ:** Kiểm tra và thiết kế kiến trúc tái nhập: Phân định thành phần chương trình PPCT (PPCT Curricular-Component Architecture Re-Entry)
- **Trạng thái nhiệm vụ trên nhánh:** `IN_REVIEW`
- **Ngày lập tài liệu:** 2026-09-09
- **Công cụ thực thi:** ANTIGRAVITY IDE
- **Repository:** `hvtnguyenson-code/baogiang-damsan`
- **Nhánh chuyên trách:** `docs/ppct-curricular-component-architecture-001`
- **SHA canonical `origin/main` khởi đầu:** `a58ba312913a519ed665d1d7fc701f87a7beccfb`
- **Authoritative Main CI trước nhiệm vụ:** CI #400 / run `34250442087` — SUCCESS
- **Phạm vi nhiệm vụ:** Strictly Docs & Architecture Only. Tuyệt đối không thay đổi mã nguồn runtime (`apps/`), schema/migrations (`prisma/`), contracts/config (`packages/`), CI/CD workflows (`.github/`), scripts triển khai (`deploy/`, `scripts/`), giao diện người dùng UI, test runtime, hoặc đột biến môi trường production.
- **Truy xuất nguồn gốc (Traceability):** `T45`, `T46`.
- **Nhiệm vụ tiền nhiệm:** `P0-900` (`CLOSED by SYNC-P0-900`).

---

## 2. Bối cảnh và Thẩm quyền Kích hoạt

Nhiệm vụ `P0-900` đã đóng chính thức và tiếp nhận quyết định thẩm quyền bằng văn bản ngày 2026-09-08 của Product Owner vào `PRE-PILOT-PRODUCT-BASELINE.md` (§4.13), xác lập các nguyên tắc cốt lõi:
1. Một môn học thông thường trong chương trình THPT có thể chứa hai thành phần chương trình phân biệt: `CORE` (Kiến thức cốt lõi / cơ bản) và `SPECIALIZED_STUDY` (Chuyên đề học tập).
2. `SPECIALIZED_STUDY` là một thành phần chương trình (curricular component) của CÙNG một môn học thông thường (the SAME ordinary Subject). Nó không phải là một môn học riêng biệt (`Subject`), không phải hoạt động đặc biệt (`SpecialActivity`), không phải Giáo dục địa phương (`GDĐP`), và không phải Hoạt động trải nghiệm, hướng nghiệp (`HĐTN-HN`).
3. Phân công giảng dạy (`TeachingAssignment`) tiếp tục quản lý ở cấp độ lớp-môn (`AcademicYear + SchoolClass + Subject + User`); giáo viên được phân công chịu trách nhiệm dạy cả `CORE` và `SPECIALIZED_STUDY`.
4. Thời khóa biểu gốc (`TimetableEntry`) tuyệt đối không mang trường thành phần chương trình.
5. Tính áp dụng chuyên đề theo lớp-môn là dữ liệu cấu hình nghiệp vụ chính thức do quản trị viên thiết lập, không suy diễn tự động. Đối với lớp không học chuyên đề, nội dung chuyên đề có trạng thái `NOT_APPLICABLE` (không nợ, không thiếu, không trễ).
6. Định tuyến cơ hội hàng tuần: Trong mỗi tuần học (`AcademicWeek`), cơ hội TKB bình thường cuối cùng theo thời gian của lớp có học chuyên đề được định tuyến cho `SPECIALIZED_STUDY`; các cơ hội sớm hơn định tuyến cho `CORE`. Đây là phân loại lập kế hoạch (planning semantics), không bị xê dịch bởi các biến động vận hành (nghỉ lễ, hủy tiết, dạy thay).
7. Tiến trình độc lập: `CORE` và `SPECIALIZED_STUDY` có con trỏ tiến độ và không gian bao phủ nghĩa vụ PPCT hoàn toàn độc lập.
8. Báo cáo tổng hợp môn học thông thường cộng gộp cả hai thành phần; chi tiết thực thi giữ nguyên nguồn gốc (provenance).

Nhiệm vụ `P2-001` có trách nhiệm đóng toàn bộ các quyết định kiến trúc cụ thể cho 15 câu hỏi chưa giải quyết mà `P0-900` Section 15 đã giao, xác lập tài liệu đóng quyết định `P2-001D` và đề xuất `ADR-048-PPCT-CURRICULAR-COMPONENT-ARCHITECTURE.md` thay thế các điều khoản đã mở lại của `ADR-027`, `ADR-028`, `ADR-029`, `ADR-030`, `ADR-037`, `ADR-040`.

---

## 3. So sánh Hiện trạng Kỹ thuật với Kiến trúc Mục tiêu

### 3.1 Hiện trạng Schema (`prisma/schema.prisma`)
- `PpctPlan`: Khóa tự nhiên `(academicYearId, subjectId, gradeLevel)` đại diện cho kế hoạch cấp khối-môn.
- `PpctVersion`: Vòng đời `DRAFT -> PUBLISHED -> SUPERSEDED`. Chỉ mục duy nhất bảo đảm tối đa một phiên bản `PUBLISHED` cho mỗi kế hoạch qua `(ppctPlanId, status)`.
- `PpctItem`: Chứa `id`, `ppctPlanId`. Chưa có trường `component`.
- `PpctItemRevision`: Chứa `ppctVersionId`, `ppctPlanId`, `ppctItemId`, `title`, `lessonType`, `sequence`. Ràng buộc `@@unique([ppctVersionId, sequence])` áp đặt một không gian số thứ tự duy nhất trên toàn phiên bản.
- `PpctItemLineage`: Chứa `ppctPlanId`, `predecessorVersionId`, `predecessorItemId`, `successorVersionId`, `successorItemId`. Chưa có trường `component` để ràng buộc thành phần ở mức DB.
- `PpctClassAssociation`: Liên kết `(academicYearId, schoolClassId, subjectId, gradeLevel)` tới `PpctVersion` qua các trường ngày `effectiveFrom` và `effectiveUntil`. Cơ sở dữ liệu sử dụng GiST exclusion trên daterange (không có trường vật lý tên `effectiveRange`). Chưa lưu trữ thông tin lớp có học chuyên đề hay không.

### 3.2 Hiện trạng Runtime
- `apps/api/src/ppct/`: Quản lý soạn thảo bản nháp và xuất bản một danh sách bài học đơn tuyến.
- `apps/api/src/resolved-occurrences/`: Phân giải cơ hội thời khóa biểu theo cấu trúc `RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1` mà không phân loại thành phần.
- `apps/api/src/ppct-occurrence-allocation/`: `PPCT_OCCURRENCE_ALLOCATION_V1` duyệt tuần tự các cơ hội theo trục thời gian, tiêu thụ mục PPCT có `sequence` nhỏ nhất chưa phân bổ trên toàn phiên bản. Không có gom nhóm theo tuần, không có quy tắc cơ hội cuối tuần, không phân tách con trỏ.
- `apps/api/src/teaching-executions/`: `CurricularTeachingExecution` gắn với bản sửa đổi qua trường vật lý chuẩn tắc `ppctItemRevisionId` (và bộ tọa độ `ppctItemRevisionId + ppctVersionId + ppctItemId + ppctPlanId`); trong khi `MakeupTeachingSchedule` ghim bản sửa đổi trực tiếp qua bộ 3 trường `ppctVersionId + ppctItemId + ppctPlanId` mà không có trường `ppctItemRevisionId` hay `ppctRevisionId`.
- `apps/api/src/progress-debt/`: `TEACHING_PROGRESS_DEBT_V1` đánh giá tiến độ trên một luồng nghĩa vụ đơn tuyến.
- `apps/api/src/reporting-projection/`: Phóng chiếu báo cáo tổng hợp theo lớp-môn và giáo viên.

### 3.3 Kiến trúc Mục tiêu (Target Architecture)
- Giữ nguyên mô hình 6 bảng PPCT nền tảng: `PpctPlan`, `PpctVersion`, `PpctItem`, `PpctItemRevision`, `PpctItemLineage`, `PpctClassAssociation`.
- Bổ sung enum `PpctCurricularComponent { CORE, SPECIALIZED_STUDY }`.
- `PpctItem` sở hữu thuộc tính `component` bất biến gắn liền với `ppctPlanId`: một UUID bài học đã thuộc về một thành phần thì vĩnh viễn không đổi thành phần qua các phiên bản. Phơi bày `@@unique([id, ppctPlanId, component])`.
- `PpctItemRevision` mang trường `component` như một tọa độ quan hệ bản sao (duplicated relational coordinate) được bảo vệ bởi composite FK đối chiếu trực tiếp với `PpctItem`: `FOREIGN KEY (ppctItemId, ppctPlanId, component) REFERENCES PpctItem(id, ppctPlanId, component) ON DELETE RESTRICT ON UPDATE RESTRICT`. Bảo toàn các khóa duy nhất hiện hữu (`ppct_item_revisions_provenance_key` cho `MakeupTeachingSchedule`, `ppct_item_revisions_execution_provenance_key` cho `CurricularTeachingExecution`, và `[ppctVersionId, ppctItemId]`); phơi bày tọa độ duy nhất phức hợp BỔ SUNG `@@unique([ppctVersionId, ppctItemId, ppctPlanId, component])` phục vụ lineage và kiểm chứng quan hệ.
- Thay thế ràng buộc duy nhất toàn phiên bản bằng ràng buộc duy nhất theo thành phần: `@@unique([ppctVersionId, component, sequence])`. Số thứ tự `sequence` là số nguyên dương độc lập trong từng thành phần (1..N cho `CORE`, 1..M cho `SPECIALIZED_STUDY`). Không lưu chuỗi "CD1" vào cơ sở dữ liệu; tiền tố "CD" là quy ước hiển thị tầng trình diễn.
- Kế thừa cùng UUID (`CARRY_FORWARD`) qua các phiên bản sử dụng cùng `PpctItem.id` bất biến, không tạo bản ghi trong `PpctItemLineage`. `PpctItemLineage` chỉ đại diện cho các cạnh tách (`SPLIT`) và gộp (`MERGE`) giữa các UUID bài học khác nhau (`predecessorVersionId != successorVersionId`, `predecessorItemId != successorItemId`). Bổ sung cột tọa độ `component: PpctCurricularComponent` vào `PpctItemLineage`. Cả tiền nhiệm và kế nhiệm đều gắn composite FK tới `PpctItemRevision(ppctVersionId, ppctItemId, ppctPlanId, component)` với `ON DELETE RESTRICT ON UPDATE RESTRICT`, đảm bảo `predecessor.component == lineage.component == successor.component` ngay tại tầng lưu trữ cơ sở dữ liệu. Tuyệt đối không dùng `ON UPDATE CASCADE`.
- Bổ sung enum `PpctClassCurricularProfile { CORE_ONLY, CORE_PLUS_SPECIALIZED_STUDY }` trên `PpctClassAssociation`. Việc liên kết phiên bản và cấu hình áp dụng nằm chung trong một bản ghi liên kết có hiệu lực theo khoảng ngày dân sự chuẩn tắc `effectiveFrom: DateTime @db.Date` và `effectiveUntil: DateTime? @db.Date` (inclusive civil DATE bounds; `NULL` là mở về tương lai) được bảo vệ bởi GiST exclusion backstop `daterange(effective_from, effective_until, '[]')` (không có trường vật lý `effectiveRange`, không dùng `COALESCE(effective_until, 'infinity'::date), '[)'`). `P2-002` thực thi thẩm quyền phía máy chủ cấm thay đổi hồ sơ giữa tuần học nghiệp vụ (`PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`).
- Định tuyến cơ hội hàng tuần: Phân biệt `AcademicWeek` (định danh tuần) và `AcademicWeekSegment` (khoảng ngày thực tế). Phân vùng theo `AcademicYear + SchoolClass + Subject + exact AcademicCalendarVersion + exact AcademicWeek.id`. Lớp `CORE_ONLY` định tuyến toàn bộ cơ hội vào `CORE`. Lớp `CORE_PLUS_SPECIALIZED_STUDY` định tuyến cơ hội bình thường cuối cùng vào `SPECIALIZED_STUDY`, các cơ hội sớm hơn vào `CORE`.
- Cơ hội rơi vào khoảng trống gián đoạn lịch học (`CalendarInterruption` gap): Nằm ngoài tập định tuyến tuần học, không phân bổ, không tiêu thụ PPCT, không sinh nợ, không tham gia chọn cơ hội cuối tuần.
- Phân loại lập kế hoạch đi trước kết quả vận hành: Cơ hội chuyên đề bị hủy/nghỉ vẫn giữ nguyên phân loại chuyên đề, không đôn cơ hội cốt lõi trước đó lên làm chuyên đề.
- Tuần dị thường: Tuần 0 cơ hội không phân bổ, không tạo nợ; tuần 1 cơ hội đối với lớp `CORE_PLUS_SPECIALIZED_STUDY` kích hoạt cơ chế chặn fail-closed (`PPCT_COMPONENT_WEEK_CAPACITY_INVALID`).
- Chuyển giao TKB giữa tuần: Cho phép gom ứng viên từ các phiên bản TKB khác nhau NẾU cùng `AcademicCalendarVersion` và `AcademicWeek.id`. Nếu lệch lịch/tuần: fail-closed với `PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`.
- Tiến trình độc lập: Hai con trỏ tiến độ và hai không gian bao phủ nghĩa vụ (`CORE` và `SPECIALIZED_STUDY`) độc lập hoàn toàn trong bộ nhớ khi replay.
- Cấm tuyệt đối lineage vượt thành phần: Bảo vệ kép bằng cơ sở dữ liệu và control plane (`PPCT_COMPONENT_LINEAGE_CROSS_COMPONENT`).

---

## 4. Bảng Phân loại Tác động Kiến trúc (KEEP / EXTEND / SUPERSEDE / NO CHANGE)

| Khu vực / Thực thể | Phân loại | Chi tiết Tác động Kiến trúc |
|---|---|---|
| **PpctPlan** | **NO CHANGE** | Giữ nguyên khóa `(academicYearId, subjectId, gradeLevel)` làm kế hoạch dùng chung. Không tạo `PpctComponentPlan`. |
| **PpctVersion** | **NO CHANGE** | Giữ nguyên vòng đời `DRAFT -> PUBLISHED -> SUPERSEDED`. Một phiên bản duy nhất bao gói nguyên tử cả `CORE` và `SPECIALIZED_STUDY`. Không tách thành hai phiên bản độc lập. |
| **PpctItem** | **EXTEND** | Bổ sung trường `component` (`PpctCurricularComponent`). Định danh thành phần là bất biến gắn với UUID của bài học và `ppctPlanId`. Phơi bày `@@unique([id, ppctPlanId, component])`. |
| **PpctItemRevision** | **EXTEND & SUPERSEDE** | Bổ sung trường `component` (bản sao ràng buộc với item). Composite FK `(ppctItemId, ppctPlanId, component)`. **SUPERSEDE:** Ràng buộc `@@unique([ppctVersionId, sequence])` bị thay thế bởi `@@unique([ppctVersionId, component, sequence])`. |
| **PpctItemLineage** | **EXTEND** | Bổ sung trường `component` (`PpctCurricularComponent`). Composite FK kép tới revision tiền nhiệm và kế nhiệm. Ngăn chặn triệt để cross-component lineage ở tầng DB. |
| **PpctClassAssociation** | **EXTEND** | Bổ sung trường `curricularProfile` (`PpctClassCurricularProfile`). Tiếp tục dùng `effectiveFrom` / `effectiveUntil` với GiST exclusion range. |
| **TeachingAssignment** | **NO CHANGE** | Tuyệt đối không bổ sung trường thành phần. Cùng một giáo viên phụ trách cả hai thành phần cho lớp-môn. |
| **TimetableEntry** | **NO CHANGE** | Tuyệt đối không bổ sung trường thành phần. Tiết TKB đại diện cho môn học nói chung. |
| **Resolved Occurrences** | **EXTEND** | Giữ nguyên cấu trúc cơ hội cấu trúc. Module phân bổ hạ nguồn thực hiện gom nhóm tuần và gán nhãn thành phần lập kế hoạch. |
| **PPCT Allocator** | **SUPERSEDE** | Thay thế bộ duyệt đơn tuyến bằng bộ định tuyến tuần và hai con trỏ tiến độ độc lập (`CORE` và `SPECIALIZED_STUDY`). |
| **Readiness Model** | **EXTEND** | Bảo tồn `NORMAL_BASE_PPCT_V1` cho tương thích lịch sử; bổ sung profile mới `NORMAL_BASE_PPCT_COMPONENT_V2` đánh giá cấu hình áp dụng, phân đoạn tuần và dung lượng tuần. |
| **Teaching Execution** | **NO CHANGE** | Không thêm cột `component` vào bảng thực thi. Nguồn gốc thành phần được truy xuất tất định từ `PpctItem` / `PpctItemRevision`. |
| **Makeup Schedule** | **NO CHANGE** | Dạy bù kế thừa nguyên vẹn nghĩa vụ và thành phần của tiết gốc bị lỡ, không tiêu thụ tiết PPCT mới. |
| **Progress / Debt** | **EXTEND** | Tính toán nghĩa vụ, nợ và khoảng trống theo từng thành phần bên trong; báo cáo tổng hợp môn học thông thường cộng gộp cả hai. |
| **Reporting Projection** | **EXTEND** | Bảng chi tiết bổ sung cột thành phần / số thứ tự hiển thị ("CD1"); bảng tổng hợp giữ nguyên số liệu gộp. |
| **Workbook Importer** | **NO CHANGE (P2-001)** | Trình nạp PPCT được giao cho `P2-010` (kiểm tra bằng chứng) và `P2-020` (triển khai), tuân thủ định hướng gói một version. |

---

## 5. Đối soát và Giải quyết Toàn diện 15 Câu hỏi Kiến trúc của P0-900

Dưới đây là phương án giải quyết dứt điểm cho toàn bộ 15 câu hỏi kiến trúc được giao từ `P0-900` Section 15:

### Câu hỏi 1: Vị trí Vật lý của CurricularComponent
- **Quyết định:** Định nghĩa enum `PpctCurricularComponent` trong schema Prisma:
  ```prisma
  enum PpctCurricularComponent {
    CORE
    SPECIALIZED_STUDY
  }
  ```
- **Lý do:** Đây là một tập giá trị đóng, hữu hạn, ổn định theo quy định của Chương trình GDPT 2018. Không cần thiết tạo bảng danh mục riêng vì không có thuộc tính động đi kèm.

### Câu hỏi 2: Cấp độ Gắn kết (Item vs. Revision vs. Cấu trúc Trung gian)
- **Quyết định:** 
  1. `PpctItem` sở hữu thuộc tính `component` bất biến: `PpctItem(id, ppctPlanId, component)` với tọa độ duy nhất `@@unique([id, ppctPlanId, component])`. Khi một UUID của `PpctItem` đã được khởi tạo với một thành phần, nó vĩnh viễn không bao giờ được phép đổi thành phần trong bất kỳ phiên bản nào sau đó.
  2. `PpctItemRevision` mang trường `component` như một tọa độ quan hệ bản sao (duplicated relational coordinate): `PpctItemRevision(ppctVersionId, ppctPlanId, ppctItemId, component, sequence, title, lessonType)`.
  3. Tại tầng cơ sở dữ liệu (`P2-002`), PostgreSQL và Prisma sẽ thiết lập khóa ngoại phức hợp (composite foreign key) bảo đảm:
     ```sql
     FOREIGN KEY (ppct_item_id, ppct_plan_id, component)
       REFERENCES ppct_items(id, ppct_plan_id, component)
     ```
     Điều này bảo đảm chứng minh đồng thời: đúng bài học ổn định, đúng kế hoạch môn học, và đúng thành phần bất biến (`revision.component == item.component`), ngăn chặn 100% hiện tượng trôi lệch thành phần (drift).
  4. `PpctItemRevision` phơi bày tọa độ duy nhất phức hợp: `@@unique([ppctVersionId, ppctItemId, ppctPlanId, component])`.
  5. Không tạo thực thể trung gian `PpctComponentPlan` để tránh chia cắt kế hoạch khung và phân mảnh vòng đời.

### Câu hỏi 3: Tính Duy nhất của Sequence theo Thành phần
- **Quyết định:**
  1. Thay thế ràng buộc `@@unique([ppctVersionId, sequence])` hiện tại bằng:
     ```prisma
     @@unique([ppctVersionId, component, sequence], map: "ppct_item_revisions_version_component_sequence_key")
     ```
  2. `sequence` là số nguyên dương (`1, 2, 3...`), chỉ đại diện cho thứ tự phân phối nội bộ trong phạm vi thành phần đó, không phải định danh kỹ thuật.
  3. Cả `CORE` và `SPECIALIZED_STUDY` đều bắt đầu từ `sequence = 1`.
  4. Tuyệt đối không lưu trữ chuỗi tiền tố như `"CD1"`, `"CD2"` vào cột `sequence` hay cột định danh trong cơ sở dữ liệu.
  5. Quy tắc tầng trình diễn (presentation convention):
     - `CORE` sequence `1` -> hiển thị `"1"`
     - `SPECIALIZED_STUDY` sequence `1` -> hiển thị `"CD1"`
  6. Không áp đặt điều kiện tiên quyết rằng sequence phải liên tục tuyệt đối không có lỗ hổng số học ở tầng cơ sở dữ liệu, trừ khi có quy định chuẩn tắc độc lập được duyệt.

### Câu hỏi 4: Lưu trữ và Hiệu lực của Cấu hình Áp dụng Lớp-Môn
- **Quyết định:**
  1. Định nghĩa enum `PpctClassCurricularProfile`:
     ```prisma
     enum PpctClassCurricularProfile {
       CORE_ONLY
       CORE_PLUS_SPECIALIZED_STUDY
     }
     ```
  2. Trường `curricularProfile` được bổ sung trực tiếp vào bảng `PpctClassAssociation`.
  3. Không tạo bảng riêng biệt và không đưa vào JSON cấu hình chung của `BusinessConfiguration`. Việc liên kết phiên bản PPCT và quy định hồ sơ áp dụng thành phần là hai khía cạnh gắn kết mật thiết của cùng một quyết định liên kết lớp-môn.
  4. Bảng `PpctClassAssociation` duy trì các trường ngày chuẩn tắc `effectiveFrom: DateTime @db.Date` và `effectiveUntil: DateTime? @db.Date` đóng vai trò các mốc ngày dân sự bao gồm (inclusive civil DATE bounds; giá trị `NULL` là mở về tương lai). Cơ sở dữ liệu duy trì cơ chế GiST exclusion range không chồng lấn trên `daterange(effective_from, effective_until, '[]')` (khớp với migration hiện hành `ppct_class_associations_no_overlap`), lưu giữ lịch sử điều chỉnh đầy đủ mà không viết đè (không có cột vật lý tên `effectiveRange` và không dùng `COALESCE(effective_until, 'infinity'::date), '[)'`).


### Câu hỏi 5: Thay đổi Cấu hình Áp dụng Giữa năm hoặc Giữa tuần
- **Quyết định:**
  1. Khi cấu hình áp dụng thay đổi giữa năm học, quản trị viên tạo một bản ghi `PpctClassAssociation` mới với khoảng ngày dân sự kế tiếp, kết thúc khoảng ngày của bản ghi cũ.
  2. **Đối soát cấu trúc tuần học lịch học (`AcademicWeek` vs `AcademicWeekSegment`):** Tuân thủ `ADR-010` và `ADR-011`, `AcademicWeek` là định danh tuần nghiệp vụ được lưu trữ, bản thân nó không có khoảng ngày dân sự liên tục đơn tuyến. Khoảng ngày thực tế thuộc về `AcademicWeekSegment`. Một `AcademicWeek` có thể chứa nhiều phân đoạn không liên tục (ví dụ: 5a và 5b, cách nhau bởi khoảng trống gián đoạn `CalendarInterruption`).
  3. **Phân định rõ ràng giữa tập định tuyến và bao đóng bảo vệ chuyển tiếp hồ sơ:**
     - **Tập thành viên định tuyến (Routing Membership):** Chỉ các ngày dân sự nằm trong các bản ghi `AcademicWeekSegment` thực tế mới thuộc tập định tuyến tuần: `Routing Set = union(tất cả các khoảng ngày AcademicWeekSegment của exact AcademicWeek)`. Các cơ hội TKB cấu trúc rơi vào khoảng trống gián đoạn lịch (`CalendarInterruption` gap) hoàn toàn nằm ngoài tập định tuyến này.
     - **Bao đóng bảo vệ chuyển tiếp hồ sơ (Curricular Profile Transition Protection Envelope):** Đối với các thay đổi `curricularProfile`, bao đóng tuần nghiệp vụ được bảo vệ trải dài từ thời điểm bắt đầu của phân đoạn đầu tiên đến thời điểm kết thúc của phân đoạn cuối cùng của cùng cặp `(exact AcademicCalendarVersion, exact AcademicWeek.id)`, BAO GỒM CẢ các khoảng gián đoạn lịch học nội bộ (`CalendarInterruption` gaps).
  4. Nếu thao tác tạo/sửa cấu hình hoặc dữ liệu tạo ra sự thay đổi `curricularProfile` trong phạm vi bao đóng tuần học được bảo vệ (bao gồm cả trường hợp ngày bắt đầu hiệu lực `effectiveFrom` rơi vào khoảng gián đoạn giữa các phân đoạn 5a và 5b):
     **HỆ THỐNG DỪNG LẠI VÀ BÁO LỖI (FAIL-CLOSED)** với mã lỗi ngữ nghĩa:
     `PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`
     *(Thay đổi phiên bản PPCT đơn thuần giữ nguyên `curricularProfile` không kích hoạt lỗi này).*
  5. **Thực thi thẩm quyền phía máy chủ tại P2-002 (Server-Side Enforcement):**
     `P2-002` bắt buộc phải thực thi kiểm tra thẩm quyền ở tầng máy chủ: Mọi thao tác trên `PpctClassAssociation` làm thay đổi `curricularProfile` BẮT BUỘC PHẢI BỊ TỪ CHỐI nếu sự chuyển tiếp này gây phân tách hồ sơ trong cùng một tuần học nghiệp vụ. Giao diện quản trị `P2-004` có thể cảnh báo và hướng dẫn người dùng, nhưng hướng dẫn UI không thay thế được thẩm quyền của server. `P2-003`, readiness và replay kiểm tra độc lập cấu trúc tuần/lịch retained; nếu các bản ghi liên kết lịch sử dẫn đến chia cắt hồ sơ dưới tuần học đang phát lại, hệ thống fail-closed chứ tuyệt đối không tự ý viết lại lịch sử liên kết.

### Câu hỏi 6: Định nghĩa Chuẩn tắc của "Cơ hội Cuối cùng trong Tuần"
- **Quyết định:**
  1. Tập cơ hội ứng viên được xác định chính xác theo khóa:
     `AcademicYear + SchoolClass + Subject + exact AcademicCalendarVersion + exact AcademicWeek.id`.
  2. Không sử dụng số tuần ISO, giờ máy chủ cục bộ, nhãn hiển thị, số tuần chính thức (`officialWeekNumber`) hay khoảng cách ngày làm định danh.
  3. Một cơ hội thời khóa biểu bình thường (`NORMAL_TIMETABLE_OPPORTUNITY`) chỉ thuộc về tập định tuyến tuần khi và chỉ khi `civilDate` của nó nằm trong đúng một `AcademicWeekSegment` thuộc `AcademicCalendarVersion` có hiệu lực.
  4. Thuật toán sắp xếp tất định áp dụng trên tập cơ hội thời khóa biểu bình thường trong tuần:
     - Tiêu chí 1: `civilDate` tăng dần;
     - Tiêu chí 2: `TimeSlotDefinition.startTime` tăng dần;
     - Tiêu chí 3: `TimeSlotDefinition.endTime` tăng dần;
     - Tiêu chí 4 (Phân xử hòa ổn định): `NORMAL:<timetableEntryId>:<civilDate>` tăng dần theo chuỗi ký tự.
  5. Bất kỳ trường hợp trùng lặp thời gian/tiết bất khả thi nào vẫn là lỗi cấu trúc (`CLASS_TIME_OVERLAP`) và không được tự động bỏ qua bằng phân xử hòa.
  6. Đối với lớp `CORE_PLUS_SPECIALIZED_STUDY`: cơ hội cuối cùng sau khi sắp xếp được gán `SPECIALIZED_STUDY`; toàn bộ các cơ hội đứng trước được gán `CORE`.
  7. Đối với lớp `CORE_ONLY`: toàn bộ các cơ hội được gán `CORE`.

### Câu hỏi 7: Hành vi Tất định cho các Tuần Dị thường, Gián đoạn Lịch và Cắt chuyển TKB
- **Quyết định:**
  - **Trường hợp A — Ngữ nghĩa khoảng trống gián đoạn lịch học (`CalendarInterruption` Gap):**
    Một cơ hội TKB cấu trúc có `civilDate` rơi vào khoảng gián đoạn lịch học và do đó không thuộc bất kỳ `AcademicWeekSegment` nào:
    - Vẫn được quan sát ở mức cấu trúc phục vụ chẩn đoán/truy vết;
    - Nằm NGOÀI tập định tuyến thành phần tuần học;
    - Không nhận nghĩa vụ phân bổ `CORE` hay `SPECIALIZED_STUDY`, không tiêu thụ bài PPCT, không sinh nợ tiến độ;
    - Tuyệt đối KHÔNG tham gia vào việc lựa chọn cơ hội cuối cùng của tuần.
    *(Đây là sự vắng mặt quyền sở hữu tuần học, không phải phân loại lại vận hành).*
  - **Trường hợp B — Phân đoạn tuần không liên tục (Non-contiguous Week Segments):**
    Đối với một `AcademicWeek` có nhiều phân đoạn (5a, 5b), tập định tuyến tuần là HỢP của tất cả các cơ hội trong các phân đoạn thuộc tuần. Cơ hội cuối cùng theo thời gian của hợp phân đoạn là chuyên đề. Phân đoạn 5a và 5b không phải là hai tuần độc lập.
  - **Trường hợp C — Tuần có 0 cơ hội bình thường:** Không thực hiện định tuyến, không phân bổ, không tạo cơ hội giả tạo, không tiêu thụ mục PPCT, và không sinh nợ tiến độ chỉ vì tuần không có tiết TKB.
  - **Trường hợp D — Tuần có đúng 1 cơ hội bình thường VÀ hồ sơ là `CORE_PLUS_SPECIALIZED_STUDY`:**
    **DỪNG LẠI VÀ BÁO LỖI (FAIL-CLOSED)** với mã lỗi ngữ nghĩa:
    `PPCT_COMPONENT_WEEK_CAPACITY_INVALID`
    *Lý do:* Một tiết duy nhất không thể đại diện cho hai thành phần chương trình bắt buộc của lớp mà không làm thiên vị hoặc bỏ đói một thành phần. Tuyệt đối không tự ý fallback về `CORE` hoặc ép thành `SPECIALIZED_STUDY`.
  - **Trường hợp E — Gián đoạn lịch học, ngày nghỉ lễ, hủy tiết, hoạt động đặc biệt đè tiết:**
    Đối với các cơ hội thuộc `AcademicWeekSegment`, phân loại lập kế hoạch (planning classification) đi trước kết quả vận hành (operational suppression). Nếu tiết cuối tuần đã được định tuyến là `SPECIALIZED_STUDY` bị hủy hoặc nghỉ, tiết đó vẫn giữ nguyên định danh kế hoạch là chuyên đề (nhưng không tiêu thụ bài). Tiết `CORE` trước đó tuyệt đối không bị đôn lên làm chuyên đề. Bài chuyên đề đang chờ sẽ được tiêu thụ ở cơ hội chuyên đề tiếp theo.
  - **Trường hợp F — Chuyển giao TKB giữa tuần và Định danh Lịch học (Mid-Week Cutover & Calendar Identity):**
    Cho phép gom các cơ hội từ các phiên bản `TimetableVersion` khác nhau có hiệu lực theo ngày, VỚI ĐIỀU KIỆN toàn bộ các cơ hội giải quyết về CÙNG một `AcademicCalendarVersion` chính xác VÀ CÙNG một `AcademicWeek.id` chính xác.
    Nếu chuyển giao TKB làm thay đổi định danh lịch học hoặc định danh tuần học giữa tuần khiến các cơ hội bị phân tán sang các tuần lịch khác nhau:
    Hệ thống lập tức **FAIL-CLOSED** với mã lỗi chặn ngữ nghĩa:
    `PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`

### Câu hỏi 8: Quy tắc Dung lượng Tiết Tối thiểu và Tính Sẵn sàng
- **Quyết định:**
  1. Bảo toàn nguyên vẹn profile hiện hữu `NORMAL_BASE_PPCT_V1` cho các bộ kiểm tra và mục đích tương thích lịch sử.
  2. Thiết kế profile sẵn sàng mới có nhận thức thành phần: `NORMAL_BASE_PPCT_COMPONENT_V2` (do `P2-003` triển khai).
  3. Các chiều kích đánh giá của `NORMAL_BASE_PPCT_COMPONENT_V2`:
     - Quyền sở hữu `AcademicWeekSegment` chuẩn tắc;
     - Phiên bản PPCT và hồ sơ áp dụng giải quyết hợp lệ theo ngày dân sự;
     - Hồ sơ áp dụng đồng nhất trên toàn bộ các phân đoạn tuần, phát hiện lỗi `PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`;
     - Tính đồng nhất của lịch học tuần khi chuyển giao TKB, phát hiện lỗi `PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`;
     - Nếu hồ sơ là `CORE_PLUS_SPECIALIZED_STUDY`: phiên bản PPCT mục tiêu bắt buộc phải có ít nhất một mục `SPECIALIZED_STUDY`;
     - Dung lượng tuần: Nếu hồ sơ là `CORE_PLUS_SPECIALIZED_STUDY`, mỗi tuần học có cơ hội bình thường phải có tối thiểu 2 cơ hội (1 cơ hội sẽ báo FAIL); các cơ hội rơi vào khoảng gián đoạn lịch không được tính vào dung lượng;
     - Kiểm tra khả năng cạn kiệt hoặc lỗi phân bổ trong khoảng thời gian đánh giá.

### Câu hỏi 9: Ngữ nghĩa khi Cạn kiệt Thành phần
- **Quyết định:**
  1. Khi một cơ hội được định tuyến tới một thành phần (`CORE` hoặc `SPECIALIZED_STUDY`) nhưng thành phần đó không còn mục PPCT nào chưa phân bổ:
     **CHẶN LẠI VÀ BÁO LỖI (BLOCK)**.
  2. Giữ nguyên mã lỗi chuẩn tắc `PPCT_ALLOCATION_EXHAUSTED`, kèm theo ngữ cảnh thành phần cụ thể (`component: CORE` hoặc `component: SPECIALIZED_STUDY`). Không cần tạo mã lỗi riêng biệt để tránh phân mảnh mã lỗi.
  3. Tuyệt đối không:
     - Vay mượn bài từ thành phần kia;
     - Tự động chuyển đổi cơ hội chuyên đề thành cốt lõi hoặc ngược lại;
     - Quay vòng (wrap/restart) lại từ bài số 1;
     - Tái sử dụng bài học đã hoàn thành;
     - Tự ý sinh nội dung văn bản tự do.

### Câu hỏi 10: Chuyển dịch Phiên bản và Lineage Nội bộ Thành phần
- **Quyết định:**
  1. Khi phát hành phiên bản PPCT mới (`PpctVersion`), cả hai thành phần `CORE` và `SPECIALIZED_STUDY` đều có thể được cập nhật nội dung đồng thời.
  2. Tiến trình phát lại (replay) xử lý tính phả hệ (lineage) và trạng thái bao phủ (`DISTRIBUTION_COVERED_ITEMS`) độc lập hoàn toàn cho từng thành phần.
  3. **Kế thừa cùng UUID (CARRY_FORWARD) không tạo cạnh lineage:** Bài học giữ nguyên UUID (`CARRY_FORWARD`) qua các phiên bản sử dụng cùng một `PpctItem.id` bất biến, KHÔNG TẠO bản ghi trong `PpctItemLineage` và không khai báo cạnh tiền nhiệm. Tính liên tục của thành phần chương trình được đảm bảo tự động nhờ tính bất biến của `PpctItem.component`. Đột biến xuyên thành phần cho các bài carry-forward là bất khả thi ở tầng vật lý.
  4. `PpctItemLineage` chỉ đại diện cho các cạnh tiền nhiệm - kế nhiệm rõ ràng (tách `SPLIT 1 -> N`, gộp `MERGE N -> 1`) giữa các UUID bài học KHÁC NHAU (`predecessorVersionId != successorVersionId`, `predecessorItemId != successorItemId`).
  5. Tuyệt đối không có việc chuyển giao tín chỉ hoàn thành giữa hai thành phần.

### Câu hỏi 11: Quy định Cấm Lineage Vượt Thành phần Ràng buộc Cơ sở Dữ liệu
- **Quyết định:**
  1. **CẤM TUYỆT ĐỐI** mọi cạnh lineage vượt ranh giới thành phần (`CROSS-COMPONENT LINEAGE`).
  2. Bảng `PpctItemLineage` bổ sung một cột tọa độ thành phần:
     ```prisma
     component PpctCurricularComponent
     ```
  3. Cơ sở dữ liệu thiết lập composite FK kép:
     ```sql
     FOREIGN KEY (predecessor_version_id, predecessor_item_id, ppct_plan_id, component)
       REFERENCES ppct_item_revisions(ppct_version_id, ppct_item_id, ppct_plan_id, component)
       ON DELETE RESTRICT
       ON UPDATE RESTRICT

     FOREIGN KEY (successor_version_id, successor_item_id, ppct_plan_id, component)
       REFERENCES ppct_item_revisions(ppct_version_id, ppct_item_id, ppct_plan_id, component)
       ON DELETE RESTRICT
       ON UPDATE RESTRICT
     ```
     bảo đảm `predecessor.component == lineage.component == successor.component` ngay tại tầng lưu trữ vật lý. Tuyệt đối không sử dụng `ON UPDATE CASCADE`.
  4. Tiền nhiệm `CORE` không bao giờ được trỏ tới kế nhiệm `SPECIALIZED_STUDY`, và ngược lại.
  5. Nếu nhà trường di chuyển một chủ đề từ phần cốt lõi sang chuyên đề (hoặc ngược lại), mô hình nghiệp vụ bắt buộc phải thể hiện dưới dạng:
     - Bài học ở thành phần nguồn bị loại bỏ (`REMOVED`);
     - Bài học ở thành phần đích được tạo mới với UUID hoàn toàn mới (`NEW`);
     - Không có sự kế thừa quyền phân bổ hay tín chỉ hoàn thành giữa hai bài này.
  6. Vi phạm quy tắc này sẽ bị chặn tại cơ sở dữ liệu và control plane (`P2-002`) với mã lỗi ngữ nghĩa:
     `PPCT_COMPONENT_LINEAGE_CROSS_COMPONENT`

### Câu hỏi 12: Chiến lược Migration Dữ liệu PPCT Hiện hữu Bảo đảm Tương thích Ngược
- **Quyết định:**
  1. Toàn bộ dữ liệu PPCT hiện có trong cơ sở dữ liệu là đại diện cho mô hình cốt lõi truyền thống (CORE-only single-stream).
  2. Chiến lược migration (`P2-002`) thực hiện theo các bước chuyển tiếp an toàn (staged migration):
     - Bước 1: Tạo các kiểu enum `PpctCurricularComponent` và `PpctClassCurricularProfile`.
     - Bước 2: Thêm cột `component` (cho phép tạm thời NULL) vào `PpctItem`, `PpctItemRevision`, và `PpctItemLineage`.
     - Bước 3: Backfill toàn bộ các bản ghi `PpctItem`, `PpctItemRevision`, và `PpctItemLineage` hiện hữu sang giá trị `CORE`.
     - Bước 4: Thêm cột `curricularProfile` (cho phép tạm thời NULL) vào `PpctClassAssociation` và backfill toàn bộ sang `CORE_ONLY`.
     - Bước 5: Thiết lập ràng buộc `NOT NULL` cho các cột mới.
     - Bước 6: Thiết lập composite unique `(id, ppctPlanId, component)` trên `PpctItem`.
     - Bước 7: Thiết lập composite FK: `(ppctItemId, ppctPlanId, component)` từ revision tới item với `ON DELETE RESTRICT ON UPDATE RESTRICT`.
     - Bước 8: Bảo toàn các khóa duy nhất hiện hữu trên `PpctItemRevision` (`ppct_item_revisions_provenance_key`, `ppct_item_revisions_execution_provenance_key`, `[ppctVersionId, ppctItemId]`); thiết lập composite unique BỔ SUNG `(ppctVersionId, ppctItemId, ppctPlanId, component)` trên `PpctItemRevision`.
     - Bước 9: Thiết lập composite FK kép từ `PpctItemLineage` (cả tiền nhiệm và kế nhiệm kèm `ppctPlanId, component`) tới revision với `ON DELETE RESTRICT ON UPDATE RESTRICT`.
     - Bước 10: Xóa bỏ chỉ mục duy nhất cũ `@@unique([ppctVersionId, sequence])` và thay thế bằng `@@unique([ppctVersionId, component, sequence])`.
  3. Quá trình này không làm thay đổi UUID, không đổi tên bài học, không đổi số thứ tự, không sửa ngày hiệu lực và bảo toàn 100% dữ liệu lịch sử.
  4. Nhiệm vụ `P2-001` không tạo file migration; toàn bộ script SQL do `P2-002` thực hiện.

### Câu hỏi 13: Xác định Ngữ nghĩa Ánh xạ Dữ liệu Lịch sử
- **Quyết định:**
  - `PpctItem` hiện hữu -> `component = CORE`
  - `PpctItemRevision` hiện hữu -> `component = CORE`
  - `PpctItemLineage` hiện hữu -> `component = CORE`
  - `PpctClassAssociation` hiện hữu -> `curricularProfile = CORE_ONLY`
- Việc ánh xạ này làm rõ ngữ nghĩa thực tế vốn có của dữ liệu lịch sử mà không hồi tố hay viết lại bất kỳ bản ghi nào.

### Câu hỏi 14: Nguồn gốc Thành phần (Provenance) trong Thực thi, Dạy bù và Báo cáo
- **Quyết định:**
  1. Tuyệt đối không thêm cột `component` vào các bảng: `CurricularTeachingExecution`, `MakeupTeachingSchedule`, `TimetableEntry`, `TeachingAssignment`.
  2. Bằng chứng thực thi `CurricularTeachingExecution` ghim bản sửa đổi qua trường vật lý chuẩn tắc `ppctItemRevisionId` (và bộ 4 tọa độ `ppctItemRevisionId + ppctVersionId + ppctItemId + ppctPlanId` đối chiếu `PpctItemRevision(id, ppctVersionId, ppctItemId, ppctPlanId)`). Lịch dạy bù `MakeupTeachingSchedule` **HOÀN TOÀN KHÔNG** có trường `ppctItemRevisionId` và **KHÔNG** có `ppctRevisionId`; thực thể này ghim trực tiếp bản sửa đổi qua bộ 3 tọa độ `ppctVersionId + ppctItemId + ppctPlanId` đối chiếu `PpctItemRevision(ppctVersionId, ppctItemId, ppctPlanId)`. Do đó, thành phần chương trình được truy xuất tất định từ quan hệ PPCT tương ứng.
  3. Các mô hình đọc (read models) và DTO sẽ mở rộng để trả về các trường dẫn xuất:
     - `component`: `CORE` | `SPECIALIZED_STUDY`
     - `sequence`: số nguyên dương trong thành phần
     - `displaySequence`: chuỗi hiển thị chuẩn tắc (`"1"`, `"2"` đối với `CORE`; `"CD1"`, `"CD2"` đối với `SPECIALIZED_STUDY`).
  4. Dạy bù (`MAKEUP`) hoàn thành chính xác nghĩa vụ ban đầu bị lỡ, do đó kế thừa trọn vẹn thành phần của nghĩa vụ đó và không tiêu thụ mục PPCT mới.

### Câu hỏi 15: Ranh giới Giao dịch và Kiểm soát Đồng thời (Concurrency)
- **Quyết định:**
  1. Không sử dụng bảng con trỏ khả biến (persisted mutable cursor) trong cơ sở dữ liệu. Tiến trình tiến độ là trạng thái tính toán phát lại (replay state) tất định trong bộ nhớ.
  2. **Các luồng chỉ đọc (Read-only replay / projection / readiness):**
     - Mức độ cô lập: `RepeatableRead` hoặc mạnh hơn trong một transaction duy nhất;
     - Các resolver lồng nhau phải nhận `PrismaClient | PrismaTransaction` từ transaction cha, không tạo snapshot độc lập để tránh hiện tượng đọc không nhất quán.
  3. **Control Plane PPCT (Mutation / Publish / Associate):**
     - Mức độ cô lập: `Serializable`;
     - Sử dụng cơ chế CAS hiện có qua `updatedAt`;
     - Ràng buộc toàn vẹn cơ sở dữ liệu (composite unique, composite FK, GiST exclusion range).
  4. **Xác nhận Thực thi Giảng dạy (Teaching Execution Confirmation):**
     - Transaction bao ngoài mức `Serializable`;
     - Tái sử dụng allocator có nhận thức thành phần cùng transaction;
     - Chống TOCTOU: phân bổ và ghi nhận thực thi thực hiện nguyên tử trong cùng một transaction.

---

## 6. Các Ví dụ Kiến trúc Điển hình (Worked Examples)

### Ví dụ A — Lớp 10A5 Môn Địa lí, có học Chuyên đề
- **Cấu hình thời khóa biểu tuần:**
  - Thứ Hai, Tiết 2: Địa lí (`candidate 1`, thuộc `AcademicWeekSegment`)
  - Thứ Tư, Tiết 3: Địa lí (`candidate 2`, thuộc `AcademicWeekSegment`)
  - Thứ Sáu, Tiết 4: Địa lí (`candidate 3`, thuộc `AcademicWeekSegment`)
- **Hồ sơ liên kết:** `curricularProfile = CORE_PLUS_SPECIALIZED_STUDY`
- **Định tuyến cơ hội:**
  - Thứ Hai Tiết 2 -> `CORE` (tiêu thụ `CORE sequence 1`)
  - Thứ Tư Tiết 3 -> `CORE` (tiêu thụ `CORE sequence 2`)
  - Thứ Sáu Tiết 4 (cuối tuần) -> `SPECIALIZED_STUDY` (tiêu thụ `SPECIALIZED_STUDY sequence 1`, hiển thị `"CD1"`)
- **Tiến độ:** Hai con trỏ tiến độ hoạt động độc lập.

### Ví dụ B — Lớp 10A6 Môn Địa lí, không học Chuyên đề
- **Cấu hình thời khóa biểu tuần:** Giống 10A5 (Thứ Hai, Thứ Tư, Thứ Sáu).
- **Hồ sơ liên kết:** `curricularProfile = CORE_ONLY`
- **Định tuyến cơ hội:**
  - Toàn bộ các tiết Thứ Hai, Thứ Tư, Thứ Sáu đều định tuyến cho `CORE` (lần lượt tiêu thụ `CORE sequence 1, 2, 3`).
- **Xử lý chuyên đề:** Toàn bộ các bài chuyên đề trong phiên bản PPCT đều có trạng thái `NOT_APPLICABLE` đối với lớp 10A6 (không bị coi là thiếu tiết, không trễ hạn, không bao giờ tạo nợ).

### Ví dụ C — Cơ hội Chuyên đề Cuối tuần chịu Biến động Vận hành (Operational Suppression)
- **Kịch bản:** Tiếp nối Ví dụ A (10A5). Cả Thứ Hai, Thứ Tư, Thứ Sáu đều thuộc `AcademicWeekSegment` hợp lệ của tuần. Thứ Sáu sau đó chịu một sự kiện vận hành trong tuần (`CalendarException` hoặc hủy tiết được duyệt `AUTHORIZED_CANCELLATION`).
- **Hành vi hệ thống:**
  - Tiết Thứ Hai (CORE) tiêu thụ `CORE 1`.
  - Tiết Thứ Tư (CORE) tiêu thụ `CORE 2`.
  - Tiết Thứ Sáu vẫn giữ nguyên phân loại lập kế hoạch là `SPECIALIZED_STUDY`. Do biến động vận hành, cơ hội này không diễn ra và tiêu thụ 0 bài PPCT.
  - Tiết Thứ Tư tuyệt đối không bị đôn lên làm chuyên đề.
  - Sang tuần học tiếp theo, bài `SPECIALIZED_STUDY sequence 1` vẫn đang chờ và sẽ được phân bổ cho cơ hội chuyên đề của tuần tiếp theo.
  - *(Ghi chú: Tiết rơi vào khoảng trống gián đoạn `CalendarInterruption` không có `AcademicWeekSegment` sở hữu hoàn toàn nằm ngoài định tuyến tuần, xem chi tiết tại Ví dụ G).*

### Ví dụ D — Tuần Dị thường Chỉ có Đúng 1 Cơ hội
- **Kịch bản:** Tuần khai giảng hoặc tuần gián đoạn chỉ xếp đúng 1 tiết Địa lí vào Thứ Ba cho lớp 10A5 (`CORE_PLUS_SPECIALIZED_STUDY`).
- **Hành vi hệ thống:**
  - Hệ thống **DỪNG LẠI VÀ BÁO LỖI (FAIL-CLOSED)** với mã lỗi `PPCT_COMPONENT_WEEK_CAPACITY_INVALID`.
  - Không tự ý phân bổ tiết này cho `CORE` (vì sẽ bỏ đói chuyên đề), cũng không tự ý gán cho `SPECIALIZED_STUDY` (vì làm lệch tỷ trọng cốt lõi).

### Ví dụ E — Chuyển dịch Phiên bản PPCT (Version Transition)
- **Phiên bản V1:** `CORE` có các bài 1, 2; `SPECIALIZED_STUDY` có bài 1. Lớp đã học xong cả 3 bài này.
- **Phiên bản V2 công bố:**
  - `CORE`: Bài 1 được giữ nguyên (`CARRY_FORWARD`), Bài 2 được tách thành Bài 2a và Bài 2b (`SPLIT`).
  - `SPECIALIZED_STUDY`: Bài 1 giữ nguyên (`CARRY_FORWARD`), bổ sung thêm Bài 2 mới (`NEW`).
- **Hành vi phát lại:**
  - `CORE`: Nhận diện Bài 1 đã hoàn thành; Bài 2 cũ đã hoàn thành nên Bài 2a và 2b được xử lý kế thừa lineage theo đúng quy tắc phả hệ cốt lõi.
  - `SPECIALIZED_STUDY`: Nhận diện Bài 1 đã hoàn thành; Bài 2 mới chưa hoàn thành và sẽ được tiêu thụ ở cơ hội chuyên đề kế tiếp.
  - Cả hai thành phần tiến hành độc lập hoàn toàn.

### Ví dụ F — Cấm Tuyệt đối Lineage Vượt Thành phần
- **Kịch bản:** Quản trị viên cố tình tạo bản nháp mới trỏ lineage từ một bài tiền nhiệm `CORE` sang một bài kế nhiệm `SPECIALIZED_STUDY`.
- **Hành vi hệ thống:**
  - Bị từ chối tại cơ sở dữ liệu (composite FK) và control plane với mã lỗi `PPCT_COMPONENT_LINEAGE_CROSS_COMPONENT`.

### Ví dụ G — Tuần học có Phân đoạn Ngắt quãng (Non-contiguous Week Segments)
- **Kịch bản:** Tuần 5 có 2 phân đoạn: `5a` (Thứ Hai, Thứ Ba) và `5b` (Thứ Sáu, Thứ Bảy), phân tách bởi khoảng gián đoạn lễ giữa tuần (Thứ Tư, Thứ Năm).
- **Hành vi hệ thống:**
  - Cơ hội bình thường: T2 (5a), T3 (5a), T6 (5b).
  - Tiết TKB Thứ Năm rơi vào ngày lễ nằm trong khoảng gián đoạn không có `AcademicWeekSegment`: không tham gia định tuyến, không tiêu thụ bài, không tạo nợ.
  - Hợp cơ hội của Tuần 5 gồm: T2, T3, T6.
  - Định tuyến: T2 -> CORE, T3 -> CORE, T6 (cuối hợp phân đoạn) -> SPECIALIZED_STUDY.

### Ví dụ H — Chuyển giao TKB Giữa tuần Gây Phân mảnh Lịch học
- **Kịch bản:** Giữa tuần học, phiên bản TKB mới có hiệu lực nhưng trỏ sang một `AcademicCalendarVersion` khác hoặc `AcademicWeek.id` khác.
- **Hành vi hệ thống:**
  - Hệ thống từ chối gom nhóm và **FAIL-CLOSED** với mã lỗi `PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`.

---

## 7. Phân định Trách nhiệm Bàn giao Hạ nguồn (Downstream Ownership)

Kiến trúc `P2-001` xác lập ranh giới bàn giao rõ ràng cho các nhiệm vụ tiếp theo:

1. **`P2-002` (PPCT Component Persistence + Control Plane Realignment):**
   - Tạo migration Prisma: enum, mở rộng bảng, backfill dữ liệu lịch sử sang `CORE` và `CORE_ONLY`, thiết lập composite FKs và chỉ mục duy nhất `(ppctVersionId, component, sequence)`.
   - Cập nhật control plane: DTO soạn thảo bản nháp mang thuộc tính `component`, kiểm tra tính hợp lệ khi xuất bản (phải có ít nhất 1 bài CORE), cấm lineage vượt thành phần qua DB constraints, quản lý `curricularProfile` trên liên kết lớp.
2. **`P2-003` (Component-Aware PPCT Allocation & Curricular Projections):**
   - Triển khai thuật toán định tuyến tuần cho `PPCT_OCCURRENCE_ALLOCATION_V2` trên `AcademicWeekSegment`.
   - Triển khai hai con trỏ tiến độ độc lập trong bộ nhớ.
   - Triển khai profile sẵn sàng `NORMAL_BASE_PPCT_COMPONENT_V2`, phát hiện `PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`.
   - Cập nhật phóng chiếu nợ tiến độ `TEACHING_PROGRESS_DEBT_V2` và báo cáo tổng hợp.
3. **`P2-004` (Specialized-Study Class-Subject Administration Workspace):**
   - Giao diện UI có thẩm quyền quản lý cấu hình `curricularProfile` cho từng lớp-môn.
   - Cảnh báo người dùng thiết lập mốc thay đổi tại ranh giới tuần học để tránh lỗi phân tách tuần.
4. **`P2-010` (PPCT Real-Workbook Contract/Security Audit):**
   - Duy trì `BLOCKED_EVIDENCE` cho đến khi có file Excel mẫu thực tế từ nhà trường.
   - Kiểm tra tên sheet vật lý, cấu trúc cột và ánh xạ vào các thành phần logic `CORE` và `SPECIALIZED_STUDY`.
5. **`P2-020` (PPCT Native Importer Implementation):**
   - Triển khai importer dựa trên hợp đồng đã duyệt từ `P2-010` và nền tảng bao gói một phiên bản từ `P2-002`.
6. **`P1-030` (Delayed Go-Live Architecture):**
   - Kế thừa kiến trúc thành phần để xác lập mốc bắt đầu vận hành và quy tắc không tự sinh nợ lịch sử.
7. **`P4-010` (GDĐP / HĐTN-HN Programme Architecture Closure):**
   - Tiếp tục giữ trạng thái độc lập `READY` (không phụ thuộc vào chuỗi thành phần môn học P2).

---

## 8. Kết luận Bắt buộc: Không Cho phép Triển khai Sớm

Tài liệu này là báo cáo kiểm tra và thiết kế kiến trúc chuẩn tắc.
Tài liệu này **TUYỆT ĐỐI KHÔNG CHO PHÉP** thực hiện bất kỳ thay đổi nào trong:
- `apps/` (NestJS API, React web);
- `packages/` (contracts, config);
- `prisma/` (schema, migrations);
- `.github/` (CI/CD workflows);
- `deploy/` hoặc `scripts/`;
- Cơ sở dữ liệu hoặc tiến trình đang chạy trên môi trường production.

Mọi triển khai vật lý bắt buộc phải tuân theo lộ trình tuần tự: `P2-001` được review và đóng chính thức qua `SYNC-P2-001` -> `P2-002` bắt đầu triển khai schema và control plane.
