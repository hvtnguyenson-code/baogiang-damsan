# P3-020 — Pre-operational Historical Teaching Runtime

## Status

`IN_REVIEW`

## Canonical execution context

- task: `P3-020`
- authority: ADR-055 / closed `P3-010`
- canonical start: `main@2ffcb9db61017a179c3f26662130f05d341514fa`
- branch: `feat/p3-020-preop-history-runtime`
- traceability: `T29`, `T30`
- production state: `PRE-OPERATIONAL`

## Delivered runtime

P3-020 implements the retained historical curricular evidence path required by delayed go-live.

### Input contract

The management UI accepts bounded CSV or spreadsheet-paste TSV with exact business columns:

`LOP, MON, NGAY_GOC, BUOI_GOC, TIET_GOC, GIAO_VIEN_THUC_DAY, LOAI, NGAY_DAY_THUC_TE, BUOI_THUC_TE, TIET_THUC_TE, GHI_CHU`

Supported business kinds:

- `BINH_THUONG` / NORMAL;
- `DAY_THAY` / SUBSTITUTION;
- `DAY_BU` / MAKEUP.

The source never accepts UUIDs, PPCT sequence overrides, PPCT item IDs or a manual progress cursor.

### Preview / confirm boundary

Preview is read-only against business truth. It:

- resolves the current authoritative OPERATIONAL_START policy;
- parses and normalizes the bounded source;
- resolves class, subject, staff-code, retained timetable/calendar/slot, assignment and PPCT allocation;
- resolves exact historical replacement/overlay provenance;
- checks eligibility, collision, week/segment and active-obligation conflicts;
- returns row findings plus a server-issued `batchRef` and full `requestFingerprint`.

Confirm sends the source again together with `batchRef`, `requestFingerprint` and an idempotency `requestKey`. The server re-runs the complete resolution inside the confirm transaction and rejects any preview drift.

No caller-supplied canonical execution, PPCT, timetable, assignment, calendar, overlay or schedule ID is trusted.

This is the concrete P3-020 realization of ADR-055 D13: the server-issued preview identity is deterministic and non-authoritative until confirm; no preview attempt is persisted as business truth.

### Persistence

The migration adds only retained import provenance:

- `HistoricalTeachingImportBatch`;
- `HistoricalTeachingImportRow`;
- `HistoricalTeachingImportKind`.

Canonical completion truth remains `CurricularTeachingExecution`.

Batch provenance pins:

- academic year;
- source SHA-256;
- OPERATIONAL_START policy-version ID and resolved start date;
- request key/fingerprint;
- confirming actor/time.

Row provenance pins normalized business coordinates, row hash, canonical execution ID and optional linked disposition/make-up schedule.

Raw CSV/TSV text is not retained in PostgreSQL.

### Ownership boundary for reconstructed overlays

A historical row separately records whether P3 **created/replaced** its linked:

- `OperationalLessonDisposition`; or
- `MakeupTeachingSchedule`.

If preview reuses an already-existing compatible overlay/schedule, P3 records the reference but does **not** own it.

Therefore reversing a P3 execution:

- reverses the canonical execution;
- reverses a linked disposition/make-up schedule only when that provenance was materialized by P3;
- never mutates an external reused operational authority.

The database carries explicit ownership booleans plus shape backstops.

### Canonical execution semantics

NORMAL:

- exact retained source opportunity;
- exact allocator-derived PPCT item/revision;
- exact responsible teacher;
- same source/execution date and slot.

SUBSTITUTION:

- same original obligation;
- different actual teacher;
- exact date-effective StaffSubject proof;
- exact SAME_SUBJECT_SUBSTITUTION provenance created/replaced or safely reused;
- actual-teacher occupancy collision checks against canonical TKB, SpecialActivity and active make-up schedules.

MAKEUP:

- exact source obligation that consumes PPCT;
- source may be BASE_TIMETABLE or compatible incomplete operational disposition;
- exact past target date/slot/calendar/week;
- exact date-effective StaffSubject proof;
- target collision checks against TKB, SpecialActivity and active make-up schedules;
- exact make-up schedule provenance created/replaced or safely reused.

An AUTHORIZED_CANCELLATION that does not consume PPCT cannot be turned into historical make-up completion.

### Atomicity / correction

Confirm uses one outer `SERIALIZABLE` transaction.

Within that transaction the system:

1. re-resolves preview authority;
2. creates the retained batch;
3. materializes/reuses exact overlay provenance;
4. creates canonical `CurricularTeachingExecution`;
5. creates retained import-row provenance;
6. writes sanitized audit evidence.

Existing partial unique `curricular_exec_one_active_obligation_key` remains the database race backstop for one ACTIVE owner per exact PPCT obligation.

Request-key replay is allowed only for the same academic year, source SHA-256, server-issued preview identity and fingerprint.

Correction is reverse + later replacement. Existing rows are never edited into a different historical fact.

### Reconciliation

The SCHOOL_WIDE management read model replays the pre-operational window and classifies expected consuming opportunities as:

- `CONFIRMED`;
- `UNCONFIRMED`;
- `CONFLICT`.

`UNCONFIRMED` remains negative evidence only and is never converted to debt/late/completion.

Orphan or provenance-mismatched ACTIVE executions are surfaced as conflict findings instead of being silently hidden.

### Authorization

All P3-020 endpoints require exact:

`TEACHING_EXECUTION_MANAGE / SCHOOL_WIDE`

The UI route uses the same capability. There is no role/title, SYSTEM_ADMIN, PPCT_MANAGE or frontend-only authorization fallback.

### UI

Management route:

`/quan-tri/lich-su-giang-day`

The page provides:

- academic-year selection;
- CSV/TSV paste;
- deterministic preview/findings;
- final confirm;
- class/subject reconciliation;
- reverse-for-correction workflow.

### Regression coverage

The branch includes parser and PostgreSQL integration coverage for:

- NORMAL historical confirmation and retained provenance;
- ordinary pre-operational confirm remaining fail-closed;
- SUBSTITUTION reconstruction;
- MAKEUP reconstruction;
- no-auto-debt reconciliation semantics;
- reverse + replacement lineage;
- request-key idempotent replay;
- server-issued preview identity mismatch;
- SCHOOL_WIDE authorization;
- spreadsheet TSV paste;
- reused disposition ownership isolation;
- reused make-up ownership isolation;
- substitute occupancy collision.

## Explicit non-effects

P3-020 does not:

- enable future/public make-up scheduling — `P3-030/P3-031` own that;
- own GDĐP/HĐTN/SpecialActivity historical execution;
- weaken ordinary teaching-execution guards;
- introduce a manual PPCT cursor;
- create debt from missing history;
- rewrite frozen Reporting Statements;
- deploy or mutate production/VPS.

## Parent closure gate

P3-020 remains `IN_REVIEW` until:

1. independent branch diff review passes;
2. exact-head PR CI succeeds;
3. parent PR merges normally;
4. authoritative post-merge main CI succeeds;
5. `SYNC-P3-020` records final evidence.

Only then does `P3-020` become `CLOSED`.
