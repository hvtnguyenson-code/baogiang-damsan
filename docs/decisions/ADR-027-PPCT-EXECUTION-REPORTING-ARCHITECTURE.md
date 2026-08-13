# ADR-027: Kiến trúc PPCT, thực thi giảng dạy và báo cáo

- **Trạng thái:** Accepted
- **Ngày:** 2026-08-13
- **Phạm vi:** Quyết định kiến trúc; chưa cho phép triển khai schema, API hoặc UI
- **Audit nguồn:** `docs/requirements/LOCAL-FC-05A0-PPCT-TEACHING-EXECUTION-REPORTING-ARCHITECTURE-AUDIT.md`
- **Closure:** `docs/requirements/LOCAL-FC-05A0D-PPCT-DECISION-CLOSURE.md`

## Bối cảnh

Đặc tả v1.2 xác lập chuỗi nghiệp vụ từ phân phối chương trình (PPCT), thời khóa biểu, điều chỉnh vận hành, thực thi giảng dạy, tiến độ/nợ tiết đến báo cáo và duyệt báo cáo. Nền tảng hiện tại đã có năm học, lịch nghiệp vụ, phân công giảng dạy, tiết học, thời khóa biểu và nhập XLSX an toàn; các miền PPCT, thực thi, nợ tiết và báo cáo chưa được triển khai.

Các nguyên tắc nghiệp vụ có nguồn trực tiếp từ v1.2 được phân biệt với các suy luận của audit 05A0. Những điểm PPCT trước đây còn **INFERRED** hoặc **UNRESOLVED** được đóng bằng quyết định product owner trong 05A0D; không được mô tả ngược thành nội dung vốn đã explicit trong v1.2. Các câu hỏi downstream còn lại vẫn cần quyết định ở lát cắt tương ứng.

## Quyết định

### 1. PPCT là miền độc lập, dùng chung và có phiên bản bất biến

Logical PPCT aggregate thuộc đúng tổ hợp `AcademicYear + Subject + Grade`. `SchoolClass`, `TeachingAssignment`, `TimetableVersion` và `AcademicCalendarVersion` không sở hữu PPCT. Tất cả lớp cùng năm học, môn và khối dùng các phiên bản của cùng một master PPCT; mô hình hiện hành không có master plan hoặc override riêng theo lớp.

Tiến độ thực tế thuộc từng class-subject stream, có scope tối thiểu `AcademicYear + SchoolClass + Subject`, và phải resolve qua association đến chính xác một phiên bản PPCT. Hai lớp có thể lệch tiến độ nhiều tiết mà không tạo plan/version riêng. PPCT item không mang global `completed` flag cho mọi lớp.

Một logical plan có các phiên bản theo vòng đời `DRAFT → PUBLISHED → SUPERSEDED`. Chỉ `DRAFT` được sửa. `PUBLISHED` bất biến; sửa một plan đã công bố phải tạo phiên bản mới. `SUPERSEDED` bất biến, terminal đối với future planning use. Công bố bản thay thế giữ nguyên bản trước và mọi tham chiếu lịch sử; ADR này không có delete, unpublish, reactivate hoặc approval workflow thứ hai cho PPCT.

Mỗi logical PPCT item có UUID bất biến; `sequence` / `Tiet_PPCT` chỉ là thứ tự nghiệp vụ, không phải định danh kỹ thuật. Mỗi phiên bản chứa item revision bất biến dưới chính phiên bản đó. Khi nghĩa của obligation được giữ nguyên, UUID có thể được carry forward dù sequence/title/metadata đổi. Split tạo UUID con mới; merge tạo UUID hợp nhất mới; cả hai giữ predecessor/successor lineage tường minh. UUID cũ không bị tái dùng cho nhiều nghĩa mới và item bị bỏ khỏi phiên bản sau vẫn tồn tại trong lịch sử.

Cardinality chuẩn là một item tương ứng một curriculum position và một distributable teaching-period obligation. Chủ đề nhiều tiết dùng nhiều item có thứ tự. Một normal resolved teaching occurrence tiêu thụ tối đa một next item; một class-stream item được hoàn thành đúng một lần; make-up hoàn thành item đã phân phối và không tiêu thụ item mới. Cardinality khác là re-entry trigger, không được tự suy diễn trong triển khai.

PPCT thuộc AcademicYear nhưng không thuộc `AcademicCalendarVersion`; `AcademicWeek` không phải owner hoặc identity của item. Canonical master được sắp theo curriculum sequence. Expected week placement là downstream projection từ association của lớp, business calendar có hiệu lực, timetable/operational reality và tiến độ riêng của lớp. Thay calendar version không tự yêu cầu thay PPCT version và cột “week” của workbook chưa được duyệt không phải core semantics.

Mỗi class-subject stream bind theo interval ngày dân sự không chồng lấn tới một exact PPCT version: `AcademicYear + SchoolClass + Subject + effective civil-date interval → exact PPCT version`. Version phải cùng AcademicYear, Subject và Grade với lớp trong năm đó. Chuyển version chỉ có hiệu lực prospective/date-effective; execution, fulfillment/debt và reporting giữ exact version, exact item UUID, stream và association/source lịch sử cần thiết. Không resolve lịch sử bằng version đang current và không thêm sequence/title PPCT vào `TimetableEntry`.

### 2. Tách lịch cơ sở khỏi điều chỉnh vận hành

Thời khóa biểu đã công bố là lịch cơ sở. Gián đoạn/ngoại lệ cục bộ, hủy tiết, dạy thay, dạy bù và hoạt động đặc biệt là các lớp phủ vận hành có nguồn gốc, hiệu lực và lịch sử riêng. Không sửa ngược thời khóa biểu cơ sở để phản ánh sự kiện thực tế. Đổi/chuyển/hoán đổi tiết vẫn chưa đủ semantics để trở thành quyết định.

### 3. “Tiết được phân giải” là hợp đồng đọc chuẩn

Một tiết được phân giải (resolved teaching occurrence) là kết quả xác định theo ngày nghiệp vụ từ:

1. phiên bản lịch nghiệp vụ có hiệu lực;
2. thời khóa biểu cơ sở có hiệu lực;
3. các lớp phủ vận hành hợp lệ;
4. phân công giảng dạy có hiệu lực;
5. association PPCT chính xác có hiệu lực theo ngày, exact PPCT version/item và trạng thái tiến độ của class-subject stream trước tiết đó;
6. bằng chứng thực thi nếu tiết đã diễn ra.

Đây mặc định là mô hình đọc có thể tái tạo, không phải nguồn sự thật mới để ghi đè các miền nguồn. Có thể materialize để tối ưu truy vấn chỉ khi vẫn đối soát và tái tạo được từ sự kiện/thực thể lịch sử.

Thứ tự ưu tiên đề xuất là: ngày gián đoạn toàn cục → hủy/nghỉ cục bộ → hoạt động đặc biệt có quyền chiếm tiết → dạy thay → lịch cơ sở. Xung đột cùng mức phải bị từ chối hoặc đưa vào hàng chờ xử lý; không chọn ngầm theo thời gian tạo. Đổi/chuyển/hoán đổi tiết không tham gia precedence cho đến khi có quyết định riêng.

### 4. Phân biệt giáo viên chịu trách nhiệm và giáo viên thực dạy

Phân công giảng dạy xác định giáo viên chịu trách nhiệm. Bằng chứng thực thi ghi giáo viên thực dạy. Dạy thay không chuyển quyền sở hữu phân công và không được làm mất lịch sử của cả hai vai trò.

### 5. Dạy bù phải mang nguồn gốc và đóng nợ đúng một lần

Dạy bù tham chiếu chính xác tiết/mục PPCT chưa hoàn thành đã tạo nợ. Nó không phân phối thêm mục PPCT mới. Một khoản nợ chỉ được đóng bởi một bằng chứng thực thi hợp lệ; thao tác lặp lại phải idempotent và cạnh tranh đồng thời phải được kiểm soát bằng ràng buộc dữ liệu hoặc giao dịch.

### 6. Tiến độ và nợ tiết là phép chiếu từ sự kiện lịch sử

Ba đại lượng phải được tách biệt:

- **đã phân phối:** mục PPCT đã được lịch hợp lệ tiêu thụ;
- **đã hoàn thành:** mục PPCT có bằng chứng dạy hợp lệ;
- **nợ mở:** mục đã phân phối nhưng chưa hoàn thành và chưa được một lần dạy bù hợp lệ đóng.

Các bộ đếm có thể được lập chỉ mục hoặc materialize, nhưng không được trở thành nguồn sự thật không thể đối soát. Báo giảng tiếp tục từ mục PPCT kế tiếp theo quy tắc phân phối, trong khi nợ cũ vẫn tồn tại độc lập.

### 7. Báo cáo chính thức là ảnh chụp bất biến

Báo cáo nháp có thể được tái tính từ dữ liệu nguồn. Khi nộp hoặc duyệt, hệ thống phải giữ một ảnh chụp bất biến hoặc manifest tham chiếu phiên bản đủ để tái tạo chính xác nội dung đã nộp. Thay đổi nguồn về sau không được âm thầm thay đổi báo cáo lịch sử.

Người nộp không được tự duyệt chính báo cáo đó. Tuyến duyệt, ủy quyền, cách sửa sau khóa và cơ chế snapshot cụ thể chưa được quyết định.

### 8. Quyền nghiệp vụ phải dùng capability và scope tường minh

Quyền quản lý PPCT dùng capability chuyên môn riêng `PPCT_MANAGE`, chỉ cho phép scope `SUBJECT` và `SCHOOL_WIDE`. Đây là quyết định kiến trúc; ADR này không seed hoặc triển khai capability. Subject-group leader cần quyền PPCT phải được cấp explicit grant cho `SUBJECT` tương ứng hoặc grant `SCHOOL_WIDE` được phê duyệt.

Theo ADR-008, không suy `PPCT_MANAGE` từ `SYSTEM_ADMIN`, role/title, `SubjectGroupMembership`, `AdditionalDuty`, `TeachingAssignment` hoặc grant `SUBJECT_GROUP`; không có inference giữa scope types. Với request theo subject, server phải resolve resource từ PPCT/domain resource bị tác động, không tin resource ID tùy ý trong body/query của client.

Capability và scope cho execution, operational overlays, special activities và reporting/approval vẫn là quyết định downstream.

### 9. Hoạt động đặc biệt là tổng hợp nghiệp vụ riêng

Hoạt động đặc biệt có phạm vi lớp/khối/toàn trường, nhiều giáo viên và quy tắc xác nhận riêng. Nó không được giả làm tiết dạy môn học, phân công giảng dạy hoặc dạy thay. Quy tắc xung đột với lịch môn học phải được quyết định trước triển khai.

### 10. Không sửa ngược lịch sử

Mọi chỉnh sửa có ảnh hưởng đến PPCT, lịch vận hành, thực thi, nợ hoặc báo cáo phải dùng phiên bản mới, sự kiện hiệu chỉnh hoặc bút toán đảo phù hợp. Không cập nhật tại chỗ làm thay đổi ý nghĩa của dữ liệu đã được dùng trong báo cáo hoặc phê duyệt.

## Ranh giới miền đề xuất

- **Curriculum/PPCT:** phiên bản và mục PPCT, hiệu lực, thứ tự.
- **Scheduling:** lịch nghiệp vụ, thời khóa biểu cơ sở và khả năng sẵn sàng PPCT.
- **Teaching Operations:** nghỉ, dạy thay, đổi/chuyển tiết, hoạt động đặc biệt.
- **Teaching Execution:** bằng chứng thực dạy, giáo viên thực dạy và nguồn dạy bù.
- **Progress & Debt:** phép chiếu đã phân phối, đã hoàn thành và nợ mở.
- **Reporting & Approval:** kỳ báo cáo, ảnh chụp nộp, duyệt và khóa.
- **Authorization & Audit:** capability, scope và nhật ký bất biến xuyên miền.

Các miền giao tiếp bằng định danh và hợp đồng phiên bản; không đọc/ghi trực tiếp bảng nội bộ của nhau để tạo coupling ẩn.

## Các quyết định cố ý chưa đưa ra

ADR này không quyết định:

1. tiêu chí “đủ PPCT” để công bố hoặc đánh giá operational readiness của thời khóa biểu;
2. ngoại lệ không tiêu thụ PPCT ngoài các trường hợp đã có nguồn;
3. quyền chiếm tiết, staffing và xử lý xung đột của hoạt động đặc biệt;
4. semantics đầy đủ của đổi/chuyển/hoán đổi tiết và precedence cuối cùng của mọi overlay;
5. cách xử lý khác biệt giữa nội dung kế hoạch với thực tế và correction workflow của execution;
6. dạy bù bổ sung không có debt trước đó và cách chọn vị trí thực hiện;
7. nợ tiết là projection thuần hay ledger được lưu kèm cơ chế đối soát;
8. nguồn dữ liệu tiết chủ nhiệm và hoạt động giáo dục khác;
9. cơ chế vật lý snapshot/immutable-manifest của báo cáo;
10. tuyến duyệt, ủy quyền, phân tách nhiệm vụ và sửa báo cáo sau nộp/duyệt/khóa;
11. capability/scope downstream ngoài `PPCT_MANAGE`;
12. chính sách lưu trữ, đóng năm và truy xuất lâu dài;
13. mọi hợp đồng API, schema, transaction, idempotency và UX chi tiết.

PPCT import được **deferred** sang lát cắt và audit kiến trúc/bảo mật riêng khi có workbook/template/workflow được phê duyệt. 05A1 không được encode layout, sheet, alias, column mapping, checksum, profile, raw-file contract, replay namespace, semantic duplicate rule hoặc giả định từ timetable XLSX import.

## Hệ quả

- Thực thi phải tiến theo lát cắt dọc nhưng giữ ranh giới miền và tham chiếu lịch sử.
- Báo cáo không được truy vấn tùy tiện dữ liệu hiện tại rồi gọi đó là lịch sử.
- Tính đúng của tiến độ/nợ phụ thuộc vào idempotency, cạnh tranh đồng thời và provenance xuyên miền.
- UI chỉ nên được chốt sau khi các hợp đồng backend cốt lõi ổn định và đạt cổng CORE BACKEND FREEZE.
- Việc materialize read model là tối ưu kỹ thuật, không thay đổi nguồn sự thật.

## Cổng triển khai LOCAL-FC-05A1

**READY về architecture entry criteria.** 05A0D đã đóng đầy đủ bảy điều kiện về aggregate/sharing, item identity/cardinality, lifecycle/effectivity, calendar/association, historical references, authorization và import boundary. Trạng thái READY chỉ cho phép một task riêng thiết kế/triển khai 05A1 theo các quyết định đã chấp nhận; nó không cho phép schema/API/runtime implementation trong 05A0D.

## Ngoài phạm vi

ADR này không thay đổi source code, schema, migration, seed, hợp đồng API, dependency, CI/CD, hạ tầng, dữ liệu hay giao diện người dùng. PPCT import và mọi UI business semantics vẫn nằm ngoài phạm vi; UI chỉ được đi sau `CORE BACKEND FREEZE` của các contract tương ứng.
