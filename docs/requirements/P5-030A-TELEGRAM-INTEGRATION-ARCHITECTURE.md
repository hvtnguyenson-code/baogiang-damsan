# P5-030A — Kiến Trúc Tích Hợp Telegram Chuyên Biệt

## Trạng thái và thẩm quyền

- **Task ID:** `P5-030A` — Dedicated Telegram integration architecture closure
- **Trạng thái:** `CLOSED` bởi `SYNC-P5-030A`
- **Nhánh thực thi:** `docs/p5-030a-telegram-architecture`
- **Mốc xuất phát chuẩn:** `origin/main@a8f49f7048b879cc8ad01627643c33a2429f4f05`
- **Phụ thuộc:** `P5-010` (CLOSED)
- **Truy vết nghiệp vụ:** `T33` (`NEW_PRODUCT_AUTHORITY`)
- **Phân loại:** **DOCS-ONLY**. Tuyệt đối không thay đổi mã nguồn runtime, Prisma schema, migration, API, giao diện UI, cấu hình deploy hoặc cơ sở dữ liệu.
- **Quyết định kiến trúc đi kèm:** `docs/decisions/ADR-058-DEDICATED-TELEGRAM-INTEGRATION.md` (Accepted).
- **Thẩm quyền phê chuẩn:** Tài liệu kiến trúc này đã được phê chuẩn **Accepted** sau khi nhánh nhiệm vụ `docs/p5-030a-telegram-architecture` được merge vào `main` (PR #198, merge commit `9ef04c4e8383b77049d2947bb6999a17505698bd`), post-merge CI #649 đạt SUCCESS, và hoàn tất thủ tục đóng tài liệu `SYNC-P5-030A`.

### Bằng chứng đóng nhiệm vụ (Closure Evidence)
- **Mốc xuất phát chuẩn nhiệm vụ cha:** `origin/main@a8f49f7048b879cc8ad01627643c33a2429f4f05`
- **Các commit thực thi trên nhánh:**
  - `b47670ab3be6b2804a8e569a37db955d6806b061`: `docs(telegram): define P5-030 architecture`
  - `38310867286fa8b288ee12b1f3a1fc75eb40d8ff`: `docs(telegram): harden P5-030 architecture invariants` (Review Correction 001)
  - `bbe93c25e7e2090d9b6b5ca97b7bcef53dd90c9b`: `docs(telegram): close delivery concurrency gaps` (Review Correction 002)
- **HEAD nhiệm vụ cha được duyệt cuối cùng:** `bbe93c25e7e2090d9b6b5ca97b7bcef53dd90c9b`
- **Pull Request:** #198
- **Exact-head CI:** CI #648 (run id: `37467652218`, SUCCESS)
- **Kết quả đánh giá độc lập (Independent Review):** PASS sau Review Corrections 001–002, không còn tồn đọng review nào.
- **Merge commit vào main:** `9ef04c4e8383b77049d2947bb6999a17505698bd`
- **Authoritative post-merge main CI:** CI #649 (run id: `37469729094`, event push, attempt 1, SUCCESS)
- **Không còn task tồn đọng:** Không phát sinh bất kỳ correction hoặc re-entry task nào sau merge.
- **Tính toàn vẹn mã nguồn:** Zero runtime, schema, migration, API, UI, config, CI, deploy, VPS mutation trong P5-030A; production duy trì strictly `PRE-OPERATIONAL`.
- **Đóng nhiệm vụ:** Formal `CLOSED` bởi `SYNC-P5-030A`.

---

## 1. Bối cảnh và kết quả kiểm tra hiện trạng (Audit Findings)

Trước khi thực hiện task P5-030A, một đợt kiểm tra độc lập trên toàn bộ kho lưu trữ tại commit chuẩn `a8f49f7048b879cc8ad01627643c33a2429f4f05` đã phát hiện các vấn đề quản trị và kiến trúc nghiêm trọng sau:

1. **Sai lệch trạng thái đăng ký công việc:** `PRE-PILOT-TASK-REGISTER.md` ghi nhận task `P5-030` là `READY` và trỏ vào dòng truy vết `T33`. Tuy nhiên, việc đánh dấu `READY` này là sớm vì chưa có kiến trúc nào được phê duyệt cho Telegram.
2. **Khuyết thiếu trong Ma trận truy vết:** `PRE-PILOT-TRACEABILITY-MATRIX.md` hoàn toàn không có dòng `T33`.
3. **Chưa có thẩm quyền kiến trúc:** Không tồn tại bất kỳ quyết định kiến trúc (ADR) hay tài liệu yêu cầu (requirement) nào dành riêng cho tích hợp Telegram của Báo giảng.
4. **Không có hiện thực runtime:** Trong cả `apps/api` và `apps/web` hoàn toàn chưa có mã nguồn tích hợp Telegram (ngoại trừ một trường hợp kiểm thử trong suite Business Configuration khẳng định rằng các khóa bí mật kỹ thuật như `telegramToken` bị cấm đưa vào chính sách nghiệp vụ).
5. **Cổng giao tiếp thông báo chỉ là khung:** Interface `NotificationPublisherPort` và `PushGatewayPort` trong `apps/api/src/common/ports/ai-ports.ts` mới chỉ là bản khai báo interface nền móng, chưa có logic xử lý hay adapter thực thi.
6. **Hợp đồng môi trường Production thiếu danh mục Telegram:** Tài liệu `docs/operations/PRODUCTION-ENVIRONMENT-CONFIGURATION.md` và mã kiểm tra `scripts/deploy/windows/deployment-common.ps1` có danh sách kiểm tra nghiêm ngặt (strict allowlist) gồm 24 biến môi trường runtime bắt buộc; danh sách này chưa có biến Telegram nào. Bất kỳ biến môi trường mới nào nếu xuất hiện mà không qua sửa đổi hợp đồng triển khai đều làm hệ thống fail-closed khi nạp cấu hình.
7. **Ranh giới bí mật kỹ thuật:** Quyết định kiến trúc `ADR-046` (Điều 8) nghiêm cấm việc lưu trữ hoặc cấu hình các bí mật kỹ thuật (như token bot Telegram hay webhook secret) trong Business Configuration Control Plane hoặc cơ sở dữ liệu.
8. **Giao diện mẫu chỉ mang tính tham khảo:** Bảng điều khiển thông báo trên file HTML mẫu (`docs/prototypes/ui-reference-phuong-an-b.html`) được quy định rõ tại `ADR-003` là chỉ mang tính tham khảo (`REFERENCE-ONLY`), không được sử dụng làm căn cứ thẩm quyền nghiệp vụ để suy diễn các luồng thông báo hay trạng thái.

Do các phát hiện trên, quy trình quản trị yêu cầu dừng coi việc triển khai `P5-030` là `READY`. Thay vào đó, task `P5-030A` được lập ra để đóng toàn bộ các khoảng trống kiến trúc, xác lập các bất biến bảo mật và chuẩn bị các điều kiện tiên quyết cho việc hiện thực hóa `P5-030`.

---

## 2. Các nguyên tắc và bất biến kiến trúc bắt buộc (F1 — F12)

### F1. Cô lập Bot chuyên biệt (Dedicated Bot Isolation)
- Hệ thống Báo giảng Đam San vận hành trên môi trường chia sẻ máy chủ (`SHARED_VPS`) cùng với DamSanV5 và Quản lí nội trú. Cả hai hệ thống láng giềng này đều có hạ tầng bot Telegram riêng.
- Báo giảng bắt buộc phải có một **Telegram Bot RIÊNG BIỆT**:
  - Không được dùng chung token Telegram bot của DamSanV5 hoặc Quản lí nội trú.
  - Không được dùng chung webhook URL hoặc chia sẻ chung luồng nhận bản tin Telegram với các hệ thống láng giềng.
  - Không được tái sử dụng định danh chat (chat ID) hay can thiệp vào vòng đời tài khoản của người dùng trên các bot láng giềng.
  - Không được đọc hoặc truy cập các tệp cấu hình, biến môi trường, khóa bí mật thuộc thư mục của các hệ thống láng giềng (`D:\Quan_li_noi_tru`, `D:\Edu_DamSan`).
- Ranh giới bảo vệ láng giềng (P6 protected-neighbour boundary) được duy trì nguyên vẹn và bất khả xâm phạm.

### F2. Thẩm quyền cấu hình kỹ thuật (Technical Configuration Authority)
- Toàn bộ cấu hình liên quan đến Telegram bot và webhook thuộc về **Server-side Runtime Environment**, tuyệt đối không nằm trong Business Configuration.
- Trong pha triển khai `P5-030`, máy chủ backend sẽ sử dụng 4 biến môi trường:
  - `TELEGRAM_ENABLED`: boolean (`true` / `false`), mặc định `false` tại môi trường phát triển và kiểm thử tự động.
  - `TELEGRAM_BOT_TOKEN`: string bí mật do BotFather cấp.
  - `TELEGRAM_BOT_USERNAME`: string định danh công khai của bot (ví dụ: `BaoGiangDamSanBot`).
  - `TELEGRAM_WEBHOOK_SECRET`: string ngẫu nhiên bí mật phục vụ xác thực request webhook từ Telegram.
- **Hợp đồng TELEGRAM_WEBHOOK_SECRET và quy tắc khởi động:**
  - `TELEGRAM_WEBHOOK_SECRET` bắt buộc có độ dài từ 1 đến 256 ký tự và chỉ chứa các ký tự hợp lệ theo chuẩn Telegram Bot API: `A-Z`, `a-z`, `0-9`, `_`, `-`.
  - Khi `TELEGRAM_ENABLED=true`: Cả 3 biến `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` bắt buộc phải có giá trị hợp lệ. Nếu thiếu hoặc secret vi phạm độ dài/bộ ký tự trên, ứng dụng phải **fail startup ngay lập tức**.
  - `TELEGRAM_BOT_TOKEN` và `TELEGRAM_WEBHOOK_SECRET` là các bí mật tối mật:
    - Tuyệt đối không ghi ra file log hoặc in vào màn hình console.
    - Không đưa vào nhật ký kiểm toán (AuditLog).
    - Không trả về trong bất kỳ HTTP response nào.
    - Không hiển thị trên giao diện người dùng (UI).
    - Không lưu trữ vào cơ sở dữ liệu PostgreSQL.
    - Không cho phép xem hoặc sửa đổi qua API/UI của Business Configuration (ADR-046).
- **Phạm vi task:** P5-030A chỉ xác lập thẩm quyền và quy tắc kỹ thuật. Việc cập nhật `app.config.ts`, `.env.example`, `PRODUCTION-ENVIRONMENT-CONFIGURATION.md`, và `deployment-common.ps1` sẽ do task `P5-030` thực hiện.

### F3. Ranh giới tin cậy Webhook và Trình phân tích Provider (Webhook Trust & Parser)
- Đường dẫn webhook được ấn định cố định:
  `POST /api/integrations/telegram/webhook`
- **Nguyên tắc xác thực an toàn (Safe Secret Verification):**
  - Endpoint webhook là một cổng giao tiếp kỹ thuật công khai, không gắn với cookie phiên duyệt web của người dùng và không sử dụng cơ chế phân quyền capability.
  - Máy chủ chỉ tin cậy và xử lý request nếu request mang header `X-Telegram-Bot-Api-Secret-Token`.
  - **Phương pháp so sánh an toàn mật mã:** Tuyệt đối không gọi `crypto.timingSafeEqual` trực tiếp lên hai buffer có độ dài khác nhau vì sẽ gây lỗi `RangeError`. Hệ thống bắt buộc áp dụng:
    *Khuyến nghị chuẩn (Pattern B):* Băm cả chuỗi bí mật nhận được và chuỗi cấu hình mong đợi bằng SHA-256 thành các digest cố định 32 byte (`crypto.createHash('sha256').update(val).digest()`), sau đó so khớp bằng `crypto.timingSafeEqual(providedDigest, expectedDigest)`. (Hoặc Pattern A: kiểm tra độ dài bằng nhau trước khi thực hiện `timingSafeEqual`).
  - Nếu thiếu header, sai chuỗi bí mật, hoặc khi `TELEGRAM_ENABLED=false`: từ chối ngay lập tức bằng mã lỗi HTTP 401/403 đã khử khuẩn (fail closed); không được để phát sinh ngoại lệ không bắt được biến thành HTTP 500; tuyệt đối không in chuỗi secret nhận được hoặc secret mong đợi vào log.
- **Tiến hóa cấu trúc payload Telegram (Provider Payload Evolution):**
  - Không sử dụng cơ chế `ValidationPipe` toàn cục với `whitelist: true, forbidNonWhitelisted: true` đối với toàn bộ raw Telegram Update object, nhằm tránh làm sập webhook khi Telegram bổ sung các trường tùy chọn mới.
  - Sử dụng trình phân tích giới hạn/tối thiểu (bounded/minimal provider parser), chỉ bóc tách các trường tối thiểu cần thiết phục vụ liên kết:
    `update_id`, `message.text`, `message.chat.id`, `message.chat.type`, `message.from.id`.
  - Nếu trường bắt buộc bị thiếu hoặc sai kiểu dữ liệu/hình dạng: từ chối hoặc xử lý an toàn (reject / IGNORE fail-safe).
  - Các trường bổ sung do Telegram phát hành tự do được bỏ qua an toàn.
  - Các bản tin hợp lệ nhưng không được hỗ trợ xử lý nghiệp vụ (như ảnh, sticker, tin chỉnh sửa, callback query, hoặc tin nhắn group/channel): ghi nhận trạng thái biên nhận là `IGNORED`, trả về HTTP 200 OK thành công cho Telegram để tránh bị retry vô hạn, và cam kết zero business mutation.
  - Tuyệt đối không lưu raw JSON payload vào cơ sở dữ liệu.
- **Phạm vi tương tác tin nhắn:**
  - Webhook **CHỈ CHẤP NHẬN LỆNH LIÊN KẾT TỪ PRIVATE CHAT** (`message.chat.type === 'private'`).
  - Tuyệt đối từ chối hoặc bỏ qua các tin nhắn/lệnh đến từ nhóm (`group`), siêu nhóm (`supergroup`) hoặc kênh (`channel`).
- **An toàn nhật ký vận chuyển (Provider Transport Log Safety):**
  - Không log full URL của Telegram Bot API (tránh làm lộ token trong path `/bot<token>/`).
  - Không log request config chứa bot token.
  - Khi provider trả về lỗi, chỉ lưu trữ mã lỗi và lý do đã khử khuẩn (sanitized code/reason), không lưu toàn bộ raw HTTP response body nếu có nguy cơ lộ chi tiết kỹ thuật.

### F4. Vòng đời liên kết tài khoản và Đồng thời thử thách (Challenge Lifecycle & Concurrency)
Quy trình liên kết tài khoản giáo viên với Telegram tuân theo chu trình chặt chẽ:
1. **Yêu cầu tạo liên kết:** Giáo viên đã đăng nhập hợp lệ vào giao diện Báo giảng gửi yêu cầu tạo thử thách liên kết (`POST /api/integrations/telegram/link-challenge`).
2. **Bất biến duy nhất PENDING (Single Active Pending Challenge Invariant):**
   - Tại một thời điểm, mỗi tài khoản người dùng Báo giảng chỉ có tối đa **MỘT** thử thách ở trạng thái `PENDING` có hiệu lực.
   - Cơ sở dữ liệu phải có ràng buộc bảo vệ tương đương partial unique index:
     `UNIQUE (userId) WHERE status = 'PENDING'`.
3. **Thao tác tạo thử thách nguyên tử (Atomic Create Challenge Transaction):**
   - Lệnh tạo challenge phải chạy trong transaction:
     + Bước 1: Vô hiệu hóa/thu hồi (`REVOKED`) mọi thử thách đang `PENDING` trước đó của người dùng;
     + Bước 2: Tạo bản ghi thử thách mới ở trạng thái `PENDING`;
     + Bước 3: Commit nguyên tử.
   - Yêu cầu đồng thời (concurrent create) không được tạo ra hai token cùng khả dụng; xung đột đồng thời phải được xử lý có giới hạn và an toàn (bounded fail-safe).
4. **Sinh mã ngẫu nhiên an toàn:** Máy chủ tạo một mã token ngẫu nhiên có độ dài tối thiểu 256-bit sử dụng thư viện mật mã an toàn (`crypto.randomBytes(32).toString('base64url')` hoặc hex).
5. **Phát hành deep link:** Giao diện người dùng nhận được raw token đúng một lần duy nhất qua deep link Telegram:
   `https://t.me/<TELEGRAM_BOT_USERNAME>?start=<raw_token>`
6. **Lưu trữ băm bảo mật:** Cơ sở dữ liệu **CHỈ LƯU BẢN BĂM SHA-256** của token (`crypto.createHash('sha256').update(rawToken).digest('hex')`). Tuyệt đối không lưu raw token trong database.
7. **Thẩm quyền thời hạn (Expiry Authority):**
   - `expiresAt` là thẩm quyền duy nhất xác định thời hạn (TTL chuẩn là **10 phút**).
   - Không yêu cầu tiến trình nền/scheduler định kỳ chỉ để chuyển trạng thái sang `EXPIRED`. Một thử thách có trạng thái `PENDING` nhưng `expiresAt <= now` được xem là đã hết hiệu lực, không thể tiêu thụ, và có thể được chuẩn hóa lười (lazily normalized) sang `EXPIRED`/`REVOKED` trong các transaction lệnh liên quan.
8. **Sử dụng một lần (One-time):** Token chỉ có thể tiêu thụ đúng một lần duy nhất. Khi đã chuyển sang trạng thái tiêu thụ (`CONSUMED`) hoặc bị thu hồi (`REVOKED`), token không bao giờ có thể tái sử dụng.
9. **Tính độc lập định danh:** Việc liên kết tuyệt đối không căn cứ vào tên hiển thị (`displayName`), Telegram username (`@username`), số điện thoại, hay mã cán bộ (`staffCode`). Quyền sở hữu tài khoản hoàn toàn do thử thách mật mã từ máy chủ quyết định.

### F5. Lưu trữ định danh Telegram (Telegram Identity Persistence)
- **Định dạng định danh chuẩn (Factual Identity Accuracy):**
  - Định danh người dùng và cuộc trò chuyện của Telegram Bot API có thể vượt quá số nguyên 32-bit (int32). Tài liệu chính thức của nhà cung cấp Telegram hiện giới hạn các định danh đối thoại Bot API trong tối đa 52 bit có nghĩa (52 significant bits).
  - Quyết định lưu trữ `telegramUserId` và `telegramChatId` dưới dạng **chuỗi số thập phân chuẩn (`canonical decimal STRING`)** (ví dụ: `"1234567890"`) tiếp tục được duy trì nghiêm ngặt vì các lý do kiến trúc:
    + Đảm bảo tính ổn định xuyên suốt các tầng PostgreSQL (`BigInt`/`VARCHAR`), Prisma, JSON serialization và network transport;
    + Ngăn ngừa rủi ro ép kiểu số thực (float coercion) hoặc sai số làm tròn giữa các client/layer khác nhau;
    + Giữ nguyên định danh bên ngoài của provider như một giá trị mờ (opaque external identifier).
  - Tuyệt đối không biến định danh số này thành các phép toán số học nghiệp vụ.
- **Các thông tin bắt buộc lưu trữ:**
  - `telegramUserId`: ID người dùng Telegram (chuỗi thập phân).
  - `telegramChatId`: ID private chat của người dùng (chuỗi thập phân).
  - `userId`: Khóa ngoại tham chiếu đến bảng `User` của Báo giảng.
  - `linkedAt`: Thời điểm liên kết thành công.
  - `status`: Trạng thái liên kết (`ACTIVE` / `REVOKED`).
  - `revokedAt`: Thời điểm hủy liên kết (nếu có).
  - `retainedLinkIdentity`: Định danh bản ghi phục vụ truy vết lịch sử.
- **Tối thiểu hóa dữ liệu (Data Minimization):**
  - Không lưu tên, họ, bí danh (nickname), ảnh đại diện (avatar) hay raw profile payload của người dùng Telegram.
- **Quy tắc liên kết duy nhất (Active Uniqueness):**
  - Tại một thời điểm, một tài khoản Báo giảng chỉ được có tối đa **MỘT** liên kết Telegram ở trạng thái `ACTIVE`.
  - Tại một thời điểm, một tài khoản Telegram (chat ID) chỉ được có tối đa **MỘT** tài khoản Báo giảng ở trạng thái `ACTIVE`.
  - Không cho phép chuyển giao âm thầm (silent takeover) một tài khoản Telegram từ người dùng Báo giảng này sang người dùng Báo giảng khác. Nếu tài khoản Telegram đang liên kết với giáo viên A, giáo viên B cố gắng liên kết sẽ bị từ chối trừ khi giáo viên A đã thực hiện hủy liên kết.
  - Thay đổi tài khoản Telegram: Phải thực hiện hủy liên kết hiện tại (`DELETE /api/integrations/telegram/link`), sau đó mới tạo liên kết mới.
  - Không bao giờ xóa cứng (hard-delete) các bản ghi liên kết cũ; lịch sử liên kết phải được bảo tồn phục vụ kiểm toán và truy vết.

### F6. Cấu trúc lưu trữ và Hộp thư Webhook nguyên tử (Persistence Topology & Atomic Inbox)
Kiến trúc yêu cầu pha triển khai P5-030 phải thiết kế và bổ sung vào Prisma schema 4 thực thể lưu trữ bền vững:

```text
┌────────────────────────┐        ┌─────────────────────────┐
│  TelegramLinkChallenge │        │   TelegramAccountLink   │
├────────────────────────┤        ├─────────────────────────┤
│ id (UUID)              │        │ id (UUID)               │
│ userId (FK User)       │        │ userId (FK User)        │
│ tokenHash (SHA-256)    │        │ telegramUserId (STRING) │
│ expiresAt (TIMESTAMP)  │───────>│ telegramChatId (STRING) │
│ status (ENUM)          │        │ status (ACTIVE/REVOKED) │
│ consumedAt (TIMESTAMP) │        │ linkedAt (TIMESTAMP)    │
│ createdAt (TIMESTAMP)  │        │ revokedAt (TIMESTAMP)   │
└────────────────────────┘        └────────────┬────────────┘
                                               │
                                               │ 1..N
                                               ▼
┌────────────────────────┐        ┌───────────────────────────────┐
│ TelegramWebhookReceipt │        │ TelegramNotificationDelivery  │
├────────────────────────┤        ├───────────────────────────────┤
│ id (UUID)              │        │ id (UUID)                     │
│ updateId (STRING, UQ)  │        │ commandKey (STRING, UQ)       │
│ receivedAt (TIMESTAMP) │        │ actorUserId (FK User)         │
│ processedAt (TIMESTAMP)│        │ requestKey (STRING, NULLABLE) │
│ status (ENUM)          │        │ commandFingerprint (STRING)   │
└────────────────────────┘        │ accountLinkId (FK Link)       │
                                  │ telegramChatId (STRING)       │
                                  │ notificationType (ENUM)       │
                                  │ payloadDigest (STRING)        │
                                  │ deliveryStatus (ENUM)         │
                                  │ attemptStartedAt (TIMESTAMP)  │
                                  │ providerMessageId (STRING)    │
                                  │ sanitizedErrorCode (STRING)   │
                                  │ createdAt (TIMESTAMP)         │
                                  │ updatedAt (TIMESTAMP)         │
                                  │ sentAt (TIMESTAMP)            │
                                  └───────────────────────────────┘
```

**Bảo vệ mức Cơ sở dữ liệu và Nguyên tắc Hộp thư nguyên tử (Atomic Inbox Invariant):**
- `TelegramLinkChallenge`: Ràng buộc `tokenHash` là duy nhất (`UNIQUE`). Ràng buộc partial unique index: `UNIQUE (userId) WHERE status = 'PENDING'`.
- `TelegramAccountLink`: Bắt buộc bảo vệ tính duy nhất khi `ACTIVE` ở cấp độ PostgreSQL (bằng partial unique index):
  - Duy nhất `userId` khi `status = 'ACTIVE'`;
  - Duy nhất `telegramUserId` khi `status = 'ACTIVE'`;
  - Duy nhất `telegramChatId` khi `status = 'ACTIVE'`.
- `TelegramWebhookReceipt`: Ràng buộc `updateId` là duy nhất (`UNIQUE`).
- `TelegramNotificationDelivery`:
  - Ràng buộc định danh lệnh nội bộ duy nhất toàn cục: `UNIQUE (commandKey)`;
  - Ràng buộc actor-scoped idempotency: `UNIQUE (actorUserId, requestKey) WHERE requestKey IS NOT NULL` đối với các lệnh do client khởi tạo;
  - Quyền sở hữu lượt gửi tin nguyên tử (Atomic Send Claim): Thực hiện qua điều kiện cập nhật `WHERE id = :id AND deliveryStatus = 'RESERVED'`.
- **Ranh giới giao dịch nguyên tử:** Khi nhận lệnh Telegram `/start <token>` hợp lệ, toàn bộ chuỗi xử lý:
  + Ghi nhận/khử trùng lặp biên nhận `TelegramWebhookReceipt`;
  + Xác thực và tiêu thụ thử thách `TelegramLinkChallenge` (`PENDING -> CONSUMED`);
  + Tạo bản ghi liên kết tài khoản `TelegramAccountLink` (`ACTIVE`);
  + Cấp phát lệnh gửi thông báo chào mừng `TelegramNotificationDelivery` (`RESERVED`) với `commandKey = link-success:<accountLinkId>`;
  **BẮT BUỘC ĐƯỢC COMMIT TRONG CÙNG MỘT RANH GIỚI TRANSACTION CƠ SỞ DỮ LIỆU NGUYÊN TỬ** (hoặc cỗ máy trạng thái inbox tương đương).
- Tuyệt đối cấm kịch bản: commit receipt đã xử lý, tiến trình bị crash trước khi tạo link, và khi Telegram gửi lại bản tin thì bị bỏ qua vì `update_id` đã tồn tại.
- Khi Telegram gửi lại cùng `update_id`: hệ thống nhận diện bản tin đã xử lý thành công, phát lại kết quả cũ, không tạo thêm link thứ hai, không tiêu thụ challenge lần hai và không phát sinh thông báo chào mừng thứ hai.
- **Tuyệt đối không thực hiện network call ra bên ngoài bên trong transaction cơ sở dữ liệu.**

**Quy tắc Migration:**
- Migration chỉ được mang tính bổ sung (`additive only`), không phá vỡ schema hiện tại.
- Zero destructive backfill; không thay đổi dữ liệu của các phân hệ nghiệp vụ khác.
- Ràng buộc khóa ngoại sử dụng `ON DELETE RESTRICT` để bảo đảm an toàn dữ liệu.

### F7. Giao diện API người dùng cá nhân (Authenticated Personal API)
Trong P5-030, các endpoint cá nhân sau sẽ được hiện thực:
1. `GET /api/integrations/telegram/me`
   - Lấy trạng thái liên kết Telegram của người dùng hiện tại.
   - Trả về: `linked: boolean`, thông tin liên kết (nếu có: `linkedAt`, trạng thái), hoặc thông tin challenge đang chờ (nếu có: `pendingChallenge: { expiresAt }`).
   - Tuyệt đối không trả về raw token hay secret.
2. `POST /api/integrations/telegram/link-challenge`
   - Tạo thử thách liên kết mới cho tài khoản hiện tại.
   - Hủy bỏ các challenge chưa dùng trước đó của tài khoản.
   - Trả về: `deepLink` (chứa raw token chỉ xuất hiện 1 lần này), `expiresAt`.
3. `DELETE /api/integrations/telegram/link`
   - Hủy liên kết Telegram đang hoạt động của người dùng hiện tại (`ACTIVE -> REVOKED`).
   - Ghi nhận `revokedAt` và bằng chứng kiểm toán.
4. `POST /api/integrations/telegram/test`
   - Gửi một tin nhắn thử nghiệm mẫu đến Telegram của người dùng hiện tại để kiểm tra kết nối.
   - Request body: `{ "requestKey": "<uuid-v4>" }` với `requestKey` là chuỗi UUID v4 chuẩn.
   - Nội dung tin nhắn do máy chủ sở hữu cố định: *“Báo giảng Đam San đã kết nối Telegram thành công.”*

**Quy tắc phân quyền:**
- Tái sử dụng phiên làm việc đăng nhập hiện hành (`baogiang_session`).
- Đây là tích hợp định danh cá nhân, không tạo thêm capability phân quyền nghiệp vụ mới.
- Áp dụng chính sách bảo mật hiện tại: chặn truy cập nếu tài khoản đang bị cờ `mustChangePassword`.
- Máy chủ tự trích xuất `actorUserId` từ session; client tuyệt đối không được truyền `actorUserId` hoặc `userId` của người khác.

### F8. Vòng đời thông báo và Lũy kế lệnh gửi tin (Notification Lifecycle & Idempotency)
- Telegram Bot API không hỗ trợ native idempotency header; hệ thống bảo đảm chuẩn mực:
  **`INTERNAL COMMAND IDEMPOTENCY + NO AUTOMATIC DUPLICATE AMPLIFICATION`**

- **Phân định rõ ràng mô hình định danh lệnh (Command Identity vs Request Key):**
  1. `commandKey`:
     - **Do máy chủ sở hữu hoàn toàn (SERVER-OWNED)**;
     - Duy nhất toàn cầu (`UNIQUE (commandKey)`);
     - Bất biến (`immutable`);
     - Đóng vai trò là định danh logic nội bộ duy nhất cho mỗi lệnh gửi tin.
     - Định dạng chuẩn:
       + Lệnh gửi thử cá nhân: `self-test:<actorUserId>:<requestKey>`
       + Lệnh chào mừng liên kết: `link-success:<accountLinkId>`
  2. `requestKey`:
     - **Do client cung cấp (CLIENT-SUPPLIED)** chỉ dành riêng cho các lệnh do người dùng kích hoạt qua API xác thực (`POST /api/integrations/telegram/test`);
     - Phạm vi duy nhất giới hạn theo người dùng (`actor-scoped`), KHÔNG PHẢI khóa duy nhất toàn cục;
     - Có giá trị `null` hoặc vắng mặt đối với các lệnh do máy chủ khởi tạo (như `LINK_SUCCESS`).
  3. `actorUserId`:
     - Được máy chủ xác định độc quyền từ phiên làm việc (`baogiang_session`) hoặc liên kết tài khoản đã commit;
     - Tuyệt đối không tin tưởng hoặc nhận `actorUserId` từ client payload hay provider update payload.

- **Khóa hợp đồng `requestKey` có giới hạn (Bounded Request Key):**
  - `requestKey` bắt buộc phải là chuỗi định danh **UUID v4 chuẩn (canonical lowercase string)** (biểu thức chính quy: `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).
  - Tuyệt đối không chấp nhận chuỗi tùy ý hoặc chuỗi không giới hạn độ dài.
  - **Quy tắc client:** Client sinh một UUID v4 cho một lần click logic. Khi gặp kết quả chưa rõ (timeout, mất kết nối mạng), client thử lại **phải tái sử dụng cùng requestKey (cùng UUID)**. Mỗi lần người dùng click mới sẽ sinh một UUID mới.
  - **Quy tắc server:** DTO validation kiểm tra nghiêm ngặt định dạng UUID v4; nếu không hợp lệ hoặc vượt kích thước thì từ chối ngay với HTTP `400 Bad Request`. Máy chủ không được tự động cắt gọt (trim) hay chuẩn hóa biến đổi key sau khi tính fingerprint.

- **Quyền sở hữu lượt gửi tin nguyên tử (Delivery Send Ownership Invariant):**
  - **CHỈ DUY NHẤT execution path nào atomically claim thành công trạng thái `RESERVED -> ATTEMPTING` mới được phép thực hiện cuộc gọi mạng tới Telegram Bot API.**
  - Thao tác claim phải là một câu lệnh so khớp có điều kiện nguyên tử (compare-and-set):
    ```sql
    UPDATE "telegram_notification_deliveries"
    SET "deliveryStatus" = 'ATTEMPTING',
        "attemptStartedAt" = NOW(),
        "updatedAt" = NOW()
    WHERE "id" = :deliveryId AND "deliveryStatus" = 'RESERVED';
    ```
  - Nếu số dòng bị ảnh hưởng (`affected rows`) bằng 0:
    + Caller **TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP GỌI TELEGRAM BOT API**;
    + Caller phải đọc lại/phát lại trạng thái lưu trữ bền vững (`SENT`, `ATTEMPTING`, `FAILED` hoặc `UNKNOWN`).
  - Hai luồng hoặc worker đồng thời không bao giờ cùng nhận được quyền gửi cùng một bản ghi delivery.
  - **TUYỆT ĐỐI CẤM** mô hình chạy đua (race condition): `đọc RESERVED -> gọi mạng gửi tin -> cập nhật ATTEMPTING`.
  - **Thứ tự thực thi bắt buộc:**
    1. Atomic claim `RESERVED -> ATTEMPTING` (kèm ghi nhận `attemptStartedAt`);
    2. Commit transaction cơ sở dữ liệu;
    3. Thực hiện provider network call sang Telegram API;
    4. Cập nhật kết quả bền vững cuối cùng (`SENT`, `FAILED` hoặc `UNKNOWN`).
  - Network I/O tuyệt đối nằm ngoài transaction DB.

- **Thời điểm bắt đầu lần gửi và Đối soát (Attempt Ownership Timestamp & Reconciliation):**
  - Bản ghi `TelegramNotificationDelivery` lưu giữ mốc thời gian `attemptStartedAt` nguyên tử cùng lúc với trạng thái `ATTEMPTING`.
  - Các trạng thái kết thúc `SENT`, `FAILED`, `UNKNOWN` tiếp tục lưu giữ giá trị `attemptStartedAt` này phục vụ kiểm toán và tính toán độ trễ.
  - Provider network call không được phép bắt đầu trước khi `ATTEMPTING` kèm `attemptStartedAt` đã được commit vào DB.
  - **Sau khi tiến trình bị khởi động lại (process restart):** Bất kỳ bản ghi nào còn treo ở `ATTEMPTING` mà không có xác nhận thành công từ Telegram đều được coi là `UNKNOWN` và **TUYỆT ĐỐI KHÔNG TỰ ĐỘNG GỬI LẠI (NO AUTO-RETRY)**.
  - **Đối soát trong cùng runtime:** Việc xác định một bản ghi `ATTEMPTING` bị quá hạn (stale) bắt buộc phải dựa trên giá trị `attemptStartedAt` bền vững trong DB và quy tắc thời gian chờ có giới hạn (ví dụ: quá 60 giây), không dựa vào in-memory timer. Không yêu cầu worker tự động thử lại trong đợt thí điểm P5-030.

- **Xử lý đồng thời và Phát lại Self-Test (Self-Test Concurrent Replay):**
  - Hai yêu cầu gửi thử đồng thời có cùng bộ ba `(actorUserId, requestKey, commandFingerprint)`:
    + Chỉ tạo đúng **MỘT** bản ghi `TelegramNotificationDelivery` trong cơ sở dữ liệu;
    + Chỉ có đúng **MỘT** caller claim thành công `RESERVED -> ATTEMPTING`;
    + Tối đa **MỘT** cuộc gọi tới Telegram Bot API;
    + Caller còn lại nhận thấy affected rows = 0 hoặc bản ghi đã được xử lý sẽ chỉ đọc lại trạng thái bền vững và trả kết quả cho client, không gửi trùng lặp.
  - Cùng `actorUserId` + cùng `requestKey` nhưng khác `commandFingerprint`: Trả về lỗi `409 Conflict` ngay lập tức trước khi gọi Telegram.

- **Tính đồng thời của Thông báo chào mừng (Link-Success Concurrency):**
  - Bản ghi `TelegramNotificationDelivery` cho tin nhắn chào mừng được cấp phát (`RESERVED`) ngay trong transaction nguyên tử của inbox webhook.
  - `commandKey` mang tính tiền định theo định danh liên kết: `link-success:<accountLinkId>`.
  - Bản tin trùng lặp `update_id` hoặc retry transaction không tạo thêm delivery thứ hai, không tạo `commandKey` thứ hai, và không gửi Telegram hai lần.
  - Việc gửi tin sau commit hoàn toàn tuân thủ quy tắc atomic claim `RESERVED -> ATTEMPTING`.

- **Ngữ nghĩa trạng thái gửi tin và xử lý bất định/sập nguồn (Crash/Ambiguity Semantics):**
  - `RESERVED`: Đã cấp phát bản ghi gửi tin trong DB trước khi gọi mạng.
  - `ATTEMPTING`: Đã claim thành công quyền gửi và đang thực hiện kết nối HTTP sang Telegram API.
  - `SENT`: Telegram Bot API xác nhận thành công (HTTP 200 `ok: true`) kèm `message_id`. Trường `providerMessageId` chỉ có giá trị thẩm quyền khi provider đã xác nhận thành công.
  - `FAILED`: Chỉ áp dụng khi hệ thống có bằng chứng xác định request bị từ chối dứt điểm từ provider (ví dụ: HTTP 400 Bad Request, HTTP 403 Bot bị người dùng chặn, HTTP 404 Bot bị xóa).
  - `UNKNOWN`:
    + Hết thời gian chờ (timeout);
    + Đứt kết nối socket / socket hangup;
    + Phản hồi 5xx từ Telegram sau khi request có thể đã rời khỏi máy chủ;
    + Tiến trình bị crash sau khi đã chuyển sang `ATTEMPTING` mà chưa có xác nhận `SENT` hoặc `FAILED`.
  - **Xử lý bản ghi ATTEMPTING bị treo:** Khi hệ thống khởi động lại hoặc chạy đối soát, bất kỳ bản ghi nào còn treo ở trạng thái `ATTEMPTING` phải được chuyển sang `UNKNOWN` và **TUYỆT ĐỐI KHÔNG TỰ ĐỘNG GỬI LẠI (NO AUTO-RETRY)**. Không được âm thầm chuyển `ATTEMPTING` về `RESERVED` để gửi lại.

### F9. Giới hạn phạm vi thông báo đợt thí điểm (Pilot Notification Scope)
- Hiện tại hệ thống chưa có thẩm quyền chính thức cho danh mục thông báo nghiệp vụ tự động trong trường học.
- Task P5-030 **TUYỆT ĐỐI KHÔNG TỰ Ý HIỆN THỰC CÁC TRIGGER THÔNG BÁO NGHIỆP VỤ**, bao gồm:
  - Cảnh báo nợ tiết PPCT;
  - Thông báo duyệt/từ chối báo cáo giảng dạy;
  - Thay đổi Thời khóa biểu;
  - Lịch dạy bù;
  - Thông báo GDĐP / HĐTN;
  - Hoặc các thông báo nghiệp vụ trường học khác.
- Giao diện thông báo trong prototype HTML là `REFERENCE-ONLY`.
- **Phạm vi thông báo được phê duyệt cho thí điểm P5-030 chỉ bao gồm:**
  1. Tin nhắn xác nhận liên kết thành công sau khi nhấn `/start` trong Telegram bot;
  2. Tính năng "Gửi tin thử" (Self-test notification) do người dùng chủ động kích hoạt;
  3. Bằng chứng lưu trữ biên nhận và tính lũy kế của các tin nhắn trên.
- Tin nhắn tự thử nghiệm có nội dung cố định do máy chủ kiểm soát:
  *“Báo giảng Đam San đã kết nối Telegram thành công.”*

### F10. Thẩm quyền Giao diện người dùng (UI Authority)
- Giao diện quản lý liên kết Telegram được tích hợp vào trang Hồ sơ cá nhân (`ProfilePage.tsx` tại `/ho-so-ca-nhan` hoặc `/ho-so`).
- **Các trạng thái người dùng (User States):**
  - *Chưa liên kết:* Hiển thị giải thích ngắn gọn và nút bấm "Liên kết Telegram".
  - *Đang chờ liên kết:* Hiển thị hướng dẫn mở bot Telegram, nút mở deep link và đồng hồ đếm ngược thời gian hết hạn (10 phút).
  - *Đã liên kết:* Hiển thị thông báo trạng thái đã kết nối, thời gian liên kết, nút "Gửi tin thử" và nút "Hủy liên kết".
  - *Lỗi / Không xác định:* Hiển thị thông báo lỗi thân thiện bằng tiếng Việt.
- **Các hành động khả dụng:**
  - "Liên kết Telegram"
  - "Mở Telegram kết nối" (mở deep link)
  - "Gửi tin thử"
  - "Hủy liên kết"
- **Quy tắc hiển thị an toàn:**
  - Không hiển thị bất kỳ token kỹ thuật nào trên UI.
  - Không hiển thị các mã số nội bộ của Telegram (`telegramUserId`, `telegramChatId`) cho người dùng thông thường.
  - Không tạo trang cấu hình kỹ thuật tùy tiện.
  - Tuân thủ toàn diện kỹ năng `damsan-ui` và phong cách thiết kế trong `DESIGN.md` (kiểu chữ Be Vietnam Pro, màu token ngữ nghĩa, bố cục basalt rail, không sử dụng gradient hoặc glassmorphism).

### F11. Ranh giới Kiểm thử tự động (Testing Boundary)
- Quy chuẩn kiểm thử trên CI và môi trường kiểm thử cục bộ:
  - **KHÔNG GỌI TELEGRAM THẬT.**
  - **KHÔNG CẦN BOT TOKEN THẬT.**
  - **KHÔNG COMMIT CÁC CHUỖI SECRET THẬT VÀO KHO LƯU TRỮ.**
  - Mọi bài kiểm thử tích hợp và kiểm thử đơn vị phải dùng cổng vận chuyển giả lập (`fake/mock TelegramTransportPort`) được tiêm phụ thuộc.
- Ma trận kiểm thử của P5-030 bắt buộc bao gồm tối thiểu **20 ca kiểm thử**:
  1. Header webhook secret có độ dài/định dạng sai lệch không gây lỗi HTTP 500;
  2. Kiểm tra bộ ký tự và độ dài hợp lệ của cấu hình `TELEGRAM_WEBHOOK_SECRET` (1..256 ký tự `[A-Za-z0-9_-]`);
  3. Telegram gửi thêm các trường mới không làm hỏng việc xử lý lệnh `/start` hợp lệ;
  4. Bản tin Telegram hợp lệ nhưng không được hỗ trợ (sticker, photo, group) được ghi nhận `IGNORED` và không gây đột biến dữ liệu;
  5. Các yêu cầu tạo challenge đồng thời chỉ sinh tối đa 1 token `PENDING` có hiệu lực;
  6. Thử thách `PENDING` đã hết thời hạn (`expiresAt <= now`) không thể tiêu thụ;
  7. Sự cố sập tiến trình/rollback xung quanh biên nhận webhook không làm mất bản tin linking hợp lệ;
  8. Bản tin trùng lặp `update_id` không tạo liên kết thứ hai hoặc thông báo chào mừng thứ hai;
  9. Gọi "Gửi tin thử" với cùng `requestKey` và cùng fingerprint không gọi lại Telegram provider lần thứ hai;
  10. Gọi "Gửi tin thử" với cùng `requestKey` nhưng khác fingerprint trả về lỗi `409 Conflict`;
  11. Hai người dùng khác nhau gửi cùng chuỗi `requestKey` không bị xung đột khóa (actor-scoped idempotency);
  12. Bản tin bị treo ở trạng thái `ATTEMPTING` được chuyển thành `UNKNOWN` và không tự động gửi lại;
  13. Thông báo lỗi từ provider được khử khuẩn, không làm lộ bot token hay full provider URL;
  14. Hai request self-test đồng thời với cùng actor và cùng `requestKey`: chỉ tạo đúng 1 bản ghi delivery và tối đa 1 provider call, caller thứ hai phát lại kết quả bền vững;
  15. Caller thứ hai không thể claim bản ghi đã ở trạng thái `ATTEMPTING`: thao tác atomic conditional update trả về 0 affected rows, ngăn chặn gọi provider;
  16. `requestKey` không hợp lệ hoặc vượt kích thước (không phải UUID v4 hợp lệ): DTO validation trả về HTTP 400 Bad Request, không tạo delivery và không đột biến DB;
  17. Hai người dùng khác nhau gửi cùng chuỗi `requestKey`: sinh ra hai `commandKey` độc lập, tạo hai bản ghi delivery độc lập và không xảy ra va chạm khóa;
  18. Bản tin liên kết trùng lặp hoặc thử lại transaction: chỉ tạo đúng 1 `commandKey` duy nhất (`link-success:<accountLinkId>`), 1 delivery duy nhất và tối đa 1 provider call;
  19. Chuyển trạng thái `RESERVED -> ATTEMPTING` ghi nhận nguyên tử `attemptStartedAt` trước khi tiến hành provider network call;
  20. Khởi động lại hoặc đối soát bản ghi `ATTEMPTING` bị treo: chuyển trạng thái sang `UNKNOWN` dựa trên `attemptStartedAt` bền vững, tuyệt đối không tự động gửi lại (no auto-resend).

### F12. Ranh giới Môi trường Triển khai & Production (Production Boundary)
- Task `P5-030A` và `P5-030`:
  - **KHÔNG** tạo bot thật trên Telegram;
  - **KHÔNG** gọi BotFather;
  - **KHÔNG** chạy lệnh `setWebhook` trên môi trường thật;
  - **KHÔNG** truy cập VPS production;
  - **KHÔNG** can thiệp cấu hình Nginx;
  - **KHÔNG** thực hiện deploy;
  - **KHÔNG** sử dụng cơ sở dữ liệu production.
- Việc kích hoạt bot Telegram thật, cấp phát token production và thiết lập webhook production thuộc về quy trình triển khai có kiểm soát sau này, cùng thẩm quyền với các task P6.
- Trạng thái môi trường production tiếp tục duy trì strictly **`PRE-OPERATIONAL`**.

---

## 3. Kế hoạch triển khai cho task P5-030

Sau khi task tài liệu `P5-030A` được phê duyệt độc lập và đóng chính thức bởi `SYNC-P5-030A`, task hiện thực `P5-030` chuyển sang trạng thái **`READY`** và sẽ được kích hoạt trên một nhánh riêng (`feat/p5-030-telegram-integration`) với các bước thực thi:

1. **Prisma Schema & Migrations:**
   - Thêm 4 model: `TelegramLinkChallenge`, `TelegramAccountLink`, `TelegramWebhookReceipt`, `TelegramNotificationDelivery`.
   - Bổ sung `commandKey` duy nhất toàn cục, `(actorUserId, requestKey)` duy nhất có điều kiện, `attemptStartedAt`, và các partial unique indexes cho các liên kết `ACTIVE` và challenge `PENDING`.
   - Sinh migration additive và kiểm thử khả năng áp dụng migration.
2. **Cấu hình & Môi trường:**
   - Cập nhật `apps/api/src/config/app.config.ts` để đọc và kiểm tra 4 biến môi trường Telegram.
   - Cập nhật `apps/api/.env.example`.
   - Cập nhật hợp đồng kiểm tra biến môi trường production trong `docs/operations/PRODUCTION-ENVIRONMENT-CONFIGURATION.md`, `scripts/deploy/windows/deployment-common.ps1` và các bài test triển khai.
3. **Backend Service & Webhook:**
   - Hiện thực `TelegramIntegrationService` xử lý challenge, băm token, quản lý liên kết và gửi tin thử nghiệm.
   - Hiện thực `TelegramWebhookController` tiếp nhận webhook từ Telegram với xác thực secret token bằng SHA-256 digest so khớp an toàn thời gian.
   - Hiện thực `TelegramPersonalController` phục vụ 4 API cá nhân.
   - Hiện thực module vận chuyển tin nhắn với hỗ trợ giả lập, atomic send claim và cơ chế lũy kế.
4. **Giao diện Web:**
   - Cập nhật `ProfilePage.tsx` tích hợp bảng quản lý Telegram cá nhân theo đúng tiêu chuẩn `DESIGN.md`.
5. **Kiểm thử tự động:**
   - Viết trọn vẹn bộ kiểm thử đơn vị và tích hợp cho toàn bộ 20 ca kiểm thử trong ma trận F11.
