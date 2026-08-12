import ExcelJS from 'exceljs';
import { CatalogStatus, UserStatus } from '@prisma/client';
import request from 'supertest';
import { Phase01Harness, integration, normalizedCode, testOrigin } from '../helpers/phase01-test-harness';

const columnMappings = [
  ['WEEKDAY', 'Thứ'], ['SESSION', 'Buổi'], ['PERIOD_ORDINAL', 'Tiết'],
  ['SCHOOL_CLASS', 'Lớp'], ['SUBJECT', 'Môn'], ['TEACHER', 'Giáo viên'],
].map(([semanticField, sourceHeader]) => ({ semanticField, sourceHeader }));

async function workbookBytes(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('TKB');
  sheet.addRow(columnMappings.map((mapping) => mapping.sourceHeader));
  sheet.addRow(['T2', 'Sáng', 1, '10A', 'Toán', 'GV01']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

integration('timetable import workbook endpoints integration', () => {
  const harness = new Phase01Harness();
  beforeAll(async () => harness.start());
  beforeEach(async () => {
    await harness.clean();
    await harness.seedCapabilities([
      { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
  });
  afterAll(async () => harness.stop());

  async function createProfile(): Promise<{ actor: Awaited<ReturnType<Phase01Harness['actor']>>; profileId: string; revisionId: string }> {
    const actor = await harness.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const response = await actor.agent.post('/api/timetable-import/profiles').set('Origin', testOrigin).send({
      sourceKey: 'workbook-test', name: 'Workbook test', teacherIdentifierMode: 'GENERIC_EXACT',
      sheetNameHint: 'TKB', headerRowHint: 1, columnMappings,
    });
    expect(response.status).toBe(201);
    return { actor, profileId: response.body.id as string, revisionId: response.body.activeRevision.id as string };
  }

  async function academicFixture() {
    const year = await harness.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });
    const calendar = await harness.prisma.academicCalendarVersion.create({ data: {
      academicYearId: year.id, versionNumber: 1, startDate: new Date('2026-09-01Z'), endDate: new Date('2027-05-31Z'),
      officialWeekCount: 35, reserveWeekCount: 0, teachingWeekdays: ['MONDAY'], isActive: false,
    } });
    const week = await harness.prisma.academicWeek.create({ data: { calendarVersionId: calendar.id, kind: 'OFFICIAL', officialWeekNumber: 1, displayLabel: 'Tuần 1', sortOrder: 1 } });
    await harness.prisma.academicWeekSegment.create({ data: { academicWeekId: week.id, calendarVersionId: calendar.id, label: 'W1', segmentOrder: 1, startDate: new Date('2026-09-07Z'), endDate: new Date('2026-09-12Z') } });
    const schoolClass = await harness.prisma.schoolClass.create({ data: { academicYearId: year.id, code: '10A', name: '10A', gradeLevel: 10, status: CatalogStatus.ACTIVE } });
    const subject = await harness.prisma.subject.create({ data: { code: normalizedCode('TOAN'), name: 'Toán', status: CatalogStatus.ACTIVE } });
    const teacher = await harness.prisma.user.create({ data: {
      username: `gv01-${crypto.randomUUID().slice(0, 8)}`, passwordHash: await harness.passwords.hash('TeacherPassword9'), status: UserStatus.ACTIVE,
      profile: { create: { displayName: 'Giáo viên 01', staffCode: 'GV01', isTeachingStaff: true } },
    } });
    const assignment = await harness.prisma.teachingAssignment.create({ data: { academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: teacher.id, validFrom: new Date('2026-09-01Z'), validUntil: new Date('2027-05-31Z') } });
    const slot = await harness.prisma.timeSlotDefinition.create({ data: { academicYearId: year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 1, revision: 1, displayLabel: 'Tiết 1', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z'), isActive: true, allowRegularTeaching: true } });
    return { year, calendar, week, schoolClass, subject, teacher, assignment, slot };
  }

  it('enforces auth, school-wide professional capability and CSRF on both POST routes', async () => {
    const bytes = await workbookBytes();
    for (const route of ['inspect', 'preview']) {
      expect((await request(harness.app.getHttpServer()).post(`/api/timetable-import/workbooks/${route}`).set('Origin', testOrigin).attach('file', bytes, 'test.xlsx')).status).toBe(401);
    }
    const actors = [
      await harness.actor(),
      await harness.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] }),
      await harness.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE', scopeType: 'SUBJECT', scopeResourceId: crypto.randomUUID() }] }),
    ];
    for (const actor of actors) for (const route of ['inspect', 'preview']) {
      expect((await actor.agent.post(`/api/timetable-import/workbooks/${route}`).set('Origin', testOrigin).attach('file', bytes, 'test.xlsx')).status).toBe(403);
    }
    const { actor, revisionId } = await createProfile();
    expect((await actor.agent.post('/api/timetable-import/workbooks/inspect').field('profileRevisionId', revisionId).attach('file', bytes, 'test.xlsx')).status).toBe(403);
    const allowed = await actor.agent.post('/api/timetable-import/workbooks/inspect').set('Origin', testOrigin).field('profileRevisionId', revisionId).attach('file', bytes, 'test.xlsx');
    expect(allowed.status).toBe(201);
  });

  it('uses the exact active revision mappings, rejects a retired revision, and performs no import mutation', async () => {
    const bytes = await workbookBytes();
    const { actor, profileId, revisionId } = await createProfile();
    const before = {
      versions: await harness.prisma.timetableVersion.count(), entries: await harness.prisma.timetableEntry.count(),
      receipts: await harness.prisma.timetableImportReceipt.count(), profiles: await harness.prisma.timetableImportProfile.count(),
      revisions: await harness.prisma.timetableImportProfileRevision.count(), aliases: await harness.prisma.timetableImportEntityAlias.count(),
    };
    const inspected = await actor.agent.post('/api/timetable-import/workbooks/inspect').set('Origin', testOrigin)
      .field('profileRevisionId', revisionId).attach('file', bytes, { filename: 'C:\\fakepath\\TEST.XLSX', contentType: 'application/octet-stream' });
    expect(inspected.status).toBe(201);
    expect(inspected.body).toMatchObject({ profileId, profileRevisionId: revisionId, sourceFileName: 'TEST.XLSX', sheets: [{ name: 'TKB', selectable: true, headerCandidates: [{ rowNumber: 1, complete: true }] }] });
    expect({
      versions: await harness.prisma.timetableVersion.count(), entries: await harness.prisma.timetableEntry.count(),
      receipts: await harness.prisma.timetableImportReceipt.count(), profiles: await harness.prisma.timetableImportProfile.count(),
      revisions: await harness.prisma.timetableImportProfileRevision.count(), aliases: await harness.prisma.timetableImportEntityAlias.count(),
    }).toEqual(before);
    await actor.agent.post(`/api/timetable-import/profiles/${profileId}/retire-active`).set('Origin', testOrigin).send({ expectedActiveRevisionId: revisionId });
    const retired = await actor.agent.post('/api/timetable-import/workbooks/inspect').set('Origin', testOrigin).field('profileRevisionId', revisionId).attach('file', bytes, 'test.xlsx');
    expect(retired.status).toBe(409);
    expect(retired.body.error).toBe('TIMETABLE_IMPORT_PROFILE_REVISION_NOT_ACTIVE');
  });

  it('previews canonical identities and assignment against a historical baseline without import mutation', async () => {
    const target = await academicFixture();
    const { actor, revisionId } = await createProfile();
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('TKB').addRows([
      columnMappings.map((mapping) => mapping.sourceHeader),
      ['T2', 'Sáng', 1, '10A', target.subject.code, 'GV01'],
    ]);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    const preview = () => actor.agent.post('/api/timetable-import/workbooks/preview').set('Origin', testOrigin)
      .field('profileRevisionId', revisionId).field('academicYearId', target.year.id).field('calendarVersionId', target.calendar.id)
      .field('effectiveAcademicWeekId', target.week.id).field('sheetName', 'TKB').field('headerRowNumber', '1')
      .attach('file', bytes, 'tkb.xlsx');
    const before = { versions: await harness.prisma.timetableVersion.count(), entries: await harness.prisma.timetableEntry.count(), receipts: await harness.prisma.timetableImportReceipt.count() };
    const added = await preview();
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ canConfirm: true, rows: [{ sourceRowNumber: 2, timeSlotDefinitionId: target.slot.id, schoolClassId: target.schoolClass.id, subjectId: target.subject.id, teachingAssignmentId: target.assignment.id, teacherUserId: target.teacher.id }], baseline: { timetableVersion: null }, diff: { counts: { added: 1, changed: 0, removed: 0, unchanged: 0 } } });
    expect({ versions: await harness.prisma.timetableVersion.count(), entries: await harness.prisma.timetableEntry.count(), receipts: await harness.prisma.timetableImportReceipt.count() }).toEqual(before);

    const lifecycleAt = new Date('2026-09-01T00:00:00Z');
    const historical = await harness.prisma.timetableVersion.create({ data: {
      academicYearId: target.year.id, versionNumber: 1, status: 'SUPERSEDED', calendarVersionId: target.calendar.id,
      effectiveAcademicWeekId: target.week.id, effectiveFrom: new Date('2026-09-01Z'), effectiveUntil: new Date('2026-09-30Z'),
      createdByUserId: actor.id, validatedByUserId: actor.id, validatedAt: lifecycleAt, approvedByUserId: actor.id,
      approvedAt: lifecycleAt, activatedByUserId: actor.id, activatedAt: lifecycleAt, supersededAt: new Date('2026-10-01T00:00:00Z'),
    } });
    await harness.prisma.timetableEntry.create({ data: { timetableVersionId: historical.id, academicYearId: target.year.id, weekday: 'MONDAY', timeSlotDefinitionId: target.slot.id, schoolClassId: target.schoolClass.id, subjectId: target.subject.id, teachingAssignmentId: target.assignment.id, teacherUserId: target.teacher.id } });
    const unchanged = await preview();
    expect(unchanged.status).toBe(201);
    expect(unchanged.body).toMatchObject({ baseline: { timetableVersion: { id: historical.id, status: 'SUPERSEDED' } }, diff: { counts: { added: 0, changed: 0, removed: 0, unchanged: 1 } } });

    workbook.getWorksheet('TKB')!.addRow(['T2', 'Sáng', 1, '10A', target.subject.code, 'GV01']);
    const duplicateBytes = Buffer.from(await workbook.xlsx.writeBuffer());
    const duplicate = await actor.agent.post('/api/timetable-import/workbooks/preview').set('Origin', testOrigin)
      .field('profileRevisionId', revisionId).field('academicYearId', target.year.id).field('calendarVersionId', target.calendar.id)
      .field('effectiveAcademicWeekId', target.week.id).field('sheetName', 'TKB').field('headerRowNumber', '1').attach('file', duplicateBytes, 'tkb.xlsx');
    expect(duplicate.body.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_CANONICAL_ROW', sourceRowNumber: 2, relatedSourceRowNumbers: [2, 3] }),
      expect.objectContaining({ code: 'DUPLICATE_CANONICAL_ROW', sourceRowNumber: 3, relatedSourceRowNumbers: [2, 3] }),
    ]));
    expect(duplicate.body.diff).toBeNull();
  });
});
