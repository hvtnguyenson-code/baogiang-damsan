# Pre-Pilot Product Baseline

## Status and authority

**ACCEPTED NORMATIVE BASELINE.**

Accepted by explicit Product Owner merge authorization for PR #91. Canonical merge: `7ae5e6bf86dc5d2bedd9329996235b17a3643ff7`. Authoritative post-merge CI: #328 — SUCCESS.

This document records the Product Owner direction accepted for pre-pilot realignment on 2026-09-03. It does not authorize schema, runtime, UI, deployment or production mutation by itself.

Starting repository baseline: `main@4bcf2e7fb2104304fd044693a0bf8838f6038d85`.

## 1. Purpose

The repository already contains a strong retained-history backend foundation. The pre-pilot problem is not a full-code failure. It is a product-completeness and governance problem: several minimum-core/deferred decisions were never re-entered, while some mutable status documents later became stale.

The objective is therefore **realignment, not rebuild**.

## 2. Source and decision rule

The infrastructure/delivery priority in `PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md` remains unchanged.

For product/business semantics, every future task must read, in order:

1. the v1.3 addendum for environment/delivery constraints;
2. this baseline and the active `PRE-PILOT-TRACEABILITY-MATRIX.md`;
3. accepted ADRs that are not marked for re-entry or supersession by the traceability matrix;
4. `PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx` and reviewed audits that extracted it;
5. current implementation as evidence of what exists, never as proof that the product requirement is complete;
6. prototype material only for presentation reference.

A later minimum-core ADR must never silently erase a broader product requirement. If a task intentionally defers a requirement, the parent task cannot close until the deferred item has a row in `PRE-PILOT-TASK-REGISTER.md` with an explicit re-entry trigger.

### 2.1 Authoritative source fingerprints and rebase trigger

The P0 audit is pinned to these exact authoritative source blobs on the starting baseline:

- `docs/specifications/PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx` — Git blob `c2c61a4e8acb9fde0e5fc5232467662048fd3380`;
- `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md` — Git blob `5876af5920d12ea6fcecf42d1b8a392cc4825f16`.

P0 did not claim a new direct binary OOXML extraction of the v1.2 DOCX through the GitHub connector. Instead it relies on reviewed canonical audits already in this repository — especially `LOCAL-FC-05A0-PPCT-TEACHING-EXECUTION-REPORTING-ARCHITECTURE-AUDIT.md` — which explicitly record direct read-only OOXML extraction of this unchanged v1.2 source, including all 1,471 Word paragraphs and 67 tables, with the relevant sections and appendices reviewed.

This distinction is intentional: the traceability matrix may reuse that existing direct-source evidence only while the authoritative source fingerprint remains unchanged.

If either source blob changes, or an explicit Product Owner decision contradicts this baseline, task `P0-900` becomes mandatory before dependent product work continues. `P0-900` must re-read the changed authoritative source and reconcile this baseline, applicable ADRs, traceability and the task register. A source change must never be absorbed silently by a later implementation task.

## 3. Foundations to KEEP

The following foundations remain valid and must not be rebuilt merely to implement the pre-pilot corrections:

- server-side identity/session/authentication;
- capability/scope default-deny authorization and audit;
- `AcademicYear` and immutable retained `AcademicCalendarVersion` history;
- school business weeks, segments, reserve weeks and interruptions;
- exact civil-date semantics;
- `TimeSlotDefinition` revisions and real half-open wall-clock collision semantics;
- date-effective `TeachingAssignment` responsibility history;
- retained `TimetableVersion` / `TimetableEntry` history and historical resolution;
- timetable import profile/alias/canonical-preview infrastructure;
- PPCT shared master identity, version history, stable item identity, revision lineage and class-subject exact-version association;
- operational overlays and their immutable/corrective history;
- current `SpecialActivity` root/slot/frozen-class/staffing persistence and collision engine as a **runtime scheduling primitive**;
- `CurricularTeachingExecution` evidence;
- `SpecialActivityParticipationExecution` teacher-slot evidence;
- proof-based progress/debt/late projection semantics;
- reporting projection and immutable Reporting Statement direction;
- production deployment/security hardening already merged through current main.

## 4. Boundaries that are REOPENED or INCOMPLETE

### 4.1 Special Activity is a runtime primitive, not the complete programme model

The current `SpecialActivity` minimum core remains useful for one exact scheduled activity occurrence. It is no longer sufficient as the complete product authority for GDĐP/HĐTN-HN planning.

Future implementation must add an upstream programme/planning layer rather than weakening or overloading the existing runtime primitive.

The existing `ACTIVE -> REVERSED`, exact-slot, frozen-class-target, roleless-staffing and collision behavior remains valid unless a later explicit architecture task proves a conflict.

### 4.2 GDĐP programme semantics

The product must support a year/grade programme boundary for Giáo dục địa phương:

- one AcademicYear;
- one grade 10/11/12 scope;
- retained/versioned plan history;
- planned weekly/topic content;
- exact occurrence timing when scheduled;
- exact per-slot teacher assignment, including multiple teachers when required;
- coordinator authority separated from broad school-wide runtime authority;
- downstream execution/workload derived from confirmed evidence, not planned staffing alone.

No free-text `SpecialActivity.title` may be treated as the authoritative annual GDĐP programme.

### 4.3 HĐTN-HN programme modes

HĐTN-HN must support three explicit business modes:

1. `CLASS` — class-level activity; scheduled teacher defaults through the date-effective homeroom responsibility model;
2. `GRADE` — grade-level activity with explicit scheduled teacher participation;
3. `SCHOOL_WIDE` — whole-school activity with explicit scheduled teacher participation.

The business target mode is not itself an authorization scope.

For `CLASS`, historical occurrences must freeze the resolved teacher identity so a later homeroom change cannot rewrite past staffing.

### 4.4 Canonical HomeroomAssignment is a prerequisite

A date-effective `HomeroomAssignment` domain is required before HĐTN `CLASS` can be implemented correctly. It must retain history and must not be inferred from titles, current UI state or ad-hoc configuration text.

The physical schema/API is deferred to its own architecture/persistence/control-plane task.

### 4.5 Per-slot special-program staffing

Planning must be capable of representing different teacher sets for different exact slots of one planned programme occurrence. A flat Cartesian interpretation of `slots[] x teachers[]` is not sufficient authority for programme planning.

The existing runtime participation evidence may remain teacher-slot based; the new planning layer must provide exact assignment provenance before materialization.

### 4.6 Coordinator authority

Existing `GDDP_COORDINATOR` and `HĐTN_COORDINATOR` capabilities are evidence that programme-specific coordination was anticipated. Current `SPECIAL_ACTIVITY_MANAGE / SCHOOL_WIDE` must not silently replace coordinator semantics.

A later authorization task must bind coordinator authority to exact programme/activity resources using explicit capability/scope rules. No role/title or staffing membership may imply mutation authority.

### 4.7 Business Configuration Control Plane

The product requires a typed, auditable, version-aware business configuration layer for business policy that changes over time. It must not become an untyped `SystemSetting` dumping ground.

Candidate policy families include:

- operational/go-live start policy;
- workload/teaching-credit policy;
- workload adjustment rules;
- reporting policy that affects current calculations;
- other later business configuration with explicit effective history.

Technical/security configuration remains outside this business control plane, including database URLs, tokens, TLS keys, CORS/security flags, process ports and other deployment secrets.

### 4.8 Delayed go-live / pre-operational history

The system may begin official use after the academic year has already started. The operational-start authority is already implemented. P3-010 is formally **CLOSED by `SYNC-P3-010`**; ADR-055 is the canonical controlled retrospective curricular evidence architecture. P3-020 is formally **CLOSED by `SYNC-P3-020`**, delivering the bounded CSV/TSV preview/confirm, retained provenance, canonical execution, correction and reconciliation UI/runtime contract.

Required invariants:

- historical timetable/PPCT replay establishes **expected progression only** and is never proof that teaching occurred;
- confirmed historical teaching must resolve exact retained timetable/calendar/assignment/PPCT provenance and write canonical `CurricularTeachingExecution` evidence;
- historical same-subject substitution or already-completed make-up may reconstruct exact retained overlay/schedule provenance only as evidence of a past event, never as future scheduling authority;
- P3 import batch/row records are provenance receipts, not a second completion ledger;
- historical import/confirmation requires `TEACHING_EXECUTION_MANAGE / SCHOOL_WIDE`;
- absence of historical evidence remains **UNCONFIRMED**, never automatic debt/late/completion;
- no manual PPCT cursor, caller-selected PPCT item/revision/component or sequence override is allowed;
- correction is reverse + replacement with retained lineage, never in-place editing;
- no current-state setting or later historical import may rewrite already frozen official statements; later live projections may legitimately incorporate newly confirmed history.

Product Owner authority recorded by P1-031B adds one exact retained lifecycle rule for this domain: when an `OPERATIONAL_START` authority is already `PUBLISHED` but the server-owned HCM business date is still before its `effectiveFrom`, a legitimate planned change uses a distinct scheduled-authority supersession operation/state. The source is retained as `SUPERSEDED_BEFORE_EFFECTIVE`, the successor occupies the same scheduled `effectiveFrom`, and dedicated scheduled-supersession lineage preserves the chain. `CORRECTION` is not expanded and continues to mean correction of an erroneous retained assertion/history. Once the first effective civil date begins, this scheduled lifecycle is no longer available.

### 4.9 PPCT import

The authoritative school PPCT workbook and contract/security audit is closed under `P2-010`:
- authoritative workbook reviewed: `Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`;
- authoritative SHA-256: `9a8cc9b62b02cae5c81163bf7afca12be5f0ee66eb5316fd236294adb1b56692`;
- physical sheet `PPCT` maps to logical component `CORE`;
- physical sheet `CHUYEN_DE` maps to logical component `SPECIALIZED_STUDY`;
- physical sheet `THONG_TIN` serves as metadata authority;
- exact workbook structural, identity, replay, and error contracts are audited and closed under `P2-010` (`docs/requirements/P2-010-PPCT-REAL-WORKBOOK-CONTRACT-SECURITY-AUDIT.md`);
- P2-020 native importer implementation is formally CLOSED by `SYNC-P2-020` after PR #173 (`main@2d6cb02d4bf9bb4529e0e8eaf83e10d6a67ef043`, exact-head CI #549 SUCCESS, post-merge CI #550 SUCCESS), including dedicated PPCT_V1 parser/security profile, `inspect / preview / confirm`, whole-workbook DRAFT-only atomic import/replay/CAS semantics and Vietnamese import UI;

### 4.10 Native Đam San timetable ingestion

The current generic timetable import foundation remains valid. A native adapter is required for the real school workbook format, including class-oriented and teacher-oriented sheets.

Required product rules:

- class-view and teacher-view data are peer evidence, not winner/loser sources;
- exact semantic mismatch is a blocker; no last-write-wins or fuzzy conflict repair;
- unknown teacher/class/subject mappings fail closed unless an explicitly reviewed alias resolves them;
- morning and afternoon timetable updates must be independently authorable while the canonical retained timetable remains one coherent version;
- updating one session must carry forward the untouched session explicitly and must never erase it silently.

### 4.11 Special-activity workload/reporting

Confirmed `SpecialActivityParticipationExecution` must be eligible for teacher workload/reporting under a separately accepted policy. Frozen class-target fan-out must never multiply teacher workload.

Planned staffing is not execution evidence. Teacher workload credit requires accepted execution/participation evidence.

### 4.12 Workload adjustment policy

The previously deferred `WorkloadAdjustmentRule` re-entry trigger **fired on 2026-10-02** under the Product Owner FULL BUSINESS completeness directive. `P4-060` is now CLOSED by `SYNC-P4-060` and ADR-057 is Accepted, locking reduction/percentage/override semantics, priority, date effectivity, canonical AdditionalDuty/Homeroom sources, actual-teacher curricular workload, arbitrary-range calendar proration and frozen-report provenance. T49 is therefore architecturally closed and moves to P4-061 implementation.

P4-061 must therefore implement both sides of official workload: earned credit (actual curricular executions + reused P4-050 special-programme credit) and adjusted required credit under the typed `WORKLOAD_ADJUSTMENT` policy. The model must not be hard-coded from titles, roles or duty names.

### 4.13 Curricular components: CORE vs Chuyên đề học tập (Product Owner authority 2026-09-08)

On 2026-09-08, the Product Owner established explicit authority realigning PPCT progression and timetable consumption:

1. **Component taxonomy:** A normal curricular subject may contain two curricular components: `CORE` (phần cốt lõi) and `SPECIALIZED_STUDY` (chuyên đề học tập). Specialized study is strictly curricular, not an ad-hoc `SpecialActivity`.
2. **Shared master plan foundation:** Both components belong to the single subject master plan (`AcademicYear + Subject + Grade`) and represent the same curricular Subject domain (not separate Subject catalog entities). The exact component lifecycle and version packaging model (whether CORE and SPECIALIZED_STUDY publication/correction are atomic under one `PpctVersion` or require another retained topology) is explicitly assigned to `P2-001` to determine.
3. **Single Teaching Assignment:** `TeachingAssignment` remains bounded to `(academicYearId, classId, subjectId, teacherId)`. The teacher assigned to teach the class-subject teaches both `CORE` and `SPECIALIZED_STUDY`; no secondary teacher assignment is created.
4. **Administrative applicability:** Whether a class takes specialized study in a subject is determined explicitly by business administration configuration (never guessed by system heuristics). Classes not taking specialized study consider specialized items `NOT_APPLICABLE`, never debt or unfulfilled obligation.
5. **Component-free TimetableEntry:** Native timetable and `TimetableEntry` remain component-free. The timetable assigns periods to normal curricular subjects, exactly matching native school reality.
6. **Weekly last-opportunity routing:** Within an `AcademicWeek`, for an enabled class-subject:
   - General rule: the chronologically LAST canonical normal opportunity in the week is designated for `SPECIALIZED_STUDY`; all earlier canonical normal opportunities in that week are designated for `CORE`.
   - Exact deterministic behavior for atypical weeks (weeks with zero opportunities, exactly one opportunity, holiday/interruption truncations, and mid-week timetable cutovers) remains assigned to `P2-001` to determine. P0-900 does not invent or predetermine this rule.
   - Operational disruptions, cancellations, or adjustments affect actual execution evidence and do NOT dynamically reclassify an already established planned component classification.
7. **Independent progression:** `CORE` and `SPECIALIZED_STUDY` progress as independent sequential cursors. Consuming a specialized opportunity advances the specialized sequence, not the core sequence.
8. **Combined reporting:** Ordinary curricular reporting combines totals from both components into canonical class-subject statements.

### 4.14 Production VPS topology (Product Owner authority 2026-10-01)

On 2026-10-01, at decision gate `P6-005`, the Product Owner explicitly selected `SHARED_VPS`.

The intended production host is therefore the existing Windows Server 2022 VPS that currently hosts DamSanV5 / Quản lí nội trú. This decision is supported by a bounded read-only capacity audit retained by the operator and recorded in sanitized form by `ADR-053-PRODUCTION-VPS-TOPOLOGY.md`.

Required invariants:

- `SHARED_VPS` is host sharing only; it is **not** shared application authority;
- Báo giảng must use a dedicated application root, Node/API port, Scheduled Task/startup authority, environment/secrets boundary, logs, backups, PostgreSQL database, PostgreSQL role, Nginx server-block/include authority, domain/TLS certificate and renewal lifecycle;
- DamSanV5 / Quản lí nội trú roots, processes, tasks/services, database resources, Nginx/TLS/monitoring state remain protected neighbours;
- no P6-005 documentation change may create/restart/alter production resources;
- `P6-005` and `P6-010` are formally `CLOSED`; P6-010 repository-side shared-host HTTP-01/TLS authority closed through PR #176, exact-head CI #577, merge/main `edc4d2b92f629e989679063246c815c9ad5ce870`, post-merge CI #578 and `SYNC-P6-010`; this does not authorize production mutation, and actual Stage 1 evidence remains separately gated under P6-020;
- actual production readiness still requires the registered passive evidence and preflight gates; green CI or this capacity decision is not VPS readiness evidence.

## 5. Selected first operational pilot scope

On 2026-10-02 the Product Owner selected **FULL BUSINESS PILOT** under P0-003. The decision is recorded by ADR-054 and is formally **CLOSED by `SYNC-P0-003`** after PR #179, exact-head CI #594, merge/main `7b1b29c668b3615c1188d12cc055cd66d03c47e4` and post-merge CI #595.

The first operational pilot claim therefore includes:

- normal curricular PPCT/TKB/import/execution/progress/debt/late/reporting;
- delayed-go-live operational-start administration and controlled historical evidence/reconciliation;
- the school-wide effective Teacher Workspace;
- GDĐP;
- HĐTN-HN CLASS / GRADE / SCHOOL_WIDE;
- date-effective homeroom resolution;
- exact multi-teacher staffing/workload and anti-double-counting semantics;
- official combined reporting across the accepted business domains;
- public make-up scheduling for real incomplete obligations without consuming a new PPCT item;
- adjusted-workload rules needed for correct official figures, including reduction / percentage adjustment / override with retained effectivity and frozen-report provenance;
- PWA/Telegram and production-readiness gates before teacher go-live.

On 2026-10-02 the Product Owner clarified that FULL BUSINESS must be functionally complete wherever omission of a registered rule would make real operation or official figures incorrect. This fires T08 and T23 re-entry.

The direct dependency set registered for `P5-010` (`P0-003`, `P1-032`, `P2-020`, `P2-061`, `P3-020`, `P3-031`, `P4-061`, `P4-074`) has been completely fulfilled and `P5-010` is formally `CLOSED` by `SYNC-P5-010`. `P5-020` (PWA production baseline) is `CLOSED` by `SYNC-P5-020`.

Dedicated Telegram integration architecture is governed by `P5-030A` (`CLOSED` by `SYNC-P5-030A`, ADR-058 Accepted, `T33` NEW_PRODUCT_AUTHORITY), and runtime implementation is completed and closed under `P5-030` (`CLOSED` by `SYNC-P5-030`; PR #200; exact-head CI #653 SUCCESS; merge/main `3bcd0d7fc1ffd0eedb8f2186271e2596a1581e5a`; post-merge CI #654 SUCCESS), establishing dedicated bot isolation, technical configuration boundaries, one-time linking, webhook trust, internal idempotency, durable delivery state machine and ProfilePage integration with zero real Telegram activation. Pre-deploy full-repository consistency audit (`P5-040`) is `CLOSED` by `SYNC-P5-040` (PR #202; exact-head CI #657 SUCCESS; merge/main `1282f24a5300da88c155c7dc5523644d14bd53c8`; post-merge CI #658 SUCCESS; resolving CX-01..CX-06).

## 6. Production-readiness items that remain separate

The business realignment does not replace production readiness work. Before first production pilot the project still needs, at minimum:

- formal P6-005 repository closure of the selected `SHARED_VPS` topology (CLOSED by `SYNC-P6-005`);
- Báo giảng first-certificate HTTP-01/Nginx authority closure under shared-host/protected-neighbour semantics (CLOSED by `SYNC-P6-010`);
- PWA installability/update policy (CLOSED by `SYNC-P5-020`);
- dedicated Telegram Báo giảng architecture closure (`P5-030A` CLOSED by `SYNC-P5-030A`, ADR-058 Accepted) and implementation (`P5-030` CLOSED by `SYNC-P5-030`);
- pre-deploy full-repository consistency audit (`P5-040` CLOSED by `SYNC-P5-040`);
- separate Báo giảng TLS renewal lifecycle (`P6-040`);
- actual VPS Stage 1 passive evidence and reviewed preflight (`P6-020`, trigger-gated behind `P5-040` closure and explicit Product Owner approval);
- controlled root/ACL/task/env/Nginx/database bootstrap (`P6-030`);
- first reviewed production deploy;
- post-deploy smoke/pilot evidence (`P6-050`).

## 7. Non-negotiable historical rules

- Never rewrite historical timetable, PPCT, execution or statement rows to make a later interpretation convenient.
- Never infer professional authority from `SYSTEM_ADMIN`, role/title, assignment, staffing or UI visibility.
- Never use a production database for destructive automated testing.
- Never treat a green CI run as proof of VPS readiness.
- Never let a later policy or current master-data change silently alter an already frozen Reporting Statement.

## 8. Implementation authorization

This baseline is an architecture/product-governance authority only. Every implementation area listed above still requires its own task, branch, review, test evidence and explicit merge authorization.
