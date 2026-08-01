# Bối cảnh Dự án — Hệ thống Báo giảng Đam San

## Thông tin dự án

| Mục | Nội dung |
|---|---|
| **Tên dự án** | Hệ thống Báo giảng và Thống kê Tiết dạy Tự động |
| **Đơn vị** | Trường PTDTNT THPT Đam San |
| **Repository** | `hvtnguyenson-code/baogiang-damsan` |
| **Thư mục local** | `D:\baogiang-damsan` |
| **Branch Phase 00** | `phase/00-foundation` |
| **Branch Phase 01** | `phase/01-identity-access` |
| **Stable branch** | `main` |
| **Phiên bản** | `0.0.1` — Phase 00 Foundation |

## Phương án chính thức

Phương án triển khai chính thức là:

- **Phương án B** — VPS Windows Server 2022 + PostgreSQL 17.
- Đặc tả ưu tiên cao nhất: `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md`, bổ sung và thay thế nội dung tương ứng của v1.2.
- Đặc tả nền: `docs/specifications/PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx`.
- Phương án A chỉ lưu để đối chiếu và tham khảo.

## Công nghệ

| Tầng | Công nghệ |
|---|---|
| Frontend | React 18 · Vite 5 · TypeScript strict · Tailwind CSS |
| Backend | Node.js 22 · TypeScript strict · NestJS 10 |
| ORM | Prisma 5 |
| Database | PostgreSQL 17 |
| Testing | Vitest · Jest · Playwright |
| Package manager | npm workspaces |
| CI | GitHub Actions |

## Cổng mặc định local

| Dịch vụ | Cổng |
|---|---|
| Web | `127.0.0.1:5173` |
| API | `127.0.0.1:3100` |
| API prefix | `/api` |

## Hạ tầng production chính thức — pre-operational

| Mục | Giá trị |
|---|---|
| Hệ điều hành | Windows Server 2022 |
| Domain chính thức | `baogiang.dtnt-damsan.edu.vn` |
| Backend | `127.0.0.1:3100` sau Nginx |
| PostgreSQL | PostgreSQL 17, `localhost:5433` |

VPS, PostgreSQL và domain là hạ tầng chính thức ngay trong giai đoạn phát triển. Database chưa có dữ liệu vận hành thực tế; chỉ dùng tài khoản và dữ liệu giả cho đến quyết định go-live. Delivery đi qua commit GitHub, CI, review, merge được phép và CD có kiểm soát. Mỗi lần truy cập VPS, deploy hoặc migration vẫn cần task/phê duyệt riêng.

## Hệ thống không được tác động

- `D:\Quan_li_noi_tru`
- `D:\Edu_DamSan`
- dữ liệu và cấu hình PostgreSQL của hệ thống khác
- dịch vụ, Scheduled Task và Nginx của hệ thống nội trú
- tài nguyên VPS production ngoài phạm vi task hoặc khi chưa có phê duyệt tương ứng

## AI — tắt mặc định

- AI chưa được tích hợp thật trong các phase nghiệp vụ lõi.
- Phase 00 chỉ có ports, policy contracts và disabled adapter.
- Ba kill switch bắt buộc mặc định `false`:
  - `AI_ENABLED`
  - `AI_ACTIVE_MODE_ENABLED`
  - `AI_PASSIVE_MODE_ENABLED`
- Không có chatbot hoặc ô prompt tự do cho giáo viên.
- AI không được ghi trực tiếp dữ liệu nghiệp vụ.

## Prototype — chỉ tham khảo

`docs/prototypes/ui-reference-phuong-an-b.html` chỉ dùng tham khảo bố cục và định hướng thị giác.

Không sao chép:

- JavaScript của prototype;
- role selector;
- mô hình `Level_1`, `Level_2`, `Level_Max`;
- logic khóa PPCT;
- logic phân quyền hoặc phê duyệt.

Thứ tự ưu tiên nguồn yêu cầu:

1. Addendum Phương án B v1.3.
2. ADR hiện hành.
3. Đặc tả Phương án B v1.2 được phê duyệt.
4. Tài liệu phase và governance đã được đối chiếu.
5. Prototype HTML — chỉ tham khảo UI/UX.
