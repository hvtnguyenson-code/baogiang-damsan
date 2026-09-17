# P1-032 — Operational-start Admin UI Integration

- Task ID: `P1-032`
- Branch: `feat/operational-start-admin-ui-integration-032`
- Canonical Start Base: `95d88867e85e7177ce7ae12adc4ec942f1567656` (PR #141 merge commit closing `SYNC-P1-031C`; post-merge CI #459 SUCCESS)
- Dependencies: `P1-022`, `P1-031`, `P1-031A`, `P1-031C` (all `CLOSED`)
- Traceability: `T28`, `T30`
- Controlling Authorities: `ADR-046` (Business Configuration Control Plane), `ADR-049` (Delayed Go-Live Operational-Start Architecture)
- Status: `IN_REVIEW`

---

## 1. Context and Objective

Following the backend closure of `OPERATIONAL_START` policy authority (`P1-031`), scheduled authority supersession architecture and runtime (`P1-031B`, `P1-031A`), and the AcademicYear options read seam (`P1-031C`), `P1-032` delivers the production administration Web UI integration for operational start authority within the Business Configuration administration workspace (`/quan-tri/chinh-sach-nghiep-vu`).

The UI integration enables school administrators with `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` authority to safely inspect, create, schedule-supersede, prospective-replace, and correct operational start policies without raw JSON or generic key-value editors, strictly adhering to server-owned lifecycle rules and project design aesthetics.

---

## 2. Controlling Scope and Guardrails

### 2.1 Explicit Allowed Scope
- `apps/web/**`
  - Implementation and registration of the `OPERATIONAL_START / v1 / ACADEMIC_YEAR` production UI adapter in `apps/web/src/lib/business-policy-ui-registry.ts`.
  - Extension of `apps/web/src/lib/business-configuration-api.ts` with `getAcademicYearOptions` and `supersedeScheduledAuthority`, plus factual Vietnamese error translations.
  - Integration of server-owned `allowedActions` authority, dedicated `SUPERSEDE_SCHEDULED_AUTHORITY` workflow, open-ended create restrictions (no `effectiveUntil`), read-only effectivity on correction, and retained `SUPERSEDED_BEFORE_EFFECTIVE` presentation in `apps/web/src/pages/BusinessConfigurationPage.tsx`.
- Targeted Web unit tests (`apps/web/src/__tests__/business-configuration-workspace.test.tsx`).
- Governance and requirement documentation synchronization (`P1-032`).

### 2.2 Strictly Forbidden Scope
- No changes to `apps/api/**`.
- No changes to `packages/contracts/**` (read-only authority).
- No changes to `prisma/**`, schema, or database migrations.
- No changes to authentication, session, or authorization logic.
- No changes to capability catalogue or scope semantics.
- No changes to backend business rules, audit infrastructure, or CI/CD workflows.
- No deployment, VPS mutation, or production database mutation.
- No broad Web refactoring or introduction of new UI/component libraries.
- No modification of `AGENTS.md`.

---

## 3. Core Architectural and Runtime Invariants

1. **Exact Adapter Triple Identity**:
   - `familyKey`: `OPERATIONAL_START`
   - `validatorVersion`: `v1`
   - `resourceKind`: `ACADEMIC_YEAR`
   - Vietnamese Product Copy:
     - Display name: "Bắt đầu vận hành"
     - Description: Concise factual Vietnamese copy explaining that the policy establishes the civil date from which normal operational authority begins for the selected academic year.
   - Initial payload: `{ operationalStartDate: '' }`.
   - Client validation: strictly checks plain object, exactly one key `operationalStartDate`, valid civil date `YYYY-MM-DD` via `isValidCivilDate()`, no extra keys. Does NOT compare against browser clock.

2. **Dedicated AcademicYear Picker Route**:
   - Consumes exclusively `GET /api/business-configuration/academic-year-options` provided by `P1-031C`.
   - Never calls `/api/academic-years`, `/api/ppct-options/academic-years`, or reporting endpoints.
   - Fully exhausts pagination (`total > pageSize`) so no options are silently dropped.
   - Uses actual `option.id` for resource binding (`{ kind: 'ACADEMIC_YEAR', academicYearId: option.id }`), never code or name.

3. **Server-Owned Action Authority**:
   - `ver.allowedActions` from the stream detail response is the sole lifecycle authority.
   - Client clock, `new Date()`, browser timezone, and effectivity dates must NEVER be used to infer, enable, or disable lifecycle action buttons.
   - Action mappings:
     - `EDIT_DRAFT` -> "Chỉnh sửa bản nháp"
     - `PUBLISH` -> "Công bố"
     - `REPLACE` -> "Thay đổi trong tương lai"
     - `RETIRE` -> "Kết thúc hiệu lực" (never provided by backend for `OPERATIONAL_START`)
     - `CORRECT` -> "Sửa sai lịch sử"
     - `SUPERSEDE_SCHEDULED_AUTHORITY` -> "Thay đổi lịch bắt đầu đã lên lịch"
   - Terminal versions (`allowedActions = []`) expose no mutation controls.
   - Displays `actionEvaluationCivilDate` as read-only evidence ("Ngày nghiệp vụ dùng để xác định thao tác: YYYY-MM-DD").

4. **Dedicated Scheduled Authority Workflow (`SUPERSEDE_SCHEDULED_AUTHORITY`)**:
   - Distinct from Replace, Retire, and Correct.
   - Route: `POST /api/business-configuration/policy-versions/:id/supersede-scheduled-authority`.
   - Request body: `{ commandId, payload: { operationalStartDate }, reason? }`.
   - Omits `effectiveFrom`, `effectiveUntil`, `businessDate`, status, or lineage fields.
   - Shows existing scheduled `effectiveFrom` as read-only.
   - Reason is optional (max 1000 chars, trimmed, omitted if blank).

5. **Operational-Start Form Restrictions**:
   - **Create**: Open-ended; `effectiveUntil` is omitted from both UI and API request. `effectiveFrom` remains editable.
   - **Correct**: Effectivity range is read-only and omitted from API request; reason is mandatory; typed payload remains editable.
   - **Replace**: Standard replacement prospective effective date and payload editor.

6. **Retained Lineage and Status Presentation**:
   - `DRAFT`: "Bản nháp"
   - `PUBLISHED`: "Đã công bố"
   - `REVERSED`: "Đã đảo ngược (sửa sai)"
   - `SUPERSEDED_BEFORE_EFFECTIVE`: "Đã được thay thế trước khi có hiệu lực" (warning/neutral styling, never error styling). Displays retained audit evidence (`supersededBeforeEffectiveByUserId`, `supersededBeforeEffectiveAt`, `supersededBeforeEffectiveReason`).
   - Successor lineage: `supersedesScheduledVersionId` rendered as "Kế nhiệm thẩm quyền đã lên lịch từ phiên bản ID: ...".

7. **Environment State**:
   - Production remains strictly `PRE-OPERATIONAL`.

---

## 4. Text Wireframes (Mobile, Laptop, Desktop)

### 4.1 Mobile Viewport (375px)
```text
+------------------------------------------+
| Header: Cấu hình chính sách nghiệp vụ    |
| [ Làm mới ]                              |
+------------------------------------------+
| Danh sách luồng chính sách (Stack)       |
| > Bắt đầu vận hành — Năm học 2026-2027   |
|   Trạng thái: Đã công bố                 |
|   Hiệu lực: 2026-09-01 -> Hiện tại       |
+------------------------------------------+
| Chi tiết luồng (Full-width card)         |
| Chính sách: Bắt đầu vận hành             |
| Phạm vi: Toàn trường / Năm học 2026-2027 |
|                                          |
| Thao tác khả dụng (Server-owned, wrap):  |
| [ Thay đổi trong tương lai ] [ Sửa sai ] |
|                                          |
| Ngày nghiệp vụ xác định thao tác:        |
| 2026-09-17                               |
|                                          |
| Danh sách phiên bản:                     |
| * Phiên bản 2 (Đã công bố) - Hiện hành   |
|   Bắt đầu vận hành: 2026-09-05           |
| * Phiên bản 1 (Đã thay thế trước hiệu    |
|   lực)                                   |
|   Lý do thay thế: Lùi lịch tựu trường    |
|   Người thực hiện: admin                 |
+------------------------------------------+
```

### 4.2 Laptop Viewport (1366 x 768)
```text
+----------------------------------------------------------------------------------------------------+
| Header: Cấu hình chính sách nghiệp vụ                                    [ Làm mới ] [ Tạo luồng ] |
+------------------------------------------+---------------------------------------------------------+
| DANH SÁCH LUỒNG (Sidebar / List, 380px)  | CHI TIẾT LUỒNG VÀ PHIÊN BẢN (Flex-1)                    |
| Filter: Tất cả chính sách / năm học      | Tiêu đề: Bắt đầu vận hành — 2026-2027                   |
| ---------------------------------------- | Mã tài nguyên: 2026-2027 (UUID: ...)                    |
| > Bắt đầu vận hành                       | Thao tác khả dụng:                                      |
|   Năm học: 2026-2027                     | [ Thay đổi lịch bắt đầu đã lên lịch ]                   |
|   Bản mới nhất: Đã công bố (Scheduled)   | (Ngày nghiệp vụ xác định thao tác: 2026-08-15)          |
|                                          | ------------------------------------------------------- |
|                                          | [ WORKFLOW DRAWER / FORM nếu đang thao tác ]            |
|                                          | - Phiên bản nguồn: ID abc-123                           |
|                                          | - Ngày hiệu lực đã lên lịch: 2026-09-01 (Cố định)       |
|                                          | - Ngày bắt đầu vận hành mới: [ 2026-09-08 ]             |
|                                          | - Lý do thay đổi (tùy chọn): [ ....................... ]|
|                                          | [ Hủy ] [ Xác nhận thay đổi lịch ]                      |
|                                          | ------------------------------------------------------- |
|                                          | LỊCH SỬ PHIÊN BẢN (Table / Timeline):                   |
|                                          | v2 | 2026-09-01 -> | Đã công bố | Khởi tạo 2026-09-08    |
|                                          |    Kế nhiệm từ v1                                       |
|                                          | v1 | 2026-09-01 -> | Đã thay thế trước hiệu lực         |
|                                          |    Lý do: Đổi quyết định khai giảng                      |
+------------------------------------------+---------------------------------------------------------+
```

### 4.3 Wide Desktop Viewport (>= 1440px)
```text
+------------------------------------------------------------------------------------------------------------------------+
| Quản trị hệ thống > Cấu hình chính sách nghiệp vụ                                            [ Làm mới ] [ Tạo luồng ] |
+----------------------------------------------+-------------------------------------------------------------------------+
| DANH SÁCH LUỒNG CHÍNH SÁCH (420px)           | BẢNG ĐIỀU KHIỂN LUỒNG CHÍNH SÁCH                                        |
| Bộ lọc tìm kiếm & trạng thái                 | Thông tin chính sách: Bắt đầu vận hành (OPERATIONAL_START / v1)         |
| -------------------------------------------- | Tài nguyên áp dụng: Năm học 2026-2027                                   |
| [ Card item: Bắt đầu vận hành 2026-2027 ]    | Ngày nghiệp vụ xác định thao tác: 2026-08-15                            |
|   Trạng thái: Đã công bố (Scheduled)         | Thao tác máy chủ cho phép:                                              |
|   Hiệu lực: 2026-09-01 -> Vô thời hạn        | [ Thay đổi lịch bắt đầu đã lên lịch ]                                   |
|                                              | ----------------------------------------------------------------------- |
|                                              | BẢNG LỊCH SỬ PHIÊN BẢN VÀ CHỨNG CỨ KIỂM TOÁN                            |
|                                              | Phiên bản | Trạng thái | Hiệu lực  | Nội dung | Kiểm toán / Kế nhiệm    |
|                                              | v2        | ĐÃ CÔNG BỐ | 2026-09-01| Start:   | Kế nhiệm từ v1          |
|                                              |           |            |           | 2026-09-08| By: user-admin          |
|                                              | v1        | ĐÃ THAY THẾ| 2026-09-01| Start:   | Thay thế trước hiệu lực |
|                                              |           | TRƯỚC H.LỰC|           | 2026-09-05| Lý do: Lùi tựu trường   |
+----------------------------------------------+-------------------------------------------------------------------------+
```

---

## 5. Implementation & Verification Evidence

### 5.1 Delivered Changes
1. **Production UI Adapter (`apps/web/src/lib/business-policy-ui-registry.ts`)**:
   - Registered `OPERATIONAL_START / v1 / ACADEMIC_YEAR` as the sole production adapter in `PRODUCTION_BUSINESS_POLICY_UI_ADAPTERS`.
   - Pure client arithmetic civil date validation (`isValidCivilDate`); strict rejection of invalid dates, extra properties, or non-object payloads; zero browser clock comparison.
   - Resource editor component exhaustively consuming `GET /api/business-configuration/academic-year-options` (with loading, error/retry, and empty states).
   - Dedicated editor and summary components displaying normalized civil date.
2. **Web API Client (`apps/web/src/lib/business-configuration-api.ts`)**:
   - `getAcademicYearOptions(page, pageSize)` reading `/business-configuration/academic-year-options`.
   - `supersedeScheduledAuthority(versionId, input)` issuing `POST /business-configuration/policy-versions/:id/supersede-scheduled-authority` with typed body `{ commandId, payload: { operationalStartDate }, reason? }`.
   - Added user-facing Vietnamese translations for `OPERATIONAL_START_*` error codes.
3. **Business Configuration Workspace (`apps/web/src/pages/BusinessConfigurationPage.tsx`)**:
   - Server-owned `ver.allowedActions` strictly controls lifecycle buttons (`EDIT_DRAFT`, `PUBLISH`, `SUPERSEDE_SCHEDULED_AUTHORITY`, `REPLACE`, `RETIRE`, `CORRECT`).
   - Display of `actionEvaluationCivilDate` as audit evidence without browser clock inference.
   - Dedicated `supersede_scheduled` workflow drawer with source version evidence, read-only scheduled start date, preloaded date editor, and optional reason.
   - Open-ended create form omits `effectiveUntil`.
   - Correction form locks effectivity dates to read-only evidence and omits them from the mutation request.
   - Correct presentation of `SUPERSEDED_BEFORE_EFFECTIVE` status, retained audit metadata, and successor lineage.

### 5.2 Verification Suite Results
- **Web targeted unit tests (`business-configuration-workspace.test.tsx`)**: 55/55 passed (46 existing regression + 9 dedicated P1-032 tests).
- **Web full unit test suite**: 286/287 passed (the single timeout in `homeroom-assignment-page.test.tsx` passed completely in isolated run, 23/23).
- **Web lint (`npm run lint -w apps/web`)**: PASSED (0 warnings).
- **Web typecheck (`npm run typecheck -w apps/web`)**: PASSED (0 errors).
- **Web production build (`npm run build -w apps/web`)**: PASSED (dist built cleanly in 5.26s).
- **Workflow contract verification (`npm run test:workflow:contract`)**: PASSED.
- **Git diff check (`git diff --check`)**: PASSED (clean, no trailing whitespace or merge markers).

### 5.3 Scope and Governance Invariants
- Zero backend (`apps/api/**`) changes.
- Zero shared contracts (`packages/contracts/**`) changes.
- Zero database/schema/migration (`prisma/**`) changes.
- Zero auth/session/capability changes.
- Zero CI/CD changes.
- Production remains strictly PRE-OPERATIONAL.
