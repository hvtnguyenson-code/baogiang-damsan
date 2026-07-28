# MASTER `/goal` — PHASE 01 IDENTITY & ACCESS

Dán toàn bộ nội dung dưới đây vào Antigravity dưới dạng một `/goal` duy nhất.

---

/goal

Bạn là senior software engineer, security engineer, database reviewer và autonomous implementation agent cho repository:

`D:\baogiang-damsan`

Remote:

`hvtnguyenson-code/baogiang-damsan`

Branch bắt buộc:

`phase/01-identity-access`

## MỤC TIÊU

Triển khai hoàn chỉnh Phase 01 — Identity & Access theo đặc tả repository, tự làm liền mạch từ đọc yêu cầu, thiết kế chi tiết, code, migration, test, remediation, tài liệu, commit và push.

Không hỏi người dùng xác nhận ở từng bước. Chỉ dừng và hỏi khi gặp một trong các blocker thật sự sau:

1. Có mâu thuẫn nghiệp vụ không thể giải quyết bằng thứ tự ưu tiên tài liệu.
2. Phát hiện dữ liệu hoặc thay đổi local không thuộc phạm vi Phase 01 và có nguy cơ bị ghi đè.
3. Cần secret, credential hoặc quyết định production không có trong repository.
4. Test thất bại do lỗi môi trường bên ngoài mà không thể tự khắc phục an toàn sau tối đa 3 vòng remediation.
5. Có nguy cơ tác động hệ thống nội trú, database khác hoặc VPS production.

Ngoài các trường hợp trên, tự đưa ra quyết định kỹ thuật hợp lý, ghi lại trong ADR hoặc báo cáo, tiếp tục làm đến khi hoàn thành.

## BƯỚC 0 — AN TOÀN VÀ GIT

Trước khi sửa file:

- Xác nhận đang ở `D:\baogiang-damsan`.
- Chạy `git status -sb`.
- Xác nhận branch là `phase/01-identity-access`.
- Fetch remote và xác nhận branch được tạo từ `main` sau merge Phase 00.
- Không tự checkout branch khác nếu có thay đổi local chưa rõ nguồn.
- Không dùng code hoặc dữ liệu từ repository quản lý nội trú hay dự án khác.
- Không kết nối VPS.
- Không deploy.

Nếu working tree có thay đổi không thuộc Phase 01, dừng và báo rõ file nào đang cản trở. Nếu clean, tiếp tục toàn bộ quy trình không hỏi lại.

## BƯỚC 1 — ĐỌC TOÀN BỘ NGUỒN YÊU CẦU

Bắt buộc đọc đầy đủ, không chỉ đọc tên file:

1. `docs/requirements/PHASE-01-IDENTITY-ACCESS-SPEC.md`
2. `docs/specifications/PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx`
3. `docs/specifications/PA-A-GAS-Google-Sheets-v1.2-AI-governance.docx` để đối chiếu
4. `docs/PROJECT_CONTEXT.md`
5. `docs/architecture/PHASE-00-FOUNDATION.md`
6. `docs/architecture/AI_GOVERNANCE_AND_ACCESS_MODEL.md`
7. toàn bộ `docs/decisions/*.md`
8. `docs/policies/AI_USAGE_AND_COST_CONTROL_POLICY.md`
9. toàn bộ `docs/requirements/*.md`
10. `prisma/schema.prisma`
11. `packages/contracts/src/index.ts`
12. toàn bộ source/test/config Phase 00 liên quan.

Nếu công cụ không đọc trực tiếp DOCX, dùng Python/PowerShell hoặc unzip DOCX để đọc `word/document.xml`; chỉ đọc file local, không upload tài liệu ra dịch vụ ngoài.

Thứ tự ưu tiên khi mâu thuẫn:

1. Phương án B v1.2.
2. ADR/governance/policy hiện hành.
3. `PHASE-01-IDENTITY-ACCESS-SPEC.md`.
4. tài liệu phase.
5. prototype chỉ tham khảo UI.

Ghi một bản traceability ngắn trong báo cáo Phase 01, nêu yêu cầu chính và nơi thực thi/test tương ứng.

## BƯỚC 2 — LẬP KẾ HOẠCH NỘI BỘ VÀ TRIỂN KHAI NGAY

Tự lập checklist nội bộ nhưng không dừng chờ người dùng duyệt. Kế hoạch tối thiểu phải bao gồm:

- schema và migration;
- authentication/session;
- authorization capability + scope;
- audit;
- API;
- contracts/config;
- frontend;
- bootstrap/seed;
- unit/integration/E2E;
- security review;
- documentation.

Không triển khai TKB, PPCT, báo giảng, bảng kê, notification hoặc AI thật.

## BƯỚC 3 — THIẾT KẾ DATABASE

Triển khai các model và quan hệ theo đặc tả Phase 01, tối thiểu:

- User
- StaffProfile
- SubjectGroup
- Subject
- SubjectGroupMembership
- StaffSubject
- CapabilityDefinition
- CapabilityGrant
- AuthSession
- AuditEvent

Yêu cầu:

- migration bằng Prisma Migrate;
- index và unique constraint hợp lý;
- không xóa vật lý capability grant đã dùng;
- time-bounded membership và grant;
- transaction cho thao tác nhiều bảng quan trọng;
- không dùng `prisma db push` thay migration;
- không reset database có dữ liệu;
- giữ `SystemSetting` tương thích.

Nếu cần chốt ID strategy hoặc session strategy, tạo ADR ngắn trong `docs/decisions/` và tiếp tục, không hỏi người dùng.

## BƯỚC 4 — AUTHENTICATION VÀ SESSION

Triển khai:

- username/password nội bộ;
- Argon2id;
- session token CSPRNG;
- chỉ lưu token hash;
- HttpOnly cookie;
- `Secure` theo production environment;
- `SameSite=Lax`;
- login rate limiting;
- lockout có cấu hình;
- first-login password change;
- logout và logout-all;
- revoke session khi password thay đổi theo policy;
- response login không cho phép dò username;
- không dùng localStorage cho token.

Không hardcode password bootstrap. Bootstrap admin phải lấy secret từ environment hoặc interactive local execution và không ghi secret vào log.

## BƯỚC 5 — AUTHORIZATION

Xây một authorization service/guard tập trung, default deny.

Mọi quyết định phải kiểm tra:

- user status;
- capability key;
- scope type;
- resource ID;
- validFrom/validUntil;
- revokedAt;
- read/write mode khi áp dụng.

Không dùng role name để quyết định quyền. Không copy-paste permission logic trong controller. `SYSTEM_ADMIN` không tự có quyền phê duyệt chuyên môn.

Frontend chỉ dùng capability context để điều hướng và ẩn/hiện; backend vẫn phải chặn độc lập.

## BƯỚC 6 — API

Triển khai API tối thiểu trong đặc tả, gồm auth, users, subject groups, subjects, membership, staff-subject assignment, capability grants và audit.

Yêu cầu:

- DTO validation;
- pagination;
- page-size limit;
- standard API error;
- không lộ passwordHash/tokenHash/security fields;
- request ID xuyên suốt audit;
- authorization guard trên mọi endpoint protected;
- test 401, 403 và cross-scope denial.

## BƯỚC 7 — FRONTEND

Triển khai UI Phase 01:

- login;
- đổi mật khẩu lần đầu;
- hồ sơ cá nhân;
- quản lý người dùng;
- tổ chuyên môn;
- môn học;
- membership;
- capability grant/revoke theo scope;
- audit viewer;
- navigation cá nhân hóa theo capability.

Ràng buộc:

- tiếng Việt rõ ràng;
- phù hợp giáo viên không chuyên công nghệ;
- không role selector;
- không dashboard SaaS/AI chung chung;
- không sao chép JavaScript/logic prototype;
- có loading, empty, error, unauthorized, expired-session states;
- responsive và keyboard accessible;
- không lạm dụng gradient, glassmorphism hoặc card.

Nếu `.agents/skills/damsan-ui-system`, `frontend-design`, `ui-quality-review` đã tồn tại thì đọc và tuân thủ. Nếu chưa có, không tải skill không rõ nguồn; ghi backlog rõ trong báo cáo.

## BƯỚC 8 — TEST

Bổ sung và chạy đầy đủ:

- unit tests;
- integration tests với PostgreSQL thật;
- migration test;
- API auth/authorization tests;
- E2E Playwright.

Các case bắt buộc:

- hashing/verification;
- login success/failure;
- locked/disabled user;
- first-login change password;
- expired/revoked session;
- logout/logout-all;
- capability accumulation;
- scope matching;
- expired/revoked grants;
- default deny;
- cross-scope denial;
- audit creation và secret redaction;
- create/update/disable user;
- membership và capability grant/revoke;
- frontend unauthorized state;
- user chỉ thấy chức năng trong scope.

Không giảm test, xóa test hoặc nới assertion để tạo PASS giả.

## BƯỚC 9 — SECURITY REVIEW

Tự review và remediation tối đa 3 vòng. Kiểm tra tối thiểu:

- secrets;
- password/token leakage;
- mass assignment;
- CSRF với cookie auth;
- CORS production;
- rate limit;
- session fixation;
- session revocation;
- audit tampering/leakage;
- IDOR/cross-scope access;
- pagination abuse;
- transaction/race condition trong grant và membership;
- sensitive fields trong API/log/test snapshot.

Nếu phát hiện lỗi, tự sửa và chạy lại test liên quan, không hỏi người dùng.

## BƯỚC 10 — QUALITY GATES

Chạy tuần tự từ root repository:

1. Prisma format/validate/generate.
2. Lint toàn monorepo.
3. Typecheck toàn monorepo.
4. Unit tests.
5. Integration tests với PostgreSQL thật.
6. Build toàn monorepo.
7. Playwright E2E.
8. Kiểm tra `git diff --check`.
9. Kiểm tra không có secret hoặc `.env` bị stage.

Tự khắc phục tối đa 3 vòng nếu lỗi thuộc phạm vi Phase 01.

Không tuyên bố PASS nếu chưa có bằng chứng command và exit code thành công.

## BƯỚC 11 — TÀI LIỆU

Tạo/cập nhật:

- ADR auth/session/ID strategy nếu cần;
- `docs/phase-reports/PHASE-01-REPORT.md`;
- `docs/handover/PHASE-01-HANDOVER.md`;
- README nếu có lệnh bootstrap/migration mới;
- `.env.example` chỉ chứa placeholder an toàn;
- traceability từ requirement → code → test.

Báo cáo phải nói rõ:

- phạm vi đã làm;
- ngoài phạm vi;
- schema/migration;
- API/UI;
- security decisions;
- test thực chạy;
- limitation còn lại;
- commit/push status;
- chưa merge và chưa deploy.

## BƯỚC 12 — COMMIT VÀ PUSH

Sau khi tất cả quality gate local PASS:

- kiểm tra diff cuối;
- chỉ stage file thuộc Phase 01;
- commit theo nhóm hợp lý hoặc một commit tổng nếu lịch sử gọn hơn;
- commit message cuối rõ nghĩa, ví dụ:
  `feat(identity): implement Phase 01 authentication and scoped access`
- push lên `origin/phase/01-identity-access`;
- không tạo hoặc merge PR nếu chưa được chỉ thị riêng trong goal này.

Mục tiêu là tự code/test/commit/push trong một lượt, không yêu cầu người dùng chạy các lệnh trung gian.

## CẤM TUYỆT ĐỐI

- Không deploy VPS.
- Không kết nối production.
- Không restart Nginx, PostgreSQL, service hoặc toàn VPS.
- Không sửa hệ thống nội trú.
- Không triển khai AI thật.
- Không bật ba AI kill switch.
- Không role selector.
- Không hardcode quyền theo role name.
- Không self-approval logic.
- Không commit secret.
- Không dùng dữ liệu thật của giáo viên/học sinh trong test.
- Không tuyên bố PASS nếu test chưa chạy hoặc đang fail.

## ĐẦU RA CUỐI CÙNG CỦA AGENT

Chỉ khi hoàn thành, trả báo cáo ngắn theo đúng cấu trúc:

1. Branch và base đã xác minh.
2. Phạm vi đã triển khai.
3. Schema và migration.
4. Authentication/session.
5. Authorization capability + scope.
6. API và UI.
7. Security remediation.
8. Test/quality gates với bằng chứng.
9. Commit SHA.
10. Push status.
11. PR/merge/deploy status.
12. Các limitation hoặc quyết định cần chủ dự án biết.

Phải ghi chính xác ở cuối:

- committed: YES/NO
- pushed: YES/NO
- pull request: NOT CREATED
- merged: NO
- deployed: NO

/end-goal

---

## Quy tắc vận hành sau khi Antigravity hoàn tất

Sau khi Agent push:

1. Dùng GitHub để review diff và CI trực tiếp.
2. Nếu có lỗi, giao một remediation goal tập trung, tối đa 3 vòng.
3. Chỉ tạo PR khi final branch head có CI xanh.
4. Không merge và không deploy dựa chỉ trên báo cáo của Agent.
