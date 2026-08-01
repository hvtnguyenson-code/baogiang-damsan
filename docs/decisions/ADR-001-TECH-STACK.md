# ADR-001: Lựa chọn Technology Stack

**Ngày:** 2026-07-28  
**Trạng thái:** ĐƯỢC CHẤP NHẬN  
**Giai đoạn:** Phase 00 — Foundation

> Phần trạng thái hạ tầng và delivery đã được ADR-005/addendum Phương án B v1.3 bổ sung: VPS/PostgreSQL/domain là production chính thức pre-operational; delivery chuẩn đi qua CI/CD có kiểm soát.

## Bối cảnh

Dự án cần một nền tảng kỹ thuật:

- hỗ trợ phát triển theo nhiều phase từ nền móng đến AI;
- phù hợp nhóm phát triển nhỏ;
- chạy ổn định trên VPS **Windows Server 2022** với PostgreSQL 17;
- cho phép kiểm thử đầy đủ từ unit đến E2E;
- không tác động hệ thống quản lý nội trú đang vận hành trên cùng VPS.

## Quyết định

### Frontend: React + Vite + TypeScript

Lý do:

- React có hệ sinh thái lớn;
- Vite có quy trình build và development đơn giản;
- TypeScript strict giảm lỗi trong nghiệp vụ phức tạp;
- React Router v6 phù hợp ứng dụng nội bộ;
- TanStack Query quản lý server state, cache và retry.

Không dùng Next.js vì hệ thống nội bộ không cần SSR/SSG. Tailwind phải được cài qua npm, không dùng CDN.

### Backend: NestJS + TypeScript

Lý do:

- cấu trúc module rõ ràng;
- dependency injection phù hợp ports/adapters;
- có sẵn Pipes, Guards và Filters;
- duy trì TypeScript strict end-to-end.

Không dùng Express thuần vì thiếu cấu trúc cho dự án dài hạn.

### ORM: Prisma

Lý do:

- schema-first;
- type-safe client;
- migration có lịch sử;
- hỗ trợ PostgreSQL tốt.

### Database: PostgreSQL 17

- Phù hợp đặc tả Phương án B v1.2.
- Local development dùng PostgreSQL 17 tại `127.0.0.1:5432`.
- Production chính thức dùng PostgreSQL 17 tại `localhost:5433` trên Windows Server 2022 và đang pre-operational.
- Dự án dùng database và role riêng, không dùng database hoặc role của hệ thống nội trú.

### Package manager: npm workspaces

- Có sẵn với Node.js;
- đủ cho quy mô monorepo hiện tại;
- không chuyển sang pnpm hoặc yarn nếu chưa có ADR mới.

### Testing: Vitest + Jest + Playwright

- Vitest cho frontend;
- Jest cho API;
- Playwright cho E2E;
- integration test dùng PostgreSQL thật trong CI.

### Production runtime

- Windows Server 2022;
- frontend là static files qua Nginx;
- backend chạy service riêng tại `127.0.0.1:3100`;
- PostgreSQL 17 dùng database và role riêng;
- deploy qua CD có kiểm soát từ commit GitHub; `workflow_dispatch` chỉ dùng khi được phê duyệt;
- push tự nó không deploy và không bỏ qua CI/review gate;
- không restart toàn bộ VPS.

## Hệ quả

- Toàn bộ codebase dùng TypeScript strict.
- Shared packages giữ type-safety giữa web và API.
- CI chạy Prisma generate trước khi build API.
- Mọi thay đổi nền tảng hoặc production architecture phải có ADR mới.
- Phase 00 không triển khai production. Từ addendum v1.3, mọi deploy/migration của phase sau đi qua task và phê duyệt riêng.
