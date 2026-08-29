# Reporting Statement UI-1A — Product Context Bridge

## Status

**Candidate.** Hồ sơ chỉ được xác nhận sau independent GitHub review và CI trên exact branch head. Task này không reopen Core Backend Freeze, không tạo UI trực quan và không cho phép merge/deploy.

## Lý do tồn tại

Reporting Statement Product UI cần hiển thị tên/mã năm học, lớp và môn học, đồng thời cần biên ngày của active calendar để nhập khoảng báo cáo. API quản trị `GET /api/academic-years` tiếp tục yêu cầu `ACADEMIC_STRUCTURE_MANAGE / SCHOOL_WIDE`; giáo viên không được cấp hoặc suy diễn quyền quản trị chỉ để lấy reference labels.

Bridge cung cấp read-model nhỏ, public-safe dưới Reporting Statements. Nó không thay thế management API và không gọi management controller qua HTTP.

## Public contract

`@baogiang/contracts` công bố:

- `ReportingStatementActiveCalendarEnvelope`;
- `ReportingStatementAcademicYearOption`;
- `ReportingStatementReferenceOption`;
- `ReportingStatementSelectedAcademicYearContext`;
- `ReportingStatementWorkspaceContextResponse`.

Academic year option gồm `id`, `code`, `name` và `activeCalendar: { startDate, endDate } | null`. Selected context bổ sung `schoolClasses` và `subjects`; mỗi reference chỉ gồm `id`, `code`, `name`, `status`.

Không public Prisma row, timestamps nội bộ, audit metadata, capability grant, staff/user directory, request fingerprint hoặc calendar structure ngoài envelope cần thiết.

## Endpoint

```text
GET /api/reporting-statements/workspace-context
GET /api/reporting-statements/workspace-context?academicYearId=<uuid>
```

Không truyền `academicYearId` trả danh sách năm học và `selectedAcademicYear = null`. UUID sai trả `HTTP 400`; UUID hợp lệ nhưng không tồn tại trả `HTTP 404`. Năm học không có active calendar trả `activeCalendar = null`.

Academic years dùng ordering `code ASC, id ASC`; classes và subjects dùng `code ASC, id ASC`. ACTIVE và INACTIVE class/subject đều được giữ để current catalog context vẫn resolve được historical identifiers.

## Authorization

Endpoint dùng `SessionAuthGuard` và chỉ cho phép actor có ít nhất một grant hiệu lực:

- `REPORTING_STATEMENT_SUBMIT / PERSONAL`;
- `REPORTING_STATEMENT_READ / PERSONAL`;
- `REPORTING_STATEMENT_READ / SUBJECT`;
- `REPORTING_STATEMENT_READ / SCHOOL_WIDE`.

Role/title, SubjectGroup membership, TeachingAssignment, AdditionalDuty, `SYSTEM_ADMIN` và `ACADEMIC_STRUCTURE_MANAGE` không thay thế Reporting Statement authority. Không tạo capability hoặc seed mới.

## Reference semantics

Academic year, class và subject labels từ bridge là **current product display/selection context only**. Chúng không quyết định authorization, không thay thế persisted `frozenSubjectIds`, không thay đổi Personal scope, responsibility, series identity, canonical snapshot, semantic hash, lifecycle, history, CAS hoặc idempotency.

Snapshot V1 và frozen submitter display evidence giữ nguyên. Bridge không gọi current labels là frozen evidence và không ghi bất kỳ Statement/reference row nào khi đọc thành công.

## UI-1 dependency

Frontend adapter `reportingStatementsApi.workspaceContext(academicYearId?)` dùng existing `apiFetch` với `notifyUnauthorized`. UI-1 sau này có thể dùng context để chọn năm học bằng nhãn, giới hạn khoảng ngày theo active calendar và resolve class/subject IDs bằng current labels; task này không tạo React page, route, navigation hoặc screenshot.

## Test evidence

Candidate coverage gồm unit service authorization/mapping/not-found, HTTP/PostgreSQL authentication/authorization/validation/reference ordering/management-boundary/zero-persistence, và frontend adapter serialization/unauthorized notification.

Local non-DB evidence trên branch candidate:

- contracts lint/typecheck/build: PASS;
- API targeted context unit: 1 suite, 7 tests PASS;
- API full unit: 59 suites, 898 tests PASS;
- API lint/typecheck/build: PASS;
- web targeted adapter unit: 1 file, 11 tests PASS;
- web full unit: 12 files, 139 tests PASS;
- web lint/typecheck/build: PASS.

PostgreSQL integration: **NOT RUN — không có certified isolated `TEST_DATABASE_URL`**. PostgreSQL evidence chỉ được tính khi chạy qua safety harness; GitHub CI là confirmation gate.
