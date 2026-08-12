# ADR-023 — Timetable Import Configuration Control Plane

- **Status:** Accepted
- **Date:** 2026-08-12
- **Scope:** LOCAL-FC-04B3C1 timetable import configuration API

## Context

ADR-021 accepts the canonical timetable-import contract and ADR-022 provides durable school-wide profiles, immutable revisions, canonical column mappings, typed retained aliases and receipt identities. Workbook inspection and confirmation need a controlled API for that professional configuration before parser work begins.

## Decision

The backend owns a dedicated `timetable-import` module. Every route requires `TIMETABLE_MANAGE / SCHOOL_WIDE`; `SYSTEM_ADMIN` is not a professional bypass. Read commands use session and capability guards. Mutations additionally retain CSRF-origin protection.

A stable profile is created atomically with active revision 1, exactly one mapping for each of `WEEKDAY`, `SESSION`, `PERIOD_ORDINAL`, `SCHOOL_CLASS`, `SUBJECT`, and `TEACHER`, and a bounded audit event. Profile revisions replace immutable content: the caller supplies `expectedActiveRevisionId`, a serializable transaction conditionally retires that exact active head, allocates the next revision from current history, creates six new mappings, updates the stable profile timestamp and audits retirement/revision. A fully retired profile cannot be revised or reactivated in this slice. Profiles and revisions have no delete endpoint.

The server normalizes human text with Unicode NFKC, outer trim and collapsed Unicode whitespace. It derives lowercase exact header/value keys while retaining Vietnamese diacritics and punctuation. Source keys are only trimmed/lowercased and must match the bounded ASCII machine-key form. There is no fuzzy, accent-folded or precedence-based resolver.

Aliases are typed as `TEACHER`, `SCHOOL_CLASS`, or `SUBJECT` and have exact target shapes. New teacher targets must be ACTIVE Users with an associated teaching StaffProfile; subjects and classes must be ACTIVE. Class aliases require the exact `(schoolClassId, academicYearId)` identity. Retirement conditionally changes only lifecycle metadata. Replacement is explicit retire-then-create; historical targets are never overwritten.

All profile and alias mutations and their SUCCESS audit events share a transaction. Profile-chain and alias concurrency conflicts map to stable HTTP 409 domain errors. Missing resources use 404 and malformed mapping/target shapes use 400.

## Consequences and boundaries

The configuration plane is ready for workbook inspection without coupling configuration logic to timetable lifecycle code. This slice does not add schema, migrations, capabilities, dependencies, parser/upload, workbook inspection, preview, receipts, import confirmation, idempotent replay, imported-DRAFT mutation guards, frontend, deployment or production operations.

The next slices are:

- **04B3C2 — Workbook Inspection & Canonical Preview**
- **04B3C3 — Canonical Import Confirmation, Idempotent Replay and Imported-DRAFT Lock**
- **04B3D — optional corpus/security hardening**

ADR-021 and ADR-022 remain Accepted. ADR-015 remains Proposed.
