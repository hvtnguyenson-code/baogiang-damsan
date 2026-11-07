# P5-057 / WS1 — Thiết kế chi tiết D2–D3: nguồn quyền, gán mẫu ban đầu và chuyển giao chức trách

**Ngày khảo sát:** 07/11/2026. **Repository:** `hvtnguyenson-code/baogiang-damsan`. **Baseline chính xác:** `main@eb6c11e9b03595cfca4bae430e4750145340066a` (sau PR #270). **Trạng thái:** **TECHNICAL PROPOSAL / REVIEW REQUIRED**; quyết định PO D2–D3 **đã chốt nguyên tắc**, nhưng các lựa chọn cấp triển khai và di trú quyền cũ **chưa được PO phê duyệt**. Đọc cùng `P5-057-WS1-D2-D6-PO-DECISIONS-20261107.md` và `P5-057-WS1-TECHNICAL-BASELINE-20261106.md`.

**Giới hạn:** tài liệu và kiểm kê mã nguồn qua GitHub; **chưa kiểm kê số liệu grant production**, chưa xác minh từng grant legacy trên VPS. Không sửa API, frontend, schema, evaluator, PostgreSQL, Nội trú, workflow, hoặc dữ liệu/quyền đang chạy. Không gọi WS1 hay P5-057 CLOSED. Không xem đề xuất này là quyền thực thi.

## 1. Hợp đồng nghiệp vụ không được thay đổi

- **D2 PO ACCEPTED:** Admin tạo tài khoản và gán mẫu trách nhiệm **lần đầu theo quyết định nhân sự**. Những thay đổi **quyền chuyên môn** tiếp theo thuộc PHT chuyên môn. Admin không tự bổ nhiệm, không tự cấp quyền chuyên môn tùy ý; PHT không nhận `CAPABILITY_GRANT/SCHOOL_WIDE`.
- **Bổ sung PO về thẩm quyền bổ nhiệm/miễn nhiệm (07/11/2026):** **Ai có quyền gán bổ nhiệm thì có quyền gán miễn nhiệm chính chức trách đó**. Trong hệ thống: **PHT chuyên môn gán bổ nhiệm và miễn nhiệm TTCM; Admin kỹ thuật gán bổ nhiệm và miễn nhiệm PHT**. Quy tắc theo từng chức trách ưu tiên so với thao tác gán mẫu chung: Admin không tự gán/miễn TTCM, PHT không tự gán/miễn PHT. Thao tác phải gắn quyết định nhân sự hợp lệ, không đồng nhất người thao tác trên hệ thống với người ký quyết định ngoài đời; không ai được tự bổ nhiệm, tự miễn nhiệm để né kiểm soát hay tự nâng quyền. **Miễn nhiệm chỉ kết thúc nguồn quyền gắn với chức trách**, không xóa quyền độc lập, `TEACHER_BASE` hoặc lịch sử. Đây là **quyết định nghiệp vụ**, không còn là gate hỏi ai được bổ nhiệm/miễn nhiệm.
- **D3 PO ACCEPTED:** hiệu lực thay đổi **ngay khi người có thẩm quyền xác nhận**. Tính thời điểm phải theo commit giao dịch trên server (đề xuất), không theo thời điểm mở preview hoặc theo ngày ký văn bản nếu khác ngày. Không xóa lịch sử, không xóa `TEACHER_BASE`, không thu hồi quyền độc lập hay quyền chưa rõ nguồn bằng suy đoán.
- D1 vẫn giữ PHT ra quyết định chuyên môn. D4–D6 có hồ sơ chính sách riêng, không được trộn ngoại lệ Hiệu trưởng hoặc đồng bộ TKB vào command gán/thu hồi quyền thông thường.
- Giữ một evaluator dựa trên `CapabilityGrant` + scope + valid-time + `revokedAt`; dữ liệu chức danh/tổ/môn **không tự làm phát sinh quyền API**.

## 2. Kiểm kê tĩnh các đường ghi cấp/thu hồi quyền (đã đối chiếu tại baseline)

| Đường ghi | Tệp/hàm thực tế | Hiện trạng và mức độ rủi ro | Xử lý trước activation |
|---|---|---|---|
| **G1 — Generic grant** | `apps/api/src/capabilities/capabilities.controller.ts` → `CapabilitiesService.create()` | `CAPABILITY_GRANT/SCHOOL_WIDE` bảo vệ controller; service ghi `CapabilityGrant` và audit nhưng chưa kiểm tra actor=target, nguồn quyết định, nhóm học thuật/kỹ thuật tại writer | **CRITICAL:** giới hạn đường ghi bằng server-side policy theo actor/command/target/scope/source; không cho Admin vòng qua lệnh chuyên môn |
| **G2 — Generic revoke** | cùng controller → `CapabilitiesService.revoke()` | Revoke theo grant ID, `revokedAt`, audit; thiếu quy tắc chặn tự thu hồi/lách thẩm quyền và xét nhiều nguồn cùng chống đỡ một grant | **CRITICAL:** không cho revoke một projection khi còn nguồn khác; kiểm tra authority đối xứng create/revoke |
| **G3 — Apply template** | `responsibility-templates.controller.ts` → `AccessBaselineService.applyTemplate()` | Transaction + lock user, tạo grant còn thiếu, audit; **add-only**, không phải đổi vai trò; PR #269 preview grant ngoài mẫu là **READ_ONLY** và `provenanceVerified=false` | Không tái sử dụng `applyTemplate()` làm command thay chức vụ; tách initial-assignment và transfer rõ ràng nhưng cùng một engine |
| **G4 — Baseline teacher** | `AccessBaselineService.ensureProfessionalBaseline()` / `applyReconciliation()` | Bổ sung `TEACHER_BASE/PERSONAL` theo điều kiện nhân sự giảng dạy | Giữ riêng; không dùng như grant quản trị; không xóa baseline khi người dùng thôi kiêm nhiệm |
| **G5 — Bootstrap admin** | `apps/api/src/bootstrap/bootstrap-admin.ts` → `bootstrapAdmin()` | Script chỉ tạo mới (không overwrite) và `createMany` 9 capability, gồm `SYSTEM_ADMIN`, `CAPABILITY_GRANT`, `SUBJECT_MANAGE`, `ACADEMIC_STRUCTURE_MANAGE`, `SUBJECT_GROUP_MANAGE`; khác template technical Admin thường | **HIGH:** phân loại ngoại lệ bootstrap theo vòng đời/điều kiện vận hành; không cấp khả năng tự đổi role hay tiếp tục bootstrap không kiểm soát. Không tự thu hồi tài khoản bootstrap đang vận hành |
| **G6 — Nguồn template/capability** | `responsibility-template-catalog.ts` / `prisma/capability-catalog.cjs` | Materialize các coordinate; `TECHNICAL_ACCOUNT_ADMIN` đang chứa `CAPABILITY_GRANT`; `PRINCIPAL` còn kế thừa `PHT_OPERABILITY_GRANTS`; 38/38 capability đã được kiểm kê trong audit ngày 06/11 | Danh sách 9 capability nhạy cảm phải có owner/issuer/scope/revoker theo key. Legacy `PRINCIPAL` không được âm thầm xóa quyền |

**Phạm vi kiểm kê:** đường ghi ứng dụng và bootstrap xác nhận bằng GitHub code search + đọc hàm thực tế. Các câu lệnh trong test/fixture có direct insert không tính writer production. Trước khi triển khai phải chạy inventory toàn repository bằng `rg` local và rà soát các script/seed/job ngoài đường API, không tuyên bố đây là kiểm kê runtime hoàn chỉnh.

## 3. Mô hình nguồn quyền B1 đã có, vẫn chưa hoạt động

`prisma/schema.prisma` hiện có `AuthorizationState`, `AccessCommand`, `AccessCoordinate`, `AuthoritySeat`, `RoleAppointment`, `GrantSource`, `GrantSourceRevision`, `GrantProjectionRevision`, `GrantProjectionSlice`, `GrantSupport`; `CapabilityGrant.coordinateId` là nullable và **legacy grant có thể NULL**. B1 chỉ thêm cấu trúc/constraint, **không seed/backfill, không writer/projection/evaluator mới**.

- **Coordinate:** `(userId, capabilityKey, scopeType, scopeResourceId|null)`. Kiểm soát identity và time interval theo constraints thực tế; không suy nguồn từ tên template, `positionTitle`, actor `grantedByUserId` hoặc quyền đang hiệu lực.
- **GrantSource:** bằng chứng nguồn độc lập (ví dụ: quyền nền tảng giáo viên, bổ nhiệm Tổ trưởng, nhiệm vụ PHT, grant học thuật riêng). `RoleAppointment` liên hệ chức trách/seat; `GrantSourceRevision` lưu lịch sử hiệu lực.
- **Projection:** các `GrantSupport` chứng minh tại sao một `GrantProjectionSlice`/grant có hiệu lực. **Một capability có thể được chống đỡ bởi nhiều nguồn; bỏ một nguồn không nhất thiết bỏ quyền**. B2 phải xác minh union coverage theo thời gian, không đếm số nguồn đơn giản.
- **Legacy:** nếu không thể chứng minh nguồn của một grant hiện hữu, trạng thái `UNKNOWN_PROVENANCE` trong thiết kế/preview; **không** tự gán nhãn nguồn hoặc tự revoke. Kiểm kê và đối soát là điều kiện của mutation, không phải cách viết lại lịch sử giả định.
- Rào kỹ thuật: B1 còn `capability_grants_exact_key` và `capability_grants_no_active_overlap`, kể cả giới hạn tái tạo khoảng thời gian **identical revoked**; tính projection phải thử trên PostgreSQL cô lập trước khi chốt cách insert/revoke.

**Ví dụ nguyên lý (không phải dữ liệu thật):** GV A có `REPORTING_READ/SUBJECT X` từ nguồn bổ nhiệm Tổ trưởng (S1) và một grant ủy nhiệm học thuật độc lập (S2). Khi thôi Tổ trưởng, kết thúc S1 ngay lúc xác nhận; nếu S2 còn hiệu lực, quyền đọc X **vẫn được giữ**. Nếu chỉ S1 tồn tại, projection mới kết thúc quyền X. Nếu grant đó không xác minh được nguồn, chặn auto-revoke và đưa vào đối soát.

## 4. Lệnh và hợp đồng API **đề xuất**, chưa phải endpoint hiện hữu

### D2 — Gán mẫu lần đầu theo nhân sự

**Ranh giới bổ nhiệm/miễn nhiệm:** Admin gán bổ nhiệm **và miễn nhiệm PHT** theo quyết định nhân sự; PHT gán bổ nhiệm **và miễn nhiệm TTCM**. Admin vẫn khởi tạo hồ sơ/tài khoản TTCM nhưng **không được tự áp/thu hồi mẫu TTCM** để bỏ qua PHT. Quy tắc thẩm quyền đối xứng áp dụng cho cả lệnh `appoint`, `dismiss` và việc chuyển giao tương ứng; mọi thao tác phải được backend kiểm tra actor–target–scope, nguồn quyết định và quyền nguồn gốc, kể cả direct API.

**Nhập nghiệp vụ:** target account, template key/version, resource scope (tổ, môn, chương trình khi cần), căn cứ quyết định nhân sự, identity actor, idempotency key, preview revision. UI không yêu cầu UUID/capability key thủ công.

**Preconditions:** tài khoản đủ điều kiện; chưa được khởi tạo mẫu thuộc cùng chức trách; actor là Admin có thẩm quyền khởi tạo *cho người khác*; văn bản nhân sự trỏ tới đúng người, vị trí, phạm vi; template trong allowlist đã duyệt; quyền `SYSTEM_ADMIN`, `CAPABILITY_GRANT`, `APPROVAL_*` và quyền nhạy cảm phải xét theo **key cụ thể**, không theo vai trò hiển thị. Từ chối self-appoint và vượt scope **ở service**, không chỉ Controller.

**Kết quả nếu hợp lệ:** lưu command receipt + nguồn gốc/phiên bản mẫu + audit actor/target/decision id/time, tạo hoặc liên kết các source hỗ trợ coordinate; bảo đảm `TEACHER_BASE` theo luồng riêng. “Đã có cùng coordinate” không có nghĩa bỏ qua nguồn quyền mới: phải lưu source support độc lập nếu hợp lệ, không nhân đôi grant hiệu lực.

**Lưu ý OPEN:** “gán mẫu ban đầu” cần ranh giới nghiệp vụ (theo người, theo từng chức trách, hay chỉ tài khoản mới); Admin chỉ được ghi chứng cứ hay cần cơ chế xác thực người ký? Không được tự triển khai một giả định.

### D3 — Chuyển giao/thôi chức trách có hiệu lực ngay

**Đầu vào:** người cũ, người mới (nếu là chuyển seat), chức trách/seat, phiên bản mẫu và nguồn liên quan, chứng cứ nhân sự, expected revision của target/seat/grant coordinates, idempotency key, người có thẩm quyền xác nhận.

**Preview bắt buộc:** `effectiveAtCandidate` (server preview time, không phải thời điểm cam kết), số và danh sách `add`, `endSource`, `retainIndependent`, `retainOtherSource`, `unchanged`, `unknownProvenance`, `conflicts`, cùng khả năng rollback. Không gọi “thu hồi” khi mới chỉ thấy grant ngoài template như PR #269.

**Confirm transaction đề xuất:**
1. Xác thực lại session/actor và thẩm quyền **bổ nhiệm/miễn nhiệm tương ứng** ở server (Admin chỉ với PHT; PHT chỉ với TTCM); kiểm tra source evidence đúng người/seat/scope, chữ ký/tham chiếu nhân sự theo quy trình đã phê duyệt; từ chối actor tự bổ nhiệm, tự miễn nhiệm để lách kiểm soát, tự cấp quyền và peer không hợp lệ.
2. Khóa theo **thứ tự xác định**: `AuthoritySeat` liên quan và các user IDs đã sắp xếp, tiếp đến `AccessCoordinate` đã sắp xếp. Dùng `expectedRevision` + serialization/constraint để từ chối race, replay cùng payload được idempotent, cùng key khác payload phải 409.
3. Re-read ngay trong transaction mọi active appointment/source/support/grant; chống stale preview, scope vượt quyền, template version và account không hợp lệ. Nếu có `UNKNOWN_PROVENANCE` liên quan thay đổi **ngừng toàn bộ transfer** hoặc yêu cầu đối soát riêng — không commit nửa lệnh.
4. Chọn một `effectiveAt` từ database/server **sau xác nhận**. Kết thúc appointment/source cũ bằng revision/effectivity, lập appointment/source mới (nếu có); **tính lại union coverage trên các interval bị ảnh hưởng**, tái sử dụng coordinate hiện hữu khi hợp lệ. Grant hiệu lực chỉ thay đổi theo bằng chứng source; không xóa lịch sử.
5. Ghi `AccessCommand` receipt/result, revision/epoch, audit và dữ liệu thông báo cần thiết **trong cùng transaction**. Khi thất bại toàn bộ rollback; không ghi audit SUCCESS rời transaction.
6. Hậu kiểm projection tương đương evaluator theo thời điểm hiện tại, không mất baseline, không tăng quyền actor ngoài quyết định. Trả receipt/các quyền thực tế/điểm cần đối soát. Sau commit mới cập nhật UI.

**Atomicity đặc biệt:** chuyển seat PHT có một người nhận hợp lệ trước khi kết thúc quyền người cũ; không tạo giả định “nhà trường không có PHT”. Seat occupancy/half-open interval B1 không đồng nghĩa policy một PHT cứng trong toàn hệ thống. Các chức trách kiêm nhiệm có thể đồng thời tồn tại; chuyển một chức trách không được xóa chức trách khác.

## 5. Bảng thẩm quyền theo lệnh — đề xuất triển khai, chưa được PO duyệt chi tiết

| Chủ thể | Lệnh được thiết kế | Phải từ chối |
|---|---|---|
| Admin kỹ thuật | Tạo/khóa/reset user, ghi thông tin nhân sự; **gán bổ nhiệm và miễn nhiệm PHT** theo quyết định nhân sự, gán các mẫu khởi tạo khác trong phạm vi cho phép nhưng **không bổ nhiệm/miễn nhiệm TTCM** | Tự bổ nhiệm/tự miễn nhiệm để lách thẩm quyền; thu hồi grant học thuật độc lập; dùng generic grant để cấp `SUBJECT_MANAGE`, `TIMETABLE_MANAGE`, quyền PHT |
| PHT chuyên môn chính | **Gán bổ nhiệm và miễn nhiệm TTCM**, đồng thời thực hiện lệnh riêng để cấp/điều chỉnh/thu hồi **từng** quyền học thuật trong allowlist/scope đã duyệt | `SYSTEM_ADMIN`, `USER_MANAGE`, `CAPABILITY_GRANT`, tự bổ nhiệm/miễn nhiệm để lách kiểm soát, sửa/hủy bằng chứng nhân sự |
| Hiệu trưởng | Giám sát/thẩm quyền riêng đã phê duyệt, emergency theo D4 ở nhánh triển khai **khác** | Mặc định nhận toàn quyền mutation của PHT, dùng đường emergency để tự sửa căn cứ cấp quyền thường ngày |
| TTCM/GV/điều phối | Tác vụ thuộc scope thực tế; baseline cá nhân | Bất kỳ generic role transfer, grant root, approve chính mình |

**Nhóm capability nhạy cảm:** `APPROVAL_PRINCIPAL`, `APPROVAL_VICE_PRINCIPAL`, `AUDIT_VIEW`, `ADDITIONAL_DUTY_CATALOG_MANAGE`, `AI_CONFIGURE_POLICY`, `AI_VIEW_USAGE`, `AI_VIEW_COST`, `AI_VIEW_AUDIT`, `AI_DISABLE_SYSTEM`. Phải có ma trận **owner / issuer / revoker / scope / duration / evidence** từng key; không suy rộng từ 3 nhóm tổng quát. Template `PRINCIPAL` kế thừa `PHT_OPERABILITY_GRANTS` hiện tại là nguy cơ legacy D4 riêng, **không tự thu hồi trong D2/D3**.

## 6. Inventory DB production cần có trước khi viết mutation (CHƯA CHẠY)

Phạm vi truy vấn **read-only, metadata/aggregate, không tiết lộ PII**. Báo cáo đầu ra tối thiểu: tổng user ACTIVE; grant còn hiệu lực, revoked/expired/future; số grant `coordinateId IS NULL`; phân bố theo `capabilityKey × scopeType` (đặc biệt root, PHT/PRINCIPAL/TTCM, 9 key nhạy cảm); tỷ lệ grant có/không có source/support; các coordinate có >1 nguồn; tài khoản technical bootstrap; giao điểm exact/overlap và unknown source. Cần xác minh tình trạng B1 writer/thực thể mới thật sự trống hay không ở thời điểm kiểm kê. **Không** dùng `positionTitle` hay `grantedByUserId` để suy ra source có thể thu hồi.

Chỉ đọc trên **database Báo giảng, cổng production riêng** bằng tài khoản quyền SELECT tối thiểu sau khi thống nhất đường truy cập phù hợp. Không in user list/token/mật khẩu trong log hay PR. Không thử migration, UPDATE hoặc DELETE trên VPS; đo hành vi ở PostgreSQL test cô lập.

## 7. Kế hoạch triển khai nhỏ + nghiệm thu + đường lui

| Gói | Phạm vi | Gate trước bước kế tiếp |
|---|---|---|
| **A — Static + inventory** | Kiểm kê repo toàn diện và DB aggregate **read-only**, đối chiếu nguồn grant legacy, bảng sensitive capability và bootstrap | Số liệu + risk impact được review; chưa mutation |
| **B — Shadow/preflight** | Read-only role-transfer diff theo source đã biết, expected revision/collision, đánh dấu legacy unknown; không apply | Golden fixtures và test sự phù hợp preview/authorization; UAT Admin/PHT |
| **C — Source-aware writer** | Đường ghi duy nhất sử dụng B1 provenance/union, khóa/snapshot/receipt, từng command D2/D3 có policy theo actor; không tạo engine thứ hai | PO phê duyệt key-level policy; kiểm thử nguồn chồng lấn và rollback; CI exact-head |
| **D — Controlled cutover** | Bật gói đã chốt cho từng nghiệp vụ với quyết định riêng, kiểm kê quyền thực trước/sau, theo dõi audit | Không regression, không privilege escalation; sau đó mới mở WS4/D4–D6 theo task tách biệt |

**Ma trận test tối thiểu trước cutover:** (1) Admin khởi tạo đúng mẫu cho GV khác, (2) Admin tự phong PHT, (3) Admin cấp/revoke học thuật generic, (4) PHT self-grant/root grant, (5) template add-only không giả revoke, (6) grant một nguồn kết thúc đúng, (7) grant hai nguồn giữ sau kết thúc một nguồn, (8) legacy unknown fail-closed, (9) `TEACHER_BASE` và grant riêng không mất, (10) chuyển seat đồng thời, (11) same-request replay, (12) same key/different payload 409, (13) stale revision và rollback toàn transaction, (14) tài khoản bị lock/inactive, (15) expired/future grant, (16) bootstrap không bị thay đổi/khóa nhầm, (17) migration/index-history PostgreSQL 16/17, (18) E2E 7 persona và hồi quy TKB/PPCT/báo giảng.

**Rollback:** tuyệt đối không rollback bằng cách xóa bảng nguồn B1 hoặc xóa grant lịch sử. Trước activation backup/release hiện hữu, xác minh binary rollback tương thích schema B1 và trạng thái writer; nếu chuyển giao đã commit, cần **command bù trừ có audit và thẩm quyền** thay vì restore mù hoặc sửa tay. Khi health/authorization xấu: dừng writer mới, kiểm tra trạng thái lưu trong `AuthorizationState`/receipt, chỉ khôi phục release đã được chứng minh vẫn xử lý B1 đúng. Không tự đổi workflow deploy, Nginx, service khác hoặc database Nội trú.

## 8. Các quyết định nhỏ cần PO xem trước khi code

1. **G-D2a (còn mở phần kỹ thuật):** Quy tắc **Admin bổ nhiệm/miễn nhiệm PHT; PHT bổ nhiệm/miễn nhiệm TTCM đã chốt**. Cần phân biệt lệnh khởi tạo tài khoản, bổ nhiệm/miễn nhiệm từng chức trách và chuyển giao chức trách; thiết kế `INITIAL_TEMPLATE`/`ROLE_TRANSFER` phải bảo toàn thẩm quyền, không để generic apply-template của Admin gán hoặc thu hồi TTCM.
2. **G-D2b:** Bằng chứng quyết định nhân sự tối thiểu: số/ký hiệu, ngày, người ký, đối tượng và hiệu lực? **Đề xuất:** lưu số + người ban hành + phạm vi + tham chiếu tệp/biên bản, không bắt upload nếu hệ thống chưa hỗ trợ.
3. **G-D3a (đã chốt thẩm quyền bổ nhiệm và miễn nhiệm):** **PHT bổ nhiệm/miễn nhiệm TTCM; Admin bổ nhiệm/miễn nhiệm PHT**. Còn phải thiết kế trình tự **thay người, xác minh văn bản/nguồn, hiệu lực ngay khi xác nhận và bảo toàn quyền độc lập**; không mở lại câu hỏi ai có quyền miễn nhiệm và không tự suy diễn rằng miễn nhiệm được phép tước mọi grant của cá nhân.
4. **G-D3b:** Xử lý `UNKNOWN_PROVENANCE` legacy: dừng chuyển giao liên quan cho đến khi có bằng chứng đối soát, hay có quy trình ngoại lệ hai người xác nhận? **Đề xuất:** fail-closed và đối soát từng grant, không sửa production theo dự đoán.
5. **G-D3c:** Trường hợp văn bản nhân sự có ngày hiệu lực quá khứ/tương lai nhưng D3 nói “ngay khi xác nhận”: áp dụng quyền API từ thời điểm xác nhận, không hồi tố? **Đề xuất:** đúng, giữ metadata ngày văn bản tách biệt.
6. **G-D2/D3-key:** chốt quyền nào có thể materialize từ các template, nhất là 9 key nhạy cảm và root bootstrap, trước khi chạy writer.
7. **G-operational:** xác minh hậu quả của các grant legacy hiện hữu (đặc biệt `PRINCIPAL`) qua inventory chỉ đọc và UAT trước khi kích hoạt luật chặn cũ.

**Đề xuất trình tự quyết định:** giữ nguyên kết luận **Admin bổ nhiệm/miễn nhiệm PHT, PHT bổ nhiệm/miễn nhiệm TTCM**; hoàn thành inventory trước rồi chỉ trình các gate **còn mở** về chứng cứ nhân sự, xử lý chuyển giao/legacy unknown và ma trận 9 key; chỉ sau PO sign-off triển khai chi tiết mới mở PR backend. Không cần hỏi lại D2/D3 đã chốt.

## 9. Kỷ luật delivery

- Mọi thay đổi code sau này: một nhánh/commit/PR phạm vi hẹp, thử local bằng DamSan MCP sau consent, test DB cô lập, CI exact-head + review độc lập rồi mới merge theo chỉ thị; chỉ dùng **auto-deploy hiện hữu**.
- Nếu local MCP thiếu consent: **không** dùng Desktop Commander trên laptop để thay; docs-only qua GitHub được ghi rõ nguồn và giới hạn.
- Không sửa `P6-050` hoặc tuyên bố pilot READY. Trạng thái `P5-057 = IN_PROGRESS`, `WS1 = OPEN implementation gates`.
