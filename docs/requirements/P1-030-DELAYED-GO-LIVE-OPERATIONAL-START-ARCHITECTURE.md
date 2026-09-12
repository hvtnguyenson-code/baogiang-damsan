# P1-030 — Delayed Go-Live / Operational-Start Architecture

## Thông tin Task và Thẩm quyền Quản trị

- **Mã task:** `P1-030`
- **Tên task:** Delayed go-live / operational-start architecture
- **Trạng thái nhánh làm việc:** `IN_PROGRESS` (Bản dự thảo kiến trúc đóng thẩm quyền đang được đánh giá)
- **Commit xuất phát chuẩn tắc (Starting Main):** `fafd104c9af5b83833b8a6f324021cea226ffe63`
- **authoritative Post-Merge CI xuất phát:** CI #432 (run id: `34698938801`) — SUCCESS
- **Nhánh làm việc chuyên biệt (Dedicated Branch):** `docs/delayed-go-live-operational-start-architecture-030`
- **Nhiệm vụ tiền nhiệm bắt buộc (Dependencies):**
  - `P1-020` — Business Configuration Control Plane architecture: **CLOSED** (ADR-046 Accepted, đóng bởi `SYNC-P1-020`)
  - `P2-001` — PPCT curricular-component architecture re-entry: **CLOSED** (ADR-048 Accepted, đóng bởi `SYNC-P2-001`)
- **Ma trận truy vết (Traceability Matrix):** `T28`, `T30`
- **Quyết định kiến trúc kiểm soát (Controlling Decision):** `docs/decisions/ADR-049-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md` (Trạng thái: *Proposed by P1-030*)
- **Phạm vi task:** Kiến trúc và tài liệu chuẩn tắc (Architecture & Documentation ONLY). Tuyệt đối không thay đổi mã nguồn, cơ sở dữ liệu, API, giao diện hoặc cấu hình triển khai.
- **Các nhiệm vụ kế nhiệm triển khai (Successors):**
  - `P1-031` — Operational-start policy implementation (Backend / Resolver / Contract)
  - `P1-032` — Operational-start admin UI integration (Giao diện cấu hình chính sách quản trị)
  - `P3-010` — Pre-operational historical execution architecture (Kiến trúc dữ liệu lịch sử và đối soát)
  - `P3-020` — Pre-operational history ingestion/reconciliation runtime (Runtime nạp minh chứng dạy học quá khứ)

---

## 1. Bối cảnh và Thẩm quyền Nguồn (Purpose & Authoritative Context)

### 1.1 Yêu cầu thực tiễn từ Nhà trường
Trong thực tế vận hành tại Trường PTDTNT THPT Đam San, phần mềm Quản lý Báo giảng có thể được đưa vào sử dụng chính thức sau khi năm học đã bắt đầu một thời gian (ví dụ: năm học khai giảng ngày 05/09 nhưng đến ngày 01/10 phần mềm mới chính thức vận hành ghi nhận sổ báo giảng).

Theo chuẩn tắc `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md` (§4.8) và ma trận truy vết `PRE-PILOT-TRACEABILITY-MATRIX.md` (`T28`, `T30`):
- Hệ thống phải hỗ trợ một chính sách ngày bắt đầu vận hành chính thức (`operational-start policy`) rõ ràng, có phiên bản và có hiệu lực theo thời gian.
- Việc thiếu bản ghi thực thi giảng dạy trong giai đoạn trước ngày bắt đầu vận hành **tuyệt đối không được tự động biến thành nợ tiết (debt) hay trễ hạn (late)** chỉ vì thời gian đã trôi qua.
- Dạy học lịch sử trước ngày bắt đầu vận hành khi được xác nhận hợp lệ sẽ được phép tiêu thụ đúng bài PPCT trong quá khứ và được tính vào tổng số tiết định mức của giáo viên.
- Không có bất kỳ cài đặt hiện tại nào được phép làm sai lệch hoặc diễn giải lại các Báo cáo Thống kê Tiết dạy (`ReportingStatement`) đã được phê duyệt và đóng băng.

### 1.2 Thẩm quyền Cố định của Product Owner (2026-09-12)
Ngày 2026-09-12, Product Owner đã ban hành 4 quyết định thẩm quyền bất biến nhằm khóa toàn bộ không gian quyết định cho `P1-030`:

1. **PO-1 — Cơ chế Tiến trình PPCT tại Ngày Bắt đầu Vận hành (PPCT Progression at Delayed Go-Live):**
   - Lựa chọn phát lại (replay) lịch sử Thời khóa biểu (TKB) và PPCT để xác lập **TIẾN ĐỘ KỲ VỌNG (EXPECTED PROGRESSION)**.
   - Các cơ hội TKB định kỳ trong giai đoạn tiền vận hành vẫn được thuật toán phân bổ PPCT (`PpctOccurrenceAllocationService`) replay theo quy tắc chuẩn tắc để xác định số thứ tự bài học kỳ vọng tại ngày bắt đầu vận hành.
   - Replay này **TUYỆT ĐỐI KHÔNG** phải bằng chứng đã dạy thực tế. Không được tự ý đánh dấu cơ hội lịch sử là `COMPLETED` và không tính số tiết định mức chỉ từ việc phát lại TKB.
   - Tuyệt đối không quay lại số thứ tự 1 nếu dữ liệu TKB lịch sử tồn tại.
   - Nếu dữ liệu TKB, PPCT, lịch năm học hoặc hồ sơ áp dụng không đủ để xác định tiến độ kỳ vọng một cách tất định: Hệ thống phải **FAIL CLOSED** đối với luồng lớp-môn bị ảnh hưởng.
   - Không tự ý bịa đặt cơ chế nhập tay con trỏ tiến độ khởi điểm (manual initial-sequence baseline) trong phạm vi `P1-030`/`P1-031`. Việc đối soát sai lệch giữa thực tế và TKB kỳ vọng thuộc thẩm quyền của `P3-010`/`P3-020`.

2. **PO-2 — Ứng xử khi Thiếu Chính sách Bắt đầu Vận hành (Missing Operational-Start Policy):**
   - Chính sách bắt đầu vận hành là **BẮT BUỘC** cho từng Năm học (`ACADEMIC_YEAR`).
   - Tuyệt đối **không có giá trị mặc định ngầm** (No hidden default).
   - Trạng thái `POLICY_NOT_CONFIGURED` bắt buộc phải **FAIL CLOSED** đối với các consumer yêu cầu căn cứ vận hành.
   - Không được tự động coi ngày bắt đầu năm học là ngày bắt đầu vận hành nếu thiếu chính sách được phê duyệt. Trường hợp nhà trường sử dụng phần mềm ngay từ ngày đầu năm học, Quản trị viên bắt buộc phải phát hành một chính sách rõ ràng với `operationalStartDate` trùng với ngày bắt đầu của năm học.
   - Các trạng thái lỗi `POLICY_AMBIGUOUS` và `POLICY_CORRUPT` luôn luôn fail closed.

3. **PO-3 — Phân định Chương trình Chính khóa và Hoạt động Đặc biệt (Ordinary Curriculum vs GDĐP/HĐTN):**
   - Có **DUY NHẤT MỘT** mốc `operationalStartDate` chung cho mỗi `ACADEMIC_YEAR`.
   - `P1-030` và `P1-031` sở hữu ngữ nghĩa và runtime cho môn học chính khóa thông thường (`Ordinary Curricular Teaching`). Cả hai thành phần `CORE` và `SPECIALIZED_STUDY` chia sẻ chung ranh giới này, không tạo mốc riêng theo thành phần.
   - Nhánh `P4` (GDĐP / HĐTN / `SpecialActivity`) tham chiếu cùng mốc `operationalStartDate` của năm học, nhưng `P4` sở hữu toàn bộ ngữ nghĩa riêng biệt về tham gia, định mức, báo cáo và quy tắc xác nhận của hoạt động đặc biệt.
   - `P1-030` tuyệt đối không áp đặt công thức tính nợ tiết chính khóa lên các hoạt động đặc biệt.

4. **PO-4 — Không Tạo Vòng đời Sẵn sàng Toàn cục Mới (No New Global Readiness Lifecycle):**
   - Tuyệt đối không tạo trạng thái toàn cục `SYSTEM_OPERATIONAL` hoặc cổng chặn cứng tổng hợp thay thế các bộ kiểm tra tính sẵn sàng hiện có.
   - Điều kiện vận hành đòi hỏi chính sách bắt đầu vận hành phải tồn tại và hợp lệ; các phân hệ độc lập tiếp tục sử dụng các cơ chế kiểm tra sẵn sàng và fail-closed hiện hữu (TKB, PPCT, Calendar, TeachingAssignment).

---

## 2. Kết quả Đánh giá Mã nguồn Hiện hành (Current Runtime Audit)

Kiểm tra trực tiếp mã nguồn read-only trên nhánh chính tại commit `fafd104c9af5b83833b8a6f324021cea226ffe63` mang lại các kết luận kỹ thuật sau:

1. **Bộ Cấp phát PPCT V2 (`PpctOccurrenceAllocationService.resolveInTransactionV2`):**
   - Quét toàn bộ ngày ứng viên từ đầu năm học đến ngày chỉ định (`throughCivilDate`).
   - Duyệt các cơ hội TKB thông thường theo thứ tự: `civilDate -> startTime -> endTime -> occurrenceKey`.
   - Thuật toán cấp phát chạy hoàn toàn trên bộ nhớ (in-memory simulation) dựa vào TKB và phân đoạn tuần lịch học (`AcademicWeekSegment`).
   - **Đặc điểm quan trọng:** Allocator **hoàn toàn KHÔNG đọc** bảng `CurricularTeachingExecution`. Con trỏ tiến độ tiêu thụ bài học PPCT tuần tự theo các tiết TKB được lên lịch, không phụ thuộc vào việc tiết đó đã được ghi báo giảng hay chưa.

2. **Công cụ Tính Tiến độ và Nợ tiết V2 (`ProgressDebtService.resolveInTransactionV2`):**
   - Quét toàn bộ nghĩa vụ phân bổ trực tiếp đã trôi qua thời điểm đánh giá (`hasEndedAt`).
   - Đối chiếu với bảng `CurricularTeachingExecution` có trạng thái `ACTIVE`.
   - Nếu **không có bản ghi thực thi**:
     - Nếu tiết học có phiếu ghi nhận vận hành (`OperationalLessonDisposition`) là `ABSENCE_NO_REPLACEMENT` hoặc `DIFFERENT_SUBJECT_SUPERVISION`: Phân loại là `PROVEN_OPEN_DEBT` (và tính vào `lateCount`).
     - Nếu tiết học là TKB bình thường (`BASE_TIMETABLE`) hoặc dạy thay cùng môn (`SAME_SUBJECT_SUBSTITUTION`): Phân loại là `UNCONFIRMED_COMPLETION_GAP`.
   - Như vậy, hệ thống hiện tại **đã tuân thủ nguyên tắc không tự động tạo nợ** khi thời gian trôi qua, nhưng các tiết quá khứ chưa ghi nhận vẫn bị đẩy vào chỉ số `unconfirmedGapCount` của báo cáo.

3. **Công cụ Báo cáo (`ReportingProjectionService`):**
   - Tổng hợp số liệu trực tiếp từ `ProgressDebtService`. Các tiết `UNCONFIRMED_COMPLETION_GAP` được đếm vào `unconfirmedGapCount`.
   - Báo cáo chính thức (`ReportingStatement` theo ADR-042) đóng băng snapshot bất biến (`REPORTING_STATEMENT_SNAPSHOT_V1`) kèm chữ ký băm SHA-256.

4. **Khái niệm Ranh giới Vận hành trong Mã nguồn:**
   - Hoàn toàn **VẮNG MẶT (ABSENT)**. Chưa có bất kỳ trường dữ liệu, interface hay hàm nào liên quan đến `operationalStartDate`, `preOperational`, `goLiveDate`, hay `historicalBaseline` trong `apps/**` hoặc `packages/contracts/**`.

---

## 3. Bảng Khóa Quyết định Kiến trúc Chuẩn tắc (Numbered Decision Closure D1 — D16)

| Mã ID | Vấn đề Kiến trúc | Quyết định Chuẩn tắc Khóa Thẩm quyền |
|---|---|---|
| **D1** | Phạm vi tài nguyên của Chính sách (Resource Scope) | Thuộc tài nguyên **`ACADEMIC_YEAR`** (`{ kind: 'ACADEMIC_YEAR', academicYearId: string }`). Mỗi năm học có một chính sách độc lập; không dùng `SCHOOL_WIDE` để tránh việc một mốc ngày áp đặt vĩnh viễn xuyên các năm học khác nhau. |
| **D2** | Hiệu lực Phiên bản vs Mốc Ngày Vận hành | **BẮT BUỘC TÁCH BIỆT**: `effectiveFrom..effectiveUntil` của phiên bản cấu hình quy định khoảng thời gian mà bản ghi cấu hình đó có hiệu lực pháp lý trong hệ thống; còn `operationalStartDate` là trường dữ liệu bắt buộc nằm trong payload (`{ operationalStartDate: "YYYY-MM-DD" }`) xác định thời điểm bắt đầu ghi nhận báo giảng. *Ràng buộc bổ sung (P1-A)*: Bản ghi xuất bản ban đầu phải có `effectiveFrom <= operationalStartDate`; cấm deliberate gap; cấm hành vi `RETIRE`; thay thế tương lai (`REPLACE`) chỉ được phép trước khi mốc đã diễn ra; điều chỉnh sau khi mốc đã qua bắt buộc dùng `CORRECTION`. |
| **D3** | Quy chuẩn Ngày Dân sự và Múi giờ | `operationalStartDate` là một **Civil DATE** chuẩn (`YYYY-MM-DD`). Ranh giới bắt đầu vận hành có hiệu lực từ thời điểm **bắt đầu ngày** (Start-of-day: 00:00:00.000) theo múi giờ chuẩn tắc Việt Nam **`Asia/Ho_Chi_Minh`** (UTC+7). Tuyệt đối không dùng giờ UTC midnight hay giờ địa phương của máy khách. |
| **D4** | Phân loại Ranh giới Thời gian | Tiết học có `civilDate < operationalStartDate` được phân loại là **`PRE_OPERATIONAL`** (Tiền vận hành). Tiết học có `civilDate >= operationalStartDate` được phân loại là **`OPERATIONAL`** (Vận hành chính thức). |
| **D5** | Nguyên tắc Bất biến Không Tự tạo Nợ | Tiết học trong giai đoạn `PRE_OPERATIONAL` mà không có bản ghi thực thi: **TUYỆT ĐỐI KHÔNG ĐƯỢC TÍNH VÀO NỢ TIẾT (`PROVEN_OPEN_DEBT`) HAY TRỄ HẠN (`lateCount`)**. Tiết học này cũng không được tự tiện coi là `COMPLETED` hay `NOT_APPLICABLE`. Trạng thái kiến trúc chuẩn tắc là **`PRE_OPERATIONAL_UNCONFIRMED`** và được loại trừ khỏi cửa sổ xét nợ vận hành. |
| **D6** | Dạy học Lịch sử và Phân định với P3 | Tiết học tiền vận hành nếu được xác nhận giảng dạy qua minh chứng hợp lệ (thuộc phạm vi `P3-010`/`P3-020`) sẽ được tiêu thụ đúng bài PPCT lịch sử và tính định mức giảng dạy. *Ràng buộc bổ sung (P1-B)*: Nghiêm cấm dùng ordinary NORMAL confirmation path (`TeachingExecutionsService.confirmNormal`, `POST /teaching-executions/curricular/normal`) hay ordinary MAKEUP confirmation path (`TeachingExecutionsService.confirmMakeup`, `POST /teaching-executions/curricular/makeup`) cho các tiết có `sourceCivilDate < operationalStartDate` (hoặc dạy bù nghĩa vụ gốc tiền vận hành); các đường dẫn này bắt buộc phải **FAIL CLOSED**. Quyền đọc/reverse minh chứng hợp lệ đã lưu trữ luôn được bảo tồn. |
| **D7** | Xác lập Tiến độ PPCT sau Go-Live | Thực hiện theo thẩm quyền **PO-1**: Allocator replay TKB quá khứ để xác lập **Tiến độ Kỳ vọng (Expected Progression)**. Sau go-live, tiết đầu tiên sẽ nhận bài tiếp theo kế tiếp chuỗi TKB quá khứ. Nếu thiếu dữ liệu TKB/PPCT dẫn đến không thể replay tất định: **FAIL CLOSED** cho lớp-môn đó. Không tự ý quay về sequence 1; không bịa đặt baseline nhập tay. |
| **D8** | Ranh giới giữa CORE và Chuyên đề học tập | Tuân thủ ADR-048: Cả `CORE` và `SPECIALIZED_STUDY` thuộc cùng một luồng môn học và **sử dụng chung một mốc `operationalStartDate`**. Không có mốc bắt đầu vận hành riêng lẻ theo từng thành phần chương trình. |
| **D9** | Ranh giới với Hoạt động Đặc biệt (GDĐP/HĐTN) | Thực hiện theo thẩm quyền **PO-3**: Toàn trường dùng chung một mốc `operationalStartDate` của năm học. `P1-030`/`P1-031` chỉ sở hữu môn học chính khóa. Phân hệ `P4` tham chiếu mốc này nhưng sở hữu toàn bộ logic riêng cho GDĐP/HĐTN; `P1-030` không áp đặt công thức nợ môn học cho `SpecialActivity`. |
| **D10** | Hành vi khi Thiếu Chính sách | Thực hiện theo thẩm quyền **PO-2**: **FAIL CLOSED** không có ngoại lệ. Khi resolver trả về `POLICY_NOT_CONFIGURED`, `POLICY_AMBIGUOUS` hoặc `POLICY_CORRUPT`, mọi consumer yêu cầu căn cứ vận hành phải chặn thực thi. Nếu trường dùng phần mềm từ đầu năm, bắt buộc phải phát hành policy với `operationalStartDate` bằng ngày bắt đầu năm học theo canonical `AcademicCalendarVersion.startDate`. |
| **D11** | Tính Bất biến Lịch sử khi Điều chỉnh Chính sách | Khi chính sách bị điều chỉnh (`CORRECTED` tạo version mới): Các ngày đã qua không bị sửa đổi lịch sử tại chỗ. Các bản ghi `CurricularTeachingExecution` đã tạo giữ nguyên provenance. Các Báo cáo Thống kê (`ReportingStatement`) đã phê duyệt **TUYỆT ĐỐI KHÔNG BỊ DIỄN GIẢI LẠI**. Chỉ các phép tính động (live projections) thực hiện sau thời điểm sửa mới phản ánh ranh giới mới. |
| **D12** | Lưu trữ Nguồn gốc Phiên bản Chính sách | Báo cáo chính thức (`ReportingStatement`): Snapshot và manifest bắt buộc phải ghim định danh phiên bản chính sách có hiệu lực (`operationalStartPolicyVersionId`). *Ràng buộc bổ sung (P2)*: Ngày dân sự giải quyết chính sách tại lệnh submit bắt buộc phải đổi từ `pinnedAsOfInstant` sang múi giờ **`Asia/Ho_Chi_Minh`** (`YYYY-MM-DD`), tuyệt đối không dùng `asOfInstant.toISOString().slice(0, 10)`. Bản ghi thực thi (`CurricularTeachingExecution`): Giữ nguyên cấu trúc schema hiện tại. |
| **D13** | Điểm Tích hợp vào Công cụ Nợ, Báo cáo và Thực thi | Tích hợp tại 3 điểm: (1) Bộ lọc ranh giới của `ProgressDebtService` và `ReportingProjectionService` tách các nghĩa vụ `PRE_OPERATIONAL` chưa có thực thi khỏi tập tính nợ; (2) Ordinary confirmation paths (`TeachingExecutionsService.confirmNormal` / `POST /teaching-executions/curricular/normal`, `TeachingExecutionsService.confirmMakeup` / `POST /teaching-executions/curricular/makeup`) chặn ghi nhận tiết tiền vận hành; (3) Khâu đóng băng `ReportingStatement` ghim policyVersionId theo ngày dân sự HCM. Không làm thay đổi bản chất công thức chứng minh nợ của ADR-040. |
| **D14** | Tác động đến Báo cáo và Định mức | Tiết dạy tiền vận hành có minh chứng xác nhận hợp lệ (qua P3): Được tính vào tổng số tiết dạy và định mức của giáo viên. Tiết tiền vận hành chưa xác nhận: Không xuất hiện dưới dạng nợ (`openDebtCount`) hay trễ (`lateCount`) trong bảng tổng hợp chính thức. |
| **D15** | Kiểm tra Tính Sẵn sàng Vận hành | Thực hiện theo thẩm quyền **PO-4**: Không tạo vòng đời toàn cục `SYSTEM_OPERATIONAL`. Yêu cầu sự tồn tại hợp lệ của chính sách `OPERATIONAL_START` kết hợp với các cổng kiểm tra sẵn sàng cục bộ hiện có (TKB có hiệu lực, PPCT đã xuất bản, Phân công giảng dạy đầy đủ). |
| **D16** | Đồ thị Nhiệm vụ Downstream | Phân công triển khai rõ ràng: `P1-031` triển khai policy backend; `P1-032` xây dựng giao diện quản trị cấu hình; `P3-010`/`P3-020` xây dựng kiến trúc nạp minh chứng lịch sử và đối soát; `P5-010` đóng băng toàn bộ nghiệp vụ phục vụ pilot. |

---

## 4. Hợp đồng Family Cấu hình Nghiệp vụ Chuẩn tắc (Policy Family Contract)

`P1-030` chuẩn hóa hợp đồng kỹ thuật cho policy family để `P1-031` triển khai trực tiếp vào `apps/api/src/business-configuration/business-policy-registry.ts`:

### 4.1 Định danh Family
- **`familyKey`:** `OPERATIONAL_START`
- **`validatorVersion`:** `v1`
- **`resourceKind`:** `ACADEMIC_YEAR`
- **`downstreamAuthority`:** `ADR-049-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md`

### 4.2 Cấu trúc Payload v1 (Strict Object)
```typescript
export interface OperationalStartPolicyPayloadV1 {
  /**
   * Ngày dân sự chính thức bắt đầu vận hành hệ thống (YYYY-MM-DD).
   * Có hiệu lực từ 00:00:00.000 giờ Asia/Ho_Chi_Minh của ngày này.
   */
  operationalStartDate: CivilDateString;
}
```

### 4.3 Quy tắc Xác thực Payload (Validator Rules)
1. Payload phải là một object nghiêm ngặt, không chấp nhận mảng hay kiểu nguyên thủy.
2. Trường `operationalStartDate` là bắt buộc, phải đúng định dạng ngày dân sự ISO `YYYY-MM-DD` (`isCivilDate`).
3. Tuyệt đối không chứa các trường thừa không được khai báo (Strict validation, loại bỏ hoặc từ chối unknown fields).
4. **Kiểm tra tính hợp lệ với Lịch Năm học:** Ngày `operationalStartDate` phải nằm trong khoảng thời gian hợp lệ của năm học (`startDate <= operationalStartDate <= endDate` của `AcademicCalendarVersion` đang có hiệu lực). P1-031 phải kiểm tra ràng buộc này khi publish/activate draft.
5. Tuyệt đối không chứa timestamp, chuỗi múi giờ client hay offset.

### 4.4 Mốc Neo Giải quyết Chính sách (Policy Resolution Anchor)
Để đảm bảo tính nhất quán tuyệt đối và tránh việc các tiết học khác nhau trong cùng một báo cáo bị áp dụng các mốc go-live mâu thuẫn:
- **Đối với các phép chiếu trực tiếp (Live Projections / API):**
  Hệ thống sử dụng ngày dân sự của máy chủ sở hữu tại thời điểm thực hiện lệnh (`businessCivilDate()`) để làm mốc truy vấn phiên bản chính sách có hiệu lực:
  `resolveEffectiveBusinessPolicy('OPERATIONAL_START', { kind: 'ACADEMIC_YEAR', academicYearId }, currentCivilDate)`.
  Phiên bản chính sách duy nhất được tìm thấy sẽ cung cấp `payload.operationalStartDate` để phân loại toàn bộ các tiết học trong phạm vi đánh giá.
- **Đối với Báo cáo Chính thức được Đóng băng (`ReportingStatement` - Thẩm quyền P2):**
  1. Lệnh nộp báo cáo (`SUBMIT`) ghim chính xác mốc `asOfInstant` của máy chủ đúng một lần duy nhất; mọi retry giao dịch tái sử dụng chính mốc này.
  2. Ngày dân sự giải quyết chính sách (`policyResolutionCivilDate`) bắt buộc phải tính bằng cách định dạng `asOfInstant` theo múi giờ chuẩn tắc **`Asia/Ho_Chi_Minh`** thành chuỗi `YYYY-MM-DD`.
  3. **TUYỆT ĐỐI KHÔNG DÙNG** `asOfInstant.toISOString().slice(0, 10)` (vì đây là ngày theo giờ UTC, có thể gây trôi lệch ngày vào các khung giờ sáng sớm tại Việt Nam).
  4. Thực hiện resolve chính sách với `ACADEMIC_YEAR` và ngày dân sự HCM đã tính; ghim cố định `policyVersionId` vào manifest/provenance bất biến của báo cáo.
- **Quy tắc Bất biến:** Không bao giờ resolve chính sách bằng ngày của từng tiết học (`occurrence.civilDate`) một cách riêng rẽ, vì điều đó sẽ phá vỡ tính chất ranh giới duy nhất của năm học.

---

## 5. Quy tắc Vòng đời và Điều chỉnh Chính sách (Policy Lifecycle Semantics - Thẩm quyền P1-A)

Chính sách `OPERATIONAL_START` là một ranh giới pháp lý trọng yếu của nhà trường, không phải một thông số thay đổi tùy tiện. Do đó, ngoài các quy chuẩn generic của ADR-046, family này bắt buộc phải tuân thủ các ràng buộc vòng đời chuyên biệt sau:

1. **Hiệu lực ban đầu:** Phiên bản xuất bản đầu tiên bắt buộc phải thỏa mãn:
   `effectiveFrom <= operationalStartDate`
   để đảm bảo thẩm quyền kiểm soát đã tồn tại chậm nhất tại ngày bắt đầu vận hành.
2. **Cấm khoảng trống hiệu lực (No deliberate gap):** Sau khi đã xuất bản chính thức, tuyệt đối không được tạo khoảng trống hiệu lực trong suốt thời gian năm học cần thẩm quyền vận hành.
3. **Cấm lệnh `RETIRE`:** Hành vi kết thúc (`RETIRE`) của ADR-046 bị **TỪ CHỐI** đối với family `OPERATIONAL_START`. Luồng cấu hình retained phải luôn tồn tại để các truy vấn lịch sử luôn tìm thấy thẩm quyền.
4. **Thay thế tương lai (Prospective Replacement):** Lệnh `REPLACE` chỉ được phép sử dụng **TRƯỚC KHI** mốc `operationalStartDate` hiện hành đã diễn ra (so với ngày dân sự máy chủ sở hữu). Bản ghi thay thế phải giữ tính liên tục hiệu lực và có `operationalStartDate` mới thuộc tương lai.
5. **Điều chỉnh sau khi mốc đã diễn ra (Correction after Boundary):** Khi mốc `operationalStartDate` đã trôi qua trong quá khứ, nghiêm cấm dùng lệnh `REPLACE` để đổi ngày. Mọi thay đổi đối với sự thật lịch sử bắt buộc phải đi qua quy trình `CORRECTION` của ADR-046 (chuyển version cũ sang `REVERSED`, bắt buộc nhập lý do `correctionReason`, tạo version mới liên kết qua `correctsVersionId`).
6. **Bảo toàn Báo cáo Đã đóng băng:** Sửa đổi chính sách hôm nay tuyệt đối không làm thay đổi các Báo cáo Thống kê (`ReportingStatement`) đã nộp hoặc phê duyệt trong quá khứ.
7. **Thực thi tầng lệnh (Command-Layer Enforcement):** `P1-031` bắt buộc phải kiểm tra và thực thi các ràng buộc trên tại command layer của backend.

---

## 6. Ranh giới Trách nhiệm giữa các Nhiệm vụ (Task Boundaries)

### 6.1 Phạm vi sở hữu của P1-030 (Hiện tại)
- Đóng toàn bộ kiến trúc, tài liệu chuẩn tắc và ban hành quyết định `ADR-049`.
- Xác lập bất biến PO-1, PO-2, PO-3, PO-4 cùng các bổ sung P1-A, P1-B, P2.
- Định nghĩa chi tiết hợp đồng kỹ thuật cho family `OPERATIONAL_START`.
- Đồng bộ tài liệu quản trị dự án, chuyển trạng thái `P1-030` sang `IN_PROGRESS` (và sau đó là `IN_REVIEW`).
- **Không thực hiện:** Không sửa mã nguồn runtime, không tạo bảng database, không sửa UI, không triển khai VPS.

### 6.2 Phạm vi chuyển giao cho P1-031 (Backend Implementation - Thẩm quyền P1-B & P2)
- Đăng ký chính thức family `OPERATIONAL_START` vào `PRODUCTION_BUSINESS_POLICY_FAMILIES`.
- Hiện thực hóa `BusinessPolicyPayloadValidator` phiên bản `v1`.
- Xây dựng typed resolver adapter cho consumer nội bộ.
- Tích hợp ranh giới `operationalStartDate` vào `ProgressDebtService` và `ReportingProjectionService` để loại trừ các nghĩa vụ tiền vận hành khỏi tập tính nợ.
- **Tích hợp kiểm soát lệnh ghi nhận thực thi (Execution Command Integration):** Tích hợp kiểm tra ranh giới `operationalStartDate` vào ordinary NORMAL confirmation path (`TeachingExecutionsService.confirmNormal`, `POST /teaching-executions/curricular/normal`) và ordinary MAKEUP confirmation path (`TeachingExecutionsService.confirmMakeup`, `POST /teaching-executions/curricular/makeup`):
  + Nếu `sourceCivilDate < operationalStartDate` (hoặc nghĩa vụ gốc của tiết dạy bù thuộc tiền vận hành): Bắt buộc **FAIL CLOSED** với lỗi nghiệp vụ từ chối ghi nhận tiết tiền vận hành.
  + Không cho phép dùng API ghi nhận thông thường để tạo minh chứng lịch sử bypass P3.
  + Bảo tồn đầy đủ quyền đọc và đảo ngược (`REVERSE`) minh chứng hợp lệ đã lưu trữ.
- Tích hợp quy chuẩn chuyển đổi ngày dân sự `Asia/Ho_Chi_Minh` cho `ReportingStatement` khi nộp báo cáo.
- Thực thi các ràng buộc vòng đời chuyên biệt của family (chặn `RETIRE`, kiểm soát prospective `REPLACE`, bắt buộc `CORRECTION`).
- Bổ sung kiểm tra fail-closed khi thiếu chính sách (`POLICY_NOT_CONFIGURED`).
- Viết unit test và integration test toàn diện chứng minh các bất biến kiến trúc.

### 6.3 Phạm vi chuyển giao cho P1-032 (Admin UI Integration)
- Xây dựng Typed Admin UI Adapter cho family `OPERATIONAL_START` trong không gian làm việc Quản trị Chính sách Nghiệp vụ (`/quan-tri/chinh-sach-nghiep-vu`).
- Hiển thị rõ ràng: Năm học áp dụng, trường chọn ngày `operationalStartDate`, trạng thái hiệu lực và lịch sử sửa đổi (lineage).
- Tuyệt đối không phơi bày trình soạn thảo JSON tự do, không can thiệp cài đặt kỹ thuật.

### 6.4 Ranh giới với Phân hệ Dữ liệu Lịch sử (P3-010 & P3-020)
- `P1-030` và `P1-031` **không sở hữu** quy trình nạp minh chứng quá khứ.
- `P3-010` sẽ chịu trách nhiệm thiết kế cấu trúc dữ liệu minh chứng dạy học tiền vận hành và quy tắc đối soát khi thực tế dạy học lệch với TKB lý thuyết.
- `P3-020` sẽ hiện thực hóa API và giao diện nhập liệu minh chứng lịch sử.

### 6.5 Ranh giới với Phân hệ Hoạt động Đặc biệt (P4-010 đến P4-050)
- Phân hệ `P4` tham chiếu chung mốc `operationalStartDate` của năm học do `P1-030`/`P1-031` cung cấp.
- `P4` chịu trách nhiệm toàn diện về mô hình chương trình, phân công giáo viên theo tiết, xác nhận tham gia và quy tắc tính định mức cho GDĐP và HĐTN-HN.

---

## 7. Các Diễn giải Bị Cấm Tuyệt đối (Forbidden Interpretations)

1. **Cấm suy diễn hoàn thành ngầm:** Tuyệt đối không được coi các tiết học trong giai đoạn tiền vận hành là đã hoàn thành (`COMPLETED`) nếu không có bản ghi minh chứng thực thi hợp lệ.
2. **Cấm tự động sinh nợ:** Tuyệt đối không được tính các tiết chưa ghi nhận trước ngày go-live vào nợ tiết (`PROVEN_OPEN_DEBT`) hay trễ hạn (`lateCount`) chỉ vì thời gian đã trôi qua.
3. **Cấm giá trị mặc định ngầm khi thiếu cấu hình:** Khi chưa cấu hình chính sách, hệ thống bắt buộc phải fail-closed, không được tự ý gán ngày khai giảng hay ngày hiện tại làm mốc vận hành.
4. **Cấm quay lại sequence 1 một cách tùy tiện:** Khi TKB lịch sử tồn tại hợp lệ, allocator phải tiếp tục chuỗi bài học kỳ vọng kế tiếp, không được ép giáo viên dạy lại từ bài 1 vào ngày go-live.
5. **Cấm nhập tay con trỏ tiến độ:** Không được tự ý thêm chức năng can thiệp thủ công số thứ tự bài học ngoài luồng đối soát chuẩn tắc của P3.
6. **Cấm sửa đổi báo cáo đã đóng băng:** Báo cáo thống kê đã được phê duyệt trong quá khứ là bất biến, không bao giờ được phép tính toán lại khi chính sách bắt đầu vận hành bị điều chỉnh.
7. **Cấm tạo vòng đời toàn cục mới:** Không được tạo thêm cờ `SYSTEM_OPERATIONAL` hay bảng trạng thái hệ thống toàn cục làm phức tạp hóa kiến trúc.
8. **Cấm dùng API thực thi thông thường cho tiết tiền vận hành:** Tuyệt đối không cho phép sử dụng `POST /teaching-executions/curricular/normal` hoặc `makeup` để tạo minh chứng tiền vận hành nhằm lách cổng kiểm soát của P3.
9. **Cấm kết thúc chính sách (RETIRE) hoặc tạo gap:** Tuyệt đối không cho phép thực hiện thao tác `RETIRE` làm mất thẩm quyền của family `OPERATIONAL_START`.
10. **Cấm dùng chuỗi ngày UTC để giải quyết chính sách báo cáo:** Nghiêm cấm sử dụng `asOfInstant.toISOString().slice(0, 10)` để resolve chính sách cho `ReportingStatement`. Bắt buộc phải chuyển đổi sang múi giờ `Asia/Ho_Chi_Minh`.

---

## 8. Tiêu chí Nghiệm thu Kiến trúc (Acceptance Criteria)

- [x] Tài liệu `P1-030-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md` được tạo đầy đủ, chuẩn xác, đóng băng toàn bộ 16 điểm quyết định D1–D16.
- [x] Quyết định kiến trúc `ADR-049-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md` được tạo với trạng thái `Proposed by P1-030`.
- [x] 4 thẩm quyền đóng băng của Product Owner (PO-1 đến PO-4) được phản ánh nhất quán trong toàn bộ tài liệu.
- [x] Hợp đồng kỹ thuật policy family `OPERATIONAL_START` (v1, ACADEMIC_YEAR, operationalStartDate) được định nghĩa chi tiết, chặt chẽ.
- [x] Ranh giới giữa P1-030, P1-031, P1-032, P3 và P4 được phân định rành mạch, không chồng chéo.
- [x] Các tài liệu quản trị dự án được đồng bộ trạng thái chính xác (`P1-030` chuyển sang `IN_PROGRESS`).
- [x] Hoàn toàn không có bất kỳ thay đổi nào ngoài thư mục `docs/**`.
- [x] Kiểm tra tĩnh `npm run test:workflow:contract` và `git diff --check` đều vượt qua thành công.
