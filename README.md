# Hệ thống Báo giảng và Thống kê Tiết dạy Tự động

**Đơn vị sử dụng:** Trường PTDTNT THPT Đam San

> ⚠️ **Phase 00 — Nền móng kỹ thuật.** Chưa có chức năng nghiệp vụ nào hoàn chỉnh.  
> Không sử dụng database production cho phát triển.

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

- Phát triển và kiểm thử trên máy local.
- **KHÔNG dùng database production để phát triển.**
- Push GitHub không đồng nghĩa deploy.
- Production chỉ deploy khi đã kiểm tra và xác nhận.
- Không tác động hệ thống quản lý nội trú hiện có.
- AI tắt mặc định — xem `docs/decisions/ADR-002-AI-READY-BUT-DISABLED.md`.

## Production

- Domain: `baogiang.dtnt-damsan.edu.vn`
- Backend: `127.0.0.1:3100` (sau Nginx proxy)
- Reverse proxy: Nginx

---

*Phase 00 — Foundation. Xem `docs/phase-reports/PHASE-00-REPORT.md` để biết chi tiết.*
