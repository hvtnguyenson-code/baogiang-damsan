# P4-070 — Special Programme Workbook / Timetable-Slot Bridge Architecture

- **Task ID:** `P4-070`
- **Status:** `CLOSED` by `SYNC-P4-070`
- **Starting canonical SHA:** `162ebbaa05d3755dca9c8308ffcaf37fc19d44c3`
- **Branch:** `docs/special-programme-workbook-slot-bridge-070`
- **Dependencies:** `P2-050` CLOSED, `P4-020` CLOSED, `P4-030` CLOSED, `P4-040` CLOSED, `P4-050` CLOSED
- **Traceability:** `T48`
- **Scope:** docs only; no runtime/schema/API/UI/deploy mutation in P4-070

## 1. Product evidence now available

Product Owner supplied and reviewed three operational workbook directions:

1. ordinary subject PPCT workbook;
2. HĐTN-HN workbook;
3. GDĐP workbook.

The HĐTN-HN and GDĐP contracts are intentionally simple and teacher-facing. They describe programme intent, not exact civil-date schedule rows.

### 1.1 HĐTN-HN workbook contract

Teacher-facing columns:

- `Tuần từ`
- `Tuần đến`
- `Số tiết`
- `Quy mô tổ chức`
- `Khối`
- `Chủ đề`
- `Người thực hiện`

Teacher-facing values remain fully Vietnamese:

- `Theo lớp`
- `Theo khối`
- `Toàn trường`
- `GVCN`

Backend mapping is internal only:

- `Theo lớp` -> `CLASS`
- `Theo khối` -> `GRADE`
- `Toàn trường` -> `SCHOOL_WIDE`

The workbook does not contain coefficients, converted workload, civil dates, TimeSlotDefinition IDs, User IDs, class UUIDs, or backend enums.

### 1.2 GDĐP workbook contract

Teacher-facing columns:

- `Khối`
- `Tiết PPCT`
- `Tuần dạy`
- `Nội dung`
- `Giáo viên dạy`

GDĐP is treated as grade-level organisation for the current school workflow. The workbook uses teacher staff codes where available. The workbook does not contain workload coefficients or converted workload.

`Tiết PPCT` is an import validation coordinate. It is not a new persistent programme identity. The canonical programme identity remains retained ProgrammeMaster / ProgrammePlanVersion / ProgrammeTopicItem identity.

### 1.3 Source documents establish the operating pattern

Current school evidence confirms:

- HĐTN-HN rotates among CLASS, GRADE and SCHOOL_WIDE organisation;
- CLASS HĐTN-HN is performed by the date-effective homeroom teacher;
- GRADE / SCHOOL_WIDE HĐTN-HN is performed by explicitly assigned teacher sets;
- text such as `Teacher name + supporting class` contributes only the teacher identity to programme staffing; the supporting class annotation is not a staffing multiplier or target authority;
- GDĐP is organised by grade and may group several curriculum periods into one teaching block;
- multiple teachers may participate in the same GDĐP block and each teacher receives the full eligible slot contribution under the configured workload policy;
- coefficients remain Business Configuration authority and are never imported from these workbooks.

## 2. Problem statement

P4 already has the downstream programme model:

`ProgrammeMaster -> ProgrammePlanVersion -> ProgrammeTopicItem -> PlannedProgrammeOccurrence -> PlannedOccurrenceSlot -> PlannedSlotStaffing -> SpecialActivity`

However a PlannedProgrammeOccurrence ultimately requires:

- exact `civilDate`;
- exact `TimeSlotDefinition`;
- exact mode/target;
- exact teacher set per slot.

The reviewed school workbooks intentionally provide week-level programme intent, not exact civil dates/slot IDs.

The native TKB adapter already recognizes `GDĐP` and `TN-HN` cells as permitted non-peer special markers, but under ADR-047 those markers are structurally validated rather than persisted as ordinary TimetableEntry rows.

Therefore a deterministic bridge is required between:

`programme workbook week intent`

and

`exact retained timetable special-programme windows`.

This bridge must not fabricate TimetableEntry rows, must not create a second timetable truth, and must not ask teachers to enter technical scheduling identifiers into Excel.

## 3. Architectural decision summary

The system SHALL introduce retained timetable-owned special-programme marker evidence for `GDDP` and `HDTN_HN`.

The marker evidence is a retained child of an exact TimetableVersion. It records only the special-programme availability/placement expressed by the authoritative TKB workbook.

The programme importer then combines:

1. workbook programme intent;
2. retained Academic Calendar / AcademicWeek authority;
3. date-effective TimetableVersion authority;
4. retained special-programme marker evidence;
5. staff / homeroom identity authority;
6. existing P4 programme persistence and materialization authority.

No source is allowed to substitute for another source.

## 4. Retained special-programme marker model

P4-071 shall implement a persistence shape equivalent in semantics to:

```text
TimetableSpecialProgrammeMarker
- id
- timetableVersionId
- academicYearId
- schoolClassId
- timeSlotDefinitionId
- kind: GDDP | HDTN_HN
- createdAt
```

Exact physical names may vary only if review demonstrates a stronger existing naming convention.

### 4.1 Ownership

The marker is owned by `TimetableVersion`.

It has no independent effectiveFrom/effectiveUntil or lifecycle status. Historical meaning follows the retained parent TimetableVersion and its exact date-effectivity.

### 4.2 Not a TimetableEntry

A marker SHALL NOT:

- create a fake TeachingAssignment;
- contain a responsible teacher;
- count as ordinary curricular teaching;
- consume ordinary PPCT;
- become TeachingExecution evidence;
- directly contribute workload.

It represents only a reserved structural special-programme slot in the timetable pattern.

### 4.3 Exact uniqueness

At minimum the database/runtime invariant must prevent duplicate semantic markers for the same:

`TimetableVersion + SchoolClass + TimeSlotDefinition + kind`.

Cross-year references must fail closed.

### 4.4 No `CC` expansion in this task family

Current native TKB evidence also recognizes `CC`. P4-070 does not assign new programme semantics to `CC` and does not require `CC` persistence. Any future managed `CC` workflow requires its own authority.

## 5. Native TKB adapter obligations

P4-071 must extend the accepted ADR-047 native adapter without weakening existing peer reconciliation.

### 5.1 Normal teacher-linked rows remain unchanged

The existing teacher-linked curricular rows continue to become canonical TimetableEntry rows under existing rules.

### 5.2 Special markers become retained timetable children

Validated class-view `GDĐP` and `TN-HN` cells create retained special-programme marker rows attached to the exact TimetableVersion.

They remain non-peer markers; no teacher-view peer is invented.

### 5.3 Semantic timetable identity must include special markers

A change in `GDĐP` / `TN-HN` marker placement is a real semantic TKB change.

The canonical semantic checksum / confirmation fingerprint must therefore include a deterministic normalized representation of these retained markers.

Two workbooks that differ only in a special-programme marker position must not collapse to the same canonical timetable semantic identity.

### 5.4 Selective morning/afternoon carry-forward

When only one session is authored, retained special markers belonging to the untouched session must be carried forward from the exact canonical baseline under the same no-fabrication principle as ordinary timetable data.

Selected-session replacement must replace that session's special markers from the newly validated workbook evidence.

The resulting TimetableVersion must remain one coherent complete version.

## 6. Week-to-date resolution

Workbook week numbers are `AcademicWeek.officialWeekNumber` values. They are never computed by adding seven-day offsets from an arbitrary date.

For each requested official week, the resolver must use retained calendar version / AcademicWeek / AcademicWeekSegment authority to enumerate the exact civil dates represented by that business week.

For each exact civil date it must resolve the exact date-effective TimetableVersion and only then consume markers from that version whose TimeSlotDefinition weekday matches that civil date.

Missing or ambiguous calendar/week/timetable authority is a blocker.

Importer logic must never:

- assume a fixed 35-week year;
- calculate week dates with naive arithmetic;
- substitute the current timetable head for the historical/date-effective version;
- silently cross into another official week.

## 7. HĐTN-HN deterministic mapping

### 7.1 Workbook row meaning

One HĐTN-HN workbook row is one planned programme segment.

The row supplies:

- inclusive official week range;
- required period count;
- business mode;
- grade where applicable;
- topic title;
- staffing instruction.

A ProgrammeTopicItem may be created per normalized workbook row. Duplicate human-readable topic titles are allowed; retained item identity and sequence remain canonical.

### 7.2 CLASS mode

For `Theo lớp`:

- `Khối` is required;
- `Người thực hiện` must normalize to the sentinel `GVCN`;
- every active class in the target grade is resolved independently;
- candidate markers are `HDTN_HN` markers for that exact class across the requested week range;
- candidate count for each class must equal `Số tiết` exactly;
- scheduled teacher for each exact occurrence date is the date-effective HomeroomAssignment teacher, using existing retained homeroom authority;
- no current-head GVCN shortcut is allowed.

If any target class is missing, ambiguous, has the wrong marker count, or lacks resolvable homeroom responsibility at an exact date, confirmation is blocked for the whole import package. No silent partial class import.

### 7.3 GRADE mode

For `Theo khối`:

- `Khối` is required;
- explicit teacher set is required;
- class-level HĐTN marker evidence is collapsed into one grade-level candidate only when the same exact date/time marker is present for all active target classes in that grade;
- incomplete grade coverage is a blocker;
- the number of unique grade-level candidates across the requested weeks must equal `Số tiết` exactly;
- the explicit teacher set is attached to every resolved planned slot unless future accepted source evidence introduces per-slot teacher differences.

### 7.4 SCHOOL_WIDE mode

For `Toàn trường`:

- grade and class target are null;
- explicit teacher set is required;
- class-level HĐTN marker evidence is collapsed into one school-wide candidate only when the same exact date/time marker is present for all active classes in the school scope;
- incomplete school coverage is a blocker;
- candidate count must equal `Số tiết` exactly.

School-wide target class cardinality must never multiply teacher workload.

## 8. GDĐP deterministic mapping

### 8.1 Workbook row meaning

One GDĐP workbook row supplies:

- grade;
- exact external PPCT period coordinate(s);
- declared official teaching week(s);
- content/title;
- explicit teacher staff-code set.

### 8.2 `Tiết PPCT` parsing

The importer must parse a deterministic positive integer list/range into an ordered unique period coordinate set.

Examples of accepted normalized meaning may include:

- `1`
- `2,3`
- `6,7,8,9`

Exact accepted textual grammar is implementation-task scope, but ambiguity, duplicates, invalid ordering and malformed tokens must block.

The number of parsed PPCT periods is the row's `requiredPeriods`.

The external period numbers are validation/provenance coordinates, not new persistent programme item IDs.

Across one grade programme, importer validation must reject overlapping external PPCT period coordinates. It must not hardcode a total of 35 periods; any total-programme validation must be derived from the supplied programme package and accepted programme rules.

### 8.3 `Tuần dạy` parsing

`Tuần dạy` may represent one or more exact official week numbers. A comma-separated non-contiguous set must remain non-contiguous; the importer must not fill hidden intermediate weeks.

A displayed range may be normalized only under an explicit unambiguous grammar.

### 8.4 Grade-level marker collapse

For each requested week/date/time candidate:

- use only `GDDP` markers;
- collapse class-level marker evidence into one grade-level candidate only when all active classes in the target grade carry that exact marker;
- incomplete grade coverage blocks confirmation;
- unique resolved grade-level candidate count across the declared weeks must equal the parsed PPCT period count exactly.

No class-count multiplication is permitted.

### 8.5 Teacher resolution

Each teacher staff code must resolve exactly to one eligible teacher identity under existing school identity authority.

Missing, duplicate or ambiguous staff-code resolution is a blocker.

The resolved teacher set is attached to every slot represented by that workbook row unless later source evidence explicitly provides per-slot staffing.

## 9. Teacher-name resolution for HĐTN-HN

HĐTN-HN workbook values are teacher-facing names rather than backend User IDs.

For GRADE / SCHOOL_WIDE rows the importer must normalize each supplied name and require exact unique resolution against eligible teaching staff.

It must not fuzzy-pick a user.

Known school-document suffix text of the form `teacher + supporting class` may be stripped only by an explicit validated normalization rule; the supporting class is not imported as programme target or staffing multiplier.

If normalized full name remains ambiguous, preview must require an authorized explicit identity selection before confirmation.

The persisted programme stores canonical User IDs, never the free-text name as identity authority.

## 10. Exact-count rule and fail-closed behavior

A workbook row is confirmable only if required period count equals exact resolved candidate-slot count.

Examples:

- HĐTN-HN requires 6 periods but exact candidates = 5 -> BLOCK;
- GDĐP PPCT list has 4 periods but exact grade-level marker candidates = 3 -> BLOCK;
- exact candidates > requested periods -> BLOCK; do not silently choose the first N;
- a required week resolves to no authoritative AcademicWeek -> BLOCK;
- timetable marker coverage is incomplete -> BLOCK.

The importer must never auto-pull a slot from the next week or another grade.

## 11. Workbook inspection / preview / confirmation boundary

File upload itself does not mutate programme planning.

The workflow is:

```text
Upload workbook
  -> parse + normalize
  -> resolve calendar/timetable/identity authority
  -> deterministic preview
  -> blockers/warnings
  -> explicit authorized confirmation
  -> persist programme DRAFT package
```

Confirmation must be idempotent and must not trust client-edited normalized rows. The server must either recompute from the exact confirmed workbook bytes/request fingerprint or use an equally strong server-owned confirmation token bound to the exact normalized semantic content.

Raw workbook bytes need not be retained after confirmation unless an implementation review demonstrates a concrete audit requirement. Deterministic semantic provenance/checksum is required.

## 12. Persisted programme state after confirmation

Confirmation creates or updates only the accepted P4 planning family:

- ProgrammeMaster;
- DRAFT ProgrammePlanVersion;
- ProgrammeTopicItem;
- DRAFT PlannedProgrammeOccurrence;
- PlannedOccurrenceSlot;
- PlannedSlotStaffing.

Import confirmation does not bypass existing DRAFT/PUBLISHED/SUPERSEDED lifecycle authority.

Uploading or confirming a workbook does not itself prove teaching occurred.

## 13. Publish/materialize boundary

Existing programme publish authority remains in force.

Only PUBLISHED occurrences are eligible for P4-040 materialization.

P4-074 may add bounded batch orchestration for an authorized operator, but it must call/reuse existing lifecycle/materialization invariants rather than create a parallel SpecialActivity path.

The bridge remains:

```text
retained programme plan
  -> published occurrence
  -> existing P4-040 materialization
  -> SpecialActivity
```

## 14. Workload boundary

Workbook import never stores or trusts workload coefficient values.

Workload remains resolved from `SPECIAL_PROGRAMME_WORKLOAD` Business Configuration using the programme kind/mode and exact eligible slot+teacher evidence.

No default coefficient is allowed.

No class-count multiplication is allowed.

For a two-period GRADE activity with teacher set `{A,B}`, if the active policy coefficient is `1.5`, downstream workload is independently:

- A = `2 x 1.5 = 3`;
- B = `2 x 1.5 = 3`.

The importer stores the two exact slots and both teacher identities; it does not store the number `3`.

## 15. Effective schedule integration

Once an occurrence is published and materialized, it enters the existing SpecialActivity family and therefore participates in any accepted effective-teaching-schedule read model.

A timetable special marker by itself is not a materialized activity and must not appear to teachers as if the activity actually exists.

This prevents unused GDĐP/HĐTN timetable placeholders from creating fake teacher occupancy.

## 16. Frontend localization

Backend contracts retain exact technical names and enums.

All teacher/admin-facing UI for these importers must be Vietnamese, including:

- headings;
- column labels;
- mode names;
- validation errors;
- blocker explanations;
- preview status;
- confirm/publish/materialize actions.

The UI must never require a teacher to translate `CLASS`, `GRADE`, `SCHOOL_WIDE`, `GDDP`, `HDTN_HN` or other backend enum values manually.

## 17. Explicit non-goals

P4-070 does not:

- change the three agreed workbook templates;
- add workload coefficients to workbooks;
- redesign ordinary curricular PPCT allocation;
- turn special markers into TimetableEntry rows;
- add `CC` programme semantics;
- infer arbitrary student participant rosters;
- implement room/location booking;
- create teaching-execution evidence;
- deploy or mutate production.

## 18. Required implementation task family

After P4-070 architecture is accepted and closed, implementation is split into four mandatory tasks:

- `P4-071` — Task A: retained TKB special-programme marker persistence + native-adapter/carry-forward bridge;
- `P4-072` — Task B: HĐTN-HN workbook inspect/preview/import;
- `P4-073` — Task C: GDĐP workbook inspect/preview/import;
- `P4-074` — Task D: authorized import confirmation, publish/materialization orchestration and end-to-end regression.

No implementation task may start until P4-070 is CLOSED.

## 19. Architecture acceptance criteria

P4-070 is architecture-complete only when review agrees that:

1. the three workbook responsibilities remain separated from timetable/calendar/identity authority;
2. exact special marker evidence is retained with TimetableVersion provenance;
3. special markers are not TimetableEntry or teaching evidence;
4. week resolution is AcademicWeek-based and date-effective;
5. CLASS/GRADE/SCHOOL_WIDE collapse semantics are explicit and fail closed;
6. HĐTN GVCN resolution is exact-date historical authority;
7. GDĐP staff-code and HĐTN name resolution never guess;
8. exact period-count equality is mandatory;
9. import confirmation creates DRAFT programme state only and cannot bypass lifecycle authority;
10. P4-040 materialization and P4-050 workload are reused, not reimplemented;
11. coefficients remain Business Configuration authority;
12. frontend remains fully Vietnamese;
13. the implementation chain P4-071..P4-074 is registered before merge.

P4-070 is docs-only. Merge, implementation and deployment remain separately authorized.

## 20. Closure evidence

P4-070 is **CLOSED** by `SYNC-P4-070`. Closure evidence:
- dedicated architecture branch: `docs/special-programme-workbook-slot-bridge-070`;
- canonical starting base: `162ebbaa05d3755dca9c8308ffcaf37fc19d44c3`;
- final reviewed parent HEAD: `9ade8e766f1669f79eedc7bcb58eef783419dc8b`;
- parent PR: #155 (`docs(programme): define special programme workbook slot bridge`);
- exact-head PR CI: CI #496 (run `35578527741`), SUCCESS;
- normal merge/main commit: `d303942373195d2f48c897f488887601c24e9f4f`;
- authoritative post-merge main CI: CI #497 (run `35579219222`), SUCCESS;
- independent exact-diff review: PASS;
- docs-only scope: 8 files, 1134 additions, 0 deletions;
- zero runtime/schema/migration/API/UI/auth/capability/CI/deploy mutation;
- no correction/re-entry task emerged;
- `ADR-052` Accepted;
- downstream `P4-071` unlocked to `READY`.
