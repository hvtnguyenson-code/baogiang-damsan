# P2-061 — School-wide Effective Teaching Schedule Read Model + Teacher Workspace

- **Task ID:** `P2-061`
- **Status:** `PLANNED`
- **Depends on:** `P2-060` (`CLOSED` required before start)
- **Traceability:** `T47`
- **Architecture authority:** `ADR-051-SCHOOL-WIDE-EFFECTIVE-TEACHING-SCHEDULE-READ-MODEL.md` after P2-060 acceptance
- **Product criticality:** **MANDATORY BEFORE TEACHER PILOT**. A teacher-pilot/go-live verification must hard-stop if P2-061 is not `CLOSED`.
- **Mutation/deploy:** neither merge nor deployment is implied by this task design; each remains separately authorized under repository governance.

## 1. Objective

Implement the mandatory read-only **Lịch dạy** area in Teacher Workspace so every authenticated professional teacher can inspect current-authoritative effective teaching occupancy for:

- **Lịch của tôi**;
- **Toàn trường**;
- any selected teacher from a searchable dropdown;
- **So sánh với lịch của tôi** for one selected colleague.

The result must reflect operational reality, not merely base `TimetableEntry` rows.

## 2. Non-negotiable product rules

1. **Read only.** Teacher Workspace contains no create/edit/reverse/approve/drag-drop timetable or teaching-operation mutation.
2. **Admin authority remains centralized.** Existing timetable/teaching-operation/SpecialActivity/programme/business-policy mutation capabilities are unchanged.
3. **Effective schedule only.** Compose current-authoritative timetable + calendar suppression + operational dispositions + make-up + SpecialActivity occupancy.
4. **GDĐP/HĐTN-HN reuse SpecialActivity.** Materialized programme activities appear through existing runtime roots; no parallel programme schedule truth.
5. **Fail closed.** `BLOCKED`/ambiguous structural resolution must never be rendered as `Trống`.
6. **Real-time intervals.** Busy/free comparison uses exact half-open wall-clock intervals, not only display period numbers.
7. **Vietnamese frontend.** Normal teacher-facing labels/status/errors must not expose raw backend enums.
8. **Data minimization.** Schedule lookup must not expose usernames, phone/email, capability grants, audit details, workload or student personal data.
9. **Comparison is informational.** `So sánh với lịch của tôi` may describe busy/free overlap only; it must not claim that a swap, substitution or supervision is eligible.

## 3. Allowed implementation domains

P2-061 may modify only the bounded areas needed for this feature, expected to include:

- `apps/api/src/resolved-occurrences/**` or a narrowly scoped sibling effective-schedule read module;
- bounded API controller/DTO/service files for public read-only schedule access;
- `packages/contracts/**` for the exact public read contracts;
- `apps/web/**` for Teacher Workspace route/components/API client/capability helpers/localized presentation;
- focused unit/integration/Web/Playwright tests;
- required governance/status documentation during closure.

A schema migration is **not expected** and requires a hard stop/re-architecture if implementation discovers that one is necessary.

## 4. Forbidden domains and behaviors

Do not:

- add an effective-schedule persistence table or editable cache;
- duplicate timetable/overlay/SpecialActivity sources of truth;
- create a second collision engine;
- add teacher-side mutation endpoints;
- add `Đề nghị đổi tiết`, substitution request or approval workflow in this task;
- widen `TIMETABLE_MANAGE`, `TEACHING_OPERATION_MANAGE`, `SPECIAL_ACTIVITY_MANAGE`, coordinator or Business Configuration authority;
- infer professional read authority from `SYSTEM_ADMIN`;
- alter PPCT progression/debt/workload/reporting semantics;
- use TeachingExecution as schedule authority;
- deploy or mutate production.

## 5. Authorization contract

### 5.1 Positive authority

The public schedule read endpoints require authenticated `TEACHER_BASE`.

`TEACHER_BASE` permits read-only access to school-wide effective professional teaching occupancy under the bounded response contracts of ADR-051.

### 5.2 Negative authority

Tests must prove:

- unauthenticated request -> denied;
- authenticated actor without `TEACHER_BASE` -> denied;
- `SYSTEM_ADMIN` without `TEACHER_BASE` -> denied;
- `TEACHER_BASE` alone does not gain any existing timetable/operation mutation right;
- public schedule routes expose no mutation verb/command surface.

## 6. Effective occupancy algorithm

Build `SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1` from one consistent read snapshot and reuse `RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1` where practical.

### Normal opportunities

| Effective structural state | Effective teacher occupancy |
|---|---|
| `CALENDAR_INTERRUPTION` | none from normal opportunity |
| `CALENDAR_EXCEPTION` | none from normal opportunity |
| `SPECIAL_ACTIVITY_SUPPRESSED` | none from normal opportunity; activity handled independently |
| `AUTHORIZED_CANCELLATION` | none |
| `ABSENCE_NO_REPLACEMENT` | none |
| `SAME_SUBJECT_SUBSTITUTION` | exact assigned substitute teacher |
| `DIFFERENT_SUBJECT_SUPERVISION` | exact assigned supervising teacher |
| `BASE_TIMETABLE` | responsible teacher |

### Independent occupancies

- Active make-up: exact scheduled teacher at exact target interval.
- Active SpecialActivity: every exact scheduled staffing teacher at every exact activity slot.
- Reversed/non-current-authoritative roots: no current occupancy.

Duplicate source presentation must not create duplicate effective occupancy.

## 7. Required public read surfaces

Exact route naming is an implementation detail, but all four semantic surfaces are required.

### A. Teacher options

Bounded searchable/paginated teacher list for dropdown:

- stable user id;
- display name;
- only minimal disambiguation field if actually necessary.

### B. Individual weekly schedule

One academic year/week + one teacher.

Must provide enough data to present:

- date/weekday;
- period/slot label and real interval;
- class when relevant;
- subject for curricular teaching;
- activity title for SpecialActivity;
- localized-presentable source/status classification.

### C. School-wide selected-day schedule

One selected civil date at a time, with deterministic teacher ordering and bounded payload.

Desktop may render teacher × slot matrix. Mobile must use a usable day-focused layout.

### D. Compare with my schedule

Authenticated teacher identity is server-owned. Client supplies one peer teacher and bounded date/week context.

Compare exact real intervals and return descriptive occupancy states only.

## 8. Teacher Workspace UI acceptance

The user-facing area is named **Lịch dạy**.

Default:

- current academic week;
- **Lịch của tôi** selected.

Selector:

- **Lịch của tôi**;
- **Toàn trường**;
- searchable teachers.

When a peer is selected, expose **So sánh với lịch của tôi**.

No raw values such as `BASE_TIMETABLE`, `OPERATIONAL_DISPOSITION`, `MAKEUP_TEACHING`, `SPECIAL_ACTIVITY`, `SAME_SUBJECT_SUBSTITUTION`, `GRADE` or `SCHOOL_WIDE` may appear to ordinary teachers.

## 9. Mandatory regression matrix

Implementation is not merge-ready without automated coverage for at least:

1. `TEACHER_BASE` self read.
2. `TEACHER_BASE` peer read.
3. `TEACHER_BASE` school-wide read.
4. unauthorized/unauthenticated rejection matrix.
5. `SYSTEM_ADMIN` non-inference.
6. no mutation authority leakage.
7. base timetable occupancy.
8. authorized cancellation removes occupancy.
9. absence without replacement removes occupancy.
10. same-subject substitution moves occupancy to assigned teacher.
11. different-subject supervision moves occupancy to assigned teacher.
12. make-up occupancy.
13. SpecialActivity suppression + exact staffing occupancy.
14. materialized GDĐP/HĐTN-HN visibility through SpecialActivity.
15. reversal/replacement does not double-count occupancy.
16. structural `BLOCKED` never becomes `Trống`.
17. real-interval overlap comparison.
18. deterministic ordering/pagination/search.
19. minimal teacher identity payload.
20. complete Vietnamese presentation mapping.
21. mobile and desktop smoke for all mandatory views.

## 10. Required task-start prompt

When P2-061 is started, the execution prompt must include:

- exact current canonical `main` SHA;
- confirmation that `P2-060` is `CLOSED` and ADR-051 is Accepted;
- `T47`;
- allowed/forbidden domains above;
- the complete regression matrix;
- statement that schema migration requires a hard stop;
- statement that PR/merge/deploy remain separately authorized.

## 11. Closure and pilot gate

P2-061 can become `CLOSED` only after:

- exact implementation diff is independently reviewed;
- required unit/integration/Web/Playwright gates pass;
- authoritative post-merge main CI passes;
- `CURRENT-PROJECT-STATUS.md`, `PRE-PILOT-TASK-REGISTER.md`, `PRE-PILOT-TRACEABILITY-MATRIX.md` and other affected canonical docs are synchronized.

**Teacher pilot hard gate:** P5/P6 pilot closure must not represent the Teacher Workspace as pilot-ready while P2-061 is not `CLOSED`. At the latest when `P5-010` freezes the exact pilot dependency set, `P2-061` must be included as a mandatory dependency; `P6-050` real teacher pilot verification must include smoke coverage for `Lịch của tôi`, `Toàn trường`, peer schedule and `So sánh với lịch của tôi`.
