# ADR-026 — Timetable Import Confirmation and Replay

- **Status:** Accepted
- **Date:** 2026-08-13
- **Scope:** LOCAL-FC-04B3C3B canonical confirmation, replay, and imported-DRAFT lock
- **Builds on:** ADR-021 through ADR-025

## Context

ADR-024 made inspection and canonical preview stateless. Browser preview output is not a trusted commit input. ADR-025 supplied the durable one-to-many namespace required to remember every accepted request idempotency key while preserving the original creation request on the immutable receipt.

This decision completes the first canonical XLSX-to-DRAFT backend pipeline without adding schema, migrations, frontend behavior, raw-workbook retention, automatic lifecycle transitions, or deferred timetable domains.

## Decision

### Confirmation boundary

`POST /api/timetable-import/workbooks/confirm` accepts the same bounded multipart XLSX transport and server-owned selection context as preview:

- `profileRevisionId`
- `academicYearId`
- `calendarVersionId`
- `effectiveAcademicWeekId`
- exact `sheetName`
- `headerRowNumber`
- optional trimmed, nonblank `requestIdempotencyKey` of at most 200 characters

The route uses `SessionAuthGuard`, `CsrfOriginGuard`, and `CapabilityGuard` for `TIMETABLE_MANAGE / SCHOOL_WIDE`. It returns HTTP 200 with one stable response shape containing `outcome`, the immutable receipt, and the linked current `TimetableVersionRecord`. Outcomes are `CREATED` and `IDEMPOTENT_REPLAY`.

The browser cannot submit canonical rows, semantic checksums, request fingerprints, version/entry IDs, resolved entity IDs, or preview diffs as confirmation content.

For every unbound request, the server validates and parses the uploaded XLSX again, resolves the explicitly selected visible sheet and exact header again, reloads the active immutable profile revision, and re-runs the shared canonicalization and current timetable evaluator. Database-dependent profile, target, slot, entity, alias, TeachingAssignment, coverage, and evaluator resolution runs against the authoritative state inside the commit transaction. Blocking issues return `409 TIMETABLE_IMPORT_CONFIRM_BLOCKED` and create no import/version/audit state. This includes evaluator-owned `EMPTY_TIMETABLE`: zero canonical rows are rejected before commit.

### `semantic-v1`

Semantic identity contains only these six fields per canonical normal entry, in this exact field order:

1. `weekday`
2. `timeSlotDefinitionId`
3. `schoolClassId`
4. `subjectId`
5. `teachingAssignmentId`
6. `teacherUserId`

Entries are sorted lexicographically by that six-field tuple using explicit ordinal JavaScript string comparison (`<` and `>`), never locale/ICU collation. The exact byte input is UTF-8 of `JSON.stringify()` over objects constructed in this exact key order:

```json
{"version":"semantic-v1","entries":[{"weekday":"...","timeSlotDefinitionId":"...","schoolClassId":"...","subjectId":"...","teachingAssignmentId":"...","teacherUserId":"..."}]}
```

There is no pretty-print whitespace. `semanticChecksum` is the lowercase hexadecimal SHA-256 digest of those bytes and therefore matches `^[0-9a-f]{64}$`.

Source row numbers/text, normalized source values, business/display codes, entry/version IDs, timestamps, actor, filename, sheet/header metadata, and academic target IDs are excluded. The target-scoped duplicate identity remains the database unique key:

`academicYearId + calendarVersionId + effectiveAcademicWeekId + contentChecksum`.

### Raw workbook digest and `confirm-request-v1`

`workbookSha256` is lowercase hexadecimal SHA-256 of the bounded uploaded XLSX bytes. It is request identity only, never semantic business identity. Raw workbook bytes are not persisted.

When a request key exists, the exact fingerprint byte input is UTF-8 of `JSON.stringify()` over this fixed-key object shape:

```json
{"version":"confirm-request-v1","workbookSha256":"<64 lowercase hex>","profileRevisionId":"<uuid>","academicYearId":"<uuid>","calendarVersionId":"<uuid>","effectiveAcademicWeekId":"<uuid>","sheetName":"<exact confirmed worksheet name>","headerRowNumber":1,"semanticChecksum":"<64 lowercase hex>"}
```

`requestFingerprint` is the lowercase hexadecimal SHA-256 digest of those bytes. Source filename, request key itself, actor/user ID, request ID, timestamps, and browser preview output are excluded. Renaming identical uploaded bytes therefore does not alter request identity; changing the byte stream does.

### Replay rules

`TimetableImportRequestKey.requestKey` is a global consumed-key namespace, not scoped by actor, profile, year, or target.

An already-bound key may take a read-only fast path after guards, multipart transport validation, bounded workbook hashing, and fingerprint verification. The fingerprint is recomputed with the semantic checksum on the receipt-linked version. This path intentionally does not require the profile revision or aliases to remain active and does not re-create content. It returns the original receipt and the linked version with its current lifecycle status.

- same key and same fingerprint: `IDEMPOTENT_REPLAY`, no mutation or replay audit;
- same key and different fingerprint: `409 TIMETABLE_IMPORT_IDEMPOTENCY_KEY_REUSED`, no mutation;
- different key and same target-scoped semantic identity: `IDEMPOTENT_REPLAY` of the original receipt/version and one new `TimetableImportRequestKey` binding;
- no key and same target-scoped semantic identity: `IDEMPOTENT_REPLAY` without a key row;
- same semantic content at a different target: a distinct import may be created.

Additional bindings never rewrite `TimetableImportReceipt.requestIdempotencyKey` or `requestFingerprint`; those fields remain original-creation provenance. A semantic duplicate without an import receipt is an invariant conflict and is never assigned new provenance.

### Atomic commit and concurrency

Parsing and OOXML/ZIP processing finish before opening the database transaction. Every unbound database decision runs in one Prisma `SERIALIZABLE` transaction. A first winner atomically creates:

1. the next AcademicYear-scoped DRAFT `TimetableVersion` with exact target, derived `effectiveFrom`, and semantic checksum;
2. the complete canonical `TimetableEntry` set;
3. one immutable `TimetableImportReceipt`;
4. the original request-key binding when supplied; and
5. one bounded `TIMETABLE_IMPORT_COMMITTED` success audit.

A semantic replay that accepts an additional key writes only that binding and one bounded `TIMETABLE_IMPORT_REPLAY_BOUND` audit in the same transaction. Audit metadata is limited to IDs, target, counts, outcome, checksum, and fingerprint; workbook cells, formulas, links, XML/ZIP, bytes, and parser internals are forbidden.

The service retries the complete serializable database decision at most three times, and only for Prisma `P2034` or unique races on:

- `timetable_versions_import_semantic_duplicate_key`;
- `timetable_import_request_keys_request_key_key`;
- `timetable_import_receipts_request_idempotency_key_key`;
- `timetable_versions_academic_year_id_version_number_key`.

`TimetableImportRequestKey` remains the authoritative consumed-key namespace. The retained unique `TimetableImportReceipt.requestIdempotencyKey` original-request provenance field is an additional physical first-creation race boundary, so its named constraint and Prisma/snake-case field target variants participate in the same bounded retry classification.

It never retries validation/domain failures. Exhaustion returns bounded `409 TIMETABLE_IMPORT_CONFIRM_CONCURRENCY_CONFLICT`. Transaction rollback prevents orphan versions, entries, receipts, bindings, or success audits.

### Imported-DRAFT immutability and lifecycle

After the existing DRAFT requirement and before target/entity resolution or mutation, generic `TimetablesService.setTarget` and `TimetablesService.replaceEntries` check for a receipt. A receipt-backed DRAFT returns `409 TIMETABLE_IMPORTED_DRAFT_IMMUTABLE` with the instruction to create a new draft/import. Manual DRAFTs without receipts retain existing behavior.

This lock does not block read/list, validate, approve, activate, historical resolution, or replay. Import confirmation stops at DRAFT and performs no automatic validation, approval, or activation.

## Consequences

Preview and confirmation share one canonicalization implementation while confirmation supplies transaction-scoped database authority. Durable request replay remains valid after configuration retirement or lifecycle progression. Semantic replay cannot create a second target-identical imported version, and every additional accepted request key remains consumed durably.

No raw workbook bytes are stored. No frontend, schema, migration, capability, seed, workflow, deployment, production, Room, PPCT, completeness, special-activity, substitution, or make-up behavior is introduced.
