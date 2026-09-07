# P2-030 — Đam San TKB Native-Workbook Architecture Audit

## Status

- **Task ID**: `P2-030`
- **Status**: `IN_REVIEW` (branch `docs/tkb-native-workbook-architecture-030`)
- **Canonical Starting Commit**: `7e99a245f2b1dcf112d63721563d1082a0ea237f`
- **Relevant Traceability**: `T25`, `T26`, `T27`
- **Decision Authority**: `ADR-047-TKB-NATIVE-WORKBOOK-ARCHITECTURE.md`
- **Downstream Implementations**:
  - `P2-040`: Đam San TKB native adapter implementation (`DamSanNativeTimetableAdapter`) on top of canonical importer pipeline.
  - `P2-050`: Morning/afternoon selective update and carry-forward workflow.

---

## 1. Authoritative Evidence Identification

The audit was performed on the authoritative operational timetable workbook supplied for Trường PTDTNT THPT Đam San:

- **Original Filename**: `TKB-LAN-1-TUAN-1-03.9.26-in.xlsx`
- **Exact Local Evidence Path**: `D:\Chuyên môn\2026-2027\Văn bản Nhà trường\TKB-LAN-1-TUAN-1-03.9.26-in.xlsx`
- **Byte Size**: `38,974` bytes
- **SHA-256 Digest**: `3ea242433d1d291912749cf9f2f6b39b700847bfc09384dec9c6849b15597c72`
- **Institution Header**:
  - `SỞ GIÁO DỤC VÀ ĐÀO TẠO ĐẮK LẮK` (Row 1, Cols 1..8)
  - `TRƯỜNG PTDTNT THPT ĐAM SAN` (Row 2, Cols 1..8)
- **Document Date**: `Ea Drông, ngày 03 tháng 9 năm 2026` (Row 3, Cols 9..15 / 10..15)
- **Academic Year**: `2026-2027`
- **Effective Date Stated**: `07/09/2026` (`ÁP DỤNG TỪ NGÀY 07/9/2026`)

> [!IMPORTANT]
> **Data Privacy Boundary**:
> The raw workbook contains personal identity information (staff names) and must NEVER be committed to Git or copied into tracked repository paths. All test fixtures derived from this audit must use synthetic teacher identities while preserving 100% of structural topology.

---

## 2. Four-Sheet Recognition Contract

The native Đam San timetable workbook consists of exactly four worksheets representing independent session views and peer evidence:

| Index | Exact Sheet Name | Semantic Role | Dimension / Range | Populated Data Rows |
|---|---|---|---|---|
| 1 | `TKB THEO LỚP BUỔI SÁNG` | Morning Class View | `R1C1:R41C20` (44 rows × 31 cols) | Rows 7..36 (30 periods) |
| 2 | `TKB-GV-SANG` | Morning Teacher View | `R1C1:R45C31` (45 rows × 31 cols) | Rows 8..45 (38 teacher rows) |
| 3 | `TKB THEO LỚP BUỔI CHIỀU` | Afternoon Class View | `R1C1:R41C20` (44 rows × 31 cols) | Rows 7..36 (30 periods) |
| 4 | `TKB-GV-CHIỀU` | Afternoon Teacher View | `R1C1:R45C31` (45 rows × 31 cols) | Rows 8..45 (38 teacher rows) |

### Sheet Recognition Invariants

1. **Exact Four-Sheet Invariant**: The native parser adapter MUST verify the presence of all 4 sheets by exact normalized name. Any missing sheet, misspelled sheet name, or unauthorized additional sheet fails closed with `TKB_NATIVE_SHEET_STRUCTURE_INVALID`.
2. **Session Separation Invariant**: Morning (`MORNING`) is constituted by Sheets 1 & 2. Afternoon (`AFTERNOON`) is constituted by Sheets 3 & 4.
3. **Dual Peer Invariant**: Within each session, the class-view sheet and the teacher-view sheet are **peer evidence sources**. Neither view is the sole authority; they must cross-validate and reconcile.

---

## 3. Strict Boundary & Matrix Structure

### 3.1 Class-View Sheets (`TKB THEO LỚP BUỔI SÁNG` & `TKB THEO LỚP BUỔI CHIỀU`)

- **Rows 1–3**: Organizational and issuing metadata.
- **Row 4**: Document title with session, academic year, and effective date (`THỜI KHOÁ BIỂU BUỔI SÁNG NĂM HỌC 2026-2027 - ÁP DỤNG TỪ NGÀY 07/9/2026`).
- **Row 5**: Blank delimiter row.
- **Row 6 (Header Row)**:
  - Column 1 (`C1`): `"Thứ"` (Weekday).
  - Column 2 (`C2`): `"Tiết"` (Period ordinal).
  - Columns 3–20 (`C3`–`C20`): Exactly 18 class codes in strict order:
    - Grade 10 (6 classes): `10A1`, `10A2`, `10A3`, `10A4`, `10A5`, `10A6`.
    - Grade 11 (6 classes): `11A1`, `11A2`, `11A3`, `11A4`, `11A5`, `11A6`.
    - Grade 12 (6 classes): `12A1`, `12A2`, `12A3`, `12A4`, `12A5`, `12A6`.
- **Rows 7–36 (Data Matrix Rows)**:
  - Exactly 30 rows representing 6 teaching weekdays (Thứ 2 to Thứ 7), each with 5 periods (Tiết 1 to Tiết 5).
  - Column 1 has the day integer (`2`, `3`, `4`, `5`, `6`, `7`), visually merged across 5 periods of that day.
  - Column 2 has the period ordinal (`1`, `2`, `3`, `4`, `5`).
  - Columns 3–20 represent the 18 classes. Total slot coordinate cells = 30 rows × 18 classes = `540` cells per session.
- **Rows 37–39 (Legend, Signature & Notes — Non-Data Boundaries)**:
  - **Row 37**:
    - Cols 1–15: Symbol abbreviations (`"Kí hiệu: Chào cờ-CC; Toán-TO; Lí-LI; Hóa-HO; Sinh-SI; Tin-TI; Công nghệ-CN; Văn-VA; Sử-SU; Địa-DI;Tiếng Anh-NN; Giáo dục KT và PL-CD; Trải nghiệm, hướng nghiệp-TN-HN; Giáo dục địa phương-GDĐP"`).
    - Cols 17–20: Approval block (`"KT. HIỆU TRƯỞNG \n PHÓ HIỆU TRƯỞNG"`).
  - **Rows 38–39**:
    - Cols 1–15: Explanatory note: `"Lưu ý: TKB của Hoạt động TN-HN và GDĐP thay đổi theo tuần. GVBM sẽ thông báo trước ít nhất 1 tuần để HS chuẩn bị."`
  - **Rows 40–44**: Blank/print formatting rows.
  - **Parser Boundary Rule**: The parser MUST NOT parse rows ≥ 37 as timetable slot data. Row 36 is the strict lower boundary of class-view grid data.

### 3.2 Teacher-View Sheets (`TKB-GV-SANG` & `TKB-GV-CHIỀU`)

- **Rows 1–3**: Organizational and issuing metadata.
- **Row 4**: Document title with session, academic year, and effective date (`THỜI KHÓA BIỂU GIÁO VIÊN BUỔI SÁNG - ÁP DỤNG TỪ NGÀY 07/9/2026`).
- **Row 5**: Blank delimiter row.
- **Row 6 (Day Group Header Row)**:
  - Column 1 (`C1`): `"Giáo viên"`.
  - Columns 2–31 (`C2`–`C31`): 30 columns representing 6 days × 5 periods:
    - Cols 2–6: `"Thứ 2"` (5 columns).
    - Cols 7–11: `"Thứ 3"` (5 columns).
    - Cols 12–16: `"Thứ 4"` (5 columns).
    - Cols 17–21: `"Thứ 5"` (5 columns).
    - Cols 22–26: `"Thứ 6"` (5 columns).
    - Cols 27–31: `"Thứ 7"` (5 columns).
- **Row 7 (Period Ordinal Header Row)**:
  - Column 1 (`C1`): `"Giáo viên"`.
  - Columns 2–31 (`C2`–`C31`): Repeating sequence of period ordinals: `1`, `2`, `3`, `4`, `5` for each day.
- **Rows 8–45 (Teacher Data Rows)**:
  - Exactly 38 rows representing 38 staff positions.
  - Column 1 contains teacher display identity.
  - Columns 2–31 contain the class code assigned to that teacher at `(Day, Period)`, or blank if not teaching.
- **Rows 46+ (Non-Data Boundary)**:
  - Empty rows. The parser MUST stop after Row 45.

---

## 4. Marker Classification & Subject/Teacher Parsing

### 4.1 Class-View Cell Grammar

Class-view cell contents fall strictly into two semantic categories:

```text
ClassViewCell ::= BlankCell | SpecialActivityToken | SubjectLessonMarker

SpecialActivityToken ::= "CC" | "GDĐP" | "TN-HN"

SubjectLessonMarker ::= SubjectCode "-" TeacherCode
```

Where:
- `BlankCell`: An empty or whitespace-only cell. Semantics: no scheduled activity for that class at this slot.
- `SpecialActivityToken`: A standardized school-wide or non-statically-staffed activity.
- `SubjectLessonMarker`: A hyphen-delimited token where:
  - `SubjectCode` = substring before the **last** hyphen (`lastIndexOf('-')`).
  - `TeacherCode` = substring after the **last** hyphen.

### 4.2 Special Activity Classification

1. **`CC` (Chào cờ — School-wide Flag Raising)**:
   - **Occurrences**: Exactly 18 slots (Thứ 2, Tiết 1, for all 18 classes).
   - **Peer Evidence**: Legitimate non-peer marker. Has **NO** individual teacher peer in the teacher view.
   - **Workload/PPCT**: School assembly activity; does not generate an ordinary subject teaching obligation for an individual teacher.
2. **`GDĐP` (Giáo dục địa phương — Local Education)**:
   - **Occurrences**: Exactly 48 slots across morning timetable.
   - **Peer Evidence**: Legitimate non-peer marker in base timetable. Has **NO** teacher assigned in `TKB-GV-SANG`.
   - **Reasoning**: Footnote on Row 39 of the authoritative workbook explicitly states that GDĐP schedule and teaching assignments rotate weekly and are announced dynamically. Detailed programme semantics and operational assignment remain owned by `P4` tasks (`P4-010`, `P4-020`).
3. **`TN-HN` (Hoạt động trải nghiệm, hướng nghiệp — Experiential Activities)**:
   - **Occurrences**: Exactly 54 slots across morning timetable.
   - **Peer Evidence**: Legitimate non-peer marker in base timetable. Has **NO** teacher assigned in `TKB-GV-SANG`.
   - **Reasoning**: Footnote on Row 39 explicitly states weekly rotation. Contains a hyphen but is parsed as a single special activity token (`TN-HN`), NOT subject `TN` and teacher `HN`.
4. **`SH-<TeacherCode>` (Sinh hoạt lớp — Homeroom Class Meeting)**:
   - **Occurrences**: Exactly 18 slots (Thứ 7, Tiết 4, for all 18 classes).
   - **Peer Evidence**: Has an exact 1:1 teacher peer in `TKB-GV-SANG`.
   - **Audit Verification**: All 18 `SH-*` slots reconcile 1:1 with homeroom teacher rows in the teacher sheet (`SH-T1`, `SH-T2`, `SH-V3`, etc.).

### 4.3 Subject Code Vocabulary Observed

The authoritative workbook exhibits the following 13 subject codes:

| Subject Code | Full Subject Name (Vietnamese) | Session |
|---|---|---|
| `TO` | Toán học | Morning |
| `VA` | Ngữ văn | Morning |
| `LI` | Vật lý | Morning |
| `HO` | Hóa học | Morning |
| `SI` | Sinh học | Morning |
| `TI` | Tin học | Morning |
| `CN` | Công nghệ | Morning |
| `SU` | Lịch sử | Morning |
| `DI` | Địa lý | Morning |
| `NN` | Tiếng Anh (Ngoại ngữ) | Morning |
| `CD` | Giáo dục kinh tế và pháp luật | Morning |
| `TD` | Giáo dục thể chất | Afternoon |
| `QP` | Giáo dục quốc phòng và an ninh | Afternoon |

### 4.4 Teacher-Code Resolution Invariants

- **Split Rule**: Splitting by the last hyphen (`lastIndexOf('-')`) is structurally safe across all 455 regular subject lessons and 18 homeroom lessons.
- **Uniqueness Finding**: In the authoritative workbook:
  - 33 distinct teacher codes exist in Morning; each maps to exactly ONE teacher row (0 ambiguous codes).
  - 4 distinct teacher codes exist in Afternoon (`TD1`, `TD2`, `TD4`, `TD5`); each maps to exactly ONE teacher row (0 ambiguous codes).
  - Zero teacher rows possess multiple distinct codes.
- **Parser Authority Invariant**:
  - Teacher codes (e.g. `T1`, `Đ2`, `TD4`) must NEVER be hardcoded to specific staff names in application source code.
  - The native adapter must resolve teacher identities via peer cross-validation with the teacher view and the system's `TimetableImportEntityAlias` or `User.profile.staffCode` catalog.

---

## 5. Peer Reconciliation Model & Audit Evidence

### 5.1 Reconciliation Algorithm

For each session (`MORNING` and `AFTERNOON`):

1. **Index Teacher Slots**:
   - For each teacher row (8..45) and time coordinate `(Day, Period)` where cell value is non-blank:
     - Target class = `normalize(cell.value)`.
     - Record tuple: `(Session, Day, Period, TargetClass) -> TeacherIdentity`.
     - Assert that no two teacher rows claim the same `(Session, Day, Period, TargetClass)` (Duplicate Teacher Detection).
2. **Index Class Slots**:
   - For each class column (3..20) and time coordinate `(Day, Period)` where cell value is non-blank:
     - Extract `Marker = normalize(cell.value)`.
     - If `Marker` ∈ {`CC`, `GDĐP`, `TN-HN`}:
       - Tag as `PERMITTED_NON_PEER_SPECIAL_ACTIVITY`.
       - Assert that NO teacher view slot exists for `(Session, Day, Period, Class)`. If a teacher view cell exists, fail closed with `TKB_NATIVE_PEER_CONFLICT`.
     - Else:
       - Decompose `Marker` -> `(SubjectCode, TeacherCode)`.
       - Lookup corresponding teacher slot for `(Session, Day, Period, Class)`.
       - If not found: Fail closed with `TKB_NATIVE_PEER_MISSING`.
       - If multiple teachers found: Fail closed with `TKB_NATIVE_PEER_DUPLICATE`.
       - Validate that the teacher's bound code matches `TeacherCode`.
3. **Check Inverse (Orphan Teacher Slots)**:
   - For every indexed teacher slot `(Session, Day, Period, TargetClass)`, verify that a corresponding filled class slot exists with matching teacher code.
   - If class slot is blank or has a conflicting marker: Fail closed with `TKB_NATIVE_PEER_ORPHAN`.

### 5.2 Authoritative Reconciliation Audit Results

The exact local audit of `TKB-LAN-1-TUAN-1-03.9.26-in.xlsx` yielded:

#### Morning Session (`MORNING`)
- Total Class Coordinate Cells: 30 periods × 18 classes = **540** cells.
- Blank Cells: **18** cells (Thứ 7, Tiết 5 for all 18 classes).
- Scheduled Class Cells: **522** cells.
- **Teacher-Linked Slots Reconciled 1:1**: Exactly **402** slots.
- **Duplicate Teacher Peers**: **0**.
- **Orphan Teacher Slots**: **0**.
- **Permitted Non-Peer Special Activities**: Exactly **120** slots:
  - `CC` (Chào cờ): **18** slots (Thứ 2, Tiết 1, classes 10A1–12A6).
  - `GDĐP` (Giáo dục địa phương): **48** slots.
  - `TN-HN` (Trải nghiệm, hướng nghiệp): **54** slots.
- Total Morning Schedule: `402 (Reconciled) + 120 (Special Non-Peer) = 522` slots.

#### Afternoon Session (`AFTERNOON`)
- Total Class Coordinate Cells: 30 periods × 18 classes = **540** cells.
- Blank Cells: **487** cells.
- Scheduled Class Cells: **53** cells (`TD`: 35 slots, `QP`: 18 slots).
- **Teacher-Linked Slots Reconciled 1:1**: Exactly **53** slots.
- **Duplicate Teacher Peers**: **0**.
- **Orphan Teacher Slots**: **0**.
- **Non-Peer Slots**: **0**.

#### Teacher Roster Topology
- Total Teacher Rows in View: Rows 8 to 45 = **38** rows.
- Morning-active teachers: **33** staff.
- Afternoon-active teachers: **4** staff (PE/Defense in rows 42, 43, 44, 45).
- Zero-allocation staff: **1** row (Row 25 has 0 morning and 0 afternoon periods on this timetable version).
- Cross-Sheet Teacher Row Alignment: Rows 8 to 45 have **100% identical names** between `TKB-GV-SANG` and `TKB-GV-CHIỀU` (38/38 rows matched).

---

## 6. Architecture Decisions Closed

P2-030 formally closes the following 20 architectural contracts:

1. **Native Workbook Identification Contract**: Accept `.xlsx` files with standard MIME types and validate internal Đam San matrix headers rather than relying on filename.
2. **Four-Sheet Recognition Contract**: Require exact presence of `TKB THEO LỚP BUỔI SÁNG`, `TKB-GV-SANG`, `TKB THEO LỚP BUỔI CHIỀU`, `TKB-GV-CHIỀU`.
3. **Strict Boundary Recognition**: Class data is bounded to Rows 7–36, Cols 3–20; Teacher data is bounded to Rows 8–45, Cols 2–31. Footers (Rows 37–39) and delimiters (Row 5) are strictly excluded.
4. **Class-View Parser Contract**: Parse `(Day, Period, Class, Marker)` with support for merged day cells and whitespace trimming.
5. **Teacher-View Parser Contract**: Parse `(TeacherName, Day, Period, TargetClass)` with 2-level headers (Row 6 day, Row 7 period).
6. **Teacher-Code Identity & Reconciliation Contract**: Extract `<TeacherCode>` via last-hyphen split; bind to teacher identities via peer cross-check; reject unresolvable codes.
7. **Special-Marker Classification Contract**: Only `CC`, `GDĐP`, and `TN-HN` are classified as legitimate non-peer activities. All other markers require a teacher peer.
8. **Morning/Afternoon Session Contract**: Sessions are parsed independently as two coherent models and then composed.
9. **Peer Reconciliation Contract**: Bidirectional cross-verification between class view and teacher view is mandatory.
10. **Fail-Closed Mismatch Taxonomy**: Comprehensive taxonomy of domain-specific errors (see §7).
11. **Duplicate / Collision Handling**: Any multiple-teacher claim on a single slot fails closed immediately.
12. **Unknown Code Handling**: Unrecognized classes, subjects, or teacher identities fail closed with exact grid coordinates.
13. **Blank-Cell Semantics**: Blank indicates unscheduled period; Saturday Period 5 is a recognized half-day blank pattern.
14. **Effective-Date Extraction Contract**: Row 4 text `ÁP DỤNG TỪ NGÀY DD/MM/YYYY` is strictly extracted, validated against ISO civil date, and checked for consistency across sheets.
15. **Workbook Checksum & Provenance**: SHA-256 is computed upon ingestion and retained on import receipts for idempotency and replay proof.
16. **Sanitized Test Fixture**: Synthetic fixture `apps/api/test/fixtures/tkb/sanitized-dam-san-tkb-fixture.xlsx` generated with synthetic teacher names (`Giáo viên 01`..`Giáo viên 38`) and 100% structural fidelity.
17. **Task Boundaries**:
    - `P2-030` (this task): Architecture, structural audit, reconciliation specifications, sanitized fixture.
    - `P2-040`: Native adapter implementation (`DamSanNativeTimetableAdapter`) on top of canonical import pipeline.
    - `P2-050`: Selective session update and carry-forward workflow.
18. **No Raw Staff Names as Code Authority**: Source code must not hardcode teacher names; matching is dynamic against database catalogs.
19. **No Guessed PPCT Mapping**: Timetable parsing produces timetable entries only; syllabus order linkage is deferred to PPCT allocation rules.
20. **No Runtime/Schema/UI Drift**: No schema migrations, UI changes, or deployment mutations are performed in this task.

---

## 7. Fail-Closed Mismatch Taxonomy

The native adapter in `P2-040` must emit the following structured domain errors upon validation failure:

| Error Code | Trigger Condition | Severity |
|---|---|---|
| `TKB_NATIVE_SHEET_STRUCTURE_INVALID` | Missing any of the 4 required sheets or extra unrecognized sheets | FATAL |
| `TKB_NATIVE_HEADER_INVALID` | Header text on Row 4, 6, or 7 does not match expected matrix structure | FATAL |
| `TKB_NATIVE_EFFECTIVE_DATE_MISSING` | Effective date cannot be parsed from Row 4 in any sheet | FATAL |
| `TKB_NATIVE_EFFECTIVE_DATE_MISMATCH` | Effective date differs between morning and afternoon sheets | FATAL |
| `TKB_NATIVE_CLASS_HEADER_UNKNOWN` | Class code in Row 6 does not match active `SchoolClass` catalog | ERROR |
| `TKB_NATIVE_MARKER_SYNTAX_INVALID` | Cell text cannot be parsed as special activity or `<Subject>-<Teacher>` | ERROR |
| `TKB_NATIVE_PEER_MISSING` | Subject lesson in class view has no teacher peer in teacher view | ERROR |
| `TKB_NATIVE_PEER_DUPLICATE` | Multiple teachers are assigned to the same `(Day, Period, Class)` in teacher view | ERROR |
| `TKB_NATIVE_PEER_ORPHAN` | Teacher view assigns teacher to a class slot that is blank or conflicting in class view | ERROR |
| `TKB_NATIVE_PEER_CONFLICT` | Non-peer activity (`CC`, `GDĐP`, `TN-HN`) has an unexpected teacher assignment | ERROR |
| `TKB_NATIVE_TEACHER_CODE_CONFLICT` | Teacher code in marker resolves to a different teacher than teacher-view peer | ERROR |
| `TKB_NATIVE_TEACHER_IDENTITY_UNKNOWN` | Teacher name in teacher view cannot be resolved to active `User` / `StaffProfile` | ERROR |
| `TKB_NATIVE_SUBJECT_UNKNOWN` | Subject code in marker cannot be resolved to active `Subject` catalog | ERROR |

---

## 8. Sanitized Fixture Specification for P2-040

The test fixture `apps/api/test/fixtures/tkb/sanitized-dam-san-tkb-fixture.xlsx` has been constructed and verified:
- **Location**: `apps/api/test/fixtures/tkb/sanitized-dam-san-tkb-fixture.xlsx`
- **Companion Documentation**: `apps/api/test/fixtures/tkb/README.md`
- **Topology**: Exactly 4 sheets, 540 cells morning, 540 cells afternoon, 402 matched morning slots, 53 matched afternoon slots, 120 non-peer slots.
- **PII Scrubbing**: 38 real teacher names in Sheet 2 and Sheet 4 Column 1 replaced with `Giáo viên 01` through `Giáo viên 38`. Zero occurrences of real teacher names remain in any sheet or metadata.
