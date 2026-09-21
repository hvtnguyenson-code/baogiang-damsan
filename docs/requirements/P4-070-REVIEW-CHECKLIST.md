# P4-070 Review Checklist

This checklist is intentionally short and review-oriented. P4-070 remains docs-only.

## Architecture checks

- [ ] Retained `GDDP` / `HDTN_HN` markers are TimetableVersion children, not TimetableEntry rows.
- [ ] Marker changes participate in timetable semantic identity.
- [ ] P2-050 selective session carry-forward preserves untouched-session markers.
- [ ] Workbook week values resolve through official AcademicWeek/date-effective timetable authority.
- [ ] HĐTN CLASS uses exact-date HomeroomAssignment; no current-GVCN shortcut.
- [ ] HĐTN GRADE and SCHOOL_WIDE require complete class-marker coverage before collapse.
- [ ] GDĐP grade collapse requires complete target-grade marker coverage.
- [ ] Exact requested-period count equals exact resolved candidate count; no first-N or spillover heuristic.
- [ ] HĐTN name resolution and GDĐP staff-code resolution fail closed on ambiguity.
- [ ] Import preview is non-mutating; explicit confirm creates DRAFT P4 state only.
- [ ] Existing P4-040 publish/materialization and P4-050 workload authority are reused.
- [ ] Workload coefficient remains Business Configuration authority; no coefficient in workbook.
- [ ] Unused timetable markers do not appear as effective teacher activities.
- [ ] Frontend contract is fully Vietnamese while backend enums remain internal English.
- [ ] `CC` remains outside this authority.

## Governance checks

- [ ] PR #154 state is reconciled before canonical governance files are edited.
- [ ] `T48` is added to `PRE-PILOT-TRACEABILITY-MATRIX.md` on latest main.
- [ ] `P4-070`..`P4-074` are added to `PRE-PILOT-TASK-REGISTER.md` on latest main.
- [ ] `P4-070-GOVERNANCE-REGISTRATION.md` is no longer the sole registration location before merge.
- [ ] P4-070 remains `IN_REVIEW` until architecture review/CI passes.
- [ ] Merge/deploy remain separately authorized.
