# Personal Reporting Projection / Composition — Architecture Audit

## 1. Status / non-authorization

**Historical audit, post-closure corrected.** Product Owner A2 and the authoritative Decision Closure/ADR-043 supersede this audit on decisions. No implementation is authorized.

## 2. Canonical baseline

**CONFIRMED:** ADR-041 remains general explicit-root reporting. **ACCEPTED:** Personal composition is separate and internal.

## 3. Source inventory

ADR-041/042, 05H0D/05I0D, ADR-040/027, ADR-008/Phase 01, and current ReportingProjection, ProgressDebt and TeachingAssignment evidence were reviewed.

## 4. Confirmed upstream invariants

Retained source responsibleTeacher owns curriculum; actualTeacher never transfers it; source coordinate owns MAKEUP/range; canonical detail owns counts; upstream blockers fail closed.

## 5. Current implementation gap

Current ReportingProjection accepts non-empty explicit roots. It has no Personal scope/composition yet; this is an implementation gap, not an architecture/Product Owner blocker.

## 6. Candidate PERSONAL composition architecture

**ACCEPTED:** validate PRP-D4, discover/deduplicate all candidate roots, return A2 result if zero, otherwise make exactly one ReportingProjection.resolveInTransaction call with full root set, then compose PASS sections and retain BLOCKED sections.

## 7. Responsibility/root discovery

**ACCEPTED:** direct tx query uses inclusive TeachingAssignment intersection, retains interval manifest, deduplicates class+subject roots, and does not resolve per interval.

## 8. BLOCKED propagation

**ACCEPTED:** candidate-first discovery makes every intersecting BLOCKED root authoritative scope; retain it, bounded diagnostics, null section/combined counts and no fake partial total.

## 9. Partial-root filtering

**ACCEPTED:** PASS membership predicate is responsibleTeacherUserId === targetUserId after structural provenance integrity validation; current TeachingAssignment never rebinds retained source truth.

## 10. MAKEUP/substitution semantics

**CONFIRMED:** source/original accounting, responsible ownership, actual execution evidence and canonical ProgressDebt classifications remain unchanged.

## 11. Aggregate reconciliation

**TECHNICAL CLOSED:** recompute five ReportingCounts only from filtered canonical detail; full PASS sum reconciles, distributed=completed+openDebt+gap and late=openDebt; violation blocks.

## 12. Empty-section / zero-scope taxonomy

Responsibility-present zero-detail section is PASS. Candidate BLOCKED is BLOCKED. **A2 ACCEPTED:** valid no-candidate scope is PASS/ZERO_RESPONSIBILITY/zero counts/empty manifest-sections-findings.

## 13. Zero-scope Product Owner decision analysis

**PRE-CLOSURE HISTORICAL ANALYSIS:** A/B were evaluated. **Accepted outcome A2:** authoritative empty reporting truth, but V1 Statement submit is ineligible before persistence and creates no series/revision.

## 14. Input/output/profile candidates

**TECHNICAL CLOSED:** profile PERSONAL_TEACHING_REPORTING_PROJECTION_V1; internal input/output/responsibilityState/findings/evaluatedAt are defined by PRP-D2–D15. Profile is not Statement statementProfile.

## 15. Transaction topology

**TECHNICAL CLOSED:** standalone resolve uses one RepeatableRead-or-stronger tx; resolveInTransaction opens none; future submit calls it inside outer SERIALIZABLE with pinned as-of.

## 16. Current-authoritative semantics

Effective retained rows discover scope; createdAt/current labels/current assignment never reconstruct or rebind source responsibility.

## 17. Ordering

**TECHNICAL CLOSED:** roots class ID -> subject ID; intervals from -> until(null last) -> assignment ID; detail preserves ADR-041 order.

## 18. Findings/failure model

**TECHNICAL CLOSED:** only Personal-specific provenance/duplicate/reconciliation blockers are added; upstream blockers remain authoritative.

## 19. Authorization/public-preflight boundary

**DEFERRED:** public Personal preflight, reviewer/admin authorization, public DTO/error/audit vocabulary. No public route/capability is authorized.

## 20. Structural bounds/performance

**DEFERRED:** numeric limits/performance evidence. Structural bounds are one year, user, inclusive range and finite derived roots; no cache/persistence.

## 21. Scenario matrix R1–R28

R1–R7 handover/multiple roots: retained target details/deterministic sections. R8–R9: PASS zero-detail sections. R10/R20/R23/R24: BLOCKED/null total. R11 excluded. R12–R16 preserve responsible/source semantics. R17–R18 retain canonical debt/gap. R19 no rebind. **R21 CLOSED:** PASS/ZERO_RESPONSIBILITY/zero counts/no sections; Statement ineligible/no series/revision. R22 deduplicates root while retaining intervals and each occurrence at most once. R25–R28 deterministic shared-tx/order/reconciliation.

## 22. Decision register: ACCEPTED / TECHNICAL CLOSED / DEFERRED

### ACCEPTED

A2; candidate-first discovery; fail-closed BLOCKED propagation; retained responsibleTeacher ownership.

### TECHNICAL CLOSED

Profile; resolver/input/output; findings; ordering; transaction/evaluatedAt contract; aggregate mechanics.

### DEFERRED

Public preflight; reviewer/admin public authorization; public DTO/error vocabulary; numeric performance limits.

## 23. Recommended Product Owner decisions

No remaining Product Owner decision is required for internal Personal implementation. Public control-plane proposals require later closure.

## 24. Implementation prerequisites

Separately authorize internal implementation, shared-tx proof and R1–R28 tests. Statement persistence remains unauthorized until Personal implementation is CLOSED/GREEN.

## 25. Re-entry triggers

TeachingAssignment/provenance/ADR-041 change, public surface proposal, future zero-subject Statement policy or material performance evidence.

## 26. Non-authorization

No code, persistence, lifecycle, schema, capability, route, staging, commit, push or deployment is authorized.
