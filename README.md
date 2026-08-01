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
- PostgreSQL 17 tại `D:\PostgreSQL`

### 1. Cài dependencies

```bash
npm install
```

### 2. Tạo database local

```bash
npm run db:init
```

Script sẽ tạo (idempotent):
- Role: `baogiang_dev_user`, `baogiang_test_user`
- Database: `baogiang_dev`, `baogiang_test`

### 3. Tạo file môi trường

```bash
copy apps\api\.env.example apps\api\.env
```

Chỉnh sửa `.env` nếu cần (không commit file `.env`).

### 4. Generate Prisma client

```bash
npm run prisma:generate
```

### 5. Chạy development servers

```bash
# Chạy cả web và API
npm run dev

# Hoặc riêng lẻ
npm run dev:web   # http://127.0.0.1:5173
npm run dev:api   # http://127.0.0.1:3100
```

---

## Kiểm tra kết nối database

```bash
npm run db:check
```

---

## Kiểm thử

```bash
# Toàn bộ tests (unit + integration)
npm run test

# Unit tests
npm run test:unit

# Integration tests (cần PostgreSQL đang chạy)
npm run test:integration

# E2E với Playwright (cần cả web và API đang chạy)
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
|------|----------|
| `npm run dev` | Chạy web + API |
| `npm run dev:web` | Chỉ chạy web (Vite) |
| `npm run dev:api` | Chỉ chạy API (NestJS) |
| `npm run lint` | Kiểm tra lint toàn bộ |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run test` | Chạy unit + integration tests |
| `npm run test:e2e` | Chạy Playwright E2E tests |
| `npm run build` | Build tất cả packages và apps |
| `npm run db:init` | Khởi tạo database local |
| `npm run db:check` | Kiểm tra kết nối database |
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
├── scripts/db/       # Database management scripts
└── docs/             # Specifications, ADRs, reports
```

---

## Nguyên tắc phát triển

- Viết code và chạy kiểm tra nhanh trên máy local, mỗi task trên một branch riêng.
- Delivery chính thức đi qua GitHub: push → CI → review → merge `main` khi được phép → CD có kiểm soát.
- Push tự nó không phải deploy; deploy chỉ xảy ra khi các CI/review/authorization gate của CD được thỏa mãn.
- Database chính thức đang pre-operational và chỉ dùng dữ liệu giả. Thay đổi schema đi qua migration đã commit, CI cô lập và `prisma migrate deploy` được phê duyệt.
- Không tác động hệ thống quản lý nội trú hiện có.
- AI tắt mặc định — xem `docs/decisions/ADR-002-AI-READY-BUT-DISABLED.md`.

Quy tắc đầy đủ: `AGENTS.md`, `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md` và `docs/operations/DEVELOPMENT-DEPLOYMENT-DATABASE.md`.

## Production

- Domain: `baogiang.dtnt-damsan.edu.vn`
- Backend: `127.0.0.1:3100` (sau Nginx proxy)
- Reverse proxy: Nginx
- Trạng thái: hạ tầng chính thức, pre-operational; chưa có dữ liệu vận hành thực tế.

---

*Xem `docs/phase-reports/PHASE-00-REPORT.md` cho lịch sử Phase 00 và addendum v1.3 cho hướng hiện hành.*
