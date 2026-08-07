# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-PRODUCTION-CD-FIRST-DEPLOY-001`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `ops/phase-01-cd-first-deploy`  
Base `main` đã duyệt: `42d56d420f22cfaf77947f4eb46b283da06965de`  
Production deploy đã được người dùng phê duyệt rõ ngày 2026-08-06.

## Mục tiêu

Thiết lập đường CD production đầu tiên cho Báo giảng Đam San và chuẩn bị một đợt deploy có kiểm soát tới Windows VPS chính thức pre-operational. Task này phải tạo đầy đủ workflow, PowerShell scripts, runbook, kiểm thử tĩnh và bằng chứng rollback; không được tự suy đoán hạ tầng chưa xác minh và không được chạm hệ thống Quản lí nội trú/DamSanV5.

Hệ thống đích đã biết từ tài liệu có hiệu lực:

- domain: `https://baogiang.dtnt-damsan.edu.vn`;
- Nginx dự kiến tại `C:\nginx`;
- API loopback: `127.0.0.1:3100`;
- PostgreSQL 17: `localhost:5433`;
- database: `baogiang`;
- application role: `baogiang_app`;
- service/Scheduled Task dự kiến: `BaoGiangBackend`;
- `NODE_ENV=production`;
- `HTTP_TRUST_PROXY_HOPS=1`;
- `AUTH_COOKIE_SECURE=true`;
- AI/Web Push vẫn tắt.

Các giá trị trên chỉ được dùng sau read-only preflight xác minh. Host/IP, SSH port/user, app root, Node/npm path, Nginx config path, log/backup path và trạng thái GitHub secrets hiện chưa được xác minh.

## Tài liệu bắt buộc đọc

- `AGENTS.md`
- `docs/decisions/ADR-005-OFFICIAL-VPS-CI-CD.md`
- `docs/operations/DEVELOPMENT-DEPLOYMENT-DATABASE.md`
- `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md`
- `docs/architecture/PHASE-00-FOUNDATION.md`
- `apps/api/.env.example`
- `apps/api/src/config/app.config.ts`
- root and workspace `package.json` files
- current `.github/workflows/ci.yml`
- Prisma schema/migrations and bootstrap-admin CLI.

## Non-negotiable safety boundaries

- Không reboot VPS.
- Không restart PostgreSQL.
- Không restart toàn bộ Nginx; chỉ reload an toàn sau `nginx -t` nếu server block Báo giảng thật sự thay đổi.
- Không dừng DamSanV5, hệ thống Quản lí nội trú hoặc process/service/database của chúng.
- Không `taskkill /IM node.exe`, không kill toàn bộ Node.
- Chỉ stop/start/restart đúng process hoặc Scheduled Task có command line/entry point thuộc Báo giảng.
- Không dùng `prisma db push` hoặc `prisma migrate reset` trên database chính thức.
- Không chạy automated test suite trên database chính thức.
- Không đọc, in, commit hoặc upload `.env`, password, private key, database dump hay connection string thật.
- Không truyền `DATABASE_URL` production qua log hoặc artifact GitHub Actions. Production env phải nằm server-side trong file có ACL riêng.
- Không copy working tree local lên VPS. Source phải xuất phát từ exact GitHub commit.
- Không tự động deploy theo `push`; lần đầu chỉ `workflow_dispatch` với confirmation rõ ràng.
- Không merge hoặc kích hoạt deploy trong phần implementation của Codex. Dừng sau push để ChatGPT review độc lập.
- Không reset, clean, stash, rebase, amend, squash hoặc force-push.
- Giữ nguyên `.codex/config.toml` untracked: không đọc/sửa/xóa/stage/commit.

## Phase A — Read-only VPS inventory

Tạo `scripts/deploy/windows/production-preflight-readonly.ps1` và runbook tương ứng. Script chỉ đọc, không tạo/sửa/xóa/restart gì.

Script phải thu thập an toàn, không in secret:

1. Windows version, hostname, current user, PowerShell version, architecture, free disk.
2. OpenSSH server status, listening SSH port và firewall rule liên quan; không in key.
3. `git`, `node`, `npm`, `npx`, `nginx`, `psql`, `pg_dump` executable paths và versions.
4. Port listeners cho 80, 443, 3100, 5433 cùng PID/process path/command line có kiểm soát.
5. Tồn tại và ACL summary của candidate directories: Báo giảng root/releases/shared/logs/backups; không đọc file secret.
6. Scheduled Tasks/services có tên hoặc command line liên quan `BaoGiang`/port 3100; ghi exact task/service name, executable, arguments, working directory và account, không chạy chúng.
7. Nginx master path, config test command availability, server block/domain references và candidate config file paths; không in certificate private key.
8. PostgreSQL service/version/listening address/port; xác minh database `baogiang` và role `baogiang_app` tồn tại bằng câu lệnh read-only nếu người dùng cung cấp kết nối admin trong phiên VPS. Không in password/connection string.
9. DNS/TLS/HTTP read-only checks cho domain chính thức từ VPS và từ máy local nơi phù hợp.
10. Xác minh không trùng thư mục, port, service/task, Nginx block, DB/role, log/backup với DamSanV5 hoặc hệ thống nội trú.

Output phải là report text/JSON đã redaction, đủ để ChatGPT review. Script phải fail closed khi không xác minh được identity của tài nguyên.

## Phase B — Repository CD implementation

Chỉ sau khi inventory đã được người dùng chạy và kết quả được đưa vào task/review, triển khai:

### 1. Production workflow

Tạo `.github/workflows/deploy-production.yml`:

- trigger duy nhất: `workflow_dispatch`;
- GitHub Environment: `production`;
- `permissions`: tối thiểu, mặc định `contents: read`, thêm `actions: read` nếu cần kiểm CI;
- `concurrency`: một production deployment tại một thời điểm, không cancel deployment đang chạy;
- inputs bắt buộc:
  - `commit_sha` full 40-char;
  - `confirmation` phải đúng `DEPLOY-BAOGIANG-PRODUCTION`;
  - `run_migrations` boolean nhưng lần đầu phải true nếu database chưa có migrations;
- xác minh `commit_sha` là commit tồn tại, reachable từ `origin/main`, không phải branch/tag tùy ý;
- xác minh CI workflow `CI` của exact target commit đã `completed/success`; fail closed nếu không chứng minh được;
- log phải in exact target SHA, không in secret;
- dùng official GitHub actions; không dùng third-party SSH action. Dùng OpenSSH CLI tích hợp runner với known-host pinning;
- SSH host key phải lấy từ GitHub Environment secret/variable đã pin, không dùng `StrictHostKeyChecking=no`;
- private key ghi vào file tạm với permission chặt và xóa ở `always()`;
- checkout control plane (workflow/scripts) và target application commit vào hai thư mục riêng;
- package source từ exact target commit, không gồm `.git`, `.env`, test output, node_modules hoặc local config;
- checksum package trước/sau transfer;
- remote command gọi versioned PowerShell deploy script và trả exit code chính xác;
- upload redacted deploy report; không upload env/database backup.

### 2. Required GitHub Environment configuration

Tạo tài liệu `docs/operations/PRODUCTION-ENVIRONMENT-CONFIGURATION.md` liệt kê nhưng không chứa giá trị thật:

Secrets tối thiểu dự kiến:

- `PROD_SSH_HOST`
- `PROD_SSH_PORT`
- `PROD_SSH_USER`
- `PROD_SSH_PRIVATE_KEY`
- `PROD_SSH_HOST_KEY`

Variables tối thiểu, chỉ sau inventory:

- `PROD_BAOGIANG_ROOT`
- `PROD_SERVICE_KIND` (`scheduled-task` hoặc `service`)
- `PROD_SERVICE_NAME`
- `PROD_ENV_FILE`
- `PROD_NGINX_EXE`
- `PROD_NGINX_CONFIG`
- `PROD_PG_DUMP_EXE`
- `PROD_BASE_URL=https://baogiang.dtnt-damsan.edu.vn`

Workflow phải validate mọi value không rỗng và reject path không absolute hoặc service name không đúng inventory.

### 3. Windows deployment scripts

Tạo project-owned scripts dưới `scripts/deploy/windows/`:

- `production-preflight-readonly.ps1`
- `install-release.ps1`
- `backup-database.ps1`
- `run-migrations.ps1`
- `switch-current-release.ps1`
- `restart-baogiang-api.ps1`
- `test-production-health.ps1`
- `rollback-release.ps1`
- `invoke-production-deploy.ps1`

Yêu cầu chung:

- `Set-StrictMode -Version Latest`, `$ErrorActionPreference='Stop'`;
- parameters typed và validated;
- exact release root: `<root>\releases\<full-sha>`;
- shared env/log/backup nằm ngoài release;
- source archive checksum verification;
- `npm ci` từ lockfile; `prisma generate`; `npm run build`;
- production startup entry point đúng `apps/api/dist/apps/api/src/main.js` hoặc output thật sau build, phải kiểm file tồn tại;
- frontend static root là `apps/web/dist` của release/current pointer;
- env file server-side được load mà không echo value; validate required production vars, AI/Web Push false, API loopback 3100, trust proxy 1, secure cookie true, exact CORS/domain;
- database backup trước migration bằng `pg_dump` custom format hoặc format đã xác minh; file backup timestamped, ACL phù hợp, checksum và size > 0;
- `prisma migrate status` pre-check và `prisma migrate deploy` khi được phép;
- không seed tự động production;
- không tự bootstrap admin trong workflow;
- switch current release atomic bằng junction/symlink hoặc phương án Windows đã kiểm chứng;
- restart đúng service/task Báo giảng theo inventory; xác minh command line/PID trước và sau;
- health checks:
  - local API live `http://127.0.0.1:3100/api/health/live`;
  - local ready `http://127.0.0.1:3100/api/health/ready`;
  - public `https://baogiang.dtnt-damsan.edu.vn/api/health/live` và ready;
  - public frontend/status route;
- retry bounded với timeout, không sleep vô hạn;
- on failure sau switch/restart: rollback code pointer và restart đúng Báo giảng; recheck health;
- migration rollback không được giả vờ tự động. Nếu migration đã áp dụng và health fail, report phải nêu rõ database migration state và dừng theo runbook. Chỉ code rollback khi schema tương thích; không chạy SQL đảo ngược tự phát;
- giữ ít nhất current + previous release; cleanup chỉ release cũ hơn retention và không bao giờ xóa current/previous hoặc backup.

### 4. Nginx and service bootstrap runbook

Tạo manual runbook cho lần đầu, nhưng không tự chạy trong Codex:

- pre-check identity;
- tạo dedicated directories/ACL nếu chưa có;
- tạo server-side production env file template và cách người dùng điền secret trực tiếp trên VPS;
- cấu hình hoặc xác minh `BaoGiangBackend` Scheduled Task/service;
- cấu hình Nginx server block riêng cho domain, static SPA fallback, `/api` reverse proxy tới 127.0.0.1:3100, forwarded headers và request limits hợp lý;
- `nginx -t` trước reload; reload riêng, không stop toàn bộ Nginx;
- PostgreSQL database/role least privilege và extension/migration preconditions;
- backup và restore drill command;
- one-time technical admin bootstrap sau health xanh, dùng password nhập trực tiếp trên VPS, không log/commit;
- explicit stop points để người dùng gửi output cho ChatGPT trước bước mutation tiếp theo.

Không được giả định hạ tầng đã tồn tại. Runbook phải phân nhánh rõ `EXISTS AND VERIFIED` / `MISSING` / `CONFLICT`.

## Static and test gates

Tạo tests/scripts để fail khi deployment code chứa:

- `StrictHostKeyChecking=no`;
- wildcard host key;
- hardcoded password/token/private key/connection string;
- `prisma migrate reset`, `prisma db push`, production seed;
- `taskkill /IM node.exe`, reboot, PostgreSQL restart, DamSanV5/boarding stop;
- generic Nginx stop/restart;
- unbounded retry/sleep;
- deploy trigger on push;
- missing exact SHA/confirmation/environment/concurrency;
- paths or task names not parameterized/validated.

Wire static deploy verification into root scripts and CI. Add unit-style PowerShell/Pester tests where practical, otherwise deterministic fixture/self-test scripts. Existing CI gates remain green.

## First deployment acceptance gates

Không kích hoạt production workflow cho đến khi ChatGPT review độc lập và merge CD PR. Sau merge, first deploy chỉ được chạy khi:

1. read-only inventory reviewed PASS;
2. GitHub Environment `production` secrets/variables configured and host key pinned;
3. server-side env file exists with strict ACL and passes redacted validation;
4. dedicated root/service/Nginx/DB/role/log/backup identity verified;
5. exact application target SHA approved;
6. exact target CI successful;
7. database backup completes and is verifiable;
8. migration plan reviewed;
9. rollback previous state recorded;
10. public domain/TLS available.

## Scope allowed

- `.github/workflows/deploy-production.yml`
- `scripts/deploy/windows/**`
- deployment static tests/scripts
- root package scripts needed for gates
- `docs/operations/**`
- `docs/decisions/**` only if a new deployment ADR is justified
- task and phase/deployment report
- `.gitignore` only for deployment-local artifacts if needed.

## Scope forbidden

- business features/UI changes;
- API/auth/authorization semantic changes;
- Prisma schema or existing migration changes;
- production data mutation outside approved migration/bootstrap steps;
- deployment from local working tree;
- automatic push-to-production;
- edits to DamSanV5/boarding resources;
- commit of `.codex/config.toml` or any secret.

## Required report and stopping behavior

Codex must:

1. audit and report missing inventory first;
2. implement repository CD only against verified inventory values or parameterized fail-closed placeholders;
3. run all existing CI-equivalent gates plus deploy static tests;
4. inspect staged files and secret scan;
5. commit and push branch;
6. report final HEAD, changed files, tests, remaining manual production prerequisites;
7. not create PR, merge, configure GitHub secrets, access VPS, run migrations or deploy;
8. stop after push for ChatGPT independent review.
