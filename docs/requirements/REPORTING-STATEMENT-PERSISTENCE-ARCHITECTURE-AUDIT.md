# Reporting Statement Persistence Foundation — Architecture Audit

## 1. Trạng thái / phạm vi / authority

**Trạng thái:** architecture audit cho persistence foundation của V1 PERSONAL Reporting Statement, trên canonical baseline `17904a8a7d72f4cc99cc8f246ed4eb7cbc0b7bb9`.

Audit này **không** mở lại Product Owner decisions D1–D19 trong `ADR-042-SUBMISSION-APPROVAL-SNAPSHOT.md` và `LOCAL-FC-05I0D-SUBMISSION-APPROVAL-SNAPSHOT-DECISION-CLOSURE.md`; không thay đổi A2 / ADR-043 Personal Reporting Projection; không authorize controller/API/capability/UI/deploy/production mutation.

Mục tiêu duy nhất là ánh xạ business authority đã đóng thành physical persistence topology PostgreSQL/Prisma đủ mạnh để slice schema/migration sau có thể triển khai mà không phải đoán business semantics.

Phân loại dùng trong tài liệu:

- **ACCEPTED BUSINESS AUTHORITY:** D1–D19 hoặc upstream Accepted ADR; không reopen.
- **TECHNICAL DESIGN DECISION:** có thể chốt từ authority + repo constraints, không cần Product Owner.
- **TRUE PRODUCT OWNER GAP:** chỉ khi lựa chọn làm thay đổi business behavior mà authority không quyết định được.

**Kết luận trước:** audit không phát hiện TRUE PRODUCT OWNER GAP. Các lựa chọn còn lại đều là technical design.

## 2. Nguồn authority và implementation evidence đã audit

### 2.1 Authority

- `ADR-042-SUBMISSION-APPROVAL-SNAPSHOT.md`: PERSONAL immutable official-record revision; series key; hybrid freeze; canonical SHA-256; lifecycle; idempotency; `SERIALIZABLE`; CAS; history/audit; D19 ZERO_RESPONSIBILITY ineligible.
- `LOCAL-FC-05I0D-SUBMISSION-APPROVAL-SNAPSHOT-DECISION-CLOSURE.md`: D1–D19 exact closure, lifecycle matrix, authorization matrix, canonicalization contract, transaction topology, concurrency/CAS semantics.
- `ADR-043-PERSONAL-REPORTING-PROJECTION.md` + Personal closure: internal `PERSONAL_TEACHING_REPORTING_PROJECTION_V1`, candidate-first BLOCKED propagation, retained responsible-teacher ownership, one tx-aware Reporting call, A2 ZERO_RESPONSIBILITY.
- `ADR-041-REPORTING-PROJECTION.md`: canonical detail exclusively supplies aggregates; MAKEUP source ownership; deterministic detail order; BLOCKED fail-closed.

### 2.2 Repo precedent / evidence

- `prisma/schema.prisma`: PostgreSQL 17; pervasive UUID identities; `DATE` for civil dates; `TIMESTAMPTZ(3)` for instants; `ON DELETE RESTRICT` for historical domain/provenance; `AuditEvent` is sanitized cross-cutting JSONB audit with actor `SetNull` only at this generic audit boundary.
- Timetable import persistence: stable root + immutable revisions + receipt/request-key binding; partial unique indexes/checks delegated to raw SQL where Prisma cannot represent them; no trigger.
- `TimetableImportRequestKey`: durable consumed request-key namespace separated from semantic checksum and receipt identity.
- Operational overlays / Teaching Execution: `ACTIVE/REVERSED`, requestKey/fingerprint, exact provenance, forward correction, partial unique active indexes, CAS in service, `SERIALIZABLE`, no trigger/no cascade.
- `AuditService.write(input, db)` accepts a Prisma transaction client, so future Statement success audit can be written atomically with domain state/history.
- Existing schema verification scripts execute SQL against fresh CI PostgreSQL and inspect enums, constraints, FK delete actions, indexes, triggers, and behavioral fixtures. This is the correct enforcement style for Statement persistence too.

Implementation precedent is evidence only; ADR-042 remains authority.

## 3. Recommended physical topology

Recommend **6 physical models**, with one deliberate separation between immutable semantic revision and mutable lifecycle authority:

1. `ReportingStatementSeries`
2. `ReportingStatementRevision`
3. `ReportingStatementRevisionState`
4. `ReportingStatementRevisionSubject`
5. `ReportingStatementCommand`
6. `ReportingStatementHistory`

Không cần generic Statement event ledger khác, current-pointer table, draft table, snapshot table riêng, attachment table, cache/materialized report table trong V1 foundation.

### 3.1 `ReportingStatementSeries`

Stable UUID root cho logical series D1.

Recommended fields:

- `id UUID PK`
- `statementProfile VARCHAR(...) NOT NULL`
- `submitterUserId UUID NOT NULL`
- `academicYearId UUID NOT NULL`
- `fromCivilDate DATE NOT NULL`
- `toCivilDate DATE NOT NULL`
- `createdAt TIMESTAMPTZ(3) NOT NULL DEFAULT now()`

Unique business identity:

`(statementProfile, submitterUserId, academicYearId, fromCivilDate, toCivilDate)`

Không thêm semanticHash, requestKey, generated time hoặc current assignment vào identity.

Không cần `currentSubmittedRevisionId` / `currentApprovedRevisionId` trong V1. Current authority được xác định bởi `ReportingStatementRevisionState.lifecycleState` với partial unique indexes. Tránh duplicated authority giữa pointer và state/index.

Không cần `revisionOrdinal` hoặc series sequence trong V1: UUID là revision identity; lifecycle state/index là current authority; ordinal dễ bị lạm dụng thành “latest wins”.

### 3.2 `ReportingStatementRevision`

Immutable semantic/provenance row. Một revision thuộc đúng một series.

Recommended fields tối thiểu:

- `id UUID PK`
- `seriesId UUID NOT NULL`
- `predecessorRevisionId UUID NULL`
- `supersedesRevisionId UUID NULL`
- `snapshotProfile VARCHAR(...) NOT NULL`
- `serializerVersion VARCHAR(...) NOT NULL`
- `canonicalSnapshotJson TEXT NOT NULL`
- `semanticHash CHAR(64) NOT NULL`
- `asOfInstant TIMESTAMPTZ(3) NOT NULL`
- `submitterDisplayNameSnapshot VARCHAR(150) NOT NULL`
- `submitterStaffCodeSnapshot VARCHAR(50) NULL`
- `submittedAt TIMESTAMPTZ(3) NOT NULL DEFAULT now()`

`predecessorRevisionId` là lineage predecessor của lần submit trước. `supersedesRevisionId` là exact current APPROVED revision mà revision này dự kiến thay thế khi correction được approve. Hai khái niệm tách nhau để xử lý đúng trường hợp một correction bị REJECTED rồi submit correction tiếp theo: lineage có thể đi qua rejected revision trong khi current approved authority vẫn là revision cũ.

Cả hai self-reference phải cùng series với revision hiện tại bằng composite provenance FK.

Semantic columns trên revision không được update sau insert. Không `updatedAt` trên bảng này.

### 3.3 `ReportingStatementRevisionState`

Mutable lifecycle authority 1:1, tách khỏi immutable semantic revision.

Recommended fields:

- `revisionId UUID PK`
- `seriesId UUID NOT NULL`
- `lifecycleState ReportingStatementLifecycleState NOT NULL`
- `lifecycleToken UUID NOT NULL`
- `updatedAt TIMESTAMPTZ(3) NOT NULL`

Enum exact:

- `SUBMITTED`
- `APPROVED`
- `REJECTED`
- `SUPERSEDED`

Tách state khỏi semantic revision giúp mọi lifecycle CAS chỉ đụng bảng state, giảm accidental mutation của frozen content. Database vẫn không thể tuyệt đối cấm UPDATE semantic row nếu không dùng trigger/privilege boundary; V1 giữ invariant bằng repository/service API + tests, không thêm trigger chỉ để mô phỏng immutability.

`lifecycleToken` là opaque UUID và rotate sau mỗi accepted lifecycle transition. Không cần thêm integer version trong V1; một token là đủ exact CAS authority.

### 3.4 `ReportingStatementRevisionSubject`

Immutable normalized frozen-subject index cho D10 non-owner read authorization.

Recommended fields:

- `revisionId UUID NOT NULL`
- `subjectId UUID NOT NULL`
- `createdAt TIMESTAMPTZ(3) NOT NULL DEFAULT now()`

Primary/unique key: `(revisionId, subjectId)`.

Authorization dùng frozen `subjectId`, không derive từ current TeachingAssignment/current Subject membership, không query JSON text để quyết định quyền.

Không cần duplicate subject name/code trong foundation. Historical display evidence nằm trong canonical frozen snapshot nếu domain payload cần; authorization chỉ dùng UUID. FK `Subject` dùng RESTRICT nên subject UUID không thể bị physical-delete khi còn official evidence; rename/deactivation không đổi frozen authorization identity.

D19 V1 không tạo zero-subject revision. Parent-has-at-least-one-child không biểu diễn sạch bằng normal CHECK, nên đây là submit transaction invariant + integration test, không thêm trigger.

### 3.5 `ReportingStatementCommand`

Immutable accepted-command/idempotency receipt. Chỉ committed accepted command mới tồn tại; failed/denied/conflict attempt không để lại command truth, chỉ future bounded AuditEvent theo control-plane policy.

Recommended fields:

- `id UUID PK`
- `commandType ReportingStatementCommandType NOT NULL`
- `actorUserId UUID NOT NULL`
- `requestKey VARCHAR(200) NOT NULL`
- `requestFingerprint VARCHAR(128) NOT NULL`
- `seriesId UUID NOT NULL`
- `targetRevisionId UUID NULL`
- `resultRevisionId UUID NOT NULL`
- `resultLifecycleState ReportingStatementLifecycleState NOT NULL`
- `resultLifecycleToken UUID NOT NULL`
- `submissionAsOfInstant TIMESTAMPTZ(3) NULL`
- `acceptedAt TIMESTAMPTZ(3) NOT NULL DEFAULT now()`

Command enum tối thiểu V1:

- `SUBMIT`
- `APPROVE`
- `REJECT`

Correction successor vẫn là `SUBMIT`; predecessor/supersedes intent thuộc normalized fingerprint/created revision, không cần command type riêng.

Durable idempotency identity:

`(actorUserId, commandType, requestKey)` UNIQUE.

Không đưa `seriesId` hoặc revision target vào unique identity. Nếu cùng actor+commandType+requestKey bị reuse cho series/revision khác, normalized fingerprint phải khác và command phải conflict; không được biến misuse thành một namespace mới.

`submissionAsOfInstant` chỉ có cho accepted SUBMIT và giữ original frozen instant cho replay; approve/reject để NULL. `resultLifecycleToken` lưu exact token đã trả bởi accepted command để replay không bị biến dạng nếu revision sau đó chuyển state tiếp.

### 3.6 `ReportingStatementHistory`

Append-only domain truth cho lifecycle/provenance. Không chứa full canonical snapshot.

Recommended fields:

- `id UUID PK`
- `seriesId UUID NOT NULL`
- `revisionId UUID NOT NULL`
- `eventType ReportingStatementHistoryEvent NOT NULL`
- `stateBefore ReportingStatementLifecycleState NULL`
- `stateAfter ReportingStatementLifecycleState NOT NULL`
- `actorUserId UUID NOT NULL`
- `actorDisplayNameSnapshot VARCHAR(150) NOT NULL`
- `actorStaffCodeSnapshot VARCHAR(50) NULL`
- `commandId UUID NOT NULL`
- `causedByRevisionId UUID NULL`
- `lifecycleTokenBefore UUID NULL`
- `lifecycleTokenAfter UUID NOT NULL`
- `submissionAsOfInstant TIMESTAMPTZ(3) NULL`
- `createdAt TIMESTAMPTZ(3) NOT NULL DEFAULT now()`

History event enum tối thiểu:

- `SUBMITTED`
- `APPROVED`
- `REJECTED`
- `SUPERSEDED`

`SUBMITTED` history chứng minh revision creation + lineage; `SUPERSEDED` dùng `causedByRevisionId` trỏ successor đã được approve. `commandId` nối exact requestKey/fingerprint identity. Không cần copy canonical payload vào history.

## 4. Series identity và locking

D1 logical key được enforce bằng Prisma composite `@@unique` trên 5 field của `ReportingStatementSeries`.

Raw CHECK cần enforce:

- `statementProfile = btrim(statementProfile)` và nonblank;
- `fromCivilDate <= toCivilDate`.

Series row được dùng làm transaction serialization anchor khi đã tồn tại. Future command service nên `SELECT ... FOR UPDATE` exact series row trong outer `SERIALIZABLE` transaction trước series guards/lifecycle writes. Với series chưa tồn tại, unique series key là race backstop; transaction loser được phân loại retryable serialization/unique-race rồi retry/reload, không tạo second series.

Không cần mutable series version nếu exact revision lifecycle token + series row lock + database unique indexes đã có.

## 5. Revision immutability: so sánh hai phương án

### A. Snapshot + lifecycle state cùng revision row

Ưu điểm:

- ít table/join;
- Prisma CRUD đơn giản.

Nhược điểm:

- mọi approve/reject/supersede UPDATE trực tiếp official revision row chứa frozen semantic payload;
- accidental `data: {...}` rộng dễ chạm semantic columns;
- khó review boundary giữa semantic immutability và mutable authority;
- state/index lifecycle và snapshot storage bị coupling.

### B. Immutable revision + 1:1 lifecycle state row

Ưu điểm:

- semantic row insert-only về mặt service contract;
- CAS update chỉ tác động `RevisionState`;
- partial unique current-state indexes đặt trên một bảng nhỏ;
- history reconciliation rõ;
- migration/test có thể kiểm semantic table không có `updatedAt` và service repository không expose update primitive.

Nhược điểm:

- thêm một join và một table;
- cần composite `(revisionId, seriesId)` provenance key/FK.

**Recommendation: B.** Đây là technical design, không thay đổi D3/D6/D7/D15.

## 6. Current SUBMITTED / APPROVED database invariants

Trên `reporting_statement_revision_states` tạo raw PostgreSQL partial unique indexes:

```sql
CREATE UNIQUE INDEX reporting_statement_one_submitted_per_series
ON reporting_statement_revision_states(series_id)
WHERE lifecycle_state = 'SUBMITTED';

CREATE UNIQUE INDEX reporting_statement_one_approved_per_series
ON reporting_statement_revision_states(series_id)
WHERE lifecycle_state = 'APPROVED';
```

Kết quả:

- tối đa 1 unresolved SUBMITTED / series;
- tối đa 1 non-superseded APPROVED / series;
- APPROVED predecessor + SUBMITTED correction successor được phép cùng tồn tại;
- REJECTED/SUPERSEDED không chiếm current slot.

Không dùng current pointers trên Series trong V1. Hai partial indexes là database cardinality authority; lifecycle state là current authority.

Successor approval trong một transaction phải update current approved target `APPROVED -> SUPERSEDED` trước, sau đó target successor `SUBMITTED -> APPROVED`; partial unique index là immediate. Vì transaction atomic, external readers không thấy khoảng giữa; failure rollback cả hai.

## 7. Snapshot storage và semantic hash

### 7.1 Exact canonical representation

`REPORTING_STATEMENT_SNAPSHOT_V1` hash phụ thuộc exact canonical UTF-8 bytes. PostgreSQL `JSONB` không giữ object-key order/whitespace và không thể là nguồn để tái tạo exact bytes.

**Recommendation:** persist authoritative canonical snapshot dưới dạng `TEXT` (`canonicalSnapshotJson`) và hash chính canonical string đó sau khi encode UTF-8 without BOM. Không dùng JSONB làm authoritative snapshot.

V1 **không cần duplicate JSONB**:

- read detail có thể parse canonical text;
- current authority/indexing nằm ở normalized columns/state table;
- subject authorization có normalized `RevisionSubject`;
- tránh risk canonical TEXT và JSONB divergence.

Nếu future analytics cần query sâu vào snapshot, thêm derived non-authoritative projection sau một architecture closure riêng.

### 7.2 Metadata/hashing

Revision lưu explicit:

- `snapshotProfile = REPORTING_STATEMENT_SNAPSHOT_V1`;
- `serializerVersion`;
- `semanticHash CHAR(64)`;
- `asOfInstant`;
- frozen submitter display fields.

`semanticHash` dùng lowercase SHA-256 hex và **không UNIQUE**. Raw CHECK:

```sql
semantic_hash ~ '^[0-9a-f]{64}$'
```

Hash equality không dedupe revision, không chọn current authority, không replay command.

Application canonicalizer phải hash canonical string trước insert; integrity test re-read `canonicalSnapshotJson`, encode UTF-8 without BOM, SHA-256 lại và so exact `semanticHash`.

## 8. Frozen subject index

Recommend normalized `ReportingStatementRevisionSubject` thay vì derive mỗi read từ snapshot JSON.

Lý do:

- D10 non-owner authorization cần “every frozen SUBJECT”; normalized rows cho deterministic set semantics;
- duplicate subject bị DB unique chặn;
- Subject UUID FK RESTRICT giữ exact resource identity;
- rename/deactivation không đổi UUID;
- authorization không phụ thuộc JSON parser/canonical serializer;
- current subject assignment/membership không rewrite historical set.

Subject rows là immutable child của revision. Không physical delete trong service.

V1 parent revision phải có >=1 subject vì D19; enforce transactionally/test, không trigger.

## 9. Idempotency command persistence

### 9.1 Namespace

So sánh:

- `actor + commandType + requestKey`: cùng actor reuse key cho target khác => fingerprint mismatch/conflict.
- `series/revision + actor + commandType + requestKey`: cùng key có thể hợp lệ hóa nhầm trên target khác, làm yếu “consumed command identity”.

**Recommendation:** `UNIQUE(actorUserId, commandType, requestKey)`.

Đây tương tự durable consumed-key registry precedent, nhưng scoped theo actor+command family để tránh unrelated users collision.

### 9.2 Replay semantics

Transaction xử lý theo thứ tự D5/D9/D18:

1. normalize commandType/actor/requestKey/client intent;
2. tính deterministic fingerprint;
3. lookup exact command identity **trước server clock/asOf**;
4. nếu row tồn tại:
   - same fingerprint => replay `resultRevisionId`, `resultLifecycleState`, `resultLifecycleToken`, original `submissionAsOfInstant`;
   - different fingerprint => conflict;
5. chỉ khi không có accepted row mới đi tiếp và pin server command as-of cho SUBMIT.

Concurrent same-key transactions có thể cùng không thấy row trong snapshot ban đầu. `SERIALIZABLE` + command unique constraint đảm bảo chỉ một commit; loser retry transaction rồi nhìn thấy accepted row và replay. Không cần advisory lock/trigger.

Server-pinned as-of, generated UUID/timestamp/token, audit/history IDs và semanticHash không thuộc fingerprint.

## 10. CAS / lifecycle token

`RevisionState.lifecycleToken UUID` là exact CAS token.

Approve/reject predicate tối thiểu:

`revisionId + seriesId + lifecycleState=SUBMITTED + lifecycleToken=expectedToken`.

Accepted transition rotate token sang UUID mới; command receipt/history lưu before/after token phù hợp. `updateMany(...).count === 1` là service CAS proof; zero row => stale/conflict.

Self approve/reject check persisted submitter UUID vs authenticated actor UUID trong cùng transaction trước CAS.

Không cần integer version song song; token đơn đã đủ D14 và tránh hai CAS authority.

## 11. Lineage / supersession topology

Recommend hai self-reference trên immutable revision:

- `predecessorRevisionId`: previous submitted revision in lineage;
- `supersedesRevisionId`: exact current APPROVED authority revision mà correction này dự kiến thay thế khi được approve.

Cả hai nullable, same-series composite FK, `ON DELETE RESTRICT`, CHECK không self-reference.

`predecessorRevisionId` nên UNIQUE để tạo linear submit lineage và ngăn một revision có nhiều direct chronological successors. Concurrent submit đã có series lock + one-SUBMITTED index.

`supersedesRevisionId` **không unique**: một APPROVED revision có thể có correction successor bị REJECTED rồi correction khác sau đó vẫn nhắm cùng current approved authority. Chỉ một unresolved SUBMITTED tồn tại tại một thời điểm.

Long cycle không enforce bằng normal FK/CHECK; service tạo UUID mới và phải validate predecessor/supersedes đều thuộc same series, predecessor là accepted lineage tail thích hợp, supersedes (nếu có) là exact current APPROVED. Không dùng trigger đệ quy.

Khi successor approve:

- lock series;
- verify successor exact SUBMITTED token;
- if `supersedesRevisionId != null`, exact target phải còn `APPROVED`;
- CAS supersedes target `APPROVED -> SUPERSEDED` + rotate token;
- CAS successor `SUBMITTED -> APPROVED` + rotate token;
- append SUPERSEDED + APPROVED history;
- accepted command receipt + success AuditEvent;
- commit atomically.

## 12. Domain history vs AuditEvent

`ReportingStatementHistory` là **domain truth**. `AuditEvent` là cross-cutting sanitized audit.

StatementHistory phải đủ chứng minh business transition dù AuditEvent retention/view policy thay đổi. AuditEvent không chứa canonical snapshot, detail, full manifest, lifecycle secret-like token payload hay unbounded data.

Future successful submit/approve/reject transaction viết:

- domain revision/state;
- StatementHistory;
- ReportingStatementCommand;
- sanitized AuditEvent

trong cùng transaction client. Existing `AuditService.write(..., tx)` hỗ trợ topology này.

Authorization denial không tạo/đổi Statement domain rows; future control plane ghi bounded denied AuditEvent theo accepted authorization policy.

## 13. FK / delete policy

Statement official evidence không được mất qua cascade.

Recommended `ON DELETE RESTRICT` / Prisma `onDelete: Restrict`:

- Series -> submitter User;
- Series -> AcademicYear;
- Revision -> Series;
- Revision -> predecessor/supersedes Revision;
- RevisionState -> Revision/Series;
- RevisionSubject -> Revision/Subject;
- Command -> actor User/Series/target Revision/result Revision;
- History -> Series/Revision/actor User/Command/causedBy Revision.

Không dùng CASCADE hoặc SetNull trong Statement domain tables.

Generic `AuditEvent.actor` giữ precedent `SetNull`; đây không phải domain-history authority và không thay đổi trong persistence foundation.

## 14. Concrete DB constraints

### 14.1 Prisma-representable

- enums lifecycle/command/history event;
- UUID PKs;
- `DATE`, `TIMESTAMPTZ(3)`, bounded `VARCHAR`, `TEXT`;
- Series 5-field `@@unique`;
- RevisionSubject `(revisionId, subjectId)` unique/PK;
- Command `(actorUserId, commandType, requestKey)` unique;
- composite provenance keys/FKs `(revisionId, seriesId)`;
- indexes cho series/history/revision/command reads;
- all historical FKs RESTRICT.

### 14.2 Raw SQL migration

- trimmed/nonblank statementProfile/requestKey/fingerprint/version/profile fields;
- `from_civil_date <= to_civil_date`;
- `semantic_hash` lowercase 64-hex;
- no-self predecessor/supersedes;
- command-type shape (`submissionAsOfInstant` only SUBMIT, target requirement for APPROVE/REJECT);
- history event/state/token/asOf shape;
- one-SUBMITTED partial unique index;
- one-APPROVED partial unique index.

### 14.3 Service/transaction-enforced

- canonical JSON field set/order/undefined/null semantics;
- canonical text rehash equality at insert;
- semantic immutable rows never update;
- lifecycle legal transition graph;
- exact CAS token ownership;
- no self approval/rejection;
- predecessor/supersedes semantic selection and long-cycle prevention;
- current approved target checks;
- at least one RevisionSubject / D19 no ZERO_RESPONSIBILITY;
- snapshot subject set exactly equals RevisionSubject set;
- StatementHistory append-only writes/reconciliation;
- command replay response semantics;
- success domain/history/audit atomicity.

Không cần trigger trong V1 persistence foundation.

## 15. Prisma/PostgreSQL migration ordering

Recommended migration order:

1. create enums;
2. create Series;
3. create Revision không self-FK trước;
4. create RevisionState / RevisionSubject / Command / History;
5. add self/composite Revision FKs sau khi tables/unique provenance keys tồn tại;
6. add CHECK constraints;
7. add partial unique indexes;
8. add supporting indexes;
9. run SQL static/behavior verifier trên fresh PostgreSQL.

Nếu circular relation trong Prisma giữa Revision/Command/History gây migration ordering khó, giữ FK direction một chiều theo authority: Command/History tham chiếu Revision; Revision không tham chiếu Command/History.

## 16. Transaction / locking model

### 16.1 SUBMIT

Outer `SERIALIZABLE`:

1. authenticate + authorize;
2. normalize series key + client command intent;
3. resolve accepted command identity/fingerprint;
4. replay nếu đã accepted;
5. ensure exact Series row trong transaction và lock row;
6. enforce no unresolved SUBMITTED;
7. pin đúng một server command `asOfInstant`;
8. call `PersonalReportingProjection.resolveInTransaction(tx, exactAsOf)`;
9. require `RESPONSIBILITY_PRESENT + PASS`;
10. canonicalize/freeze/hash;
11. insert immutable Revision;
12. insert RevisionSubject set;
13. insert RevisionState=`SUBMITTED` + new token;
14. insert accepted Command;
15. insert SUBMITTED History;
16. write success AuditEvent with same tx;
17. commit.

Nếu ZERO_RESPONSIBILITY/BLOCKED/stale/conflict: throw/rollback => không Series/revision/subject/state/command/history success row được commit. D19 “no series/revision” vì transaction rollback cả Series row vừa tạo.

### 16.2 APPROVE / REJECT

Outer transaction + series row lock:

- idempotency lookup/replay first;
- authorization + distinct actor UUID;
- target exact state/token CAS;
- REJECT: `SUBMITTED -> REJECTED`;
- APPROVE no prior approved: `SUBMITTED -> APPROVED`;
- APPROVE correction: current approved supersession target `APPROVED -> SUPERSEDED`, rồi successor `SUBMITTED -> APPROVED`;
- history/command/audit atomic.

### 16.3 Failure classes

- **IDEMPOTENT_REPLAY:** same actor/type/key/fingerprint accepted earlier.
- **BUSINESS_CONFLICT:** unresolved SUBMITTED, self-decision, invalid lifecycle, changed fingerprint, wrong supersession target.
- **CAS_CONFLICT:** expected lifecycle token/state no longer matches.
- **RETRYABLE_SERIALIZATION:** PostgreSQL serialization/deadlock/unique race produced by concurrent new command; retry whole transaction, không reuse stale clock/result.
- **PERSISTENCE_DEFECT:** invariant/constraint/canonicalization failure ngoài accepted conflict classes; fail closed.

## 17. Migration / test foundation S1–S20

| ID | Required persistence-foundation test |
| --- | --- |
| S1 | Fresh complete migration chain applies on isolated CI PostgreSQL. |
| S2 | `prisma migrate deploy` after first apply reports no pending migration; schema verifier repeatable. Không yêu cầu raw migration.sql chạy lần hai như idempotent DDL. |
| S3 | Exact 5-field series key unique; changing any one component permits distinct series. |
| S4 | Two legitimate revisions may share identical semanticHash; no unique hash constraint. |
| S5 | Partial unique index rejects two `SUBMITTED` state rows in one series. |
| S6 | One `APPROVED` + one `SUBMITTED` correction in same series is allowed. |
| S7 | Partial unique index rejects two simultaneous `APPROVED` state rows. |
| S8 | Transaction fixture proves predecessor APPROVED can become SUPERSEDED and successor APPROVED atomically; invalid intermediate final shape rolls back. |
| S9 | `(actor, commandType, requestKey)` accepts one fingerprint/result and supports lookup basis for replay. |
| S10 | Same command identity cannot be inserted twice with changed fingerprint; unique boundary forces conflict path. |
| S11 | Duplicate `(revisionId, subjectId)` rejected; different frozen subjects allowed. |
| S12 | Delete attempts on referenced User/AcademicYear/Subject/Series/Revision/Command fail by RESTRICT; no Statement CASCADE FK. |
| S13 | predecessor/supersedes self-link rejected; cross-series composite FK rejected. |
| S14 | History table shape has no `updatedAt`; repository/static test exposes append-only create path; update/delete not part of persistence API. |
| S15 | Canonical snapshot TEXT + profile/version/hash/asOf shape; re-read and SHA-256 exact UTF-8 canonical text equals stored hash. |
| S16 | Persistence service/fixture rejects ZERO_RESPONSIBILITY / empty frozen-subject set; rollback leaves no Series/Revision official record. |
| S17 | REJECTED/SUPERSEDED revisions and snapshot/history remain queryable. |
| S18 | Exact lifecycle token CAS: two competing transition attempts yield one winner. |
| S19 | Concurrent submit foundation: one series + at most one current SUBMITTED; loser maps to retry/conflict/replay, never second current row. |
| S20 | New Statement schema verifier inspects tables/enums/checks/FK delete actions/partial indexes/no triggers and CI executes it on fresh PostgreSQL. |

## 18. Static verifier recommendation

Future foundation nên thêm dedicated verifier, ví dụ:

`scripts/ci/verify-reporting-statement-schema.sql`

Verifier phải introspect tối thiểu:

- six Statement tables;
- exact lifecycle/command/history enums;
- `DATE`/`TIMESTAMPTZ(3)` types;
- named CHECK constraints;
- Series composite unique;
- one-SUBMITTED + one-APPROVED partial indexes có `indpred` đúng;
- all Statement domain FKs `confdeltype='r'`;
- absence of non-internal triggers trên Statement tables;
- absence of unique semanticHash;
- absence of cascade deletion;
- behavioral fixture cho S3–S13/S17 và transaction fixture cho current-state shape.

## 19. Next implementation slice boundary

### Slice A — Reporting Statement Persistence Schema Foundation

Được phép:

- Prisma enums/models/relations/indexes;
- one forward migration;
- raw SQL CHECK/partial unique indexes;
- SQL/static schema verifier;
- fresh PostgreSQL migration/invariant tests;
- minimal generated Prisma type compile fallout nếu cần.

Không được phép:

- public controller/routes/DTO/contracts;
- new capabilities/seeds;
- submit/read/approve/reject runtime;
- authorization logic;
- Personal projection changes;
- Statement canonicalizer/service;
- UI/E2E/deploy/production migration.

### Slice B — Internal Persistence / Canonicalization Primitives

Sau Slice A CLOSED/GREEN:

- canonical serializer/hash utility;
- internal Statement repository primitives;
- command replay/CAS helpers;
- tx-aware domain-history writes;
- internal unit/integration tests.

Vẫn không public API/capability.

### Slice C — Control Plane

Sau A+B:

- submit/read/approve/reject command service/controller;
- capability/authorization bindings;
- exact server clock/replay behavior;
- success/denial audit behavior.

### Slice D — Cross-domain E2E / freeze gate

Sau control plane:

- stale source/concurrency/replay/historical drift/SoD/read-scope E2E;
- Core Backend Freeze gate;
- UI sau freeze.

## 20. Decision register PA-D1–PA-D16

| ID | Question | Authority | Classification | Recommendation | PO decision required? | Implementation consequence |
| --- | --- | --- | --- | --- | --- | --- |
| PA-D1 | Entity topology | D3,D6,D7,D13,D17 | TECHNICAL | Series + Revision + RevisionState + RevisionSubject + Command + History | No | 6 physical models, no generic ledger/current-pointer table |
| PA-D2 | Series identity | D1 | ACCEPTED + TECHNICAL mapping | UUID root + exact 5-field unique | No | Prisma composite unique + range/profile CHECK |
| PA-D3 | Revision immutability | D3,D8,D15 | TECHNICAL | semantic Revision insert-only; mutable state separated 1:1 | No | lifecycle update cannot touch snapshot row |
| PA-D4 | Lifecycle storage | D6,D7,D14 | TECHNICAL | RevisionState enum + UUID CAS token | No | state/history exact reconciliation |
| PA-D5 | Current SUBMITTED/APPROVED enforcement | D14,D17 | TECHNICAL | two PostgreSQL partial unique indexes; no Series pointers | No | strong race backstop, no duplicated current authority |
| PA-D6 | Snapshot storage | D3,D4 | TECHNICAL | exact canonical JSON `TEXT`; no authoritative JSONB | No | exact UTF-8 rehash possible |
| PA-D7 | Semantic hash | D4 | ACCEPTED + TECHNICAL mapping | lowercase SHA-256 64-hex, indexed optionally but never unique | No | integrity only |
| PA-D8 | Frozen subject index | D10,D19 | TECHNICAL | normalized immutable `(revisionId, subjectId)` rows | No | deterministic non-owner subject authorization |
| PA-D9 | Idempotency identity | D5,D9,D18 | TECHNICAL | UNIQUE(actorUserId, commandType, requestKey) | No | target/series misuse becomes fingerprint conflict |
| PA-D10 | CAS token | D7,D14 | TECHNICAL | opaque UUID token, rotate every transition; no second version | No | exact one-race-winner predicate |
| PA-D11 | Lineage | D8,D17 | TECHNICAL | predecessor + distinct supersedes target, same-series FKs | No | rejected correction and current-approved replacement both representable |
| PA-D12 | Domain history | D7,D13 | TECHNICAL | append-only History with state/token/actor/command/causedBy/asOf evidence | No | AuditEvent remains separate cross-cutting record |
| PA-D13 | FK/delete policy | D12,D15 | TECHNICAL | RESTRICT all Statement domain FKs | No | official evidence cannot cascade away |
| PA-D14 | PostgreSQL partial indexes/checks | D14,D17 | TECHNICAL | raw migration for current-state partial uniques + shape CHECKs | No | Prisma schema + raw SQL boundary explicit |
| PA-D15 | Transaction/locking | D5,D14,D17,D18 | TECHNICAL | outer SERIALIZABLE + series row lock + DB unique/CAS backstops | No | retry whole tx on serialization, no mixed snapshot |
| PA-D16 | Implementation/test boundary | D16 | TECHNICAL | A schema foundation -> B internal primitives -> C control plane -> D E2E/freeze | No | avoids premature API/capability coupling |

## 21. True Product Owner gaps

**Không có TRUE PRODUCT OWNER GAP cho persistence foundation.**

Các nội dung còn deferred trong ADR-042 như numeric limits, archive/export/pagination/SLO, delegation/quorum và future zero-subject policy không cần quyết định để tạo V1 persistence foundation hiện tại. Persistence design giữ khả năng mở rộng nhưng không invent behavior cho các deferral đó.

Không cần reopen D1–D19 và không cần Product Owner chọn table/index.

## 22. Audit conclusion

**READY FOR TECHNICAL DECISION CLOSURE.**

Recommended next step là ChatGPT review/chốt PA-D1–PA-D16 thành technical decision closure; sau đó mới authorize Slice A schema/migration. Không tạo ADR mới trước closure đó.

REPORTING STATEMENT PERSISTENCE ARCHITECTURE AUDIT COMPLETE — READY FOR TECHNICAL DECISION CLOSURE
