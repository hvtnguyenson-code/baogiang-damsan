# LOCAL-FC-04B3 — Timetable Import Contract and Idempotency Audit

**Status:** Requirements audit; import architecture accepted by ADR-021 and persistence foundation accepted by ADR-022

**Date:** 2026-08-12

**Scope:** Excel timetable import contract only; no parser, API, schema, migration, UI, test, dependency, or deployment is authorized

Classification used throughout:

- **CONFIRMED** — stated by an authoritative source or fixed by an accepted ADR/current implementation.
- **PROPOSED** — proposal recorded during the audit; superseded where ADR-021 now states an accepted decision.
- **DEFERRED** — intentionally belongs to a later domain or slice.
- **UNRESOLVED** — source evidence is insufficient; review/approval is required.

## 1. Scope and source priority

This audit closes enough of the import contract to avoid making a parser invent business rules. It does not reopen AcademicYear ownership, normal-entry shape, DRAFT authoring, lifecycle, capability, historical resolution, PPCT, special activities, or Room.

Source priority follows the v1.3 addendum and ADR-003:

1. `PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md`.
2. Accepted ADRs, especially ADR-008, ADR-010, ADR-012/013 and ADR-016 through ADR-020.
3. `PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx`.
4. `LOCAL-FC-04-TIMETABLE-DOMAIN-SPEC.md`, current schema/contracts/API/tests.
5. Prototype HTML, marked **PROTOTYPE REFERENCE ONLY**.

The v1.2 DOCX was inspected directly with its Word paragraph and table order preserved. The audit read §§5–9, §12, §14 and Appendices A–D, then searched the complete document for Excel/upload/import/sheet/column/header/mapping/alias/profile/checksum/duplicate/preview/compare/error/row and timetable entity terms.

## 2. Exact source evidence

| Evidence locator | Nearby heading/context | Requirement established |
|---|---|---|
| v1.2 §5.1–5.2, tables 15–18 | Data contracts; alias/import profiles; atomicity/idempotency | **CONFIRMED:** timetable versions/entries are retained; aliases map source values to canonical identifiers; multi-table writes are transactional; client commands have idempotency keys; commit follows successful validation. |
| v1.2 §5.4, paragraph 98 and table 18 | “Alias và hồ sơ import” | **CONFIRMED:** an unresolved source value is mapped by Admin, stored by data type and source, and recognized on later imports. No profile/alias ownership scope is stated. |
| v1.2 §5.5, paragraphs 101–106 | “Tính nguyên tử và idempotency” | **CONFIRMED:** all-or-rollback transactions, concurrency protection and durable idempotency-key handling are required generally. |
| v1.2 §7.1, paragraph 130 | TKB version effectivity | **CONFIRMED:** each upload creates a version; effect starts at the selected business week and the server displays the derived effective date. |
| v1.2 §7.2, table 24 | Import flow | **CONFIRMED:** upload → choose sheet/profile → detect columns → aliases → validate → compare → preview → approve → activate; equal checksum or idempotency key must not create a duplicate. |
| v1.2 §7.3, paragraphs 135–142 | Timetable validation | **CONFIRMED:** errors include missing/inactive teacher, unknown class/subject, teacher/class collision, duplicate/missing weekday-session-period, PPCT gap, teacher change and locked/special conflict. |
| v1.2 §7.4–7.5, paragraphs 144–153 and table 25 | Configurable clock grid/collision | **CONFIRMED:** morning/afternoon/evening slots are configurable; collisions use real time, not label equality. |
| v1.2 §§8–9 | PPCT and operational changes | **CONFIRMED:** PPCT/progress/debt and substitution/make-up are downstream domains, not import-row persistence. |
| v1.2 §12.1–12.2, paragraphs 208–213 | Historical reports/snapshots | **CONFIRMED:** reports resolve the versions effective on each date; frozen statements retain source hash/version and do not silently change. |
| v1.2 §14.2–14.3, paragraphs 243–245 and tables 44–45 | Admin import configuration/pipeline | **CONFIRMED:** Admin manages alias/profile; teachers do not normalize input; parse reads sheet/header/data region by profile; preview shows add/change/remove/errors/warnings; commit records batch and audit. |
| v1.2 Appendix A, table 61 | TKB lifecycle | **CONFIRMED:** `DRAFT`, `VALIDATED`, `APPROVED`, `ACTIVE`, `SUPERSEDED`. |
| v1.2 Appendix B, table 62 | Calendar/teaching scenarios | **CONFIRMED:** split/reserve-week and downstream teaching semantics remain calendar/domain concerns. |
| v1.2 Appendix C, tables 63.13–63.14 and 63.26 | Proposed persistence inventory | **CONFIRMED as source intent:** `timetable_versions/entries`, `import_batches/import_aliases`, and `idempotency_keys` are proposed concepts. Exact columns are not specified. |
| v1.2 Appendix D, tables 64.02–64.06 | Required operational configuration | **CONFIRMED:** time grid, master identities, timetable versions, import profiles and aliases must be configured. |
| v1.3 addendum §§1, D–E | Authority, database and agent boundaries | **CONFIRMED:** accepted ADRs override lower sources; schema changes use reviewed Prisma Migrate; this docs-only task cannot implement persistence. |
| ADR-017/019/020 | Current accepted timetable baseline | **CONFIRMED:** `contentChecksum` is nullable/indexed, not globally unique; normalized replace-all and current-scope validation are reused; import stops before existing approve/activate commands. |

The source repeatedly says “Excel” but names no official `.xlsx`, `.xls`, or `.csv` extension and publishes no fixed column template.

## 3. Prototype-only evidence

**PROTOTYPE REFERENCE ONLY:** `docs/prototypes/ui-reference-phuong-an-b.html` lines 532–560 shows a “Phiên bản Thời Khóa Biểu” block with “+ Upload TKB Excel”, a future week label, “Preview Lỗi”, and “Kích hoạt”. It supports likely terminology and a staged workflow only. It has no sheet picker, mapping/profile model, header contract, row-error contract, checksum behavior, or authoritative authorization semantics.

## 4. Current implementation inventory

- `TimetableVersion` is AcademicYear-owned and has nullable indexed `contentChecksum`; no unique checksum constraint exists.
- `TimetableEntry` is one normal lesson per exact slot revision and stores class, subject, TeachingAssignment provenance and immutable teacher snapshot.
- 04B1 exposes server-numbered DRAFT creation, target selection, atomic replace-all normalized entries and current normal-base validation.
- 04B2 exposes approval, activation, supersession and inclusive historical date resolution.
- All timetable routes use `TIMETABLE_MANAGE / SCHOOL_WIDE`; `SYSTEM_ADMIN` is not a bypass.
- Schema contains no import batch/attempt, mapping profile, header alias, value alias, import source metadata or generic idempotency-key table.
- User preference/system-setting/catalog infrastructure is not a safe owner for typed mapping profiles and entity aliases.
- `package.json`, `apps/api/package.json` and `package-lock.json` contain no workbook parser such as ExcelJS, SheetJS or `xlsx`.

## 5. Confirmed and unresolved import requirements

### Confirmed

- Excel input, reusable profile/sheet selection, column detection, alias mapping, validation, compare/preview, approval and activation.
- Each non-replay import produces a versioned candidate; identical content/idempotency replays do not create duplicate data.
- Admin resolves unknown source values; aliases are remembered by data type and source.
- Commit is transactional and follows validation; import does not auto-approve or auto-activate.
- Preview distinguishes added, changed, removed rows, errors and warnings.

### Unresolved

- Exact file extensions and MIME policy; whether legacy `.xls` or `.csv` is official.
- Official headers/template versions, fixed/detected header row and pre-header title rows.
- Whether one import may combine multiple sheets.
- Profile scope and whether it remembers preferred sheet/header row.
- Whether “alias” includes header aliases, entity-value aliases, or both; §5.4 explicitly confirms value/entity alias behavior.
- Partial acceptance, row-error transport, multi-period/merged cells, formula cells, file retention, numeric upload limits and abandoned import retention.
- Checksum algorithm, checksum source, idempotency scope and duplicate response shape.

| Format claim | Classification |
|---|---|
| The workflow accepts an Excel workbook | **CONFIRMED** |
| Generic workbook support beyond Excel | **UNRESOLVED** |
| Official `.xlsx`, `.xls`, or `.csv` extension list | **UNRESOLVED** |
| `.xlsx` is the likely modern first format | **INFERRED**, but insufficient to make it a requirement |

**ACCEPTED ARCHITECTURE — NOT SOURCE REQUIREMENT:** the first release supports `.xlsx` only; `.xls` and `.csv` are rejected. Extension and MIME must agree, but content parsing—not client MIME alone—is authoritative.

## 6. Workbook, sheet and header contract

| Question | Source evidence | Status | Recommended 04B3 behavior |
|---|---|---|---|
| Multiple workbook sheets | v1.2 table 24 says choose sheet/profile. | **CONFIRMED** that sheet choice exists; exact first-release behavior is an architecture decision. | **ACCEPTED:** inspect candidates and import one explicitly selected visible nonblank sheet; never concatenate sheets silently. |
| Preferred sheet in profile | Parse uses profile; no owned fields listed. | **UNRESOLVED** | Profile may store a preferred sheet name as a hint; missing/renamed sheet blocks and requires reselection. |
| Hidden/blank sheets | No source rule. | Source detail **UNRESOLVED** | **ACCEPTED:** only a visible nonblank worksheet is selectable; hidden nonblank mapped data is blocking, not silently ignored. |
| Combine sheets | No source evidence. | Source detail **UNRESOLVED** | **ACCEPTED:** one sheet per import/version; never silently concatenate. |
| Header row | v1.2 table 45 says profile reads header/data region. | **CONFIRMED** configurable/detected concept; exact source rule unresolved. | **ACCEPTED:** detect bounded candidates and require one selected/confirmed 1-based header row. |
| Pre-header title rows | Implied by configurable header/data region only. | **INFERRED** possibility | Ignore rows before the confirmed header; preserve actual source row numbers. |
| Raw headers | No fixed template. | **UNRESOLVED** | Raw headers are import metadata only, never canonical domain fields. Reject duplicate mappings to one singleton semantic field. |

## 7. Canonical semantic field analysis

| Semantic field | Classification | Resolution contract |
|---|---|---|
| `weekday` | **REQUIRED** | Parse explicit weekday/business value; no ISO-week/date inference. |
| time-slot coordinate | **REQUIRED** | Resolve AcademicYear + weekday + session + ordinal, optionally corroborated by label/clock interval, to one active `allowRegularTeaching=true` revision. |
| `schoolClass` | **REQUIRED** | Resolve same-year active class by normalized canonical code first, then an approved value alias. Name alone must not silently choose among candidates. |
| `subject` | **REQUIRED** | Resolve active subject by normalized code first, then approved value alias. |
| teacher identity | **REQUIRED** | Resolve one active teaching user via staff code/username or approved value alias; display name alone is ambiguous evidence. |
| `teachingAssignmentId` | **DERIVED** | Resolve from AcademicYear + class + subject + teacher and target coverage; workbook UUID is neither required nor trusted. |
| `teacherUserId` snapshot | **DERIVED** | Server copies it from the resolved TeachingAssignment. |
| session | **REQUIRED OR DERIVED** | Required when ordinal/label is not globally unambiguous; preferably map explicitly. |
| period ordinal | **REQUIRED OR DERIVED** | Canonical slot business coordinate; may be derived only from an unambiguous slot alias/label. |
| slot label/clock interval | **OPTIONAL corroboration** | Useful to detect drift; label alone must not resolve ambiguous slots. |
| class/subject/teacher names | **OPTIONAL source values** | May feed approved aliases; do not become canonical identities. |
| target calendar/week | **NOT SUPPORTED in workbook initially** | Comes from authenticated API/UI target selection and existing `/target`; server derives `effectiveFrom`. |
| room | **DEFERRED** | No canonical Room domain. |

Normal import produces one canonical `TimetableEntry` per exact slot. There is no authoritative multi-period or merged-cell rule. **ACCEPTED FIRST-RELEASE ARCHITECTURE:** unsupported merged mapped cells are blocking; no span field or silent expansion is added. Later multi-period normalization requires a separate decision.

## 8. Entity and TeachingAssignment resolution

### Teacher

The source supports an immutable technical teacher code, school-facing code and name aliases (v1.2 table 17). Current schema exposes unique `User.username`, nullable unique `StaffProfile.staffCode`, and non-unique `displayName`.

**ACCEPTED ARCHITECTURE:** a profile/mapping declares `STAFF_CODE`, `USERNAME`, or `APPROVED_ALIAS` when the source format defines its teacher namespace. If the source only means generic “teacher”, collect exact eligible matches from every permitted namespace and deduplicate by canonical User ID: zero IDs is missing, one ID resolves, and more than one distinct ID is a blocking ambiguity. A staff code and username that both identify the same User count once. Cross-namespace precedence must never silently choose a different User. Display name is candidate/help text only; fuzzy matching is forbidden.

### Class and subject

Current code normalizes class/subject codes by trim + uppercase; names are trimmed. Class code is AcademicYear-scoped; subject code is global. **ACCEPTED ARCHITECTURE:** resolve the typed entity by exact normalized canonical code, then a typed source/profile-scoped approved alias. No fuzzy matching or name-only silent selection. Missing, ambiguous, inactive, or conflicting exact-code/alias identities block import.

### Time slot

Current identity is exact revision UUID, but source rows use business coordinates. **ACCEPTED ARCHITECTURE:** resolve by AcademicYear + weekday + session + positive ordinal against exactly one active, regular-teaching slot. Label/clock values may corroborate or be explicit aliases but cannot weaken the coordinate. Missing, ambiguous, inactive or non-regular slots block import.

### TeachingAssignment

The workbook sources mention business teacher/class/subject values, not internal assignment UUIDs. **ACCEPTED ARCHITECTURE:** after entity and target resolution, select the exact TeachingAssignment matching AcademicYear + class + subject + teacher and covering `effectiveFrom` through the selected calendar end, matching the existing 04B1 validation envelope. Resolve before creating/replacing DRAFT entries. Zero, multiple, or out-of-range assignments are blocking row errors; the server supplies `teachingAssignmentId` and teacher snapshot to existing atomic replace-all.

## 9. Mapping profiles and aliases

- **Header alias:** raw column header → canonical semantic field, for example `GV` → `teacher`. This is useful but not explicitly confirmed by §5.4.
- **Value/entity alias:** raw cell value → canonical business entity/value, for example a school-specific teacher short code → one User. This behavior is **CONFIRMED** by v1.2 §5.4/table 18.
- The two must have separate persistence and validation. A header mapping never resolves a teacher entity.

**ACCEPTED ARCHITECTURE:** profiles are school-wide professional configuration authorized by `TIMETABLE_MANAGE / SCHOOL_WIDE`. A profile stores canonical header/column mapping policy and may store sheet/header hints. Typed value/entity aliases are persisted separately, source/profile scoped and auditable; header mappings and entity aliases are not the same table concept. One active typed alias key cannot map to multiple canonical IDs in the same scope. If an alias and another exact identifier resolve to different entities, import returns a blocking ambiguity/configuration conflict. Exact schema representation and profile-version mechanics belong to 04B3B.

## 10. Version creation and atomicity

The phrase “each upload creates a version” does not require a durable version before mapping succeeds.

| Boundary | Benefit | Cost/risk | Assessment |
|---|---|---|---|
| Upload receipt | Literal upload trace | Creates empty/invalid timetable versions and pollutes lifecycle history. | Not recommended. |
| After sheet/mapping | Supports mapped drafts | Still persists candidates with blocking row errors. | Possible, but weak audit semantics. |
| After parse/entity resolution has no blocking errors | Preserves “upload creates a version” for accepted content and feeds atomic replace-all. | Creates history before the accepted operator confirmation boundary. | **REJECTED as the commit boundary.** |
| After user preview confirmation | Strong intentional commit boundary. | Requires deterministic confirmation/replay identity. | **ACCEPTED:** confirmation atomically creates receipt, DRAFT, target, entries, checksum and audit. |

**ACCEPTED ARCHITECTURE:** inspection/mapping may persist separately, but no TimetableVersion or TimetableEntry is created while blocking parse/mapping/entity errors remain. Preview confirmation executes one serializable transaction: enforce replay identities, create the committed receipt, DRAFT, target, complete normalized entry set, checksum and audit. No partial timetable rows, omitted-invalid-row draft or silent data loss. A permanent attempt table is optional and must not masquerade as a committed receipt.

The import may invoke the shared current-scope evaluator for preview but stops at `DRAFT`. The user then uses existing validate → approve → activate lifecycle endpoints.

## 11. Accepted row-error architecture

```ts
type ImportIssue = {
  code: string;
  severity: 'ERROR' | 'WARNING';
  category: 'FILE' | 'WORKBOOK' | 'MAPPING' | 'RESOLUTION' | 'TIMETABLE_VALIDATION';
  message: string;
  sheetName?: string;
  sourceRowNumber?: number;   // actual Excel 1-based row index
  sourceColumn?: string;      // bounded A1 column label
  sourceHeader?: string;      // sanitized and length-bounded
  semanticField?: string;
  rawValue?: string;          // sanitized/redacted and length-bounded
  normalizedValue?: string;   // sanitized and length-bounded
  candidateIds?: string[];    // bounded canonical IDs only
  context?: Record<string, string | number | boolean | string[]>;
};
```

Minimum 04B3C response fields are `code`, `severity`, `category`, `message`, `sheetName`, actual 1-based `sourceRowNumber`, and `semanticField`; column/header/value/candidates/context are optional and bounded. Never echo formulas, entire rows, hidden sheets, arbitrary objects or unbounded workbook content.

Error categories/codes to stabilize before implementation:

- File/workbook: `IMPORT_FILE_UNSUPPORTED`, `IMPORT_WORKBOOK_UNREADABLE`, `IMPORT_SHEET_MISSING`, `IMPORT_HEADER_NOT_DETECTED`.
- Mapping: `IMPORT_REQUIRED_MAPPING_MISSING`, `IMPORT_MAPPING_DUPLICATE`, `IMPORT_REQUIRED_CELL_EMPTY`.
- Resolution: invalid weekday; slot/class/subject/teacher missing, ambiguous or inactive; TeachingAssignment missing, ambiguous or out-of-range.
- Canonical content: `IMPORT_CANONICAL_ROW_DUPLICATE`, class collision, teacher collision.
- Deferred findings: PPCT association and special/locked collision must be marked deferred, never fake PASS.

Fully blank non-hidden rows are ignored but retain source addressing gaps. Partially blank mapped rows, nonblank hidden mapped data, unsupported merged mapped cells, and identical duplicate canonical rows are blocking. Nothing is silently skipped or collapsed.

## 12. Preview and comparison

Import preview contains: selected file/sheet/profile metadata; target calendar/week/effective date; row/valid/error/warning counts; sanitized row issues; normalized entry summaries; semantic checksum; diff; and explicit deferred checks. It is distinct from the existing TimetableVersion validation report, while reusing that evaluator for normal-base issues.

**ACCEPTED ARCHITECTURE:** the default comparison baseline is the version historically effective at candidate `effectiveFrom` under ADR-020 interval semantics. For a future successor this is the predecessor covering that date, if any; do not use highest `versionNumber` or activation timestamp. If no effective version covers the date, baseline is empty. A user-selected comparison may be an additional view, never the default idempotency baseline.

**ACCEPTED ARCHITECTURE:** diff identity is `weekday + exact slot business coordinate/revision + schoolClassId`. Compare canonical payload at that coordinate:

- added: candidate coordinate absent in baseline;
- removed: baseline coordinate absent in candidate;
- changed: same coordinate but subject, assignment/teacher provenance, or exact slot revision differs;
- unchanged: canonical payload equal.

Teacher changes must display both teacher and TeachingAssignment provenance. Counts are deterministic and rows sorted by weekday, slot start/session/ordinal, class and canonical IDs.

## 13. Checksum, replay identity and imported-DRAFT immutability

### Semantic content duplicate identity

**ACCEPTED ARCHITECTURE:** `contentChecksum` represents canonical normalized normal-entry content, not raw file bytes. SHA-256 with lowercase hexadecimal encoding and serialization version `semantic-v1` is an architecture decision, **not a PA-B v1.2 source requirement**.

Serialization uses deterministic UTF-8 with fixed field ordering and sorted rows. Each row contains exactly `weekday`, exact `timeSlotDefinitionId`, `schoolClassId`, `subjectId`, `teachingAssignmentId`, and `teacherUserId`. It excludes TimetableEntry IDs, timestamps, raw headers/spelling, file metadata and target IDs. Exact slot revision identity is deliberate: retiring a slot and authoring against a new revision produces different canonical content even if labels match.

The separately enforceable semantic duplicate key is:

`academicYearId + calendarVersionId + effectiveAcademicWeekId + semanticChecksum`

Target belongs to the uniqueness scope outside the digest. Equal content at a different target remains allowed. Different request keys cannot bypass this semantic duplicate invariant.

### Request idempotency identity

Request idempotency is separate from semantic duplicate identity. A confirmation command may supply a durable key, persisted under an exact namespace/composite key chosen by 04B3B:

- same key + same deterministic canonical request fingerprint → replay the original result;
- same key + materially different fingerprint → 409 conflict; never reinterpret the key;
- different keys + same semantic duplicate key → `IDEMPOTENT_REPLAY` through semantic deduplication.

The bounded fingerprint covers at least the committed semantic import identity plus mapping/profile/target version context needed to distinguish retry from key reuse. Exact serialization belongs to 04B3B/C. Raw workbook content is never stored as an unbounded fingerprint payload.

### Committed receipt and replay result

A committed `TimetableImportReceipt` is immutable identity/provenance for one successful canonical confirmation. Conceptually it records AcademicYear, target calendar/week, checksum algorithm/serialization version, semantic checksum, exactly one created TimetableVersion, actor, commit timestamp, bounded source/profile provenance and optional request-key identity/fingerprint. One imported TimetableVersion has at most one committed receipt. FK direction and names belong to 04B3B, but the relationship must authoritatively answer whether a DRAFT is import-backed.

Failed parse/inspection attempts are not committed receipts. Optional attempt/preview persistence is separate.

Both semantic and request replay return the original receipt-linked TimetableVersion with its **current** lifecycle status, which may be DRAFT, VALIDATED, APPROVED, ACTIVE or SUPERSEDED. Result discriminant remains `CREATED | IDEMPOTENT_REPLAY`; replay never creates a new DRAFT because the original progressed.

### Imported-DRAFT immutability

Once confirmation links a committed receipt to its TimetableVersion, that version's target, normalized entry set and `contentChecksum` are immutable through generic 04B1 manual authoring. Future 04B3C must return a 409 domain conflict for `POST /api/timetable-versions/:id/target` and `PUT /api/timetable-versions/:id/entries` when the DRAFT is receipt-backed. Manual DRAFTs without a receipt keep current 04B1 behavior and may retain `contentChecksum = null`; generic replace-all does not have to populate it.

An operator who wants different content must use a future accepted copy/new-manual-DRAFT workflow. The receipt-backed version is never mutated or detached, so replay of the original semantic identity always returns content that still matches its receipt. Clone/copy and manual/bulk UI remain unresolved and are not implemented here.

## 14. Raw workbook retention boundary

**CONFIRMED:** the source requires durable import batch/provenance/audit. **UNRESOLVED:** whether original raw workbook bytes must be retained after successful parsing, and for how long.

**ACCEPTED CURRENT PERSISTENCE BOUNDARY:** 04B3B must not store raw workbook bytes in PostgreSQL. 04B3C may use bounded transient upload/preview storage. Durable raw-file or object-storage retention requires a separate explicit decision; this audit does not claim the source requires deletion.

## 15. Persistence gap analysis

| Concern | Current support | Classification for 04B3B |
|---|---|---|
| Normal version/entries | Complete baseline | **NO NEW PERSISTENCE** |
| `contentChecksum` | Nullable/indexed, no scope uniqueness | **NO NEW COLUMN**, but semantics/service change required |
| `note` | Human note only | **NOT SUITABLE** for structured import metadata |
| Mapping profile | None | **NEW PERSISTENCE REQUIRED** |
| Header mapping policy | None | **NEW PERSISTENCE REQUIRED**; exact representation reviewable |
| Typed value/entity aliases | None | **NEW PERSISTENCE REQUIRED** |
| Committed import receipt/provenance | None | **NEW PERSISTENCE REQUIRED** |
| Semantic duplicate key/concurrent replay | None | **SEPARATE UNIQUE INVARIANT REQUIRED** |
| Request idempotency key/fingerprint | None | **SEPARATE UNIQUE INVARIANT REQUIRED**; namespace unresolved |
| Receipt ↔ TimetableVersion link | None | **AUTHORITATIVE RELATION REQUIRED**; FK direction unresolved |
| Raw workbook bytes | None | **NO POSTGRESQL PERSISTENCE**; external retention unresolved |
| Numeric security limits | None | **CONFIG/CONTRACT UNRESOLVED**, not arbitrary schema defaults |

## 16. Parser/dependency gap analysis

No workbook parser is installed. 04B3C therefore requires one reviewed dependency for the accepted `.xlsx` contract.

Architecture candidates must be evaluated at implementation time against Node 22, maintenance cadence, formula and merged-cell exposure, streaming/memory behavior, TypeScript surface, license, transitive vulnerabilities and reproducible package provenance. **No parser package or version is accepted by ADR-021**; that choice remains an 04B3C dependency/security spike.

## 17. Security requirements

These are implementation-security requirements, not source-authored business rules:

- Accept only approved extensions after content sniffing; never trust MIME or filename alone.
- Do not execute macros, formulas, external links, DDE, scripts or network references.
- Reject formula cells in mapped business fields; do not evaluate formulas or consume cached values as authoritative.
- Reject encrypted/password-protected or unsupported workbook structures.
- Bound compressed and expanded size, sheets, rows, columns, shared strings, cell length, merged ranges and processing time. Numerical limits require approval and load/security tests.
- Defend against ZIP bombs and high-compression/resource-exhaustion inputs.
- Parse from an in-memory/bounded temporary upload abstraction; never derive arbitrary filesystem paths from workbook/file names.
- Sanitize/length-bound sheet names, headers, values, errors and audit metadata; do not log workbook contents.
- Never persist macros/raw workbook in the database and never follow external links.

## 18. Hard architecture boundaries and deferred checks

- Import feeds normalized rows into the existing 04B1 atomic replace-all/evaluator. It does not create a second timetable validation engine.
- Import ends at DRAFT (optionally with preview evaluation). Existing validate, approve and activate endpoints remain authoritative.
- Authorization remains `TIMETABLE_MANAGE / SCHOOL_WIDE`; `SYSTEM_ADMIN` alone is denied.
- `TIMETABLE_COMPLETENESS` remains **DEFERRED**: no expected lesson-count/DP/free-period rules are invented.
- PPCT gaps and special/locked activity collisions are source-required future checks but **DEFERRED** until canonical models exist.
- Room, special-activity storage, PPCT storage, CalendarException, substitution/make-up, manual-import UI and production limits are outside 04B3A.

Accepted audit-event architecture covers profile/alias changes, import commit and idempotent replay, plus inspection only if separately persisted. Metadata is bounded to receipt/profile/version/target IDs, sanitized file/sheet name, counts, checksum and replay flag—never workbook contents.

## 19. Recommended decomposition

1. **04B3A — this task:** evidence-backed contract audit and ADR-021 Accepted.
2. **04B3B — required persistence foundation:** school-wide profiles, typed entity aliases, committed receipts, semantic duplicate uniqueness, request-idempotency replay identity and receipt/version provenance.
3. **04B3C1 — configuration control plane (implemented by ADR-023):** profile list/read/create/revise/retire, exact six canonical mappings, typed alias create/retire, exact normalization, capability enforcement and transactional audit.
4. **04B3C2 — Workbook Inspection & Canonical Preview (implemented by ADR-024):** parser dependency, bounded upload, sheet/header inspection, canonical resolution, preview/errors/diff and integration tests.
5. **04B3C3 — Canonical Import Confirmation, Idempotent Replay and Imported-DRAFT Lock:** atomic commit-to-DRAFT, committed receipt replay and protection of receipt-backed drafts.
6. **04B3D — optional hardening:** fuzz/corpus/ZIP-bomb/formula/large-workbook tests and CI security/load gates if 04B3C becomes too large.

ADR-022 accepts and implements the 04B3B persistence identities. ADR-023 accepts and implements the 04B3C1 configuration control plane over stable profile/revision/mapping rows and typed retained aliases. ADR-024 accepts and implements 04B3C2 Workbook Inspection & Canonical Preview. The next slice is 04B3C3 Canonical Import Confirmation, Idempotent Replay and Imported-DRAFT Lock. Each remains a separate reviewed task; 04B3D is optional corpus/security hardening.

The parser choice and resource limits recorded by ADR-024 are architecture decisions introduced in 04B3C2; they are not retroactive claims about the historical v1.2 source findings.

## 20. Remaining implementation and deferred questions

- Exact Prisma names, profile representation/versioning and receipt FK direction.
- Exact request-idempotency key namespace/composite index and request-fingerprint serialization.
- Parser package/version and exact upload/sheet/row/column/string/time limits.
- Durable raw workbook retention outside PostgreSQL.
- Multi-period normalization beyond blocking unsupported merged mapped cells.
- Future manual/copy/bulk UI and abandoned-draft retention.
- Timetable completeness, PPCT, special activities and Room.
