# Hệ thống Báo giảng và Thống kê Tiết dạy Tự động

**Đơn vị sử dụng:** Trường PTDTNT THPT Đam San

> **Trạng thái hiện hành (2026-10-16):** backend/domain foundation và GitHub→VPS code-only CD đã hoạt động trên domain chính thức, nhưng hệ thống **chưa sẵn sàng cho teacher pilot** vì live PHT review xác nhận khoảng trống product-operability/UX. `P5-050` đã CLOSED và đăng ký chuỗi `P5-051..P5-057`: quyền nền + responsibility templates + safe user lifecycle, workspace/navigation theo công việc, UI TKB/khung tiết, điều hành chuyên môn, data-readiness/import center, notification/Web Push và persona E2E freeze. Không suy ra pilot-readiness chỉ từ backend/CI/deploy xanh.

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
- hardened Windows production deployment control plane;
- P5-050 product-operability governance: Antigravity là implementer mặc định, ChatGPT điều phối/review độc lập, Codex được escalation cho phần khó/rủi ro cao.

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

- Domain chính thức: `baogiang.dtnt-damsan.edu.vn`
- Backend loopback: `127.0.0.1:3100`
- Reverse proxy: Nginx, frontend dùng stable `C:/baogiang/current/apps/web/dist`
- PostgreSQL Báo giảng: PostgreSQL 17 riêng trên port `5434`
- GitHub→VPS code-only CD: **đã vận hành và kiểm chứng**; production release phải đi từ exact green `main` SHA
- Trạng thái sản phẩm: **pre-operational; chưa teacher pilot** cho đến khi P5-057 và các gate P6 liên quan hoàn tất

Green CI vẫn không tự chứng minh một deployment cụ thể thành công. Sau mỗi runtime deploy phải kiểm tra exact release identity, API/public health và protected-neighbour isolation; không sửa code trực tiếp trên VPS.
