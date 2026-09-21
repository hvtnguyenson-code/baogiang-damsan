# P2-060 — School-wide Effective Teaching Schedule Architecture

- **Task ID:** `P2-060`
- **Status:** `CLOSED` by `SYNC-P2-060` (parent PR #154, reviewed head `9ada66aad842d029435b9924a1f1f4cfaa63d773`, exact-head PR CI #486 SUCCESS, merge/main `fe22ab373536814cfe279d66d58418df0143e44e`, authoritative post-merge main CI #490 SUCCESS; independent review PASS; downstream `P2-061` unlocked to `READY`).
- **Product authority date:** 2026-09-21
- **Traceability:** `T47`
- **Depends on:** `P2-050`, `P4-040`
- **Downstream implementation:** `P2-061`
- **Scope:** architecture/specification only; zero runtime, API, contract, schema, migration, UI, capability-catalog, CI/CD, deployment or production mutation.

## 1. Product requirement

Ban giám hiệu requires every teacher to be able to inspect the effective teaching schedule of other teachers across the school so that teachers can coordinate timetable exchanges, coverage and practical teaching support without relying on private copies of the timetable.

The Teacher Workspace therefore requires one canonical read-only schedule area with these user-facing modes:

1. **Lịch của tôi** — the authenticated teacher's effective teaching schedule.
2. **Toàn trường** — school-wide effective teacher occupancy for a selected date/week context.
3. **Một giáo viên cụ thể** — select/search another teacher from a dropdown and inspect that teacher's effective schedule.
4. **So sánh với lịch của tôi** — compare the selected teacher's effective occupancy with the authenticated teacher's effective occupancy.

This feature is **read-only**. It must not create, edit, reverse, approve, propose or otherwise mutate timetable, substitution, supervision, make-up, SpecialActivity, GDĐP, HĐTN-HN or any other teaching-operation fact. All business mutation authority remains in the existing administrative/business-control domains.

The frontend is fully Vietnamese. Backend code, contracts and enums may retain canonical English technical names.

## 2. Authority boundary

### 2.1 Read authority

The public schedule read boundary is authorized by existing `TEACHER_BASE` capability.

- Every authenticated professional user holding `TEACHER_BASE` may read the school-wide effective teaching schedule within the bounded contracts defined by this architecture.
- `SYSTEM_ADMIN` alone does not imply this professional read authority.
- No management capability is required merely to read this view.
- This is an explicit authorization decision satisfying the future-public-read requirement previously left open by ADR-036 / LOCAL-FC-05E0D.

### 2.2 No mutation authority

This read authority must never imply or confer any of:

- `TIMETABLE_MANAGE`;
- `TEACHING_OPERATION_MANAGE`;
- `SPECIAL_ACTIVITY_MANAGE`;
- GDĐP/HĐTN programme coordinator authority;
- Business Configuration mutation authority;
- execution/reporting mutation authority.

The Teacher Workspace must expose no timetable/operation mutation control under this feature. Any existing or future administrative workflow remains separately capability-gated by its owning business domain.

## 3. Canonical read-model principle

The new public view must be a **derived read model**, not a new schedule source of truth.

Canonical profile name:

`SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1`

The implementation should compose retained authoritative facts and may reuse the existing internal `RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1` service boundary. It must not persist a parallel effective-schedule table, cache-as-authority, copied teacher timetable, or denormalized editable schedule.

Historical meaning follows ADR-036: **current-authoritative reconstruction** from retained date-effective source identities plus current lifecycle state of reversible operational rows. It is not transaction-time replay of what the system happened to believe at an earlier instant.

All source reads used for one response must share one consistent database snapshot. `RepeatableRead` is sufficient for this read-only projection unless implementation evidence proves a stronger isolation level is required.

## 4. Effective occupancy semantics

The schedule shown to teachers is the **effective operational teaching occupancy**, not the raw base `TimetableEntry` list.

### 4.1 Normal timetable opportunity

For an exact normal timetable opportunity, use the accepted precedence from ADR-036:

1. `CalendarInterruption`;
2. `CalendarException`;
3. active `SpecialActivity` suppression;
4. active `OperationalLessonDisposition`;
5. base timetable.

Teacher occupancy is derived as follows:

- `CALENDAR_INTERRUPTION` / `CALENDAR_EXCEPTION` / `SPECIAL_ACTIVITY_SUPPRESSED`: the normal timetable opportunity does not create effective teacher occupancy.
- `AUTHORIZED_CANCELLATION`: no normal teacher occupancy.
- `ABSENCE_NO_REPLACEMENT`: no normal teacher occupancy.
- `SAME_SUBJECT_SUBSTITUTION`: the exact assigned substitute teacher is occupied; the original responsible teacher is not occupied by that normal opportunity.
- `DIFFERENT_SUBJECT_SUPERVISION`: the exact assigned supervising teacher is occupied; the original responsible teacher is not occupied by that normal opportunity.
- `BASE_TIMETABLE`: the responsible teacher is occupied.

Suppression never fabricates replacement occupancy. Replacement/alternate occupancy must come from its own retained authoritative fact.

### 4.2 Make-up teaching

Every current-authoritative active `MakeupTeachingSchedule` contributes effective occupancy to its exact scheduled teacher at the exact target civil date and real slot interval.

### 4.3 Special activities, GDĐP and HĐTN-HN

Every current-authoritative active `SpecialActivity` contributes occupancy independently of normal timetable opportunities:

- each exact activity time slot contributes an occupancy interval;
- each exact scheduled staffing teacher for that activity is occupied for that slot;
- frozen class targets do not multiply teacher occupancy;
- reversed activity/staffing topology contributes no current occupancy.

GDĐP/HĐTN-HN occurrences materialized through the accepted P4-040 bridge naturally appear through their resulting `SpecialActivity` roots. The Teacher Workspace must not create a second programme-specific schedule truth.

### 4.4 Fail-closed structural ambiguity

If the underlying structural resolver returns `BLOCKED`, or if effective occupancy cannot be resolved uniquely and coherently, the public read model must fail closed for the affected scope.

It is prohibited to convert an unresolved/blocked state into an empty schedule or `Trống`. This is mandatory because teachers will use the view when considering đổi tiết or nhờ coi tiết.

## 5. Time and collision semantics

Busy/free comparison is based on **real half-open wall-clock intervals**, not only on display period numbers or slot labels.

Two occupancy facts conflict when their effective real intervals overlap under the existing timetable/collision semantics. This protects comparison across morning/afternoon/session definitions and any distinct slot definitions that overlap in real time.

The UI may display familiar Vietnamese period labels, but the server owns interval-overlap truth.

## 6. Read contracts and bounded views

P2-061 must expose bounded read contracts sufficient for the following product views. Exact route names may be selected during implementation, but the semantic surfaces are mandatory.

### 6.1 Teacher option read model

Purpose: populate a searchable teacher dropdown.

Requirements:

- active professional teaching staff only for the ordinary current/future operational picker;
- deterministic ordering by display name then stable identity tie-breaker;
- bounded search/pagination;
- return only identity fields required by the UI (stable user id + display name, and only additional disambiguation fields proven necessary);
- do not expose username, contact data, capability grants or administrative metadata merely for schedule lookup.

### 6.2 Individual teacher weekly effective schedule

Input is bounded to one academic year/week and one teacher identity.

Response includes only fields required to understand teaching occupancy, such as:

- civil date / weekday;
- slot display metadata and real interval;
- class label where applicable;
- subject label for curricular teaching;
- activity title for SpecialActivity;
- a Vietnamese-presentable source/status classification sufficient to distinguish ordinary timetable, substitution/supervision, make-up and special activity.

No PPCT content, workload coefficient, report evidence, audit note, reversal reason or private administrative note is required by this product surface.

### 6.3 School-wide view

The school-wide view must be operationally bounded. The preferred initial contract is one selected civil date at a time, returning teacher rows against effective slots/intervals.

Desktop may render a matrix; mobile must remain usable by selecting one day rather than forcing a whole-school weekly grid onto a narrow screen.

The contract must avoid an unbounded whole-year or arbitrary-date-range payload.

### 6.4 Compare-with-my-schedule view

Input:

- authenticated teacher identity is server-owned;
- exactly one selected peer teacher;
- one bounded academic week/date context.

Output is a deterministic interval comparison of the two effective schedules.

User-facing states are descriptive only, for example:

- `Tôi bận / Giáo viên được chọn trống`;
- `Tôi trống / Giáo viên được chọn bận`;
- `Cả hai đều trống`;
- `Cả hai đều bận`.

The comparison must **not** claim that a swap, substitution or supervision is legally/operationally eligible. It is decision-support information only. Eligibility and mutation remain the responsibility of the relevant admin/business workflow.

## 7. Teacher Workspace UX contract

The Teacher Workspace contains one canonical area named **Lịch dạy**.

Default state:

- current/selected academic week;
- selector defaults to **Lịch của tôi**.

Selector choices:

- **Lịch của tôi**;
- **Toàn trường**;
- searchable list of teachers.

When another teacher is selected, expose **So sánh với lịch của tôi**.

All user-visible labels, statuses, empty states, validation messages and error messages in this workspace must be Vietnamese. Backend constants such as `BASE_TIMETABLE`, `MAKEUP_TEACHING`, `SPECIAL_ACTIVITY`, `SAME_SUBJECT_SUBSTITUTION` or `SCHOOL_WIDE` must not leak raw into normal teacher UI.

No create/edit/reverse/approve/drag-drop timetable control is permitted in this workspace.

## 8. Data minimization and privacy

School-wide read access is purpose-bound to professional teaching coordination.

The view may expose only schedule-relevant professional information. It must not become a generic staff directory and must not expose:

- personal phone/email;
- login username;
- password/security state;
- capability grants;
- audit history;
- administrative notes/reasons not required to understand occupancy;
- workload/payroll-like data;
- student personal data.

## 9. P2-061 implementation task design

`P2-061` — **School-wide Effective Teaching Schedule Read Model + Teacher Workspace**

### Required implementation scope

1. Implement `SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1` as a schema-free derived projection, reusing accepted structural resolution where appropriate.
2. Add public read-only API/contracts guarded by authenticated `TEACHER_BASE`.
3. Add bounded teacher-option search for the dropdown.
4. Add individual effective weekly schedule read.
5. Add school-wide selected-day effective schedule read.
6. Add compare-with-my-schedule read.
7. Add Teacher Workspace **Lịch dạy** UI, fully Vietnamese.
8. Preserve all business mutation authority outside this workspace.

### Mandatory regression gates

At minimum, tests must prove:

- self schedule read succeeds for `TEACHER_BASE`;
- peer schedule read succeeds for `TEACHER_BASE`;
- school-wide read succeeds for `TEACHER_BASE`;
- unauthenticated access is rejected;
- `SYSTEM_ADMIN` without `TEACHER_BASE` does not gain teacher schedule read authority by role inference;
- no feature route/action grants timetable/operation mutation;
- base timetable occupancy resolves to responsible teacher;
- cancellation/absence-without-replacement does not leave false teacher occupancy;
- same-subject substitution and different-subject supervision move effective occupancy to the exact assigned teacher without retaining false original-teacher occupancy;
- make-up occupancy appears on its exact teacher/date/interval;
- SpecialActivity occupancy suppresses conflicting normal occupancy and appears for exact staffing teachers;
- materialized GDĐP/HĐTN-HN activity appears through SpecialActivity without a parallel schedule source;
- reversed/corrected topology does not double-count occupancy;
- ambiguous/blocked structural resolution never renders as `Trống`;
- compare view uses real interval overlap and returns descriptive busy/free states only;
- teacher dropdown is bounded/searchable and leaks no unnecessary identity/security data;
- frontend labels and status mappings are Vietnamese and raw backend enums do not appear in normal teacher UI;
- desktop and mobile layouts remain usable for the required views.

### Forbidden scope

P2-061 must not:

- add a new editable schedule table;
- create a second collision engine;
- create teacher-side timetable mutation;
- add swap/substitution request workflow;
- change existing admin mutation authorities;
- change workload policy;
- change PPCT progression semantics;
- reinterpret TeachingExecution as schedule authority;
- deploy or mutate production without separate authorization.

## 10. Closure condition

P2-060 is **CLOSED** by `SYNC-P2-060`. Closure evidence:
- parent branch: `docs/school-wide-effective-schedule-authority-060`;
- reviewed head: `9ada66aad842d029435b9924a1f1f4cfaa63d773`;
- parent PR: #154 (`docs(timetable): require school-wide effective teacher schedule`);
- exact-head PR CI: CI #486 (run id: `35554722752`), SUCCESS;
- merge/main commit: `fe22ab373536814cfe279d66d58418df0143e44e`;
- post-merge main CI: CI #490 (run id: `35573948097`), SUCCESS;
- independent review: PASS;
- downstream `P2-061` is unlocked to `READY`.
