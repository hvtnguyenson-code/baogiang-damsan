# ADR-001: Lựa chọn Technology Stack

**Ngày:** 2026-07-28  
**Trạng thái:** ĐƯỢC CHẤP NHẬN  
**Giai đoạn:** Phase 00 — Foundation

---

## Bối cảnh

Dự án cần một nền tảng kỹ thuật có thể:
- Hỗ trợ phát triển theo nhiều phase từ nền móng đến AI
- Phù hợp với một nhóm phát triển nhỏ
- Chạy ổn định trên VPS Linux với PostgreSQL
- Cho phép kiểm thử đầy đủ từ unit đến E2E

---

## Quyết định

### Frontend: React + Vite + TypeScript

**Lý do:**
- React là thư viện UI phổ biến, hệ sinh thái lớn, dễ tuyển dụng
- Vite cung cấp build nhanh, HMR tốt cho development
- TypeScript strict giúp phát hiện lỗi sớm, đặc biệt trong nghiệp vụ phức tạp
- React Router v6 với layout routes phù hợp cấu trúc app
- TanStack Query quản lý server state, caching, retry — phù hợp cho dashboard nghiệp vụ

**Lý do từ chối Next.js:**
- SSR/SSG không cần thiết cho hệ thống nội bộ trường
- Phức tạp hơn không đáng với scope dự án hiện tại

**Lý do từ chối Tailwind CDN:**
- CDN không kiểm soát được phiên bản
- Không treeshake được, file CSS lớn hơn cần thiết
- Tailwind được cài qua npm và build bằng Vite để tối ưu

### Backend: NestJS + TypeScript

**Lý do:**
- NestJS có cấu trúc module rõ ràng, phù hợp hệ thống nghiệp vụ lớn
- Dependency injection sẵn có, thuận tiện cho ports/adapters pattern
- Hỗ trợ Pipes, Guards, Filters tích hợp sẵn
- TypeScript strict end-to-end từ frontend đến backend
- NestJS + Prisma là combination trưởng thành, được cộng đồng kiểm chứng

**Lý do từ chối Express thuần:**
- Thiếu cấu trúc dẫn đến inconsistency trong dự án dài hạn
- Phải tự xây nhiều thứ mà NestJS đã có

**Lý do từ chối Fastify:**
- Hệ sinh thái nhỏ hơn NestJS
- Ít tài liệu tiếng Việt hơn

### ORM: Prisma

**Lý do:**
- Schema-first, type-safe client được generate tự động
- Migration workflow rõ ràng với version history
- Hỗ trợ PostgreSQL tốt
- Prisma Client là typed hoàn toàn, khớp với TypeScript strict

**Lý do từ chối TypeORM:**
- Decorators-heavy, phức tạp hơn trong sync với schema
- Migration ít reliable hơn Prisma

**Lý do từ chối Drizzle:**
- Còn tương đối mới, hệ sinh thái nhỏ hơn
- Ít pattern đã được kiểm chứng cho dự án lớn

### Database: PostgreSQL 17

**Lý do:**
- Yêu cầu từ đặc tả `PA-B-VPS-PostgreSQL-v1.1`
- PostgreSQL 17 đã được cài sẵn trên máy local và VPS
- Hỗ trợ tốt cho JSONB, full-text search, row-level security nếu cần sau này

### Package Manager: npm workspaces

**Lý do:**
- npm được cài sẵn với Node.js, không cần install thêm
- npm workspaces đủ cho monorepo với ≤5 packages
- Tránh thêm dependency toolchain (pnpm, yarn) cho team nhỏ

**Ràng buộc:** Không chuyển sang pnpm hoặc yarn trong project này.

### Testing: Vitest + Jest + Playwright

**Lý do:**
- **Vitest** cho web: tích hợp tốt với Vite, nhanh hơn Jest trong môi trường ESM
- **Jest** cho API: tích hợp tốt với NestJS Testing module
- **Playwright** cho E2E: cross-browser, network interception, reliable waiting mechanisms

---

## Hệ quả

- Toàn bộ codebase dùng TypeScript strict — `any` bị cấm
- Shared packages (`@baogiang/contracts`, `@baogiang/config`) giữ type-safety end-to-end
- Build artifacts của packages cần được generate trước khi apps import
- CI phải chạy `prisma generate` trước khi build API
