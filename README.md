# Hệ thống Báo giảng và Thống kê Tiết dạy Tự động

**Đơn vị sử dụng:** Trường PTDTNT THPT Đam San

> ⚠️ Hệ thống đang ở giai đoạn nền móng, chưa có chức năng nghiệp vụ hoàn chỉnh. Hạ tầng VPS, PostgreSQL và domain là production chính thức ở trạng thái **pre-operational**; chỉ dùng tài khoản và dữ liệu giả cho đến quyết định go-live.

---

## Công nghệ

| Tầng | Công nghệ |
|------|-----------|
| Frontend | React 18 · Vite 5 · TypeScript strict · Tailwind CSS |
| Backend | Node.js 22 · TypeScript strict · NestJS 10 |
| ORM | Prisma 5 |
| Database | PostgreSQL 17 |
| Package Manager | npm workspaces |
| CI | GitHub Actions |

## Cổng local

| Dịch vụ | URL |
|---------|-----|
| Web | http://127.0.0.1:5173 |
| API | http://127.0.0.1:3100 |
| API health | http://127.0.0.1:3100/api/health/live |

---

## Cài đặt và chạy local

### Yêu cầu

- Node.js 22+
- npm 10+
- Không bắt buộc cài hoặc chạy PostgreSQL trên máy local.

### 1. Cài dependencies

```bash
npm install
```

### 2. Tạo file môi trường khi cần

```bash
copy apps\api\.env.example apps\api\.env
```

Chỉ cấu hình `.env` cho lệnh cần environment runtime và không commit file này. `DATABASE_URL`/`TEST_DATABASE_URL` do từng environment cấp; không đưa credential VPS vào repository. Kết nối từ local tới database chính thức không phải cấu hình mặc định và chỉ được thực hiện qua phương thức an toàn được phê duyệt riêng.

### 3. Generate Prisma client

```bash
npm run prisma:generate
```

### 4. Chạy development servers

```bash
# Chạy cả web và API
npm run dev

# Hoặc riêng lẻ
npm run dev:web   # http://127.0.0.1:5173
npm run dev:api   # http://127.0.0.1:3100
```

---

## Kiểm thử

```bash
# Toàn bộ tests trong CI/test environment có PostgreSQL cô lập
npm run test

# Targeted unit tests có thể chạy local mà không cần PostgreSQL
npm run test:unit

# Integration tests nhận TEST_DATABASE_URL từ CI/test environment
npm run test:integration

# E2E đầy đủ chạy trong CI cô lập; kiểm tra môi trường thật chạy sau CD trên domain chính thức
npm run test:e2e
```

---

## Build

```bash
npm run build
```

---

## Các lệnh chính

| Lệnh | Mục đích |
|------|-----------|
| `npm run dev` | Chạy web + API |
| `npm run dev:web` | Chỉ chạy web (Vite) |
| `npm run dev:api` | Chỉ chạy API (NestJS) |
| `npm run lint` | Kiểm tra lint toàn bộ |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run test` | Chạy unit + integration tests |
| `npm run test:e2e` | Chạy Playwright E2E tests |
| `npm run build` | Build tất cả packages và apps |
| `npm run prisma:generate` | Generate Prisma Client |

---

## Cấu trúc dự án

```
baogiang-damsan/
├── apps/
│   ├── web/          # React frontend
│   └── api/          # NestJS backend
├── packages/
│   ├── contracts/    # Shared TypeScript types
│   └── config/       # Shared constants
├── tests/e2e/        # Playwright E2E tests
├── prisma/           # Prisma schema
└── docs/             # Specifications, ADRs, reports
```

---

## Nguyên tắc phát triển

- Máy local chủ yếu chạy editor, Codex/Antigravity, lint, typecheck và targeted unit tests; mỗi task trên một branch riêng.
- Delivery chính thức đi qua GitHub: push → CI → review → merge `main` khi được phép → CD có kiểm soát.
- Push tự nó không phải deploy; deploy chỉ xảy ra khi các CI/review/authorization gate của CD được thỏa mãn.
- Database VPS chính thức đang pre-operational và chỉ dùng dữ liệu giả; không dùng nó cho test phá hủy hoặc test suite tự động. Integration/migration/E2E dùng PostgreSQL cô lập trong CI. Thay đổi schema đi qua migration đã commit và `prisma migrate deploy` được phê duyệt trong task riêng.
- Không tác động hệ thống quản lý nội trú hiện có.
- Báo giảng phải **host-portable**: business code không phụ thuộc VPS hiện tại, Quản lí nội trú hay một OS cụ thể. Cùng codebase phải hỗ trợ deployment profile shared-host và standalone VPS; xem `docs/decisions/ADR-010-HOSTING-PORTABILITY-AND-STAGED-CONSOLIDATION.md`.
- AI tắt mặc định — xem `docs/decisions/ADR-002-AI-READY-BUT-DISABLED.md`.

Quy tắc đầy đủ: `AGENTS.md`, `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md` và `docs/operations/DEVELOPMENT-DEPLOYMENT-DATABASE.md`.

## Production

- Domain: `baogiang.dtnt-damsan.edu.vn`
- Backend: `127.0.0.1:3100` (sau Nginx proxy)
- Reverse proxy: Nginx
- Trạng thái: hạ tầng chính thức, pre-operational; chưa có dữ liệu vận hành thực tế.
- Hosting direction: ưu tiên một VPS Linux mới, đưa Báo giảng lên vận hành trước; sau đó audit và chạy Quản lí nội trú ở staging song song với VPS Windows cũ. Chỉ khi readiness gate đạt mới hợp nhất hai hệ thống trên VPS Linux. **Hướng làm đã chốt, thời điểm cutover không khóa theo tháng/năm.**

---

*Xem `docs/phase-reports/PHASE-00-REPORT.md` cho lịch sử Phase 00 và addendum v1.3 cho hướng hiện hành.*
