# ADR-024: Timetable Import Workbook Inspection and Canonical Preview

- Status: Accepted
- Date: 2026-08-12

## Context

ADR-021 deliberately left the XLSX implementation package open. The first import implementation must inspect untrusted workbooks without executing formulas, retaining files, or creating timetable/import records. It must then resolve rows against the immutable profile revision and current canonical domain model, while showing the timetable historically effective on the candidate start date.

## Decision

### Parser and package boundary

Use exactly `exceljs@4.4.0` to read XLSX workbooks and `yauzl@3.4.0` for a bounded OOXML ZIP preflight. A Node 22 spike proved Buffer loading and public worksheet name/state, dimension, formula, hyperlink, and merge APIs. Parsing does not evaluate formulas and has no network operation.

The preflight rejects invalid/non-OOXML ZIPs, VBA package parts, external-link parts, and expanded content over 64 MiB before ExcelJS parsing. Encrypted and unsupported packages fail closed as invalid XLSX. Only a case-insensitive `.xlsx` filename with the XLSX MIME type, or `application/octet-stream` followed by successful content validation, is accepted.

The production audit before installation contained 12 moderate, zero high, and zero critical advisories. The immediate accepted-install comparison also had 12 moderate, zero high, and zero critical advisories after a compatible `brace-expansion` patch update. The final validation later reported 13 moderate, zero high, and zero critical advisories because a new React Router advisory appeared; it is unrelated to the parser dependency graph. ExcelJS is reported through its transitive `uuid@8` advisory; it is unrelated to workbook ZIP/path/temp-file handling, and the repository baseline already contained the same UUID advisory. `yauzl@3.2.0` was rejected because its moderate advisory was directly on the ZIP read path; `yauzl@3.4.0` has no known standalone advisory in the spike.

### Resource controls

The API holds uploads in memory and applies:

- 8 MiB uploaded bytes;
- 32 worksheets;
- 5,000 rows and 64 columns per sheet;
- 250,000 total declared dimension cells;
- 50 header-scan rows and 10 candidates per sheet;
- 256 merged ranges;
- 200 normalized characters per mapped cell;
- period ordinals 1 through 99.

Full OOXML parsing runs in a worker thread with an 8,000 ms deadline. Timeout terminates the worker. Node worker limits are `maxOldGenerationSizeMb: 128` and `maxYoungGenerationSizeMb: 32`. Parser errors exposed to clients are stable and bounded; raw ZIP/XML content, formulas, URLs, paths, and stack traces are not returned.

### Inspection and selection

Inspection inventories visible, hidden, and very-hidden worksheets. Only visible, nonblank sheets are selectable. A profile sheet-name hint is comparison metadata, never automatic selection. The operator must explicitly confirm a sheet and a header row for preview.

Header matching uses the immutable six mappings and the existing NFKC/whitespace/case normalization. It preserves Vietnamese diacritics and punctuation, with no accent folding or fuzzy matching. A complete header contains every mapped field exactly once. Hidden/very-hidden timetable-shaped data and mapped data in selected hidden rows/columns produce blocking `HIDDEN_MAPPED_DATA` issues.

### Canonicalization and validation

Rows retain their actual one-based Excel addresses. Fully blank rows may be ignored; nonblank rows without mapped data and partially mapped rows are blocking. Formula, hyperlink, merged, error/object, and overlength mapped cells are blocking; formula cache values are never used. Numeric values are accepted only for period ordinal.

Weekday and session values use the frozen exact English/Vietnamese token dictionaries. Period ordinal is an ASCII decimal integer from 1 to 99. Slot resolution uses exact academic-year, weekday, session, ordinal, latest revision semantics and requires active regular-teaching slots.

Class and subject resolution collects exact canonical-code and active typed-alias matches; disagreeing identities block. Teacher resolution supports `STAFF_CODE`, `USERNAME`, `APPROVED_ALIAS`, and `GENERIC_EXACT`. Generic mode collects all namespaces without precedence, deduplicates the same user, blocks multiple users, and never uses display name. The user must be active teaching staff.

Teaching assignment is derived from exact class/subject/teacher identity. Exactly one assignment must cover the full interval from the selected week's earliest segment start through calendar end. The existing `evaluateTimetableEntries` evaluator supplies weekday and real-time class/teacher collision rules, with validation results mapped back to source rows. No bad row is silently accepted; any error makes `canConfirm` false and suppresses the diff.

### Baseline and diff

The baseline is the `ACTIVE` or `SUPERSEDED` timetable historically effective at candidate `effectiveFrom`, ordered by latest `effectiveFrom` then ID. Coordinate identity is weekday + exact time-slot-definition ID + class ID. Payload identity is subject + teaching assignment + teacher. Exact slot revision changes therefore appear as remove plus add. Added, changed, removed, unchanged counts and issue ordering are deterministic.

### Stateless boundary

Inspection and preview create no timetable version, entry, import receipt, profile/revision/alias mutation, preview token, checksum, request fingerprint, or idempotency record. Raw bytes remain only in bounded request/worker memory. C2 does not confirm imports.

04B3C3 will implement trusted server-side confirmation, idempotent replay, and the imported-DRAFT lock. It must re-run this parse/canonicalization pipeline and must never trust canonical rows returned by a browser. 04B3D remains an optional parser-hardening/fuzzing slice.

## Consequences

The API gains dedicated inspect and preview endpoints guarded by explicit school-wide `TIMETABLE_MANAGE`. The implementation accepts the cost of parsing the workbook again at confirmation in exchange for a stateless, tamper-resistant boundary. ADR-021, ADR-022, and ADR-023 remain Accepted; ADR-015 remains Proposed.
