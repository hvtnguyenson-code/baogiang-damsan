# Sanitized Đam San TKB Native Workbook Fixture

## Overview

This directory contains deterministic test fixtures for the native Đam San timetable importer adapter (`P2-040`).

- **File**: `sanitized-dam-san-tkb-fixture.xlsx`
- **Source Architecture Task**: `P2-030` (`docs/requirements/P2-030-TKB-NATIVE-WORKBOOK-ARCHITECTURE-AUDIT.md`, `ADR-047`)
- **Nature of File**: **Derived structural test evidence only**, NOT authoritative school data.

## Topology Preservation

The fixture preserves 100% of the operational grid, matrix coordinates, and structural markers of the authoritative Đam San workbook:

1. **Four sheets**:
   - `TKB THEO LỚP BUỔI SÁNG` (Class view, Morning)
   - `TKB-GV-SANG` (Teacher view, Morning)
   - `TKB THEO LỚP BUỔI CHIỀU` (Class view, Afternoon)
   - `TKB-GV-CHIỀU` (Teacher view, Afternoon)
2. **Matrix Dimensions & Grid Extent**:
   - Class views: Columns C..T (Cols 3..20: Classes `10A1`..`12A6`), Rows 7..36 (30 periods, Monday–Saturday, Periods 1–5).
     - Morning non-empty business/footer content ends at Row 38 (Row 37 = legend/signature; Row 38 = TN-HN/GDĐP note spanning 38..39; Row 40+ = blank).
     - Afternoon non-empty content ends at Row 37 (Row 37 = legend/signature; Row 38+ = blank).
   - Teacher views: Columns B..AE (Cols 2..31: 6 days × 5 periods = 30 period columns), Rows 8..45 (38 teacher rows).
3. **Reconciliation Counts**:
   - Morning: 402 teacher-linked slots (1:1 peer match), 120 permitted non-peer special activity slots (`CC` = 18, `GDĐP` = 48, `TN-HN` = 54), 18 blank slots (Saturday Period 5 in this workbook).
   - Afternoon: 53 teacher-linked slots (1:1 peer match), 0 non-peer slots, 487 blank slots.
   - Total scheduled slots: 575.
4. **Saturday Schedule Topology**:
   - Period 1: `SH-<TeacherCode>` (`SH-GV*`) (18 slots, teacher-linked, reconciles 1:1 with teacher view).
   - Period 2: `TN-HN` (18 slots, permitted non-peer).
   - Period 3: `TN-HN` (18 slots, permitted non-peer).
   - Period 4: `TN-HN` (18 slots, permitted non-peer).
   - Period 5: blank across all 18 classes in this workbook evidence (treated as evidence, not a rigid format invariant).

## Privacy & Sanitization Boundary

- **Zero Staff PII**: Real teacher names in Column 1 of `TKB-GV-SANG` and `TKB-GV-CHIỀU` are replaced with deterministic synthetic identifiers: `Giáo viên 01` through `Giáo viên 38`.
- **Zero Real Teacher Codes**: Teacher codes from the authoritative workbook are replaced with deterministic synthetic codes: `GV01` through `GV38` across all class-view subject-teacher markers and `SH-*` markers. No raw source teacher code is documented or retained in this tracked fixture documentation.
- **Structural Integrity**: Subject codes (`TO`, `VA`, `LI`, `HO`, `SI`, `TI`, `CN`, `SU`, `DI`, `NN`, `CD`, `TD`, `QP`), special markers (`CC`, `GDĐP`, `TN-HN`), and class codes (`10A1`..`12A6`) are preserved.
- **Verified Leak Count**: 0 real names, 0 raw teacher codes.
