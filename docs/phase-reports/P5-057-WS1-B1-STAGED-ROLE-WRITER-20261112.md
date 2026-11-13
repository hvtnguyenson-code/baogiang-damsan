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


---

## Checkpoint s?a l?i sau review ??c l?p, ng?y 13/11/2026

**Tr?ng th?i:** LOCAL ONLY / NO COMMIT / NO PUSH / NO CI / NO MERGE / NO DEPLOY. Kh?i n?y c?p nh?t b?ng ch?ng sau PR #285 HEAD `5f9b747`, thay th? c?c nh?n ??nh "ch?a c? PG th?c" c?a checkpoint c?. Nh?ng n?i dung ch?a ki?m th? v?n ???c gi? r? b?n d??i.

### S?a 6 finding c?a review
1. **CRITICAL append-only:** `AccessCommand` nay INSERT v?i receipt ho?n ch?nh ???c l?p k? ho?ch t? c?ng transaction; kh?ng c?n UPDATE. So s?nh summary th?c t? v?i k? ho?ch ?? rollback to?n b? khi sai.
2. **CRITICAL lifecycle:** nhi?m k? c? hi?u l?c k?t th?c b?ng `RoleAppointment.validUntil` v? `GrantSourceRevision.ENDED`; `cancelledAt` kh?ng b? s? d?ng sai cho mi?n nhi?m.
3. **HIGH ?a PHT:** forward-only migration `20261113160000_p5_057_ws1_multi_vice_seat` gi? exclusion seat HT/Admin k? thu?t, ri?ng PHT cho ph?p nhi?u ng??i, ??ng th?i kh?ng cho c?ng ng??i gi? 2 kho?ng ch?ng l?n. **Kh?ng s?a migration B1 ?? ?p d?ng.**
4. **HIGH source provenance:** ki?m tra allowlist seat/capability v? ch?ng minh ng??i c?p c? seat + hai quy?n k? thu?t t?i th?i ?i?m ra l?nh. H? tr? `TECHNICAL_DIRECT` c? command r? r?ng cho `AUDIT_VIEW` / catalog, kh?ng suy ?o?n ngu?n legacy. Ngu?n kh?ng ?? b?ng ch?ng t? ch?i ??i so?t.
5. **HIGH generic ingress:** th?m guard d?ng chung v?o `CapabilitiesService.create/revoke`, `AccessBaselineService.applyTemplate` v? CLI bootstrap. Ch?n ?? 9 quy?n nh?y c?m **ch? khi `B1_REJECT_GENERIC_SENSITIVE_WRITES=true`**; m?c ??nh FALSE. **??y l? code cutover ch?a k?ch ho?t**, v? API writer B1 v? UAT ch?a nghi?m thu. Kh?ng ???c g?i l? h?ng production ?? ??ng.
6. **MEDIUM CAS/idempotency:** b?t bu?c `expectedAuthorizationEpoch` tr?n l?nh m?i, t?ng epoch trong transaction, ??c l?i receipt tr??c ki?m tra phi?n b?n seat/epoch; th? nghi?m hai b? nhi?m HT ??ng th?i ch? m?t th?nh c?ng.

### K?t qu? ki?m th? t?i laptop (kh?ng d?ng DB tr??ng)

- Jest targeted: **3 suites, 21/21 PASS**; g?m unit transaction, 9-key generic guard v? negative ingress service + CLI bootstrap.
- ESLint kh?ng type-aware, scoped: **PASS cho ?? 8 t?p TypeScript thay ??i**, bao g?m bootstrap CLI v? 3 b? test.
- **PostgreSQL 17.10 c? l?p, 127.0.0.1:55539:** t?o cluster ephemeral locale C, ?p d?ng **33/33 migrations PASS** (k? c? migration m?i); kh?ng k?t n?i production.
- **PG17 writer transaction PASS:** Principal APPOINT / TRANSFER / DISMISS; trigger append-only th?t ch?n UPDATE; request-key idempotent replay; ba PHT ??ng th?i; ch?n b? nhi?m tr?ng ng??i; 4 source revision ENDED; 6 audit events.
- **PG17 hai ngu?n AUDIT_VIEW PASS:** ngu?n `TECHNICAL_DIRECT` gi? nguy?n `CapabilityGrant` v? 1 support khi Hi?u tr??ng th?i ch?c; ch? ngu?n Principal k?t th?c.
- **PG17 concurrency / epoch PASS:** replay th?nh c?ng sau ??i epoch v? policyVersion, stale epoch t? ch?i, hai y?u c?u HT ??ng th?i cho ??ng 1 winner v? 1 loser; ch? c?n 1 Principal active.
- Full TypeScript local **INCONCLUSIVE**: Node/TypeScript tr?n Windows b? native `StackOverflowException`; laptop 12 GB RAM, t?i ki?m tra ch? kho?ng 3 GB tr?ng. Kh?ng b?o PASS v? kh?ng k?ch ho?t CI nh?m d? l?i.
- Review ??c l?p **CH?A ??T**: Antigravity task `3e80673f-f37f-4a14-96d8-503607eeb24d` b? `AGENT_PIN_REQUIRED`; `platform_agents` kh?ng nh?n di?n ???c c? Antigravity l?n Codex CLI t?i gateway. Kh?ng coi ??y l? review th?nh c?ng.
- Ch?a c? PG16 th?c cho migration m?i, ch?a ch?y 7-persona UAT ho?c full negative direct API E2E. C?n gi? PR Draft, kh?ng merge ho?c k?ch ho?t flag.
- C?m PG th? nghi?m ch? d?ng d? li?u nh?n s? gi?, kh?ng c? d? li?u h?c sinh/gi?o vi?n th?t. D?ng v? x?a c?m t?m c?ng script t?m tr??c khi k?t th?c.

### Quy t?c ph?t h?nh b?t bi?n

- Kh?ng commit/push s?a gi?a workflow ?ang ch?y; ph?i preflight local ??y ??, gom to?n b? thay ??i th?nh m?t checkpoint, independent review, PG16+17, regression v? kh?ng c?n issue blocking.
- **Kh?ng b?t `B1_REJECT_GENERIC_SENSITIVE_WRITES` ch? v? CI xanh**: ph?i c? API B1 thay th? ???c test v? ph??ng ?n legacy/rollback ?? duy?t; n?u b?t guard ri?ng l? s? l?m gi?n ?o?n thao t?c quy?n hi?n h?nh.
- Kh?ng ??ng `main`, DB th?t, VPS, kh?ng s?a quy tr?nh GitHub ? CI ? auto-deploy. `P5-057/T56=IN_PROGRESS`, `P6-050=BLOCKED`.


## Ti?p t?c ki?m ch?ng local ? 13/11/2026 (sau c?p l?i MCP)

**Kh?ng commit/push/CI/merge/deploy**; to?n b? thay ??i d??i worktree c?a PR #285, branch `feat/p5-057-ws1-b1-writer-20261112`. Report n?y c?p nh?t c?c d?ng checkpoint tr??c ??, kh?ng c? quy?n t? n?ng tr?ng th?i PR.

- **TypeScript strict t?i ?u theo ti?n tr?nh ??c l?p: 9/9 t?p PASS**, g?m 8 t?p TS t?c ??ng ???c ki?m ch?ng tr??c v? m?t integration test m?i. M?i t?p d?ng `tsc --noEmit --strict` + `skipLibCheck`, exit 0. **Typecheck t?ng h?p project v?n INCONCLUSIVE** v? Node `StackOverflowException` khi gom c? dependency graph; kh?ng ???c thay b?ng k?t lu?n `full API typecheck PASS`.
- **Unit/Jest 3 suites: 22/22 PASS** (t?ng m?t ca negative service `AccessBaselineService.applyTemplate` cho c? `PRINCIPAL` v? `VICE_PRINCIPAL_ACADEMIC`; x?c minh Prisma `capabilityGrant.create` kh?ng ???c g?i khi guard cutover b?t). C? test v? lint c?a t?p s?a th?m ??u PASS.
- **B? sung t?p t?ch h?p b?n v?ng:** `apps/api/test/capabilities/b1-role-command-writer.integration.spec.ts`, 2 tests ch?y v?i DB test c? l?p v? rollback transaction `SERIALIZABLE`. Kh?ng import `AppModule`, d?ng `resolveSafeTestDatabaseUrl` ?? kh?ng cho ph?p k?t n?i d? li?u production. T?p ???c ??t theo pattern `*.integration.spec.ts` v?n ?? ???c workflow P6-021 ch?y, **kh?ng th?m workflow**.
- **PostgreSQL 17 th?c t?i localhost:55539: PASS**: ?? t?o database `baogiang_test` t?m, ch?y **33/33 Prisma migrations**, sau ?? `2/2` integration tests PASS: append-only Principal command/receipt, replay, FK/source support, hai VP gi? ch?c tr?ch ch?ng th?i gian. D? li?u t?o trong test ???c rollback; sau ki?m th? c?m t?m v? config test ?? d?ng/x?a, kh?ng li?n h? DB tr??ng.
- C?c b?ng ch?ng PG17 tr??c v?n c? hi?u l?c (Principal APPOINT/TRANSFER/DISMISS, `AUDIT_VIEW` hai ngu?n, race m?t Principal, epoch/idempotency). B? integration m?i cung c?p ca regression th?c thi ???c trong CI ? HEAD ti?p theo thay v? ch? d?a tr?n script t?m.
- **PostgreSQL 16 v?n ch?a ch?y tr?n migration/test m?i**. Ki?m tra m?y: Windows ch? c? PG17, WSL Ubuntu c?ng PG17, kh?ng c? Docker/Podman v? kh?ng c?i th?m DB engine. P6-021 #117 tr??c ??y xanh nh?ng l? **HEAD c?**, kh?ng ???c d?ng l?m b?ng ch?ng cho migration m?i. L??t PG16 ti?p theo ch? ???c ch?y tr?n m?t HEAD cu?i ?? qua preflight v? ?? ?i?u ki?n k?ch ho?t CI; kh?ng d?ng VPS production ?? th?.
- **Review ??c l?p v?n BLOCKED:** `platform_agents(refresh)` cho `codex` / `antigravity` ??u `AGENT_EXECUTABLE_UNAVAILABLE_OR_UNTRUSTED` / `BLOCKED_NO_VERIFIED_OS_BACKEND`. Laptop c? `agy.exe` version 1.5.6 nh?ng gateway kh?ng c?ng nh?n l? agent ?? pin/verify; kh?ng ch?y CLI v??t qua ki?m so?t gateway. Kh?ng ghi nh?n `REVIEW_PASS`.
- C?n thi?u: independent review h?p l?, PostgreSQL 16 on exact new head, full project typecheck/build, inventory legacy kh?ng PII, negative HTTP E2E, 7 persona UAT, API B1 trusted caller/cutover v? rollback. Guard `B1_REJECT_GENERIC_SENSITIVE_WRITES` m?c ??nh **false**; writer v?n **UNREGISTERED / INERT**.
- **Quy t?c GitHub:** kh?ng commit ho?c push ? checkpoint n?y; tr??c push cu?i ph?i t?ng h?p to?n b? l?i, ho?n t?t ki?m th? local v? ki?m tra kh?ng workflow c?n ch?y. Kh?ng ch?y tay ho?c h?y workflow P6-021 ?? t?ng t?c.

**K?t lu?n:** source-level B1 ?? ti?n th?m m?t m?c ki?m ch?ng, nh?ng PR #285 ti?p t?c **Draft/IN_PROGRESS**, kh?ng ?? gate merge.


## Ch?t preflight b? sung ng?y 13/11/2026 ? b?o to?n CI v? c?ng production migration

**Tr?ng th?i:** LOCAL CANDIDATE / NO COMMIT / NO PUSH / NO MANUAL CI / NO MERGE / NO DEPLOY. Worktree `feat/p5-057-ws1-b1-writer-20261112`, base HEAD `5f9b747d61813d426c45e2bf8ac82b9fc527ec61`.

### Ph?p th? th?c thi l?i t?i worktree

- `git diff --check`: PASS.
- Jest standard v?i c?u h?nh ts-jest nguy?n b?n: **INCONCLUSIVE** tr?n Windows Node v22.22.2, native `StackOverflowException` sau GC. Kh?ng ghi nh?n PASS cho l?nh ??.
- Jest d?ng scoped transpile-only v? ch?nh logic test ?ang c?: **3 suites / 22 tests PASS** (writer, ingress guard, ???ng service ?m t?nh).
- ESLint scoped kh?ng type-aware: **9 t?p TypeScript PASS** (g?m B1 integration spec). Strict `tsc` ri?ng t?ng t?p 9/9 ?? PASS trong checkpoint tr??c; kh?ng ??i nh?ng t?p n?y t? checkpoint ??.
- PostgreSQL 17.10 c? l?p `127.0.0.1:55539`, DB test t?m `baogiang_test`: `prisma migrate deploy` to?n b? **33/33 migrations PASS**; ri?ng suite `b1-role-command-writer.integration.spec.ts`: **2/2 PASS** (Principal grant/immutable receipt/replay v? hai academic VP). Transaction test rollback fixture; cluster t?m ?? STOP v? X?A. Kh?ng ??ng database production.
- **Ph?n bi?t l?i m?y v? l?i m?:** ch?y `tsc --noEmit` tr?n worktree n?n s?ch `docs/p5-057-ci-trigger-discipline-20261112` @ `2e9480ff2a336a96e7f18a652452ffbfb5a622ff`, **kh?ng ch?a b?n s?a B1**, v?n n? Node V8 `Fatal process out of memory: Zone`. Nh? v?y full-project local typecheck crash **t?i hi?n tr?n baseline** v? kh?ng th? t? quy cho PR #285. Full API strict typecheck/build tr?n CI v?n l? **GATE CH?A ??T** ? exact HEAD ti?p theo, kh?ng ???c ?o?n PASS.

### Ph?n lo?i migration theo ??ng m? ki?m so?t ?ang ch?y

Migration `prisma/migrations/20261113160000_p5_057_ws1_multi_vice_seat/migration.sql` c? SHA-256 th?c t?:

`a19dd175524388aac7beefdbad0ed715963e459e49d5f7fdfb72a43e9833f79b`

?? ch?y tr?c ti?p h?m `decide()` c?a `scripts/ci/classify-production-migrations.cjs` v?i t?nh hu?ng ??ng 1 SQL migration m?i v? ch?nh danh s?ch ph? duy?t hi?n t?i tr?n `main`; k?t qu? **`MIGRATION_NOT_PREAPPROVED`**, kh?ng ph?i `approved-migration`. Danh s?ch ph? duy?t production hi?n ch? c? migration B1 foundation `20261105150000_...`.

**H? qu? b?t bu?c:** D? PR #285 sau khi push c? CI/PG16 xanh, **kh?ng ???c merge khi ch?a gi?i quy?t ri?ng production migration gate**. Auto-deploy ph?n lo?i t? deployed SHA, kh?ng cho target t? ph? duy?t SQL c?a ch?nh n?. Migration m?i l? **constraint replacement** (`DROP` exclusion c? r?i `ADD` hai exclusion GiST), kh?ng ???c ?m th?m g?n nh?n `QUIESCED_ADDITIVE` ho?c v? hi?u h?a classifier. M?t ph? duy?t ??c l?p ?i tr??c ho?c k? ho?ch ph?t h?nh migration kh?c ph?i ???c PO ch?p thu?n, c? preflight/backup/quiescence ??ng chu?n. Kh?ng thay pipeline v? kh?ng ch?y migration tr?n DB th?t ? pha local.

### ??nh ch?nh b?o c?o review Antigravity

Review file `PR285-B1-ANTIGRAVITY-INDEPENDENT-REVIEW-RESULT-20261113.md` n?u 4 blocker, ch? y?u l? gate ki?m ch?ng/tri?n khai; 6 finding g?c ???c ??nh gi? ?? s?a **v? logic staged**. Tuy nhi?n trong b?o c?o c? m? t? kh?ng ??ng m? th?c t?: fingerprint hi?n **kh?ng** ch?a `at.toISOString()`; tr?ng th?i `authorizationState` ???c ??c b?ng `findUnique` v? t?ng qua `upsert`, **kh?ng c?** `SELECT FOR UPDATE` tr?c ti?p ? ??; disposition ngu?n s? d?ng `ACCEPTED`/`ENDED`, kh?ng ph?i `ACTIVE`. Do ?? ph?i d?a tr?n source/DDL th?c, kh?ng n?ng `REVIEW_BLOCKED` th?nh PASS ch? b?ng nh?n ??nh t?ng qu?t c?a b?o c?o.

### Tr?ng th?i gate v? tr?nh t? ti?p theo

1. **?? ??t trong ph?m vi ???c ch?y:** 22 unit, 9 t?p lint, 33 PG17 migrations, 2 PG17 integration, strict per-file t? checkpoint tr??c, diff check. C?c th? nghi?m th?i ?i?m n?y kh?ng ghi d? li?u production.
2. **C?n ch?n:** full API CI typecheck tr?n **HEAD m?i**, PG16 migration + API integration tr?n HEAD m?i, gi?i ph?p b?o v? production migration gate v? review ngu?n quy?n/legacy tr??c cutover.
3. Writer v?n `UNREGISTERED/INERT`, `B1_REJECT_GENERIC_SENSITIVE_WRITES` gi? OFF tr?n production. Ch?a th? coi bypass production ?? ??ng hay B1 ???c k?ch ho?t.
4. **KH?NG PUSH** ?? d? l?i. N?u quy?t ??nh ??y m?t checkpoint, ch? sau khi th?ng nh?t k? ho?ch migration v? x?c nh?n h?t workflow s?ng; gom m?t commit/push, theo d?i CI + PG16 ??n khi **t?t c?** ho?n th?nh; kh?ng bao gi? push chen ngang workflow.
5. PR #285 ti?p t?c **Draft/IN_PROGRESS**, `main` kh?ng ??i. Kh?ng merge/auto-deploy khi thi?u migration preapproval.
