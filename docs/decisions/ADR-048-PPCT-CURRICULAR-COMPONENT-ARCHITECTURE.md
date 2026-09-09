# ADR-048 — Kiến trúc Phân định Thành phần Chương trình PPCT (PPCT Curricular-Component Architecture)

- **Trạng thái:** Proposed
- **Ngày:** 2026-09-09
- **Phạm vi:** `P2-001` / `T45` / `T46`
- **Tài liệu kiểm tra nguồn:** `docs/requirements/P2-001-PPCT-CURRICULAR-COMPONENT-ARCHITECTURE-AUDIT.md`
- **Tài liệu đóng quyết định:** `docs/requirements/P2-001D-PPCT-CURRICULAR-COMPONENT-DECISION-CLOSURE.md`
- **Thẩm quyền thay thế:** Thay thế chuẩn tắc cho các điều khoản đã được mở lại (reopened clauses) của `ADR-027`, `ADR-028`, `ADR-029`, `ADR-030`, `ADR-037`, `ADR-040`. Quyết định này **KHÔNG** thay thế các điều khoản lịch sử không bị ảnh hưởng của các ADR trên.

---

## 1. Bối cảnh (Context)

Theo quyết định thẩm quyền bằng văn bản ngày 2026-09-08 của Product Owner ghi nhận trong `P0-900` và `PRE-PILOT-PRODUCT-BASELINE.md` (§4.13), mô hình phân phối chương trình (PPCT) cho môn học thông thường trong Chương trình GDPT 2018 tại trường THPT bao gồm hai thành phần chương trình phân biệt:
1. `CORE` (Nội dung cốt lõi / cơ bản);
2. `SPECIALIZED_STUDY` (Chuyên đề học tập).

Thẩm quyền mới này trực tiếp thay thế giả định trước đây tại `ADR-027`, `ADR-028`, `ADR-037` rằng một luồng lớp-môn chỉ bao gồm một tiến trình đơn tuyến duy nhất tiêu thụ một danh sách bài học có số thứ tự liên tục trên toàn phiên bản.

Tuy nhiên, các ranh giới kiến trúc bất biến sau đây tiếp tục được bảo toàn:
- `SPECIALIZED_STUDY` là một thành phần chương trình (curricular component) của CÙNG một môn học thông thường (the SAME ordinary Subject). Nó không phải là một môn học riêng biệt (separate Subject), không phải hoạt động đặc biệt (`SpecialActivity`), không phải Giáo dục địa phương (`GDĐP`), và không phải Hoạt động trải nghiệm, hướng nghiệp (`HĐTN-HN`).
- Phân công giảng dạy (`TeachingAssignment`) quản lý theo lớp-môn (`AcademicYear + SchoolClass + Subject + User`); giáo viên được phân công chịu trách nhiệm giảng dạy cả hai thành phần. `TeachingAssignment` không mang trường thành phần.
- Thời khóa biểu gốc (`TimetableEntry`) xếp tiết cho môn học nói chung, không phân loại tiết chuyên đề. `TimetableEntry` tuyệt đối không mang trường thành phần.
- Tính áp dụng chuyên đề là dữ liệu cấu hình nghiệp vụ chính thức theo từng lớp-môn, không được tự động suy diễn.
- Báo cáo môn học thông thường cộng gộp số liệu của cả hai thành phần.

---

## 2. Quyết định Kiến trúc (Decisions)

### 2.1 Mô hình Thực thể và Phân định Thành phần Chương trình (Physical Component Topology)

1. **Enum Thành phần:** Schema cơ sở dữ liệu bổ sung kiểu liệt kê:
   ```prisma
   enum PpctCurricularComponent {
     CORE
     SPECIALIZED_STUDY
   }
   ```
2. **Quyền sở hữu Thành phần Bất biến trên Item:**
   - `PpctItem` sở hữu thuộc tính `component: PpctCurricularComponent` gắn với `ppctPlanId`.
   - Thuộc tính thành phần gắn liền với UUID bất biến của bài học: khi một UUID của `PpctItem` được khởi tạo với một thành phần, nó vĩnh viễn không bao giờ được phép đổi sang thành phần khác trong bất kỳ phiên bản nào sau đó.
   - `PpctItem` phơi bày tọa độ duy nhất phức hợp:
     ```prisma
     @@unique([id, ppctPlanId, component], map: "ppct_items_identity_component_key")
     ```
3. **Tọa độ Quan hệ Bản sao trên Revision và Khóa ngoại Phức hợp:**
   - `PpctItemRevision` mang trường `component` như một tọa độ quan hệ bản sao (duplicated relational coordinate).
   - Cơ sở dữ liệu (`P2-002`) bắt buộc thiết lập composite foreign key:
     ```sql
     FOREIGN KEY (ppct_item_id, ppct_plan_id, component)
       REFERENCES ppct_items(id, ppct_plan_id, component)
     ```
     chứng minh đồng thời: đúng bài học ổn định, đúng kế hoạch môn học, và đúng thành phần bất biến (`revision.component == item.component`), loại trừ hoàn toàn rủi ro trôi lệch thành phần (component drift).
   - `PpctItemRevision` phơi bày tọa độ duy nhất phức hợp phục vụ liên kết phả hệ:
     ```prisma
     @@unique([ppctVersionId, ppctItemId, ppctPlanId, component], map: "ppct_item_revisions_provenance_component_key")
     ```
4. **Bảo tồn Kế hoạch Khung Dùng chung:**
   - Giữ nguyên `PpctPlan = AcademicYear + Subject + GradeLevel` (`academicYearId, subjectId, gradeLevel`) làm kế hoạch khung tổng thể. Tuyệt đối không tạo `PpctComponentPlan`.

### 2.2 Quy tắc Không gian Số thứ tự (Sequence Contract)

1. **Ràng buộc Duy nhất theo Thành phần:**
   - Ràng buộc duy nhất toàn phiên bản `@@unique([ppctVersionId, sequence])` chính thức bị bãi bỏ.
   - Thay thế bằng ràng buộc duy nhất theo thành phần trong phiên bản:
     ```prisma
     @@unique([ppctVersionId, component, sequence], map: "ppct_item_revisions_version_component_sequence_key")
     ```
2. **Bản chất của Sequence:**
   - Là số nguyên dương (`1, 2, 3...`), chỉ đại diện cho thứ tự phân phối nội bộ trong phạm vi thành phần đó, không phải định danh kỹ thuật.
   - Cả `CORE` và `SPECIALIZED_STUDY` đều có dãy sequence độc lập bắt đầu từ 1.
3. **Quy tắc Lưu trữ và Trình diễn:**
   - Tuyệt đối không lưu trữ các chuỗi tiền tố như `"CD1"`, `"CD2"` vào cột `sequence` hay cột định danh trong cơ sở dữ liệu.
   - Tiền tố `"CD"` là quy ước hiển thị tầng trình diễn (presentation convention):
     - `CORE` sequence `1` -> hiển thị `"1"`
     - `SPECIALIZED_STUDY` sequence `1` -> hiển thị `"CD1"`

### 2.3 Bao gói Phiên bản PPCT Duy nhất (One Shared Version Package)

1. **Vòng đời Phiên bản Nguyên tử:**
   - Mỗi kế hoạch `PpctPlan` duy trì một chuỗi phiên bản duy nhất với vòng đời chuẩn tắc: `DRAFT -> PUBLISHED -> SUPERSEDED`.
   - Một bản ghi `PpctVersion` là gói chương trình nguyên tử (atomic package) chứa toàn bộ các bài `CORE` và các bài `SPECIALIZED_STUDY` (nếu có).
   - Lệnh xuất bản (`PUBLISH`) diễn ra nguyên tử cho toàn bộ gói. Không tồn tại hai luồng phiên bản xuất bản độc lập cho cùng một kế hoạch môn học.
2. **Quy chuẩn Nội dung Phiên bản:**
   - Phiên bản được xuất bản **BẮT BUỘC** phải chứa ít nhất một bài `CORE`.
   - Nội dung `SPECIALIZED_STUDY` là tùy chọn (có thể chứa 0 bài chuyên đề nếu khối-môn không áp dụng chuyên đề). Hệ thống không cần cờ boolean riêng để xác định môn có chuyên đề hay không; khả năng hỗ trợ chuyên đề được suy diễn trực tiếp từ nội dung của phiên bản.
3. **Độc lập với Tổ chức Nguồn Tải lên:**
   - Cho dù nguồn nhập là một workbook chứa 2 sheet logic hay hai file tách biệt, chúng đều được tổng hợp vào một gói phiên bản nháp duy nhất trước khi xuất bản.

### 2.4 Hồ sơ Áp dụng theo Lớp-Môn (Class-Subject Applicability Profile)

1. **Enum Hồ sơ Áp dụng:**
   ```prisma
   enum PpctClassCurricularProfile {
     CORE_ONLY
     CORE_PLUS_SPECIALIZED_STUDY
   }
   ```
2. **Vị trí Lưu trữ:**
   - Bổ sung trường `curricularProfile: PpctClassCurricularProfile` vào bảng `PpctClassAssociation`.
   - Không đưa vào cấu hình chung của `BusinessConfiguration` và không tạo bảng khoảng ngày thứ hai.
   - `PpctClassAssociation` tiếp tục sử dụng các trường ngày chuẩn tắc `effectiveFrom: DateTime @db.Date` và `effectiveUntil: DateTime? @db.Date` (đóng vai trò khoảng ngày có hiệu lực bao gồm - inclusive date range).
   - Cơ sở dữ liệu duy trì bảo vệ toàn vẹn lịch sử bằng ràng buộc loại trừ PostgreSQL daterange / GiST exclusion backstop:
     `daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)')`
     ngăn chặn khoảng ngày chồng lấn cho cùng một luồng `(academic_year_id, school_class_id, subject_id)`.
3. **Quy tắc Thẩm quyền:**
   - Hồ sơ áp dụng là dữ liệu cấu hình nghiệp vụ chính thức do quản trị viên thiết lập.
   - Tuyệt đối không suy diễn hồ sơ áp dụng từ số tiết thời khóa biểu, tên lớp, mã môn, `lessonType`, giáo viên, hay các thuật toán phỏng đoán.
4. **Ngữ nghĩa Áp dụng:**
   - `CORE_ONLY`: Chỉ áp dụng thành phần `CORE`. Các bài `SPECIALIZED_STUDY` có trạng thái `NOT_APPLICABLE` (không bao giờ bị coi là thiếu tiết, không trễ hạn, và không tạo nợ tiến độ).
   - `CORE_PLUS_SPECIALIZED_STUDY`: Áp dụng cả hai thành phần. Phiên bản PPCT được liên kết bắt buộc phải có ít nhất một bài `SPECIALIZED_STUDY`.

### 2.5 Hiệu lực Khoảng ngày và Quy tắc Biên Phân đoạn Tuần học (AcademicWeekSegment)

1. **Bảo toàn Lịch sử Liên kết:**
   - Khi thay đổi phiên bản hoặc hồ sơ áp dụng, tạo bản ghi `PpctClassAssociation` mới với khoảng ngày dân sự kế tiếp. Không sửa đè lịch sử.
2. **Đối soát Cấu trúc Tuần học Lịch học (AcademicWeek vs AcademicWeekSegment):**
   - Theo chuẩn kiến trúc `ADR-010` và `ADR-011`, `AcademicWeek` là một định danh tuần nghiệp vụ được lưu trữ (stored business-week identity); bản thân nó không có khoảng ngày dân sự liên tục đơn tuyến.
   - Khoảng ngày dân sự thực tế thuộc về thực thể `AcademicWeekSegment`. Một `AcademicWeek` có thể chứa nhiều phân đoạn không liên tục (ví dụ: phân đoạn 5a và phân đoạn 5b, bị phân tách bởi khoảng gián đoạn lịch học `CalendarInterruption`).
3. **Quy tắc Đồng nhất trên Toàn bộ các Phân đoạn Tuần:**
   - Hồ sơ `curricularProfile` bắt buộc phải đồng nhất trên HỢP khoảng ngày (union of date ranges) của toàn bộ các `AcademicWeekSegment` thuộc về cùng một `AcademicWeek` chuẩn tắc.
4. **Chặn Lỗi Phân tách Tuần (Fail-Closed):**
   - Nếu trong phạm vi hợp các phân đoạn của cùng một tuần học xuất hiện sự thay đổi `curricularProfile` (bao gồm cả trường hợp ngày bắt đầu hiệu lực `effectiveFrom` rơi vào khoảng gián đoạn giữa các phân đoạn):
     Hệ thống lập tức **DỪNG LẠI VÀ BÁO LỖI (FAIL-CLOSED)** với mã lỗi:
     `PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`
   - Quản trị viên chỉ được áp dụng thay đổi hồ sơ tại điểm ranh giới chuẩn tắc giữa hai tuần học.

### 2.6 Thuật toán Định tuyến Cơ hội Hàng tuần (Weekly Routing Algorithm)

1. **Phân vùng Tập Ứng viên:**
   - Định tuyến cơ hội được phân vùng chính xác theo khóa:
     `AcademicYear + SchoolClass + Subject + exact AcademicCalendarVersion + exact AcademicWeek.id`.
   - Tuyệt đối không sử dụng số tuần ISO, giờ máy chủ cục bộ, nhãn hiển thị, số tuần chính thức (`officialWeekNumber`) hay khoảng cách ngày làm định danh.
   - Một cơ hội TKB bình thường (`NORMAL_TIMETABLE_OPPORTUNITY`) chỉ thuộc về tập định tuyến tuần khi và chỉ khi `civilDate` của nó nằm trong đúng một `AcademicWeekSegment` thuộc phiên bản lịch học retained `AcademicCalendarVersion`.
2. **Thứ tự Sắp xếp Tất định:**
   - Tiêu chí 1: `civilDate` tăng dần;
   - Tiêu chí 2: `TimeSlotDefinition.startTime` tăng dần;
   - Tiêu chí 3: `TimeSlotDefinition.endTime` tăng dần;
   - Tiêu chí 4: `NORMAL:<timetableEntryId>:<civilDate>` tăng dần (chuỗi phân xử hòa ổn định).
   - Bất kỳ xung đột trùng giờ/tiết bất khả thi nào vẫn là lỗi cấu trúc (`CLASS_TIME_OVERLAP`) và không được tự động bỏ qua bằng phân xử hòa.
3. **Quy tắc Gán Thành phần Lập kế hoạch:**
   - Đối với `CORE_ONLY`: Toàn bộ cơ hội trong tuần định tuyến vào `CORE`.
   - Đối với `CORE_PLUS_SPECIALIZED_STUDY`: Cơ hội bình thường cuối cùng theo thứ tự sắp xếp được gán `SPECIALIZED_STUDY`; toàn bộ các cơ hội đứng trước được gán `CORE`.

### 2.7 Tính Bất biến Lập kế hoạch, Ngữ nghĩa Gián đoạn Lịch và Quy tắc Tuần Dị thường

1. **Ngữ nghĩa Khoảng trống Gián đoạn Lịch học (CalendarInterruption Gap):**
   - Một cơ hội TKB cấu trúc có `civilDate` rơi vào khoảng trống gián đoạn lịch (`CalendarInterruption`) và do đó không thuộc bất kỳ `AcademicWeekSegment` nào:
     - Tiếp tục được quan sát ở mức cấu trúc (structural observability) phục vụ chẩn đoán và truy vết;
     - Nằm NGOÀI tập định tuyến thành phần tuần học;
     - Không nhận nghĩa vụ phân bổ `CORE` hay `SPECIALIZED_STUDY`;
     - Không tiêu thụ bất kỳ mục PPCT nào;
     - Không sinh nợ tiến độ chỉ từ sự kiện này;
     - Tuyệt đối KHÔNG tham gia vào việc lựa chọn cơ hội cuối cùng của tuần.
     *(Đây là sự vắng mặt quyền sở hữu tuần học, không phải phân loại lại vận hành).*
2. **Phân loại Lập kế hoạch Đi trước Kết quả Vận hành:**
   - Đối với các cơ hội thuộc `AcademicWeekSegment` hợp lệ, việc định tuyến là phân loại lập kế hoạch (planning semantics), diễn ra TRƯỚC khi áp dụng kết quả vận hành.
   - Các biến động vận hành (`CalendarException`, hoạt động đặc biệt đè tiết `SpecialActivity`, hủy tiết được duyệt `AUTHORIZED_CANCELLATION`, giáo viên vắng mặt, dạy thay, quản lớp) **KHÔNG BAO GIỜ** làm thay đổi thành phần kế hoạch đã gán của cơ hội.
   - Nếu cơ hội chuyên đề cuối tuần bị hủy hoặc nghỉ, nó vẫn giữ nguyên định danh kế hoạch là `SPECIALIZED_STUDY` (nhưng không tiêu thụ bài). Cơ hội cốt lõi trước đó tuyệt đối không bị đôn lên làm chuyên đề. Bài chuyên đề đang chờ sẽ được tiêu thụ ở cơ hội chuyên đề tiếp theo.
3. **Phân đoạn Tuần không Liên tục (Non-contiguous Week Segments):**
   - Đối với một `AcademicWeek` có nhiều phân đoạn (ví dụ: 5a và 5b), tập định tuyến tuần là HỢP (union) của tất cả các cơ hội trong các phân đoạn thuộc tuần đó. Cơ hội cuối cùng theo thời gian của toàn bộ hợp phân đoạn là cơ hội chuyên đề. Phân đoạn 5a và 5b không phải là hai tuần độc lập.
4. **Tuần có 0 cơ hội bình thường:**
   - Không định tuyến, không phân bổ, không tạo cơ hội giả tạo, không tiêu thụ mục PPCT, và không sinh nợ tiến độ.
5. **Tuần có đúng 1 cơ hội bình thường VÀ hồ sơ là `CORE_PLUS_SPECIALIZED_STUDY`:**
   - Hệ thống **DỪNG LẠI VÀ BÁO LỖI (FAIL-CLOSED)** với mã lỗi:
     `PPCT_COMPONENT_WEEK_CAPACITY_INVALID`
   - *Lý do:* Một tiết duy nhất không thể đại diện cho hai thành phần chương trình bắt buộc mà không làm thiên vị hoặc bỏ đói một thành phần. Tuyệt đối không tự ý fallback về `CORE` hoặc ép sang `SPECIALIZED_STUDY`.
6. **Chuyển giao TKB giữa tuần và Định danh Lịch học (Mid-Week Cutover & Calendar Identity):**
   - Cho phép các cơ hội xuất phát từ các phiên bản `TimetableVersion` khác nhau có hiệu lực theo ngày được gom chung vào một tập định tuyến tuần, VỚI ĐIỀU KIỆN toàn bộ các cơ hội giải quyết về:
     CÙNG một `AcademicCalendarVersion` chính xác VÀ CÙNG một `AcademicWeek.id` chính xác.
   - Nếu việc chuyển giao TKB làm thay đổi định danh lịch học hoặc định danh tuần học giữa tuần khiến các cơ hội bị phân tán sang các tuần lịch khác nhau:
     Hệ thống lập tức **FAIL-CLOSED** với mã lỗi chặn ngữ nghĩa:
     `PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`
   - Tuyệt đối không suy đoán tương đương tuần giữa các phiên bản lịch khác nhau.

### 2.8 Mô hình Sẵn sàng Nhận thức Thành phần (Component-Aware Readiness)

1. **Bảo tồn Profile Lịch sử:**
   - Profile `NORMAL_BASE_PPCT_V1` được bảo tồn nguyên vẹn làm profile tương thích cho các luồng kiểm tra cũ.
2. **Profile Chuẩn tắc Mới:**
   - Đề xuất profile mới: `NORMAL_BASE_PPCT_COMPONENT_V2` (do `P2-003` triển khai).
   - Chiều kích đánh giá:
     - Quyền sở hữu `AcademicWeekSegment` chuẩn tắc;
     - Tính hợp lệ của liên kết PPCT và hồ sơ `curricularProfile`;
     - Tính đồng nhất của hồ sơ trên toàn bộ các phân đoạn tuần, phát hiện lỗi `PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`;
     - Tính đồng nhất của lịch học tuần khi chuyển giao TKB, phát hiện lỗi `PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`;
     - Tính sẵn sàng của nội dung chuyên đề: nếu lớp bật chuyên đề, phiên bản PPCT mục tiêu bắt buộc phải có ít nhất một bài chuyên đề;
     - Dung lượng tuần: tuần học có tiết của lớp bật chuyên đề bắt buộc phải có tối thiểu 2 cơ hội bình thường (1 cơ hội báo `PPCT_COMPONENT_WEEK_CAPACITY_INVALID`); các cơ hội rơi vào khoảng gián đoạn lịch không được tính vào dung lượng;
     - Nguy cơ cạn kiệt phân bổ trong khoảng thời gian đánh giá.

### 2.9 Tiến trình Độc lập và Hành vi Cạn kiệt (Independent Progression & Exhaustion)

1. **Tiến trình Độc lập:**
   - `ADR-037` về không gian bao phủ đơn tuyến bị thay thế.
   - `CORE` và `SPECIALIZED_STUDY` duy trì trạng thái phân bổ và tập nghĩa vụ đã bao phủ độc lập trong bộ nhớ khi phát lại (`DIRECT_DISTRIBUTION_OBLIGATIONS`, `DISTRIBUTION_COVERED_ITEMS`).
   - Một cơ hội tiêu thụ nghĩa vụ sẽ resolve đúng thành phần đã định tuyến và chọn bài có sequence nhỏ nhất chưa phân bổ trong thành phần đó.
   - Tiết thiếu của `CORE` không làm dịch chuyển `SPECIALIZED_STUDY`, và ngược lại.
2. **Xử lý Cạn kiệt (Exhaustion):**
   - Khi cơ hội định tuyến tới một thành phần đã hết bài chưa dạy: **CHẶN VÀ BÁO LỖI (BLOCK)** với mã lỗi `PPCT_ALLOCATION_EXHAUSTED` kèm ngữ cảnh thành phần.
   - Tuyệt đối không vay mượn bài từ thành phần kia, không chuyển đổi thành phần, không quay vòng, không tái sử dụng bài đã hoàn thành, không tự ý sinh nội dung tự do.

### 2.10 Hợp đồng Phả hệ Bài học Ràng buộc Cơ sở Dữ liệu (Database-Backed Lineage Contract)

1. **Cấm Tuyệt đối Lineage Vượt Thành phần:**
   - Mọi quan hệ phả hệ (`CARRY_FORWARD`, tách `1 -> N`, gộp `N -> 1`) bắt buộc phải diễn ra trong cùng một thành phần.
   - Bảng `PpctItemLineage` bổ sung một cột tọa độ thành phần:
     ```prisma
     component PpctCurricularComponent
     ```
   - Cả hai nhánh quan hệ tiền nhiệm và kế nhiệm trong cơ sở dữ liệu đều bao gồm tọa độ thành phần này:
     ```sql
     FOREIGN KEY (predecessor_version_id, predecessor_item_id, ppct_plan_id, component)
       REFERENCES ppct_item_revisions(ppct_version_id, ppct_item_id, ppct_plan_id, component)

     FOREIGN KEY (successor_version_id, successor_item_id, ppct_plan_id, component)
       REFERENCES ppct_item_revisions(ppct_version_id, ppct_item_id, ppct_plan_id, component)
     ```
   - Ràng buộc quan hệ cơ sở dữ liệu bảo đảm:
     `predecessor.component == lineage.component == successor.component`
   - Tiền nhiệm `CORE` không bao giờ có thể trỏ tới kế nhiệm `SPECIALIZED_STUDY` (và ngược lại) ngay ở tầng lưu trữ vật lý.
   - Control plane kiểm tra và từ chối với mã lỗi ngữ nghĩa:
     `PPCT_COMPONENT_LINEAGE_CROSS_COMPONENT`
2. **Xử lý Di chuyển Chủ đề:**
   - Nếu chương trình di chuyển chủ đề giữa hai thành phần: Xóa bài ở thành phần nguồn (`REMOVED`) và Tạo mới bài học ở thành phần đích với UUID mới (`NEW`). Tuyệt đối không kế thừa tín chỉ hoàn thành.
3. **Bảo tồn Topology:**
   - Giữ nguyên topology 6 bảng PPCT, không tạo thêm model/table mới.

### 2.11 Ánh xạ Dữ liệu Lịch sử và Ràng buộc Cơ sở Dữ liệu Mục tiêu

1. **Ánh xạ Dữ liệu Lịch sử:**
   - Toàn bộ `PpctItem` hiện hữu -> `component = CORE`
   - Toàn bộ `PpctItemRevision` hiện hữu -> `component = CORE`
   - Toàn bộ `PpctItemLineage` hiện hữu -> `component = CORE`
   - Toàn bộ `PpctClassAssociation` hiện hữu -> `curricularProfile = CORE_ONLY`
   - Bảo toàn 100% UUID, sequence, title, và khoảng ngày hiệu lực của lịch sử.
2. **Ràng buộc Cơ sở Dữ liệu Mục tiêu (`P2-002`):**
   - Cột `component` và `curricularProfile` là `NOT NULL`.
   - Composite FK bảo vệ `PpctItemRevision -> PpctItem`:
     `FOREIGN KEY (ppctItemId, ppctPlanId, component) REFERENCES PpctItem(id, ppctPlanId, component)`.
   - Composite FK bảo vệ `PpctItemLineage -> PpctItemRevision` cho cả tiền nhiệm và kế nhiệm cùng `component`.
   - Chỉ mục duy nhất: `@@unique([ppctVersionId, component, sequence])`.
   - Giữ nguyên `ON DELETE RESTRICT` cho lịch sử.
   - Một bản ghi `PUBLISHED` duy nhất cho mỗi kế hoạch.

### 2.12 Nguồn gốc Thực thi, Dạy bù, Báo cáo và Kiểm soát Đồng thời

1. **Nguồn gốc Dẫn xuất (Derived Provenance):**
   - Tuyệt đối không thêm cột `component` vào `CurricularTeachingExecution`, `MakeupTeachingSchedule`, `TimetableEntry`, `TeachingAssignment`.
   - Nguồn gốc thành phần được truy xuất tất định từ `PpctItem` / `PpctItemRevision` được ghim trong bằng chứng thực thi.
   - DTO trả về: `component`, `sequence`, `displaySequence` (ví dụ: `"1"` hoặc `"CD1"`).
   - Dạy bù (`MAKEUP`) hoàn thành đúng nghĩa vụ bị lỡ ban đầu, kế thừa trọn vẹn thành phần của nghĩa vụ đó và không tiêu thụ bài mới.
2. **Tổng hợp Báo cáo:**
   - Báo cáo môn học thông thường cộng gộp số tiết của cả `CORE` và `SPECIALIZED_STUDY`.
   - Bảng chi tiết bảo toàn nguồn gốc thành phần phục vụ kiểm toán.
3. **Kiểm soát Đồng thời (Concurrency):**
   - Không sử dụng bảng con trỏ khả biến. Phát lại tiến độ là tính toán tất định trong bộ nhớ.
   - Luồng đọc phát lại: `RepeatableRead` trong cùng transaction cha cho chuỗi resolver lồng nhau.
   - Control plane và Xác nhận thực thi: `Serializable` + CAS token + kiểm tra phân bổ cùng transaction (chống TOCTOU).

---

## 3. Các Ví dụ Kiến trúc Điển hình (Worked Examples)

### Ví dụ A — Lớp 10A5 Môn Địa lí, có học Chuyên đề
- **TKB tuần:** T2 Tiết 2, T4 Tiết 3, T6 Tiết 4 (thuộc `AcademicWeekSegment`).
- **Hồ sơ:** `CORE_PLUS_SPECIALIZED_STUDY`.
- **Định tuyến:** T2 -> CORE (tiêu thụ CORE 1), T4 -> CORE (tiêu thụ CORE 2), T6 -> SPECIALIZED_STUDY (tiêu thụ CD 1, hiển thị `"CD1"`). Tiến trình độc lập.

### Ví dụ B — Lớp 10A6 Môn Địa lí, không học Chuyên đề
- **TKB tuần:** T2, T4, T6.
- **Hồ sơ:** `CORE_ONLY`.
- **Định tuyến:** T2, T4, T6 đều là CORE (tiêu thụ CORE 1, 2, 3). Các bài chuyên đề là `NOT_APPLICABLE` (không nợ, không thiếu).

### Ví dụ C — Cơ hội Chuyên đề Cuối tuần bị Gián đoạn / Hủy bỏ
- T2 (CORE), T4 (CORE), T6 (SPECIALIZED_STUDY).
- T6 bị nghỉ lễ / hủy tiết: T6 giữ nguyên định danh kế hoạch là chuyên đề, tiêu thụ 0 bài. T4 tuyệt đối không bị đôn lên làm chuyên đề. Bài chuyên đề chờ đến cơ hội chuyên đề tuần kế tiếp.

### Ví dụ D — Tuần Dị thường Chỉ có Đúng 1 Cơ hội
- Hồ sơ: `CORE_PLUS_SPECIALIZED_STUDY`. Tuần chỉ xếp đúng 1 tiết.
- Hệ thống **FAIL-CLOSED** với mã lỗi `PPCT_COMPONENT_WEEK_CAPACITY_INVALID`. Tuyệt đối không fallback về CORE hay chuyên đề.

### Ví dụ E — Chuyển dịch Phiên bản PPCT (Version Transition)
- V1: CORE 1, 2; SPECIALIZED 1. Đã hoàn thành.
- V2: CORE 1 giữ nguyên, CORE 2 tách thành 2a, 2b. SPECIALIZED 1 giữ nguyên, SPECIALIZED 2 mới.
- Phát lại tiến hành độc lập hoàn toàn trên từng thành phần theo đúng quan hệ phả hệ của thành phần đó.

### Ví dụ F — Cấm Tuyệt đối Lineage Vượt Thành phần
- Trỏ lineage từ CORE tiền nhiệm sang SPECIALIZED_STUDY kế nhiệm:
- Bị từ chối tại cơ sở dữ liệu (composite FK) và control plane với mã lỗi `PPCT_COMPONENT_LINEAGE_CROSS_COMPONENT`.

### Ví dụ G — Tuần học có Phân đoạn Ngắt quãng (Non-contiguous Week Segments)
- Tuần 5 có 2 phân đoạn: `5a` (Thứ Hai, Thứ Ba) và `5b` (Thứ Sáu, Thứ Bảy), phân tách bởi khoảng gián đoạn lễ giữa tuần (Thứ Tư, Thứ Năm).
- Cơ hội bình thường: T2 (5a), T3 (5a), T6 (5b).
- Tiết TKB Thứ Năm rơi vào ngày lễ nằm trong khoảng gián đoạn không có `AcademicWeekSegment`: không tham gia định tuyến, không tiêu thụ bài, không tạo nợ.
- Hợp cơ hội của Tuần 5 gồm: T2, T3, T6.
- Định tuyến: T2 -> CORE, T3 -> CORE, T6 (cuối hợp phân đoạn) -> SPECIALIZED_STUDY.

### Ví dụ H — Chuyển giao TKB Giữa tuần Gây Phân mảnh Lịch học
- Giữa tuần học, phiên bản TKB mới có hiệu lực nhưng trỏ sang một `AcademicCalendarVersion` khác hoặc `AcademicWeek.id` khác.
- Hệ thống từ chối gom nhóm và **FAIL-CLOSED** với mã lỗi `PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`.

---

## 4. Hậu quả và Tác động (Consequences)

### Tác động Tích cực
1. Khắc phục triệt để mâu thuẫn giữa mô hình PPCT đơn tuyến và quy định Chương trình GDPT 2018 theo quyết định của Product Owner.
2. Bảo toàn hoàn toàn ranh giới sạch của `TimetableEntry` và `TeachingAssignment`.
3. Tách bạch rõ ràng giữa phân loại lập kế hoạch tất định và các biến động vận hành thực tế.
4. Ràng buộc cơ sở dữ liệu ngăn chặn hoàn toàn trôi lệch thành phần và lineage vượt thành phần.
5. Bảo đảm tính tương thích ngược hoàn hảo cho toàn bộ dữ liệu PPCT lịch sử.

### Ranh giới Triển khai Hạ nguồn (Downstream Ownership)
- **`P2-002`**: Schema migration, composite FKs, component trên lineage, control plane bản nháp và xuất bản nguyên tử.
- **`P2-003`**: Runtime định tuyến tuần, hai con trỏ tiến độ độc lập, profile sẵn sàng `V2`, phát hiện `PPCT_COMPONENT_WEEK_CALENDAR_SPLIT` và chiếu nợ tiến độ.
- **`P2-004`**: Giao diện UI quản lý cấu hình `curricularProfile` theo lớp-môn.
- **`P2-010`**: Kiểm tra workbook PPCT thực tế từ nhà trường.
- **`P2-020`**: Triển khai native importer.
