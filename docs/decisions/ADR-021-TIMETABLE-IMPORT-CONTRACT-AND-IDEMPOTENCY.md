# ADR-021 — Timetable Import Contract and Idempotency

- **Status:** Proposed
- **Date:** 2026-08-12
- **Scope:** LOCAL-FC-04B3 timetable import architecture
- **Supporting audit:** [LOCAL-FC-04B3 Timetable Import Contract Audit](../requirements/LOCAL-FC-04B3-TIMETABLE-IMPORT-CONTRACT-AUDIT.md)

## Context

**CONFIRMED:** PA-B v1.2 requires Excel timetable upload, profile/sheet selection, column detection, remembered aliases, validation, compare/preview, approval, activation and checksum/idempotency. It does not publish official extensions, headers, profile scope, partial-acceptance rules, checksum algorithm or row-error transport.

**CONFIRMED:** ADR-017 through ADR-020 already establish AcademicYear-owned timetable versions, one exact slot per normal entry, TeachingAssignment provenance plus teacher snapshot, atomic replace-all DRAFT content, current-scope validation and existing approval/activation/history. `contentChecksum` is nullable and indexed but not globally unique. There is no current import/profile/alias/idempotency persistence or workbook parser.

## Source-backed constraints

- **CONFIRMED:** raw source names are normalized through aliases to stable canonical teacher/class/subject identities (v1.2 §5.4, tables 17–18).
- **CONFIRMED:** import pipeline is upload → parse sheet/header/data region → normalize → validate → preview add/change/remove/errors/warnings → transactional commit and audit (v1.2 §§7.2–7.3, 14.3, tables 24 and 45).
- **CONFIRMED:** equal checksum or idempotency key must not create duplicate content (v1.2 table 24).
- **CONFIRMED:** import must not bypass `TIMETABLE_MANAGE / SCHOOL_WIDE`, the DRAFT lifecycle, existing evaluator or activation recheck.
- **DEFERRED:** completeness, PPCT association, special-activity collision and Room cannot be claimed by normal-base import.

## Proposed decisions

1. **PROPOSED:** first release accepts `.xlsx` only. `.xls` and `.csv` are unsupported until separately approved. This is a recommendation, not a source requirement.
2. **PROPOSED:** one explicit visible nonblank sheet is imported into one candidate. Header-row detection is bounded and user-confirmed; raw headers never become canonical domain fields.
3. **PROPOSED:** required canonical semantics are weekday, active regular-teaching slot, same-year active class, active subject and one eligible teacher. TeachingAssignment and teacher snapshot are server-derived.
4. **PROPOSED:** entity resolution uses normalized exact code/username/staffCode, then a source-scoped approved alias. Display name and labels never choose ambiguously; fuzzy matching is excluded.
5. **PROPOSED:** school-wide mapping profiles own sheet/header/mapping policy; typed value/entity aliases are separate from header mappings and auditable.
6. **PROPOSED:** parse/mapping/entity errors create no TimetableVersion. Preview confirmation atomically claims an import receipt, creates the DRAFT/target/entries/checksum and audit. Invalid rows are never omitted or partially persisted.
7. **PROPOSED:** row issues retain actual Excel 1-based row numbers and stable file/workbook/mapping/resolution/validation categories, with sanitized bounded context.
8. **PROPOSED:** preview compares against the ADR-020 timetable effective at candidate `effectiveFrom`, not latest version number. Diff identity is weekday + exact slot coordinate + class; payload changes include subject and teacher/assignment provenance.
9. **PROPOSED:** `contentChecksum` is a deterministic semantic checksum of sorted canonical normal entries. SHA-256 lowercase hex and serialization version `semantic-v1` are recommendations, not source requirements. Target fields stay outside the content digest.
10. **PROPOSED:** idempotency scope is AcademicYear + calendar version + effective academic week + semantic checksum. Identical content at a different future target remains allowed.
11. **PROPOSED:** duplicate submission returns the existing version with explicit `CREATED` versus `IDEMPOTENT_REPLAY`, not another version and not an opaque conflict.
12. **PROPOSED:** a dedicated import receipt with a unique composite scope and request replay record provides database-backed concurrent duplicate protection in the same serializable commit transaction.
13. **PROPOSED:** manual DRAFT replace-all recomputes the semantic checksum and severs stale source-file identity; it may not leave a checksum representing prior content.
14. **PROPOSED:** workbook bytes are transient. Persist bounded provenance/digests/counts, not raw Excel data.
15. **PROPOSED:** import stops at DRAFT and may reuse the existing evaluator for preview. Existing validate → approve → activate commands remain unchanged.

## Alternatives considered

- **Raw-file checksum:** rejected as content identity because harmless workbook metadata/format changes alter bytes; an optional raw digest may remain audit metadata.
- **Global unique `TimetableVersion.contentChecksum`:** rejected because identical content must be reusable at a different future week.
- **Application lookup only:** rejected because simultaneous identical imports race.
- **Create version immediately on upload:** not preferred because unreadable/unmapped files pollute timetable history.
- **Partial valid-row draft:** rejected as the proposed architecture because it hides omissions and conflicts with atomic replace-all; the source itself leaves partial acceptance unresolved.
- **Header names as domain contract:** rejected; the source requires mapping/profile precisely because files vary.
- **Dynamic teacher resolution without TeachingAssignment:** rejected by accepted timetable provenance/history constraints.

## Persistence consequences

- **PROPOSED:** 04B3B adds mapping-profile, typed entity-alias and import-receipt/idempotency persistence plus reviewed unique indexes and audit relations.
- **CONFIRMED:** normal timetable tables and `contentChecksum` field already exist; no global checksum uniqueness is added.
- **UNRESOLVED:** exact table/column names, profile versioning representation and relation direction require schema review.
- **PROPOSED:** raw workbooks are not stored in PostgreSQL.

## API consequences

- **PROPOSED:** 04B3C separates bounded inspection/mapping/preview from confirmation/commit. Confirmation yields `CREATED` or `IDEMPOTENT_REPLAY` and a DRAFT version.
- **PROPOSED:** errors use stable categories/codes and actual sheet/row addressing; response context is sanitized and bounded.
- **CONFIRMED:** target selection is server-owned calendar/week input and derives `effectiveFrom`; workbook UUIDs are not trusted.
- **CONFIRMED:** no automatic approval/activation and no second validation engine.

## Security consequences

- **PROPOSED:** reject formula cells in mapped fields, macros, encrypted workbooks, external links and unsupported structures; never execute/evaluate workbook content.
- **PROPOSED:** content sniffing, ZIP-bomb/resource limits, bounded dimensions/strings/time, safe temporary handling and sanitized errors/audits are mandatory.
- **UNRESOLVED:** numeric upload/sheet/row/column limits and parser choice require a security/dependency review.

## Open questions

1. Approve `.xlsx`-only first release?
2. Approve one visible selected sheet and confirmed header row per import?
3. Approve school-wide profile/alias scope and both header/value mapping concepts?
4. Approve preview-confirmation creation boundary and zero partial persistence?
5. Approve semantic checksum serialization, target-scoped receipt uniqueness and replay response?
6. Recompute checksum on manual DRAFT edits, or forbid such edits for imported drafts?
7. Select a Node 22-compatible parser and exact security limits after a pinned-version spike?

## Explicit non-scope

This Proposed ADR does not authorize schema/migration, dependency installation, parser/API/contracts/tests/UI, raw file storage, completeness, PPCT, special activities, CalendarException, substitutions/make-up, Room, deployment or production access. ADR-015 remains Proposed. Implementation awaits independent review and a later task.
