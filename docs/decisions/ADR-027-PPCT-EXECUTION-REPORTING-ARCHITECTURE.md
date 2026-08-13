# ADR-027: Kiến trúc PPCT, thực thi giảng dạy và báo cáo

- **Trạng thái:** Proposed
- **Ngày:** 2026-08-13
- **Phạm vi:** Quyết định kiến trúc; chưa cho phép triển khai schema, API hoặc UI
- **Audit nguồn:** `docs/requirements/LOCAL-FC-05A0-PPCT-TEACHING-EXECUTION-REPORTING-ARCHITECTURE-AUDIT.md`

## Bối cảnh

Đặc tả v1.2 xác lập chuỗi nghiệp vụ từ phân phối chương trình (PPCT), thời khóa biểu, điều chỉnh vận hành, thực thi giảng dạy, tiến độ/nợ tiết đến báo cáo và duyệt báo cáo. Nền tảng hiện tại đã có năm học, lịch nghiệp vụ, phân công giảng dạy, tiết học, thời khóa biểu và nhập XLSX an toàn; các miền PPCT, thực thi, nợ tiết và báo cáo chưa được triển khai.

Các quyết định dưới đây chỉ ghi nhận phần kiến trúc đã có đủ bằng chứng. Những điểm chưa rõ vẫn là điều kiện chặn trước khi bắt đầu lát cắt triển khai LOCAL-FC-05A1.

## Quyết định đề xuất

### 1. PPCT là miền độc lập, có phiên bản bất biến

PPCT không phải là thuộc tính của thời khóa biểu. Một phiên bản PPCT sở hữu tập mục PPCT có thứ tự, tên bài/chủ đề, loại bài và hiệu lực lịch sử. Khi đã được dùng làm căn cứ nghiệp vụ, phiên bản không bị sửa ngược; điều chỉnh tạo phiên bản mới và bảo toàn tham chiếu lịch sử.

Khóa tổng hợp chính xác của PPCT, quy tắc dùng chung giữa các lớp và cơ chế ngoại lệ theo lớp chưa được quyết định trong ADR này.

### 2. Tách lịch cơ sở khỏi điều chỉnh vận hành

Thời khóa biểu đã công bố là lịch cơ sở. Gián đoạn/ngoại lệ cục bộ, hủy tiết, dạy thay, dạy bù và hoạt động đặc biệt là các lớp phủ vận hành có nguồn gốc, hiệu lực và lịch sử riêng. Không sửa ngược thời khóa biểu cơ sở để phản ánh sự kiện thực tế. Đổi/chuyển/hoán đổi tiết vẫn chưa đủ semantics để trở thành quyết định.

### 3. “Tiết được phân giải” là hợp đồng đọc chuẩn

Một tiết được phân giải (resolved teaching occurrence) là kết quả xác định theo ngày nghiệp vụ từ:

1. phiên bản lịch nghiệp vụ có hiệu lực;
2. thời khóa biểu cơ sở có hiệu lực;
3. các lớp phủ vận hành hợp lệ;
4. phân công giảng dạy có hiệu lực;
5. PPCT có hiệu lực và trạng thái tiến độ trước tiết đó;
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

Quyền PPCT, ghi nhận thực thi, rà soát chuyên môn, quản lý vận hành và duyệt báo cáo phải đi qua capability cùng phạm vi dữ liệu rõ ràng. Không suy quyền từ chức danh, tư cách thành viên đơn thuần hoặc quyền quản trị hệ thống.

Tên capability và ma trận scope trong audit là ứng viên, chưa phải hợp đồng được chấp nhận.

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

1. khóa tổng hợp PPCT chính xác và phạm vi năm học/môn/khối/chương trình;
2. một PPCT dùng chung giữa nhiều lớp hay có biến thể/ghi đè theo lớp;
3. quan hệ sở hữu giữa PPCT và phiên bản lịch nghiệp vụ;
4. định danh mục PPCT qua các phiên bản và quy tắc tách/gộp mục;
5. vòng đời soạn thảo, công bố, thay thế, hiệu lực và hiệu chỉnh PPCT;
6. hợp đồng, mẫu tệp và semantics nhập PPCT;
7. cách phân bổ tuần PPCT và ngoại lệ theo lịch địa phương;
8. tiêu chí “đủ PPCT” để công bố thời khóa biểu;
9. ngoại lệ không tiêu thụ PPCT ngoài nghỉ cục bộ và ngày gián đoạn;
10. quyền chiếm tiết và xử lý xung đột của hoạt động đặc biệt;
11. semantics đầy đủ của đổi/chuyển/hoán đổi tiết;
12. số lượng bản ghi thực thi trên một tiết và xử lý khác biệt giữa kế hoạch với thực tế;
13. dạy bù bổ sung ngoài lịch cơ sở và cách chọn vị trí thực hiện;
14. nợ tiết là projection thuần hay ledger được lưu kèm cơ chế đối soát;
15. ảnh hưởng của phiên bản PPCT mới đến nợ đang mở;
16. nguồn dữ liệu tiết chủ nhiệm và hoạt động giáo dục khác;
17. cơ chế snapshot/manifest cụ thể của báo cáo;
18. tuyến duyệt, ủy quyền và phân tách nhiệm vụ;
19. sửa báo cáo sau nộp/duyệt/khóa;
20. tên capability và tập scope cuối cùng;
21. chính sách lưu trữ, đóng năm và truy xuất lâu dài;
22. mọi hợp đồng API, schema và UX chi tiết.

## Hệ quả

- Thực thi phải tiến theo lát cắt dọc nhưng giữ ranh giới miền và tham chiếu lịch sử.
- Báo cáo không được truy vấn tùy tiện dữ liệu hiện tại rồi gọi đó là lịch sử.
- Tính đúng của tiến độ/nợ phụ thuộc vào idempotency, cạnh tranh đồng thời và provenance xuyên miền.
- UI chỉ nên được chốt sau khi các hợp đồng backend cốt lõi ổn định và đạt cổng CORE BACKEND FREEZE.
- Việc materialize read model là tối ưu kỹ thuật, không thay đổi nguồn sự thật.

## Cổng triển khai LOCAL-FC-05A1

**BLOCKED.** LOCAL-FC-05A1 chỉ được bắt đầu sau khi có quyết định được chấp nhận tối thiểu về:

- khóa tổng hợp PPCT và quy tắc dùng chung/ngoại lệ theo lớp;
- định danh mục PPCT qua phiên bản và quy tắc tách/gộp;
- vòng đời, công bố, thay thế và hiệu lực PPCT;
- quan hệ PPCT với năm học, lịch nghiệp vụ và tuần nghiệp vụ;
- tham chiếu lịch sử bắt buộc từ lịch/thực thi/báo cáo;
- capability và scope quản lý PPCT;
- ranh giới nhập PPCT (triển khai ngay hay hoãn sang lát cắt riêng).

Việc chuyển ADR này sang Accepted chỉ hợp lệ khi các điểm trên được quyết định rõ hoặc được tách thành ADR phụ đã Accepted. Trạng thái Proposed hiện tại không cấp quyền triển khai.

## Ngoài phạm vi

ADR này không thay đổi source code, schema, migration, seed, hợp đồng API, dependency, CI/CD, hạ tầng, dữ liệu hay giao diện người dùng.
