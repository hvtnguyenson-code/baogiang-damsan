# Bối cảnh Dự án — Hệ thống Báo giảng Đam San

## Thông tin dự án

| Mục | Nội dung |
|---|---|
| **Tên dự án** | Hệ thống Báo giảng và Thống kê Tiết dạy Tự động |
| **Đơn vị** | Trường PTDTNT THPT Đam San |
| **Repository** | `hvtnguyenson-code/baogiang-damsan` |
| **Thư mục local** | `D:\baogiang-damsan` |
| **Stable branch** | `main` |
| **Trạng thái sản phẩm** | Backend lõi đã hoàn thành qua import TKB 04B3D1; pre-operational, chưa go-live |

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

## Môi trường làm việc local

Máy local chủ yếu dùng cho editor, Codex/Antigravity, lint, typecheck và targeted unit tests. PostgreSQL không bắt buộc cài/chạy local. Integration, migration và E2E có database chạy bằng PostgreSQL cô lập trong CI/test environment.

Các cổng dưới đây chỉ là cổng tiến trình ứng dụng khi cần chạy local; chúng không hàm ý có database local:

| Dịch vụ | Cổng |
|---|---|
| Web | `127.0.0.1:5173` |
| API | `127.0.0.1:3100` |
| API prefix | `/api` |

## Hiện trạng kiến trúc

Backend hiện có các boundary đã được review và version hóa:

- identity, session, capability/scope default-deny và audit;
- cấu trúc năm học với `AcademicCalendarVersion`, tuần nghiệp vụ, phân đoạn, quãng nghỉ và lớp theo năm;
- lịch sử `TeachingAssignment` theo ngày dân sự;
- khung tiết theo giờ thực và các revision bất biến;
- `TimetableVersion`/`TimetableEntry`, DRAFT/validation, approval/activation, supersession và historical resolution;
- import TKB XLSX gồm profile/alias, bounded workbook inspection, canonical preview, confirmation phía server, semantic/request replay, imported-DRAFT lock và adversarial security corpus qua LOCAL-FC-04B3D1.

Ngoài PPCT persistence foundation của 05A1 và control plane/lifecycle/history/auth do 05A2 triển khai trên feature branch theo ADR-029, chưa có PPCT import, operational overlay, cancellation/substitution/make-up, special activity, teaching execution/Báo giảng, tiến độ/công nợ, statement/reporting hay approval snapshot. Chưa có UI business semantics; dependency backend lõi tiếp theo vẫn là timetable operational readiness.

`LOCAL-FC-05A0` đã merged qua PR #37. Closure 05A0D và ADR-027 đã xác lập kiến trúc PPCT: logical master dùng chung có scope `AcademicYear + Subject + Grade`, còn tiến độ phân phối/hoàn thành/nợ độc lập theo từng class-subject stream và gắn lịch sử với exact PPCT version/item.

`LOCAL-FC-05A1`/ADR-028 đã merged và thiết lập persistence foundation: stable item UUID tách khỏi version-local revision/order, split/merge có lineage tới exact revisions, và class-subject association gắn exact PPCT version theo khoảng ngày dân sự không chồng lấp. `LOCAL-FC-05A2`/ADR-029 đã thiết lập control plane, lifecycle DRAFT/PUBLISHED/SUPERSEDED, exact historical reads, class switch và `PPCT_MANAGE` theo môn/toàn trường. PPCT import vẫn deferred sang lát cắt riêng; chưa có progress, execution, reporting hoặc UI. Lát cắt backend lõi tiếp theo là timetable operational readiness.

Thứ tự không đổi: hoàn thành chuỗi backend đến `CORE BACKEND FREEZE` trước khi UI được phép chốt business semantics.

## Hạ tầng production chính thức — pre-operational

| Mục | Giá trị |
|---|---|
| Hệ điều hành | Windows Server 2022 |
| Domain chính thức | `baogiang.dtnt-damsan.edu.vn` |
| Backend | `127.0.0.1:3100` sau Nginx |
| PostgreSQL | PostgreSQL 17, `localhost:5433` |

VPS, PostgreSQL và domain là hạ tầng chính thức ngay trong giai đoạn phát triển. Database chưa có dữ liệu vận hành thực tế; chỉ dùng tài khoản và dữ liệu giả cho đến quyết định go-live, không dùng cho test phá hủy hoặc test suite tự động. Delivery đi qua commit GitHub, CI, review, merge được phép và CD có kiểm soát. Mỗi lần truy cập VPS, deploy hoặc migration vẫn cần task/phê duyệt riêng.

Local không kết nối database VPS theo mặc định. Mọi nhu cầu kết nối phải có phương thức an toàn và phê duyệt riêng; không mở PostgreSQL công khai chỉ để local truy cập. Kiểm thử trên môi trường thật chỉ diễn ra sau CD qua domain chính thức.

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
