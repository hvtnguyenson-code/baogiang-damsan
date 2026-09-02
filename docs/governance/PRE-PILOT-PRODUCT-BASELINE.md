# Pre-Pilot Product Baseline

## Status and authority

**PROPOSED NORMATIVE BASELINE — repository acceptance requires explicit review and merge.**

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

Existing `GDDDP_COORDINATOR` and `HĐTN_COORDINATOR` capabilities are evidence that programme-specific coordination was anticipated. Current `SPECIAL_ACTIVITY_MANAGE / SCHOOL_WIDE` must not silently replace coordinator semantics.

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

The system may begin official use after the academic year has already started. The product must therefore support an explicit operational-start policy and a controlled way to establish historical teaching evidence before that start.

Required invariants:

- historical timetable/PPCT replay may establish the expected sequence;
- confirmed historical teaching may consume the correct historical PPCT obligation and count toward workload;
- absence of a historical execution record must **not** automatically become debt merely because time passed;
- historical evidence/corrections must retain provenance and follow forward-correction rules;
- no current-state setting may silently reinterpret already frozen official statements.

### 4.9 PPCT import

PPCT import remains intentionally deferred until the real authoritative school workbook/template/workflow is available and reviewed. The existing PPCT core must not be polluted with guessed workbook fields.

When the source workbook is available, the sequence is: contract/security audit -> approved import profile/identity rules -> implementation -> regression evidence.

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

The previously deferred `WorkloadAdjustmentRule` concept must be re-entered before the product claims official workload/teaching-load calculations that depend on reductions, percentage adjustments or overrides.

The exact model is not authorized here.

## 5. Deliberately unresolved product decision

The Product Owner must choose, before the pilot freeze, whether the first operational pilot is:

- **CORE PILOT:** normal curricular PPCT/TKB/execution/reporting plus go-live/PWA/Telegram, while GDĐP/HĐTN official workload remains outside the first operational claim; or
- **FULL BUSINESS PILOT:** includes GDĐP, HĐTN-HN, homeroom resolution, multi-teacher workload and official combined reporting before pilot.

This decision does not block common P1-P3 foundations, but it blocks the final P5 pilot freeze.

## 6. Production-readiness items that remain separate

The business realignment does not replace production readiness work. Before first production pilot the project still needs, at minimum:

- Báo giảng first-certificate HTTP-01/Nginx authority closure;
- separate Báo giảng TLS renewal lifecycle;
- actual VPS Stage 1 passive evidence and reviewed preflight;
- controlled root/ACL/task/env/Nginx/database bootstrap;
- first reviewed production deploy;
- PWA installability/update policy;
- dedicated Telegram Báo giảng bot, webhook, one-time account linking and notification lifecycle;
- post-deploy smoke/pilot evidence.

## 7. Non-negotiable historical rules

- Never rewrite historical timetable, PPCT, execution or statement rows to make a later interpretation convenient.
- Never infer professional authority from `SYSTEM_ADMIN`, role/title, assignment, staffing or UI visibility.
- Never use a production database for destructive automated testing.
- Never treat a green CI run as proof of VPS readiness.
- Never let a later policy or current master-data change silently alter an already frozen Reporting Statement.

## 8. Implementation authorization

This baseline is an architecture/product-governance authority only. Every implementation area listed above still requires its own task, branch, review, test evidence and explicit merge authorization.
