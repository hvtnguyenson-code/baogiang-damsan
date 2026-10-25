# P5-058 — Báo cáo lát cắt 7: mười module cuối

Ngày 25/10/2026. **P5-058 / T57 IN_PROGRESS**, dependencies P5-050/P5-052/P5-053 CLOSED. Tiếp tục phiên mất kết nối trên nhánh `feat/p5-058-frontend-vietnamese-ux`; giữ nguyên 15 modified source/tests và hai test mới từ bàn giao. Không viết lại, reset, stash hoặc checkout.

## Baseline và GitHub

- Local HEAD và remote PR head: `96d5c0e13f1153f57240fbd49d85f28f296b6e63`; task divergence 0/0; `origin/main...HEAD` 0/8. Main đọc trực tiếp `git ls-remote` và GitHub: `ea80f078c8a1297c562c8f4319540e3417d6e651`.
- `git fetch origin main` bị sandbox chặn ghi `.git/FETCH_HEAD`; không dùng SHA trong tài liệu thay Git remote. Không stage/commit/push hoặc dùng connector mutation để vượt giới hạn `.git`.
- [PR #249](https://github.com/hvtnguyenson-code/baogiang-damsan/pull/249) được connector xác minh **OPEN / DRAFT / chưa merge**, đúng nhánh và HEAD. Body PR vẫn mô tả checkpoint đầu; điều phối viên cần cập nhật khi xuất bản checkpoint này.
- [CI #835 / run 40094916238](https://github.com/hvtnguyenson-code/baogiang-damsan/actions/runs/40094916238) cho baseline **FAILURE**. Đã lấy toàn bộ log job `120875032858` và đối chiếu các bước: lint/typecheck/API+Web unit/integration/build PASS; Playwright **41 PASS / 1 FAIL**. Failure duy nhất là `ui-foundation.spec.ts:69` assert `API` sau khi giao diện đổi thành “Dịch vụ ứng dụng”. Job Windows deployment contract PASS. Không rerun CI, không sửa workflow. Đây là CI baseline, chưa có CI cho working tree mới.

## Phạm vi đã hoàn thiện

Đọc AGENTS.md, DESIGN.md, skill damsan-ui, yêu cầu/audit P5-058, governance và execution/closure protocol; đối chiếu diff trước khi sửa tiếp. Đọc toàn bộ mười module cuối, API client/contract liên quan và hai importer HĐTN/GDĐP ở chế độ đối chiếu mã finding; không sửa backend.

| Module | Thay đổi và invariant |
| --- | --- |
| AccessDeniedPage | Bỏ khẳng định phiên còn hiệu lực khi chưa xác minh; giữ hướng dẫn liên hệ nhà trường và hai liên kết phục hồi |
| DispositionPreviewPanel | Giữ Error/ApiError cho feedback HTTP; bốn reason đã xác minh có nhãn hữu hạn, unknown an toàn; phân biệt danh sách giáo viên rỗng; loading còn tên hành động; giữ note/request marker/preview payload và preview-only |
| DutyAssignmentsPage | Lookup hiện hữu có thông báo tải/lỗi; thiếu tên nhân sự/loại/tổ không dùng UUID; future không bị gọi đã kết thúc. Giữ quyền, điều kiện create/edit/end, filter, sparse patch và null note |
| DutyCatalogPage | isActive hiện “Đang hoạt động”, phân biệt cửa sổ hiệu lực; giữ form, sparse patch/no-op, confirmation, disable và lịch sử |
| FirstPasswordChangePage | Hướng dẫn 403 rõ ràng; giữ validation từng trường, policy mật khẩu, expired-session reconciliation và logout |
| LoginPage | Hướng dẫn 403 liên hệ quản trị; giữ lỗi đăng nhập chung, xóa mật khẩu, intended path, auth/session và routing |
| NotFoundPage | Nhắc kiểm tra đường dẫn hoặc chọn chức năng trong không gian làm việc; liên kết thật, không thêm route |
| OperationalHistoryPanel | Lỗi HTTP không hiện empty giả; unknown không giả REVERSED, own-property lookup loại xử lý; hướng dẫn lý do tối thiểu 5 ký tự; giữ scope, giới hạn 50, CAS/requestKey và xác nhận hoàn tác |
| PpctSpecializedStudyPage | HTTP an toàn, giữ nháp; giữ xử lý week-split/stale/refetch/CAS. Nhãn chính khóa/ban hành; lịch sử dùng số phiên bản từ dữ liệu sẵn có, thiếu số nói chưa tra cứu được; unknown không giả chuyên đề/ban hành |
| SpecialProgrammeWorkspacePage | Không render Error.message/finding.message; mapping 46 code public từ hai importer, giữ severity/dòng/canConfirm và fallback own-property. Giải thích viết tắt, không dùng UUID hoặc thứ tự hàng thay số tiết. Form GDĐP/danh sách chương trình co theo mobile, nút chọn chi tiết >=44px. Giữ mọi command ID/revision/grade/preview invalidation/publish/materialize/lifecycle |

Wireframe giữ bố cục đã có: desktop tiêu đề → phạm vi → dữ liệu/bằng chứng → hành động/xác nhận → lịch sử; auth hướng dẫn trái/form phải. Mobile một cột, bảng cuộn nội bộ. Không đổi token, font, primitive hoặc DESIGN.md.

## Chẩn đoán và sửa kiểm thử

Hai log bàn giao được đọc trước sửa: `.tmp-p5-058-s7-target-final.log` (115/116), `.tmp-p5-058-s7-e2e-final.log` (9/10). Không xóa log lỗi.

- Auth unit từng nhận heading rồi phần tử bị tháo do chuyển route. Fixture cũ trả first-login auth từ lần GET thứ hai dù POST đăng nhập chưa xảy ra; đổi fixture theo cờ POST thành công, assert chỉ `/auth/me` được gọi ở nhánh đọc. Assertion kết quả dùng `waitFor` truy vấn DOM hiện hành, kiểm cả trường mật khẩu hiện tại, không còn nút đăng nhập và `/me` được gọi lại. Không đổi auth runtime hoặc tăng timeout.
- Public status smoke có hai nhãn lỗi thời: `API` trong CI và “Không thể kết nối” ở log local. Assert heading “Dịch vụ ứng dụng”, “Cơ sở dữ liệu”; sau abort assert cảnh báo đúng nghĩa, nút “Thử lại”, hai thành phần “Chưa xác nhận” và không thành phần “Sẵn sàng”. Không bỏ kiểm tra lỗi hoặc nới timeout.
- Lượt toàn Web đầu: **740 PASS / 2 FAIL / 742**, 45 file, 357,72 giây. Một failure do assertion tiêu đề `&` cũ trong `special-programme-capability-routing.test.tsx`; cập nhật cả assertion cho phép và từ chối sang “và”, giữ nguyên capability/scope. Failure phân trang quyền chờ initial heading quá 1 giây khi lint/typecheck chạy cùng; không sửa trang/test quyền, không tăng timeout. Bộ mục tiêu chạy riêng sau đó đạt 143/143, gồm toàn bộ kiểm tra phân trang.
- Lượt Playwright nhóm đầu: **34 PASS / 1 FAIL / 35**, 6,7 phút, `.tmp-p5-058-s7-e2e-verified.log`. Ca public status đã qua cảnh báo/nút retry nhưng locator exact text không khớp huy hiệu có ký hiệu `!`. Đối chiếu error-context xác nhận cả hai thành phần thật đều “Chưa xác nhận”; sửa assertion trên chính hai `.status-cue` với nhãn kết thúc tương ứng và assert toàn vùng không chứa “Sẵn sàng”. Không bỏ kiểm tra trạng thái hoặc tăng timeout. Chạy trực tiếp `specs/ui-foundation.spec.ts:65` sau sửa **1/1 PASS**, exit 0, 9,9 giây; `.tmp-p5-058-s7-health-smoke-verified.log`.

## Kiểm chứng local cuối

| Kiểm tra | Kết quả / log |
| --- | --- |
| Unit mục tiêu ban đầu | **116/116 PASS**, 7 file, 64,99 giây; `.tmp-p5-058-s7-target-verified.log`, exit 0 |
| Unit mục tiêu cuối | **143/143 PASS**, 9 file, 67,57 giây; `.tmp-p5-058-s7-target-final-verified.log`, exit 0 |
| Unit PPCT sau chỉnh font cuối | **36/36 PASS**, 1 file, 19,15 giây, exit 0; `.tmp-p5-058-s7-ppct-final.log` |
| Toàn Web unit | **742/742 PASS**, 45/45 file, 266,95 giây, exit 0; `.tmp-p5-058-s7-unit-final-verified.log`; `--maxWorkers=2 --minWorkers=1`, không tăng timeout; chạy riêng |
| Lint toàn repository | **PASS**, exit 0; `.tmp-p5-058-s7-lint.log` |
| Typecheck toàn repository | **PASS**, exit 0; `.tmp-p5-058-s7-typecheck.log` |
| UI static/PWA | **PASS**, exit 0; `.tmp-p5-058-s7-static.log` |
| Web lint / typecheck / UI static cuối | **PASS**, exit 0; `.tmp-p5-058-s7-web-lint-final.log`, `.tmp-p5-058-s7-web-typecheck-final.log`, `.tmp-p5-058-s7-static-final.log` |
| Playwright Chromium | **35 ca khác nhau đều có lượt PASS**: 34 PASS ở bộ 35 ca đầu; ca public status được sửa và chạy lại 1/1 PASS. Nhóm cuối **12/12 PASS**, 2,1 phút, exit 0; `.tmp-p5-058-s7-e2e-final-verified.log`. Không tuyên bố một lượt 35/35; chạy file trực tiếp, không grep phức tạp |
| Diff / staging / phạm vi | **PASS** `git diff --check`; staged list rỗng; đúng 10 module sản phẩm, không file thuộc bề mặt cấm |

25 unit mới so với baseline gồm preview/history/inspect × HTTP 401/403/404/409/500, auth 403, missing lookup/future và PPCT mutation/unknown. Unit hiện hữu giữ exact payload/date/expectedLatestAssociationId/requestKey/revision, network retry command reuse và command isolation. Assertion lỗi dùng toàn `textContent` để không bỏ sót dữ liệu trong vùng đóng mặc định.

Playwright local dùng API route mocks cho nhóm P5-058 và health-only fixture từ phiên trước cho public status smoke; chỉ Vite/fixture của phiên này được chạy local. Không giả danh E2E backend thật hoặc production readiness. Các ca mới kiểm loading khác empty, HTTP 401/403/404/409/500, thiếu grant trên bốn route, finding known/unknown giữ severity/dòng, no automatic POST retry, auth keyboard/focus, reduced motion, axe và viewport 320/375/414/1366/1440. Thêm danh sách chương trình có dữ liệu để kiểm cột mobile và nút chi tiết >=44px.

Đã xem trực tiếp ảnh review chương trình 320, PPCT 1366, GDĐP 375, đổi mật khẩu 414, kiêm nhiệm 414, từ chối quyền 320 và panel điều hành. Mẫu ảnh đọc rõ chữ Việt, focus có viền, không tràn trang; review có dữ liệu không vượt 320px và nút chi tiết đủ kích thước. Panel điều hành vẫn dày các nhóm biểu mẫu như baseline, không thiết kế lại trong lát cắt này. Các nút chọn tệp và placeholder ngày là native browser nên ảnh Chromium tiếng Anh có “Choose File”/`mm/dd/yyyy`; nhãn/hướng dẫn sản phẩm vẫn tiếng Việt. Chưa coi đây là Android thật hoặc bằng chứng mọi ngôn ngữ hệ điều hành.

Rà soát font cuối bỏ lớp `technical-value` khỏi nhãn số phiên bản PPCT vừa Việt hóa để dùng font sản phẩm theo DESIGN.md; không đổi dữ liệu hoặc hành vi. Lượt toàn Web 742/742 ở trên chạy trước chỉnh lớp font đơn lẻ này; unit PPCT và kiểm tra Web cuối được ghi bổ sung bên dưới.

Lượt browser cuối chạy `specs/p5-058-final-slice.spec.ts specs/ui-foundation.spec.ts:65 --output test-results/p5-058-s7-final-output`; cả 11 ca lát cắt 7 và ca public status đều PASS. Có **46 ảnh** tại `tests/e2e/test-results/p5-058-slice7`, thêm hai ảnh trạng thái tại `tests/e2e/test-results/ui-foundation`; chỉ là artifact local, không commit. Axe không có serious/critical trên sáu trang và hai form auth trong các trạng thái mock đã chạy. Ảnh public status lỗi cuối đã được xem trực tiếp: cả hai thành phần chưa xác nhận, không hiện dữ liệu chi tiết cũ hay nhãn sẵn sàng.

## Đồng bộ và giới hạn nghiệm thu

Đã cập nhật các dòng thật của mười module trong audit, current status, task register, T57, requirement và báo cáo này. **35/35 module có bằng chứng audit mã qua các lát cắt**, 25 mục navigation đã đối chiếu; ba module lát cắt 2 dùng bằng chứng lịch sử, không tuyên bố đọc lại ở lát cắt 7. Các số module còn ở phần lịch sử giữ nguyên theo thời điểm, cập nhật mới có ngày rõ ràng.

P5-058 giữ **IN_PROGRESS**, PR Draft theo chỉ thị. Product baseline/ADR/T51/T52/README/roadmap/project context không đổi vì không đổi authority hoặc claim nghiệp vụ. Không có API/backend/DB/migration/auth/RBAC/route/CI/CD/VPS/nội trú thay đổi.

Nghiệm thu A/C/D vẫn cần toàn persona với dữ liệu thật, Android thật/zoom 200%, lịch/bảng dày, các command nhạy cảm qua backend thật và race/refetch thực tế. Lookup giới hạn 100, lịch sử giới hạn 50 và bản dịch exact code không được suy thành coverage dữ liệu vô hạn hoặc finding mới. Các giới hạn chi tiết ở audit lát cắt 3–6 vẫn thuộc P5-058, không tạo orphan deferral. Chưa có CI exact-head cho checkpoint mới hoặc independent GitHub review; local PASS không phải quyền đóng task.

## Bàn giao

Không merge/deploy, không stage/commit/push. Điều phối viên cần xem complete diff, commit checkpoint trên đúng nhánh/PR hiện hữu, cập nhật PR body, chạy CI và review độc lập. Commit gợi ý: `feat(web): finish Vietnamese page audit (P5-058 slice 7)`.

Đã dừng đúng hai phiên Vite và health-only fixture do phiên này khởi chạy bằng Ctrl+C qua session riêng, không dùng kill-all hoặc chạm dịch vụ khác. Đã xác minh đường dẫn tuyệt đối root và không có helper tracked, rồi chỉ xóa **11 helper root** khớp `.tmp-p5-058-*.py` / `.tmp-p5-058-health.cjs`; không xóa đệ quy, file dự án hoặc log. Không còn helper khớp mẫu sau dọn.

Tập bàn giao: **25 file** gồm 10 module trang/panel, 7 unit (6 hiện hữu + 1 mới), 2 Playwright (1 hiện hữu + 1 mới) và 6 docs. HEAD/remote main/remote task đọc lại không đổi, staged list rỗng; không stage/commit/push/merge/deploy. Không còn failure local chưa xử lý; xuất bản checkpoint, CI exact-head và independent review vẫn do điều phối viên thực hiện theo gate.
