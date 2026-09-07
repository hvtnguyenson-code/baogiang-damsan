# ADR-047 — Đam San TKB Native Workbook Architecture

- **Status:** Accepted by closed `P2-030` / `SYNC-P2-030`
- **Date:** 2026-09-07
- **Scope:** Authoritative 4-sheet workbook contracts, cell parser precedence, class/teacher peer cross-check, session separation, teacher code resolution, special activity classification, and fail-closed mismatch taxonomy.
- **Task baseline:** `main@7e99a245f2b1dcf112d63721563d1082a0ea237f`
- **Traceability:** T25, T26, T27; downstream P2-040, P2-050
- **Acceptance evidence:** privacy-clean branch `docs/tkb-native-workbook-architecture-030-clean`; reviewed head `bd7021ce8944848edbe1c3f10342a0a644b78f47`; independent GitHub diff/privacy review PASS; PR #111; exact-head CI #375 (run `34076797404`) SUCCESS; merge/main `6fde93eaf12a2dceb3bb9bc5ea3ccc46e27878b2`; post-merge main CI #376 (run `34077121063`) SUCCESS.

---

## Context

Under pre-pilot traceability items T25, T26, and T27, Trường PTDTNT THPT Đam San operates timetable management using an authoritative multi-view Excel workbook rather than generic single-sheet tabular dumps.

The existing timetable import subsystem (`ADR-021`–`ADR-026`, `ADR-030`) was designed around canonical/profile-based single-sheet imports. However, real operational evidence (`TKB-LAN-1-TUAN-1-03.9.26-in.xlsx`, SHA-256 `3ea242433d1d291912749cf9f2f6b39b700847bfc09384dec9c6849b15597c72`) demonstrates:

1. **Multi-Sheet Structure**: Four distinct worksheets separating class and teacher perspectives across morning and afternoon sessions:
   - `TKB THEO LỚP BUỔI SÁNG`
   - `TKB-GV-SANG`
   - `TKB THEO LỚP BUỔI CHIỀU`
   - `TKB-GV-CHIỀU`
2. **Dual Peer Evidence**: Neither the class view nor the teacher view alone constitutes complete, infallible authority. They are peer evidence sources that must be reconciled.
3. **Session Independence**: Morning and afternoon timetables have independent distribution structures (e.g. afternoon contains physical education and national defense, with distinct teacher subsets) and can be authored/updated independently.
4. **Special Non-Peer Activities**: Legitimate school activities (`CC`, `GDĐP`, `TN-HN`) exist in the class matrix without individual teacher assignments in the base timetable.
5. **Teacher-Linked Markers**: Markers like `<SubjectCode>-<TeacherCode>` and `SH-<TeacherCode>` require matching peer assignments in the teacher view.

Prior to P2-030, this operational reality was `BLOCKED_EVIDENCE`. Now that the authoritative workbook has been audited and validated locally, this ADR formally defines the architectural contracts required for the native adapter (`P2-040`) and session update workflow (`P2-050`).

---

## Decision

### 1. Dedicated Native Adapter Architecture (T25)

The native Đam San workbook is supported via a dedicated native adapter (`DamSanNativeTimetableAdapter`) positioned directly upstream of the canonical timetable import pipeline.

- The native adapter accepts the 4-sheet workbook, performs strict structural parsing, executes peer reconciliation, extracts effective dates, and canonicalizes the data into standard timetable entries.
- The canonical persistence foundations (`ADR-017`, `ADR-022`) and validation engine (`ADR-019`) are preserved without regression.
- The native adapter does not bypass capability authorization or canonical import idempotency bindings (`ADR-025`, `ADR-026`).
- **Traceability Boundary**: ADR-047 defines the native architecture; runtime adapter implementation remains owned by `P2-040`.

### 2. Four-Sheet Recognition & Boundary Enforcement

The workbook parser strictly enforces the presence and structure of all four worksheets:

1. `TKB THEO LỚP BUỔI SÁNG`: Class-view data in Rows 7–36, Columns C..T (Cols 3–20, 18 classes: `10A1`..`12A6`). Non-empty business content ends at Row 38 (Row 37 = legend/signature; Row 38 = special activity note).
2. `TKB-GV-SANG`: Teacher-view data in Rows 8–45, Columns B..AE (Cols 2–31, 38 staff rows, 6 days × 5 periods = 30 period columns).
3. `TKB THEO LỚP BUỔI CHIỀU`: Class-view data in Rows 7–36, Columns C..T. Non-empty content ends at Row 37 (Row 37 = legend/signature).
4. `TKB-GV-CHIỀU`: Teacher-view data in Rows 8–45, Columns B..AE.

- Rows 1–6 are parsed strictly as institutional headers, date metadata, and column coordinates.
- Rows ≥ 37 in class sheets and Rows ≥ 46 in teacher sheets are recognized as document boundaries and MUST NOT be parsed as timetable slots.
- Any workbook with missing, extra, or misspelled sheets fails closed immediately with `TKB_NATIVE_SHEET_STRUCTURE_INVALID`.

### 3. Explicit Cell Parser Precedence

To handle tokens deterministically, the class-view cell parser MUST follow this strict evaluation precedence:

1. **Normalize**: Strip and trim bounded cell text.
2. **Blank Check**: If empty or whitespace -> `UNSCHEDULED`.
3. **Exact Special Non-Peer Classification**: Compare against allowlist:
   - `"CC"` -> `SPECIAL_NON_PEER`
   - `"GDĐP"` -> `SPECIAL_NON_PEER`
   - `"TN-HN"` -> `SPECIAL_NON_PEER`
4. **Teacher-Linked Token Parse**: If not allowlisted, parse as `<SubjectCode>-<TeacherCode>`:
   - Delimiter is the **LAST hyphen** (`lastIndexOf('-')`).
   - `SubjectCode` = substring before last hyphen.
   - `TeacherCode` = substring after last hyphen.
5. **Component Validation**: Both components must be non-empty and valid identifier tokens.
6. **Peer Evidence Requirement**: Every teacher-linked token requires peer evidence.

> [!CAUTION]
> **Precedence Invariant**:
> `TN-HN` MUST NOT be parsed through the hyphen-split path as Subject `TN` and Teacher `HN`. Step 3 MUST intercept `TN-HN` before Step 4.

### 4. Special Activity Classification & Neutral SH Semantics

Class-view markers are classified as follows:

- **`CC` (Chào cờ)**: School assembly (Monday Period 1, 18 slots). Permitted non-peer activity. No individual teacher peer required.
- **`GDĐP` (Giáo dục địa phương)** & **`TN-HN` (Trải nghiệm, hướng nghiệp)**: Modular programmes rotating weekly. Permitted non-peer activities in base timetable (GDĐP = 48 slots; TN-HN = 54 slots across Saturday Periods 2, 3, 4 for all 18 classes).
- **`SH-<TeacherCode>`**: Saturday Period 1 across all 18 classes (18 slots). **Remains strictly teacher-linked**.
  - Must be parsed through the teacher-linked token path (`SubjectCode = SH`, `TeacherCode = <code >`).
  - Must reconcile 1:1 with teacher-view peer. Missing, duplicate, or conflicting peer fails closed.
  - **Neutral Semantics**: The workbook legend does not define `SH`. ADR-047 does not assert a business label such as "Sinh hoạt lớp" because no explicit canonical authority exists in the evidence. P2-040 parses `SH` structurally as a teacher-linked code.
- **Strict Invariant**: Only `CC`, `GDĐP`, and `TN-HN` are exempt from teacher-peer matching. Any other marker lacking a teacher peer triggers `TKB_NATIVE_PEER_MISSING` and aborts import.

### 5. Saturday Schedule & Non-Overfitting

- Saturday evidence in this workbook:
  - Period 1: `SH-<TeacherCode>` (18 slots, teacher-linked).
  - Periods 2–4: `TN-HN` (18 × 3 = 54 slots, permitted non-peer).
  - Period 5: Blank across all 18 classes.
- **Non-Overfitting Rule**: Saturday Period 5 being blank proves that `blank cell = unscheduled`. It does NOT establish that Saturday Period 5 must always be blank. Future valid workbooks with scheduled Saturday Period 5 slots must not be rejected on this basis.

### 6. Class-View ↔ Teacher-View Peer Reconciliation (T26)

Class view and teacher view are **peer evidence sources**. Ingestion requires bidirectional cross-validation across all scheduled slots using structural source row references:

1. **Teacher Source Row Indexing**:
   - Each teacher row (8..45) is indexed as `TeacherSourceRowRef = (sheet, rowNumber)`.
   - For every non-blank cell at `(Day, Period)`, record `(Session, Day, Period, TargetClass) -> TeacherSourceRowRef`.
   - Column A display text is untrusted source decoration / audit evidence only; it is NOT canonical identity authority and MUST NOT be used to resolve Users.
   - If multiple teacher rows claim the same `(Session, Day, Period, TargetClass)`: fail closed immediately with `TKB_NATIVE_PEER_DUPLICATE`.
2. **Class-View Peer Correlator**:
   - For every non-blank class slot `(Session, Day, Period, Class)` with teacher-linked marker `SubjectCode-TeacherCode` (including `SH-*`):
     - Lookup corresponding teacher slot for `(Session, Day, Period, Class)`.
     - If not found: fail closed with `TKB_NATIVE_PEER_MISSING`.
     - Associate the slot's `TeacherCode` with the matched `TeacherSourceRowRef`.
3. **Orphan & Non-Peer Conflict Rejection**:
   - For every indexed teacher slot `(Session, Day, Period, TargetClass)`: the class view must have a matching scheduled slot.
   - If class slot is blank or contains a non-peer special activity (`CC`, `GDĐP`, `TN-HN`): fail closed with `TKB_NATIVE_PEER_ORPHAN` or `TKB_NATIVE_PEER_CONFLICT`.
4. **Row TeacherCode Derivation**:
   - Collect all `TeacherCode` tokens from matched class-view peers for each active `TeacherSourceRowRef`.
   - Each active teacher row MUST derive exactly ONE distinct `TeacherCode`.
   - If a row's matched slots imply multiple distinct teacher codes: fail closed with `TKB_NATIVE_TEACHER_CODE_CONFLICT`.
5. **Zero-Allocation Teacher Rows**:
   - Rows with 0 scheduled morning and 0 scheduled afternoon slots (e.g. Row 25 in the authoritative workbook) are treated as inert roster evidence: no `TeacherCode` is derived, no canonical `User` is resolved, and no failure occurs.
- **Traceability Boundary**: ADR-047 defines the peer cross-check architecture; runtime enforcement is implemented in `P2-040`.

### 7. Morning / Afternoon Session Decoupling (T27)

Morning and afternoon sheets represent independent session streams:

- Morning: Sheets 1 & 2 (`MORNING`).
- Afternoon: Sheets 3 & 4 (`AFTERNOON`).
- Missing allocations across sessions (e.g. subject teachers having 0 afternoon periods, or PE/Defense teachers having 0 morning periods) are standard operational reality, NOT corruption.
- The adapter parses both sessions as distinct structural models before combining them into a canonical draft.
- **Traceability Boundary**: ADR-047 preserves session decoupling and data structures; selective session update and carry-forward workflow remain owned by `P2-050`.

### 8. Teacher Identity Resolution & Display-Name Privacy Boundary

- **No Display Name Authority**: Column A display text is untrusted source decoration. The adapter MUST NOT attempt `TeacherName -> User` or fuzzy/accent-folded name matching.
- **Derived TeacherCode as Identity Key**: Canonical teacher resolution operates strictly on the single `TeacherCode` derived from peer-reconciled class markers:
  ```text
  teacher-view source row (TeacherSourceRowRef)
      +
  matched class-view teacher-linked slots
      ↓
  exact derived TeacherCode
      ↓
  canonical exact code/alias resolver
      ↓
  User
  ```
- **Canonical Resolution Authority (ADR-024 Alignment)**:
  - Resolution reuses exact canonical timetable-import authority: active `StaffProfile.staffCode` and approved `TimetableImportEntityAlias` (scope `TEACHER`).
  - 0 active candidates -> fail closed with `TKB_NATIVE_TEACHER_IDENTITY_UNKNOWN`.
  - Multiple candidates or disagreement between staffCode and alias -> fail closed with `TKB_NATIVE_TEACHER_CODE_CONFLICT`.
  - If staffCode and approved alias point to the same active `User` -> deduplicate and PASS.
  - No heuristic, fuzzy, or namespace-preference precedence is permitted.
- **Display-Name Privacy Boundary**:
  - Teacher display text is not persisted as canonical teacher key and is not required for successful resolution.
  - Client-facing diagnostics must reference grid coordinates `(sheet, rowNumber, column)` and derived `TeacherCode`, never unscrubbed raw display names.
  - Test fixtures use synthetic codes (`GV01`..`GV38`) and synthetic names (`Giáo viên 01`..`Giáo viên 38`) with 0 real-world leaks.

### 9. Effective-Date Extraction & Checksum Provenance

- The civil effective date is extracted from the standardized title on Row 4 (`ÁP DỤNG TỪ NGÀY DD/MM/YYYY`).
- All 4 sheets must state identical effective dates; mismatch fails closed.
- The effective date must match an active `AcademicWeek` within the target calendar.
- The raw XLSX SHA-256 digest is computed server-side to participate in `confirm-request-v1` request fingerprinting (`requestFingerprint`) and idempotent replays per `ADR-021`/`ADR-026`. Persisted canonical business identity on `TimetableVersion` is governed by `semantic-v1` checksum (`contentChecksum`). Raw workbook bytes are not persisted, and no new receipt column is introduced by P2-040.

### 10. Sanitized Fixture Contract for Downstream Tests

- Automated deterministic testing for `P2-040` must use the sanitized fixture `apps/api/test/fixtures/tkb/sanitized-dam-san-tkb-fixture.xlsx`.
- The fixture preserves 100% of matrix layout, coordinates, class codes, subject codes, and reconciliation counts while using synthetic teacher names (`Giáo viên 01`..`Giáo viên 38`) and synthetic teacher codes (`GV01`..`GV38`).
- Verified zero leak count: 0 real teacher names, 0 raw teacher codes.
- Fixture profile under ADR-017/P4 boundary reconciliation: 455 normal teacher-linked curricular rows persisted as canonical `TimetableEntry`, and 120 permitted non-peer slots (`CC`: 18, `GDĐP`: 48, `TN-HN`: 54) verified and reconciled as structural non-peer timetable evidence without fabricating artificial teacher/assignment semantics.

### 11. Selective Session Authoring & Carry-Forward Boundary (P2-050)

- **Native Authoring Modes**:
  - `BOTH`: Default mode for `DAMSAN_NATIVE`. All four sheets are strictly required, validated, and source-authoritative.
  - `MORNING`: Sheets 1 & 2 (`TKB THEO LỚP BUỔI SÁNG` and `TKB-GV-SANG`) are source-authoritative. Unselected afternoon sheets in the uploaded workbook are non-authoritative and ignored.
  - `AFTERNOON`: Sheets 3 & 4 (`TKB THEO LỚP BUỔI CHIỀU` and `TKB-GV-CHIỀU`) are source-authoritative. Unselected morning sheets in the uploaded workbook are non-authoritative and ignored.
  - Supplying `nativeSessionMode` on generic import requests (`sourceFormat !== 'DAMSAN_NATIVE'`) fails closed with `TIMETABLE_IMPORT_INVALID_SOURCE_FORMAT`.
- **Date-Effective Canonical Baseline**:
  - For selective authoring (`MORNING` or `AFTERNOON`), the canonical baseline timetable is resolved strictly at `target.effectiveFrom` using ADR-020 historical resolution: `academicYearId` match, `status in ['ACTIVE', 'SUPERSEDED']`, `effectiveFrom <= targetDate`, `effectiveUntil null OR >= targetDate`.
  - Non-published candidates (`DRAFT`, `VALIDATED`, `APPROVED`) and later/earlier non-overlapping versions cannot serve as baseline.
  - If no effective baseline exists for a selective update, the operation fails closed with `TKB_NATIVE_CARRY_FORWARD_BASELINE_MISSING`. Partial TimetableVersions are never created.
- **Exact Carry-Forward Composition**:
  - The final composed timetable equals the newly authored rows from the selected session plus exact carried-forward baseline rows whose `TimeSlotDefinition.session` is unauthored.
  - Carried rows preserve exact original canonical provenance IDs (`weekday`, `timeSlotDefinitionId`, `schoolClassId`, `subjectId`, `teachingAssignmentId`, `teacherUserId`).
  - Carried rows are never re-resolved through current teacher codes, aliases, class codes, or staff assignments.
- **Full Composed Validation & Checksum**:
  - Canonical validation (`evaluateTimetableEntries`) is executed across the entire composed transient entry set (authored + carried forward), preventing cross-session room/teacher collisions or invalid states.
  - The canonical `semanticChecksum` is calculated over the full composed canonical rows.
- **Preview & Request Idempotency**:
  - Preview diff compares the full composed timetable against the ADR-020 effective baseline timetable and returns bounded composition metadata (`mode`, `baselineTimetableVersionId`, `authoredEntryCount`, `carriedForwardEntryCount`, `finalEntryCount`).
  - Request replay and idempotency use server-owned sheet sentinels (`ALL_SHEETS`, `MORNING_SHEETS`, `AFTERNOON_SHEETS`) to encode native authoring mode without client override or schema change.
- **Schema & P4 Invariants**:
  - Session authority resides strictly in `TimeSlotDefinition.session`; no session column is added to `TimetableEntry` or `TimetableVersion`.
  - Special non-peer activities (`CC`, `GDĐP`, `TN-HN`) remain non-persisted structural evidence; no fake teacher assignments or P4 semantics are fabricated.

---

## Consequences

### Positive
- Formalizes the exact real-world workbook structure of Trường PTDTNT THPT Đam San without guessing or approximating contracts.
- Locked parser precedence prevents misclassification of hyphenated tokens like `TN-HN`.
- Peer cross-checking guarantees that schedule collisions and transcription typos between class schedules and teacher rosters are intercepted before publication.
- Establishes a clean architectural boundary between architecture (`P2-030`), adapter runtime (`P2-040`), and selective session updates (`P2-050`).
- Strict privacy adherence: zero real teacher names and zero raw teacher codes committed to Git.

### Neutral / Trade-offs
- School staff must upload workbooks conforming to the 4-sheet format. Variations in sheet naming or matrix coordinates will fail closed until an explicit profile update or adapter configuration is registered.
- Special activities (`CC`, `GDĐP`, `TN-HN`, 120 slots) are verified structurally and proven free of teacher-peer collisions; per `ADR-017`, `TimetableEntry` stores teacher-linked curricular lessons (455 rows), while modular programme occurrence materialization remains governed by `P4` special programme rules where applicable. Raw upload bytes are not persisted.