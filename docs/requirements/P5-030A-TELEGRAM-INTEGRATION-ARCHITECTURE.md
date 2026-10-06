# P5-030A — Kiến Trúc Tích Hợp Telegram Chuyên Biệt

## Trạng thái và thẩm quyền

- **Task ID:** `P5-030A` — Dedicated Telegram integration architecture closure
- **Trạng thái:** `IN_REVIEW`
- **Nhánh thực thi:** `docs/p5-030a-telegram-architecture`
- **Mốc xuất phát chuẩn:** `origin/main@a8f49f7048b879cc8ad01627643c33a2429f4f05`
- **Phụ thuộc:** `P5-010` (CLOSED)
- **Truy vết nghiệp vụ:** `T33` (`NEW_PRODUCT_AUTHORITY`)
- **Phân loại:** **DOCS-ONLY**. Tuyệt đối không thay đổi mã nguồn runtime, Prisma schema, migration, API, giao diện UI, cấu hình deploy hoặc cơ sở dữ liệu.
- **Quyết định kiến trúc đi kèm:** `docs/decisions/ADR-058-DEDICATED-TELEGRAM-INTEGRATION.md`.

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

Do các phát hiện trên, quy trình quản trị yêu cầu dừng coi việc triển khai `P5-030` là `READY`. Thay vào đó, task `P5-030A` được lập ra để đóng toàn bộ các lỗ hổng kiến trúc, xác lập các bất biến bảo mật và chuẩn bị các điều kiện tiên quyết cho việc hiện thực hóa `P5-030`.

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
- **Quy tắc bảo mật bất biến:**
  - Khi `TELEGRAM_ENABLED=true`: Cả 3 biến `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` bắt buộc phải có giá trị hợp lệ. Nếu thiếu hoặc không hợp lệ, ứng dụng phải fail-closed ngay khi khởi động.
  - `TELEGRAM_BOT_TOKEN` và `TELEGRAM_WEBHOOK_SECRET` là các bí mật tối mật:
    - Tuyệt đối không ghi ra file log hoặc in vào màn hình console.
    - Không đưa vào nhật ký kiểm toán (AuditLog).
    - Không trả về trong bất kỳ HTTP response nào.
    - Không hiển thị trên giao diện người dùng (UI).
    - Không lưu trữ vào cơ sở dữ liệu PostgreSQL.
    - Không cho phép xem hoặc sửa đổi qua API/UI của Business Configuration (ADR-046).
- **Phạm vi task:** P5-030A chỉ xác lập thẩm quyền và quy tắc kỹ thuật. Việc cập nhật `app.config.ts`, `.env.example`, `PRODUCTION-ENVIRONMENT-CONFIGURATION.md`, và `deployment-common.ps1` sẽ do task `P5-030` thực hiện.

### F3. Ranh giới tin cậy Webhook (Webhook Trust Boundary)
- Đường dẫn webhook được ấn định cố định:
  `POST /api/integrations/telegram/webhook`
- **Nguyên tắc xác thực:**
  - Endpoint webhook là một cổng giao tiếp kỹ thuật công khai, không gắn với cookie phiên duyệt web của người dùng và không sử dụng cơ chế phân quyền capability.
  - Máy chủ chỉ tin cậy và xử lý request nếu request mang header `X-Telegram-Bot-Api-Secret-Token` có giá trị khớp chính xác với `TELEGRAM_WEBHOOK_SECRET`.
  - Việc so khớp chuỗi bí mật phải dùng phương pháp so sánh an toàn về thời gian (`crypto.timingSafeEqual`) để phòng tránh tấn công timing attack.
  - Nếu thiếu header, sai chuỗi bí mật, hoặc khi `TELEGRAM_ENABLED=false`: từ chối ngay lập tức bằng mã lỗi HTTP 401/403 (fail closed).
  - Phân tích cấu trúc dữ liệu gửi lên (Telegram Update DTO) một cách nghiêm ngặt; loại bỏ các trường không thuộc DTO.
  - Tuyệt đối không lưu trữ toàn bộ nội dung JSON (raw update body) vào cơ sở dữ liệu.
  - Không log nội dung request thô, start payload hay token.
- **Ranh giới tương tác tin nhắn:**
  - Webhook **CHỈ CHẤP NHẬN LỆNH LIÊN KẾT TỪ PRIVATE CHAT** (`message.chat.type === 'private'`).
  - Tuyệt đối từ chối hoặc bỏ qua các tin nhắn/lệnh đến từ nhóm (`group`), siêu nhóm (`supergroup`) hoặc kênh (`channel`).
  - Mỗi định danh bản tin Telegram (`update_id`) phải được kiểm tra trùng lặp bền vững (durable deduplication) trước khi xử lý.

### F4. Vòng đời liên kết tài khoản dùng một lần (One-Time Account Linking)
Quy trình liên kết tài khoản giáo viên với Telegram tuân theo chu trình chặt chẽ:
1. **Yêu cầu tạo liên kết:** Giáo viên đã đăng nhập hợp lệ vào giao diện Báo giảng gửi yêu cầu tạo thử thách liên kết (`POST /api/integrations/telegram/link-challenge`).
2. **Sinh mã ngẫu nhiên an toàn:** Máy chủ tạo một mã token ngẫu nhiên có độ dài tối thiểu 256-bit sử dụng thư viện mật mã an toàn (`crypto.randomBytes(32).toString('base64url')`).
3. **Phát hành deep link:** Giao diện người dùng nhận được raw token đúng một lần duy nhất qua deep link Telegram:
   `https://t.me/<TELEGRAM_BOT_USERNAME>?start=<raw_token>`
4. **Lưu trữ băm bảo mật:** Cơ sở dữ liệu **CHỈ LƯU BẢN BĂM SHA-256** của token (`crypto.createHash('sha256').update(rawToken).digest('hex')`). Tuyệt đối không lưu raw token trong database.
5. **Thời hạn hiệu lực (TTL):** Thời gian sống của thử thách là **10 phút**. Sau 10 phút, thử thách tự động hết hạn (`EXPIRED`).
6. **Sử dụng một lần (One-time):** Token chỉ có thể tiêu thụ đúng một lần duy nhất. Khi đã chuyển sang trạng thái tiêu thụ (`CONSUMED`) hoặc bị thu hồi (`REVOKED`), token không bao giờ có thể tái sử dụng.
7. **Hủy thử thách cũ:** Khi người dùng gửi yêu cầu tạo thử thách mới, toàn bộ các thử thách chưa sử dụng trước đó của cùng người dùng phải bị hủy bỏ ngay lập tức.
8. **Tiêu thụ nguyên tử:** Khi webhook nhận lệnh `/start <raw_token>` từ một private chat hợp lệ, hệ thống thực hiện băm token, xác thực challenge và tạo bản ghi liên kết trong cùng một giao dịch cơ sở dữ liệu nguyên tử (atomic database transaction).
9. **Tính độc lập định danh:** Việc liên kết tuyệt đối không căn cứ vào tên hiển thị (`displayName`), Telegram username (`@username`), số điện thoại, hay mã cán bộ (`staffCode`). Quyền sở hữu tài khoản hoàn toàn do thử thách mật mã từ máy chủ quyết định.

### F5. Lưu trữ định danh Telegram (Telegram Identity Persistence)
- **Kiểu dữ liệu định danh:** Định danh Telegram (`user.id`, `chat.id`) là các số nguyên 64-bit có thể vượt quá ngưỡng an toàn số nguyên của JavaScript (`Number.MAX_SAFE_INTEGER`). Do đó, hệ thống bắt buộc phải lưu trữ và truyền tải `telegramUserId` và `telegramChatId` dưới dạng **chuỗi số thập phân chuẩn (canonical decimal STRING)** (ví dụ: `"1234567890"`), tuyệt đối không dùng JSON Number.
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

### F6. Cấu trúc lưu trữ dữ liệu (Persistence Topology)
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
│ updateId (STRING, UQ)  │        │ idempotencyKey (STRING, UQ)   │
│ receivedAt (TIMESTAMP) │        │ commandFingerprint (STRING)   │
│ processedAt (TIMESTAMP)│        │ accountLinkId (FK Link)       │
│ status (ENUM)          │        │ telegramChatId (STRING)       │
└────────────────────────┘        │ deliveryStatus (ENUM)         │
                                  │ providerMessageId (STRING)    │
                                  │ sentAt (TIMESTAMP)            │
                                  └───────────────────────────────┘
```

**Bảo vệ mức Cơ sở dữ liệu:**
- `TelegramLinkChallenge`: Ràng buộc `tokenHash` là duy nhất (`UNIQUE`).
- `TelegramAccountLink`: Bắt buộc bảo vệ tính duy nhất khi `ACTIVE` ở cấp độ PostgreSQL (bằng partial unique index hoặc unique constraint phù hợp):
  - Duy nhất `userId` khi `status = 'ACTIVE'`;
  - Duy nhất `telegramUserId` khi `status = 'ACTIVE'`;
  - Duy nhất `telegramChatId` khi `status = 'ACTIVE'`.
- `TelegramWebhookReceipt`: Ràng buộc `updateId` là duy nhất (`UNIQUE`).
- `TelegramNotificationDelivery`: Ràng buộc `idempotencyKey` là duy nhất (`UNIQUE`).

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
   - Nội dung tin nhắn do máy chủ sở hữu cố định: *“Báo giảng Đam San đã kết nối Telegram thành công.”*

**Quy tắc phân quyền:**
- Tái sử dụng phiên làm việc đăng nhập hiện hành (`baogiang_session`).
- Đây là tích hợp định danh cá nhân, không tạo thêm capability phân quyền nghiệp vụ mới.
- Áp dụng chính sách bảo mật hiện tại: chặn truy cập nếu tài khoản đang bị cờ `mustChangePassword`.
- Máy chủ tự trích xuất `userId` từ session; client tuyệt đối không được truyền `userId` của người khác.

### F8. Vòng đời thông báo và Cơ chế Lũy kế (Notification Lifecycle & Idempotency)
- Do Telegram Bot API không hỗ trợ cơ chế idempotency từ phía nhà cung cấp, hệ thống không được phép tuyên bố bảo đảm "giao tin chính xác một lần" (*exactly-once delivery*).
- Bảo đảm chuẩn mực kỹ thuật của hệ thống là:
  **`INTERNAL COMMAND IDEMPOTENCY + NO AUTOMATIC DUPLICATE AMPLIFICATION`**
- Mỗi thông báo phát đi được định danh bằng một cặp khóa:
  - `idempotencyKey`: Định danh duy nhất cho lệnh logic gửi thông báo.
  - `commandFingerprint`: Dấu vân tay băm từ nội dung và đích đến của thông báo.
- **Xử lý trùng lặp lệnh (Replay Handling):**
  - Nhận cùng `idempotencyKey` và cùng `commandFingerprint`: Phát lại (replay) kết quả đã lưu trong cơ sở dữ liệu từ lần gửi trước, **TUYỆT ĐỐI KHÔNG GỌI LẠI TELEGRAM BOT API**.
  - Nhận cùng `idempotencyKey` nhưng khác `commandFingerprint`: Từ chối bằng mã lỗi xung đột (`409 CONFLICT`).
- **Trạng thái gửi bản tin (`deliveryStatus`):**
  - `RESERVED`: Đã cấp phát bản ghi gửi tin trong DB trước khi gửi HTTP request.
  - `ATTEMPTING`: Đang thực hiện kết nối mạng sang Telegram Bot API.
  - `SENT`: Telegram Bot API xác nhận thành công (HTTP 200 `ok: true`) kèm `message_id`.
  - `FAILED`: Lỗi mạng hoặc lỗi Telegram API xác định không gửi được (ví dụ chat bị chặn bởi user, bot bị xóa).
  - `UNKNOWN`: Kết quả không xác định (timeout kết nối, socket hangup, phản hồi 5xx không rõ trạng thái).
- **Nguyên tắc an toàn khi gặp sự cố không xác định:**
  - Nếu gặp timeout hoặc phản hồi không rõ ràng: Bản ghi chuyển sang trạng thái `UNKNOWN`.
  - **TUYỆT ĐỐI KHÔNG TỰ ĐỘNG GỬI LẠI (NO AUTO-RETRY)** để phòng tránh việc gửi trùng lặp nhiều tin nhắn gây quấy rầy giáo viên.
  - Sự cố sập tiến trình (crash) giữa thời điểm gửi tin và thời điểm cập nhật DB không được phép kích hoạt retry tự động.

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
- Ma trận kiểm thử của P5-030 bắt buộc bao gồm:
  - Sinh challenge, băm SHA-256, thời hạn TTL 10 phút, tính chất dùng 1 lần;
  - Cơ chế thay thế và vô hiệu hóa challenge cũ khi tạo mới;
  - Webhook chỉ chấp nhận private chat, từ chối group/channel;
  - Webhook secret token: chấp nhận secret đúng, fail-closed khi thiếu hoặc sai;
  - Khử trùng lặp theo `update_id`;
  - Ràng buộc duy nhất 1-1 cho active link;
  - Từ chối hành vi chiếm đoạt tài khoản Telegram chéo giữa hai user;
  - Hủy liên kết và bảo tồn lịch sử kiểm toán;
  - Idempotency: phát lại kết quả cũ khi trùng key và fingerprint; báo conflict khi trùng key khác fingerprint;
  - Giả lập phản hồi provider: thành công, thất bại, timeout mạng;
  - Xác minh không tự động gửi lại tin nhắn khi gặp kết quả không xác định;
  - Fail-closed khi `TELEGRAM_ENABLED=false`;
  - Xác thực và phân quyền HTTP API;
  - Kiểm thử hiển thị giao diện và tương thích di động (responsive).

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

Sau khi task tài liệu `P5-030A` được phê duyệt độc lập và đóng chính thức, task hiện thực `P5-030` sẽ được kích hoạt trên một nhánh riêng (`feat/p5-030-telegram-integration`) với các bước thực thi:

1. **Prisma Schema & Migrations:**
   - Thêm 4 model: `TelegramLinkChallenge`, `TelegramAccountLink`, `TelegramWebhookReceipt`, `TelegramNotificationDelivery`.
   - Bổ sung partial unique indexes cho các liên kết `ACTIVE`.
   - Sinh migration additive và kiểm thử khả năng áp dụng migration.
2. **Cấu hình & Môi trường:**
   - Cập nhật `apps/api/src/config/app.config.ts` để đọc và kiểm tra 4 biến môi trường Telegram.
   - Cập nhật `apps/api/.env.example`.
   - Cập nhật hợp đồng kiểm tra biến môi trường production trong `docs/operations/PRODUCTION-ENVIRONMENT-CONFIGURATION.md`, `scripts/deploy/windows/deployment-common.ps1` và các bài test triển khai.
3. **Backend Service & Webhook:**
   - Hiện thực `TelegramIntegrationService` xử lý challenge, băm token, quản lý liên kết và gửi tin thử nghiệm.
   - Hiện thực `TelegramWebhookController` tiếp nhận webhook từ Telegram với xác thực secret token an toàn thời gian.
   - Hiện thực `TelegramPersonalController` phục vụ 4 API cá nhân.
   - Hiện thực module vận chuyển tin nhắn với hỗ trợ giả lập và cơ chế lũy kế.
4. **Giao diện Web:**
   - Cập nhật `ProfilePage.tsx` tích hợp bảng quản lý Telegram cá nhân theo đúng tiêu chuẩn `DESIGN.md`.
5. **Kiểm thử tự động:**
   - Viết trọn vẹn bộ kiểm thử đơn vị và tích hợp cho toàn bộ ma trận kiểm thử F11.
