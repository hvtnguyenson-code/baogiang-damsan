# P1-031C — Operational-Start Academic-Year Options Read-Model Enablement

## Status

**CLOSED — implemented and closed by administrative closure `SYNC-P1-031C` following PR #140 merge (`1403906282c5ef63d17d1053c72e5ed47b4fa080`) and authoritative post-merge CI #457 SUCCESS.**

- **Mã nhiệm vụ (Task ID):** `P1-031C`
- **Tên chuẩn tắc (Canonical Name):** Operational-start Academic-Year options read-model enablement
- **Trạng thái hiện tại (Current Status):** `CLOSED` (Trạng thái tại thời điểm đăng ký: `READY`, trạng thái khi thẩm định độc lập: `IN_REVIEW`)
- **Tiền đề phụ thuộc (Dependencies):**
  - `P1-021` — Business Configuration persistence/control plane (`CLOSED`)
  - `P1-031` — Operational-start policy implementation (`CLOSED`)
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
- **Phân công công cụ thực thi (Tool Assignment):** Giai đoạn đăng ký nhiệm vụ do ANTIGRAVITY IDE thực hiện dưới dạng tài liệu/quản trị thuần túy. Giai đoạn triển khai mã nguồn sau đó được ANTIGRAVITY IDE thực hiện theo sự phân công và cấp quyền phạm vi giới hạn tường minh (explicit bounded scope grant) từ prompt thực thi P1-031C. Việc cấp quyền này không làm thay đổi AGENTS.md; tính khả dụng của công cụ không làm thay đổi ngữ nghĩa sản phẩm hay hợp đồng API; các nhiệm vụ trong tương lai tiếp tục tuân thủ phân công công cụ theo quy định chuẩn tắc của AGENTS.md tại thời điểm thực hiện.
- **Tác động tới nhiệm vụ kế tiếp:** `P1-032` (Operational-start admin UI integration) được mở khóa và chuyển sang trạng thái `READY` sau khi `P1-031C` hoàn tất `CLOSED` qua `SYNC-P1-031C`. `P1-032` có đầy đủ các tiền đề phụ thuộc đã `CLOSED` và sẵn sàng khởi động trên nhánh chuyên biệt từ canonical main.

---

## 1. Khoảng trống được phát hiện qua Tiền khảo sát P1-032 (Audited Gap)

Tiền khảo sát độc lập chuẩn tắc (Pre-implementation Preflight Audit) của nhiệm vụ `P1-032` đã phát hiện một khoảng trống kỹ thuật tại điểm nối mã nguồn (code seam):

1. **Yêu cầu của nhóm chính sách `OPERATIONAL_START`:**
   Theo `ADR-049` và `P1-031`, chính sách bắt đầu vận hành có `resourceKind = 'ACADEMIC_YEAR'`. Để tạo bản nháp (`createDraft`) hoặc tra cứu hiệu lực (`resolve`), giao diện quản trị bắt buộc phải gửi định danh `academicYearId` hợp lệ (UUID).
2. **Quy định bất biến của P1-022:**
   Theo `docs/requirements/P1-022-BUSINESS-CONFIGURATION-ADMINISTRATION-WORKSPACE.md` §4, đối với tài nguyên `ACADEMIC_YEAR`:
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
   - Tuyến đường API chuẩn tắc (Canonical route): `GET /api/business-configuration/academic-year-options`. Khóa cứng tuyến đường này, không sử dụng tuyến đường tương đương hay thay thế.
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

## 3. Hợp đồng Kỹ thuật Chuẩn tắc Đã hiện thực (Implemented Canonical Technical Contract)

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
- **Tuyến đường chuẩn tắc (Canonical route):** `GET /api/business-configuration/academic-year-options`
- **Guards:** `SessionAuthGuard`, `CapabilityGuard`
- **Capability decorator:** `@RequireCapability('BUSINESS_CONFIGURATION_MANAGE', { scope: 'SCHOOL_WIDE' })`
- **Query DTO:** Sử dụng DTO phân trang riêng thuộc quyền sở hữu của Business Configuration, ví dụ `ListBusinessPolicyAcademicYearOptionsDto` (khai báo tại `apps/api/src/business-configuration/dto.ts`). **Tuyệt đối KHÔNG import `PageDto` của phân hệ Academic Structure vào Business Configuration.**
  - `page`: optional, integer, default 1, minimum 1
  - `pageSize`: optional, integer, default 20, minimum 1, maximum 100
- **Tìm kiếm (Search query):** Không yêu cầu tham số tìm kiếm (search query) cho nhiệm vụ này.
- **Sắp xếp tất định chuẩn tắc (Canonical deterministic ordering):**
  - Sắp xếp theo: `code ASC`, sau đó `id ASC`.
- **Dữ liệu phơi bày và ranh giới an toàn (Data Minimization):**
  - Chỉ phơi bày chính xác các trường nhận diện: `id`, `code`, `name`.
  - **Tuyệt đối KHÔNG phơi bày:** calendar versions, semesters, weeks, classes, subjects, assignments, status derived from another domain.
- **Nguồn dữ liệu:** Truy vấn bảng `AcademicYear` từ cơ sở dữ liệu hiện hữu thông qua Prisma service.

---

## 4. Ma trận Phân quyền & Thẩm định Truy cập (Authorization Matrix)

| Chủ thể / Bộ quyền hạn | Phạm vi yêu cầu | Kết quả thẩm quyền (HTTP) | Hành vi / Audit |
|---|---|---|---|
| Người dùng có `BUSINESS_CONFIGURATION_MANAGE` | `SCHOOL_WIDE` | **CHO PHÉP (200 OK)** | Nhận danh sách `BusinessPolicyAcademicYearOptionListResponse` |
| Người dùng không có quyền hạn nào | — | **TỪ CHỐI (403 Forbidden)** | Lỗi 403 sanitized từ CapabilityGuard (audit metadata: `reasonCode = GRANT_NOT_FOUND`) |
| Người dùng chỉ có `SYSTEM_ADMIN` | `SCHOOL_WIDE` | **TỪ CHỐI (403 Forbidden)** | Lỗi 403 sanitized từ CapabilityGuard (không suy diễn quyền từ vai trò hệ thống) |
| Người dùng chỉ có `ACADEMIC_STRUCTURE_MANAGE` | `SCHOOL_WIDE` | **TỪ CHỐI (403 Forbidden)** | Lỗi 403 sanitized từ CapabilityGuard (phân định ranh giới phân hệ) |
| Người dùng chỉ có `PPCT_MANAGE` | Bất kỳ | **TỪ CHỐI (403 Forbidden)** | Lỗi 403 sanitized từ CapabilityGuard (không mượn quyền chuyên môn PPCT) |
| Người dùng chỉ có `SUBJECT_MANAGE` | Bất kỳ | **TỪ CHỐI (403 Forbidden)** | Lỗi 403 sanitized từ CapabilityGuard (không mượn quyền phân công) |
| Người dùng chỉ có `HOMEROOM_ASSIGNMENT_MANAGE` | `SCHOOL_WIDE` | **TỪ CHỐI (403 Forbidden)** | Lỗi 403 sanitized từ CapabilityGuard (không mượn quyền GVCN) |
| Người dùng chỉ có quyền Báo cáo (`REPORTING_*`) | Bất kỳ | **TỪ CHỐI (403 Forbidden)** | Lỗi 403 sanitized từ CapabilityGuard (không mượn quyền báo cáo) |

> **Ngữ nghĩa từ chối công khai vs Audit nội bộ (HTTP Denial vs Audit Semantics):**
> Hợp đồng phản hồi HTTP khi bị từ chối là `403 Forbidden` kèm thông báo lỗi đã được làm sạch (sanitized) từ `CapabilityGuard`. Tuyệt đối không phơi bày chuỗi hay mã nội bộ `GRANT_NOT_FOUND` ra HTTP response body của client. Các ca kiểm thử tích hợp kiểm tra: (1) Mã HTTP trả về client là 403; (2) Bản ghi audit metadata nội bộ ghi nhận `reasonCode = GRANT_NOT_FOUND` tương ứng. Nguyên tắc mặc định từ chối (default-deny) được bảo toàn.

---

## 5. Phạm vi Triển khai Cho phép (Allowed Implementation Scope)

Khi nhiệm vụ thực thi P1-031C được khởi động trên nhánh chuyên biệt:
1. Thêm interface `BusinessPolicyAcademicYearOption` và `BusinessPolicyAcademicYearOptionListResponse` vào `packages/contracts/src/index.ts`.
2. Khai báo DTO truy vấn phân trang `ListBusinessPolicyAcademicYearOptionsDto` thuộc `apps/api/src/business-configuration/dto.ts` (không phụ thuộc DTO của phân hệ khác).
3. Bổ sung phương thức `academicYearOptions(...)` vào `BusinessConfigurationService` với sắp xếp tất định `code ASC`, sau đó `id ASC`.
4. Khai báo endpoint chuẩn tắc `GET academic-year-options` trong `BusinessConfigurationController` có gắn guard và decorator thẩm quyền `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE`.
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
1. Gọi endpoint với đúng grant `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` -> trả về `200 OK` với danh sách năm học đúng cấu trúc contract `BusinessPolicyAcademicYearOptionListResponse`.
2. Gọi endpoint khi không có grant -> trả về `403 Forbidden` (audit metadata ghi nhận `reasonCode = GRANT_NOT_FOUND`).
3. Gọi endpoint chỉ với `SYSTEM_ADMIN` -> trả về `403 Forbidden`.
4. Gọi endpoint với các grant ngoại lai (`ACADEMIC_STRUCTURE_MANAGE`, `PPCT_MANAGE`, `SUBJECT_MANAGE`, `HOMEROOM_ASSIGNMENT_MANAGE`) -> đều trả về `403 Forbidden`.
5. Dữ liệu trả về chỉ chứa `id`, `code`, `name`; không rò rỉ thông tin mật, token, hash, cấu trúc tuần/học kỳ, môn học hay phân công.
6. Hành vi phân trang/sắp xếp có tính tất định (`code ASC`, `id ASC`).
7. Không có hành vi ghi (mutation) nào xảy ra trong cơ sở dữ liệu.
8. Toàn bộ các test regression hiện có của `BusinessConfiguration` (vòng đời draft, publish, replace, retire, correct, supersede scheduled authority, conflict) đều tiếp tục `PASS`.

---

## 8. Tiền đề Phụ thuộc (Dependencies)

- `P1-021` (`CLOSED`): Nền tảng Business Configuration persistence và control plane service.
- `P1-031` (`CLOSED`): Hiện thực hóa backend `OPERATIONAL_START` xác lập tài nguyên bắt buộc `ACADEMIC_YEAR`.

Nhiệm vụ này là một read model hỗ trợ độc lập, không phụ thuộc vào vòng đời hay tính liên tục của thẩm quyền lịch hẹn (`SUPERSEDED_BEFORE_EFFECTIVE`, `allowedActions`) thuộc P1-031A. Tất cả các tiền đề phụ thuộc trực tiếp (`P1-021`, `P1-031`) đều đã `CLOSED`, do đó `P1-031C` đủ điều kiện đăng ký ở trạng thái **`READY`**.

---

## 9. Ma trận Truy vết (Traceability Rows)

- **`T21` (Business policy / configuration control plane):** Read model này là một phần bổ trợ trực tiếp của control plane cấu hình nghiệp vụ, giúp khép kín khả năng cấu hình các chính sách có phạm vi `ACADEMIC_YEAR`.
- **`T28` (Operational start / delayed go-live policy):** Điểm tựa trực tiếp cho phép người dùng chọn năm học khi kích hoạt chính sách bắt đầu vận hành hoãn lại.

*Lưu ý về `T30`:* Nhiệm vụ `P1-031C` không thay đổi hay can thiệp vào ngữ nghĩa tính nợ / loại trừ nợ tự động thời kỳ tiền vận hành của `T30`. Do đó `T30` không phải là dòng truy vết trực tiếp của `P1-031C`.

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
- Chuyển trạng thái từ `PLANNED` sang `READY` sau khi `P1-031C` hoàn tất đóng chuẩn tắc (`CLOSED`) qua `SYNC-P1-031C`.
- Tất cả các tiền đề phụ thuộc của `P1-032` hiện đã `CLOSED`. `P1-032` chứa 0 commit triển khai và đủ điều kiện khởi động sau khi PR đóng `SYNC-P1-031C` được merge vào `main`.

---

## 12. Bằng chứng Triển khai và Kiểm thử (Implementation & Verification Evidence)

- **Nhánh thực thi (Dedicated Task Branch):** `feat/business-configuration-academic-year-options-031c`
- **Canonical origin/main cơ sở:** `2df682f2eb76f813418560673bbdabe4c31e9154`
- **Commit triển khai runtime & test:** `01c6f28e1cbdeb3cf4a29f9c3df929111546df9a` (`feat(policy): add academic-year options read model`)
- **Các tệp thay đổi trong commit triển khai:**
  - `packages/contracts/src/index.ts`: Bổ sung `BusinessPolicyAcademicYearOption` và `BusinessPolicyAcademicYearOptionListResponse`.
  - `apps/api/src/business-configuration/dto.ts`: Bổ sung DTO riêng `ListBusinessPolicyAcademicYearOptionsDto` (`page >= 1`, `1 <= pageSize <= 100`).
  - `apps/api/src/business-configuration/business-configuration.service.ts`: Bổ sung phương thức chỉ đọc `academicYearOptions(query)` với giao dịch Prisma song song (`findMany` + `count`), sắp xếp tất định `code ASC, id ASC`, chỉ lấy `id`, `code`, `name`.
  - `apps/api/src/business-configuration/business-configuration.controller.ts`: Bổ sung endpoint `GET /api/business-configuration/academic-year-options` được bảo vệ bởi `SessionAuthGuard` và `CapabilityGuard` với decorator quyền hạn hiện hữu `@RequireCapability('BUSINESS_CONFIGURATION_MANAGE', { scope: 'SCHOOL_WIDE' })`.
  - `apps/api/src/business-configuration/business-configuration.service.spec.ts`: Bổ sung 5 ca unit test tập trung mới (5 new focused unit tests) kiểm tra pagination (skip/take), select tối thiểu, sắp xếp tất định, cấu trúc phản hồi và xác nhận không kích hoạt mutation/audit API (72/72 unit test PASS).
  - `apps/api/test/business-configuration/business-configuration.integration.spec.ts`: Mở rộng seed capability và bổ sung ma trận kiểm thử tích hợp 7 ca kiểm tra phân quyền (cho phép 200 đối với `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE`, từ chối 403 với no grant, `SYSTEM_ADMIN`, `ACADEMIC_STRUCTURE_MANAGE`, `PPCT_MANAGE`, `SUBJECT_MANAGE`, `HOMEROOM_ASSIGNMENT_MANAGE`, kiểm tra sanitization của body 403 và audit metadata nội bộ `GRANT_NOT_FOUND`, kiểm tra phân trang và xác nhận zero mutation).
- **Kết quả xác thực cục bộ (Local Verification):**
  - Contracts lint & typecheck: `PASS`
  - API typecheck (`tsc --noEmit`): `PASS`
  - API lint (`npm run lint`): `PASS`
  - API build (`npx nest build`): `PASS`
  - Unit tests (`business-configuration.service.spec.ts`): `PASS` (72 tests passed)
  - Workflow contract (`npm run test:workflow:contract`): `PASS`
  - Git diff check: `PASS`
  - Tích hợp cục bộ: Bị chặn an toàn do môi trường cục bộ chưa có cơ sở dữ liệu `TEST_DATABASE_URL` được chứng nhận cô lập riêng (`Refusing destructive integration tests because TEST_DATABASE_URL has not been explicitly certified as an isolated test database`); CI chuẩn tắc trên GitHub đã thực thi xác thực tích hợp tự động qua PR CI #456 và post-merge CI #457.

---

## 13. Bằng chứng Đóng nhiệm vụ Chuẩn tắc (Authoritative Closure Evidence)

- **Nhánh thực thi (Dedicated Task Branch):** `feat/business-configuration-academic-year-options-031c`
- **Canonical origin/main cơ sở:** `2df682f2eb76f813418560673bbdabe4c31e9154`
- **Commit triển khai runtime & test:** `01c6f28e1cbdeb3cf4a29f9c3df929111546df9a`
- **Head hoàn tất sau thẩm định độc lập:** `ee478c5a7e6976a554c738482ba580b23784a2c8`
- **Đánh giá độc lập trên GitHub (Independent GitHub Review):** `PASS` sau một vòng hiệu chỉnh tài liệu giới hạn (one bounded docs-only forward correction round).
- **Parent Pull Request:** PR #140 (`feat(policy): add AcademicYear options read model`)
- **Exact-head PR CI:** CI #456 (run id: `35209248425`), kết quả: `SUCCESS`
- **Merge commit vào main:** `1403906282c5ef63d17d1053c72e5ed47b4fa080`
- **Authoritative post-merge main CI:** CI #457 (run id: `35229426600`), attempt 1, kết quả: `SUCCESS`
- **Bằng chứng post-merge CI #457 bao gồm:**
  - Production dependency security audit gate: PASS
  - Prisma validate & generate: PASS
  - Schema/static verification: PASS
  - Workflow contract (`npm run test:workflow:contract`): PASS
  - Contracts, config, API, Web lint: PASS
  - Contracts, config, API, Web typecheck: PASS
  - API unit tests: PASS
  - Web unit tests: PASS
  - Capability synchronization integration: PASS
  - API integration tests: PASS
  - Contracts, config, API, Web builds: PASS
  - Playwright test runner bootstrap: PASS
  - Playwright smoke: PASS
  - Windows deployment contract verification: PASS
- **Nhiệm vụ sửa sai / tái nhập (Correction / Re-entry Tasks):** KHÔNG CÓ (NONE).
- **Tác động môi trường production:** Không có di chuyển dữ liệu hay thay đổi schema/migration/auth/capability/UI; môi trường production giữ nguyên trạng thái **PRE-OPERATIONAL**.
- **Đóng nhiệm vụ:** Đóng chính thức thông qua microtask quản trị `SYNC-P1-031C`.
- **Mở khóa hạ nguồn:** Mở khóa nhiệm vụ `P1-032` (Operational-start admin UI integration) sang trạng thái **`READY`**.
