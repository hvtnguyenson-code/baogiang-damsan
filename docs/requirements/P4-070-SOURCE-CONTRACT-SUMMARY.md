# P4-070 Source Contract Summary

This document records only the teacher-facing source contracts agreed for architecture work. It contains no personal teacher data.

## Ordinary subject PPCT

Existing agreed workbook remains the ordinary curricular programme source. P4-070 does not modify its contract or allocation semantics.

## HĐTN-HN workbook

Visible columns:

1. `Tuần từ`
2. `Tuần đến`
3. `Số tiết`
4. `Quy mô tổ chức`
5. `Khối`
6. `Chủ đề`
7. `Người thực hiện`

Visible organisation values:

- `Theo lớp`
- `Theo khối`
- `Toàn trường`

CLASS rows use `GVCN`. GRADE/SCHOOL_WIDE rows use explicit teacher names. Supporting-class annotations from legacy source documents are not target/staffing authority.

No workload coefficient, converted workload, backend enum, UUID, exact civil date or TimeSlotDefinition ID is required in the workbook.

## GDĐP workbook

Visible columns:

1. `Khối`
2. `Tiết PPCT`
3. `Tuần dạy`
4. `Nội dung`
5. `Giáo viên dạy`

Current accepted school organisation is grade-level. Teacher assignment uses staff codes where available.

No workload coefficient, converted workload, subject field, source-document field, assessment note, backend enum, UUID, exact civil date or TimeSlotDefinition ID is required in the workbook.

## Shared rule

The workbooks express programme intent. Exact civil date/slot is resolved by the server from Academic Calendar + date-effective TimetableVersion + retained special-programme marker evidence.
