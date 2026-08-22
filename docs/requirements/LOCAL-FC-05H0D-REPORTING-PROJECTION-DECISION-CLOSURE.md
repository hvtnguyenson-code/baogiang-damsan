# LOCAL-FC-05H0D — Reporting Projection Decision Closure

**Status: ACCEPTED / DECISION CLOSED.** Product Owner has accepted D1–D15. This closure records new Accepted 05H0D decisions; it distinguishes them from pre-existing confirmed upstream facts and authorizes no 05H1 implementation.

## Authority and distinction

Pre-existing authority: v1.3 implementation addendum; 05A0/05A0D; ADR-027, ADR-031, ADR-034, ADR-037, ADR-038, ADR-039, ADR-040; 05G0/05G0D; 05G1 implementation/tests; roadmap; PROJECT_CONTEXT; ADR-010 and Prisma Semester/AcademicCalendarVersion.

Pre-existing facts include source-derived downstream reporting, exact provenance, direct-obligation/progress semantics, original/actual MAKEUP coordinates, responsible/actual teacher evidence, root-coherent 05G1 snapshot semantics and fail-closed reconciliation. The decisions below are Accepted **at 05H0D after PO closure**, not retroactively pre-existing reporting authority.

Structural fact: the repository has a Semester model under AcademicCalendarVersion. It does not establish Accepted reporting-semester semantics. Calendar-version-change selection/reconciliation remains deferred; AcademicWeekSegment is never Semester.

## Accepted D1–D15

| ID | Accepted decision |
|---|---|
| D1 Report root/scope | Atomic trustworthy root remains AcademicYear + SchoolClass + Subject. 05H1 may compose an explicit bounded finite set of roots; no unrestricted school-wide wildcard and no UI/role-invented root semantics. |
| D2 Period semantics | 05H1 supports inclusive custom civil-date range in Asia/Ho_Chi_Minh. Week/month/year presets and Semester reporting defer. Future annual policy must bind AcademicYear, not implicit calendar year. |
| D3 As-of/historical | 05H1 is current-authoritative live reporting with explicit non-future asOfInstant. Historical reconstruction defers; createdAt is never a truth shortcut; immutable submitted statement is later. |
| D4 Cross-period MAKEUP | Dual-coordinate presentation. Source/original coordinate owns curricular accounting; actual/execution coordinate is execution evidence/presentation. No second distribution, no double-counted completion, no workload aggregate in 05H1. |
| D5 Teachers | Retain responsibleTeacher and actualTeacher. Curricular responsibility remains responsible teacher; actual teacher is execution evidence. Substitution/MAKEUP never transfers TeachingAssignment ownership; actual workload aggregate defers. |
| D6 Suppression/cancellation/supervision | If upstream creates no direct obligation, suppression/authorized cancellation/activity suppression creates no curricular distribution/completion/debt and may have typed diagnostics. DIFFERENT_SUBJECT_SUPERVISION never completes the original subject; where upstream proves PROVEN_OPEN_DEBT, retain the original curricular debt and optionally add typed supervision diagnostic—never replace debt with non-curricular diagnostic or transfer responsibility. |
| D7 Special Activity | Defer Activity reporting family from 05H1. It remains non-curricular PPCT/progress/debt/late and never fans out by class targets. |
| D8 Failure/partial policy | BLOCKED blocks only affected root/section. PASS roots retain trustworthy detail and own totals; blocked root exposes diagnostics. Any aggregate covering a BLOCKED root is unavailable/null/explicitly blocked: no combined partial total presented as complete and no silent omit/rebind/repair/credit. |
| D9 Read authorization | 05H1 internal-only: no public controller/API, capability or seed. Reporting read authorization/scope defers to 05H2. |
| D10 Canonical detail | Canonical traceable detail is the exclusive aggregate source. No parallel query/counter semantics; aggregate fully reconciles to detail and retains exact provenance. |
| D11 Ordering | For 05H1 curricular detail: source civil date -> retained slot start -> retained slot end -> occurrence key. No incidental DB order, createdAt or current-label shortcut. Cross-family order defers with Activity. |
| D12 Multi-root transaction | Bounded multi-root report uses one outer RepeatableRead-or-stronger transaction and tx-aware upstream resolvers/projections; no nested independent snapshots. Each 05G1 root retains its existing coherent semantics. This is a new 05H0D Accepted architecture decision. |
| D13 Persistence | 05H1 is pure on-demand projection: no report persistence, cache, materialized read model or mutable persisted draft. Immutable statement remains later. |
| D14 Bounds/performance | Structural bounds: finite explicit roots; no wildcard; all roots in one AcademicYear; custom range wholly in that AcademicYear; no cross-AcademicYear range. Numeric root/day caps, public pagination, large-scale optimization and public tuning defer; no numeric cap is invented. |
| D15 Decomposition | 05H1 internal deterministic Reporting Projection; 05H2 public Reporting read/control plane; later immutable statement/submission/approval. |

## 05H1 authorized boundary

05H1 is schema-free: no schema, migration, Prisma, persistence, public route/controller, capability/seed, UI or deploy/prod work.

Minimum input: AcademicYear; explicit bounded class-subject roots; inclusive custom civil-date range wholly in that AcademicYear; explicit non-future asOfInstant.

Minimum output: canonical curricular detail; aggregates exclusively derived from it; original/actual execution provenance; responsible/actual teacher provenance; inherited 05G1 progress/debt/gap/late meanings; explicit BLOCKED diagnostics; unavailable aggregate for scope containing BLOCKED root.

## Residual deferrals

Semester/week/month/year presets; historical reconstruction; actual workload aggregation; Special Activity reporting; public reporting authorization/API/control plane; numeric performance limits/pagination/large-scale optimization; immutable statement, submission, approval, separation of duty and correction-after-freeze.

## Scenario consistency A–W

A BASE completed; B BASE elapsed/no execution is gap not debt; C same-subject substitution retains both teachers; D absence/open debt; E different-subject supervision retains original debt where proven; F August obligation/September MAKEUP uses D4; G scheduled MAKEUP does not close debt; H ACTIVE MAKEUP closes exact original once; I REVERSED recomputes; J cancellation has no curricular item; K activity suppression has no curricular effect; L Activity participation is separate; M no Activity fan-out; N responsible A/actual B retained; O PPCT version switch exact; P timetable version switch exact; Q calendar version evolution exact/ambiguity blocked; R mismatch BLOCKED/no rebind; S live changes after correction; T statement stays immutable; U PASS+BLOCKED roots uses D8; V custom range may cross month without implicit monthly semantics; W cross-AcademicYear range is rejected in 05H1.

## Finalization

D1–D15 are Accepted by Product Owner. ADR-041 records the architecture. This local finalization remains pending independent review/CI; it does not claim 05H1 has started or is implemented.
