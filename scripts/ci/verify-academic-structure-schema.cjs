const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const schema = read('prisma', 'schema.prisma');
const academicMigrationName = '20260810000000_academic_structure_schema_foundation';
const academicMigration = read('prisma', 'migrations', academicMigrationName, 'migration.sql');
const teachingMigrationName = '20260810010000_teaching_assignment_schema_foundation';
const teachingMigration = read('prisma', 'migrations', teachingMigrationName, 'migration.sql');
const timeSlotMigrationName = '20260811020000_time_slot_schema_foundation';
const timeSlotMigration = read('prisma', 'migrations', timeSlotMigrationName, 'migration.sql');
const timetableMigrationName = '20260811030000_timetable_schema_foundation';
const timetableMigration = read('prisma', 'migrations', timetableMigrationName, 'migration.sql');
const timetableImportMigrationName = '20260812010000_timetable_import_persistence_foundation';
const timetableImportMigration = read('prisma', 'migrations', timetableImportMigrationName, 'migration.sql');
const timetableImportRequestKeyMigrationName = '20260812020000_timetable_import_idempotency_bindings';
const timetableImportRequestKeyMigration = read('prisma', 'migrations', timetableImportRequestKeyMigrationName, 'migration.sql');
const ppctMigrationName = '20260813010000_ppct_persistence_foundation';
const ppctMigration = read('prisma', 'migrations', ppctMigrationName, 'migration.sql');
const overlayMigrationName = '20260814010000_operational_overlay_persistence_foundation';
const overlayMigration = read('prisma', 'migrations', overlayMigrationName, 'migration.sql');

function modelBlock(name) {
  const match = schema.match(new RegExp(`model\\s+${name}\\s+\\{([\\s\\S]*?)\\n\\}`, 'u'));
  assert.ok(match, `Missing Prisma model ${name}`);
  return match[1];
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex').toUpperCase();
}

function enumValues(name) {
  const match = schema.match(new RegExp(`enum\\s+${name}\\s+\\{([\\s\\S]*?)\\n\\}`, 'u'));
  assert.ok(match, `Missing Prisma enum ${name}`);
  return match[1]
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

for (const model of [
  'AcademicYear',
  'AcademicCalendarVersion',
  'Semester',
  'AcademicWeek',
  'AcademicWeekSegment',
  'CalendarInterruption',
  'SchoolClass',
  'TeachingAssignment',
  'TimeSlotDefinition',
  'TimetableVersion',
  'TimetableEntry',
  'TimetableImportProfile',
  'TimetableImportProfileRevision',
  'TimetableImportColumnMapping',
  'TimetableImportEntityAlias',
  'TimetableImportReceipt',
  'TimetableImportRequestKey',
  'PpctPlan',
  'PpctVersion',
  'PpctItem',
  'PpctItemRevision',
  'PpctItemLineage',
  'PpctClassAssociation',
  'CalendarException',
  'CalendarExceptionTimeSlot',
  'OperationalLessonDisposition',
  'MakeupTeachingSchedule',
]) {
  modelBlock(model);
}
assert.match(schema, /enum\s+AcademicWeekday\s+\{[\s\S]*MONDAY[\s\S]*SUNDAY[\s\S]*\}/u);
assert.match(schema, /enum\s+AcademicWeekKind\s+\{[\s\S]*OFFICIAL[\s\S]*RESERVE[\s\S]*\}/u);
assert.deepEqual(enumValues('TimeSlotSession'), ['MORNING', 'AFTERNOON', 'EVENING']);
assert.deepEqual(enumValues('TimetableVersionStatus'), ['DRAFT', 'VALIDATED', 'APPROVED', 'ACTIVE', 'SUPERSEDED']);
assert.deepEqual(enumValues('TimetableImportTeacherIdentifierMode'), ['GENERIC_EXACT', 'STAFF_CODE', 'USERNAME', 'APPROVED_ALIAS']);
assert.deepEqual(enumValues('TimetableImportSemanticField'), ['WEEKDAY', 'SESSION', 'PERIOD_ORDINAL', 'SCHOOL_CLASS', 'SUBJECT', 'TEACHER']);
assert.deepEqual(enumValues('TimetableImportAliasEntityType'), ['TEACHER', 'SCHOOL_CLASS', 'SUBJECT']);
assert.deepEqual(enumValues('PpctVersionStatus'), ['DRAFT', 'PUBLISHED', 'SUPERSEDED']);
assert.deepEqual(enumValues('OperationalOverlayStatus'), ['ACTIVE', 'REVERSED']);
assert.deepEqual(enumValues('CalendarExceptionScope'), ['SCHOOL_WIDE', 'GRADE', 'CLASS']);
assert.deepEqual(enumValues('CalendarExceptionTimeSelector'), ['WHOLE_DAY', 'SESSION', 'EXACT_SLOTS']);
assert.deepEqual(enumValues('OperationalLessonDispositionType'), [
  'AUTHORIZED_CANCELLATION',
  'ABSENCE_NO_REPLACEMENT',
  'SAME_SUBJECT_SUBSTITUTION',
  'DIFFERENT_SUBJECT_SUPERVISION',
]);

const calendarVersion = modelBlock('AcademicCalendarVersion');
assert.match(calendarVersion, /academicYearId\s+String\s+@map\("academic_year_id"\)\s+@db\.Uuid/u);
assert.match(calendarVersion, /versionNumber\s+Int\s+@map\("version_number"\)/u);
assert.match(calendarVersion, /officialWeekCount\s+Int\s+@map\("official_week_count"\)/u);
assert.match(calendarVersion, /reserveWeekCount\s+Int\s+@map\("reserve_week_count"\)/u);
assert.match(calendarVersion, /teachingWeekdays\s+AcademicWeekday\[\]\s+@map\("teaching_weekdays"\)/u);
assert.match(calendarVersion, /@@unique\(\[academicYearId, versionNumber\]\)/u);

for (const [model, fields] of [
  ['AcademicCalendarVersion', ['startDate', 'endDate']],
  ['Semester', ['startDate', 'endDate']],
  ['AcademicWeekSegment', ['startDate', 'endDate']],
  ['CalendarInterruption', ['startDate', 'endDate']],
]) {
  const block = modelBlock(model);
  for (const field of fields) {
    assert.match(block, new RegExp(`${field}\\s+DateTime\\s+@map\\("[a-z_]+"\\)\\s+@db\\.Date`, 'u'), `${model}.${field} must use @db.Date`);
  }
}
for (const model of [
  'AcademicYear',
  'AcademicCalendarVersion',
  'Semester',
  'AcademicWeek',
  'AcademicWeekSegment',
  'CalendarInterruption',
  'SchoolClass',
]) {
  const block = modelBlock(model);
  assert.match(block, /createdAt\s+DateTime[\s\S]*@db\.Timestamptz\(3\)/u, `${model}.createdAt must be TIMESTAMPTZ(3)`);
  assert.match(block, /updatedAt\s+DateTime[\s\S]*@db\.Timestamptz\(3\)/u, `${model}.updatedAt must be TIMESTAMPTZ(3)`);
}
assert.match(calendarVersion, /activatedAt\s+DateTime\?[\s\S]*@db\.Timestamptz\(3\)/u);

const week = modelBlock('AcademicWeek');
assert.match(week, /kind\s+AcademicWeekKind/u);
assert.match(week, /officialWeekNumber\s+Int\?/u);
assert.match(week, /reserveWeekNumber\s+Int\?/u);
assert.doesNotMatch(week, /startDate|endDate/u, 'Real dates belong to AcademicWeekSegment, not AcademicWeek');

const segment = modelBlock('AcademicWeekSegment');
assert.match(segment, /academicWeekId\s+String[\s\S]*@db\.Uuid/u);
assert.match(segment, /calendarVersionId\s+String[\s\S]*@db\.Uuid/u);
assert.match(segment, /fields:\s*\[academicWeekId, calendarVersionId\][\s\S]*references:\s*\[id, calendarVersionId\]/u);

const schoolClass = modelBlock('SchoolClass');
assert.match(schoolClass, /@@unique\(\[id, academicYearId\]\)/u);
assert.match(schoolClass, /@@unique\(\[academicYearId, code\]\)/u);
assert.doesNotMatch(schema, /\bmodel\s+(HomeroomAssignment|Timetable|Student|Enrollment|TimeSlot)\s+\{/u);
assert.doesNotMatch(schema, /\b35\b/u, 'Week counts must be data, not a schema constant');

const teachingAssignment = modelBlock('TeachingAssignment');
assert.equal((schema.match(/\bmodel\s+TeachingAssignment\s+\{/gu) ?? []).length, 1);
for (const field of ['academicYearId', 'schoolClassId', 'subjectId', 'teacherUserId']) {
  assert.match(teachingAssignment, new RegExp(`${field}\\s+String[\\s\\S]*?@db\\.Uuid`, 'u'), `${field} must use UUID`);
}
assert.match(teachingAssignment, /validFrom\s+DateTime\s+@map\("valid_from"\)\s+@db\.Date/u);
assert.match(teachingAssignment, /validUntil\s+DateTime\?\s+@map\("valid_until"\)\s+@db\.Date/u);
assert.match(teachingAssignment, /createdAt\s+DateTime[\s\S]*@db\.Timestamptz\(3\)/u);
assert.match(teachingAssignment, /updatedAt\s+DateTime[\s\S]*@db\.Timestamptz\(3\)/u);
assert.doesNotMatch(teachingAssignment, /calendarVersionId/u);
assert.match(teachingAssignment, /academicYear\s+AcademicYear\s+@relation\(fields:\s*\[academicYearId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/u);
assert.match(teachingAssignment, /schoolClass\s+SchoolClass\s+@relation\("TeachingAssignmentSchoolClass",\s*fields:\s*\[schoolClassId, academicYearId\],\s*references:\s*\[id, academicYearId\],\s*onDelete:\s*Restrict\)/u);
assert.match(teachingAssignment, /subject\s+Subject\s+@relation\(fields:\s*\[subjectId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/u);
assert.match(teachingAssignment, /teacher\s+User\s+@relation\("TeachingAssignmentTeacher",\s*fields:\s*\[teacherUserId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/u);

const academicYear = modelBlock('AcademicYear');
const timeSlot = modelBlock('TimeSlotDefinition');
assert.equal((schema.match(/\bmodel\s+TimeSlotDefinition\s+\{/gu) ?? []).length, 1);
assert.match(academicYear, /timeSlotDefinitions\s+TimeSlotDefinition\[\]/u);
for (const field of ['id', 'academicYearId']) {
  assert.match(timeSlot, new RegExp(`${field}\\s+String[\\s\\S]*?@db\\.Uuid`, 'u'), `${field} must use UUID`);
}
assert.match(timeSlot, /weekday\s+AcademicWeekday/u);
assert.match(timeSlot, /session\s+TimeSlotSession/u);
assert.match(timeSlot, /ordinal\s+Int/u);
assert.match(timeSlot, /revision\s+Int/u);
assert.match(timeSlot, /displayLabel\s+String\s+@map\("display_label"\)\s+@db\.VarChar\(50\)/u);
assert.match(timeSlot, /startTime\s+DateTime\s+@map\("start_time"\)\s+@db\.Time\(0\)/u);
assert.match(timeSlot, /endTime\s+DateTime\s+@map\("end_time"\)\s+@db\.Time\(0\)/u);
assert.match(timeSlot, /createdAt\s+DateTime[\s\S]*@db\.Timestamptz\(3\)/u);
assert.match(timeSlot, /updatedAt\s+DateTime[\s\S]*@db\.Timestamptz\(3\)/u);
for (const field of ['allowRegularTeaching', 'allowMakeupTeaching', 'allowSelfStudy']) {
  assert.match(timeSlot, new RegExp(`${field}\\s+Boolean`, 'u'), `Missing explicit usage flag ${field}`);
}
assert.match(timeSlot, /academicYear\s+AcademicYear\s+@relation\(fields:\s*\[academicYearId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/u);
assert.match(timeSlot, /@@unique\(\[id, academicYearId\],\s*map:\s*"time_slot_definitions_id_academic_year_id_key"\)/u);
assert.match(timeSlot, /@@unique\(\[id, academicYearId, weekday\],\s*map:\s*"time_slot_definitions_id_academic_year_id_weekday_key"\)/u);
assert.match(timeSlot, /@@unique\(\[academicYearId, weekday, session, ordinal, revision\],\s*map:\s*"time_slot_definitions_logical_revision_key"\)/u);
assert.doesNotMatch(timeSlot, /validFrom|validUntil|effectiveFrom|effectiveUntil|academicWeekId|calendarVersionId/u);

for (const table of [
  'academic_years',
  'academic_calendar_versions',
  'semesters',
  'academic_weeks',
  'academic_week_segments',
  'calendar_interruptions',
  'classes',
]) {
  assert.match(academicMigration, new RegExp(`CREATE TABLE "${table}"`, 'u'), `Migration missing ${table}`);
}
for (const constraint of [
  'academic_calendar_versions_version_number_check',
  'academic_calendar_versions_date_range_check',
  'academic_calendar_versions_official_week_count_check',
  'academic_calendar_versions_reserve_week_count_check',
  'academic_calendar_versions_teaching_weekdays_check',
  'semesters_date_range_check',
  'semesters_no_overlap',
  'academic_weeks_kind_numbers_check',
  'academic_week_segments_date_range_check',
  'academic_week_segments_no_overlap',
  'calendar_interruptions_date_range_check',
  'calendar_interruptions_no_overlap',
  'classes_grade_level_check',
]) {
  assert.match(academicMigration, new RegExp(`"${constraint}"`, 'u'), `Migration missing ${constraint}`);
}
for (const index of [
  'academic_calendar_versions_one_active_per_year_key',
  'academic_weeks_official_number_key',
  'academic_weeks_reserve_number_key',
  'classes_academic_year_id_code_key',
]) {
  assert.match(academicMigration, new RegExp(`CREATE UNIQUE INDEX "${index}"`, 'u'), `Migration missing ${index}`);
}
assert.match(academicMigration, /academic_calendar_versions_one_active_per_year_key"[\s\S]*WHERE "is_active"/u);
assert.match(academicMigration, /academic_weeks_official_number_key"[\s\S]*WHERE "kind" = 'OFFICIAL'/u);
assert.match(academicMigration, /academic_weeks_reserve_number_key"[\s\S]*WHERE "kind" = 'RESERVE'/u);
assert.match(academicMigration, /academic_week_segments_academic_week_version_fkey"[\s\S]*FOREIGN KEY \("academic_week_id", "calendar_version_id"\)[\s\S]*REFERENCES "academic_weeks"\("id", "calendar_version_id"\)[\s\S]*ON DELETE RESTRICT/u);
assert.equal((academicMigration.match(/EXCLUDE USING gist/gu) ?? []).length, 3);
assert.equal((academicMigration.match(/daterange\("start_date", "end_date", '\[\]'\)/gu) ?? []).length, 3);
assert.doesNotMatch(academicMigration, /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/iu);
assert.doesNotMatch(academicMigration, /\b35\b/u, 'Migration must not hard-code a universal 35-week calendar');

for (const table of ['academic_calendar_versions', 'semesters', 'academic_week_segments', 'calendar_interruptions']) {
  const tableMatch = academicMigration.match(new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\n\\);`, 'u'));
  assert.ok(tableMatch, `Cannot inspect migration table ${table}`);
  for (const column of ['start_date', 'end_date']) {
    assert.match(tableMatch[1], new RegExp(`"${column}" DATE NOT NULL`, 'u'), `${table}.${column} must be DATE`);
  }
}

assert.match(teachingMigration, /CREATE UNIQUE INDEX "classes_id_academic_year_id_key"[\s\S]*ON "classes"\("id", "academic_year_id"\)/u);
assert.match(teachingMigration, /CREATE TABLE "teaching_assignments"/u);
assert.match(teachingMigration, /"valid_from" DATE NOT NULL/u);
assert.match(teachingMigration, /"valid_until" DATE/u);
assert.match(teachingMigration, /"created_at" TIMESTAMPTZ\(3\) NOT NULL/u);
assert.match(teachingMigration, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL/u);
assert.match(teachingMigration, /"teaching_assignments_validity_check"[\s\S]*"valid_until" IS NULL OR "valid_until" >= "valid_from"/u);
assert.match(teachingMigration, /"teaching_assignments_no_overlap"[\s\S]*EXCLUDE USING gist[\s\S]*"academic_year_id" WITH =[\s\S]*"school_class_id" WITH =[\s\S]*"subject_id" WITH =[\s\S]*daterange\("valid_from", "valid_until", '\[\]'\) WITH &&/u);
for (const index of [
  'teaching_assignments_class_subject_validity_idx',
  'teaching_assignments_teacher_year_validity_idx',
  'teaching_assignments_subject_year_validity_idx',
]) {
  assert.match(teachingMigration, new RegExp(`CREATE INDEX "${index}"`, 'u'), `Migration missing ${index}`);
}
assert.match(teachingMigration, /"teaching_assignments_academic_year_id_fkey"[\s\S]*FOREIGN KEY \("academic_year_id"\)[\s\S]*REFERENCES "academic_years"\("id"\)[\s\S]*ON DELETE RESTRICT/u);
assert.match(teachingMigration, /"teaching_assignments_school_class_year_fkey"[\s\S]*FOREIGN KEY \("school_class_id", "academic_year_id"\)[\s\S]*REFERENCES "classes"\("id", "academic_year_id"\)[\s\S]*ON DELETE RESTRICT/u);
assert.match(teachingMigration, /"teaching_assignments_subject_id_fkey"[\s\S]*FOREIGN KEY \("subject_id"\)[\s\S]*REFERENCES "subjects"\("id"\)[\s\S]*ON DELETE RESTRICT/u);
assert.match(teachingMigration, /"teaching_assignments_teacher_user_id_fkey"[\s\S]*FOREIGN KEY \("teacher_user_id"\)[\s\S]*REFERENCES "users"\("id"\)[\s\S]*ON DELETE RESTRICT/u);
for (const constraint of [
  'teaching_assignments_academic_year_id_fkey',
  'teaching_assignments_school_class_year_fkey',
  'teaching_assignments_subject_id_fkey',
  'teaching_assignments_teacher_user_id_fkey',
]) {
  assert.match(teachingMigration, new RegExp(`"${constraint}"[\\s\\S]*?ON DELETE RESTRICT`, 'u'), `${constraint} must restrict deletion`);
}
assert.equal((teachingMigration.match(/EXCLUDE USING gist/gu) ?? []).length, 1);
assert.doesNotMatch(teachingMigration, /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/iu);
assert.doesNotMatch(teachingMigration, /calendar_version_id/iu);

assert.match(timeSlotMigration, /CREATE TYPE "TimeSlotSession" AS ENUM \('MORNING', 'AFTERNOON', 'EVENING'\)/u);
assert.match(timeSlotMigration, /CREATE TABLE "time_slot_definitions"/u);
assert.match(timeSlotMigration, /"start_time" TIME\(0\) WITHOUT TIME ZONE NOT NULL/u);
assert.match(timeSlotMigration, /"end_time" TIME\(0\) WITHOUT TIME ZONE NOT NULL/u);
assert.match(timeSlotMigration, /"created_at" TIMESTAMPTZ\(3\) NOT NULL/u);
assert.match(timeSlotMigration, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL/u);
for (const constraint of [
  'time_slot_definitions_ordinal_check',
  'time_slot_definitions_revision_check',
  'time_slot_definitions_display_label_normalized_check',
  'time_slot_definitions_time_range_check',
  'time_slot_definitions_usage_check',
]) {
  assert.match(timeSlotMigration, new RegExp(`"${constraint}"`, 'u'), `Time-slot migration missing ${constraint}`);
}
assert.match(timeSlotMigration, /CREATE UNIQUE INDEX "time_slot_definitions_id_academic_year_id_key"[\s\S]*\("id", "academic_year_id"\)/u);
assert.match(timeSlotMigration, /CREATE UNIQUE INDEX "time_slot_definitions_logical_revision_key"[\s\S]*\("academic_year_id", "weekday", "session", "ordinal", "revision"\)/u);
assert.match(timeSlotMigration, /CREATE UNIQUE INDEX "time_slot_definitions_one_active_revision_key"[\s\S]*\("academic_year_id", "weekday", "session", "ordinal"\)[\s\S]*WHERE "is_active"/u);
assert.match(timeSlotMigration, /CREATE UNIQUE INDEX "time_slot_definitions_active_label_key"[\s\S]*\("academic_year_id", "weekday", "session", "display_label"\)[\s\S]*WHERE "is_active"/u);
assert.match(timeSlotMigration, /"time_slot_definitions_active_time_no_overlap"[\s\S]*EXCLUDE USING gist[\s\S]*"academic_year_id" WITH =[\s\S]*"weekday" WITH =[\s\S]*int8range\([\s\S]*extract\(epoch FROM "start_time"\)::bigint[\s\S]*extract\(epoch FROM "end_time"\)::bigint[\s\S]*'\[\)'[\s\S]*WITH &&[\s\S]*WHERE \("is_active"\)/u);
assert.match(timeSlotMigration, /"time_slot_definitions_academic_year_id_fkey"[\s\S]*FOREIGN KEY \("academic_year_id"\)[\s\S]*REFERENCES "academic_years"\("id"\)[\s\S]*ON DELETE RESTRICT/u);
assert.doesNotMatch(timeSlotMigration, /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/iu);
assert.doesNotMatch(timeSlotMigration, /calendar_version_id|valid_from|valid_until|effective_from|effective_until/iu);
assert.doesNotMatch(timeSlotMigration, /\b(?:five|5)\s+periods?\b/iu, 'Migration must not hard-code a universal period count');

const timetableVersion = modelBlock('TimetableVersion');
const timetableEntry = modelBlock('TimetableEntry');
assert.equal((schema.match(/\bmodel\s+TimetableVersion\s+\{/gu) ?? []).length, 1);
assert.equal((schema.match(/\bmodel\s+TimetableEntry\s+\{/gu) ?? []).length, 1);
assert.match(calendarVersion, /@@unique\(\[id, academicYearId\],\s*map:\s*"academic_calendar_versions_id_academic_year_id_key"\)/u);
assert.match(teachingAssignment, /@@unique\(\[id, academicYearId, schoolClassId, subjectId, teacherUserId\],\s*map:\s*"teaching_assignments_provenance_key"\)/u);

for (const field of [
  'id', 'academicYearId', 'calendarVersionId', 'effectiveAcademicWeekId', 'createdByUserId',
  'validatedByUserId', 'approvedByUserId', 'activatedByUserId',
]) {
  assert.match(timetableVersion, new RegExp(`${field}\\s+String\\??[\\s\\S]*?@db\\.Uuid`, 'u'), `${field} must use UUID`);
}
assert.match(timetableVersion, /versionNumber\s+Int\s+@map\("version_number"\)/u);
assert.match(timetableVersion, /status\s+TimetableVersionStatus\s+@default\(DRAFT\)/u);
for (const field of ['effectiveFrom', 'effectiveUntil']) {
  assert.match(timetableVersion, new RegExp(`${field}\\s+DateTime\\?\\s+@map\\("[a-z_]+"\\)\\s+@db\\.Date`, 'u'));
}
for (const field of ['validatedAt', 'approvedAt', 'activatedAt', 'supersededAt']) {
  assert.match(timetableVersion, new RegExp(`${field}\\s+DateTime\\?[\\s\\S]*?@db\\.Timestamptz\\(3\\)`, 'u'));
}
assert.match(timetableVersion, /contentChecksum\s+String\?\s+@map\("content_checksum"\)\s+@db\.VarChar\(128\)/u);
assert.match(timetableVersion, /calendarVersion\s+AcademicCalendarVersion\?\s+@relation\("TimetableVersionCalendarSnapshot",\s*fields:\s*\[calendarVersionId, academicYearId\],\s*references:\s*\[id, academicYearId\],\s*onDelete:\s*Restrict\)/u);
assert.match(timetableVersion, /effectiveAcademicWeek\s+AcademicWeek\?\s+@relation\("TimetableVersionEffectiveWeek",\s*fields:\s*\[effectiveAcademicWeekId, calendarVersionId\],\s*references:\s*\[id, calendarVersionId\],\s*onDelete:\s*Restrict\)/u);
assert.match(timetableVersion, /@@unique\(\[id, academicYearId\],\s*map:\s*"timetable_versions_id_academic_year_id_key"\)/u);
assert.match(timetableVersion, /@@unique\(\[academicYearId, versionNumber\],\s*map:\s*"timetable_versions_academic_year_id_version_number_key"\)/u);
assert.doesNotMatch(timetableVersion, /rollbackTarget|reactivatedAt/u);

for (const field of [
  'id', 'timetableVersionId', 'academicYearId', 'timeSlotDefinitionId', 'schoolClassId',
  'subjectId', 'teachingAssignmentId', 'teacherUserId',
]) {
  assert.match(timetableEntry, new RegExp(`${field}\\s+String[\\s\\S]*?@db\\.Uuid`, 'u'), `${field} must use UUID`);
}
assert.match(timetableEntry, /weekday\s+AcademicWeekday/u);
assert.match(timetableEntry, /createdAt\s+DateTime[\s\S]*@db\.Timestamptz\(3\)/u);
assert.doesNotMatch(timetableEntry, /updatedAt|civilDate|effectiveFrom|effectiveUntil|calendarVersionId|academicWeekId|room|span/u);
assert.match(timetableEntry, /timetableVersion\s+TimetableVersion\s+@relation\("TimetableEntryVersion",\s*fields:\s*\[timetableVersionId, academicYearId\],\s*references:\s*\[id, academicYearId\],\s*onDelete:\s*Restrict\)/u);
assert.match(timetableEntry, /timeSlotDefinition\s+TimeSlotDefinition\s+@relation\("TimetableEntryTimeSlot",\s*fields:\s*\[timeSlotDefinitionId, academicYearId, weekday\],\s*references:\s*\[id, academicYearId, weekday\],\s*onDelete:\s*Restrict\)/u);
assert.match(timetableEntry, /teachingAssignment\s+TeachingAssignment\s+@relation\("TimetableEntryAssignment",\s*fields:\s*\[teachingAssignmentId, academicYearId, schoolClassId, subjectId, teacherUserId\],\s*references:\s*\[id, academicYearId, schoolClassId, subjectId, teacherUserId\],\s*onDelete:\s*Restrict\)/u);
for (const index of [
  'timetable_entries_class_exact_slot_key', 'timetable_entries_teacher_exact_slot_key',
  'timetable_entries_version_class_idx', 'timetable_entries_version_teacher_idx',
  'timetable_entries_version_subject_idx', 'timetable_entries_version_assignment_idx',
  'timetable_entries_year_weekday_slot_idx',
]) {
  assert.match(timetableEntry, new RegExp(`map:\\s*"${index}"`, 'u'), `Prisma schema missing ${index}`);
}

assert.match(timetableMigration, /CREATE TYPE "TimetableVersionStatus" AS ENUM \([\s\S]*'DRAFT'[\s\S]*'VALIDATED'[\s\S]*'APPROVED'[\s\S]*'ACTIVE'[\s\S]*'SUPERSEDED'[\s\S]*\)/u);
for (const table of ['timetable_versions', 'timetable_entries']) {
  assert.match(timetableMigration, new RegExp(`CREATE TABLE "${table}"`, 'u'), `Migration missing ${table}`);
}
for (const supportIndex of [
  'academic_calendar_versions_id_academic_year_id_key',
  'time_slot_definitions_id_academic_year_id_weekday_key',
  'teaching_assignments_provenance_key',
]) {
  assert.match(timetableMigration, new RegExp(`CREATE UNIQUE INDEX "${supportIndex}"`, 'u'), `Migration missing ${supportIndex}`);
}
for (const constraint of [
  'timetable_versions_version_number_check', 'timetable_versions_target_triplet_check',
  'timetable_versions_effective_range_check', 'timetable_versions_content_checksum_normalized_check',
  'timetable_versions_validation_actor_pair_check', 'timetable_versions_approval_actor_pair_check',
  'timetable_versions_activation_actor_pair_check', 'timetable_versions_lifecycle_shape_check',
  'timetable_versions_effective_history_no_overlap',
]) {
  assert.match(timetableMigration, new RegExp(`"${constraint}"`, 'u'), `Migration missing ${constraint}`);
}
assert.match(timetableMigration, /CREATE UNIQUE INDEX "timetable_versions_one_active_per_year_key"[\s\S]*WHERE "status" = 'ACTIVE'/u);
assert.match(timetableMigration, /"timetable_versions_effective_history_no_overlap"[\s\S]*EXCLUDE USING gist[\s\S]*"academic_year_id" WITH =[\s\S]*daterange\("effective_from", "effective_until", '\[\]'\) WITH &&[\s\S]*WHERE \("status" IN \('ACTIVE', 'SUPERSEDED'\)\)/u);
assert.match(timetableMigration, /CREATE INDEX "timetable_versions_content_checksum_idx"[\s\S]*\("content_checksum"\)/u);
assert.doesNotMatch(timetableMigration, /CREATE UNIQUE INDEX "[^"]*checksum/iu, 'Content checksum must not be globally unique');
for (const constraint of [
  'timetable_versions_academic_year_id_fkey', 'timetable_versions_calendar_version_year_fkey',
  'timetable_versions_effective_week_calendar_fkey', 'timetable_versions_created_by_user_id_fkey',
  'timetable_versions_validated_by_user_id_fkey', 'timetable_versions_approved_by_user_id_fkey',
  'timetable_versions_activated_by_user_id_fkey', 'timetable_entries_version_year_fkey',
  'timetable_entries_academic_year_id_fkey', 'timetable_entries_time_slot_year_weekday_fkey',
  'timetable_entries_school_class_year_fkey', 'timetable_entries_subject_id_fkey',
  'timetable_entries_assignment_provenance_fkey', 'timetable_entries_teacher_user_id_fkey',
]) {
  assert.match(timetableMigration, new RegExp(`"${constraint}"[\\s\\S]*?ON DELETE RESTRICT`, 'u'), `${constraint} must restrict deletion`);
}
assert.doesNotMatch(timetableMigration, /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/iu);
assert.doesNotMatch(timetableMigration, /rollback_target|reactivated_at|civil_date|room_id|period_span/iu);
assert.doesNotMatch(timetableMigration, /iso_week|week_of_year/iu);
assert.doesNotMatch(timetableMigration, /\b(?:monday\s*[-â€“]\s*friday|five|5)\s+(?:weekdays?|periods?)\b/iu);
const timetableEntryTable = timetableMigration.match(/CREATE TABLE "timetable_entries" \(([\s\S]*?)\n\);/u);
assert.ok(timetableEntryTable, 'Cannot inspect timetable_entries migration table');
assert.doesNotMatch(timetableEntryTable[1], /\bDATE\b/u, 'TimetableEntry must not persist civil-date or effectivity rows');

const importProfile = modelBlock('TimetableImportProfile');
const importRevision = modelBlock('TimetableImportProfileRevision');
const importMapping = modelBlock('TimetableImportColumnMapping');
const importAlias = modelBlock('TimetableImportEntityAlias');
const importReceipt = modelBlock('TimetableImportReceipt');
const importRequestKey = modelBlock('TimetableImportRequestKey');

for (const [modelName, block, fields] of [
  ['TimetableImportProfile', importProfile, ['id', 'createdByUserId']],
  ['TimetableImportProfileRevision', importRevision, ['id', 'profileId', 'createdByUserId', 'retiredByUserId']],
  ['TimetableImportColumnMapping', importMapping, ['id', 'profileRevisionId']],
  ['TimetableImportEntityAlias', importAlias, ['id', 'profileId', 'academicYearId', 'teacherUserId', 'schoolClassId', 'subjectId', 'createdByUserId', 'retiredByUserId']],
  ['TimetableImportReceipt', importReceipt, ['id', 'timetableVersionId', 'profileRevisionId', 'createdByUserId']],
  ['TimetableImportRequestKey', importRequestKey, ['id', 'receiptId']],
]) {
  for (const field of fields) {
    assert.match(block, new RegExp(`${field}\\s+String\\??[\\s\\S]*?@db\\.Uuid`, 'u'), `${modelName}.${field} must use UUID`);
  }
}
for (const [modelName, block, fields] of [
  ['TimetableImportProfile', importProfile, ['createdAt', 'updatedAt']],
  ['TimetableImportProfileRevision', importRevision, ['retiredAt', 'createdAt']],
  ['TimetableImportColumnMapping', importMapping, ['createdAt']],
  ['TimetableImportEntityAlias', importAlias, ['retiredAt', 'createdAt']],
  ['TimetableImportReceipt', importReceipt, ['committedAt']],
  ['TimetableImportRequestKey', importRequestKey, ['boundAt']],
]) {
  for (const field of fields) {
    assert.match(block, new RegExp(`${field}\\s+DateTime\\??[\\s\\S]*?@db\\.Timestamptz\\(3\\)`, 'u'), `${modelName}.${field} must use TIMESTAMPTZ(3)`);
  }
}

assert.match(importProfile, /sourceKey\s+String\s+@map\("source_key"\)\s+@db\.VarChar\(100\)/u);
assert.match(importProfile, /name\s+String\s+@db\.VarChar\(150\)/u);
assert.match(importProfile, /@@unique\(\[sourceKey, name\],\s*map:\s*"timetable_import_profiles_source_key_name_key"\)/u);
assert.match(importProfile, /@@index\(\[sourceKey, name\],\s*map:\s*"timetable_import_profiles_source_key_name_idx"\)/u);
assert.doesNotMatch(importProfile, /academicYear/u, 'Import profiles must remain school-wide');

assert.match(importRevision, /teacherIdentifierMode\s+TimetableImportTeacherIdentifierMode\s+@map\("teacher_identifier_mode"\)/u);
assert.match(importRevision, /@@unique\(\[profileId, revision\],\s*map:\s*"timetable_import_profile_revisions_profile_revision_key"\)/u);
assert.doesNotMatch(importRevision, /updatedAt/u, 'Profile revisions are immutable except retirement metadata');
assert.match(importMapping, /semanticField\s+TimetableImportSemanticField\s+@map\("semantic_field"\)/u);
assert.match(importMapping, /@@unique\(\[profileRevisionId, semanticField\],\s*map:\s*"timetable_import_column_mappings_revision_field_key"\)/u);
assert.match(importMapping, /@@unique\(\[profileRevisionId, sourceHeaderKey\],\s*map:\s*"timetable_import_column_mappings_revision_source_key"\)/u);
assert.doesNotMatch(importMapping, /updatedAt/u);

assert.match(importAlias, /entityType\s+TimetableImportAliasEntityType\s+@map\("entity_type"\)/u);
assert.match(importAlias, /schoolClass\s+SchoolClass\?\s+@relation\("TimetableImportAliasSchoolClass",\s*fields:\s*\[schoolClassId, academicYearId\],\s*references:\s*\[id, academicYearId\],\s*onDelete:\s*Restrict\)/u);
assert.match(importAlias, /teacher\s+User\?\s+@relation\("TimetableImportAliasTeacher"[\s\S]*onDelete:\s*Restrict\)/u);
assert.match(importAlias, /profile\s+TimetableImportProfile\s+@relation\(fields:\s*\[profileId\][\s\S]*onDelete:\s*Restrict\)/u);
assert.doesNotMatch(importAlias, /Json|targetJson|updatedAt/u, 'Aliases require typed targets and retained rows');

assert.match(timetableVersion, /importReceipt\s+TimetableImportReceipt\?\s+@relation\("TimetableImportReceiptVersion"\)/u);
assert.match(timetableVersion, /@@unique\(\[academicYearId, calendarVersionId, effectiveAcademicWeekId, contentChecksum\],\s*map:\s*"timetable_versions_import_semantic_duplicate_key"\)/u);
assert.doesNotMatch(timetableVersion, /@@unique\(\[contentChecksum\]/u, 'Content checksum must not be globally unique');
assert.match(importReceipt, /timetableVersionId\s+String\s+@unique\(map:\s*"timetable_import_receipts_timetable_version_id_key"\)[\s\S]*@db\.Uuid/u);
assert.match(importReceipt, /requestIdempotencyKey\s+String\?\s+@unique\(map:\s*"timetable_import_receipts_request_idempotency_key_key"\)/u);
assert.match(importReceipt, /timetableVersion\s+TimetableVersion\s+@relation\("TimetableImportReceiptVersion"[\s\S]*onDelete:\s*Restrict\)/u);
assert.match(importReceipt, /profileRevision\s+TimetableImportProfileRevision\s+@relation\([\s\S]*onDelete:\s*Restrict\)/u);
assert.match(importReceipt, /requestKeys\s+TimetableImportRequestKey\[\]/u);
assert.doesNotMatch(importReceipt, /updatedAt|academicYearId|calendarVersionId|effectiveAcademicWeekId|semanticChecksum|Bytes|Json/u);

assert.match(importRequestKey, /requestKey\s+String\s+@unique\(map:\s*"timetable_import_request_keys_request_key_key"\)\s+@map\("request_key"\)\s+@db\.VarChar\(200\)/u);
assert.match(importRequestKey, /requestFingerprint\s+String\s+@map\("request_fingerprint"\)\s+@db\.VarChar\(128\)/u);
assert.match(importRequestKey, /receipt\s+TimetableImportReceipt\s+@relation\(fields:\s*\[receiptId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/u);
assert.match(importRequestKey, /@@index\(\[receiptId\],\s*map:\s*"timetable_import_request_keys_receipt_id_idx"\)/u);
assert.match(importRequestKey, /@@map\("timetable_import_request_keys"\)/u);
assert.doesNotMatch(importRequestKey, /requestFingerprint\s+String[^\n]*@unique|Bytes|Json|workbook|formula|url|path/iu);

for (const type of [
  'TimetableImportTeacherIdentifierMode', 'TimetableImportSemanticField', 'TimetableImportAliasEntityType',
]) {
  assert.match(timetableImportMigration, new RegExp(`CREATE TYPE "${type}" AS ENUM`, 'u'), `Migration missing enum ${type}`);
}
for (const table of [
  'timetable_import_profiles', 'timetable_import_profile_revisions', 'timetable_import_column_mappings',
  'timetable_import_entity_aliases', 'timetable_import_receipts',
]) {
  assert.match(timetableImportMigration, new RegExp(`CREATE TABLE "${table}"`, 'u'), `Migration missing ${table}`);
}
for (const index of [
  'timetable_versions_import_semantic_duplicate_key',
  'timetable_import_profile_revisions_one_active_key',
  'timetable_import_entity_aliases_active_global_key',
  'timetable_import_entity_aliases_active_class_key',
  'timetable_import_receipts_timetable_version_id_key',
  'timetable_import_receipts_request_idempotency_key_key',
]) {
  assert.match(timetableImportMigration, new RegExp(`CREATE UNIQUE INDEX "${index}"`, 'u'), `Migration missing ${index}`);
}
assert.match(timetableImportMigration, /timetable_import_profile_revisions_one_active_key"[\s\S]*WHERE "is_active"/u);
assert.match(timetableImportMigration, /timetable_import_entity_aliases_active_global_key"[\s\S]*WHERE "is_active" AND "entity_type" IN \('TEACHER', 'SUBJECT'\)/u);
assert.match(timetableImportMigration, /timetable_import_entity_aliases_active_class_key"[\s\S]*WHERE "is_active" AND "entity_type" = 'SCHOOL_CLASS'/u);
assert.match(timetableImportMigration, /timetable_versions_import_semantic_duplicate_key"[\s\S]*"academic_year_id", "calendar_version_id", "effective_academic_week_id", "content_checksum"/u);
assert.doesNotMatch(timetableImportMigration, /CREATE UNIQUE INDEX "[^"]*"\s+ON "timetable_versions"\("content_checksum"\)/u);
for (const constraint of [
  'timetable_import_profile_revisions_lifecycle_check',
  'timetable_import_column_mappings_source_header_normalized_check',
  'timetable_import_entity_aliases_target_shape_check',
  'timetable_import_entity_aliases_lifecycle_check',
  'timetable_import_receipts_request_pair_check',
  'timetable_import_receipts_checksum_algorithm_check',
  'timetable_import_receipts_serialization_version_check',
]) {
  assert.match(timetableImportMigration, new RegExp(`"${constraint}"`, 'u'), `Migration missing ${constraint}`);
}
assert.match(timetableImportMigration, /timetable_import_entity_aliases_school_class_year_fkey"[\s\S]*FOREIGN KEY \("school_class_id", "academic_year_id"\)[\s\S]*REFERENCES "classes"\("id", "academic_year_id"\)[\s\S]*ON DELETE RESTRICT/u);
for (const constraint of [
  'timetable_import_profiles_created_by_user_id_fkey',
  'timetable_import_profile_revisions_profile_id_fkey',
  'timetable_import_profile_revisions_created_by_user_id_fkey',
  'timetable_import_profile_revisions_retired_by_user_id_fkey',
  'timetable_import_column_mappings_profile_revision_id_fkey',
  'timetable_import_entity_aliases_profile_id_fkey',
  'timetable_import_entity_aliases_academic_year_id_fkey',
  'timetable_import_entity_aliases_teacher_user_id_fkey',
  'timetable_import_entity_aliases_school_class_year_fkey',
  'timetable_import_entity_aliases_subject_id_fkey',
  'timetable_import_entity_aliases_created_by_user_id_fkey',
  'timetable_import_entity_aliases_retired_by_user_id_fkey',
  'timetable_import_receipts_timetable_version_id_fkey',
  'timetable_import_receipts_profile_revision_id_fkey',
  'timetable_import_receipts_created_by_user_id_fkey',
]) {
  assert.match(timetableImportMigration, new RegExp(`"${constraint}"[\\s\\S]*?ON DELETE RESTRICT`, 'u'), `${constraint} must restrict deletion`);
}
assert.doesNotMatch(timetableImportMigration, /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/iu);
assert.doesNotMatch(timetableImportMigration, /\bBYTEA\b|raw_workbook|workbook_body|macro_body|formula_body|filesystem_path/iu);

assert.match(timetableImportRequestKeyMigration, /CREATE TABLE "timetable_import_request_keys"/u);
assert.match(timetableImportRequestKeyMigration, /CREATE UNIQUE INDEX "timetable_import_request_keys_request_key_key"[\s\S]*\("request_key"\)/u);
assert.match(timetableImportRequestKeyMigration, /CREATE INDEX "timetable_import_request_keys_receipt_id_idx"[\s\S]*\("receipt_id"\)/u);
for (const constraint of [
  'timetable_import_request_keys_request_key_normalized_check',
  'timetable_import_request_keys_request_fingerprint_normalized_check',
]) {
  assert.match(timetableImportRequestKeyMigration, new RegExp(`"${constraint}"[\\s\\S]*?btrim`, 'u'), `Migration missing ${constraint}`);
}
assert.match(timetableImportRequestKeyMigration, /"timetable_import_request_keys_receipt_id_fkey"[\s\S]*FOREIGN KEY \("receipt_id"\)[\s\S]*REFERENCES "timetable_import_receipts"\("id"\)[\s\S]*ON DELETE RESTRICT/u);
assert.match(timetableImportRequestKeyMigration, /HAVING COUNT\(\*\) > 1[\s\S]*RAISE EXCEPTION/u, 'Backfill must fail explicitly on conflicting historical keys');
assert.match(timetableImportRequestKeyMigration, /INSERT INTO "timetable_import_request_keys"[\s\S]*SELECT[\s\S]*"id"[\s\S]*"request_idempotency_key"[\s\S]*"request_fingerprint"[\s\S]*"committed_at"[\s\S]*FROM "timetable_import_receipts"[\s\S]*WHERE "request_idempotency_key" IS NOT NULL[\s\S]*AND "request_fingerprint" IS NOT NULL/u);
assert.doesNotMatch(timetableImportRequestKeyMigration, /ON CONFLICT|DO NOTHING|ON DELETE CASCADE|\bBYTEA\b|raw_workbook|workbook_body|formula|filesystem_path/iu);

const ppctPlan = modelBlock('PpctPlan');
const ppctVersion = modelBlock('PpctVersion');
const ppctItem = modelBlock('PpctItem');
const ppctItemRevision = modelBlock('PpctItemRevision');
const ppctItemLineage = modelBlock('PpctItemLineage');
const ppctClassAssociation = modelBlock('PpctClassAssociation');
const ppctBlocks = [ppctPlan, ppctVersion, ppctItem, ppctItemRevision, ppctItemLineage, ppctClassAssociation].join('\n');

for (const modelName of [
  'PpctPlan', 'PpctVersion', 'PpctItem', 'PpctItemRevision', 'PpctItemLineage', 'PpctClassAssociation',
]) {
  assert.equal((schema.match(new RegExp(`\\bmodel\\s+${modelName}\\s+\\{`, 'gu')) ?? []).length, 1, `${modelName} must exist exactly once`);
}

assert.match(ppctPlan, /academicYearId\s+String\s+@map\("academic_year_id"\)\s+@db\.Uuid/u);
assert.match(ppctPlan, /subjectId\s+String\s+@map\("subject_id"\)\s+@db\.Uuid/u);
assert.match(ppctPlan, /gradeLevel\s+Int\s+@map\("grade_level"\)/u);
assert.match(ppctPlan, /@@unique\(\[academicYearId, subjectId, gradeLevel\],\s*map:\s*"ppct_plans_academic_year_id_subject_id_grade_level_key"\)/u);
assert.match(ppctPlan, /@@unique\(\[id, academicYearId, subjectId, gradeLevel\],\s*map:\s*"ppct_plans_identity_key"\)/u);

for (const field of ['id', 'ppctPlanId', 'createdByUserId', 'publishedByUserId', 'supersededByUserId']) {
  assert.match(ppctVersion, new RegExp(`${field}\\s+String\\??[\\s\\S]*?@db\\.Uuid`, 'u'), `PpctVersion.${field} must use UUID`);
}
assert.match(ppctVersion, /versionNumber\s+Int\s+@map\("version_number"\)/u);
assert.match(ppctVersion, /status\s+PpctVersionStatus\s+@default\(DRAFT\)/u);
for (const field of ['publishedAt', 'supersededAt']) {
  assert.match(ppctVersion, new RegExp(`${field}\\s+DateTime\\?[\\s\\S]*?@db\\.Timestamptz\\(3\\)`, 'u'));
}
assert.match(ppctVersion, /@@unique\(\[ppctPlanId, versionNumber\],\s*map:\s*"ppct_versions_ppct_plan_id_version_number_key"\)/u);
assert.match(ppctVersion, /@@unique\(\[id, ppctPlanId\],\s*map:\s*"ppct_versions_id_ppct_plan_id_key"\)/u);
assert.match(ppctVersion, /@@index\(\[ppctPlanId, status\],\s*map:\s*"ppct_versions_ppct_plan_id_status_idx"\)/u);

assert.match(ppctItem, /id\s+String\s+@id[\s\S]*?@db\.Uuid/u);
assert.match(ppctItem, /ppctPlanId\s+String\s+@map\("ppct_plan_id"\)\s+@db\.Uuid/u);
assert.match(ppctItem, /@@unique\(\[id, ppctPlanId\],\s*map:\s*"ppct_items_id_ppct_plan_id_key"\)/u);
assert.doesNotMatch(ppctItem, /sequence|title|lessonType|completed|updatedAt/u);

for (const field of ['ppctVersionId', 'ppctPlanId', 'ppctItemId']) {
  assert.match(ppctItemRevision, new RegExp(`${field}\\s+String[\\s\\S]*?@db\\.Uuid`, 'u'));
}
assert.match(ppctItemRevision, /sequence\s+Int/u);
assert.match(ppctItemRevision, /title\s+String\s+@db\.VarChar\(500\)/u);
assert.match(ppctItemRevision, /lessonType\s+String\s+@map\("lesson_type"\)\s+@db\.VarChar\(100\)/u);
assert.match(ppctItemRevision, /fields:\s*\[ppctVersionId, ppctPlanId\][\s\S]*references:\s*\[id, ppctPlanId\]/u);
assert.match(ppctItemRevision, /fields:\s*\[ppctItemId, ppctPlanId\][\s\S]*references:\s*\[id, ppctPlanId\]/u);
assert.match(ppctItemRevision, /@@unique\(\[ppctVersionId, sequence\],\s*map:\s*"ppct_item_revisions_version_sequence_key"\)/u);
assert.match(ppctItemRevision, /@@unique\(\[ppctVersionId, ppctItemId\],\s*map:\s*"ppct_item_revisions_version_item_key"\)/u);
assert.match(ppctItemRevision, /@@unique\(\[ppctVersionId, ppctItemId, ppctPlanId\],\s*map:\s*"ppct_item_revisions_provenance_key"\)/u);
assert.doesNotMatch(ppctItemRevision, /updatedAt|completed/u);

assert.match(ppctItemLineage, /fields:\s*\[predecessorVersionId, predecessorItemId, ppctPlanId\][\s\S]*references:\s*\[ppctVersionId, ppctItemId, ppctPlanId\]/u);
assert.match(ppctItemLineage, /fields:\s*\[successorVersionId, successorItemId, ppctPlanId\][\s\S]*references:\s*\[ppctVersionId, ppctItemId, ppctPlanId\]/u);
assert.match(ppctItemLineage, /@@unique\(\[predecessorVersionId, predecessorItemId, successorVersionId, successorItemId\],\s*map:\s*"ppct_item_lineage_edge_key"\)/u);
assert.doesNotMatch(ppctItemLineage, /split|merge|LineageType/u);

assert.match(ppctClassAssociation, /effectiveFrom\s+DateTime\s+@map\("effective_from"\)\s+@db\.Date/u);
assert.match(ppctClassAssociation, /effectiveUntil\s+DateTime\?\s+@map\("effective_until"\)\s+@db\.Date/u);
assert.match(ppctClassAssociation, /fields:\s*\[schoolClassId, academicYearId, gradeLevel\][\s\S]*references:\s*\[id, academicYearId, gradeLevel\]/u);
assert.match(ppctClassAssociation, /fields:\s*\[ppctPlanId, academicYearId, subjectId, gradeLevel\][\s\S]*references:\s*\[id, academicYearId, subjectId, gradeLevel\]/u);
assert.match(ppctClassAssociation, /fields:\s*\[ppctVersionId, ppctPlanId\][\s\S]*references:\s*\[id, ppctPlanId\]/u);
assert.match(ppctClassAssociation, /@@unique\(\[id, academicYearId, schoolClassId, subjectId\],\s*map:\s*"ppct_class_associations_provenance_key"\)/u);
assert.match(schoolClass, /@@unique\(\[id, academicYearId, gradeLevel\],\s*map:\s*"classes_id_academic_year_id_grade_level_key"\)/u);

assert.doesNotMatch(ppctBlocks, /calendarVersionId|academicWeekId|completed|checksum|workbook|sheetName|columnMapping|importProfile|requestIdempotency/iu);
assert.doesNotMatch(timetableEntry, /ppct/iu, 'TimetableEntry must not contain PPCT fields');

assert.match(ppctMigration, /CREATE TYPE "PpctVersionStatus" AS ENUM \('DRAFT', 'PUBLISHED', 'SUPERSEDED'\)/u);
for (const table of [
  'ppct_plans', 'ppct_versions', 'ppct_items', 'ppct_item_revisions', 'ppct_item_lineage', 'ppct_class_associations',
]) {
  assert.match(ppctMigration, new RegExp(`CREATE TABLE "${table}"`, 'u'), `PPCT migration missing ${table}`);
}
for (const requiredName of [
  'classes_id_academic_year_id_grade_level_key',
  'ppct_plans_grade_level_check',
  'ppct_plans_academic_year_id_subject_id_grade_level_key',
  'ppct_plans_identity_key',
  'ppct_versions_version_number_check',
  'ppct_versions_published_actor_pair_check',
  'ppct_versions_superseded_actor_pair_check',
  'ppct_versions_lifecycle_shape_check',
  'ppct_versions_one_published_per_plan_key',
  'ppct_item_revisions_sequence_check',
  'ppct_item_revisions_title_normalized_check',
  'ppct_item_revisions_lesson_type_normalized_check',
  'ppct_item_revisions_provenance_key',
  'ppct_item_lineage_distinct_versions_check',
  'ppct_item_lineage_distinct_items_check',
  'ppct_item_lineage_edge_key',
  'ppct_class_associations_effective_range_check',
  'ppct_class_associations_no_overlap',
  'ppct_class_associations_provenance_key',
]) {
  assert.match(ppctMigration, new RegExp(`"${requiredName}"`, 'u'), `PPCT migration missing ${requiredName}`);
}
assert.match(ppctMigration, /"ppct_versions_one_published_per_plan_key"[\s\S]*WHERE "status" = 'PUBLISHED'/u);
assert.match(ppctMigration, /"ppct_class_associations_no_overlap"[\s\S]*EXCLUDE USING gist[\s\S]*daterange\("effective_from", "effective_until", '\[\]'\) WITH &&/u);
for (const constraint of [
  'ppct_plans_academic_year_id_fkey', 'ppct_plans_subject_id_fkey',
  'ppct_versions_ppct_plan_id_fkey', 'ppct_versions_created_by_user_id_fkey',
  'ppct_versions_published_by_user_id_fkey', 'ppct_versions_superseded_by_user_id_fkey',
  'ppct_items_ppct_plan_id_fkey', 'ppct_item_revisions_version_plan_fkey',
  'ppct_item_revisions_item_plan_fkey', 'ppct_item_lineage_predecessor_revision_fkey',
  'ppct_item_lineage_successor_revision_fkey', 'ppct_class_associations_academic_year_id_fkey',
  'ppct_class_associations_school_class_year_grade_fkey', 'ppct_class_associations_subject_id_fkey',
  'ppct_class_associations_plan_scope_fkey', 'ppct_class_associations_version_plan_fkey',
  'ppct_class_associations_created_by_user_id_fkey',
]) {
  assert.match(ppctMigration, new RegExp(`"${constraint}"[\\s\\S]*?ON DELETE RESTRICT`, 'u'), `${constraint} must restrict deletion`);
}
assert.doesNotMatch(ppctMigration, /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/iu);
assert.doesNotMatch(ppctMigration, /ON DELETE CASCADE/iu);
assert.doesNotMatch(ppctMigration, /calendar_version_id|academic_week_id|\bcompleted\b|checksum|workbook|sheet_name|column_mapping|import_profile|request_idempotency/iu);

const calendarException = modelBlock('CalendarException');
const calendarExceptionTimeSlot = modelBlock('CalendarExceptionTimeSlot');
const lessonDisposition = modelBlock('OperationalLessonDisposition');
const makeupSchedule = modelBlock('MakeupTeachingSchedule');
const overlayBlocks = [calendarException, calendarExceptionTimeSlot, lessonDisposition, makeupSchedule].join('\n');

for (const modelName of [
  'CalendarException', 'CalendarExceptionTimeSlot', 'OperationalLessonDisposition', 'MakeupTeachingSchedule',
]) {
  assert.equal((schema.match(new RegExp(`\\bmodel\\s+${modelName}\\s+\\{`, 'gu')) ?? []).length, 1, `${modelName} must exist exactly once`);
}

for (const [modelName, block] of [
  ['CalendarException', calendarException],
  ['OperationalLessonDisposition', lessonDisposition],
  ['MakeupTeachingSchedule', makeupSchedule],
]) {
  for (const field of ['id', 'createdByUserId', 'reversedByUserId', 'replacesId']) {
    assert.match(block, new RegExp(`${field}\\s+String\\??[\\s\\S]*?@db\\.Uuid`, 'u'), `${modelName}.${field} must use UUID`);
  }
  for (const field of ['createdAt', 'updatedAt', 'reversedAt']) {
    assert.match(block, new RegExp(`${field}\\s+DateTime\\??[\\s\\S]*?@db\\.Timestamptz\\(3\\)`, 'u'), `${modelName}.${field} must use TIMESTAMPTZ(3)`);
  }
  assert.match(block, /status\s+OperationalOverlayStatus\s+@default\(ACTIVE\)/u);
  assert.match(block, /createRequestKey\s+String\s+@unique[\s\S]*@db\.VarChar\(200\)/u);
  assert.match(block, /createRequestFingerprint\s+String[\s\S]*@db\.VarChar\(128\)/u);
  assert.match(block, /reverseRequestKey\s+String\?\s+@unique[\s\S]*@db\.VarChar\(200\)/u);
  assert.match(block, /reverseRequestFingerprint\s+String\?[\s\S]*@db\.VarChar\(128\)/u);
  assert.match(block, /reversalReason\s+String\?[\s\S]*@db\.VarChar\(500\)/u);
}

assert.match(calendarException, /civilDate\s+DateTime\s+@map\("civil_date"\)\s+@db\.Date/u);
assert.match(calendarException, /scope\s+CalendarExceptionScope/u);
assert.match(calendarException, /gradeLevel\s+Int\?/u);
assert.match(calendarException, /schoolClassId\s+String\?[\s\S]*@db\.Uuid/u);
assert.match(calendarException, /timeSelector\s+CalendarExceptionTimeSelector/u);
assert.match(calendarException, /session\s+TimeSlotSession\?/u);
assert.match(calendarException, /fields:\s*\[academicCalendarVersionId, academicYearId\][\s\S]*references:\s*\[id, academicYearId\][\s\S]*onDelete:\s*Restrict/u);
assert.match(calendarException, /fields:\s*\[schoolClassId, academicYearId\][\s\S]*references:\s*\[id, academicYearId\][\s\S]*onDelete:\s*Restrict/u);
assert.match(calendarException, /@@unique\(\[id, academicYearId, timeSelector\],\s*map:\s*"calendar_exceptions_exact_slot_parent_key"\)/u);

assert.match(calendarExceptionTimeSlot, /parentTimeSelector\s+CalendarExceptionTimeSelector\s+@default\(EXACT_SLOTS\)/u);
assert.match(calendarExceptionTimeSlot, /fields:\s*\[calendarExceptionId, academicYearId, parentTimeSelector\][\s\S]*references:\s*\[id, academicYearId, timeSelector\][\s\S]*onDelete:\s*Restrict/u);
assert.match(calendarExceptionTimeSlot, /fields:\s*\[timeSlotDefinitionId, academicYearId\][\s\S]*references:\s*\[id, academicYearId\][\s\S]*onDelete:\s*Restrict/u);
assert.match(calendarExceptionTimeSlot, /@@unique\(\[calendarExceptionId, timeSlotDefinitionId\],\s*map:\s*"calendar_exception_time_slots_exception_slot_key"\)/u);

for (const field of [
  'academicYearId', 'timetableVersionId', 'timetableEntryId', 'academicCalendarVersionId',
  'timeSlotDefinitionId', 'schoolClassId', 'subjectId', 'teachingAssignmentId', 'responsibleTeacherUserId',
]) {
  assert.match(lessonDisposition, new RegExp(`${field}\\s+String[\\s\\S]*?@db\\.Uuid`, 'u'));
}
assert.match(lessonDisposition, /sourceCivilDate\s+DateTime\s+@map\("source_civil_date"\)\s+@db\.Date/u);
assert.match(lessonDisposition, /dispositionType\s+OperationalLessonDispositionType/u);
for (const field of ['assignedTeacherUserId', 'eligibilityStaffSubjectId']) {
  assert.match(lessonDisposition, new RegExp(`${field}\\s+String\\?[\\s\\S]*?@db\\.Uuid`, 'u'));
}
for (const field of ['eligibilityWasActive', 'eligibilityWasTeachingStaff', 'eligibilitySameSubject']) {
  assert.match(lessonDisposition, new RegExp(`${field}\\s+Boolean\\?`, 'u'));
}
assert.match(lessonDisposition, /fields:\s*\[timetableEntryId, timetableVersionId, academicYearId, timeSlotDefinitionId, schoolClassId, subjectId, teachingAssignmentId, responsibleTeacherUserId\][\s\S]*references:\s*\[id, timetableVersionId, academicYearId, timeSlotDefinitionId, schoolClassId, subjectId, teachingAssignmentId, teacherUserId\]/u);
assert.doesNotMatch(lessonDisposition, /ppct/iu, 'OperationalLessonDisposition must not own a PPCT item');

for (const field of [
  'ppctClassAssociationId', 'ppctPlanId', 'ppctVersionId', 'ppctItemId',
  'targetAcademicCalendarVersionId', 'targetTimeSlotDefinitionId', 'scheduledTeacherUserId',
]) {
  assert.match(makeupSchedule, new RegExp(`${field}\\s+String[\\s\\S]*?@db\\.Uuid`, 'u'));
}
assert.match(makeupSchedule, /sourceDispositionId\s+String\?[\s\S]*@db\.Uuid/u);
assert.match(makeupSchedule, /originalCivilDate\s+DateTime\s+@map\("original_civil_date"\)\s+@db\.Date/u);
assert.match(makeupSchedule, /targetCivilDate\s+DateTime\s+@map\("target_civil_date"\)\s+@db\.Date/u);
for (const field of ['eligibilityWasActive', 'eligibilityWasTeachingStaff', 'eligibilitySameSubject']) {
  assert.match(makeupSchedule, new RegExp(`${field}\\s+Boolean(?!\\?)`, 'u'));
}
assert.match(makeupSchedule, /fields:\s*\[ppctClassAssociationId, academicYearId, schoolClassId, subjectId, ppctPlanId, ppctVersionId\][\s\S]*references:\s*\[id, academicYearId, schoolClassId, subjectId, ppctPlanId, ppctVersionId\]/u);
assert.match(makeupSchedule, /fields:\s*\[ppctVersionId, ppctItemId, ppctPlanId\][\s\S]*references:\s*\[ppctVersionId, ppctItemId, ppctPlanId\]/u);
assert.match(makeupSchedule, /fields:\s*\[targetAcademicCalendarVersionId, academicYearId\][\s\S]*references:\s*\[id, academicYearId\]/u);
assert.match(makeupSchedule, /fields:\s*\[targetTimeSlotDefinitionId, academicYearId\][\s\S]*references:\s*\[id, academicYearId\]/u);

assert.match(timetableVersion, /@@unique\(\[id, academicYearId, calendarVersionId\],\s*map:\s*"timetable_versions_operational_source_key"\)/u);
assert.match(timetableEntry, /@@unique\(\[id, timetableVersionId, academicYearId, timeSlotDefinitionId, schoolClassId, subjectId, teachingAssignmentId, teacherUserId\],\s*map:\s*"timetable_entries_operational_source_key"\)/u);
assert.match(ppctClassAssociation, /@@unique\(\[id, academicYearId, schoolClassId, subjectId, ppctPlanId, ppctVersionId\],\s*map:\s*"ppct_class_associations_overlay_provenance_key"\)/u);
assert.match(modelBlock('StaffSubject'), /@@unique\(\[id, userId, subjectId\],\s*map:\s*"staff_subjects_eligibility_provenance_key"\)/u);

for (const enumName of [
  'OperationalOverlayStatus', 'CalendarExceptionScope', 'CalendarExceptionTimeSelector', 'OperationalLessonDispositionType',
]) {
  assert.match(overlayMigration, new RegExp(`CREATE TYPE "${enumName}" AS ENUM`, 'u'), `Overlay migration missing ${enumName}`);
}
for (const table of [
  'calendar_exceptions', 'calendar_exception_time_slots', 'operational_lesson_dispositions', 'makeup_teaching_schedules',
]) {
  assert.match(overlayMigration, new RegExp(`CREATE TABLE "${table}"`, 'u'), `Overlay migration missing ${table}`);
}
for (const name of [
  'calendar_exceptions_lifecycle_shape_check', 'calendar_exceptions_scope_shape_check',
  'calendar_exceptions_time_selector_shape_check', 'calendar_exceptions_no_self_replacement_check',
  'calendar_exception_time_slots_exact_selector_check',
  'operational_lesson_dispositions_lifecycle_shape_check', 'operational_lesson_dispositions_type_shape_check',
  'operational_lesson_dispositions_no_self_replacement_check',
  'makeup_teaching_schedules_lifecycle_shape_check', 'makeup_teaching_schedules_eligibility_shape_check',
  'makeup_teaching_schedules_no_self_replacement_check',
]) {
  assert.match(overlayMigration, new RegExp(`"${name}"`, 'u'), `Overlay migration missing ${name}`);
}
assert.match(overlayMigration, /CREATE UNIQUE INDEX "operational_lesson_dispositions_one_active_source_key"[\s\S]*WHERE "status" = 'ACTIVE'/u);
assert.match(overlayMigration, /CREATE UNIQUE INDEX "makeup_teaching_schedules_one_active_obligation_key"[\s\S]*WHERE "status" = 'ACTIVE'/u);
for (const sourceName of [
  'staff_subjects_eligibility_provenance_key', 'timetable_versions_operational_source_key',
  'timetable_entries_operational_source_key', 'ppct_class_associations_overlay_provenance_key',
  'calendar_exception_time_slots_parent_exact_selector_fkey',
  'operational_lesson_dispositions_timetable_version_source_fkey',
  'operational_lesson_dispositions_timetable_entry_source_fkey',
  'makeup_teaching_schedules_original_timetable_version_fkey',
  'makeup_teaching_schedules_original_timetable_entry_fkey',
  'makeup_teaching_schedules_ppct_association_provenance_fkey',
  'makeup_teaching_schedules_ppct_item_revision_fkey',
]) {
  assert.match(overlayMigration, new RegExp(`"${sourceName}"`, 'u'), `Overlay migration missing ${sourceName}`);
}
for (const fk of overlayMigration.matchAll(/ADD CONSTRAINT "([^"]+_fkey)"([\s\S]*?);/gu)) {
  assert.match(fk[2], /ON DELETE RESTRICT/u, `${fk[1]} must restrict deletion`);
}
assert.doesNotMatch(overlayMigration, /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/iu);
assert.doesNotMatch(overlayMigration, /ON DELETE CASCADE/iu);
assert.doesNotMatch(overlayBlocks, /\b(?:completed|completion|debt|progress|report|execution|move|swap|activity)\b/iu);
assert.doesNotMatch(overlayMigration, /\b(?:completed|completion|debt|progress|report|execution|move|swap|activity)\b/iu);

const legacyHashes = new Map([
  ['20260728000000_phase_00_baseline', 'A2185F4F34E90F9B437B3D0DD91B1C473D586849E6B0DFFB766C5AF69546634A'],
  ['20260801000000_phase_01_schema_foundation', '56B7F09859E9851A15D62D17A58066DAFB1798B0E4225858A464B0CD8F47DF9E'],
  ['20260810000000_academic_structure_schema_foundation', 'FC8812756B4041E29BCC8581D8DB47E02FEAA0C40325795CE8574B1F17168AE4'],
  ['20260810010000_teaching_assignment_schema_foundation', '89BC5647B6B451D9026F99CC578BD98F02DE2B186FD63CEF3205E2EFF4B15D07'],
  ['20260811020000_time_slot_schema_foundation', 'EEAFEF46FCC7CD5179973D439FDE66B7EACA68E8E6951974B4AB66C8BD3828E5'],
  ['20260811030000_timetable_schema_foundation', '49C330E7FD0536B4A2D30F64989AA87F677332FD4942600842BB3A7F3AE824CF'],
  ['20260812010000_timetable_import_persistence_foundation', '6118DC8B909C400A11CDA38A6C09B3D8BAAB23B79DC3647B6F3136EAE9EF2CA8'],
  ['20260812020000_timetable_import_idempotency_bindings', '266490FC3BD49FAC9E5C91A6CDAA233717DB227F6BD5AD1529C607C5716199B9'],
  ['20260813010000_ppct_persistence_foundation', 'DFF5874CBCCE3A513644A84D1D6D1532B82F71C175B448B9C1F6BF8D22E75A63'],
]);
for (const [name, expected] of legacyHashes) {
  assert.equal(sha256(read('prisma', 'migrations', name, 'migration.sql')), expected, `Historical migration ${name} changed`);
}

console.log(`Academic, teaching-assignment, time-slot, timetable, timetable-import, PPCT, and operational-overlay schema static verification PASS (${academicMigrationName}, ${teachingMigrationName}, ${timeSlotMigrationName}, ${timetableMigrationName}, ${timetableImportMigrationName}, ${timetableImportRequestKeyMigrationName}, ${ppctMigrationName}, ${overlayMigrationName}).`);
