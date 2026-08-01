# BÁO CÁO HOÀN THÀNH PHASE 00 — FOUNDATION

> **Hồ sơ lịch sử:** Các trạng thái branch/merge/deploy và phân công agent dưới đây chỉ mô tả Phase 00. Hướng hiện hành từ 2026-08-01 nằm trong addendum Phương án B v1.3, ADR-005 và `AGENTS.md`.

**Dự án:** Hệ thống Báo giảng và Thống kê Tiết dạy Tự động  
**Đơn vị:** Trường PTDTNT THPT Đam San  
**Repository:** `hvtnguyenson-code/baogiang-damsan`  
**Branch:** `phase/00-foundation`  
**Ngày hoàn thành:** 2026-07-28  
**Trạng thái:** HOÀN THÀNH, chờ Pull Request vào `main`

## 1. Nền tảng kỹ thuật

- React 18 + Vite 5 + TypeScript strict + Tailwind CSS.
- Node.js 22 + NestJS 10 + TypeScript strict.
- Prisma 5 + PostgreSQL 17.
- npm workspaces monorepo.
- Vitest, Jest, Supertest và Playwright.
- GitHub Actions CI.

## 2. Kiến trúc monorepo

```text
apps/web
apps/api
packages/contracts
packages/config
tests/e2e
prisma
scripts/db
docs
.github/workflows
```

## 3. Database local và CI

> **Trạng thái lịch sử:** Các role/database local dưới đây là cơ chế Phase 00 đã được addendum v1.3 thay thế. Workflow hiện hành không yêu cầu PostgreSQL local; CI/test environment dựng PostgreSQL cô lập.

| Môi trường | Role | Database |
|---|---|---|
| Development | `baogiang_dev_user` | `baogiang_dev` |
| Test | `baogiang_test_user` | `baogiang_test` |

- Ứng dụng không dùng role `postgres`.
- Script local không được tác động database khác.
- CI tạo role và database bằng lệnh idempotent.
- `CREATE DATABASE` chạy ngoài transaction block.
- CI xác minh kết nối bằng `SELECT 1`.

## 4. Kết quả kiểm thử và build

Pipeline đã xác nhận thành công:

- Prisma generate;
- lint toàn bộ workspace;
- TypeScript typecheck;
- unit tests API và Web;
- integration tests API với PostgreSQL thật;
- build packages, API và Web;
- Playwright Chromium smoke-test step.

Run xác minh tại thời điểm hoàn thành nền móng:

- Run ID: `30375101463`
- Conclusion: `success`
- Commit: `805b9cd1aa642b53b0f5e6c97d9a101737b51b7b`

Các commit remediation tài liệu sau đó phải có CI xanh riêng trước khi merge.

## 5. AI-ready foundation

Đã tạo các interface và disabled adapter phục vụ governance, quota, budget, usage, audit, cache, active/passive delivery và output validation.

Ba kill switch mặc định tắt:

- `AI_ENABLED=false`
- `AI_ACTIVE_MODE_ENABLED=false`
- `AI_PASSIVE_MODE_ENABLED=false`

Không có:

- provider call;
- AI endpoint;
- chatbot hoặc prompt tự do;
- AI ghi trực tiếp dữ liệu nghiệp vụ.

## 6. Tài liệu kiến trúc và governance

Repository có:

- `PROJECT_CONTEXT.md`;
- `PHASE-00-FOUNDATION.md`;
- ADR-001 đến ADR-004;
- AI governance và access model;
- AI usage/cost policy;
- requirements traceability;
- handover checklist;
- đặc tả Phương án A và B v1.2.

Phương án production chính thức:

- Phương án B;
- Windows Server 2022;
- PostgreSQL 17;
- Nginx;
- service, database, log, backup và deploy riêng.

## 7. Git và trạng thái phát hành

- Branch Phase 00 đã được commit và push lên GitHub.
- Branch đi trước `main` và không bị tụt sau `main` tại thời điểm verification.
- Chưa merge vào `main` khi báo cáo này được cập nhật.
- Push không đồng nghĩa deploy.
- Chưa deploy VPS.

## 8. Phạm vi chưa triển khai

- authentication và authorization implementation;
- người dùng và hồ sơ nhân sự;
- tổ chuyên môn và môn học;
- TKB, PPCT, nợ tiết, báo giảng và bảng kê;
- notification/Web Push;
- GDĐP và HĐTN-HN;
- AI thật;
- production deployment.

## 9. Điều kiện merge Phase 00

- Documentation references thống nhất với v1.2.
- Production platform thống nhất là Windows Server 2022.
- CI xanh tại final PR head.
- Không có thay đổi production/deploy.
- Pull Request được review và squash merge vào `main`.

## 10. Bước tiếp theo

Sau khi Phase 00 merge vào `main`:

1. Tạo branch `phase/01-identity-access` từ head mới nhất của `main`.
2. Đọc toàn bộ đặc tả v1.2 và ADR.
3. Hoàn thiện đặc tả Phase 01 về identity, authentication, capability, scope và audit.
4. Chỉ sau khi đặc tả được phê duyệt mới giao Antigravity triển khai code.
