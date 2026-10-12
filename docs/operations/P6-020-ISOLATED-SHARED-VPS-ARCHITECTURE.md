# P6-020 — Kiến trúc vận hành độc lập Báo giảng trên VPS dùng chung

**Trạng thái:** DESIGN PROPOSAL — chờ independent review/PR merge; chưa cấp phép P6-030.  
**Ngày:** 12/10/2026.  
**Baseline:** `main@732b7ef6782a285405d68173f861e678a4804dcf`.  
**Thẩm quyền:** yêu cầu Product Owner trong phiên 12/10/2026; không thay thế ADR-053, ADR-058, P6-005/P6-010, Stage 1/PASS 2 hay runbook deploy hiện hành.  
**Tài liệu liên quan:** `docs/operations/PRODUCTION-CD-FIRST-DEPLOY-RUNBOOK.md`, `docs/operations/PRODUCTION-ENVIRONMENT-CONFIGURATION.md`, `docs/decisions/ADR-058-DEDICATED-TELEGRAM-INTEGRATION.md`.

## 1. Bất biến sản phẩm / ranh giới bảo vệ

Báo giảng và Quản lí nội trú dùng chung **một Windows Server 2022 VPS**, nhưng có vòng đời vận hành độc lập. Fix, deploy, restart, rollback hoặc lỗi Báo giảng **không được** dừng, restart, sửa cấu hình, thay quyền, migration, dọn dữ liệu hay thay runtime Nội trú. Ngược lại, restart Nội trú không được làm phát sinh restart Báo giảng. Sự cố chung ở tầng Windows/CPU/RAM/đĩa/mạng vẫn là rủi ro chấp nhận.

**Bảo vệ Nội trú đang phục vụ thật:** `DamSanV5` Scheduled Task, Node hiện hữu, port 3000, dữ liệu và PostgreSQL 17/5433; Nginx master/worker đang giữ 80/443; `Nginx Auto Start`, `win-acme renew`, `Dam San TLS Monitor`; toàn bộ cấu hình, chứng thư, backup, log, secret, quyền và thư mục Nội trú. Không sửa các thành phần này trong phạm vi tài liệu hoặc PASS 1/PASS 2.

Một **thay đổi Nginx chung lần đầu** để thêm hostname Báo giảng là ngoại lệ về hạ tầng dùng chung, **không tự động được phê duyệt** bởi yêu cầu triển khai. Muốn thực hiện phải trình chính xác diff, snapshot, thử cú pháp, thời điểm, health Nội trú trước/sau, rollback và được Product Owner cho phép riêng. Không hứa hẹn rủi ro bằng không.

## 2. Cơ sở chứng cứ và giới hạn

- PASS 1 sửa theo PR #210: cổng 3100 `FREE` tại thời điểm kiểm tra; PostgreSQL 17 `DISCOVERED`, dữ liệu `C:\Program Files\PostgreSQL\17\data`; Nginx vẫn `NOT_VERIFIED` do tiến trình không có `-p` tuyệt đối. Kết luận `REQUIRES_REVIEW`; PASS 2 chưa chạy.
- Node dùng chung hiện hữu là `C:\Program Files\nodejs\node.exe`, phiên bản 20.18.0; ứng dụng Báo giảng yêu cầu Node 22 (`.nvmrc`, `engines`).
- Có PostgreSQL 16/5432, nhưng việc không có kết nối ở thời điểm kiểm tra **không chứng minh** cluster rảnh hay được phép cấp cho Báo giảng.
- VPS quan sát một IPv4 công khai `103.116.104.44`; Nginx hiện giữ toàn bộ TCP 80/443 trên IPv4. DNS `dtnt-damsan.edu.vn` có NS `ns1.matbao.vn`, `ns2.matbao.vn`. Chưa xác minh bản ghi A/CNAME cho subdomain Báo giảng.
- Những số liệu về cổng trống, RAM, dung lượng và PID chỉ là **snapshot**; không phải bảo đảm tải cao điểm, lock cổng, hợp đồng tài nguyên hoặc chứng nhận phục hồi backup.
- Báo cáo PASS 1 cũ SHA-256 `0FA400C017257F25CF5F6EB6D92E5ABEB3BAFCED9C0F4571A4BC2B28D768E9AC`; báo cáo đã sửa SHA-256 `9495494908A6FD037FE5C107A5F9A997A5CE571ABC016F9D3BC6B45DB4388C33`. Báo cáo gốc giữ nguyên.

## 3. Kiến trúc ứng dụng mục tiêu

| Ranh giới | Nội trú giữ nguyên | Báo giảng — ứng viên phải nghiệm thu |
|---|---|---|
| Root | `C:\damsan` và các vùng liên quan | `C:\baogiang` với ACL riêng, không nằm trong foreign roots |
| Node | Node 20 đang cài đặt chung | Node 22 **cài song song** vào thư mục riêng, đường dẫn absolute SHA/version reviewed |
| Backend | Node/task `DamSanV5`, port 3000 | Task `BaoGiangBackend`, `127.0.0.1:3100`, exact executable/entrypoint |
| Quyền OS | Giữ nguyên tài khoản của Nội trú | Windows runtime identity quyền tối thiểu, không ghi foreign roots |
| Database | PostgreSQL 17/5433, giữ nguyên | **Ưu tiên cluster riêng** (candidate 5434), service identity/data directory/role/backup riêng; chỉ loopback |
| Secrets | Nội trú hiện hữu | Server-side env riêng, chặn read/write chéo |
| Release | Quy trình hiện hữu | SHA-pinned release, separate staging/releases/current, health và rollback |
| Logs/backup | Nội trú hiện hữu | Log, backup và retention/restore test riêng |
| Telegram | Bot Nội trú | Bot Báo giảng theo ADR-058, operator policy/recipient riêng |
| HTTPS | Nginx đang giữ 80/443 | Server block riêng cho `baogiang.dtnt-damsan.edu.vn` trong Nginx chung, chỉ sau phê duyệt thay đổi hạ tầng |

**Phân biệt hai loại độc lập:** task, Node, database, data và restart độc lập là yêu cầu tuyệt đối ở cấp ứng dụng; **Nginx 80/443 là điểm phụ thuộc chung có kiểm soát**, không được gọi là hoàn toàn độc lập. Không tạo một Nginx thứ hai cùng bind một IP:80/443.

Frontend Báo giảng là React/Vite build tĩnh tại `apps/web/dist`; NestJS API có prefix `/api` và các endpoint `/api/health/live`, `/api/health/ready`. Chỉ proxy 3100 mà không phục vụ tệp web sẽ **không** tạo thành website hoàn chỉnh. Cần kế hoạch static webroot versioned + chuyển tiếp `/api` trước deploy.

PostgreSQL candidate 5434 và vị trí cài Node22/PG mới là **đề xuất**, không phải tài nguyên đã được tạo/giữ chỗ. Phải kiểm tra CPU/IO/RAM, dung lượng backup, binary provenance, phiên bản được app/Prisma hỗ trợ, service account và phương án phục hồi. Không chiếm PG16 hoặc sử dụng role `postgres` của Nội trú theo suy đoán.

## 4. DNS Mắt Bão, tên miền và HTTPS — không phát sinh phí tên miền

**Chốt URL:** `https://baogiang.dtnt-damsan.edu.vn` (không đổi tên miền).

**Thiết kế DNS:** Chỉ trong zone **Mắt Bão hiện hữu**, tạo bản ghi **A** mới cho host `baogiang` đến VPS IPv4 **sau khi** tái xác minh IP và kiểm tra xung đột A/AAAA/CNAME. Không mua domain mới; không chuyển nameserver; không thay `@`, `www`, MX, TXT và các hostname Nội trú. Giá/tính năng quản trị DNS thực tế phải được xác nhận trong tài khoản Mắt Bão; không tuyên bố đã thêm record. Ghi nhận before/after zone diff và phân giải từ nameserver có thẩm quyền.

**TLS:** chứng thư riêng **Let's Encrypt ACME miễn phí** cho hostname Báo giảng, tự gia hạn, storage/renewal id riêng; không động chứng thư/renewal Nội trú. Xác minh HTTP-01 routing/webroot dưới Nginx chung hoặc phương án ACME an toàn khác. Với win-acme hiện hữu, phải xem riêng renewal task/hook và rủi ro reload Nginx chung: đổi chứng thư trên đĩa không bảo đảm Nginx đang dùng chứng thư mới nếu không reload. Chỉ chấp thuận automation renewal khi có thử nghiệm, giới hạn tác động và cơ chế báo lỗi; tuyệt đối không restart `DamSanV5`.

**Nginx:** hiện process không công bố `-p` tuyệt đối nên chưa có bằng chứng runtime config authority theo runbook; không nới fail-closed bằng cách lấy working directory làm chứng cứ. Sau khi xác minh, chuẩn bị **managed include/server block riêng** và snapshot chính xác graph hiện hữu; đối chiếu SNI, port, `server_name`, ACME challenge, upstream, gzip/cache/PWA, upload/body limit, cookie headers, security headers. Thực hiện **một lần** syntax test + manual reload với kiểm tra Nội trú trước/sau và rollback chỉ khi được phê duyệt. Deploy/restart API Báo giảng về sau **không** reload Nginx. Cần thẩm định riêng renewal hook định kỳ vì đây là shared-ingress event.

Không sử dụng Cloudflare Tunnel trả phí, chuyển NS, mua tên miền khác hoặc mở cổng 3100 cho Internet chỉ để né bài toán ingress.

## 5. Telegram vận hành: tin restart thành công

ADR-058/P5-030 đã có bot Báo giảng riêng, liên kết tài khoản cá nhân và gửi tin thử. **Chưa có** tính năng thông báo cho người vận hành sau restart. Giai đoạn đầu xây dựng một **operator notification workflow riêng** trên bot Báo giảng, tách khỏi kênh thông báo giáo viên; không tái sử dụng token/chat ID/webhook Nội trú.

- Người nhận: chat ID quản trị được xác minh và allowlist trong cấu hình **server-side riêng**, không lưu token vào Business Configuration, không sao chép từ Nội trú.
- Nguồn phát sự kiện: orchestrator hoặc observer Báo giảng độc lập; không kết luận “restart thành công” chỉ vì task chạy hoặc `onModuleInit` gọi xong.
- Điều kiện thành công: đúng task và identity, một process hợp lệ/port 3100, SHA/release marker khớp, `live` và `ready` PASS, database readiness PASS; khi public ingress hoạt động còn cần smoke HTTP/HTTPS, asset và đường dẫn `/api`.
- Sự kiện bền vững có identity duy nhất `deploymentRunId + releaseSha + bootInstance + outcome`, chống spam/restart loop. Tin chứa: `Báo giảng Đam San`, giờ `Asia/Ho_Chi_Minh`, kết quả, SHA rút gọn, health/DB, task và ID báo cáo an toàn; **không** có token/credential/sensitive business data.
- Startup thất bại phải có cảnh báo lỗi riêng nếu network Telegram khả dụng. Nếu kết quả Telegram không chắc chắn thì giữ `UNKNOWN`, không resend vô hạn, tuân thủ idempotency/no-auto-retry của ADR-058. Nếu bot lỗi không được biến app restart success thành “notification sent”.
- Kiểm tra restart chủ động và restart sau sự cố/Windows boot phải phân biệt. Observer chỉ thao tác Báo giảng, không đọc/sửa task Nội trú.

**Tương lai:** `/status`, `/health`, phiên bản, tình trạng backup/log/TLS trước (read-only, sanitized). Lệnh `/restart` và điều khiển khác **chưa được phê duyệt**: phải có allowlist danh tính, quyền lệnh, xác nhận hai bước/nonce hết hạn, lock và audit, chỉ scope `BaoGiangBackend`; cấm arbitrary shell/SQL và mọi đường tác động Nội trú. Bot webhook hiện có `POST /api/integrations/telegram/webhook` chỉ được bật thực tế khi secret và HTTPS route đã nghiệm thu.

## 6. Quyết định vận hành và cổng chuyển tiếp

Giữ mô hình Nội trú quen thuộc: feature branch → PR/CI → review → merge SHA → xác nhận deploy → backup/migration → restart **đúng task** → health → hậu kiểm độc lập → báo Telegram. Nhưng production workflow Báo giảng hiện là **`workflow_dispatch`**, tiếp tục giữ manual exact-SHA/approval; không sao chép việc docs-only merge kích hoạt restart như Nội trú.

Tài liệu này **không** thay đổi workflow, marker schema, hợp đồng `PROD_NGINX_*`, scripts P6-010 hoặc TLS. Việc bổ sung cơ chế restart-alert và giải pháp ingress phải có task code riêng, test security và review xung đột với contract hiện tại.

**NO-GO:** PASS 2 chưa hoàn tất; chưa cài Node22, PostgreSQL riêng, task/runtime, DNS A, Nginx include, chứng thư hay bot/operator alert production. Mọi thay đổi trên VPS/Nội trú/Nginx/đường DNS đang chạy đều nằm ngoài phạm vi PR tài liệu này. Không suy “thiết kế đã thống nhất” đồng nghĩa được phép triển khai ngay.
