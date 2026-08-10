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

function modelBlock(name) {
  const match = schema.match(new RegExp(`model\\s+${name}\\s+\\{([\\s\\S]*?)\\n\\}`, 'u'));
  assert.ok(match, `Missing Prisma model ${name}`);
  return match[1];
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex').toUpperCase();
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
]) {
  modelBlock(model);
}
assert.match(schema, /enum\s+AcademicWeekday\s+\{[\s\S]*MONDAY[\s\S]*SUNDAY[\s\S]*\}/u);
assert.match(schema, /enum\s+AcademicWeekKind\s+\{[\s\S]*OFFICIAL[\s\S]*RESERVE[\s\S]*\}/u);

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

const legacyHashes = new Map([
  ['20260728000000_phase_00_baseline', 'A2185F4F34E90F9B437B3D0DD91B1C473D586849E6B0DFFB766C5AF69546634A'],
  ['20260801000000_phase_01_schema_foundation', '56B7F09859E9851A15D62D17A58066DAFB1798B0E4225858A464B0CD8F47DF9E'],
  ['20260810000000_academic_structure_schema_foundation', 'FC8812756B4041E29BCC8581D8DB47E02FEAA0C40325795CE8574B1F17168AE4'],
]);
for (const [name, expected] of legacyHashes) {
  assert.equal(sha256(read('prisma', 'migrations', name, 'migration.sql')), expected, `Historical migration ${name} changed`);
}

console.log(`Academic and teaching-assignment schema static verification PASS (${academicMigrationName}, ${teachingMigrationName}).`);
