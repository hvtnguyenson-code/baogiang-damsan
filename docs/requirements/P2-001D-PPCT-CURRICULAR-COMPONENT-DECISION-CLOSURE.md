# P2-001D — Đóng Quyết định Kiến trúc: Phân định Thành phần Chương trình PPCT (Curricular-Component Decision Closure)

- **Mã nhiệm vụ (Task ID):** `P2-001` / `P2-001D`
- **Trạng thái:** Proposed Decision Closure (Chờ kiểm duyệt độc lập và hợp nhất)
- **Ngày xác lập:** 2026-09-09
- **Truy xuất nguồn gốc (Traceability):** `T45`, `T46`
- **Tài liệu kiểm tra căn cứ:** `docs/requirements/P2-001-PPCT-CURRICULAR-COMPONENT-ARCHITECTURE-AUDIT.md`
- **ADR đề xuất:** `docs/decisions/ADR-048-PPCT-CURRICULAR-COMPONENT-ARCHITECTURE.md`
- **Phạm vi thẩm quyền:** Strictly Docs & Architecture Only. Bộ quyết định chuẩn tắc này đóng vai trò là kim chỉ nam kỹ thuật bắt buộc cho các agent triển khai hạ nguồn (`P2-002`, `P2-003`, `P2-004`).

---

## 1. Mô hình Thực thể và Định danh Thành phần Chương trình

1. **Enum Thành phần:** Bổ sung enum `PpctCurricularComponent` trong Prisma schema:
   ```prisma
   enum PpctCurricularComponent {
     CORE
     SPECIALIZED_STUDY
   }
   ```
2. **Quyền sở hữu Thành phần Bất biến:**
   - `PpctItem` sở hữu trực tiếp thuộc tính `component: PpctCurricularComponent` gắn với `ppctPlanId`.
   - Một khi UUID ổn định của `PpctItem` đã được gán cho một thành phần (`CORE` hoặc `SPECIALIZED_STUDY`), thuộc tính này là **BẤT BIẾN (IMMUTABLE)** và không bao giờ được phép thay đổi qua các phiên bản.
   - `PpctItem` phơi bày tọa độ duy nhất phức hợp:
     ```prisma
     @@unique([id, ppctPlanId, component], map: "ppct_items_identity_component_key")
     ```
3. **Tọa độ Quan hệ Bản sao trên Revision và Khóa ngoại Phức hợp:**
   - `PpctItemRevision` mang trường `component` như một tọa độ quan hệ bản sao.
   - Tầng cơ sở dữ liệu (`P2-002`) bắt buộc thiết lập composite foreign key:
     ```sql
     FOREIGN KEY (ppct_item_id, ppct_plan_id, component)
       REFERENCES ppct_items(id, ppct_plan_id, component)
     ```
     chứng minh đồng thời: đúng bài học ổn định, đúng kế hoạch môn học, và đúng thành phần bất biến (`revision.component == item.component`), loại trừ hoàn toàn rủi ro trôi lệch thành phần.
   - `PpctItemRevision` phơi bày tọa độ duy nhất phức hợp:
     ```prisma
     @@unique([ppctVersionId, ppctItemId, ppctPlanId, component], map: "ppct_item_revisions_provenance_component_key")
     ```
4. **Bảo tồn Kế hoạch Khung Dùng chung:**
   - Giữ nguyên thực thể `PpctPlan = AcademicYear + Subject + GradeLevel` (`academicYearId, subjectId, gradeLevel`).
   - `SPECIALIZED_STUDY` là một thành phần chương trình (curricular component) của CÙNG một môn học thông thường (the SAME ordinary Subject). Nó không phải là một môn học riêng biệt (`Subject`), không phải hoạt động đặc biệt (`SpecialActivity`), không phải `GDĐP`, và không phải `HĐTN-HN`.
   - Tuyệt đối không tạo `PpctComponentPlan`, không phân tách danh mục `Subject`, và không đưa thành phần vào `TimetableEntry` hay `TeachingAssignment`.

---

## 2. Quy tắc Không gian Số thứ tự (Sequence Contract)

1. **Ràng buộc Duy nhất Mới:**
   Thay thế `@@unique([ppctVersionId, sequence])` bằng:
   ```prisma
   @@unique([ppctVersionId, component, sequence], map: "ppct_item_revisions_version_component_sequence_key")
   ```
2. **Bản chất của Sequence:**
   - Là số nguyên dương (`1, 2, 3...`), đại diện cho thứ tự phân bổ nội bộ trong thành phần đó, không phải định danh kỹ thuật.
   - Độc lập giữa các thành phần (cả `CORE` và `SPECIALIZED_STUDY` đều có sequence bắt đầu từ 1).
3. **Quy tắc Lưu trữ và Trình diễn:**
   - Tuyệt đối không lưu chuỗi `"CD1"`, `"CD2"` vào cơ sở dữ liệu.
   - Chuỗi tiền tố `"CD"` là quy ước tầng hiển thị:
     - `CORE` sequence `1` -> hiển thị `"1"`
     - `SPECIALIZED_STUDY` sequence `1` -> hiển thị `"CD1"`

---

## 3. Bao gói Phiên bản PPCT Duy nhất (Unified Version Package)

1. **Một Vòng đời Phiên bản Duy nhất:**
   - Mỗi `PpctPlan` có một chuỗi phiên bản duy nhất với vòng đời `DRAFT -> PUBLISHED -> SUPERSEDED`.
   - Một bản ghi `PpctVersion` là gói chương trình nguyên tử (atomic package) chứa toàn bộ các bài `CORE` và các bài `SPECIALIZED_STUDY` (nếu có).
   - Việc xuất bản (`PUBLISH`) diễn ra nguyên tử cho toàn bộ gói.
2. **Quy chuẩn Tính Hợp lệ của Phiên bản:**
   - Một phiên bản muốn xuất bản **BẮT BUỘC** phải có ít nhất một bài `CORE`.
   - Thành phần `SPECIALIZED_STUDY` là tùy chọn (có thể có 0 bài nếu môn/khối đó không có chuyên đề). Không cần cờ boolean "môn hỗ trợ chuyên đề"; tính sẵn sàng của chuyên đề suy diễn trực tiếp từ sự tồn tại của các bài `SPECIALIZED_STUDY` trong phiên bản.
3. **Độc lập với Cấu trúc File Nguồn:**
   - Cho dù nguồn nhập từ nhà trường là một workbook có 2 sheet hay hai file tách biệt, chúng đều được hợp thành một bản nháp duy nhất trước khi xuất bản.

---

## 4. Hồ sơ Áp dụng theo Lớp-Môn (Class-Subject Applicability Profile)

1. **Enum Hồ sơ Áp dụng:**
   ```prisma
   enum PpctClassCurricularProfile {
     CORE_ONLY
     CORE_PLUS_SPECIALIZED_STUDY
   }
   ```
2. **Vị trí Lưu trữ:**
   - Trường `curricularProfile` thuộc bảng `PpctClassAssociation`.
   - Là dữ liệu nghiệp vụ chính thức do quản trị viên thiết lập. Tuyệt đối không suy diễn tự động từ số tiết TKB, tên lớp, mã môn hay thuật toán phỏng đoán.
3. **Ngữ nghĩa Áp dụng:**
   - `CORE_ONLY`: Áp dụng `CORE`; các bài `SPECIALIZED_STUDY` có trạng thái `NOT_APPLICABLE` (không nợ, không thiếu tiết, không trễ).
   - `CORE_PLUS_SPECIALIZED_STUDY`: Áp dụng cả hai; phiên bản PPCT được liên kết bắt buộc phải có ít nhất một bài `SPECIALIZED_STUDY`.

---

## 5. Hiệu lực Khoảng ngày và Quy tắc Biên Phân đoạn Tuần học (AcademicWeekSegment)

1. **Một Bảng Liên kết Duy nhất:**
   - `PpctClassAssociation` tiếp tục là bảng duy nhất quản lý liên kết phiên bản và hồ sơ áp dụng qua các trường ngày chuẩn tắc `effectiveFrom: DateTime @db.Date` và `effectiveUntil: DateTime? @db.Date`.
   - Cơ sở dữ liệu duy trì bảo vệ toàn vẹn lịch sử không chồng lấn bằng PostgreSQL daterange / GiST exclusion backstop:
     `daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)')`
     cho cùng một luồng `(academic_year_id, school_class_id, subject_id)`. Không tạo bảng riêng cho chuyên đề và không có trường vật lý tên `effectiveRange`.
2. **Đối soát Cấu trúc Tuần học Lịch học (AcademicWeek vs AcademicWeekSegment):**
   - Theo chuẩn `ADR-010` và `ADR-011`, `AcademicWeek` là định danh tuần nghiệp vụ được lưu trữ; bản thân nó không có khoảng ngày dân sự liên tục.
   - Khoảng ngày dân sự thực tế thuộc về thực thể `AcademicWeekSegment`. Một `AcademicWeek` có thể chứa nhiều phân đoạn không liên tục (ví dụ: phân đoạn 5a và 5b, cách nhau bởi khoảng trống gián đoạn `CalendarInterruption`).
3. **Đồng nhất trên Hợp các Phân đoạn Tuần:**
   - Hồ sơ `curricularProfile` bắt buộc phải giữ nguyên một giá trị duy nhất trên HỢP khoảng ngày của toàn bộ các `AcademicWeekSegment` thuộc về cùng một `AcademicWeek` chuẩn tắc.
4. **Chặn Lỗi Phân tách Tuần (Fail-Closed):**
   - Nếu dữ liệu liên kết tạo ra sự thay đổi `curricularProfile` giữa các phân đoạn hoặc trong khoảng gián đoạn của cùng một tuần học:
     Hệ thống lập tức **DỪNG LẠI VÀ BÁO LỖI (FAIL-CLOSED)** với mã lỗi:
     `PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`
   - Quản trị viên chỉ được áp dụng thay đổi hồ sơ tại điểm ranh giới chuẩn tắc giữa hai tuần học.

---

## 6. Thuật toán Định tuyến Cơ hội Hàng tuần (Weekly Routing Algorithm)

1. **Tập Ứng viên Chuẩn tắc:**
   - Được xác định theo bộ khóa: `AcademicYear + SchoolClass + Subject + exact AcademicCalendarVersion + exact AcademicWeek.id`.
   - Tuyệt đối không dùng số tuần ISO, giờ máy chủ hay khoảng cách ngày làm định danh.
   - Cơ hội TKB bình thường (`NORMAL_TIMETABLE_OPPORTUNITY`) chỉ thuộc về tập định tuyến tuần khi và chỉ khi `civilDate` của nó nằm trong đúng một `AcademicWeekSegment` thuộc `AcademicCalendarVersion` có hiệu lực.
2. **Thứ tự Sắp xếp Tất định:**
   - 1. `civilDate` tăng dần;
   - 2. `TimeSlotDefinition.startTime` tăng dần;
   - 3. `TimeSlotDefinition.endTime` tăng dần;
   - 4. `NORMAL:<timetableEntryId>:<civilDate>` tăng dần (chuỗi phân xử hòa ổn định).
3. **Quy tắc Gán Thành phần Lập kế hoạch:**
   - Đối với `CORE_ONLY`: 100% cơ hội định tuyến vào `CORE`.
   - Đối với `CORE_PLUS_SPECIALIZED_STUDY`: Cơ hội bình thường cuối cùng định tuyến vào `SPECIALIZED_STUDY`; toàn bộ các cơ hội đứng trước định tuyến vào `CORE`.

---

## 7. Quy tắc Tuần Dị thường, Gián đoạn Lịch và Phân loại Kế hoạch vs. Vận hành

1. **Ngữ nghĩa Khoảng trống Gián đoạn Lịch học (CalendarInterruption Gap):**
   - Cơ hội TKB cấu trúc có ngày dân sự rơi vào khoảng gián đoạn lịch học (không thuộc `AcademicWeekSegment` nào):
     - Quan sát được ở mức cấu trúc phục vụ chẩn đoán/truy vết;
     - Nằm NGOÀI tập định tuyến thành phần tuần học;
     - Không nhận nghĩa vụ phân bổ `CORE` hay `SPECIALIZED_STUDY`, không tiêu thụ bài PPCT, không sinh nợ tiến độ;
     - Không tham gia vào việc lựa chọn cơ hội cuối cùng của tuần.
     *(Sự vắng mặt quyền sở hữu tuần học, không phải phân loại lại vận hành).*
2. **Bất biến Lập kế hoạch vs. Vận hành:**
   - Đối với các cơ hội thuộc `AcademicWeekSegment`, định tuyến thành phần là phân loại lập kế hoạch (planning semantics), được xác lập trước khi áp dụng các kết quả vận hành.
   - Các sự kiện vận hành (`CalendarException`, `SpecialActivity` chiếm tiết, hủy tiết được duyệt, dạy thay, vắng mặt) **KHÔNG BAO GIỜ** làm thay đổi thành phần kế hoạch của cơ hội.
   - Nếu cơ hội chuyên đề cuối tuần bị hủy hoặc nghỉ, nó vẫn giữ nguyên định danh là chuyên đề (nhưng không tiêu thụ bài). Cơ hội cốt lõi trước đó tuyệt đối không bị đôn lên làm chuyên đề.
3. **Phân đoạn Tuần không Liên tục (Non-contiguous Week Segments):**
   - Tuần có nhiều phân đoạn (5a, 5b) gom chung cơ hội của tất cả các phân đoạn thuộc tuần. Cơ hội cuối cùng của hợp phân đoạn là chuyên đề.
4. **Tuần có 0 cơ hội:** Không định tuyến, không phân bổ, không tạo cơ hội giả tạo, không tiêu thụ PPCT, không tạo nợ.
5. **Tuần có đúng 1 cơ hội đối với lớp `CORE_PLUS_SPECIALIZED_STUDY`:**
   - **FAIL-CLOSED** với mã lỗi ngữ nghĩa:
     `PPCT_COMPONENT_WEEK_CAPACITY_INVALID`
   - Tuyệt đối không tự ý fallback về `CORE` hay ép sang `SPECIALIZED_STUDY`.
6. **Chuyển giao TKB Giữa tuần & Định danh Lịch (Mid-Week Cutover + Calendar Identity):**
   - Cơ hội từ các phiên bản `TimetableVersion` khác nhau có thể gom vào cùng một tuần NẾU giải quyết về CÙNG một `AcademicCalendarVersion` và CÙNG một `AcademicWeek.id`.
   - Nếu chuyển giao TKB làm thay đổi lịch học hoặc tuần học giữa tuần:
     Hệ thống **FAIL-CLOSED** với mã lỗi chặn ngữ nghĩa:
     `PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`

---

## 8. Mô hình Sẵn sàng Nhận thức Thành phần (Component-Aware Readiness)

1. **Bảo tồn Profile Lịch sử:** Giữ nguyên `NORMAL_BASE_PPCT_V1` cho các luồng tương thích cũ.
2. **Profile Chuẩn tắc Mới:** `NORMAL_BASE_PPCT_COMPONENT_V2` (do `P2-003` triển khai):
   - Đánh giá quyền sở hữu `AcademicWeekSegment` chuẩn tắc.
   - Đánh giá tính hợp lệ của liên kết PPCT và `curricularProfile`.
   - Phát hiện lỗi phân tách tuần (`PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`).
   - Phát hiện lỗi phân mảnh lịch học khi chuyển giao TKB (`PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`).
   - Đánh giá phiên bản có đủ bài chuyên đề hay không nếu lớp bật chuyên đề.
   - Đánh giá dung lượng tuần: lớp bật chuyên đề bắt buộc phải có ít nhất 2 cơ hội trong mỗi tuần có tiết (loại trừ các tiết trong khoảng gián đoạn lịch).
   - Đánh giá nguy cơ cạn kiệt phân bổ.

---

## 9. Tiến trình Độc lập và Hành vi Cạn kiệt (Progression & Exhaustion)

1. **Tiến trình Độc lập:**
   - `CORE` và `SPECIALIZED_STUDY` duy trì trạng thái phân bổ và danh sách nghĩa vụ đã bao phủ độc lập trong bộ nhớ khi phát lại (`DIRECT_DISTRIBUTION_OBLIGATIONS`, `DISTRIBUTION_COVERED_ITEMS`).
   - Tiết thiếu của `CORE` không làm dịch chuyển tiến độ của `SPECIALIZED_STUDY`, và ngược lại.
2. **Xử lý Cạn kiệt:**
   - Nếu cơ hội định tuyến tới một thành phần đã hết bài chưa dạy: **CHẶN VÀ BÁO LỖI** với mã lỗi `PPCT_ALLOCATION_EXHAUSTED` kèm ngữ cảnh thành phần.
   - Tuyệt đối không vay mượn bài, không chuyển đổi thành phần, không quay vòng, không sinh nội dung giả mạo.

---

## 10. Hợp đồng Phả hệ Bài học Ràng buộc Cơ sở Dữ liệu (Database-Backed Lineage Contract)

1. **Cấm Tuyệt đối Lineage Vượt Thành phần:**
   - Bảng `PpctItemLineage` bổ sung cột tọa độ thành phần: `component: PpctCurricularComponent`.
   - Cả hai nhánh quan hệ tiền nhiệm và kế nhiệm trong cơ sở dữ liệu đều bao gồm tọa độ thành phần:
     ```sql
     FOREIGN KEY (predecessor_version_id, predecessor_item_id, ppct_plan_id, component)
       REFERENCES ppct_item_revisions(ppct_version_id, ppct_item_id, ppct_plan_id, component)

     FOREIGN KEY (successor_version_id, successor_item_id, ppct_plan_id, component)
       REFERENCES ppct_item_revisions(ppct_version_id, ppct_item_id, ppct_plan_id, component)
     ```
   - Ràng buộc quan hệ cơ sở dữ liệu bảo đảm: `predecessor.component == lineage.component == successor.component`.
   - Vi phạm sẽ bị từ chối đồng thời tại tầng cơ sở dữ liệu và tầng control plane với mã lỗi ngữ nghĩa:
     `PPCT_COMPONENT_LINEAGE_CROSS_COMPONENT`
2. **Xử lý Di chuyển Chủ đề:**
   - Nếu chuyển nội dung giữa các thành phần: Xóa bài ở thành phần cũ và Tạo mới hoàn toàn (UUID mới) ở thành phần mới. Không kế thừa quyền phân bổ.
3. **Bảo tồn Topology:** Giữ nguyên 6 model PPCT.

---

## 11. Ánh xạ Dữ liệu Lịch sử và Ràng buộc Cơ sở Dữ liệu Mục tiêu

1. **Ánh xạ Tương thích Ngược:**
   - Toàn bộ `PpctItem` hiện hữu -> `component = CORE`
   - Toàn bộ `PpctItemRevision` hiện hữu -> `component = CORE`
   - Toàn bộ `PpctItemLineage` hiện hữu -> `component = CORE`
   - Toàn bộ `PpctClassAssociation` hiện hữu -> `curricularProfile = CORE_ONLY`
   - Không thay đổi UUID, sequence, title, hoặc khoảng ngày hiệu lực.
2. **Mục tiêu Ràng buộc DB của P2-002:**
   - Cột `component` và `curricularProfile` là `NOT NULL`.
   - Composite FK bảo vệ `revision -> item`: `FOREIGN KEY (ppctItemId, ppctPlanId, component) REFERENCES PpctItem(id, ppctPlanId, component)`.
   - Composite FK bảo vệ `lineage -> revision` bảo toàn thành phần.
   - Khóa duy nhất: `@@unique([ppctVersionId, component, sequence])`.
   - Tối đa một phiên bản `PUBLISHED` cho mỗi kế hoạch.
   - Giữ nguyên `ON DELETE RESTRICT` cho toàn bộ lịch sử.

---

## 12. Nguồn gốc Thực thi, Dạy bù, Báo cáo và Kiểm soát Đồng thời

1. **Nguồn gốc Dẫn xuất (Derived Provenance):**
   - Không thêm cột `component` vào `CurricularTeachingExecution`, `MakeupTeachingSchedule`, `TimetableEntry`, `TeachingAssignment`.
   - Nguồn gốc thành phần được truy xuất tất định từ `PpctItem` / `PpctItemRevision` được ghim trong bằng chứng thực thi.
   - DTO trả về: `component`, `sequence`, `displaySequence` (ví dụ: `"1"` hoặc `"CD1"`).
   - Dạy bù (`MAKEUP`) kế thừa trọn vẹn thành phần của nghĩa vụ ban đầu bị lỡ.
2. **Tổng hợp Báo cáo:**
   - Báo cáo môn học thông thường cộng gộp số tiết của cả `CORE` và `SPECIALIZED_STUDY`. Bảng chi tiết hiển thị rõ thành phần.
3. **Kiểm soát Đồng thời (Concurrency):**
   - Không dùng bảng khóa con trỏ. Phát lại tiến độ là tính toán tất định trong bộ nhớ.
   - Luồng đọc: `RepeatableRead` trong cùng transaction cha cho toàn bộ chuỗi resolver.
   - Control plane & Xác nhận thực thi: `Serializable` + CAS token + kiểm tra phân bổ cùng transaction (chống TOCTOU).

---

## 13. Phân định Trách nhiệm Bàn giao

- **`P2-002`**: Chịu trách nhiệm triển khai schema migration, composite constraints, component trên lineage, control plane soạn thảo bản nháp, xuất bản nguyên tử và quản lý `curricularProfile` trên liên kết lớp.
- **`P2-003`**: Chịu trách nhiệm triển khai runtime định tuyến tuần, hai con trỏ tiến độ độc lập, profile sẵn sàng `V2`, phát hiện `PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`, và chiếu nợ tiến độ.
- **`P2-004`**: Chịu trách nhiệm triển khai giao diện quản trị cấu hình áp dụng theo lớp-môn.
- **`P2-010`**: Chịu trách nhiệm kiểm tra cấu trúc file Excel PPCT thực tế từ nhà trường khi trigger firing.
- **`P2-020`**: Chịu trách nhiệm triển khai native importer dựa trên hợp đồng `P2-010` và schema `P2-002`.
