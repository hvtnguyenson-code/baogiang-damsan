# P5-057 — Kế hoạch hoàn thiện Báo giảng theo 4 giai đoạn

**Ngày quyết định thứ tự:** 03/11/2026 (Product Owner chấp thuận trong trao đổi).
**Trạng thái:** ĐÃ CHỐT THỨ TỰ. **D1 PHƯƠNG ÁN B ĐƯỢC PRODUCT OWNER CHỐT 05/11/2026:** PHT trực tiếp quyết định và cấu hình mọi nghiệp vụ chuyên môn trong phạm vi phụ trách; Admin kỹ thuật không nhập/cấp quyền chuyên môn thay PHT. D3 đã chốt một phần (01 PHT chuyên môn chính; Admin tạo tài khoản và gán mẫu ban đầu); D2/D4/D5/D6 và chi tiết chuyển giao/thu hồi D3 vẫn OPEN. Không sửa runtime/auth/schema khi chưa chốt; P5-057 IN_PROGRESS.
**Phạm vi:** duy nhất repository `hvtnguyenson-code/baogiang-damsan`.
**Task chính đang có:** `P5-057` / traceability `T56`; `P6-050` là cổng pilot riêng, **không** tính hoàn thành chỉ nhờ CI xanh.
**Định hướng:** **REALIGN, NOT REBUILD** — giữ nguyên các domain, persistence, security/history đã được phê duyệt.

## 1. Tài liệu và thứ tự thẩm quyền

Đọc theo thứ tự bắt buộc trước mọi task:
1. `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md`;
2. `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md` và `PRE-PILOT-TRACEABILITY-MATRIX.md`;
3. ADR đã chấp thuận, đặc biệt ADR-008, ADR-012/013/014, ADR-044 và những ADR liên quan đến TKB, PPCT, GDĐP/HĐTN;
4. `docs/specifications/PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx`, nhất là mục 2, 3, 14, 15;
5. `docs/requirements/P5-050-PRODUCT-OPERABILITY-UX-REALIGNMENT-ARCHITECTURE.md`, `docs/requirements/P5-057-PERSONA-OPERABILITY-E2E-FREEZE.md`, `DESIGN.md`;
6. backend/frontend/tests trên commit chính xác của task.

Không sử dụng mã nguồn hiện tại hoặc bản prototype để âm thầm thu hẹp đặc tả. Nếu quyết định Product Owner mới khác thiết kế cũ, phải ghi **diff chính sách**, đánh giá ảnh hưởng và phê duyệt trước khi can thiệp.

## 2. Nguyên tắc bất biến

- Nhân sự chuyên môn (kể cả HT/PHT) có nền tảng công việc giáo viên; capability và phạm vi có hiệu lực, cộng dồn; backend **default-deny**.
- Chức danh, tổ, môn, nhiệm vụ kiêm nhiệm và phân công lớp là dữ liệu nghiệp vụ; không tự động tạo quyền API. `SYSTEM_ADMIN` không mặc nhiên có quyền chuyên môn.
- Admin kỹ thuật quản trị vòng đời tài khoản; **PHT là người quyết định các quyền và phân công chuyên môn theo chỉ đạo Product Owner**. Cách thể hiện quyết định PHT thành quyền cấp/phê duyệt thực tế cần thiết kế tối thiểu, không cấp `CAPABILITY_GRANT/SCHOOL_WIDE` tổng quát cho PHT.
- Tổ trưởng chỉ quản lý phạm vi được giao; điều phối GDĐP/HĐTN dùng đúng ACTIVITY/programme scope; không tự nâng quyền.
- Bảo toàn lịch sử TKB, PPCT, TeachingAssignment, báo giảng, bảng kê và audit; không sửa/dọn dữ liệu thật để hợp thức hóa UX.
- Tận dụng API, mẫu trách nhiệm và importer đã tồn tại; không viết engine nhập liệu, ma trận quyền hay source of truth thứ hai.
- Quản trị theo tác vụ thường ngày: không yêu cầu UUID/capability key/đường dẫn kỹ thuật; tất cả ghi dữ liệu nghiệp vụ quan trọng có preview, hậu quả, xác nhận, audit.
- Không đụng Quản lí Nội trú; không đọc/ghi database khác, VPS, service, Nginx hay workflow CI/CD khi không có quyết định riêng.

## 3. Thứ tự 4 giai đoạn đã được Product Owner thống nhất

### Giai đoạn 1 — KHÓA NGHIỆP VỤ (gói việc 1)

**WS1. Ma trận thẩm quyền và luồng quyết định chuyên môn.**
- Đối chiếu bản v1.2/v1.3, P5-050, ADR-008, các capability/controller, template trách nhiệm.
- Tách rõ ba khái niệm: (i) Admin tạo/cập nhật hồ sơ và ghi nhận vai trò, (ii) PHT **quyết định/phê duyệt** nghiệp vụ chuyên môn, (iii) người có capability thực hiện API.
- Chốt phạm vi PHT, HT, Tổ trưởng, GV, điều phối, admin kỹ thuật; RACI tạo/sửa/thu hồi; quy tắc ủy quyền, hết hạn, chống tự duyệt/tự cấp.
- Sản phẩm: `docs/requirements/P5-057-ACADEMIC-AUTHORITY-MATRIX-DRAFT.md`, bảng đối chiếu nguồn và phương án tương thích ngược. Chỉ khi chính sách được chốt mới chuyển giai đoạn 2.
- **Không sửa auth/schema ở WS1**; mọi điểm chưa quyết định phải đánh dấu OPEN, không suy đoán.

### Giai đoạn 2 — HOÀN THIỆN QUẢN TRỊ (gói việc 2–6)

**WS2. Phân công nhiều lớp — đã triển khai kỹ thuật PR #263.** Merge `bd79173a1180c26cbd33555ff081c015ef515bff`, main CI #891, auto-deploy #37, VPS #33 SUCCESS 06/11/2026. Vẫn cần UAT Admin thật, kiểm tra preview/race/tải trên dữ liệu phù hợp; chưa đóng toàn bộ P5-057.

**WS3. Hồ sơ nhân sự và mẫu quyền theo chức trách.** Tận dụng UsersPage, P5-051 responsibility template; chọn nhân sự → vai trò, tổ, môn, kiêm nhiệm → preview hiệu lực → xác nhận; hạn chế thao tác cấp quyền thủ công. Không đổi capability thành role hardcode.

**WS4. PHT quyết định và ủy quyền chuyên môn.** Thiết kế command quyền chuyên môn allowlist + phạm vi tối thiểu, tách khỏi `CAPABILITY_GRANT` kỹ thuật; rõ người quyết định/người nhập liệu; backend deny mặc định, chống tự nâng quyền, revoke/effectivity/audit; có kiểm thử negative và rollback. Chỉ implement sau WS1.

**WS5. Phân công nhiều môn/lớp và đối chiếu TKB.** Nhiều lớp/môn cho GV trong một quy trình; tìm kiếm/lọc; gợi ý từ nguồn nhập đã được xác nhận nhưng **không tự tạo quyền**; kiểm tra xung đột và trả lỗi đúng lớp/môn. Giữ `TeachingAssignment` từng quan hệ và lịch sử.

**WS6. Phạm vi Tổ trưởng/Điều phối.** Soát lại phép thử cross-group/cross-activity; chỉ sửa điểm thiếu từ nghiệm thu thực tế; tái sử dụng `P4-030` và các rule đã chốt. Không mở rộng quyền BGH/technical ngoài phạm vi được phê duyệt.

**Cổng cuối giai đoạn 2:** Admin tạo nhân sự nhanh; PHT có thể ra quyết định nghiệp vụ được ghi nhận và thực thi đúng scope; Tổ trưởng/GV/điều phối chỉ thấy và thao tác việc được giao. Backend/DB vẫn an toàn; regression PASS.

### Giai đoạn 3 — SỬA KHẢ NĂNG SỬ DỤNG (gói việc 7)

**WS7. Audit thao tác thực tế và sửa UX có giới hạn.**
- Kiểm kê nhiệm vụ thường ngày 7 persona; sửa các điểm blocked/khó tìm/rườm rà, sử dụng tiếng Việt rõ ràng, desktop 1366×768, Android, bàn phím, 200% zoom.
- Mỗi sửa đổi truy vết đến màn hình và nghiệp vụ cụ thể, không chỉnh lại kiến trúc diện rộng; không dùng mock để tuyên bố hoạt động thật.
- Giữ loading, empty, error, permission denied, session expiry; không phơi UUID/capability kỹ thuật.

### Giai đoạn 4 — NGHIỆM THU (gói việc 8)

**WS8. Đóng `P5-057`/T56 theo persona E2E.**
- Bảy persona: Giáo viên; Tổ trưởng; PHT; Hiệu trưởng; Admin; Điều phối GDĐP; Điều phối HĐTN-HN.
- Test đúng tài khoản/quyền, desktop và thiết bị/viewport Android, truy cập bằng menu thật, thực hiện backend command thật trong test DB cô lập; hồi quy xuyên nghiệp vụ.
- Bằng chứng: scenario matrix, ảnh/biên bản, log kiểm thử, độc lập review, CI exact-head, CI main sau merge, documentation sync; **0 lỗi HIGH/CRITICAL** chưa giải quyết.
- `P6-050` là nhiệm vụ **sau** WS8, có yêu cầu go/no-go và rollback riêng. Không gộp thành tuyên bố đóng P5-057.

## 4. Cổng thực thi, tiết kiệm CI và rollback

1. Một phạm vi nhỏ, một nhánh, một PR; không sửa `main` trực tiếp và không chồng thay đổi vào PR #263 không liên quan.
2. Trước sửa: Git status sạch, HEAD xác định, đọc đặc tả và mã nguồn thật; thiết kế test/rollback.
3. Dùng **DamSan MCP G3** tại `D:\baogiang-damsan` (Project ID `folder-39c13e5f-25ac-418d-8daf-ad0cb1a6c42c`). Quyền chỉ sau consent trên laptop; không dùng Desktop Commander local.
4. Local: format/lint/typecheck/targeted tests và kiểm tra diff; nếu database cần dùng môi trường test cô lập. **Không dùng PostgreSQL VPS để test.**
5. Chỉ khi local đạt mới push một lần để kích hoạt CI; nếu đỏ, đọc root cause và sửa local rồi mới push hotfix; không spam rerun.
6. CI xanh → review diff + kiểm chứng nghiệp vụ + chỉ thị merge → merge một lần → auto-CD theo workflow **đã có**; tuyệt đối không tự thay đổi CI/CD.
7. Trước migration/production mutation phải có backout và quyết định riêng; rollback ưu tiên revert commit hoặc phục hồi release **chỉ của Báo giảng**, không động đến dịch vụ Nội trú. Không tự chạy rollback production.
8. Mỗi task update `PRE-PILOT-TASK-REGISTER.md`, `CURRENT-PROJECT-STATUS.md`, traceability và handoff theo giao thức documentation sync; **CI xanh/merged không tự động đồng nghĩa CLOSED**.

## 5. Trạng thái kiểm kê khi khởi động ngày 03/11/2026

- MCP G3 trên thiết bị `NGUYENSON` đã được xác nhận; project root `D:\baogiang-damsan` có trong registry.
- Git ban đầu: `feat/p5-057-admin-bulk-teaching-assignments@e9dfb399f73b20ee45ed30408f46964e979636c6`, working tree sạch.
- PR #263: ĐÃ MERGE/DEPLOY code-only 06/11/2026 sau CI #890/#891 và compatibility #97 SUCCESS; đây không phải P5-057 closure.
- Đã tách nhánh docs riêng `docs/p5-057-four-stage-realignment` từ `origin/main@85c406572400789fab5d3ec693a67d05528a9fec`.
- WS1 bắt đầu bằng bản ma trận dự thảo; **chưa được phép sửa quyền backend trước khi chốt chi tiết**.
- Các WS2–WS8 là **gói công việc đề xuất** dưới P5-057, không tự tạo mã số task chính thức mới trong register. P5-051–P5-056 đã đóng ở phạm vi kỹ thuật; không mở lại khi không có bằng chứng.
