# ADR-047 — Đam San TKB Native Workbook Architecture

- **Status:** Proposed on branch `docs/tkb-native-workbook-architecture-030` (`IN_REVIEW`)
- **Date:** 2026-09-07
- **Scope:** Authoritative 4-sheet workbook contracts, class/teacher peer cross-check, session separation, teacher code resolution, special activity classification, and fail-closed mismatch taxonomy.
- **Task baseline:** `main@7e99a245f2b1dcf112d63721563d1082a0ea237f`
- **Traceability:** T25, T26, T27; downstream P2-040, P2-050

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

Prior to P2-030, this operational reality was `BLOCKED_EVIDENCE`. Now that the authoritative workbook has been audited and validated locally, this ADR formally defines the architectural contracts required for the native adapter (`P2-040`) and session update workflow (`P2-050`).

---

## Decision

### 1. Dedicated Native Adapter Architecture (T25)

The native Đam San workbook is supported via a dedicated native adapter (`DamSanNativeTimetableAdapter`) positioned directly upstream of the canonical timetable import pipeline.

- The native adapter accepts the 4-sheet workbook, performs strict structural parsing, executes peer reconciliation, extracts effective dates, and canonicalizes the data into standard timetable entries.
- The canonical persistence foundations (`ADR-017`, `ADR-022`) and validation engine (`ADR-019`) are preserved without regression.
- The native adapter does not bypass capability authorization or canonical import idempotency bindings (`ADR-025`, `ADR-026`).

### 2. Four-Sheet Recognition & Boundary Enforcement

The workbook parser strictly enforces the presence and structure of all four worksheets:

1. `TKB THEO LỚP BUỔI SÁNG`: Class-view data in Rows 7–36, Columns 3–20 (18 classes: `10A1`..`12A6`).
2. `TKB-GV-SANG`: Teacher-view data in Rows 8–45, Columns 2–31 (38 staff rows, 6 days × 5 periods).
3. `TKB THEO LỚP BUỔI CHIỀU`: Class-view data in Rows 7–36, Columns 3–20.
4. `TKB-GV-CHIỀU`: Teacher-view data in Rows 8–45, Columns 2–31.

- Rows 1–6 are parsed strictly as institutional headers, date metadata, and column coordinates.
- Rows ≥ 37 in class sheets (legends, signature blocks, operational notes) and Rows ≥ 46 in teacher sheets are recognized as document boundaries and MUST NOT be parsed as timetable slots.
- Any workbook with missing, extra, or misspelled sheets fails closed immediately.

### 3. Class-View ↔ Teacher-View Peer Reconciliation (T26)

Class view and teacher view are **peer evidence sources**. Ingestion requires bidirectional cross-validation across all scheduled slots:

1. **Class -> Teacher Matching**: For every non-blank class slot `(Session, Day, Period, Class)` with marker `SubjectCode-TeacherCode`:
   - Exactly one teacher in the corresponding teacher view must have `Class` assigned at `(Day, Period)`.
   - The teacher's bound code must match `TeacherCode`.
2. **Teacher -> Class Matching**: For every non-blank teacher slot `(Session, Day, Period, Teacher)` with target `Class`:
   - The class view must have an active assignment for that class at `(Day, Period)` with a matching teacher code.
3. **Orphan & Collision Rejection**:
   - Multiple teachers assigned to the same class slot in teacher view = fatal collision (`TKB_NATIVE_PEER_DUPLICATE`).
   - Teacher assigned in teacher view without class-view peer = fatal inconsistency (`TKB_NATIVE_PEER_ORPHAN`).
   - Mismatches fail closed. No silent fallback or unilateral preference for either sheet is permitted.

### 4. Special Activity Classification Invariant

Special activity markers in class view are explicitly classified:

- **`CC` (Chào cờ)**: School-wide assembly (Monday Period 1). Permitted non-peer activity. No individual teacher peer required.
- **`GDĐP` (Giáo dục địa phương)** & **`TN-HN` (Trải nghiệm, hướng nghiệp)**: Modular programmes rotating weekly. Permitted non-peer activities in base timetable. No individual teacher peer required.
- **`SH-<TeacherCode>` (Sinh hoạt lớp)**: Homeroom period (Saturday Period 4). NOT a non-peer activity; MUST reconcile 1:1 with homeroom teacher peer.
- **Strict Invariant**: Only `CC`, `GDĐP`, and `TN-HN` are exempt from teacher-peer matching. Any other marker lacking a teacher peer triggers `TKB_NATIVE_PEER_MISSING` and aborts import.

### 5. Morning / Afternoon Session Decoupling (T27)

Morning and afternoon sheets represent independent session streams:

- Morning: Sheets 1 & 2 (`MORNING`).
- Afternoon: Sheets 3 & 4 (`AFTERNOON`).
- Missing allocations across sessions (e.g. subject teachers having 0 afternoon periods, or PE/Defense teachers having 0 morning periods) are standard operational reality, NOT corruption.
- The adapter parses both sessions as distinct structural models before combining them into a canonical draft.
- Downstream task `P2-050` will build upon this contract to allow selective session updates (e.g. updating afternoon without disturbing morning).

### 6. Teacher Identity Resolution & Code Privacy

- Teacher markers in class view use compact abbreviations (`T1`, `V3`, `TD4`, etc.).
- The authoritative audit confirms 1:1 mapping between teacher codes and teacher rows with 0 ambiguity.
- **Privacy & Security Constraint**: Real staff names must NEVER be hardcoded into application source code or git fixtures.
- The adapter resolves teacher codes dynamically via peer alignment with the teacher view and the school user/staff catalog (`User.profile.staffCode` / `TimetableImportEntityAlias`). Unresolvable teacher names or codes trigger fail-closed errors.

### 7. Effective-Date Extraction & Checksum Provenance

- The civil effective date is extracted from the standardized title on Row 4 (`ÁP DỤNG TỪ NGÀY DD/MM/YYYY`).
- All 4 sheets must state identical effective dates; mismatch fails closed.
- The effective date must match an active `AcademicWeek` within the target calendar.
- The SHA-256 digest of the ingested workbook is computed and recorded on `TimetableImportReceipt` to guarantee auditability and idempotent replays.

### 8. Sanitized Fixture Contract for Downstream Tests

- Automated deterministic testing for `P2-040` must use the sanitized fixture `apps/api/test/fixtures/tkb/sanitized-dam-san-tkb-fixture.xlsx`.
- The fixture preserves 100% of the matrix layout, coordinates, formulas, and marker codes while replacing Column 1 teacher names with synthetic tokens (`Giáo viên 01`..`Giáo viên 38`).
- The raw workbook remains strictly untracked.

---

## Consequences

### Positive
- Formalizes the exact real-world workbook structure of Trường PTDTNT THPT Đam San without guessing or approximating contracts.
- Peer cross-checking guarantees that schedule collisions and transcription typos between class schedules and teacher rosters are intercepted before publication.
- Establishes a clean architectural boundary between architecture (`P2-030`), adapter runtime (`P2-040`), and selective session updates (`P2-050`).
- Strict privacy adherence: zero real teacher names committed to Git.

### Neutral / Trade-offs
- School staff must upload workbooks conforming to the 4-sheet format. Variations in sheet naming or matrix coordinates will fail closed until an explicit profile update or adapter configuration is registered.
- Special activities `GDĐP` and `TN-HN` are ingested into timetable slots without teacher assignment; actual teaching execution and teacher workload for these programmes remain governed by `P4` special programme rules.
