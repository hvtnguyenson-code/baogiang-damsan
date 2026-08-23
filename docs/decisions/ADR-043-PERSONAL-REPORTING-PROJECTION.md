# ADR-043 — Personal Reporting Projection

- **Status:** Accepted
- **Scope:** Personal Reporting Projection / composition architecture only.
- **Authority:** Product Owner A2 and `PERSONAL-REPORTING-PROJECTION-DECISION-CLOSURE.md`.

## Decision

Personal Reporting Projection is the distinct internal profile `PERSONAL_TEACHING_REPORTING_PROJECTION_V1`. It is not ADR-042 Statement `statementProfile` and does not alter ADR-041 general explicit-root ReportingProjection semantics.

Input is one AcademicYear, server-owned target user, inclusive civil range and explicit as-of. After base validation, it discovers target TeachingAssignment history by inclusive effective-range intersection, creates deterministic deduplicated class-subject roots and retains interval manifest. Nonzero scope invokes **one** canonical `ReportingProjectionService.resolveInTransaction` with the complete root array and same year/range/as-of.

Candidate discovery occurs before filtering. Every intersecting BLOCKED root is retained and blocks combined Personal totals. For PASS roots, membership is retained `responsibleTeacherUserId === targetUserId`; actual teacher and current assignment never transfer/rebind ownership. Personal filters/reaggregates canonical detail only. Source coordinate retains MAKEUP/substitution curricular ownership and range semantics.

Zero discovery returns PASS `ZERO_RESPONSIBILITY`, empty sections/manifest/findings and exact zero counts. It is authoritative reporting truth but V1 Statement submit is ineligible before freeze/persistence: no Statement series/revision exists. Any zero-subject Statement policy requires explicit re-entry.

The resolver provides `resolve` and `resolveInTransaction`; standalone resolution uses one RepeatableRead-or-stronger tx and future submit calls the latter inside outer SERIALIZABLE with pinned as-of. Ordering is stable IDs for sections and ADR-041 canonical detail order. It is current-authoritative, non-persistent and internal only: no public route/capability, schema, cache or materialized truth.

## Consequences

Implementation requires a separately authorized internal resolver/types/tests for PRP-D1–D16 and R1–R28. ADR-043 does not implement ADR-042 Statement persistence/lifecycle.
