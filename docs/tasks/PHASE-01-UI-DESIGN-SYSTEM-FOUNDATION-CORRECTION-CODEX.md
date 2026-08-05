# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-UI-DESIGN-SYSTEM-FOUNDATION-CORRECTION-001`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `phase/01-ui-design-system-foundation`  
Reviewed implementation HEAD: `54b117107d7260322ae896b44862b34eec11d7b4`  
Base của task gốc: `f979264539bc5c55e47281f39e247d43b40991e6`

## Mục tiêu

Sửa toàn bộ findings từ review độc lập của UI foundation trước khi tạo PR. Giữ nguyên hướng “Sổ công tác Đam San”, auth/session/authorization backend và toàn bộ phạm vi đã hoàn thành. Không redesign lại từ đầu và không mở rộng sang CRUD/nghiệp vụ.

## Findings bắt buộc sửa

### 1. Logout không được tạo trạng thái “đăng xuất giả”

Hiện `AuthProvider.logout()` xóa toàn bộ query trong `finally`, kể cả khi request logout thất bại do mất mạng hoặc 5xx. Khi đó cookie/session phía server có thể vẫn còn hiệu lực nhưng UI lại đưa người dùng về login. Đây là lỗi correctness và đặc biệt nguy hiểm trên máy dùng chung.

Yêu cầu:

- Chỉ xóa auth/query data sau logout thành công.
- Nếu logout trả 401 vì session đã vô hiệu thì coi là đã logout và xóa state.
- Nếu lỗi mạng, timeout hoặc 5xx: giữ trạng thái authenticated/first-login hiện tại; không redirect về login; không nuốt lỗi; không tạo unhandled promise rejection.
- App shell và first-login page phải hiển thị lỗi logout dạng accessible, ngắn, có action thử lại hoặc cho phép tiếp tục làm việc.
- Không hiển thị raw backend response, cookie, token hoặc request body.
- Dùng một abstraction/logout action chung để tránh hai chỗ xử lý lệch nhau.

### 2. Login validation và phân loại lỗi phải đúng

Hiện login có `required` nhưng dùng `noValidate`, không có client validation; submit rỗng dẫn tới backend 400 và mọi non-401 lại bị hiển thị như lỗi kết nối.

Yêu cầu:

- Username và password bắt buộc; validation phải hoạt động trước mutation bằng native validation hoặc project-owned field validation nhất quán.
- Có field error programmatic (`aria-invalid`, `aria-describedby`) và summary/focus phù hợp; focus tới summary hoặc field đầu tiên theo một policy rõ, test được.
- Không gọi API khi các trường bắt buộc rỗng.
- 401 vẫn luôn là thông báo generic, không dò username.
- 400/422 do dữ liệu form phải được mô tả là thông tin chưa hợp lệ, không phải mất kết nối.
- Network (`statusCode=0`) và 5xx phải có copy recovery riêng.
- Khi người dùng sửa field, lỗi stale phải được xóa hoặc cập nhật hợp lý.
- Password vẫn được xóa sau failed authentication và không bị log/echo.

### 3. First-password-change phải phản ánh đầy đủ failure path

- Giữ policy hiện có: ít nhất 12 ký tự, chữ thường, chữ hoa, chữ số.
- Bổ sung client check mật khẩu mới phải khác mật khẩu hiện tại, vì backend đã enforce điều này.
- Required errors cho cả ba field; lỗi stale được xóa/cập nhật khi sửa.
- 401 map thành mật khẩu hiện tại không đúng.
- 400 do policy/same-password phải có thông báo an toàn, đúng loại; không gọi là lỗi kết nối và không render raw response tùy ý.
- Lỗi mạng/5xx giữ form ở trang hiện tại, có recovery, không mất session.
- Sau success vẫn invalidate/refetch `/me` và vào workspace như correction trước.

### 4. Mobile touch target phải đạt tối thiểu 44 px

CSS hiện hạ `.session-context .button` xuống `min-height: 36px` ở mobile, trái với `DESIGN.md` và work packet.

Yêu cầu:

- Mọi button/link điều hướng có thể chạm ở 320/375/414 px phải có hit target tối thiểu 44×44 px hoặc chiều cao ≥44 px với chiều rộng nội dung hợp lý.
- Không làm header mobile vỡ; có thể điều chỉnh layout, wrapping, spacing, label, nhưng không dùng icon-only logout nếu không cần.
- Thêm Playwright/computed-style assertion cho logout và các primary actions ở mobile.
- Thêm overflow assertion `document.documentElement.scrollWidth <= window.innerWidth` cho login, first-change và workspace ở 320, 375, 414 px.

### 5. Loại thuật ngữ kỹ thuật khỏi copy người dùng

UI hiện hiển thị `Cookie HttpOnly`, `capability`, và `PostgreSQL`. Đây là thuật ngữ implementation không phù hợp giáo viên/cán bộ quản lý và mâu thuẫn với content voice task-oriented.

Yêu cầu:

- Auth context ledger dùng tiếng Việt nghiệp vụ, ví dụ “Phiên đăng nhập được bảo vệ”, “Quyền theo phạm vi được giao”; không nhắc Cookie/HttpOnly/capability.
- Workspace không hiển thị từ `capability`; diễn đạt “Quyền được kiểm tra theo phạm vi được giao” hoặc tương đương.
- Public system status không công bố engine `PostgreSQL`; dùng “Kết nối dữ liệu” hoặc tương đương.
- Không thay bằng role labels, không bịa nghiệp vụ hoặc trạng thái.
- Bổ sung test/static assertion rằng production UI source/rendered text không chứa các thuật ngữ trên, ngoại trừ docs/code comments nơi hợp lý.

### 6. Font tiếng Việt phải không fallback ngầm

`IBM Plex Mono` đang import subset `latin` nhưng được áp cho utility labels/dt chứa tiếng Việt có dấu. Không được tuyên bố glyph ổn định nếu browser phải fallback từng glyph.

Yêu cầu:

- Kiểm tra package thực tế đã cài.
- Nếu có subset Vietnamese phù hợp: import đúng subset/weights cần dùng.
- Nếu không có subset phù hợp: dùng Be Vietnam Pro cho mọi nhãn tiếng Việt và chỉ dùng IBM Plex Mono cho ASCII code, version, thời gian/số liệu mà nó thực sự bao phủ.
- Không thêm CDN hoặc font thứ ba.
- Cập nhật `DESIGN.md`, source/license record hoặc report nếu implementation thực tế thay đổi.
- Screenshot critique phải kiểm tra đặc biệt utility labels có dấu tiếng Việt.

## Audit phạm vi liên quan

Trước khi sửa, đọc ít nhất:

- `DESIGN.md`
- `.codex/skills/damsan-ui/SKILL.md`
- task gốc và phase report
- `apps/web/src/auth/auth-context.tsx`
- `apps/web/src/auth/route-guards.tsx`
- `apps/web/src/lib/api-client.ts`
- login/first-password/app shell/workspace/system-status pages
- UI primitives và CSS
- web unit tests, Playwright UI spec, static UI checker và CI.

Audit các downstream assumption quanh logout, error state, query cache, route redirect và mutation concurrency; không chỉ patch từng dòng được nêu.

## Tests bắt buộc

### Unit

- Blank username/password: không gọi login API; field/summary accessible.
- Login 400 không bị mô tả là network failure.
- Login 401 generic và password bị xóa.
- Login network/5xx có recovery copy đúng.
- Password change required/policy/confirm/new-equals-current không gọi mutation.
- Password change 401/400/network/5xx phân loại đúng, không lộ raw response.
- Logout success xóa auth state.
- Logout 401 xóa auth state.
- Logout network/5xx giữ authenticated state, hiện lỗi và không có unhandled rejection.
- App shell và first-login logout dùng cùng policy.
- Rendered copy không chứa `Cookie HttpOnly`, `capability`, `PostgreSQL`.

### Playwright/E2E

Giữ toàn bộ flow hiện có và thêm:

- login blank validation;
- logout request bị abort/5xx: workspace/first-login không redirect giả, lỗi visible, retry/success hoạt động;
- viewport 320, 375, 414: no horizontal overflow cho login, first-change, workspace;
- computed target logout, primary submit và navigation ≥44 px;
- axe critical/serious vẫn bằng 0;
- screenshots vẫn đủ 9 ảnh deterministic và được review lại.

Không tạo production debug endpoint hoặc dùng official DB.

## Quality gates

Chạy lại toàn bộ gates của work packet gốc:

- Prisma validate/generate;
- schema static, migrations fresh/legacy;
- secret scan;
- UI static gate;
- lint, typecheck, API/web unit, PostgreSQL integration;
- build toàn repository;
- Playwright API/UI/axe;
- screenshot artifact;
- `git diff --check`;
- staged file/secret/license inspection.

Final-head CI phải xanh.

## Phạm vi cấm

- Không sửa `apps/api/src/**`, Prisma schema/migration/seed hoặc authorization semantics.
- Không thêm CRUD, role selector, business data, AI, deployment/CD.
- Không truy cập VPS hoặc database chính thức.
- Không reset, clean, stash, rebase, amend, squash hoặc force-push.
- Không tạo PR, không merge, không deploy.

## Commit/push/report

- Commit correction theo lát hợp lý và push cùng branch.
- Cập nhật phase report bằng findings, cách sửa, test counts, final CI run và artifact ID mới.
- Báo final HEAD, divergence, working tree và xác nhận phạm vi.
- Dừng sau push.