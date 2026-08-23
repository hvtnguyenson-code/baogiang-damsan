# Personal Reporting Projection — Decision Closure

## 1. Status / authority

**Status: ACCEPTED / DECISION CLOSED.** Product Owner accepts zero-scope A2. PRP-D1–PRP-D16 below close the internal Personal Reporting Projection architecture; this document authorizes no implementation, schema, migration, capability, public route, staging, commit, push, or deployment.

## 2. Canonical base

`2dfa4acda507a3083d1ed89854cf09edc0c4a83f`.

## 3. Source authority

ADR-041, ADR-042/05I0D, ADR-040/05G0D, ADR-027/05A0, ADR-008/Phase 01, and current ReportingProjection, ProgressDebt and TeachingAssignment contracts are preserved.

## 4. Product Owner A2 decision

Where valid input finds zero date-effective TeachingAssignment responsibility, return authoritative PASS, `ZERO_RESPONSIBILITY`, empty manifest/sections/findings and five zero counts. It is not error, candidate-zero-detail, or BLOCKED. V1 Statement submit is ineligible before snapshot/persistence: no series, revision, hash or history. Future UI may say “Không có phân công giảng dạy trong khoảng thời gian này” and offer no submit. Zero-subject Statement support requires explicit re-entry; SUBJECT-only non-owner access remains fail-closed.

## 5. Accepted PRP-D1–PRP-D16

| ID | Accepted architecture |
| --- | --- |
| PRP-D1 | Separate internal, source-derived, non-persistent reporting composition downstream of ADR-041; no Statement lifecycle/schema/cache/public route/capability. |
| PRP-D2 | Profile is `PERSONAL_TEACHING_REPORTING_PROJECTION_V1`, not Statement `statementProfile` or series identity. |
| PRP-D3 | Input is academicYearId, targetUserId, fromCivilDate, toCivilDate, asOfInstant; client roots never establish completeness. |
| PRP-D4 | Before zero shortcut validate year, active calendar, range/calendar, order, valid non-future as-of using server clock, and target user existence; current active/teaching status, role/title/membership are not historical truth. |
| PRP-D5 | In same snapshot query target TeachingAssignment history using inclusive intersection; retain ID/class/subject/from/until; deduplicate roots by class+subject, retaining multiple intervals. |
| PRP-D6 | Roots order class ID -> subject ID; intervals from -> until (null last) -> assignment ID; labels/DB incidental order never decide truth. |
| PRP-D7 | Nonzero scope invokes exactly one ReportingProjection.resolveInTransaction with complete finite roots/same year/range/as-of. Zero scope does not invoke it because current contract requires roots. |
| PRP-D8 | Candidate-first: every BLOCKED candidate is retained, details/counts unavailable, whole status BLOCKED and combined counts null; never omit/repair/rebind/partially total. |
| PRP-D9 | PASS membership is retained responsibleTeacherUserId == targetUserId; no current assignment filter. Root/provenance inconsistency blocks, never transfers ownership. |
| PRP-D10 | PASS candidate zero target detail is a zero-detail PASS section, distinct from ZERO_RESPONSIBILITY. |
| PRP-D11 | Preserve source ownership, actual evidence, responsible ownership, substitution and MAKEUP exact-once/source-range semantics; never reclassify ProgressDebt. |
| PRP-D12 | Recompute ReportingCounts only from filtered detail; full-PASS combined sum reconciles; distributed=completed+openDebt+gap and late=openDebt; violation blocks. |
| PRP-D13 | A2 output is PASS/ZERO_RESPONSIBILITY/zero counts/empty manifest-sections-findings. Nonzero scope is RESPONSIBILITY_PRESENT. Statement rejects zero state before persistence. |
| PRP-D14 | Result exposes profile, scope, responsibilityState, PASS/BLOCKED, nullable counts, manifest, ordered sections, findings, evaluatedAt. Accepted Personal-only blockers: scope provenance invalid, responsible provenance mismatch, duplicate occurrence, aggregate reconciliation failed. |
| PRP-D15 | resolve opens one RepeatableRead-or-stronger tx; resolveInTransaction opens none. Future submit outer SERIALIZABLE supplies exact pinned as-of. evaluatedAt is observational server-clock metadata. |
| PRP-D16 | Internal only. Public preflight/control-plane, authorization, DTO/error/audit and pagination/performance closure defer. Bounds are one year/user/range and finite derived roots; no arbitrary cap/persistence/cache. |

## 6. Personal input contract

PRP-D3 is the complete internal input. A later owner public surface must server-normalize target identity.

## 7. Validation including zero-root path

PRP-D4 validation occurs before discovery/zero result. Thus invalid year, user, range, calendar or future as-of cannot become empty PASS.

## 8. Responsibility discovery/manifest

PRP-D5 predicate is `academicYearId == input && teacherUserId == target && validFrom <= to && (validUntil null || validUntil >= from)`; endpoints are inclusive.

## 9. One-call ReportingProjection composition

PRP-D7 is mandatory: one authoritative multi-root call, not one call per candidate root and no Personal reimplementation of ProgressDebt/reporting semantics.

## 10. BLOCKED propagation

PRP-D8 applies before Personal filtering and preserves bounded upstream diagnostics.

## 11. Partial-root membership

PRP-D9/D10 apply retained responsible-teacher provenance only; actual teacher/current assignment never rebinds curricular truth.

## 12. MAKEUP/substitution

PRP-D11 preserves original/source accounting, source range and exact upstream classification.

## 13. Aggregate reconciliation

PRP-D12 uses the existing five-count shape and required equations only from canonical filtered detail.

## 14. Zero-scope taxonomy / A2

ZERO_RESPONSIBILITY is valid empty PASS; responsibility-present/zero-detail is valid PASS section; any candidate blocker is BLOCKED.

## 15. Output/profile/finding contract

PRP-D2/D14 are technical contract closure. Upstream blocker codes remain upstream; public serialization is deferred.

## 16. Transaction topology

PRP-D15 requires one shared snapshot and future outer SERIALIZABLE compatibility.

## 17. Current-authoritative semantics

Effective retained rows discover scope; createdAt/current labels/current assignment do not reconstruct or rebind retained obligation provenance.

## 18. Ordering

PRP-D6 plus ADR-041 canonical detail order: source date -> source slot start -> source slot end -> occurrence key.

## 19. Public boundary

No public preflight/capability now. Reviewer/admin behavior is deferred control-plane work.

## 20. Structural bounds

PRP-D16 structural bounds only; numeric limits remain deferred pending evidence.

## 21. Scenario matrix R1–R28

| Scenarios | Closed result |
| --- | --- |
| R1–R7 | Responsibility handovers/multiple roots: retained target details only; deterministic deduplicated sections/counts. |
| R8–R9 | Candidate no elapsed/no target detail: PASS zero-detail section. |
| R10, R20, R23–R24 | Intersecting upstream/provenance blocker: BLOCKED/null combined count; never omitted. |
| R11 | Root outside target responsibility excluded. |
| R12–R16 | Substitution/NORMAL/MAKEUP retain responsible ownership and source-range accounting. |
| R17–R18 | Canonical debt/gap classifications retained and recomputed only from detail. |
| R19 | Current assignment differs: no retained obligation rebind. |
| R21 | PASS + ZERO_RESPONSIBILITY + zero counts + no sections; future Statement submit ineligible/no series/no revision. |
| R22 | Multiple/disjoint responsibility intervals for the same class-subject: one deduplicated Personal candidate root; all relevant intervals retained in manifest; each canonical reporting occurrence included at most once; no duplicate Personal occurrence. |
| R25–R28 | Same tx/as-of deterministic; SERIALIZABLE compatibility; ordered/reconciled output. |

## 22. Implementation entry criteria

Implement only in a separately authorized internal slice with PRP-D1–D16 types/resolver/tests, shared-tx proof, all R1–R28 fixtures, and future Statement zero-state eligibility test. No public surface.

## 23. Residual deferrals

Public preflight/reviewer authorization, public DTO/error/audit vocabulary, numeric limits, pagination/performance evidence and any future zero-subject Statement policy defer.

## 24. Re-entry triggers

Re-enter on change to TeachingAssignment history/provenance, ADR-041 detail/BLOCKED semantics, proposed public surface, zero-subject Statement proposal, or material performance evidence.

## 25. Non-authorization

No implementation or persistence is authorized.
