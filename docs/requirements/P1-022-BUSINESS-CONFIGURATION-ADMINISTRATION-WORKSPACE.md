# P1-022 — Business Configuration Administration Workspace

## 1. Metadata & Trạng thái nhiệm vụ
- **Mã nhiệm vụ:** `P1-022`
- **Tên nhiệm vụ:** Business Configuration administration workspace
- **Nhánh làm việc (Branch):** `feat/business-configuration-administration-workspace-022`
- **Canonical Main Base SHA:** `d9e546f3ee3f29dba139eeed400ea888eaf5e902`
- **Trạng thái (Task Status):** `CLOSED by SYNC-P1-022`
- **Bằng chứng đóng nhiệm vụ (Closure Evidence):**
  - Canonical Main Base SHA: `d9e546f3ee3f29dba139eeed400ea888eaf5e902`
  - Final Reviewed Feature HEAD: `cf1ec8c394edcdd0c4a0e416c6a35708fa6f331d`
  - Đánh giá độc lập GitHub (Independent Review): `PASS`
  - Pull Request: `#109 — feat(config): add business configuration administration workspace`
  - Exact-head PR CI: `#371` (Run ID: `34044755481`) — `SUCCESS`
  - Merge commit vào main: `fd3248e57124c948998bd78ec69d1341da2a08c1`
  - Authoritative Post-merge main CI: `#372` (Run ID: `34045209071`) — `SUCCESS`
- **Tiền đề phụ thuộc (Dependencies):**
  - `P1-020`: `CLOSED` — Kiến trúc Business Configuration Control Plane (ADR-046).
  - `P1-021`: `CLOSED` — Business Configuration Database Schema & Control Plane Service.
  - Traceability rows liên quan: `T21` (Business Configuration Control Plane), `T22` (Business Configuration Typed Policy Administration UI).
- **Quyết định kiến trúc chi phối:** `docs/decisions/ADR-046-BUSINESS-CONFIGURATION-CONTROL-PLANE.md`.

---

## 2. Mục tiêu & Phạm vi (Scope & Boundaries)
- **Mục tiêu:** Cung cấp giao diện quản trị web có kiểu tường minh (typed UI workspace) cho cấu hình nghiệp vụ của nhà trường trên nền tảng control plane đã hoàn thiện ở P1-021.
- **Tuyến đường giao diện (Route):** `/quan-tri/chinh-sach-nghiep-vu`.
- **Yêu cầu quyền hạn (Capability Authority):**
  - Bắt buộc kiểm tra `BUSINESS_CONFIGURATION_MANAGE` với phạm vi `SCHOOL_WIDE`.
  - Không hiển thị trên menu điều hướng và không cho phép truy cập nếu người dùng không sở hữu capability này (kể cả khi có vai trò `SYSTEM_ADMIN` mà thiếu capability cụ thể theo mô hình RBAC phân cấp).
- **Phạm vi cho phép (Allowed Scope):**
  - Khai báo kiểu giao diện và cơ chế adapter (`BusinessPolicyUiAdapter`) trong `apps/web`.
  - Xây dựng trang quản trị cấu hình nghiệp vụ (`BusinessConfigurationPage.tsx`) và navigation integration (`App.tsx`).
  - API client kết nối tới các endpoint control plane P1-021 (`/api/business-configuration/...`).
  - Cơ chế validate ngày dương lịch chặt chẽ (strict civil-date validation) và che giấu lỗi hệ thống nhạy cảm (sanitized error translation).
  - Cung cấp test fixtures và integration tests trong `apps/web`.
- **Phạm vi nghiêm cấm (Forbidden Scope):**
  - Không thay đổi schema, migration, seed, hay API backend (`apps/api/`, `prisma/`).
  - Tuyệt đối không nhúng JSON thô (raw JSON textarea/editor) hoặc quay lại mô hình `SystemSetting` phi cấu trúc.
  - Không mở rộng backend production registry (`PRODUCTION_BUSINESS_POLICY_FAMILIES = []`).
  - Không tạo cấu hình nghiệp vụ giả mạo trong production UI registry (`PRODUCTION_BUSINESS_POLICY_UI_ADAPTERS = []`).
  - Không mở PR, merge hoặc deploy.

---

## 3. Kiến trúc Typed Adapter phiên bản hóa (Version-Aware Typed Adapter Architecture)

Sau đợt hiệu chỉnh Forward Correction sau đợt audit từ xa độc lập, kiến trúc UI Adapter được chuẩn hóa nhằm hỗ trợ đầy đủ các validator version kế thừa (historical retention) của P1-021:

### 3.1. Định danh Adapter (Adapter Identity)
Thay vì chỉ định danh qua `familyKey`, mỗi adapter được định danh đầy đủ theo bộ ba:
1. `familyKey`: Khóa nhóm chính sách.
2. `validatorVersion`: Phiên bản hợp đồng payload chính xác (SemVer, ví dụ `'1.0.0'`).
3. `resourceKind`: Loại tài nguyên áp dụng (`SCHOOL_WIDE`, `ACADEMIC_YEAR`,...).

```ts
export interface BusinessPolicyUiAdapter<T extends Record<string, unknown> = Record<string, unknown>> {
  readonly familyKey: string;
  readonly validatorVersion: string;
  readonly displayName: string;
  readonly description: string;
  readonly resourceKind: BusinessConfigurationResource['kind'];
  readonly initialPayload: () => T;
  readonly validatePayload: (value: unknown) => { valid: true; payload: T } | { valid: false; error: string };
  readonly EditorComponent: ComponentType<BusinessPolicyEditorProps<Record<string, unknown>>>;
  readonly SummaryComponent: ComponentType<BusinessPolicySummaryProps<Record<string, unknown>>>;
  readonly ResourceEditorComponent?: ComponentType<BusinessPolicyResourceEditorProps>;
}
```

### 3.2. Cơ chế Tra cứu & Khớp nối Adapter (Resolution & Matching Rules)
- **Tạo bản thảo (Create draft):** Bắt buộc khớp chính xác bộ ba: `family.key` + `family.currentValidatorVersion` + `family.resourceKind`. Thao tác chỉ cho phép khi `family.publicationEnabled === true`. Nếu thiếu adapter hoặc thiếu `ResourceEditorComponent` (khi resourceKind cần), chức năng bị vô hiệu hóa kèm thông báo rõ ràng: `"Giao diện quản trị chưa hỗ trợ phiên bản hợp đồng hiện tại của nhóm chính sách."`.
- **Thay thế (Replace) & Hiệu chỉnh (Correct):** Backend tạo phiên bản mới theo `currentValidatorVersion` của nhóm chính sách, do đó bắt buộc sử dụng adapter của phiên bản hiện tại và `publicationEnabled === true`.
  - *An toàn dữ liệu khi Correct:* Không tự động ép kiểu payload từ v1 sang v2. Nếu `source.validatorVersion === family.currentValidatorVersion`, payload nguồn được khởi tạo vào editor. Ngược lại, editor được khởi tạo sạch từ `currentAdapter.initialPayload()`.
- **Chỉnh sửa & Phát hành bản thảo cũ (Edit / Publish old draft):** P1-021 giữ lại validator version cũ của draft; do đó giao diện tra cứu adapter theo đúng `draft.validatorVersion` + `draft.resource.kind`. Thao tác sửa và phát hành chỉ được phép khi `family.publicationEnabled === true` và có adapter khớp chính xác phiên bản/tài nguyên lưu trữ. Khi `publicationEnabled === false`, giao diện ẩn hoàn toàn các nút thao tác (Edit/Publish) và hiển thị thông báo giới hạn: `"Nhóm chính sách hiện đang tạm dừng công bố và không cho phép thao tác quản trị."`.
- **Tóm tắt lịch sử (Historical Summary):** Sử dụng adapter khớp chính xác `stream.familyKey` + `version.validatorVersion` + `stream.resourceKind`. Nếu không có adapter hoặc sai loại tài nguyên (resourceKind mismatch), hệ thống fail closed: không hiển thị tóm tắt kiểu hóa và chỉ hiển thị an toàn các trường metadata bằng chứng (không hiển thị raw JSON).
- **Tra cứu ngày hiệu lực (Resolution):** Danh sách chọn nhóm chính sách chỉ liệt kê các family có adapter đọc hợp lệ (`isEligibleForRead`), không phụ thuộc `publicationEnabled`. Kết quả tra cứu (`BusinessPolicyResolution`) hiển thị tóm tắt qua adapter khớp `resolution.family` + `resolution.validatorVersion` + `resolution.resource.kind`. Nếu thiếu adapter, chỉ hiển thị metadata bằng chứng.

---

## 4. Kiến trúc Bộ biên tập Tài nguyên (Resource Editor Architecture)
- Với loại tài nguyên `SCHOOL_WIDE`: Tài nguyên cố định là `{ kind: 'SCHOOL_WIDE' }`, không yêu cầu trường định danh.
- Với loại tài nguyên `ACADEMIC_YEAR`:
  - Tuyệt đối không sinh mã rỗng (ví dụ `academicYearId: ''`) hay mã ngẫu nhiên giả mạo.
  - UI có thể tạm thời nắm giữ trạng thái tài nguyên chưa được chọn trong nội bộ (internal unselected state), nhưng tuyệt đối không bao giờ gửi một `academicYearId` rỗng hay giả mạo lên máy chủ.
  - Adapter định nghĩa component `ResourceEditorComponent` để quản lý việc lựa chọn tài nguyên hợp lệ.
  - Nếu adapter thiếu `ResourceEditorComponent`, thao tác tạo draft và tra cứu hiệu lực lập tức khóa lại (fail-closed).
  - Không mượn API ngoài, không phụ thuộc quyền `ACADEMIC_STRUCTURE_MANAGE` hay các API không thuộc phạm vi nhiệm vụ.

---

## 5. Xử lý Lỗi & Thẩm định Dữ liệu (Validation & Error Handling)
- **Thẩm định ngày dương lịch (Strict Civil-Date Validation):**
  - Không dùng regex đơn thuần (`^\d{4}-\d{2}-\d{2}$`).
  - Kiểm tra lịch thực tế bằng thuật toán số học dương lịch thuần túy (xử lý năm nhuận, số ngày thực tế từng tháng).
  - Từ chối nghiêm ngặt các ngày không tồn tại: `2026-02-30`, `2025-02-29`, `2026-04-31`, tháng `00` hoặc `13`.
  - Không phụ thuộc múi giờ cục bộ của trình duyệt (`new Date()` comparison).
- **Bảo mật thông báo lỗi (Sanitized Unknown Errors):**
  - `translatePolicyError()` chỉ ánh xạ các mã lỗi chính sách nghiệp vụ đã biết.
  - Các lỗi lạ, lỗi máy chủ, lỗi cơ sở dữ liệu (SQLSTATE, Prisma constraint, stack trace) được che giấu hoàn toàn và thay thế bằng thông báo an toàn:
    `"Yêu cầu không thực hiện được. Vui lòng tải lại dữ liệu và thử lại."`
- **Trạng thái truy vấn dữ liệu (Query Failure States):**
  - Khi danh sách stream gặp lỗi (`streamsQuery.isError`), hiển thị thông báo lỗi rõ ràng kèm nút thử lại (`Tải lại danh sách`), không đánh đồng với trạng thái rỗng.
  - Hiển thị loading và error có nút thử lại độc lập cho khung chi tiết stream (`selectedStreamQuery`).

---

## 6. Bằng chứng kiểm thử & Xác minh (Verification & Evidence)

### 6.1. Bằng chứng kiểm thử cục bộ (Local Evidence)
- **Kiểm thử mục tiêu P1-022:** `46/46 tests PASS` (`business-configuration-workspace.test.tsx`), bao gồm:
  - Khai báo test adapter đa phiên bản (`v1.0.0` và `v2.0.0`) cùng test-only `ACADEMIC_YEAR` adapter;
  - Thử nghiệm hiển thị ngày ISO Date từ Prisma (`2026-09-05T00:00:00.000Z`) chứng minh không bị lệch múi giờ;
  - Kiểm thử đầy đủ các kịch bản hồi quy phiên bản hóa (version-aware regression tests);
  - Kiểm thử tra cứu định danh tam phân nghiêm ngặt (triple identity: `familyKey` + `validatorVersion` + `resourceKind`);
  - Kiểm thử ẩn nút Edit/Publish cho bản nháp khi family bị tạm dừng công bố (`publicationEnabled === false`);
  - Kiểm thử loại trừ các nhóm chính sách không có adapter hoặc sai resourceKind khỏi danh sách tra cứu ngày.
- **Kiểm thử quyền hạn & điều hướng:** `34/34 tests PASS` (`capability-navigation.test.tsx`).
- **Toàn bộ test suite Web:** `17/17 test files PASS`, `236/236 tests PASS` (`npm run test:unit -w apps/web`).
- **Chất lượng mã nguồn & Build:**
  - `npm run lint -w packages/contracts`: `PASS` (0 cảnh báo, 0 lỗi).
  - `npm run typecheck -w packages/contracts`: `PASS`.
  - `npm run build -w packages/contracts`: `PASS`.
  - `npm run lint -w apps/web`: `PASS` (0 warnings, 0 errors).
  - `npm run typecheck -w apps/web`: `PASS`.
  - `npm run build -w apps/web`: `PASS` (Vite production bundle build thành công).
  - `git diff --check`: `PASS`.

### 6.2. Bằng chứng CI GitHub trên exact-head (PR #109 CI Evidence)
- **Workflow Run:** CI `#371` (Run ID: `34044755481`) trên commit exact head `cf1ec8c394edcdd0c4a0e416c6a35708fa6f331d`.
- **Kết quả:** `SUCCESS` trên toàn bộ các job:
  - Schema / static gates;
  - Lint & typecheck;
  - API unit tests;
  - Web unit tests;
  - PostgreSQL API integration tests;
  - Production build;
  - Playwright smoke tests;
  - Windows deployment contract verification.

### 6.3. Bằng chứng Post-merge main CI (Authoritative Merge Evidence)
- **Workflow Run:** CI `#372` (Run ID: `34045209071`) trên nhánh `main` tại SHA `fd3248e57124c948998bd78ec69d1341da2a08c1`.
- **Kết quả:** `SUCCESS`.
- **Trạng thái môi trường Production:**
  - Production backend family registry và production UI adapter registry tiếp tục giữ trạng thái rỗng (`PRODUCTION_BUSINESS_POLICY_FAMILIES = []`, `PRODUCTION_BUSINESS_POLICY_UI_ADAPTERS = []`).
  - Không có bất kỳ lệnh deploy nào được kích hoạt.
  - Không có migration hay đột biến dữ liệu production nào phát sinh từ P1-022.
