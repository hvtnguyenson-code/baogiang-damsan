# BÁO CÁO KỸ THUẬT — CANDIDATE REPORTING STATEMENT UI-0 ENABLEMENT

## 1. Mục tiêu và phạm vi gói ứng viên (Candidate Scope)

Hồ sơ này ghi nhận trạng thái **Candidate UI-0 Enablement** (nền tảng UI Enablement Foundation) cho phân hệ Báo giảng (Personal Reporting Statements).

Gói công việc UI-0 thiết lập nền tảng presentation-read, public contracts, API endpoints an toàn để phục vụ việc xây dựng giao diện giáo viên và cán bộ quản lý (UI-1 & UI-2), tuân thủ nghiêm ngặt các quyết định kiến trúc và đặc tả quy chuẩn:
- `docs/decisions/ADR-041-REPORTING-PROJECTION.md`
- `docs/decisions/ADR-042-SUBMISSION-APPROVAL-SNAPSHOT.md`
- `docs/decisions/ADR-043-PERSONAL-REPORTING-PROJECTION.md`
- `docs/requirements/LOCAL-FC-05I0D-SUBMISSION-APPROVAL-SNAPSHOT-DECISION-CLOSURE.md`
- `docs/requirements/REPORTING-STATEMENT-PERSISTENCE-TECHNICAL-DECISION-CLOSURE.md`
- `docs/requirements/REPORTING-STATEMENT-PERSISTENCE-TECHNICAL-CLARIFICATIONS.md`
- `docs/requirements/REPORTING-STATEMENT-CORE-BACKEND-FREEZE.md`

Phạm vi task hoàn toàn không thay đổi schema Prisma, không tạo migration mới, không can thiệp styling UI hay route giao diện frontend, mà tập trung vào API contract, fail-closed presentation integrity và kiểm thử độc lập.

Quy trình hoàn thiện tuân thủ tiến trình: `Candidate Branch` -> `Independent Review` -> `CI Workflow Check` -> `Authorized Merge`.

---

## 2. Danh mục Public Contracts (`@baogiang/contracts`)

Tất cả các types và DTOs công khai đã được chuẩn hóa trong `@baogiang/contracts`:

1. **Trạng thái vòng đời & Thao tác cho phép**:
   - `ReportingStatementLifecycleState = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'`
   - `ReportingStatementAllowedAction = 'APPROVE' | 'REJECT'`
2. **Khái niệm tiến độ & Phân loại công nợ**:
   - `ReportingProgressDebtClassification = 'COMPLETED' | 'PROVEN_OPEN_DEBT' | 'UNCONFIRMED_COMPLETION_GAP'`
   - `ReportingCounts` (`distributedElapsedCount`, `completedCount`, `openDebtCount`, `lateCount`, `unconfirmedGapCount` — trong đó `lateCount` là trường đếm thống kê tổng hợp, không phải enum classification).
   - `PersonalResponsibilityInterval` (`teachingAssignmentId`, `schoolClassId`, `subjectId`, `validFrom`, `validUntil`)
   - `ReportingDetail`
3. **Contracts cho Phát hiện lỗi (Public Findings)**:
   - `ReportingStatementFindingCode` (Union 9 mã lỗi tiêu chuẩn của hệ thống: `RECONCILIATION_REQUIRED`, `ACTIVE_FULFILLMENT_AMBIGUOUS`, `OPERATIONAL_MEANING_UNCLASSIFIABLE`, `UPSTREAM_ALLOCATION_BLOCKED`, `SOURCE_TIME_SLOT_PROVENANCE_MISSING`, `RESPONSIBILITY_SCOPE_PROVENANCE_INVALID`, `RESPONSIBLE_TEACHER_PROVENANCE_MISMATCH`, `DUPLICATE_PERSONAL_OCCURRENCE`, `PERSONAL_AGGREGATE_RECONCILIATION_FAILED`).
   - `ReportingStatementPublicFinding`: `{ severity: 'BLOCKER', code: ReportingStatementFindingCode, message: string }` (thông điệp tiếng Việt tường minh, bảo mật, không rò rỉ stack trace hay database internals).
4. **Contracts cho Preview**:
   - `ReportingStatementPreviewRequest`: gồm `academicYearId`, `fromCivilDate`, `toCivilDate` (chặt chẽ, cấm client can thiệp `targetUserId`, `roots`, `asOfInstant`, `requestKey`).
   - `ReportingStatementPreviewResponse`: gồm `previewAsOfInstant`, `status`, `responsibilityState`, `eligibleForSubmission` (xác định từ `PASS` và `RESPONSIBILITY_PRESENT`), `counts`, `sections`, `findings`, `responsibilityManifest`.
5. **Contracts cho Discovery & List**:
   - `ReportingStatementSummary`: tóm tắt metadata revision an toàn, phục vụ danh sách bảng.
   - `ReportingStatementListResponse`: phân trang chuẩn (`items`, `page`, `pageSize`, `total`).
6. **Contracts cho Chi tiết & Quyết định**:
   - `ReportingStatementDetailResponse`: chi tiết revision sau khi xác thực snapshot integrity đa chiều, kèm `frozenSubjectIds`, `history`, và `allowedActions`.
   - `ReportingStatementHistoryEntry`: lịch sử chuyển trạng thái kèm actor snapshot và mốc thời gian.
   - `ReportingStatementSubmitRequest`, `ReportingStatementDecideRequest`, `ReportingStatementCommandResult`.

---

## 3. Danh mục API Endpoints & Phân quyền

Tất cả các endpoint được triển khai trong `ReportingStatementsController` và `ReportingStatementsService`:

| Phương thức | Đường dẫn | Bảo vệ / Guards | Yêu cầu phân quyền | Mô tả chức năng |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/reporting-statements/preview` | `SessionAuthGuard` | `REPORTING_STATEMENT_SUBMIT` (`PERSONAL`) | Đánh giá trước số liệu và cờ `eligibleForSubmission` theo đồng hồ server. Không ghi dữ liệu vào DB (zero-persistence). |
| `GET` | `/api/reporting-statements/mine` | `SessionAuthGuard` | `REPORTING_STATEMENT_READ` (`PERSONAL`) | Lấy danh sách phân trang các revision do chính actor nộp (`submittedAt DESC, id ASC`). |
| `GET` | `/api/reporting-statements/accessible` | `SessionAuthGuard` | `REPORTING_STATEMENT_READ` | Trả về các revision actor có quyền đọc: bản ghi của chính mình (nếu có `PERSONAL`), bản ghi người khác (nếu có `SCHOOL_WIDE` hoặc được cấp quyền `SUBJECT` trên toàn bộ môn học đóng băng). Thay đổi TeachingAssignment sau khi freeze không làm đổi quyền đọc. |
| `GET` | `/api/reporting-statements/pending-decision` | `SessionAuthGuard` | `APPROVAL_PRINCIPAL`/`VICE_PRINCIPAL` (`SCHOOL_WIDE`) | Lấy danh sách Statement `SUBMITTED` đang chờ duyệt, loại trừ bản ghi của chính mình và yêu cầu quyền đọc môn học đầy đủ. |
| `GET` | `/api/reporting-statements/:revisionId` | `SessionAuthGuard` | Quyền đọc tương ứng | Trả về chi tiết Statement, xác minh tính toàn vẹn snapshot (`parseAndVerifyFrozenSnapshot`) và tính toán `allowedActions`. |
| `POST` | `/api/reporting-statements` | `SessionAuthGuard`, `CsrfOriginGuard` | `REPORTING_STATEMENT_SUBMIT` (`PERSONAL`) | Nộp Statement chính thức. Đánh giá lại projection độc lập trong transaction (tuyệt đối không tái sử dụng dữ liệu preview cũ). |
| `POST` | `/api/reporting-statements/:revisionId/approve` | `SessionAuthGuard`, `CsrfOriginGuard` | `APPROVAL_PRINCIPAL`/`VICE_PRINCIPAL` (`SCHOOL_WIDE`) | Phê duyệt Statement bằng CAS `expectedLifecycleToken`. Tự động chuyển bản ghi đã duyệt cũ sang `SUPERSEDED`. |
| `POST` | `/api/reporting-statements/:revisionId/reject` | `SessionAuthGuard`, `CsrfOriginGuard` | `APPROVAL_PRINCIPAL`/`VICE_PRINCIPAL` (`SCHOOL_WIDE`) | Từ chối Statement bằng CAS `expectedLifecycleToken`. |

---

## 4. Cơ chế Snapshot Integrity & Fail-Closed Presenter

Lớp Presenter (`apps/api/src/reporting-statements/reporting-statement.presenter.ts`) bảo vệ dữ liệu và đảm bảo an toàn tuyệt đối:

1. **Xác thực toàn vẹn Snapshot (`parseAndVerifyFrozenSnapshot`)**:
   - Kiểm tra `snapshotProfile` và `serializerVersion`.
   - Tính toán lại SHA-256 semantic hash trên chuỗi `canonicalSnapshotJson` và so khớp với `semanticHash` lưu trữ.
   - Giải mã canonical JSON và xác minh đối chiếu lại chuỗi canonical byte-for-byte.
   - **Cross-Record Reconciliation**: Đối chiếu tất cả các trường root metadata giữa snapshot và bản ghi database (`statementProfile`, `submitterUserId`, `submitterDisplayNameSnapshot`, `submitterStaffCodeSnapshot`, `academicYearId`, `fromCivilDate`, `toCivilDate`, `asOfInstant`).
   - Đối chiếu danh sách môn học lưu tại bảng quan hệ `ReportingStatementFrozenSubject` với danh sách môn trong `responsibilityManifest`.
   - **Fail-Closed**: Bất kỳ sự sai lệch nào lập tức ném `InternalServerErrorException` (500), ngăn chặn việc hiển thị dữ liệu hỏng hoặc bị giả mạo.
2. **Khử rò rỉ dữ liệu nội bộ**:
   - `presentReportingStatementSummary` và `presentReportingStatementDetail` loại bỏ hoàn toàn các trường nội bộ của hệ thống lưu trữ: `canonicalSnapshotJson`, `requestFingerprint`, `requestKey`, command IDs nội bộ.
   - Lịch sử chuyển trạng thái (`history`) được sắp xếp đơn luồng chuẩn xác: `createdAt ASC, id ASC`.

---

## 5. Hợp đồng Frontend Adapter & Retry Idempotency

Tệp `apps/web/src/lib/reporting-statements-api.ts` cung cấp adapter typed cho frontend:
- Đầy đủ 8 phương thức: `preview`, `listMine`, `listAccessible`, `listPendingDecision`, `getDetail`, `submit`, `approve`, `reject`.
- Helper `createReportingStatementRequestKey()`: sinh UUID v4 chuẩn.
- **Quy tắc Idempotency cho UI**:
  - Mỗi một thao tác người dùng (logical command) chỉ tạo một `requestKey`.
  - Nếu gặp sự cố mạng (network error, timeout) và cần retry, frontend **phải giữ nguyên** `requestKey` cũ để backend nhận diện replay / idempotent receipt mà không tạo command mới.
  - Chỉ khi người dùng thực hiện một thao tác mới thì mới sinh `requestKey` mới.

---

## 6. Kết quả nghiệm thu & Kiểm thử

1. **Typecheck & Contracts Build**:
   - `@baogiang/contracts`: Build `tsup` và `tsc --noEmit` thành công 100%.
   - `@baogiang/api`: `tsc --noEmit` thành công 0 lỗi.
   - `@baogiang/web`: `tsc --noEmit` thành công 0 lỗi.
2. **Unit & Presentation Tests**:
   - Backend (`apps/api`): 5 test suites, 65 tests hoàn thành 100% PASS:
     - `reporting-statements.discovery-read.spec.ts`
     - `reporting-statement.presenter.spec.ts` (kiểm tra đầy đủ 9 finding codes, mapping tiếng Việt, và tất cả trường hợp mismatch snapshot cross-record)
     - `reporting-statements.decision-read.spec.ts`
     - `reporting-statements.submit.spec.ts`
     - `reporting-statement-canonicalizer.spec.ts`
   - Frontend (`apps/web`): 1 test suite, 9 tests hoàn thành 100% PASS:
     - `reporting-statements-api.test.ts`
3. **HTTP & PostgreSQL Integration Tests**:
   - `reporting-statements.http.integration.spec.ts`: kiểm thử toàn diện HTTP security boundary, DTO validation, preview zero-persistence, stale preview non-reuse invariant, discovery authorization, detail sanitization, và pagination bounds.
