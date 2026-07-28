# Bối cảnh Dự án — Hệ thống Báo giảng Đam San

## Thông tin dự án

| Mục              | Nội dung                                               |
|------------------|--------------------------------------------------------|
| **Tên dự án**    | Hệ thống Báo giảng và Thống kê Tiết dạy Tự động       |
| **Đơn vị**       | Trường PTDTNT THPT Đam San                             |
| **Repository**   | hvtnguyenson-code/baogiang-damsan                      |
| **Thư mục local**| D:\baogiang-damsan                                     |
| **Branch hiện tại** | phase/00-foundation                                 |
| **Phiên bản**    | 0.0.1 — Phase 00 Foundation                           |

## Công nghệ

| Tầng          | Công nghệ                                              |
|---------------|--------------------------------------------------------|
| Frontend      | React 18 · Vite 5 · TypeScript strict · Tailwind CSS  |
| Backend       | Node.js 22 · TypeScript strict · NestJS 10             |
| ORM           | Prisma 5                                               |
| Database      | PostgreSQL 17                                          |
| Testing       | Vitest (web) · Jest (API) · Playwright (E2E)           |
| Package Mgr   | npm workspaces (monorepo)                              |
| CI            | GitHub Actions                                         |

## Cổng mặc định (local)

| Dịch vụ    | Cổng                      |
|------------|---------------------------|
| Web (Vite) | http://127.0.0.1:5173     |
| API (Nest) | http://127.0.0.1:3100     |
| API prefix | /api                      |

## Production (chưa kích hoạt)

| Mục                   | Giá trị                           |
|-----------------------|-----------------------------------|
| Domain dự kiến        | baogiang.dtnt-damsan.edu.vn       |
| API port dự kiến      | 127.0.0.1:3100 (sau Nginx proxy)  |

## Hệ thống KHÔNG được tác động

Các hệ thống sau phải được giữ nguyên:

- **D:\Quan_li_noi_tru** — Hệ thống quản lý nội trú
- **D:\Edu_DamSan** — Hệ thống giáo dục khác
- **D:\PostgreSQL\data** — Dữ liệu PostgreSQL (cấu hình, database khác)
- VPS/production server
- Nginx configuration

## AI — Tắt mặc định

- AI **bị tắt hoàn toàn** cho đến khi toàn bộ các phase nghiệp vụ vận hành ổn định.
- Chỉ có ports/adapters ở tầng kiến trúc, không gọi bất kỳ AI provider nào.
- `AI_ENABLED=false` là giá trị mặc định và bắt buộc cho mọi phase trước Phase AI.
- Xem thêm: `docs/decisions/ADR-002-AI-READY-BUT-DISABLED.md`

## Prototype — Chỉ tham khảo

- File `docs/prototypes/ui-reference-phuong-an-b.html` chỉ dùng để tham khảo bố cục.
- Không được sao chép JavaScript, logic phân quyền hoặc PPCT từ prototype.
- Đặc tả `PA-B-VPS-PostgreSQL-v1.1-AI-ready.docx` là nguồn ưu tiên cao hơn prototype.
- Xem thêm: `docs/decisions/ADR-003-PROTOTYPE-REFERENCE-ONLY.md`
