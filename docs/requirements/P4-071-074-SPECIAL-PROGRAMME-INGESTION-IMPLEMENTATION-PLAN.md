# P4-071..P4-074 — Special Programme Ingestion Implementation Plan

- **Parent architecture:** `P4-070`
- **ADR:** `ADR-052-SPECIAL-PROGRAMME-WORKBOOK-SLOT-BRIDGE.md`
- **Traceability:** `T48`
- **Rule:** no implementation task may start until P4-070 is CLOSED
- **Current scope:** task design only; no runtime change in this document

## Task A — P4-071 Retained TKB special-programme marker bridge

### Goal

Persist exact `GDDP` and `HDTN_HN` marker evidence as retained TimetableVersion children and make that evidence usable by later programme import preview/resolution.

### Dependencies

- `P2-050` CLOSED
- `P4-070` CLOSED

### Required implementation

1. Add retained schema/migration for timetable-owned special-programme markers.
2. Preserve exact relations to:
   - TimetableVersion;
   - AcademicYear;
   - SchoolClass;
   - TimeSlotDefinition;
   - kind `GDDP | HDTN_HN`.
3. Add database/runtime duplicate and cross-year guards.
4. Extend native TKB parser/canonical importer so validated class-view `GDĐP` / `TN-HN` cells create marker children, not TimetableEntry rows.
5. Include normalized markers in timetable semantic checksum and confirm fingerprint.
6. Extend morning/afternoon selective authoring:
   - selected session replaced from source evidence;
   - untouched session carried forward exactly from date-effective baseline.
7. Provide an internal read service capable of resolving marker evidence from an exact retained timetable version.
8. Preserve existing class/teacher peer reconciliation semantics for normal teacher-linked lessons.
9. Do not add teacher identity or workload to markers.
10. Do not introduce CC programme semantics.

### Mandatory regression matrix

- ordinary TKB teacher-linked row count unchanged for the same source fixture;
- special marker counts retained exactly from sanitized source evidence;
- duplicate marker rejected;
- cross-year marker relation rejected;
- moving one TN-HN marker changes semantic checksum;
- moving one GDĐP marker changes semantic checksum;
- morning-only update carries afternoon markers exactly;
- afternoon-only update carries morning markers exactly;
- selected-session clearing removes only selected-session markers;
- no marker becomes TimetableEntry/TeachingAssignment;
- historical timetable version retains its original marker children after successor publication.

### Non-scope

No HĐTN/GDĐP workbook parsing, no programme plan mutation, no SpecialActivity materialization, no workload changes, no Web UI.

---

## Task B — P4-072 HĐTN-HN workbook inspect / preview / DRAFT import

### Goal

Implement the agreed HĐTN-HN workbook contract and deterministically resolve week-level programme intent into exact DRAFT P4 planning rows.

### Dependencies

- `P4-070` CLOSED
- `P4-071` CLOSED
- `P4-020` CLOSED
- `P4-030` CLOSED
- `P1-012` CLOSED

### Workbook contract

Required visible columns:

- `Tuần từ`
- `Tuần đến`
- `Số tiết`
- `Quy mô tổ chức`
- `Khối`
- `Chủ đề`
- `Người thực hiện`

Frontend values remain Vietnamese.

### Required inspect/preview behavior

1. Validate exact workbook shape and reject unexpected semantic ambiguity.
2. Parse inclusive week range using official AcademicWeek numbers only.
3. Map Vietnamese modes internally:
   - `Theo lớp` -> `CLASS`;
   - `Theo khối` -> `GRADE`;
   - `Toàn trường` -> `SCHOOL_WIDE`.
4. Resolve exact candidate civil dates via Academic Calendar authority.
5. Resolve exact date-effective TimetableVersion per candidate date.
6. Resolve only retained `HDTN_HN` marker evidence.
7. CLASS:
   - expand to active classes in selected grade;
   - require `GVCN` sentinel;
   - require exact marker count per class;
   - resolve exact-date HomeroomAssignment teacher.
8. GRADE:
   - require explicit teacher set;
   - require complete marker coverage for all target-grade classes;
   - collapse to unique grade-level slots.
9. SCHOOL_WIDE:
   - require explicit teacher set;
   - require complete marker coverage for all active school classes;
   - collapse to unique school-level slots.
10. Require exact equality between `Số tiết` and resolved slot count.
11. Resolve teacher names exactly; no fuzzy user selection.
12. Known supporting-class suffixes may be normalized only through explicit safe parsing.
13. Produce Vietnamese blocker messages with exact row/week/class/teacher context.
14. Confirmation disabled while any BLOCKER exists.

### DRAFT persistence behavior

After explicit authorized confirmation:

- create/reuse correct HĐTN_HN ProgrammeMaster under existing authority;
- create DRAFT ProgrammePlanVersion;
- create ordered ProgrammeTopicItems from normalized rows;
- create DRAFT PlannedProgrammeOccurrences;
- create exact PlannedOccurrenceSlots;
- create exact PlannedSlotStaffing;
- retain deterministic import provenance/checksum;
- do not publish or materialize automatically.

### Mandatory regression matrix

- one CLASS row with all classes resolvable;
- CLASS row with one class missing marker -> whole package blocked;
- CLASS row with missing historical GVCN -> blocked;
- GRADE complete class coverage -> one slot per exact date/time, not class fan-out;
- GRADE incomplete coverage -> blocked;
- SCHOOL_WIDE complete coverage -> one school-wide slot;
- SCHOOL_WIDE incomplete coverage -> blocked;
- explicit teacher name missing -> blocked;
- duplicate normalized full name -> blocked pending explicit authorized identity mapping;
- supporting-class suffix does not add target or workload fan-out;
- required periods less/greater than exact candidates -> blocked;
- week missing/ambiguous -> blocked;
- historical timetable version cutover inside requested range resolves by exact date;
- upload/preview performs zero programme mutation;
- repeated confirm with same request identity is idempotent;
- all frontend strings are Vietnamese and no backend enum is exposed as required user input.

### Non-scope

No coefficient import, no workload computation, no automatic publish, no automatic materialization, no participant roster.

---

## Task C — P4-073 GDĐP workbook inspect / preview / DRAFT import

### Goal

Implement the agreed five-column GDĐP workbook and deterministically bind external PPCT/week/staff-code data to exact grade-level programme slots.

### Dependencies

- `P4-070` CLOSED
- `P4-071` CLOSED
- `P4-020` CLOSED
- `P4-030` CLOSED

### Workbook contract

Required visible columns:

- `Khối`
- `Tiết PPCT`
- `Tuần dạy`
- `Nội dung`
- `Giáo viên dạy`

GDĐP mode is internally `GRADE` for this accepted school workflow; users do not enter the backend enum.

### Required inspect/preview behavior

1. Validate exact five-column semantic contract.
2. Parse grade 10/11/12.
3. Parse `Tiết PPCT` into ordered unique positive integer coordinates.
4. Reject malformed, duplicated or overlapping PPCT coordinates across the grade programme.
5. Derive `requiredPeriods` from exact PPCT coordinate count.
6. Parse `Tuần dạy` as an exact official-week set; non-contiguous comma-separated values stay non-contiguous.
7. Resolve AcademicWeek -> civil dates -> exact date-effective TimetableVersion.
8. Resolve only retained `GDDP` marker evidence.
9. Collapse class markers to a grade candidate only with complete active-class coverage for that exact date/time.
10. Require resolved grade-candidate count to equal PPCT period count exactly.
11. Resolve every teacher staff code exactly to one eligible canonical teacher identity.
12. Missing/ambiguous/inactive-impermissible staff code blocks confirmation.
13. Do not multiply slots or workload by number of classes.
14. Use `Nội dung` as the ProgrammeTopicItem human title.
15. Treat external PPCT coordinate as validation/provenance, not persistent programme item identity.
16. Produce Vietnamese preview/blocker messages.

### DRAFT persistence behavior

After explicit authorized confirmation:

- create/reuse GDDP ProgrammeMaster for exact academic year + grade;
- create DRAFT ProgrammePlanVersion;
- create ordered ProgrammeTopicItems;
- create exact DRAFT grade PlannedProgrammeOccurrences;
- create exact PlannedOccurrenceSlots;
- create exact teacher staffing sets;
- retain deterministic import provenance/checksum;
- do not publish/materialize automatically.

### Mandatory regression matrix

- single-period row;
- multi-period row;
- non-contiguous declared week set;
- malformed PPCT text -> blocked;
- duplicate PPCT coordinate across rows -> blocked;
- incomplete grade marker coverage -> blocked;
- exact grade collapse prevents class fan-out;
- resolved slot count mismatch -> blocked;
- teacher staff code not found -> blocked;
- duplicate staff-code authority -> blocked;
- multiple teachers receive the same exact slot staffing membership;
- upload/preview has zero mutation;
- idempotent confirmation;
- no hardcoded 35-period assumption;
- fully Vietnamese frontend.

### Non-scope

No imported coefficient/converted workload, no ordinary-subject PPCT mutation, no automatic publish/materialize.

---

## Task D — P4-074 Import confirmation / lifecycle orchestration / E2E closure

### Goal

Close the operational path from reviewed workbook preview to retained P4 plan, controlled publication/materialization and downstream effective schedule/workload evidence without creating parallel business semantics.

### Dependencies

- `P4-070` CLOSED
- `P4-071` CLOSED
- `P4-072` CLOSED
- `P4-073` CLOSED
- `P4-040` CLOSED
- `P4-050` CLOSED

### Required implementation

1. Provide one Vietnamese admin/coordinator workspace for special-programme import management, with separate HĐTN-HN and GDĐP templates/workflows.
2. Keep upload/preview read-only.
3. Require explicit authorized confirmation before DRAFT persistence.
4. Show deterministic preview summary:
   - programme/year/grade/mode;
   - topic rows;
   - official weeks;
   - exact civil dates;
   - exact slots;
   - target class/grade/school scope;
   - resolved teacher identities;
   - blockers/warnings.
5. Reuse existing coordinator/BGH authorization; do not grant generic mutation merely because a user can upload/read a file.
6. Provide bounded lifecycle actions using existing P4 semantics:
   - confirm DRAFT import;
   - review;
   - publish plan/occurrences;
   - materialize published occurrences using P4-040.
7. Any batch orchestration must preserve atomicity/idempotency/fail-closed behavior and may not bypass per-entity validation.
8. Never treat import confirmation or publication as TeachingExecution evidence.
9. Verify downstream P4-050 workload only after existing execution + attestation gates.
10. Verify materialized activities participate in the accepted effective-schedule read model when that read-model task is available; unused timetable markers must not appear as activities.
11. Corrections after publication use existing successor/replacement semantics rather than in-place overwrite.
12. Retain import semantic provenance sufficient to explain which workbook package produced a plan version.

### Mandatory end-to-end scenarios

#### HĐTN CLASS

Workbook -> preview -> exact class marker resolution -> historical GVCN -> DRAFT -> publish -> materialize -> no workload until execution + attestation -> policy-based workload after gate.

#### HĐTN GRADE

Workbook -> complete grade marker collapse -> multi-teacher staffing -> one exact slot contribution per participating teacher -> no class-count fan-out.

#### HĐTN SCHOOL_WIDE

Workbook -> complete school marker collapse -> one school-wide occurrence per exact slot -> no class-count fan-out.

#### GDĐP GRADE

Workbook PPCT/week/staff codes -> exact grade marker collapse -> DRAFT -> publish -> materialize -> two or more teachers share exact slots -> each teacher independently receives full policy-weighted contribution after downstream gate.

#### Failure cases

- stale/changed timetable causes preview fingerprint mismatch at confirmation -> reject/re-preview;
- calendar/timetable authority becomes ambiguous -> reject;
- marker count changes -> reject/re-preview;
- teacher identity changes between preview and confirm -> reject/re-preview;
- existing active programme version conflict -> fail closed under P4 lifecycle rules;
- materialization collision -> no partial hidden success;
- repeated command -> idempotent same business result.

### Pilot gate

If the chosen pilot scope includes HĐTN-HN or GDĐP import/operation, P4-074 must be CLOSED before the pilot can claim those programme workflows are operationally supported.

### Explicit non-scope

- workload reduction/override rules owned by P4-060/P4-061;
- CC programme design;
- arbitrary participant rosters;
- room/location booking;
- automatic schedule mutation;
- teacher self-service mutation of school schedule.

## Task-chain closure rule

The chain is strictly ordered:

`P4-070 -> P4-071 -> (P4-072 and P4-073) -> P4-074`

P4-072 and P4-073 may proceed independently after P4-071 closes. P4-074 starts only after both importers close.

Every implementation PR must update the canonical task register, traceability matrix, current project status and its own task document before closure. Merge and deployment remain separately authorized.
