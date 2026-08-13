# LOCAL-FC-05A0D — PPCT Decision Closure

## 1. Status and authority

**Status:** Accepted architecture decision closure; documentation only.

This closure follows merged `LOCAL-FC-05A0` (PR #37, CI #168) and closes only the PPCT questions required to make `LOCAL-FC-05A1` architecture-ready. The product-owner decisions recorded here are the project architecture authority for the closed points. They do not retroactively turn matters that 05A0 correctly classified as **INFERRED** or **UNRESOLVED** into explicit requirements from specification v1.2.

05A0D authorizes no schema, migration, API, contract, seed, capability catalog, import, runtime, UI, CI/CD, deployment or data change. Implementation requires a separately authorized task and branch.

## 2. Baseline

- Canonical repository: `hvtnguyenson-code/baogiang-damsan`
- Canonical baseline: `4ef95f3a236ff02f6a8d7b5cad93118f45d491c7`
- Predecessor: merged `LOCAL-FC-05A0` through PR #37 / CI #168
- Related decision: ADR-027, accepted by this closure once the consistency gates pass

## 3. Closed decisions

| ID | Previous 05A0 state | 05A0D decision | Invariant / consequence | Re-entry trigger |
|---|---|---|---|---|
| D1 — Aggregate scope | Year, subject and grade were supported; class/program scope and sharing were unresolved. | One logical PPCT plan is owned by exactly `AcademicYear + Subject + Grade`. `SchoolClass`, `TeachingAssignment`, `TimetableVersion` and `AcademicCalendarVersion` are not owners. | A single stable logical plan represents the canonical curriculum for that combination; there is no class-owned PPCT master. | Real evidence of multiple programs/tracks/books or class-specific curricula. |
| D2 — Shared plan and progress | A shared master with class-specific consumption was inferred, not approved. | All matching classes consume versions of the same logical master. Progress is class-specific and scoped by at least `AcademicYear + SchoolClass + Subject`, resolving an exact PPCT version association. | A class being ahead or behind does not create a class plan/version. No global `completed` flag belongs on a PPCT item. | Evidence that a class follows a genuinely different curriculum, not merely different progress. |
| D3 — Item identity and cardinality | Sequence was known business language; cross-version identity, split/merge and execution cardinality were unresolved. | `sequence` / `Tiet_PPCT` is ordering, not identity. Every logical item has an immutable UUID; each version contains immutable item revisions. Stable UUID may carry forward when the obligation is semantically preserved. Split creates new child UUIDs; merge creates a new UUID; both retain explicit lineage. | One item is one distributable teaching-period obligation. Multi-period topics use multiple ordered items. One normal occurrence consumes at most one next item; one class-stream item completes exactly once; make-up completes the original without consuming a new item. Historical items are never erased or repurposed. | Authoritative requirements for multi-item-per-period or multi-period-per-item semantics. |
| D4 — Lifecycle | Version retention was supported, but lifecycle/publication/correction semantics were unresolved. | Lifecycle is `DRAFT → PUBLISHED → SUPERSEDED`. Only `DRAFT` is editable. `PUBLISHED` and `SUPERSEDED` are immutable; `SUPERSEDED` is terminal for future planning. A published correction is a new version. | Replacement preserves the previous version and every historical reference. No delete, unpublish, reactivate or second PPCT approval workflow is introduced. | An authoritative policy requiring a different publication or approval workflow. |
| D5 — Calendar and week placement | Calendar ownership and week allocation were unresolved. | PPCT belongs to `AcademicYear`, not `AcademicCalendarVersion`. Curriculum sequence is canonical; expected week placement is a downstream class-specific projection over association, effective business calendar, timetable/operations and progress. | Calendar-version changes do not themselves require PPCT versions. `AcademicWeek` is neither PPCT ownership nor item identity; an unapproved workbook week column is not core semantics. | Authoritative policy that makes week placement part of the canonical curriculum plan. |
| D6 — Association and history | A date-effective class+subject association was the safest candidate, but exact cutover was unresolved. | Each `AcademicYear + SchoolClass + Subject` stream resolves a non-overlapping civil-date interval to an exact matching PPCT version. Switching versions is prospective/date-effective. | The version must match year, subject and the class grade for that year. Execution, fulfillment/debt and reporting pin exact version, item, stream and relevant association/source. Historical reads never select “whatever is current now.” No PPCT fields are added to `TimetableEntry`. | New evidence requiring a different stream or effectivity model. |
| D7 — Authorization | `PPCT_MANAGE` and scope choices were only candidates; 05A0 proposed group/school scopes. | The distinct future capability is `PPCT_MANAGE`, allowed only at `SUBJECT` and `SCHOOL_WIDE`. | No inference from `SUBJECT_GROUP`, role/title, `SYSTEM_ADMIN`, membership, duty or TeachingAssignment. Subject resources are resolved server-side from the targeted domain resource; arbitrary client body/query input is not trusted. This decision does not seed or implement the capability. | Authorization requirements incompatible with `SUBJECT` / `SCHOOL_WIDE`. |
| D8 — Import boundary | Import was anticipated, but format and whether it belonged in 05A1 were unresolved. | PPCT import is deferred to a separate slice and separate architecture/security audit. | 05A1 encodes no workbook layout, sheet/alias/column mapping, checksum, profile, raw-file contract, replay namespace, duplicate rule or timetable-import assumption. It may create only canonical persistence primitives usable by manual/domain persistence and future integration. | An approved PPCT workbook/template and workflow. |

## 4. Domain model implications

These are conceptual boundaries, not accepted physical table or Prisma model names.

### Logical plan, versions and items

A stable logical PPCT plan is identified by `AcademicYear + Subject + Grade`. Its versions follow `DRAFT → PUBLISHED → SUPERSEDED`; only drafts can change. A version contains immutable item revisions. Each curricular obligation has an immutable UUID distinct from its version-local order, title and metadata. A semantically preserved obligation may retain its UUID across versions. Split and merge create new identities and explicit predecessor/successor lineage; deletion from a later version never deletes historical meaning.

### Class-subject progress and exact-version binding

The shared plan does not own class progress. Each class-subject stream has its own distribution, completion and debt history and a date-effective binding to an exact PPCT version. Intervals for one stream do not overlap. A binding must match the stream's academic year and subject, and its grade must match the class grade in that year. Class progress divergence is expected and never creates a class-specific master plan.

### Historical pinning

Historical teaching execution, fulfillment/debt provenance and report evidence retain enough immutable identity to resolve the exact PPCT version, exact PPCT item UUID, class-subject stream, and relevant association/source when required. Publishing or binding a successor cannot reinterpret prior occurrences, executions, debt or approved reports. The physical snapshot/manifest strategy remains downstream work.

### Calendar independence

The plan is AcademicYear-owned and curriculum-sequenced. Calendar versions, weeks, timetables, operational facts and current class progress participate in the downstream expected-placement projection; they do not own the PPCT. A calendar-version change alone neither changes PPCT identity nor requires a new PPCT version.

### Authorization and import

Future management uses the distinct `PPCT_MANAGE` capability at `SUBJECT` or `SCHOOL_WIDE`, with ADR-008 exact-scope, server-resolved-resource and default-deny semantics. 05A0D does not implement it. Import is wholly deferred; no timetable XLSX contract is inherited by analogy.

## 5. 05A1 entry-criteria closure matrix

| Existing 05A1 entry criterion | Closing decision | Closure result |
|---|---|---|
| 1. Aggregate owner/key + sharing/class override | D1, D2 | `AcademicYear + Subject + Grade`; shared master; no class-owned override; class progress remains separate. |
| 2. Item identity/cardinality | D3 | Immutable item UUID, version-local revision/order, explicit split/merge lineage and one-period obligation cardinality. |
| 3. Lifecycle/publication/correction/effectivity | D4, D6 | `DRAFT → PUBLISHED → SUPERSEDED`, immutable published history, corrections by successor version and prospective date-effective class binding. |
| 4. Calendar/week relationship + class-stream association | D5, D6 | Calendar-independent plan; expected weeks are projections; non-overlapping class-subject exact-version bindings. |
| 5. Required historical references | D3, D4, D6 | Exact version, item UUID, stream and relevant binding/source are retained; successors never rewrite history. |
| 6. Capability + allowed scope types | D7 | Future `PPCT_MANAGE`; only `SUBJECT` and `SCHOOL_WIDE`; no implicit scope/capability inference. |
| 7. Import boundary | D8 | Import is excluded from 05A1 and deferred to an evidence-backed separate slice. |

All seven architecture entry criteria are closed. `LOCAL-FC-05A1 = READY` means only that its architecture entry gate is satisfied; it is not implementation authorization.

## 6. Preserved invariants

1. No downstream layer rewrites historical meaning of an upstream layer.
2. Substitution never mutates `TimetableEntry` or `TeachingAssignment`.
3. Cancellation never deletes or rewrites the base timetable.
4. Make-up fulfills an existing obligation exactly once and consumes no new item.
5. Progress/debt derives from historical facts, not a mutable counter as sole truth.
6. Submitted/approved statements do not drift with current master data.
7. PPCT supersession never reinterprets old executions, debts, occurrences or approved reports.
8. Class-level progress divergence never creates a class-specific master PPCT.
9. UI business semantics remain blocked until their core backend contracts reach `CORE BACKEND FREEZE`.

## 7. Remaining unresolved downstream questions

05A0D intentionally does not decide:

- operational overlay models and correction semantics, including move/swap;
- special-activity occupancy, content relationship, staffing and conflict policy;
- final resolved-occurrence precedence and materialization details;
- allowed actual-content divergence and downstream execution correction workflow;
- debt physical projection/ledger and reconciliation strategy;
- reporting snapshot versus immutable-manifest physical strategy;
- submission routing, delegation, approval levels and post-lock correction;
- exact API, DTO, schema, transaction, idempotency and error contracts;
- PPCT import workbook, security and replay contract;
- UI and UX.

These questions remain gates for their own slices, not for 05A1's canonical PPCT persistence foundation.

## 8. Re-entry triggers

Reopen the affected decision before implementation if any of the following appears:

- real evidence of class-specific curricula;
- multiple programs, tracks or books within one `AcademicYear + Subject + Grade`;
- multi-item-per-period or multi-period-per-item requirements contradicting D3;
- an authoritative PPCT workbook/template and approved workflow;
- policy requiring a different PPCT publication/approval lifecycle;
- authorization requirements incompatible with `SUBJECT` / `SCHOOL_WIDE`;
- authoritative policy making week placement part of canonical PPCT meaning.

## 9. Non-authorization

This closure accepts architecture only. `LOCAL-FC-05A1` must run under its own task and branch. No PPCT persistence, capability seed/catalog change, import, runtime behavior, UI, deployment or production change is included here.
