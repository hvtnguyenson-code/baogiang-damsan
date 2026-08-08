# CÔNG CỤ THỰC THI: CODEX

## Task

`PRODUCTION-SECURITY-GATE-CORRECTION-001`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `ops/production-security-gate`  
Reviewed implementation HEAD: `c2a2faeb20ce1652ba4e6c24a7db10c0a246aef0`  
Base `main`: `1de06f49bbc5702d931dfe91d7bd6485854d4faa`

## Verdict

Security gate implementation hiện tại fail-closed đúng, nhưng chưa hoàn tất remediation production runtime.

`npm audit --omit=dev` sau remediation còn đúng một production high:

- `apps/api` -> `@nestjs/config@3.3.0` -> `lodash@4.17.21`;
- current report ghi `fixAvailable:false`;
- production gate vì thế còn BLOCKED.

Không được coi `fixAvailable:false` của npm là bằng chứng rằng không có bản vá khả dụng. Public security evidence hiện tại cho biết:

- GHSA `GHSA-r5fr-rjxr-66jc` / CVE-2026-4800 ảnh hưởng lodash tới `4.17.23` và patched từ `4.18.0`;
- lodash latest stable hiện là `4.18.1`;
- upstream `@nestjs/config` release 4.0.4 đã cập nhật lodash lên `4.18.1` vì security;
- nhưng `@nestjs/config` 4.0.0 có breaking change về config lookup order, nên **không** nâng `@nestjs/config` major trong correction này.

Mục tiêu correction là thử remediation tối thiểu bằng npm override có kiểm soát cho production lodash, không major framework upgrade.

## Safety gate

1. Đúng repository và branch.
2. `git status -sb`.
3. HEAD phải chứa `c2a2faeb20ce1652ba4e6c24a7db10c0a246aef0` và packet này.
4. Divergence không behind origin.
5. Tracked tree sạch; chỉ `.codex/config.toml` được phép untracked.
6. `.codex/config.toml`: không đọc, sửa, xóa, stage, commit.
7. Không reset, clean, stash, rebase, amend, squash, force-push.
8. Không VPS, production secrets, production DB, migration production, deploy, Nginx/service/task mutation.
9. Không PR/merge.

## Required remediation

### 1. Targeted lodash override

Ưu tiên root npm `overrides` ở `package.json` để ép **production path của `@nestjs/config`** dùng exact patched stable `lodash@4.18.1`.

Yêu cầu:

- ưu tiên targeted override dưới `@nestjs/config` thay vì global override nếu npm hỗ trợ và tree deterministic;
- không thêm direct application dependency `lodash` chỉ để che audit;
- không hand-edit `package-lock.json`;
- regenerate lockfile bằng npm;
- không nâng `@nestjs/config` lên 4.x trong task này;
- không `npm audit fix --force`;
- không suppress/ignore advisory.

Nếu targeted override không thể cài deterministic hoặc làm dependency tree invalid, DỪNG và báo blocker; không tự chuyển sang major framework upgrade.

### 2. Prove actual production resolution

Sau clean install phải chứng minh bằng output thực tế:

- `npm ls lodash --omit=dev` hoặc truy vết tương đương;
- path `apps/api -> @nestjs/config -> lodash` resolve tới `4.18.1`;
- không còn `lodash@4.17.x` nào trong **production dependency set**;
- `npm ls --omit=dev` không invalid/extraneous.

Có thể còn lodash cũ trong dev-only tree nếu `--omit=dev` không đưa chúng vào production; phải phân loại đúng, không overclaim full audit.

### 3. Production security gate must become PASS

Chạy sau clean install:

- `npm audit --omit=dev --json`;
- `npm audit --omit=dev --audit-level=high`.

Acceptance bắt buộc:

- production `high = 0`;
- production `critical = 0`;
- command audit-level high exit `0`.

Nếu npm vẫn báo lodash high/critical hoặc phát sinh production high/critical khác, task vẫn BLOCKED.

### 4. Compatibility proof

Vì override thay transitive runtime dependency mà upstream 3.3.0 pin phiên bản cũ, phải test blast radius rộng.

Tối thiểu:

- clean `npm ci`;
- Prisma generate;
- Prisma validate nếu có isolated/local DATABASE_URL;
- schema static;
- secret scan;
- deployment static/behavior/workflow/PowerShell/Windows fixtures;
- UI static;
- lint toàn bộ;
- typecheck toàn bộ;
- API unit, đặc biệt config tests;
- web unit;
- API integration trên isolated local DB nếu có;
- build contracts/config/API/web;
- migration foundation trên isolated DB nếu môi trường cho phép;
- Playwright E2E nếu local isolated API/web có thể chạy;
- `git diff --check`;
- changed/staged file inspection;
- staged secret scan.

Ngoài ra chạy một targeted runtime smoke, không cần commit test mới nếu không cần:

- require/resolve `@nestjs/config` thành công;
- resolved runtime lodash version đúng `4.18.1`;
- một số lodash primitives dùng phổ biến (`get`, `set`/`cloneDeep` hoặc equivalent phù hợp với ConfigService path) hoạt động;
- startup/build không có module-resolution error.

BLOCKED môi trường phải ghi đúng, không biến thành PASS.

### 5. Report correction

Cập nhật `docs/phase-reports/PRODUCTION-SECURITY-GATE-001-REPORT.md`:

- ghi rõ Correction-001;
- before/after production audit counts;
- giải thích npm từng ghi `fixAvailable:false` nhưng patched lodash release tồn tại và remediation dùng controlled override;
- exact override scope;
- `npm ls --omit=dev` resolution evidence;
- quality-gate evidence;
- residual dev-only debt nếu còn;
- production decision chỉ được `PASS` nếu high/critical production đều 0;
- authoritative GitHub CI vẫn `PENDING` cho tới PR CI thực sự chạy.

Không ghi URL chứa secret hoặc raw audit payload nếu không cần.

## Allowed scope

Chỉ sửa khi thực sự cần:

- root `package.json`;
- `package-lock.json`;
- `docs/phase-reports/PRODUCTION-SECURITY-GATE-001-REPORT.md`;
- security/dependency-specific test helper dưới `scripts/ci/` nếu thật sự cần;
- `.github/workflows/ci.yml` chỉ nếu current security gate cần sửa để phản ánh đúng contract (không sửa nếu đã đúng).

Không sửa business API/UI/auth/schema/migration logic.

## Acceptance criteria

Correction chỉ PASS để mở PR khi đồng thời:

1. Production path `@nestjs/config -> lodash` resolve `4.18.1`.
2. Không production `lodash@4.17.x`.
3. `npm audit --omit=dev --audit-level=high` exit `0`.
4. Production audit high=0, critical=0.
5. `npm ls --omit=dev` PASS.
6. Không `npm audit fix --force`, không advisory suppression.
7. Không major `@nestjs/config` upgrade.
8. Full relevant tests/build PASS hoặc exact environment blocker được ghi thật.
9. Report minh bạch residual dev-only debt.
10. Không VPS/deploy/production DB/secrets.

## Completion

Nếu acceptance đạt:

1. commit cùng branch `ops/production-security-gate`;
2. push origin;
3. không PR;
4. không merge;
5. không VPS/deploy.

Dừng và báo:

- final HEAD;
- divergence;
- exact changed files;
- exact override;
- `npm ls lodash --omit=dev` production resolution;
- production audit counts + exit status;
- full audit residual counts;
- từng quality gate;
- blocker môi trường;
- authoritative CI state;
- `.codex/config.toml` untouched.