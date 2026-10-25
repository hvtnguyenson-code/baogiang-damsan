# P5-058 — Báo cáo lát cắt 5: năm học, lịch, lớp và phân công

Ngày 24/10/2026. P5-058 / T57 **IN_PROGRESS**, dependencies P5-050/P5-052/P5-053 CLOSED. Giữ T51/T52, một nhánh `feat/p5-058-frontend-vietnamese-ux`, [PR #249](https://github.com/hvtnguyenson-code/baogiang-damsan/pull/249) OPEN/DRAFT; chưa nghiệm thu toàn task, chưa merge/deploy.

## Baseline và phạm vi

- Local/remote HEAD bắt đầu `0a96ed07941d1f0cd5ca2d7dd841b4571e8e889b`, working tree sạch; nhánh và remote task 0/0. Main xác minh trực tiếp `git ls-remote` và GitHub PR base: `ea80f078c8a1297c562c8f4319540e3417d6e651`; main/HEAD divergence 0/6. `git fetch origin main` bị chặn ghi `.git/FETCH_HEAD`; không dùng SHA trong docs làm authority thay Git/GitHub.
- GitHub connector xác minh PR #249 vẫn draft với đúng HEAD và CI #833 / run [40082860054](https://github.com/hvtnguyenson-code/baogiang-damsan/actions/runs/40082860054) completed/success. Đây là CI baseline, không phải CI cho working tree mới.
- Đọc AGENTS.md, DESIGN.md, damsan-ui skill, P5-058 requirement/audit, governance/protocol và mã liên quan. Chỉ sửa năm trang được giao, unit/E2E và sáu tài liệu đồng bộ; không backend, service/API, database, auth, route, payload, migration, dependencies, CSS/tokens, CI/CD hoặc hệ thống ngoài dự án.

## Thay đổi

AcademicYears giải thích đúng phạm vi lịch/học kỳ/tuần/lớp và ví dụ mã/tên. AcademicCalendar thay jargon bất biến/ngày dân sự bằng hướng dẫn thao tác, giải thích mỗi lần lưu tạo phiên riêng; lịch không active hiện “Không áp dụng”, tránh khẳng định chưa từng kích hoạt. Lỗi tạo 400 không in thông điệp máy chủ; lời giữ bản nháp chỉ dành cho create, không dành cho template/activate khi không có bản nháp. SchoolClasses xác nhận nêu tên lớp và hệ quả giữ lịch sử.

TeachingAssignments hướng dẫn chọn môn/ngày trước khi chọn giáo viên; nhãn ngắn trên điện thoại kèm giải thích bên ngoài select. HomeroomAssignments Việt hóa trạng thái tài khoản hiện tại bằng mapping tường minh và fallback an toàn, không suy hiệu lực phân công từ trạng thái tài khoản. ACTIVE của bản ghi hiện “Phân công chưa bị đảo” để không nhầm đã có hiệu lực tại ngày hiện tại; quyền và điều kiện hành động vẫn đúng như trước. UUID/timestamp truy vết được giữ trong details đóng mặc định, giờ theo helper business timezone hiện hữu; ghi chú, nguồn và lý do đảo vẫn hiển thị trực tiếp.

Giữ mọi query key/enabled, mutation, invalidate/reset, validate, khoảng hiệu lực, phân loại lịch sử, sparse patch, chuẩn hóa mã, payload, eligibility và authorization predicate. Không thêm xóa, tự retry mutation hoặc thay đổi trạng thái backend. Mã năm/lớp/môn/nhân sự là định danh nghiệp vụ nên vẫn giữ; chỉ lỗi thô và enum kỹ thuật cần trình bày an toàn.

Wireframe/layout giữ nguyên: tiêu đề → năm/phạm vi → thông báo → biểu mẫu → lọc → bảng/phân trang. Mobile một cột, bảng cuộn trong vùng riêng. Không thay font, palette, tokens hoặc primitive.

## Kiểm chứng

| Kiểm tra | Kết quả / bằng chứng local |
| --- | --- |
| Typecheck toàn repository | PASS packages/contracts, packages/config, API và Web; `.tmp-p5-058-typecheck-final.log`. Sau chỉnh guard 400, Web typecheck chạy lại PASS |
| Lint toàn repository | PASS, exit 0; `.tmp-p5-058-lint-full.log`. Web lint cuối chạy lại PASS |
| Unit mục tiêu cuối | **71/71 PASS**, 4 file; `.tmp-p5-058-unit-target-final.log` |
| Unit Web toàn bộ | **677/677 PASS**, 43/43 file, 134,19 giây; `.tmp-p5-058-unit-confirmed.log`; `--maxWorkers=2 --minWorkers=1 --testTimeout=20000`, không chạy E2E đồng thời |
| Playwright mock | **7/7 PASS** gồm 6 smoke mới và 1 smoke academic-structure hiện hữu; `.tmp-p5-058-e2e-verified.log` |
| Static UI/PWA | PASS, chạy lại sau sửa guard 400; UI foundation và PWA baseline |
| Ảnh/accessibility | 25 ảnh slice 5 ở 320/375/414/1366/1440; không tràn ngang trang, reduced motion, Tab/focus form, axe không serious/critical trên cả năm trang; `tests/e2e/test-results/p5-058-slice5` |
| Diff/staging | PASS `git diff --check`; staged list rỗng; đúng 12 file tracked thay đổi + 3 file mới, không stage/commit/push trong sandbox `.git` chỉ đọc |

Unit mới có 15 tổ hợp năm route × 401/403/409; create năm học 409 giữ nháp và đúng một POST với payload chuẩn hóa; bốn trạng thái tài khoản cùng unknown/constructor; create lịch 400 với SQL/host/UUID cố ý và template/activate 400 không giả có bản nháp. Các unit hiện hữu vẫn kiểm tra exact payload, khoảng hiệu lực, phân loại lịch sử, nhiều replacement/chồng lấn, filter, pagination và không có delete. Test sửa chỉ để phản ánh copy mới hoặc tăng coverage, không bỏ assertion nghiệp vụ.

Playwright có HTTP 401 theo session boundary về đăng nhập, 403/409 có hành động phục hồi; không lộ response raw. Năm route phân biệt pending/empty/thiếu grant. Smoke mở form tạo, kết thúc, đổi, hiệu chỉnh, mở/đóng truy vết, create năm học và activate lịch 409 đúng payload và không tự gửi lại. Chưa coi việc mở form là E2E thực thi tất cả mutation.

Lịch sử kiểm tra được giữ: lượt mục tiêu đầu 45 PASS/2 timeout; chạy lại 63/63 với CLI `--testTimeout=20000`, rồi 71/71 sau bổ sung test. Lượt toàn Web đầu 669/669 PASS. Lượt kế tiếp 674 PASS/1 FAIL ở test auth hiện hữu `changes password, refreshes auth, and enters the workspace` (`auth-flow.test.tsx:136`, phần tử rời DOM trước assertion); đọc failure log và mã xung quanh, không sửa auth/test. Auth riêng chạy lại **23/23 PASS**, `.tmp-p5-058-auth-recheck.log`; lượt toàn bộ cuối không chạy E2E đồng thời đạt **677/677**, bao gồm hai test guard 400 bổ sung. Chưa xác định nguyên nhân gốc của lần auth chập chờn; không gọi lần fail đó là đã sửa. Workers luôn bị chặn tối đa hai, tối thiểu một; không sửa cấu hình/test timeout trong repository.

Smoke lần đầu có locator “Giáo viên” trùng bộ lọc với form, và thời gian chờ HTTP 403 chưa đủ cho retry đọc hiện hữu; đã scope locator vào form và chờ tối đa 15 giây, giữ nguyên retry ứng dụng. Không sửa code để vượt test. Root npm wrapper làm mất `--grep` nên lượt đầu “No tests found”; lệnh đúng là `npm.cmd run test:e2e -w tests/e2e -- p5-058-academic-workspaces.spec.ts academic-structure-ui.spec.ts`.

Đã nhìn ảnh năm học 414, lịch 320, lớp 1440, giảng dạy 375, chủ nhiệm 1366. Tiếng Việt và hướng dẫn form đọc rõ, bảng vẫn cuộn ngang. Thanh hành động sticky lịch xuất hiện giữa ảnh full-page khi chụp từ đầu trang; không thay cơ chế sticky hiện hữu, cần nghiệm thu viewport/keyboard dài và zoom 200% trong A/C/D. Các ảnh là Chromium desktop giả lập kích thước Android với API mock, không phải Android thật.

## Đồng bộ và giới hạn

Đồng bộ CURRENT-PROJECT-STATUS, PRE-PILOT-TASK-REGISTER, T57, yêu cầu P5-058, PAGE-LABEL-AUDIT và báo cáo này. **20/35 module đã audit toàn file; 15 module còn cần audit toàn file.** Mọi phần chưa nghiệm thu vẫn thuộc A/C/D P5-058: dữ liệu thật/lịch dày/chuỗi rất dài, tất cả mutation và race qua backend thật, persona đầy đủ, Android thật/zoom 200%. Không tạo orphan deferral hoặc khẳng định toàn frontend đã hoàn tất. Baseline/ADR/README/roadmap/project context không đổi vì không thay authority hay claim nghiệp vụ.

Giữ **IN_PROGRESS** theo chỉ thị vì đây là checkpoint một phần trên PR draft; không chuyển IN_REVIEW toàn task. Không có CI exact-head hoặc independent review cho working tree mới. `.git` chỉ đọc; không thử đường vòng GitHub mutation, không xin ghi vượt sandbox. Điều phối viên kiểm tra diff/staged list, commit một checkpoint scoped rồi push lên đúng nhánh/PR hiện hữu và chờ CI/review độc lập; không tạo nhánh/PR khác, merge hoặc deploy.

Tập bàn giao cuối 15 file: 5 page, 3 unit, 1 Playwright, 6 docs. Commit gợi ý: `feat(web): clarify academic workspace Vietnamese (P5-058 slice 5)`.


Bàn giao cuối: HEAD local/remote vẫn `0a96ed07941d1f0cd5ca2d7dd841b4571e8e889b`; main vẫn `ea80f078c8a1297c562c8f4319540e3417d6e651`, nhánh không đổi. Không commit, push, branch/PR mới, merge/deploy hoặc mutation production. CI mới và independent review vẫn cần sau khi điều phối viên xuất bản checkpoint.

Ghi chú công cụ: PowerShell 5.1 trả exit 1 cho một số lời gọi có stderr được redirect (React act/Future Flag hoặc NO_COLOR warning), ngay cả log test kết thúc toàn PASS. Đã tái hiện riêng bằng Node `console.error` + `process.exit(0)`: wrapper 1, `$LASTEXITCODE=0` khi đọc tường minh. Không che log hoặc đổi assertion; các số PASS ở trên theo summary runner. Typecheck/lint/static có kết quả exit 0 trực tiếp. Lượt full có auth FAIL được ghi riêng phía trên, không nhập nhằng với cảnh báo wrapper.
