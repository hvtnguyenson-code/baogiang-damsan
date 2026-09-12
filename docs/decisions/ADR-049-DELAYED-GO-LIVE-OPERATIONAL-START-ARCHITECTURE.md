# ADR-049 — Kiến trúc Bắt đầu Vận hành và Go-Live Trễ (Delayed Go-Live / Operational-Start Architecture)

- **Trạng thái:** Proposed by P1-030
- **Ngày:** 2026-09-12
- **Phạm vi:** Phân định kiến trúc ngày bắt đầu vận hành chính thức, phân tách thời kỳ tiền vận hành và vận hành, nguyên tắc tiến độ PPCT kỳ vọng và bất biến không tự động tạo nợ.
- **Tài liệu thẩm quyền kiểm soát:** `docs/requirements/P1-030-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md`
- **Nền tảng xuất phát:** `main@fafd104c9af5b83833b8a6f324021cea226ffe63` (Post-merge CI #432 SUCCESS)
- **Ma trận truy vết:** `T28`, `T30` (triển khai kế nhiệm bởi `P1-031`, `P1-032`, `P3-010`, `P3-020`)

---

## 1. Bối cảnh (Context)

Theo chuẩn tắc `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md` (§4.8), hệ thống Quản lý Báo giảng có thể bắt đầu sử dụng chính thức sau khi năm học đã diễn ra được một khoảng thời gian. Nếu không có một mô hình ranh giới vận hành chuẩn xác:
1. Các tiết học theo Thời khóa biểu trong giai đoạn trước khi đưa phần mềm vào sử dụng (tiền vận hành) sẽ bị công cụ tính tiến độ coi là tiết chưa ghi nhận, dẫn đến việc báo cáo sai lệch chỉ số nợ tiết (`openDebtCount`) và trễ hạn (`lateCount`) hàng loạt cho toàn bộ giáo viên chỉ vì thời gian đã trôi qua.
2. Công cụ cấp phát PPCT (`PpctOccurrenceAllocationService`) nếu không có ranh giới rõ ràng sẽ có nguy cơ khởi động lại từ bài số 1 vào ngày bắt đầu sử dụng phần mềm, phá vỡ toàn bộ tiến độ giảng dạy thực tế của giáo viên.
3. Việc điều chỉnh mốc thời gian vận hành trong tương lai có thể vô tình viết lại hoặc làm sai lệch các Báo cáo Thống kê Tiết dạy (`ReportingStatement`) đã được nộp và phê duyệt trong quá khứ.

Để giải quyết triệt để vấn đề này, ADR-046 đã quy định cấu hình ngày bắt đầu vận hành là một trong các Policy Family cốt lõi của `BusinessConfiguration`. ADR này chính thức xác lập kiến trúc chi tiết cho chính sách bắt đầu vận hành.

---

## 2. Quyết định Kiến trúc (Decisions)

### 2.1 Hợp đồng Family Cấu hình Nghiệp vụ (Policy Family Contract)
Thiết lập policy family chuẩn tắc trên nền tảng `BusinessConfiguration` (ADR-046):
- **`familyKey`:** `OPERATIONAL_START`
- **`validatorVersion`:** `v1`
- **`resourceKind`:** `ACADEMIC_YEAR`
- **`downstreamAuthority`:** `ADR-049-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md`

Mỗi phiên bản cấu hình bắt buộc phải gắn với một Năm học cụ thể (`academicYearId`). Nghiêm cấm sử dụng phạm vi toàn trường `SCHOOL_WIDE` hoặc các phạm vi lớp/môn/người dùng cho family này.

### 2.2 Cấu trúc Payload và Quy tắc Xác thực Nghiêm ngặt
Payload phiên bản `v1` có cấu trúc bắt buộc:
```typescript
{
  "operationalStartDate": "YYYY-MM-DD"
}
```
- Trường `operationalStartDate` là bắt buộc, phải là chuỗi ngày dân sự ISO hợp lệ (`isCivilDate`).
- Payload phải là strict object, loại bỏ hoặc từ chối mọi trường dư thừa.
- Ngày `operationalStartDate` bắt buộc phải nằm trong khoảng thời gian hiệu lực của năm học (`startDate <= operationalStartDate <= endDate` của `AcademicCalendarVersion` đang active).
- Tuyệt đối không chấp nhận timestamp, chuỗi múi giờ client hay offset.

### 2.3 Phân tách Tuyệt đối giữa Hiệu lực Cấu hình và Mốc Ngày Vận hành
Hệ thống phân định rạch ròi hai khái niệm:
1. **Khoảng hiệu lực của bản ghi cấu hình (`effectiveFrom..effectiveUntil`):** Xác định khoảng thời gian mà phiên bản chính sách này có hiệu lực pháp lý trong hệ thống quản trị (ví dụ: Quyết định ban hành ngày `2024-09-01`).
2. **Mốc ngày bắt đầu vận hành (`operationalStartDate`):** Là giá trị nghiệp vụ nằm trong payload, xác định ngày cụ thể nhà trường bắt đầu ghi nhận báo giảng trên phần mềm (ví dụ: `2024-10-01`).

Tuyệt đối không được đồng nhất hai khái niệm này, đảm bảo nhà trường có thể ban hành hoặc điều chỉnh mốc go-live trước khi ngày go-live thực tế diễn ra.

### 2.4 Quy chuẩn Thời gian và Múi giờ
- `operationalStartDate` là một **Civil DATE** chuẩn.
- Ranh giới bắt đầu vận hành có hiệu lực chính xác từ thời điểm **bắt đầu ngày** (00:00:00.000) theo múi giờ chuẩn tắc Việt Nam **`Asia/Ho_Chi_Minh`** (UTC+7).
- Không chuyển đổi thành UTC midnight hay giờ địa phương của môi trường máy chủ.

### 2.5 Phân loại Thời kỳ Tiền Vận hành và Vận hành
Mọi nghĩa vụ hoặc cơ hội giảng dạy trong năm học được phân loại tất định dựa trên so sánh ngày dân sự:
- **`civilDate < operationalStartDate`:** Thuộc thời kỳ **`PRE_OPERATIONAL`** (Tiền vận hành).
- **`civilDate >= operationalStartDate`:** Thuộc thời kỳ **`OPERATIONAL`** (Vận hành chính thức).

### 2.6 Nguyên tắc Bất biến Không Tự động Tạo nợ (No-Auto-Debt)
- Mọi tiết học thuộc thời kỳ `PRE_OPERATIONAL` mà không có bản ghi thực thi giảng dạy: **TUYỆT ĐỐI KHÔNG TỰ BIẾN THÀNH NỢ TIẾT (`PROVEN_OPEN_DEBT`) HAY TRỄ HẠN (`lateCount`)** chỉ vì thời gian đã trôi qua.
- Tiết học này không được tự động coi là đã dạy (`COMPLETED`), cũng không bị coi là `NOT_APPLICABLE`. Trạng thái kiến trúc là **`PRE_OPERATIONAL_UNCONFIRMED`** và được loại trừ khỏi tập đánh giá nợ vận hành.
- Các sự kiện vận hành tiêu cực trong quá khứ không tự động cấu thành nợ chính thức nếu chúng nằm ngoài cửa sổ vận hành được cấu hình.

### 2.7 Tiến trình PPCT Kỳ vọng thông qua Replay Lịch sử TKB (Thẩm quyền PO-1)
- Đối với các môn học chính khóa, thuật toán cấp phát PPCT (`PpctOccurrenceAllocationService`) thực hiện phát lại (replay) toàn bộ các cơ hội TKB định kỳ hợp lệ trong giai đoạn tiền vận hành để xác lập **Tiến độ Kỳ vọng (Expected Progression)**.
- Tiết học đầu tiên tại ngày bắt đầu vận hành (`operationalStartDate`) sẽ tiếp tục nhận bài học tiếp theo kế tiếp chuỗi TKB quá khứ, không quay lại bài số 1.
- Việc phát lại này thuần túy là tính toán lập kế hoạch trong bộ nhớ, **tuyệt đối không cấu thành minh chứng thực thi** và không tạo tín chỉ định mức giảng dạy.
- Nếu dữ liệu TKB hoặc PPCT lịch sử bị thiếu hoặc không nhất quán dẫn đến việc không thể xác định tiến độ kỳ vọng một cách tất định: Hệ thống lập tức **FAIL CLOSED** đối với lớp-môn đó. Không tự ý đoán định và không hỗ trợ nhập tay con trỏ tiến độ khởi điểm.

### 2.8 Hành vi Chặn khi Thiếu Chính sách (Thẩm quyền PO-2)
- Không có bất kỳ giá trị mặc định ngầm nào khi thiếu chính sách.
- Nếu một năm học chưa được xuất bản chính sách `OPERATIONAL_START`, resolver trả về `POLICY_NOT_CONFIGURED` và toàn bộ các consumer yêu cầu căn cứ vận hành phải lập tức **FAIL CLOSED**.
- Nếu nhà trường đưa phần mềm vào sử dụng ngay từ đầu năm học, Quản trị viên bắt buộc phải cấu hình chính sách với `operationalStartDate` trùng với ngày bắt đầu năm học.
- Các trạng thái `POLICY_AMBIGUOUS` hoặc `POLICY_CORRUPT` luôn luôn fail closed.

### 2.9 Ranh giới Thống nhất cho Chương trình Chính khóa và Tham chiếu cho P4 (Thẩm quyền PO-3)
- Toàn bộ các môn học chính khóa trong năm học dùng chung một mốc `operationalStartDate`.
- Cả hai thành phần chương trình `CORE` và `SPECIALIZED_STUDY` của cùng một môn học tuân thủ chung ranh giới này; không tạo mốc go-live riêng theo thành phần (tuân thủ ADR-048).
- Phân hệ Hoạt động Đặc biệt `P4` (GDĐP, HĐTN-HN, `SpecialActivity`) tham chiếu cùng mốc ngày của năm học, nhưng `P4` sở hữu toàn bộ ngữ nghĩa riêng về tham gia, định mức, vắng mặt và báo cáo. `P1-030` không áp đặt quy tắc nợ tiết chính khóa cho `SpecialActivity`.

### 2.10 Tính Sẵn sàng Vận hành theo Từng Phân hệ (Thẩm quyền PO-4)
- Không tạo vòng đời hay trạng thái toàn cục `SYSTEM_OPERATIONAL`.
- Điều kiện để một lớp-môn được phép ghi nhận báo giảng đòi hỏi:
  1. Chính sách `OPERATIONAL_START` của năm học tồn tại và hợp lệ;
  2. Thời khóa biểu chính thức có hiệu lực (`TimetableVersion` ACTIVE);
  3. Phân phối chương trình chính thức đã xuất bản (`PpctVersion` PUBLISHED);
  4. Phân công giảng dạy (`TeachingAssignment`) hợp lệ.
- Thiếu bất kỳ điều kiện nào ở phân hệ nào thì phân hệ đó fail closed cục bộ, không làm tê liệt toàn bộ hệ thống.

### 2.11 Nguồn gốc Báo cáo Bất biến và Quy tắc Điều chỉnh Lịch sử
- **Báo cáo Thống kê Đã nộp/duyệt (`ReportingStatement`):** Bắt buộc lưu trữ định danh phiên bản chính sách có hiệu lực (`operationalStartPolicyVersionId`) vào snapshot và manifest. Báo cáo đã đóng băng vĩnh viễn không bị diễn giải lại khi chính sách bị sửa đổi trong tương lai.
- **Bản ghi Thực thi Giảng dạy (`CurricularTeachingExecution`):** Giữ nguyên cấu trúc hiện tại, không thêm trường policy version vì tính hợp lệ đã được xác thực tại thời điểm giao dịch.
- **Quy trình Sửa đổi Chính sách (Correction):** Nếu mốc `operationalStartDate` trong quá khứ bị điều chỉnh sau khi đã có dữ liệu thực tế, bắt buộc phải thực hiện theo quy trình `CORRECTION` của ADR-046 (chuyển version cũ sang `REVERSED`, bắt buộc nhập lý do, tạo version mới liên kết qua `correctsVersionId`).

### 2.12 Phân công Chuyển giao Triển khai Downstream
- **`P1-031`:** Đăng ký policy family, hiện thực validator, resolver, tích hợp lọc ranh giới vào `ProgressDebtService`/`ReportingProjectionService` và kiểm tra fail closed.
- **`P1-032`:** Xây dựng giao diện quản trị cấu hình chính sách typed cho `OPERATIONAL_START`.
- **`P3-010` & `P3-020`:** Xây dựng mô hình dữ liệu, API và UI để nạp minh chứng dạy học lịch sử tiền vận hành và đối soát khi thực tế sai lệch so với TKB kỳ vọng.

---

## 3. Hệ quả Kiến trúc (Consequences)

1. Hệ thống có cơ chế phân định rõ ràng giữa giai đoạn thử nghiệm/tiền vận hành và giai đoạn vận hành chính thức, loại trừ hoàn toàn tình trạng nợ ảo khi triển khai phần mềm giữa năm học.
2. Tiến độ bài học PPCT của giáo viên được bảo đảm tính liên tục và sư phạm: Giáo viên tiếp tục dạy bài tiếp theo vào ngày go-live dựa trên lịch sử TKB đã lên trước đó.
3. Tính toàn vẹn của các báo cáo thống kê tiết dạy được bảo vệ tuyệt đối: Mọi điều chỉnh chính sách chỉ có hiệu lực về mặt tương lai và phép chiếu động, không làm sai lệch hồ sơ pháp lý đã đóng băng.
4. Triển khai kế nhiệm tại `P1-031` và `P1-032` có hợp đồng kỹ thuật chặt chẽ, không bị nhầm lẫn giữa hiệu lực phiên bản và mốc ngày nghiệp vụ.

---

## 4. Các Phương án Bị Từ chối (Rejected Alternatives)

- **Từ chối dùng phạm vi `SCHOOL_WIDE`:** Khiến một mốc go-live bị áp dụng vĩnh viễn cho mọi năm học tiếp theo.
- **Từ chối gộp `effectiveFrom` với `operationalStartDate`:** Khiến nhà trường không thể ban hành hoặc điều chỉnh mốc go-live trước ngày diễn ra sự kiện.
- **Từ chối tự động coi tiền vận hành là hoàn thành (`COMPLETED`):** Vi phạm nguyên tắc trung thực của minh chứng dạy học; chỉ có tiết có thực thi hợp lệ mới được coi là hoàn thành.
- **Từ chối tự động coi ngày khai giảng là ngày vận hành khi thiếu cấu hình (Hidden default):** Vi phạm nguyên tắc an toàn fail-closed và thẩm quyền PO-2.
- **Từ chối quay lại bài 1 vào ngày go-live:** Ép giáo viên phải dạy lại từ đầu những bài đã hoàn thành trên lớp trong tháng trước.
- **Từ chối tạo cơ chế nhập tay con trỏ tiến độ ban đầu trong P1-030:** Tạo kẽ hở dữ liệu không được kiểm chứng; việc xử lý sai lệch thuộc thẩm quyền của phân hệ đối soát P3.
- **Từ chối tạo cờ trạng thái toàn cục `SYSTEM_OPERATIONAL`:** Làm phức tạp hóa hệ thống và phá vỡ tính độc lập fail-closed của từng phân hệ nghiệp vụ.
