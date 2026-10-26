# P5-054 / T53-B–D — Đối soát hệ quả và nghiệm thu cục bộ

Ngày kiểm chứng: **26/10/2026**. Báo cáo này cập nhật trạng thái triển khai sau các bằng chứng lịch sử trong [báo cáo T53-B](P5-054-T53-B-EXECUTION-WORKLOAD-RECONCILIATION.md). Những giới hạn của các lượt trước không phải kết luận về mã hiện tại.

## Nguồn và giới hạn thực thi

- Giữ nguyên nhánh `feat/p5-054-consequence-closure`, HEAD `ad7a282c88c7d7f469d869154b3fa0e4de899194` và mười tệp đang sửa được bàn giao, gồm service consequence mới. Không tạo nhánh/worktree hoặc thay lịch sử Git.
- Remote `main` được đọc trực tiếp bằng `git ls-remote origin refs/heads/main`: `a15ddb194c2aac8f6e9d3c7ec35461702532fff8`; ref `origin/main` khớp, divergence main/HEAD là `0/4`. Fetch bị sandbox từ chối ghi `.git/FETCH_HEAD`; không vượt chặn.
- Task đăng ký P5-054/T53; dependencies P5-050/P2-050/P3-031 và predecessor P5-053 đều CLOSED. Đã đọc năm authority governance, protocol P5-050, requirement/audit/báo cáo T53, ADR-031/036/040/048/050/056/057 và authority P3-031; đối chiếu controller, command và trang thật.
- Chỉ dùng PostgreSQL `127.0.0.1:55454/baogiang_p5054_test`. Không đọc `.env`, không dùng DB chính thức, không sửa schema/migration, capability/auth/role, CI/CD, VPS, Nội trú hoặc P5-055. Không bootstrap/restart/migrate PostgreSQL. Không stage/commit/push/PR/merge/deploy.

## T53-B: hệ quả có thẩm quyền

`CalendarCandidateConsequenceService` bao đóng CLASS/GRADE/SCHOOL_WIDE, lịch TKB SUPERSEDED/ACTIVE và ranh giới hiệu lực tương lai. Mọi stream bị ảnh hưởng cùng stream có execution/lịch bù ACTIVE trong các lớp được chọn đều đi qua allocator V2 và Progress V2 thật. PPCT đọc tới cuối biên lịch retained; progress chỉ tính phần đã kết thúc tại cùng instant. Không dùng một lớp–môn đại diện toàn trường.

Retained execution được đối soát cả BEFORE và AFTER bằng chính hàm fulfillment V2: exact obligation, PPCT item/revision/component, assignment, actual teacher, disposition, ngày/tiết thực hiện và lịch bù. Mỗi lịch bù được kiểm tra riêng original và target, retained calendar/slot, nguồn disposition, allocated lineage và suppression. Bản ghi không liên quan có thể giữ PASS; suppression của nghĩa vụ đã hoàn thành, target không hợp lệ, đổi lineage hoặc nguồn không rõ phải BLOCKED kèm identity. Không loại accepted credit hoặc tự gán lại execution.

Khối lượng dùng `OfficialWorkloadProjectionService`, actual teacher/ngày thực hiện và credit chương trình đặc biệt P4-050; định mức dùng policy date-effective ADR-057. AFTER bằng BEFORE chỉ khi toàn bộ retained identity đã qua V2 và footprint lệnh không ghi execution/participation/attestation/coefficient/policy/homeroom/duty. Phản hồi chứa chứng cứ equality, execution liên quan và delta bằng 0. Khi không chứng minh được, AFTER/delta là null, coverage NOT_ASSESSED. Không gọi lại hai phép đọc retained giống nhau rồi tự coi đó là kịch bản.

Đọc structural được dùng chung theo ngày trong đúng một replay/transaction; batch official workload chỉ dùng chung calendar/policy độc lập với giáo viên. Không có cache liên transaction, không đổi công thức credit/norm. Unit kiểm tra batch khớp phép chiếu độc lập, giáo viên có định mức khác nhau và lần đọc tiếp theo thấy authority mới.

Public ASSESSED chỉ xuất hiện khi cả PPCT/debt/workload đạt. Preview dùng RepeatableRead và `SET TRANSACTION READ ONLY`. Calendar create/reverse, disposition create/reverse đều tái resolve và đối soát ngay trong transaction SERIALIZABLE trước ghi/audit. UI gửi fingerprint của đúng preview; nguồn thay đổi trả 409. Idempotent requestKey, quyền hiện hữu, CAS, retained reversal và replacement giữ nguyên. API cũ có thể không gửi trường fingerprint tùy chọn, nhưng vẫn phải qua đối soát đầy đủ tại transaction ghi; preview không tự cấp quyền ghi.

Lịch bù dùng chung `prepareCreate` cho preview/commit, giữ toàn bộ kiểm tra P3-031: đúng PROVEN_OPEN_DEBT, disposition nguồn, operational start, target prospective, StaffSubject và half-open collision. Preview mới `POST /operational-overlays/makeup-schedules/preview` có cùng guard/DTO; không sinh execution, không tiêu thụ PPCT mới hoặc đóng nợ. Commit SERIALIZABLE kiểm tra lại nguồn/đích/workload và fingerprint. Reversal giữ điều kiện CAS và cấm đảo khi đã có execution ACTIVE.

## T53-C: luồng người dùng

- Trang điều hành hiển thị lớp/môn/giáo viên, bài PPCT trước–sau do backend tính, counts đã kết thúc và official credit/norm của từng giáo viên. Có ngày chốt và biên tính, không trình bày counts elapsed thành tác động tương lai.
- Dạy thay cùng môn và giám sát khác môn có diễn giải riêng. Teacher options chỉ là danh sách tư cách; exact selected teacher vẫn phải qua preview và commit kiểm tra va chạm. Giám sát không hoàn thành môn nguồn, không có credit dạy môn nguồn giả.
- Lịch bù bắt buộc xem trước đúng nghĩa vụ và target đã chọn, rồi mới cho xác nhận. Replacement liên kết retained record, không yêu cầu nhập UUID/enum. Năm học dùng context được cấp quyền hiện hữu.
- Nút xác nhận chỉ có khi evidence đủ PASS; đổi lựa chọn làm mất preview. 401/403/409 đóng xác nhận cũ; 500 giữ requestKey để người dùng chủ động thử lại, không tự gửi lệnh lần hai. History được làm mới sau thành công, thông báo thành công không bị mất do tải nguồn lại.
- Phản hồi disposition/lịch bù theo môn chỉ trả stream và equality proof cần thiết; không lộ official totals/policy/khối lượng các môn khác. Authorization policy không thay đổi.
- Giữ 22 route, token/font/primitive DESIGN.md; dùng native control, DataTable/Pagination hiện hữu và `form-section`. Không thêm CSS/theme/library.

## T53-D: dữ liệu thật và cách chạy

Mỗi lần chạy integration đặt đúng:

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55454/baogiang_p5054_test?schema=public'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
$env:NODE_ENV='test'
$env:BAOGIANG_ALLOW_DESTRUCTIVE_TEST_DB='1'
$env:PGCLIENTENCODING='UTF8'
$env:P5054_LIVE_BROWSER='1'
```

Chạy một process Jest `--runInBand --testTimeout=60000 --runTestsByPath` với 13 tệp integration trong operational-overlays (2), resolved-occurrences (1), ppct-occurrence-allocation (2), progress-debt (2), official-workload (1), teaching-executions (1), reporting-statements (2), reporting-statement-internal (1), special-activities (1). Không chạy hai process destructive cùng lúc.

Harness teaching-execution khởi động Nest thật trên loopback port tạm; gọi Playwright `tests/e2e/specs/p5-054-calendar-live.spec.ts` với backend này và Vite `127.0.0.1:5173`. Browser proxy chỉ chuyển HTTP tới Nest thật, không trả fixture hoặc mock API. Test tự đăng nhập tài khoản DB cô lập, kiểm tra trạng thái HTTP; harness kiểm tra retained rows/audit/replacement FK sau browser. Spec standalone thiếu harness sẽ skip và không phải bằng chứng nghiệm thu.

Luồng browser liên tục bao gồm nghỉ toàn trường khi đã có unrelated execution, đảo lịch, chặn fulfilled source, stale preview sau concurrent execution, denied grant ở UI/API, dạy thay cùng môn + đảo, selected-teacher collision, giám sát khác môn, lịch bù exact target + đảo + replacement. PostgreSQL bổ sung race SERIALIZABLE thật, rollback không phát sinh row/audit thành công, missing norm, CLASS/GRADE/SCHOOL, nguồn/đích bù, lineage/reversal và chặn mọi loại disposition khi original đã hoàn thành.

Ảnh thật ở `tests/e2e/test-results/p5-054-live/`: calendar, same-subject, supervision và makeup tại 320/375/414/1366/1440px. Đã xem ảnh mobile/laptop/wide: chữ và control theo DESIGN, bảng cuộn trong region riêng, không tràn trang; phân biệt rõ PPCT tương lai với completion elapsed. Keyboard Enter xác nhận, focus, reduced motion và Axe được kiểm tra; calendar/makeup không có vi phạm serious/critical. Đây là browser cục bộ, không thay nghiệm thu thiết bị/người dùng P5-057.

## Kết quả trên cây mã cuối

Các cổng kiểm tra cuối trên cây mã local (26/10/2026):

- API unit toàn bộ: **106/106 suites, 2.069/2.069 tests PASS**, `p5054-api-unit-final.log`.
- Web unit toàn bộ: **45/45 suites, 744/744 tests PASS**, `p5054-web-unit.log`.
- Workspace typecheck, lint, UI Foundation và PWA static: **PASS**, `p5054-static-final.log`.
- PostgreSQL cô lập, kiểm tra 13 integration suites trong **một** tiến trình Jest tuần tự: **13/13 suites PASS, 184 tests PASS, 1 test SKIP, exit code 0**. Bằng chứng: `.tmp/p5-054-t53b-isolated-pg/integration-recheck2.log`. Bài SKIP là kịch bản Playwright cần bật cờ riêng.
- Playwright Chromium với Nest HTTP thật và database cô lập: **1/1 PASS** khi bật `P5054_LIVE_BROWSER=1`, 48 test không thuộc pattern được SKIP trong lượt riêng; `p5054-live-check.log`. Không cộng SKIP vào PASS.
- Hai suite PostgreSQL có lỗi ở lần kiểm tra trước được kiểm tra riêng **26/26 PASS** rồi cùng đạt trong lượt 13-suite cuối. Bằng chứng: `p5054-target-check.log`.
- `git diff --check`: **exit code 0**. Không thấy sửa schema, migration hay CI/CD.

**Quyết định cục bộ:** đủ bằng chứng chuyển P5-054/T53 sang `IN_REVIEW`, chưa `CLOSED`. Phải đối soát độc lập exact Git HEAD, CI/PR và kiểm chứng deploy/SYNC sau merge theo quy trình. Các giới hạn tối đa năng lực chưa được load-test ở cap và sự cố kết nối PostgreSQL trước đó chưa chứng minh được nguyên nhân gốc; không tuyên bố đã xử lý nguyên nhân hạ tầng.

## Các lần không đạt và cách xử lý

- Fixture cũ của overlays/special-activities thiếu PPCT/week segments/WORKLOAD_ADJUSTMENT nên command mới trả 409 đúng cổng. Bổ sung authority xuất bản trong fixture, giữ assertions collision/authorization/lifecycle; không giả PASS hoặc bỏ cổng runtime.
- Một phép đọc resolver trong lượt 13-suite đầu mất kết nối `127.0.0.1:55454`; các suite sau vẫn kết nối được. Hai suite chạy riêng đạt 26/26. Chưa xác định nguyên nhân gốc kết nối; kết quả chạy lại không được coi là đã sửa PostgreSQL.
- Lượt chạy static/unit nặng cùng integration làm transaction execution hiện hữu vượt 5 giây. Chuyển kiểm chứng DB chạy riêng; không tăng timeout transaction execution để che lỗi. Các ca đa stream có timeout Jest 60 giây.
- Một thử nghiệm đổi policy PUBLISHED bị trigger bất biến từ chối; thay bằng concurrent execution hợp lệ để kiểm tra stale fingerprint, không gỡ immutability.
- E2E phát hiện history chưa refresh và thông báo thành công mất khi reload nguồn: đã sửa invalidation trong trang. Đồng thời đợi POST hoàn tất và drain proxy requests lúc teardown; không biến lỗi thành retry tự động.
- Fixture Web trước đây còn mock endpoint năm học admin, không đúng context được cấp quyền mới; sửa fixture và thêm fail-closed khi context thiếu `years`. Lượt đầy đủ Web sau đó đạt.
- Đã sửa lỗi chữ tiếng Việt trong quá trình chỉnh bằng shell và quét lại các tệp thay đổi. Lỗi khởi chạy Playwright kế thừa `JEST_WORKER_ID` đã sửa trong harness. Không loại test để lấy kết quả xanh.

## Tương thích, rollback và cổng tiếp theo

Không có schema/migration/backfill hoặc source of truth mới. API thêm trường fingerprint tùy chọn và preview lịch bù; command cũ giữ contract nhưng bị từ chối khi consequence không đủ nguồn. Retained executions/credit và frozen statements không bị viết lại. Rollback mã không yêu cầu rollback dữ liệu; cần đánh giá lại cổng an toàn nếu quay về command cũ.

Các biên hữu hạn fail-closed: 550 ngày, 128 phiên TKB, 512 lớp/stream/giáo viên; tối đa 10.000 retained execution/lịch bù mỗi lớp với cap tổng 200.000, các truy vấn discovery có giới hạn rõ ràng. Dữ liệu ngoài biên hoặc thiếu authority phải BLOCKED/NOT_ASSESSED, không được suy PASS. Chưa có load proof ở các cap tối đa. Không tạo deferral sản phẩm mới.

Chứng cứ cục bộ chưa phải independent exact-head GitHub review/CI, merge hoặc SYNC-P5-054; không cho phép bắt đầu task phụ thuộc hoặc teacher pilot. Orchestrator quyết định checkpoint remote sau review. Chỉ CLOSED sau merge và thủ tục SYNC bắt buộc.
