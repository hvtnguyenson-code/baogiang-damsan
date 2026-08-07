# CÔNG CỤ THỰC THI: CODEX

## Task

`PHASE-01-PRODUCTION-CD-FIRST-DEPLOY-CORRECTION-003`

Repository: `D:\baogiang-damsan`  
Branch bắt buộc: `ops/phase-01-cd-first-deploy`  
Reviewed implementation HEAD: `4ca63fc085b7119383f3f8b0dd9469031d4696c4`  
Base `main`: `42d56d420f22cfaf77947f4eb46b283da06965de`

## Verdict

Correction-002 cải thiện đúng hướng nhưng **chưa đủ điều kiện mở PR hoặc chạy trên VPS**. Independent review đã xác định các lỗi runtime/workflow chắc chắn và một số fail-closed semantics còn thiếu. Đây phải là correction tổng hợp cuối cho repository delivery chain trước PR/authoritative CI.

Không sửa lẻ từng finding. Audit lại toàn bộ chain sau khi sửa và bổ sung deterministic tests để chính các lỗi dưới đây không thể tái diễn.

## Bối cảnh thực tế bắt buộc

- Ứng dụng Báo giảng Đam San hiện chỉ chạy local và lưu mã nguồn trên GitHub.
- Ứng dụng **chưa từng deploy lên VPS**.
- Đây là **first deployment / greenfield bootstrap**, không phải update production.
- Không được giả định VPS đã có current/previous release của Báo giảng.
- VPS có các hệ thống khác, đặc biệt DamSanV5 / Quản lí nội trú; tuyệt đối không tác động tài nguyên của chúng.

## Safety gate

Trước khi sửa:

1. Đúng repository và branch.
2. `git status -sb`; tracked tree sạch, chỉ `.codex/config.toml` untracked.
3. HEAD chứa `4ca63fc085b7119383f3f8b0dd9469031d4696c4` và packet này.
4. Divergence không behind.
5. Không đọc/sửa/xóa/stage/commit `.codex/config.toml`.
6. Không reset, clean, stash, rebase, amend, squash hoặc force-push.
7. Không truy cập VPS, GitHub production secrets, production DB; không inventory, migration, deploy, PR hoặc merge.

---

## Finding 1 — workflow chắc chắn fail vì shell dùng `PROD_BAOGIANG_ROOT` nhưng step không có env

Trong `.github/workflows/deploy-production.yml`:

- step `Upload reviewed transfer bundle through SFTP` dùng `PROD_BAOGIANG_ROOT` để tạo `root_sftp` nhưng env mapping của step không khai báo biến này;
- step `Execute explicit PowerShell deploy contract` cũng dùng `PROD_BAOGIANG_ROOT` nhưng không khai báo vào env.

Với `set -euo pipefail`, đây là lỗi `unbound variable` chắc chắn.

### Yêu cầu

1. Sửa env mapping của mọi step dùng `PROD_BAOGIANG_ROOT` hoặc biến production khác.
2. Audit **toàn bộ deploy workflow**, không chỉ hai step trên: mọi shell reference tới `PROD_*` phải có nguồn rõ ràng ở chính step env hoặc job/global env được chủ đích cho phép.
3. Không đưa secret vào global env chỉ để vượt test.
4. `verify-workflow-contract.cjs` phải có structural check để bắt lỗi “shell dùng production variable nhưng step không khai báo/không có nguồn”. Không chỉ assert token xuất hiện ở đâu đó trong file.
5. Thêm negative fixture có step cố ý dùng biến thiếu env và chứng minh validator fail.

---

## Finding 2 — first-deploy failure gọi helper không tồn tại

`invoke-production-deploy.ps1` gọi:

`Stop-ExactBaoGiangRuntime -Marker ...`

nhưng `deployment-common.ps1` ở reviewed HEAD không định nghĩa function này. Vì vậy health/restart failure trên first deploy sẽ đi vào catch, cố gọi command không tồn tại, ghi `firstDeployStopFailed`, rồi để runtime lỗi có thể tiếp tục tồn tại.

### Yêu cầu

Tạo **một implementation thực sự** cho safe-stop, dùng lại ở first-deploy failure path và nơi phù hợp khác.

Contract tối thiểu:

1. Xác minh marker/task/service exact identity trước mutation.
2. Scheduled Task:
   - đúng exact task name + task path + account + single action + wrapper arguments + working directory;
   - không dùng wildcard stop;
   - nếu bootstrap contract là demand-only, verify zero automatic triggers hoặc exact reviewed trigger contract; không để task tự bật lại ngoài ý muốn sau first-deploy failure.
3. Windows Service:
   - exact service name/path/account đã inventory/marker xác minh;
   - không stop service khác.
4. Stop đúng runtime Báo giảng; không `taskkill /IM node.exe`, không kill generic Node.
5. Bounded verify sau stop:
   - zero exact Báo giảng API process;
   - zero listener port 3100;
   - nếu port 3100 còn listener khác thì report conflict, tuyệt đối không kill process đó.
6. Return structured non-secret result cho deploy report.
7. Không dựa vào stale `$LASTEXITCODE` sau PowerShell cmdlet/script invocation.

### Test bắt buộc

Windows fixture phải dot-source helper và chứng minh `Get-Command Stop-ExactBaoGiangRuntime` tồn tại.

Tốt hơn: mock `Get-ScheduledTask` / `Get-NetTCPConnection` / `Get-CimInstance` / stop cmdlets bằng deterministic PowerShell functions để test:

- exact task accepted;
- mismatched task/action/account rejected;
- foreign port owner rejected, không bị kill;
- zero process/listener sau exact stop mới PASS.

---

## Finding 3 — first-deploy failure để `current` trỏ vào release hỏng, phá semantics của lần retry

Hiện tại khi first deploy đã switch/restart rồi health fail và không có previous release, code chỉ cố stop runtime rồi ghi `firstDeployFailedStopped`. Pointer `current` vẫn có thể trỏ vào release vừa thất bại.

Lần deploy sau sẽ thấy `current` tồn tại và có thể coi release hỏng đó là `previousRelease`; `switch-current-release.ps1` sau đó có thể chuyển nó sang `previous`, biến release đã biết hỏng thành rollback target.

### Yêu cầu

Thiết kế explicit **first-deploy failed release quarantine**:

1. Sau khi exact runtime đã stop thành công, kiểm chứng `current` là reparse point trỏ đúng `<root>\releases\<failedSha>`.
2. Không xóa release directory.
3. Tách pointer hỏng khỏi `current`:
   - ưu tiên move exact `current` junction sang một pointer quarantine có identity rõ, ví dụ `failed-release`, hoặc strategy tương đương;
   - nếu `failed-release` đã tồn tại, fail closed và yêu cầu operator inspection, không overwrite.
4. Sau first-deploy failure thành công:
   - `current` không còn tồn tại;
   - `previous` không được tạo từ failed release;
   - runtime stopped;
   - port 3100 free;
   - report ghi failed release SHA và quarantine pointer.
5. Retry greenfield phải tiếp tục coi trạng thái này là **không có previous healthy release**.
6. Không bao giờ rollback tự động về pointer đã được đánh dấu failed/quarantine.
7. Nếu migration đã attempted, report giữ state `attemptedUnknown` hoặc completed evidence tương ứng; không tuyên bố DB rollback.

### Test bắt buộc

Windows temp-junction fixture phải mô phỏng:

- first deploy no `current`/`previous`;
- switch target A;
- simulated health failure;
- quarantine A;
- verify no `current`, no `previous`, failed pointer -> A;
- retry target B không được coi A là previous healthy release.

---

## Finding 4 — cleanup `if: always()` có thể xóa cả `<root>\incoming` khi handshake không tạo output

Current cleanup lấy:

`transfer='${{ steps.handshake.outputs.transfer_name }}'`

rồi build path `<root>\incoming\$transfer` và `Remove-Item -Recurse -Force`.

Nếu handshake fail trước khi set output, `transfer_name` có thể rỗng. Khi đó cleanup có nguy cơ nhắm vào chính `<root>\incoming`, xóa mọi transfer/evidence đang có.

Đây là fail-closed blocker nghiêm trọng.

### Yêu cầu

1. Cleanup remote chỉ được chạy khi transfer name tồn tại **và** match exact regex:
   `^control-[0-9]+-[0-9]+-[0-9a-f]{40}$`.
2. Recompute candidate path và xác minh:
   - canonical parent chính xác là `<root>\incoming`;
   - candidate khác `<root>\incoming`;
   - candidate là direct child đúng transfer name;
   - marker/root handshake vẫn đúng trước delete nếu remote reachable.
3. Nếu handshake không sinh transfer name: **skip remote cleanup**, chỉ cleanup local key/temp files.
4. Không dùng fallback path rộng hơn.
5. Không nuốt lỗi destructive-path validation.
6. Có negative workflow/command-builder fixture: empty transfer name, malformed transfer name, root/incoming target đều bị reject và không phát sinh `Remove-Item -Recurse` cho parent.
7. Cleanup script/encoded command nên được build bằng reviewed helper thay vì ad-hoc quoting lặp lại nếu làm vậy giảm ambiguity.

---

## Finding 5 — SFTP path contract chưa test với Windows paths có khoảng trắng và quoting

Windows fixture hiện test encoded command với path có spaces/unicode, nhưng SFTP batch commands được tạo bằng `printf 'put %s %s\n' ...` không quote path. Nếu reviewed production root hoặc runner path chứa whitespace, SFTP có thể parse thành nhiều field.

### Yêu cầu

1. Chọn một contract rõ:
   - hoặc hỗ trợ Windows root có spaces bằng SFTP batch quoting/escaping đúng và deterministic;
   - hoặc fail closed từ environment validation bằng một documented restricted root charset phù hợp first deployment.
2. Không để workflow “hỗ trợ path có spaces” ở PowerShell nhưng silently fail ở SFTP.
3. Viết helper/test cho Windows-root → SFTP path conversion.
4. Test ít nhất:
   - `C:\baogiang`;
   - path có spaces nếu contract cho phép;
   - malformed drive/path;
   - CR/LF/quote injection bị reject.
5. Verify remote destination vẫn nằm dưới exact unique `<root>\incoming\<transfer>`.

---

## Finding 6 — behavioral/Windows tests chưa bắt các lỗi thực sự vừa xảy ra

Current Windows fixture chỉ kiểm path/junction primitive, encoded handshake và stale `$LASTEXITCODE`. Nó không bắt:

- missing `PROD_BAOGIANG_ROOT` step env;
- undefined `Stop-ExactBaoGiangRuntime`;
- first-deploy failed `current` pointer becoming future `previous`;
- empty cleanup transfer deleting incoming parent;
- SFTP quoting/path conversion.

### Yêu cầu

Mở rộng tests thành contract/behavior tests thực chất cho toàn bộ các finding trên.

Không được giải quyết bằng cách chỉ thêm regex kiểu `assert.match(source, /Stop-ExactBaoGiangRuntime/)`. Ít nhất function phải được dot-source/resolve và path/junction transition phải chạy thật trên `windows-latest` hoặc local Windows safe temp dirs.

Workflow validator phải kiểm step-level env source, không chỉ file-level token presence.

CI `deployment-windows-contract` phải tiếp tục chạy trên `windows-latest`; không production access.

---

## Finding 7 — phase report đang overclaim local gates

User/Codex final report cho reviewed HEAD `4ca63fc...` ghi:

- Build: **BLOCKED** — local timeout sau khi bắt đầu build;
- Prisma generate: **PASS**;
- Prisma validate: **BLOCKED** — local thiếu `DATABASE_URL`;
- migration/integration/E2E: chưa chạy local, cần isolated CI.

Nhưng committed `PHASE-01-PRODUCTION-CD-FIRST-DEPLOY-REPORT.md` hiện ghi Build PASS, Prisma validate PASS và Prisma generate NOT_RUN.

### Yêu cầu

1. Sửa report theo bằng chứng thật của exact correction run.
2. Phân biệt rõ:
   - LOCAL PASS;
   - LOCAL BLOCKED;
   - NOT_RUN;
   - AUTHORITATIVE CI PASS/FAIL/PENDING.
3. Không biến timeout/missing env thành PASS.
4. Sau correction-003, report final gate của chính correction-003, không copy trạng thái cũ không còn đúng.

---

## Finding 8 — inventory verification phải giữ semantic honesty trước first deploy

`production-preflight-readonly.ps1` đã giảm overclaim cho directories, nhưng audit lại các phần sau:

1. PostgreSQL `EXISTS AND VERIFIED` chỉ khi query trả actual database/role và code **so sánh actual** với expected reviewed `baogiang` / `baogiang_app` (hoặc explicit parameters), không chỉ lấy tên từ DATABASE_URL rồi discard query output.
2. Required extensions và `_prisma_migrations` state phải được report bằng actual read-only evidence hoặc `NOT_VERIFIED`/`NOT_RUN`.
3. Nginx direct config/reference extraction không được tự suy thành complete server-block/include-chain verification nếu include chain chưa parse.
4. DNS/TLS/HTTP chỉ dùng `EXISTS AND VERIFIED` cho những thuộc tính thực sự được kiểm. Nếu certificate SAN/domain mapping hoặc DNS records chưa được capture/validated, state phải nói `REQUIRES_REVIEW`/`PARTIAL`/`NOT_VERIFIED` phù hợp.
5. `KnownForeignName` nếu không được programmatically checked thì không được dùng để claim isolation PASS.
6. Không xuất raw unrelated process command line hoặc secret-bearing values.

Inventory vẫn là **read-only** và chưa được chạy trên VPS trong task này.

---

## Finding 9 — audit runtime bundle/update contract

Correction-002 đưa startup wrapper + `deployment-common.ps1` thành immutable bootstrap bundle có marker hashes. Giữ nguyên nguyên tắc tốt này nhưng audit:

1. Deployment-time transferred helper có thể khác installed runtime helper; code phải hiểu đây là hai trust roles khác nhau.
2. First deploy bootstrap phải cài wrapper/helper từ exact reviewed commit, hash marker khớp.
3. Workflow không tự overwrite immutable startup bundle trong normal deploy.
4. Nếu tương lai startup bundle cần đổi, phải là explicit bootstrap/update operation riêng, không silently update trong app deployment.
5. Docs/runbook phải nói rõ contract này để operator không copy nhầm transferred helper vào shared runtime folder.

---

## Finding 10 — final workflow safety audit

Sau khi sửa các blocker cụ thể, audit toàn bộ `.github/workflows/deploy-production.yml` lần nữa:

- `workflow_dispatch` only;
- protected `production` environment;
- exact 40-char target reachable from main;
- exact target authoritative CI success;
- deterministic git archive ZIP;
- no untracked/local source;
- pinned known-hosts exact host/port/key type;
- no `StrictHostKeyChecking=no`;
- marker handshake before root mutation;
- unique transfer direct child;
- SFTP deterministic;
- explicit `powershell.exe -EncodedCommand`;
- non-secret parameter JSON;
- report retrieval mandatory after remote execution;
- cleanup fail closed;
- no env/database dump upload;
- no production DB in CI;
- no generic process/service stop;
- no interaction with DamSanV5/boarding resources.

---

## Allowed scope

Có thể sửa:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-production.yml`
- `scripts/ci/*deployment*`
- `scripts/ci/*workflow*`
- `scripts/deploy/windows/*.ps1`
- production CD runbook/environment contract/report
- `package.json` nếu cần thêm safe test script

Không sửa business UI/API/auth/schema/migrations trừ khi một test harness thuần deployment thực sự cần import/type support và không thay business behavior.

Không thêm production migration.

---

## Required quality gates

Chạy tất cả gate an toàn có thể chạy:

1. deployment static;
2. deployment behavioral;
3. workflow contract + negative fixtures;
4. PowerShell parser;
5. Windows deployment fixture local nếu Windows cho phép;
6. schema static;
7. secret scan;
8. UI static;
9. lint;
10. typecheck;
11. unit tests;
12. build;
13. Prisma generate;
14. Prisma validate với **isolated/local test DATABASE_URL only if available**; nếu không, BLOCKED chính xác;
15. migration/integration/E2E chỉ trên isolated test environment;
16. `git diff --check`;
17. changed/staged file inspection;
18. staged secret scan.

Không dùng production để vượt local blocker.

Authoritative Linux PostgreSQL/integration/E2E và Windows deployment job phải được xác minh bằng GitHub CI sau push/PR; local PASS không thay thế authoritative CI.

---

## Before commit

Audit exact diff từ `4ca63fc085b7119383f3f8b0dd9469031d4696c4`:

- scope;
- workflow step env references;
- destructive cleanup targets;
- first-deploy pointer state;
- exact runtime-stop semantics;
- junction/reparse containment;
- secret exposure;
- neighboring-system risk;
- report accuracy.

`.codex/config.toml` phải vẫn untracked và untouched.

---

## Completion

Nếu các local-safe gates đạt hoặc blocker môi trường được ghi đúng:

1. commit correction-003 trên cùng branch;
2. push origin;
3. không tạo PR;
4. không merge;
5. không chạy VPS inventory;
6. không deploy.

Dừng sau push.

Final report phải có:

- final HEAD;
- divergence;
- exact changed files;
- từng finding đã xử lý thế nào;
- kết quả từng gate;
- authoritative CI state nếu nhìn thấy được, nếu chưa thì `PENDING`;
- remaining production inventory;
- xác nhận không chạm VPS/secrets/production DB/deploy;
- xác nhận `.codex/config.toml` untracked/untouched.
