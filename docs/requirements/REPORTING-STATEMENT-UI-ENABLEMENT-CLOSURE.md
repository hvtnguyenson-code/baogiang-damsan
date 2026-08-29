# BÁO CÁO ĐÓNG HỒ SƠ — REPORTING STATEMENT UI-0 ENABLEMENT

## 1. Mục tiêu và phạm vi hoàn thành

Hồ sơ này ghi nhận việc hoàn thành gói công việc **REPORTING STATEMENT UI-0: UI Enablement Foundation** cho phân hệ Báo giảng (Personal Reporting Statements).

Giai đoạn UI-0 thiết lập nền tảng presentation-read, public contracts, API endpoints phục vụ màn hình UI của giáo viên và cán bộ quản lý (Phase UI-1 & UI-2), tuân thủ nghiêm ngặt các quyết định kiến trúc:
- `docs/decisions/ADR-041-LOCAL-CALENDAR-ENGINE.md`
- `docs/decisions/ADR-042-SUBMISSION-APPROVAL-SNAPSHOT.md`
- `docs/decisions/ADR-043-REPORTING-STATEMENT-SCHEMA.md`
- `docs/requirements/LOCAL-FC-05I0D-SUBMISSION-APPROVAL-SNAPSHOT-DECISION-CLOSURE.md`

Phạm vi task hoàn toàn không thay đổi schema Prisma, không sửa migration, không can thiệp styling UI hay route frontend, mà tập trung vào API contract và presentation safety.

---

## 2. Danh mục Public Contracts (`@baogiang/contracts`)

Tất cả các types và DTOs công khai đã được thêm vào `@baogiang/contracts` và xuất bản qua build package:

1. **Trạng thái vòng đời & Thao tác cho phép**:
   - `ReportingStatementLifecycleState = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'`
   - `ReportingStatementAllowedAction = 'APPROVE' | 'REJECT'`
2. **Khái niệm tiến độ & Công nợ**:
   - `ReportingProgressDebtClassification = 'COMPLETED' | 'OPEN_DEBT' | 'LATE' | 'UNCONFIRMED_GAP'`
   - `ReportingCounts` (distributedElapsedCount, completedCount, openDebtCount, lateCount, unconfirmedGapCount)
   - `PersonalResponsibilityInterval` (teachingAssignmentId, schoolClassId, subjectId, validFrom, validUntil)
   - `ReportingDetail`
3. **Contracts cho Preview**:
   - `ReportingStatementPreviewRequest`: gồm `academicYearId`, `fromCivilDate`, `toCivilDate` (chặt chẽ, không cho phép client truyền `targetUserId`, `asOfInstant`, hay `requestKey`).
   - `ReportingStatementPreviewResponse`: gồm `previewAsOfInstant`, `status`, `responsibilityState`, `eligibleForSubmission` (tính toán an toàn từ `PASS` và `RESPONSIBILITY_PRESENT`), `counts`, `sections`, `findings`, `responsibilityManifest`.
4. **Contracts cho Discovery & List**:
   - `ReportingStatementSummary`: tóm tắt metadata revision an toàn, phục vụ danh sách bảng.
   - `ReportingStatementListResponse`: phân trang chuẩn (`items`, `page`, `pageSize`, `total`).
5. **Contracts cho Chi tiết & Quyết định**:
   - `ReportingStatementDetailResponse`: chi tiết revision sau khi giải mã và xác thực snapshot snapshot integrity, kèm `frozenSubjectIds`, `history`, và `allowedActions`.
   - `ReportingStatementHistoryEntry`: lịch sử chuyển trạng thái kèm actor snapshot và mốc thời gian.
   - `ReportingStatementSubmitRequest`, `ReportingStatementDecideRequest`, `ReportingStatementCommandResult`.

---

## 3. Danh mục API Endpoints & Phân quyền

Tất cả các endpoint được triển khai trong `ReportingStatementsController` và `ReportingStatementsService`:

| Phương thức | Đường dẫn | Bảo vệ / Guards | Yêu cầu phân quyền | Mô tả chức năng |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/reporting-statements/preview` | `SessionAuthGuard` | `REPORTING_STATEMENT_SUBMIT` (`PERSONAL`) | Tính toán trước số liệu và kiểm tra `eligibleForSubmission` từ Personal Projection theo đồng hồ máy chủ. Không ghi DB/audit. |
| `GET` | `/api/reporting-statements/mine` | `SessionAuthGuard` | `REPORTING_STATEMENT_READ` (`PERSONAL`) | Lấy danh sách phân trang các revision do chính actor nộp (`submittedAt DESC, id ASC`). |
| `GET` | `/api/reporting-statements/accessible` | `SessionAuthGuard` | `REPORTING_STATEMENT_READ` | Trả về các revision actor có quyền đọc: bản ghi của chính mình (nếu có `PERSONAL`), bản ghi người khác (nếu có `SCHOOL_WIDE` hoặc được cấp quyền `SUBJECT` trên toàn bộ môn học đóng băng của bản ghi). |
| `GET` | `/api/reporting-statements/pending-decision` | `SessionAuthGuard` | `APPROVAL_PRINCIPAL`/`VICE_PRINCIPAL` (`SCHOOL_WIDE`) | Lấy danh sách các Statement `SUBMITTED` đang chờ duyệt, loại trừ bản ghi của chính mình và đảm bảo quyền đọc môn học. |
| `GET` | `/api/reporting-statements/:revisionId` | `SessionAuthGuard` | Quyền đọc tương ứng | Trả về chi tiết Statement, xác minh tính toàn vẹn snapshot (`parseAndVerifyFrozenSnapshot`) và tính toán `allowedActions`. |
| `POST` | `/api/reporting-statements` | `SessionAuthGuard`, `CsrfOriginGuard` | `REPORTING_STATEMENT_SUBMIT` (`PERSONAL`) | Nộp Statement chính thức. Đánh giá lại projection độc lập trong transaction (không tái sử dụng dữ liệu preview). |
| `POST` | `/api/reporting-statements/:revisionId/approve` | `SessionAuthGuard`, `CsrfOriginGuard` | `APPROVAL_PRINCIPAL`/`VICE_PRINCIPAL` (`SCHOOL_WIDE`) | Phê duyệt Statement bằng CAS `expectedLifecycleToken`. Tự động chuyển bản ghi đã duyệt cũ sang `SUPERSEDED`. |
| `POST` | `/api/reporting-statements/:revisionId/reject` | `SessionAuthGuard`, `CsrfOriginGuard` | `APPROVAL_PRINCIPAL`/`VICE_PRINCIPAL` (`SCHOOL_WIDE`) | Từ chối Statement bằng CAS `expectedLifecycleToken`. |

---

## 4. Cơ chế Snapshot Integrity & Fail-Closed Presenter

Lớp Presenter (`apps/api/src/reporting-statements/reporting-statement.presenter.ts`) bảo vệ dữ liệu và đảm bảo an toàn tuyệt đối:

1. **Xác thực toàn vẹn Snapshot (`parseAndVerifyFrozenSnapshot`)**:
   - Kiểm tra `snapshotProfile` và `serializerVersion`.
   - Tính toán lại SHA-256 semantic hash trên chuỗi `canonicalSnapshotJson` và so khớp với `semanticHash` lưu trữ.
   - Giải mã canonical JSON và xác minh đối chiếu lại chuỗi canonical byte-for-byte.
   - Đối chiếu danh sách môn học lưu tại bảng quan hệ `ReportingStatementFrozenSubject` với danh sách môn trong `responsibilityManifest`.
   - Đối chiếu `asOfInstant` của revision với `asOfInstant` ghi nhận trong snapshot.
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
2. **Unit Tests**:
   - Backend (`apps/api`): 5 test suites, 57 tests hoàn thành 100% PASS:
     - `reporting-statements.discovery-read.spec.ts`
     - `reporting-statement.presenter.spec.ts`
     - `reporting-statements.decision-read.spec.ts`
     - `reporting-statements.submit.spec.ts`
     - `reporting-statement-canonicalizer.spec.ts`
   - Frontend (`apps/web`): 1 test suite, 9 tests hoàn thành 100% PASS:
     - `reporting-statements-api.test.ts`
