const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const schema = read('prisma', 'schema.prisma');
const migrationName = '20260810000000_academic_structure_schema_foundation';
const migration = read('prisma', 'migrations', migrationName, 'migration.sql');

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
assert.match(schoolClass, /@@unique\(\[academicYearId, code\]\)/u);
assert.doesNotMatch(schema, /\bmodel\s+(CalendarException|HomeroomAssignment|TeachingAssignment|Timetable|Student|Enrollment|TimeSlot)\s+\{/u);
assert.doesNotMatch(schema, /\b35\b/u, 'Week counts must be data, not a schema constant');

for (const table of [
  'academic_years',
  'academic_calendar_versions',
  'semesters',
  'academic_weeks',
  'academic_week_segments',
  'calendar_interruptions',
  'classes',
]) {
  assert.match(migration, new RegExp(`CREATE TABLE "${table}"`, 'u'), `Migration missing ${table}`);
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
  assert.match(migration, new RegExp(`"${constraint}"`, 'u'), `Migration missing ${constraint}`);
}
for (const index of [
  'academic_calendar_versions_one_active_per_year_key',
  'academic_weeks_official_number_key',
  'academic_weeks_reserve_number_key',
  'classes_academic_year_id_code_key',
]) {
  assert.match(migration, new RegExp(`CREATE UNIQUE INDEX "${index}"`, 'u'), `Migration missing ${index}`);
}
assert.match(migration, /academic_calendar_versions_one_active_per_year_key"[\s\S]*WHERE "is_active"/u);
assert.match(migration, /academic_weeks_official_number_key"[\s\S]*WHERE "kind" = 'OFFICIAL'/u);
assert.match(migration, /academic_weeks_reserve_number_key"[\s\S]*WHERE "kind" = 'RESERVE'/u);
assert.match(migration, /academic_week_segments_academic_week_version_fkey"[\s\S]*FOREIGN KEY \("academic_week_id", "calendar_version_id"\)[\s\S]*REFERENCES "academic_weeks"\("id", "calendar_version_id"\)[\s\S]*ON DELETE RESTRICT/u);
assert.equal((migration.match(/EXCLUDE USING gist/gu) ?? []).length, 3);
assert.equal((migration.match(/daterange\("start_date", "end_date", '\[\]'\)/gu) ?? []).length, 3);
assert.doesNotMatch(migration, /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/iu);
assert.doesNotMatch(migration, /\b35\b/u, 'Migration must not hard-code a universal 35-week calendar');

for (const table of ['academic_calendar_versions', 'semesters', 'academic_week_segments', 'calendar_interruptions']) {
  const tableMatch = migration.match(new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\n\\);`, 'u'));
  assert.ok(tableMatch, `Cannot inspect migration table ${table}`);
  for (const column of ['start_date', 'end_date']) {
    assert.match(tableMatch[1], new RegExp(`"${column}" DATE NOT NULL`, 'u'), `${table}.${column} must be DATE`);
  }
}

const legacyHashes = new Map([
  ['20260728000000_phase_00_baseline', 'A2185F4F34E90F9B437B3D0DD91B1C473D586849E6B0DFFB766C5AF69546634A'],
  ['20260801000000_phase_01_schema_foundation', '56B7F09859E9851A15D62D17A58066DAFB1798B0E4225858A464B0CD8F47DF9E'],
]);
for (const [name, expected] of legacyHashes) {
  assert.equal(sha256(read('prisma', 'migrations', name, 'migration.sql')), expected, `Historical migration ${name} changed`);
}

console.log(`Academic structure schema static verification PASS (${migrationName}).`);
