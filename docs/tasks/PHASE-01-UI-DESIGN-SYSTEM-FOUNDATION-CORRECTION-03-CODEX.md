# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-UI-DESIGN-SYSTEM-FOUNDATION-CORRECTION-003`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `phase/01-ui-design-system-foundation`  
Reviewed correction HEAD: `3862cf600791a6ce9c8c9b5c3413aa5ddf396f5c`  
Base task gốc: `f979264539bc5c55e47281f39e247d43b40991e6`

## Mục tiêu

Đóng các lỗi auth-state và stale-validation còn sót sau correction-002. Không redesign, không mở rộng nghiệp vụ, không sửa backend/schema/authorization/CI architecture.

## Safety gate

1. Xác minh đúng repository và branch.
2. `git status -sb`; tracked working tree phải sạch.
3. File local `.codex/config.toml` có thể đang untracked do tài khoản Codex khác. **Không đọc nội dung, không sửa, không xóa, không stage, không commit và không đưa vào `.gitignore` trong task này.**
4. Exact HEAD phải chứa `3862cf600791a6ce9c8c9b5c3413aa5ddf396f5c` và packet này.
5. Không reset, clean, stash, rebase, amend, squash hoặc force-push.

## Finding 1 — Password-change 401 + `/auth/me` indeterminate đang bị phân loại sai

Trong `AuthProvider.changePassword()` hiện tại:

- mutation trả 401;
- frontend gọi lại `/auth/me`;
- nếu `/auth/me` network/5xx, lỗi refresh bị nuốt;
- code rethrow 401 ban đầu, làm UI báo “Mật khẩu hiện tại không đúng”.

Điều này trái correction-002 và phase report.

Yêu cầu deterministic:

- change-password 401 + `/auth/me` 200: giữ auth state từ `/me`, rethrow 401 ban đầu để UI báo current-password error.
- change-password 401 + `/auth/me` 401: chuyển anonymous và route về login.
- change-password 401 + `/auth/me` network/status 0 hoặc 5xx: giữ first-login/authenticated state hiện tại và **throw refresh error**, để UI hiển thị đúng recovery copy; không báo sai mật khẩu.
- Không lộ raw backend response.
- Không tạo redirect loop hoặc global unauthorized side effect sai.

## Finding 2 — Logout error bị stale qua auth transition

`logoutError` hiện chỉ được xóa khi bắt đầu logout. Flow E2E đã cố ý tạo logout failure ở first-login rồi tiếp tục đổi mật khẩu; sau success, stale logout alert có thể xuất hiện trong workspace và lọt vào screenshot.

Yêu cầu:

- Xóa `logoutError` khi login thành công.
- Xóa `logoutError` khi change-password thành công và `/me` refresh thành công.
- Xóa `logoutError` khi auth chuyển anonymous do 401/session invalid.
- Logout network/5xx vẫn giữ state và alert cho tới retry hoặc một auth transition hợp lệ.
- Sau failed first-login logout rồi successful password change, workspace không còn alert logout cũ.
- Không dùng effect rộng gây vòng lặp; policy phải rõ và test được.

## Finding 3 — Relational password errors chưa được clear/recompute đúng

Hiện:

- lỗi `newPassword === currentPassword` gắn ở `newPassword`, nhưng sửa `currentPassword` không xóa/cập nhật lỗi đó;
- lỗi confirm mismatch có thể còn stale khi sửa `newPassword`.

Yêu cầu:

- Tạo helper validation/field-error update rõ ràng thay vì các inline handlers khó kiểm soát.
- Sửa current password phải clear/recompute lỗi quan hệ current/new.
- Sửa new password phải clear/recompute lỗi policy, same-password và confirm mismatch liên quan.
- Sửa confirm chỉ clear/recompute confirm error.
- Không gọi mutation khi validation còn lỗi.
- Field error và summary vẫn programmatic/accessibility-correct.

## Tests bắt buộc

### Unit

Bổ sung test riêng, không chỉ đổi tên test cũ:

1. change-password 401 + `/me` 200 → giữ first-login, current-password error.
2. change-password 401 + `/me` 401 → anonymous/login.
3. change-password 401 + `/me` network → giữ first-login, connection recovery copy, không hiển thị current-password error.
4. change-password 401 + `/me` 5xx → giữ first-login, temporary-system copy, không hiển thị current-password error.
5. failed first-login logout → alert; successful password change → workspace và logout alert biến mất.
6. successful login/change-password và global unauthorized transition đều clear stale `logoutError` đúng policy.
7. same-password error biến mất/cập nhật khi current password đổi.
8. confirm mismatch biến mất/cập nhật khi new/confirm password đổi.
9. Không unhandled promise rejection.

Giữ toàn bộ matrix correction-001/002 xanh.

### E2E

Trong real auth UI flow:

- Giữ first-login logout failure evidence.
- Sau successful password change, assert **không còn** alert “Chưa thể đăng xuất” trước khi chụp workspace.
- Workspace screenshots 375/1366/1920 phải sạch, không mang stale logout notice.
- Giữ workspace logout 5xx + retry success, post-logout protection, mobile targets/overflow và axe.
- Screenshot artifact vẫn đủ đúng 9 ảnh.

## Phase report

- Sửa các claim correction-002 để khớp code thực tế.
- Ghi correction-003, test count, local gates và final commit.
- Không ghi hosted CI run/artifact ID nếu chưa có bằng chứng. ChatGPT sẽ mở PR và kiểm merge-ref CI/hosted artifact sau push.

## Quality gates

Chạy toàn bộ:

- Prisma validate/generate;
- schema static và secret scan;
- UI static gate;
- lint/typecheck toàn repository;
- API unit, web unit, PostgreSQL integration;
- build toàn repository;
- Playwright API/UI/axe;
- screenshot generation 9/9;
- `git diff --check`;
- staged file/secret/license inspection, xác nhận `.codex/config.toml` không staged.

Nếu migration fresh/legacy không chạy local do launcher permission, ghi trung thực và không dùng official DB; PR CI sẽ là authority.

## Phạm vi cấm

- Không sửa `apps/api/src/**`, Prisma schema/migration/seed hoặc authorization semantics.
- Không thêm CRUD/business feature/role selector/AI/deploy/CD.
- Không truy cập VPS hoặc database chính thức.
- Không tạo PR, không merge, không deploy.

## Commit và dừng

- Commit một correction rõ ràng và push cùng branch.
- Báo final HEAD, test counts, screenshot 9/9, divergence, tracked working tree và trạng thái untracked `.codex/config.toml`.
- Dừng sau push.