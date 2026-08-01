# Kiến trúc Phase 00 — Foundation

**Ngày:** 2026-07-28  
**Phiên bản:** 0.0.1

> **Ghi chú hiện hành (2026-08-01):** Đây là tài liệu lịch sử của Phase 00. Hướng hạ tầng/delivery mới có hiệu lực theo addendum Phương án B v1.3 và ADR-005: VPS, PostgreSQL và domain là production chính thức ở trạng thái pre-operational.

## Tổng quan

Phase 00 thiết lập nền móng kỹ thuật cho Hệ thống Báo giảng Đam San. Phase này chưa triển khai nghiệp vụ hoàn chỉnh; chỉ cung cấp kiến trúc, hạ tầng, contracts và kiểm thử nền móng.

Tại thời điểm Phase 00, production chưa được triển khai. Kiến trúc đích là **Windows Server 2022 + PostgreSQL 17** theo Phương án B v1.2; trạng thái hiện hành được addendum v1.3 và ADR-005 thay thế như ghi chú trên.

## Cấu trúc monorepo

```text
baogiang-damsan/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── contracts/
│   └── config/
├── tests/e2e/
├── prisma/
├── scripts/db/
├── docs/
└── .github/workflows/ci.yml
```

## Luồng request

```text
Browser
  → Vite dev server hoặc Nginx production
  → NestJS API tại 127.0.0.1:3100
  → RequestIdMiddleware
  → ValidationPipe
  → AllExceptionsFilter
  → module ứng dụng
  → PrismaService
  → PostgreSQL 17
```

## Health checks

| Endpoint | Mục đích | Phụ thuộc DB |
|---|---|---|
| `GET /api/health/live` | Tiến trình API còn sống | Không |
| `GET /api/health/ready` | API và database sẵn sàng | Có, `SELECT 1` |

Readiness trả HTTP 503 khi database không sẵn sàng.

## Shared packages

### `@baogiang/contracts`

Chứa:

- health contracts;
- standard API error;
- feature flags;
- capability và scope foundation types;
- `AuthContext` foundation type;
- notification foundation types.

### `@baogiang/config`

Chứa constants không có secret:

- tên hệ thống và đơn vị;
- phase hiện tại;
- local ports;
- API prefix;
- feature flag keys.

## Database

- ORM: Prisma 5.
- PostgreSQL 17.
- Dev DB: `baogiang_dev`, owner `baogiang_dev_user`.
- Test DB: `baogiang_test`, owner `baogiang_test_user`.
- Không dùng role `postgres` trong application connection string.
- Không dùng `prisma migrate reset` trên database có dữ liệu.

Schema Phase 00 có model metadata `SystemSetting`; **chưa có model nghiệp vụ** như User, TKB, PPCT hoặc Bảng kê.

## AI-ready foundation

Phase 00 có các ports và disabled adapter cần thiết cho governance, nhưng không gọi provider thật và không ghi dữ liệu nghiệp vụ.

Ba kill switch mặc định `false`:

- `AI_ENABLED`
- `AI_ACTIVE_MODE_ENABLED`
- `AI_PASSIVE_MODE_ENABLED`

Không có AI endpoint, chatbot hoặc prompt tự do.

## Notification-ready foundation

`NotificationPublisherPort` và `PushGatewayPort` chỉ là interface nền móng; chưa triển khai notification hoặc Web Push.

## Testing

| Layer | Framework | Scope |
|---|---|---|
| API unit | Jest | health, config, disabled AI adapter |
| API integration | Jest + Supertest | health endpoint với PostgreSQL thật |
| Web unit | Vitest + Testing Library | Home và System Status |
| E2E | Playwright | navigation, health/status, 404, JavaScript errors |

GitHub Actions thực hiện PostgreSQL setup, Prisma generate, lint, typecheck, unit tests, integration tests, build và Playwright.

## Production architecture (đã trở thành hạ tầng chính thức pre-operational)

- Windows Server 2022.
- Nginx phục vụ frontend static và reverse proxy.
- Backend service riêng tại `127.0.0.1:3100`.
- PostgreSQL 17 tại `localhost:5433`.
- Database `baogiang`, role `baogiang_app` riêng.
- Log, backup, service và deploy tách khỏi hệ thống nội trú.
- Source delivery đi từ commit GitHub qua CI/review/CD có kiểm soát.
- Push tự nó không deploy; CD chỉ chạy sau các gate và phê duyệt hiện hành.

## Giới hạn Phase 00

Chưa có:

- authentication và authorization implementation;
- user, staff, subject group và subject models;
- TKB, PPCT, nợ tiết, báo giảng và bảng kê;
- notification/Web Push;
- import/export nghiệp vụ;
- GDĐP và HĐTN-HN;
- AI features;
- dashboard nghiệp vụ;
- production deployment workflow (chưa thuộc deliverable Phase 00).
