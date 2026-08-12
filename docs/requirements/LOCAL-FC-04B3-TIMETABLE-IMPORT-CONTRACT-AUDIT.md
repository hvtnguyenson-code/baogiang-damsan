# LOCAL-FC-04B3 — Timetable Import Contract and Idempotency Audit

**Status:** Requirements and architecture audit; recommendations require review

**Date:** 2026-08-12

**Scope:** Excel timetable import contract only; no parser, API, schema, migration, UI, test, dependency, or deployment is authorized

Classification used throughout:

- **CONFIRMED** — stated by an authoritative source or fixed by an accepted ADR/current implementation.
- **PROPOSED** — 04B3A architecture recommendation, not yet accepted.
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

**RECOMMENDATION — NOT SOURCE REQUIREMENT:** support `.xlsx` only in the first implementation. It is the narrowest deterministic workbook scope; `.xls` and `.csv` remain rejected until separately approved. Extension and MIME must agree, but content parsing—not client MIME alone—is authoritative.

## 6. Workbook, sheet and header contract

| Question | Source evidence | Status | Recommended 04B3 behavior |
|---|---|---|---|
| Multiple workbook sheets | v1.2 table 24 says choose sheet/profile. | **CONFIRMED** that sheet choice exists; count/use unresolved. | Inspect all visible nonblank sheets, require one explicit selected sheet, import only that sheet. |
| Preferred sheet in profile | Parse uses profile; no owned fields listed. | **UNRESOLVED** | Profile may store a preferred sheet name as a hint; missing/renamed sheet blocks and requires reselection. |
| Hidden/blank sheets | No source rule. | **UNRESOLVED** | Exclude hidden and fully blank sheets from automatic candidates; explicit hidden-sheet import is not supported initially. |
| Combine sheets | No source evidence. | **UNRESOLVED** | One sheet per import/version; never silently concatenate. |
| Header row | v1.2 table 45 says profile reads header/data region. | **CONFIRMED** configurable/detected concept; exact rule unresolved. | Detect bounded candidates, show them, and require explicit confirmation; persist selected 1-based header row in profile. |
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

Normal import produces one canonical `TimetableEntry` per exact slot. There is no authoritative multi-period or merged-cell rule. **PROPOSED:** a source cell explicitly spanning known consecutive periods may be expanded by parser normalization only after a reviewed rule; otherwise block it. No span field is added.

## 8. Entity and TeachingAssignment resolution

### Teacher

The source supports an immutable technical teacher code, school-facing code and name aliases (v1.2 table 17). Current schema exposes unique `User.username`, nullable unique `StaffProfile.staffCode`, and non-unique `displayName`.

**PROPOSED resolution order:** normalized `staffCode` → normalized `username` → source-scoped approved teacher value alias. Display name may generate candidates but never auto-select unless it yields exactly one eligible user. Zero candidates is missing; more than one is ambiguous; both are blocking and fail closed.

### Class and subject

Current code normalizes class/subject codes by trim + uppercase; names are trimmed. Class code is AcademicYear-scoped; subject code is global. **PROPOSED:** exact normalized code, then source-scoped approved alias; no fuzzy/edit-distance matching. Missing, ambiguous or inactive entities block import.

### Time slot

Current identity is exact revision UUID, but source rows use business coordinates. **PROPOSED:** resolve by AcademicYear + weekday + session + positive ordinal against exactly one active, regular-teaching slot. Label/clock values may corroborate or be explicit aliases but cannot weaken the coordinate. Missing, ambiguous, inactive or non-regular slots block import.

### TeachingAssignment

The workbook sources mention business teacher/class/subject values, not internal assignment UUIDs. **PROPOSED:** after entity and target resolution, select the exact TeachingAssignment matching AcademicYear + class + subject + teacher and covering `effectiveFrom` through the selected calendar end, matching the existing 04B1 validation envelope. Resolve before creating/replacing DRAFT entries. Zero, multiple, or out-of-range assignments are blocking row errors; the server supplies `teachingAssignmentId` and teacher snapshot to existing atomic replace-all.

## 9. Mapping profiles and aliases

- **Header alias:** raw column header → canonical semantic field, for example `GV` → `teacher`. This is useful but not explicitly confirmed by §5.4.
- **Value/entity alias:** raw cell value → canonical business entity/value, for example a school-specific teacher short code → one User. This behavior is **CONFIRMED** by v1.2 §5.4/table 18.
- The two must have separate persistence and validation. A header mapping never resolves a teacher entity.

**PROPOSED profile contents:** name, school-wide source key, optional preferred sheet, header row, canonical column mapping, and normalization-policy version. Store header aliases only when explicitly confirmed. Keep entity aliases in typed rows with source key, entity type, normalized raw value, canonical entity ID and audit metadata.

Profile ownership scope is **UNRESOLVED**. **PROPOSED:** school-wide, because timetable import is a school-wide professional workflow and remembered mappings should not depend on one operator. Profiles/aliases remain auditable and require `TIMETABLE_MANAGE / SCHOOL_WIDE`. They are not AcademicYear-owned unless a mapping truly references year-scoped entities; class aliases must resolve within the import AcademicYear.

## 10. Version creation and atomicity

The phrase “each upload creates a version” does not require a durable version before mapping succeeds.

| Boundary | Benefit | Cost/risk | Assessment |
|---|---|---|---|
| Upload receipt | Literal upload trace | Creates empty/invalid timetable versions and pollutes lifecycle history. | Not recommended. |
| After sheet/mapping | Supports mapped drafts | Still persists candidates with blocking row errors. | Possible, but weak audit semantics. |
| After parse/entity resolution has no blocking errors | Preserves “upload creates a version” for accepted content and feeds atomic replace-all. | Preview must exist separately before version creation. | **PROPOSED.** |
| After user preview confirmation | Strong intentional commit boundary. | Requires durable or replayable preview receipt. | **PROPOSED final boundary:** confirmation atomically creates DRAFT, target and entries. |

**PROPOSED atomicity:** inspection/mapping may persist a bounded import attempt/preview, but no TimetableVersion or TimetableEntry is created while blocking parse/mapping/entity errors remain. Preview confirmation executes one serializable transaction: claim import receipt/idempotency scope, create DRAFT, set target, atomically write all normalized entries, checksum and audit. No partial timetable rows, omitted-invalid-row draft or silent data loss. Row errors remain attached to the attempt/response, not to an incomplete TimetableVersion.

The import may invoke the shared current-scope evaluator for preview but stops at `DRAFT`. The user then uses existing validate → approve → activate lifecycle endpoints.

## 11. Proposed row-error model

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

Fully blank non-hidden rows are ignored but retain source addressing gaps. Partially blank mapped rows are blocking. **PROPOSED:** a nonblank hidden data row is a blocking workbook issue until the operator unhides/removes it; silently skipping it would conceal content. Merged mapped cells are blocking unless a later reviewed normalization rule covers the exact case. Identical duplicate canonical rows are a blocking error rather than silently collapsed; this makes accidental spreadsheet duplication visible.

## 12. Preview and comparison

Import preview contains: selected file/sheet/profile metadata; target calendar/week/effective date; row/valid/error/warning counts; sanitized row issues; normalized entry summaries; semantic checksum; diff; and explicit deferred checks. It is distinct from the existing TimetableVersion validation report, while reusing that evaluator for normal-base issues.

**PROPOSED comparison baseline:** the version historically effective at candidate `effectiveFrom` under ADR-020 interval semantics. For a future successor this is the predecessor covering that date, if any; do not use highest `versionNumber` or activation timestamp. If no effective version covers the date, baseline is empty. A user-selected comparison may be an additional view, never the default idempotency baseline.

**PROPOSED semantic coordinate:** `weekday + exact slot business coordinate/revision + schoolClassId`. Compare canonical payload at that coordinate:

- added: candidate coordinate absent in baseline;
- removed: baseline coordinate absent in candidate;
- changed: same coordinate but subject, assignment/teacher provenance, or exact slot revision differs;
- unchanged: canonical payload equal.

Teacher changes must display both teacher and TeachingAssignment provenance. Counts are deterministic and rows sorted by weekday, slot start/session/ordinal, class and canonical IDs.

## 13. Checksum and idempotency

### Checksum source

- Raw file bytes detect byte-identical uploads but differ for harmless workbook metadata/layout changes.
- Selected-sheet raw cells still vary with formatting/formulas and mapping choices.
- Canonical normalized entries represent business content and align with replace-all/diff semantics.

**PROPOSED:** `contentChecksum` is a semantic checksum over canonical normalized normal entries, not a raw-file hash. A separate optional raw-file digest may support audit/security but is not content identity.

The source requires checksum semantics but does not name SHA-256. **PROPOSED, NOT SOURCE REQUIREMENT:** SHA-256 encoded as lowercase hex, prefixed or versioned in metadata (`semantic-v1`) so serialization can evolve safely.

Canonical serialization uses UTF-8 JSON with fixed field order and LF-independent byte generation. Sort by weekday ordinal, canonical slot identity, class ID, subject ID, TeachingAssignment ID and teacher ID. Each row includes explicit weekday, exact `timeSlotDefinitionId`, `schoolClassId`, `subjectId`, `teachingAssignmentId`, and `teacherUserId`; it excludes TimetableEntry ID and timestamps. Canonical IDs already resolve code case/whitespace, so raw source spelling is excluded.

Target is not part of content checksum. **PROPOSED idempotency scope key:** `academicYearId + calendarVersionId + effectiveAcademicWeekId + semanticChecksum`. This prevents replay at the same target while allowing intentionally identical content at a different future week.

**PROPOSED duplicate response:** HTTP 200/201 typed result with `outcome: 'CREATED' | 'IDEMPOTENT_REPLAY'`, existing version ID and checksum. A replay returns the original version and creates no duplicate history; it is not a generic 409.

Application lookup alone races. **PROPOSED 04B3B enforcement:** a dedicated import receipt table with a unique composite target/idempotency scope, request-id replay record and state machine, claimed inside the same serializable transaction that creates the DRAFT. This is safer than making `TimetableVersion.contentChecksum` globally unique and allows failed inspection attempts without timetable history.

### Checksum mutability

On successful import commit, checksum becomes non-null. Existing 04B1 manual DRAFT replace-all currently allows content mutation. **PROPOSED:** every non-import replace-all deterministically recomputes the same semantic checksum and clears the import receipt’s “byte/source identity” association; it must never leave a stale checksum claiming old content. A later accepted implementation may instead forbid manual mutation of imported drafts, but current sources do not require that restriction.

## 14. Imported versus manual draft and raw-file retention

Current schema cannot record import origin. **PROPOSED:** import receipt stores original sanitized file name, declared/detected media type, selected sheet, profile ID/version, raw digest if approved, semantic checksum, counts, actor, timestamps, target and created version ID. `TimetableVersion` needs either a nullable `importReceiptId` or the receipt owns a unique nullable `timetableVersionId`; prefer receipt → version to keep manual drafts unchanged.

The v1.2 pipeline says to save a file/batch at upload, but states no retention duration, download-original use case, legal archive or re-import rule. **PROPOSED:** treat “save file/batch” as a durable receipt plus transient bounded parsing, and do not store workbook bytes in PostgreSQL. Retain bounded metadata/digests and audit only. Object storage is not invented.

## 15. Persistence gap analysis

| Concern | Current support | Classification for 04B3B |
|---|---|---|
| Normal version/entries | Complete baseline | **NO NEW PERSISTENCE** |
| `contentChecksum` | Nullable/indexed, no scope uniqueness | **NO NEW COLUMN**, but semantics/service change required |
| `note` | Human note only | **NOT SUITABLE** for structured import metadata |
| Mapping profile | None | **NEW TABLE RECOMMENDED** |
| Header mappings/aliases | None | **NEW TABLE/typed JSON child RECOMMENDED**; exact representation reviewable |
| Value/entity aliases | None | **NEW TABLE RECOMMENDED** |
| Import receipt/source metadata/preview state | None | **NEW TABLE RECOMMENDED** |
| Idempotency target key/concurrent replay | None | **NEW UNIQUE COMPOSITE on receipt RECOMMENDED** |
| Version linkage | None | **NEW relation RECOMMENDED**; direction remains schema-design detail |
| Raw workbook bytes | None | **NO NEW PERSISTENCE RECOMMENDED** |
| Numeric security limits | None | **CONFIG/CONTRACT UNRESOLVED**, not arbitrary schema defaults |

## 16. Parser/dependency gap analysis

No workbook parser is installed. 04B3C therefore requires one reviewed dependency if `.xlsx` is accepted.

Architecture candidates must be evaluated at implementation time against Node 22, maintenance cadence, `.xlsx`/legacy format scope, formula and merged-cell exposure, streaming/memory behavior, TypeScript surface, license, transitive vulnerabilities and reproducible package provenance. ExcelJS exposes `.xlsx` workbook/stream readers and an MIT license but its current Node 22 behavior and open issue/security state still require a pinned-version spike. SheetJS supports broader formats and explicit formula/security controls, but package provenance/licensing and Community Edition distribution must be reviewed carefully. **PROPOSED evaluation order:** spike a pinned ExcelJS release first for the narrow `.xlsx` contract, then use SheetJS only as a reviewed fallback if corpus/security tests expose a blocker. **No library is selected by 04B3A.**

## 17. Security requirements

These are implementation-security requirements, not source-authored business rules:

- Accept only approved extensions after content sniffing; never trust MIME or filename alone.
- Do not execute macros, formulas, external links, DDE, scripts or network references.
- **PROPOSED:** reject formula cells in mapped business fields; do not evaluate formulas or consume cached values as authoritative.
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

Proposed audit events: inspection persisted (if applicable), profile/alias changed, import committed, and idempotent replay. Metadata is bounded to receipt/profile/version/target IDs, sanitized file/sheet name, counts, checksum and replay flag—never workbook contents.

## 19. Recommended decomposition

1. **04B3A — this task:** evidence-backed contract/idempotency audit and ADR-021 Proposed.
2. **04B3B — persistence foundation:** reviewed schema/migration for school-wide mapping profiles, typed entity aliases and import receipts with concurrency-safe idempotency scope.
3. **04B3C — workbook inspection/import API:** parser dependency, bounded upload, sheet/header mapping, preview/errors/diff, canonical normalization, commit-to-DRAFT and integration tests.
4. **04B3D — optional hardening:** fuzz/corpus/ZIP-bomb/formula/large-workbook tests and CI security/load gates if 04B3C becomes too large.

No 04B3B/C work may start until ADR-021 receives independent review and accepted decisions are converted into an execution prompt.

## 20. Explicit hard-stop questions

The following must be approved before implementation:

1. Is first release `.xlsx` only, and are `.xls`/`.csv` explicitly rejected?
2. Is one selected visible sheet per import accepted?
3. Are profiles and aliases school-wide, and are both header and value aliases in scope?
4. Is preview confirmation the TimetableVersion creation boundary with zero partial row persistence?
5. Is semantic checksum + target scope accepted, including the replay response and receipt-table uniqueness design?
6. Must manual replace-all recompute checksum, or are imported DRAFTs immutable to manual edits?
7. Which parser and exact security limits pass dependency/security review?
