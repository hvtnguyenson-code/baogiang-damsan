# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-UI-DESIGN-SYSTEM-FOUNDATION-001`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `phase/01-ui-design-system-foundation`  
Base bắt buộc: `f979264539bc5c55e47281f39e247d43b40991e6`

## Mục tiêu

Thiết lập bản sắc UI riêng cho Hệ thống Báo giảng Đam San và triển khai vertical slice frontend vận hành thật trên auth/session/authorization đã merge:

- project-specific UI skill và `DESIGN.md`;
- design tokens, typography, primitives và app shell;
- đăng nhập bằng API thật;
- bắt buộc đổi mật khẩu lần đầu;
- auth bootstrap qua `/api/auth/me`;
- protected routing, hết phiên, logout và trạng thái lỗi;
- màn hình làm việc nền móng và trạng thái hệ thống;
- unit, accessibility, E2E thật và screenshot artifacts.

Đây không phải task marketing/landing page. Không triển khai user CRUD, grant CRUD, subject/group/duty CRUD hoặc nghiệp vụ báo giảng.

## Audit hiện trạng bắt buộc

Trước khi sửa, đọc toàn bộ frontend và ghi audit ngắn vào phase report. Tối thiểu phải nhận diện:

- `HomePage` hiện là hero card + info-card grid của Phase 00;
- `AppLayout` hiện hiển thị phase badge cũ;
- navigation dùng `role="tab"`/`aria-selected` cho route links nhưng không phải tab widget;
- `Inter`, palette blue mặc định, `rounded-xl`, generic cards và animation toàn trang tạo cảm giác template;
- `transition-all` và auto entrance animation không phù hợp quality rules mới;
- API client chưa có auth endpoints, typed mutation handling hoặc explicit cookie credentials;
- không có auth bootstrap/protected route/first-login UI;
- không có project-specific UI authority.

Không giữ pattern cũ chỉ vì đã tồn tại. Không xóa health functionality hoặc phá các API tests hiện hành.

## Nguồn tham khảo và thứ tự thẩm quyền

Các nguồn sau chỉ là đầu vào nghiên cứu, không phải dependency runtime và không nguồn nào được sao chép nguyên xi làm thương hiệu sản phẩm:

1. Anthropic `skills/frontend-design` — tư duy thiết kế có chủ đích, bắt nguồn từ đối tượng thật.
2. Nutlope `hallmark` — anti-template/anti-AI-slop audit.
3. Vercel Labs `web-interface-guidelines` — interaction, accessibility, forms và performance gates.
4. GOV.UK Design System/Frontend — clarity cho form và dịch vụ hành chính.
5. WAI-ARIA Authoring Practices — semantics và keyboard behavior.

Thẩm quyền trong repository sau task:

```text
DESIGN.md của Báo giảng Đam San
> .codex/skills/damsan-ui/SKILL.md
> ADR-009 và UI engineering checklist
> nguồn tham khảo bên ngoài
> prototype/Phase 00 UI cũ
```

Không vendor toàn bộ Hallmark, Anthropic skills, shadcn, GOV.UK hoặc Vercel guidelines. Tạo một skill nội bộ ngắn, nguyên bản, tổng hợp có attribution. Ghi URL, license và ngày/commit tham khảo trong `docs/design/UI-SOURCES-AND-LICENSES.md`. Không copy substantial text.

## Hướng thiết kế bắt buộc

### Tên hướng

**Sổ công tác Đam San** — giao diện tác nghiệp hiện đại lấy cảm hứng từ sổ tuần và biểu mẫu công việc của giáo viên, nhưng không skeuomorphic và không giả giấy cũ.

### Đối tượng

- giáo viên và cán bộ quản lý Việt Nam;
- sử dụng chủ yếu trên laptop Windows và điện thoại Android;
- dữ liệu tương lai dày, nhiều bảng, tuần, ngày, tiết, trạng thái và form dài;
- kỹ năng công nghệ không đồng đều;
- mạng có thể chậm hoặc không ổn định.

### Nguyên tắc thị giác

- Rõ, chắc, có mật độ; không phải dashboard SaaS quảng cáo.
- Một signature element: **đường biên tuần/margin rail màu bazan** dùng để định hướng section, tuần hoặc trạng thái công việc. Nó phải có chức năng cấu trúc, không trang trí rải rác.
- Không dùng họa tiết dân tộc, biểu tượng văn hóa hoặc motif Êđê nếu chưa có tài liệu/duyệt riêng; tránh chiếm dụng hoặc trang trí hời hợt.
- Không gradient, glassmorphism, glow, blob, hero marketing, bento grid, ba card bằng nhau, card lồng card, generic left sidebar, icon tile hoặc role selector.
- Không dùng fake metrics, fake notifications, fake users, testimonial, logo hoặc business data.
- Radius tiết chế; không bo tròn mọi bề mặt. Pill chỉ cho status/chip thực sự.
- Shadow hiếm; ưu tiên border, divider, hierarchy và density.
- Animation chỉ khi giải thích cause/effect. Không auto fade/slide mọi page. Tôn trọng `prefers-reduced-motion`.

### Palette nền tảng

Khóa semantic tokens từ các giá trị sau; tên token có thể tinh chỉnh nhưng không đổi palette tùy hứng:

- `ink-950`: `#15242E` — chữ chính/blue-black.
- `school-800`: `#1F4358` — thương hiệu và interaction chính.
- `basalt-600`: `#A7462F` — accent duy nhất/signature rail.
- `mist-50`: `#F3F6F7` — nền ứng dụng.
- `paper-0`: `#FFFFFF` — bề mặt nhập liệu/nội dung.
- `line-300`: `#C9D4DA` — divider/border.

Semantic success/warning/error phải đạt contrast và luôn có text/icon cue, không chỉ màu. Không dùng basalt làm màu lỗi.

### Typography

- Primary: **Be Vietnam Pro**, vì hỗ trợ tiếng Việt và phù hợp UI tác nghiệp.
- Data/utility: **IBM Plex Mono** chỉ cho mã, thời gian, số liệu tabular hoặc nhãn kỹ thuật nhỏ.
- Tối đa hai font family.
- Dùng package font tự host qua build; không CDN.
- Chỉ import subset/weights cần thiết, `font-display: swap`.
- Xác minh license và đưa notice cần thiết vào repository/distribution.
- Nếu package/font license hoặc Vietnamese glyph coverage không xác minh được: dừng, báo blocker; không âm thầm fallback về Inter.

### Density và layout

- Laptop 1366×768 là viewport chính; không lãng phí nửa màn hình cho hero.
- Mobile 320/375/414 và tablet 768 phải dùng được hoàn chỉnh.
- Ultra-wide không kéo line length vô hạn.
- Text prose tối đa khoảng 65ch; bảng/form được phép rộng theo nghiệp vụ.
- Input mobile tối thiểu 16px; interactive target mobile tối thiểu 44px.
- Số liệu so sánh dùng `tabular-nums`.

## Principal skill và tài liệu thiết kế

Tạo:

1. `.codex/skills/damsan-ui/SKILL.md`
   - principal UI skill duy nhất của project;
   - bắt buộc agent đọc `DESIGN.md` trước mọi UI task;
   - quy trình: audit → plan → wireframe → token check → implement → screenshot critique → accessibility check;
   - Hallmark chỉ là adversarial audit, không tự redesign;
   - cấm generic AI patterns nêu trên;
   - ưu tiên native semantics và component hiện có;
   - không thay route/data/auth ngoài task.

2. Root `DESIGN.md`
   - product/audience/job;
   - visual direction và signature element;
   - exact semantic tokens;
   - typography;
   - spacing/radius/elevation/motion;
   - layout families: auth, workspace, data table, long form, weekly ledger, approval, mobile;
   - component states;
   - content voice tiếng Việt;
   - do/don't;
   - accessibility/performance requirements;
   - không mô tả fake business features.

3. `docs/design/UI-SOURCES-AND-LICENSES.md`
4. `docs/design/UI-ENGINEERING-CHECKLIST.md`
5. `docs/decisions/ADR-009-UI-DESIGN-SYSTEM-AND-AUTH-VERTICAL-SLICE.md`
6. `docs/phase-reports/PHASE-01-UI-DESIGN-SYSTEM-FOUNDATION-REPORT.md`

Cập nhật `AGENTS.md`: mọi UI task phải đọc principal skill + `DESIGN.md`; Antigravity chỉ làm task hẹp trong system đã duyệt; không được tự chọn theme/primitive khác.

## Phạm vi file

Được phép sửa/tạo:

- `apps/web/**`
- `tests/e2e/**`
- `.github/workflows/ci.yml`
- root/app package manifests và `package-lock.json` khi cần cho font/a11y test
- `AGENTS.md`
- `DESIGN.md`
- `.codex/skills/damsan-ui/**`
- `docs/design/**`
- `docs/decisions/ADR-009-*`
- `docs/phase-reports/PHASE-01-UI-DESIGN-SYSTEM-FOUNDATION-REPORT.md`
- task file này
- một static UI-check script dưới `scripts/ui/**` nếu cần.

Cấm sửa:

- `prisma/**`;
- schema/migration/seed;
- `apps/api/src/**`;
- auth/session/authorization backend;
- shared capability semantics;
- user/grant/catalog/duty CRUD;
- deploy/CD/VPS/Nginx/database chính thức;
- DOCX specifications.

Nếu frontend cần backend contract chưa có, dừng và báo blocker; không tự mở rộng API trong task UI.

## Implementation bắt buộc

### 1. API client

Mở rộng client tập trung, typed theo shared contracts:

- `POST /auth/login`;
- `GET /auth/me`;
- `POST /auth/change-password`;
- `POST /auth/logout`;
- `POST /auth/logout-all` nếu UI dùng;
- health endpoints hiện tại.

Yêu cầu:

- explicit `credentials: 'same-origin'`;
- JSON handling an toàn cho 204/body rỗng nếu phát sinh;
- chuẩn hóa `ApiError` từ standard API error;
- không lộ raw response/secrets vào UI/log;
- không lưu cookie/token/password/hash trong localStorage, sessionStorage, URL, query cache hoặc logs;
- 401 phải invalidate auth state và dẫn về login;
- 403 không được biến thành “chưa đăng nhập”.

### 2. Auth bootstrap/state

Dùng React Query hoặc abstraction nhỏ tương thích stack hiện tại:

- `/auth/me` là source of truth;
- states rõ: `checking`, `anonymous`, `firstLoginRequired`, `authenticated`, `error`;
- query key ổn định;
- login success cập nhật/refetch `/me`;
- logout xóa auth query và data nhạy cảm;
- reload giữ phiên qua HttpOnly cookie, không client token;
- không redirect loop;
- giữ intended internal destination an toàn; không open redirect.

### 3. Routing

Canonical routes:

- `/dang-nhap` — public login;
- `/doi-mat-khau-lan-dau` — authenticated, chỉ dùng khi `mustChangePassword=true`;
- `/` — protected workspace;
- `/trang-thai-he-thong` — public diagnostic page;
- `/khong-co-quyen` — generic access denied state khi cần;
- `*` — not found.

Giữ compatibility redirect:

- `/login` → `/dang-nhap`;
- `/system-status` → `/trang-thai-he-thong`.

Protected route rules:

- anonymous → login;
- first-login user → change-password page;
- authenticated normal user không được quay lại first-login page;
- auth checking dùng stable loading layout, không flash protected content;
- login page không nằm trong authenticated app shell.

### 4. Login page thật

Không centered generic card/hero. Dùng composition bất đối xứng, gọn trên laptop và một cột trên mobile, dựa trên “sổ công tác” và margin rail.

Nội dung thật, tối thiểu:

- `Báo giảng Đam San`;
- tên trường từ config;
- `Tên đăng nhập`;
- `Mật khẩu`;
- action `Đăng nhập`;
- link `Kiểm tra trạng thái hệ thống`;
- không có đăng ký/quên mật khẩu nếu API chưa có.

Form:

- native `<form>`; Enter submit;
- label thật, autocomplete `username`/`current-password`;
- cho phép paste;
- loading giữ nguyên label kèm indicator;
- generic 401 message, không dò username;
- network/server error có recovery action;
- focus first invalid/error summary phù hợp;
- password không bao giờ được echo/log.

### 5. First-login password change

Fields:

- mật khẩu hiện tại;
- mật khẩu mới;
- xác nhận mật khẩu mới.

UI copy phải khớp backend policy hiện tại:

- ít nhất 12 ký tự;
- có chữ thường, chữ hoa và chữ số.

Không tự thêm policy backend không có. Có autocomplete phù hợp, paste được, confirm client-side. Sau success refetch `/me`, vào workspace; current session tiếp tục theo backend policy. Có logout rõ ràng.

### 6. App shell

- semantic skip link;
- masthead gọn với product/school identity;
- navigation bằng link semantics, không `role="tab"`;
- chỉ render route có thật, không placeholder links;
- hiển thị display name nhưng không suy/hiển thị role từ capability;
- logout button rõ;
- no generic permanent sidebar trong slice này;
- mobile navigation usable without custom hand-written ARIA widget phức tạp;
- không Phase 00 badge/copy.

Workspace `/`:

- factual foundation state, không fake dashboard metrics;
- thể hiện đăng nhập/phân quyền đã sẵn sàng và không bịa nghiệp vụ chưa triển khai;
- có đường đến system status và thao tác logout/profile context nếu phù hợp;
- không card grid trang trí.

System status:

- giữ functionality health hiện có;
- redesign theo system mới;
- states loading/ready/degraded/error có text cue;
- không lộ credential, SQL, stack trace hoặc nội bộ không cần thiết.

### 7. UI primitives

Tạo bộ nhỏ, project-owned, chỉ những gì slice dùng:

- Button;
- TextField/FormField;
- InlineAlert/FormError;
- LoadingState;
- Empty/Recovery state nếu thật sự cần;
- Page frame/header primitives.

Mỗi interactive component có default, hover, focus-visible, active, disabled, loading, error khi phù hợp.

Không cài shadcn/Radix/Base UI/React Aria trong slice này vì chưa có interaction phức tạp cần primitive. Native HTML trước. Ghi ADR rằng chỉ chọn một primitive system khi modal/menu/combobox thực sự xuất hiện; không trộn hệ thống.

Dùng icon system hiện có; bổ sung icon cùng style nếu cần. Không emoji làm icon, không thêm icon library thứ hai.

### 8. CSS/Tailwind

- Replace Inter/default blue foundation bằng tokens đã khóa.
- Không arbitrary palette rải rác; semantic tokens là nguồn chính.
- Không `transition-all`.
- Không `h-screen`; dùng min-height/dynamic viewport phù hợp.
- Không auto `scroll-behavior: smooth` khi chưa xử lý reduced motion.
- Tạo reduced-motion rules.
- Không global anchor style phá button/link components.
- Không animation page entrance mặc định.
- Có Windows native select/input color safety khi dùng.
- Có print baseline tối thiểu, nhưng không thiết kế báo cáo in trong slice này.

### 9. Static UI gate

Tạo `npm` script và CI gate kiểm tra production web source, tối thiểu chặn:

- `transition-all`;
- gradient utilities/CSS gradient;
- `backdrop-blur`/glass patterns;
- `h-screen`;
- `role="tab"` trong route navigation;
- auth token/cookie/password persistence qua localStorage/sessionStorage;
- `Inter` trong design token/font config mới;
- thiếu `DESIGN.md` hoặc principal skill.

Gate không được scan docs/vendor text theo cách gây false positive. Có unit tests cho checker hoặc fixture rõ nếu script phức tạp.

## Accessibility và interaction gates

- keyboard vận hành toàn flow;
- visible focus trên mọi control;
- skip-to-content;
- headings đúng thứ bậc;
- native semantics trước ARIA;
- icon-only button có accessible name, nhưng ưu tiên text button;
- async messages dùng `aria-live` phù hợp;
- errors đặt cạnh field và có summary/recovery khi cần;
- status không phụ thuộc màu;
- mobile target ≥44px;
- browser zoom không bị khóa;
- `prefers-reduced-motion` được tôn trọng;
- long Vietnamese content không vỡ layout;
- dates/numbers locale-aware khi xuất hiện.

Dùng `@axe-core/playwright` hoặc tương đương đã duy trì cho automated audit. Không coi axe PASS là thay thế keyboard/manual semantics review.

## E2E và CI fixture isolation

Không để E2E phụ thuộc thứ tự hoặc chia sẻ password-mutated account.

Trong CI isolated database:

- giữ API auth E2E account riêng, ví dụ `e2e-api-admin`;
- bootstrap thêm UI E2E account riêng, ví dụ `e2e-ui-admin`, bằng CLI bootstrap hiện có và fake credentials trong workflow;
- không thêm production fixture endpoint/script nếu không cần;
- mỗi spec chỉ dùng account của nó;
- không dùng official DB.

UI E2E tối thiểu:

1. anonymous protected-route redirect;
2. invalid login generic error;
3. valid login;
4. first-login redirect;
5. password policy/confirm validation;
6. successful password change;
7. workspace visible;
8. reload vẫn authenticated qua cookie;
9. logout;
10. post-logout protected route bị chặn;
11. system status public;
12. keyboard tab/focus smoke;
13. axe no critical/serious violations trên login, first-change và workspace.

Giữ auth API E2E hiện có xanh và tách credentials rõ.

## Visual evidence

CI phải tạo và upload artifact `ui-foundation-screenshots` trên PR/final branch, không chứa secret hoặc real data:

- login: 375×812 và 1366×768;
- first-password-change: 375×812 và 1366×768;
- authenticated workspace: 375×812, 1366×768 và 1920×1080;
- system status ready/error-safe state nếu deterministic.

Screenshots dùng fake CI account/display name, không chụp password. Tắt caret/unstable animation và đảm bảo deterministic. Không commit generated screenshots vào source trừ khi visual regression strategy được ADR chấp thuận; artifact là đủ cho slice này.

Sau khi render, Codex phải tự review screenshot theo:

- có giống generic SaaS/shadcn/template không;
- có hero/card-grid/empty whitespace quá mức không;
- typography tiếng Việt có lỗi glyph/line-height không;
- laptop 1366×768 có thấy action chính không cần scroll vô lý không;
- mobile có target nhỏ/overflow không;
- signature rail có chức năng hay chỉ trang trí.

Ghi findings và correction đã thực hiện trong phase report.

## Unit tests tối thiểu

- API client typed success/error/empty response và credentials;
- login form submit/loading/generic failure;
- auth bootstrap states;
- protected route redirects và safe return path;
- first-login routing;
- password policy/confirm UI;
- successful change updates auth state;
- logout clears auth state;
- 401 khác 403;
- navigation dùng link semantics, không tab role;
- no role selector;
- system status states;
- accessibility names/focus cơ bản.

Không snapshot-test class string khổng lồ thay cho behavior.

## Quality gates

Chạy toàn bộ:

- Prisma validate/generate;
- schema static;
- migration fresh/legacy trong CI;
- secret scan;
- new static UI gate;
- lint tất cả workspaces;
- typecheck tất cả workspaces;
- API unit/integration hiện có;
- web unit mới và cũ;
- build toàn repository;
- Playwright API + UI + axe;
- screenshot artifact generation;
- `git diff --check`;
- staged file/secret/license inspection.

CI final head phải xanh.

## An toàn Git và vận hành

- Không reset, clean, stash, rebase, amend, squash hoặc force-push.
- Không merge, deploy, truy cập VPS hoặc database chính thức.
- Không đọc/in `.env` thật.
- Không tạo PR.
- Một task/một branch.
- Commit theo lát hợp lý và push branch.
- Dừng sau push.

## Báo cáo cuối

1. Audit UI cũ.
2. Design direction/tokens/fonts/signature.
3. Principal skill và governance files.
4. Auth vertical slice behavior.
5. Accessibility/static/visual gates.
6. E2E fixture isolation.
7. Screenshot artifact/run ID.
8. Test/CI evidence.
9. Commits, final HEAD, divergence, working tree.
10. Xác nhận:
   - backend source changed: NO
   - schema/migration changed: NO
   - authorization semantics changed: NO
   - business CRUD implemented: NO
   - VPS accessed: NO
   - official DB accessed/changed: NO
   - deployed: NO
   - PR created: NO
   - merged: NO
