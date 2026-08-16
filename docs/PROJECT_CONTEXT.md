# Bối cảnh Dự án — Hệ thống Báo giảng Đam San

## Thông tin dự án

## LOCAL-FC-05E2 / 05E2B / 05F0 status

Canonical main entering LOCAL-FC-05E2 is `92ea9133748f0864ba1d600b76a23d1d18e9e0e3`. LOCAL-FC-05D2 is **CLOSED / GREEN** through merged PR #50 and CI #203 PASS. It provides the bounded SpecialActivity runtime control plane; Room remains `NOT_ASSESSED`.

LOCAL-FC-05E0 is **CLOSED / GREEN** through PR #51 and CI #205 PASS. LOCAL-FC-05E1 is **CLOSED / GREEN** through PR #52 at head `76f0d389358d4f23f2a39e347a329c222d580d3c`, authoritative PR CI #208 PASS, merge commit/canonical main `92ea9133748f0864ba1d600b76a23d1d18e9e0e3`, and post-merge main CI #209 PASS. It implements the derived-only internal `RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1` resolver. Structural V1 remains unchanged with `PPCT_ITEM_ALLOCATION = NOT_ASSESSED`.

LOCAL-FC-05E2 is **CLOSED / GREEN** through PR #53 at head `1328a6be42e4438df3d23425f0fd0920c5d69224`, authoritative PR CI #210 PASS, canonical merge/main `641d0ed94cf56b948888d1fc2870d60e5fc3f53f`, and post-merge main CI #211 PASS. ADR-037 defines the downstream `PPCT_OCCURRENCE_ALLOCATION_V1` profile.

LOCAL-FC-05E2B is **CLOSED / GREEN** through PR #54 at final head `1731b7496c98961a96c09fd3b4aa7d397f7c679d`, authoritative PR CI #213 PASS, merge/current canonical main `07cba9d15b4335ac7d167ef11fa3ef21b66ee28a`, and post-merge main CI #214 PASS. Its profile remains `PPCT_OCCURRENCE_ALLOCATION_V1`, with `teachingExecution`, `completion`, `debt` and `reporting` all `NOT_ASSESSED`.

LOCAL-FC-05F0 Teaching Execution architecture is implemented on branch `docs/local-fc-05f0-teaching-execution-architecture` and awaits independent GitHub review. It is not **CLOSED / GREEN** before PR merge and post-merge CI.

| Mục | Nội dung |
|---|---|
| **Tên dự án** | Hệ thống Báo giảng và Thống kê Tiết dạy Tự động |
| **Đơn vị** | Trường PTDTNT THPT Đam San |
| **Repository** | `hvtnguyenson-code/baogiang-damsan` |
| **Thư mục local** | `D:\baogiang-damsan` |
| **Stable branch** | `main` |
| **Trạng thái sản phẩm** | Backend lõi đã hoàn thành qua deterministic PPCT allocation 05E2B; Teaching Execution architecture 05F0 đang chờ review; pre-operational, chưa go-live |

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

Ngoài PPCT persistence/control plane của 05A1–05A2, bounded readiness của 05B1, và operational-overlay persistence/control plane của 05C1–05C2A, chuỗi 05D0D–05D2 đã đóng và triển khai Special Activity minimum core. LOCAL-FC-05E0D/ADR-036 đóng kiến trúc structural resolved occurrence, 05E1 đã **CLOSED / GREEN**, LOCAL-FC-05E2D/ADR-037 đã **CLOSED / GREEN** kiến trúc allocation, và 05E2B deterministic allocation read model đã **CLOSED / GREEN** qua PR #54. LOCAL-FC-05F0/ADR-038 đã đóng mô hình kiến trúc hai family execution evidence trên docs branch và đang chờ independent review; persistence/runtime TeachingExecution, progress/debt, statement/reporting và approval snapshot vẫn chưa được triển khai. PPCT import, capacity, make-up public runtime, Room/Location và UI business semantics vẫn ngoài phạm vi.

`LOCAL-FC-05A0` đã merged qua PR #37. Closure 05A0D và ADR-027 đã xác lập kiến trúc PPCT: logical master dùng chung có scope `AcademicYear + Subject + Grade`, còn tiến độ phân phối/hoàn thành/nợ độc lập theo từng class-subject stream và gắn lịch sử với exact PPCT version/item.

`LOCAL-FC-05A1`/ADR-028 đã merged và thiết lập persistence foundation: stable item UUID tách khỏi version-local revision/order, split/merge có lineage tới exact revisions, và class-subject association gắn exact PPCT version theo khoảng ngày dân sự không chồng lấp. `LOCAL-FC-05A2`/ADR-029 đã thiết lập control plane, lifecycle DRAFT/PUBLISHED/SUPERSEDED, exact historical reads, class switch và `PPCT_MANAGE` theo môn/toàn trường. `LOCAL-FC-05B1`/ADR-030 đã thiết lập read model thuần đọc `NORMAL_BASE_PPCT_V1` cho normal-base + exact PPCT binding; đây không phải full operational readiness. PPCT import vẫn deferred sang lát cắt riêng; 05C2A mới chỉ cung cấp runtime cho ngoại lệ lịch và disposition, chưa có make-up runtime, capacity, progress, execution, reporting hoặc UI.

`LOCAL-FC-05C0D`/ADR-031 xác lập ba aggregate operational overlay độc lập; `LOCAL-FC-05C1`/ADR-032 cung cấp persistence foundation và `LOCAL-FC-05C2A`/ADR-033 cung cấp bounded runtime cho `CalendarException` cùng `OperationalLessonDisposition`. `LOCAL-FC-05D0D`/ADR-034, 05D1/ADR-035 và 05D2 đã hoàn thành Special Activity architecture, persistence và runtime minimum core. Make-up public runtime vẫn fail-closed; persisted resolved occurrence, TeachingExecution, progress/debt, reporting và UI business semantics không được 05E0 bổ sung.

ADR-036 giữ Structural V1 ở dạng recomputed `RepeatableRead`, không persistence/cache/snapshot/audit mutation. Normal candidates giữ cả suppression state; make-up và Special Activity là các occurrence family độc lập. PPCT binding resolve tới exact association/version/plan và allocation vẫn `NOT_ASSESSED` trong profile này. ADR-037 định nghĩa profile downstream `PPCT_OCCURRENCE_ALLOCATION_V1`: replay theo class-subject stream, exact-version stable-UUID/lineage semantics và fail-closed blockers; không thay đổi ý nghĩa Structural V1.

LOCAL-FC-05E2B không deploy, không migration production và không thay đổi schema/database hay public HTTP contract. LOCAL-FC-05F0 chỉ thay đổi tài liệu kiến trúc; không triển khai source, schema, migration, contract, capability, seed, controller, workflow, UI hoặc production mutation.

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
