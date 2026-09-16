# P1-031B — Operational-Start Scheduled-Authority Supersession Architecture

## 1. Task authority and scope

- **Task:** `P1-031B` — Operational-start scheduled-authority supersession architecture
- **Status:** `IN_REVIEW`
- **Dependency:** `P1-031` — `CLOSED`
- **Traceability:** `T28`, `T30`
- **Dedicated branch:** `docs/operational-start-scheduled-authority-supersession-031b`
- **Canonical starting main:** `f1b160be25045d0f4c661e154ece24c92a3e0fc9`
- **Controlling authority:** ADR-046, ADR-049, P1-030 and P1-031
- **Related planned correction:** `P1-031A` on `fix/operational-start-authority-continuity-031a`; remote head `6b7b804a5e82fc54fb280424e82b66d4b48db955` was inspected as evidence only and is not merged or copied into this branch. It is `PLANNED` because dependency P1-031B is not yet `CLOSED`.

This task is documentation and architecture only. It authorizes no runtime, Prisma schema, migration, API, UI, deployment, VPS, production policy or production-data mutation.

## 2. Product Owner decision — locked

**PRODUCT OWNER DECISION:** `OPERATIONAL_START` uses a **distinct retained scheduled-authority supersession lifecycle** for a published authority that has never become effective.

**CORRECTION IS NOT EXPANDED.** `CORRECTION` retains its ADR-046/ADR-049 meaning: correction of an erroneous retained assertion or historical truth, with mandatory reason and `correctsVersionId` lineage. A legitimate planned change to a never-effective scheduled authority is not a correction and must not use `REVERSED`.

This decision applies coherently to every source satisfying `businessCivilDate() < source.effectiveFrom`, not only the equality example. Creating two meanings for never-effective sources would make command choice depend on an incidental equality rather than lifecycle truth.

## 3. Problem and audited current model

ADR-049 accepts initial publication when `effectiveFrom <= operationalStartDate`. Therefore this state is valid:

```text
businessDate = 2026-09-10
source.effectiveFrom = 2026-09-20
source.operationalStartDate = 2026-09-20
source.status = PUBLISHED
```

Generic `REPLACE` requires a later successor start so the source's inclusive interval can close on the previous civil date. ADR-049 continuity requires the successor authority no later than the operational boundary. At equality, `replacementEffectiveFrom > 2026-09-20` and `replacementEffectiveFrom <= 2026-09-20` cannot both hold.

Current repository evidence confirms the representational gap:

- `BusinessPolicyVersionStatus` contains only `DRAFT`, `PUBLISHED`, `REVERSED`;
- the source interval is inclusive and constrained by `effectiveUntil IS NULL OR effectiveUntil >= effectiveFrom`;
- the GiST exclusion constraint prevents overlapping `PUBLISHED` intervals in one stream;
- published payload, validator, `effectiveFrom` and lineage are immutable; only a still-open `PUBLISHED.effectiveUntil` may close prospectively;
- `replacesVersionId` requires a strictly earlier, closed ancestor interval in resolver validation;
- `correctsVersionId` requires a `REVERSED` ancestor and carries correction meaning;
- the resolver selects only exact-date `PUBLISHED` candidates and never uses latest-row fallback;
- commands use actor-scoped `commandId`, a semantic fingerprint, a `SERIALIZABLE` transaction, bounded retry and same-transaction success audit.

Leaving both rows `PUBLISHED`, shortening the source before its immutable start, rewriting its start, deleting it, or reusing `REVERSED` would violate accepted invariants. A new retained state and lineage are therefore required.

## 4. Canonical command and semantic contract

The canonical command is:

```text
SUPERSEDE_SCHEDULED_AUTHORITY
```

The service operation is `supersedeScheduledAuthority`; its successful stable outcome is `SCHEDULED_AUTHORITY_SUPERSEDED`.

The command is distinct from `PUBLISH`, `REPLACE`, `RETIRE` and `CORRECT`. Its semantic request contains:

- `commandId`;
- target `sourceVersionId` from the route/resource identity;
- the new strict typed `OPERATIONAL_START/v1` payload;
- an optional bounded operator note/reason for audit presentation.

It does **not** accept caller-selected `effectiveFrom` or `effectiveUntil`. The server derives both successor bounds: `effectiveFrom = source.effectiveFrom`, `effectiveUntil = null`.

### 4.1 Exact HTTP mutation contract

P1-031A must add this route following the existing Business Configuration version-command convention:

```text
POST /api/business-configuration/policy-versions/:id/supersede-scheduled-authority
HTTP 200
```

`:id` is the UUID of the source version and is parsed with `ParseUUIDPipe`. The controller remains under its existing class-level authority:

```text
@RequireCapability('BUSINESS_CONFIGURATION_MANAGE', { scope: 'SCHOOL_WIDE' })
```

The new method uses exactly `@HttpCode(200)` and `@UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)`. No new capability or resource-derived authorization is introduced.

The dedicated DTO is `SupersedeScheduledAuthorityDto`:

```ts
export class SupersedeScheduledAuthorityDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  commandId!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional() @IsString() @MaxLength(1000)
  reason?: string;
}
```

The global validation pipe's `whitelist: true` and `forbidNonWhitelisted: true` contract is mandatory. The DTO has no `effectiveFrom`, `effectiveUntil`, `businessDate`, status, source/successor lineage ID, actor or timestamp field; supplying any of them is rejected before service mutation. `reason`, when present, is trimmed, stored as immutable terminal evidence and mirrored into audit metadata; blank-after-trim is normalized to `null`.

The stable success body follows `BusinessPolicyMutationResult` conventions exactly:

```json
{
  "outcome": "SCHEDULED_AUTHORITY_SUPERSEDED",
  "versionId": "<successor-version-uuid>"
}
```

`versionId` is always the newly created successor identity. The source identity remains the route `:id`; no redundant client-supplied identity is accepted.

### 4.2 Shared command/outcome types

`packages/contracts` must add:

```ts
export interface OperationalStartPolicyPayloadV1 {
  operationalStartDate: CivilDateString;
}

export interface SupersedeScheduledAuthorityRequest {
  commandId: string;
  payload: OperationalStartPolicyPayloadV1;
  reason?: string;
}
```

The DTO still receives an object and the code-defined `OPERATIONAL_START/v1` validator enforces the exact single-field payload at runtime. `BusinessPolicyMutationOutcome` gains only `SCHEDULED_AUTHORITY_SUPERSEDED`; the existing `BusinessPolicyMutationResult` shape remains `outcome + versionId + optional streamId`. The Web API client eventually added by P1-032 must send only `SupersedeScheduledAuthorityRequest` to the exact route above.

## 5. Exact source eligibility

The command may proceed only when all predicates below hold in the mutation transaction:

1. source stream family is exactly `OPERATIONAL_START`;
2. stream resource is exactly the same retained `ACADEMIC_YEAR` as the source;
3. source status is exactly `PUBLISHED`;
4. source `effectiveUntil IS NULL`;
5. a single captured server-owned HCM civil date satisfies `businessCivilDate() < source.effectiveFrom`;
6. therefore the source has never governed an elapsed or already-started civil date;
7. source validator version and payload validate; current `operationalStartDate` is a civil date;
8. source is the unique open scheduled authority for the stream, has no existing replacement/correction/scheduled-successor child that makes the target stale, and stream authority is neither ambiguous nor corrupt;
9. the successor payload validates under the current family validator;
10. the same AcademicYear has exactly one active `AcademicCalendarVersion`, and the new `operationalStartDate` lies inside it.

`businessDate == source.effectiveFrom` is too late. The first effective civil date has begun at HCM midnight, so scheduled supersession is forbidden even though the day has not elapsed. From that point the source belongs to the effective-authority lifecycle.

Eligibility is server-owned. No client clock, request timestamp, browser date or supplied business date may decide it.

## 6. Source terminal state

The new persisted status is:

```text
SUPERSEDED_BEFORE_EFFECTIVE
```

Its meaning is exact: the row was legitimately published, but a planned change superseded it atomically before its first effective HCM civil date.

The source:

- remains retained permanently;
- keeps its original payload, validator version, `effectiveFrom` and open `effectiveUntil = null` unchanged;
- retains original publication actor/time evidence;
- gains dedicated terminal actor/time evidence and the normalized optional supersession reason;
- is non-authoritative and is never selected by the resolver;
- can never return to `DRAFT` or `PUBLISHED`;
- cannot be retired, replaced, corrected, republished or superseded again;
- remains inspectable through history and audit.

`REVERSED` remains reserved for correction and is not reused.

## 7. Successor effectivity and payload

The scheduled successor must satisfy:

```text
successor.effectiveFrom  = source.effectiveFrom
successor.effectiveUntil = null
newOperationalStartDate > businessDate
successor.effectiveFrom <= newOperationalStartDate
```

Exact same `effectiveFrom` is accepted and required. The old source never became effective; the successor occupies the same scheduled authority start. This creates no gap and no overlapping authority because the source leaves `PUBLISHED` atomically before the successor is inserted as `PUBLISHED` in the same transaction.

The new `operationalStartDate` must be a valid HCM civil date inside the unique active AcademicCalendarVersion. It may be earlier or later than the old payload date, but must remain strictly in the future and no earlier than the unchanged scheduled effective start.

The successor remains open-ended. `OPERATIONAL_START` may not use this command to create a finite authority.

## 8. Dedicated retained lineage

Existing `replacesVersionId` is unsafe for this meaning: its accepted contract is a strictly later successor whose predecessor interval was closed on the previous date. Reusing it would make resolver validation and audit interpretation ambiguous.

P1-031A must add the dedicated successor-side field:

```text
supersedesScheduledVersionId
```

Lineage interpretation:

- forward edge: a `PUBLISHED` successor points to exactly one `SUPERSEDED_BEFORE_EFFECTIVE` source through `supersedesScheduledVersionId`;
- reverse history: the source exposes at most one scheduled successor through the inverse relation;
- source and successor must have the same `streamId` and exact same `effectiveFrom`;
- source and successor must both remain open-ended at the stored interval level; authority is distinguished by status;
- `replacesVersionId`, `correctsVersionId` and `supersedesScheduledVersionId` are mutually exclusive for one successor;
- self-links, cross-stream links and cycles are forbidden;
- a source may have at most one scheduled-successor child;
- repeated planned changes target the current `PUBLISHED` successor and create a chain such as `A(SUPERSEDED) <- B(SUPERSEDED) <- C(PUBLISHED)`; they never mutate an earlier terminal node.

The dedicated field is chosen for semantic clarity, not migration convenience.

### 8.1 Shared status and retained read contract

`packages/contracts` must change the shared read authority exactly as follows:

```ts
export type BusinessPolicyVersionStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'REVERSED'
  | 'SUPERSEDED_BEFORE_EFFECTIVE';

export type BusinessPolicyAllowedAction =
  | 'EDIT_DRAFT'
  | 'PUBLISH'
  | 'REPLACE'
  | 'RETIRE'
  | 'CORRECT'
  | 'SUPERSEDE_SCHEDULED_AUTHORITY';
```

`BusinessPolicyVersionRecord` gains these required fields:

```ts
supersedesScheduledVersionId: string | null;
supersededBeforeEffectiveByUserId: string | null;
supersededBeforeEffectiveAt: string | null;
supersededBeforeEffectiveReason: string | null;
allowedActions: BusinessPolicyAllowedAction[];
actionEvaluationCivilDate: CivilDateString;
```

The first four fields are retained persistence evidence. `allowedActions` and `actionEvaluationCivilDate` are server-computed presentation fields and are not persisted. Existing `replacesVersionId`, `correctsVersionId`, reversal fields and correction reason remain unchanged.

Both `GET /api/business-configuration/policies` and the exact stream-detail read `GET /api/business-configuration/policies/:streamId` must serialize conforming `BusinessPolicyVersionRecord` values rather than returning raw Prisma rows. P1-032 must use the exact stream-detail response as the action authority for the selected version.

## 9. Schema and migration verdict for P1-031A

**Schema change is required.** P1-031A must implement one forward Prisma migration containing all of the following:

1. add `SUPERSEDED_BEFORE_EFFECTIVE` to `BusinessPolicyVersionStatus`;
2. add nullable `supersedes_scheduled_version_id UUID` with a self-FK using `ON DELETE RESTRICT` and repository-consistent update behavior;
3. add a unique partial index on non-null `supersedes_scheduled_version_id` so one source has at most one scheduled successor;
4. add nullable `superseded_before_effective_by_user_id UUID`, `superseded_before_effective_at TIMESTAMPTZ(3)` and `superseded_before_effective_reason TEXT`, with retained User FK and a maximum-1000-character/check-normalization contract for terminal evidence;
5. extend lifecycle-evidence checks so the new status requires original publish evidence plus both scheduled-supersession actor/time fields, while correction-only fields remain null;
6. add lineage-shape checks making the three successor lineage fields mutually exclusive and prohibiting self-link;
7. extend the lineage trigger to require same-stream scheduled lineage and reject missing/cross-stream ancestors;
8. add an immediate family-scope trigger and a `DEFERRABLE INITIALLY DEFERRED` paired-lineage constraint trigger as specified below;
9. extend the immutable-published trigger to permit only the atomic transition `PUBLISHED -> SUPERSEDED_BEFORE_EFFECTIVE` with terminal evidence populated and without changing payload, validator, effectivity, version number, creator, publisher or existing lineage;
10. make `SUPERSEDED_BEFORE_EFFECTIVE` rows fully immutable;
11. retain the current GiST exclusion predicate on `status = 'PUBLISHED'`; do not weaken generic overlap protection.

### 9.1 Mandatory database family-scope backstop

The new enum is physically shared, but its scheduled-supersession meaning is legal only for `BusinessPolicyStream.familyKey = 'OPERATIONAL_START'`. Command-layer checks are insufficient because migrations, maintenance SQL or later code could otherwise misuse the generic status to escape `PUBLISHED` overlap authority.

P1-031A must add an immediate database trigger that joins every affected version to `business_policy_streams` and rejects the row when any of these rules fails:

1. `status = 'SUPERSEDED_BEFORE_EFFECTIVE'` is legal only when the owning stream `family_key = 'OPERATIONAL_START'`;
2. non-null `supersedes_scheduled_version_id` is legal only for an `OPERATIONAL_START` successor whose linked source is also in the same exact stream;
3. any non-null `superseded_before_effective_by_user_id`, `superseded_before_effective_at` or `superseded_before_effective_reason` is legal only on an `OPERATIONAL_START` row whose status is `SUPERSEDED_BEFORE_EFFECTIVE`;
4. a non-`OPERATIONAL_START` stream must have none of the scheduled-only status, lineage or evidence fields, otherwise the database raises and aborts the transaction;
5. a scheduled-lineage successor must be `PUBLISHED`; its source must be `SUPERSEDED_BEFORE_EFFECTIVE`; both are in the same stream and therefore the same exact family/resource;
6. no generic family can move a row out of the `status = 'PUBLISHED'` GiST predicate by assigning the OPERATIONAL_START-only terminal status.

Because source transition and successor insertion occur in one transaction, the complete pair invariant must be checked at commit by a `DEFERRABLE INITIALLY DEFERRED` constraint trigger. At commit it proves exactly one successor for each newly terminal source, exact-equal `effectiveFrom`, both stored intervals open-ended, mutually exclusive lineage, no cycle and the status pairing above. The existing immediate GiST exclusion for `PUBLISHED` rows remains unchanged.

No existing row is automatically reclassified. Existing production has no configured or deployed `OPERATIONAL_START` authority, so production backfill is **zero rows / none**. Test/dev legacy rows remain in their existing statuses; invalid finite or corrupt rows are not silently repaired by migration and must fail closed until deliberately recreated in an isolated environment. The migration is additive and deterministic.

## 10. Resolver semantics

The exact-date resolver continues to select exactly one valid `PUBLISHED` interval; it never uses latest-row fallback.

| Query situation | Required result |
|---|---|
| Before the scheduled `effectiveFrom` with no older covering authority | `POLICY_NOT_CONFIGURED` |
| Before the scheduled `effectiveFrom` with an older valid covering authority | Resolve that older exact-date `PUBLISHED` authority |
| On the scheduled `effectiveFrom` after supersession | Resolve the active scheduled successor |
| After the scheduled `effectiveFrom` while successor remains open | Resolve the active scheduled successor |
| Superseded source targeted directly in history | Return it only as retained historical evidence, never as resolved authority |
| Ambiguous candidates, invalid lineage, wrong status pairing, cross-stream link, cycle or malformed payload | `POLICY_AMBIGUOUS` or `POLICY_CORRUPT` as semantically applicable; fail closed |

Resolver lineage validation must recognize the dedicated edge only when ancestor status is `SUPERSEDED_BEFORE_EFFECTIVE`, stream and start date match, both stored intervals are open-ended, and no incompatible lineage field is set.

Historical exact-date resolution after supersession reflects the accepted retained authority: the superseded source never governed any date, while the successor governs from the unchanged scheduled start. This is not rewriting elapsed authority because eligibility proves the source had no elapsed/started effective date.

## 11. Direct-publish guard

A scheduled source that becomes `SUPERSEDED_BEFORE_EFFECTIVE` is retained proof that the stream entered the authoritative publication lifecycle. A fresh arbitrary draft must not bypass lineage.

The `OPERATIONAL_START_DIRECT_PUBLISH_AFTER_AUTHORITY_FORBIDDEN` guard must count all prior statuses with publication authority evidence:

```text
PUBLISHED
REVERSED
SUPERSEDED_BEFORE_EFFECTIVE
```

Only the first publication of a stream may use direct `PUBLISH`. Later legitimate changes use `SUPERSEDE_SCHEDULED_AUTHORITY`, `REPLACE` or `CORRECT` according to the partition below.

## 12. Deterministic lifecycle partition

### Scheduled supersession

- truth: legitimate planned change;
- source is `PUBLISHED` but has never become effective;
- machine predicate: `businessDate < source.effectiveFrom`;
- successor uses the same scheduled `effectiveFrom`;
- source becomes `SUPERSEDED_BEFORE_EFFECTIVE`.

### Ordinary prospective replacement

- truth: legitimate planned change after source authority has begun but before the current operational boundary;
- machine predicate includes `source.effectiveFrom <= businessDate < currentOperationalStartDate`;
- successor starts on a later future civil date, closes source on the previous date, remains no later than both current and new operational-start dates, and rewrites no elapsed authority.

### Correction

- truth: an erroneous retained assertion or historical truth must be corrected;
- mandatory reason and `correctsVersionId` lineage;
- source becomes `REVERSED` under existing ADR-046/ADR-049 semantics;
- it is not a convenience path for a planned change, whether or not the erroneous source has become effective.

The partition is deterministic by business truth plus server date. A planned never-effective change cannot choose `REPLACE` or `CORRECT`; a planned already-effective change cannot choose scheduled supersession; an erroneous assertion uses `CORRECT` and its existing evidence contract. Once `currentOperationalStartDate` has started, a legitimate date rewrite is not authorized as ordinary replacement; only a genuine historical correction may use `CORRECT`.

## 13. Terminal-state interactions

A `SUPERSEDED_BEFORE_EFFECTIVE` row is historical evidence only. Commands against it behave as follows:

- `RETIRE`: forbidden;
- `REPLACE`: forbidden;
- `CORRECT`: forbidden on the terminal source; if a separate retained assertion is erroneous, target the currently relevant eligible authority under correction rules;
- direct `PUBLISH`/republish: forbidden;
- `SUPERSEDE_SCHEDULED_AUTHORITY` again: forbidden.

Repeated scheduled changes always target the current scheduled `PUBLISHED` successor, preserving a one-way retained chain.

## 14. Atomicity, concurrency and idempotency

The implementation must use the existing `SERIALIZABLE` transaction, bounded retry, command receipt and compare-and-set conventions.

One transaction must:

1. load and validate source, family/resource, lineage, payload and unique active calendar;
2. capture the server-owned HCM business date once;
3. validate successor payload and derived effectivity;
4. CAS-transition source from `PUBLISHED` to `SUPERSEDED_BEFORE_EFFECTIVE` with terminal actor/time and normalized optional reason evidence;
5. create the `PUBLISHED` successor with exact-equal start and dedicated lineage;
6. write the distinct success audit;
7. persist the idempotency receipt.

No intermediate gap is externally visible because all changes commit atomically. Concurrent publish/replace/correct/scheduled-supersede attempts cannot yield two authoritative successors. The CAS, unique lineage index, published-overlap exclusion and serializable transaction permit one winner; a loser returns `BUSINESS_POLICY_CONFLICT` and writes no success audit or partial receipt.

The command fingerprint must include the canonical operation name, source version identity, normalized strict successor payload and normalized optional `reason`. Repeating the same actor `commandId` with the identical semantic request returns the same stable outcome and successor ID. Reusing it with any semantic difference fails closed with `BUSINESS_POLICY_CONFLICT`.

## 15. Database constraint interaction

The current interval validity and `PUBLISHED` overlap exclusion remain intact. Same-date scheduled supersession is legal only because the source atomically leaves `PUBLISHED` before the successor is inserted as `PUBLISHED` in the same transaction.

The source interval is not shortened to an invalid empty interval. The new terminal status is outside the authoritative overlap predicate, while the dedicated lineage/immutability constraints preserve why it is outside. Generic families receive no relaxed overlap, interval, lineage or immutability rule.

## 16. Audit contract

The distinct success action is:

```text
BUSINESS_POLICY_SCHEDULED_AUTHORITY_SUPERSEDED
```

It must be distinguishable from `BUSINESS_POLICY_REPLACED` and `BUSINESS_POLICY_CORRECTED` and retain at least:

- actor and request metadata;
- canonical command and `commandId`;
- family and exact AcademicYear resource;
- source and successor version IDs;
- source and successor validator versions;
- old/new payload fingerprints;
- unchanged scheduled `effectiveFrom`;
- old/new `operationalStartDate`;
- captured server-owned HCM business civil date;
- `supersedesScheduledVersionId` lineage;
- optional normalized `reason`.

Source terminal transition, successor creation, audit and command receipt must commit together. Failed commands write no success audit.

## 17. Reporting and frozen provenance

Normal `ReportingStatement.submit` resolves policy at `hcmCivilDate(asOfInstant)`. Scheduled supersession requires that date to be strictly before `source.effectiveFrom`; therefore the source is not an effective resolver candidate on the submit date. A normal submitted/frozen report cannot have pinned this source through the accepted current command path.

A caller may perform a read-only future exact-date preview before supersession, but that does not create a frozen ReportingStatement. If corrupt or manually seeded legacy data somehow contains a frozen reference, the immutable snapshot remains untouched and the retained source remains inspectable; supersession never rewrites statement JSON, semantic hash or provenance.

Existing frozen revisions remain immutable. Statements submitted on or after the scheduled start resolve and pin the successor version. No ReportingStatement schema/profile change is required by this lifecycle.

## 18. Historical read and P1-032 server-authoritative action contract

The exact transport authority is the existing stream-detail read:

```text
GET /api/business-configuration/policies/:streamId
```

It remains protected by `SessionAuthGuard + CapabilityGuard` and `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE`. The service captures `businessCivilDate()` exactly once per response and maps every version to the shared `BusinessPolicyVersionRecord` defined in §8.1.

The server computes `allowedActions`; P1-032 renders actions only from that array:

- eligible open `PUBLISHED OPERATIONAL_START` with `actionEvaluationCivilDate < effectiveFrom`: include `SUPERSEDE_SCHEDULED_AUTHORITY`; do not offer ordinary `REPLACE` for that planned-change state;
- when `actionEvaluationCivilDate == effectiveFrom` or later: omit `SUPERSEDE_SCHEDULED_AUTHORITY`;
- `SUPERSEDED_BEFORE_EFFECTIVE`: `allowedActions = []` exactly, making the row history-only;
- `RETIRE` is never returned for `OPERATIONAL_START`;
- `CORRECT` may be returned only under the existing erroneous-assertion lifecycle; its presence does not reclassify a planned change;
- other generic draft/publish/replace/correct actions follow their existing server lifecycle and family gates.

`actionEvaluationCivilDate` is evidence of the server evaluation anchor, not a client input. The browser must not add/remove actions by comparing its own clock. If a response crosses HCM midnight or becomes stale, the mutation command revalidates inside its transaction and may return the stable too-late/conflict error; P1-032 then refetches the stream detail.

P1-032 presents, without raw JSON:

- the original scheduled source and its original payload/effectivity;
- localized status for `SUPERSEDED_BEFORE_EFFECTIVE`;
- the active scheduled successor;
- directional `supersedesScheduledVersionId` chain chronology;
- publication and scheduled-supersession actors/timestamps;
- `supersededBeforeEffectiveReason`, old/new operational-start dates and unchanged scheduled start;
- only the exact server-returned actions.

## 19. Stable error contract

| Error code | Meaning / use |
|---|---|
| `OPERATIONAL_START_SCHEDULED_SUPERSESSION_TOO_LATE` | Server HCM business date is on or after source `effectiveFrom`; scheduled supersession is no longer allowed |
| `BUSINESS_POLICY_CONFLICT` | Wrong/stale lifecycle state, CAS loss, already-created successor, command fingerprint conflict or concurrent winner |
| `OPERATIONAL_START_SCHEDULED_SUCCESSOR_EFFECTIVITY_INVALID` | Successor start is not the exact source start, a finite end is attempted, or an internal/generic DTO tries to override server-derived effectivity |
| `OPERATIONAL_START_SCHEDULED_SUCCESSOR_DATE_INVALID` | New `operationalStartDate` is not strictly after business date or is earlier than successor `effectiveFrom` |
| `OPERATIONAL_START_DATE_OUTSIDE_CALENDAR` | New operational-start date is outside the unique active AcademicCalendarVersion |
| `ACADEMIC_CALENDAR_VERSION_INVALID` | Zero or multiple active calendar versions exist |
| `INVALID_POLICY_RESOURCE` | Family/resource is not `OPERATIONAL_START/ACADEMIC_YEAR` |
| `POLICY_CORRUPT` / `POLICY_AMBIGUOUS` | Payload, retained lineage or authority candidates are corrupt/ambiguous |

Existing exact vocabulary is reused where it already expresses the failure. New aliases for concurrency, calendar or corruption are prohibited.

## 20. Future P1-031A implementation acceptance

P1-031A must add unit, isolated PostgreSQL integration, static-schema and workflow-contract evidence for at least:

A. `businessDate < source.effectiveFrom == currentOperationalStartDate` succeeds through scheduled supersession.

B. Successor keeps the exact source `effectiveFrom` and remains open-ended.

C. Source becomes retained terminal `SUPERSEDED_BEFORE_EFFECTIVE` with unchanged payload/effectivity and complete actor/time/optional-reason evidence.

D. Resolver never returns the superseded source after commit.

E. Resolver returns the successor starting on the unchanged scheduled `effectiveFrom`.

F. Transition creates no authority gap and no overlapping `PUBLISHED` interval; generic exclusion remains enforced.

G. `businessDate == source.effectiveFrom` returns `OPERATIONAL_START_SCHEDULED_SUPERSESSION_TOO_LATE` without mutation/audit.

H. Already elapsed/effective source rejects scheduled supersession.

I. Ordinary `REPLACE` remains valid for `source.effectiveFrom <= businessDate < currentOperationalStartDate` when its future successor interval is representable and boundary-valid.

J. `CORRECTION` retains existing reason, `REVERSED` and `correctsVersionId` semantics; no planned-change alias is accepted.

K. Repeated scheduled supersession forms a valid retained dedicated lineage chain and rejects cycles/cross-stream/multiple-child corruption.

L. Concurrent scheduled supersession and concurrent publish/replace/correct races have one winner and stable losing conflict.

M. Identical command replay returns the original result; same actor/commandId with changed source, payload or note conflicts.

N. Direct publish remains forbidden after `SUPERSEDED_BEFORE_EFFECTIVE` history exists.

O. Existing ReportingStatement V1/V2 frozen provenance remains byte/semantic-hash stable; a new statement at/after the scheduled start pins the successor.

P. Exact POST mutation route requires session, valid CSRF origin and `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE`; missing authentication/capability or invalid origin is rejected, and no new capability is accepted as a substitute.

Q. `SupersedeScheduledAuthorityDto` accepts only `commandId`, strict successor payload and optional bounded `reason`; caller `effectiveFrom`, `effectiveUntil`, `businessDate`, status, lineage, actor or timestamp fields fail DTO validation.

R. Stable success response is exactly `SCHEDULED_AUTHORITY_SUPERSEDED` with `versionId` equal to the successor, and shared status/read records expose scheduled lineage, actor, timestamp, reason, allowed actions and evaluation civil date with the declared nullability.

S. Server-owned action contract returns `SUPERSEDE_SCHEDULED_AUTHORITY` before source `effectiveFrom`, omits it at equality/afterwards, and returns an empty action list for the terminal source; Web regression proves no browser-clock inference.

T. Isolated database-bypass integration proves a non-`OPERATIONAL_START` family cannot persist `SUPERSEDED_BEFORE_EFFECTIVE`, scheduled lineage or any scheduled terminal evidence, while valid same-stream OPERATIONAL_START pairs commit and generic GiST overlap protection remains unchanged.

Additional required evidence:

- status/lineage lifecycle and immutability constraint tests;
- same-start migration/constraint behavior in isolated PostgreSQL;
- source transition + successor + audit + receipt rollback on injected failure;
- endpoint authentication, CSRF, capability and forbidden-field DTO coverage;
- shared contract serialization and exact success-body coverage;
- server-owned action-list boundary and stale-response refetch coverage;
- database-bypass family-scope rejection for status, lineage and every terminal-evidence field;
- terminal-state action rejections;
- before/on/after resolver table coverage;
- unique active calendar and strict payload validation;
- zero production backfill assertion and deterministic legacy-row migration behavior;
- `npm run test:schema:business-configuration:static`, `npm run test:workflow:contract`, lint, typecheck and proportionate affected regressions.

## 21. Dependency and closure effect

- P1-031B is architecture-complete on this branch and moves to `IN_REVIEW`; it is not `CLOSED` until merge, authoritative post-merge CI and `SYNC-P1-031B`.
- P1-031A is `PLANNED` because the Product Owner decision is closed but dependency P1-031B is not yet `CLOSED`. Its branch is not canonical and none of its runtime changes are claimed merged.
- After `SYNC-P1-031B`, canonical dependency gates permit P1-031A to transition `PLANNED -> READY`; implementation then resumes on a dedicated correction branch and must implement this architecture plus its already-audited continuity corrections.
- P1-032 remains `PLANNED` and non-startable until P1-031A is merged, passes authoritative post-merge CI and closes through `SYNC-P1-031A`.
- Production remains strictly `PRE-OPERATIONAL`; no deployed `OPERATIONAL_START` policy exists and no production remediation/backfill is required.

## 22. Explicit non-scope

- no runtime/controller/service/contracts implementation;
- no Prisma schema or migration;
- no API or UI mutation;
- no authorization/capability change;
- no ReportingStatement profile/schema mutation;
- no CI/CD logic change;
- no deploy, VPS, database, production policy or production-data mutation;
- no merge, push or PR creation.
