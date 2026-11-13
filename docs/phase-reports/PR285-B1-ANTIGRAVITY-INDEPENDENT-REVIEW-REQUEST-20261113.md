# PR #285 — Yêu cầu review độc lập Antigravity (P5-057 WS1/B1)

**Ngày lập:** 13/11/2026
**Loại việc:** ĐỌC + REVIEW MÃ / KHÔNG TRIỂN KHAI
**Trạng thái:** REQUESTED — chờ Antigravity review thủ công
**Repository:** `hvtnguyenson-code/baogiang-damsan`
**PR:** https://github.com/hvtnguyenson-code/baogiang-damsan/pull/285 (vẫn Draft)
**Worktree BẮT BUỘC:** `D:\baogiang-damsan\.worktrees\ws1-b1-writer-20261112`
**Branch:** `feat/p5-057-ws1-b1-writer-20261112`
**HEAD trước sửa:** `5f9b747d61813d426c45e2bf8ac82b9fc527ec61`
**Quan trọng:** mã cần review gồm **diff CHƯA COMMIT + các tệp untracked trong worktree**. Không chỉ đọc trạng thái PR trên GitHub hoặc thư mục gốc `D:\baogiang-damsan`.

## 1. Sản phẩm bắt buộc

Tạo **DUY NHẤT** file báo cáo:

`docs/phase-reports/PR285-B1-ANTIGRAVITY-INDEPENDENT-REVIEW-RESULT-20261113.md`

Đường dẫn tuyệt đối:

`D:\baogiang-damsan\.worktrees\ws1-b1-writer-20261112\docs\phase-reports\PR285-B1-ANTIGRAVITY-INDEPENDENT-REVIEW-RESULT-20261113.md`

Nếu file báo cáo đã tồn tại, đọc và cập nhật **chính file này**, không tạo file phiên bản `v2`, `-fix`, `-final`, v.v. Báo cáo phải chứa kết luận **`REVIEW_PASS_NO_BLOCKER`** hoặc **`REVIEW_BLOCKED`** kèm bằng chứng, không được tuyên bố PASS khi còn blocker. Nếu không thể đọc/kiểm tra đủ, kết luận **`REVIEW_INCONCLUSIVE`**, ghi rõ lý do và phần chưa kiểm.

**Chỉ được ghi file kết quả nói trên.** Không sửa file nhiệm vụ, source code, migration, test, cấu hình, tài liệu dự án hay tệp khác. Không tự mở PR, commit, push, force-push, merge, deploy hoặc tạo/chạy lại/hủy GitHub CI. Không thay đổi cơ chế CI/CD. Không vào VPS hoặc truy vấn PostgreSQL production. Không chạy full repo build/test nặng, npm install, Prisma migrate hoặc lệnh tác động dữ liệu; review theo hướng **static inspection + git diff**.

## 2. Bối cảnh và lý do review

PR #285 là writer giao dịch B1 để bổ nhiệm, chuyển giao, miễn nhiệm chức trách nhạy cảm cho hệ thống Báo giảng Đam San; writer hiện cố ý **chưa đăng ký vào NestJS, chưa có endpoint production**. Khi review HEAD cũ, đã xác định 6 lỗi/nhóm rủi ro: cập nhật AccessCommand có trigger append-only; miễn nhiệm lạm dụng cancelledAt; ràng buộc seat không cho nhiều PHT; provenance/source/issuer không đủ; các đường cấp quyền generic vượt logic B1; CAS/idempotency chưa chuẩn. Người thực thi đã sửa **ở local** nhưng chưa commit/push vì chính sách cấm đốt phút CI.

**Bằng chứng có sẵn nhưng không được tin mù quáng:**
- 22/22 unit Jest, scoped ESLint PASS.
- Strict TypeScript chạy **từng tệp** 9/9 PASS; full API typecheck gộp còn INCONCLUSIVE do Node StackOverflowException, không được ghi PASS.
- PostgreSQL 17 trên cluster localhost tạm, 33/33 migration PASS, có migration mới cho đa PHT; suite integration writer mới 2/2 PASS và rollback fixture; các script tạm trước đó đã kiểm tra Principal APPOINT/TRANSFER/DISMISS, dual `AUDIT_VIEW` từ `TECHNICAL_DIRECT`, replay/epoch, 2 lệnh tranh seat chỉ một thắng. Các cụm PG test đã dừng/xóa.
- PostgreSQL **16 CHƯA** chạy đối với diff/migration mới; CI #939 và PG16 #117 chỉ xanh trên HEAD cũ `5f9b747`.
- Không có UAT 7 persona, HTTP E2E hoàn chỉnh, kiểm kê legacy production được phê duyệt, hoặc API B1 trusted caller/cutover.
- Feature flag `B1_REJECT_GENERIC_SENSITIVE_WRITES` hiện **mặc định OFF** và writer chưa được wire; **không được gọi lỗ hổng quyền production đã khắc phục**.

## 3. Danh mục tệp bắt buộc đọc

Tại **đúng worktree** nêu trên:

**Các thay đổi local:**
1. `apps/api/src/capabilities/b1-role-command-writer.ts` — giao dịch bổ nhiệm/miễn nhiệm và provenance.
2. `apps/api/src/capabilities/sensitive-generic-writer-gate.ts` — guard cắt đường generic, hiện default OFF.
3. `apps/api/src/capabilities/capabilities.service.ts` — create/revoke.
4. `apps/api/src/capabilities/access-baseline.service.ts` — `applyTemplate`.
5. `apps/api/src/bootstrap/bootstrap-admin.ts` — CLI bootstrap.
6. `apps/api/test/capabilities/b1-role-command-writer.spec.ts`.
7. `apps/api/test/capabilities/sensitive-generic-writer-gate.spec.ts`.
8. `apps/api/test/capabilities/sensitive-generic-writer-ingress.spec.ts`.
9. `apps/api/test/capabilities/b1-role-command-writer.integration.spec.ts` — suite mới, fixture transaction.
10. `prisma/migrations/20261113160000_p5_057_ws1_multi_vice_seat/migration.sql` — migration **mới**, không sửa migration đã áp dụng.
11. `docs/phase-reports/P5-057-WS1-B1-STAGED-ROLE-WRITER-20261112.md` — log chứng cứ local.

**Đối chiếu với cấu trúc có thật:**
- `prisma/schema.prisma` — models/relations B1.
- `prisma/migrations/20261105150000_p5_057_b1_provenance_foundation/migration.sql` — trigger, FK, CHECK, exclusion.
- `apps/api/src/capabilities/sensitive-capability-policy.ts` và `sensitive-authority-repository-preflight.ts`.
- `apps/api/src/capabilities/responsibility-template-catalog.ts`, `capabilities.module.ts`, `capabilities.controller.ts`, `responsibility-templates.controller.ts`.
- `docs/governance/CI-WORKFLOW-BUDGET-AND-NONINTERRUPTION-POLICY.md` nếu tệp đã có trong worktree; nếu không có, không tự đồng bộ.
- `docs/requirements/P5-057-WS1-PO-SENSITIVE-POLICY-ACCEPTANCE-20261112.md`.

## 4. Checklist bảo mật và giao dịch phải kiểm thật bằng đọc mã

**A. Bất biến PostgreSQL**
- `access_commands` append-only: không `UPDATE/DELETE`; receipt không giả định thành công trước khi toàn bộ transaction thực sự commit; rollback khi summary dự kiến khác thực tế.
- Hủy trước hiệu lực `cancelledAt` khác với miễn nhiệm đang hiệu lực `validUntil` + `GrantSourceRevision.ENDED`.
- Exclusion constraint: HT / Admin kỹ thuật độc quyền theo seat; nhiều PHT khác người có thể đồng thời, cùng một PHT không được trùng hiệu lực; migration forward-only, không được chỉnh migration cũ.
- Referential integrity: source ↔ coordinate ↔ appointment ↔ seat ↔ command; projection ↔ grant ↔ support ↔ latest revision; không cấp trùng grant khi có hai nguồn.

**B. Chính sách nguồn và ủy quyền**
- Bắt buộc issuer thật có seat `TECHNICAL_ACCOUNT_ADMIN` và cả `USER_MANAGE` + `CAPABILITY_GRANT` đúng thời điểm; xét chính xác authority seat, actor/target, cấm tự cấp; kiểm tra chuỗi provenance theo lệnh, thời gian, `commandType`, revision.
- `ROLE_TEMPLATE` bắt buộc map seat ↔ allowed capability, không cho nguồn khác mượn chứng cứ để có `APPROVAL_PRINCIPAL`.
- `TECHNICAL_DIRECT` chỉ bảo toàn nguồn được cho phép (đặc biệt `AUDIT_VIEW`, catalog); khi miễn nhiệm HT, không được mất nguồn kỹ thuật độc lập.
- Dữ liệu legacy, nguồn không đủ hồ sơ, bị hủy, hết hạn, hoặc source mismatch phải fail-closed; **không mass-revoke / backfill suy đoán**.
- AI Phase11 5 capability tuyệt đối chưa kích hoạt.

**C. Giao dịch, concurrency, replay**
- `requestKey` idempotency phải ràng fingerprint, actor, commandType, target; lệnh replay không ghi lần nữa dù policyVersion/epoch đã thay đổi.
- `expectedAuthorizationEpoch` và version của seat kiểm tra trong giao dịch có khóa phù hợp, đua hai lệnh không tạo hai HT; kiểm tra vấn đề TOCTOU/deadlock/lock ordering.
- Lỗi xảy ra giữa INSERT command và projection update phải rollback toàn bộ và không lưu receipt success giả.

**D. Ingress/cutover và không ảnh hưởng production**
- `CapabilitiesService.create/revoke`, `AccessBaselineService.applyTemplate`, bootstrap CLI: guard phải được gọi thật trước mỗi mutation tương ứng; kiểm tra bất kỳ đường cấp quyền nào khác.
- Flag OFF = hành vi production hiện tại không bị thay đổi; flag ON = chặn 9 key nhạy cảm trên generic ingress, không làm mất quyền khác; **không khuyến nghị bật ON khi chưa có B1 API thay thế**.
- Writer chưa đăng ký NestJS, vì vậy không tuyên bố đã vá production. Đề xuất integration/cutover/UAT là bước riêng, có phê duyệt.
- Không sửa quy trình merge → GitHub CI → auto deploy; không restart Nội trú.

**E. Phát hiện bất ngờ**
Chủ động tìm lỗi nghiêm trọng khác ngoài 6 finding đã biết, kể cả sai lệch Prisma/SQL, nhánh race, trạng thái rollback, dấu thời gian, nhầm kiểu quan hệ, bất biến version, quyền bypass, và bộ test giả định sai. Không đồng ý với tác giả chỉ vì Jest xanh.

## 5. Định dạng file báo cáo bắt buộc

Báo cáo viết **tiếng Việt**, có thể sử dụng thuật ngữ kỹ thuật tiếng Anh. Gồm các phần:

1. **Metadata:** ngày/giờ, đường dẫn worktree, HEAD/branch, danh sách tệp đã đọc, trạng thái diff/untracked, phương pháp review, giới hạn.
2. **Verdict:** một trong ba mã `REVIEW_PASS_NO_BLOCKER` / `REVIEW_BLOCKED` / `REVIEW_INCONCLUSIVE`; nêu lý do.
3. **Bảng 6 finding gốc:** ID, trạng thái `RESOLVED / PARTIAL / OPEN / NOT_VERIFIED`, đường dẫn và dòng có bằng chứng, ý nghĩa.
4. **Finding mới:** mức `CRITICAL / HIGH / MEDIUM / LOW`, điều kiện tái hiện, ảnh hưởng, đường dẫn + dòng, phương án chỉnh; không tạo issue không có chứng cứ.
5. **Rà soát migration & PostgreSQL invariants:** trigger, CHECK, FK, exclusion, rollback; lưu ý PG16 chưa được chạy trên diff mới.
6. **Phân tích nguồn `AUDIT_VIEW` hai nhánh, issuer provenance, legacy.**
7. **Idempotency / epoch / concurrency:** xác minh ràng buộc và các kịch bản còn thiếu.
8. **Đánh giá phạm vi test và điểm mù:** không tự tuyên bố test đã chạy; phân biệt kết quả có sẵn với kết quả reviewer tự chạy.
9. **Danh sách blocker trước merge, thứ tự sửa theo mức độ.**
10. **Kết luận cuối:** `changedFiles` phải chỉ chứa **đường dẫn file báo cáo**; xác nhận không commit/push/CI/merge/deploy.

Nếu Antigravity bị giới hạn quyền ghi, cần báo rõ và trả nội dung báo cáo để chủ dự án lưu; **không tìm cách vượt quyền**.

## 6. Điểm dừng

Khi đã ghi file kết quả, chỉ thông báo:
- `REVIEW_WRITTEN`
- đường dẫn tuyệt đối file
- verdict
- số finding chặn merge

**Dừng tại đó.** Chủ dự án sẽ yêu cầu ChatGPT đọc file và quyết định sửa tiếp. Không nhận nhiệm vụ sửa code từ phiếu này.
