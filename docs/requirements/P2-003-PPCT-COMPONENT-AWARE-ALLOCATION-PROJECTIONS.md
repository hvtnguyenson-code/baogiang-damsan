# P2-003 — PPCT Component-Aware Allocation & Curricular Projections

## 1. Task identity

- Task: `P2-003`
- Name: **Component-aware PPCT allocation and curricular projections**
- Traceability: `T45`, `T46`
- Dependency: `P2-002` — `CLOSED`
- Canonical starting main: `b9b25983b33c3b322905a713df8f4e44dea4a919`
- Dedicated branch: `feat/ppct-component-aware-allocation-projections-003`
- Authority: accepted `ADR-048-PPCT-CURRICULAR-COMPONENT-ARCHITECTURE.md`, `P2-001-PPCT-CURRICULAR-COMPONENT-ARCHITECTURE-AUDIT.md`, `P2-001D-PPCT-CURRICULAR-COMPONENT-DECISION-CLOSURE.md`, and closed `P2-002-PPCT-COMPONENT-PERSISTENCE-CONTROL-PLANE.md`.

This task implements already-accepted P2-003 runtime semantics. It creates no new Product Owner business authority.

## 2. Current gap on starting main

Starting main already has component-aware PPCT persistence/control-plane from P2-002, but downstream runtime remains legacy/single-stream in key places:

- `PPCT_OCCURRENCE_ALLOCATION_V1` uses one shared in-memory coverage set and selects the next revision from the whole version rather than independently by component.
- `TEACHING_PROGRESS_DEBT_V1` consumes the legacy allocator output.
- timetable readiness still evaluates only `NORMAL_BASE_PPCT_V1`.
- ordinary reporting is already class-subject aggregated and must remain combined across curricular components, while consuming component-aware upstream provenance.

P2-003 closes this runtime gap without adding component columns to execution, makeup, timetable or teaching-assignment persistence.

## 3. Required runtime profiles

P2-003 must implement the accepted component-aware profiles:

- `PPCT_OCCURRENCE_ALLOCATION_V2`
- `TEACHING_PROGRESS_DEBT_V2`
- `NORMAL_BASE_PPCT_COMPONENT_V2`

`NORMAL_BASE_PPCT_V1` must remain available for historical/compatibility flows; its meaning must not be silently changed under the V1 label.

Do not invent `TEACHING_REPORTING_PROJECTION_V2` merely to rename the reporting layer. Reporting remains an ordinary class-subject aggregate unless an existing authoritative contract independently requires a profile-version change.

## 4. Weekly routing authority

### 4.1 Exact routing partition

Component routing is partitioned by the exact retained key:

`AcademicYear + SchoolClass + Subject + AcademicCalendarVersion + AcademicWeek.id`

Never use ISO week number, local server week, display label, `officialWeekNumber`, fixed seven-day arithmetic, or another inferred week identity.

A normal timetable opportunity belongs to a routing/capacity set if and only if its `civilDate` belongs to exactly one retained `AcademicWeekSegment` of the exact `AcademicCalendarVersion` resolved for that occurrence.

For a week with multiple non-contiguous segments, routing membership is the **union** of all those segment date ranges. Internal `CalendarInterruption` gaps outside all segments are not routing members, do not consume PPCT, do not create debt, and do not participate in selecting the week's last opportunity.

### 4.2 Deterministic ordering

Within one routing partition, sort opportunities by:

1. `civilDate` ascending;
2. `TimeSlotDefinition.startTime` ascending;
3. `TimeSlotDefinition.endTime` ascending;
4. `NORMAL:<timetableEntryId>:<civilDate>` ascending as stable tie-breaker.

Impossible consuming overlaps remain structural blockers; a tie-breaker must not hide an overlap error.

### 4.3 Planning component assignment

For `CORE_ONLY`:

- every routing member is planned as `CORE`.

For `CORE_PLUS_SPECIALIZED_STUDY`:

- the chronologically last routing member of the exact business week is planned as `SPECIALIZED_STUDY`;
- all earlier routing members are planned as `CORE`.

The planned component is established **before** operational outcome/suppression is applied and must remain observable on the derived allocation row even when the opportunity ultimately consumes no PPCT item.

Operational events such as `CalendarException`, `SPECIAL_ACTIVITY_SUPPRESSED`, `AUTHORIZED_CANCELLATION`, absence, substitution or supervision must never dynamically promote an earlier CORE opportunity into SPECIALIZED_STUDY or otherwise reclassify the planned component.

## 5. Week invariants and fail-closed errors

### 5.1 Zero opportunity

A week with zero routing members:

- creates no route,
- allocates nothing,
- consumes nothing,
- creates no synthetic opportunity,
- creates no debt merely because the week elapsed.

### 5.2 One opportunity with specialized profile

If a week has exactly one routing member and the effective profile is `CORE_PLUS_SPECIALIZED_STUDY`, fail closed with:

`PPCT_COMPONENT_WEEK_CAPACITY_INVALID`

Do not fall back to CORE and do not force the opportunity to SPECIALIZED_STUDY.

### 5.3 Profile consistency on replay

P2-002 prevents new mid-week profile changes, but P2-003 replay/readiness must independently verify retained history.

If one protected business-week envelope contains different `curricularProfile` values for the same class-subject stream, fail closed with:

`PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`

A PPCT version cutover inside a week is legal when the effective profile remains the same.

### 5.4 Timetable/calendar cutover consistency

Opportunities from different retained `TimetableVersion` records may participate in the same business-week routing set only when they resolve to the **same exact `AcademicCalendarVersion` and same exact `AcademicWeek.id`**.

If a mid-week timetable cutover fragments what would otherwise be the same protected business-week envelope across different calendar/week identities, fail closed with:

`PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`

Do not infer that weeks in different calendar versions are equivalent.

Where practical, reuse/extract the same retained-week/segment-envelope semantics already established by P2-002 rather than implementing a second drifting calendar/week rule.

## 6. Independent component progression

Runtime replay must maintain coverage independently for:

- `CORE`
- `SPECIALIZED_STUDY`

Each consuming opportunity resolves the smallest not-yet-distributed `sequence` within its **planned component** only.

A CORE shortage or non-consumption must not advance SPECIALIZED_STUDY. A SPECIALIZED_STUDY shortage or non-consumption must not advance CORE.

`DISTRIBUTION_COVERED_ITEMS` and direct distribution obligations must be component-aware in memory. Stable UUID carry-forward remains naturally within its immutable component. SPLIT/MERGE lineage is processed only within the lineage component already enforced by P2-002 database constraints.

When an opportunity routes to an exhausted component, block with the existing code:

`PPCT_ALLOCATION_EXHAUSTED`

The finding/output must include exact component context. Do not borrow from the other component, wrap to sequence 1, reuse completed items, reclassify the opportunity, or fabricate free-text content.

## 7. Derived provenance contract

Derived allocation/progress outputs must carry enough component context to make replay and diagnostics exact. At minimum, the accepted expected/direct PPCT item projection must identify its `component` together with existing PPCT item/revision/version/plan coordinates.

The planned component must be available on a normal allocation even when `expectedPpctItem` is null because the planned opportunity did not consume.

Component is **derived provenance**, not new persisted provenance on downstream tables.

Do not add `component` to:

- `CurricularTeachingExecution`
- `MakeupTeachingSchedule`
- `TimetableEntry`
- `TeachingAssignment`

Execution and makeup continue to pin exact PPCT revision/item/version/plan provenance. Component is recoverable from that retained PPCT provenance.

## 8. Version transition and lineage replay

Retain the existing deterministic lineage rules for version transitions, but make all coverage and pending-item operations component-aware.

Requirements:

- same UUID carry-forward creates no lineage edge;
- SPLIT/MERGE credit/coverage propagation never crosses component boundaries;
- a version transition may update both components in one atomic shared `PpctVersion` package;
- history replay remains forward-only and fail-closed on malformed/ambiguous lineage;
- component-specific coverage must not be reset merely because the other component changes version content.

## 9. Progress/debt V2

Implement `TEACHING_PROGRESS_DEBT_V2` on top of exact V2 direct distribution obligations.

Preserve existing proof-based debt semantics:

- only direct distributed obligations can enter progress/debt evaluation;
- absence of execution alone is not proof of debt;
- ACTIVE exact normal/makeup fulfillment rules remain unchanged;
- MAKEUP fulfills the exact original obligation once and consumes no new PPCT item;
- operational disposition proof remains authoritative for proven open debt.

P2-003 additions:

- every progress/debt item must retain/derive its curricular component;
- CORE_ONLY produces no SPECIALIZED_STUDY obligation/debt;
- CORE and SPECIALIZED_STUDY progress independently;
- aggregate counts may remain combined class-subject totals, but must be the sum of exact component-aware items and must not lose component provenance.

## 10. Ordinary reporting

Ordinary subject reporting continues to combine CORE + SPECIALIZED_STUDY under the same class-subject root.

The reporting layer must consume V2 progress/debt results without double counting, dropping, or splitting the ordinary subject into separate Subjects.

If component is exposed on reporting details, it is derived detail provenance. Total reporting counts remain combined unless an already-authoritative contract says otherwise.

Do not add component to `TeachingAssignment`, do not create a specialized Subject, and do not route SPECIALIZED_STUDY through `SpecialActivity`.

## 11. Component-aware readiness V2

Implement `NORMAL_BASE_PPCT_COMPONENT_V2` additively. `NORMAL_BASE_PPCT_V1` remains a compatibility profile with unchanged semantics.

V2 must assess, for the requested retained timetable/range:

- exact `AcademicWeekSegment` ownership;
- valid effective PPCT association and `curricularProfile`;
- profile consistency across the protected business-week envelope (`PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`);
- exact calendar/week consistency across timetable cutovers (`PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`);
- specialized-content availability when profile is `CORE_PLUS_SPECIALIZED_STUDY`;
- weekly capacity: specialized-enabled week with routing members must have at least two routing members (`PPCT_COMPONENT_WEEK_CAPACITY_INVALID`);
- allocation/exhaustion risk across the evaluated range using the component-aware allocator/replay semantics.

The mechanism used to expose/select V1 versus V2 must be additive and explicit; do not silently change the semantics behind the V1 profile string. Minimize API contract drift and document the selected compatibility behavior in this task file before review.

## 12. Transaction and determinism requirements

- Allocation replay remains read-only and uses one caller-owned or outer `RepeatableRead`-or-stronger snapshot.
- `resolveInTransaction` must continue to open no nested transaction.
- Teaching execution confirmation remains inside its existing outer `SERIALIZABLE` + CAS boundary and composes tx-aware allocation.
- Do not introduce per-day nested transactions or mutable allocation cursors/caches/snapshots.
- Result ordering and finding ordering must be deterministic.

## 13. Allowed scope

Expected implementation surfaces include only what is necessary under:

- `apps/api/src/ppct-occurrence-allocation/**`
- `apps/api/test/ppct-occurrence-allocation/**`
- `apps/api/src/progress-debt/**`
- `apps/api/test/progress-debt/**`
- `apps/api/src/timetables/timetable-readiness*`
- corresponding timetable readiness tests
- `apps/api/src/reporting-projection/**` and tests only as required for combined component-aware upstream results
- `apps/api/src/teaching-executions/**` and tests only as required to consume derived component-aware allocation without persistence changes
- `packages/contracts/src/index.ts` only for additive/readiness contract changes
- P2-003 task/governance documentation.

Minimal shared helper extraction is allowed when it prevents duplicate retained-calendar/week semantics.

## 14. Forbidden scope

P2-003 must not implement:

- P2-004 administration UI;
- P2-010/P2-020 workbook audit/importer;
- new Prisma models or migrations;
- component fields on execution/makeup/timetable/teaching-assignment tables;
- authentication/authorization redesign;
- SpecialActivity/GDĐP/HĐTN programme work;
- deployment/VPS/Nginx/TLS changes;
- mutable materialized allocation/progress cursors;
- guessed workbook semantics.

## 15. Required regression scenarios

Tests must cover at least:

1. CORE_ONLY week: all routing members CORE.
2. Specialized-enabled normal week: last exact weekly opportunity SPECIALIZED_STUDY, earlier opportunities CORE.
3. Non-contiguous segments: union routing; gap date excluded; last member across the union specialized.
4. Operational suppression of the planned specialized opportunity: remains planned specialized, consumes zero; no promotion of previous CORE.
5. Specialized-enabled week with one routing member: `PPCT_COMPONENT_WEEK_CAPACITY_INVALID`.
6. Retained mid-week profile split: `PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`.
7. Same-profile mid-week PPCT version change: legal.
8. Same exact calendar/week across timetable-version cutover: legal.
9. Calendar/week identity split across mid-week timetable cutover: `PPCT_COMPONENT_WEEK_CALENDAR_SPLIT`.
10. Independent CORE/SPECIALIZED progression across multiple weeks.
11. Exhausted CORE blocks with `PPCT_ALLOCATION_EXHAUSTED` + CORE context without consuming specialized.
12. Exhausted SPECIALIZED_STUDY blocks with the same code + specialized context without borrowing CORE.
13. Version carry-forward and SPLIT/MERGE replay remain component-local.
14. Makeup exact-source matching remains valid and component is derived from PPCT provenance, not persisted downstream.
15. CORE_ONLY produces no specialized debt.
16. Progress/debt V2 preserves proof-based completed/debt/gap semantics per component and combined totals.
17. Reporting totals combine both components exactly once.
18. `NORMAL_BASE_PPCT_V1` remains compatible/unchanged.
19. `NORMAL_BASE_PPCT_COMPONENT_V2` validates capacity/profile/calendar/exhaustion semantics.
20. Legacy CORE/CORE_ONLY data from P2-002 continues to replay equivalently to the former single-stream behavior where the business semantics are unchanged.

## 16. Required gates before commit authorization

At minimum run and report:

- `git diff --check`
- Prisma validate/generate even though no schema change is expected
- targeted allocator unit tests
- targeted allocator integration tests
- targeted progress/debt tests
- targeted timetable-readiness tests
- targeted teaching-execution/reporting tests affected by contract changes
- full API unit suite
- full API integration suite
- lint for touched workspaces
- typecheck for all four workspaces
- build for all four workspaces
- existing schema/static/security/deployment gates relevant to CI
- Playwright smoke if the canonical CI contract requires it.

No test may be weakened merely to make P2-003 pass.

## 17. Governance sync before review

Before the implementation is declared `IN_REVIEW`, synchronize at least:

- `docs/governance/PRE-PILOT-TASK-REGISTER.md`
- `docs/governance/CURRENT-PROJECT-STATUS.md`
- `docs/architecture/CORE-BACKEND-ROADMAP.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`
- this task document.

Expected in-review state after implementation/tests, before merge:

- `P2-003` = `IN_REVIEW`
- `P2-004` remains `PLANNED`
- `P1-031` remains dependency-gated until P2-003 is actually CLOSED
- `P2-010` remains `BLOCKED_EVIDENCE`
- `P2-020` remains `PLANNED` pending P2-010

Closure to `CLOSED` occurs only after independent review, exact-head PR CI, merge, authoritative post-merge main CI and non-recursive documentation sync.

## 18. Implementation and validation evidence (IN_REVIEW)

- Task status: `IN_REVIEW`
- Candidate implementation HEAD before governance sync: `dd3463b8108a712a85d42fd56f04b6460126bef2`
- Dedicated branch: `feat/ppct-component-aware-allocation-projections-003`

### 18.1 Candidate commit chain

1. `d34fec72643036542932cf8653d5beeeba86db1b` — `docs(ppct): define P2-003 implementation contract`
2. `08b2ac4ace2676909dcfc637285e9176780e779a` — `feat(ppct): add component-aware allocator v2`
3. `0d5de34a5fb983a3e087281afd1984af84fcbde7` — `feat(ppct): add component-aware progress debt v2`
4. `bc33830f690678b4c0089c7f781c80bfe37a98db` — `fix(ppct): use component-aware allocator for teaching execution`
5. `7d3bc73f8c1e6c259caf2eef2a51362a860d9c9d` — `feat(ppct): add component-aware readiness v2`
6. `84d640b31efe6b33db1218a24ba6ddc24c163d5c` — `feat(ppct): project component-aware reporting`
7. `dd3463b8108a712a85d42fd56f04b6460126bef2` — `test(ppct): clean component-aware regression imports`

### 18.2 Implemented runtime profiles and scope boundary

- `PPCT_OCCURRENCE_ALLOCATION_V2`: deterministic weekly routing over `AcademicWeekSegment` union; chronological sorting with stable tie-break; planned component established before operational suppression (`CORE_ONLY` -> `CORE`, `CORE_PLUS_SPECIALIZED_STUDY` -> chronologically last opportunity `SPECIALIZED_STUDY`, earlier `CORE`); independent sequential progression cursors; fail-closed on split/capacity/exhaustion.
- `TEACHING_PROGRESS_DEBT_V2`: component-aware progress and debt calculations; independent cursors; proof-based completed/debt/gap accounting per component and combined totals.
- `NORMAL_BASE_PPCT_COMPONENT_V2`: timetable readiness profile validating component capacity, profile, calendar and exhaustion rules; V1 readiness remains available for compatibility.
- Teaching Execution: transaction-aware Allocator V2 for both NORMAL and MAKEUP; makeup resolves exact source obligation preserving component without persisting component downstream.
- Reporting projection: ordinary reporting consumes Progress/Debt V2; combines CORE and SPECIALIZED_STUDY totals into single class-subject aggregate exactly once without inventing `TEACHING_REPORTING_PROJECTION_V2`.
- Zero Prisma schema changes, zero migrations added, no component columns added downstream.

### 18.3 Local validation evidence

- Targeted unit and integration tests for all implemented profiles: PASS
- Full API unit suite: 1162/1162 PASS
- Web unit suite: 236/236 PASS
- Full API integration suite on clean isolated database: 33/33 suites, 333/333 tests PASS
- Full monorepo lint: PASS across all 4 workspaces (`@baogiang/web`, `@baogiang/api`, `@baogiang/contracts`, `@baogiang/config`)
- Typecheck: PASS across all 4 workspaces
- Build: PASS across all 4 workspaces
- Static schema/security/deployment gates: PASS (`test:secrets`, `test:deploy:static`, `test:deploy:behavior`, `test:workflow:contract`, `test:deploy:powershell`, `test:ui:static`, `test:deploy:windows`)
- Capability catalog synchronization integration: PASS on isolated test database
- Playwright smoke suite: 12/12 PASS on isolated local runtime
- Production dependency security audit: `npm audit --omit=dev --audit-level=high` PASS (0 high, 0 critical)
- Canonical migration CI and replay: `npm run test:migrations:ci` PASS (`[migration-test] PASS`)
- `git diff --check`: PASS

### 18.4 Closure gates execution

The planned closure gates were fully executed:
1. Remote branch push (`feat/ppct-component-aware-allocation-projections-003` at candidate HEAD `18a7742229fe9385490cddcaa30ff2f5c9a2087a`)
2. Pull Request created: PR #127 (`feat(ppct): add component-aware allocation and curricular projections`)
3. Independent GitHub review completed: PASS after one correction round absorbing 4 correctness findings (One-opportunity week, Future calendar look-ahead, Future structural blockers/overlap, Forward-only week blockers) committed at `7348221f38ac2cb9b87fa18d169e0198041a23b7`
4. Exact-head PR CI executed: CI #423 (run id `34626664097`), SUCCESS
5. Merged to `main` at `c6c6a294f102f125306fdfc65ac64750d49b91cb`
6. Authoritative post-merge `main` CI executed: CI #424 (run id `34627529544`), SUCCESS
7. Administrative closure documentation sync (`SYNC-P2-003`) completed.

## 19. Final closure

- Status: `CLOSED`
- Closed by: `SYNC-P2-003`
- Dedicated branch: `feat/ppct-component-aware-allocation-projections-003`
- Final reviewed head: `7348221f38ac2cb9b87fa18d169e0198041a23b7`
- Independent review: PASS (4 findings corrected before final CI)
- PR: #127 (`feat(ppct): add component-aware allocation and curricular projections`)
- Exact-head CI: CI #423 (run id `34626664097`), SUCCESS
- Merge/main commit: `c6c6a294f102f125306fdfc65ac64750d49b91cb`
- Authoritative post-merge CI: CI #424 (run id `34627529544`), SUCCESS
- Scope: zero schema/migration added, no production deploy, no correction/re-entry task remains

Closure consequences:
- `P2-004` becomes `READY`
- `P1-031` remains `PLANNED` until `P1-030` also `CLOSED`
- `P2-010` remains `BLOCKED_EVIDENCE`
- Production remains `PRE-OPERATIONAL`
