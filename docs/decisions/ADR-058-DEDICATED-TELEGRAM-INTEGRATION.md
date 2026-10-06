# ADR-058 — Dedicated Báo giảng Telegram Integration Architecture

- **Trạng thái:** Proposed / In Review — Task `P5-030A` trên branch `docs/p5-030a-telegram-architecture`
- **Ngày:** 2026-10-06
- **Task:** `P5-030A` — Dedicated Telegram integration architecture closure
- **Traceability:** `T33` (NEW_PRODUCT_AUTHORITY), `T22` (technical secrets exclusion)
- **Dependencies:** `P5-010` (CLOSED)
- **Deliverable:** Kiến trúc tích hợp Telegram chuyên biệt, ranh giới bảo mật, cấu trúc lưu trữ, vòng đời liên kết, xác thực webhook, tính lũy kế thông báo (idempotency) và ranh giới môi trường/triển khai.
- **Thẩm quyền phê chuẩn:** Quyết định này là **PROPOSED** trong phạm vi task P5-030A và chỉ trở thành **Accepted** sau khi nhánh nhiệm vụ được merge vào `main`, post-merge CI đạt SUCCESS, và hoàn tất thủ tục đồng bộ tài liệu `SYNC-P5-030A`.

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

**Hợp đồng TELEGRAM_WEBHOOK_SECRET và quy tắc bất biến:**
- `TELEGRAM_WEBHOOK_SECRET` bắt buộc có độ dài từ 1 đến 256 ký tự và chỉ chứa các ký tự hợp lệ theo chuẩn Telegram Bot API: `A-Z`, `a-z`, `0-9`, `_`, `-`.
- Khi `TELEGRAM_ENABLED=true`: Cả 3 giá trị `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, và `TELEGRAM_WEBHOOK_SECRET` bắt buộc phải có giá trị hợp lệ; `TELEGRAM_WEBHOOK_SECRET` phải thỏa mãn độ dài và bộ ký tự trên. Nếu thiếu hoặc sai định dạng, ứng dụng phải **fail startup ngay lập tức**.
- `TELEGRAM_BOT_TOKEN` và `TELEGRAM_WEBHOOK_SECRET` là bí mật kỹ thuật nhạy cảm: không bao giờ được log, không ghi vào audit log, không trả về qua API response hay hiển thị trên giao diện người dùng.
- Không lưu các giá trị bí mật này vào cơ sở dữ liệu PostgreSQL.
- Không hiển thị hoặc cho phép chỉnh sửa qua API/UI của Business Configuration (tuân thủ triệt để ADR-046 Điều 8).
- Giai đoạn P5-030 implementation sau này sẽ chịu trách nhiệm đồng bộ các biến này vào `apps/api/src/config/app.config.ts`, `apps/api/.env.example`, `docs/operations/PRODUCTION-ENVIRONMENT-CONFIGURATION.md`, `scripts/deploy/windows/deployment-common.ps1` và bộ test hợp đồng triển khai. P5-030A chỉ xác lập thẩm quyền kiến trúc.

### 3. Ranh giới tin cậy Webhook và Trình phân tích Provider (Webhook Trust & Parser)

- Đường dẫn webhook chính thức được cố định:
  `POST /api/integrations/telegram/webhook`
- **Nguyên tắc xác thực và so sánh an toàn (Safe Comparison):**
  - Webhook endpoint là một public HTTP seam kỹ thuật, **KHÔNG** sử dụng cookie phiên duyệt web của người dùng và **KHÔNG** yêu cầu capability phân quyền của giáo viên.
  - Webhook chỉ tin cậy và xử lý các request có chứa header `X-Telegram-Bot-Api-Secret-Token`.
  - **Phương pháp so sánh an toàn mật mã:** Tuyệt đối không gọi `crypto.timingSafeEqual` trực tiếp lên hai buffer có độ dài khác nhau (gây `RangeError`). Hệ thống bắt buộc áp dụng:
    *Khuyến nghị chuẩn:* Băm cả chuỗi bí mật nhận được và chuỗi cấu hình mong đợi bằng SHA-256 thành các digest có độ dài cố định 32 byte (`crypto.createHash('sha256').update(val).digest()`), sau đó so khớp bằng `crypto.timingSafeEqual(providedDigest, expectedDigest)`. Hoặc kiểm tra độ dài chính xác bằng nhau trước khi thực hiện `timingSafeEqual`.
  - Nếu thiếu header, sai secret token, hoặc khi `TELEGRAM_ENABLED=false`: từ chối ngay lập tức và trả về mã lỗi đã khử khuẩn HTTP 401/403 (fail closed); không được để phát sinh ngoại lệ không bắt được biến thành HTTP 500; tuyệt đối không log chuỗi secret nhận được hoặc secret mong đợi.
- **Tiến hóa cấu trúc payload Telegram (Provider Payload Evolution):**
  - Không sử dụng cơ chế `ValidationPipe` toàn cục với `whitelist: true, forbidNonWhitelisted: true` đối với toàn bộ raw Telegram Update object, nhằm tránh làm sập webhook khi Telegram bổ sung các trường tùy chọn mới.
  - Sử dụng trình phân tích giới hạn/tối thiểu (bounded/minimal provider parser), chỉ bóc tách các trường tối thiểu cần thiết phục vụ liên kết:
    `update_id`, `message.text`, `message.chat.id`, `message.chat.type`, `message.from.id`.
  - Nếu trường bắt buộc bị thiếu hoặc sai kiểu dữ liệu/hình dạng: từ chối hoặc xử lý an toàn (reject / IGNORE fail-safe).
  - Các trường bổ sung do Telegram phát hành tự do được bỏ qua an toàn.
  - Các bản tin hợp lệ nhưng không được hỗ trợ xử lý nghiệp vụ (như ảnh, sticker, tin chỉnh sửa, callback query, hoặc tin nhắn group/channel): ghi nhận trạng thái biên nhận là `IGNORED`, trả về HTTP 200 OK thành công cho Telegram để tránh bị retry vô hạn, và cam kết zero business mutation.
  - Tuyệt đối không lưu raw JSON payload vào cơ sở dữ liệu.
- **Phạm vi tương tác tin nhắn:**
  - Webhook **chỉ chấp nhận lệnh liên kết tài khoản từ PRIVATE CHAT** (`message.chat.type === 'private'`).
  - Tuyệt đối không hỗ trợ hoặc liên kết tài khoản cá nhân từ nhóm (`group`), siêu nhóm (`supergroup`) hoặc kênh (`channel`).
- **An toàn nhật ký vận chuyển (Provider Transport Log Safety):**
  - Không log full URL của Telegram Bot API (tránh làm lộ token trong path `/bot<token>/`).
  - Không log request config chứa bot token.
  - Khi provider trả về lỗi, chỉ lưu trữ mã lỗi và lý do đã khử khuẩn (sanitized code/reason), không lưu toàn bộ raw HTTP response body nếu có nguy cơ lộ chi tiết kỹ thuật.

### 4. Vòng đời liên kết tài khoản và Đồng thời thử thách (Challenge Lifecycle & Concurrency)

Quy trình liên kết tài khoản diễn ra an toàn, có thời hạn và dùng một lần:
1. **Khởi tạo:** Giáo viên đã đăng nhập thành công vào ứng dụng Báo giảng gửi yêu cầu tạo liên kết Telegram (`POST /api/integrations/telegram/link-challenge`).
2. **Bất biến duy nhất PENDING (Single Active Pending Challenge Invariant):**
   - Tại một thời điểm, mỗi tài khoản người dùng Báo giảng chỉ có tối đa **MỘT** thử thách ở trạng thái `PENDING` có hiệu lực.
   - Cơ sở dữ liệu phải có ràng buộc bảo vệ tương đương partial unique index:
     `UNIQUE (userId) WHERE status = 'PENDING'`.
3. **Thao tác tạo thử thách nguyên tử (Atomic Create Challenge Transaction):**
   - Lệnh tạo challenge phải chạy trong transaction:
     + Bước 1: Vô hiệu hóa/thu hồi (`REVOKED`) mọi thử thách đang `PENDING` trước đó của người dùng;
     + Bước 2: Tạo bản ghi thử thách mới ở trạng thái `PENDING`;
     + Bước 3: Commit nguyên tử.
   - Yêu cầu đồng thời (concurrent create) không được tạo ra hai token cùng khả dụng; xung đột đồng thời phải được xử lý có giới hạn và an toàn (fail-safe).
4. **Sinh mã bí mật:** Máy chủ sinh ngẫu nhiên mã token có độ dài tối thiểu 256 bit bằng bộ sinh số ngẫu nhiên an toàn mật mã (`crypto.randomBytes(32).toString('base64url')` hoặc hex).
5. **Phát hành liên kết sâu:** Client nhận raw token đúng một lần duy nhất qua deep link:
   `https://t.me/<TELEGRAM_BOT_USERNAME>?start=<raw_token>`
6. **Lưu trữ băm bảo mật:** Cơ sở dữ liệu **CHỈ lưu giá trị băm SHA-256** của token, tuyệt đối không lưu raw token ở dạng văn bản rõ.
7. **Thẩm quyền thời hạn (Expiry Authority):**
   - `expiresAt` là thẩm quyền duy nhất xác định thời hạn (TTL chuẩn là **10 phút**).
   - Không yêu cầu tiến trình nền/scheduler định kỳ chỉ để chuyển trạng thái sang `EXPIRED`. Một thử thách có trạng thái `PENDING` nhưng `expiresAt <= now` được xem là đã hết hiệu lực, không thể tiêu thụ, và có thể được chuẩn hóa lười (lazily normalized) sang `EXPIRED`/`REVOKED` trong các transaction lệnh liên quan.
8. **Dùng một lần (One-time):** Một token chỉ được tiêu thụ đúng một lần. Khi đã `CONSUMED` hoặc `REVOKED`/`EXPIRED`, token vĩnh viễn không thể sử dụng lại.
9. **Độc lập định danh:** Việc liên kết tuyệt đối không dựa vào tên hiển thị (`displayName`), Telegram username (`@username`), số điện thoại, hay mã cán bộ (`staffCode`). Chỉ có token thử thách do máy chủ cấp mới quyết định định danh người dùng ứng dụng.

### 5. Lưu trữ định danh Telegram (Telegram Identity Persistence)

- **Định dạng định danh chuẩn (Factual Identity Accuracy):**
  - Định danh người dùng và cuộc trò chuyện của Telegram Bot API có thể vượt quá số nguyên 32-bit (int32). Tài liệu chính thức của nhà cung cấp Telegram hiện giới hạn các định danh đối thoại Bot API trong tối đa 52 bit có nghĩa (52 significant bits).
  - Quyết định lưu trữ `telegramUserId` và `telegramChatId` dưới dạng **chuỗi số thập phân chuẩn (`canonical decimal STRING`)** (ví dụ: `"9876543210"`) tiếp tục được duy trì nghiêm ngặt vì các lý do kiến trúc:
    + Đảm bảo tính ổn định xuyên suốt các tầng PostgreSQL (`BigInt`/`VARCHAR`), Prisma, JSON serialization và network transport;
    + Ngăn ngừa rủi ro ép kiểu số thực (float coercion) hoặc sai số làm tròn giữa các client/layer khác nhau;
    + Giữ nguyên định danh bên ngoài của provider như một giá trị mờ (opaque external identifier).
  - Tuyệt đối không biến định danh số này thành các phép toán số học nghiệp vụ.
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

### 6. Cấu trúc lưu trữ và Hộp thư Webhook nguyên tử (Persistence Topology & Atomic Inbox)

Kiến trúc yêu cầu 4 thực thể lưu trữ bền vững:
1. `TelegramLinkChallenge`
2. `TelegramAccountLink`
3. `TelegramWebhookReceipt`
4. `TelegramNotificationDelivery`

**Mô hình trường dữ liệu và ràng buộc của `TelegramNotificationDelivery`:**
- `id`: UUID (Khóa chính).
- `commandKey`: STRING, UNIQUE (Định danh lệnh logic nội bộ do máy chủ sở hữu duy nhất trên toàn hệ thống).
- `actorUserId`: FK User (Người dùng ứng dụng được xác thực bởi phiên máy chủ).
- `requestKey`: STRING, NULLABLE (Mã yêu cầu giới hạn UUID v4 do client cung cấp cho các lệnh khởi tạo từ giao diện; để trống đối với lệnh do máy chủ khởi tạo).
- `commandFingerprint`: STRING (Dấu vân tay lệnh gắn kết actor, link, loại thông báo và phiên bản nội dung).
- `accountLinkId`: FK Link (Tham chiếu đến bản ghi liên kết tài khoản Telegram hợp lệ).
- `telegramChatId`: STRING (ID cuộc trò chuyện Telegram nhận tin, chuỗi số thập phân).
- `notificationType`: ENUM (`LINK_SUCCESS`, `SELF_TEST`).
- `payloadDigest`: STRING (Bản băm nội dung thông báo do máy chủ sở hữu).
- `deliveryStatus`: ENUM (`RESERVED`, `ATTEMPTING`, `SENT`, `FAILED`, `UNKNOWN`).
- `attemptStartedAt`: TIMESTAMP, NULLABLE (Thời điểm bắt đầu lần gửi hiện tại, ghi nhận nguyên tử khi claim `ATTEMPTING`).
- `providerMessageId`: STRING, NULLABLE (Định danh tin nhắn do Telegram trả về sau khi gửi thành công).
- `sanitizedErrorCode`: STRING, NULLABLE (Mã/lý do lỗi từ provider đã khử khuẩn).
- `createdAt`: TIMESTAMP.
- `updatedAt`: TIMESTAMP.
- `sentAt`: TIMESTAMP, NULLABLE.

**Ràng buộc cơ sở dữ liệu:**
- `UNIQUE (commandKey)`: Bảo đảm tính duy nhất toàn cục của mỗi lệnh logic.
- `UNIQUE (actorUserId, requestKey) WHERE requestKey IS NOT NULL`: Bảo đảm tính duy nhất của mã yêu cầu theo từng người dùng.
- Quyền sở hữu lần gửi nguyên tử (Atomic Send Claim): Thực hiện qua điều kiện cập nhật `WHERE id = :id AND deliveryStatus = 'RESERVED'`.

**Nguyên tắc Hộp thư nguyên tử chống mất bản tin (Atomic Inbox / Receipt Invariant):**
- Cơ chế khử trùng lặp `update_id` tuyệt đối không được làm thất lạc bản tin linking.
- Khi nhận lệnh Telegram `/start <token>` hợp lệ, toàn bộ chuỗi xử lý:
  + Ghi nhận/khử trùng lặp biên nhận `TelegramWebhookReceipt`;
  + Xác thực và tiêu thụ thử thách `TelegramLinkChallenge` (`PENDING -> CONSUMED`);
  + Tạo bản ghi liên kết tài khoản `TelegramAccountLink` (`ACTIVE`);
  + Cấp phát lệnh gửi thông báo chào mừng `TelegramNotificationDelivery` (`RESERVED`) với `commandKey = link-success:<accountLinkId>`;
  **BẮT BUỘC ĐƯỢC COMMIT TRONG CÙNG MỘT RANH GIỚI TRANSACTION CƠ SỞ DỮ LIỆU NGUYÊN TỬ** (hoặc cỗ máy trạng thái inbox tương đương).
- Tuyệt đối cấm kịch bản: commit receipt đã xử lý, tiến trình bị crash trước khi tạo link, và khi Telegram gửi lại bản tin thì bị bỏ qua vì `update_id` đã tồn tại.
- Khi Telegram gửi lại cùng `update_id`: hệ thống nhận diện bản tin đã xử lý thành công, phát lại kết quả cũ, không tạo thêm link thứ hai, không tiêu thụ challenge lần hai và không phát sinh thông báo chào mừng thứ hai.
- **Tuyệt đối không thực hiện network call ra bên ngoài bên trong transaction cơ sở dữ liệu.**

### 7. Giao diện API người dùng cá nhân (Authenticated Personal API)

- `GET /api/integrations/telegram/me`: Lấy trạng thái liên kết Telegram của tài khoản đang đăng nhập.
- `POST /api/integrations/telegram/link-challenge`: Tạo thử thách liên kết mới và trả về deep link.
- `DELETE /api/integrations/telegram/link`: Hủy liên kết Telegram hiện tại của người dùng.
- `POST /api/integrations/telegram/test`: Gửi tin nhắn thử nghiệm có nội dung cố định tới Telegram của người dùng. Request body nhận vào: `{ "requestKey": "<uuid-v4>" }` với `requestKey` là chuỗi UUID v4 chuẩn.

**Nguyên tắc ủy quyền:**
- Tái sử dụng phiên làm việc hiện hữu (`baogiang_session`), không tạo capability mới.
- Fail-closed đối với cờ `mustChangePassword`.
- Máy chủ luôn trích xuất `actorUserId` từ session; client tuyệt đối không được truyền `actorUserId` hay `userId` của người khác.

### 8. Vòng đời thông báo và Lũy kế lệnh gửi tin (Notification Lifecycle & Idempotency)

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

### 9. Phạm vi thông báo thí điểm (Pilot Notification Scope)

- Chưa có thẩm quyền cho bất kỳ thông báo nghiệp vụ trường học cụ thể nào.
- Task P5-030 **TUYỆT ĐỐI KHÔNG TỰ BỊA ĐẶT CÁC TRIGGER THÔNG BÁO NGHIỆP VỤ** (nợ PPCT, duyệt báo cáo, thay TKB, lịch dạy bù, GDĐP/HĐTN). Bảng thông báo prototype là `REFERENCE-ONLY`.
- Phạm vi thí điểm chỉ giới hạn ở:
  1. Vòng đời liên kết thành công;
  2. Tính năng "Gửi tin thử" (Self-test) với nội dung cố định: *“Báo giảng Đam San đã kết nối Telegram thành công.”*;
  3. Bằng chứng lưu trữ biên nhận và tính lũy kế.

### 10. Thẩm quyền Giao diện người dùng (UI Authority)

- Đặt tại `ProfilePage.tsx` (`/ho-so-ca-nhan` hoặc `/ho-so`).
- 4 trạng thái: Chưa liên kết, Đang chờ liên kết (kèm đếm ngược 10 phút), Đã liên kết, Lỗi gửi tin/không xác định.
- 4 hành động: "Liên kết Telegram", "Mở Telegram kết nối", "Gửi tin thử", "Hủy liên kết".
- Không hiển thị token kỹ thuật hay ID số nội bộ. Tuân thủ `DESIGN.md` và `damsan-ui`.

### 11. Ranh giới Kiểm thử tự động (Testing Boundary)

- CI/local tests: Không gọi Telegram thật, không lưu token thật, sử dụng fake/mock transport.
- Bộ test bắt buộc cho P5-030 bao gồm tối thiểu **20 ca kiểm thử**:
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

### 12. Ranh giới Môi trường Triển khai & Production (Production Boundary)

- Task `P5-030A` và `P5-030` không tạo bot thật, không gọi BotFather, không chạy setWebhook thật, không can thiệp VPS hay Nginx; production duy trì strictly **`PRE-OPERATIONAL`**.

---

## Hệ quả (Consequences)

### Tích cực
- Khóa chặt quyền sở hữu lần gửi tin nguyên tử qua compare-and-set, ngăn chặn hoàn toàn race condition gọi provider mạng trùng lặp.
- Phân định rành mạch giữa `commandKey` toàn cục của hệ thống và `requestKey` giới hạn theo actor từ client.
- `requestKey` được chuẩn hóa thành UUID v4 giới hạn, triệt tiêu nguy cơ payload tùy tiện hoặc tấn công phình bộ nhớ.
- Mốc thời gian `attemptStartedAt` bảo đảm cơ sở bền vững cho việc đối soát và chuyển trạng thái `UNKNOWN` mà không suy đoán qua in-memory timer.
- Tăng cường ma trận kiểm thử lên 20 ca chấp nhận bao phủ toàn bộ các góc cạnh đồng thời và an toàn mạng.

### Tiêu cực / Chi phí
- Đòi hỏi transaction nguyên tử bao bọc cả webhook receipt và account link, yêu cầu cấu trúc code cẩn trọng.
- Cần xây dựng mock transport toàn diện phục vụ đủ 20 kịch bản kiểm thử bắt buộc.

### Trung lập
- P5-030A tiếp tục duy trì trạng thái `IN_REVIEW` (DOCS-ONLY) cho đến khi hoàn tất phê duyệt độc lập.
