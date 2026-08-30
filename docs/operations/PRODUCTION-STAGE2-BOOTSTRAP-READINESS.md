# Production Stage 2 Bootstrap Readiness Audit

Status: Candidate — P0-4 CLOSED CANDIDATE; Stage 2 overall NO-GO
Baseline: 5ff81b6e5ea26d1082130de6fea7985a00c41406

## 1. Scope

Tài liệu này audit contract Stage 2 tại canonical baseline nêu trên. Phạm vi chỉ gồm repository authority, desired state, verifier, failure behavior và activation lifecycle. Audit không truy cập VPS, không đọc production environment, không tạo root/ACL/task/service, không sửa Nginx, không migration và không deploy.

Các giá trị thực tế của VPS vẫn là `OPERATOR VERIFICATION REQUIRED`. CI xanh chỉ chứng minh control plane hiện tại vượt qua test hiện có; nó không tự chứng minh bootstrap production sẵn sàng.

## 2. Existing Stage 2 architecture

Stage 2 hiện là **manual instructions only**, có các verifier read-only và controller deploy source-controlled ở giai đoạn sau. Không có source-controlled Stage 2 executor, manifest generator hoặc desired-state validator hoàn chỉnh.

| Bootstrap operation | Source-controlled implementation | Manual only | Verifier hiện có | Rollback/recovery |
|---|---|---|---|---|
| Dedicated root | Không có creator | Có | `Assert-DedicatedRoot`; PASS 2 snapshot | Operator sửa/xóa theo review riêng |
| Required subdirectories | Không có creator | Có | `Read-DeploymentIdentity` kiểm tra tồn tại | Không có bootstrap recovery |
| ACLs | Không có policy/creator | Có | PASS 2 chỉ xuất ACL để review | Không có |
| Startup bundle | Không có installer | Có | Exact sibling path, file existence và SHA-256 | Không có update/rotation procedure |
| Identity marker | Không có generator | Có | `Read-DeploymentIdentity`, handshake và runtime verifier, nhưng schema chưa đầy đủ | Operator correction |
| Production environment | Không có creator | Có | `Import-ServerEnvironment`, nhưng chưa có standalone pre-first-deploy validator | Không có cleanup tổng quát |
| Scheduled Task | Không có register/enable implementation | Có | Exact name/account/action checks | Safe-stop disable/stop; không có re-enable path |
| Windows Service | Không có service host/install implementation | Có | Exact name/account/`PathName` checks | Safe-stop disable/stop; không có startup-type recovery |
| Nginx config | Không có template/generator | Có | Discovery/PASS 2 partial snapshot; controller chạy `nginx -t` | Targeted reload/restore do operator, chưa thành contract |
| Runtime activation | Có restart controller | Không | Exact process/port bounded check | Rollback/safe-stop có, nhưng lifecycle disabled không khép kín |

Manual bootstrap không tự thân là defect. Defect xuất hiện khi manual step không có desired state đủ chính xác, verifier độc lập hoặc failure/recovery transition xác định.

## 3. Root/ACL findings

`Assert-DedicatedRoot` chặn drive root, Windows/system paths và tên/path thuộc DamSanV5/boarding; release pointers được giới hạn vào direct child SHA dưới `releases`. Tuy nhiên root và sáu thư mục bắt buộc chỉ được canonicalize bằng đường dẫn và kiểm tra tồn tại. Reparse point của root/subdirectories không bị fail-closed trong `Read-DeploymentIdentity`; PASS 2 chỉ đưa reparse target và ACL vào report để operator review.

Repository chưa có:

- ACL policy authority mô tả identity-to-rights và inheritance mong muốn;
- ACL verifier so desired state với effective ACL;
- ACL creation/correction mechanism;
- source-controlled quyền riêng cho marker, env, backup và immutable startup bundle.

Vì không được invent account, policy phải nhận các identity đã review làm input và chỉ xuất plan/diff không chứa secret. Trạng thái thực của inherited ACL, deployment identity, runtime identity, backup, env và bundle là `OPERATOR VERIFICATION REQUIRED`.

Kết luận: path isolation có guard hữu ích, nhưng root/subdirectory/ACL bootstrap chưa deterministic. Mức **P1**.

## 4. Marker authority matrix

Authority được đối chiếu giữa `PRODUCTION-ENVIRONMENT-CONFIGURATION.md`, `Read-DeploymentIdentity`, pre-transfer handshake, `invoke-production-deploy.ps1` và startup/restart logic.

| Marker field | Documented | `Read-DeploymentIdentity` | Handshake | Controller/runtime | Kết luận |
|---|---|---|---|---|---|
| `systemId` | Required exact | Exact | Exact | Inherited from reader | Strong |
| `canonicalRoot` | Required exact | Exact normalized | Exact case-insensitive | Dedicated-root guard | Strong, nhưng không resolve root reparse |
| `domain`, `apiPort` | Exact domain/3100 | Exact | Exact | Base URL/port guards | Strong |
| `envFile`, `startupWrapper`, `entryPoint` | Required paths | Exact against inputs | Không kiểm | Exact against workflow inputs | Binding mạnh khi inputs đầy đủ |
| `startupBundle.*` | Paths + hashes | Non-empty, sibling, existing leaf, exact hashes | Không kiểm | Reader chạy trước business-critical mutation | Runtime verification mạnh; provenance commit/ACL/update policy thiếu |
| `foreignIsolation` | 4 nested evidence fields | Chỉ kiểm property tồn tại | Không kiểm | Không đọc nested evidence | `{}` pass; **P0** |
| `nginxExe`, `nginxConfig` | Required exact paths | Chỉ kiểm property tồn tại | Không kiểm | Chỉ compare khi marker value truthy | `""` bypass marker binding; **P0** |
| `nodeExe` | Required exact path | Không require/compare | Không kiểm | Listener check chỉ compare nếu truthy; restart dùng workflow input riêng | Missing/empty bypass marker Node authority; **P0** |
| Scheduled Task `kind`, `name` | Required | Exact against non-empty inputs | Exact | Exact | Strong |
| Task `taskPath` | Required exact | Không validate completeness | Không kiểm | Compare có điều kiện; safe-stop lại cần exact value | Empty có thể bypass verifier rồi làm recovery không khả thi; **P0** |
| Task `account`, `execute`, `arguments`, `workingDirectory` | Required exact | Không validate non-empty/type | Không kiểm | So actual values; arguments không được semantic-bind độc lập với wrapper | Incomplete schema; một số empty value chỉ bị loại tình cờ bởi host state, không bởi contract |
| Service `account/startName`, `pathName` | Required exact | Không validate completeness | Không kiểm | Exact actual comparison | Không có discriminated schema hoặc non-empty validation |
| Unknown properties | Không định nghĩa | Được chấp nhận | Được chấp nhận | Bị bỏ qua | Schema drift/ambiguous fields không bị reject |
| `schemaVersion` | Không có | Không có | Không có | Không có | Cần thiết kế/versioning trước khi thêm, không tự thêm trong audit |

`foreignIsolation` empty object pass vì reader chỉ dùng `PSObject.Properties.Name.Contains('foreignIsolation')`. `nginxExe`/`nginxConfig` empty pass reader và làm comparison có điều kiện trong controller bị bỏ qua. `nodeExe` không nằm trong required-property loop và listener verifier coi thiếu value là match. Đây là marker-authority bypass được GO rule chỉ rõ, nên Stage 2 bắt buộc NO-GO.

Correction phải dùng một discriminated, versioned marker schema được định nghĩa và test trước khi cân nhắc thêm `schemaVersion`: reject missing/empty/wrong-type/unknown fields; validate absolute existing leaves phù hợp boundary; validate four `foreignIsolation` fields; bind exact Node/Nginx/env/wrapper/entry point; và tách schema task/service.

## 5. Startup bundle findings

Authority yêu cầu operator copy `start-baogiang-api.ps1` và sibling `deployment-common.ps1` từ cùng exact reviewed GitHub commit vào immutable shared location, ghi absolute paths/SHA-256 vào marker rồi review ACL. Reader thực sự kiểm tra sibling relationship, tồn tại và hash của cả hai file.

Điểm chưa được source-control hóa:

- command lấy file từ exact commit và chứng minh source provenance;
- canonical destination layout;
- ACL desired state và immutability verifier;
- behavior khi destination đã tồn tại;
- atomic install, overwrite refusal, update/rotation và recovery;
- evidence liên kết reviewed commit SHA với bundle hashes.

Vì vậy **operator manual copy hiện là cơ chế tạo bundle lần đầu**. Runtime hash verification giảm tampering risk, nhưng initial creation/update vẫn dễ sai và không reproducible. Mức **P1**; normal deployment không được silently replace bundle.

## 6. Environment validation findings

Preliminary finding được xác nhận: `start-baogiang-api.ps1` gọi `Read-DeploymentIdentity` → `Import-ServerEnvironment` → yêu cầu current API entry point tồn tại → chạy Node. Trước first deploy, `current` được phép chưa tồn tại, nên startup wrapper không thể cho một clean environment-only PASS.

Không có standalone production env validator. `Import-ServerEnvironment` kiểm tra duplicate/unknown/forbidden variables và các safety invariants mà không echo values, nhưng nó set từng process variable trước khi toàn bộ file/invariants đã pass. Ngoài `TZ`, các safety variables không được yêu cầu phải xuất hiện trong `$seen`; invariant đọc trực tiếp `$env:*`, nên một file thiếu field có thể thừa hưởng giá trị đã tồn tại trong process và pass không sạch. Nếu lỗi sau import hoặc trước Node start, wrapper không có `finally`; `Clear-PostgresProcessEnvironment` chỉ chạy sau Node exit và chỉ xóa năm `PG*` variables, không xóa các biến đã import. Trong process riêng, process termination giới hạn lifetime; repository vẫn chưa contract/test isolation mode hoặc cleanup-on-failure, nên operator có tín hiệu và side-effect semantics mơ hồ.

Correction **P0**: tạo validator độc lập chỉ đọc exact env file trong child process cô lập, parse/validate toàn bộ trước khi apply, không phụ thuộc marker current/entry point/Node start, không xuất tên/value nhạy cảm ngoài redacted category, luôn cleanup trong `finally`, và có fixtures cho success, parse failure, invariant failure, secret-redaction và no-current state.

## 7. Scheduled Task lifecycle state machine

P0-3 authority hóa một contract duy nhất: Scheduled Task có đúng một enabled `MSFT_TaskBootTrigger`/`AtStartup` trigger, không có trigger bổ sung. Shared verifier kiểm exact task name/path/account/action/wrapper/working directory và trigger; scheduler state Disabled là lifecycle state hợp lệ, không phải identity failure.

| State | Enabled | Running | Automatic trigger | `current` | Runtime expected | Repository transition/evidence |
|---|---|---|---|---|---|---|
| BOOTSTRAP | No | No | One enabled Boot trigger, whole task disabled | No | No | Exact verifier accepts configuration-valid Disabled task |
| FIRST DEPLOY AFTER SWITCH | Explicit controller authorization | Starts after enable/reverify | One enabled Boot trigger | Yes | Yes | verify → enable → reverify → start → bounded process/port proof |
| HEALTHY | Yes | Yes | One enabled Boot trigger | Yes | Yes | Exact Báo giảng process owns port 3100; scheduler starts task after reboot |
| FIRST-DEPLOY FAILURE | No | No | Trigger remains in definition, task disabled | Quarantined; no `current` | No | Disable → stop → bounded verification → Disabled re-fetch |
| POST-MIGRATION FAILURE WITHOUT ROLLBACK APPROVAL | No | No | Trigger remains in definition, task disabled | Failed current giữ lại | No | Fail-safe stop; no automatic re-enable |
| ROLLBACK SUCCESS | Yes, explicit controller authorization | Yes | One enabled Boot trigger | Previous release | Yes | Same shared verifier and activation state machine |
| NEXT DEPLOY AFTER QUARANTINE | Enabled only through explicit reviewed activation | Yes after health proof | One enabled Boot trigger | After reviewed switch | Yes | Deterministic recovery path |
| SERVER REBOOT | Yes in HEALTHY state | Scheduler starts exact task | One enabled Boot trigger | Prior healthy release | Yes | Repository-wide reboot-persistence contract |

`restart-baogiang-api.ps1` từ chối Scheduled Task khi thiếu `-AllowScheduledTaskActivation`, trước mọi lifecycle mutation. Activation failure sau khi đã bắt đầu phải gọi shared safe-stop; nếu cleanup thất bại, controller báo riêng failure cleanup. Không cho phép operator ad-hoc enable nằm ngoài controller/evidence. P0-3 là closure candidate cho lifecycle Scheduled Task; Stage 2 vẫn chưa GO vì P0-4 và các P1/P2 khác.

## 8. Windows Service readiness

P0-4 là **CLOSED CANDIDATE**: production CD chỉ chấp nhận `scheduled-task`; verified-first-deploy preflight từ chối `service`; và deploy controller từ chối `service` khi chưa có `current` trước mutation business-critical. Generic Service code/schema vẫn future-compatible và non-authoritative; P0-4 không tạo service host, installer/uninstaller, startup-type policy, recovery policy hoặc reboot architecture.

Windows Service production bootstrap vẫn deferred cho tới khi có reviewed Service architecture, gồm native host authority, installer/uninstaller, exact `PathName`/account/startup-type schema, guarded Disabled-to-approved-startup transition, recovery/reboot tests và rollback procedure.

## 9. Nginx bootstrap findings

Stage 2 yêu cầu dedicated HTTPS block, SPA fallback, `/api` tới `127.0.0.1:3100`, forwarded headers, reviewed limits, exact `nginx -t -c ...` và targeted reload. Repository không có production template/generator hoặc reload helper; operator phải viết/mutate config và reload thủ công.

Read-only discovery thu thập config/include trong reviewed Nginx root và server-block hints; PASS 2 tự mô tả là partial/direct-reference snapshot. Controller chạy exact parameter `nginx -t -c` trước khi move archive/install/database actions, bảo vệ syntax/global configuration tại thời điểm deploy nhưng không chứng minh dedicated block semantics và không reload. Marker exact binding bị bypass nếu Nginx fields empty. Neighbor protection dựa vào PASS 1/PASS 2 operator review, còn nested `foreignIsolation` marker không được validate.

Phân loại:

- read-only validation: có nhưng partial;
- configuration mutation: operator-only, chưa có deterministic plan/template;
- reload mutation: operator-only, targeted command/rollback authority chưa source-controlled.

Sau P0 marker correction, cần **P1** Nginx plan/verify contract: value-free template/schema, include-boundary and neighboring-block diff, exact exe/config/prefix binding, syntax test evidence, targeted reload command plan và restore verification. Không tự sinh production-specific config trong correction audit.

## 10. Handshake boundary

Pre-transfer handshake hiện chỉ kiểm:

1. marker file tồn tại và JSON parse được;
2. exact `systemId`, canonical root, domain và port 3100;
3. exact service kind/name;
4. bootstrapped `incoming` tồn tại.

Sau PASS này workflow mới tạo unique `incoming\control-<run>-<sha>` và upload archive/parameter/scripts. Trước transfer, handshake **không** kiểm bundle hashes, nested `foreignIsolation`, env/startup/Nginx binding, Node identity hoặc runtime action completeness.

Sau upload, `invoke-production-deploy.ps1` chạy reader, runtime identity check, executable existence, env import và `nginx -t` trước khi move archive ra khỏi isolated transfer directory. Vì vậy full-but-currently-incomplete controller validation xảy ra trước archive install, backup, migration, catalog sync, pointer switch và runtime restart. Upload vào isolated `incoming` là bounded staging mutation, không tương đương DB/runtime mutation.

Kết luận: minimal handshake **intentionally sufficient cho isolated transfer risk hiện tại**, với điều kiện unique/contained cleanup vẫn giữ nguyên. Strengthening handshake thành cùng schema validator là **P2 defense-in-depth**, không phải nguyên nhân P0; full validator phải được sửa trước và vẫn bắt buộc chạy lại server-side trước business-critical mutation.

## 11. Manual vs automated bootstrap decision

| Option | Safety | Secret exposure | Reproducibility | Rollback | Operator error | Testability |
|---|---|---|---|---|---|---|
| A. Fully manual + stronger verifier | Mutation blast radius thấp | Thấp nếu discipline tốt | Trung bình/thấp | Phụ thuộc runbook | Vẫn cao | Verifier test được, execution không |
| B. Source-controlled plan/verify; manual mutations | Cao: tool không mutate và operator review exact plan | Thấp; secret chỉ được validate trong isolated process | Cao cho desired state/evidence | Có thể plan/verify before/after và restore plan | Giảm đáng kể | Cao với fixtures và hostile states |
| C. Guarded one-time executor | Có thể cao về lâu dài nhưng blast radius hiện lớn | Cao hơn vì chạm env/ACL/accounts | Cao | Phải xây transaction/compensation phức tạp | Thấp khi hoàn thiện | Cao nhưng cần Windows integration lab |

Recommendation duy nhất: **B — source-controlled plan/verify tool, manual mutations**.

Đây là correction boundary phù hợp hiện tại: source-control hóa schema, desired-state manifest, exact commands/diffs và post-checks nhưng không sở hữu secrets hoặc tự mutate ACL/task/service/Nginx. Chỉ cân nhắc C sau khi B đã ổn định, có Windows lab fixtures, recovery design và phê duyệt riêng.

## 12. GO/NO-GO matrix

| Gate | Evidence | Result |
|---|---|---|
| Desired root/subdirs/ACL state exact | Paths có guard; ACL chỉ operator review | NO-GO |
| Marker complete, non-bypassable | P0 marker-schema correction đã có; vẫn cần plan/verify bootstrap P1 | CLOSED CANDIDATE |
| Clean pre-first-deploy env PASS | Standalone validation contract P0 đã có; VPS evidence vẫn operator-only | CLOSED CANDIDATE |
| Scheduled Task activation/recovery | P0-3 verify → enable → reverify → start, safe-stop và reboot contract | CLOSED CANDIDATE |
| Service first-deploy authority | P0-4 restricted to Scheduled Task; generic Service code remains non-authoritative | CLOSED CANDIDATE |
| Startup bundle deterministic | Hash verification tốt; creation/update manual chưa plan hóa | NO-GO (P1) |
| Nginx deterministic and neighbor-safe | Partial verifier; mutation/reload manual | NO-GO (P1) |
| Transfer boundary proportionate | Minimal handshake trước isolated staging; controller trước critical mutation | GO WITH P2 HARDENING |

Overall: **NO-GO / CORRECTION NEEDED**.

## 13. Required correction slices

Một correction plan duy nhất, theo thứ tự bắt buộc:

### P0 — closed candidates

1. **Marker schema authority:** đã có correction schema/fixture P0; không mở lại schema trong P0-4.
2. **Standalone env validation:** đã có validate-only contract P0; không mở lại env handling trong P0-4.
3. **Scheduled Task state machine:** P0-3 đã authority hóa bootstrap state, activation, safe-stop, retry/quarantine, rollback và reboot semantics.
4. **Service restriction:** **CLOSED CANDIDATE (P0-4)** — fail closed khi `service` được chọn cho first deploy; không xây Service architecture trong slice này.

### P1 — deterministic bootstrap plan/verify

5. Root/subdirectory/ACL desired-state manifest và non-mutating verifier, bao gồm inheritance/reparse, marker/env/backup/bundle access.
6. Startup bundle source-provenance/install-plan/overwrite-refusal/update-rotation verifier.
7. Nginx value-free plan/verify contract, neighboring-block isolation, exact test/reload/restore evidence.

### P2 — defense in depth

8. Dùng cùng marker schema validator trong pre-transfer handshake, vẫn giữ full server-side revalidation trước mutation quan trọng.
9. Bổ sung audit report schema liên kết reviewed commit, plan digest, verifier results và operator approvals mà không chứa secret.

Mỗi slice cần branch riêng, full Windows hostile fixtures, five deployment gates, independent GitHub review; không gộp mutation production vào correction code.

## 14. Operator-only facts

Repository audit không xác nhận và không được đoán các facts sau:

- actual VPS root — `OPERATOR VERIFICATION REQUIRED`;
- actual deployment/runtime accounts và effective ACLs — `OPERATOR VERIFICATION REQUIRED`;
- actual Scheduled Task/Windows Service, state, triggers, action và recovery — `OPERATOR VERIFICATION REQUIRED`;
- actual Nginx executable/config/prefix/server blocks/TLS/reload behavior — `OPERATOR VERIFICATION REQUIRED`;
- actual production environment file/values — `OPERATOR VERIFICATION REQUIRED`;
- actual PostgreSQL database/role/extensions/listeners/backups — `OPERATOR VERIFICATION REQUIRED`;
- actual SSH configuration/keys/firewall/session — `OPERATOR VERIFICATION REQUIRED`.

PASS 1/PASS 2 reports phải được operator và independent reviewer đánh giá riêng; không được đưa raw commands, secrets, env, keys, dumps hoặc unrelated process details vào repository.

## 15. Final verdict

**NO-GO / CORRECTION NEEDED**.

Stage 2 tổng thể vẫn **NO-GO / chưa GO** vì các P1/P2 và operator-only evidence còn lại. P0-4 chỉ đóng fail-closed restriction cho Service first deploy; không tuyên bố Service architecture hay Production Stage 2 hoàn tất.

Điều kiện để audit lại vẫn gồm hoàn tất các P1/P2 áp dụng được, operator evidence độc lập và architecture B plan/verify cho ACL, bundle và Nginx. Không được bắt đầu Stage 2 mutation chỉ dựa trên CI xanh hoặc tài liệu manual hiện tại.
