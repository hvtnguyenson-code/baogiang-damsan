# P4-070 Review Checklist

This checklist is intentionally short and review-oriented. P4-070 remains docs-only.

## Architecture checks

- [x] Retained `GDDP` / `HDTN_HN` markers are TimetableVersion children, not TimetableEntry rows.
- [x] Marker changes participate in timetable semantic identity.
- [x] P2-050 selective session carry-forward preserves untouched-session markers.
- [x] Workbook week values resolve through official AcademicWeek/date-effective timetable authority.
- [x] HĐTN CLASS uses exact-date HomeroomAssignment; no current-GVCN shortcut.
- [x] HĐTN GRADE and SCHOOL_WIDE require complete class-marker coverage before collapse.
- [x] GDĐP grade collapse requires complete target-grade marker coverage.
- [x] Exact requested-period count equals exact resolved candidate count; no first-N or spillover heuristic.
- [x] HĐTN name resolution and GDĐP staff-code resolution fail closed on ambiguity.
- [x] Import preview is non-mutating; explicit confirm creates DRAFT P4 state only.
- [x] Existing P4-040 publish/materialization and P4-050 workload authority are reused.
- [x] Workload coefficient remains Business Configuration authority; no coefficient in workbook.
- [x] Unused timetable markers do not appear as effective teacher activities.
- [x] Frontend contract is fully Vietnamese while backend enums remain internal English.
- [x] `CC` remains outside this authority.

## Governance checks

- [x] PR #154 state is reconciled before canonical governance files are edited.
- [x] `T48` is added to `PRE-PILOT-TRACEABILITY-MATRIX.md` on latest main.
- [x] `P4-070`..`P4-074` are added to `PRE-PILOT-TASK-REGISTER.md` on latest main.
- [x] `P4-070-GOVERNANCE-REGISTRATION.md` is no longer the sole registration location before merge.
- [x] P4-070 architecture review and CI passed; closed by SYNC-P4-070.
- [x] Parent merge complete (PR #155, SHA `d303942373195d2f48c897f488887601c24e9f4f`); deployment not performed (production remains PRE-OPERATIONAL).
