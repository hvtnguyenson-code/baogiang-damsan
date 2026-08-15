# LOCAL-FC-05D0 — Special Activity Architecture Audit

## 1. Title / status / scope

**Status:** Canonical architecture audit; documentation only.

**Baseline:** `origin/main` at `867f554b793a7a1c181fe99cef35448cbdcd0110`.

**Scope:** Evidence needed to define a future Special Activity minimum core before `ResolvedLessonOccurrence`.

This document creates no accepted Special Activity design. It distinguishes:

- **CONFIRMED** — directly supported by canonical repository evidence;
- **INFERRED** — the narrowest conclusion strongly implied by accepted adjacent architecture, but not accepted for Special Activity;
- **UNRESOLVED** — a product-owner or architecture decision is required.

No schema, migration, model, API, capability, contract, test, UI, ADR, roadmap or project-context change is authorized here.

## 2. Executive verdict

**DECISION CLOSURE REQUIRED BEFORE SPECIAL ACTIVITY PERSISTENCE.**

The repository confirms only a bounded domain outline: Special Activity is separate from normal `TimetableEntry` and operational dispositions; it may target class, grade or school scope; it may staff multiple teachers; and it must participate in occupancy, collision and later resolved-occurrence reasoning. The repository does **not** close the aggregate/session structure, accepted activity vocabulary, multi-class identity, staffing roles, time granularity, precedence, PPCT consequence, lifecycle, or mutation authority. Those choices alter table topology, active uniqueness, collision keys and historical meaning, so a persistence design would be premature.

The canonical repository also has no Room/Location, student/enrollment, participant-group, Special Activity, activity-category or activity-staffing model. Room and arbitrary-roster support can be deferred, but only as an explicit minimum-core limitation.

## 3. Canonical baseline

| Item | Evidence |
|---|---|
| Repository | `hvtnguyenson-code/baogiang-damsan` |
| Local canonical | `D:\baogiang-damsan` |
| Starting branch point | `origin/main` |
| Exact starting SHA | `867f554b793a7a1c181fe99cef35448cbdcd0110` |
| Authoritative CI supplied by task | CI #194 — PASS |
| Audit branch | `feat/local-fc-05d0-special-activity-architecture-audit` |
| Existing 05C precedence | `CalendarInterruption → CalendarException → OperationalLessonDisposition → base timetable` |
| Existing collision label | `CURRENT_CANONICAL_PRE_SPECIAL_ACTIVITY_V1`; Special Activity is `NOT_ASSESSED` |

Canonical `main` is authoritative. Earlier branches and PRs were not used as accepted architecture.

## 4. Sources inspected

| Source | Material evidence inspected |
|---|---|
| `prisma/schema.prisma` | `User`, `StaffProfile`, `StaffSubject`, capability/audit models; `AcademicYear`, `AcademicCalendarVersion`, `CalendarInterruption`, `SchoolClass`; `TimeSlotDefinition`; PPCT six-model family; `TeachingAssignment`; `TimetableVersion`/`TimetableEntry`; all three operational-overlay families. Model inventory also proves the absence of Special Activity, Room/Location, student/enrollment and participant-group models. |
| `docs/decisions/ADR-008-CAPABILITY-AUTHORIZATION-SEMANTICS.md` | Default-deny capability semantics and `SCHOOL_WIDE`, `SUBJECT_GROUP`, `SUBJECT`, `ACTIVITY`, `PERSONAL` scope vocabulary; no cross-scope inference. |
| `ADR-010` through `ADR-013` | Immutable retained calendar history, interruption meaning, year-scoped class/grade, date-effective TeachingAssignment and the explicit separation of multi-teacher special activities from normal teaching responsibility. |
| `ADR-016` through `ADR-020` | Immutable exact time-slot revisions, half-open wall-clock intervals, normal-entry shape, special-activity boundary, timetable lifecycle and historical civil-date resolution. |
| `ADR-027` through `ADR-030` | PPCT identity/association, Special Activity boundary/open precedence, downstream layering, exact historical PPCT binding and bounded `NORMAL_BASE_PPCT_V1` readiness. |
| `ADR-031`, `ADR-032`, `ADR-033` | Accepted operational-overlay aggregates, persistence, precedence, control plane, provenance, lifecycle, collision, idempotency, CAS, `SERIALIZABLE`, audit and explicit Special Activity re-entry gap. |
| `docs/requirements/LOCAL-FC-05C0-...AUDIT.md` and `...05C0D-...DECISION-CLOSURE.md` | Earlier evidence and accepted R1–R22 closure, especially the required future activity occupancy/staffing/participant/precedence closure. |
| `apps/api/src/operational-overlays/*` | Runtime source validation, active exception/disposition/make-up collision checks, frozen teacher eligibility, request fingerprints, retries, transactional audit and explicit `specialActivity: NOT_ASSESSED`. |
| `apps/api/src/audit/audit.service.ts` and authorization services | Sanitized audit metadata and exact capability evaluation. |
| `prisma/seed.cjs`, `packages/contracts/src/index.ts` | Existing capabilities and generic `ACTIVITY` scope vocabulary; no accepted Special Activity management capability. |
| `docs/architecture/CORE-BACKEND-ROADMAP.md`, `docs/PROJECT_CONTEXT.md` | Dependency order and explicit absence of Special Activity/resolved occurrence/execution. |
| PA-B v1.3 addendum and PA-B v1.2 `.docx` | Lower-authority product examples for GDĐP/HĐTN-HN, multi-teacher activities and confirmation. These are hints only where later Accepted ADRs did not adopt the detail. |

## 5. Existing architecture facts that constrain Special Activity

1. **CONFIRMED:** Special Activity is a separate aggregate/domain concept, not a normal `TimetableEntry`, `TeachingAssignment`, substitution, `CalendarException`, or generic operational subtype (`ADR-012`, `ADR-017`, `ADR-027`, `ADR-031`).
2. **CONFIRMED:** Accepted evidence names class, grade and school-wide business scopes and multiple teachers (`ADR-027`, “Hoạt động đặc biệt là tổng hợp nghiệp vụ riêng”).
3. **CONFIRMED:** Exact civil dates are PostgreSQL `DATE`; calendar interpretation is version-addressed; current heads must not reinterpret retained history (`ADR-010`, `ADR-020`, `ADR-031`).
4. **CONFIRMED:** Canonical time slots are AcademicYear-owned immutable revisions with weekday/session and half-open real wall-clock intervals. Session is descriptive; real interval is collision authority. There is no special-activity usage flag (`ADR-016`).
5. **CONFIRMED:** Normal timetable history retains exact version, calendar, slot, class, subject, assignment and responsible teacher. Normal rows deliberately exclude room, spans and polymorphic activity fields (`ADR-017`).
6. **CONFIRMED:** The accepted 05C precedence applies only to normal opportunities. `ADR-031` and `ADR-033` expressly defer Special Activity precedence and label current collision coverage incomplete.
7. **CONFIRMED:** Suppression removes normal occupancy but does not grant replacement occupancy. Every new occupancy needs its own fact, authority and collision checks (`ADR-031`).
8. **CONFIRMED:** Make-up requires an exact existing incomplete obligation, consumes no new PPCT item, completes nothing at scheduling time and may not be manufactured by an activity (`ADR-031`/`032`/`033`).
9. **CONFIRMED:** Planning/operational facts, execution evidence, derived progress/debt and reporting snapshots are separate layers (`ADR-027`, roadmap). Special Activity scheduling must not own actual completion or reporting totals.
10. **CONFIRMED:** Capability grants are explicit and default-deny. `SYSTEM_ADMIN`, titles, assignments, staff-subject eligibility and UI visibility imply no professional mutation authority (`ADR-008`, `ADR-031`, `ADR-033`).
11. **CONFIRMED:** The schema has no authoritative Room/Location, student/enrollment, arbitrary participant group, Special Activity or activity category catalogue.
12. **INFERRED:** Special Activity should follow retained-source, immutable semantic payload, idempotent command and transactional-audit conventions, but its exact lifecycle and semantic uniqueness remain undecided.

## 6. R1–R24 audit matrix

| ID | Classification | Audit answer |
|---|---|---|
| R1 | **UNRESOLVED** | A separate activity aggregate is confirmed. One root plus staffing children is strongly implied, but occurrence/session and participant child topology are not accepted. |
| R2 | **UNRESOLVED** | GDĐP/HĐTN-HN are evidenced examples; no accepted exhaustive type vocabulary or catalogue strategy exists. Other examples in the task are not canonical categories. |
| R3 | **UNRESOLVED** | Canonical infrastructure represents civil date plus exact retained slots and can group by session. Activity atomicity, multi-slot identity, wall-clock authoring, multi-day facts and recurrence are undecided. |
| R4 | **INFERRED** | Pinning `AcademicYear`, exact retained `AcademicCalendarVersion` and civil date follows every adjacent historical rule; specific Special Activity acceptance is still required. `AcademicWeek` is derived provenance, not an evident owner. |
| R5 | **UNRESOLVED** | Exact slot IDs provide the strongest existing occupancy coordinates. Session-only and arbitrary wall-clock activity selectors, mixed selectors and revision handling are not decided. |
| R6 | **UNRESOLVED** | Class, grade and school-wide business targeting are confirmed subfacts. Multiple classes, custom groups, individual students, teacher-only or mixed rosters are unresolved/unsupported. Authorization scope is separate. |
| R7 | **UNRESOLVED** | No evidence selects one multi-target root, parent+targets or separate atomic activities. Membership-at-date and identity consequences remain open. |
| R8 | **UNRESOLVED** | Multiple teacher identities are a confirmed subfact. Staffing role vocabulary, required cardinality and separation of scheduled/lead/supervising/actual identities are unresolved. Actual teacher belongs downstream. |
| R9 | **UNRESOLVED** | Active canonical staff is a strong adjacent eligibility rule. Teaching-staff, subject eligibility and role-specific exceptions are undecided. TeachingAssignment and StaffSubject cannot imply authorization. |
| R10 | **UNRESOLVED** | The absence of a Room/Location resource is confirmed, so room occupancy is **NOT CURRENTLY REPRESENTABLE**. Minimum core can omit it technically, but product must accept that collision limitation. |
| R11 | **UNRESOLVED** | Coexist, collision-only, suppress and replace semantics all remain possible; no accepted activity precedence exists. |
| R12 | **UNRESOLVED** | Interruption proves no normal teaching opportunity, not that all school occupancy is forbidden. Activity during interruption is undecided. |
| R13 | **UNRESOLVED** | `CalendarException` suppresses scoped normal opportunities. Whether it blocks, coexists with or is superseded by activity is undecided. |
| R14 | **UNRESOLVED** | No disposition type has accepted activity interaction in either creation order. Existing 05C facts must not be silently invalidated; later activity commands must check them. |
| R15 | **UNRESOLVED** | ACTIVE make-up target class/teacher occupancy is a confirmed subfact and must be checked. Conflict resolution/precedence with activity is undecided; activity cannot create or bypass an obligation. |
| R16 | **UNRESOLVED** | Only the 05C subset is closed. The pairwise matrix in section 9 shows every Special Activity edge remains open. |
| R17 | **UNRESOLVED** | Activity is not a normal subject lesson and no PPCT fields belong in its minimum scheduling fact. Whether any activity affects distribution/debt must be decided downstream; completion always requires execution evidence. |
| R18 | **INFERRED** | Resolver needs retained date/calendar/time, target membership, scheduled staffing, lifecycle/source and the accepted suppression/replacement result. Those fields cannot be finalized before R1/R3/R6/R8/R11–R17. |
| R19 | **CONFIRMED** | Scheduling owns planned activity identity, target, time and scheduled staffing. Actual teacher/content/completion, debt/progress and report totals belong downstream. |
| R20 | **UNRESOLVED** | Forward correction/no physical delete is strongly implied. Exact `ACTIVE → REVERSED` versus activity-specific scheduled/cancelled/confirmed lifecycle, future/backdate rules and replacement semantics are not accepted. |
| R21 | **UNRESOLVED** | A dedicated professional capability is inferred; its key and scope matrix are undecided. Generic `ACTIVITY` scope vocabulary exists but no canonical activity resource or management capability does. |
| R22 | **INFERRED** | Request key+fingerprint, replay conflict, semantic uniqueness, CAS, `SERIALIZABLE`, DB backstops and sanitized coupled audit should apply. Exact fingerprints, uniqueness and lock resources depend on unresolved topology. |
| R23 | **INFERRED** | Historical meaning must not rebind to current calendar/timetable/assignment/staff/class heads. Exact frozen bundle and whether class/grade membership needs a snapshot remain unresolved. |
| R24 | **UNRESOLVED** | A minimum core can be bounded, but decisions D1–D10 must close before persistence. Deferred scope is explicit in section 14. |

## 7. Detailed findings

### 7.1 Aggregate, business meaning and atomicity (R1–R3)

- **CONFIRMED:** `ADR-017` excludes grade/school/multi-teacher coordinates from `TimetableEntry`; `ADR-027` calls Special Activity its own aggregate.
- **CONFIRMED:** `ADR-012` states normal TeachingAssignment has no co-teaching requirement and directs multi-teacher GDĐP/HĐTN-HN to separate activity models.
- **INFERRED:** A root is needed for common business identity/provenance and one-to-many staffing records are needed to preserve each occupied teacher.
- **UNRESOLVED:** Whether the root itself is one occurrence, whether an authored activity has occurrence/session children, and whether targets are normalized children.
- **UNRESOLVED:** PA-B v1.2 examples and candidate names (`special_activities`, assignments, confirmations) are not an accepted enum, schema or lifecycle. “Ceremony”, exam, training, extracurricular and generic other categories have no canonical acceptance.
- **CONFIRMED:** Existing time infrastructure can address one civil date and one or more exact retained slot revisions. It can compare real half-open wall-clock ranges once slots are loaded.
- **UNRESOLVED:** Multi-day/recurring series, arbitrary wall-clock intervals and partial reversal. They must not be encoded in minimum persistence without closure.

### 7.2 Calendar and time provenance (R4–R5)

- **INFERRED:** `academicYearId`, exact retained `academicCalendarVersionId`, civil date and exact selected time evidence are required candidates. This mirrors `CalendarException`, disposition and make-up provenance and prevents current-head drift.
- **CONFIRMED:** `AcademicWeek` is a business unit derived through exact calendar segments; it is not an ISO week and is not evidently an activity owner.
- **CONFIRMED:** `TimeSlotDefinition` belongs to AcademicYear, contains exact weekday/session/revision and real time, and remains historically retained. `isActive` is only current authoring selectability, not civil-date effectivity.
- **UNRESOLVED:** `EXACT_SLOTS` versus `SESSION` as accepted activity selector. If session is persisted without exact slots, later slot revision can change concrete occupancy unless the command expands/fixes identities.
- **UNRESOLVED:** Arbitrary room/resource time or cross-midnight activity occupancy is **NOT CURRENTLY REPRESENTABLE**.

### 7.3 Participants, multi-class identity and staffing (R6–R9)

- **CONFIRMED:** Business targets include class, grade and school-wide. `SchoolClass.gradeLevel` provides current year-scoped grade membership.
- **UNRESOLVED:** Whether grade/school targets mean dynamic membership at resolution time or frozen membership at scheduling time. Recomputing through later class metadata risks historical drift; expanding all members changes identity and correction cardinality.
- **UNRESOLVED:** Multiple explicit classes. Neither a single multi-class fact nor expanded atomic facts is favored by accepted evidence.
- **CONFIRMED:** There is no student/enrollment or participant-group model, so arbitrary rosters and individual student targets cannot be authoritative minimum-core participants.
- **CONFIRMED:** Multiple teachers must be representable. One `teacherId` on a root is insufficient.
- **INFERRED:** Each scheduled staff identity must create an independent occupancy claim. A normalized staffing child is the narrowest candidate, not yet an accepted model.
- **UNRESOLVED:** Lead/responsible/participant/supervisor role vocabulary and whether roles alter eligibility, confirmation or workload.
- **CONFIRMED:** Actual teacher is future `TeachingExecution` evidence and must not be collapsed into scheduled staffing.
- **INFERRED:** New staffing should at least require an ACTIVE `User` with canonical `StaffProfile`; whether `isTeachingStaff` is mandatory depends on activity role.
- **UNRESOLVED:** Subject eligibility. `StaffSubject` is relevant only if an accepted activity role/category is subject-bound; `TeachingAssignment` proves normal teaching responsibility and must not be required by default.

### 7.4 Interactions, PPCT and resolved occurrence (R10–R19)

- **CONFIRMED:** No Room/Location resource or collision key exists. A text location could be descriptive only and must not claim collision protection.
- **UNRESOLVED:** Activity versus base timetable, interruption, exception and each disposition type. `ADR-027`’s old proposed ordering was superseded for 05C by `ADR-031`, which explicitly did not place activity into that chain.
- **CONFIRMED:** Existing 05C records remain valid; activity introduction must collision-check them rather than rewrite or silently invalidate them.
- **CONFIRMED:** ACTIVE make-up target occupancy exists in persistence. Activity cannot synthesize its PPCT obligation, satisfy it by scheduling, or consume its item.
- **CONFIRMED:** No PPCT counters or item link should be placed on an activity merely to make reporting convenient. Activity is not a disguised subject lesson.
- **UNRESOLVED:** Whether an activity suppressing a normal opportunity means “not distributed/no debt,” creates another consequence, or leaves a conflict requiring operator action. This decision is essential before resolved occurrence.
- **INFERRED:** Future resolved occurrence needs activity ID, retained temporal provenance, target/staffing evidence, lifecycle validity and the accepted relation to the normal source. It should remain a deterministic read model, not be persisted by this task.
- **CONFIRMED:** Actual completion, content, actual staff, fulfillment, progress/debt and reports are downstream evidence/projections.

### 7.5 Lifecycle, authorization, concurrency and drift (R20–R23)

- **INFERRED:** Historical activity semantic payload should be immutable and corrections forward-linked; physical deletion conflicts with repository-wide history rules.
- **UNRESOLVED:** The 05C `ACTIVE/REVERSED` lifecycle cannot be copied automatically. PA-B v1.2’s activity draft/assigned/completed/confirmed examples include execution/reporting concerns and were not adopted by an Accepted ADR.
- **UNRESOLVED:** Prospective authoring, retrospective authoritative creation and correction windows/reasons.
- **INFERRED:** A new activity-specific management capability is required. Existing `GDDDP_COORDINATOR`, `HĐTN_COORDINATOR` and `AI_ACTIVE_USE_ACTIVITY` definitions do not constitute accepted Special Activity mutation authority.
- **CONFIRMED:** Generic authorization supports `ACTIVITY` resource scope, but there is no persisted activity resource to validate at grant/command time. Business target scope (`GRADE`, `CLASS`) is not automatically an authorization scope.
- **INFERRED:** The 05C command reliability pattern applies: versioned fingerprint, same-key replay, different-fingerprint conflict, independent semantic uniqueness, CAS lifecycle, `SERIALIZABLE` multi-row work, transactional success audit and DB uniqueness/exclusion where representable.
- **UNRESOLVED:** Exact semantic key and lock set; they depend on root/session/target/staffing choices.
- **INFERRED:** Retain source identities used at command time. Never recompute historical activity meaning from current calendar head, timetable head, TeachingAssignment, StaffSubject or user status. Whether grade/class membership needs explicit frozen expansion/snapshot is D3.

## 8. Cross-domain collision matrix

| Candidate collision | Canonical evidence available? | Candidate collision key/resource | Command-time check possible now? | DB backstop possible? | Unresolved semantics |
|---|---|---|---|---|---|
| Class occupancy | Partial: class IDs, exact slots, timetable and make-up exist | year + date + class + real interval | **Yes**, after activity target/time shape is closed | Partial exclusion/claim table; not across joins with current schema | Whether activity suppresses or merely collides; multi-class expansion |
| Grade occupancy | Partial: `SchoolClass.gradeLevel` and exception scope | year + date + grade + interval, with membership rule | Technically yes | Only after target/membership representation is chosen | Frozen versus dynamic class membership |
| School-wide occupancy | Partial: school-wide exception scope | year + date + interval | Technically yes | Possible only with normalized occupancy claims | Whether school-wide blocks every class/teacher or represents participation only |
| Teacher occupancy | Strong: User, timetable, dispositions, make-up, real slots | teacher + date + half-open interval | **Yes** for canonical resources | Partial; normalized teacher claims/exclusion could backstop | Which staffing roles occupy; non-teaching staff eligibility |
| Normal timetable | Strong normal-base provenance | date-effective entry class/teacher + interval | **Yes** | Cross-domain DB backstop requires occupancy abstraction/claims | Suppress, replace, coexist or reject |
| Substitution/supervision | Strong active disposition evidence | assigned teacher + source class/date/slot | **Yes** | Partial unique/exclusion after activity shape | Precedence and released responsible-teacher occupancy |
| ACTIVE make-up target | Strong persistence, runtime creation deferred | target class + teacher + date + slot | **Yes** for retained rows | Partial | Reject/coexist/priority; exact obligation must remain untouched |
| `CalendarException` | Strong | calendar + date + scope + selector | **Yes** | Existing exception constraints plus future activity claims | Which fact blocks/overrides and both creation orders |
| `CalendarInterruption` | Strong date-range evidence | retained calendar + date | **Yes** | FK/date checks cannot alone decide business allowance | Whether general school activities may occur during no-teaching gaps |
| Activity vs activity | None beyond required future collision | target resources + staff + date/time | Not until D2/D3/D4 | Possible after normalized claims and semantic key | Same event multi-target overlap, category priority, replacement |
| Room/location | **No authoritative resource** | None | **No** | **No** | **UNRESOLVED — NOT CURRENTLY REPRESENTABLE** |

Cross-table collision remains a service/transaction concern with locking and DB backstops; a normal FK cannot compare all joined wall-clock ranges. The current 05C service sometimes checks exact slot identity while canonical slot architecture requires real interval comparison across different slot IDs; a future activity design must not reduce collision truth to ordinal or label.

## 9. Precedence-gap matrix

Each unordered pair is classified once. “Confirmed partial” does not upgrade a pair whose final two-order interaction is open.

| Pair | Classification | Relation supported by evidence |
|---|---|---|
| `CalendarInterruption` ↔ `CalendarException` | **CONFIRMED** | 05C rejects exception creation where interruption means no normal opportunity; interruption is earlier in the normal chain. |
| `CalendarInterruption` ↔ Special Activity | **UNRESOLVED** | Interruption suppresses normal week/teaching opportunity; general school occupancy may be allowed or blocked. |
| `CalendarInterruption` ↔ disposition | **CONFIRMED** | No normal source opportunity; disposition creation is rejected. |
| `CalendarInterruption` ↔ make-up target | **UNRESOLVED** | Make-up is additional occupancy, not a base opportunity; accepted documents require target validation but do not close activity-like occupancy during interruption. |
| `CalendarInterruption` ↔ base timetable | **CONFIRMED** | Base version still resolves historically, but no normal lesson opportunity exists for operational resolution. |
| `CalendarException` ↔ Special Activity | **UNRESOLVED** | Exception suppresses normal lessons only; activity block/coexist/replace semantics are absent. |
| `CalendarException` ↔ disposition | **CONFIRMED** | Applicable exception suppresses source; disposition is rejected. An existing disposition blocks creation of an overlapping exception. |
| `CalendarException` ↔ make-up target | **UNRESOLVED** | Existing make-up blocks a new overlapping exception in 05C2A, but make-up runtime and symmetric final policy are not closed. |
| `CalendarException` ↔ base timetable | **CONFIRMED** | Applicable active exception suppresses scoped normal opportunities. |
| Special Activity ↔ disposition | **UNRESOLVED** | Must collision-check both creation orders; no suppress/override/coexist rule exists for any of four disposition types. |
| Special Activity ↔ make-up target | **UNRESOLVED** | Canonical class/teacher target occupancy must be checked; precedence/coexistence is undecided. |
| Special Activity ↔ base timetable | **UNRESOLVED** | Suppress, replace, collide-only and scoped coexistence remain open. |
| disposition ↔ make-up target | **INFERRED** | They are distinct facts and may collide on class/teacher/time; no general precedence is appropriate. Exact target rule awaits make-up runtime. |
| disposition ↔ base timetable | **CONFIRMED** | One exact active disposition determines the operational outcome of an existing unsuppressed base opportunity. |
| make-up target ↔ base timetable | **INFERRED** | Make-up is additional occupancy and should collide on occupied class/teacher/time, not override the base. |

There is therefore no accepted full precedence chain containing Special Activity.

## 10. Candidate provenance/data inventory

This is an audit inventory, not a schema proposal.

| Candidate fact | Classification | Reason |
|---|---|---|
| `academicYearId` | **INFERRED CANDIDATE** | Stable year scope and same-year FK coordinate. |
| `academicCalendarVersionId` | **INFERRED CANDIDATE** | Prevents mutable current-calendar reinterpretation. |
| Civil date | **CONFIRMED REQUIRED** | All accepted scheduling/operational resolution is civil-date based. |
| Time selector / exact time-slot IDs | **UNRESOLVED** | Exact IDs are strongest evidence; accepted selector/granularity is open. |
| Participant target(s) | **CONFIRMED REQUIRED** | Class/grade/school scopes are confirmed; physical representation is open. |
| Staffing identities | **CONFIRMED REQUIRED** | Multiple teachers and teacher occupancy must be knowable; roles/shape open. |
| Activity category/type | **UNRESOLVED** | No accepted vocabulary/catalogue strategy. |
| Business label/title | **INFERRED CANDIDATE** | Needed to identify an activity operationally; no accepted bounds/uniqueness. |
| Source/provenance | **INFERRED CANDIDATE** | Repository requires traceable source and frozen interpretation; source vocabulary open. |
| Creator | **INFERRED CANDIDATE** | Adjacent immutable facts retain actor. |
| Request identity/fingerprint | **INFERRED CANDIDATE** | Adjacent mutation convention; exact namespace/payload open. |
| Lifecycle/reversal evidence | **UNRESOLVED** | Forward history is implied; exact activity lifecycle is open. |
| Replacement linkage | **INFERRED CANDIDATE** | Consistent with forward correction, contingent on lifecycle choice. |
| Audit correlation/request ID | **INFERRED CANDIDATE** | Sanitized audit and request correlation are canonical conventions. |
| Target membership snapshot/expansion | **UNRESOLVED** | Needed only if grade/school membership must freeze. |
| Scheduled staffing role | **UNRESOLVED** | No accepted role vocabulary. |
| Location text | **DEFERRED / NON-COLLISION DESCRIPTION ONLY** | No Room/Location authority; must not imply booking. |
| `ppctItemId` | **FORBIDDEN DOWNSTREAM COUPLING** | Activity must not guess/consume/fulfill a PPCT obligation. |
| `completed` | **FORBIDDEN DOWNSTREAM COUPLING** | Execution/projection state. |
| `debtClosed` | **FORBIDDEN DOWNSTREAM COUPLING** | Progress/debt state. |
| `actualTeacher` | **FORBIDDEN DOWNSTREAM COUPLING** | TeachingExecution evidence. |
| `actualContent` | **FORBIDDEN DOWNSTREAM COUPLING** | TeachingExecution evidence. |
| Report totals/workload totals | **FORBIDDEN DOWNSTREAM COUPLING** | Derived reporting projection. |
| Snapshot/submission/approval state | **FORBIDDEN DOWNSTREAM COUPLING** | Official reporting workflow. |

## 11. Authorization analysis

**CONFIRMED:** Authorization and participation are different axes. “School-wide participants” does not mean the creator needs an inferred role or that every school-wide grant can mutate the activity.

**CONFIRMED:** ADR-008 supplies generic `ACTIVITY` resource-scope evaluation, but it does not define Special Activity business authority. The current seed has coordinator/AI keys with `ACTIVITY` scope and 05C keys for other domains. None may be reused implicitly.

**INFERRED:** A dedicated capability such as an activity-management capability is needed because activity commands create cross-class and teacher occupancy and may suppress normal opportunities. The exact key is intentionally not named as accepted architecture here.

**UNRESOLVED scope matrix:**

- `SCHOOL_WIDE`: technically available and a plausible grant covering all activity resources;
- `ACTIVITY`: technically available only after an exact persisted activity resource exists;
- `GRADE` and `CLASS`: not current authorization scope types, even though they are business participant targets;
- `SUBJECT`, `SUBJECT_GROUP`, `PERSONAL`: no accepted authority for activity mutation;
- creator/assign/confirm/reverse separation: unresolved.

Any future command must server-resolve the persisted activity and its targets before authorization, fail closed, and audit denials without grant internals. `SYSTEM_ADMIN`, `TIMETABLE_MANAGE`, `PPCT_MANAGE`, `CALENDAR_EXCEPTION_MANAGE`, `TEACHING_OPERATION_MANAGE`, role/title, duty, membership, `TeachingAssignment` and `StaffSubject` grant no activity authority.

## 12. Lifecycle / correction / concurrency analysis

### Lifecycle and correction

- **CONFIRMED general principle:** historically meaningful source facts are retained; physical deletion or in-place semantic rewriting is not an accepted correction mechanism.
- **INFERRED:** future correction should link predecessor/replacement and preserve actor, instant and reason.
- **UNRESOLVED:** whether scheduling truth is directly `ACTIVE`, whether cancellation is `REVERSED`, or whether an activity-specific scheduled/cancelled/confirmed lifecycle is required.
- **UNRESOLVED:** confirmation in PA-B v1.2 may relate to workload/execution rather than occupancy authority. It cannot be imported into minimum scheduling lifecycle without a decision.
- **UNRESOLVED:** retrospective create/correct policy and future stale-calendar handling. Silent rebinding is forbidden by adjacent historical rules.

### Idempotency, concurrency and audit

- **INFERRED applicable convention:** normalized request key plus versioned fixed-key fingerprint; same key/fingerprint replay; same key/different fingerprint conflict.
- **INFERRED applicable convention:** semantic uniqueness independent of request replay; CAS using a token such as `expectedUpdatedAt` for lifecycle changes.
- **INFERRED applicable convention:** `SERIALIZABLE` for root + targets + staffing + occupancy + audit mutations, with bounded retries only for recognized serialization/unique races.
- **INFERRED applicable convention:** DB unique/partial/exclusion constraints for local active claims; service transaction/locks for cross-domain real-interval collisions.
- **CONFIRMED audit convention:** success audit is transactionally coupled; failed commands produce no success audit; metadata is sanitized and excludes credentials/grant internals.
- **UNRESOLVED:** semantic key, normalized occupancy claim strategy, fingerprint payload and which resource rows must be locked.

## 13. Historical-resolution analysis

Future/historical activity meaning must not be recomputed from mutable “current” heads:

| Later drift | Audit conclusion |
|---|---|
| Active calendar head changes | **INFERRED:** retain exact calendar version; future stale source conflicts and requires explicit correction, never silent rebinding. |
| Timetable version changes | **INFERRED:** activity remains its own fact; if it replaces/suppresses a base opportunity, retain the exact affected base provenance chosen by D5. |
| TeachingAssignment changes | **CONFIRMED boundary:** staffing is not TeachingAssignment mutation; old scheduled/actual identities must not drift. |
| `StaffSubject` changes | **INFERRED:** freeze any eligibility decision used; do not reclassify old staffing from current catalog state. |
| Class metadata/status changes | **UNRESOLVED:** retain class identity; decide whether grade/school membership must be expanded/frozen or resolved from retained year metadata. |
| Teacher becomes inactive/non-teaching | **INFERRED:** historical staffing remains; new/future commands apply current eligibility and stale-future policy. |

`ResolvedLessonOccurrence` must consume retained activity facts and accepted precedence deterministically. It must not select the newest activity, calendar, timetable or eligibility row by convenience, and ambiguous same-precedence facts must fail closed.

## 14. Minimum-core boundary

### MINIMUM CORE REQUIRED BEFORE RESOLVED LESSON OCCURRENCE

1. Accepted activity business boundary and bounded category strategy.
2. Atomic root/session/occurrence and time-selector decision.
3. Exact year/calendar/date/time provenance.
4. Class/grade/school target representation, multi-class rule and membership-at-date rule.
5. Multi-teacher scheduled staffing representation, occupancy cardinality and minimum eligibility.
6. Activity-vs-activity and cross-domain collision keys/check order.
7. Full pairwise precedence/replacement/coexistence decisions against interruption, exception, dispositions, make-up occupancy and base timetable.
8. Explicit PPCT consequence when activity overlaps a normal opportunity, without storing downstream counters.
9. Scheduling lifecycle, correction, future/retrospective and stale-source rules.
10. Dedicated capability/scope/command authority matrix.
11. Request replay, semantic uniqueness, CAS, isolation, DB backstop and audit contract.
12. Deterministic retained evidence required by the future occurrence resolver.

### DEFERRED / NON-SCOPE

- Activity import and bulk authoring.
- Recurring-series/multi-day authoring unless D2 explicitly makes it core.
- Arbitrary student rosters, individual attendance and enrollment history.
- Room booking/location collision; descriptive location must not claim booking authority.
- External guests, attachments, notifications and approval workflow.
- Actual execution, actual teachers/content, confirmation of completion and attendance.
- PPCT completion, distribution counters, progress, debt/late and make-up fulfillment.
- Workload/report calculations, reports, statements and immutable snapshots.
- UI and UI business semantics.

The minimum core may proceed without Room, arbitrary students, import or UI only after their omission is recorded as a deliberate collision/participant limitation.

## 15. Explicit forbidden couplings

1. Adding Special Activity fields or polymorphic kinds to `TimetableEntry`.
2. Mutating `TimetableVersion`, `TimetableEntry`, `TeachingAssignment`, calendar or PPCT history to represent an activity.
3. Reusing `CalendarException` or `OperationalLessonDisposition` as an activity subtype.
4. Treating grade/school participant scope as automatic authorization scope.
5. Inferring authority from any existing capability, role, title, assignment, eligibility or UI visibility.
6. Treating a text room/location as collision-safe booking.
7. Creating an arbitrary student/group domain without an upstream prerequisite decision.
8. Attaching `ppctItemId`, completion, debt closure, actual teacher/content, workload/report totals or snapshot state to activity scheduling.
9. Using activity to manufacture, satisfy or bypass a make-up obligation.
10. Recomputing historical meaning from current calendar/timetable/class/staff/eligibility heads.
11. Selecting last-created activity/fact as a precedence winner.
12. Claiming `NORMAL_BASE_PPCT_V1`, current 05C collision coverage or future resolved occurrence is complete before activity closure.

## 16. Repository prerequisite/gap analysis

| Gap | Disposition | Reason |
|---|---|---|
| Authoritative participant-group/student model | **A — not required for minimum core**, if minimum targets only accepted class/grade/school scopes | Arbitrary rosters/individuals remain impossible and deferred. |
| Room/Location domain | **A — not required for minimum core**, subject to explicit accepted limitation | Otherwise it is **D — upstream data prerequisite** before room collision claims. |
| Activity category catalogue/vocabulary | **C — product decision only** for a bounded generic category; **D** if a configurable managed catalogue is chosen | Choice changes FK/catalogue lifecycle and validation. |
| Multi-teacher association convention | **C — product/architecture decision** | Existing normal assignment cannot represent it; normalized staffing is feasible using `User`. |
| Participant target/multi-class representation | **C — product/architecture decision** | Existing SchoolClass/grade resources are usable, but topology and membership freeze are open. |
| Capability key and scope vocabulary | **C — product/architecture decision** | Generic `ACTIVITY` scope exists; no management capability/resource contract exists. |
| Exact temporal representation | **C — product decision** using **B — existing canonical resources** | Exact slots/calendar/date exist; selector and granularity must be chosen. |
| Activity occupancy claim/backstop | **D — upstream architecture/data prerequisite within the persistence design** | Needed for safe activity-vs-activity concurrency and cross-domain checks. |
| PPCT execution/progress source | **A — not required for scheduling minimum core** | Required later for execution/progress, and must remain downstream. |
| Make-up incomplete-obligation proof | **A — not required for activity core** | Existing make-up runtime remains separately fail-closed. |

## 17. Unresolved decision register

### D1 — Business category contract

- **Question:** Which facts qualify as Special Activity, and is type a bounded enum, configurable catalogue or generic category?
- **Why it matters:** Changes validation, uniqueness, lifecycle and whether subject-specific eligibility/PPCT rules exist.
- **Supported options:** (a) narrowly accepted GDĐP/HĐTN-HN categories; (b) bounded generic categories with an “other” policy; (c) managed catalogue as a prerequisite.
- **Evidence:** ADR-027 confirms GDĐP/HĐTN-HN boundary; PA-B examples are broader but not an accepted catalogue.
- **Consequences:** (a) smallest scope but excludes other events; (b) flexible but requires explicit semantic limits; (c) adds catalogue ownership/versioning before persistence.

### D2 — Root, occurrence and time granularity

- **Question:** Is one root one civil-date occurrence, an authored event with occurrence children, or another structure; and does it use exact slots, session or wall-clock interval?
- **Why it matters:** Determines table topology, request identity, partial correction and collision key.
- **Supported options:** (a) atomic date + exact slots; (b) parent event + atomic occurrence children; (c) session-based facts expanded to retained slots; arbitrary intervals only with new rules.
- **Evidence:** ADR-016/017 exact slot infrastructure; ADR-031 favors atomic operational facts but does not govern activity.
- **Consequences:** (a) simplest and historically exact; (b) supports multi-date identity but adds child lifecycle; (c) simpler authoring but must prevent slot-revision drift.

### D3 — Participant target and multi-class membership

- **Question:** How do class, grade, school and multiple classes map to persistent identity, and is membership frozen or resolved later?
- **Why it matters:** Changes target children, semantic uniqueness, collision expansion and historical resolution.
- **Supported options:** (a) one typed scope per atomic occurrence; (b) root with explicit class targets; (c) expand grade/school to frozen class claims; (d) dynamic retained-year membership if class history is proven adequate.
- **Evidence:** ADR-027 confirms class/grade/school; schema has only year-scoped `SchoolClass`, no participant group/enrollment.
- **Consequences:** Typed scopes are compact but need membership rules; explicit/frozen claims improve collision/history but increase rows; dynamic resolution risks metadata drift.

### D4 — Staffing roles, cardinality and eligibility

- **Question:** Which scheduled staff roles exist, which create occupancy, and what active/teaching/subject eligibility applies?
- **Why it matters:** Determines staffing child shape, collision claims and later expected-versus-actual reporting.
- **Supported options:** (a) role-neutral participant staff, all occupying; (b) bounded role vocabulary with per-role eligibility/occupancy; (c) subject-bound role only for selected activity categories.
- **Evidence:** ADR-012/027 confirm multiple teachers and separate actual teacher; 05C demonstrates frozen eligibility patterns.
- **Consequences:** Role-neutral is minimal but may not express responsibility; typed roles improve semantics but require product vocabulary; subject rules can overconstrain non-subject activities.

### D5 — Base timetable and disposition interaction

- **Question:** Does activity collide, suppress, replace or coexist with normal lessons and each of four disposition types, in both creation orders?
- **Why it matters:** Determines whether a normal occurrence exists, active uniqueness and downstream PPCT outcome.
- **Supported options:** (a) conflict requiring prior reversal/operator action; (b) explicit replacement link to exact opportunities; (c) scope-based suppression; (d) coexist only with disjoint class/teacher occupancy.
- **Evidence:** ADR-031 explicitly defers activity precedence and forbids silent invalidation; suppression grants no replacement occupancy.
- **Consequences:** Conflict is safest but operationally heavier; replacement gives exact provenance; suppression needs mass target resolution; coexistence requires complete occupancy proof.

### D6 — Interruption and CalendarException interaction

- **Question:** May activity occur during an interruption or active exception, and which fact wins/blocks in both creation orders?
- **Why it matters:** Changes command validity and whether calendar constructs mean “no teaching” or “no school occupancy.”
- **Supported options:** (a) always blocked; (b) activity independent of normal-teaching suppression; (c) explicit exception/replacement permission by scope.
- **Evidence:** ADR-010 defines interruption as academic-week pause; ADR-031 exception suppresses normal opportunities only; neither closes general activity occupancy.
- **Consequences:** Blocking is simple but may forbid legitimate events; independence needs collision semantics; explicit permission needs authority/audit fields.

### D7 — PPCT consequence

- **Question:** When activity suppresses/replaces a normal subject opportunity, is the item undistributed/no debt, distributed/incomplete, or resolved by another explicit policy?
- **Why it matters:** Without this, resolved occurrence and later progress/debt are nondeterministic.
- **Supported options:** (a) no distribution/no debt; (b) distribution/incomplete debt; (c) category/decision-specific policy stored as scheduling semantics; (d) conflict-only activity that never suppresses normal lessons.
- **Evidence:** ADR-027 separates activity from subject teaching and leaves activity occupancy open; 05C has type-specific PPCT outcomes but they cannot be copied.
- **Consequences:** Each option changes future PPCT projection; none permits counters or completion fields on activity.

### D8 — Scheduling lifecycle and correction

- **Question:** Use `ACTIVE → REVERSED`, an activity-specific scheduled/cancelled lifecycle, or a separate confirmation state; and what are future/retrospective rules?
- **Why it matters:** Determines active occupancy, correction, uniqueness and historical queries.
- **Supported options:** (a) immutable active/reversed scheduling fact; (b) draft then immutable scheduled fact; (c) scheduled/cancelled plus downstream execution confirmation kept separate.
- **Evidence:** ADR-031/032 provide adjacent reversal pattern; PA-B activity confirmation examples are lower authority and mix workload/execution.
- **Consequences:** (a) smallest; (b) supports authoring but adds mutable draft/CAS; (c) must avoid duplicating TeachingExecution.

### D9 — Capability and scope matrix

- **Question:** What dedicated capability authorizes create/assign/reverse, and are grants school-wide, exact activity, or separately class/grade scoped?
- **Why it matters:** Prevents overgrant and determines server resource resolution.
- **Supported options:** (a) dedicated key with `SCHOOL_WIDE`; (b) dedicated key with `ACTIVITY|SCHOOL_WIDE`; (c) new class/grade scope types only through separate authorization architecture.
- **Evidence:** ADR-008 generic scope matrix; no Special Activity key; ADR-031 forbids authority inference.
- **Consequences:** School-wide is simple/broad; exact activity cannot authorize initial create without a bootstrap rule; new scopes expand the platform contract.

### D10 — Collision claims, uniqueness and Room limitation

- **Question:** What normalized resource claims and DB backstops guarantee activity-vs-activity/cross-domain safety, and is Room explicitly excluded?
- **Why it matters:** Races can create double class/teacher occupancy; Room claims are impossible today.
- **Supported options:** (a) normalized class/teacher interval claims plus service checks/DB exclusions; (b) aggregate-specific rows with locks and partial uniques; (c) add Room domain first if location collision is mandatory.
- **Evidence:** ADR-016 real intervals; ADR-032 cross-row transactional boundary; current schema lacks Room and activity claims.
- **Consequences:** Claims provide strong concurrency at added abstraction cost; aggregate-only checks are simpler but harder across domains; Room-first expands prerequisites materially.

## 18. Recommended decision-closure questions

1. Approve the narrowest business catalogue and explicitly reject unsupported examples from the first slice.
2. Choose one atomic time model and state whether series/multi-day authoring expands into independent occurrences.
3. Decide target topology and whether grade/school membership freezes into class occupancy claims.
4. Approve staff role vocabulary, cardinality, occupancy and eligibility independently of authorization.
5. Complete the 15-pair precedence matrix, including both creation orders and exact dispositions.
6. State the PPCT consequence of every accepted suppress/replace outcome.
7. Choose scheduling lifecycle/correction and separate it from actual execution/confirmation.
8. Approve a dedicated capability and exact scope/create/bootstrap rules.
9. Approve collision claim/locking/DB-backstop strategy and explicitly accept or reject Room omission.
10. Freeze the exact historical provenance manifest required by resolved occurrence.

These questions should be closed in one consolidated decision slice so aggregate, collision, authorization and PPCT choices are reviewed together.

## 19. Recommended next slices

1. **LOCAL-FC-05D0D — Special Activity decision closure:** close D1–D10 and record one Accepted ADR; documentation only.
2. **Special Activity persistence foundation:** only after D0D, add the accepted root/children, retained provenance, local constraints and migration; no runtime or downstream state.
3. **Special Activity control plane:** capability/scopes, create/correct/read, source validation, idempotency/CAS, full cross-domain collision and sanitized audit.
4. **ResolvedLessonOccurrence:** deterministic read model over retained calendar, timetable, PPCT, 05C overlays and Special Activity.
5. Continue with TeachingExecution, progress/debt, reporting and snapshots in the roadmap order.

Each slice requires separate authorization. No UI business semantics should precede frozen backend contracts.

## 20. Final gate verdict

Blocking decisions are D1–D10. They materially affect aggregate structure, uniqueness keys, participant model, staffing model, precedence, PPCT behavior, authorization, lifecycle and collision backstops.

DECISION CLOSURE REQUIRED BEFORE SPECIAL ACTIVITY PERSISTENCE
