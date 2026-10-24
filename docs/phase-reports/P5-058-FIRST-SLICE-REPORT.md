# P5-058 — Báo cáo lát cắt frontend đầu tiên

Ngày thực thi: 24/10/2026. Trạng thái task: **IN_PROGRESS**, theo chỉ thị người dùng; chưa đề nghị đóng task hoặc nghiệm thu toàn bộ frontend.

## Baseline và phạm vi

- Nhánh duy nhất: `feat/p5-058-frontend-vietnamese-ux`.
- HEAD lúc bắt đầu: `6f1e83a8f021db1ab23f9902981a6b32f36d65ab`; GitHub `main` được xác minh trực tiếp bằng `git ls-remote origin refs/heads/main`, khớp SHA này. Local `HEAD...origin/main`: 0/0. Fetch bị từ chối ghi `.git/FETCH_HEAD`; không suy canonical SHA từ tài liệu.
- Dependencies `P5-050`, `P5-052`, `P5-053` đều CLOSED; T57 là authority chính, giữ nguyên T51/T52.
- Ba tài liệu có sẵn lúc bắt đầu được bảo toàn và bổ sung trong phạm vi task: đăng ký P5-058, traceability T57, yêu cầu P5-058. Sửa lỗi cấu trúc đăng ký: hàng P5-058 bị chèn lặp giữa hàng P5-056; giữ đúng một hàng P5-058 và khôi phục hàng P5-056 theo HEAD.
- Chỉ frontend, kiểm thử UI và tài liệu task; không backend/API/auth/schema/CI/CD/VPS. Không merge/deploy.

## Thay đổi và giới hạn

1. `ErrorFeedback` trình bày lỗi tiếng Việt dựa vào HTTP status, không hiển thị message/serverError/requestId từ backend. `QueryFailure`, `MutationNotice`, Data Readiness dùng lại. 401 có liên kết đăng nhập, 403 về công việc, 404/409 có tải lại, lỗi query thông thường có thử lại. Không tự gửi lại mutation hoặc coi nội dung phản hồi là quyền/trạng thái thành công. Tải lại toàn trang là hành động chủ động và có thể làm mất biểu mẫu chưa lưu.
2. TKB giữ đối tượng lỗi, tránh làm mất status khi chuyển lỗi thành chuỗi rồi bọc Error. EmptyState nhận hành động thật; phiên bản TKB rỗng mở được luồng nhập hiện hữu.
3. CTA TKB tại Data Readiness dẫn thẳng `?tab=import`; query điều khiển tab, giữ tham số khác và hỗ trợ refresh/Back. Mặc định hoặc query tab lạ mở phiên bản. Không sửa route/capability guard; chỉ `TIMETABLE_MANAGE / SCHOOL_WIDE` được vào. Quyền đọc Data Readiness không cấp thêm quyền nhập.
4. Đồng bộ register/status/traceability/yêu cầu, giữ `IN_PROGRESS`. Baseline sản phẩm/ADR/README/roadmap không thay vì không đổi authority hay tuyên bố hoàn thành sản phẩm.

## Bằng chứng kiểm tra

- `npm.cmd run lint -w apps/web`: PASS.
- `npm.cmd run typecheck -w apps/web`: PASS cả kiểm tra đầu và kiểm tra cuối; lint cuối cũng PASS.
- Nhóm mục tiêu ban đầu: 5 file, 76/76 PASS (`vietnamese-feedback`, `timetable-admin-page`, `data-readiness-page`, `data-readiness-navigation`, `api-client`). Sau bổ sung test mutation 403/409 và điều hướng từ readiness: TKB + Data Readiness 43/43 PASS. Bao gồm refresh/remount, Back, tab mặc định/lạ, query khác, quyền school-wide, không có grant nhập, giữ biểu mẫu sau lỗi và chỉ một lần POST, không lộ technical content hay suy READY từ lỗi.
- `npm.cmd run test:ui:static`: PASS (UI foundation + PWA baseline).
- `npm.cmd run test:e2e -w tests/e2e -- p5-058-vietnamese-feedback.spec.ts`: 1/1 PASS, trình duyệt Chromium với API mock, không backend. Xác minh F5/Back, keyboard/focus, reduced motion, query retry thực sự phục hồi, 0 request ghi, không lộ raw error, không tràn vùng lỗi; nút thử lại >=44px; axe không có serious/critical violation trên trạng thái lỗi.
- 10 ảnh mock tại `tests/e2e/test-results/p5-058/{import,error}-{320,375,414,1366,1440}.png` (artifact được ignore). Đã xem trực tiếp import/error tại 320 và 1366: chữ lỗi rõ, thao tác dùng được, bố cục một cột trên điện thoại. Đây không phải ảnh dữ liệu production hoặc nghiệm thu mọi persona.
- Chạy toàn bộ Web lần đầu: 604/607 PASS; hai kỳ vọng copy cũ được cập nhật trong `capabilities-page` và `academic-structure-pages`, giữ nguyên kiểm tra retry/state. Một lỗi tại auth-flow bước đổi mật khẩu: heading tìm thấy rồi không còn trong DOM; không sửa auth để xử lý lỗi này. Log đầy đủ: `tmp/p5-058-web-unit.log`. Chạy lại toàn bộ với tối đa 2 worker để xác minh sau cập nhật test; ghi kết quả cuối bên dưới.

## Công việc đang tiếp tục thuộc P5-058

Trước review toàn task, hoàn thành phân kỳ A/C/D của yêu cầu trên cùng nhánh: inventory từng trang và điều hướng, glossary theo nghiệp vụ, các nhóm persona, toàn bộ trạng thái error/empty/loading/recovery, kiểm thử và independent review/CI exact-head. Các ảnh hiện có phát hiện tab TKB còn sít nhau và nội dung biểu mẫu còn Native Workbook/Session Mode/Effective Week/Inspect/Preview; đưa vào audit C của P5-058, không mở rộng lát cắt này thành thay thiết kế hoặc importer. Không coi reusable feedback là bằng chứng đã Việt hóa cả 35 trang.

## Kết quả cuối

- Vitest toàn Web với `--maxWorkers=2 --minWorkers=1`: **39 file, 609/609 PASS**, không có test failure/unhandled error; log `tmp/p5-058-web-unit-final.log`. Luồng auth-flow thất bại trong lượt đầu đã PASS ở lượt này, không thay đổi mã auth. Không kết luận nguyên nhân của lần thất bại đầu chỉ từ việc chạy lại thành công.
- Lượt ghi log bằng PowerShell `> ... 2>&1` trả shell exit 1 do stderr bị bọc thành NativeCommandError (React Router warning); phân biệt kết quả shell này với kết quả Vitest 609 PASS. Lượt kiểm tra riêng copy cũng PASS assertion nhưng gặp cảnh báo WebSocket trùng cổng khi hai Vitest chạy đồng thời. Không đổi cấu hình/CI hoặc chiếm cổng hệ thống để xử lý.
- Nhóm mục tiêu cuối chạy trực tiếp, không redirect và không chồng Vitest: **7 file, 106/106 PASS, exit code 0** (`academic-structure-pages`, `capabilities-page`, `vietnamese-feedback`, `timetable-admin-page`, `data-readiness-page`, `data-readiness-navigation`, `api-client`, `--maxWorkers=2 --minWorkers=1`). Bao gồm kỳ vọng xóa thông báo lỗi mới khi mở biểu mẫu khác, không chỉ kỳ vọng xuất hiện thông báo.
- `git diff --check`: PASS. Kiểm tra complete diff và tập file chỉ thuộc task. Mọi thay đổi vẫn được giữ trong working tree trên nhánh được giao; chưa merge/deploy hoặc chứng nhận CI/independent review.
- Sau các kiểm tra, thử stage đúng 15 file thuộc task bằng `git add -- <explicit paths>` bị chặn: `Unable to create 'D:/baogiang-damsan/.git/index.lock': Permission denied`. Không commit/push, không đổi nhánh hoặc tìm cách vượt giới hạn ghi `.git`. HEAD vẫn `6f1e83a8f021db1ab23f9902981a6b32f36d65ab`; trạng thái P5-058 vẫn IN_PROGRESS. Chỉ tiếp tục commit/push checkpoint này khi môi trường cho phép ghi Git và sau kiểm tra diff/staged list; independent review/CI vẫn chưa có.
