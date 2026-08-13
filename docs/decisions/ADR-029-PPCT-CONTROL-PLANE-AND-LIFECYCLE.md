# ADR-029 — PPCT Control Plane and Lifecycle

- **Status:** Accepted
- **Date:** 2026-08-13
- **Scope:** LOCAL-FC-05A2
- **Authority:** ADR-027, ADR-028 và `LOCAL-FC-05A0D-PPCT-DECISION-CLOSURE.md`

## Context

ADR-028 established the six-model PPCT persistence foundation but deliberately deferred runtime authorization, commands, concurrency, lifecycle immutability and historical reads. LOCAL-FC-05A2 supplies that control plane without changing the Prisma schema or adding database triggers.

## Decision

### API and authorization boundary

The API exposes subject-bounded plan create/read/list; retained version history; correction draft creation; exact version content read and draft replacement; publish/supersede; class-association history and switching; and date-specific historical resolution. It does not expose generic update, delete, unpublish or reactivate operations.

Every endpoint requires an authenticated session and every mutation also requires the CSRF/origin guard. Business access requires `PPCT_MANAGE` at exactly `SUBJECT` or `SCHOOL_WIDE`. A subject operation is evaluated as a `SUBJECT` request for the exact persisted `Subject.id`; the existing authorization engine permits a valid `SCHOOL_WIDE` grant to satisfy it. For persisted plans and versions the server first resolves their real plan/subject. Roles, subject-group membership or leadership, duties, teaching assignments, position titles and `SYSTEM_ADMIN` never imply this capability. A forced-password-change session is denied, and denials produce a generic 403 plus `AUTHORIZATION_DENIED` audit evidence.

### Draft content and logical identity

Only `DRAFT` content is mutable. Full replacement is atomic and uses `PpctVersion.updatedAt` as the compare-and-swap token. `NEW` denotes a genuinely new stable item UUID, optionally with exact predecessors. `CARRY_FORWARD` reuses a stable UUID that has an earlier non-draft revision in the same plan and never creates a lineage edge. Historical UUIDs cannot be repurposed as `NEW`; a provisional UUID used only by the same draft may survive and be reused by later full replacement.

Lineage edges name exact predecessor and successor version/item revisions. Predecessors must be earlier `PUBLISHED` or `SUPERSEDED` revisions of the same plan. One-to-many edges express split and many-to-one edges express merge. Ordinary same-UUID carry-forward creates no lineage.

A correction draft may clone a retained `PUBLISHED` or `SUPERSEDED` source from the same plan. It preserves item UUID, sequence, title and lesson type, adds no carry-forward lineage, and never mutates its source.

### Publication lifecycle and concurrency

Publication requires both `expectedUpdatedAt` and the explicit nullable `expectedPublishedVersionId`. In one `Serializable` transaction the command compares the observed published head, rejects an empty or stale draft, transitions the exact current `PUBLISHED` head to `SUPERSEDED` while retaining its publication actor/time, and transitions the target `DRAFT` to `PUBLISHED`. Both transitions and their audit rows are atomic. Serialization, unique-head and stale-token conflicts map to controlled 409 responses.

`PUBLISHED` content and successor lineage are immutable. Its only later mutation is the controlled `PUBLISHED → SUPERSEDED` transition. `SUPERSEDED` is fully immutable. Publishing never changes a class association.

### Class association and historical resolution

The class switch command operates on the exact `AcademicYear + SchoolClass + Subject` stream and derives grade and the shared plan from persisted data. The target must be a currently `PUBLISHED` version of that exact plan. `expectedLatestAssociationId` is an explicit nullable CAS token. A new association must move forward in stream chronology; an overlapping latest interval is closed at the preceding civil day, while a previously ended interval is retained and any gap is preserved. Existing provenance is never rewritten except for that latest interval upper bound.

Date resolution uses inclusive association boundaries and returns the exact retained association, plan, version, ordered revisions and successor lineage. A historical association to a now-`SUPERSEDED` version remains valid and is never substituted with the current published head. A date without a binding returns a factual `resolved: false` result rather than an invented current version.

## Audit

Successful mutations write transactionally coupled audit actions: `PPCT_PLAN_CREATED`, `PPCT_VERSION_DRAFT_CREATED`, `PPCT_DRAFT_CONTENT_REPLACED`, `PPCT_VERSION_PUBLISHED`, `PPCT_VERSION_SUPERSEDED` and `PPCT_CLASS_ASSOCIATION_SWITCHED`. Authorization denials use `AUTHORIZATION_DENIED` without exposing grant internals to callers.

## Consequences and non-scope

The PPCT control plane now preserves lifecycle and history under optimistic and database concurrency backstops. The service layer enforces immutability; no database trigger is introduced. PPCT XLSX/import, progress/completion/debt, operational readiness, resolved lesson occurrences, teaching execution/Báo giảng, reporting, approval and UI remain outside this slice.
