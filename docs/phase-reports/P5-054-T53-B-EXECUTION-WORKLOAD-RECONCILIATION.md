# P5-054 / T53-B — Đối soát execution và workload cho calendar replay

Ngày thực hiện: 26/10/2026. **Đã bổ sung guard nghiệp vụ; T53-B chưa đủ điều kiện PASS.**

Các phần đầu giữ nguyên bằng chứng từng checkpoint. Phần **“Lượt tiếp tục runtime đa luồng và workload chính thức”** cuối tài liệu là trạng thái mới nhất, thay thế những giới hạn/checkpoint cũ về chưa có DB, chưa xác minh remote main và chỉ replay đơn luồng; không thay bằng chứng lịch sử hay tuyên bố đóng parent.

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

## Bổ sung bằng chứng PostgreSQL cô lập — 26/10/2026

- **Môi trường kiểm chứng:** NGUYENSON; PostgreSQL 17.10 tại `127.0.0.1:55454`, database `baogiang_p5054_test`; 29/29 migrations hoàn tất. Cluster thử nghiệm nằm trong `.tmp/p5-054-t53b-isolated-pg`, không phải VPS hay cơ sở dữ liệu chính thức.
- **Git baseline:** nhánh `feat/p5-054-consequence-closure`, HEAD `ad7a282c88c7d7f469d869154b3fa0e4de899194`; GitHub `main` `a15ddb194c2aac8f6e9d3c7ec35461702532fff8`. Các thay đổi bổ sung chỉ ở test/tài liệu local, chưa commit, push, mở PR, merge hay deploy.
- **Integration nền:** Progress Debt V2, PPCT Allocation V2 và Official Workload: 3 suite, 42/42 PASS. Đợt mở rộng 31/32 do lỗi kết nối PostgreSQL chưa giải thích được; suite PPCT chạy riêng 10/10 PASS. Không đồng nhất chạy lại thành công với đã sửa nguyên nhân gốc.
- **Kiểm thử chuyên biệt T53-B:** thêm bốn ca trong `apps/api/test/teaching-executions/teaching-executions.integration.spec.ts`: chặn lịch dạy bù ACTIVE; ưu tiên và bảo toàn execution ACTIVE; race trên snapshot RepeatableRead; không suy diễn độ bao phủ toàn trường từ một lớp–môn. Toàn bộ suite 21/21 PASS, exit 0.
- **Race đã tái hiện:** preview tạo snapshot trước khi có execution; giao dịch khác commit execution trước lúc preview kết thúc. Snapshot không thấy hàng mới, nhưng evidence vẫn `NOT_ASSESSED` với `MUTATION_REVALIDATION_UNAVAILABLE`. **Không dùng preview làm thẩm quyền ghi**; cần đối soát lại trong chính giao dịch ghi SERIALIZABLE/CAS/requestKey.
- **Phạm vi toàn trường:** một luồng lớp–môn không có dữ liệu retained không chứng minh luồng khác an toàn. Luồng thứ hai với lịch dạy bù ACTIVE trả `CALENDAR_REPLAY_MAKEUP_RECONCILIATION_REQUIRED`; evidence ứng viên toàn trường tiếp tục `NOT_ASSESSED` và `BOUNDED_SINGLE_STREAM_REPLAY`. Chưa có cơ chế kiểm kê trọn phạm vi ảnh hưởng.
- **Khối lượng chính thức:** `OfficialWorkloadProjectionService` đọc execution thực tế theo giáo viên và ngày thực hiện, chưa nhận ứng viên calendar và chưa có BEFORE/AFTER theo ứng viên. Không được nâng coverage thành `ASSESSED` hoặc suy đoán số tiết credit.
- **Cổng nghiệm thu:** P5-054/T53-B vẫn `IN_PROGRESS`; các hậu quả PPCT/debt/workload công khai vẫn `NOT_ASSESSED`. Chưa mở xác nhận T53-C hoặc nghiệm thu T53-D; không chỉnh runtime/schema/migration/API/UI/CI/CD, VPS hoặc Nội trú trong lượt kiểm thử này.

### Bổ sung runtime candidate-wide fail-closed (26/10/2026)

Đã chỉnh `CalendarExceptionReplay.assertCandidateRetainedScope(tx)` và gọi bắt buộc từ `OperationalOverlaysService.withCalendarPreviewReplay()` **trước** callback replay. Kiểm tra tập lớp theo đúng phạm vi SCHOOL_WIDE/GRADE/CLASS cùng `academicYearId`; tra tất cả `CurricularTeachingExecution` và `MakeupTeachingSchedule` ACTIVE thuộc các lớp đó, không lọc môn, ngày hay horizon. Trả lỗi retained identity có cấu trúc nếu tìm thấy. Tập lớp không giải được phải fail-closed; không tạo hồ sơ retained, không ghi audit. `assertStream` cũ vẫn giữ cho đọc V2 ở stream cụ thể. Đây là **cổng an toàn đa lớp/môn**, chưa phải thuật toán định lượng consequence đủ toàn trường. Việc quét cả năm có thể bảo thủ, từ chối ứng viên khi có evidence ở môn/tiết không trực tiếp bị hủy; chỉ được thu hẹp sau khi có phép đối soát nguồn/đích đầy đủ.

Bằng chứng sau cập nhật: `calendar-candidate-replay.spec.ts` 24/24 unit PASS; `teaching-executions.integration.spec.ts` 22/22 PostgreSQL integration PASS, có ca SCHOOL_WIDE chặn lịch dạy bù lớp khác, GRADE 10 chặn nhưng GRADE 11/CLASS 11A tách biệt không bị chặn, và snapshot race trả NOT_ASSESSED. API typecheck PASS. **Chưa có candidate-aware Official Workload BEFORE/AFTER, chưa có ảnh hưởng PPCT/debt đa luồng được định lượng, chưa có mutation revalidation SERIALIZABLE**, chưa có PR/merge/deploy. Không nâng coverage `NOT_ASSESSED` hoặc trạng thái T53-B.

## Lượt tiếp tục runtime đa luồng và workload chính thức — 26/10/2026

### Baseline, thẩm quyền và phạm vi thực tế

- Nhánh giữ nguyên `feat/p5-054-consequence-closure`, HEAD đầu/cuối `ad7a282c88c7d7f469d869154b3fa0e4de899194`. `git ls-remote origin refs/heads/main` xác minh trực tiếp remote main `a15ddb194c2aac8f6e9d3c7ec35461702532fff8`; khớp ref `origin/main`, divergence 0 phía main / 4 phía HEAD. `git fetch origin main` vẫn bị từ chối ghi `.git/FETCH_HEAD`; không vượt chặn.
- Giữ và cải thiện cả năm tệp dirty được giao: overlay service, calendar replay, candidate unit spec, teaching-execution integration spec và báo cáo này. Không reset/stash/clean/rebase/checkout, tạo nhánh/worktree, stage, commit, push, PR, merge hoặc deploy. Không có tệp staged.
- P5-054/T53 đã đăng ký IN_PROGRESS; dependencies P5-050/P2-050/P3-031 và predecessor P5-053 đều CLOSED. Đã đối chiếu current authorities, protocol P5-050, addendum v1.3, requirement/audit/các báo cáo T53 và ADR-020/031/033/036/037/038/040/048/049/050/056/057. Không tạo authority mới hoặc deferral vô chủ.
- Chỉ dùng PostgreSQL thử nghiệm được chỉ định `127.0.0.1:55454/baogiang_p5054_test`. Mỗi lệnh integration đặt đúng `TEST_DATABASE_URL` và `DATABASE_URL` theo URL đã cấp, `NODE_ENV=test`, `BAOGIANG_ALLOW_DESTRUCTIVE_TEST_DB=1`, `PGCLIENTENCODING=UTF8`; giữ nguyên safety guard. Không đọc `.env`, token/secret/dump, không truy cập DB khác/VPS/Nội trú, không bootstrap/restart PostgreSQL hoặc chạy migration.

### Runtime đã bổ sung

1. **Bao đóng candidate theo phạm vi:** thêm `CalendarCandidateConsequenceService` nội bộ trong module hiện hữu, không controller/endpoint/export public. Tự kiểm kê lớp theo CLASS/GRADE/SCHOOL_WIDE, resolve structural đúng ngày, kiểm tra exact calendar của TKB date-effective, lấy mọi lớp–môn thực sự bị candidate suppress; không yêu cầu caller chọn một stream để đại diện toàn trường. Tập rỗng vẫn NOT_ASSESSED, không sinh teacher projection giả.
2. **Replay mọi stream:** dùng allocator V2 và Progress V2 thật cho BEFORE/AFTER; giữ origin lịch sử, SUPERSEDED + ACTIVE/future-effective history, weekly look-ahead, component routing và PPCT lineage do authority cũ sở hữu. Replay PPCT tới ngày cuối lớn nhất của các calendar retained liên kết TKB trong năm; progress chỉ tới cùng `asOfInstant` đã chốt, không sinh nợ tương lai. Không lấy ngày hủy làm điểm khởi động cursor mới.
3. **Biên và thứ tự:** trả rõ from/through/as-of/version IDs; sắp stream và teacher theo identity, affected keys ổn định. Giới hạn 550 ngày, 128 phiên TKB, 512 lớp/stream/teacher, 10.000 hàng mỗi tập discovery. Đọc thêm một hàng để phát hiện vượt giới hạn và chặn toàn kết quả; không cắt rồi nhận là đầy đủ. Thiếu history/calendar, sai calendar date-effective, nguồn BLOCKED/non-base, horizon không giải được hoặc as-of tương lai đều từ chối. `asOf` sau cuối horizon hiện cũng bị từ chối rõ ràng; chưa có authority cho phép kéo dài/clamp tùy ý.
4. **Workload chính thức:** kiểm kê giáo viên responsible ở các entry của stream qua các phiên retained, assigned substitute/supervisor ở disposition ACTIVE và staffing activity theo frozen class targets; loại trùng rồi gọi `OfficialWorkloadProjectionService.resolveInTransaction` đúng một lần/giáo viên trong cùng snapshot. Phép đọc official tự bao gồm mọi actual execution của giáo viên trong range, kể cả lớp khác, MAKEUP theo execution date và special-programme qua P4-050. Không viết công thức/norm/credit thứ hai.
5. **Không giả AFTER:** mỗi teacher có `before` retained chính thức; `after=null`, `delta=null`, status NOT_ASSESSED hoặc BLOCKED cùng missingAuthority `CANDIDATE_RETAINED_EXECUTION_AND_OFFICIAL_WORKLOAD_RECONCILIATION`. Official BLOCKED kéo trạng thái tổng thành BLOCKED; PPCT/Progress PASS không lấn át nó. Coverage công khai PPCT/debt/workload vẫn NOT_ASSESSED.
6. **Guard và transaction:** giữ `assertCandidateRetainedScope` trước callback; không thu hẹp theo môn, ngày, selector, calendar, giáo viên hoặc horizon. Source/target make-up và original obligation cùng class/subject/year nhờ composite FK, nên quét toàn lớp/năm bảo vệ cả hai đầu mà không thêm OR giả. Thêm kiểm tra shape và giới hạn class discovery. `withCalendarPreviewReplay` sao chép input rồi chạy `SET TRANSACTION READ ONLY` làm câu lệnh đầu trong RepeatableRead; timeout transaction 60 giây để cho phép replay đa luồng, không có retry hoặc đổi sang mutation. PostgreSQL trực tiếp từ chối lệnh ghi trong callback.

### Bằng chứng kiểm thử và các lần sửa trong lượt này

| Kiểm tra | Kết quả / exit |
|---|---|
| Unit hồi quy toàn bộ miền ảnh hưởng | 38/38 suite, **800/800 test PASS**, exit 0; 84,886 giây. Gồm overlays, resolved occurrences, allocator, progress, official workload, execution, DB safety, reporting/personal reporting/statement và special-programme/activity. |
| Candidate unit trên thay đổi runtime cuối | **38/38 PASS**, exit 0; 28,434 giây. 14 ca orchestration mới đi qua structural + allocator + Progress V2 thật; workload discovery dùng spy, không nhận đó là proof công thức workload. |
| PostgreSQL hồi quy ảnh hưởng | **13/13 suite, 166/166 PASS**, exit 0; 172,372 giây. Gồm official workload, execution, cả V1/V2 allocation/progress, overlays/make-up, structural, special activity và reporting statement repository/HTTP/runtime. |
| PostgreSQL teaching-execution trên mã/test cuối | **32/32 PASS**, exit 0; 55,220 giây. Có thêm ca independent activity sau lượt 13-suite; tổng inventory đã kiểm chứng là 167 ca integration riêng biệt, không cộng lặp các lần chạy. |
| Typecheck toàn workspace | `npm.cmd run typecheck`: PASS, exit 0. |
| Lint toàn workspace | `npm.cmd run lint`: PASS, exit 0, API `--max-warnings 0`. |
| Static API sau thay đổi runtime cuối | `npm.cmd run typecheck -w apps/api` và `npm.cmd run lint -w apps/api`: PASS, exit 0. |
| Whitespace / staging | `git diff --check`: exit 0; staged file list rỗng. |

Các lệnh Jest dùng `npm.cmd run test:unit -w apps/api -- --runInBand --runTestsByPath ...` và `npm.cmd run test:integration -w apps/api -- --testTimeout=60000 --runTestsByPath ...`. Unit chọn `.spec.ts` không chứa `integration` trong 14 thư mục liên quan; integration chọn 13 `.integration.spec.ts` từ overlays/resolved/allocation/progress/official-workload/execution/reporting/special-activities, chạy tuần tự trên một DB cô lập. Không chạy hai integration process đồng thời.

Các lần không đạt được ghi rõ, không xóa bằng chứng: lượt unit đầu có 1 kỳ vọng fixture sai (xóa association ở lớp đọc không đủ để làm allocator thật BLOCKED), đã đổi fixture mất PPCT version có thẩm quyền; không sửa runtime để lách test. Một lượt integration mở rộng 25/30 đạt: bốn ca replay lớn vượt timeout Jest mặc định 5 giây khi chạy cùng static/unit checks, một ca seed capability trùng. Đã bỏ seed trùng và cấp 60 giây cho các ca lớn; lượt 13-suite phía trên đạt đầy đủ. Đây là chỉnh harness/fixture, không đổi safety gate hay giảm assertion. Log ERROR ở unit authorization denial là failure-injection có chủ đích và suite đạt.

Ca independent activity bổ sung ban đầu không compile vì nested Prisma create truyền thừa `academicYearId` vốn đã kế thừa từ root. Đã bỏ đúng trường dư, không ép kiểu/sửa schema; suite cuối 32/32 đạt. Ca này giữ nguyên root/children/staffing của activity độc lập, không sinh participation hay special-programme credit, tiếp tục dùng P4-050 trong official projection; candidate trùng ngày bị NON_BASE_SOURCE thay vì đoán precedence. Nó không thay thế proof execution + attestation + coefficient của special-programme đã được hồi quy trong suite official workload.

PostgreSQL chứng minh SCHOOL_WIDE có 4 stream trên 3 lớp/2 môn, GRADE có 3 stream và CLASS có 1 stream; mỗi stream dời sequence từ `[1,2,3,4]` sang `[null,1,2,3]`, không sinh credit/completion/debt. Norm retained của từng teacher vẫn 63 trong range 10–31/8. Thiếu workload policy trả BLOCKED cho mọi teacher dù PPCT replay được. Credit substitution thực ở lớp khác vẫn được official service đọc cho actual teacher liên quan candidate; credit MAKEUP ở 11/8 là 1, ở source 10/8 là 0, required norm từng ngày vẫn 9; guard chặn cả source và target ngay cả selector AFTERNOON không trùng tiết retained.

**Race thật:** ngoài ca seam cũ, ca mới tạm dừng bộ điều phối sau khi snapshot đã lập, giao dịch cạnh tranh confirm execution qua runtime hiện hữu rồi commit trước lúc preview tiếp tục. Cả bốn stream và retained workload trong snapshot vẫn chưa thấy execution; kết quả NOT_ASSESSED, AFTER/delta workload null. Phép đọc official mới bên ngoài thấy earnedCredit=1. Vì vậy read-only + RepeatableRead không chứng minh không có concurrent commit, càng không phải chứng chỉ để ghi.

### Inventory hiện tại và blocker chính xác

Tệp thay đổi trong working tree: `apps/api/src/operational-overlays/{calendar-candidate-consequence.service.ts (mới),operational-overlays.module.ts,operational-overlays.service.ts}`, `apps/api/src/resolved-occurrences/calendar-exception-replay.ts`, `apps/api/test/operational-overlays/calendar-candidate-replay.spec.ts`, `apps/api/test/teaching-executions/teaching-executions.integration.spec.ts`, ba authority governance `CURRENT-PROJECT-STATUS.md`, `PRE-PILOT-TASK-REGISTER.md`, `PRE-PILOT-TRACEABILITY-MATRIX.md`, và báo cáo này. Năm tệp dirty đầu lượt vẫn được giữ. Không sửa service tính official workload/PPCT/Progress, schema/migration, auth/security, public contract/controller, UI hoặc CI/CD.

- **Chưa có reconciliation candidate đầy đủ cho retained execution/make-up:** mọi ACTIVE fact trong lớp bị chọn vẫn chặn toàn candidate, kể cả ngoài horizon hoặc không trực tiếp trùng selector. Chưa được thu hẹp guard cho tới khi chứng minh chính xác original/target/PPCT/component/provenance và bảo toàn accepted actual credit. Số liệu đa luồng hiện chỉ hợp lệ trong biên retained đã trả và trường hợp guard cho phép; không phải PASS toàn sản phẩm.
- **Chưa có official workload AFTER/delta theo candidate:** official service hiện đọc retained actual credit/norm, không nhận candidate và không chứng minh giữ hay loại fulfillment sau thay đổi phân phối. Không được gọi hai lần trên cùng retained state rồi gắn nhãn BEFORE/AFTER. Candidate exception không được giảm norm hoặc xóa earned credit đã nhận; phần thiếu tiếp tục trong parent P5-054/T53-B.
- **Chưa có revalidation consequence tại mutation SERIALIZABLE/CAS/requestKey:** service mới chỉ đọc và không nối public preview/command. Các endpoint retained cũ vẫn thuộc authority cũ; lượt này không mở confirmation T53-C hoặc thêm endpoint/button. Race đã chứng minh không thể dựa vào snapshot để cho phép ghi.
- **Disposition/reversal và nghiệm thu rộng:** chưa có candidate orchestration đầy đủ cho substitution/supervision/reversal; chưa có E2E persona theo requirement T53-D, independent GitHub diff review/exact-head CI hoặc performance proof ở giới hạn tối đa. PostgreSQL regression không thay thế những gate đó. Không nâng parent IN_REVIEW/CLOSED, không triển khai.

P5-054/T53-B tiếp tục **IN_PROGRESS**, public consequences **NOT_ASSESSED**. Những phần thiếu ở trên là công việc đang mở trong parent đã đăng ký, không phải deferral mới. Tính tương thích: code-only internal read path, không backfill/migration hay thay retained semantics; rollback mã không đòi rollback dữ liệu.


## Lượt hoàn thiện T53-B và triển khai T53-C/D — 26/10/2026

Kết quả mới nhất và lệnh kiểm chứng đầy đủ: [P5-054-T53-C-D-LOCAL-ACCEPTANCE.md](P5-054-T53-C-D-LOCAL-ACCEPTANCE.md). Các đoạn IN_PROGRESS/NOT_ASSESSED phía trên ghi lại từng trạng thái lịch sử; không phải kết luận của lượt này.

Đã thay cổng chặn blanket ACTIVE trong đường orchestration đầy đủ bằng đối soát từng execution/lịch bù ở cả original và target, exact PPCT revision/component/lineage, actual teacher và retained fulfillment V2. Seam chẩn đoán cũ vẫn giữ cổng bảo thủ. Candidate không liên quan đến completed work nay có thể PASS; candidate suppress/rebind fulfillment vẫn BLOCKED theo identity, không bỏ credit.

Official workload được dùng trực tiếp cho từng giáo viên. AFTER=BEFORE chỉ có proof sau khi V2 giữ toàn bộ retained identity và footprint lệnh không đổi execution/chương trình đặc biệt/định mức; thiếu proof tiếp tục null/NOT_ASSESSED. Calendar/disposition create và reverse tái resolve trong SERIALIZABLE trước write/audit. Preview READ ONLY không cấp quyền commit; fingerprint stale và concurrent writer trả 409, không có unintended row/audit thành công.

Đã nối UI tiếng Việt với evidence thật, exact teacher/target preview, retained history/reversal/replacement và cổng xác nhận PASS. Thêm preview lịch bù dùng chung validation P3-031 với commit. Giữ scope authorization, requestKey, CAS, 22 route và DESIGN.md; không sửa schema/migration hoặc công thức workload.

Lượt PostgreSQL cuối: **13/13 suite, 185/185 PASS, exit 0**, 170,163 giây; Playwright thật bên trong đạt **1/1**, 27,7 giây, bao gồm các luồng nghiệp vụ bắt buộc. Bộ Web đầy đủ **45 suite, 744/744 PASS**. Kết quả API unit/static cuối cùng và trạng thái review được ghi trong báo cáo mới. Không commit/push/PR/merge/deploy hoặc tác động DB ngoài localhost cô lập được cấp.
