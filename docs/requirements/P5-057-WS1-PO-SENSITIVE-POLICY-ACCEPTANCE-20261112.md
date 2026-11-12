# P5-057 / WS1 — Chốt gộp ba nhóm thẩm quyền nhạy cảm (12/11/2026)

**PO acceptance:** chốt trực tiếp trong hội thoại: “đồng ý gộp. Làm đi”. Quyết định này phê duyệt **chính sách nghiệp vụ** bên dưới; không đồng nghĩa phê duyệt merge hoặc thay đổi quyền production. Tham chiếu dự thảo: PR #283, `docs/requirements/P5-057-WS1-SENSITIVE-NINE-CAPABILITY-MATRIX-20261112.md` (chưa merge tại thời điểm biên soạn).

## A. Đã được chốt

1. **Hiệu trưởng / `APPROVAL_PRINCIPAL`:** Admin kỹ thuật đăng nhập, ghi nhận hoặc thu hồi/chuyển giao người giữ chức trách Hiệu trưởng cho **tài khoản khác** thông qua command chuyên biệt. Không hardcode principal user ID. Không bắt nhập ngày kết thúc; hiệu lực bắt đầu khi xác nhận trên server, chỉ chấm dứt khi người có thẩm quyền thu hồi/chuyển giao. Có thể thay người khi kết thúc nhiệm kỳ, nghỉ hoặc điều chuyển mà không phải sửa mã. Đây là ghi nhận trong phần mềm, **không phải** Admin ký quyết định nhân sự ngoài đời.
2. **`AUDIT_VIEW`:** quyền theo hai nguồn độc lập: chức trách `PRINCIPAL` để giám sát và `TECHNICAL_ACCOUNT_ADMIN` để vận hành. Khi kết thúc **một nguồn**, chỉ dừng nguồn đó; không xóa capability đang được nguồn kia chứng minh còn hiệu lực. Trường hợp cùng tài khoản được cả hai nguồn cần xem union theo thời gian (không đếm nguồn đơn thuần).
3. **`ADDITIONAL_DUTY_CATALOG_MANAGE`:** PHT chuyên môn sở hữu và quản lý chính sách/danh mục kiêm nhiệm. **Không** tự động thu hồi grants của Admin kỹ thuật đang có tại production: giữ trong giai đoạn chuyển tiếp và phải đối soát `GrantSource`, `coordinateId`, lịch sử trước cutover. Không dùng template name để đoán nguồn.

Các quyết định D2/D3 đã chốt vẫn giữ nguyên: Admin bổ nhiệm/miễn nhiệm PHT, PHT bổ nhiệm/miễn nhiệm TTCM; người xác nhận là actor đăng nhập đã xác thực; chống tự cấp; không bắt giấy tờ nhân sự, ngày ký, tệp đính kèm hoặc lý do đối với bổ nhiệm thường. D4 can thiệp HT khẩn cấp là luồng độc lập có lý do + TTL + thông báo PHT.

## B. Năm quyền quản trị AI — hoãn theo Phase 11

`AI_CONFIGURE_POLICY`, `AI_VIEW_USAGE`, `AI_VIEW_COST`, `AI_VIEW_AUDIT`, `AI_DISABLE_SYSTEM` vẫn có trong catalog để dự phòng kiến trúc, nhưng **không được cấp quyền mới hoặc mở endpoint hoạt động** trước gate AI Phase 11. Mỗi key cần issuer/revoker/quy tắc riêng khi mở Phase 11. `AUDIT_VIEW` không suy diễn thành `AI_VIEW_AUDIT`; `SYSTEM_ADMIN` không đồng nghĩa quyền AI.

## C. Biên giới kỹ thuật / không tự suy diễn

- `sensitive-capability-policy.ts` là bảng kiểm chứng thuần, **KHÔNG đăng ký NestJS/route và KHÔNG ghi DB**. Kết quả tốt nhất `CANDIDATE_ONLY`; mọi nhánh có `canConfirm=false`, `provenanceVerified=false`, `writerEnabled=false`.
- Generic `create/revoke` cùng `applyTemplate` **vẫn là đường ghi đang vận hành**: đây là hiện trạng cần cutover an toàn, không được coi bộ kiểm chứng advisory đã chặn các endpoint ấy. Cấm mở writer mới cho tới khi server revalidate actual session actor + active seat + origin command/source + policy version trong transaction và có test API trực tiếp.
- Với **technical Admin `AUDIT_VIEW`**, chính sách chỉ **bảo toàn nguồn hiện hữu**, không bật cấp/thu hồi mới qua công cụ pure-policy vì tuyến tạo mới seat `TECHNICAL_ACCOUNT_ADMIN` vẫn cần chứng minh. Không tự tạo thêm technical Admin.
- Hiệu lực của chức trách mặc định không có ngày hết; chuyển giao/thu hồi phải có đối tượng và exact `sourceId`, CAS/idempotency + audit và xử lý đồng thời, không dùng `validUntil` suy đoán.
- Các grants legacy có `coordinateId=NULL` hoặc `LEGACY_UNCLASSIFIED` không được suy đoán provenance và thu hồi. Phải inventory read-only, reconciliation có duyệt riêng, shadow trial, rollback.
- Không cấp thêm `CAPABILITY_GRANT/SCHOOL_WIDE` cho PHT, không cấp `APPROVAL_*` cho TTCM, không tạo engine quyền thứ hai. Tất cả quyền thực tế tiếp tục dựa `CapabilityGrant`, scope, valid-time, audit và default deny.

## D. Gate kế tiếp — chưa hoàn tất

1. Chính thức hóa `AuthoritySeat` và command policy: actor session, seat active, actor không phải target, nguồn phù hợp, từng key, đúng scope và thông tin hiệu lực.
2. Thiết kế atomic handover HT và PHT, giữ union multi-source và `TEACHER_BASE`; kiểm thử PostgreSQL cô lập với race/idempotency, replay, stale revision và hồ sơ legacy.
3. Giải quyết **generic writer bypass** ở **tất cả** lối ghi grant (`CapabilitiesService.create/revoke`, `AccessBaselineService.applyTemplate`, baseline, bootstrap) cùng cơ chế chuyển tiếp an toàn, không vô hiệu hóa Admin hiện hành.
4. Full regression 7 persona, CI exact-head, review độc lập, quyết định merge/rollout và rollback riêng; không dùng production làm test.

**Trạng thái:** PO policy nhóm 3 = ACCEPTED; **implementation = PREVIEW_ONLY**, P5-057/T56 IN_PROGRESS, P6-050 BLOCKED, writer B1 chưa hoạt động.
