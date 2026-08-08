# CÔNG CỤ THỰC THI: CODEX

## Task

`PRODUCTION-SECURITY-GATE-001`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `ops/production-security-gate`  
Base `main`: `1de06f49bbc5702d931dfe91d7bd6485854d4faa`

## Bối cảnh bắt buộc

PR #7 đã được squash-merge vào `main` sau authoritative Linux + Windows CI PASS. Production first-deploy vẫn bị chặn bởi dependency security gate.

Authoritative PR CI `npm ci` trên Node 22.23.1 / npm 10.9.8 đã báo:

- 33 vulnerabilities total;
- 3 low;
- 19 moderate;
- 10 high;
- 1 critical.

Không được deploy production trong khi chưa biết chính xác critical/high nằm ở production runtime hay dev-only dependency và chưa có quyết định/remediation có bằng chứng.

## Safety gate trước khi làm

1. `git status -sb`.
2. Đúng branch `ops/production-security-gate`.
3. HEAD chứa base main `1de06f49bbc5702d931dfe91d7bd6485854d4faa` và task packet này.
4. Divergence không behind origin.
5. Tracked working tree sạch; chỉ `.codex/config.toml` được phép untracked.
6. `.codex/config.toml`: không đọc, không sửa, không xóa, không stage, không commit.
7. Không reset, clean, stash, rebase, amend, squash, force-push.
8. Không VPS, production secrets, production DB, migration, deploy, Nginx/service/task mutation.

## Mục tiêu

Thiết lập security gate đủ chặt để quyết định first production deployment mà không phá ứng dụng hoặc ép major upgrade mù quáng.

### 1. Thu bằng chứng audit chính xác

Chạy và lưu/đọc kết quả, không commit report chứa dữ liệu nhạy cảm nếu có:

- `npm audit --json`
- `npm audit --omit=dev --json`
- `npm ls --all` hoặc truy vết dependency chain có mục tiêu cho từng critical/high finding.

Phải lập bảng cho mọi `critical` và `high` finding:

- package;
- severity;
- advisory/CVE nếu npm trả về;
- installed version/range;
- dependency chain từ root workspace;
- production runtime hay dev/test/build-only;
- fixAvailable theo npm;
- fix có breaking/major hay không;
- mức reachable/exposure thực tế trong Báo giảng.

Không suy đoán production/dev chỉ từ tên package; dùng dependency tree/lockfile/workspace ownership.

### 2. Production runtime gate

Production release chạy API Node và frontend static đã build. Gate bắt buộc:

- `npm audit --omit=dev --audit-level=high` phải PASS, tức không còn `high` hoặc `critical` trong production dependency set;
- không được suppress/ignore advisory để làm PASS;
- không được dùng `--force` chỉ để đổi số liệu audit;
- không được xóa dependency đang thực sự cần ở runtime mà không chứng minh build/runtime/tests vẫn đúng.

Nếu một high/critical production finding không thể sửa an toàn trong task này, DỪNG và báo blocker; không tự chấp nhận rủi ro production.

### 3. Full dependency audit

Đối với dev/test/build-only high/critical:

- ưu tiên remediation không breaking bằng version bump/overrides chính thống nếu dependency owners support;
- không `npm audit fix --force`;
- không major upgrade framework/toolchain hàng loạt chỉ vì audit nếu chưa cần cho production runtime;
- nếu còn high/critical dev-only sau remediation, phải document rõ chain, why dev-only, why not production reachable, và follow-up debt; không gọi full audit PASS.

Low/moderate không được biến task này thành dependency-modernization diện rộng. Chỉ sửa khi là hệ quả an toàn của remediation cần thiết.

### 4. Lockfile và workspace integrity

- Chỉ thay `package.json` / workspace package manifests / `package-lock.json` khi thực sự cần.
- Không hand-edit lockfile để đổi audit result.
- Sau dependency change phải chạy `npm ci` sạch từ lockfile.
- Kiểm tra Node 22 / npm >=10 contract vẫn đúng.
- Không đổi application behavior ngoài dependency/security necessity.

### 5. CI security gate

Bổ sung một deterministic CI step cho production dependency gate, ưu tiên ngay sau `npm ci`:

`npm audit --omit=dev --audit-level=high`

Yêu cầu:

- CI fail nếu production dependency có high/critical;
- không cần fail vì moderate/low trong production ở task này;
- không dùng `continue-on-error`;
- không che output exit code;
- không gọi production services/secrets.

Có thể thêm một informational full audit summary nếu không làm CI noise/rủi ro, nhưng production gate trên là bắt buộc.

### 6. Quality gates sau sửa

Chạy đầy đủ vì dependency changes có blast radius rộng:

- `npm ci` từ clean install state phù hợp;
- `npm audit --omit=dev --audit-level=high`;
- `npm audit --json` để ghi nhận residual debt;
- Prisma validate/generate trên isolated/local test DATABASE_URL nếu có;
- schema static;
- secret scan;
- deployment static/behavior/workflow/PowerShell checks;
- UI static;
- lint tất cả workspaces;
- typecheck tất cả workspaces;
- API + web unit;
- migration foundation trên isolated DB nếu môi trường có;
- API integration trên isolated DB nếu môi trường có;
- builds tất cả packages/apps;
- Playwright E2E nếu isolated local environment cho phép;
- `git diff --check`;
- changed/staged file inspection;
- staged secret scan.

Nếu local environment block migration/integration/E2E, ghi BLOCKED/NOT_RUN chính xác; authoritative PR CI sẽ là bằng chứng cuối.

## Acceptance criteria

Task chỉ PASS để mở PR khi đồng thời:

1. Không còn production `high`/`critical` theo `npm audit --omit=dev --audit-level=high`.
2. Critical/high findings đã được phân loại bằng dependency chain thực tế.
3. Không dùng `npm audit fix --force`.
4. Không có breaking major upgrade không được chứng minh cần thiết.
5. Lockfile deterministic, `npm ci` PASS.
6. CI có production dependency audit gate fail-closed.
7. Full tests/build phù hợp với dependency blast radius PASS hoặc blocker môi trường được ghi thật.
8. Residual dev-only audit debt, nếu có, được report minh bạch và không được gọi là full-security PASS.
9. Không VPS/deploy/production DB/secrets.

## Completion

Nếu acceptance đạt:

- commit trên branch `ops/production-security-gate`;
- push origin;
- không tạo PR;
- không merge;
- không deploy.

Dừng và báo:

- final HEAD;
- divergence;
- exact changed files;
- audit counts trước/sau: full và `--omit=dev`;
- bảng mọi critical/high finding và disposition;
- dependency versions thay đổi;
- CI gate đã thêm;
- kết quả từng quality gate;
- residual vulnerability debt;
- blocker môi trường;
- xác nhận không VPS/production secrets/database/deploy;
- `.codex/config.toml` vẫn untracked/untouched.
