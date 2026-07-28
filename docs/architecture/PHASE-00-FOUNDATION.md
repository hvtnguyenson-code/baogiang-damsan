# Kiến trúc Phase 00 — Foundation

**Ngày:** 2026-07-28  
**Phiên bản:** 0.0.1

---

## Tổng quan

Phase 00 thiết lập nền móng kỹ thuật cho toàn bộ hệ thống Báo giảng Đam San.  
Không có nghiệp vụ đầy đủ trong phase này — chỉ có khung kiến trúc, hạ tầng và kiểm thử nền móng.

---

## Cấu trúc Monorepo

```
D:\baogiang-damsan
├── apps/
│   ├── web/          React + Vite + TypeScript (frontend)
│   └── api/          NestJS + TypeScript + Prisma (backend)
├── packages/
│   ├── contracts/    Shared types: health, errors, capabilities, flags
│   └── config/       Shared constants: app name, ports, feature flags
├── tests/
│   └── e2e/          Playwright smoke tests
├── prisma/
│   └── schema.prisma PostgreSQL datasource (no models in Phase 00)
├── scripts/
│   └── db/           PowerShell scripts for local DB management
├── docs/
│   ├── specifications/   Đặc tả kỹ thuật (.docx)
│   ├── prototypes/       UI reference (tham khảo only)
│   ├── architecture/     Tài liệu kiến trúc (file này)
│   ├── decisions/        ADRs
│   └── phase-reports/    Báo cáo hoàn thành phase
└── .github/
    └── workflows/ci.yml  GitHub Actions
```

---

## Luồng Request

```
Browser (127.0.0.1:5173)
    │
    │ /api/* proxied by Vite dev server
    ▼
Vite Dev Server (dev) / Nginx (production)
    │
    ▼
NestJS API (127.0.0.1:3100)
    │
    ├── RequestIdMiddleware → gắn X-Request-Id
    ├── ValidationPipe → validate input
    ├── AllExceptionsFilter → normalize errors
    │
    ▼
    ├── HealthModule → /api/health/live, /api/health/ready
    └── (Phase 01+) → các module nghiệp vụ
    │
    ▼
PrismaService → PostgreSQL 17 (127.0.0.1:5432)
```

---

## Health Checks

| Endpoint | Mục đích | DB phụ thuộc |
|----------|----------|--------------|
| `GET /api/health/live` | Tiến trình API còn sống | ❌ Không |
| `GET /api/health/ready` | API + DB sẵn sàng | ✅ SELECT 1 |

---

## Shared Packages

### @baogiang/contracts

Chứa TypeScript types dùng chung giữa web và API:
- `HealthLiveResponse`, `HealthReadyResponse`
- `ApiErrorResponse`
- `FeatureFlags`, `DEFAULT_FEATURE_FLAGS`
- `AuthContext`, `ScopedCapability`, `CapabilityKey` (Phase 00: type only)
- `BaseNotification` (Phase 00: type only)

### @baogiang/config

Chứa constants không có secret:
- `APP_NAME`, `SCHOOL_NAME`, `CURRENT_PHASE`
- `LOCAL_PORTS` (web: 5173, api: 3100)
- `FEATURE_FLAG_KEYS`
- `API_PREFIX`, `HEALTH_PATHS`

---

## Database

- **Tool:** Prisma 5
- **Schema:** `prisma/schema.prisma` — datasource chỉ, không có model nghiệp vụ trong Phase 00
- **Dev DB:** `baogiang_dev` — owned by `baogiang_dev_user`
- **Test DB:** `baogiang_test` — owned by `baogiang_test_user`
- **Không dùng role `postgres`** trong connection string
- **Không dùng `prisma migrate reset`** trên DB có dữ liệu

---

## AI-Ready Ports & Feature Flags

Được định nghĩa trong `apps/api/src/common/ports/`:

| Port / Interface | Trạng thái Phase 00 |
|------|---------------------|
| `AiAssistantPort`, `AiContextQueryPort`, `AiPolicyGuard` | Interface & Disabled Adapter |
| `AiTaskCatalog`, `PromptTemplateRegistry` | Interface & Disabled Adapter |
| `AiQuotaGuard`, `AiBudgetGuard`, `AiUsageMeter`, `AiCostLedger` | Interface & Disabled Adapter |
| `AiPassiveTriggerPort`, `AiSuggestionDeliveryPort` | Interface & Disabled Adapter |
| `AiProviderAdapter`, `AiOutputValidator`, `AiSuggestionStore` | Interface & Disabled Adapter |
| `AiAuditService`, `AiResultCache` | Interface & Disabled Adapter |
| `DisabledAiAssistantAdapter` | Implemented (safe no-op, 0 network, 0 DB write) |

Tất cả AI kill switches mặc định **false**:
- `AI_ENABLED=false`
- `AI_ACTIVE_MODE_ENABLED=false`
- `AI_PASSIVE_MODE_ENABLED=false`

---

## Notification-Ready Ports

`NotificationPublisherPort` và `PushGatewayPort` được định nghĩa nhưng chưa implement.  
Triển khai đầy đủ trong Phase 03+.

---

## Testing

| Layer | Framework | Scope |
|-------|-----------|-------|
| API Unit | Jest + NestJS Testing | HealthController, DisabledAiAdapter, Config |
| API Integration | Jest + Supertest | Health endpoints với DB thật |
| Web Unit | Vitest + Testing Library | HomePage, SystemStatusPage |
| E2E | Playwright | Navigation, status display, 404, no JS errors |

---

## Giới hạn Phase 00

Chưa có:
- Authentication / Authorization
- Business domain models (TKB, PPCT, Bảng kê, v.v.)
- Web Push notifications
- Import Excel / Export PDF
- GDĐP / HĐTN-HN modules
- AI features
- Dashboard nghiệp vụ
- Production deployment workflow
