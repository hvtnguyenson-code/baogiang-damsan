# Reporting Statement Persistence Foundation — Technical Clarifications

## 1. Status / precedence

**Status: FORWARD TECHNICAL CLARIFICATION.**

Tài liệu này không reopen Product Owner D1–D19, không tạo ADR mới và không thay đổi PA-D1–PA-D16 ngoài các điểm làm rõ dưới đây. Nếu wording trong `REPORTING-STATEMENT-PERSISTENCE-ARCHITECTURE-AUDIT.md` hoặc `REPORTING-STATEMENT-PERSISTENCE-TECHNICAL-DECISION-CLOSURE.md` mâu thuẫn với tài liệu này, **tài liệu này có precedence cho đúng các điểm được nêu rõ**.

Mục tiêu là loại bỏ ambiguity trước Slice A/B/C, đặc biệt ở command-clock `asOfInstant`, replay/authorization order và boundary giữa schema-only invariants với runtime-enforced invariants.

## 2. TC-1 — Single command-clock asOf across SERIALIZABLE retries

Authority là ADR-042 D5/D18:

- idempotency phải được kiểm trước server semantic input mới;
- một genuinely new SUBMIT command pin **đúng một** server command-clock `asOfInstant`;
- exact instant đó phải được truyền không đổi vào authoritative Personal resolver và frozen snapshot;
- không clock read sau đó được thay đổi new-command truth.

Vì vậy wording trước đây kiểu `retry whole transaction, không reuse stale clock/projection` được sửa thành:

1. retryable serialization/deadlock/creation-race phải retry **toàn bộ database transaction**;
2. mỗi retry vẫn phải authenticate/authorize/normalize và kiểm accepted command identity trước khi làm semantic work;
3. nếu retry phát hiện cùng command đã được accepted bởi winner, trả authoritative replay của winner, gồm original frozen as-of;
4. nếu command vẫn genuinely new, retry phải **reuse đúng command-level asOfInstant đã pin lần đầu**, không đọc clock lần hai;
5. retry phải recompute/resolve projection trong transaction mới với **cùng pinned asOfInstant**; không reuse stale projection/result từ transaction đã abort.

Phân biệt bắt buộc:

- **reuse pinned command asOf:** CÓ;
- **reuse stale projection/query result:** KHÔNG;
- **repin bằng clock mới sau serialization retry:** KHÔNG.

Thứ tự SUBMIT authority giữ đúng D5/D18:

`authenticate -> authorize -> normalize series/intent -> idempotency lookup/replay -> pin/reuse single command-level asOf -> series guards/lock -> PersonalReportingProjection.resolveInTransaction(tx, exactAsOf) -> eligibility -> freeze/hash -> persist -> history/audit -> commit`.

Series creation/lock có thể gây retry nhưng không được làm thay đổi pinned command as-of.

## 3. TC-2 — Authorization precedes replay response for mutating commands

Persistence command receipt là idempotency truth, không phải authorization bypass.

Future SUBMIT/APPROVE/REJECT control plane phải authenticate và authorize actor trước khi trả một accepted replay. Sau authorization, same accepted `(actorUserId, commandType, requestKey)` + same fingerprint có thể replay authoritative prior result; changed fingerprint conflicts.

Điều này giữ nguyên D5 submit ordering và D13 authorization/audit boundary. Không actor nào được nhận mutating-command replay chỉ vì biết requestKey/fingerprint của một command cũ.

## 4. TC-3 — Display evidence is frozen when available; UUID remains authority

ADR-042 D12 quy định UUID là authoritative identity và bounded display evidence chỉ phục vụ readability.

Do đó physical schema **không được biến availability của StaffProfile/display fields thành điều kiện business mới**.

Recommended shape được làm rõ:

- `submitterDisplayNameSnapshot`: nullable bounded string;
- `submitterStaffCodeSnapshot`: nullable bounded string;
- `actorDisplayNameSnapshot`: nullable bounded string;
- `actorStaffCodeSnapshot`: nullable bounded string.

Khi current authoritative source có display evidence thì phải freeze nó; khi không có thì để `NULL`, không fail một otherwise-valid command và không tự invent display identity. UUID vẫn là authority; later rename/deactivation không rewrite frozen value đã lưu.

## 5. TC-4 — Slice A cannot claim runtime-only append-only / zero-subject enforcement

PA-D14 đã chọn **không trigger** trong V1 foundation. PA-D16 tách:

- Slice A = schema/migration/constraints/verifier;
- Slice B = internal persistence/canonicalization primitives;
- Slice C = control plane;
- Slice D = cross-domain E2E/freeze.

Vì vậy S14/S16 cần hiểu theo đúng boundary:

### S14 — History append-only

Slice A chỉ chứng minh structural foundation:

- `ReportingStatementHistory` không có mutable lifecycle payload hoặc `updatedAt`;
- FK dùng RESTRICT, không cascade;
- schema không tạo generic correction/delete mechanism.

**Full append-only write contract** (`create` only; không update/delete qua internal persistence API) là gate của Slice B và tiếp tục được kiểm ở C/D.

### S16 — ZERO_RESPONSIBILITY / zero-subject

Slice A chỉ chứng minh structural foundation:

- normalized `ReportingStatementRevisionSubject` tồn tại;
- không có zero-subject sentinel/vacuous authorization row;
- schema không tự biến empty set thành một official authority marker.

Vì parent-has-at-least-one-child không được enforce bằng normal CHECK và V1 không dùng trigger, **D19 full prohibition phải được enforce trong Slice B internal persistence primitive/transaction**, rồi được chứng minh lại ở Slice C/D. Slice A không được claim database-alone enforcement của D19.

Do đó Slice A có thể CLOSED/GREEN với structural S14/S16 evidence, nhưng **Reporting Statement overall chưa được freeze** cho tới khi Slice B/C/D chứng minh runtime invariants tương ứng.

## 6. Implementation consequence

Các technical decisions còn lại giữ nguyên, gồm:

- 6-model topology;
- exact 5-field series key;
- immutable semantic Revision tách RevisionState;
- partial unique one-SUBMITTED / one-APPROVED;
- exact canonical JSON TEXT + non-unique SHA-256;
- normalized frozen subject index;
- command identity `(actorUserId, commandType, requestKey)`;
- UUID lifecycle CAS token;
- predecessor lineage tách supersedes target;
- StatementHistory là domain truth, AuditEvent là sanitized cross-cutting audit;
- Statement-domain FKs RESTRICT;
- no trigger in V1 foundation.

Slice A prompt phải đọc **cả** technical closure và tài liệu clarification này. Không được triển khai wording cũ trái với TC-1–TC-4.

**REPORTING STATEMENT PERSISTENCE TECHNICAL CLARIFICATIONS — CLOSED.**
