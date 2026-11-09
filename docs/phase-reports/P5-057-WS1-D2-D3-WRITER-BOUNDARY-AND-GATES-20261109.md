# P5-057 / WS1 — Rà soát ranh giới ghi quyền và cổng D2–D3 (09/11/2026)

**Loại:** Audit mã nguồn và hợp đồng thực thi để bàn giao gói triển khai tiếp theo; **DOCS-ONLY, không thay đổi runtime**.  
**Nguồn sự thật:** `main@8f496d012a884a5285d5c213c32e564b4e615860` (sau merge PR #277; CI main #919 và phát hành #43 đã xác nhận).  
**Trạng thái:** WS1 / P5-057 **IN_PROGRESS**; writer bổ nhiệm/miễn nhiệm **NOT ACTIVE**; P6-050 **BLOCKED**.  
**Ưu tiên:** Chỉ triển khai nghiệp vụ nội bộ tối thiểu, không thêm engine phân quyền thứ hai, không bắt nhập văn bản hành chính.

## 1. Thứ tự thẩm quyền tài liệu — không đảo ngược quyết định đã chốt

1. `docs/requirements/P5-057-WS1-PO-ACCOUNTABILITY-SIMPLIFICATION-20261108.md` là quyết định **mới nhất** cho D2–D3: **không bắt** nhập số/ký hiệu quyết định, ngày ký, người ký, tải file hay xác minh giấy tờ. Người có thẩm quyền đăng nhập → chọn nhân sự/chức trách/phạm vi → xem trước → xác nhận; ghi chú tùy chọn. Danh tính người xác nhận lấy từ phiên đăng nhập, backend tự lưu audit.
2. `docs/requirements/P5-057-WS1-D2-D6-PO-DECISIONS-20261107.md`: **Admin bổ nhiệm/miễn nhiệm PHT; PHT bổ nhiệm/miễn nhiệm TTCM**; người có quyền bổ nhiệm có quyền miễn nhiệm chính chức trách đó; không tự bổ nhiệm, không tự cấp quyền. D3 có hiệu lực từ **thời điểm xác nhận thành công trên máy chủ**. D4 HT can thiệp khẩn cấp có lý do/thời hạn/thông báo PHT. D5 TTCM thẩm định bảng kê BGH; D6 TKB có phê duyệt trước mới tự đồng bộ.
3. Những tài liệu ngày 06–07/11 còn đòi `decisionRef`, số quyết định, chữ ký hoặc thời điểm hiệu lực của giấy tờ trước khi ghi **đã lỗi thời ở phần đó**; không sử dụng làm điều kiện mới. Không đồng nghĩa bỏ kiểm tra actor/target/scope hoặc cho phép quyền vượt thẩm quyền.
4. Quyền hành chính theo nhân sự **khác** capability. Không suy quyền từ `positionTitle`, mẫu trách nhiệm, `grantedByUserId` hay quyền hiện hữu. Dùng đúng evaluator và capability/scopes đã có.

## 2. Đối chiếu writer/reader thật theo mã nguồn exact-main

| Điểm | Đường mã/API đã kiểm tra | Bằng chứng / tình trạng | Cổng kế tiếp |
|---|---|---|---|
| Generic grant | `apps/api/src/capabilities/capabilities.controller.ts` L9–L36, `capabilities.service.ts` L92–L163 | Controller có `CAPABILITY_GRANT/SCHOOL_WIDE`; service **đã chặn self-grant/self-revoke** (L95, L141); nhưng chưa có kiểm tra đầy đủ **loại quyền + chủ thể ra quyết định + nguồn quyền** cho người khác. | **Không mở rộng generic writer** sang quyền chuyên môn. Thiết kế chốt chặn theo key/command ở backend, test gọi API trực tiếp. Không áp lệnh khóa toàn cục lên production khi chưa có đường thay thế. |
| Apply responsibility template | `responsibility-templates.controller.ts` L38–L40, L71–L90; `access-baseline.service.ts` L420–L595 | Cùng guard `CAPABILITY_GRANT/SCHOOL_WIDE`, PHT không dùng được. `applyTemplate` **đã chặn tự gán**, lock user, thêm grant thiếu và ghi audit; **không thu hồi**, không ghi nguồn B1. Không dùng nó để miễn nhiệm/chuyển chức trách. | Lệnh nghiệp vụ hẹp riêng cho Admin→PHT và PHT→TTCM, tái sử dụng kiểm tra capability, template và audit; không thay evaluator. |
| Appointment preflight | `appointment-preflight.controller.ts` `POST /role-appointments/preflight`; `appointment-preflight.service.ts` L19–L95 | Session + CSRF; chặn tự bổ nhiệm; Admin cần USER_MANAGE + CAPABILITY_GRANT để xem PHT, PHT cần APPROVAL_VICE_PRINCIPAL để xem TTCM. **Chỉ là kiểm tra sơ bộ capability, chưa chứng minh người đương nhiệm hợp lệ**. Kết quả `READ_ONLY`, `canConfirm:false`, `provenanceVerified:false`. | Giữ preflight fail-closed; không biến preview thành lệnh ghi bằng cách bật cờ. Chỉ thêm nguồn thật đã xác minh và các bản ghi B1 được kiểm soát giao dịch. |
| Source coverage planner | `grant-source-coverage-planner.ts`, tests `grant-source-coverage-planner.spec.ts` | Hàm thuần tính hợp các khoảng nguồn quyền, giữ quyền từ nguồn độc lập; `UNKNOWN_PROVENANCE` làm BLOCKED. Đầu ra `REVIEW_ONLY/canConfirm:false`. Dữ liệu truyền vào phải **được kiểm chứng ở server**, không nhận source evidence trực tiếp từ client. | Dùng làm thuật toán chuẩn bị, không coi kết quả là authorization hay transaction writer. |
| B1 schema / fixture | `prisma/schema.prisma` L2214–L2377; `provenance-foundation.integration.spec.ts` L146–L363 | Có `AccessCommand`, `AccessCoordinate`, `AuthoritySeat`, `RoleAppointment`, `GrantSource(+Revision)`, projection/support. PR #277 kiểm chứng CAS tuần tự, uniqueness receipt và rollback transaction. **Chưa có writer nghiệp vụ**, chưa chứng minh race multi-client/HTTP 409. | Một transaction có authority seat/scope, CAS revision, idempotency fingerprint, source-aware union, audit; kiểm thử PostgreSQL cô lập trước khi đưa production. |
| Grant production legacy | `docs/phase-reports/P5-057-WS1-B1-READONLY-INVENTORY-20261108.md` | **Snapshot ngày 08/11**: 1 tài khoản ACTIVE, 9 grant hiệu lực, 9/9 `coordinate_id=NULL`, B1 writer tables 0. Không suy diễn đây là số liệu thời điểm hiện tại. | Trước cutover phải kiểm kê lại SELECT-only, có snapshot/hậu kiểm; chưa rõ nguồn thì BLOCKED, **không tự backfill/revoke**. |
| Mẫu HT | `responsibility-template-catalog.ts`, nhánh `PRINCIPAL` | `PRINCIPAL` kế thừa `PHT_OPERABILITY_GRANTS`, có thể materialize quyền sửa TKB/PPCT trái chính sách D4 mới. | Không gỡ/giảm quyền legacy tự động; tách PR/đợt chuyển tiếp sau inventory, UAT và đường lui cụ thể. |

**Không phải phát hiện mới:** Đã có chặn tự cấp/tự thu hồi tại writer. Không được lặp lại nhận định cũ ngày 06/11 rằng hai kiểm tra này hoàn toàn chưa tồn tại. Dữ liệu snapshot production ngày 08/11 không phải bằng chứng tình trạng DB ngày 09/11.

## 3. Quy trình người dùng phải hướng tới (2 thao tác chính, không hồ sơ giấy)

- Người có quyền mở giao diện nhân sự, chọn PHT hoặc TTCM cần bổ nhiệm/miễn nhiệm; giao diện chỉ hiển thị chức trách/phạm vi được phép cho actor hiện tại.
- **Xem trước**: nêu rõ quyền **thêm**, quyền sẽ **kết thúc từ nguồn chức trách**, quyền **tiếp tục còn hiệu lực từ nguồn khác**, và cảnh báo **chưa xác định được nguồn quyền**. Không yêu cầu mã UUID/capability hoặc giấy tờ.
- **Xác nhận**: backend lấy actor từ session, kiểm tra lại thẩm quyền và revision; ghi một lệnh nguyên tử, mốc thời gian server, nguồn quyền/projection và audit. Nếu gặp sai quyền, nguồn chưa rõ, race, preview stale, idempotency conflict thì từ chối nguyên lệnh, không ghi nửa chừng.
- Không gộp gói D4 can thiệp khẩn cấp, D5 duyệt bảng kê hoặc D6 đồng bộ TKB vào command D2/D3 này.

## 4. Hợp đồng kỹ thuật tối thiểu trước bất kỳ lệnh ghi nào

**Không thêm engine cấp quyền thứ hai**. Tận dụng các mô-đun hiện hữu và B1 đã có:

1. **Actor/target/authority:** trước và **trong** transaction phải xác định đúng actor (session), target, loại lệnh (`APPOINT_PHT`, `DISMISS_PHT`, `APPOINT_TTCM`, `DISMISS_TTCM` hoặc tên chuẩn được thống nhất), phạm vi; `actor != target`. Admin không có command TTCM; PHT không có command PHT, không cấp quyền kỹ thuật; từ chối khi seat PHT không hợp lệ. Chỉ biết `APPROVAL_VICE_PRINCIPAL` chưa đủ chứng minh actor là PHT hợp lệ.
2. **Nguồn + quyền:** đọc đúng revision **mới nhất** của từng source; không coi source lịch sử là source hiện hành. Quyền có 2 nguồn thì kết thúc một nguồn **không tước grant** nếu nguồn độc lập vẫn còn; `TEACHER_BASE` và grant độc lập được giữ. `coordinateId` có giá trị cũng chưa đủ chứng minh support. Legacy unknown = dừng/đối soát, không đoán.
3. **Chống race/replay:** khóa và kiểm tra version của appointment, seat, coordinate theo thứ tự ổn định; thiếu CAS hoặc `updateMany.count=0` phải abort; receipt unique theo actor/type/request-key, cùng key+cùng fingerprint trả kết quả nhất quán, cùng key+khác fingerprint trả conflict. Thử **hai transaction thật**, không tái sử dụng test CAS tuần tự làm bằng chứng.
4. **Nguyên tử, lịch sử, hậu kiểm:** appointment/source revisions, projection, grant effectivity, receipt và audit cùng transaction; nếu bất kỳ bước nào lỗi thì rollback. Không hard-delete dữ liệu lịch sử, không hồi tố trước thời điểm xác nhận.
5. **Rollout:** shadow/read-only trước; test DB riêng và UAT theo persona; CI exact-head, review độc lập, một PR/lần merge; dùng duy nhất auto-deploy hiện hành. Khi có thay đổi DB, có xác minh migration riêng. Không truy cập hoặc restart Nội trú.

## 5. Negative/regression tests để khóa hợp đồng

| ID | Tình huống bắt buộc | Kỳ vọng |
|---|---|---|
| D2-N1 | Admin tự gán PHT hoặc cấp quyền cho chính mình | DENY backend, không ghi grant/audit thành công |
| D2-N2 | Admin bổ nhiệm TTCM hoặc dùng generic grant cấp quyền chuyên môn | DENY khi policy mới được kích hoạt, không có đường vòng qua template |
| D2-N3 | PHT cấp USER_MANAGE/CAPABILITY_GRANT/SYSTEM_ADMIN hoặc bổ nhiệm PHT | DENY |
| D2-N4 | PHT bổ nhiệm TTCM thuộc phạm vi không hợp lệ | DENY |
| D3-N1 | Miễn nhiệm nguồn chức trách có 1 nguồn | Kết thúc đúng hiệu lực, giữ lịch sử |
| D3-N2 | Miễn nhiệm một trong 2 nguồn còn lại một nguồn độc lập | Quyền vẫn còn hiệu lực |
| D3-N3 | Grant legacy không rõ nguồn hoặc source revision cũ bị nhầm là active | BLOCKED, không revoke |
| D3-N4 | Hai actor xác nhận stale preview cùng lúc | Một giao dịch hợp lệ; giao dịch còn lại abort sạch |
| D3-N5 | Cùng request key nhưng fingerprint khác | Conflict, receipt gốc không đổi |
| D3-N6 | Lỗi sau khi ghi appointment/source nhưng trước projection/audit | Rollback tất cả |
| D3-N7 | Miễn nhiệm PHT chính trước khi có người thay hợp lệ | Fail-closed theo seat/transfer policy; không tự dựng tài khoản cứu hộ |
| R-N1 | Hồi quy GV/TTCM/PHT/HT/điều phối/TKB/PPCT/bảng kê | Không thay hành vi ngoài phạm vi gói |

Bổ sung từ review độc lập PR #277: Hai assertion ở test (dòng 195, 323) chỉ kiểm tra `toBeDefined()` là **LOW**, nên siết mã lỗi SQL/Prisma cụ thể trong PR kiểm thử riêng khi có môi trường test. Không xem đó là lỗi chặn PR #277 đã merge.

## 6. Chia việc tiếp theo, không phức tạp hóa hệ thống

| Gói | Tính chất | Điều kiện để hoàn thành |
|---|---|---|
| **WS1-A: Chốt ranh giới** *(tài liệu này)* | Audit exact-main, quyết định đã duyệt và negative matrix. Không runtime, không DB. | Reviewer xác minh mapping; không tự tuyên bố D2–D3 đã hoạt động. |
| **WS1-B: Preflight theo nguồn — chỉ đọc** | Bổ sung/kiểm thử truy vết **latest revision** và liên kết source/support thật vào preview theo đúng actor/target; luôn `canConfirm=false`. | Test DB cô lập, unknown legacy không đề xuất thu hồi, UAT luồng 2 thao tác. |
| **WS1-C: Command D2–D3** | Chỉ sau khi rõ key/owner, seat/nguồn, idempotency và transaction; làm từng command nhỏ, không viết lại các controller cũ. | CI+review+UAT, rollback, thông tin tác động production. |

**Cổng còn mở cần đánh giá kỹ thuật, không hỏi lại chính sách PO đã chốt:** danh mục 9 key giao thoa (`APPROVAL_*`, `AUDIT_VIEW`, catalog kiêm nhiệm và nhóm AI), mô hình người giữ seat PHT chính khi chuyển giao, chiến lược xử lý 9 grant legacy unknown. Trước khi có bằng chứng, **không kích hoạt writer**.

## 7. Biên giới thay đổi

Tài liệu này là **chỉ đọc và chuẩn hóa kế hoạch**; không kích hoạt chức trách, không cập nhật `CapabilityGrant`, `User`, PostgreSQL, schema, migration, cron, UI production hoặc GitHub CI/CD. Nhánh và commit chứa báo cáo này có thể được review/gộp khi phù hợp với hạn mức CI; không cần tạo PR tài liệu gấp khi đang cần giữ phút CI cho writer thật.
