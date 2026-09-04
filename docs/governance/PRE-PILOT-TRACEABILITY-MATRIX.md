# Pre-Pilot Traceability Matrix

## Status

**ACCEPTED / MANDATORY CURRENT TRACEABILITY AUTHORITY.**

Accepted through P0-001 / ADR-044. Rows may be updated by an in-review registered task to describe that task's proposed post-merge state; such row changes become canonical only if the task is explicitly approved and merged.

Baseline audited: `main@4bcf2e7fb2104304fd044693a0bf8838f6038d85`.

This matrix is the mandatory cross-domain map from source requirement to current implementation and future action. A task may not close a requirement by narrowing it to a minimum core unless the remaining requirement is added to the task register with an explicit re-entry trigger.

## Disposition vocabulary

- `KEEP` — current architecture/code remains product-valid.
- `RESTORE` — earlier product intent was lost/deferred and must be reintroduced.
- `REALIGN` — current primitive is valid but is being used at the wrong product layer or with incomplete semantics.
- `NEW_PRODUCT_AUTHORITY` — a real go-live requirement emerged later and needs explicit Product Owner authority.
- `DEFERRED_WITH_TRIGGER` — intentionally excluded now, with a named re-entry trigger/task.
- `NON_PILOT` — not required for the first pilot claim.

## Matrix

| ID | Requirement / product fact | Source evidence | Later decision/current architecture | Current implementation | Disposition | Re-entry task |
|---|---|---|---|---|---|---|
| T01 | Retained academic calendar, business weeks, interruptions and exact civil dates | PA-B v1.2 §§6, 12; ADR-010/011 | Preserved | Implemented | `KEEP` | none |
| T02 | Exact configurable real-time slots; collision by actual interval | PA-B v1.2 §7.4–7.5; ADR-016/018 | Preserved | Implemented | `KEEP` | none |
| T03 | Date-effective teaching responsibility and retained teacher provenance | ADR-012/013; PA-B v1.2 reporting requirements | Preserved | Implemented | `KEEP` | none |
| T04 | Retained/versioned TKB with historical resolution | PA-B v1.2 §§5,7,12; ADR-017–020 | Preserved | Implemented | `KEEP` | none |
| T05 | PPCT is versioned, sequential and historically retained | PA-B v1.2 §§5,8; ADR-027–029 | Preserved and strengthened with stable item identity/lineage | Implemented | `KEEP` | none |
| T06 | PPCT progress/debt is separate from master PPCT | PA-B v1.2 §2, §8–9; ADR-027/040 | Preserved | Implemented projection | `KEEP` | none |
| T07 | Same-subject substitution can fulfill expected PPCT; different-subject supervision cannot | PA-B v1.2 §§8–9; ADR-031/038 | Preserved | Implemented through allocation/execution | `KEEP` | none |
| T08 | Make-up fulfills the original obligation and consumes no new PPCT item | PA-B v1.2 §§8–9; ADR-031/038 | Preserved | Foundation/runtime evidence exists; public make-up creation remains deferred | `KEEP` + `DEFERRED_WITH_TRIGGER` for public runtime | `P3-030` architecture then `P3-031` runtime if trigger fires |
| T09 | Missing execution alone must not prove debt | ADR-038/040; audited source semantics | Preserved | Implemented | `KEEP` | none |
| T10 | Submitted/approved statement is immutable/frozen and must not drift with source changes | PA-B v1.2 §12; ADR-041–043 | Preserved | Reporting Statement implementation exists | `KEEP` | none |
| T11 | GDĐP/HĐTN are not reducible to one normal TimetableEntry/TeachingAssignment | PA-B v1.2 §11; ADR-012/017; LOCAL-FC-04 audit | Preserved in principle | Separate SpecialActivity family exists | `KEEP` | none |
| T12 | Special activities may target class/grade/school and may involve multiple teachers | PA-B v1.2 §11; 05A0/05D0 audits | ADR-034 chose one atomic generic root with frozen classes + roleless staff | Implemented | `REALIGN` | `P4-010`–`P4-040` |
| T13 | HĐTN class-level activity uses effective homeroom responsibility | LOCAL-FC-05A0 confirms class HĐTN uses effective homeroom teacher; ADR-010/012 had deferred the canonical domain | ADR-045 accepted by P1-010: separate AcademicYear-owned, class/date-effective HomeroomAssignment with exact fail-closed historical resolver, current-vs-historical eligibility distinction and dedicated management authority | P1-011 persistence and P1-012 merged/verified control plane now provide `HOMEROOM_ASSIGNMENT_MANAGE / SCHOOL_WIDE`, create/change/end/correct/read/options, exact fail-closed resolution and calendar compatibility; P1-013 remains UI-only | `RESTORE` | `P1-013` adds admin UI only; P4 may consume the completed Homeroom authority subject to its own registered dependencies |
| T14 | Historical homeroom responsibility must not drift after teacher or current account-state change | historical-retention rules from ADR-010/012/038 + P0 baseline | ADR-045 accepted: retained effective intervals, bounded historical truth survives later User/profile changes, frozen downstream GVCN provenance and explicit correction semantics | P1-011 retains ACTIVE/REVERSED evidence and DB exclusion; closed P1-012 adds bounded historical truth independent of current account/profile state, inclusive change, 1..N correction lineage, same-transaction audit and typed RESOLVED/MISSING/AMBIGUOUS/CORRUPT resolution; P1-013 remains UI-only | `KEEP` | `P1-013` adds admin UI only; no backend historical-authority re-entry required |
| T15 | HĐTN has distinct CLASS / GRADE / SCHOOL_WIDE business modes | Product Owner pre-pilot direction + earlier activity scope evidence | Current SpecialActivity has generic selector only | Partial runtime support | `REALIGN` | `P4-010`–`P4-040` |
| T16 | GDĐP requires a year/grade programme with planned weekly/topic content | Product Owner pre-pilot direction; PA-B v1.2 special-activity/content examples | ADR-034 explicitly omitted category/programme/series | Absent | `RESTORE` | `P4-010`–`P4-020` |
| T17 | Different exact slots of one special programme may have different teacher sets | Product Owner pre-pilot direction; execution is already teacher-slot granular | Current create input accepts flat `slots[]` + `teachers[]` | Cannot express exact programme assignment topology | `REALIGN` | `P4-010`–`P4-040` |
| T18 | Coordinator authority is distinct from generic school-wide activity mutation | Capability foundation includes `GDDDP_COORDINATOR` / `HĐTN_COORDINATOR`; default-deny ADR-008 | ADR-034 uses only `SPECIAL_ACTIVITY_MANAGE / SCHOOL_WIDE` | Coordinator keys exist but do not authorize runtime SpecialActivity management | `RESTORE` | `P4-030` |
| T19 | Confirmed special-activity participation should contribute to teacher workload under explicit policy | PA-B v1.2 workload/activity intent; ADR-038 provides exact participation evidence | ADR-041 explicitly deferred Special Activity reporting/workload | Execution evidence exists; reporting ignores it | `RESTORE` | `P4-050` |
| T20 | Frozen class targets must not multiply teacher workload | ADR-038 explicit invariant | Preserved | Execution evidence topology supports it | `KEEP` | regression in `P4-050` |
| T21 | Business policy/configuration must be data-driven where school rules change | PA-B v1.2 Appendix D; Phase 01 deferred workload rule; current dynamic catalogs | No unified typed business-policy control plane | Fragmented; `SystemSetting` is not an authoritative typed business layer | `RESTORE` | `P1-020` architecture -> `P1-021` persistence/control plane -> `P1-022` admin workspace |
| T22 | Technical secrets/security config must not be editable as business policy | v1.3/production env contracts | Preserved | Env/deploy controls exist | `KEEP` | enforce in `P1-020`–`P1-022` |
| T23 | Workload reduction/percentage/override rules must be configurable before official workload claims that need them | `PHASE-01-IDENTITY-ACCESS-SPEC.md` deferred `WorkloadAdjustmentRule` | Intentionally deferred; CI once verified absence | Absent | `DEFERRED_WITH_TRIGGER` | `P4-060` architecture then `P4-061` implementation; trigger = official adjusted-workload scope |
| T24 | PPCT import uses authoritative school workbook/template and must not guess timetable-import contracts | ADR-027 explicit defer/re-entry | Intentionally deferred | No PPCT importer | `DEFERRED_WITH_TRIGGER` | `P2-010` then `P2-020`, trigger = authoritative workbook available |
| T25 | Real Đam San TKB uses native class/teacher workbook views requiring a school adapter | Product Owner supplied real operational format | Generic importer intentionally canonical/profile based | No native adapter | `NEW_PRODUCT_AUTHORITY` | `P2-030`–`P2-050` |
| T26 | Class-view and teacher-view TKB are peer evidence; mismatch must block | Product Owner pre-pilot decision | No existing rule | Absent | `NEW_PRODUCT_AUTHORITY` | `P2-030`–`P2-040` |
| T27 | Morning/afternoon TKB may be updated independently without erasing the other session | Product Owner pre-pilot decision; canonical TKB must remain coherent | Current import creates canonical version, no native selective-session workflow | Absent | `NEW_PRODUCT_AUTHORITY` | `P2-050` |
| T28 | System may go live after the school year started | Product Owner deployment reality | No business operational-start model | Absent | `NEW_PRODUCT_AUTHORITY` | `P1-030` architecture -> `P1-031` implementation; historical evidence in `P3-010`–`P3-020` |
| T29 | Confirmed pre-operational historical teaching consumes correct historical PPCT and counts workload | Product Owner pre-pilot direction; existing retained allocation/execution semantics are compatible | No pre-op ingestion policy/runtime | Absent | `NEW_PRODUCT_AUTHORITY` | `P3-010`–`P3-020` |
| T30 | Unconfirmed pre-operational history must not become debt merely due elapsed time | ADR-038/040 negative-evidence rule + Product Owner go-live requirement | Existing debt semantics compatible | No special go-live layer required to change debt engine | `KEEP` + `NEW_PRODUCT_AUTHORITY` for go-live boundary | `P1-030`–`P1-031`, then `P3-010` |
| T31 | Current SpecialActivity collision/exact history primitive should be reused, not rebuilt | ADR-034/035/038 | Preserved | Implemented | `KEEP` | `P4-040` bridge only |
| T32 | PWA installability is required before teacher pilot if mobile install is part of the product claim | Product Owner pre-pilot direction | No PWA implementation in current Vite app | Absent | `NEW_PRODUCT_AUTHORITY` | `P5-020` |
| T33 | Dedicated Báo giảng Telegram bot, isolated token/webhook/linking lifecycle | Product Owner production architecture | Not yet implemented | Absent | `NEW_PRODUCT_AUTHORITY` | `P5-030` |
| T34 | Báo giảng requires separate TLS cert/renewal and safe HTTP-01 route before first cert | Production architecture + September TLS audit | Current production Nginx authority only covers 443 managed vhost | Repo first-cert HTTP-01 lifecycle incomplete | `RESTORE` | `P6-010` |
| T35 | Actual VPS readiness requires passive discovery/preflight evidence, not inference from green CI | v1.3, ADR-005, production runbook | Preserved | Tooling exists; actual evidence not yet collected | `DEFERRED_WITH_TRIGGER` | `P6-020`, trigger = business/pilot build approved for production |
| T36 | Current-state documentation must not claim implemented modules are absent | Governance requirement from pre-pilot audit | README/PROJECT_CONTEXT/roadmap became stale | Stale on starting baseline | `REALIGN` | `P0-001` |
| T37 | Every deferred requirement must have a re-entry task and trigger | Product Owner 2026-09-03 governance direction | No repository-wide invariant existed | Absent | `NEW_PRODUCT_AUTHORITY` | `P0-001` governance rule |
| T38 | Every major successful task must synchronize canonical status documentation before the next major task begins | Product Owner 2026-09-03 governance direction | No repository-wide invariant existed | Absent | `NEW_PRODUCT_AUTHORITY` | `P0-001` governance rule |
| T39 | Room/location collision | ADR-034 explicitly NOT_ASSESSED | Intentionally outside current minimum core | Absent | `NON_PILOT` unless scope changes | `D-ROOM-001` trigger = pilot/product requires room booking/collision |
| T40 | Arbitrary student roster/enrollment activity targeting | ADR-034 explicit non-scope | Intentionally absent | Absent | `NON_PILOT` | `D-ROSTER-001` trigger = product requires roster/attendance |
| T41 | AI active business integration | ADR-002/004 policy; disabled by default | Deferred | Ports/policy only | `NON_PILOT` | `D-AI-001` trigger = separate Product Owner activation decision |
| T42 | A change to an authoritative v1.2/v1.3 source or a contradictory explicit Product Owner decision must force governance rebase before dependent implementation continues | P0 source fingerprints and source-priority rule | No repository-wide source-change trigger existed before P0 | P0 pins exact blobs and registers re-entry | `DEFERRED_WITH_TRIGGER` | `P0-900`; trigger = source fingerprint change or explicit contradiction |
| T43 | GDĐP/HĐTN special-program absence, replacement and substitute-teacher semantics must be explicit rather than inferred from curricular substitution rules | LOCAL-FC-05A0 marked absence/substitution within activities UNRESOLVED; ADR-038 minimum core requires actual teacher = scheduled teacher and rejects arbitrary substitution | Current participation evidence is valid only for exact scheduled teacher-slot; no programme replacement authority exists | Partial minimum-core runtime only | `REALIGN` | `P4-010` must close programme semantics; `P4-040` may implement only the accepted bridge/runtime behavior |
| T44 | Special-program confirmation authority/topology must reconcile coordinator/BGH confirmation with per-teacher-slot participation evidence and prevent double counting | LOCAL-FC-05A0 records v1.2 coordinator-or-BGH confirmation intent and flags whether the OR policy remains final; ADR-038 later models exact scheduled teacher-slot participation evidence | Current execution can record teacher-slot participation but does not settle programme-level confirmation/attestation authority | Partial minimum-core runtime only | `REALIGN` | `P4-010` architecture -> `P4-030` authorization -> `P4-040` runtime bridge -> `P4-050` workload regression |

## Required review rule

Every future architecture or implementation task that touches one of these rows must cite the row IDs in its task document. If a task discovers a new requirement, creates a new deferral, or observes an authoritative source fingerprint change, the same PR must update this matrix and `PRE-PILOT-TASK-REGISTER.md` or stop for `P0-900`; otherwise that task is not merge-ready.
