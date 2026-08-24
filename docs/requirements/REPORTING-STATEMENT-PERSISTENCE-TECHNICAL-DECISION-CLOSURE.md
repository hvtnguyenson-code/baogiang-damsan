# Reporting Statement Persistence Foundation — Technical Decision Closure

## 1. Status / authority

**Status: TECHNICAL DECISION CLOSED.**

Authority không thay đổi:

- Product Owner D1–D19 trong `LOCAL-FC-05I0D-SUBMISSION-APPROVAL-SNAPSHOT-DECISION-CLOSURE.md`;
- `ADR-042-SUBMISSION-APPROVAL-SNAPSHOT.md`;
- `ADR-043-PERSONAL-REPORTING-PROJECTION.md`;
- `ADR-041-REPORTING-PROJECTION.md`.

Tài liệu này chỉ chốt physical persistence design từ `REPORTING-STATEMENT-PERSISTENCE-ARCHITECTURE-AUDIT.md`. Không reopen business authority, không tạo ADR mới, không authorize public API/capability/UI/deploy/production mutation.

Không có TRUE PRODUCT OWNER GAP cho V1 persistence foundation.

## 2. Accepted technical decisions PA-D1–PA-D16

### PA-D1 — Entity topology

Accepted physical models:

1. `ReportingStatementSeries`
2. `ReportingStatementRevision`
3. `ReportingStatementRevisionState`
4. `ReportingStatementRevisionSubject`
5. `ReportingStatementCommand`
6. `ReportingStatementHistory`

Không current-pointer table, draft table, generic event ledger, snapshot table riêng, cache/materialized report table trong V1 foundation.

### PA-D2 — Series identity

`ReportingStatementSeries` dùng UUID PK và exact unique logical key:

`statementProfile + submitterUserId + academicYearId + fromCivilDate + toCivilDate`.

Civil dates dùng PostgreSQL `DATE`. `statementProfile` trimmed/nonblank. Raw CHECK `fromCivilDate <= toCivilDate`.

Không dùng semanticHash/requestKey/createdAt/current assignment làm series identity.

### PA-D3 — Revision semantic immutability

`ReportingStatementRevision` là immutable semantic/provenance row, insert-only theo service contract, không `updatedAt`.

Lifecycle state không nằm trong semantic revision row; nó được tách 1:1 sang `ReportingStatementRevisionState`.

Revision fields tối thiểu:

- UUID id;
- seriesId;
- predecessorRevisionId;
- supersedesRevisionId;
- snapshotProfile;
- serializerVersion;
- canonicalSnapshotJson TEXT;
- semanticHash CHAR(64);
- asOfInstant TIMESTAMPTZ(3);
- frozen submitter displayName/staffCode;
- submittedAt TIMESTAMPTZ(3).

### PA-D4 — Lifecycle storage

`ReportingStatementRevisionState` là mutable lifecycle authority:

- revisionId UUID PK;
- seriesId UUID;
- lifecycleState;
- lifecycleToken UUID;
- updatedAt TIMESTAMPTZ(3).

Lifecycle enum exact:

`SUBMITTED | APPROVED | REJECTED | SUPERSEDED`.

Semantic revision row không được update khi approve/reject/supersede.

### PA-D5 — Current SUBMITTED / APPROVED enforcement

Database authority dùng hai PostgreSQL partial unique indexes trên `RevisionState.seriesId`:

- unique where `lifecycleState = SUBMITTED`;
- unique where `lifecycleState = APPROVED`.

Không thêm `currentSubmittedRevisionId` hoặc `currentApprovedRevisionId` vào Series trong V1.

APPROVED predecessor + SUBMITTED correction successor được phép cùng tồn tại.

Successor approval transaction phải supersede current approved target trước rồi approve successor, cùng transaction, để partial unique index không có intermediate violation.

### PA-D6 — Snapshot storage

Canonical snapshot authority lưu bằng `TEXT` exact canonical JSON string.

Không dùng JSONB làm authoritative snapshot vì JSONB không giữ exact canonical byte representation.

V1 không duplicate JSONB. Future analytics/query projection cần architecture closure riêng và phải non-authoritative.

### PA-D7 — Semantic hash

`semanticHash` là lowercase SHA-256 hex 64 ký tự của exact canonical UTF-8-without-BOM JSON.

Raw CHECK 64 lowercase hex.

`semanticHash` **không UNIQUE** và không tham gia identity/idempotency/current authority.

### PA-D8 — Frozen subject index

`ReportingStatementRevisionSubject` là immutable normalized frozen-subject set:

- revisionId UUID;
- subjectId UUID;
- createdAt;
- unique/PK `(revisionId, subjectId)`.

Non-owner SUBJECT authorization dùng exact frozen subject UUID set này, không derive từ snapshot JSON hoặc current assignment/membership.

D19 no-zero-subject V1 được enforce transactionally; không trigger chỉ để ép parent có child.

### PA-D9 — Command idempotency identity

`ReportingStatementCommand` là immutable accepted-command receipt.

Command types tối thiểu:

`SUBMIT | APPROVE | REJECT`.

Correction successor là `SUBMIT`, không command type riêng.

Durable unique identity:

`(actorUserId, commandType, requestKey)`.

Không đưa series/revision target vào unique key. Reuse same actor/type/key cho target khác phải trở thành fingerprint conflict.

Command fields phải retain series/target/result revision, accepted result state/token, và original submissionAsOfInstant cho SUBMIT replay.

Failed/denied/conflict attempt không commit command receipt.

### PA-D10 — Lifecycle CAS token

Exact CAS authority là opaque UUID `lifecycleToken` trên RevisionState.

Accepted transition predicate gồm exact revision + series + expected state + expected lifecycleToken.

Mỗi accepted transition rotate token.

Không thêm integer version song song trong V1.

Command receipt/history retain result/before-after token evidence cần thiết cho exact replay/provenance.

### PA-D11 — Lineage and supersession

Revision có hai self-reference khác nghĩa:

- `predecessorRevisionId`: previous submitted revision trong linear lineage;
- `supersedesRevisionId`: exact current APPROVED revision mà correction dự kiến thay thế khi approved.

Cả hai phải cùng series và `ON DELETE RESTRICT`.

`predecessorRevisionId` unique để không có multiple direct chronological successors.

`supersedesRevisionId` không unique: một current approved revision có thể có correction attempt bị REJECTED rồi correction attempt sau, nhưng one-SUBMITTED index không cho concurrent unresolved branches.

Raw CHECK cấm self-reference. Long-cycle/business-tail validation thuộc service transaction, không trigger.

### PA-D12 — Domain history

`ReportingStatementHistory` là append-only domain truth, tách biệt `AuditEvent`.

History event enum tối thiểu:

`SUBMITTED | APPROVED | REJECTED | SUPERSEDED`.

History retain:

- series/revision;
- state before/after;
- actor UUID + frozen bounded displayName/staffCode;
- commandId;
- causedByRevisionId khi supersession;
- lifecycle token before/after;
- submissionAsOfInstant cho SUBMITTED;
- immutable createdAt.

History không chứa canonical snapshot payload.

### PA-D13 — FK / delete policy

Mọi Statement domain/history FK dùng `ON DELETE RESTRICT`:

- User;
- AcademicYear;
- Subject;
- Series;
- Revision;
- Command;
- History related revision.

Không CASCADE/SetNull trong Statement domain persistence.

Existing generic `AuditEvent.actor` SetNull không thay đổi và không phải domain-history authority.

### PA-D14 — Prisma vs raw PostgreSQL boundary

Prisma owns:

- enums/models;
- UUID/date/timestamp/bounded text types;
- normal unique/indexes;
- composite provenance keys/FKs;
- RESTRICT relations.

Raw forward migration owns:

- trimmed/nonblank CHECKs;
- series range CHECK;
- semanticHash 64-hex CHECK;
- no-self lineage CHECKs;
- command type/result/asOf shape CHECKs;
- history event/state/token/asOf shape CHECKs;
- one-SUBMITTED partial unique index;
- one-APPROVED partial unique index.

Không trigger trong V1 foundation.

### PA-D15 — Transaction / locking model

Future mutating commands dùng one outer `SERIALIZABLE` transaction.

Accepted command identity/fingerprint lookup xảy ra trước server clock/asOf.

Series row là lock anchor (`FOR UPDATE`) khi tồn tại. Exact series unique key xử lý creation race.

Database backstops:

- series unique;
- command unique;
- one SUBMITTED partial unique;
- one APPROVED partial unique;
- exact lifecycle CAS token.

Retryable serialization/unique race phải retry **whole transaction**, không reuse stale clock/projection.

Failure classes được giữ tách biệt: idempotent replay, business conflict, CAS conflict, retryable serialization, persistence defect.

### PA-D16 — Implementation boundary / sequence

Accepted sequence:

**Slice A — Persistence Schema Foundation**

- Prisma enums/models/relations/indexes;
- one forward migration;
- raw CHECKs/partial indexes;
- dedicated SQL/static schema verifier;
- fresh PostgreSQL migration/invariant tests.

Không runtime Statement service/controller/capability/canonicalizer.

**Slice B — Internal Persistence / Canonicalization Primitives**

- canonical serializer/hash;
- internal repository primitives;
- idempotency/CAS/history helpers;
- internal tests.

**Slice C — Control Plane**

- submit/read/approve/reject service/controller;
- authorization/capability bindings;
- clock/replay/audit behavior.

**Slice D — Cross-domain E2E / Core Backend Freeze**

- stale/concurrency/replay/historical drift/SoD/read-scope E2E;
- freeze gate;
- UI only after freeze.

## 3. Exact model blueprint for Slice A

### 3.1 Series

Required shape:

- UUID PK;
- statementProfile bounded string;
- submitterUserId UUID RESTRICT;
- academicYearId UUID RESTRICT;
- from/to `DATE`;
- createdAt;
- exact 5-field unique;
- nonblank/profile and date-range CHECKs.

### 3.2 Revision

Required shape:

- UUID PK;
- seriesId;
- predecessorRevisionId nullable;
- supersedesRevisionId nullable;
- snapshotProfile;
- serializerVersion;
- canonicalSnapshotJson TEXT;
- semanticHash CHAR(64) nonunique;
- asOfInstant TIMESTAMPTZ(3);
- frozen submitter display evidence;
- submittedAt;
- no updatedAt;
- composite `(id, seriesId)` provenance unique;
- same-series predecessor/supersedes composite FKs;
- no-self CHECKs.

### 3.3 RevisionState

Required shape:

- revisionId PK;
- seriesId;
- lifecycle enum;
- lifecycleToken UUID;
- updatedAt;
- composite FK proving revision belongs series;
- partial uniques for SUBMITTED/APPROVED.

### 3.4 RevisionSubject

Required shape:

- revisionId;
- subjectId;
- createdAt;
- exact unique pair;
- Revision/Subject RESTRICT.

### 3.5 Command

Required shape:

- UUID PK;
- commandType;
- actorUserId;
- requestKey;
- requestFingerprint;
- seriesId;
- targetRevisionId nullable;
- resultRevisionId;
- resultLifecycleState;
- resultLifecycleToken;
- submissionAsOfInstant nullable;
- acceptedAt;
- unique `(actorUserId, commandType, requestKey)`;
- command-shape CHECKs;
- no updatedAt.

### 3.6 History

Required shape:

- UUID PK;
- seriesId/revisionId;
- eventType;
- stateBefore/stateAfter;
- actor UUID/display evidence;
- commandId;
- causedByRevisionId nullable;
- lifecycleTokenBefore/After;
- submissionAsOfInstant nullable;
- createdAt;
- no updatedAt;
- history-shape CHECKs;
- all RESTRICT.

## 4. Slice A verification matrix S1–S20

Slice A implementation chỉ được coi là green khi fresh CI PostgreSQL chứng minh đủ S1–S20 từ audit:

- S1 fresh migration chain;
- S2 second migrate-deploy no pending + verifier repeatability;
- S3 exact series unique;
- S4 equal semanticHash allowed;
- S5 one SUBMITTED;
- S6 APPROVED + SUBMITTED allowed;
- S7 one APPROVED;
- S8 successor state transition shape/rollback;
- S9 command identity basis;
- S10 changed fingerprint collision basis;
- S11 subject uniqueness;
- S12 no destructive cascade;
- S13 self/cross-series lineage rejected;
- S14 append-only history persistence surface;
- S15 canonical TEXT/hash shape and rehash fixture;
- S16 ZERO_RESPONSIBILITY/empty subject cannot produce committed official revision through persistence primitive;
- S17 rejected/superseded readable;
- S18 CAS race foundation;
- S19 concurrent submit foundation;
- S20 dedicated Statement schema verifier recognized by CI.

Schema-only Slice A có thể chứng minh structural parts của S8/S16/S18/S19 bằng SQL fixture/constraint race foundation; full runtime command semantics vẫn thuộc Slice B/C/D.

## 5. Explicit non-scope of Slice A

Slice A không được thêm/sửa:

- public controller/route/DTO/contracts;
- capability catalog/seed/grant behavior;
- authorization service;
- Personal Reporting Projection semantics;
- Reporting Projection/ProgressDebt;
- Statement submit/read/approve/reject runtime;
- canonical serializer production utility;
- UI;
- deploy/VPS/production migration/data mutation.

Không dùng local stale PostgreSQL làm authority; fresh GitHub CI PostgreSQL là gate.

## 6. Closure conclusion

PA-D1–PA-D16 được **ACCEPTED AS TECHNICAL DESIGN** trên nền Product Owner D1–D19 đã accepted.

Không còn architecture/PO blocker trước Slice A.

**REPORTING STATEMENT PERSISTENCE TECHNICAL DESIGN — CLOSED / READY FOR SEPARATELY AUTHORIZED SLICE A PERSISTENCE SCHEMA FOUNDATION.**
