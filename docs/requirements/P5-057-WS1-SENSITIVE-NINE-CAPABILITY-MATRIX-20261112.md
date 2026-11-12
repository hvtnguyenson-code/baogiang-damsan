# P5-057 / WS1 — Ma trận thẩm quyền 9 capability nhạy cảm (G-D2-2)

**Ngày lập:** 12/11/2026. **Baseline:** `main@6a42ee4083c6031e406f69b03bf295ec32c996d9` (sau PR #282).
**Trạng thái:** DỰ THẢO QUYẾT ĐỊNH / REVIEW REQUIRED — CHƯA PHẢI POLICY ĐƯỢC KÍCH HOẠT.
**Phạm vi:** đối chiếu source-of-truth, chủ sở hữu, người xác nhận cấp/thu hồi, đối tượng, hiệu lực và nguồn kiểm toán. Không thay auth, schema, DB, runtime, CI/CD hoặc cấp quyền thật.

## 1. Cơ sở đã được chốt và ranh giới

- D1/D2: PHT quyết định thay đổi chuyên môn; Admin kỹ thuật quản trị tài khoản và **bổ nhiệm/miễn nhiệm PHT**; PHT **bổ nhiệm/miễn nhiệm TTCM**. Không tự bổ nhiệm, không tự cấp quyền; PHT không nhận `CAPABILITY_GRANT/SCHOOL_WIDE`.
- D3: quyền có hiệu lực ngay khi xác nhận thành công trên server, không hồi tố; miễn nhiệm kết thúc **nguồn quyền thuộc chức trách đó**, không xóa `TEACHER_BASE`, nguồn khác hoặc audit.
- Quyết định PO 08/11/2026 về đơn giản hóa: **không bắt nhập số quyết định, ngày ký, người ký, tệp minh chứng hay lý do cho bổ nhiệm thông thường**. Người có thẩm quyền đăng nhập, chọn người/chức trách/phạm vi, xem trước, xác nhận; hệ thống lấy actor từ session và tự lưu thời điểm, thay đổi, nguồn quyền, audit, idempotency. Không biến giấy tờ thành gate.
- D4 khẩn cấp HT phải có lý do, thời hạn, thông báo PHT và hậu kiểm; **không** đồng nhất với bổ nhiệm thông thường hoặc `AI_DISABLE_SYSTEM`. D5 TTCM thẩm định bảng kê BGH nhưng không tự duyệt, không tự nhận `APPROVAL_PRINCIPAL`/`APPROVAL_VICE_PRINCIPAL`.
- B1 đã có bảng nguồn/projection và bộ kiểm chứng advisory; `SUPPORT_CANDIDATE` không tương đương thẩm quyền cấp quyền. Writer B1 chưa bật; `canConfirm=false`, `provenanceVerified=false`.

## 2. Ma trận 9 key — hiện trạng tách khỏi đề xuất

Tất cả 9 key **hiện chỉ cho phép scope `SCHOOL_WIDE` trong `prisma/capability-catalog.cjs`**, không có scope cá nhân/tổ/môn. Cột “Đề xuất” là phương án **chờ PO chốt**, tuyệt đối không phải grant allowlist có hiệu lực. “Issuer” là tài khoản **xác nhận thao tác trong hệ thống**, không mặc nhiên là người ký văn bản ngoài đời.

| Key | Chủ sở hữu / đối tượng và đường sử dụng đang có | Issuer / revoker đề xuất | Hiệu lực và nguồn chứng cứ | Gate |
|---|---|---|---|---|
| `APPROVAL_PRINCIPAL` | Hiệu trưởng; template `PRINCIPAL`; dùng trong duyệt bảng kê, điều phối chương trình và đọc readiness. | **OPEN:** cách Admin ghi nhận/thu hồi người giữ chức HT chưa được PO chốt tại WS1. Không cho HT tự cấp, không để PHT cấp. | Nguồn bổ nhiệm HT có seat riêng, actor từ session, quyền bắt đầu lúc xác nhận; chỉ kết thúc nguồn HT khi thu hồi hợp lệ, không đụng nguồn khác. | **G1 — PO quyết định issuer/revoker HT** |
| `APPROVAL_VICE_PRINCIPAL` | PHT chuyên môn; template `VICE_PRINCIPAL_ACADEMIC`; dùng trong duyệt, điều phối, preflight TTCM. | **ĐÃ CHỐT:** Admin bổ nhiệm và miễn nhiệm PHT, không self-appoint, không tự cấp qua generic writer. | Seat PHT đang hiệu lực, actor Admin đã xác thực, phiên bản + nguồn B1; hiệu lực khi xác nhận; không hồi tố. | **G2 — hiện thực kiểm tra nguồn/seat trong writer** |
| `AUDIT_VIEW` | Hiệu trưởng (`PRINCIPAL`), Admin kỹ thuật (`TECHNICAL_ACCOUNT_ADMIN`) và bootstrap có grant; controller audit dùng key này. | **OPEN:** tách thẩm quyền giám sát HT và chức năng vận hành kỹ thuật; chỉ người được chỉ định được cấp/thu hồi, không mặc nhiên cấp cho PHT/TTCM. | Hai nguồn độc lập nếu cùng đủ điều kiện; không xóa quyền giám sát khi đổi chức trách kỹ thuật (hoặc ngược lại) nếu còn nguồn khác; log đối tượng truy cập. | **G3 — chủ sở hữu, tuyến issuer/revoker và phân tách log** |
| `ADDITIONAL_DUTY_CATALOG_MANAGE` | Hiện thuộc `TECHNICAL_ACCOUNT_ADMIN` và bootstrap; API tạo/sửa danh mục kiêm nhiệm dùng key này. | **ĐỀ XUẤT:** PHT sở hữu quyết định nghiệp vụ danh mục; Admin vận hành kỹ thuật chỉ theo nguồn được phê duyệt. **Chưa chốt** cách chuyển từ template Admin đang hoạt động. | Scope school-wide hiện có; lịch sử grant kỹ thuật phải được đối soát trước cutover, tuyệt đối không revoke bằng so tên template. | **G4 — phân định nghiệp vụ PHT / technical và legacy** |
| `AI_CONFIGURE_POLICY` | Phase 11 AI; chỉ có catalog/contracts/đặc tả, **chưa có route sản xuất được xác minh**. | **ĐỀ XUẤT:** HT phê duyệt ngân sách/policy, người được ủy quyền cấu hình theo nhiệm vụ; không suy từ `SYSTEM_ADMIN`, không tự cấp. | Chưa có nguồn grant được phê duyệt; chỉ kích hoạt sau Phase 11 gate, policy version/quota/audit. | **G5 — PO quyết định owner/issuer và Phase 11** |
| `AI_VIEW_USAGE` | Phase 11; catalog/contracts/đặc tả; chưa có route sử dụng thật. | **ĐỀ XUẤT:** HT/PHT được phân quyền xem thống kê trong mục đích chuyên môn; issuer và revoker cụ thể **OPEN**. | Tổng hợp tối thiểu, không mặc nhiên xem toàn bộ nội dung hội thoại/dữ liệu cá nhân; Phase 11 gate. | **G6 — quyền xem/đối tượng dữ liệu** |
| `AI_VIEW_COST` | Phase 11; chưa có route sản xuất. | **ĐỀ XUẤT:** HT/chức trách được giao quản lý ngân sách; không đồng nhất với người cấu hình AI; issuer/revoker **OPEN**. | Chi phí/ledger, người truy cập và khoảng hiệu lực audit; Phase 11 gate. | **G7 — tài chính, bảo mật chi phí** |
| `AI_VIEW_AUDIT` | Phase 11; chưa có route sản xuất. | **ĐỀ XUẤT:** HT và người được giao kiểm tra an toàn; `AUDIT_VIEW` không tự cấp `AI_VIEW_AUDIT` (và ngược lại). | Log AI độc lập, giảm dữ liệu nhạy cảm, thời hạn lưu theo policy; Phase 11 gate. | **G8 — phân tách audit hệ thống/AI** |
| `AI_DISABLE_SYSTEM` | Phase 11; dự kiến kill switch toàn hệ thống, chưa có route sản xuất. | **ĐỀ XUẤT:** HT quyết định, thực thi qua thao tác đặc biệt có audit/kiểm soát; phương án can thiệp kỹ thuật khẩn cấp **OPEN**. | Phải rõ tác động toàn trường, xác nhận lại, thông báo, kế hoạch bật lại; không sử dụng làm đường vòng cấp quyền D4. | **G9 — PO chốt tuyến emergency và khôi phục** |

**Không tự chọn:** cấp `AUDIT_VIEW` cho TTCM, giao `ADDITIONAL_DUTY_CATALOG_MANAGE` cho PHT ở production, bất kỳ key AI nào, hoặc giới hạn thời hạn bổ nhiệm HT/PHT khi chưa có quyết định tương ứng. Các điểm “ĐỀ XUẤT” không phải quyết định PO.

## 3. Kiểm kê các đường vào và rủi ro đã xác minh

1. `prisma/capability-catalog.cjs`: cả 9 key có scope `SCHOOL_WIDE`. Đây mới là schema/capability catalog, **không** phải allowlist actor/issuer.
2. `responsibility-template-catalog.ts`: `PRINCIPAL` có `APPROVAL_PRINCIPAL` và `AUDIT_VIEW`; `VICE_PRINCIPAL_ACADEMIC` có `APPROVAL_VICE_PRINCIPAL`; `TECHNICAL_ACCOUNT_ADMIN` có `AUDIT_VIEW`, `ADDITIONAL_DUTY_CATALOG_MANAGE`. Không template nào mặc định có 5 key AI ở ma trận này.
3. Runtime consumers hiện có: `reporting-statements.service.ts`, `programme-planning-authorization.service.ts` và `authorized-programme-planning.service.ts` sử dụng `APPROVAL_*`; `audit.controller.ts` sử dụng `AUDIT_VIEW`; `additional-duties.controller.ts` và `additional-duty-access.service.ts` sử dụng catalog kiêm nhiệm. Nhóm AI mới ở mức giao diện/ports/đặc tả, chưa được phép coi là tính năng runtime.
4. **CRITICAL — G1/G2 generic writer bypass:** `CapabilitiesController` được bảo vệ bởi `CAPABILITY_GRANT/SCHOOL_WIDE`, nhưng `CapabilitiesService.create/revoke` hiện chỉ chặn actor=target; không phân biệt 9 key nhạy cảm theo issuer/seat, không buộc chứng cứ nguồn B1. Một Admin có quyền generic vẫn có thể cấp các key đó cho người **khác**. Không được coi việc chặn self-grant là đã đóng lỗ hổng này.
5. `AccessBaselineService.applyTemplate` là add-only; không được coi là command chuyển chức trách. `PRINCIPAL` còn kế thừa `PHT_OPERABILITY_GRANTS` theo template cũ: D4 phải xử lý theo nguồn, không xóa ngầm.
6. B1 `B1RepositoryInspector` chỉ kiểm tra tính nhất quán nguồn ở thời điểm đọc, chưa kiểm chứng issuer hợp lệ theo **từng capability**. Chưa dùng kết quả để phê duyệt/thu hồi.

## 4. Điều kiện cần chốt trước writer

- Mỗi key phải có **owner – issuer – revoker – đối tượng – scope – hiệu lực – nguồn** rõ ràng; chức trách từ session/seat, không hardcode người/ID; người có quyền bổ nhiệm phải có quyền miễn nhiệm tương ứng, không ai tự gán.
- Với `APPROVAL_PRINCIPAL`, `AUDIT_VIEW`, catalog kiêm nhiệm và 5 key AI, các gate G1, G3–G9 còn cần quyết định PO. Phần D2 được chốt với PHT không tự suy thành quyền cấp mọi key trường.
- Trước bất kỳ quyền ghi thật nào: thiết kế chống vòng `generic create/revoke` và `applyTemplate` ở backend, kiểm tra actor/target/key/scope/source, transaction CAS/idempotency, preview hậu quả, giữ union nguồn theo khoảng thời gian và rollback. Legacy không rõ nguồn trả NEEDS_RECONCILIATION, không tự backfill/revoke.
- Kiểm kê chỉ đọc grant production theo key/scope và phân biệt nguồn `coordinateId=NULL` trước rollout có phê duyệt riêng; test API trực tiếp cả 9 key, mọi đường ghi, negative self/cross/scope/race và 7 persona. Không dùng dữ liệu production để test.
- 5 key AI chỉ áp dụng theo Phase 11 sau gate AI; không triển khai endpoint mới, bật flag hoặc grant do tài liệu này.

## 5. Tiêu chí đóng G-D2-2

**Chưa đạt.** Đề nghị PO quyết định theo đúng 9 gate G1–G9, không hỏi lại D1–D6 và không yêu cầu giấy tờ nhân sự. Sau khi duyệt, mới chuyển thành policy machine-readable *trong engine B1 hiện có* (không tạo engine song song) và viết test authorizer/writer. Đến lúc đó, WS1/T56 vẫn IN_PROGRESS; `P6-050` BLOCKED.

Nguồn: `docs/requirements/P5-057-WS1-D2-D6-PO-DECISIONS-20261107.md`, `P5-057-WS1-D2-D3-GRANT-SOURCE-TRANSFER-DESIGN-20261107.md`, quyết định PO 08/11 đang ở tài liệu làm việc local (chưa commit, không chép nguyên hồ sơ), `docs/architecture/AI_GOVERNANCE_AND_ACCESS_MODEL.md`, catalog, template và các controller/service liệt kê ở trên.
