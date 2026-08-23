# LOCAL-FC-05I0D — Personal Submission / Approval Snapshot Decision Closure

## 1. Status / authority

**Status: ACCEPTED / DECISION CLOSED.** Product Owner decisions D1–D18 are accepted for the V1 **PERSONAL** Reporting Statement. This is documentation only: it authorizes no implementation, schema/migration/Prisma, controller/service/runtime, capability catalog/seed, deployment, staging, commit, or push.

`STATEMENT_MODE = PERSONAL`: one authenticated submitter owns one Statement revision. It is not an organizational multi-root report; client-selected roots never establish personal completeness.

## 2. Baseline

Canonical base: `67fa8fff2368f12b821815e4b21d0e8e8e5624fc`. Expected branch: `docs/local-fc-05i0d-submission-approval-decision-closure`.

## 3. Pre-existing confirmed authority

Inspected: 05I0 audit, ADR-027, ADR-041, 05H0D, 05A0, Phase 01 Identity/Access, ADR-008, and current ReportingProjection, ProgressDebt, TeachingAssignment, authorization, capability catalog, AuditService, idempotency/CAS/reversal patterns, and Prisma schema as implementation evidence only.

Reporting remains current-authoritative and downstream; canonical detail exclusively supplies aggregates; BLOCKED is fail-closed; MAKEUP preserves source/original accounting and actual execution evidence; responsible teacher differs from actual teacher; and old official content cannot silently drift. ADR-008 supplies explicit active-grant, server-normalized PERSONAL, SCHOOL_WIDE coverage and default-deny semantics. These remain upstream authority, not reinterpreted here.

## 4. Product Owner PERSONAL decision

V1 is a personal immutable official-record family. The authenticated submitter and historical date-effective `responsibleTeacher` semantics determine scope. `actualTeacher` is evidence only; it never transfers TeachingAssignment ownership or personal curricular responsibility.

## 5. Accepted decisions D1–D18

| ID | Accepted decision |
| --- | --- |
| D1 | Logical PERSONAL Statement series key is `statementProfile + submitterUserId + academicYearId + fromCivilDate + toCivilDate`. `statementProfile` is a versioned business discriminator. Each immutable Statement UUID is exactly one revision in one series. Series identity is not UUID, semantic hash, requestKey, lifecycle token, display/title, current assignment, generated/submitted time, or `evaluatedAt`. |
| D2 | Submit only fully trustworthy authoritative PERSONAL projection: all included scope PASS, no intersecting BLOCKED source omitted, all aggregates available, and no partial combined total represented complete. Otherwise fail closed with no Statement. |
| D3 | Freeze a **HYBRID immutable snapshot plus provenance manifest**: snapshot/profile/serializer version, accepted input, ordered canonical detail, reconciled aggregates, ADR-041 provenance, submitter UUID, bounded display evidence, semantic hash, and separate operational timestamps. Normal history reads frozen evidence, never current heads. |
| D4 | `REPORTING_STATEMENT_SNAPSHOT_V1` uses SHA-256 over versioned canonical UTF-8 JSON. Semantic hash proves frozen semantic content/integrity only; it never proves Statement/revision/series identity, current authority, idempotency, uniqueness, or lifecycle. |
| D5 | Official submit uses one outer `SERIALIZABLE` transaction: authenticate; authorize; normalize series; normalize deterministic client command intent; resolve requestKey/fingerprint; replay a prior same accepted command without new reporting/as-of; only for a new command pin one server command-clock `asOfInstant`; enforce series guards; resolve tx-aware personal projection with that exact instant; PASS eligibility; canonicalize/freeze/hash; persist immutable revision and series/lineage; history; success audit; commit. No nested projection transaction or later clock read may change new-command truth. |
| D6 | States: `SUBMITTED`, `APPROVED`, `REJECTED`, `SUPERSEDED`; no persisted DRAFT, WITHDRAWN, or VOID. `SUBMITTED -> APPROVED|REJECTED`; `APPROVED -> SUPERSEDED` only through approved successor. REJECTED and SUPERSEDED are terminal/readable. |
| D7 | Approval/rejection are immutable append-only domain decisions. Root/series may hold guarded state/version tokens for reads; state and history reconcile exactly. A transition and history write are atomic. |
| D8 | Frozen content is never edited. Rejection then valid resubmit creates a new successor revision in the same series. Approved correction creates a new successor revision; predecessor remains current approved until successor approval. |
| D9 | Every mutating command uses command-specific `requestKey + deterministic fingerprint`: same pair replays, changed fingerprint conflicts. Fingerprint is normalized client command intent and excludes server-pinned asOf, generated UUID/timestamps/token, audit/history IDs, and post-execution semantic hash. It is distinct from series, UUID/revision, and semantic hash. |
| D10 | Future `REPORTING_STATEMENT_SUBMIT` is PERSONAL only, normalized to authenticated user. Future `REPORTING_STATEMENT_READ` is PERSONAL/SUBJECT/SCHOOL_WIDE: owner PERSONAL; reviewer needs every frozen subject; same-key SCHOOL_WIDE covers subject and reads any. Existing `APPROVAL_PRINCIPAL` or `APPROVAL_VICE_PRINCIPAL` authorizes approve/reject at SCHOOL_WIDE. No CLASS/ACADEMIC_YEAR scope. |
| D11 | Approval and rejection require approver UUID different from persisted submitter UUID, including principal/vice-principal personal Statements. No delegation in V1; lack of a different authorized approver fails closed. |
| D12 | UUID is authoritative identity. Freeze at least displayName and staffCode when available for readability; display evidence never authorizes and later rename/deactivation cannot rewrite it. |
| D13 | Statement domain history is business provenance; sanitized AuditEvent is cross-cutting audit. Success atomically writes business state/history/audit. Denial writes bounded authorization audit only. Canonical snapshot payload never enters AuditEvent metadata. |
| D14 | Exact lifecycle token/CAS controls decisions and successor transitions. One race winner is authoritative; same accepted retry may replay; competing commands conflict. No two terminal decisions for one submitted revision, two unresolved current SUBMITTED revisions, or two non-superseded APPROVED revisions may coexist in a series. |
| D15 | No V1 physical deletion. Frozen evidence serves historical reads; current-approved selection follows accepted series/revision lifecycle, never latest `createdAt`. Numeric limits, archive/export/pagination/SLO/long-term retention defer. |
| D16 | Sequence: Personal Reporting Projection prerequisite; persistence foundation; submit/read/approve/reject control plane; cross-domain stale/concurrency/replay/historical-drift E2E; Core Backend Freeze; then UI. |
| D17 | One series permits at most one unresolved current SUBMITTED and at most one non-superseded current APPROVED. A second non-idempotent submit during SUBMITTED conflicts. On successor approval, successor APPROVED, predecessor SUPERSEDED, series current authority, history, and audit occur atomically. Future persistence must enforce these transactionally/database-backed, not best-effort; no physical table/index is selected now. |
| D18 | Official submit never accepts client-controlled `asOfInstant`. After idempotency establishes a genuinely new command, server pins exactly one command-clock instant, passes it unchanged to the authoritative PERSONAL resolver, and retains it in frozen input/manifest. A replay returns its original frozen as-of and does not pin/re-resolve. Client body/query cannot override it; source drift fails stale/conflict, never changes new-command as-of or yields mixed content. Existing live/preflight API semantics are unchanged. |

## 6. PERSONAL scope derivation analysis

Current ReportingProjection accepts client explicit `AcademicYear + SchoolClass + Subject` roots, resolves whole roots, date-filters detail and sums whole-root counts. It retains responsible/actual teacher and original assignment provenance but does not derive scope from submitter, filter canonical detail by date-effective responsible teacher, or recompute aggregates. TeachingAssignment provides `teacherUserId`, `validFrom`, `validUntil`, and effective replacement history, but is not composed into personal reporting.

### Explicit determination: PERSONAL REPORTING PREREQUISITE REQUIRED

Exact personal reporting requires server-derived responsibility scope, filtering only canonical PASS detail by accepted date-effective `responsibleTeacher`, and recomputing aggregates solely from that filtered detail. It cannot include/exclude whole roots: a teacher may own only part of a root/range. SAME_SUBJECT_SUBSTITUTION stays with responsible teacher; MAKEUP remains one original obligation whose ownership follows original curricular responsibility; actualTeacher never transfers it.

If a candidate underlying root intersects that server-derived scope and is BLOCKED, personal scope remains fail-closed: do not drop it, infer safe detail, or expose partial combined totals. A root wholly outside scope is not included merely because a client supplied it. This composition is reporting semantics, not Statement logic, and must be a separately closed tx-aware, non-persistent, no-lifecycle slice.

**Zero-scope remains unresolved for that prerequisite:** where teacher has no date-effective curricular responsibility in range, it must source-test and choose either authoritative empty zero aggregate or invalid/non-submittable request. 05I0D chooses neither; the later choice must agree across personal preflight, submit eligibility, series identity, and later UI.

## 7. Lifecycle / series transition matrix

| Series/revision condition | Command | Required result |
| --- | --- | --- |
| no current SUBMITTED | eligible non-idempotent submit | new immutable SUBMITTED revision in normalized series |
| current SUBMITTED | same requestKey/fingerprint | authoritative replay; no revision |
| current SUBMITTED | other submit | conflict |
| SUBMITTED | authorized distinct actor + exact token approve | APPROVED; current approved series authority |
| SUBMITTED | authorized distinct actor + exact token reject | REJECTED; terminal |
| REJECTED | later valid submit | new successor SUBMITTED revision in same series |
| APPROVED | corrected submit | new successor SUBMITTED; predecessor remains current APPROVED |
| approved successor | exact accepted approval | successor APPROVED + predecessor SUPERSEDED + current authority + history/audit atomically |
| terminal/old revision | mutate or alternate terminal decision | conflict/reject; frozen evidence readable |

## 8. Authorization matrix

| Command/read | Capability / scope | Rule |
| --- | --- | --- |
| submit | `REPORTING_STATEMENT_SUBMIT`, PERSONAL | server-normalized authenticated submitter contributes to series key |
| own read | `REPORTING_STATEMENT_READ`, PERSONAL | persisted owner only, including a future valid zero-subject Statement |
| non-owner read with subjects | `REPORTING_STATEMENT_READ`, every frozen SUBJECT or same-key SCHOOL_WIDE | all represented subjects required |
| non-owner read with zero subjects | SUBJECT-only grant | fail closed: no subject resource exists, so the every-subject rule cannot succeed vacuously |
| any read | `REPORTING_STATEMENT_READ`, SCHOOL_WIDE | allowed, including a future valid zero-subject Statement |
| approve/reject | `APPROVAL_PRINCIPAL` or `APPROVAL_VICE_PRINCIPAL`, SCHOOL_WIDE | exact token and UUID separation of duty |

No title, role, membership, AdditionalDuty, TeachingAssignment, SYSTEM_ADMIN, UI, CLASS, or ACADEMIC_YEAR scope authorizes. Zero-scope submission validity remains deferred; this only closes its read authorization if a future accepted prerequisite permits such a frozen Statement.
## 9. Snapshot / hash canonicalization contract

Semantic payload includes snapshot/profile/serializer version; accepted `statementProfile`; submitterUserId; academicYearId; inclusive canonical civil from/to dates; exact server-pinned official asOfInstant; server-derived scope manifest; ordered canonical detail; reconciled aggregates; and ADR-041 immutable provenance.

It excludes Statement UUID/statementId, series lifecycle revision/token, requestKey, fingerprint, audit/history IDs, generatedAt, submittedAt, volatile `evaluatedAt`, and incidental persistence metadata. Distinct legitimate revisions may share a hash **only if every semantic payload field is byte-semantically identical, including pinned asOfInstant**. Hash equality is permitted but never Statement/revision/series identity, idempotency, uniqueness, or current authority.

`REPORTING_STATEMENT_SNAPSHOT_V1` bytes are UTF-8 **without BOM**, with no insignificant whitespace and recursively lexicographically sorted object keys. Arrays preserve accepted domain order: roots by stable accepted root key; detail by `sourceCivilDate -> sourceSlotStart -> sourceSlotEnd -> occurrenceKey`. Canonical instants are exactly `YYYY-MM-DDTHH:mm:ss.sssZ`: UTC, trailing `Z`, exactly millisecond precision, no offset variants and no locale format. Civil dates remain `YYYY-MM-DD`, never UTC-midnight timestamps. Schema-defined nullable values serialize as explicit JSON `null`; schema-defined absent fields are absent by schema contract. `undefined` is not representable: any accidental runtime undefined after schema normalization is a canonicalization failure and must not be silently serialized. No secrets, incidental database order, or locale numeric formatting is permitted. Current payload uses integer counts and strings/IDs/instants; serializer version owns future numeric edge compatibility rather than inventing a domain rule.
## 10. Submission transaction topology

Within one outer SERIALIZABLE transaction: (1) authenticate; (2) authorize; (3) normalize logical series; (4) normalize deterministic client intent; (5) resolve requestKey/fingerprint; (6) if same accepted command already succeeded, return its authoritative prior result and original frozen as-of without reporting or a new clock read; (7) only for a genuinely new command pin one server-owned command-clock as-of; (8) enforce series guards; (9) resolve tx-aware PERSONAL projection using exactly it; (10) PASS eligibility; (11) canonicalize/freeze/hash; (12) persist revision and series/lineage; (13) append business history; (14) write success audit; (15) commit.

The resolver shares this transaction and exposes missing provenance, BLOCKED, source drift, or concurrency as failure. Any such failure, unavailable aggregate, authorization denial, idempotency mismatch, or series guard failure creates no revision. Concurrent same-key commands require later database-backed idempotency: one authoritative result wins and loser/retry replays that revision.
## 11. Idempotency, concurrency and CAS

Request identity is command-local and is evaluated before new server-generated semantic input. Fingerprint is normalized client intent, never pinned as-of, generated identifiers/timestamps/token, audit/history IDs, or produced hash. Same accepted key/fingerprint replays the original revision and as-of; changed fingerprint conflicts. Series guards distinguish legitimate revisions from duplicate commands. Concurrent submissions cannot create two unresolved SUBMITTED revisions; concurrent successor/approval paths cannot leave two non-superseded APPROVED revisions. Exact-token CAS plus transactional/database-backed enforcement are required later; semantic-hash uniqueness is prohibited.
## 12. Correction / supersession

Correction derives new live personal truth and freezes a new revision with explicit lineage. SUBMITTED successor does not supersede approved predecessor. Only accepted successor approval atomically replaces current-approved authority. Old rejection/supersession and every decision remain historically readable; upstream changes never edit a frozen revision.

## 13. Domain history / audit

Business history must prove revision creation, predecessor/successor linkage, approval, rejection, successor-caused supersession, actor UUID/display evidence, request identity, exact lifecycle token, and for submission the server-pinned command as-of. AuditEvent stays sanitized cross-cutting audit and holds no canonical snapshot payload.

## 14. Retention / historical authority

No V1 physical deletion. Rejected and superseded revisions remain readable. Frozen evidence—not current PPCT/timetable/assignment/profile heads—renders history. Series lifecycle selects current approved authority, never a latest-row shortcut.

## 15. Scenario consistency matrix

| Scenario | Required result |
| --- | --- |
| P1–P4 responsibility intervals | include only date-effective responsible detail; reaggregate; P4 separates sequential owners. |
| P5 substitution; P6 MAKEUP; P7 supervision/debt | responsible ownership/original obligation preserved; actual evidence never transfers responsibility or falsely completes debt. |
| P8 blocked root | intersecting BLOCKED root fails closed; no omission/partial total. |
| P9 same retry; P10 changed key; P11 submit race | replay; conflict; series/idempotency guards determine one authoritative outcome. |
| P12 principal own; P13 vice own; P14 principal→vice; P15 decision race | self deny; explicit distinct UUID authorization; one CAS winner. |
| P16 correction; P17 upstream correction; P18 rename; P19 subjects; P20 reader scopes | successor rules; old freeze unchanged; display frozen; all subject or SCHOOL_WIDE reader authority. |
| P21 unresolved SUBMITTED + non-idempotent submit | conflict. |
| P22 exact retry | authoritative replay with original frozen as-of; no reporting, clock pin, or new revision. |
| P23 REJECTED then resubmit | new successor in same series. |
| P24 APPROVED + corrected SUBMITTED | predecessor remains current approved. |
| P25 successor approved | successor APPROVED/predecessor SUPERSEDED atomically. |
| P26 concurrent successor submits | never two current unresolved SUBMITTED revisions. |
| P27 concurrent approval paths | never two non-superseded APPROVED revisions. |
| P28 client old as-of | ignored/rejected by command contract; new official submit uses only server clock, while replay returns original frozen as-of. |
| P29 successive revisions with equal business detail | hashes may match only when every hashed field, including pinned as-of, is byte-semantically identical; UUID/revisions remain distinct. |
| P30 zero responsibility | prerequisite decision; no Statement-layer inference. If later valid zero-subject Statement, SUBJECT-only non-owner read fails closed; owner PERSONAL/SCHOOL_WIDE remain possible. |
| P31 start/stop inside root | filter canonical personal detail then reaggregate. |
| P32 intersecting root BLOCKED | filtering cannot manufacture personal PASS. |

P1–P8, P19, P30–P32 depend on the prerequisite closure.

## 16. Implementation entry criteria

Before Statement persistence: (1) Personal Reporting Projection CLOSED/GREEN; (2) zero-scope submission behavior closed and, if valid, zero-subject read fail-closed semantics tested; (3) server-derived responsibility tested; (4) partial-root handover tested; (5) BLOCKED propagation tested; (6) tx-aware resolver exists; (7) official server-pinned as-of/replay contract exposed. Persistence must enforce series identity, immutable revision/lineage, one current SUBMITTED, one non-superseded APPROVED, atomic successor approval/supersession, CAS token, command idempotency, immutable snapshot/hash, and decision history transactionally/database-backed.

## 17. Residual deferrals

Physical schema/indexes, API/DTO/error contract, rationale visibility, numeric limits, archive/retention/export/pagination/SLO, multi-approver quorum, delegation, Special Activity history, and UI defer. No implementation is claimed.

## 18. Re-entry triggers

Re-enter if prerequisite cannot preserve ADR-041 detail/aggregate semantics, zero-scope choice requires authority, responsibility semantics change, or delegation/quorum/retention is proposed, before runtime work.

## 19. Non-authorization

This preserves ADR-041, PPCT, timetable, overlays, execution, progress/debt, MAKEUP, Special Activity, responsible/actual distinction, and BLOCKED semantics. It grants no production authority.
