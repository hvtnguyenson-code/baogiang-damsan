# P6-020 — Runbook chuẩn bị triển khai và nghiệm thu cô lập ứng dụng

**Status:** PROPOSED / REVIEW REQUIRED; **không** phải giấy phép deploy.  
**Ngày:** 12/10/2026.  
**Đi kèm:** `P6-020-ISOLATED-SHARED-VPS-ARCHITECTURE.md`; hợp đồng chính thức `PRODUCTION-CD-FIRST-DEPLOY-RUNBOOK.md` và `PRODUCTION-ENVIRONMENT-CONFIGURATION.md` vẫn có thẩm quyền.  
**Mục tiêu:** vận hành Báo giảng giống quy trình Nội trú ở tầng CI/CD/health, nhưng chỉ tác động tài nguyên riêng của Báo giảng.

## 1. Các lớp trách nhiệm và thao tác được phép

| Lớp | Tác vụ Báo giảng bình thường được phép | Tuyệt đối không được tự động tác động |
|---|---|---|
| GitHub source/CI | Nhánh PR, kiểm thử, merge đúng SHA | Repo Nội trú |
| Deploy orchestration | Release SHA Báo giảng, lock riêng, snapshot riêng | `DamSanV5`, Nginx task, các Windows Service khác |
| Application | Restart duy nhất task `BaoGiangBackend`, chỉ PID có identity khớp | `taskkill /IM node.exe`, dừng cổng/Node chung |
| Database | Backup/migrate/restore database của Báo giảng trên cluster riêng | PostgreSQL 17/5433 và dữ liệu Nội trú |
| Static web | Chuyển release pointer/asset Báo giảng | Nginx root/include hay frontend Nội trú |
| DNS/TLS | Duy nhất hostname/chứng thư Báo giảng, có review riêng | Nameserver, zone hiện hữu khác, renewal và cert Nội trú |
| Telegram | Bot/recipient vận hành Báo giảng riêng, đúng event và allowlist | Bot, token, webhook, chat ID Nội trú |

Nginx dùng chung 80/443 là **ngoại lệ hạ tầng đã nhận diện**. Bất kỳ reload, thay file config/include hoặc renewal hook nào có thể tác động ingress Nội trú đều thuộc change control riêng, *không* là bước mặc định của mỗi deploy.

## 2. Trước khi cấp quyền cài đặt lần đầu

- [ ] PASS 1 đã review: nhận diện foreign roots/processes/tasks/database, xác nhận báo cáo immutable.
- [ ] PASS 2 đã chạy từ script đúng reviewed SHA, với đường dẫn/cổng/identity chính xác; không xác thực DB hay probe public endpoint nếu chưa được cấp phép riêng.
- [ ] Chốt bản vẽ ACL và tài khoản Windows runtime/deploy riêng, verified không có quyền ghi Nội trú.
- [ ] Chọn nguồn phát hành Node 22, checksum/chữ ký, vị trí cài đặt riêng, không can thiệp `C:\Program Files\nodejs`.
- [ ] Chọn phiên bản PostgreSQL được ứng dụng/Prisma hỗ trợ; cluster/service account/port/data/log/backup riêng; 5434 mới là candidate, chưa được cấp phát.
- [ ] Dự toán C: hiện chỉ khoảng 29–30 GiB free tại snapshot: kích thước release, `node_modules`, Prisma/client, logs, database growth, backup, rollback và ngưỡng cảnh báo.
- [ ] Mắt Bão: xác minh quyền DNS, bản ghi hostname còn trống, trước/sau zone diff; không sửa record cũ hoặc NS.
- [ ] Nginx: **chứng minh effective prefix/config**, graph include và nguồn reload đang vận hành; xác định phạm vi server block riêng và rollback đúng byte. Nếu runtime binding chưa có thẩm quyền, STOP.
- [ ] HTTPS: xác định ACME HTTP-01 webroot và hook auto-renew riêng; chứng minh không làm sai chứng thư/renewal Nội trú. Tách thông báo lỗi renewal khỏi thông báo app restart.
- [ ] Telegram: bot Báo giảng riêng, recipient allowlist được xác thực bằng thao tác an toàn, test transport với mock trước production, báo cáo sent/unknown/failed đúng nghĩa.
- [ ] Chủ dự án phê duyệt chính xác **thay đổi ingress chung** và **first deploy** qua hai quyết định tách rời. Khi chưa phê duyệt: NO-GO.

## 3. Quy trình thay đổi code và phát hành thường ngày

1. **Branch:** từ `origin/main` chính xác; commit EN, báo cáo VN, không chỉnh trực tiếp GitHub main/VPS.
2. **CI/Review:** unit, integration, Prisma migration contract, lint/typecheck/build, Playwright/PWA, bảo mật, Windows deploy contract; soát diff/surface ảnh hưởng. CI xanh không tự cấp quyền merge.
3. **Merge:** PR qua review; ghi merge SHA và post-merge CI chính xác. **Không tự restart trên merge**, đặc biệt docs-only.
4. **Manual deploy:** `.github/workflows/deploy-production.yml` hiện yêu cầu `workflow_dispatch`, full SHA, exact confirmation, protected `production` Environment, hash artifact, startup bundle và secure SSH handshake. Không thay đổi trigger trong nhiệm vụ tài liệu.
5. **Preflight trước mutation:** exact target SHA có `push/main CI=success`, Nginx/DB identity/ACL/marker đúng, thư mục deployment riêng, disk đủ, lock triển khai của Báo giảng đang rảnh, Windows task identity chính xác. Không qua: STOP.
6. **Backup và migration:** nếu có migration, tạo snapshot và xác minh backup Báo giảng trước; cửa sổ maintenance chỉ Báo giảng; verify schema/version theo Prisma; không kết nối/chạy migration cluster Nội trú. Migration không xác nhận được: fail-closed, không tự trả `SUCCESS`.
7. **Stage release:** ZIP từ reviewed exact commit, checksum trước/sau transfer; `npm ci` + build theo đúng Node22; xác minh native `argon2`, Prisma Client và tệp `apps/web/dist`; không sửa current release đang chạy cho đến khi đủ điều kiện.
8. **Switch/restart:** đổi pointer của Báo giảng theo cơ chế immutable; chỉ dừng/start task `BaoGiangBackend`, kiểm tra PID/executable/entrypoint. Không thao tác `DamSanV5`, Nginx hay PostgreSQL17.
9. **Verify:** process/task/3100, `/api/health/live`, `/api/health/ready`, exact SHA, database readiness, static web + /api route, cookie/CORS/smoke login và trạng thái môi trường; SSH hậu kiểm độc lập.
10. **Operator Telegram:** chỉ sau verification PASS mới ghi durable event restart/deploy success và gửi một tin cho admin. Nếu bot lỗi, deploy success không đồng nghĩa gửi tin thành công; báo cáo delivery riêng.
11. **Close:** gắn GitHub deployment status, SHA/report ID, thời gian gián đoạn Báo giảng (nếu có), before/after evidence Nội trú; không công bố trạng thái production khi thiếu health và independent verifier.

Bộ script deploy hiện có **chưa có** thông báo restart cho operator. Mục 10 là **yêu cầu phát triển riêng**; không giả vờ chức năng đã tồn tại.

## 4. Quy trình xử lý sự cố và rollback

**Báo giảng lỗi, Nội trú bình thường:**
- Cô lập thao tác vào Báo giảng; thu log đã khử bí mật, exact release, health, task và DB riêng.
- Nếu phiên bản cũ tương thích schema thì rollback đúng release pointer và restart chỉ `BaoGiangBackend`.
- Nếu migration đã attempted và tương thích chưa được xác minh, **không** rollback mù; giữ Báo giảng ở trạng thái safe-stop/quarantine, báo lỗi và bảo toàn backup.
- Gửi cảnh báo vận hành nếu kênh Telegram an toàn; không đổ lỗi hoặc thao tác sang Nội trú/Nginx.

**Lỗi tại lớp ingress chung sau thay đổi được phê duyệt:**
- Dừng thay đổi; dùng snapshot Nginx/config/managed include, rollback theo runbook hạ tầng chung do operator được ủy quyền; kiểm tra Nội trú domain, TLS và API trước khi tái thử Báo giảng.
- Không tái chạy reload liên tục, không xóa chứng thư, không restart Node Nội trú để “thử chữa Nginx”.
- Nếu không có khả năng chứng minh rollback an toàn: không tiến hành thay đổi Nginx ban đầu.

**VPS/Windows lỗi toàn hệ thống:** vượt phạm vi độc lập tiến trình; vận hành phục hồi máy chung theo kế hoạch hạ tầng riêng, không xem đây là vi phạm lifecycle isolation ứng dụng.

## 5. Telegram operator alert — hợp đồng kiểm thử

| Sự kiện | Tin gửi cho admin | Điều kiện phát |
|---|---|---|
| Deploy/restart Báo giảng thành công | **Một** tin có giờ VN, SHA, task, health/DB, run ID | Tất cả postflight PASS |
| Restart Báo giảng thất bại | Cảnh báo ngắn đã khử bí mật | Thất bại được xác nhận; bot có thể gửi |
| Restart liên tục | Gộp/giới hạn cảnh báo | Bounded window và distinct boot identity |
| Telegram provider timeout/không chắc | Không tuyên bố `SENT`, không auto resend vô hạn | Delivery `UNKNOWN` theo ADR-058 |
| Restart Nội trú | **Không** sinh event Báo giảng | Không có sự kiện Báo giảng |
| Lệnh quản trị Telegram | **CHƯA MỞ** | Task/ADR mới, confirmation/allowlist/audit riêng |

Tách biệt `operationalNotificationRecipient` với linkage của giáo viên; không suy quyền từ tên Telegram; token server-side, không vào repo/log/UI. Nếu transport vận hành chỉ sử dụng outbound HTTPS, không cần kích hoạt webhook công khai để gửi **tin một chiều**; webhook nhận lệnh tương lai cần HTTPS và xác thực đúng ADR-058.

## 6. Ma trận nghiệm thu không gây nhiễu Nội trú

| Kiểm thử | Bằng chứng bắt buộc |
|---|---|
| Báo giảng khởi động thành công | Task/PID/3100/ready, SHA, admin Telegram event đúng một lần |
| Báo giảng restart độc lập | So sánh process/task/port và health Nội trú trước/sau, không dừng hay restart `DamSanV5` |
| Báo giảng deploy lỗi trước switch | Nội trú nguyên trạng; Báo giảng giữ release cũ hoặc safe-stop theo từng gate |
| Báo giảng DB migration lỗi | Backup/transaction/quarantine đúng, không kết nối PostgreSQL17 |
| Bot Telegram không hoạt động | Báo giảng vẫn healthy; report delivery `FAILED/UNKNOWN`, không false-success |
| DNS subdomain thay đổi | Mỗi record cũ của Nội trú giữ nguyên; hostname mới resolve đúng sau propagation |
| ACME renewal Báo giảng | Cert độc lập, hạn mới, không phá renewal hoặc HTTPS Nội trú |
| Nginx shared config change | Exact snapshot, syntax precheck, review/reload/rollback, Nội trú health trước/sau |
| Không restart Nội trú thử nghiệm | Chỉ mô phỏng/CI hoặc non-production rehearsal cho chiều restart Nội trú → Báo giảng |

Trong các đợt PASS 1 hoặc CI static không được tuyên bố các test sản xuất thực tế đã PASS. Kiểm thử có restart app Báo giảng chỉ thực hiện **sau** khi được phép triển khai môi trường Báo giảng; không thực hiện tương tự trên Nội trú live.

## 7. Danh sách hạng mục còn chờ và quyết định rõ ràng

1. **P6-020 / PASS 2**: định danh tool paths, effective Nginx, foreign roots/names, candidate task, PG data dir và các trạng thái chưa verified. PASS 2 không được suy từ PASS 1.
2. **Stage 2 bootstrap**: riêng root ACL, startup bundles, identity marker và đường dẫn Node22/Pg tools; chưa được thực hiện.
3. **DNS Mắt Bão + cert**: operator tài khoản DNS phải xác nhận không có record xung đột; cert issuance, automatic renewal/hook và ingress require explicit review.
4. **Telegram restart event**: task implementation/testing mới, tương thích ADR-058. Chưa có provider activation production.
5. **Nginx shared change exception**: phê duyệt riêng; không mặc định thay đổi từ task P6-020/P6-030.
6. **P6-030 first deploy**: luôn NO-GO cho đến khi security, backup/restore, dependency, SSH, DNS/TLS và approvals đạt.
7. **Pilot**: chỉ sau exact deploy/health/postdeploy, xác nhận người dùng và feature flags mới chuyển ra khỏi PRE-OPERATIONAL.

**Kết luận quản trị:** Hai ứng dụng độc lập về release/restart/DB/Node/task/secrets/log; Nginx chung là dependency được kiểm soát có ngoại lệ change. Không có lệnh nào trong tài liệu này cấp phép sửa VPS, Nginx, DNS, bot production hoặc Quản lí nội trú.
