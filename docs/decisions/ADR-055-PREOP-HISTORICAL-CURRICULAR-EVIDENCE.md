# ADR-055 — Pre-operational Historical Curricular Evidence and Reconciliation

- **Status:** Accepted; `P3-010` IN_REVIEW pending parent merge/post-merge CI and `SYNC-P3-010`
- **Date:** 2026-10-02
- **Task:** `P3-010`
- **Traceability:** `T28`, `T29`, `T30`

## Context

Đam San may start the Báo giảng system after the academic year has already begun. The accepted `OPERATIONAL_START` policy deliberately separates:

- **expected historical progression** — deterministic timetable/PPCT replay; from
- **proof that teaching actually occurred** — retained execution evidence.

P1-030/P1-031 already enforce:

- pre-operational missing execution does not become debt or late merely because time elapsed;
- ordinary `confirmNormal` and `confirmMakeup` fail closed for obligations whose source date is before `operationalStartDate`;
- historical confirmed teaching must still consume the exact historical PPCT item and count toward teacher workload;
- approved/frozen `ReportingStatement` revisions never drift when later evidence or policy changes.

P3 owns the controlled retrospective evidence path.

## Decision

### D1 — Scope

P3-010 owns **pre-operational curricular historical evidence and reconciliation** only.

A P3 historical curricular row is eligible only when:

- its original/source normal opportunity has `sourceCivilDate < operationalStartDate` under the authoritative policy resolved at command time; and
- every claimed execution instant/slot is already in the past and ended.

Post-operational retrospective entry continues to use ordinary execution commands.

### D2 — Positive evidence only

P3 ingests **positive proof of teaching that actually occurred**.

Absence of an import row, a missing workbook row, an unconfirmed expected opportunity, or elapsed time:

- does not create debt;
- does not create late;
- does not create an absence/cancellation disposition;
- does not mark completion;
- does not fabricate a PPCT cursor.

Unconfirmed pre-operational expected opportunities remain outside operational debt/late counts.

### D3 — No manual progression cursor

Historical progression remains exclusively server-derived by replaying retained timetable/calendar/PPCT authority.

P3 must not introduce:

- manual initial PPCT sequence;
- caller-selected PPCT item/revision/component;
- manually supplied progression counters;
- “start from sequence N” fallback.

If replay is ambiguous or impossible, the affected row fails closed.

### D4 — Canonical business truth

Successful P3 confirmation must ultimately create/reuse the existing canonical evidence topology.

The final teaching truth is still:

- `CurricularTeachingExecution`;
- exact retained timetable/calendar/assignment coordinates;
- exact PPCT allocation/revision provenance;
- optional exact `OperationalLessonDisposition` provenance for historical same-subject substitution;
- optional exact `MakeupTeachingSchedule` provenance for historical make-up.

P3 import receipts are provenance/audit records, **not a second execution ledger**.

### D5 — Dedicated historical command path

P3-020 must add a dedicated historical preview/confirm path.

It must **not** weaken or bypass the existing guards on:

- `TeachingExecutionsService.confirmNormal`;
- `TeachingExecutionsService.confirmMakeup`.

Ordinary commands continue rejecting pre-operational source obligations.

### D6 — Historical direct/normal completion

For a historical occurrence taught in its original slot:

1. resolve the exact normal structural occurrence;
2. replay PPCT through that civil date using the canonical allocator;
3. require one deterministic `ALLOCATED` expected item;
4. derive responsible teacher and exact retained source provenance server-side;
5. create an ACTIVE `CurricularTeachingExecution(kind=NORMAL)` only after every invariant passes.

The browser/import row cannot choose canonical PPCT IDs.

### D7 — Historical same-subject substitution

If evidence proves a different teacher actually taught the original slot:

- that teacher must be date-effectively eligible for the same subject;
- P3 may atomically create/reuse the exact retained `SAME_SUBJECT_SUBSTITUTION` disposition needed by the existing execution topology;
- the resulting execution pins the responsible teacher and actual teacher separately.

Different-subject supervision does not fulfill the PPCT obligation and cannot be imported as curricular completion.

### D8 — Historical make-up already performed

P3 may ingest evidence that a pre-operational obligation was actually fulfilled later at another past slot.

For that case P3-020 may atomically create/reuse:

1. the exact historical `MakeupTeachingSchedule` provenance for the already-completed event; and
2. `CurricularTeachingExecution(kind=MAKEUP)`.

Requirements:

- original obligation resolves exactly;
- target execution date/slot is already ended;
- actual teacher is date-effectively eligible for the subject;
- retained calendar/time-slot/collision invariants pass;
- the same original obligation cannot gain two ACTIVE execution owners.

This authority is **retrospective evidence ingestion only**. It does not authorize future/public make-up scheduling. That remains `P3-030`/`P3-031`.

### D9 — PPCT component and allocation provenance

P3 reuses component-aware allocator semantics from P2-003.

For every accepted row the server derives:

- CORE vs SPECIALIZED_STUDY;
- class association;
- plan/version/item/revision;
- expected sequence;
- original occurrence key.

No component field is added to `CurricularTeachingExecution`, `TimetableEntry`, `TeachingAssignment`, or `MakeupTeachingSchedule`.

### D10 — Operational-start policy provenance

P1-030 intentionally keeps `CurricularTeachingExecution` free of an operational-start-policy FK.

P3 therefore retains command provenance in its own import receipt:

- exact `operationalStartPolicyVersionId`;
- resolved `operationalStartDate`;
- command/confirmation time;
- source artifact hash and row hash;
- actor.

Later policy corrections do not rewrite accepted historical executions or their P3 receipt.

### D11 — P3-owned persistence boundary

P3-020 is authorized to introduce exactly the persistence needed for retained import provenance, conceptually:

- `HistoricalTeachingImportBatch`;
- `HistoricalTeachingImportRow`.

They may retain:

- profile/version;
- academic year;
- source SHA-256;
- normalized row hash and row number;
- policy-version provenance;
- deterministic resolution result;
- linked execution ID;
- optional linked historical disposition/make-up schedule IDs;
- actor/timestamps and confirmation identity.

They must not store a parallel mutable completion/debt/progression truth.

Raw uploaded workbook bytes are not canonical business truth and need not be retained in PostgreSQL.

### D12 — Authorization

Historical curricular import/confirmation is a management action, not teacher self-attestation.

P3-020 must require explicit:

`TEACHING_EXECUTION_MANAGE / SCHOOL_WIDE`

for preview that exposes school-wide resolution and for confirm/correction mutations.

It must not infer authority from:

- `SYSTEM_ADMIN`;
- role/title;
- `TIMETABLE_MANAGE`;
- `PPCT_MANAGE`;
- TeachingAssignment;
- StaffSubject;
- frontend visibility.

Existing `TEACHING_EXECUTION_RECORD / PERSONAL` remains the ordinary personal evidence path and does not authorize retrospective batch import.

### D13 — Preview then confirm

P3-020 must expose a bounded two-stage workflow:

1. **preview/inspect** — read-only deterministic resolution and findings;
2. **confirm** — server re-resolves authoritative data and writes only if the confirmation contract still matches.

The client must not send trusted canonical execution/PPCT IDs back as confirmation authority.

A confirm request references server-owned batch/row identity plus concurrency/idempotency tokens.

### D14 — Atomicity and idempotency

Confirmation runs in one outer `SERIALIZABLE` transaction for the selected confirmation set.

The command must preserve:

- request key + deterministic semantic fingerprint;
- same key/same fingerprint => idempotent replay;
- same key/different fingerprint => conflict;
- exact active-obligation uniqueness;
- write + sanitized success audit in the same transaction.

If any selected row fails revalidation, the selected confirmation set writes nothing.

### D15 — Correction and reversal

Historical evidence is never edited in place.

Correction uses the existing evidence lifecycle:

- reverse the ACTIVE execution with retained reason/actor/time;
- if corrected evidence is valid, create a replacement execution linked through `replacesId`;
- create a new immutable P3 import/correction receipt for the correction action.

Previously frozen Reporting Statements are never rewritten.

### D16 — Reconciliation read model

P3-020 must provide a bounded reconciliation view over the pre-operational window.

At minimum each expected historical opportunity is classified as:

- `CONFIRMED` — exact ACTIVE canonical execution exists;
- `UNCONFIRMED` — no accepted evidence; **not debt/late**;
- `CONFLICT` — duplicate/corrupt/ambiguous evidence or authority mismatch.

The view must expose exact provenance/findings sufficient for an administrator to correct source data. A bare count is insufficient.

### D17 — Reporting and workload consequence

Once P3 creates an ACTIVE canonical `CurricularTeachingExecution`:

- existing progress/completion logic recognizes the fulfilled exact obligation;
- existing reporting/workload projections consume that canonical evidence;
- live projections may change to reflect newly confirmed history;
- previously frozen statement revisions remain byte-for-byte immutable.

P3 does not add a separate “historical workload” counter.

### D18 — Special-programme boundary

`SpecialActivityParticipationExecution` is not owned by P3.

P1-031 explicitly leaves `confirmActivity` outside the operational-start guard because P4 owns GDĐP/HĐTN-HN runtime semantics.

P3 must not create parallel historical SpecialActivity evidence or apply curricular PPCT/debt rules to P4 activity executions.

### D19 — Fail-closed conditions

P3 confirmation fails closed for at least:

- missing/ambiguous/corrupt OPERATIONAL_START authority;
- source date not PRE_OPERATIONAL;
- missing exact retained timetable opportunity;
- ambiguous calendar/week/slot resolution;
- unresolved class/subject/teacher identity;
- missing date-effective teaching responsibility;
- failed same-subject eligibility for substitution/make-up;
- allocator not exactly ALLOCATED;
- PPCT provenance mismatch;
- collision or duplicate ACTIVE obligation owner;
- stale preview/confirmation token;
- request replay conflict.

There is no force/override switch that bypasses structural provenance.

### D20 — Downstream tasks

Closing P3-010 unlocks both:

- `P3-020` — implementation of historical import/reconciliation runtime; and
- `P3-030` — public make-up scheduling re-entry architecture.

`P3-031` remains behind P3-030.

## Consequences

- P3-020 may add bounded schema/API/UI required by D11–D16.
- Existing ordinary execution semantics remain unchanged.
- Existing no-auto-debt semantics remain unchanged.
- P3 historical confirmation becomes explicit, reviewable and auditable rather than manual cursor correction.
- Production remains PRE-OPERATIONAL.
