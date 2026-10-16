# P5-053 — Timetable & Time-Slot Administration Workspace

**Status:** PLANNED  
**Depends on:** P5-050, P2-050  
**Traceability:** T52

## Objective

Expose the already implemented canonical timetable/time-slot backend as a complete Vietnamese administration workflow for authorized school managers.

## Required surfaces

1. **Khung tiết**
   - list current retained definitions;
   - create/version/correct through existing authority;
   - show real start/end time and applicable status;
   - no backend UUID entry by ordinary users.
2. **Nhập Thời khóa biểu**
   - native Đam San workbook;
   - choose BOTH / MORNING / AFTERNOON;
   - inspect;
   - preview;
   - exact class-view/teacher-view reconciliation findings;
   - error location and remediation;
   - confirm into DRAFT/version authority;
   - existing selective carry-forward semantics.
3. **Phiên bản TKB**
   - current/effective version;
   - history;
   - effective date;
   - validation/readiness;
   - permitted activation/lifecycle actions using existing server authority.
4. **Comparison/readiness**
   - meaningful old/new or retained-version comparison using existing semantics;
   - blockers shown before irreversible actions.

## Non-negotiable invariants

- Reuse `timetable-import`, `timetables`, `time-slots`; do not create a second importer or collision engine.
- `TIMETABLE_MANAGE / SCHOOL_WIDE` remains the mutation authority.
- Class and teacher workbook views remain peer evidence.
- Selective session updates must never silently erase the untouched session.
- No client-generated canonical truth, fuzzy reconciliation, or last-write-wins.
- Special markers remain governed by the accepted retained-marker architecture.

## Acceptance evidence

An authorized PHT/Admin can start from visible navigation, upload the actual supported native format, inspect, preview, understand blockers, confirm, inspect the retained version and complete an allowed lifecycle action without using API tools or typing a route manually.
