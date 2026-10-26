# P5-054 / T53-B — Đối soát execution và workload cho calendar replay

Ngày thực hiện: 26/10/2026. **Đã bổ sung guard nghiệp vụ; T53-B chưa đủ điều kiện PASS.**

## Cơ sở và phạm vi

- Repository `D:\baogiang-damsan`, giữ nhánh `feat/p5-054-consequence-closure`, HEAD `d8ac6c677f92a8936bfd6cf6fe697c7f67d5e714`. Cây làm việc ban đầu sạch, không có tệp staged/untracked.
- Ref `origin/main` đọc trực tiếp từ Git: `a15ddb194c2aac8f6e9d3c7ec35461702532fff8`; divergence `origin/main...HEAD`: 0 phía main / 3 phía HEAD. `git fetch origin main` bị sandbox từ chối ghi `.git/FETCH_HEAD`; không xác minh lại remote main, không vượt quyền hoặc sửa Git metadata. SHA ref cục bộ không được coi là bằng chứng canonical GitHub mới.
- Task `P5-054`, traceability `T53`; dependencies `P5-050`, `P2-050`, `P3-031` và predecessor tuần tự `P5-053` đều CLOSED trong Task Register. Đồng bộ P5-054 sang IN_PROGRESS cho lượt tiếp tục cục bộ; không tuyên bố IN_REVIEW/CLOSED hoặc sửa bằng chứng closure P5-055.
- Đối chiếu AGENTS, requirement P5-054, audit closure, hai báo cáo T53-A/B, các authority governance, protocol P5-050; ADR-031/033/036/038/039/040/048/056/057 và các đường nguồn structural, allocator V2, teaching execution, progress V2, official workload, calendar replay, make-up và reporting.
- Chỉ sửa guard đọc/reconciliation và unit regression. Không sửa schema/migration/ledger, công thức credit, public API/UI/preview, capability, command ghi, CI/CD; không kết nối VPS, production DB hoặc Nội trú. Không stage/commit/push/branch/PR.

## Kết quả kiểm tra authority và quyết định

`CurricularTeachingExecution` giữ hai bó provenance riêng. Bó nghĩa vụ nguồn gồm year/class/subject, normal occurrence key, timetable version/entry, source date/calendar/slot, teaching assignment/responsible teacher, PPCT association/plan/version/item/exact revision. Bó thực hiện gồm actual date/calendar/slot/week/segment và actual teacher. NORMAL phải dùng đúng tọa độ nguồn; MAKEUP phải giữ đúng schedule nguồn/đích. `replacesId` nối lịch sử, không cho phép tự chuyển credit sang item hiện hành. Component được suy từ PPCT revision/lineage theo ADR-048, không thêm cột hoặc tự chọn component.

Phát hiện thực tế trước sửa: Progress V2 chỉ duyệt các direct obligation còn được phân phối và đã kết thúc. Một execution ACTIVE đã kết thúc có thể biến mất khỏi phép đối soát nếu nguồn bị suppression/cancellation hoặc không còn allocation. Trước đây kết quả có thể PASS với counts bằng 0. Điều này trái yêu cầu ADR-040: bằng chứng retained mất nguồn phải BLOCKED/reconciliation, không được tự loại bỏ hoặc gắn sang nghĩa vụ mới.

Official workload hiện lấy execution ACTIVE theo actual teacher và **execution date**; mỗi execution đóng góp 1. Nó dùng lại special-programme authority và policy/date-effective duties/homeroom/calendar để tính required norm. CalendarException không giảm employment norm theo ADR-057. Service này không nhận candidate và không tự đối chiếu lại allocation V2. Vì vậy một retained workload PASS có thể đồng thời tồn tại với progress BLOCKED; không được ghép chúng thành candidate PASS, trừ credit execution, hay gọi workload retained hai lần rồi gọi đó là BEFORE/AFTER.

**Chọn đường fail-closed:** chưa tích hợp official workload vào candidate replay. Thay đổi lần này sửa việc bỏ sót bằng chứng tại authority progress V2, giữ guard ACTIVE toàn stream và trả chẩn đoán nội bộ chỉ rõ identity/authority còn thiếu. Không tạo thuật toán credit thay thế.

## Inventory thay đổi chính xác

| Tệp từ root | Thay đổi |
|---|---|
| `apps/api/src/progress-debt/progress-debt.service.ts` | V2 trả RECONCILIATION_REQUIRED/BLOCKED, counts=null và items=[] khi execution ACTIVE đã kết thúc không có elapsed direct obligation hiện hành; missing retained execution slot cũng BLOCKED. Kiểm tra thêm NORMAL execution date/calendar/slot bằng nguồn và makeup schedule phải null. Giữ nguyên thuật toán allocation, phân loại debt/completion và V1. |
| `apps/api/src/resolved-occurrences/calendar-exception-replay.ts` | Giữ chặn mọi execution/make-up ACTIVE trong toàn year/class/subject, không lọc ngày/horizon/as-of. Chọn identity ổn định bằng orderBy id; lỗi nội bộ có code, retainedEntityId và missingAuthority=`CANDIDATE_RETAINED_EXECUTION_AND_OFFICIAL_WORKLOAD_RECONCILIATION`. Không mở entry point công khai. |
| `apps/api/test/progress-debt/progress-debt-v2.service.spec.ts` | Sửa kỳ vọng sai về execution orphan; thêm hồi quy suppression, PPCT association/plan/version/item/revision drift, NORMAL target drift, missing slot, MAKEUP orphan, REVERSED/replacement, pre-operational và thời điểm chưa kết thúc. |
| `apps/api/test/operational-overlays/calendar-candidate-replay.spec.ts` | Structural + allocator V2 + progress V2 thật chứng minh retained execution bị orphan hoặc lệch item sau suppression. Thêm guard execution/make-up hiện tại/tương lai/ngoài horizon, identity/authority thiếu, lỗi đọc snapshot; kiểm tra không ghi/audit và giữ public coverage. |
| `apps/api/test/official-workload/official-workload-projection.spec.ts` | Hai ca NORMAL/MAKEUP chạy progress V2 và official workload thật qua cùng tx fixture: progress BLOCKED khi mất nguồn, workload retained vẫn giữ 1 credit đúng actual teacher/execution date và required norm 3. Không trình bày workload retained như candidate projection. |
| `docs/governance/PRE-PILOT-TASK-REGISTER.md` | P5-054 IN_PROGRESS, phạm vi cục bộ và blocker còn trong parent T53-B/D. |
| `docs/governance/CURRENT-PROJECT-STATUS.md` | Đồng bộ IN_PROGRESS, nhánh/HEAD và giới hạn kiểm chứng. |
| `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md` | T53 vẫn RESTORE, ghi tiến độ guard và các điều kiện chưa đáp ứng. |
| `docs/requirements/P5-054-TEACHING-OPERATIONS-WORKSPACE-CLOSURE.md` | Trạng thái IN_PROGRESS, consequence công khai vẫn NOT_ASSESSED. |
| `docs/phase-reports/P5-054-T53-B-IMPLEMENTATION.md` | Dẫn sang báo cáo lượt tiếp tục; giữ bằng chứng checkpoint trước. |
| `docs/phase-reports/P5-054-T53-B-EXECUTION-WORKLOAD-RECONCILIATION.md` | Báo cáo này. |

## Bằng chứng và kiểm tra

- Lượt đầu progress/replay: 2 suite, 65/65 ca đạt. Workload: 17/17 ca đạt, gồm hai ca cross-service mới.
- Lượt mở rộng ban đầu: 24 suite đạt, một suite không compile do biến result của transaction mock có kiểu unknown. Đã sửa assertion, không ép kiểu hoặc đổi runtime để lách lỗi. Chạy lại replay và sáu suite reporting downstream: 7/7 suite, 187/187 ca đạt.
- Lượt tổng hợp trên mã cuối: **31/31 suite, 690/690 ca đạt**, exit 0 (56,576 giây). Gồm 25 suite unit trong operational-overlays/resolved-occurrences/ppct-occurrence-allocation/progress-debt/official-workload/teaching-executions/helpers và sáu suite reporting đã nêu. So với checkpoint, ba suite sửa có thêm tổng cộng 27 ca và sửa một kỳ vọng orphan sai. Các ca chèn lỗi audit có log ERROR dự kiến, suite vẫn đạt.
- `npm.cmd run typecheck`: đạt toàn workspace, exit 0. `npm.cmd run lint`: đạt toàn workspace, exit 0, không có cảnh báo lint; API dùng `--max-warnings 0`. `npm.cmd run lint -w apps/api` chạy lại sau thay đổi test cuối: đạt, exit 0, không cảnh báo.
- `git diff --check`: đạt sau khi bỏ whitespace trên dòng status tài liệu. Không có staged file.
- Guard `resolveSafeTestDatabaseUrl` và setup giữ nguyên. `TEST_DATABASE_URL` không được đặt; không đọc `.env`, không chạy integration/E2E, không dò kết nối, tạo DB hoặc khởi tạo PostgreSQL. Unit suite guard nằm trong lượt hồi quy.

Các fixture nguồn retained không chứng minh PostgreSQL isolation/race. Hai fixture trước/sau của hồi quy suppression là **hai trạng thái retained độc lập**, không giả vờ ghi trong một snapshot. Calendar candidate entry point vẫn mở đúng một RepeatableRead transaction cho validation và các phép đọc; guard dùng cùng client. Test workload/progress dùng cùng client; policy/special-programme reads cũng nhận client đó, không mở transaction lồng.

Lệnh unit dùng `npm.cmd run test:unit -w apps/api -- --runInBand --runTestsByPath` với 31 đường dẫn chính xác: chọn các tệp `.spec.ts` không có `integration` trong bảy thư mục trên, cộng `test/reporting-projection/{reporting-projection.service,reporting-public-boundary}.spec.ts`, `test/personal-reporting-projection/personal-reporting-projection.service.spec.ts`, `test/reporting-statement-internal/{reporting-statement-canonicalizer,reporting-statement-snapshot-v4}.spec.ts`, `test/reporting-statements/reporting-statements.submit.spec.ts`. Không dùng script test tổng hợp có thể gọi integration.

## Blocker còn giữ trong parent P5-054/T53-B/D

1. **Candidate-aware retained execution và official workload reconciliation:** guard mới chỉ bảo vệ elapsed Progress V2. Execution chưa kết thúc/tương lai/ngoài horizon và make-up ACTIVE vẫn chặn candidate toàn stream. Chưa có proof để giữ hoặc bác bỏ đầy đủ từng retained fulfillment khi candidate thay đổi lịch sử, đồng thời đối soát workload mà không xóa credit đã chấp nhận.
2. **Bao đóng toàn bộ tác động:** seam vẫn chỉ có một class-subject stream/horizon; school/grade/class candidate có thể ảnh hưởng nhiều stream và actual teacher khác responsible teacher. Cần bao đóng nguồn/đích make-up, weekly look-ahead, component và toàn bộ execution liên quan; không suy PASS toàn lịch/giáo viên từ một stream.
3. **Revalidation tại mutation:** chưa nối consequence orchestration đủ coverage vào transaction ghi SERIALIZABLE/CAS/requestKey. Public preview/UI và các command hiện hữu không dùng adapter này; PPCT/debt/workload vẫn NOT_ASSESSED. Không mở T53-C từ kết quả lần này.
4. **Kiểm chứng thật:** PostgreSQL cô lập được cho phép rõ ràng, integration/race/rollback và E2E requirement T53-D vẫn bắt buộc. Không suy nghiệm thu từ mock hoặc unit PASS.
5. **Gate review/GitHub:** chưa xác minh lại canonical remote main, CI exact-head hoặc review độc lập trong lượt repository-only; không có merge/deploy/closure authority.

Tất cả blocker trên tiếp tục thuộc parent đã đăng ký; không thêm deferral vô chủ. V1 không được nâng thành authority cho candidate. Historical/frozen statement không bị viết lại.

## Tương thích và kết luận giai đoạn

Thay đổi hành vi có chủ đích: live Progress V2 và các consumer như reporting/make-up phải nhận BLOCKED thay vì số liệu có vẻ hợp lệ khi bằng chứng ACTIVE đã kết thúc mất nguồn, thiếu slot hoặc NORMAL target drift. Không thay credit/norm chính thức hoặc tự sửa execution; cần xử lý qua retained correction/reconciliation có thẩm quyền. Code-only change, không có migration/backfill hay tác động rollback dữ liệu.

**Kết luận: đã tiến thêm phần đối soát authoritative và chặn mất bằng chứng; chưa hoàn tất T53-B. Candidate có ACTIVE execution/make-up không thể PASS; candidate không có các fact đó vẫn chỉ là replay nội bộ có giới hạn với coverage NOT_ASSESSED.** P5-054 tiếp tục IN_PROGRESS; không có xác nhận nghiệp vụ, pilot, PR, merge hoặc deployment từ báo cáo này.
