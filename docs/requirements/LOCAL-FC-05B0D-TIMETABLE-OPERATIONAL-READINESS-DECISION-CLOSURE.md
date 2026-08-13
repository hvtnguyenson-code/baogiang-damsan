# LOCAL-FC-05B0D — Timetable Operational Readiness Decision Closure

## 1. Status

**DECISIONS CLOSED — READY FOR NEXT IMPLEMENTATION SLICE**

No accepted product-owner decision in this closure contradicts an Accepted ADR or another authoritative repository invariant. This status closes the architecture entry gate for the bounded next slice; it is not runtime implementation authorization and is not a claim of complete school operational readiness.

## 2. Scope / authority

This documentation-only artifact closes exactly R1–R14 from `LOCAL-FC-05B0-TIMETABLE-OPERATIONAL-READINESS-ARCHITECTURE-AUDIT.md`. D1–D14 below are authoritative product-owner decisions for this feature boundary. They do not retroactively convert findings that the 05B0 audit correctly classified as **INFERRED** or **UNRESOLVED** into requirements that were explicit in specification v1.2.

The accepted first profile is `NORMAL_BASE_PPCT_V1`. It is a separate, deterministic downstream read assessment over retained timetable, calendar and PPCT facts. It does not implement runtime behavior, alter source aggregates, extend a lifecycle, add persistence, or authorize UI work.

The roadmap remains planning guidance. Prototype UI is not product authority.

## 3. Preconditions and preserved upstream facts

The following accepted facts remain unchanged:

1. The timetable lifecycle is exactly `DRAFT → VALIDATED → APPROVED → ACTIVE → SUPERSEDED`. `VALIDATED` and `ACTIVE` retain their existing normal-base historical meaning.
2. A normal `TimetableEntry` retains exact timetable provenance and does not receive PPCT sequence, title or item identity.
3. The PPCT logical master is exactly `AcademicYear + Subject + Grade`; it is not owned by a class, timetable, teaching assignment, calendar version or academic week.
4. PPCT class-stream scope is at least `AcademicYear + SchoolClass + Subject`, with a non-overlapping civil-date association to an exact PPCT version.
5. Historical resolution uses exact retained identities and date-effective intervals. A historical association to a now-`SUPERSEDED` PPCT version remains valid provenance.
6. One normal resolved occurrence consumes at most one next PPCT obligation. Make-up fulfills an existing obligation and consumes no new PPCT item.
7. PPCT items have no global completion flag. Progress, debt, execution and reporting remain downstream.
8. Operational overlays and special activities remain distinct domains. This closure does not invent their precedence, occupancy or execution semantics.
9. A downstream result never rewrites upstream calendar, timetable or PPCT history.
10. Authorization remains capability- and scope-based, exact and default-deny. Role, title, `SYSTEM_ADMIN`, group membership, duty and `TeachingAssignment` do not imply professional authority.

## 4. Decision matrix

| Decision | Closes | Accepted rule | Consequence |
|---|---|---|---|
| D1 | R1 | The first profile is **TIMETABLE READINESS — NORMAL BASE + PPCT BINDING**, conceptually `NORMAL_BASE_PPCT_V1`; it is not full operational readiness. | A profile PASS is limited to declared coverage, while unavailable domains remain visibly not assessed. |
| D2 | R2 | The root is one exact `TimetableVersion` plus one explicit bounded civil-date interval, with distinct affected class-subject streams derived from eligible normal opportunities. | Presentation may aggregate findings, but every finding remains traceable and there is no year-wide certification, per-entry readiness state or global PPCT flag. |
| D3 | R3 | Every request supplies a finite inclusive `[from, to]` civil-date range valid in the applicable timetable/calendar domain. | The server infers no horizon and makes no claim outside the requested range; a bounded version cannot be assessed past `effectiveUntil`. |
| D4 | R4 | Every normal curricular `TimetableEntry` is PPCT-backed in this profile; there are no implicit exemptions. | Every eligible normal curricular opportunity requires exact PPCT association resolution; any future exemption model requires architecture re-entry. |
| D5 | R5 | PPCT coverage is required on eligible normal teaching-opportunity dates only and resolves the exact date-effective association. | Gaps on eligible dates are blockers; valid association switches split resolution at retained boundaries; dates without eligible opportunities require no association. |
| D6 | R6 | PPCT capacity is excluded. No count-based or approximate capacity algorithm is authorized. | Capacity is visibly `NOT_ASSESSED`; 05B1 cannot implement “đủ PPCT”. |
| D7 | R7 | Findings use `BLOCKER`, `WARNING`, `INFO`; dimensions use `PASS`, `FAIL`, `NOT_ASSESSED`, preserving the specified aggregation semantics. | A blocker fails its required dimension; warnings/info do not; `NOT_ASSESSED` never becomes `PASS`; root PASS requires every in-profile required dimension to pass. |
| D8 | R8 | Readiness is a separate downstream read assessment and does not block or alter timetable lifecycle transitions. | Immutable `VALIDATED`, `APPROVED`, `ACTIVE` and `SUPERSEDED` content may be assessed; `DRAFT` may not. No cutover or lifecycle gate is introduced. |
| D9 | R9 | The profile is a pure deterministic read model. | No readiness table, stored assessment, certification, acknowledgment, authoritative cache, command or mutation endpoint is allowed in 05B1. |
| D10 | R10 | 05B1 retains no prior responses and promises no byte-for-byte reproduction after prospective source changes, but returns sufficient provenance. | Every evaluation is interpretable from its profile, scope, exact sources, timestamp and structured findings; formal retention requires re-entry. |
| D11 | R11 | The first boundary is school-wide and requires `TIMETABLE_MANAGE / SCHOOL_WIDE`; `PPCT_MANAGE` is not additionally required. | PPCT is an internal read dependency; no PPCT mutation authority or bounded/certification/override permission is granted. |
| D12 | R12 | All timetable/calendar/PPCT reads for one response occur in one internally consistent snapshot using at least `REPEATABLE READ` semantics or a safe stronger equivalent. | The read needs no idempotency key, CAS token or stale-command contract; later requests may legitimately differ. |
| D13 | R13 | The minimum boundary is a structured result containing profile, exact scope, root result, dimensions, visible unassessed coverage, findings and exact provenance. | A bare boolean is forbidden; status, missing results, missing dimensions and `NOT_ASSESSED` cannot be interpreted as PASS. |
| D14 | R14 | The profile is recomputed on every request and has no persisted current state. | There is no invalidation job, expiry row, current-readiness flag or background recalculation; consumers cannot treat an earlier PASS as timeless authority. |

Each unresolved decision R1–R14 is closed exactly once by the corresponding D1–D14 row above.

## 5. Detailed accepted decisions

### D1 — Product meaning / honest label

The first runtime feature assesses only the already-established normal-base timetable foundation and exact date-effective PPCT association/binding for eligible normal teaching opportunities. Its accepted product label is **TIMETABLE READINESS — NORMAL BASE + PPCT BINDING**, conceptually `NORMAL_BASE_PPCT_V1`.

A PASS means only: “the accepted `NORMAL_BASE_PPCT_V1` profile passed for the declared scope.” It must never be presented as complete or full operational readiness. PPCT capacity, operational overlays, substitution/cancellation/make-up semantics, unimplemented local operational exceptions, special-activity collisions, resolved occurrence/execution and progress/debt/reporting are outside assessed coverage. None may be represented as passed.

### D2 — Assessment subject and aggregation

The root subject is one exact `TimetableVersion` and one explicit bounded inclusive civil-date evaluation interval. Eligible normal timetable opportunities in that scope derive the distinct affected `AcademicYear + SchoolClass + Subject` streams.

Findings remain traceable to the exact timetable version, interval, affected stream, relevant dated opportunity where applicable, and exact PPCT association/version provenance where applicable. Version-level presentation aggregates stream and dimension findings without erasing them. There is no `AcademicYear`-wide readiness certification, independently persisted per-entry readiness state or global PPCT readiness flag. Child findings affect the root only through D7.

### D3 — Evaluation interval / horizon

Every assessment requires an explicit finite inclusive civil-date range `[from, to]`. The server must not silently infer today, the current week, calendar end, timetable end or a rolling horizon. The range must be valid within the relevant timetable/calendar domain, and the result claims nothing outside it.

If the exact timetable version has a bounded `effectiveUntil`, the range cannot extend beyond it. An open or future chain head still requires a finite `to`. A future technical maximum window may guard implementation safety but may not change the business meaning of the requested interval.

### D4 — PPCT applicability / exemptions

For `NORMAL_BASE_PPCT_V1`, every normal curricular `TimetableEntry` is PPCT-backed. Every eligible normal curricular class-subject opportunity therefore requires exact PPCT association resolution. The first profile has no implicit exemptions.

Special activities and other non-normal curricular constructs remain outside normal-entry semantics. A future legitimate lesson type that does not use PPCT requires an accepted explicit exemption model or other architecture re-entry. No exemption may be inferred from subject name, teacher, class, role/title, UI label or missing PPCT data.

### D5 — Association coverage and version switches

Coverage is required only on eligible normal teaching-opportunity dates, determined with the accepted scheduling and business-calendar semantics that exist when 05B1 is implemented. This closure does not invent future overlay or special-activity rules.

Every eligible `AcademicYear + SchoolClass + Subject + civil date` opportunity resolves through the exact date-effective `PpctClassAssociation`. An uncovered eligible opportunity is a `BLOCKER`. A valid mid-range association/version switch is allowed: evaluation splits at retained association boundaries and uses the association actually effective on each date. A retained association to a now-`SUPERSEDED` `PpctVersion` remains valid historical provenance and does not fail by status alone. Dates without an eligible normal opportunity require no PPCT association.

### D6 — “Enough PPCT” / capacity

PPCT capacity is outside `NORMAL_BASE_PPCT_V1`. No implementation may compare recurring timetable rows multiplied by nominal weeks with PPCT item count, or substitute any threshold, heuristic or approximate formula. The dimension is returned as `NOT_ASSESSED`.

Capacity requires architecture re-entry after accepted semantics exist for dated operational opportunities, overlays, special activities and progress. 05B1 must not implement PPCT capacity.

### D7 — Finding severity and overall result

The conceptual finding severities are `BLOCKER`, `WARNING` and `INFO`. The conceptual dimension states are `PASS`, `FAIL` and `NOT_ASSESSED`. Exact DTO enum identifiers may later be finalized only if these meanings are preserved.

Aggregation rules are:

1. Any `BLOCKER` in an assessed required dimension makes that dimension `FAIL`.
2. `WARNING` and `INFO` do not fail a dimension.
3. An unavailable or out-of-profile dimension is `NOT_ASSESSED`.
4. `NOT_ASSESSED` never converts to `PASS`.
5. The `NORMAL_BASE_PPCT_V1` root is `PASS` only when every required in-profile dimension passes.
6. The root is `FAIL` when any required in-profile dimension fails.
7. Out-of-profile `NOT_ASSESSED` dimensions do not turn an otherwise valid profile PASS into FAIL, but must be visible so the profile cannot be mistaken for full operational readiness.

A bare boolean without profile, scope and coverage meaning is insufficient.

### D8 — Timetable lifecycle relation

`NORMAL_BASE_PPCT_V1` is a separate downstream read assessment. It neither alters nor extends `DRAFT → VALIDATED → APPROVED → ACTIVE → SUPERSEDED`, retroactively changes `VALIDATED` or `ACTIVE`, nor blocks validation, approval or activation in the first runtime slice. It needs no cutover migration.

`DRAFT` is not assessable because its target or content remains mutable. Immutable timetable content in `VALIDATED`, `APPROVED`, `ACTIVE` and `SUPERSEDED` may be assessed when the requested range is semantically valid for that exact version. Existing normal-base lifecycle evidence may be consumed as upstream evidence but never rewritten. No downstream gate may be wired in 05B1 without separate authorization.

### D9 — Derived versus persisted form

`NORMAL_BASE_PPCT_V1` is a pure deterministic read model. 05B1 introduces no readiness table, persisted assessment, immutable readiness snapshot, certification, acknowledgment, approval, authoritative cache/materialized projection or readiness command. No readiness mutation endpoint is authorized.

Performance caching or governance certification may be considered only after architecture re-entry; neither may silently become the source of truth.

### D10 — Historical reproducibility / retention

05B1 does not retain prior readiness responses and does not promise byte-for-byte reproduction of an old response after prospective source facts change. Each response nevertheless exposes enough provenance to interpret it: assessment profile, evaluated interval, exact `TimetableVersion`, exact `AcademicCalendarVersion`, distinct exact PPCT associations and versions used, evaluation timestamp, and structured findings with stream/date scope.

Historical source resolution always uses retained exact historical identities, never current heads. A future requirement to retain “what the system said at time T” requires architecture re-entry and may authorize an immutable manifest or snapshot.

### D11 — Authorization

The first profile exposes only school-wide timetable assessment and requires `TIMETABLE_MANAGE / SCHOOL_WIDE`. It introduces no readiness capability. `PPCT_MANAGE` is not additionally required because the authorized timetable assessment causes the server—not the caller—to resolve its exact PPCT dependencies.

This grants no PPCT mutation authority. The first slice provides no subject-bounded endpoint and no certification, acknowledgment or warning-override permission. `SYSTEM_ADMIN`, role/title, group membership, duty and `TeachingAssignment` remain non-authoritative without the explicit required capability grant.

### D12 — Consistency / stale input / idempotency

One response is computed from one internally consistent database snapshot across all required timetable, calendar and PPCT reads. Implementation must use at least `REPEATABLE READ` transaction semantics or a stronger safe equivalent supported by the existing stack; `SERIALIZABLE` is allowed.

Because this is read-only, no idempotency key, command CAS token or stale-command conflict contract is required. Source changes after evaluation begins do not rewrite the in-flight response. A later request may legitimately return a different result. Any future persistence/certification command requires re-entry for CAS, idempotency and stale-input semantics.

### D13 — Downstream consumption contract

The minimum boundary is a structured result. Conceptually it contains the assessment profile, exact scope, root `PASS`/`FAIL` for that profile, assessed dimensions, visible `NOT_ASSESSED` dimensions, structured findings, severity, affected stream/date scope and exact source provenance needed to interpret the findings.

A bare boolean is forbidden as the sole contract. Consumers must not infer readiness from `TimetableVersion.status`, and must not treat a missing assessment, missing dimension or `NOT_ASSESSED` as PASS. There is no certification reference because D9 selects a pure read model.

### D14 — Re-evaluation / drift / invalidation

`NORMAL_BASE_PPCT_V1` is recomputed on every request. There is no persisted readiness state, invalidation job, expiry row, mutable current-readiness flag or background recalculation requirement. Source changes may cause a later request to return different findings; a completed prior response remains an observation of its evaluation snapshot and is not mutated.

Consumers must not cache a previous PASS as timeless authority. Persistent caching, certification or asynchronous invalidation requires architecture re-entry.

## 6. Accepted readiness profile

### Assessed / in-scope required dimensions

1. **Normal-base timetable foundation:** the already-established immutable normal-base timetable evidence applicable to the exact version and requested range. The assessment consumes this evidence without redefining lifecycle states or expanding existing validation semantics.
2. **PPCT association binding:** every eligible normal curricular opportunity in the range resolves to the exact date-effective PPCT class association and version.

Both required dimensions must pass for root `NORMAL_BASE_PPCT_V1` PASS.

### Visible `NOT_ASSESSED` / out-of-scope dimensions

- PPCT capacity / “đủ PPCT”;
- operational overlays;
- substitution, cancellation and make-up semantics;
- unimplemented local operational exceptions;
- special-activity collisions;
- resolved occurrence and teaching execution;
- progress, debt and reporting.

These dimensions remain visible as `NOT_ASSESSED`. Their presence does not fail this bounded profile, but no consumer may treat them as passed.

### PASS meaning

`PASS` means only that all required in-profile dimensions of `NORMAL_BASE_PPCT_V1` passed for the exact declared timetable version and finite civil-date range. It is not school-wide certification beyond that root, not proof of capacity, and not complete/full operational readiness.

## 7. Temporal and association semantics

The requested `[from, to]` interval is inclusive, explicit and finite. Eligibility derives from accepted business-calendar and scheduling semantics, including split academic weeks, reserve weeks and already-supported global interruptions; ISO-week arithmetic is forbidden. The result cannot extend beyond the applicable calendar/timetable domain or a bounded version's `effectiveUntil`.

Association resolution is per eligible normal opportunity date, not per civil date. It uses the exact retained `PpctClassAssociation` in effect for the stream and date. Gaps on eligible dates block the PPCT association dimension. Gaps on dates without an eligible opportunity do not. Valid switches split the evaluation across exact retained boundaries. A now-`SUPERSEDED` PPCT version remains valid when selected by the retained historical association.

No operational overlay, local exception or special-activity behavior absent from the accepted implementation at 05B1 time may be invented to create or suppress opportunities.

## 8. Lifecycle relation

The assessment is read-only and downstream from timetable lifecycle. It does not add a status, transition, release gate or cutover rule. It does not change the meaning of validation, approval, activation or supersession and never writes timetable lifecycle evidence.

`DRAFT` is excluded because it is mutable. `VALIDATED`, `APPROVED`, `ACTIVE` and `SUPERSEDED` are assessable only for a semantically valid explicit range for the exact retained version. Status alone never proves readiness or date effectivity.

## 9. Authorization

The only first-slice authority is explicit `TIMETABLE_MANAGE / SCHOOL_WIDE`. A caller holding only `PPCT_MANAGE` is denied. A caller holding the required timetable grant may receive the assessment without `PPCT_MANAGE`, because PPCT resolution is an internal dependency of the authorized timetable read and grants no PPCT write access.

There is no subject-bounded assessment and no certification, acknowledgment or warning override. ADR-008 exact-scope and default-deny semantics remain fully applicable.

## 10. Consistency / provenance

One evaluation uses one `REPEATABLE READ`-or-stronger consistent database snapshot. Its response records conceptually:

- `NORMAL_BASE_PPCT_V1` profile identity;
- exact inclusive evaluation interval;
- exact `TimetableVersion` and `AcademicCalendarVersion`;
- distinct exact `PpctClassAssociation` identities used;
- distinct exact `PpctVersion` identities used;
- evaluation timestamp;
- structured dimension results and findings with affected stream and date scope.

This provenance supports interpretation, not retained certification or byte-for-byte historical replay. Historical lookup must never substitute a current head for an exact retained identity.

## 11. Downstream structured contract

The conceptual response boundary contains:

- assessment profile and honest product label;
- exact assessment scope: timetable version and inclusive civil-date range;
- root `PASS` or `FAIL` for that profile;
- all required assessed dimensions and their states;
- all visible out-of-profile dimensions as `NOT_ASSESSED`;
- structured findings with `BLOCKER`, `WARNING` or `INFO` severity;
- affected class-subject stream and applicable date/opportunity scope;
- exact timetable, calendar, PPCT association and PPCT version provenance needed to interpret the result;
- evaluation timestamp.

This section intentionally defines no endpoint path, physical schema, exact DTO enum spelling or persistence design. Consumers must fail closed for missing assessment/dimension data and must never infer this result from timetable status.

## 12. Acceptance cases A1–A16

| Case | Expected accepted semantics |
|---|---|
| A1 — DRAFT timetable | Not assessable because target/content remains mutable. |
| A2 — VALIDATED/APPROVED immutable timetable | Assessment is permitted for a valid explicit finite range. |
| A3 — ACTIVE future-effective head | Assessment is permitted only for a valid explicitly requested finite range; there is no implicit “today” or rolling-horizon behavior. |
| A4 — SUPERSEDED timetable historical range | The exact retained version may be assessed for its retained effective historical interval. |
| A5 — Association exists for every eligible opportunity | The PPCT association dimension may `PASS`, subject to all other required checks in that dimension. |
| A6 — One eligible opportunity lacks an association | Emit a `BLOCKER`; the required PPCT association dimension is `FAIL`, making the profile root `FAIL`. |
| A7 — Association changes mid-range with complete eligible coverage | Valid. Resolve every eligible date against its exact effective association and preserve both provenances. |
| A8 — Historical association points to a SUPERSEDED PPCT version | Valid retained historical reference; status alone is not a defect and the current head is not substituted. |
| A9 — Civil dates with no normal timetable opportunity | No PPCT association is required on those dates. |
| A10 — Split academic week / reserve week | Use accepted business-calendar segments and reserve-week semantics; never use ISO-week arithmetic. |
| A11 — Accepted global interruption suppresses normal teaching | The suppressed occurrence is not an eligible normal opportunity and needs no PPCT binding. |
| A12 — Unimplemented overlay, local exception or special-activity collision | Return the affected dimension visibly as `NOT_ASSESSED`, never `PASS`. |
| A13 — Apparent PPCT item shortage | Make no capacity conclusion; PPCT capacity remains `NOT_ASSESSED`. |
| A14 — Association changes after an assessment completes | The old response is not mutated; the next request recomputes using its own internally consistent snapshot. |
| A15 — Caller has PPCT_MANAGE but lacks TIMETABLE_MANAGE / SCHOOL_WIDE | Deny the first readiness boundary. |
| A16 — Caller has TIMETABLE_MANAGE / SCHOOL_WIDE but lacks PPCT_MANAGE | The readiness read may proceed; this grants no PPCT mutation authority. |

## 13. Re-entry triggers

Architecture must re-enter before any of the following becomes required or true:

- a normal timetable lesson type is legitimately exempt from PPCT;
- readiness is renamed or expanded to claim complete/full operational readiness;
- PPCT capacity or another “đủ PPCT” criterion is required;
- readiness blocks timetable lifecycle or another downstream operation;
- readiness becomes persisted, cached as authority, certified, acknowledged or approved;
- a subject/class-bounded assessment or new readiness capability is required;
- formal retention or byte-for-byte reproduction of prior responses is required;
- operational overlays, local exceptions or special activities become assessed dimensions;
- resolved occurrence, execution, progress, debt or reporting becomes part of the profile;
- PPCT master, stream, item/occurrence cardinality, association or historical-resolution invariants change;
- persistent caching, asynchronous invalidation, CAS, command idempotency or stale certification semantics are required;
- authorization requirements become incompatible with ADR-008 exact-scope semantics;
- accepted calendar or scheduling rules change opportunity determination.

## 14. Implementation entry criteria

The next runtime slice is **READY** because this closure now fixes:

1. the honest profile label, assessed coverage and bounded PASS meaning;
2. the exact version-plus-interval root and traceable stream aggregation;
3. an explicit finite civil-date horizon;
4. universal PPCT applicability for normal curricular entries in this profile;
5. eligible-opportunity-only exact association coverage and switch handling;
6. explicit exclusion of PPCT capacity;
7. finding severity, dimension state and root aggregation;
8. a separate non-blocking downstream lifecycle relation;
9. a pure deterministic read form with no persistence/certification;
10. provenance and deliberately limited historical reproducibility;
11. `TIMETABLE_MANAGE / SCHOOL_WIDE` authorization;
12. a `REPEATABLE READ`-or-stronger consistency boundary without command semantics;
13. a structured downstream result contract; and
14. recomputation and drift behavior without persisted invalidation.

All R1–R14 are closed exactly once, D1–D14 are preserved without semantic alteration, and A1–A16 define regression-ready behavior. Runtime implementation still requires its own authorized task and branch.

## 15. Next slice boundary

Recommended next slice: **LOCAL-FC-05B1 — Deterministic Timetable Readiness Read Model**.

05B1 may implement only:

- contracts/DTOs that preserve the accepted conceptual semantics;
- a pure deterministic service/read model;
- read-only endpoint(s), without preselecting exact paths in this closure;
- `TIMETABLE_MANAGE / SCHOOL_WIDE` authorization;
- `REPEATABLE READ`-or-stronger consistent-snapshot evaluation;
- eligible-opportunity PPCT association coverage with exact historical resolution;
- structured dimensions, findings, severity, scope and provenance;
- focused unit/integration/security regression tests.

05B1 must not implement:

- readiness persistence, stored snapshots or an authoritative cache/materialized projection;
- certification, acknowledgment, approval or a readiness mutation command;
- a new readiness capability;
- PPCT capacity or any approximate “đủ PPCT” formula;
- operational overlays or local operational exception semantics;
- special-activity semantics or collision evaluation;
- resolved occurrence, execution, progress, debt or reporting;
- a lifecycle gate or changed meaning for `VALIDATED`/`ACTIVE`;
- UI;
- implementation outside a separately authorized 05B1 task.
