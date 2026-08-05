# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-UI-DESIGN-SYSTEM-FOUNDATION-CORRECTION-002`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `phase/01-ui-design-system-foundation`  
Reviewed correction HEAD: `68365a741ca2493073d4ce0d75ac44fa4aab2777`  
Correction-001 packet commit: `29f86936accd006d22ba8fc3ce8112e11e2bf007`  
Base task gốc: `f979264539bc5c55e47281f39e247d43b40991e6`

## Mục tiêu

Đóng các lỗi còn sót sau review độc lập của correction-001. Giữ nguyên hướng “Sổ công tác Đam San”, không redesign, không mở rộng nghiệp vụ và không sửa backend.

## Safety gate bắt buộc

Trước khi sửa:

1. Xác minh đúng repository và branch.
2. `git status -sb`, working tree sạch.
3. Xác minh exact HEAD chứa `68365a741ca2493073d4ce0d75ac44fa4aab2777` và commit packet này.
4. Kiểm tra divergence với remote; chỉ tiếp tục khi không behind.
5. Không reset, clean, stash, rebase, amend, squash hoặc force-push.

## Finding 1 — Change-password 401 đang làm mất auth state sai

Hiện `changePassword()` gọi API với `notifyUnauthorized: true`. Backend dùng HTTP 401 cho cả session invalid và mật khẩu hiện tại sai. Khi mật khẩu hiện tại sai, global unauthorized listener xóa auth query trước khi `FirstPasswordChangePage` hiển thị lỗi, có thể đẩy người dùng về `/dang-nhap` thay vì giữ nguyên first-login page và báo “Mật khẩu hiện tại không đúng”.

Yêu cầu:

- Không để 401 từ mutation đổi mật khẩu tự động xóa auth state một cách mù quáng.
- Với 401 từ change-password theo contract hiện tại, giữ người dùng tại first-login page và hiển thị lỗi mật khẩu hiện tại không đúng.
- Không thay đổi backend status code trong task này.
- Nếu cần phân biệt session thật sự hết hạn, dùng một policy frontend an toàn và deterministic, ví dụ refetch `/auth/me` sau 401:
  - `/me` vẫn 200 → giữ session, báo current-password error;
  - `/me` 401 → chuyển anonymous;
  - `/me` network/5xx → không coi là logout; hiện recovery state phù hợp.
- Không tạo redirect loop, không để stale first-login state và không lộ raw response.

## Finding 2 — Test matrix của correction-001 chưa đạt packet

Correction-001 yêu cầu unit test rõ cho login, password change và logout theo các nhóm 400/401/network/5xx. HEAD `68365a7` chỉ bổ sung một phần. Bổ sung đầy đủ, không gộp một test mơ hồ để tuyên bố coverage.

### Unit tests bắt buộc

Login:

- blank username/password không gọi login mutation;
- 400/422 hiển thị “thông tin chưa hợp lệ”, không gọi là lỗi mạng;
- 401 generic, không lộ backend text và xóa password;
- network/status 0 có copy kết nối;
- 5xx có copy hệ thống tạm thời;
- sửa field xóa stale error liên quan.

First password change:

- required/policy/confirm/new-equals-current không gọi mutation;
- 401 current-password giữ first-login auth state và hiển thị đúng lỗi;
- 400/422 có copy validation an toàn, không lộ raw backend text;
- network và 5xx giữ trang/session, có recovery copy;
- success refetch `/me` và vào workspace;
- stale relational error được cập nhật hợp lý khi thay current/new/confirm password.

Logout, dùng cùng một policy ở app shell và first-login:

- success xóa auth state;
- 401 coi là đã logout và xóa auth state;
- network/status 0 giữ authenticated hoặc firstLoginRequired;
- 5xx giữ authenticated hoặc firstLoginRequired;
- lỗi visible, retry được;
- không có unhandled promise rejection;
- retry thành công mới chuyển anonymous.

Rendered/static copy:

- không có `Cookie HttpOnly`, `capability`, `PostgreSQL` trong production UI;
- test không được chỉ dựa vào static regex nếu rendered flow có thể khác.

## Finding 3 — E2E logout locator và failure paths chưa chắc chắn

Sau khi logout fail, trang có cả nút `Đăng xuất` và `Thử đăng xuất lại`. Locator `getByRole('button', { name: 'Đăng xuất' })` có thể match nhiều phần tử vì mặc định không exact.

Yêu cầu:

- Dùng locator exact/unique cho header logout và retry logout.
- E2E phải chứng minh:
  - blank login validation không gửi POST login;
  - first-login logout bị abort hoặc 5xx không redirect giả, lỗi visible và vẫn ở first-login;
  - workspace logout bị network/5xx không redirect giả;
  - retry logout thành công chuyển login;
  - post-logout protected route vẫn bị chặn.
- Không để các route intercept hoặc mutated account làm test phụ thuộc thứ tự ngoài flow có chủ đích.

## Finding 4 — Responsive target helper chỉ kiểm phần tử đầu tiên

`assertResponsiveTargets()` hiện dùng `.first()`, nên selector nhiều navigation links/buttons chỉ kiểm một phần tử và có thể bỏ sót target nhỏ.

Yêu cầu:

- Kiểm tất cả phần tử visible khớp selector, hoặc truyền locator duy nhất cho từng control.
- Tại 320, 375, 414 px, kiểm:
  - login primary submit và cả các link có thể chạm trong auth view;
  - first-login submit, logout và link liên quan;
  - workspace header logout và toàn bộ primary navigation links;
  - không horizontal overflow trên login, first-login, workspace.
- Mỗi target visible đạt ít nhất 44×44 px hoặc chiều cao ≥44 px với chiều rộng nội dung hợp lý theo packet trước.

## Finding 5 — Hoàn thiện report và CI evidence

- Cập nhật phase report, ghi rõ correction-002, test matrix mới, final CI run và artifact ID.
- Final-head CI phải chạy toàn bộ Prisma/schema/migration/secret/static UI/lint/typecheck/API unit/web unit/PostgreSQL integration/build/Playwright/axe/screenshot.
- Screenshot artifact vẫn đủ 9 ảnh; review lại mobile/laptop/ultrawide, đặc biệt logout notice không phá layout.

## Phạm vi file

Được phép sửa:

- `apps/web/**`
- `tests/e2e/**`
- `scripts/ui/**` nếu cần
- phase report liên quan
- task file này
- `.github/workflows/ci.yml` chỉ khi thật sự cần để chạy gate, không đổi kiến trúc CI ngoài phạm vi.

Cấm sửa:

- `apps/api/src/**`
- Prisma schema/migration/seed
- authorization semantics
- user/grant/catalog/duty CRUD
- deployment/CD/VPS/Nginx/database chính thức
- business features ngoài UI foundation.

## Quality gates

Chạy toàn bộ work packet gốc và correction-001:

- Prisma validate/generate;
- schema static;
- migrations fresh/legacy trong CI cô lập;
- secret scan;
- static UI gate;
- lint/typecheck toàn repository;
- API unit và PostgreSQL integration;
- web unit đầy đủ;
- build toàn repository;
- Playwright API/UI/axe;
- screenshot artifact 9 ảnh;
- `git diff --check`;
- staged file/secret/license inspection.

## Commit và dừng

- Commit correction-002 theo một commit rõ ràng, push cùng branch.
- Không tạo PR, không merge, không deploy.
- Báo final HEAD, final CI run, artifact ID, test counts, divergence và working tree.
- Chỉ dừng khi hoàn thành hoặc gặp blocker thật.