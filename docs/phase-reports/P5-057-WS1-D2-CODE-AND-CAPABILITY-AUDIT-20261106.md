# WS1 / D2 — Hợp đồng kỹ thuật và ma trận capability theo đúng mã nguồn

**Ngày đối chiếu:** 06/11/2026. **Repository:** `hvtnguyenson-code/baogiang-damsan`. **Baseline mã nguồn:** `bd79173a1180c26cbd33555ff081c015ef515bff` (WS2/#263 deployed). **WS1 PR:** #264 — **DOCS ONLY**, không sửa runtime/DB/CI/CD/VPS/Nội trú. D1 được PO chốt; D3/D4 chốt một phần; D2 chưa được phép phát hành backend.

## 1. Bằng chứng hiện hữu: những gì đã có và chưa có

| Thành phần | Đúng theo code hiện tại | Hệ quả cho WS1 |
|---|---|---|
| `capabilities.controller.ts` | Cả GET và POST grant/revoke đều được bảo vệ bằng `CAPABILITY_GRANT/SCHOOL_WIDE` | Guard chung **không phân biệt** quyền kỹ thuật hay chuyên môn; không thể chỉ sửa UI |
| `capabilities.service.ts:create()` | Kiểm tra user tồn tại, definition active, scope, hiệu lực, trùng/chồng lấn, audit; **không kiểm tra actor=target/loại quyền** | Cần chặn tự cấp và quyền ngoài authority ở backend |
| `capabilities.service.ts:revoke()` | Tìm theo grantId; kiểm tra chưa revoked; update và audit, **không kiểm tra target=actor/loại quyền tại service** | Cấp và thu hồi phải dùng chung bộ kiểm tra authority, kể cả API trực tiếp |
| `responsibility-templates.controller.ts` | Template preview/apply và baseline reconciliation dùng chung guard `CAPABILITY_GRANT/SCHOOL_WIDE` | Cần giữ luồng gán mẫu ban đầu có giới hạn, không mở cấp grant học thuật chung |
| `access-baseline.service.ts:applyTemplate()` | Transaction, `FOR UPDATE` trên user row, validate, tạo grant thiếu, audit; **không thu hồi grant của mẫu cũ** | Không gọi là “đổi vai trò” cho tới khi có transaction thay mẫu theo nguồn |
| `access-baseline.service.ts:applyReconciliation()` | Có thể bổ sung `TEACHER_BASE/PERSONAL` cho nhân sự đủ điều kiện, không phải quyền kỹ thuật | Giữ luồng baseline riêng, không lẫn với phân quyền nghiệp vụ của PHT |
| `responsibility-template-catalog.ts` | Có `VICE_PRINCIPAL_ACADEMIC`, **chưa có** `VICE_PRINCIPAL`; principal template đang trải `...PHT_OPERABILITY_GRANTS` | **Mâu thuẫn D4:** Hiệu trưởng có thể nhận quyền mutation chuyên môn qua template cũ. Không tự xóa grant đang chạy; cần inventory và kế hoạch chuyển quyền có chủ đích |
| `capability-authorization.service.ts:evaluate()` | Kiểm tra active grant, thời gian, scope, resource và trạng thái user; không dùng classification TECHNICAL/ACADEMIC làm gate | **Không thay evaluator một cách toàn cục** chỉ để sửa giới hạn các writer |

## 2. Kiểm kê 38/38 capability từ `prisma/capability-catalog.cjs`

Phân nhóm dưới đây là **phân loại ứng viên để review D2**, không phải `TemplateGrantCategory` hiện hữu, không phải migration/DB value và không cho phép giao tất cả quyền trong một nhóm cho actor. Các key đặc biệt cần quyết định riêng trước code.

| Nhóm đánh giá | Số key | Danh mục đúng mã |
|---|---:|---|
| `TECHNICAL_ROOT` | 3 | `SYSTEM_ADMIN`, `USER_MANAGE`, `CAPABILITY_GRANT` |
| `ACADEMIC_OPERATIONS` | 15 | `BUSINESS_CONFIGURATION_MANAGE`, `HOMEROOM_ASSIGNMENT_MANAGE`, `SUBJECT_GROUP_LEAD`, `SUBJECT_GROUP_MANAGE`, `SUBJECT_MANAGE`, `ACADEMIC_STRUCTURE_MANAGE`, `TIMETABLE_MANAGE`, `PPCT_MANAGE`, `ADDITIONAL_DUTY_ASSIGNMENT_MANAGE`, `CALENDAR_EXCEPTION_MANAGE`, `TEACHING_OPERATION_MANAGE`, `SPECIAL_ACTIVITY_MANAGE`, `TEACHING_EXECUTION_MANAGE`, `REPORTING_READ`, `REPORTING_STATEMENT_READ` |
| `ACADEMIC_PERSONAL_PROGRAMME` | 11 | `TEACHER_BASE`, `GDDP_COORDINATOR`, `HĐTN_COORDINATOR`, `TEACHING_EXECUTION_RECORD`, `REPORTING_STATEMENT_SUBMIT`, `AI_RECEIVE_SUGGESTION`, `AI_CONFIRM_SUGGESTION`, `AI_EDIT_DRAFT`, `AI_ACTIVE_USE_SCHOOL`, `AI_ACTIVE_USE_DEPARTMENT`, `AI_ACTIVE_USE_ACTIVITY` |
| `SEPARATE_APPROVAL_AND_POLICY_REVIEW` | 9 | `APPROVAL_PRINCIPAL`, `APPROVAL_VICE_PRINCIPAL`, `AUDIT_VIEW`, `ADDITIONAL_DUTY_CATALOG_MANAGE`, `AI_CONFIGURE_POLICY`, `AI_VIEW_USAGE`, `AI_VIEW_COST`, `AI_VIEW_AUDIT`, `AI_DISABLE_SYSTEM` |

Tổng số **38/38**, không thiếu/không trùng. Phân nhóm `ACADEMIC_PERSONAL_PROGRAMME` **không** có nghĩa PHT được phép cấp `TEACHER_BASE` hoặc quyền cá nhân cho mọi người. Các key `APPROVAL_*` phải gắn với **quy trình bổ nhiệm/phê duyệt**; `AUDIT_VIEW`, catalog kiêm nhiệm và các capability AI cần quyết định chủ sở hữu vì giao thoa kỹ thuật/chuyên môn. Quyền `CAPABILITY_GRANT` là quyền **điều khiển cấp grant**, không được coi là cấp mọi quyền mà không có kiểm tra theo loại.

### Cổng phân loại cuối trước khi code

1. Chốt `TECHNICAL_ROOT`: quyền hạ tầng/tài khoản Admin có thể thao tác; riêng `CAPABILITY_GRANT` chỉ cho lệnh hợp lệ ở server, không được gán mọi capability.
2. Chốt `ACADEMIC_OPERATIONS` và `ACADEMIC_PERSONAL_PROGRAMME` theo **từng command và scope**, không cấp một nhóm trọn gói; `APPROVAL_PRINCIPAL`/`APPROVAL_VICE_PRINCIPAL` không được cấp qua generic grant.
3. Chốt chủ sở hữu và hạn chế các key `SEPARATE_APPROVAL_AND_POLICY_REVIEW`; **chưa xác định thì chặn mutation**, nhưng chỉ bật gate sau kiểm kê grant legacy để tránh hồi quy.
4. Xác định mọi writer tạo, thêm hoặc thu hồi grant trong toàn repo và API tương ứng; review cả luồng seed/import/mẫu vai trò, không chỉ controller trực diện.

## 3. Ranh giới nghiệp vụ và API dự kiến

**Tiền đề PO đã xác nhận:** nhà trường luôn có PHT phụ trách chuyên môn. Không tài khoản cứu hộ/khôi phục giả định thiếu PHT và không Admin thay PHT quyết định chuyên môn.

- **Admin tài khoản:** tạo/khóa/reset tài khoản; gán mẫu vai trò `TEACHER`, `SUBJECT_LEADER`, `PRINCIPAL`, `VICE_PRINCIPAL_ACADEMIC`, `VICE_PRINCIPAL` (sau khi được phê duyệt và có trong catalog), điều phối... theo phân công thực tế. Gán mẫu là **command riêng**, không dùng generic cấp học thuật lẻ. Cấm actor tự gán/nâng, giới hạn template có thể áp, kiểm tra staff eligibility và audit nguồn phân công.
- **PHT chuyên môn:** điều hành TKB/PPCT/phân công như capability hợp lệ; thực hiện command riêng để cấp/đổi/thu hồi **quyền chuyên môn chi tiết** cho nhân sự trong scope được phép. Không được sửa quyền kỹ thuật, bổ nhiệm chính mình hoặc ủy quyền quyền cấp quyền tiếp mà không có quy tắc được chốt.
- **Hiệu trưởng:** đọc/giám sát và phê duyệt các nghiệp vụ Hiệu trưởng **đã được cấp hợp lệ**; không tự sở hữu quyền sửa TKB/PPCT/phân công chỉ vì role. `PRINCIPAL` hiện materialize quyền PHT là sai lệch đã được phát hiện, cần **phương án tương thích và thu hồi đúng nguồn**; không hotfix tước quyền khi chưa đánh giá người dùng hiện có.
- **Tổ trưởng/giáo viên/điều phối:** chỉ thao tác theo capability được cấp, scope và hiệu lực hiện tại; không tự cấp/nâng quyền.

**Không tạo generic quyền “siêu Admin nghiệp vụ”.** Dùng capability engine hiện có với **writer-level authority checks**. Cổng GUI và backend phải trùng nhau; backend luôn kiểm tra lại dù UI ẩn nút.

## 4. Giao dịch thay mẫu vai trò — contract tối thiểu

1. Preflight đọc target và các grant có hiệu lực; phân biệt **grant do template/decision nào tạo** với grant chuyên môn được cấp độc lập. Dữ liệu legacy không có provenance rõ phải được **đánh dấu cần đối chiếu**, không tự gán nguồn từ tên/role.
2. Hiển thị preview: quyền thêm, quyền kết thúc hiệu lực, quyền độc lập giữ nguyên, xung đột phạm vi, tác động đến quyền đang chạy. Preview phải có revision/token để tránh áp dụng trên dữ liệu đã thay đổi.
3. Transaction cập nhật dưới lock người dùng/coordinate cần thiết; verify lại actor, source và scope; tạo nguồn grant mới, đóng nguồn cũ **không xóa lịch sử**, audit actor/target/template trước-sau/căn cứ/thời điểm. Nếu có xung đột, rollback toàn bộ lô.
4. Sau transaction: hiệu lực đúng, không rò quyền của PHT cũ hoặc Hiệu trưởng, không khóa nhầm `TEACHER_BASE`, không hồi sinh grant đã thu hồi; bảo vệ cả request đồng thời.
5. **Không dùng `applyTemplate()` add-only để triển khai downgrade/transfer**; giữ đường cũ nguyên trong thời gian cutover cho đến khi có chứng cứ thay thế.

## 5. Kế hoạch thực hiện ít rủi ro (chỉ sau khi chốt và phê duyệt)

| Pha | Sửa mã tương lai | Chốt nghiệm thu |
|---|---|---|
| A — Inventory | Static inventory writer, grant hữu hiệu, role/template hiện có; DB production chỉ đọc nếu được phép | Có số liệu và ảnh hưởng thực tế; không thay quyền |
| B — Authority checks | Áp `actor != target` và ownership theo command tại các writer, không đổi evaluator | API direct negative tests; không có bypass tạo/thu hồi |
| C — Specialized commands | Admin role assignment; PHT academic capability grant/revoke, allowlist rõ; không chia engine | Tests role/scope/expiry, idempotence, audit |
| D — Provenance & transfer | Dùng B1 provenance theo thiết kế phê duyệt; atomic role transfer, preview revision, revoke theo nguồn | UAT chuyển PHT + Hiệu trưởng/giáo viên/Tổ trưởng, không hồi quy |
| E — Cutover | Giữ migration-aware release, backup, rollback tương thích schema, một CI/PR/lượt phát hành | CI exact-head → merge → deploy Báo giảng riêng; Nội trú không restart |

Không gộp D2 sửa quyền thực vào PR #264 tài liệu. Không sửa DB để phân loại nhóm bằng bảng mới khi chưa chứng minh cần. **Không can thiệp VPS, Nội trú, hoặc tự kích hoạt schema B1 writer.**

## 6. Ma trận test bắt buộc

| Mã | Kịch bản | Mong đợi |
|---|---|---|
| D2-01 | Admin gán `VICE_PRINCIPAL_ACADEMIC` cho tài khoản khác đúng phân công | Thành công, actor+source+audit, không cấp quyền cho Admin |
| D2-02 | Admin tự gán mẫu PHT/Hiệu trưởng hoặc tự cấp `APPROVAL_*` | Backend từ chối, không thay grant |
| D2-03 | Admin cấp `SUBJECT_MANAGE` qua generic `create` | Backend từ chối, kể cả gọi API trực tiếp |
| D2-04 | Admin cố thu hồi grant học thuật của giáo viên qua generic `revoke` | Backend từ chối, có sự kiện denial phù hợp |
| D2-05 | PHT cấp/thu hồi quyền chuyên môn đúng scope | Thành công, audit và đúng hiệu lực |
| D2-06 | PHT cấp `SYSTEM_ADMIN`, `USER_MANAGE`, `CAPABILITY_GRANT` hoặc cấp cho mình | Từ chối; không thể biến thành quyền kỹ thuật |
| D2-07 | Đổi `VICE_PRINCIPAL_ACADEMIC` → `VICE_PRINCIPAL` | Thu hồi đúng nguồn, giữ `TEACHER_BASE` và grant độc lập |
| D2-08 | Hiệu trưởng từ template hiện tại có quyền `TIMETABLE_MANAGE`; sau cutover chính sách D4 | Không được mutation ngoài D4; legacy remediation kiểm chứng và audit |
| D2-09 | `applyReconciliation` cấp baseline cho giáo viên đủ điều kiện | Chỉ `TEACHER_BASE`, không sinh quyền học thuật quản trị |
| D2-10 | Hai yêu cầu đổi vai trò cùng lúc / request replay / sai revision | Chỉ một quyết định nhất quán, không double-grant hay khuyết audit |
| D2-11 | PHT thay người theo phân công trường | Có người nhận hợp lệ trước khi kết thúc quyền cũ; không tạo tài khoản cứu hộ |
| D2-12 | Phân quyền legacy chưa có provenance xác định | Không thu hồi suy đoán, trả trạng thái cần đối soát, bảo toàn chức năng hiện hữu |

## 7. Quyết định WS1 còn phải chốt — không tự suy diễn

- Danh mục của **9 key nhạy cảm/giao thoa** và tuyến cấp/thu hồi cụ thể, đặc biệt `APPROVAL_*`, AI policy, `AUDIT_VIEW` và catalog kiêm nhiệm.
- Hợp đồng chứng minh phân công khi Admin gán/chuyển mẫu; UI preview và điều kiện xác nhận mà không tạo nhiều thao tác thủ công.
- Cách nối provenance B1 vào grant legacy, sửa `PRINCIPAL` đang kế thừa quyền PHT mà không làm gián đoạn Hiệu trưởng hiện hữu.
- Phạm vi và thời hạn ủy quyền, tuyến duyệt D5, tính nguồn TKB D6; các quyết định D4 về can thiệp khẩn cấp **không phải cơ chế cứu hộ thiếu PHT**.

**Kết luận:** Đây là tài liệu thiết kế/đối chiếu mã, không phải thẩm quyền sửa quyền thật. WS1 tiếp tục IN_PROGRESS, P6-050 giữ BLOCKED. 
