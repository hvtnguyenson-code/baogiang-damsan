# ADR-028 — PPCT Persistence Foundation

- **Status:** Accepted
- **Date:** 2026-08-13
- **Scope:** LOCAL-FC-05A1 PPCT persistence foundation
- **Authority:** ADR-027 and `LOCAL-FC-05A0D-PPCT-DECISION-CLOSURE.md`

## Context

ADR-027 and the accepted 05A0D closure establish a shared, versioned PPCT aggregate without class-owned plans, calendar ownership, global progress state or import assumptions. LOCAL-FC-05A1 needs a physical PostgreSQL/Prisma representation that preserves exact historical identity and lets later control-plane commands enforce lifecycle semantics transactionally.

## Decision

### Logical plan and six-model split

One `PpctPlan` is the stable logical master for exactly `AcademicYear + Subject + Grade`. The database permits one such plan per tuple and constrains THPT grade to 10–12. The persistence is split into exactly six domain models:

1. `PpctPlan` — stable shared master identity;
2. `PpctVersion` — retained lifecycle/version provenance;
3. `PpctItem` — immutable logical curricular-obligation UUID;
4. `PpctItemRevision` — ordered content local to one exact version;
5. `PpctItemLineage` — exact predecessor/successor revision edges;
6. `PpctClassAssociation` — date-effective class-subject binding to an exact version.

No `SchoolClass`, timetable, teaching assignment, calendar version or academic week owns the plan.

### Version lifecycle and published head

The exact row lifecycle is `DRAFT → PUBLISHED → SUPERSEDED`. A draft has no publication or supersession metadata. A published row has publication actor/time only. A superseded row retains publication actor/time and adds supersession actor/time no earlier than publication. Actor/timestamp pairs are all-or-none. A PostgreSQL partial unique index permits at most one `PUBLISHED` head per logical plan.

The database freezes valid lifecycle row shape and history identity. LOCAL-FC-05A2 owns transactional transitions, concurrency, published-content immutability and command authorization; 05A1 adds no lifecycle API or trigger.

### Stable item identity, revisions and lineage

`PpctItem.id` is the immutable logical UUID. `sequence` is business order, never identity. Title, lesson type and sequence belong to `PpctItemRevision`, which is unique by version+sequence and version+item. The same stable item UUID may appear in multiple versions when its curricular obligation is semantically preserved.

Split and merge create new item UUIDs. `PpctItemLineage` stores graph edges between exact predecessor and successor revisions, with composite foreign keys proving both ends belong to the same plan. One-to-many edges express a split; many-to-one edges express a merge. A carried-forward unchanged UUID needs no lineage edge.

One item represents one distributable teaching-period obligation. Multi-period lessons or topics use multiple ordered items.

### Class association and database scope proof

`PpctClassAssociation` binds `AcademicYear + SchoolClass + Subject` to one exact `PpctVersion` over an inclusive civil-date interval. Boundaries use PostgreSQL `DATE`; `daterange(..., '[]')` and a GiST exclusion constraint reject overlap within one class-subject stream. A null upper bound is open-ended.

Composite foreign keys prove:

- the class belongs to the association year and has the duplicated grade coordinate;
- the plan matches the same year, subject and grade;
- the exact version belongs to that exact plan.

The duplicated grade is only a referential-integrity coordinate and does not make the class an owner. A composite association provenance key is available for later exact historical references.

An association is not constrained to a version that remains `PUBLISHED`. Command logic in 05A2 must require an appropriate published version when creating or switching a future binding, but a historical association remains valid after that version becomes `SUPERSEDED`.

### Deliberate absences

PPCT has no `AcademicCalendarVersion` or `AcademicWeek` ownership. Expected week placement is a downstream projection. Items contain no global `completed` flag; class-specific distribution, completion, debt and progress are downstream facts. Import remains deferred, so no workbook, profile, alias, mapping, checksum, receipt or idempotency persistence is introduced.

All history-bearing foreign keys use `ON DELETE RESTRICT`. PostgreSQL checks, unique/composite keys, partial indexes and exclusion constraints enforce local structural invariants; 05A2 owns service-level lifecycle, historical reads and `PPCT_MANAGE` authorization.

## Consequences

- Shared curricular identity and class-specific progress can evolve independently.
- Historical consumers can pin exact plan, version, item and association identities.
- Split/merge provenance is queryable without repurposing sequence or adding a lineage-kind enum.
- Calendar revisions and PPCT supersession cannot reinterpret retained class bindings structurally.
- PostgreSQL migration regression tests are authoritative for composite scope proofs, overlap and deletion restrictions that Prisma cannot express alone.

## Explicit non-scope

API/DTO/contracts, controllers/services/modules, lifecycle commands, historical-read endpoints, authorization guards, `PPCT_MANAGE` seed/runtime, import/workbook parsing, progress/debt/completion, teaching execution, resolved occurrences, reporting, UI, deployment and production migration are not implemented by this decision.
