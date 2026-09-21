# ADR-052 — Special Programme Workbook / Timetable-Slot Bridge

- **Status:** Proposed
- **Date:** 2026-09-21
- **Scope:** P4-070 architecture closure; docs only
- **Authority:** `docs/requirements/P4-070-SPECIAL-PROGRAMME-WORKBOOK-SLOT-BRIDGE-ARCHITECTURE.md`

## Context

The school now has three accepted teacher-facing workbook directions: ordinary PPCT, HĐTN-HN and GDĐP.

The HĐTN-HN and GDĐP workbooks intentionally express programme intent at week level. They do not expose backend UUIDs, exact civil dates, TimeSlotDefinition IDs, internal enum names or workload coefficients.

P4 programme planning already requires exact occurrences and exact per-slot teacher sets. P2 native TKB ingestion already recognizes `GDĐP` and `TN-HN` as permitted non-peer special markers, but ADR-047 intentionally does not fabricate ordinary TimetableEntry/TeachingAssignment rows for those markers.

Without an explicit bridge, implementation would be forced either to make teachers enter technical schedule identifiers manually or to guess exact dates/slots from week-level workbook data. Both are rejected.

## Decision

### D1 — Source responsibility remains separated

Programme workbook, Academic Calendar, Timetable, identity/homeroom and Business Configuration remain distinct authorities.

No workbook gains authority for fields already owned by another domain.

### D2 — Retain special-programme TKB marker evidence

Validated `GDĐP` and `TN-HN` class-view markers SHALL be persisted as immutable children of the exact retained TimetableVersion.

The retained marker carries exact class and TimeSlotDefinition identity plus programme kind (`GDDP` or `HDTN_HN`).

It is not a TimetableEntry, TeachingAssignment, TeachingExecution or workload contribution.

### D3 — Parent timetable version owns history/effectivity

Special-programme markers have no independent business lifecycle. Their historical meaning follows the parent TimetableVersion.

Exact civil-date resolution first resolves the date-effective TimetableVersion, then reads its marker children.

### D4 — Timetable semantic identity includes special markers

Canonical timetable semantic checksum / confirmation identity SHALL include normalized retained special-programme markers.

Changing only a GDĐP/TN-HN marker is still a meaningful timetable change.

### D5 — Selective session updates preserve marker completeness

P2-050 morning/afternoon selective authoring semantics extend to special-programme markers.

Unchanged-session markers are copied from the exact canonical baseline; selected-session markers come only from newly validated source evidence.

### D6 — Weeks are AcademicWeek authority

Workbook week values resolve through exact `AcademicWeek.officialWeekNumber` and retained calendar segments.

No fixed 35-week constant or naive seven-day arithmetic is allowed.

### D7 — HĐTN CLASS resolution

`Theo lớp` maps internally to `CLASS`.

Every active class in the target grade resolves its own exact HĐTN markers. Each exact date resolves the retained date-effective HomeroomAssignment teacher.

`GVCN` is a business sentinel, not a free-text teacher identity.

### D8 — HĐTN GRADE/SCHOOL_WIDE collapse

Class-level HĐTN marker rows may collapse into one grade/school candidate only when all classes in the target scope carry the same exact marker.

Incomplete coverage blocks confirmation.

Teacher set is explicit and is attached once per exact slot; class cardinality never multiplies workload.

### D9 — GDĐP grade collapse

GDĐP is currently imported as grade-level organisation.

Class-level GDĐP marker rows collapse into one grade candidate only with complete target-grade coverage for that exact date/time.

External `Tiết PPCT` numbers validate required period count/order but do not become new persistent programme item identities.

### D10 — Required period count must equal resolved candidate count

Importer confirmation is fail-closed unless the number of exact resolved candidates equals the workbook-required periods exactly.

No first-N heuristic, next-week spillover or automatic rescheduling is permitted.

### D11 — Identity resolution never guesses

GDĐP teacher staff codes require exact unique resolution.

HĐTN explicit teacher names require exact normalized unique resolution. Ambiguous names require explicit authorized preview mapping before confirmation.

Known `teacher + supporting class` annotations do not create target or workload multiplication.

### D12 — Import is staged

Upload is inspect/preview only.

Explicit authorized confirmation creates retained DRAFT P4 programme state. Import confirmation does not auto-publish, auto-materialize or prove teaching occurred.

### D13 — Existing P4 lifecycle is reused

Publishing continues through existing P4 programme authority.

Materialization continues through P4-040 into SpecialActivity.

No parallel activity persistence path is introduced.

### D14 — Existing P4 workload is reused

P4-050 remains the only special-programme workload projection authority.

Workbook import never stores coefficients or converted totals. `SPECIAL_PROGRAMME_WORKLOAD` Business Configuration remains the coefficient authority and retains strict no-fallback behavior.

### D15 — Unused TKB markers are not effective activities

A retained special-programme marker is only a timetable structural window.

It appears in teacher effective schedule only after a real programme occurrence is published/materialized into SpecialActivity under accepted downstream rules.

### D16 — Teacher-facing UI is Vietnamese

All frontend labels, enum rendering, validation text and actions for HĐTN-HN/GDĐP import are Vietnamese.

Backend names remain technical English.

### D17 — `CC` remains outside this authority

This ADR assigns no new programme semantics to `CC` markers.

### D18 — Four-step implementation chain

Implementation is split into:

- `P4-071`: retained marker persistence + TKB adapter/selective carry-forward;
- `P4-072`: HĐTN-HN workbook importer/preview;
- `P4-073`: GDĐP workbook importer/preview;
- `P4-074`: confirmation/publish/materialization orchestration + end-to-end regression.

All depend on accepted/closed P4-070 architecture.

## Consequences

Teachers keep simple workbooks while the server retains exact scheduling provenance.

Programme intent can be deterministically bound to exact civil dates and slots without fabricating ordinary curricular rows.

Historical TKB changes do not retroactively drift prior programme scheduling because marker evidence is retained under versioned timetable authority.

P4 workload and reporting remain unchanged in authority and can consume the resulting exact programme slot+teacher evidence.

## Rejected alternatives

### Put civil dates and slot IDs into Excel

Rejected because these are system-owned technical identifiers and would make school workbooks brittle and user-hostile.

### Treat GDĐP/TN-HN markers as ordinary TimetableEntry rows

Rejected because no ordinary TeachingAssignment/subject lesson semantics exist for those special programme placeholders.

### Re-read current TKB only at import time without retained marker evidence

Rejected because historical/versioned timetable changes could alter later resolution and destroy exact provenance.

### Infer the first N available slots

Rejected because it silently hides schedule mismatch and violates fail-closed planning.

### Store workload coefficient in workbook

Rejected because coefficients are date-effective Business Configuration policy.

## Non-scope

No implementation, schema migration, importer endpoint, Web UI, production mutation, CC programme design, room booking, participant roster or adjusted-workload semantics is authorized by this ADR alone.
