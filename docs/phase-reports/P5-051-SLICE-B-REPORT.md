# P5-051 Slice B — bằng chứng triển khai backend

Ngày: 2026-10-17. Phạm vi: T50; phụ thuộc P5-050 CLOSED. Báo cáo này là bằng chứng của implementation agent, không thay thế independent ChatGPT review.

## A. Baseline chính xác

- Repository: `D:\baogiang-damsan`.
- Nhánh duy nhất: `feat/p5-051-professional-baseline-responsibility-templates`.
- Starting HEAD và remote task branch sau fetch: `d0c9f0d3ea9b032962ad258606d2b8809e742542`; divergence `0 / 0`; working tree sạch, không có untracked task files.
- Canonical origin/main đọc trực tiếp sau fetch: `9b7425ba65dedf3b4098e477a477352aa20c8502`; GitHub PR #240 xác nhận cùng base/head.
- Không đổi nhánh; không reset/clean/stash/rebase/amend/force-push.

## B. Final commit

SHA của checkpoint chứa báo cáo được đọc trực tiếp từ Git sau commit và ghi trong bàn giao cuối cùng/PR. Không tự nhúng SHA của chính commit chứa báo cáo vào tệp này.

## C. Danh sách file Slice B

1. `apps/api/src/users/dto/delete-user.dto.ts`
2. `apps/api/src/users/user-delete-fk-inventory.ts`
3. `apps/api/src/users/user-delete.service.ts`
4. `apps/api/src/users/users.controller.ts`
5. `apps/api/src/users/users.module.ts`
6. `apps/api/src/users/users.service.ts`
7. `apps/api/src/capabilities/access-baseline.service.ts`
8. `apps/api/test/users/user-delete.integration.spec.ts`
9. `apps/api/test/capabilities/access-baseline.integration.spec.ts`
10. `apps/api/test/effective-schedule/effective-schedule.integration.spec.ts`
11. `apps/api/test/ppct/ppct-options.integration.spec.ts`
12. `packages/contracts/src/index.ts`
13. `docs/governance/PRE-PILOT-TASK-REGISTER.md`
14. `docs/governance/CURRENT-PROJECT-STATUS.md`
15. `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`
16. `docs/requirements/P5-051-PROFESSIONAL-ACCESS-RESPONSIBILITY-TEMPLATES.md`
17. `docs/phase-reports/P5-051-SLICE-B-REPORT.md`

## D. FK inventory và phân loại

PostgreSQL được khởi tạo riêng trong `.tmp/p5-051-slice-b-pg`, bind `127.0.0.1:55451`, DB `baogiang_p5051_test`. Áp dụng thành công toàn bộ **29 migration** bằng Prisma Migrate Deploy. Không kết nối DB hiện hữu/VPS.

Đối chiếu `pg_constraint`, `pg_attribute`, `pg_class`, `pg_namespace` với migrations/schema xác nhận **40 bảng / 72 FK trực tiếp** tới `users(id)` và **4 FK gián tiếp** vào các setup children. Manifest trong `user-delete-fk-inventory.ts` lưu tên constraint, schema/table, ordered child/reference columns, ON DELETE/UPDATE, validated/deferrable. Query runtime so sánh toàn bộ inbound graph; identifiers SQL chỉ xuất phát từ manifest tĩnh đã kiểm chứng.

- **A: 3 FK** — `staff_profiles.user_id`, `subject_group_memberships.user_id`, `staff_subjects.user_id`; chỉ cleanup hàng thuộc đúng target.
- **C: 5 FK** — session subject, capability subject/granted-by/revoked-by và audit actor; mọi lịch sử đều chặn, không lọc theo hiệu lực/revoked.
- **B: 64 FK trực tiếp còn lại** — mọi tham chiếu nghiệp vụ đều chặn, gồm programme DB-only và `business_policy_versions.superseded_before_effective_by_user_id`.
- **B: 4 FK gián tiếp** — additional duty qua StaffProfile; SpecialActivityStaffing qua `(staff_profile_id, scheduled_teacher_user_id)`; disposition và makeup qua `(eligibility_staff_subject_id, teacher_user_id, subject_id)` tương ứng. So sánh đầy đủ composite coordinates. Không có inbound FK vào SubjectGroupMembership ở baseline.
- **D** — graph/schema khác manifest, FK bị disable/not validated/deferred khác baseline hoặc tham chiếu JSON/snapshot chưa chứng minh an toàn: BLOCKED.

72 FK trực tiếp gồm **69 RESTRICT, 3 SET NULL**, không có CASCADE. Ba SET NULL là capability granted-by/revoked-by và audit actor; service vẫn chặn trước delete, không để PostgreSQL xóa dấu sở hữu. Bốn FK gián tiếp đều RESTRICT. ON UPDATE của toàn bộ 76 FK là CASCADE; tất cả validated, không deferrable.

Schema column fingerprint trên các physical/partitioned/foreign tables và materialized views ở non-system schemas (baseline chỉ có public): `13031cf488b8cd86152b3e981e348bb5` (không gồm public._prisma_migrations); thứ tự catalog cố định COLLATE C để độc lập locale. Bảng/cột mới buộc review lại trước khi cho xóa. FK triggers phải enabled và session replication role phải là origin. RLS không được ẩn references; unexpected non-FK trigger/rewrite rule trên User/setup tables cũng làm BLOCKED. Baseline xác nhận không có non-FK triggers trên bốn bảng này; negative RLS test giữ nguyên audit history.

Non-FK containers đã kiểm tra: audit metadata, User/setup entity references và bootstrap provenance; BusinessPolicyVersion.payload; BusinessPolicyCommand.result; ProgrammePlanningCommand.result; ReportingStatementRevision.canonicalSnapshotJson. UUID của target và ba nhóm setup children, username/mã nhân sự dưới dạng JSON string trong các container này chặn fail-closed; không trả raw payload ra API. Kiểm tra thêm scalar staff-code snapshots của historical import/reporting và sourceValue/sourceValueKey của teacher aliases, kể cả alias trỏ đến user khác: trùng/tái sử dụng mã định danh là ambiguous và chặn. Chỉ biên nhận quản trị USER_CREATED/USER_UPDATED và SubjectGroupMembership/StaffSubject CREATED/UPDATED/ENDED có đúng actor khác target, SUCCESS, entity/ownership và cấu trúc payload đã kiểm chứng mới được giữ như setup receipts an toàn. Không miễn theo action name đơn thuần; extra metadata hoặc unknown User/setup audit reference vẫn chặn. Không có ngoại lệ cho target actor hoặc grant history.

## E–F. Allowlist và blocker taxonomy

Allowlist duy nhất: StaffProfile, SubjectGroupMembership, StaffSubject. Không xóa catalog cha, session, grant, audit hoặc dữ liệu nghiệp vụ.

Blocker codes: SELF, PROTECTED, LOGIN_HISTORY, SECURITY_HISTORY, BUSINESS_HISTORY, INDIRECT_HISTORY, UNVERIFIED_REFERENCE. Lý do API bằng tiếng Việt và chỉ nêu nhóm an toàn, không lộ hàng security/history hay credentials. Khi graph không xác minh được, cleanupCounts=null; không bịa số 0.

Bootstrap được nhận diện bằng retained `AUTH_BOOTSTRAP_ADMIN_SUCCESS` provenance và security history; không hardcode username. Automatic TEACHER_BASE grant cũng là retained history, không có ngoại lệ.

## G. API/auth

- `GET /api/users/:id/delete-preflight`: USER_MANAGE/SCHOOL_WIDE; transaction READ ONLY, REPEATABLE READ; identity tối thiểu, eligibility, blockers, cleanupCounts, disableRecommended.
- `DELETE /api/users/:id`: USER_MANAGE/SCHOOL_WIDE **AND** SYSTEM_ADMIN/SCHOOL_WIDE qua RequireCapabilities ALL; SessionAuthGuard, CsrfOriginGuard, CapabilityGuard; UUID pipe và DTO whitelist/validation hiện hữu.
- Body chỉ nhận `confirmUsername`, so sánh nguyên văn với username vừa đọc từ server. Không normalize confirmation, không tin eligibility/counts/snapshot từ client. DTO giữ raw input type để implicit conversion không biến số thành username chuỗi. UUID dùng cho self-check/audit được chuẩn hóa bằng giá trị DB, kể cả route UUID viết hoa.
- Không dùng positionTitle/template để suy quyền. Self-delete vẫn bị chặn. HTTP business conflict trả 409; confirmation không khớp trả 400; target đã mất trả 404.

## H. Transaction/locking

DELETE chạy READ COMMITTED: khóa target User FOR UPDATE; khóa ngắn các non-FK container tables theo thứ tự cố định; khóa setup rows FOR UPDATE; đọc lại identity/status và chạy toàn bộ preflight; xóa ba nhóm setup của đúng target; đối chiếu actual cleanup counts; xóa target; ghi retained admin audit; COMMIT. Mọi ghi đều trong cùng transaction.

FOR UPDATE xung đột với KEY SHARE do FK child insert lấy trên User. Insert thắng trước khiến delete chờ và statement sau ở READ COMMITTED thấy child đã commit. Delete thắng trước khiến insert chờ rồi FK từ chối sau parent delete. NO KEY UPDATE không đủ cho invariant này. Setup row locks bảo vệ tương tự các indirect FK inserts. Lifecycle transitions được khóa User trước khi đọc để activation không dùng snapshot đã mất.

Không có gọi mạng trong transaction. Lock timeout 3 giây; interactive transaction timeout 10 giây; deadlock/FK/concurrent-change làm rollback và trả conflict, không retry mù. SHARE ROW EXCLUSIVE trên audit/policy/command/report snapshot, historical import rows và timetable teacher aliases tạo một khoảng chặn ghi ngắn để hoàn tất non-FK proof; đây là chi phí contention cần reviewer đánh giá. Không disable constraint, không dựa cascade/set-null.

## I. Race và fault evidence

Các ca dùng HTTP DELETE thật, Prisma transactions thật, hai connections PostgreSQL; middleware chỉ tạo barrier/fault, không mock kết quả DB. Barrier được phối hợp bằng latch; `pg_stat_activity.wait_event_type='Lock'` xác nhận có lock wait thật.

- A: delete giữ User lock trước; session insert phải chờ rồi lỗi P2003; không có orphan.
- B: session insert giữ FK KEY SHARE trước; delete phải chờ commit rồi trả 409; profile/session còn nguyên.
- Indirect A/B: duty insert qua StaffProfile cũng được kiểm tra với hai transaction thật ở cả hai thứ tự. Delete thắng trước thì insert chờ Profile lock và lỗi P2003; duty insert thắng trước thì delete chờ, thấy history đã commit và trả 409, giữ nguyên profile/duty.
- C: preview ELIGIBLE, session commit, confirmation sau đó bị từ chối.
- D: hai confirmation đồng thời chỉ một 200, một 404, đúng một deletion audit.
- E: template apply đồng thời sau delete phải chờ rồi 404, không tạo grant; template commit trước thì delete bị chặn và giữ grants.
- Activation: đồng thời sau delete phải chờ rồi 404; activation trước tạo TEACHER_BASE rồi chặn delete.
- New capability grant/session transactions sau delete lock phải chờ và bị FK từ chối.
- Fault ngay sau cleanup category đầu tiên: HTTP 500 có chủ đích; rollback toàn bộ User/profile/membership/staff-subject và không có deletion audit.

## J. Audit

Thành công tạo `AuditEvent(actorUserId=administrator, entityType=User, entityId=deletedId, action=USER_CLEAN_SLATE_DELETED, result=SUCCESS)` cùng transaction. Metadata chỉ chứa deletedUserId, username/displayName snapshot và cleanup category counts. Test tạo/sửa account qua POST/PATCH /api/users rồi preview/delete; đọc DB sau target delete chứng minh USER_CREATED/USER_UPDATED audit cũ và deletion audit còn nguyên, actor đúng, không password/token/credential và unrelated account/profile/membership/staff-subject/catalog còn nguyên. Setup test dùng API tạo, sửa và kết thúc membership/staff-subject thật; cả sáu audit receipts vẫn còn sau cleanup. Negative tests chứng minh receipt thêm metadata không được miễn và USER_PASSWORD_RESET/unknown User entity history vẫn chặn kể cả metadata không chứa target ID. Không xóa audit cũ.

## K. Baseline correctness

Mọi eligible ensure path validate CapabilityDefinition TEACHER_BASE trước effectivity/ALREADY_COMPLIANT. Existing grant + inactive definition hoặc PERSONAL không được phép đều fail-closed; valid existing grant vẫn ALREADY_COMPLIANT, không thêm grant/audit. PostgreSQL tests bao gồm cả activation HTTP và direct ensure, giữ nguyên grant semantics.

## L–M. Kiểm thử và môi trường

Mọi destructive integration run đều đặt NODE_ENV=test, TEST_DATABASE_URL trỏ duy nhất DB mới ở cổng 55451 và BAOGIANG_ALLOW_DESTRUCTIVE_TEST_DB=1. `resolveSafeTestDatabaseUrl` của repository chấp nhận đích này; không đọc `.env` hay credentials. PostgreSQL binary/server: **17.10**; default transaction isolation **read committed**; delete chọn isolation này tường minh. Lượt checkpoint cuối dùng DB mới `baogiang_p5051_checkpoint_test`, chủ sở hữu/connection role `p5051_app_test` có rolsuper/rolcreatedb/rolcreaterole=false; cả 29 migration cũng được deploy bằng role này. URL test có schema=public và connection_limit=5; pool vẫn đủ hai transaction đồng thời và connection quan sát khóa. Riêng DB disposable cuối có synchronous_commit=off để tránh độ trễ WAL flush Windows; fsync vẫn on. Đây vẫn là commit PostgreSQL thật với visibility/locking bình thường; không có crash-durability hay production-performance claim.

Lệnh và kết quả tại checkpoint:

- Prisma migrate deploy: 29/29 migration áp dụng thành công vào DB mới.
- Focused cuối, từ apps/api: `jest --runInBand --runTestsByPath test/users/user-delete.integration.spec.ts test/capabilities/access-baseline.integration.spec.ts --silent --json --outputFile=../../.tmp/p5-051-slice-b-reviewed-focused-results.json`: **2/2 suite, 93/93 test PASS** (delete 53, baseline 40), 59.139 giây. Bao gồm indirect races và các retained setup/security audit cases cuối cùng.
- Focused ban đầu trước mở rộng business/drift/indirect cases: 43/43 delete PASS; delete + baseline 77/77 PASS.
- `npm run test:unit`: Web 29 suites / 467 tests PASS; API 100 suites / 1901 tests PASS.
- `npm run typecheck`: PASS cho contracts, config, API và Web.
- `npm run lint`: PASS cho Web, API, contracts và config.
- Full API integration cuối: `npm run test:integration -w apps/api -- --silent --testTimeout=30000 --json --outputFile=../../.tmp/p5-051-slice-b-reviewed-all-results.json`: **51/51 suite, 671/671 test PASS**, không skipped; 591.269 giây. Trong full run: delete 53/53, baseline 40/40, bao gồm toàn bộ indirect races và audit corrections cuối cùng. Checkpoint trước mở rộng tests cũng đã đạt 51/51 suite, 667/667 test, 566.829 giây; số liệu cuối không được suy từ lượt cũ.
- `npm run test:secrets`: PASS.

Các lượt chưa đạt được ghi rõ: lượt focused đầu 32 PASS / 5 FAIL do fixture AuthSession expiresAt vi phạm DB check trước FK race, kéo theo timeout/cleanup contention; đã sửa fixture sang thời hạn tương lai và xác minh lại. Lượt lint đầu bắt một unused import trong test, đã loại bỏ. Một lệnh npm với testPathPattern bổ sung vô tình chọn full integration được dừng trước checkpoint focused; không coi đó là full regression PASS. Full integration đầu: 48 suite PASS / 3 FAIL, 652 test PASS / 13 FAIL (665 total): 12 default-5-second timeouts trong programme-runtime-bridge, special-programme-lifecycle-e2e và ppct-import; một lỗi cleanup PPCT sau timeout. Đã đọc đầy đủ log trước khi chạy lại. Lượt mặc định 5 giây tiếp theo trên DB mới/non-superuser vẫn timeout trong workflow cũ, được dừng, không coi PASS. Lượt xác minh dùng CLI local `npm run test:integration -w apps/api -- --silent --testTimeout=30000`; không đổi assertions, mã nguồn timeout của test cũ hoặc CI. Lượt này phát hiện thêm fixture-order defect có sẵn: effective-schedule xóa calendar trước Semester/CalendarInterruption do academic-structure để lại. Bỏ duy nhất cleanup parent trùng để canonical harness dọn children trước parent; không đổi runtime hoặc assertion của suite. Cấu hình CI mặc định vẫn là gate độc lập; local functional PASS với runner 30 giây không phải tuyên bố PASS deadline 5 giây trên Windows. Không bỏ/skip/xóa test.

Lượt trước checkpoint: 48/51 suite PASS, 630/667 test PASS, 37 FAIL: hai suite bị lỗi fixture cleanup (effective-schedule calendar children, PPCT options year còn TimeSlotDefinition) và một P1001 kết nối tạm thời ở parallel read-only counts của allocation. Đã đọc đầy đủ log; hai suite cleanup chuyển parent cleanup về thứ tự canonical harness, không đổi assertion; giới hạn pool local xuống 5. Cả ba suite cùng toàn bộ full regression sau đó PASS như số liệu checkpoint trên. Không thay cấu hình CI hoặc thêm retry tự động để che lỗi.

Lượt audit-final bị chạy nhầm đồng thời với lượt final-all trên cùng DB thử: 8/53 test PASS, 45 FAIL vì fixtures bị lượt kia xóa; lượt full chồng này đã được dừng bằng đúng PID Jest của task. Không sử dụng hai lượt đó làm bằng chứng implementation PASS/FAIL. Sau khi dừng, lượt focused 93/93 ở trên được chạy riêng và PASS; full regression cuối được chạy tuần tự sau đó. Role cuối cũng đã bị REVOKE membership của role superuser fixture; truy vấn xác nhận super_role_membership=false cùng ba role flags=false.

## N–O. Schema và diff

ZERO thay đổi schema.prisma; ZERO migration mới/sửa; ZERO CI/CD/deployment script change. DDL cho unknown-FK test chỉ ở DB kiểm thử, được cleanup trong finally. `git diff --check`: PASS tại bước đối chiếu; kiểm tra lại staged diff trước commit.

## P. PR/CI

Duy nhất PR #240; không tạo PR/branch khác. Giữ draft vì P5-051 còn Slice C. Push checkpoint sau local checks; exact final head và CI được ghi trong bàn giao cuối. CI Slice A #783/compatibility #49 không được dùng để chứng nhận Slice B.

## Q–R. Giới hạn và trạng thái dừng

Independent GitHub/CI review là gate tiếp theo; local PASS không phải chấp thuận merge. Chưa có production/load-readiness claim. Schema drift sẽ cố ý chặn delete cho tới khi được review/cập nhật inventory. Các table locks nêu ở H có thể làm thao tác khác chờ ngắn hoặc khiến transaction bị conflict; rollback phải bảo toàn dữ liệu. Slice C nằm trong P5-051 và chưa được triển khai ở Slice B.

Trạng thái dừng của checkpoint: P5-051 SLICE B IMPLEMENTED; READY FOR INDEPENDENT CHATGPT REVIEW; P5-051 REMAINS IN_PROGRESS; NOT MERGED; NOT DEPLOYED.
