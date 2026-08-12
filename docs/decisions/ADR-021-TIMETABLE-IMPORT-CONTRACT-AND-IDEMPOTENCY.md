# ADR-021 — Timetable Import Contract and Idempotency

- **Status:** Accepted
- **Date:** 2026-08-12
- **Scope:** LOCAL-FC-04B3 timetable import architecture
- **Supporting audit:** [LOCAL-FC-04B3 Timetable Import Contract Audit](../requirements/LOCAL-FC-04B3-TIMETABLE-IMPORT-CONTRACT-AUDIT.md)

## Context

**CONFIRMED:** PA-B v1.2 requires Excel timetable upload, profile/sheet selection, column detection, remembered aliases, validation, compare/preview, approval, activation and checksum/idempotency. It does not publish official extensions, headers, profile scope, partial-acceptance rules, checksum algorithm or row-error transport. Decisions below that fill those gaps are accepted architecture, not retroactively attributed to the source.

**CONFIRMED:** ADR-017 through ADR-020 already establish AcademicYear-owned timetable versions, one exact slot per normal entry, TeachingAssignment provenance plus teacher snapshot, atomic replace-all DRAFT content, current-scope validation and the approval/activation/history lifecycle. `contentChecksum` is nullable and indexed but not globally unique. There is no current import profile, alias, receipt, idempotency persistence or workbook parser.

## Source-backed constraints

- Raw source names are normalized through aliases to stable canonical teacher/class/subject identities.
- The pipeline is upload → parse sheet/header/data region → normalize → validate → preview add/change/remove/errors/warnings → transactional commit and audit.
- Equal checksum or idempotency key must not create duplicate content.
- Import must not bypass `TIMETABLE_MANAGE / SCHOOL_WIDE`, the DRAFT lifecycle, the existing evaluator or activation recheck.
- Completeness, PPCT association, special-activity collision and Room remain deferred because their canonical models/rules do not yet exist.

## Decision

### 1. Input and workbook mapping

The first release accepts `.xlsx` only; `.xls` and `.csv` are rejected. This format choice is architecture, not a source requirement. Content parsing is authoritative and must agree with the claimed extension/media type.

One explicitly selected visible nonblank worksheet produces one candidate import. Sheets are never silently concatenated. A bounded header-row candidate must be explicitly confirmed, and actual 1-based source row addressing is preserved. Fully blank rows may be ignored; partially blank mapped rows, nonblank hidden mapped data, unsupported merged mapped cells and duplicate canonical rows are blocking. No row is silently omitted or collapsed.

Profiles are school-wide configuration authorized by `TIMETABLE_MANAGE / SCHOOL_WIDE`. Header/column mapping policy is distinct from typed, source/profile-scoped entity aliases; both are auditable. One active typed alias key cannot map to multiple canonical IDs in the same scope. No fixed official header template is established by this ADR.

### 2. Canonical entity resolution

Canonical import semantics are weekday, an active exact regular-teaching slot revision, a same-year active class, an active subject and one eligible teacher. TeachingAssignment and its teacher snapshot are server-derived.

Class and subject use exact normalized canonical codes or approved typed aliases. Fuzzy matching and name-only silent selection are forbidden. A conflicting exact identifier and alias is blocking.

A teacher mapping uses an explicit `STAFF_CODE`, `USERNAME` or `APPROVED_ALIAS` mode when the source namespace is known. For a generic teacher value, all permitted exact namespaces are searched without precedence and results are deduplicated by canonical User ID: zero IDs is missing, one resolves, and more than one is a blocking ambiguity. Display names are candidate/help text only.

### 3. Preview and atomic confirmation

Inspection, mapping and preview do not create a TimetableVersion while blocking errors remain. Preview compares with the ADR-020 timetable effective at the candidate `effectiveFrom`; a user-selected alternative may be an additional view, not the default baseline. Diff identity is weekday + exact slot business coordinate/revision + class; subject and TeachingAssignment/teacher provenance are compared as payload.

Confirmation is one serializable transaction that enforces replay identities and creates the committed receipt, DRAFT, target, complete normalized entry set, semantic checksum and audit. There is no partial timetable, invalid-row omission or automatic approve/activate. Optional attempt/preview persistence is separate from the committed receipt.

### 4. Semantic checksum and duplicate identity

`contentChecksum` is SHA-256 lowercase hexadecimal over deterministic UTF-8 `semantic-v1` serialization of sorted canonical normal entries. SHA-256 and this serialization are accepted architecture, not source requirements. Every row contains exactly:

- `weekday`
- `timeSlotDefinitionId`
- `schoolClassId`
- `subjectId`
- `teachingAssignmentId`
- `teacherUserId`

Entry IDs, timestamps, raw headers/spelling, file metadata and target fields are excluded. Exact slot revision identity is intentionally included through `timeSlotDefinitionId`.

The separately enforceable semantic duplicate key is `academicYearId + calendarVersionId + effectiveAcademicWeekId + semanticChecksum`. Equal content at a different target is allowed; different request keys cannot bypass this invariant.

### 5. Request idempotency

Request idempotency is distinct from semantic duplication. The durable namespace/composite key and canonical fingerprint encoding are designed in 04B3B/C, with these required behaviors:

- same key and same deterministic request fingerprint replays the original result;
- same key and materially different fingerprint returns a 409 conflict;
- different keys with the same semantic duplicate key return `IDEMPOTENT_REPLAY`.

The fingerprint is bounded and covers the committed semantic identity plus mapping/profile/target-version context needed to distinguish a retry from key reuse. Raw workbook content is not stored as an unbounded fingerprint payload.

### 6. Receipt identity, replay and imported-DRAFT immutability

A committed `TimetableImportReceipt` is immutable provenance for exactly one successfully created TimetableVersion, and an imported TimetableVersion has at most one committed receipt. Conceptually it records AcademicYear, target calendar version and AcademicWeek, checksum algorithm/serialization version, semantic checksum, created TimetableVersion, actor, commit timestamp, bounded source/profile provenance and optional request-idempotency identity/fingerprint. The authoritative relation must identify whether a version is import-backed; exact names and FK direction belong to 04B3B. Failed inspection/parsing attempts are not committed receipts.

Semantic and request replay return the original receipt-linked version with its current lifecycle status and outcome `IDEMPOTENT_REPLAY`; a new DRAFT is never created because the original has progressed. A first commit returns `CREATED`.

For a receipt-backed DRAFT, target, normalized entry set and `contentChecksum` are immutable through generic 04B1 target/replace-all commands. Future 04B3C must return a 409 domain conflict from those commands. Manual DRAFTs without a receipt retain current 04B1 behavior and may keep `contentChecksum = null`. Changing imported content requires a future accepted copy/new-manual-DRAFT workflow; the original receipt/version link is never detached.

### 7. Raw workbook retention

04B3B must not store raw workbook bytes in PostgreSQL. Bounded transient upload/preview storage is allowed. Whether durable raw bytes are retained externally, and for how long, remains unresolved and requires a separate decision. Durable bounded receipt/profile/version/target provenance and audit are required; workbook contents must not be logged.

### 8. Parser and security boundary

No parser package or version is selected here. 04B3C must perform a pinned dependency/security spike for Node 22 and define tested upload, expansion, dimension, string and processing-time limits. Formula cells in mapped fields, macros, encrypted workbooks, external links and unsupported structures are rejected; workbook content is never executed or evaluated.

## Alternatives considered

- **Raw-file checksum as business identity:** rejected because harmless workbook metadata/format changes alter bytes.
- **Global unique `TimetableVersion.contentChecksum`:** rejected because equal content at another target is valid.
- **Application lookup only:** rejected because concurrent identical confirmation races.
- **Immediate version creation on upload:** rejected because unreadable/unmapped files would pollute timetable history.
- **Partial valid-row DRAFT:** rejected because it hides omissions and conflicts with atomic replace-all semantics.
- **Cross-namespace teacher precedence:** rejected because it can silently select the wrong User.
- **Mutating or detaching a receipt-backed DRAFT:** rejected because replay would no longer identify immutable committed content.

## Persistence consequences

04B3B is required before the import API. It must add reviewed persistence and migrations for school-wide profiles, separate typed aliases, committed receipts/provenance, semantic duplicate uniqueness, request-idempotency identity/fingerprint and the authoritative receipt/version relation. Normal timetable tables and the existing nullable `contentChecksum` field remain the baseline; no global checksum uniqueness is added. Exact Prisma names, indexes, profile versioning and FK direction remain implementation design choices constrained by this ADR.

## API consequences

04B3C separates bounded inspection/mapping/preview from confirmation. Confirmation returns `CREATED` or `IDEMPOTENT_REPLAY` and the receipt-linked version with its current status. Errors use stable categories/codes and sanitized bounded source addressing. Target selection remains server-owned calendar/week input, and import ends at DRAFT. Existing validate → approve → activate commands remain authoritative.

## Remaining questions

- Exact Prisma names, profile representation/versioning and receipt FK direction.
- Exact request-key namespace/index and fingerprint serialization.
- Parser package/version and numeric security limits.
- Durable raw workbook retention outside PostgreSQL.
- Multi-period normalization beyond the first-release blocking behavior.
- Future copy/manual/bulk UI and abandoned-DRAFT retention.
- Completeness, PPCT, special activities and Room.

## Explicit non-scope

This ADR accepts architecture only. It does not implement or authorize schema/migrations, dependency installation, parser/API/contracts/tests/UI, external raw-file storage, completeness, PPCT, special activities, CalendarException, substitutions/make-up, Room, deployment or production access. ADR-015 remains Proposed. Implementation requires the separate 04B3B and 04B3C tasks and the repository review gates.
