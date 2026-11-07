# P5-057 / WS1 — Quyết định PO D2–D6 và cổng triển khai

**Ngày quyết định:** 07/11/2026. **Người quyết định:** Product Owner (xác nhận trực tiếp trong hội thoại). **Phạm vi:** Báo giảng `hvtnguyenson-code/baogiang-damsan`, task `P5-057`, traceability `T56`. **Code baseline khi ghi nhận:** `main@e729dc3e22f5b5094b13a55ca61eef7902a94d32` (PR #269 đã deploy).

**Trạng thái:** **ACCEPTED — BUSINESS PRINCIPLES** cho D2–D6; **IMPLEMENTATION DETAILS / SECURITY GATES OPEN**. Quyết định mới thay thế *các mệnh đề chính sách xung đột* trong bản dự thảo/đối chiếu ngày 05–06/11/2026; không hồi tố diễn giải bằng chứng mã nguồn và không mặc nhiên biến đề xuất kỹ thuật thành quyền đã được phê duyệt. D1 Phương án B (05/11) giữ nguyên. **WS1/P5-057 chưa CLOSED; P6-050 vẫn BLOCKED.**

## 1. Quy tắc nghiệp vụ được PO chốt

| Mã | Quyết định có hiệu lực về **chính sách** | Biên giới không được tự suy diễn |
|---|---|---|
| **D2 — Admin và PHT** | Admin tạo/duy trì tài khoản, gán mẫu trách nhiệm **ban đầu theo quyết định nhân sự**; sau bước khởi tạo, PHT phụ trách chuyên môn quản lý các thay đổi **quyền chuyên môn**. | Admin không quyết định chuyên môn, không tự bổ nhiệm/tự cấp; gán mẫu không cho phép cấp capability tùy ý; PHT không được trao `CAPABILITY_GRANT/SCHOOL_WIDE` hay quyền kỹ thuật. |
| **D3 — Chuyển giao chức trách** | Thay đổi có hiệu lực **ngay khi người có thẩm quyền xác nhận**. | Xác nhận phải thuộc đúng người và đúng phạm vi; thu hồi **chỉ** grant có nguồn gốc từ chức trách kết thúc; giữ grant độc lập, `TEACHER_BASE` và lịch sử. Không tự suy đoán nguồn quyền cũ. |
| **D4 — Hiệu trưởng** | Hiệu trưởng được **tự kích hoạt can thiệp khẩn cấp**, không cần PHT duyệt trước; bắt buộc ghi lý do, thời hạn và **thông báo cho PHT**. | Không biến thành quyền chuyên môn thường trực hoặc quyền generic cấp grant; phải giới hạn phạm vi, có cơ chế tự hết hạn, audit, hậu kiểm và thu hồi. Chưa chốt thời hạn tối đa/trường hợp khẩn cấp. |
| **D5 — Thẩm định và chống tự duyệt** | Giữ tuyến **TTCM thẩm định bảng kê cá nhân của BGH**; chặn tự duyệt và tự cấp quyền. | Backend phải kiểm tra actor–subject–scope; không cấp `APPROVAL_PRINCIPAL`/`APPROVAL_VICE_PRINCIPAL` toàn trường cho TTCM để lách tuyến. Vẫn phải thiết kế trường hợp cùng người, thiếu TTCM hợp lệ và người phê duyệt cuối. |
| **D6 — TKB phê duyệt trước** | Cho phép **tự cập nhật phân công giảng dạy** từ **nguồn TKB đã được PHT phê duyệt trước**. | Không tự cấp capability kỹ thuật/quản trị; không coi mọi lần import sau là đã phê duyệt; phải ràng buộc bằng chứng PHT với nội dung/phiên bản/phạm vi dữ liệu và từ chối bản thay đổi ngoài phê duyệt. |

**Bổ sung quyết định D2–D3 về người gán bổ nhiệm và miễn nhiệm (07/11/2026):** **Ai có quyền bổ nhiệm thì có quyền miễn nhiệm** chức trách tương ứng trên hệ thống. Cụ thể: **PHT gán bổ nhiệm/miễn nhiệm TTCM; Admin gán bổ nhiệm/miễn nhiệm PHT**. Quy tắc cụ thể này ưu tiên so với câu khái quát “Admin gán mẫu ban đầu”: Admin có thể tạo tài khoản/hồ sơ cho TTCM nhưng không tự bổ nhiệm/miễn nhiệm TTCM; PHT không thể tự bổ nhiệm/miễn nhiệm PHT. Tất cả thao tác phải có căn cứ nhân sự, đúng actor/target/scope; vẫn cấm tự bổ nhiệm, tự nâng quyền và thu hồi grant độc lập khi miễn nhiệm. **Quyền thao tác trên hệ thống không đồng nghĩa thẩm quyền ký quyết định hành chính**.

**Giải thích D6 so với bản ngày 06/11:** trước đây, importer TKB chỉ gợi ý và PHT xác nhận từng thay đổi. Từ quyết định 07/11, cập nhật `TeachingAssignment` có thể tự thực hiện sau khi đã có phê duyệt PHT hợp lệ cho nguồn TKB tương ứng. **Đây là thay đổi chính sách có kiểm soát**, không đồng nghĩa `import file = approved` hoặc `TKB ACTIVE = authorization`. Việc phê duyệt phân công không phát sinh `CapabilityGrant` tùy ý. Các bất biến lịch sử TKB, PPCT, phân công theo thời gian vẫn được giữ.

## 2. Các sự thật mã nguồn đã kiểm tra (không nhận là đã khắc phục)

1. `AccessBaselineService.applyTemplate()` hiện **add-only**, không tự thu hồi grant cũ. PR #269 chỉ bổ sung **preview read-only** cho grant ngoài mẫu, `provenanceVerified=false`, `revocationAvailable=false`; không phải command chuyển chức vụ.
2. `CapabilitiesService.create/revoke` và các controller đang dựa chủ yếu vào `CAPABILITY_GRANT/SCHOOL_WIDE`; chưa có kiểm tra phân quyền theo *người ra quyết định + loại quyền + nguồn quyết định* đầy đủ ở các writer. Chống tự cấp phải đặt ở backend, không chỉ UI.
3. Mẫu `PRINCIPAL` hiện có quyền thao tác chuyên môn kế thừa từ `PHT_OPERABILITY_GRANTS`; chuyển sang D4 phải kiểm kê và xử lý grant legacy theo nguồn, không xóa ngầm và không tuyên bố HT đã trở thành chỉ-đọc.
4. `ReportingStatementsService.decide()` đã kiểm tra chống tự duyệt trong luồng hiện có; tuy nhiên `requireApproval()` hiện chấp nhận `APPROVAL_PRINCIPAL`/`APPROVAL_VICE_PRINCIPAL` ở phạm vi trường, chưa đủ để mặc nhiên cho TTCM thẩm định bảng kê BGH.
5. Importer TKB hiện có chuỗi `inspect → preview → confirm → DRAFT → validate/approve/activate`. Chưa có cơ sở để tuyên bố việc phê duyệt nguồn và đồng bộ `TeachingAssignment` theo D6 đã được thực thi. B1 provenance mới là schema **inert**, chưa có writer phân loại nguồn.

Nguồn kiểm toán: `docs/requirements/P5-057-WS1-TECHNICAL-BASELINE-20261106.md`, `docs/phase-reports/P5-057-WS1-D2-CODE-AND-CAPABILITY-AUDIT-20261106.md`, `docs/phase-reports/P5-057-WS1-DECISION-GATE-AUDIT-20261106.md`, PR #269.

## 3. Ma trận rủi ro và biện pháp bắt buộc trước cutover

| Mã | Rủi ro | Mức | Biện pháp phải chứng minh |
|---|---|---|---|
| R1 / D2 | Admin lợi dụng template/generic endpoint để tự nâng quyền hoặc cấp chuyên môn ngoài quyết định nhân sự | **CRITICAL** | Command gán mẫu ban đầu giới hạn, source proof, allowlist riêng; backend từ chối self-grant và cấp academic qua generic writer; test gọi API trực tiếp |
| R2 / D3 | Chuyển chức trách chỉ thêm quyền, quyền cũ còn tồn tại hoặc thu hồi nhầm grant độc lập | **CRITICAL** | Truy vết nguồn grant, preview đầy đủ, xử lý `unknown provenance` bằng đối soát thủ công, giao dịch nguyên tử + audit; không suy đoán revoke |
| R3 / D4 | Quyền khẩn cấp Hiệu trưởng tồn tại vô hạn hoặc bị dùng như đường vòng cấp quyền | **CRITICAL** | Scope/TTL bắt buộc, tự hết hạn ở tầng evaluator, xác thực lại hành động nhạy cảm, lý do + người yêu cầu + audit bất biến, thông báo PHT và hậu kiểm |
| R4 / D4 | Hiệu trưởng sẵn có grant PHT legacy, khiến giới hạn mới chỉ có tác dụng trên UI | **HIGH** | Inventory grant production **read-only**, đối chiếu theo nguồn và kế hoạch chuyển tiếp/rollback riêng, negative tests cho direct API |
| R5 / D5 | TTCM có quyền duyệt vượt tổ hoặc bị khóa không thể duyệt bảng kê HT/PHT | **HIGH** | Command thẩm định hẹp theo người nộp/tổ, tuyến phê duyệt minh định, anti-self-approval backend; không gán quyền BGH cho TTCM |
| R6 / D6 | TKB được thay file sau phê duyệt, phân công tự ghi sai lớp/môn/GV hay sai thời gian | **CRITICAL** | Phê duyệt gắn **snapshot bất biến** (phiên bản/hash + năm học + phạm vi + thay đổi được phép), so diff trước commit, chống replay/stale/race, fail-closed nếu thay nguồn |
| R7 / D6 | Cập nhật phân công làm trùng/đứt quãng `TeachingAssignment`, mất lịch sử TKB/PPCT hoặc quyền GV | **HIGH** | Kiểm tra xung đột theo thời gian, duy trì lịch sử có hiệu lực, transaction idempotent, bù trừ/rollback được, test toàn chuỗi TKB→PPCT→báo giảng |
| R8 / mọi D | Chuyển đổi trong production làm hỏng chức năng đang hoạt động | **HIGH** | Shadow/dry-run, test DB cô lập, regression 7 persona, CI exact-head, backout commit/release; không đụng DB production để test |

## 4. Cổng đặc tả còn mở — **chưa được phép tự chốt thay PO**

| Gate | Cần làm rõ trước sửa code ghi quyền | Khuyến nghị kỹ thuật để thẩm định, **chưa được phê duyệt** |
|---|---|---|
| G-D2-1 | Loại chứng cứ quyết định nhân sự: số/ký hiệu, ngày, người ký, phạm vi, cách xác minh; danh mục mẫu ban đầu Admin được gán | Chứng cứ có mã và đối tượng cụ thể, có thể lưu tham chiếu, kiểm tra trước ghi; không bắt người dùng nhập capability key |
| G-D2-2 | 9 capability nhạy cảm/giao thoa: `APPROVAL_*`, `AUDIT_VIEW`, catalog kiêm nhiệm, AI policy/usage/cost/audit/disable | Xây bảng owner/issuer/scope/revoker theo từng key; không cấp đại trà theo nhãn nhóm |
| G-D3-1 | Ai được xác nhận chuyển PHT/TTCM, xử lý đồng thời, ngữ nghĩa “ngay” khi có quyết định nhân sự ghi ngày khác; trạng thái grant chưa rõ nguồn | Commit thời điểm xác nhận, không hồi tố quyền; nếu chứng cứ không rõ thì khóa giao dịch thu hồi và trả NEEDS_RECONCILIATION |
| G-D4-1 | Tình huống nào đủ “khẩn cấp”; quyền can thiệp được phép; thời hạn tối đa; gia hạn; hậu kiểm | Ưu tiên scope tối thiểu, TTL ngắn, không cấp root, kết thúc tự động |
| G-D4-2 | Thông báo cho PHT qua kênh nào, yêu cầu xác nhận đã nhận hay chỉ gửi; xử lý lỗi gửi; người nhận nếu có nhiều PHT | Audit ghi trước khi kích hoạt; tạo outbox thông báo có retry, không coi thông báo gửi lỗi là thành công |
| G-D5-1 | TTCM nào thẩm định bảng kê HT/PHT, kể cả trường hợp người nộp không sinh hoạt tổ xác định; ai duyệt chốt, TTCM vắng hoặc chính TTCM là người nộp | Tách `thẩm định TTCM` khỏi `duyệt chính thức` nếu quy trình cần hai bước; fail-closed khi không có người độc lập |
| G-D6-1 | “Nguồn TKB được phê duyệt trước” là **một file/phiên bản TKB cụ thể**, hay **một kênh dữ liệu được ủy quyền liên tục**; ai có quyền tải/sửa | Khuyến nghị phê duyệt snapshot TKB cụ thể kèm hash/diff; không cho phép whitelist toàn bộ file tương lai không xét nội dung |
| G-D6-2 | Tự đồng bộ **thêm/sửa/kết thúc** phân công nào, với hiệu lực từ khi nào; xử lý co-teaching, nhiều môn/lớp, đổi ca/ngoại lệ | Chỉ commit diff nằm trong phạm vi đã duyệt; xung đột lịch sử hoặc ngoài phạm vi phải quay về PHT xác nhận |
| G-DEPLOY | Kế hoạch inventory grant legacy, provenance writer B1, migration thật sự có cần, phạm vi rollout và rollback | Đầu tiên chỉ kiểm kê/preview/fixture, sau đó PR quyền nhỏ theo gate đã được duyệt; không gộp tất cả D2–D6 vào một lần deploy |

**Các gate trên là điểm cần đặc tả/đối chiếu tiếp, không phải yêu cầu PO chọn lại D2–D6.** Kiến trúc phải hiện thực đúng quyết định đã chốt, không thay quyết định bằng phương án an toàn tự chọn.

## 5. Tiêu chí nghiệm thu kỹ thuật và ranh giới triển khai

- Không tạo authorization engine thứ hai; vẫn dùng `CapabilityGrant`, scope, valid-time, audit, default-deny; `TEACHER_BASE` và grant độc lập không bị mất.
- Kiểm tra cả mutation bằng gọi API trực tiếp, race/replay, actor=target, vượt scope, TKB version stale, grant unknown provenance, emergency hết hạn, thông báo PHT.
- Test 7 persona của P5-057 và full regression xuyên TKB/PPCT/báo giảng; kiểm thử database **cô lập**, không dùng VPS production làm test.
- Một nhánh/một commit/một PR cho từng thay đổi code có phạm vi nhỏ; review độc lập → CI xanh → merge có chỉ thị → duy nhất auto-deploy hiện hữu → kiểm tra VPS; không tự tạo pipeline mới.
- Không tự động triển khai/thu hồi quyền theo tài liệu này. **P5-057/WS1 vẫn IN_PROGRESS, WS3/WS4 mutation gated, P6-050 vẫn BLOCKED** cho đến khi tiêu chí nghiệp vụ và kỹ thuật được xác nhận.

## 6. Truy vết quyết định

- **PO sign-off ngày 07/11/2026:** D2 Admin gán mẫu ban đầu theo quyết định nhân sự; D3 quyền hiệu lực ngay khi xác nhận; D4 HT tự kích hoạt khẩn cấp có lý do/thời hạn/thông báo PHT; D5 TTCM thẩm định bảng kê BGH và chặn tự duyệt/cấp; D6 tự cập nhật phân công từ TKB đã PHT phê duyệt trước.
- Nguồn: xác nhận PO trực tiếp trong hội thoại ngày 07/11/2026; tài liệu này chỉ làm rõ điều kiện an toàn, không tự mở rộng ý chí PO.
- Tham chiếu triển khai 4 giai đoạn: `docs/tasks/P5-057-FOUR-STAGE-OPERABILITY-EXECUTION-PLAN.md`.
