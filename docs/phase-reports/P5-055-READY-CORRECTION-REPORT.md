# P5-055 / PR #248 — sửa đánh giá READY thiếu căn cứ

Ngày: 2026-10-23. Trạng thái correction: **IN_PROGRESS**, chưa đủ điều kiện push/review checkpoint.

## Baseline và phạm vi

- Repository: `D:\baogiang-damsan`; branch duy nhất: `feat/p5-055-data-readiness-import-center`.
- HEAD local và remote khi bắt đầu: `5d00da1e2cebd8e99dab46d3278fd61bca12de52`; working tree ban đầu sạch, remote branch không phân kỳ.
- Canonical main được kiểm tra trực tiếp bằng `git ls-remote` và GitHub PR metadata: `d13e1f98b063c9ee902ed8940372a2bbac224a55`. Branch có 2 commit phía trước main, không có commit phía sau.
- Dependencies P5-052, P5-053, P2-020, P3-020, P4-074 đều CLOSED trong task register; phạm vi T54/P5-055.
- Đã đọc AGENTS.md, năm tài liệu governance bắt buộc, protocol P5-050, yêu cầu P5-055, ADR-049, resolver chính sách, các mô hình/lifecycle PPCT và programme, bộ đánh giá TKB và đối soát lịch sử hiện có. Đối chiếu damsan-ui/DESIGN.md cho thông báo và đường dẫn hướng dẫn.
- Chỉ sửa read/orchestration service, module wiring cho resolver hiện có, test và tài liệu P5-055. Không sửa schema/migration, auth/capability, CI/CD hoặc mã ứng dụng khác; không merge/deploy.

## Các phát hiện và cách sửa

| Phát hiện trước correction | Hành vi sau correction |
| --- | --- |
| HIGH: lịch sử mặc định READY khi thiếu policy/calendar; chọn policy chỉ theo version number | Dùng resolver OPERATIONAL_START có hiệu lực theo ngày dân sự HCM; thiếu, mơ hồ, hỏng hoặc không có lịch chứa ngày vận hành trả NOT_READY |
| HIGH: có biên nhận nhập lịch sử được coi là đầy đủ minh chứng | ATTENTION_REQUIRED, yêu cầu đối soát bằng phân hệ lịch sử hiện có; không suy số tiết đã dạy từ số dòng tệp |
| HIGH: PPCT đếm môn/plans nên bỏ sót môn–khối có phân công; bỏ qua plan không có version hoặc chỉ còn SUPERSEDED | Kiểm tra khóa môn–khối từ TeachingAssignment; plan thiếu/version chưa ban hành không READY; không coi mọi subject trong catalog là môn cần PPCT |
| HIGH: một association bất kỳ bị coi là đủ và thiếu association bị mặc định CORE | Chỉ READY khi có kế hoạch ban hành và bằng chứng liên kết duy nhất, đúng môn–khối, phủ phân công. Liên kết phức tạp/chưa đủ căn cứ trả NOT_ASSESSED và dẫn về đánh giá TKB theo ngày |
| HIGH: GDĐP có master đủ ba khối nhưng thiếu plan vẫn READY; HĐTN chỉ cần một plan published | Mỗi master phải có plan; kiểm tra riêng các khối GDĐP 10/11/12. Có bản nháp trả ATTENTION_REQUIRED; thiếu hoặc chỉ còn SUPERSEDED trả NOT_READY. Bước ban hành không hoàn thành chỉ vì một master đã publish |
| MEDIUM: year ID sai âm thầm đổi sang năm học khác | HTTP 404 cho ID được truyền rõ ràng nhưng không tồn tại, kể cả khi chưa có năm học; chỉ mặc định khi bỏ ID |
| HIGH: TKB ACTIVE + slots + calendar được coi là READY toàn diện | NOT_ASSESSED kèm hướng dẫn dùng evaluator hiện có theo phiên bản/khoảng ngày. Không tạo evaluator hoặc nguồn sự thật thứ hai |

READY hợp lệ vẫn được kiểm thử cho lịch sử vận hành từ ngày đầu năm học với policy/lịch hợp lệ; PPCT ban hành đủ phạm vi và liên kết; GDĐP đủ ba khối; HĐTN có kế hoạch ban hành đầy đủ. Trạng thái programme SUPERSEDED hiển thị “Đã thay thế”, không gọi nhầm là bản nháp.

Schema hiện giới hạn một master HĐTN-HN/năm học. PostgreSQL fixtures giữ ràng buộc này; unit test bổ sung nhiều master là kiểm tra phòng vệ của phép tổng hợp, không thay đổi mô hình miền.

## Kiểm chứng local

| Lệnh/phạm vi | Kết quả |
| --- | --- |
| `npm.cmd run lint` | PASS toàn workspace |
| `npm.cmd run typecheck` | PASS toàn workspace |
| Kiểm tra cuối `npm.cmd run lint -w apps/api` và `tsc --project apps/api/tsconfig.test.json --noEmit` | PASS, gồm mã test PostgreSQL bổ sung |
| `npm.cmd run test:unit -w apps/api -- --runInBand` | PASS: 104 suites, 1.968 tests, gồm các hồi quy domain hiện có |
| `npm.cmd run test:unit -w apps/web` | PASS: 38 files, 588 tests |
| Unit service/controller data-readiness bằng `--runTestsByPath` | PASS: 46 tests |
| HTTP integration data-readiness bằng `--runTestsByPath test/data-readiness/data-readiness.http.integration.spec.ts` | PASS: 11 tests; controller + service + resolver policy thật, persistence adapter/session guard được mock rõ ràng |
| Lượt cuối service/controller/HTTP sau các chỉnh sửa | PASS: 3 suites, 57 tests; bằng chứng JSON tại `.local-evidence/p5-055-ready-correction-tests.json` |
| PostgreSQL `data-readiness.integration.spec.ts` | BLOCKED: safety guard từ chối TEST_DATABASE_URL chưa được xác nhận là test DB cô lập. Đã bổ sung negative/positive fixtures và typecheck; chưa có bằng chứng thực thi PostgreSQL cho correction |

Lượt gọi đầu qua npm với hai `--testPathPattern` bị Jest gộp phạm vi, chạy thêm các suite integration ngoài dự kiến và FAIL với lỗi cleanup FK cùng safety rejection. Không tính lượt đó là PASS, không sửa các suite ngoài phạm vi, không bật cờ bỏ qua chốt DB. Sau đó chuyển sang đường dẫn tệp chính xác. Hai fixture HTTP dùng year ID không phải UUID đã được sửa; lượt cuối 11/11 PASS.

## GitHub và các chốt còn vướng

CI cũ của HEAD `5d00da1…`: [CI #822](https://github.com/hvtnguyenson-code/baogiang-damsan/actions/runs/39943554907) và [P6-021 #69](https://github.com/hvtnguyenson-code/baogiang-damsan/actions/runs/39943555257) SUCCESS. Đây là bằng chứng baseline, **không chứng nhận các sửa đổi local**.

- `git fetch origin` bị chặn ghi `.git/FETCH_HEAD`; đã đối chiếu remote trực tiếp thay thế cho bước đọc SHA.
- `git add` bị chặn tạo `.git/index.lock` với `Permission denied`; index không có file staged. Phiên này không thể tạo một commit/push theo yêu cầu. Không dùng connector để tạo commit từ xa thay cho workspace.
- Cần thực thi PostgreSQL tests trong môi trường test được xác nhận trước khi kết luận đủ checks; sau đó stage đúng file, kiểm tra diff, một commit và một push lên branch hiện có. Không đổi branch, không merge/deploy.
- Task register, current status và T54 phản ánh correction IN_PROGRESS; không tuyên bố CLOSED hoặc review-ready. Product baseline không đổi vì không có quyết định nghiệp vụ mới.

`git diff --check` sạch; đã xem diff mã, tests và tài liệu. Hai tệp mới cần stage cùng các tệp sửa: HTTP integration và báo cáo này. HEAD remote cuối lượt vẫn là `5d00da1e2cebd8e99dab46d3278fd61bca12de52`.

## PostgreSQL real integration evidence 2026-10-23
- Dedicated local PostgreSQL 17.10 at 127.0.0.1:55432, isolated database baogiang_p5055_test.
- Canonical Prisma migrations: 29 of 29 applied successfully.
- Corrected fixture to honor calendar activation, immutable published policy, and retained programme-plan constraints.
- Exact PostgreSQL integration: one suite PASS; 11 tests PASS; zero FAIL, zero SKIP.
- Test-only Prisma connection_limit=1 and connect_timeout=20 avoided intermittent Windows client disconnect. No production pool changes.
- Shared PostgreSQL port 5432, production database and VPS were not used.

## Phụ lục hậu merge — SYNC-P5-055 (27/10/2026)

Các dòng **IN_PROGRESS**, chặn `.git/index.lock` và pending PostgreSQL trong phần trước phản ánh **thời điểm chạy kiểm thử ngày 23/10**, không còn là trạng thái Git hiện tại. Bản correction `006d1e23a06e0a5764bc7087f6e13aa4465ce3e7` sau đó đã được push lên nhánh, ghép cùng final PR HEAD `a5efc02735cdf9101ad14e007c448493bac75bc8`, PR #248 merge tại `6f1e83a8f021db1ab23f9902981a6b32f36d65ab` (23/10/2026). CI #824, P6-021 #71, main CI #825, auto-deploy #23 và VPS deploy #20 đều SUCCESS; Deploy VPS #20 ghi `BAOGIANG_DEPLOY_VERIFIED` đúng merge SHA. Kiểm thử PG17 cô lập 11/11 PASS đã được ghi ở phần trước.

Review hồi cứu của ChatGPT được ghi trên PR #248 dạng **COMMENT** `5661587622` ngày 27/10; không giả định có formal reviewer độc lập `APPROVE`. Parent PR có chỉnh job timeout của `.github/workflows/ci.yml` từ 20 lên 35 phút, cần phân biệt với các giới hạn correction không sửa CI/CD đã ghi trong phần trước. Các giới hạn TKB theo ngày, lịch sử nhập liệu và phạm vi UAT P5-057 vẫn còn nguyên.

**Tình trạng thực tế:** P5-055 được đóng bằng `SYNC-P5-055` riêng theo protocol; xem [hồ sơ closure](SYNC-P5-055-CLOSURE.md). Phụ lục này bổ sung sự kiện sau checkpoint, không sửa lại lịch sử kiểm thử hay mở rộng tính năng.
