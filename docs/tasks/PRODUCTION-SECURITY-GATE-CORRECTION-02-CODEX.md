# CÔNG CỤ THỰC THI: CODEX

## Task

`PRODUCTION-SECURITY-GATE-CORRECTION-002`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `ops/production-security-gate`  
Reviewed HEAD trước packet này: `a5d6aa4b1fd5677e0978e2db94dee2104218dc48`

## Bối cảnh bắt buộc

Production security gate đang BLOCKED duy nhất bởi runtime `lodash@4.17.21` trên đường `apps/api -> @nestjs/config@3.x -> lodash`.

Correction-001 đã thử targeted override `@nestjs/config -> lodash: 4.18.1` nhưng npm không cập nhật lockfile hiện hữu. Full lock regeneration có thể đưa `lodash@4.18.1` vào tree nhưng kéo theo hàng trăm thay đổi dependency ngoài scope, nên đã dừng đúng.

Không được chấp nhận rủi ro production, không được suppress advisory, không được dùng `npm audit fix --force`, không hand-edit `package-lock.json`, không major-upgrade `@nestjs/config` 4.x.

Mục tiêu Correction-002 là ép npm 10 tạo một lockfile hợp lệ, hẹp và reproducible cho lodash patched, không kéo dependency drift diện rộng.

## Safety gate

Trước khi sửa:

1. `git status -sb`.
2. Đúng branch `ops/production-security-gate`.
3. HEAD phải chứa packet này và lịch sử `a5d6aa4b1fd5677e0978e2db94dee2104218dc48`.
4. Divergence không behind origin.
5. Tracked working tree sạch; chỉ `.codex/config.toml` được phép untracked.
6. `.codex/config.toml`: không đọc, không sửa, không xóa, không stage, không commit.
7. Không reset, clean, stash, rebase, amend, squash, force-push.
8. Không VPS, production secrets, production DB, migration, deploy, Nginx/service/task mutation.

## 1. Xác minh metadata thật trước khi chọn cách sửa

Dùng npm registry qua CLI, ghi evidence vào report nhưng không commit raw cache/log không cần thiết:

- `npm view @nestjs/config@3.2.0 version dependencies --json`
- `npm view @nestjs/config@3.3.0 version dependencies --json`
- xác định latest published `3.x` và dependency lodash của nó;
- `npm view lodash@4.18.1 version dist.integrity --json`;
- `npm ls @nestjs/config lodash --omit=dev --all`.

Phải ghi rõ:

- exact `@nestjs/config` đang locked;
- lodash constraint mà package đó khai báo;
- vì sao override là cần thiết hay không;
- không được suy đoán từ semver range trong workspace manifest.

## 2. Chụp baseline production dependency map

Trước thay đổi, tạo một file tạm ngoài tracked repo hoặc trong temp directory chứa normalized production package map từ:

`npm ls --omit=dev --all --json`

Map so sánh tối thiểu theo package path/name/version. Không commit file tạm.

Mục tiêu drift guard: sau remediation, production package version changes ngoài `lodash` và thay đổi Multer đã có sẵn từ Security Gate 001 là không được phép nếu không có lý do dependency bắt buộc và audit/test evidence rõ ràng.

## 3. Remediation ladder — làm tuần tự, dừng ngay ở phương án đầu tiên đạt acceptance

### Phương án A — root override + targeted npm update

Ưu tiên override chuẩn tại root:

```json
"overrides": {
  "lodash": "4.18.1",
  "multer": "2.2.0",
  "@nestjs/platform-express": {
    "multer": "2.2.0"
  }
}
```

Nếu root hiện có scoped lodash override từ Correction-001 packet nhưng chưa commit implementation, dùng global lodash override ở trên để npm áp dụng nhất quán cho mọi lodash production copy.

Sau khi sửa manifest, dùng npm 10.9.x để thực hiện **targeted re-resolution**, ưu tiên các lệnh tương đương sau (chọn syntax thực sự được npm hỗ trợ, không chạy mù):

1. `npm update lodash --package-lock-only --ignore-scripts`
2. nếu cần, `npm install lodash@4.18.1 --package-lock-only --ignore-scripts --no-save`

Sau mỗi thử nghiệm:

- kiểm `git diff -- package.json apps/api/package.json package-lock.json`;
- kiểm số package version drift;
- nếu tạo broad unrelated lock drift, dùng `git restore --source=HEAD -- package.json apps/api/package.json package-lock.json` để quay lại đúng HEAD rồi thử phương án kế tiếp. `git restore` chỉ được dùng cho ba file task-scoped này; không dùng reset/clean/stash.

Phương án A chỉ được nhận nếu clean `npm ci` sau đó resolve production lodash patched và drift guard đạt.

### Phương án B — explicit API runtime security anchor, chỉ khi A không thể tạo narrow lock update

Nếu npm không chịu re-resolve transitive override trên lock hiện hữu, được phép thêm **direct runtime dependency** vào `apps/api/package.json`:

```json
"lodash": "4.18.1"
```

và giữ root override `"lodash": "4.18.1"`.

Mục đích của direct dependency này phải được document rõ là `security resolution anchor` để npm tạo một production lock resolution duy nhất/patched; không được thêm import giả vào source code.

Dùng workspace-scoped install/package-lock command tương thích npm 10 để tạo lockfile bằng npm, ví dụ `npm install lodash@4.18.1 --save-exact -w apps/api --package-lock-only --ignore-scripts` hoặc equivalent có cùng semantics.

Phương án B chỉ được nhận nếu:

- lockfile do npm tạo, không hand-edit;
- `npm ci` sạch;
- `npm ls lodash --omit=dev --all` không còn `4.17.21` trên production tree;
- production version drift ngoài lodash là zero hoặc chỉ metadata placement/deduping không đổi version;
- application source không có import lodash mới chỉ để làm test giả;
- full quality gates PASS.

### Phương án C — latest 3.x `@nestjs/config`, chỉ khi registry metadata chứng minh hẹp hơn và A/B không đạt

Chỉ được nâng `@nestjs/config` trong major `3.x`; tuyệt đối không 4.x.

Chỉ chọn nếu latest 3.x published có dependency contract tương thích lodash patched hoặc cho phép npm resolve patched mà không override hack rộng hơn.

Phải pin/upgrade có chủ đích và chứng minh config behavior qua unit/integration tests hiện có. Không nâng Nest core/platform major.

### Không được làm

- không delete toàn bộ `package-lock.json` rồi regenerate và chấp nhận hàng trăm unrelated upgrades;
- không hand-edit lockfile;
- không `npm audit fix --force`;
- không suppress/ignore advisory;
- không major-upgrade Nest/Prisma/Vite/Jest/ESLint/toolchain;
- không thêm lodash import giả để hợp thức hóa direct dependency;
- không chấp nhận production high/critical.

## 4. Acceptance security gate

Sau phương án được chọn, bắt buộc:

1. `npm ci` từ lockfile sạch PASS.
2. `npm ls lodash --omit=dev --all`:
   - mọi production lodash phải là `4.18.1` hoặc phiên bản patched >=4.18.0 được packet cho phép;
   - không còn `4.17.21` production.
3. `npm audit --omit=dev --json`:
   - high = 0;
   - critical = 0.
4. `npm audit --omit=dev --audit-level=high` exit 0.
5. Full `npm audit --json` được ghi residual debt trung thực; dev-only high/critical có thể còn nhưng không được gọi full-security PASS.
6. CI security step hiện hữu vẫn fail-closed, không disable/relax.

## 5. Runtime compatibility evidence

Ngoài tests hiện có, chạy một smoke check Node không cần DB để chứng minh package resolution/runtime load:

- đọc `require('lodash/package.json').version` theo resolution phù hợp workspace API;
- load `@nestjs/config`/ConfigModule thành công;
- không monkeypatch module resolution.

Không dùng smoke check thay cho tests.

## 6. Full quality gates

Do thay production runtime dependency, chạy đầy đủ:

- clean `npm ci`;
- production audit gate + JSON audit;
- `npm ls --omit=dev` và lodash targeted tree;
- Prisma generate;
- Prisma validate nếu có isolated/local `DATABASE_URL`; nếu không, ghi BLOCKED chính xác;
- schema static;
- secret scan;
- deployment static / behavior / workflow / PowerShell / Windows fixture;
- UI static;
- lint tất cả workspaces;
- typecheck tất cả workspaces;
- API + web unit;
- API integration trên isolated harness nếu có;
- migration foundation trên isolated DB nếu môi trường cho phép;
- build tất cả packages/apps;
- Playwright E2E nếu local isolated API/web có thể dựng an toàn; nếu không, authoritative PR CI sẽ là bằng chứng cuối;
- `git diff --check`;
- changed/staged file inspection;
- staged secret scan.

## 7. Drift report bắt buộc

So sánh normalized production dependency map trước/sau và ghi:

- package version changes;
- packages added/removed;
- dedupe/placement changes nếu có;
- xác nhận không có broad unrelated version drift.

Nếu production version drift ngoài lodash vượt quá 5 package versions mà không phải dependency bắt buộc trực tiếp của remediation, STOP và báo BLOCKED; không commit.

## 8. Report

Cập nhật `docs/phase-reports/PRODUCTION-SECURITY-GATE-001-REPORT.md` hoặc tạo correction report nếu rõ hơn, ghi:

- phương án A/B/C đã dùng;
- exact registry metadata;
- exact manifest/lock changes;
- production tree before/after;
- audit before/after;
- residual dev-only debt;
- drift guard;
- quality gates;
- blocker môi trường;
- authoritative CI vẫn PENDING cho tới khi GitHub run thực sự có kết quả.

## Completion

Chỉ commit/push nếu acceptance security gate đạt hoàn toàn.

Nếu đạt:

- commit trên `ops/production-security-gate`;
- push origin;
- không tạo PR;
- không merge;
- không deploy.

Dừng và báo:

- final HEAD;
- divergence;
- phương án A/B/C;
- exact changed files;
- exact `@nestjs/config` + lodash versions/ranges;
- `npm ls lodash --omit=dev --all` summary;
- production audit counts + exit code;
- full audit residual counts;
- production dependency drift before/after;
- từng quality gate;
- blockers;
- authoritative CI state;
- xác nhận `.codex/config.toml` untouched/untracked;
- xác nhận không VPS/production secrets/database/migration/deploy/PR/merge.

Nếu không đạt, không commit/push implementation; báo blocker cùng evidence và giữ tracked tree sạch.