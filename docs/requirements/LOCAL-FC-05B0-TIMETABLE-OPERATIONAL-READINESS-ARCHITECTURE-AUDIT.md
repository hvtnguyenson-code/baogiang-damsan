# LOCAL-FC-05B0 — Timetable Operational Readiness Architecture Audit

## 1. Executive summary

**Overall status: READY AFTER DECISION CLOSURE.**

The repository proves a strong normal-base timetable and PPCT foundation, but it does not yet define one safe, complete meaning for “timetable operational readiness.” Existing `VALIDATED` and `ACTIVE` states prove only the current normal-base timetable checks. They do not prove timetable completeness, PPCT coverage/capacity, operational-overlay compatibility or special-activity collision readiness.

The narrowest supported architecture is a forward-only downstream assessment that consumes immutable timetable and PPCT history without changing either source aggregate. That assessment may evaluate one exact `TimetableVersion` together with its affected class-subject streams over an explicitly selected civil-date interval. This aggregate boundary is **INFERRED**, not accepted product policy. Whether the feature is called full operational readiness, normal-base readiness with deferred dimensions, or a release gate remains **UNRESOLVED**.

Implementation must wait for the fourteen decisions in section 18. In particular, no source authorizes a simple comparison of recurring timetable rows with PPCT item count as the “đủ PPCT” algorithm. Such a comparison is unsafe because schedule opportunities are date-, calendar-, timetable-, association- and later overlay-dependent.

Counting convention for this audit: section 5 is the canonical material-finding inventory and contains **18 EXPLICIT**, **7 INFERRED** and **14 UNRESOLVED** findings. The fourteen UNRESOLVED rows map one-to-one to decisions R1–R14 in section 18. Repeated explanations elsewhere do not create additional counted findings.

## 2. Scope and non-scope

This document audits requirements and architecture only. It distinguishes authoritative facts, conservative architectural consequences and decisions that need explicit closure.

Non-scope:

- no runtime implementation;
- no API or contract implementation;
- no Prisma/schema change and no migration;
- no seed or capability change;
- no PPCT import;
- no operational-overlay implementation;
- no special-activity implementation;
- no resolved-occurrence, execution/Báo giảng, progress/debt/late, reporting or approval implementation;
- no UI;
- no deploy, VPS, production configuration, production migration or production-data action.

No physical model, endpoint, enum, issue code, transaction protocol or task ID proposed below is accepted merely by appearing in this audit.

## 3. Authoritative sources reviewed

### 3.1 Authoritative specifications

- `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md`, especially source priority, delivery safety and the UI/backend gate.
- `docs/specifications/PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx`, especially §§2, 5–9, 11–12, 16 and 18 and Appendices A–D. Relevant direct semantics include retained timetable versions, §7.3 validation findings, real-time collision, calendar interruption/local exception behavior, PPCT distribution/completion/debt and special-activity scope.

### 3.2 Accepted ADRs and accepted decision closure

- `docs/decisions/ADR-008-CAPABILITY-AUTHORIZATION-SEMANTICS.md` — exact-scope, default-deny authorization.
- `docs/decisions/ADR-016-CANONICAL-TIME-SLOT-FOUNDATION.md` through `ADR-020-TIMETABLE-LIFECYCLE-AND-HISTORICAL-RESOLUTION.md` — exact slot revisions, timetable persistence, validation and lifecycle/history.
- `docs/requirements/LOCAL-FC-05A0D-PPCT-DECISION-CLOSURE.md` — accepted PPCT product-owner closure.
- `docs/decisions/ADR-027-PPCT-EXECUTION-REPORTING-ARCHITECTURE.md` through `ADR-029-PPCT-CONTROL-PLANE-AND-LIFECYCLE.md` — PPCT aggregate/cardinality, persistence, lifecycle, class association and exact historical resolution.

`ADR-015-TIMETABLE-DOMAIN-FOUNDATION.md` was reviewed completely but remains **Proposed**. Only its points later accepted by ADR-016 through ADR-020 are treated as authority.

### 3.3 Current implementation evidence

- `apps/api/src/timetables/**` and `apps/api/test/timetables/**`.
- `apps/api/src/ppct/**` and `apps/api/test/ppct/**`.
- `packages/contracts/src/index.ts`.
- `prisma/schema.prisma` and focused timetable/PPCT service, contract and test evidence.

Implementation evidence establishes what the system currently enforces; it does not create new business requirements.

### 3.4 Planning and reference-only sources

- `docs/PROJECT_CONTEXT.md` establishes current repository context and source priority.
- `docs/architecture/CORE-BACKEND-ROADMAP.md` is planning guidance, expressly not an accepted requirements source.
- `docs/requirements/LOCAL-FC-04-TIMETABLE-DOMAIN-SPEC.md` and `LOCAL-FC-05A0-PPCT-TEACHING-EXECUTION-REPORTING-ARCHITECTURE-AUDIT.md` preserve prior evidence analysis and classification history. Their recommendations are not silently promoted to accepted decisions.
- Prototype UI is not a business-semantics source and was not used to decide readiness.

## 4. Current implemented semantics

### 4.1 Timetable

`TimetableVersion` is owned by `AcademicYear` and retains the exact target `AcademicCalendarVersion`, effective `AcademicWeek`, inclusive civil-date history and lifecycle `DRAFT → VALIDATED → APPROVED → ACTIVE → SUPERSEDED`. A future-effective `ACTIVE` head is possible; date resolution selects the unique `ACTIVE` or `SUPERSEDED` interval containing the requested civil date rather than relying on status alone.

Normal `TimetableEntry` rows retain weekday, exact immutable time-slot revision, class, subject, exact `TeachingAssignment` provenance and immutable teacher identity. They intentionally contain no PPCT sequence/title or special-activity fields.

The current evaluator checks:

- target identity, week segments and derived `effectiveFrom`;
- active target calendar at activation;
- non-empty timetable;
- teaching weekday;
- active regular-teaching time slot;
- active class and subject;
- active teacher and teaching-staff profile;
- `TeachingAssignment` coverage from `effectiveFrom` through the selected calendar end;
- class and teacher collision over exact half-open wall-clock intervals.

Every validation/activation report explicitly declares `TIMETABLE_COMPLETENESS`, `PPCT_ASSOCIATION` and `SPECIAL_ACTIVITY_COLLISIONS` deferred. Therefore `VALIDATED` and `ACTIVE` are exact historical facts about the implemented normal-base evaluator, not aliases for operational readiness.

### 4.2 PPCT

One logical `PpctPlan` is shared by exactly `AcademicYear + Subject + Grade`. Its version lifecycle is `DRAFT → PUBLISHED → SUPERSEDED`; published/superseded content is immutable. One item is one distributable teaching-period obligation, with stable logical UUID, version-local revision/order and explicit split/merge lineage.

`PpctClassAssociation` binds one `AcademicYear + SchoolClass + Subject` stream over a non-overlapping inclusive civil-date interval to an exact PPCT version whose plan matches year, subject and grade. A new/switching association can target only the current `PUBLISHED` version. Historical resolution nevertheless returns the retained exact association and may validly resolve a version that is now `SUPERSEDED`; a date gap returns factual `resolved: false`.

Publication rejects an empty PPCT draft. PPCT has no calendar/week ownership, no global completion flag and no implemented progress/debt state.

### 4.3 Authorization and missing readiness boundary

Current timetable reads and commands require explicit `TIMETABLE_MANAGE / SCHOOL_WIDE`. Current PPCT reads and commands require `PPCT_MANAGE` for the exact persisted subject, satisfiable by the exact `SUBJECT` grant or `SCHOOL_WIDE`. No current capability or endpoint represents viewing, recalculating, certifying or acknowledging readiness. There is no readiness schema, API, contract, service or test suite.

## 5. Evidence matrix

This table is the canonical counted inventory for the final report.

| ID | Area | Finding | Classification | Evidence | Implementation consequence |
|---|---|---|---|---|---|
| E1 | Lifecycle | Timetable lifecycle is exactly `DRAFT → VALIDATED → APPROVED → ACTIVE → SUPERSEDED`; effective history is civil-date interval based. | EXPLICIT | ADR-017/020, “Decision”; schema and timetable resolution service. | Preserve lifecycle and interval history unchanged. |
| E2 | Validation scope | `VALIDATED` and `ACTIVE` prove only current normal-base checks; completeness, PPCT association and special-activity collisions are deferred. | EXPLICIT | ADR-019/020; current report contract/service/tests. | Readiness must not reinterpret existing states. |
| E3 | Current checks | The implemented evaluator covers target/calendar, non-empty content, weekday, active slot/class/subject/teacher, teaching-staff status, assignment coverage and class/teacher collision. | EXPLICIT | `timetable-validation.ts`, timetable service/tests. | Reuse these facts or their results without claiming broader coverage. |
| E4 | Timetable identity | A normal entry pins exact slot, class, subject, assignment and teacher; it carries no PPCT identity. | EXPLICIT | ADR-017, “Normal timetable entries”; schema. | Do not denormalize PPCT sequence/title into `TimetableEntry`. |
| E5 | Timetable history | Historical resolution accepts exact `ACTIVE`/`SUPERSEDED` intervals and does not use current calendar state. | EXPLICIT | ADR-020; timetable service/tests. | Historical readiness inputs cannot be replaced by current heads. |
| E6 | PPCT owner | Logical PPCT master is exactly `AcademicYear + Subject + Grade`, shared across matching classes. | EXPLICIT | 05A0D D1–D2; ADR-027/028. | Readiness cannot create a class-owned PPCT master. |
| E7 | PPCT stream | Progress/association scope is at least `AcademicYear + SchoolClass + Subject`. | EXPLICIT | 05A0D D2/D6; ADR-027/028. | Coverage must be evaluated per affected class-subject stream. |
| E8 | Association effectivity | PPCT association is non-overlapping and exact-version, using inclusive civil-date intervals; a gap resolves false. | EXPLICIT | ADR-028/029; PPCT service/tests. | A point-in-time answer must resolve the exact association for that date. |
| E9 | Superseded PPCT | A historical association to a now-`SUPERSEDED` PPCT version remains valid; it is not replaced with the current published head. | EXPLICIT | ADR-028/029, class association/history. | Current `PUBLISHED` status must not be required for already covered historical dates. |
| E10 | PPCT publication | A new association switch targets the current `PUBLISHED` version and PPCT publication rejects empty content. | EXPLICIT | ADR-029; PPCT service/tests. | “No PPCT items” cannot occur for a valid published target under current commands. |
| E11 | Cardinality | One normal resolved occurrence consumes at most one next PPCT item; make-up consumes no new item. | EXPLICIT | 05A0D D3; ADR-027. | No multi-item counting assumption is allowed without architecture re-entry. |
| E12 | Missing PPCT | v1.2 §7.3 treats a timetable subject without PPCT as a validation concern; the accepted PPCT architecture resolves a class-subject stream through an exact date-effective association. | EXPLICIT | v1.2 §7.3; 05A0D D6; ADR-027–029; ADR-019/020 defer the check. | Readiness must expose PPCT absence, subject to the unresolved applicability rule R4. |
| E13 | Calendar effects | Interruption suppresses expected execution/progress; a local exception suppresses selected lessons without PPCT consumption/debt. | EXPLICIT | v1.2 §§6.3–6.4, 8.3; ADR-020. | Raw recurring-row counts cannot equal dated operational opportunities. |
| E14 | Special activities | Special activities have separate class/grade/school occupancy and multi-teacher semantics and are not normal entries. | EXPLICIT | v1.2 §11; ADR-017/027. | Current data cannot prove special-activity collision readiness. |
| E15 | Immutability | A downstream fact must not rewrite upstream calendar, timetable or PPCT historical truth. | EXPLICIT | v1.2 §2; ADR-020/027–029. | Any assessment is additive/derived, never a historical lifecycle rewrite. |
| E16 | Timetable auth | Current timetable read/mutation boundary is `TIMETABLE_MANAGE / SCHOOL_WIDE`. | EXPLICIT | ADR-018/020; timetable controllers; seed. | This describes current endpoints only, not future readiness authority. |
| E17 | PPCT auth | Current PPCT boundary is `PPCT_MANAGE` at exact `SUBJECT` or `SCHOOL_WIDE`; no role/title/admin inference. | EXPLICIT | ADR-008/027/029; PPCT access service; seed. | Cross-subject readiness cannot assume subject grants aggregate into school-wide authority. |
| E18 | Current absence | No readiness persistence, API, contract, capability or runtime exists. | EXPLICIT | Schema, contracts, timetable/PPCT modules and tests. | A later slice must introduce only what decision closure authorizes. |
| I1 | Concept boundary | Operational readiness is a distinct downstream assessment over immutable planning facts, not another meaning of `VALIDATED`/`ACTIVE`. | INFERRED | E2, E4, E8, E15 and roadmap layering. | Use a separate conceptual boundary. |
| I2 | Subject shape | The smallest useful assessment combines one exact timetable version/interval with per-entry-derived class-subject streams; no single PPCT “God aggregate” owns it. | INFERRED | E4, E6–E8 and E15. | Results may aggregate upward only from traceable stream findings. |
| I3 | Date resolution | PPCT coverage for a dated normal occurrence should use the exact association effective on that civil date. | INFERRED | ADR-027 resolved-occurrence inputs plus E8–E9. | Never use “currently published PPCT” as a historical lookup shortcut. |
| I4 | Consistency | A deterministic multi-aggregate evaluation needs one internally consistent database snapshot or equivalent pinned read boundary. | INFERRED | Timetable/PPCT can change concurrently; accepted commands use serializable/CAS controls. | Avoid mixed-before/after evidence in one result. |
| I5 | Result shape | Structured findings with evaluated scope and source identities are safer than a bare boolean. | INFERRED | Deferred dimensions, historical resolution and auditability requirements. | A boolean alone cannot distinguish failure from unassessed scope. |
| I6 | Missing domains | If readiness is implemented before overlays/special activities, unavailable dimensions must be disclosed as unassessed/deferred rather than silently passed. | INFERRED | E2, E14 and roadmap order. | Exact state vocabulary and pass rule remain R1/R7. |
| I7 | Provenance | Reproducible assessment needs at least exact timetable/calendar identities, civil evaluation range and resolved PPCT association/version identities for findings. | INFERRED | E5, E8–E9, E15 and downstream historical rules. | Provenance does not by itself require a stored assessment row. |
| U1 | Product meaning | Whether this is full readiness, normal-base readiness, or readiness with deferred dimensions is not decided. | UNRESOLVED | No accepted source closes the label/pass semantics. | Close R1 before naming a public status. |
| U2 | Assessment subject | Whole-version, year, interval, class, stream and entry aggregation/pass rules are not decided. | UNRESOLVED | Sources provide identities but no readiness aggregate policy. | Close R2 before contract/schema design. |
| U3 | Temporal horizon | Point date, timetable effective interval, future horizon, calendar end or another range is not decided. | UNRESOLVED | Timetable validation uses calendar end for assignments, but readiness is not defined. | Close R3 before PPCT coverage calculation. |
| U4 | PPCT applicability | It is not decided whether every normal timetable subject is PPCT-backed or how legitimate exemptions are declared. | UNRESOLVED | 05A0 §9/§22; special subjects have separate semantics. | Close R4 to avoid false blockers. |
| U5 | Association continuity | Required PPCT association continuity and switch behavior across the evaluated interval are not decided. | UNRESOLVED | Exact dated resolution is accepted; readiness interval policy is absent. | Close R5 before classifying gaps. |
| U6 | Enough PPCT | No authoritative capacity algorithm compares future opportunities with PPCT obligations. | UNRESOLVED | ADR-027 expressly leaves “đủ PPCT” open. | Close R6; do not implement item-count arithmetic. |
| U7 | Severity/pass model | Blocker, warning, deferred/not-assessed vocabulary and aggregation are not accepted. | UNRESOLVED | Examples are not decisions; current timetable issues cover a narrower state transition. | Close R7 before public DTOs/enums. |
| U8 | Lifecycle relation | Whether readiness blocks activation, follows activation, is advisory, is a release gate or extends lifecycle is not decided. | UNRESOLVED | ADR-020 deliberately activated without future checks. | Close R8 without rewriting old rows. |
| U9 | Storage/certification | Pure query, cache/materialization, immutable snapshot or command-created certification is not decided. | UNRESOLVED | 05A0 defers storage; no current model exists. | Close R9 before persistence/API design. |
| U10 | Historical policy | Reproducibility, retention and whether a recorded result is immutable or later superseded are not decided. | UNRESOLVED | Provenance is required downstream, not a readiness retention policy. | Close R10. |
| U11 | Authorization | View, recalculate and certify/acknowledge permissions and scopes are not decided. | UNRESOLVED | Existing timetable and PPCT capabilities govern their own endpoints only. | Close R11; add no implicit authority. |
| U12 | Concurrency/idempotency | Snapshot isolation, stale-input response, certification CAS/idempotency and competing command behavior are not decided. | UNRESOLVED | Existing aggregates have independent concurrency controls. | Close R12 before runtime design. |
| U13 | Downstream contract | Whether consumers receive a boolean, structured findings, pinned sources or a certification reference is not decided. | UNRESOLVED | No accepted readiness contract exists. | Close R13 before overlays/occurrence integration. |
| U14 | Re-evaluation/drift | Triggers, invalidation, expiry and drift handling after source changes are not decided. | UNRESOLVED | PPCT switches and timetable/calendar successors preserve old history but change future facts. | Close R14 before caching or certification. |

## 6. Readiness subject / aggregate boundary

**EXPLICIT:** `TimetableVersion` is a whole-year-owned version with an effective civil interval, while PPCT association is per `AcademicYear + SchoolClass + Subject` stream and per civil-date interval. A resolved normal row identifies one class and subject. None of these identities owns the others.

**INFERRED:** the assessment subject should be compositional:

1. an exact `TimetableVersion` and declared evaluation interval form the outer scheduling scope;
2. entries project the distinct affected class-subject streams;
3. each stream produces dated/ranged PPCT and dependency findings;
4. version/year-level presentation aggregates those findings without erasing their provenance.

This is not a “God aggregate”: it is a read/assessment boundary across independently versioned sources. Whether one failed stream makes the whole version fail is **UNRESOLVED (R2/R7)**. Per-entry readiness as the sole subject is too narrow because PPCT association and capacity are stream/interval questions; whole-year readiness as the sole subject is too broad because timetable versions have their own effectivity and class streams may differ.

## 7. Temporal and historical model

**EXPLICIT:** timetable history and PPCT association history both resolve by inclusive civil-date intervals. A `SUPERSEDED` timetable/PPCT version remains valid historical evidence for dates covered by retained intervals. Current lifecycle status is not a replacement for date-effective resolution.

**INFERRED:** a reproducible result should declare the evaluation civil date/range and pin or emit the relevant `AcademicYear`, exact `AcademicCalendarVersion`, exact `TimetableVersion` and effective interval, plus exact PPCT association/plan/version identities for each affected stream. Exact item identities are needed only if a later accepted capacity algorithm evaluates item-level obligations; they must not be demanded speculatively.

**UNRESOLVED:** readiness may be current-state, point-in-time, interval-specific, historically reproducible, or certified as an immutable fact. The interval may end at the version boundary, a configured future horizon, calendar end or another policy boundary. A future `ACTIVE` timetable head and a PPCT switch within the same future range make this choice material.

Historical evaluation must never require a PPCT version to remain currently `PUBLISHED`: an association that was valid for a past date remains authoritative after supersession. For a future association creation/switch, current commands require the target version to be `PUBLISHED`; readiness must not invent a different mutation rule.

## 8. PPCT association dependencies

**EXPLICIT:** the class-subject association, not the timetable entry, selects an exact PPCT version over civil time. Year, class, subject and grade compatibility are enforced. A missing date binding is factual, and a historical binding may target a now-`SUPERSEDED` version.

**INFERRED:** any PPCT-backed normal occurrence should resolve through the exact association effective on its civil date. Looking up the current published head would rewrite historical meaning and violate ADR-029.

**UNRESOLVED:** sources do not decide:

- whether every normal class-subject stream must be PPCT-backed;
- how non-curriculum/self-study or otherwise exempt entries are declared;
- whether a single date gap blocks only that date/stream or the whole version;
- what continuity is required across a multi-date readiness interval;
- whether a prospective association switch inside the interval is acceptable, conditional or blocking;
- whether readiness should consider only dates where the timetable actually creates eligible normal opportunities.

## 9. “Enough PPCT” analysis

ADR-027 explicitly leaves the “đủ PPCT” criterion unresolved. No accepted source authorizes this formula:

```text
recurring timetable rows × nominal weeks <= PPCT item count
```

That comparison is **unsafe**, not merely incomplete. Recurring rows are not dated operational opportunities. A valid calculation would have to account for authoritative business-calendar segments and interruptions, reserve-week policy, timetable effective boundaries, exact date-effective PPCT association/version switches and—once those domains exist—local cancellation, make-up, special activities and other overlays. Class-specific distribution/progress also diverges, and one make-up fulfills an existing obligation rather than consuming a new one.

**EXPLICIT:** one PPCT item represents one distributable teaching-period obligation and one normal resolved occurrence consumes at most one next item. These cardinalities are necessary but not sufficient to define future capacity.

**UNRESOLVED:** the project has not decided whether capacity means enough items for all eligible future normal opportunities, enough opportunities to finish all PPCT obligations, a warning threshold, a selected planning horizon, or no readiness capacity test at all. No counting formula may be implemented before R3, R4, R5 and R6 are closed together.

## 10. Normal-base vs full operational readiness

**EXPLICIT:** current timetable validation is `NORMAL_BASE_TIMETABLE` and names PPCT association and special-activity collisions as deferred. Operational overlays and special activities are separate future domains. The roadmap places readiness before their implementation, but the roadmap is planning guidance rather than product authority.

**INFERRED:** a feature delivered at the current repository state can truthfully assess only implemented normal-base facts plus whatever PPCT checks decision closure authorizes. It cannot assert that future operational overlays or special-activity conflicts passed. Missing dimensions should be visible as unassessed/deferred; exact enum names are not accepted here.

**UNRESOLVED:** product ownership must decide whether such a partial assessment may be called “operational readiness,” whether it may pass with deferred dimensions, or whether full readiness remains unavailable until downstream domains exist. Treating an unavailable dimension as silently passed is prohibited by the evidence.

## 11. Candidate blocker/warning matrix

The “candidate treatment” column is evidence analysis, not an accepted severity enum.

| Candidate finding | Current evidence | Classification | Candidate treatment / unresolved point |
|---|---|---|---|
| Timetable is not `ACTIVE` | Only `ACTIVE`/`SUPERSEDED` participate in historical effective resolution; readiness/lifecycle relationship is absent. | UNRESOLVED | Whether readiness is pre-activation, post-activation or advisory is R8. |
| Timetable is empty | Existing normal-base validation emits `EMPTY_TIMETABLE` and cannot validate it. | EXPLICIT | Already blocks current validation; do not duplicate with conflicting semantics. |
| Target/calendar/effective date invalid | Existing evaluator detects missing target, inactive target at activation, segment absence and date mismatch. | EXPLICIT | Existing normal-base blocker. Historical reads must still retain old calendar identity. |
| Missing PPCT plan | v1.2 §7.3 lists a timetable subject without PPCT as a validation finding; PPCT applicability exemptions are not defined. | EXPLICIT + UNRESOLVED | Candidate blocker for PPCT-backed streams; R4 decides exemptions/scope. |
| No effective association / association gap | Exact date resolution returns false; accepted architecture requires exact date-effective association for PPCT-backed historical resolution. | EXPLICIT + UNRESOLVED | Candidate blocker only after R3–R5 define interval and applicability. |
| Class/subject/grade mismatch | PPCT persistence and switch commands reject mismatched scope. | EXPLICIT | Invalid source relationship, not a warning. |
| Historical association targets `SUPERSEDED` version | Explicitly retained and valid for covered historical dates. | EXPLICIT | Must not be reported as a defect merely because status is no longer `PUBLISHED`. |
| New association target not currently `PUBLISHED` | Current switch command rejects it. | EXPLICIT | Mutation invalidity is established; readiness evaluation of an already retained association differs. |
| PPCT has no items | Current publication rejects empty drafts. | EXPLICIT | A valid published/superseded target should not have this state through supported commands; corruption handling is implementation detail. |
| “Insufficient” item count | No accepted algorithm. | UNRESOLVED | No blocker or warning until R6. |
| TeachingAssignment gap | Current evaluator checks coverage from `effectiveFrom` through calendar end. | EXPLICIT | Existing normal-base blocker; readiness horizon may differ and must not silently change its historical meaning. |
| Inactive slot/class/subject/teacher or non-teaching user | Current evaluator rejects these current dependencies. | EXPLICIT | Existing normal-base blocker at validation/activation; historical display may still show inactive referenced identities. |
| Class/teacher collision | Current evaluator detects half-open real-time overlap. | EXPLICIT | Existing normal-base blocker. |
| Timetable completeness by class/day/slot | Explicitly deferred and source does not require every class to fill every slot. | UNRESOLVED | No severity until completeness policy is separately decided. |
| Future special-activity conflict cannot be assessed | Domain is separate and not implemented. | EXPLICIT + INFERRED | Must be disclosed; BLOCKED/WARNING/NOT_ASSESSED/DEFERRED vocabulary is R1/R7. |
| Unsupported operational-overlay semantics | Overlay domain is not implemented; move/swap semantics are unresolved. | EXPLICIT + INFERRED | Must not be reported as passed; treatment is R1/R7. |

## 12. Lifecycle interaction

**EXPLICIT:** approval acknowledges the immutable validated snapshot; activation reruns only the implemented normal-base evaluator. ADR-020 intentionally leaves completeness, PPCT and special-activity checks deferred. Old `VALIDATED`/`ACTIVE` rows must not acquire a new retroactive meaning.

The following are all feasible but **UNRESOLVED** product choices:

- readiness blocks activation prospectively after an explicit cutover;
- readiness is evaluated only after activation;
- readiness is advisory;
- readiness is a separate release/use gate;
- readiness requires a future lifecycle extension.

Any prospective policy needs a cutover rule for already active or future-effective versions. No implementation may mutate historical lifecycle metadata to claim a check occurred when it did not.

## 13. Authorization implications

**EXPLICIT:** `TIMETABLE_MANAGE / SCHOOL_WIDE` authorizes current timetable reads and lifecycle commands. `PPCT_MANAGE / SUBJECT` or `SCHOOL_WIDE` authorizes current PPCT reads and commands. ADR-008 permits `SCHOOL_WIDE` to satisfy a subject request, but never aggregates several subject grants into a `SCHOOL_WIDE` request and never infers rights from `SYSTEM_ADMIN`, role/title, `SubjectGroupMembership`, `AdditionalDuty` or `TeachingAssignment`.

**UNRESOLVED:** no source decides authority for:

- viewing school-wide or subject/class-bounded readiness;
- recalculating a deterministic assessment;
- certifying or acknowledging readiness;
- overriding/accepting warnings or deferred dimensions.

Reusing `TIMETABLE_MANAGE` for a read-only readiness view may overgrant; using `PPCT_MANAGE` alone may under-authorize cross-subject timetable data. Certification, if accepted at all, is a distinct professional action and cannot be inferred from either current capability without R11.

## 14. Concurrency/idempotency considerations

**INFERRED:** a deterministic evaluation should see a consistent snapshot of the selected timetable chain head/version, calendar target, entries, PPCT associations and exact PPCT versions. Otherwise a PPCT switch, timetable activation/supersession or calendar change can produce a mixed result that never existed at one logical instant.

Future implementation must explicitly handle:

- association switch during evaluation;
- timetable supersession during evaluation;
- calendar activation/correction during evaluation;
- source change between evaluation and certification/acknowledgment;
- simultaneous evaluations or certifications;
- retry of a command-created certification.

**UNRESOLVED:** required isolation, source tokens/manifest, stale-result behavior, retry key namespace and command idempotency. A pure read may need only consistent snapshot semantics; a certification command would additionally need CAS/idempotency and immutable audit evidence. These must not be designed before R9/R12.

## 15. Derived vs persisted assessment analysis

| Option | Benefits | Risks / limits | Evidence classification |
|---|---|---|---|
| Pure deterministic query/read model | No new source of truth; naturally reflects current inputs; smallest implementation. | Historical reproduction can drift unless callers retain exact inputs; expensive across large intervals; no formal acknowledgment. | Feasible, but **UNRESOLVED**. |
| Cached/materialized projection | Faster repeated reads; can invalidate from source changes. | Invalidation/drift and concurrency complexity; cache must never become independent truth. | Feasible, but **UNRESOLVED**. |
| Stored assessment snapshot | Can preserve evaluated findings and pinned sources. | Requires retention, supersession/staleness and trust semantics; may be mistaken for timeless truth. | Feasible, but **UNRESOLVED**. |
| Command-created certification/acknowledgment | Supports an explicit release gate and actor/audit evidence. | Introduces policy, authorization, separation-of-duty, concurrency and idempotency requirements absent from sources. | Feasible only after product decision; **UNRESOLVED**. |

**INFERRED:** regardless of storage, upstream timetable and PPCT rows remain authoritative. A cache/snapshot/certification can reference or record what was assessed, but cannot rewrite upstream historical meaning. No schema design is authorized.

## 16. Downstream contract implications

Operational overlays, special activities, resolved lesson occurrence and execution/Báo giảng will eventually need to know what scheduling/PPCT assumptions were evaluated. A bare “ready” boolean is insufficient while scope and deferred dimensions exist.

**INFERRED minimum boundary:** expose an evaluation scope, structured findings by dimension/stream and the immutable source identities necessary to interpret those findings. This is a conceptual contract only.

**UNRESOLVED:** whether downstream domains require a live evaluation, an accepted pass, a certification reference, individual findings, or pinned source manifests. Downstream code must not infer readiness from `TimetableVersion.status`, nor may it treat a missing assessment as success.

## 17. Re-entry triggers

Re-enter architecture before implementation or extension if any of these occurs:

- timetable begins supporting non-normal lesson types in the normal entry model;
- PPCT cardinality changes from one item per distributable normal period;
- class-specific PPCT masters/overrides or multiple programs/tracks/books are introduced;
- special activities become part of the base timetable;
- timetable entries become multi-subject, multi-class or multi-slot authoring records;
- one occurrence consumes multiple PPCT items or one PPCT item spans multiple occurrences;
- school policy changes the meaning of “operational readiness” or “đủ PPCT”;
- readiness becomes a formal approval/certification workflow;
- overlays or special activities gain an accepted precedence model affecting readiness;
- calendar/reserve-week policy changes future-opportunity calculation;
- a PPCT workbook makes week placement canonical rather than projected;
- authorization requirements become incompatible with current exact-scope semantics.

## 18. UNRESOLVED decisions requiring product-owner closure

### R1 — Product meaning and honest label

**Question:** Is the feature full operational readiness, normal-teaching-base readiness, or readiness with explicitly deferred/unassessed dimensions?

**Why unsafe to assume:** operational overlays and special-activity collision semantics are absent, while current reports explicitly defer them.

**Feasible options:** (a) do not expose readiness until all dimensions exist; (b) expose normal-base-plus-PPCT readiness under a precise label; (c) expose multi-dimensional readiness with unavailable dimensions.

**Recommended default:** option (c), with no overall pass unless R7 defines how unavailable dimensions aggregate. This is a recommendation only.

### R2 — Assessment subject and aggregation

**Question:** What is certified/evaluated: exact timetable version, its effective interval, AcademicYear, class, class-subject stream, entry, or a defined composition; and how do child findings aggregate?

**Why unsafe to assume:** timetable and PPCT use different aggregate/effectivity boundaries.

**Feasible options:** version-level only; stream-level only; compositional version → stream → finding results.

**Recommended default:** compositional results rooted at exact timetable version + evaluation interval, with traceable stream findings. Recommendation only.

### R3 — Evaluation interval/horizon

**Question:** Is evaluation for one civil date, the bounded timetable interval, a configured future horizon, calendar end or another range?

**Why unsafe to assume:** coverage, association gaps and capacity produce different answers for each range.

**Feasible options:** point date; caller-supplied bounded range; effective interval capped at calendar end; policy-defined rolling horizon.

**Recommended default:** an explicit bounded civil-date range within the timetable/calendar domain; do not imply readiness beyond it. Recommendation only.

### R4 — PPCT applicability and exemptions

**Question:** Must every normal class-subject timetable stream have PPCT, and how are legitimate non-PPCT entries declared?

**Why unsafe to assume:** v1.2 flags missing PPCT, but prior audit leaves normal/non-PPCT lesson types unresolved and special activities are separate.

**Feasible options:** all normal entries require PPCT; explicit allow-listed exempt lesson types; no exemptions in first release with incompatible entries rejected upstream.

**Recommended default:** require exact PPCT for every entry classified as a normal curricular lesson; define exemptions explicitly before accepting any. Recommendation only.

### R5 — Association coverage and version-switch policy

**Question:** What continuity is required over the evaluation range, and how is a valid mid-range association/version switch treated?

**Why unsafe to assume:** dated resolution is explicit, but readiness across a range is not.

**Feasible options:** continuous coverage on every calendar date; coverage only on eligible scheduled-opportunity dates; split evaluation at association boundaries.

**Recommended default:** evaluate only eligible normal-opportunity dates and split findings at exact association boundaries; any uncovered eligible date is a finding. Severity awaits R7. Recommendation only.

### R6 — “Enough PPCT” criterion

**Question:** Is capacity evaluated, and if so what authoritative algorithm defines enough PPCT?

**Why unsafe to assume:** ADR-027 deliberately leaves this open and naïve counts ignore calendar/operational reality.

**Feasible options:** no capacity criterion in the first slice; a later projection over dated eligible opportunities; a product-defined warning threshold.

**Recommended default:** omit capacity from the first runtime slice and report it as unassessed until overlays/calendar rules and an approved algorithm exist. Recommendation only.

### R7 — Finding severity and overall result

**Question:** Which findings block, warn or remain unavailable/deferred, and how is the overall result calculated?

**Why unsafe to assume:** current validation blockers belong to the existing lifecycle; no readiness severity vocabulary exists.

**Feasible options:** binary pass/fail; multi-severity result; dimension states plus a separately defined release decision.

**Recommended default:** structured dimension/finding states and a separately derived overall outcome; never map unavailable to passed. Recommendation only.

### R8 — Timetable lifecycle and cutover

**Question:** Does readiness block activation, run after activation, remain advisory, act as a separate release gate or extend lifecycle; and how are existing/future-effective active rows treated?

**Why unsafe to assume:** ADR-020 explicitly activated without these deferred checks.

**Feasible options:** advisory post-activation; prospective pre-activation gate after cutover; separate release/certification gate; lifecycle extension.

**Recommended default:** separate prospective gate with an explicit cutover, preserving every historical lifecycle fact. Recommendation only.

### R9 — Derived, materialized or certified form

**Question:** Is readiness a pure query, cache/materialized projection, immutable snapshot or explicit certification/acknowledgment?

**Why unsafe to assume:** persistence and formal approval are not required by existing sources.

**Feasible options:** pure query first; query plus disposable cache; stored assessment; command-created certification.

**Recommended default:** pure deterministic read model first unless R8 requires a formal gate; add persistence only for a demonstrated audit/release need. Recommendation only.

### R10 — Historical reproducibility and retention

**Question:** Must prior assessments be reproducible or retained, what provenance is mandatory, and can a recorded assessment expire/be superseded?

**Why unsafe to assume:** downstream history requires exact source meaning, but no readiness retention policy exists.

**Feasible options:** reproducible on demand from exact IDs; retained immutable result; retained manifest plus recomputation; current-only view.

**Recommended default:** emit exact source identities in every result and retain only if certification is chosen. Recommendation only.

### R11 — Authorization

**Question:** Which capability/scope authorizes view, recalculation and certification/acknowledgment?

**Why unsafe to assume:** `TIMETABLE_MANAGE` is school-wide while `PPCT_MANAGE` may be subject-scoped; neither accepted decision covers readiness.

**Feasible options:** reuse timetable management for all operations; introduce read/certify capabilities; subject-bounded reads plus school-wide aggregation authority.

**Recommended default:** separate read from certification authority; require explicit school-wide authority for whole-version results and server-resolved exact subject scope for bounded views. Recommendation only.

### R12 — Transaction, stale inputs and idempotency

**Question:** What consistency boundary, source token, stale response and command idempotency apply?

**Why unsafe to assume:** independently versioned sources may switch during calculation.

**Feasible options:** repeatable/serializable snapshot read; explicit source manifest with post-read verification; certification CAS and idempotency key.

**Recommended default:** consistent snapshot for reads; if certification exists, bind an exact manifest and use CAS/idempotency. Recommendation only.

### R13 — Downstream consumption contract

**Question:** Do overlays/occurrence/execution consume a boolean, structured findings, source manifest, certification reference or another boundary?

**Why unsafe to assume:** a boolean loses assessed range and unavailable dimensions.

**Feasible options:** live structured result; immutable certification reference; boolean plus mandatory metadata; no direct dependency until later.

**Recommended default:** structured result with scope and source identities; add certification reference only if R8/R9 select it. Recommendation only.

### R14 — Re-evaluation, drift and invalidation

**Question:** Which source changes trigger re-evaluation, and what happens to a prior result?

**Why unsafe to assume:** PPCT association switches, successor versions and calendar/timetable changes alter future facts without invalidating historical truth.

**Feasible options:** always-live query; explicit stale marker; expiry horizon; immutable prior result plus successor assessment.

**Recommended default:** preserve prior assessed meaning, mark it non-current for affected future scope and create/recompute a successor result rather than mutate history. Recommendation only.

## 19. Implementation entry criteria

Runtime implementation is authorized only after an accepted decision-closure artifact resolves R1–R14 and confirms:

1. honest product label, assessed dimensions and overall result semantics;
2. exact subject/aggregation boundary and bounded civil-date horizon;
3. PPCT applicability, association continuity and whether capacity is in scope;
4. finding taxonomy and blocker/warning/unavailable aggregation;
5. lifecycle/cutover relation without reinterpreting historical `VALIDATED`/`ACTIVE` rows;
6. derived/persisted/certified form plus historical provenance/retention policy;
7. explicit capabilities and allowed scope types under ADR-008;
8. transaction snapshot, stale-input and any command idempotency semantics;
9. minimum downstream contract and drift/re-evaluation rules;
10. acceptance cases for split weeks, interruptions, reserve weeks, future-effective timetable heads, PPCT association gaps/switches and historical superseded versions.

If decision closure excludes “enough PPCT,” implementation must expose that dimension as out of scope/unassessed according to the accepted vocabulary and must not approximate it with raw counts.

## 20. Recommended slice decomposition

IDs and order below are planning only:

1. **05B0D — Timetable operational-readiness decision closure:** close R1–R14 and accept the contract boundary; documentation only.
2. **05B1 — Deterministic readiness foundation/read model:** implement only the accepted scope, structured findings, consistent source resolution, authorization and focused tests. Do not assume persistence.
3. **05B2 — Control plane/API:** only if closure selects certification, acknowledgment, cache/materialization or a separate release gate; add command concurrency/idempotency and audit accordingly.
4. **Later integration closure:** re-enter readiness after operational overlays and special-activity minimum core to replace unavailable dimensions with evidence-backed checks.

The recommended next slice is **05B0D**. No runtime slice is ready before that closure.
