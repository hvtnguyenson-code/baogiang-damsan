# P5-057 / WS1 — Ma trận thẩm quyền nghiệp vụ chuyên môn (DỰ THẢO ĐỐI CHIẾU)

**Trạng thái:** DRAFT tổng thể WS1; **D1 CHỐT PHƯƠNG ÁN B bởi Product Owner ngày 05/11/2026**. D2–D6 OPEN, chưa sửa chính sách backend đang chạy.
**Ngày lập:** 03/11/2026.
**Phạm vi:** Báo giảng; chuẩn bị Giai đoạn 1 của `docs/tasks/P5-057-FOUR-STAGE-OPERABILITY-EXECUTION-PLAN.md`.
**Không thực hiện trong tài liệu này:** cấp/thu hồi quyền thật, đổi role từ danh xưng, schema, migrations, sửa code, VPS/deploy.

## 1. Bằng chứng nguyên gốc và mâu thuẫn cần giải quyết

| Nguồn/điểm | Bằng chứng | Cách hiểu bắt buộc |
| --- | --- | --- |
| Phương án B v1.2 §2, §3.1, §3.3 | TEACHER_BASE + capability/scope cộng dồn và hiệu lực; backend quyết định | Chức danh không phải API permission; HT/PHT vẫn làm việc giáo viên |
| Phương án B v1.2 §3.2, §14.1 | ADMIN_TAI_KHOAN tạo, Active/Inactive, gán tổ/môn/vai trò/kiêm nhiệm | Admin vẫn có tác vụ quản trị hồ sơ; phải phân biệt **ghi nhận** với **quyết định chuyên môn** |
| Phương án B v1.2 §3.4 | HT/PHT gửi bảng kê cá nhân qua Tổ trưởng, không tự duyệt | Không phá tuyến duyệt vì PHT là quản trị nghiệp vụ |
| v1.3 + ADR-008 + P5-050 | default-deny, role/title không cấp quyền; responsibility templates materialize grant, không lập engine thứ hai | Giữ evaluator và capability hiện tại, không hardcode tên vai trò |
| ADR-012 | Nhiều lớp/môn cùng lúc hợp lệ; một lớp–môn tại một ngày chỉ một GV; hiệu lực lịch sử giữ nguyên | Bulk UI không đổi business identity, không cho co-teaching ngầm |
| `responsibility-template-catalog.ts` | `VICE_PRINCIPAL_ACADEMIC` có `SUBJECT_MANAGE/SCHOOL_WIDE`, mặc định cấm `CAPABILITY_GRANT` | PHT có quyền thao tác một số nghiệp vụ nhưng không có generic grant |
| `responsibility-templates.controller.ts` và `capabilities.controller.ts` | toàn controller yêu cầu `CAPABILITY_GRANT/SCHOOL_WIDE` | PHT không thể tự chạy UI cấp mẫu quyền theo định nghĩa hiện tại |
| Chỉ đạo Product Owner 01/11/2026 | PHT là admin nghiệp vụ, **mọi quyết định phân quyền chuyên môn thuộc PHT**; Admin quản lý tài khoản kỹ thuật | Là yêu cầu mới cần chốt cách hiện thực và traceability; **không** suy ra được phép tự cấp `CAPABILITY_GRANT` tổng quát |
| P5-057 persona gate | Mọi persona phải hoàn thành công việc thật, đúng quyền, không raw UUID/capability key | Cần E2E phủ cả người ra quyết định và người ghi nhận giao dịch |

## 2. Ma trận phân tách quyết định và thao tác

Ký hiệu: **Q** = quyết định/phê duyệt nghiệp vụ; **T** = thực hiện thao tác theo quyền hợp lệ; **X** = xem/giám sát; **—** = không tự có quyền. Đây là ma trận **đề xuất chờ review**; backend hiện thời có thể chưa chặn đầy đủ.

| Nghiệp vụ | Admin tài khoản / kỹ thuật | PHT chuyên môn | Hiệu trưởng | Tổ trưởng | GV | Điều phối |
| --- | --- | --- | --- | --- | --- | --- |
| Tạo/kích hoạt/khóa/reset tài khoản | T | X | X | — | — | — |
| Ghi tổ/môn/kiêm nhiệm và trách nhiệm chuyên môn | Chỉ quản lý thông tin tài khoản kỹ thuật; không cấu hình chuyên môn | **Q/T trực tiếp** | Giám sát theo D4 | Đề xuất trong tổ | — | Đề xuất phạm vi |
| Phê duyệt phân công GV dạy môn/lớp | Không tự quyết định | **Q**, T khi có quyền | X | đề xuất | X phần mình | — |
| Điều chỉnh phân công/hiệu lực lịch sử | **—** (không cấu hình) | **Q/T trực tiếp** | X | Đề xuất có phạm vi | — | — |
| Cấp/đổi/thu hồi **capability chuyên môn** | **—** (không cấp thay PHT) | **Q/T trực tiếp**, backend allowlist sẽ thiết kế | X | Đề xuất phạm vi tổ | — | — |
| Cấp/thu hồi capability kỹ thuật (USER_MANAGE, SYSTEM_ADMIN, CAPABILITY_GRANT, secrets) | T theo quy trình riêng | — | X theo quy định | — | — | — |
| Điều hành TKB, PPCT, ngoại lệ, dạy thay/bù | — nếu không được giao quyền nghiệp vụ | Q/T theo capability có hiệu lực | X/duyệt theo thẩm quyền | T phạm vi tổ đã giao | T phạm vi cá nhân | T phạm vi chương trình |
| Duyệt bảng kê cá nhân của HT/PHT | Không | Không tự duyệt | Không tự duyệt | T đúng tổ đang có hiệu lực | — | — |
| Duyệt bảng kê của Tổ trưởng | Không | T theo capability duyệt BGH | T theo capability duyệt BGH | Không tự duyệt | — | — |
| Giao/điều hành GDĐP, HĐTN-HN | Không mặc định | Q/T theo scope và chính sách đã chốt | X/T theo capability đã cấp | Chỉ khi có grant | — | T đúng ProgrammeMaster/ACTIVITY |

**Điểm cần khóa:** ranh giới "Admin gán vai trò" từ §14.1 với "PHT quyết định phân quyền chuyên môn" từ Product Owner. Trường hợp thực thi kỹ thuật không đồng nghĩa quyền tự quyết; phải có bằng chứng `approvedBy` hoặc giao dịch cấp quyền giới hạn gắn với PHT.

## 3. D1 ĐÃ CHỐT B; D2–D6 còn OPEN (chưa cho phép sửa code)

**D1 — ACCEPTED: PHƯƠNG ÁN B (05/11/2026).** PHT trực tiếp **quyết định và cấu hình tất cả nghiệp vụ chuyên môn** trong phạm vi thẩm quyền qua giao diện/command nghiệp vụ kiểm soát chặt chẽ: phân công GV/môn/lớp, TKB, PPCT, nghiệp vụ giảng dạy, quyền chuyên môn, GDĐP/HĐTN-HN. Admin quản trị tài khoản/hạ tầng kỹ thuật, **không quyết định hoặc cấu hình chuyên môn thay PHT**. Không cấp `CAPABILITY_GRANT/SCHOOL_WIDE` hoặc quyền kỹ thuật tổng quát cho PHT. D2–D6 vẫn OPEN để chốt phạm vi PHT, backend deny, vai trò HT, ủy quyền, chính sách nguồn dữ liệu; chưa được sửa runtime.

**D2 — Cách chặn Admin tự cấp quyền chuyên môn.** Hiện generic `CAPABILITY_GRANT` có thể cho phép thao tác rộng; chỉ cấm nút trên UI là không đủ. Cần xác định authority kiểm tra ở backend, bootstrap/recovery account và quy trình cấp cứu mất PHT.

**D3 — PARTIAL ACCEPTED (05/11/2026):** Có **hai mẫu PHT tách biệt**: `VICE_PRINCIPAL_ACADEMIC` (PHT phụ trách chuyên môn, được quyết định và cấu hình chuyên môn trong scope hợp lệ) và `VICE_PRINCIPAL` (PHT thông thường, **không có quyền chuyên môn mặc định**). Đây là hai Responsibility Template trên cùng engine capability, **không phải role-check thay thế guard**. Thiết kế và kiểm thử trong `docs/requirements/P5-057-WS1-D3-VICE-PRINCIPAL-ROLE-TEMPLATES.md`. **D3 vẫn OPEN phần còn lại:** số lượng PHT chuyên môn, phạm vi phụ trách, nhiệm kỳ, cơ chế chuyển đổi và bổ nhiệm.

**D4 — Vai trò Hiệu trưởng.** Giữ giám sát/phê duyệt riêng; xác định trường hợp quyền override hay phê duyệt thứ hai, không mặc nhiên gộp làm PHT.

**D5 — Quyết định/ủy quyền khi cùng vai trò.** Ai có thể thay đổi quyền của chính mình hoặc người có quyền tương đương? Mặc định chống tự cấp/tự duyệt và lập audit đầy đủ.

**D6 — Nguồn phân công.** TKB/import hỗ trợ gợi ý môn/lớp nhưng không được tự động thay thế quyết định chuyên môn; xử lý trùng/không rõ tên/đổi lịch với người quyết định.

D1 đã được ghi vào `P5-057-WS1-ACADEMIC-AUTHORITY-DECISION-RECORD-DRAFT.md` theo phương án B. D2–D6 vẫn phải được chốt trong hồ sơ quyết định trước khi sửa source. Không thay đổi các ADR đã chấp thuận chỉ để hợp thức hóa cách làm mới.

## 4. Kiểm tra bắt buộc trước khi cho phép WS4/WS5

- Có thể tạo PHT, áp dụng template, đăng nhập, xem được công việc của giáo viên và quản trị nghiệp vụ mà không có quyền kỹ thuật.
- Admin kỹ thuật **không thể quyết định một mình** việc cấp capability chuyên môn; backend từ chối khi thiếu nguồn quyết định hợp lệ.
- PHT có quyền chuyên môn được duyệt **không thể** tự cấp SYSTEM_ADMIN/USER_MANAGE/CAPABILITY_GRANT, tự nâng quyền hoặc cấp ngoài phạm vi.
- Tổ trưởng không thể đọc/đổi quyền của tổ khác; điều phối không thể thao tác programme khác.
- Không tự duyệt bảng kê, nhất là HT/PHT; vẫn đi qua Tổ trưởng theo §3.4.
- Một giáo viên nhiều lớp/môn: preview, xung đột, hiệu lực, rollback nguyên tử và audit đúng từng dòng.
- Không phá các tests hiện hữu: auth/CSRF, capability evaluator, P5-051 templates, TeachingAssignment, PPCT/TKB/reporting/special-programme.
- Audit cả người **ra quyết định** và người **thực thi**, kể cả thu hồi và lịch sử có hiệu lực.

## 5. Thao tác kế tiếp được phép ở giai đoạn 1

1. Đánh dấu D1–D6 và đối chiếu với quyền backend hiện có, không tự chọn giải pháp đòi migration.
2. Lập decision record về RACI và mô hình nghiệp vụ, trình Product Owner phê duyệt trước thay đổi auth.
3. Chỉ sau đó lập thiết kế tối thiểu cho WS2–WS6, với test matrix, rollback và bounded PR.
4. Giữ PR #263 độc lập; không thêm thay đổi thẩm quyền vào PR đang xanh nhưng chưa merge.

**Ghi chú:** Đây là tài liệu kiến trúc và nghiệm thu, không phải một capability-grant hay phép thay đổi quyền tự động.
