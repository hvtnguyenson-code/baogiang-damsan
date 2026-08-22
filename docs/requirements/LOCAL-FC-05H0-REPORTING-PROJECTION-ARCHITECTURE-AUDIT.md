# LOCAL-FC-05H0 — Reporting Projection Architecture Audit

## 1. Status, scope and authority

**Status:** documentation-only architecture/requirements audit. No implementation is authorized. The scope is live/draft reporting projection after planning facts, operational facts, execution evidence and `TEACHING_PROGRESS_DEBT_V1`; it excludes schema, migration, Prisma, API/contracts, capability/seed, report/statement persistence, submission/approval, UI, deployment and production mutation.

**CONFIRMED** means direct specification, Accepted ADR or CLOSED / GREEN contract. **INFERRED** is the narrowest compatible candidate, not an approval. **UNRESOLVED** has no uniquely safe source-backed answer. The layering is planning -> operational -> execution evidence -> progress/debt/late -> reporting projection -> submitted/approved immutable statement. Reporting must not update PPCT, timetable, overlay, `TeachingExecution` or mutable progress/debt state, become upstream truth, or silently create a statement.

## 2. Current delivery position

`LOCAL-FC-05G1 — Deterministic Progress / Debt / Late Projection` is **CLOSED / GREEN**: PR #59, final head `352842d5dcc9615c26b3549fd512f23b8e247632`, PR CI #230 SUCCESS, merge/canonical main `cade4896ff7e25cdb9221e204bd714105d4bd52a`, post-merge main CI #231 SUCCESS. 05H0 is the next architecture audit; reporting implementation, public API, persistence, capability and statement workflow do not yet exist.

## 3. Source inventory and authority

| Source | Authority used |
|---|---|
| v1.3 implementation addendum | Highest project specification/delivery constraints; it does not close reporting periods or capability semantics. |
| 05A0, 05A0D, ADR-027 | PPCT/history, derived-report and immutable-statement boundaries, deferred reporting/approval authority. |
| ADR-031 / ADR-034 | Operational suppression/disposition/make-up provenance; separate Special Activity and frozen-target cardinality. |
| ADR-037 | Exact direct distribution-obligation replay, ordering, provenance and allocation blockers. |
| ADR-038 / ADR-039 | Separate original/actual bundles, responsible/actual teacher, activity participation and immutable execution provenance. |
| ADR-040, 05G0, 05G0D, 05G1 | `TEACHING_PROGRESS_DEBT_V1`, five counts/classifications, one snapshot, recomputation and fail-closed reconciliation. |
| `progress-debt`, `teaching-executions`, `ppct-occurrence-allocation`, `resolved-occurrences`, relevant unit/integration tests | CLOSED+GREEN implementation evidence only; no reporting policy inferred from code. |
| Roadmap and project context | Current delivery position only. |

## 4. Confirmed reporting requirements

- Reporting is downstream and source-derived. Live/draft content must remain reproducible from retained authoritative facts; submitted/approved statement content is a separate immutable downstream boundary and cannot silently drift.
- Exact retained calendar, timetable, assignment, PPCT association/version/item/revision, operational and execution provenance are required. Current heads, max sequence, creation time and client snapshots are invalid substitutes.
- Only exact direct distribution obligations supply curricular progress. `distributedElapsedCount`, `completedCount`, `openDebtCount`, `lateCount` and `unconfirmedGapCount` retain 05G1 meaning; a gap is never debt.
- `MAKEUP` fulfills one original obligation once, consumes no new item and retains distinct original/actual coordinates. Same-subject substitution may change actual teacher; different-subject supervision never completes the original subject.
- Special Activity participation is separate, has no curricular PPCT/progress/debt/late effect, and is never multiplied by class-target fan-out.
- When an applicable upstream result is `BLOCKED`, required provenance is missing/ambiguous, fulfillment is ambiguous/corrupt, or accepted evidence cannot reconcile to current-authoritative replay, the affected result must never silently rebind, omit, credit or repair the evidence. Report-level propagation is unresolved.

## 5. Current upstream contracts

The available curricular unit is one 05G1 item for `AcademicYear + SchoolClass + Subject` at explicit `asOfInstant`: original occurrence, exact PPCT association/plan/version/item/revision, timetable/calendar/slot/assignment, responsible teacher, disposition, fulfillment/make-up and actual execution/teacher. `PASS` has deterministic counts; `BLOCKED` has no trustworthy totals. Allocation orders direct obligations by source civil date, retained slot start/end and occurrence key. Execution permits only `NORMAL` or `MAKEUP`; make-up has an independent target coordinate. These contracts preserve provenance but do not choose reporting root, period, aggregation, authorization, persistence or public API.

## 6. Decision matrix R1-R25

| ID | Result | Finding |
|---|---|---|
| R1 | **UNRESOLVED** | Source root is class-subject stream; no authority chooses teacher/school/class/subject/range report root. |
| R2 | **UNRESOLVED** | Business week, civil month, academic semester, inclusive custom range and year must stay distinct. `AcademicWeekSegment` is not an academic semester, and no authoritative semester owner/model/range is selected. |
| R3 | **INFERRED** | Use inclusive civil dates, non-future explicit `asOfInstant`, retained slot-end and `Asia/Ho_Chi_Minh`; report cutoff policy is unclosed. |
| R4 | **CONFIRMED** | Reporting is downstream/source-derived; live/draft content is reproducible from authoritative facts and cannot become upstream truth. Immutable statement is downstream; persistence/cache/materialization remains R24. |
| R5 | **CONFIRMED** | Reporting detail must remain traceable to the exact retained original/actual provenance needed for reproducibility. This does not prescribe a physical report row, DTO or duplicated-field schema. |
| R6 | **CONFIRMED** | Original and actual temporal coordinates are distinct; MAKEUP creates no second obligation. |
| R7 | **UNRESOLVED** | No source selects source-period, execution-period or dual cross-period presentation. |
| R8 | **UNRESOLVED** | Responsible/actual facts are confirmed; personal and manager attribution is not. |
| R9 | **CONFIRMED** | Preserve `COMPLETED`, `PROVEN_OPEN_DEBT`, `UNCONFIRMED_COMPLETION_GAP` and accepted V1 late meanings; missing execution is not debt and a gap is never relabeled debt. Period-total attribution is unresolved. |
| R10 | **UNRESOLVED** | Current-authoritative `asOfInstant` exists; historical cutoff/current-state report totals are not selected. |
| R11 | **UNRESOLVED** | Fail-closed blockers are confirmed; whole-report/stream/blocked-section and partial-total policy is not. |
| R12 | **UNRESOLVED** | Activity is non-curricular/no fan-out; its reporting row family and totals are unclosed. |
| R13 | **UNRESOLVED** | When upstream emits no direct obligation, interruption/exception/authorized cancellation/activity suppression creates no curricular distribution/completion/debt. Its report representation is unclosed. |
| R14 | **UNRESOLVED** | Different-subject supervision never completes the original subject; when upstream proves debt, that debt meaning remains. Reporting representation and teacher attribution are unclosed. |
| R15 | **INFERRED** | Canonical detail should be the exclusive aggregate source; groupings are unclosed. |
| R16 | **INFERRED** | Keep source-date/slot/occurrence ordering and retained activity date/slot/staffing ordering; cross-family key is unclosed. |
| R17 | **CONFIRMED** | Exact retained historical versions/provenance are mandatory; current-head shortcuts are prohibited. |
| R18 | **CONFIRMED** | Before statement freeze correction recomputes live results without source mutation. |
| R19 | **CONFIRMED** | Reporting projection and immutable statement remain separate. |
| R20 | **UNRESOLVED** | No Accepted reporting-read capability/scope matrix exists. Submission and approval authorization belong to the separate immutable-statement boundary and are outside 05H0/05H0D. |
| R21 | **INFERRED** | Internal projection first, public API/control plane only after separate closure. |
| R22 | **UNRESOLVED** | Upstream BLOCKED/mismatch/ambiguity/missing provenance must never silently become trustworthy results; whole-report/root/section/partial-result propagation is not selected. |
| R23 | **INFERRED** | Upstream root contracts are confirmed coherent snapshots. A bounded multi-root report under one outer `RepeatableRead`-or-stronger transaction with tx-aware reuse is a future candidate, not Accepted reporting authority. |
| R24 | **INFERRED** | V1 pure projection; cache/materialization/persisted draft requires evidence-backed decision. |
| R25 | **UNRESOLVED** | Bounded range/reproducibility are necessary but max scope, pagination and performance policy are absent. |

## 7. Reporting projection candidate boundary

**INFERRED only:** evaluate a bounded selected set of class-subject roots using a report-level snapshot topology to be closed; create canonical curricular detail from trustworthy upstream items; and derive aggregates only through the later-approved canonical-detail rule. A product-owned activity family, if later approved, is independent and cannot alter curricular totals. It owns no source fact, counter, execution truth, report draft or statement.

## 8. Temporal / period semantics

**CONFIRMED:** civil dates, retained calendar versions, business `AcademicWeek`, retained slot boundaries and `Asia/Ho_Chi_Minh` govern domain time; ISO week, host-local and date-only shortcuts are prohibited. `AcademicWeekSegment` and split-week evidence MUST NOT be treated as an academic semester. **UNRESOLVED:** weekly definition, authoritative semester owner/model/range, custom-range validation/inclusivity, annual period policy, and source-versus-actual coordinate filtering. 05H0D must accept an authoritative semester source/model or defer/declare semester reporting unsupported. No period-to-row formula is authorized.

## 9. Curricular row semantics

Reporting detail must remain traceable to the retained AcademicYear, SchoolClass, Subject, original normal occurrence, PPCT association/plan/version/item/revision, original timetable/date/calendar/slot/assignment, responsible teacher, disposition, fulfillment/make-up and actual execution/teacher provenance where present. A canonical detail row may reference these upstream identities; this audit does not prescribe a physical reporting DTO/schema or require all fields to be duplicated into one row. Bounded labels are display metadata, never identity substitutes.

## 10. Make-up and cross-period semantics

NORMAL has equal source/actual coordinates. MAKEUP retains both, distributes the original once and closes it once without a new September distribution. August-versus-September display/totals are **UNRESOLVED**: closure must choose source, execution or dual attribution and a non-double-counting rule.

## 11. Responsible versus actual teacher

Responsible teacher is historical assignment/base evidence. Actual teacher is responsible teacher for BASE, exact assigned teacher for substitution, and retained scheduled/actual teacher for MAKEUP. Assignment ownership never transfers. Personal, substitute, manager and school aggregation semantics are **UNRESOLVED**.

## 12. Special Activity reporting boundary

Activity participation is exact activity + staffing + slot, never multiplied by class targets, and never contributes curricular PPCT distribution/completion/debt/late. Whether Báo giảng shows an independent activity row family, reader scopes or activity totals is **UNRESOLVED**.

## 13. Progress/debt aggregation boundary

Only `PASS` items may contribute trustworthy curricular totals. A `BLOCKED` root must be surfaced according to the unresolved report failure policy and must never be silently dropped from report evaluation. The three classifications are exclusive for elapsed direct obligations; V1 `lateCount == openDebtCount`. Suppressed/cancelled opportunities and merge coverage create no direct item. Scheduled make-up does not close debt; ACTIVE MAKEUP closes exact original debt and reversal may reopen it. Period-total attribution remains **UNRESOLVED**.

## 14. Source drift / reconciliation / failure model

A REVERSED execution loses current completion credit and may change live debt/gap recomputation; it is not inherently `BLOCKED`. Overlay reversal/replacement may change the current-authoritative classification; it is not inherently `BLOCKED`. PPCT, timetable and calendar version evolution is normal when exact retained/date-effective provenance still resolves and reconciles; it is not inherently `BLOCKED`. Block only when the applicable upstream resolver/projection returns `BLOCKED`, required provenance is missing/ambiguous, fulfillment topology is ambiguous/corrupt, or accepted evidence cannot reconcile to current-authoritative replay. Such evidence must never be silently omitted, rebound, credited, repaired or converted into trustworthy totals. Whether to fail the whole report, affected root, show a blocked section, or permit any partial result/totals is **UNRESOLVED**.

## 15. Transaction and reproducibility boundary

**CONFIRMED upstream:** `TEACHING_PROGRESS_DEBT_V1` evaluates one class-subject root under its accepted coherent `RepeatableRead`-or-stronger snapshot semantics. **INFERRED reporting candidate:** a future bounded multi-root report should use one outer `RepeatableRead`-or-stronger transaction and reuse tx-aware allocation/resolution/progress boundaries rather than nested per-date/per-stream snapshots. This report-level topology is not yet Accepted authority. Any materialized optimization still requires complete replay and exact reconciliation.

## 16. Reporting versus immutable statement boundary

Live/draft is current-authoritative and can change after correction. Submitted/approved statement must not silently change. Physical snapshot/manifest/hash, lifecycle, approval/delegation, no-self-approval implementation, correction after submission, locks and versioning are deferred.

## 17. Scenario consistency matrix

| Scenario | Required consistency |
|---|---|
| A BASE completed | One completed obligation; source equals actual coordinate. |
| B BASE elapsed/no execution | `UNCONFIRMED_COMPLETION_GAP`, never debt. |
| C same-subject substitute completed | Completed; preserve responsible and actual substitute. |
| D absence/no replacement | Proven open debt/late while unfulfilled. |
| E different-subject supervision | Original subject debt; supervision is not completion. |
| F August obligation/September makeup | One obligation only; attribution unresolved. |
| G makeup scheduled/unexecuted | Debt remains open. |
| H active makeup executed | Original completed once; no new distribution. |
| I makeup reversed | Recompute; debt can reopen. |
| J authorized cancellation | No distribution/completion/debt. |
| K activity suppresses normal | No curricular PPCT/debt effect. |
| L one activity teacher | Independent participation, no curricular totals. |
| M activity targets many classes | No fan-out multiplication. |
| N responsible A/substitute B | Preserve both; attribution unresolved. |
| O PPCT switch | Exact date-effective association/version/revision. |
| P timetable switch | Exact retained timetable/entry. |
| Q calendar change | Exact retained calendar/week; ambiguity blocks. |
| R replay mismatch | `RECONCILIATION_REQUIRED / BLOCKED`; no rebind. |
| S later correction | Live report may change; source history does not. |
| T statement exists | Live may differ; statement remains unchanged. |

## 18. CONFIRMED decisions

R4, R5, R6, R9, R17, R18 and R19 preserve downstream/source-derived reporting, provenance traceability, two-coordinate make-up, unchanged progress semantics, historical exactness, current recomputation and the statement boundary.

## 19. INFERRED candidates

R3, R15, R16, R21, R23 and R24 are candidates only: bounded as-of evaluation, canonical-detail-to-aggregate rule, deterministic ordering, internal-first decomposition, multi-root transaction topology and persistence/materialization strategy.

## 20. UNRESOLVED questions requiring product-owner closure

05H0D must close material **UNRESOLVED product semantics** and material **INFERRED architecture candidates** that 05H1 depends on:

1. Report root/scope and personal/class-subject/subject/school combinations.
2. Weekly, monthly, custom-range and annual period definitions; authoritative semester source/model/range, or explicit unsupported/deferred semester reporting.
3. Cross-period MAKEUP attribution and non-double-counting totals.
4. Responsible-versus-actual teacher attribution.
5. Historical as-of/current-state policy.
6. Suppression, cancellation and different-subject-supervision representation.
7. Special Activity inclusion, row family and aggregates.
8. Report blocker/partial-result/partial-total propagation policy.
9. Reporting-read authorization/scope. Submission authorization, approval authorization, separation of duty, no-self-approval, delegation, immutable freeze and correction after submission remain deferred to the later immutable-statement/submission/approval slice.
10. Canonical detail -> aggregate rule and deterministic ordering.
11. Internal projection versus public API decomposition.
12. Multi-root transaction/snapshot topology.
13. Persistence/cache/materialization strategy.
14. Bounded scope, pagination and performance policy.

No 05H1 implementation is authorized until these decisions are Accepted or explicitly deferred in a way that leaves 05H1 implementable. Recommend `LOCAL-FC-05H0D — Reporting Projection Decision Closure`; stop before implementation and do not create ADR-041.

## 21. Proposed next slice decomposition

1. **05H0D:** close the unresolved product semantics and inferred architecture candidates listed in section 20.
2. **05H1:** only after 05H0D accepts or explicitly defers all implementation-dependent decisions; separately authorized internal canonical detail/aggregate projection, with no route/capability/persistence unless then authorized.
3. **05H2:** separately authorized public reporting API/control plane with accepted scope, pagination and audit policy.
4. **Later statement slice:** independently close immutable snapshot/manifest, submission, approval, separation of duty, correction and freeze.

## 22. Explicit non-scope

No production source, schema, Prisma model, migration, controller/API, contract, capability/seed, report persistence, statement persistence, submission/approval workflow, UI, deployment or production mutation. No ADR-041.

## 23. Conclusion

Upstream evidence is sufficient for provenance-safe reporting but does not select the material product semantics or implementation-dependent architecture candidates that make a report authoritative. Preserve uncertainty, perform 05H0D, and stop before implementation.