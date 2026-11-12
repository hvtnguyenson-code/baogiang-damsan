# Báo giảng / P5-057 WS1 — B1 source-aware writer, isolated staging

**Ngày:** 12/11/2026. **Baseline:** `main@d0fa72155c8a3837547ba74ea21df98c6bec0868` (PR #283 + #284 đã triển khai). **Nhánh:** `feat/p5-057-ws1-b1-writer-20261112`.

## Phạm vi của phiên

Tạo `B1RoleCommandWriter` trong `apps/api/src/capabilities/b1-role-command-writer.ts`, dùng **chính các bảng B1 và `CapabilityGrant` đã có**. **Chưa đăng ký** NestJS provider, chưa có API/controller/CLI/job, chưa bật flag, chưa seed/backfill DB, không chỉnh `main`, không migration, không đụng VPS hoặc Nội trú.

Lõi ghi thực sự có thể mở transaction trên một PrismaClient được trusted test harness cung cấp nhưng **không có đường gọi trong ứng dụng đang chạy**. Không gọi đây là writer production đã kích hoạt.

### Command và phạm vi hẹp

| Command | Actor ở service B1 | Quy tắc |
|---|---|---|
| `APPOINT PRINCIPAL` | Admin kỹ thuật hợp lệ từ seat/command DB + hai capability hiện hành | Không tự cấp; chỉ khi seat Hiệu trưởng chưa có người hiện hữu; không ngày kết thúc bắt buộc |
| `TRANSFER PRINCIPAL` | Admin tương tự | Một transaction kết thúc nguồn Hiệu trưởng cũ và tạo nguồn người kế nhiệm; khai báo chính xác `previousUserId` + `expectedAppointmentId` |
| `DISMISS PRINCIPAL` | Admin tương tự | Kết thúc appointment đúng ID và các **nguồn trực tiếp của appointment đó**; chỉ thu hồi grant nếu không còn nguồn B1 độc lập |
| `APPOINT / DISMISS / TRANSFER VICE_PRINCIPAL_ACADEMIC` | Admin tương tự | Có thể có nhiều PHT; quản lý nguồn của từng appointment, không cấp `CAPABILITY_GRANT` cho PHT |

Nguồn `PRINCIPAL` chỉ sinh **`APPROVAL_PRINCIPAL` + `AUDIT_VIEW`**; nguồn `VICE_PRINCIPAL_ACADEMIC` chỉ sinh **`APPROVAL_VICE_PRINCIPAL` + `ADDITIONAL_DUTY_CATALOG_MANAGE`**. **Không** có nghĩa là đã hiện thực toàn bộ template vận hành `PRINCIPAL`/`PHT`, chưa làm TTCM, D4, D5, D6. Đặc biệt không tự động thu hồi quyền PHT legacy kế thừa trong template Hiệu trưởng.

5 quyền quản trị AI không có đường mở trong writer. `TEACHER_BASE`, source chuyên môn độc lập và các quyền khác không bị xóa.

### Giao dịch và an toàn

1. Trước transaction: định dạng UUID/role/command, actor khác target (và khác người cũ trong transfer), requestKey có giới hạn; chính sách không nhận issuer role từ body.
2. PostgreSQL `SERIALIZABLE` với khóa **seat → danh sách users đã sắp xếp → coordinate CAS**. Đọc thời điểm `transaction_timestamp()` để dùng cho hiệu lực ngay khi xác nhận. `expectedSeatVersion` phải đúng với `AuthoritySeat.policyVersion`, không gắn ngày hết vào bổ nhiệm mới.
3. Actor bắt buộc là user ACTIVE, không mustChangePassword; có seat `TECHNICAL_ACCOUNT_ADMIN` còn hiệu lực, enabled, do actor khác lập command, và có `USER_MANAGE` + `CAPABILITY_GRANT` hợp lệ. Không coi bootstrap grant tự nó là chứng minh thẩm quyền bổ nhiệm.
4. Trong cùng transaction: `AccessCommand` với fingerprint và unique replay key; `RoleAppointment`, `GrantSource`, `GrantSourceRevision`, `AccessCoordinate.version` (CAS), `CapabilityGrant`, `GrantProjectionRevision` + slice + supports, `AuthorizationState` epoch và `AuditEvent`. Thất bại bất kỳ bước nào rollback toàn bộ.
5. Người được bổ nhiệm phải ACTIVE hoặc PENDING; miễn nhiệm cho phép đóng nguồn tài khoản đã LOCKED/DISABLED nhưng không xóa lịch sử. Hiệu trưởng có một occupant tại thời điểm commit; PHT cho phép nhiều người.
6. `AUDIT_VIEW` từ hai nguồn B1 đã xác minh dùng **một grant hiện hữu** kèm hai source supports. Khi kết thúc nguồn Hiệu trưởng, giữ grant nếu nguồn Admin kỹ thuật B1 vẫn đang hợp lệ; chỉ bỏ support của chức trách kết thúc.
7. Grant legacy có `coordinateId=NULL`, coordinate trùng, nguồn lạ, projection history không khớp hoặc không đủ chứng cứ bị **NEEDS_RECONCILIATION** (Conflict), không đoán nguồn và không revoke.
8. Không ghi khoảng hiệu lực 0 ms khi bổ nhiệm/miễn nhiệm cùng tick. Idempotency replay cùng fingerprint trả receipt, khác payload với cùng key bị từ chối.

### Bằng chứng và giới hạn hiện tại

- Mock Prisma transaction in-memory **13/13 Jest PASS**, gồm: một nguồn, hai nguồn `AUDIT_VIEW`, chuyển giao nguyên tử, CAS thất bại rollback, idempotency, self grant, legacy unknown, stale seat, nhiều PHT, zero-length interval.
- Lint/typecheck toàn dự án **chưa được xác minh trên HEAD nhánh**: quá trình type-aware trên laptop có lỗi tài nguyên (native OOM/stack overflow), không được báo thành PASS. Cần CI exact-head, test integration trên PostgreSQL 16/17 cô lập và independent security review.
- Unit mock không thay thế test exclusion constraint, FK, row lock hoặc race thực tế của PostgreSQL.

**Tuyệt đối chưa được coi P5-057/WS1 xong:** `CapabilitiesService.create/revoke` và `AccessBaselineService.applyTemplate` trên runtime vẫn có đường ghi generic có thể bypass nguồn chuyên biệt; bootstrap/legacy chưa đối soát. **Trước bất kỳ merge/cutover writer active**, phải hoàn thiện mô phỏng dữ liệu nguồn thực, phủ direct-API bypass, ổn định TypeScript/CI PG16/17 và 7 persona, rồi duyệt kích hoạt riêng. Việc merge riêng class chưa kết nối không đồng nghĩa writer hoạt động.

### Gate tiếp theo

- Rà soát kỹ `GrantProjectionSlice/GrantSupport` với schema thực và migration PG16/17; test thực tế stale revision, concurrent seat handover/retry/rollback.
- Inventory production **aggregate READ ONLY** (không PII), đánh giá bootstrap Admin chưa có B1 seat, nguồn legacy, bản quyền đang hoạt động; không backfill suy đoán.
- Chuẩn bị patch đồng bộ **tất cả writer ingress** nhằm chặn generic bypass tại điểm chuyển tiếp, với thử nghiệm 7 persona và rollback phù hợp. Không bật các patch chặn khi chưa có đường bổ nhiệm mới thực sự sẵn sàng.
- Reviewer độc lập, GitHub CI xanh, quyết định merge/triển khai. Chỉ auto-deploy GitHub hiện hữu, không đổi CI pipeline.

**Task:** `P5-057/T56 = IN_PROGRESS`, `P6-050 = BLOCKED`. **Không có mutation production**.
