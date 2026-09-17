# P1-031C — Operational-Start Academic-Year Options Read-Model Enablement

## Status

**READY — registered major enablement task; dependencies CLOSED; awaiting dedicated implementation branch.**

- **Mã nhiệm vụ (Task ID):** `P1-031C`
- **Tên chuẩn tắc (Canonical Name):** Operational-start Academic-Year options read-model enablement
- **Trạng thái tại thời điểm đăng ký (Status at Registration):** `READY`
- **Tiền đề phụ thuộc (Dependencies):**
  - `P1-021` — Business Configuration persistence/control plane (`CLOSED`)
  - `P1-031` — Operational-start policy implementation (`CLOSED`)
  - `P1-031A` — Operational-start authority continuity correction (`CLOSED`)
- **Ma trận truy vết (Traceability Matrix):** `T21`, `T28`
- **Quyết định kiến trúc kiểm soát (Controlling Decisions):**
  - `docs/decisions/ADR-046-BUSINESS-CONFIGURATION-CONTROL-PLANE.md` (Accepted)
  - `docs/decisions/ADR-049-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md` (Accepted)
- **Tài liệu nền tảng liên quan:**
  - `docs/requirements/P1-020-BUSINESS-CONFIGURATION-CONTROL-PLANE-ARCHITECTURE.md`
  - `docs/requirements/P1-022-BUSINESS-CONFIGURATION-ADMINISTRATION-WORKSPACE.md`
  - `docs/requirements/P1-030-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md`
  - `docs/requirements/P1-031-OPERATIONAL-START-POLICY-IMPLEMENTATION-PLAN.md`
  - `docs/requirements/P1-031B-OPERATIONAL-START-SCHEDULED-AUTHORITY-SUPERSESSION-ARCHITECTURE.md`
- **Phân công công cụ thực thi tương lai (Future Implementation Tool Assignment):** `CODEX` (theo quy định `AGENTS.md` về quyền sở hữu tầng API, backend service, authorization và integration tests). Nhiệm vụ đăng ký tài liệu hiện tại do `ANTIGRAVITY IDE` thực hiện dưới dạng thay đổi tài liệu/quản trị thuần túy.
- **Tác động tới nhiệm vụ kế tiếp:** `P1-032` (Operational-start admin UI integration) được chuyển trạng thái từ `READY` về lại `PLANNED` và phụ thuộc vào `P1-031C`. `P1-032` chưa từng bắt đầu, chưa có commit triển khai nào và không được phép bắt đầu cho đến khi `P1-031C` hoàn tất `CLOSED`.

---

## 1. Khoảng trống được phát hiện qua Tiền khảo sát P1-032 (Audited Gap)

Tiền khảo sát độc lập chuẩn tắc (Pre-implementation Preflight Audit) của nhiệm vụ `P1-032` đã phát hiện một khoảng trống kỹ thuật tại điểm nối mã nguồn (code seam):

1. **Yêu cầu của nhóm chính sách `OPERATIONAL_START`:**
   Theo `ADR-049` và `P1-031`, chính sách bắt đầu vận hành có `resourceKind = 'ACADEMIC_YEAR'`. Để tạo bản nháp (`createDraft`) hoặc tra cứu hiệu lực (`resolve`), giao diện quản trị bắt buộc phải gửi định danh `academicYearId` hợp lệ (UUID).
2. **Quy định bất biến của P1-022:**
   Theo [P1-022 §4](file:///D:/baogiang-damsan/docs/requirements/P1-022-BUSINESS-CONFIGURATION-ADMINISTRATION-WORKSPACE.md#L81-L90), đối với tài nguyên `ACADEMIC_YEAR`:
   - Giao diện tuyệt đối không được sinh ID rỗng (`academicYearId: ''`) hay mã giả mạo;
   - Adapter bắt buộc phải có `ResourceEditorComponent` hợp lệ để người dùng chọn năm học; nếu thiếu, hệ thống tự động khóa (fail-closed);
   - Nghiêm cấm mượn API ngoài, nghiêm cấm phụ thuộc vào quyền `ACADEMIC_STRUCTURE_MANAGE` hay các quyền hạn không thuộc phân hệ Cấu hình nghiệp vụ.
3. **Các endpoint đọc Năm học hiện hữu đều bị cô lập quyền hạn (Foreign Capability Boundary):**
   - `GET /api/academic-years` đòi hỏi quyền `ACADEMIC_STRUCTURE_MANAGE / SCHOOL_WIDE`;
   - `GET /api/ppct-options/academic-years` đòi hỏi quyền `PPCT_MANAGE`;
   - `GET /api/teaching-assignment-options/academic-years` đòi hỏi quyền `SUBJECT_MANAGE / SCHOOL_WIDE`;
   - `GET /api/homeroom-assignments/homeroom-assignment-options/academic-years` đòi hỏi quyền `HOMEROOM_ASSIGNMENT_MANAGE / SCHOOL_WIDE`;
   - `GET /api/reporting-statements/workspace-context` đòi hỏi quyền `REPORTING_STATEMENT_SUBMIT` hoặc `REPORTING_STATEMENT_READ`.
4. **Hậu quả:**
   Người dùng quản trị trường học chỉ sở hữu quyền hạn hợp lệ duy nhất là `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` sẽ bị từ chối truy cập (403 Forbidden) khi gọi các endpoint trên. Hiện tại phân hệ `Business Configuration` chưa sở hữu bất kỳ read model nào để cung cấp danh sách tùy chọn năm học phục vụ picker.

Do đó, bắt buộc phải có một read model bổ trợ tối thiểu thuộc quyền sở hữu của phân hệ `Business Configuration`, được cấp phép thông qua quyền hạn hiện có `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE`.

---

## 2. Ranh giới Thẩm quyền Chuẩn tắc (Exact Authority Boundary)

1. **Ranh giới Phân hệ (Domain Boundary):**
   - Read model này nằm hoàn toàn dưới thẩm quyền kiểm soát của phân hệ `Business Configuration` (`apps/api/src/business-configuration/`).
   - Tuyến đường API chuẩn tắc: `GET /api/business-configuration/academic-year-options` (hoặc cấu trúc tương đương nhất quán với controller hiện hành).
2. **Quyền hạn truy cập (Authorization Boundary):**
   - Sử dụng duy nhất quyền hạn hiện hành: `@RequireCapability('BUSINESS_CONFIGURATION_MANAGE', { scope: 'SCHOOL_WIDE' })`.
   - Không sinh thêm quyền hạn mới (no new capability keys/scopes).
   - Người dùng `SYSTEM_ADMIN` thuần túy nếu không có capability này sẽ bị từ chối theo mô hình RBAC phân cấp.
3. **Tính chất Chỉ đọc và Giới hạn dữ liệu (Read-Only & Data Minimization):**
   - Chỉ trả về danh sách các năm học hợp lệ phục vụ việc chọn tài nguyên (identity & label discovery).
   - Không phơi bày cấu trúc lịch năm học chuyên sâu (semesters, weeks, interruptions, school classes, subjects, assignments).
   - Không có quyền thay đổi, tạo mới hay sửa đổi năm học (không xâm phạm quyền `ACADEMIC_STRUCTURE_MANAGE`).
   - Không làm thay đổi hay can thiệp vào các nhóm chính sách nghiệp vụ khác.

---

## 3. Hợp đồng Kỹ thuật Tương lai Tối thiểu (Minimal Future Contract)

### 3.1. Shared Contracts (`packages/contracts/src/index.ts`)
Định nghĩa kiểu dữ liệu tối thiểu phục vụ picker:

```typescript
export interface BusinessPolicyAcademicYearOption {
  id: string;   // UUID năm học
  code: string; // Mã năm học (ví dụ: "2026-2027")
  name: string; // Tên hiển thị (ví dụ: "Năm học 2026-2027")
}

export interface BusinessPolicyAcademicYearOptionListResponse {
  items: BusinessPolicyAcademicYearOption[];
  page: number;
  pageSize: number;
  total: number;
}
```

### 3.2. API Endpoint (`apps/api/src/business-configuration/`)
- **Tuyến đường:** `GET /api/business-configuration/academic-year-options`
- **Guards:** `SessionAuthGuard`, `CapabilityGuard`
- **Capability decorator:** `@RequireCapability('BUSINESS_CONFIGURATION_MANAGE', { scope: 'SCHOOL_WIDE' })`
- **Query DTO (nếu có phân trang/tìm kiếm):** `PageDto` hoặc các tham số truy vấn giới hạn bounded pagination (`page >= 1`, `1 <= pageSize <= 100`).
- **Nguồn dữ liệu:** Truy vấn bảng `AcademicYear` trong cơ sở dữ liệu hiện tại, sắp xếp theo thứ tự hiển thị chuẩn (ví dụ `code: 'desc'`).

---

## 4. Ma trận Phân quyền & Thẩm định Truy cập (Authorization Matrix)

| Chủ thể / Bộ quyền hạn | Phạm vi yêu cầu | Kết quả thẩm quyền | Ghi chú |
|---|---|---|---|
| Người dùng có `BUSINESS_CONFIGURATION_MANAGE` | `SCHOOL_WIDE` | **CHO PHÉP (200 OK)** | Nhận danh sách `BusinessPolicyAcademicYearOption[]` |
| Người dùng không có quyền hạn nào | — | **TỪ CHỐI (403 Forbidden)** | Lỗi `GRANT_NOT_FOUND` |
| Người dùng chỉ có `SYSTEM_ADMIN` | `SCHOOL_WIDE` | **TỪ CHỐI (403 Forbidden)** | Không suy diễn quyền từ vai trò hệ thống |
| Người dùng chỉ có `ACADEMIC_STRUCTURE_MANAGE` | `SCHOOL_WIDE` | **TỪ CHỐI (403 Forbidden)** | Phân định ranh giới phân hệ rõ ràng |
| Người dùng chỉ có `PPCT_MANAGE` | Bất kỳ | **TỪ CHỐI (403 Forbidden)** | Không vay mượn quyền chuyên môn PPCT |
| Người dùng chỉ có `SUBJECT_MANAGE` | Bất kỳ | **TỪ CHỐI (403 Forbidden)** | Không vay mượn quyền phân công |
| Người dùng chỉ có `HOMEROOM_ASSIGNMENT_MANAGE` | `SCHOOL_WIDE` | **TỪ CHỐI (403 Forbidden)** | Không vay mượn quyền GVCN |
| Người dùng chỉ có quyền Báo cáo (`REPORTING_*`) | Bất kỳ | **TỪ CHỐI (403 Forbidden)** | Không vay mượn quyền báo cáo |

---

## 5. Phạm vi Triển khai Cho phép (Allowed Scope cho CODEX)

Khi CODEX nhận nhiệm vụ thực thi P1-031C trên nhánh chuyên biệt:
1. Thêm interface `BusinessPolicyAcademicYearOption` và `BusinessPolicyAcademicYearOptionListResponse` vào `packages/contracts/src/index.ts`.
2. Bổ sung phương thức `academicYearOptions(...)` vào `BusinessConfigurationService`.
3. Khai báo endpoint `GET academic-year-options` vào `BusinessConfigurationController` có gắn guard và decorator thẩm quyền `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE`.
4. Bổ sung DTO truy vấn nếu cần phân trang trong `apps/api/src/business-configuration/dto.ts`.
5. Viết unit test và integration test toàn diện trong `apps/api/test/business-configuration/`.
6. Đồng bộ tài liệu quản trị (`PRE-PILOT-TASK-REGISTER.md`, `CURRENT-PROJECT-STATUS.md`, `PRE-PILOT-TRACEABILITY-MATRIX.md`) sang `IN_REVIEW`.

---

## 6. Phạm vi Bị cấm Tuyệt đối (Forbidden Scope)

Nghiêm cấm tuyệt đối các hành vi sau trong nhiệm vụ P1-031C:
1. Không sửa đổi `prisma/schema.prisma` và không tạo migration mới (`prisma/migrations/**`).
2. Không thêm mới, chỉnh sửa hay xóa bất kỳ key/scope capability nào trong danh mục phân quyền.
3. Không can thiệp vào cơ chế Auth/Session/CSRF.
4. Không thay đổi thẩm quyền hoặc endpoint của các phân hệ khác (PPCT, Teaching Assignment, Academic Structure, Homeroom, Reporting).
5. Không thay đổi ngữ nghĩa vòng đời, bộ xác thực `v1`, hay cơ chế `allowedActions` của `OPERATIONAL_START`.
6. Không triển khai mã giao diện Web (`apps/web/`), không tạo adapter UI của P1-032.
7. Không can thiệp cấu hình CI/CD, Docker, Nginx, script deploy hay máy chủ VPS production.
8. Môi trường production giữ nguyên trạng thái **PRE-OPERATIONAL**.

---

## 7. Yêu cầu Bằng chứng Kiểm thử (Required Regression Evidence)

Bộ kiểm thử của P1-031C bắt buộc phải chứng minh:
1. Gọi endpoint với đúng grant `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` -> trả về `200 OK` với danh sách năm học đúng cấu trúc contract.
2. Gọi endpoint khi không có grant -> trả về `403 Forbidden`.
3. Gọi endpoint chỉ với `SYSTEM_ADMIN` -> trả về `403 Forbidden`.
4. Gọi endpoint với các grant ngoại lai (`ACADEMIC_STRUCTURE_MANAGE`, `PPCT_MANAGE`, `SUBJECT_MANAGE`, `HOMEROOM_ASSIGNMENT_MANAGE`) -> đều trả về `403 Forbidden`.
5. Dữ liệu trả về chỉ chứa `id`, `code`, `name`; không rò rỉ thông tin mật, token, hash, cấu trúc tuần/học kỳ hay phân công.
6. Hành vi phân trang/sắp xếp có tính tất định.
7. Không có hành vi ghi (mutation) nào xảy ra trong cơ sở dữ liệu.
8. Toàn bộ các test regression hiện có của `BusinessConfiguration` (vòng đời draft, publish, replace, retire, correct, supersede scheduled authority, conflict) đều tiếp tục `PASS`.

---

## 8. Tiền đề Phụ thuộc (Dependencies)

- `P1-021` (`CLOSED`): Nền tảng Business Configuration persistence và control plane service.
- `P1-031` (`CLOSED`): Hiện thực hóa backend `OPERATIONAL_START` xác lập tài nguyên bắt buộc `ACADEMIC_YEAR`.
- `P1-031A` (`CLOSED`): Hoàn thiện tính liên tục của thẩm quyền bắt đầu vận hành và supersession.

Tất cả các tiền đề đều đã `CLOSED`, do đó `P1-031C` đủ điều kiện để ở trạng thái **`READY`**.

---

## 9. Ma trận Truy vết (Traceability Rows)

- **`T21` (Business policy / configuration control plane):** Read model này là một phần bổ trợ trực tiếp của control plane cấu hình nghiệp vụ, giúp khép kín khả năng cấu hình các chính sách có phạm vi `ACADEMIC_YEAR`.
- **`T28` (Operational start / delayed go-live policy):** Điểm tựa trực tiếp cho phép người dùng chọn năm học khi kích hoạt chính sách bắt đầu vận hành hoãn lại.

---

## 10. Giao thức Đóng Nhiệm vụ (Closure Protocol)

1. Triển khai trên nhánh riêng `feat/business-configuration-academic-year-options-031c` xuất phát từ canonical `origin/main`.
2. Kiểm tra static code: `npm run test:workflow:contract`, lint, typecheck, unit test, integration test.
3. Đánh giá độc lập trên GitHub (Independent GitHub Review: `PASS`).
4. Exact-head PR CI: `SUCCESS`.
5. Merge vào `main`.
6. Authoritative post-merge main CI: `SUCCESS`.
7. Đóng hành chính thông qua microtask không đệ quy `SYNC-P1-031C`, cập nhật trạng thái `P1-031C = CLOSED` và mở khóa `P1-032 = READY`.

---

## 11. Tác động tới P1-032

Nhiệm vụ `P1-032` (Operational-start admin UI integration) được cập nhật:
- Thêm `P1-031C` vào danh sách tiền đề: `P1-022`, `P1-031`, `P1-031A`, `P1-031C`.
- Chuyển trạng thái từ `READY` về lại `PLANNED`.
- Đây là sự hiệu chỉnh phụ thuộc tất yếu được phát hiện qua tiền khảo sát preflight khách quan, không phải là sự thoái lui hay suy thoái của mã nguồn đã hoàn thành.
- `P1-032` tuyệt đối không được bắt đầu nhánh làm việc cho đến khi `P1-031C` hoàn tất đóng chuẩn tắc (`CLOSED`).
