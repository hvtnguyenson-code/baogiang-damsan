# Hệ thống Báo giảng và Thống kê Tiết dạy Tự động

**Đơn vị sử dụng:** Trường PTDTNT THPT Đam San

> **Trạng thái hiện hành:** repository đã có chuỗi backend từ identity/access, lịch học, phân công, TKB, PPCT, operational overlays, Teaching Execution, progress/debt/late, reporting đến Reporting Statement. Tuy nhiên hệ thống **chưa sẵn sàng cho teacher pilot** vì đang thực hiện Pre-Pilot Product/Spec Realignment để khôi phục các yêu cầu programme GDĐP/HĐTN, delayed go-live, import dữ liệu thật, workload và các gate PWA/Telegram/TLS/production. Không suy ra pilot-readiness chỉ từ việc core backend đã tồn tại.

**Current-state authority:** `docs/governance/CURRENT-PROJECT-STATUS.md`  
**Canonical work register:** `docs/governance/PRE-PILOT-TASK-REGISTER.md`

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
|------|----------|
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

```text
baogiang-damsan/
├── apps/
│   ├── web/          # React frontend
│   └── api/          # NestJS backend
├── packages/
│   ├── contracts/    # Shared TypeScript types
│   └── config/       # Shared constants
├── tests/e2e/        # Playwright E2E tests
├── prisma/           # Prisma schema
└── docs/             # Specifications, ADRs, governance, reports
```

---

## Kiến trúc nghiệp vụ hiện có

Current `main` đã có các foundation chính:

- identity, session, capability/scope default-deny và audit;
- AcademicYear, versioned calendar, business weeks/segments/interruptions/classes;
- TeachingAssignment history;
- HomeroomAssignment retained history, control plane and capability-gated administration workspace;
- exact retained time slots;
- TimetableVersion/TimetableEntry, lifecycle, historical resolution và XLSX import infrastructure;
- PPCT version/item/lineage/class association;
- operational overlays;
- SpecialActivity minimum-core runtime/collision;
- PPCT occurrence allocation;
- curricular TeachingExecution và SpecialActivityParticipationExecution;
- progress/debt/late projection;
- reporting projection, Personal Reporting Projection và Reporting Statement lifecycle/UI work;
- hardened Windows production deployment control plane.

Các foundation này **không đồng nghĩa** mọi yêu cầu sản phẩm đã khép kín. Danh sách gap/re-entry hiện hành nằm trong:

- `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md`;
- `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`;
- `docs/governance/PRE-PILOT-TASK-REGISTER.md`.

---

## Quy tắc phát triển bắt buộc

- Mỗi task dùng một branch riêng.
- Trước major task phải đọc `AGENTS.md` và toàn bộ current governance authority.
- Major task phải có Task ID trong `PRE-PILOT-TASK-REGISTER.md` trước khi code.
- Không để requirement ở trạng thái `deferred/later` chỉ trong prose; phải có task re-entry và trigger.
- Merge **không** tự động đồng nghĩa task `CLOSED`; post-merge SHA/CI và tài liệu current-state phải được sync trước khi task phụ thuộc tiếp theo bắt đầu.
- Không reset/clean/stash/rebase/amend/squash/force-push theo workflow repository.
- Database chính thức không dùng cho destructive automated tests.
- Không tác động hệ thống Quản lí nội trú/DamSanV5 ngoài task hạ tầng được phê duyệt riêng.
- AI mặc định tắt theo ADR-002/004.

Quy tắc đầy đủ: `AGENTS.md` và `docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`.

---

## Production

- Domain dự kiến/chính thức: `baogiang.dtnt-damsan.edu.vn`
- Backend loopback: `127.0.0.1:3100`
- Reverse proxy: Nginx
- PostgreSQL: PostgreSQL 17
- Trạng thái: **pre-operational; chưa teacher pilot**

Green CI không chứng minh VPS ready. First deploy vẫn phải đi qua task register P6, passive evidence/preflight, TLS/HTTP-01 authority, bootstrap và explicit production authorization.
