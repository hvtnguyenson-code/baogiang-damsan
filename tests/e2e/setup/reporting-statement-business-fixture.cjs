/* eslint-disable no-console */
const assert = require('node:assert/strict');
const { URL } = require('node:url');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

const repository = 'hvtnguyenson-code/baogiang-damsan';
const password = 'ReportingStatementE2ePassword9';

function requireSafeCiDatabase(env) {
  assert.equal(env.NODE_ENV, 'test', 'Reporting Statement Playwright fixture requires NODE_ENV=test.');
  assert.equal(env.CI, 'true', 'Reporting Statement Playwright fixture requires CI=true.');
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Reporting Statement Playwright fixture requires GitHub Actions.');
  assert.equal(env.GITHUB_REPOSITORY, repository, 'Reporting Statement Playwright fixture refuses an unknown repository.');
  assert.ok(env.TEST_DATABASE_URL, 'TEST_DATABASE_URL is required.');
  const url = new URL(env.TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname), 'Fixture refuses a non-loopback database host.');
  assert.equal(url.pathname.replace(/^\//, ''), 'baogiang_test', 'Fixture requires the exact baogiang_test database.');
  return env.TEST_DATABASE_URL;
}

async function main() {
  const databaseUrl = requireSafeCiDatabase(process.env);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const existing = await prisma.user.count({ where: { username: { in: ['e2e-rs-teacher', 'e2e-rs-reader-a', 'e2e-rs-reader-b', 'e2e-rs-approver'] } } });
    assert.equal(existing, 0, 'Fixture users already exist; refusing to overwrite or reuse state.');
    const [subjectA, subjectB] = await prisma.$transaction([
      prisma.subject.create({ data: { code: 'E2E-RS-A', name: 'Môn kiểm thử A' } }),
      prisma.subject.create({ data: { code: 'E2E-RS-B', name: 'Môn kiểm thử B' } }),
    ]);
    const year = await prisma.academicYear.create({ data: { code: '2026-E2E-RS', name: 'Năm học kiểm thử báo cáo' } });
    await prisma.academicCalendarVersion.create({ data: {
      academicYearId: year.id, versionNumber: 1, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2027-05-31T00:00:00.000Z'),
      officialWeekCount: 35, reserveWeekCount: 1, teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'], isActive: true, activatedAt: new Date('2026-08-01T00:00:00.000Z'),
    } });
    const schoolClass = await prisma.schoolClass.create({ data: { academicYearId: year.id, code: 'E2E-RS-12A', name: 'Lớp kiểm thử 12A', gradeLevel: 12 } });
    const passwordHash = await argon2.hash(password);
    const users = await Promise.all([
      ['e2e-rs-teacher', 'Giáo viên kiểm thử', true], ['e2e-rs-reader-a', 'Người đọc môn A', false], ['e2e-rs-reader-b', 'Người đọc môn B', false], ['e2e-rs-approver', 'Người phê duyệt kiểm thử', false],
    ].map(([username, displayName, isTeachingStaff]) => prisma.user.create({ data: { username, passwordHash, status: 'ACTIVE', mustChangePassword: false, profile: { create: { displayName, isTeachingStaff } } } })));
    const [teacher, readerA, readerB, approver] = users;
    await prisma.capabilityGrant.createMany({ data: [
      { userId: teacher.id, capabilityKey: 'REPORTING_STATEMENT_SUBMIT', scopeType: 'PERSONAL', grantedByUserId: teacher.id },
      { userId: teacher.id, capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'PERSONAL', grantedByUserId: teacher.id },
      { userId: readerA.id, capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SUBJECT', scopeResourceId: subjectA.id, grantedByUserId: readerA.id },
      { userId: readerB.id, capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SUBJECT', scopeResourceId: subjectB.id, grantedByUserId: readerB.id },
      { userId: approver.id, capabilityKey: 'APPROVAL_PRINCIPAL', scopeType: 'SCHOOL_WIDE', grantedByUserId: approver.id },
      { userId: approver.id, capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SCHOOL_WIDE', grantedByUserId: approver.id },
    ] });
    await prisma.teachingAssignment.create({ data: { academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subjectA.id, teacherUserId: teacher.id, validFrom: new Date('2026-08-01T00:00:00.000Z') } });
    console.log('Reporting Statement Playwright business fixture created on isolated baogiang_test.');
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
