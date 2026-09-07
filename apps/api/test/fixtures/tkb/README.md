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
2. **Matrix Dimensions**:
   - Class views: Columns 1..20 (Day, Period, Classes `10A1`..`12A6`), Rows 7..36 (30 periods, Monday–Saturday, Periods 1–5).
   - Teacher views: Columns 1..31 (Teacher name, 6 days × 5 periods), Rows 8..45 (38 teacher rows).
3. **Reconciliation Counts**:
   - Morning: 402 teacher-linked slots (1:1 peer match), 120 permitted non-peer special activity slots (`CC` = 18, `GDĐP` = 48, `TN-HN` = 54), 18 blank slots (Saturday Period 5).
   - Afternoon: 53 teacher-linked slots (1:1 peer match), 0 non-peer slots, 487 blank slots.
   - Total scheduled slots: 575.

## Privacy & Sanitization Boundary

- **Zero Staff PII**: Real teacher names in Column 1 of `TKB-GV-SANG` and `TKB-GV-CHIỀU` are replaced with synthetic identifiers: `Giáo viên 01` through `Giáo viên 38`.
- **Structural Codes Preserved**: Subject abbreviations (`TO`, `VA`, `LI`, `HO`, `SI`, `TI`, `CN`, `SU`, `DI`, `NN`, `CD`, `TD`, `QP`), teacher code suffixes (`T1`, `V3`, `TD4`, etc.), and special activity codes (`CC`, `GDĐP`, `TN-HN`, `SH-*`) are preserved because they are structural identifiers without personal data.
