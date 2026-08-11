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
]) {
  modelBlock(model);
}
assert.match(schema, /enum\s+AcademicWeekday\s+\{[\s\S]*MONDAY[\s\S]*SUNDAY[\s\S]*\}/u);
assert.match(schema, /enum\s+AcademicWeekKind\s+\{[\s\S]*OFFICIAL[\s\S]*RESERVE[\s\S]*\}/u);
assert.deepEqual(enumValues('TimeSlotSession'), ['MORNING', 'AFTERNOON', 'EVENING']);
assert.deepEqual(enumValues('TimetableVersionStatus'), ['DRAFT', 'VALIDATED', 'APPROVED', 'ACTIVE', 'SUPERSEDED']);

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
assert.doesNotMatch(schema, /\bmodel\s+(CalendarException|HomeroomAssignment|Timetable|Student|Enrollment|TimeSlot)\s+\{/u);
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

const legacyHashes = new Map([
  ['20260728000000_phase_00_baseline', 'A2185F4F34E90F9B437B3D0DD91B1C473D586849E6B0DFFB766C5AF69546634A'],
  ['20260801000000_phase_01_schema_foundation', '56B7F09859E9851A15D62D17A58066DAFB1798B0E4225858A464B0CD8F47DF9E'],
  ['20260810000000_academic_structure_schema_foundation', 'FC8812756B4041E29BCC8581D8DB47E02FEAA0C40325795CE8574B1F17168AE4'],
  ['20260810010000_teaching_assignment_schema_foundation', '89BC5647B6B451D9026F99CC578BD98F02DE2B186FD63CEF3205E2EFF4B15D07'],
  ['20260811020000_time_slot_schema_foundation', 'EEAFEF46FCC7CD5179973D439FDE66B7EACA68E8E6951974B4AB66C8BD3828E5'],
]);
for (const [name, expected] of legacyHashes) {
  assert.equal(sha256(read('prisma', 'migrations', name, 'migration.sql')), expected, `Historical migration ${name} changed`);
}

console.log(`Academic, teaching-assignment, time-slot, and timetable schema static verification PASS (${academicMigrationName}, ${teachingMigrationName}, ${timeSlotMigrationName}, ${timetableMigrationName}).`);
