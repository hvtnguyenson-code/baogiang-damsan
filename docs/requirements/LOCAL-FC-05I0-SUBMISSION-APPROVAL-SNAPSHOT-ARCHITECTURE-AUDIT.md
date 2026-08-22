# LOCAL-FC-05I0 — Submission / Approval Snapshot Architecture Audit

## 1. Status / scope / authority

**Status:** documentation-only architecture audit at canonical baseline `bdec73f92842e461d3e5cc05327c54449b33a053`. It authorizes no production implementation, schema, migration, Prisma, controller, service, capability, seed, ADR, deployment, or data mutation.

This audit examines: `LIVE CURRENT-AUTHORITATIVE REPORT -> SUBMITTED IMMUTABLE STATEMENT -> APPROVAL / REJECTION / SUPERSESSION HISTORY`.

`CONFIRMED` means direct Accepted/CLOSED authority or current contract evidence. `INFERRED` is a compatible candidate, not a requirement. `UNRESOLVED` needs a Product Owner decision or a later source-backed architecture closure. No capability name, role, title, UI visibility, or existing approval catalog entry is treated as authority by itself.

## 2. Current delivery position

**CONFIRMED:** ADR-041 accepts a bounded, current-authoritative Reporting Projection downstream of planning, operations, execution, and progress/debt. Its input is AcademicYear, finite explicit class-subject roots, inclusive civil range wholly in that AcademicYear, and non-future `asOfInstant`. The current repository has a public `POST /api/reporting/projection` boundary which checks `REPORTING_READ` separately for every covered subject. This audit does not re-authorize or alter that boundary.

**CONFIRMED:** inspected schema, contracts, and modules have no Statement root, frozen content/manifest, statement decision history, or Statement submit/approve/reject/supersede/void capability. ADR-041 deliberately defers immutable statements, submission, approval, separation of duty, and correction-after-freeze.

## 3. Source inventory

| Source | Evidence used |
| --- | --- |
| `docs/architecture/CORE-BACKEND-ROADMAP.md` | Placement after Reporting Projection; downstream layers cannot rewrite upstream facts. |
| `docs/decisions/ADR-041-REPORTING-PROJECTION.md` | Accepted live-report input/detail/aggregate/blocker semantics; read snapshot topology; deferred Statement boundary. |
| `docs/requirements/LOCAL-FC-05H0-REPORTING-PROJECTION-ARCHITECTURE-AUDIT.md` | Reporting/source-drift boundary and deferred Statement questions. |
| `docs/requirements/LOCAL-FC-05H0D-REPORTING-PROJECTION-DECISION-CLOSURE.md` | Accepted D1–D15 and residual deferrals. |
| `docs/decisions/ADR-027-PPCT-EXECUTION-REPORTING-ARCHITECTURE.md` | Immutable snapshot or sufficient immutable reference manifest; no later source drift; submitter cannot approve own report. |
| `docs/decisions/ADR-008-CAPABILITY-AUTHORIZATION-SEMANTICS.md` and runtime | Fail-closed explicit grant evaluator and supported scopes. |
| Reporting projection/controller/access contracts and tests | Root identity, `PASS`/`BLOCKED`, per-subject public read check, denial audit. |
| Audit service/model | Sanitized `AuditEvent`: actor, action, entity, request ID, result, metadata, timestamp. |
| ADR-038, ADR-039 and execution/overlay/PPCT contracts | Immutable provenance, active/reversed history, request-key/fingerprint replay, CAS, replacement, transaction/audit patterns. |
| Capability catalog/contracts | `APPROVAL_PRINCIPAL` and `APPROVAL_VICE_PRINCIPAL` are `SCHOOL_WIDE`; `REPORTING_READ` supports `SUBJECT` and `SCHOOL_WIDE`. |

## 4. Confirmed upstream contracts

- **CONFIRMED:** reporting atomic root is `AcademicYear + SchoolClass + Subject`; reports compose a finite explicit set under one AcademicYear, inclusive range, and `asOfInstant`.
- **CONFIRMED:** canonical traceable curricular detail exclusively supplies aggregates and preserves exact PPCT, timetable, calendar, assignment, operational, fulfillment, original/actual-coordinate, and responsible/actual-teacher provenance.
- **CONFIRMED:** a `BLOCKED` root has no trustworthy counts/details; a scope covering one has unavailable/explicitly blocked aggregate and cannot present a combined partial total as complete.
- **CONFIRMED:** MAKEUP is one original obligation: source coordinate owns curricular accounting; actual coordinate is evidence; no second distribution/completion.
- **CONFIRMED:** Special Activity remains outside curricular PPCT/progress/debt/late and cannot fan out by class target.
- **CONFIRMED:** Reporting Projection does not mutate PPCT, timetable, overlays, Teaching Execution or progress/debt truth, and cannot make cached reporting upstream truth.

## 5. Statement boundary

**CONFIRMED:** Statement is later and downstream of live Reporting Projection. Submission/approval establishes an immutable official-record boundary; live reporting may recompute and differ without rewriting submitted/approved content.

**UNRESOLVED:** canonical Statement root/business identity. Sources do not choose between accepted reporting request identity alone, a period/organization document identity, or another root linked to request identity. They also do not choose whether same roots/range/as-of creates distinct Statements, versions, or semantic duplicates.

## 6. Freeze/reproducibility models

**CONFIRMED:** ADR-027 requires an immutable snapshot or immutable reference manifest sufficient to reproduce exactly submitted content. Later PPCT/timetable/overlay/execution/live-projection correction must not silently drift a historical Statement.

**INFERRED:** retain complete canonical detail and reconciled aggregates as immutable content plus immutable report-input/profile/provenance manifest. This supports direct historical rendering and traceability.

**INFERRED:** a manifest-only model is viable only if every reference, resolver version, ordering rule, and rendering field reproduces exact content despite correction; it cannot resolve against current heads.

**UNRESOLVED:** snapshot, manifest, or hybrid selection; canonical payload/hash requirement; serialization version/field set/normalization/encoding/hash algorithm. Timetable-import SHA-256 `semantic-v1` is import-specific authority and cannot be reused as Statement policy without acceptance.

## 7. Lifecycle candidates

**CONFIRMED:** frozen submission and approved content cannot silently mutate.

**INFERRED:** `SUBMITTED`, `APPROVED`, `REJECTED`, and predecessor/successor `SUPERSEDED` are useful candidate names.

**UNRESOLVED:** whether rejection is terminal, resubmission of same Statement is allowed, it is a separate decision event, or it requires a new Statement; whether `WITHDRAWN`, `VOID`, `SUPERSEDED`, or a narrower lifecycle applies; and legal transitions. Existing execution `ACTIVE -> REVERSED` or PPCT/timetable `SUPERSEDED` does not transfer as Statement authority.

## 8. Submission semantics

**CONFIRMED:** freeze must preserve ADR-041 semantics and must not repair/rebind facts. A `BLOCKED` root cannot become a trustworthy official total or be silently omitted.

**INFERRED:** require every covered root to be `PASS`; otherwise reject with retained diagnostics instead of creating a partial official Statement. This is stricter than the live read model and needs acceptance.

**INFERRED:** derive/freeze inside one outer write transaction after authorization and before creation, using tx-aware reporting/upstream calls, to avoid time-of-check/time-of-freeze inconsistency.

**UNRESOLVED:** `SERIALIZABLE` versus another safe isolation/topology; whether read `RepeatableRead` suffices for a create command; and additional submission-time rule for accepted as-of/current-authoritative time.

## 9. Approval/rejection semantics

**CONFIRMED:** approval cannot rewrite frozen content; it is downstream historical evidence, not recalculation.

**INFERRED:** immutable decisions linked to a Statement should retain actor, instant, decision type, rationale, and request identity rather than replace decision facts in place.

**UNRESOLVED:** decision route, quorum/sequence, finality, rejection reason policy, resubmission, withdrawal/void authority, and whether decision history or state-plus-history is authoritative.

## 10. Separation of duty / no-self-approval

**CONFIRMED:** submitter must not approve that Statement. Authorization must use authenticated server-side actor identity, never a client-provided actor.

**INFERRED:** compare persisted submitter UUID with authenticated approver UUID inside approval transaction; deny equality regardless of display name, position, grant, or payload. Retain both identities in history.

**UNRESOLVED:** delegation/acting-on-behalf-of, organization substitution, and authoritative delegation source. No existing grant, role, staff relation, or title establishes delegation.

## 11. Authorization and scope

**CONFIRMED:** authorization uses explicit active grants and fails closed. Supported scopes are `PERSONAL`, `SUBJECT_GROUP`, `SUBJECT`, `ACTIVITY`, `SCHOOL_WIDE`; no `CLASS` or `ACADEMIC_YEAR` capability scope exists. Same-capability `SCHOOL_WIDE` covers narrower request; narrow grant cannot cover `SCHOOL_WIDE`.

**CONFIRMED:** `APPROVAL_PRINCIPAL` and `APPROVAL_VICE_PRINCIPAL` allow only `SCHOOL_WIDE`. Catalog descriptions do not bind them to Statement approval. `REPORTING_READ` is live-read authority, not submission/approval authority.

| Action | Classification | Scope conclusion |
| --- | --- | --- |
| Statement submit | UNRESOLVED | No Statement capability/key or accepted scope rule. |
| Statement read | UNRESOLVED | `REPORTING_READ` governs live projection only; frozen-statement reader is unclosed. |
| Statement approve | UNRESOLVED | Existing approval keys alone are insufficient; no binding command/SoD rule. |
| Statement reject | UNRESOLVED | Same gap as approval. |
| Statement supersede/void | UNRESOLVED | No lifecycle or capability authority. |

## 12. Idempotency / concurrency / CAS

**CONFIRMED:** execution and overlay commands demonstrate local patterns: request key plus deterministic fingerprint replays same content, same key/different fingerprint conflicts, reversal uses CAS, active uniqueness is database-backed, and success business/audit writes share one transaction. These are evidence, not inherited Statement contract.

**INFERRED:** submit, approve, reject, supersede/void, and replay should use command-specific idempotency namespace/fingerprint plus CAS/uniqueness. Concurrent mutually exclusive decisions should leave one authority and return conflict or idempotent replay to retry/loser.

**UNRESOLVED:** Statement semantic duplicate identity, request-key scope, fingerprint contents, lock/CAS field, isolation, retries, command ordering, and one-race versus multi-step decision workflow.

## 13. Correction / supersession

**CONFIRMED:** upstream correction may change live report but cannot mutate submitted/approved Statement. Upstream uses retained versions, immutable reversals, predecessor/replacement linkage rather than in-place historical changes.

**INFERRED:** corrected official result should be new immutable Statement with explicit predecessor/supersession link, leaving earlier Statement and decisions readable; derive new live report, do not amend frozen payload.

**UNRESOLVED:** correction after submission/approval/rejection, initiator, supersession versus void, and visibility/effect of earlier approval.

## 14. Audit/history

**CONFIRMED:** generic audit retains sanitized actor/action/entity/request ID/result/metadata/time; reporting authorization denial is audited. Execution history retains immutable actor/time/reason/request identity/replacement provenance.

**INFERRED:** audit submission, approval, rejection, supersession/void, idempotent replay, denied authorization, and CAS/concurrency conflict, identifying Statement/request key without secrets or unbounded payload in metadata.

**UNRESOLVED:** relation between generic `AuditEvent` and Statement decision history, event vocabulary, retention/visibility, and historical display snapshot policy for submitter/decision actor.

## 15. Persistence decomposition candidates

**INFERRED:** three components: (1) Statement root/request and lifecycle pointer, (2) immutable frozen content and/or immutable manifest, (3) append-only decision/supersession history. Root may retain exact report request identity; content may retain bounded labels/snapshots; UUIDs remain authoritative.

**INFERRED:** Statement components do not own/mutate PPCT, timetable, overlay, execution, or progress/debt; content/manifest is not new mutable operational truth.

**UNRESOLVED:** tables, cardinalities, immutable constraints, serialization/storage, referential topology, indexes, deletion/retention, and derived-state versus guarded-CAS state design.

## 16. Failure model

**CONFIRMED:** missing/ambiguous provenance and `BLOCKED` fail closed; they cannot be omitted, repaired, rebound, credited, or made into trustworthy official totals.

**INFERRED:** fail the relevant command without creating or mutating authoritative Statement state. Submission should fail when reporting is blocked, submit authorization fails, an accepted idempotency identity conflicts, or submission CAS/concurrency loses. Approval should fail when approval authorization fails, the authenticated approver is the persisted submitter, or approval CAS/concurrency loses. Return only bounded diagnostics.

**UNRESOLVED:** external error contract, retryable versus terminal failures, diagnostic visibility, and draft/preflight (current reporting has no mutable draft).

## 17. Performance/bounds

**CONFIRMED:** live reporting has finite explicit roots, one AcademicYear and range wholly inside it; no wildcard school-wide selector. Sources set no numeric root/day cap, public pagination, Statement size, or retention limit.

**INFERRED:** frozen Statement reads should not replay all live upstream facts; frozen detail/manifest requires bounded representation and indexes selected later.

**UNRESOLVED:** maximum detail/content, attachment policy, retention/archive, pagination/export/cache, read SLO, and numeric limits.

## 18. Scenario consistency matrix

| Scenario | Required outcome / classification |
| --- | --- |
| PASS roots only | INFERRED: eligible after all command gates. |
| One covered root BLOCKED | CONFIRMED: never trustworthy combined total; INFERRED: deny submission. |
| Later PPCT/timetable/overlay/execution correction | CONFIRMED: live may change; existing Statement does not. |
| MAKEUP across periods | CONFIRMED: source/actual coordinates; one obligation only. |
| Special Activity | CONFIRMED: excluded from curricular Statement totals absent authorization. |
| Same submit retry | UNRESOLVED identity; INFERRED same-key/same-fingerprint replay. |
| Same key, changed submit | INFERRED conflict, not second/mutated Statement. |
| Submit race | UNRESOLVED: whether competing submits are duplicates, versions, or distinct Statements depends on the accepted Statement identity and duplicate policy; any later accepted same-command identity must have deterministic concurrency behavior. |
| Submitter approves | CONFIRMED deny; INFERRED compare UUIDs transactionally. |
| Two approvers race | UNRESOLVED decision model; INFERRED CAS/unique gate. |
| Rejection then correction | UNRESOLVED new Statement/resubmission policy; never mutate old content. |
| Actor renamed/deactivated | INFERRED UUID plus bounded display snapshot; exact policy unclosed. |

## 19. S1-S24 decision matrix

| ID | Classification | Decision / evidence gap |
| --- | --- | --- |
| S1 | UNRESOLVED | Canonical Statement identity/root is not selected. |
| S2 | INFERRED | Accepted reporting request is strong identity component; other business root unclosed. |
| S3 | UNRESOLVED | Snapshot-or-sufficient-manifest confirmed; exact frozen representation unclosed. |
| S4 | CONFIRMED | Submitted content must reproduce without later source drift; mechanism unclosed. |
| S5 | INFERRED | Require all roots PASS; BLOCKED cannot make trustworthy official totals. |
| S6 | INFERRED | Recompute/freeze in one transaction to avoid TOCTOU; not accepted yet. |
| S7 | UNRESOLVED | No Statement write isolation/snapshot decision. |
| S8 | UNRESOLVED | No canonical Statement serialization/hash policy. |
| S9 | UNRESOLVED | Semantic idempotency identity unclosed; existing replay is a pattern. |
| S10 | UNRESOLVED | Candidate states exist; accepted states/transitions do not. |
| S11 | CONFIRMED | Submitted content must not silently mutate. |
| S12 | CONFIRMED | Correction cannot mutate prior Statement; successor mechanism is inferred. |
| S13 | CONFIRMED | Approval cannot rewrite frozen content. |
| S14 | UNRESOLVED | Rejection state/event/finality unselected. |
| S15 | CONFIRMED | No self-approval required; UUID comparison is inferred implementation. |
| S16 | UNRESOLVED | Delegation/source absent. |
| S17 | UNRESOLVED | Submit/read/approve/reject/supersede/void matrix absent. |
| S18 | CONFIRMED | No CLASS/ACADEMIC_YEAR scope; action-to-scope policy unclosed. |
| S19 | INFERRED | Every subject or same-capability SCHOOL_WIDE should authorize multi-subject action; Statement rule unclosed. |
| S20 | UNRESOLVED | Actor/audit UUID evidence exists; Statement display-snapshot retention unselected. |
| S21 | INFERRED | Audit all requested outcomes; generic audit/denial is only current authority. |
| S22 | INFERRED | Reuse idempotency/CAS/transaction patterns; exact design unclosed. |
| S23 | INFERRED | Root + immutable content/manifest + decision history fits boundary. |
| S24 | UNRESOLVED | Numeric bounds, retention, read behavior absent. |

## 20. CONFIRMED decisions

1. Reporting is current-authoritative and downstream; Statement is later immutable official boundary.
2. Historical Statement cannot silently drift/mutate after upstream correction; it needs immutable snapshot or sufficient immutable manifest.
3. `BLOCKED` data cannot yield trustworthy official totals; ADR-041 MAKEUP and Special Activity semantics remain intact.
4. Approval cannot rewrite content; submitter cannot approve own Statement.
5. Capability is explicit/fail-closed. Existing approval keys do not authorize this workflow; CLASS and ACADEMIC_YEAR scopes do not exist.

## 21. INFERRED candidates

1. Freeze canonical detail/reconciled aggregates plus exact immutable provenance manifest; correct via new immutable successor.
2. Require all roots PASS, recompute/freeze in one transaction, and use idempotency plus CAS/uniqueness.
3. Use per-subject authorization or same-capability SCHOOL_WIDE for multi-subject action.
4. Use append-only decision history and retain UUID plus bounded display metadata, never display data as identity.

## 22. UNRESOLVED Product Owner decisions

1. Statement business identity and duplicate/version policy.
2. Snapshot, manifest, or hybrid; canonical payload/hash policy.
3. Lifecycle, rejection finality, withdrawal/void, correction/supersession.
4. Submit/read/approve/reject/supersede/void capabilities and scopes; whether existing approval keys are bound, replaced, or unused.
5. Delegation source and no-self-approval edge cases.
6. Isolation, idempotency/fingerprint, CAS/concurrency, decision race.
7. Statement history versus audit, actor display/visibility/retention, failure response.
8. Detail size, performance/read/export/pagination, retention and numeric limits.

## 23. Recommended next slice

Run a separate Product Owner decision-closure audit before implementation. Close every item in section 22 and create an Accepted ADR only when scope/capability/lifecycle/freeze/concurrency decisions are source-backed. Then authorize a narrow persistence foundation and, later, a separate command/control-plane slice. Do not make ADR-041, live Reporting Projection, upstream facts, or existing approval capability names carry missing authority.
