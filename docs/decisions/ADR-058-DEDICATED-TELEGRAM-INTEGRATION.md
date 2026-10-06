# ADR-058 — Dedicated Báo giảng Telegram Integration Architecture

- **Trạng thái:** Proposed / In Review — Task `P5-030A` trên branch `docs/p5-030a-telegram-architecture`
- **Ngày:** 2026-10-06
- **Task:** `P5-030A` — Dedicated Telegram integration architecture closure
- **Traceability:** `T33` (NEW_PRODUCT_AUTHORITY), `T22` (technical secrets exclusion)
- **Dependencies:** `P5-010` (CLOSED)
- **Deliverable:** Kiến trúc tích hợp Telegram chuyên biệt, ranh giới bảo mật, cấu trúc lưu trữ, vòng đời liên kết, xác thực webhook, tính lũy kế thông báo (idempotency) và ranh giới môi trường/triển khai.

---

## Bối cảnh

Trong lộ trình thí điểm nghiệp vụ (ADR-054 điều 11, mục tiêu chuẩn bị vận hành thí điểm giáo viên), hệ thống Báo giảng Đam San cần kênh thông báo cá nhân qua Telegram để hỗ trợ giáo viên nhận các cập nhật quan trọng.

Hiện trạng kho lưu trữ trước task P5-030A:
1. Sổ đăng ký công việc (`PRE-PILOT-TASK-REGISTER.md`) đã ghi nhận task `P5-030` ở trạng thái `READY` và trỏ vào dòng `T33`.
2. Ma trận truy vết (`PRE-PILOT-TRACEABILITY-MATRIX.md`) bị khuyết dòng `T33`.
3. Chưa có tài liệu kiến trúc (ADR) hoặc đặc tả kỹ thuật nào định nghĩa tích hợp Telegram cho Báo giảng.
4. Chưa có bất kỳ hiện thực runtime Telegram nào trong `apps/api` hay `apps/web`.
5. Hệ thống mới chỉ có các interface khung nền móng (`NotificationPublisherPort`, `PushGatewayPort` trong `apps/api/src/common/ports/ai-ports.ts`), chưa có adapter cụ thể.
6. Hợp đồng cấu hình môi trường production (`PRODUCTION-ENVIRONMENT-CONFIGURATION.md` và `scripts/deploy/windows/deployment-common.ps1`) chưa có danh mục biến môi trường cho Telegram; bất kỳ biến môi trường lạ nào đưa vào production đều bị fail-closed.
7. ADR-046 nghiêm cấm tuyệt đối việc lưu trữ hoặc quản lý các bí mật kỹ thuật (token bot, webhook secret) trong Business Configuration Control Plane hoặc cơ sở dữ liệu ứng dụng.
8. Bảng thông báo trên giao diện mẫu (`docs/prototypes/ui-reference-phuong-an-b.html`) chỉ mang tính chất tham khảo (`REFERENCE-ONLY` theo ADR-003) và không có giá trị pháp lý nghiệp vụ cho danh mục thông báo hay luồng phê duyệt.
9. Về hạ tầng máy chủ, hệ thống Báo giảng vận hành trên cùng Windows Server 2022 VPS (`SHARED_VPS` theo ADR-053) với hai hệ thống láng giềng là DamSanV5 và Quản lí nội trú. Hai hệ thống này đã có bot Telegram và kênh thông báo riêng. Ranh giới láng giềng được bảo vệ nghiêm ngặt: Báo giảng không được dùng chung, đọc trộm, vay mượn token, webhook hay cấu hình của hệ thống khác.

Do đó, việc triển khai runtime P5-030 trước khi đóng kiến trúc Telegram là vi phạm quy tắc quản trị (`AGENTS.md` và `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`). Task `P5-030A` được lập ra để đóng toàn bộ các khoảng trống kiến trúc và quản trị này.

---

## Quyết định kiến trúc

### 1. Cô lập Bot chuyên biệt (Dedicated Bot Isolation)

- Báo giảng sử dụng **Telegram Bot RIÊNG BIỆT**, độc lập hoàn toàn với DamSanV5 và Quản lí nội trú.
- Không tái sử dụng token, webhook URL, định danh chat (chat ID) hay vòng đời bot của các hệ thống láng giềng.
- Không đọc, truy cập hoặc chia sẻ tệp cấu hình, biến môi trường hay kho bí mật của DamSanV5 và Quản lí nội trú.
- Giữ nguyên ranh giới bảo vệ láng giềng theo quy chuẩn P6 (`D:\Quan_li_noi_tru`, `D:\Edu_DamSan`).

### 2. Thẩm quyền cấu hình kỹ thuật (Technical Configuration Authority)

Cấu hình Telegram thuộc về cấu hình kỹ thuật cấp server-side runtime, **TUYỆT ĐỐI KHÔNG** thuộc về Business Configuration Control Plane.

Kiến trúc P5-030 bắt buộc sử dụng 4 biến môi trường kỹ thuật:
- `TELEGRAM_ENABLED`: kiểu boolean (`true` / `false`). Mặc định là `false` ở môi trường development và test (trừ test fixture chuyên biệt).
- `TELEGRAM_BOT_TOKEN`: kiểu string bí mật (token do BotFather cấp).
- `TELEGRAM_BOT_USERNAME`: kiểu string không bí mật (tên username của bot, ví dụ `BaoGiangDamSanBot`).
- `TELEGRAM_WEBHOOK_SECRET`: kiểu string bí mật (chuỗi bí mật dùng để xác thực webhook gửi từ Telegram qua header `X-Telegram-Bot-Api-Secret-Token`).

**Quy tắc bất biến:**
- Khi `TELEGRAM_ENABLED=true`, bắt buộc cả 3 giá trị `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, và `TELEGRAM_WEBHOOK_SECRET` phải hợp lệ và không rỗng; nếu thiếu hoặc sai định dạng, ứng dụng phải fail-closed ngay khi khởi động.
- `TELEGRAM_BOT_TOKEN` và `TELEGRAM_WEBHOOK_SECRET` là bí mật kỹ thuật nhạy cảm: không bao giờ được log, không ghi vào audit log, không trả về qua API response hay hiển thị trên giao diện người dùng.
- Không lưu các giá trị bí mật này vào cơ sở dữ liệu PostgreSQL.
- Không hiển thị hoặc cho phép chỉnh sửa qua API/UI của Business Configuration (tuân thủ triệt để ADR-046 Điều 8).
- Giai đoạn P5-030 implementation sau này sẽ chịu trách nhiệm đồng bộ các biến này vào `apps/api/src/config/app.config.ts`, `apps/api/.env.example`, `docs/operations/PRODUCTION-ENVIRONMENT-CONFIGURATION.md`, `scripts/deploy/windows/deployment-common.ps1` và bộ test hợp đồng triển khai. P5-030A chỉ xác lập thẩm quyền kiến trúc.

### 3. Ranh giới tin cậy Webhook (Webhook Trust Boundary)

- Đường dẫn webhook chính thức được cố định:
  `POST /api/integrations/telegram/webhook`
- **Nguyên tắc xác thực và tin cậy:**
  - Webhook endpoint là một public HTTP seam kỹ thuật, **KHÔNG** sử dụng cookie phiên duyệt web của người dùng và **KHÔNG** yêu cầu capability phân quyền của giáo viên.
  - Webhook chỉ tin cậy và xử lý các request có chứa header `X-Telegram-Bot-Api-Secret-Token` khớp chính xác với giá trị `TELEGRAM_WEBHOOK_SECRET` đã cấu hình.
  - Việc so khớp chuỗi bí mật phải thực hiện qua hàm so sánh an toàn về thời gian (`crypto.timingSafeEqual`) nhằm triệt tiêu nguy cơ timing attack.
  - Nếu thiếu header, sai secret token, hoặc khi `TELEGRAM_ENABLED=false`: từ chối ngay lập tức và fail-closed (HTTP 401/403), không thực hiện bất kỳ xử lý nghiệp vụ nào.
  - Phân tích cú pháp DTO (Telegram Update schema) phải nghiêm ngặt (`ValidationPipe` whitelist & forbidNonWhitelisted).
  - Không lưu toàn bộ raw JSON update body vào cơ sở dữ liệu; không in token, start payload bí mật hoặc thông tin nhạy cảm vào nhật ký máy chủ (server logs).
- **Phạm vi tương tác tin nhắn:**
  - Webhook **chỉ chấp nhận lệnh liên kết tài khoản từ PRIVATE CHAT** (`message.chat.type === 'private'`).
  - Tuyệt đối không hỗ trợ hoặc liên kết tài khoản cá nhân từ nhóm (`group`), siêu nhóm (`supergroup`) hoặc kênh (`channel`). Nếu nhận được update từ group/channel, bỏ qua một cách an toàn.
  - Mỗi `update_id` gửi từ Telegram phải được kiểm tra chống trùng lặp bền vững (durable deduplication).

### 4. Vòng đời liên kết tài khoản dùng một lần (One-Time Account Linking)

Quy trình liên kết tài khoản phải diễn ra an toàn, có thời hạn và dùng một lần:
1. **Khởi tạo:** Giáo viên đã đăng nhập thành công vào ứng dụng Báo giảng gửi yêu cầu tạo liên kết Telegram (`POST /api/integrations/telegram/link-challenge`).
2. **Sinh mã bí mật:** Máy chủ sinh ngẫu nhiên mã token có độ dài tối thiểu 256 bit bằng bộ sinh số ngẫu nhiên an toàn mật mã (`crypto.randomBytes(32).toString('base64url')` hoặc hex).
3. **Phát hành liên kết sâu:** Client nhận raw token đúng một lần duy nhất qua deep link:
   `https://t.me/<TELEGRAM_BOT_USERNAME>?start=<raw_token>`
4. **Lưu trữ băm bảo mật:** Cơ sở dữ liệu **CHỈ lưu giá trị băm SHA-256** của token (`crypto.createHash('sha256').update(rawToken).digest('hex')`), tuyệt đối không lưu raw token ở dạng văn bản rõ.
5. **Thời hạn (TTL):** Thời gian sống chuẩn của challenge là **10 phút**. Quá thời hạn này, challenge tự động hết hiệu lực.
6. **Dùng một lần (One-time):** Một token chỉ được tiêu thụ đúng một lần. Khi đã tiêu thụ (`CONSUMED`) hoặc bị thu hồi (`REVOKED`/`EXPIRED`), token vĩnh viễn không thể sử dụng lại.
7. **Hủy thử thách cũ:** Khi người dùng yêu cầu tạo challenge mới, tất cả challenge chưa tiêu thụ trước đó của cùng người dùng phải bị đánh dấu hết hạn/thu hồi ngay lập tức.
8. **Tiêu thụ nguyên tử:** Khi webhook nhận lệnh `/start <raw_token>` từ private chat, hệ thống tính hash SHA-256 của token, tìm challenge hợp lệ chưa hết hạn và kích hoạt liên kết tài khoản trong cùng một giao dịch cơ sở dữ liệu nguyên tử (atomic transaction).
9. **Độc lập định danh:** Việc liên kết tuyệt đối không dựa vào tên hiển thị (`displayName`), Telegram username (`@username`), số điện thoại, hay mã cán bộ (`staffCode`). Chỉ có token thử thách do máy chủ cấp mới quyết định định danh người dùng ứng dụng.

### 5. Lưu trữ định danh Telegram (Telegram Identity Persistence)

- **Định dạng định danh:** Các định danh số của Telegram (`user.id`, `chat.id`) có thể vượt quá giới hạn 53-bit an toàn của JavaScript Number (Telegram ID dùng số nguyên 64-bit). Do đó, hệ thống bắt buộc lưu trữ `telegramUserId` và `telegramChatId` dưới dạng chuỗi thập phân chuẩn (`canonical decimal STRING`), ví dụ `"9876543210"`. Tuyệt đối không dùng JSON Number làm khóa định danh.
- **Dữ liệu lưu trữ tối thiểu:**
  - `telegramUserId`: ID người dùng Telegram (chuỗi thập phân).
  - `telegramChatId`: ID cuộc trò chuyện riêng tư (chuỗi thập phân).
  - `userId`: ID người dùng Báo giảng trong bảng `User`.
  - `linkedAt`: thời điểm liên kết thành công.
  - `status`: trạng thái liên kết (`ACTIVE` / `REVOKED`).
  - `revokedAt`: thời điểm hủy liên kết (nếu có).
  - `retainedLinkIdentity`: định danh bản ghi liên kết duy nhất phục vụ truy vết.
- **Tối thiểu hóa thông tin (Data Minimization):**
  - Không lưu tên gọi, họ, tên đệm, ảnh đại diện (avatar) hay raw payload hồ sơ Telegram của người dùng.
- **Tính duy nhất và chống chiếm đoạt:**
  - Tại một thời điểm, một tài khoản Báo giảng chỉ có tối đa **MỘT** liên kết Telegram đang hoạt động (`ACTIVE`).
  - Tại một thời điểm, một tài khoản Telegram (chat ID) chỉ có tối đa **MỘT** tài khoản Báo giảng đang hoạt động (`ACTIVE`).
  - Không cho phép chuyển giao âm thầm (silent takeover) một tài khoản Telegram từ người dùng A sang người dùng B. Nếu Telegram account đã liên kết với user A, nỗ lực liên kết vào user B sẽ bị từ chối trừ khi đã được unlink rõ ràng.
  - Đổi tài khoản Telegram: bắt buộc phải thực hiện hủy liên kết hiện tại (`DELETE /api/integrations/telegram/link`), sau đó mới tạo liên kết mới.
  - Lịch sử liên kết không bị xóa cứng (hard-delete) khỏi cơ sở dữ liệu để bảo tồn bằng chứng kiểm toán.

### 6. Cấu trúc lưu trữ khuyến nghị (Persistence Topology)

Kiến trúc P5-030 yêu cầu xây dựng 4 thực thể lưu trữ bền vững trong cơ sở dữ liệu PostgreSQL thông qua Prisma schema:

1. **`TelegramLinkChallenge`**: Lưu thông tin thử thách liên kết tài khoản.
   - Các trường: `id` (UUID), `userId` (FK User), `tokenHash` (SHA-256 unique), `expiresAt`, `status` (`PENDING`, `CONSUMED`, `EXPIRED`, `REVOKED`), `consumedAt`, `createdAt`.
2. **`TelegramAccountLink`**: Lưu thông tin liên kết tài khoản giữa giáo viên Báo giảng và Telegram.
   - Các trường: `id` (UUID), `userId` (FK User), `telegramUserId` (decimal string), `telegramChatId` (decimal string), `status` (`ACTIVE`, `REVOKED`), `linkedAt`, `revokedAt`, `revokedByUserId` (FK nullable), `challengeId` (FK nullable).
   - Ràng buộc: Unique constraint ở cấp độ cơ sở dữ liệu cho trạng thái `ACTIVE` (`userId` là duy nhất khi active; `telegramUserId` là duy nhất khi active; `telegramChatId` là duy nhất khi active).
3. **`TelegramWebhookReceipt`**: Ghi nhận và chống trùng lặp các update nhận từ Telegram Bot API.
   - Các trường: `id` (UUID), `updateId` (decimal string unique), `receivedAt`, `processedAt`, `status` (`PROCESSED`, `IGNORED`, `FAILED`).
4. **`TelegramNotificationDelivery`**: Ghi nhận bằng chứng gửi thông báo và lũy kế lệnh gửi.
   - Các trường: `id` (UUID), `idempotencyKey` (unique string), `commandFingerprint` (string), `accountLinkId` (FK TelegramAccountLink), `telegramChatId` (decimal string), `notificationType` (string), `payloadDigest` (string), `deliveryStatus` (`RESERVED`, `ATTEMPTING`, `SENT`, `FAILED`, `UNKNOWN`), `providerMessageId` (nullable decimal string), `errorMessage` (nullable string), `createdAt`, `updatedAt`, `sentAt`.

**Quy tắc migration:**
- Migration phải có tính chất bổ sung hoàn toàn (`additive only`), không phá vỡ schema hiện tại.
- Zero destructive backfill, không sửa đổi dữ liệu lịch sử của bất kỳ phân hệ nghiệp vụ nào khác.
- Ràng buộc khóa ngoại sử dụng `ON DELETE RESTRICT` fail-safe phù hợp.

### 7. Giao diện API người dùng cá nhân (Authenticated Personal API)

P5-030 sẽ hiện thực 4 endpoint phục vụ người dùng cá nhân trong `apps/api`:
- `GET /api/integrations/telegram/me`: Lấy trạng thái liên kết Telegram của tài khoản đang đăng nhập.
- `POST /api/integrations/telegram/link-challenge`: Tạo thử thách liên kết mới và trả về deep link.
- `DELETE /api/integrations/telegram/link`: Hủy liên kết Telegram hiện tại của người dùng.
- `POST /api/integrations/telegram/test`: Gửi tin nhắn thử nghiệm có nội dung cố định tới Telegram của người dùng.

**Nguyên tắc ủy quyền:**
- Đây là tính năng cá nhân của tài khoản (`personal identity integration`). Không tạo thêm capability nghiệp vụ mới trong hệ thống phân quyền trường học.
- Tái sử dụng cơ chế xác thực phiên làm việc (`baogiang_session`) hiện hữu.
- Fail-closed đối với cờ `mustChangePassword` (chính sách auth hiện hành).
- Người gọi không được quyền truyền `userId` của người khác. Máy chủ luôn lấy `userId` trực tiếp từ phiên đăng nhập hợp lệ.

### 8. Vòng đời thông báo và Nguyên tắc Lũy kế (Notification Lifecycle & Idempotency)

- Telegram Bot API không hỗ trợ native idempotency header (như Stripe/AWS). Do đó, kiến trúc cấm tuyên bố "giao hàng chính xác một lần" (*exactly once delivery*).
- Bảo đảm chuẩn mực của hệ thống là:
  **`INTERNAL COMMAND IDEMPOTENCY + NO AUTOMATIC DUPLICATE AMPLIFICATION`**
  (Lũy kế lệnh nội bộ + Không khuếch đại gửi tin nhắn trùng lặp tự động).
- **Mã định danh nghiệp vụ:** Mỗi lệnh gửi thông báo phải có `idempotencyKey` và chuỗi dấu vân tay `commandFingerprint`.
  - Cùng `idempotencyKey` và cùng `commandFingerprint`: Trả về kết quả đã lưu trong bản ghi trước đó, tuyệt đối không gọi lại Telegram Bot API để bắn thêm tin nhắn thứ hai.
  - Cùng `idempotencyKey` nhưng khác `commandFingerprint`: Báo lỗi xung đột (`409 CONFLICT`).
- **Trạng thái gửi thông báo:**
  - `RESERVED`: Đã cấp phát bản ghi gửi tin trong cơ sở dữ liệu trước khi gọi mạng.
  - `ATTEMPTING`: Đang thực hiện kết nối HTTP sang Telegram API.
  - `SENT`: Telegram Bot API xác nhận thành công (HTTP 200 `ok: true`) kèm `message_id`.
  - `FAILED`: Lỗi mạng hoặc lỗi Telegram API xác định không gửi được (ví dụ chat bị chặn bởi user, bot bị xóa).
  - `UNKNOWN`: Kết quả không xác định (timeout, đứt kết nối socket, 5xx unconfirmed từ Telegram).
- **Xử lý sự cố không xác định:**
  - Nếu kết quả không xác định sau khi HTTP request đã rời khỏi máy chủ: Đánh dấu trạng thái là `UNKNOWN`.
  - **TUYỆT ĐỐI KHÔNG TỰ ĐỘNG GỬI LẠI (NO AUTO-RETRY)** để tránh gửi trùng tin nhắn tới điện thoại giáo viên.
  - Sự cố sập ứng dụng (crash) giữa thời điểm gọi provider và ghi nhận DB không được phép biến thành auto-retry gây trùng lặp.

### 9. Phạm vi thông báo thí điểm (Pilot Notification Scope)

- Hiện tại hệ thống **CHƯA CÓ THẨM QUYỀN CHÍNH THỨC (AUTHORITY)** cho một danh mục thông báo nghiệp vụ trường học cụ thể.
- Do đó, task P5-030 **TUYỆT ĐỐI KHÔNG TỰ BỊA ĐẶT CÁC TRIGGER THÔNG BÁO NGHIỆP VỤ**, bao gồm:
  - Cảnh báo nợ tiết PPCT;
  - Thông báo phê duyệt báo cáo;
  - Thông báo thay đổi Thời khóa biểu;
  - Lịch phân công dạy bù;
  - Phân công GDĐP / HĐTN;
  - Hay các thông báo tự động khác.
- Bảng thông báo trên giao diện mẫu (prototype HTML) chỉ là `REFERENCE-ONLY`.
- **Phạm vi thông báo cho đợt thí điểm P5-030 chỉ bao gồm:**
  1. Vòng đời liên kết thành công (tin nhắn thông báo chào mừng / xác nhận liên kết thành công sau khi nhấn `/start`);
  2. Tính năng "Gửi tin thử" (Self-test notification) do chính giáo viên kích hoạt qua nút bấm có xác thực, với nội dung do máy chủ sở hữu cố định;
  3. Bằng chứng lưu trữ biên nhận gửi tin và tính lũy kế (delivery receipt & idempotency).
- Nội dung tin nhắn thử nghiệm được cố định bởi máy chủ, không nhận chuỗi tùy ý từ client:
  *“Báo giảng Đam San đã kết nối Telegram thành công.”*

### 10. Thẩm quyền Giao diện người dùng (UI Authority)

- Vị trí giao diện: Tích hợp Telegram được đặt tại trang Hồ sơ cá nhân (`ProfilePage.tsx` tại `/ho-so-ca-nhan` hoặc `/ho-so`).
- Các trạng thái giao diện hỗ trợ:
  1. *Chưa liên kết*: Hiển thị nút "Liên kết Telegram".
  2. *Đang chờ liên kết*: Hiển thị đường dẫn/nút mở bot Telegram kèm đồng hồ đếm ngược thời gian hết hạn (10 phút).
  3. *Đã liên kết*: Hiển thị thông báo đã kết nối thành công, nút "Gửi tin thử", và nút "Hủy liên kết".
  4. *Lỗi gửi tin / Trạng thái không xác định*: Hiển thị thông báo lỗi rõ ràng bằng tiếng Việt.
- Các hành động của người dùng:
  - "Liên kết Telegram"
  - "Mở Telegram kết nối" (mở deep link tới dedicated bot)
  - "Gửi tin thử"
  - "Hủy liên kết"
- **Quy tắc hiển thị an toàn:**
  - Không hiển thị bất kỳ token kỹ thuật nào trên UI.
  - Không hiển thị các mã số ID nội bộ của Telegram (`telegramUserId`, `telegramChatId`) cho giáo viên thông thường.
  - Không tạo trang chỉnh sửa cấu hình kỹ thuật generic trên web.
  - Tuân thủ nghiêm ngặt kỹ năng `damsan-ui` và phong cách thiết kế chuẩn mực trong `DESIGN.md` (Be Vietnam Pro, màu token ngữ nghĩa, layout basalt rail, không dùng hiệu ứng gradient hay glassmorphism).

### 11. Ranh giới Kiểm thử tự động (Testing Boundary)

- Các bài kiểm thử CI và kiểm thử tự động cục bộ:
  - **TUYỆT ĐỐI KHÔNG GỌI TELEGRAM THẬT.**
  - **KHÔNG CẦN BOT TOKEN THẬT.**
  - **KHÔNG LƯU TOKEN/SECRET THẬT TRONG TEST FIXTURE.**
  - Sử dụng tầng vận chuyển giả lập (`fake/mock TelegramTransportPort`) được tiêm phụ thuộc (dependency injection).
- Bộ test của P5-030 bắt buộc bao phủ đầy đủ:
  - Sinh challenge, băm SHA-256, thời hạn TTL 10 phút, tính chất dùng 1 lần;
  - Cơ chế hủy bỏ challenge cũ khi tạo challenge mới;
  - Webhook chỉ chấp nhận private chat, từ chối group/channel;
  - Webhook secret token: chấp nhận secret đúng, fail-closed khi thiếu hoặc sai;
  - Deduplication theo `update_id`;
  - Ràng buộc duy nhất 1-1 cho active link;
  - Từ chối việc chiếm đoạt tài khoản Telegram chéo giữa hai user;
  - Hủy liên kết và bảo tồn lịch sử;
  - Idempotency: gửi lại cùng key -> phát lại kết quả cũ; gửi cùng key khác fingerprint -> lỗi conflict;
  - Mô phỏng các trạng thái phản hồi provider: thành công, thất bại, timeout/mất kết nối;
  - Đảm bảo không tự động gửi lại tin nhắn khi gặp trạng thái không xác định;
  - Cấu hình tắt (`TELEGRAM_ENABLED=false`) -> fail-closed an toàn;
  - Phân quyền HTTP API phiên người dùng;
  - Kiểm thử hiển thị giao diện người dùng và độ tương thích di động (responsive).

### 12. Ranh giới Môi trường Triển khai & Production (Production Boundary)

- Task kiến trúc `P5-030A` và task triển khai `P5-030`:
  - **KHÔNG** tạo bot thật trên Telegram;
  - **KHÔNG** gọi BotFather;
  - **KHÔNG** chạy lệnh `setWebhook` trên môi trường thật;
  - **KHÔNG** truy cập VPS production;
  - **KHÔNG** sửa đổi cấu hình Nginx;
  - **KHÔNG** thực hiện deploy;
  - **KHÔNG** sử dụng cơ sở dữ liệu production.
- Việc kích hoạt bot Telegram thật, cấp phát token production và thiết lập webhook production thuộc về quy trình triển khai có kiểm soát sau này, cùng thẩm quyền với các task P6.
- Trạng thái hệ thống production tiếp tục duy trì strictly **`PRE-OPERATIONAL`**.

---

## Hệ quả (Consequences)

### Tích cực
- Bảo đảm tính độc lập và an toàn tuyệt đối cho hệ thống Báo giảng khi chạy chung VPS với DamSanV5 và Quản lí nội trú.
- Bí mật kỹ thuật được bảo vệ nghiêm ngặt ở cấp server runtime, không bị rò rỉ vào cơ sở dữ liệu hay giao diện quản trị nghiệp vụ.
- Vòng đời liên kết tài khoản an toàn mật mã, ngăn chặn triệt để hành vi giả mạo hoặc chiếm đoạt tài khoản.
- Cơ chế lũy kế ngăn ngừa tình trạng spam thông báo lặp lại tới giáo viên.
- Ranh giới phạm vi thí điểm được xác định rõ ràng, không tạo thêm rủi ro nghiệp vụ do tự ý sáng tạo thông báo ngoài thẩm quyền.

### Tiêu cực / Chi phí
- Cần xây dựng 4 bảng lưu trữ và các cơ chế xử lý ngoại lệ mạng phức tạp hơn so với cách gọi HTTP trực tiếp đơn giản.
- Người dùng bắt buộc phải mở deep link và nhấn Start trong Telegram private chat thay vì nhập trực tiếp số điện thoại hay username trên web.

### Trung lập
- P5-030A đóng vai trò chốt chặn kiến trúc tài liệu (docs-only); việc hiện thực hóa toàn bộ logic trên sẽ được thực hiện tại task P5-030 sau khi P5-030A được phê duyệt và đóng chính thức.
