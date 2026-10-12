# P6-020C — Nginx dùng chung, DNS Mắt Bão và HTTPS Let's Encrypt

**Trạng thái: REPOSITORY PREPARATION / OPERATOR GATES NOT CLEARED. P6-030 = NO-GO.**
**Baseline:** main 897bd88dca3c7ccf201040bb2903d8a6f9d13a9b (PR #215 đã merge).
**Ngày lập:** 13/10/2026; chứng cứ nguồn VPS được chụp ngày 12/10/2026 và cần kiểm lại trước thao tác.
**Phạm vi:** chuẩn bị, đối chiếu thiết kế, khóa chuỗi phụ thuộc và checklist nghiệm thu. Không có ủy quyền thay đổi production trong tài liệu này.

## 1. Không tái triển khai code TLS đã có

P6-010 đã CLOSED và cung cấp các thẩm quyền repo sau:
- scripts/deploy/windows/p6-010-http01-tls-common.ps1 (nguồn sinh cấu hình HTTP-01, lệnh win-acme và hợp đồng renewal).
- scripts/deploy/windows/production-http01-plan.ps1 và production-http01-verify.ps1 (lập kế hoạch/xác minh read-only cho port 80).
- scripts/deploy/windows/production-nginx-plan.ps1 và production-nginx-verify.ps1 (lập kế hoạch/xác minh 443).
- scripts/deploy/windows/production-tls-renewal-hook.ps1 (first issue KHÔNG reload; lúc renew xác minh Nginx bytes/domain/syntax rồi mới reload).
- scripts/ci/test-p6-010-http01-windows.ps1 (các fixture read-only, collision, renew/reload và fail-closed).
- docs/operations/P6-010-HTTP01-TLS-RUNBOOK.md và docs/requirements/P6-010-SHARED-VPS-HTTP01-TLS-AUTHORITY.md.

P6-020C **không tạo Nginx/TLS generator mới**, không chạm mã code đã đóng; chỉ đưa ra các bước vận hành và chứng cứ còn thiếu cho VPS thật. Script plan/verify hiện có đòi marker hợp lệ và các leaf/source xác định; chúng KHÔNG thể PASS khi root/marker/Node22/PG chưa được bootstrap. Không nới lỏng fail-closed để lấy kết quả giả.

## 2. Kiến trúc được giữ nguyên

| Lớp | Cấu hình đích | Trạng thái thực tế |
|---|---|---|
| DNS authoritative | Zone hiện hữu do Mắt Bão quản lý, giữ nguyên NS ns1.matbao.vn / ns2.matbao.vn | Theo PASS1 cũ; trạng thái bản ghi hôm nay CHƯA KIỂM TRA LẠI |
| Subdomain | baogiang.dtnt-damsan.edu.vn; bản ghi A mới tới IPv4 VPS được tái xác minh | CHƯA CẤP PHÁT / NOT_VERIFIED |
| IPv4 VPS | 103.116.104.44 theo quan sát 12/10; phải re-check | HISTORICAL EVIDENCE ONLY |
| HTTP port 80 | Shared Nginx, riêng một include baogiang HTTP-01 + redirect HTTPS | Chưa tạo include |
| HTTPS port 443 | Shared Nginx, riêng baogiang include, SNI và static SPA, proxy /api tới 127.0.0.1:3100 | Chưa tạo include hoặc certificate |
| ACME challenge root | C:\baogiang\shared\acme-webroot | Chưa tạo |
| PEM cert/key | C:\baogiang\shared\tls\baogiang-chain.pem, baogiang-key.pem | Chưa cấp |
| win-acme | C:\baogiang\shared\win-acme\wacs.exe và config/log độc lập | Chưa cài |
| Renewable task | \BaoGiang\BaoGiangTlsRenewal, chỉ renewal id baogiang-damsan | Chưa tạo; schedule/account chưa duyệt |
| Node/API | Chỉ API loopback 127.0.0.1:3100; web assets thuộc versioned Báo giảng release | Chưa triển khai |
| Nginx runtime | Nginx Auto Start task và process chung; thực tế chạy SYSTEM | ĐÃ PHÁT HIỆN; effective prefix/config CHƯA CHỨNG MINH |

Không mua tên miền, không đổi nameservers, không tạo cổng public 3100/5434, không dùng tunnel bên thứ ba, không đụng chứng thư/renewal của Nội trú.

## 3. Hard blocker Nginx: cách giải quyết đúng

PASS 1 trước đây nhận diện C:\nginx\nginx.exe và C:\nginx\conf\nginx.conf. Tuy nhiên tác vụ Nginx Auto Start và tiến trình hiện hữu **không có đối số -p tuyệt đối đã được chứng minh**. WorkingDirectory=C:\nginx hoặc sự tồn tại tệp conf/nginx.conf **không chứng minh effective running prefix/config** theo strict authority hiện tại.

**Vì vậy Nginx prefix = NOT_VERIFIED và P6-020C production Nginx GO = NO.** Không tự ý chọn C:\nginx làm giá trị xác minh, không sửa marker hoặc gọi Nginx -t/-s reload dựa trên giả định. Chỉ xem metadata không chứng minh được active config.

### Nginx authority change — cần change window riêng, KHÔNG triển khai trong P6-020C prep

1. Quay lại host khi Desktop Commander online, chỉ đọc và lưu bằng chứng không bí mật: running PIDs / chính xác task action, workingDirectory, executable, cmdline hash (không xuất raw command line), ancestor non-reparse, HTTP/HTTPS ingress neighbour baseline, Nginx active include boundaries, cert identities ở mức metadata.
2. Phân biệt giả thuyết C:\nginx là workingDirectory với việc runtime đã thực sự được khởi động với prefix tuyệt đối. Chứng minh bằng cơ chế vận hành đáng tin cậy; nếu không thể, trình duyệt một **change window tách biệt** nhằm chuyển task Nginx sang exact -p và -c dưới authority đã review. Chỉ thực hiện sau backup cấu hình, chứng cứ before/after và kế hoạch rollback được phê duyệt. Việc này cần thao tác trên Nginx CHUNG và có rủi ro Nội trú: chưa được phép lúc này.
3. Test/đối chiếu graph toàn bộ domain 80/443/SNI, Nginx listen/upstreams và certificate hiện hành để phát hiện collisions; không đọc private keys, không overwrite include lân cận.
4. Sau khi được review và giải quyết điểm -p/-c, mới sinh các exact managed includes thông qua P6-010 plan và existing production-nginx-plan.

**Điểm dừng tuyệt đối:** Nginx prefix/config/active include authority chưa verified; một server block khác đã claim host 80 hoặc 443; bất kỳ thao tác nào yêu cầu stop/restart DamSanV5, reboot VPS, sửa task Nginx không được duyệt, hoặc thay đổi thông tin TLS lân cận.

## 4. Mắt Bão DNS — một bản ghi A được phê duyệt riêng

1. Xác minh **đúng zone sở hữu** hostname từ Mắt Bão và kiểm tra NS authoritative thực tế ngay trước khi thay đổi; không dựa vào lịch sử.
2. Kiểm tra trước host label baogiang dưới zone dtnt-damsan.edu.vn có hay không A/AAAA/CNAME và các CAA liên quan; kiểm tra IPv4 public thật trên VPS. Một bản ghi alias CNAME, A sai IP hoặc AAAA trỏ máy khác là CONFLICT.
3. Ghi snapshot trước thay đổi cho đúng host label, TTL, zone và chứng cứ tên miền Nội trú; giữ nguyên apex, www, MX, TXT, NS và toàn bộ các tên khác.
4. Sau phê duyệt, người vận hành có quyền truy cập Mắt Bão chỉ tạo/sửa **đúng** A(baogiang) tới IP đã chốt. Không sửa NS hay mua domain. TTL và rollback record value phải được ghi trong phiếu duyệt.
5. Hậu kiểm từ nameservers authoritative và ít nhất một recursive resolver theo A/AAAA/CNAME/CAA; ghi nhận TTL/propagation. NẾU A chưa đúng hoặc đang xung đột, KHÔNG xin certificate.

**Không có công cụ Mắt Bão được kết nối trong lượt P6-020C**: Không tuyên bố đã đọc zone riêng trong tài khoản, đã thay DNS hoặc xác minh bản ghi qua authoritative servers trong phiên này.

## 5. Chuỗi cấp và tự gia hạn HTTPS — đúng hợp đồng P6-010

### Stage C1 — Bootstrap/TLS assets (riêng Báo giảng)

Chỉ khi P6-020B đã được triển khai có chứng cứ thật và được phê duyệt: tạo dedicated paths cho acme-webroot, tls, win-acme-config, win-acme/logs đúng ACL; kiểm tra win-acme binary/version/sha và settings.json (clientName baogiang-win-acme, riêng config/log path). Kiểm tra shared deployment-common.ps1 exact reviewed digest và renewal hook bytes đúng Git source. Không dùng lại cấu hình hoặc renewal ID Nội trú.

### Stage C2 — HTTP-01 port 80

Dùng production-http01-plan.ps1; chỉ xem GO khi state READY_FOR_MANUAL_HTTP01_APPLY hoặc HTTP01_ALREADY_APPLIED, active include đã chứng minh, không collision domain 80/443, owner webroot đúng. Sau phê duyệt ghi **một** include đúng planned bytes, gọi production-http01-verify.ps1, syntax test chính xác, rồi manual Nginx reload theo approved exact vector. Smoke Nội trú ngay trước/sau lần reload dùng health+HTTPS+SNI/domain; thất bại thì STOP và thực hiện rollback exact include được phê duyệt. Một lần app deploy/restart thông thường không reload Nginx.

### Stage C3 — First issuance

Chỉ sau DNS authoritative đúng IP và /.well-known/acme-challenge/ truy cập từ Internet tới correct dedicated webroot. Dùng đúng win-acme first issue vector do plan sinh:
- Exactly manual source hostname baogiang.dtnt-damsan.edu.vn;
- filesystem HTTP-01 validation, PEM storage/prefix baogiang, dedicated script hook;
- renewal id baogiang-damsan, --notaskscheduler bắt buộc;
- account email approved (không ghi email/ACME key lên GitHub khi chưa xác nhận).
Kết quả hook lần đầu bắt buộc FIRST_ISSUE_CERT_READY_NO_RELOAD. Nếu hook reload Nginx ngay trong first issuance, coi là lỗi. Verify PEM metadata/issuer/SAN/notBefore/notAfter mà KHÔNG đọc/nêu private-key content.

### Stage C4 — 443 activation

Sau khi PEM có thật, chạy existing production-nginx-plan.ps1 và production-nginx-verify.ps1 -Mode Desired với exact 443 include. Only one TLS server block claims baogiang.dtnt-damsan.edu.vn. Review syntax, private key permissions, SPA static root, /api upstream, WebSocket headers (nếu có), cookie forwarded proto, PWA cache/asset path and security headers, max upload size. Manually apply only approved managed 443 include; run manual exact reload **sau separate approval**, verify TLS/HTTPS and Nội trú SNI response + health before/after.

### Stage C5 — Auto renewal + failure handling

Reserved task \BaoGiang\BaoGiangTlsRenewal runs only exact dedicated win-acme command --renew --id baogiang-damsan --notaskscheduler. Account, clock schedule and retry policy must be independently reviewed against existing host renew tasks and peak load; **never assign a schedule without evidence**. Dedicated win-acme log/config and task ACL, output sanitization and incident alert for impending expiry/UNKNOWN renewal required.

On due renew, the pinned hook reads only reviewed authority bytes/hash; verifies exact HTTP-01 include, canonical final 443 bytes, domain uniqueness and Nginx syntax immediately before a shared-Nginx reload. Renewal is an explicitly approved **shared ingress operation even though bot/app lifecycle is independent**. Hook category success is RENEWED_CERTIFICATE_RELOAD_VERIFIED. If it fails, do not assume new certificate is live or perform broad Nginx restart. Verify SAN, expiry, actual served certificate and Nội trú HTTPS health. Record monitoring escalation if certificate nears expiration.

**Shared-risk exception:** Không thể hứa vòng đời TLS 100% không liên quan Nội trú khi cả hai cùng dùng một Nginx. Code renew có cơ chế reload shared Nginx nếu kiểm tra PASS. Chỉ bật auto-renew sau khi người vận hành chấp nhận riêng rủi ro reload chung, thử nghiệm rollback và theo dõi ảnh hưởng các vhost.

## 6. Không được nhập nhằng kết luận và thẩm quyền

| Deliverable | Có thể tự hoàn thành trong PR repo P6-020C | Cần xác minh/duyệt sau |
|---|---|---|
| Review P6-010 code và test | YES | Không phải chứng cứ production |
| Thiết kế DNS, từng phase TLS, risk & rollback | YES | Mắt Bão login/change authorization |
| Target paths/domain/ACME renewal id | YES | Actual installed bytes and privileges |
| PASS1/PASS2 exact Nginx runtime prefix | NO | VPS online + runtime proof/change window |
| Installed Node22/PG/task/marker | NO | Bootstrap P6-020B riêng |
| A record, active include, real cert | NO | Explicit production approval |
| Automatic win-acme task/reload | NO | Separate shared-ingress operational approval |
| P6-030 first deploy | NO | Full readiness and acceptance |

## 7. Thẩm định rollback và nghiệm thu cuối

Before any C2/C4 reload: save config snapshot of only proposed managed include (or prove MISSING), exact SHA, Nginx active include graph and protected SNI response/health. After reload: compare exact A/AAAA/SNI/cert, root and API upstream, p95 latency if measured and only then claim smoke PASS. On fault: only approved file-level rollback, no Nginx service/host reboot, no changes to protected neighbour config. Recover shared ingress only during approved operator window and with verified neighbor health.

**Exit P6-020C repository prep:** all design inputs, exact script authorities, blockers and STOP rules documented; associated CI on PR HEAD PASS; no VPS mutation. **Exit P6-020C actual production gate:** reviewed authority + DNS + HTTP01 + cert + HTTPS + renewal monitoring evidence with explicit approvals. The two are different states; repository CI PASS never implies production GO.

**VPS read-only access was Offline at P6-020C preparation time.** Earlier 12/10 observations remain historical evidence only. Do not represent this file as a PASS2 report or live DNS/Nginx verification.

**Final status:** P6-020C repository PLAN REVIEW CANDIDATE; host Nginx/DNS/TLS gates NOT_VERIFIED; P6-030 NO-GO.
