import ExcelJS from 'exceljs';
import { CatalogStatus, UserStatus } from '@prisma/client';
import request from 'supertest';
import { Phase01Harness, integration, normalizedCode, testOrigin } from '../helpers/phase01-test-harness';

const columnMappings = [
  ['WEEKDAY', 'Thứ'], ['SESSION', 'Buổi'], ['PERIOD_ORDINAL', 'Tiết'],
  ['SCHOOL_CLASS', 'Lớp'], ['SUBJECT', 'Môn'], ['TEACHER', 'Giáo viên'],
].map(([semanticField, sourceHeader]) => ({ semanticField, sourceHeader }));

async function workbookBytes(subjectCode = 'Toán'): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('TKB');
  sheet.addRow(columnMappings.map((mapping) => mapping.sourceHeader));
  sheet.addRow(['T2', 'Sáng', 1, '10A', subjectCode, 'GV01']);
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
  afterAll(async () => {
    await harness.clean();
    await harness.stop();
  });

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
    for (const route of ['inspect', 'preview', 'confirm']) {
      expect((await request(harness.app.getHttpServer()).post(`/api/timetable-import/workbooks/${route}`).set('Origin', testOrigin).attach('file', bytes, 'test.xlsx')).status).toBe(401);
    }
    const actors = [
      await harness.actor(),
      await harness.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] }),
      await harness.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE', scopeType: 'SUBJECT', scopeResourceId: crypto.randomUUID() }] }),
    ];
    for (const actor of actors) for (const route of ['inspect', 'preview', 'confirm']) {
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

  it('confirms atomically, replays durably, preserves provenance and enforces imported-DRAFT immutability', async () => {
    const target = await academicFixture();
    const { actor, profileId, revisionId } = await createProfile();
    const bytes = await workbookBytes(target.subject.code);
    const confirm = (requestKey?: string, headerRowNumber = '1') => {
      let pending = actor.agent.post('/api/timetable-import/workbooks/confirm').set('Origin', testOrigin)
        .field('profileRevisionId', revisionId).field('academicYearId', target.year.id)
        .field('calendarVersionId', target.calendar.id).field('effectiveAcademicWeekId', target.week.id)
        .field('sheetName', 'TKB').field('headerRowNumber', headerRowNumber);
      if (requestKey) pending = pending.field('requestIdempotencyKey', requestKey);
      return pending.attach('file', bytes, 'tkb.xlsx');
    };

    const created = await confirm('key-original');
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      outcome: 'CREATED',
      receipt: {
        profileRevisionId: revisionId, requestIdempotencyKey: 'key-original', sourceFileName: 'tkb.xlsx',
        sheetName: 'TKB', headerRowNumber: 1, sourceRowCount: 1, normalizedEntryCount: 1, createdByUserId: actor.id,
      },
      version: {
        status: 'DRAFT', academicYearId: target.year.id, calendarVersionId: target.calendar.id,
        effectiveAcademicWeekId: target.week.id, effectiveFrom: '2026-09-07', entryCount: 1,
      },
    });
    expect(created.body.version.contentChecksum).toMatch(/^[0-9a-f]{64}$/u);
    expect(created.body.receipt.requestFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(await harness.prisma.timetableVersion.count()).toBe(1);
    expect(await harness.prisma.timetableEntry.count()).toBe(1);
    expect(await harness.prisma.timetableImportReceipt.count()).toBe(1);
    expect(await harness.prisma.timetableImportRequestKey.count()).toBe(1);
    expect(await harness.prisma.auditEvent.count({ where: { action: 'TIMETABLE_IMPORT_COMMITTED' } })).toBe(1);

    const sameKeyReplay = await confirm('key-original');
    expect(sameKeyReplay.status).toBe(200);
    expect(sameKeyReplay.body).toMatchObject({
      outcome: 'IDEMPOTENT_REPLAY', receipt: { id: created.body.receipt.id }, version: { id: created.body.version.id },
    });
    expect(await harness.prisma.timetableVersion.count()).toBe(1);
    expect(await harness.prisma.timetableImportReceipt.count()).toBe(1);
    expect(await harness.prisma.timetableImportRequestKey.count()).toBe(1);

    const reused = await confirm('key-original', '2');
    expect(reused.status).toBe(409);
    expect(reused.body.error).toBe('TIMETABLE_IMPORT_IDEMPOTENCY_KEY_REUSED');

    const secondKeyReplay = await confirm('key-second');
    expect(secondKeyReplay.status).toBe(200);
    expect(secondKeyReplay.body).toMatchObject({
      outcome: 'IDEMPOTENT_REPLAY',
      receipt: {
        id: created.body.receipt.id,
        requestIdempotencyKey: 'key-original',
        requestFingerprint: created.body.receipt.requestFingerprint,
      },
      version: { id: created.body.version.id },
    });
    expect(await harness.prisma.timetableImportRequestKey.count()).toBe(2);
    expect(await harness.prisma.auditEvent.count({ where: { action: 'TIMETABLE_IMPORT_REPLAY_BOUND' } })).toBe(1);

    const noKeyReplay = await confirm();
    expect(noKeyReplay.status).toBe(200);
    expect(noKeyReplay.body).toMatchObject({
      outcome: 'IDEMPOTENT_REPLAY', receipt: { id: created.body.receipt.id }, version: { id: created.body.version.id },
    });
    expect(await harness.prisma.timetableImportRequestKey.count()).toBe(2);

    const lockedTarget = await actor.agent.post(`/api/timetable-versions/${created.body.version.id}/target`)
      .set('Origin', testOrigin).send({
        expectedUpdatedAt: created.body.version.updatedAt,
        calendarVersionId: target.calendar.id,
        effectiveAcademicWeekId: target.week.id,
      });
    expect(lockedTarget.status).toBe(409);
    expect(lockedTarget.body.error).toBe('TIMETABLE_IMPORTED_DRAFT_IMMUTABLE');
    const lockedEntries = await actor.agent.put(`/api/timetable-versions/${created.body.version.id}/entries`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: created.body.version.updatedAt, entries: [] });
    expect(lockedEntries.status).toBe(409);
    expect(lockedEntries.body.error).toBe('TIMETABLE_IMPORTED_DRAFT_IMMUTABLE');
    expect(await harness.prisma.timetableEntry.count({ where: { timetableVersionId: created.body.version.id } })).toBe(1);

    const validated = await actor.agent.post(`/api/timetable-versions/${created.body.version.id}/validate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: created.body.version.updatedAt });
    expect(validated.status).toBe(200);
    expect(validated.body.version.status).toBe('VALIDATED');
    await actor.agent.post(`/api/timetable-import/profiles/${profileId}/retire-active`)
      .set('Origin', testOrigin).send({ expectedActiveRevisionId: revisionId });
    const lifecycleReplay = await confirm('key-original');
    expect(lifecycleReplay.status).toBe(200);
    expect(lifecycleReplay.body).toMatchObject({ outcome: 'IDEMPOTENT_REPLAY', version: { status: 'VALIDATED' } });

    const manual = await actor.agent.post(`/api/academic-years/${target.year.id}/timetable-versions`)
      .set('Origin', testOrigin).send({});
    expect(manual.status).toBe(201);
    const manualTarget = await actor.agent.post(`/api/timetable-versions/${manual.body.id}/target`)
      .set('Origin', testOrigin).send({
        expectedUpdatedAt: manual.body.updatedAt,
        calendarVersionId: target.calendar.id,
        effectiveAcademicWeekId: target.week.id,
      });
    expect(manualTarget.status).toBe(200);
    const manualEntries = await actor.agent.put(`/api/timetable-versions/${manual.body.id}/entries`)
      .set('Origin', testOrigin).send({
        expectedUpdatedAt: manualTarget.body.updatedAt,
        entries: [{
          weekday: 'MONDAY', timeSlotDefinitionId: target.slot.id, schoolClassId: target.schoolClass.id,
          subjectId: target.subject.id, teachingAssignmentId: target.assignment.id,
        }],
      });
    expect(manualEntries.status).toBe(200);
    expect(manualEntries.body).toMatchObject({ entryCount: 1, version: { contentChecksum: null } });
  });

  it('creates nothing when confirmation has a blocking canonical issue', async () => {
    const target = await academicFixture();
    const { actor, revisionId } = await createProfile();
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('TKB').addRows([
      columnMappings.map((mapping) => mapping.sourceHeader),
      ['T2', 'Sáng', 1, '10A', target.subject.code, 'GV01'],
      ['T2', 'Sáng', 1, '10A', target.subject.code, 'UNKNOWN'],
    ]);
    const response = await actor.agent.post('/api/timetable-import/workbooks/confirm').set('Origin', testOrigin)
      .field('profileRevisionId', revisionId).field('academicYearId', target.year.id)
      .field('calendarVersionId', target.calendar.id).field('effectiveAcademicWeekId', target.week.id)
      .field('sheetName', 'TKB').field('headerRowNumber', '1').field('requestIdempotencyKey', 'blocked-key')
      .attach('file', Buffer.from(await workbook.xlsx.writeBuffer()), 'blocked.xlsx');
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: 'TIMETABLE_IMPORT_CONFIRM_BLOCKED', blockingIssueCount: 1 });
    expect(response.body.issues).toContainEqual(expect.objectContaining({ code: 'TEACHER_NOT_FOUND' }));
    expect(response.body.issues).not.toContainEqual(expect.objectContaining({ code: 'EMPTY_TIMETABLE' }));
    expect(await harness.prisma.timetableVersion.count()).toBe(0);
    expect(await harness.prisma.timetableEntry.count()).toBe(0);
    expect(await harness.prisma.timetableImportReceipt.count()).toBe(0);
    expect(await harness.prisma.timetableImportRequestKey.count()).toBe(0);
    expect(await harness.prisma.auditEvent.count({
      where: { action: { in: ['TIMETABLE_IMPORT_COMMITTED', 'TIMETABLE_IMPORT_REPLAY_BOUND'] } },
    })).toBe(0);
  });

  it('blocks a header-only confirmation without creating import persistence or success audit', async () => {
    const target = await academicFixture();
    const { actor, revisionId } = await createProfile();
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('TKB').addRow(columnMappings.map((mapping) => mapping.sourceHeader));
    const response = await actor.agent.post('/api/timetable-import/workbooks/confirm').set('Origin', testOrigin)
      .field('profileRevisionId', revisionId).field('academicYearId', target.year.id)
      .field('calendarVersionId', target.calendar.id).field('effectiveAcademicWeekId', target.week.id)
      .field('sheetName', 'TKB').field('headerRowNumber', '1').field('requestIdempotencyKey', 'empty-key')
      .attach('file', Buffer.from(await workbook.xlsx.writeBuffer()), 'empty.xlsx');
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: 'TIMETABLE_IMPORT_CONFIRM_BLOCKED' });
    expect(response.body.issues).toContainEqual(expect.objectContaining({
      code: 'EMPTY_TIMETABLE', severity: 'ERROR', category: 'VALIDATION',
    }));
    expect(await harness.prisma.timetableVersion.count()).toBe(0);
    expect(await harness.prisma.timetableEntry.count()).toBe(0);
    expect(await harness.prisma.timetableImportReceipt.count()).toBe(0);
    expect(await harness.prisma.timetableImportRequestKey.count()).toBe(0);
    expect(await harness.prisma.auditEvent.count({
      where: { action: { in: ['TIMETABLE_IMPORT_COMMITTED', 'TIMETABLE_IMPORT_REPLAY_BOUND'] } },
    })).toBe(0);
  });

  it('permits identical semantic content at a different exact target', async () => {
    const target = await academicFixture();
    const secondWeek = await harness.prisma.academicWeek.create({
      data: {
        calendarVersionId: target.calendar.id,
        kind: 'OFFICIAL',
        officialWeekNumber: 2,
        displayLabel: 'Tuần 2',
        sortOrder: 2,
      },
    });
    await harness.prisma.academicWeekSegment.create({
      data: {
        academicWeekId: secondWeek.id,
        calendarVersionId: target.calendar.id,
        label: 'W2',
        segmentOrder: 1,
        startDate: new Date('2026-09-14Z'),
        endDate: new Date('2026-09-19Z'),
      },
    });
    const { actor, revisionId } = await createProfile();
    const bytes = await workbookBytes(target.subject.code);
    const confirmAt = (weekId: string, key: string) => actor.agent.post('/api/timetable-import/workbooks/confirm')
      .set('Origin', testOrigin).field('profileRevisionId', revisionId).field('academicYearId', target.year.id)
      .field('calendarVersionId', target.calendar.id).field('effectiveAcademicWeekId', weekId)
      .field('sheetName', 'TKB').field('headerRowNumber', '1').field('requestIdempotencyKey', key)
      .attach('file', bytes, 'tkb.xlsx');
    const first = await confirmAt(target.week.id, 'target-one');
    const second = await confirmAt(secondWeek.id, 'target-two');
    expect(first.body.outcome).toBe('CREATED');
    expect(second.body.outcome).toBe('CREATED');
    expect(second.body.version.id).not.toBe(first.body.version.id);
    expect(second.body.version.contentChecksum).toBe(first.body.version.contentChecksum);
    expect(await harness.prisma.timetableVersion.count()).toBe(2);
    expect(await harness.prisma.timetableImportReceipt.count()).toBe(2);
  });

  it('converges after bounded concurrency conflicts without orphan import rows', async () => {
    const target = await academicFixture();
    const { actor, revisionId } = await createProfile();
    const workbookA = new ExcelJS.Workbook();
    workbookA.addWorksheet('TKB').addRows([columnMappings.map((mapping) => mapping.sourceHeader), ['T2', 'Sáng', 1, '10A', target.subject.code, 'GV01']]);
    const bytesA = Buffer.from(await workbookA.xlsx.writeBuffer());
    const requestConfirm = (key: string, bytes: Buffer) => actor.agent.post('/api/timetable-import/workbooks/confirm').set('Origin', testOrigin)
      .field('profileRevisionId', revisionId).field('academicYearId', target.year.id)
      .field('calendarVersionId', target.calendar.id).field('effectiveAcademicWeekId', target.week.id)
      .field('sheetName', 'TKB').field('headerRowNumber', '1').field('requestIdempotencyKey', key)
      .attach('file', bytes, 'tkb.xlsx');

    const semanticKeys = ['concurrent-a', 'concurrent-b'];
    const semanticFirstPass = await Promise.all(semanticKeys.map((key) => requestConfirm(key, bytesA)));
    for (const response of semanticFirstPass) {
      expect([200, 409]).toContain(response.status);
      if (response.status === 409) expect(response.body.error).toBe('TIMETABLE_IMPORT_CONFIRM_CONCURRENCY_CONFLICT');
    }
    const semanticResults = [];
    for (const [index, response] of semanticFirstPass.entries()) {
      const final = response.status === 200 ? response : await requestConfirm(semanticKeys[index]!, bytesA);
      expect(final.status).toBe(200);
      semanticResults.push(final);
    }
    expect(semanticResults.map((item) => item.body.outcome).sort()).toEqual(['CREATED', 'IDEMPOTENT_REPLAY']);
    expect(await harness.prisma.timetableVersion.count()).toBe(1);
    expect(await harness.prisma.timetableImportReceipt.count()).toBe(1);
    expect(await harness.prisma.timetableImportRequestKey.count()).toBe(2);

    await harness.clean();
    await harness.seedCapabilities([
      { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
    const targetB = await academicFixture();
    const profileB = await createProfile();
    const secondWeek = await harness.prisma.academicWeek.create({
      data: {
        calendarVersionId: targetB.calendar.id,
        kind: 'OFFICIAL',
        officialWeekNumber: 2,
        displayLabel: 'Tuần 2',
        sortOrder: 2,
      },
    });
    await harness.prisma.academicWeekSegment.create({
      data: {
        academicWeekId: secondWeek.id,
        calendarVersionId: targetB.calendar.id,
        label: 'W2',
        segmentOrder: 1,
        startDate: new Date('2026-09-14Z'),
        endDate: new Date('2026-09-19Z'),
      },
    });
    const workbookA2 = new ExcelJS.Workbook();
    workbookA2.addWorksheet('TKB').addRows([columnMappings.map((mapping) => mapping.sourceHeader), ['T2', 'Sáng', 1, '10A', targetB.subject.code, 'GV01']]);
    const bytesA2 = Buffer.from(await workbookA2.xlsx.writeBuffer());
    const sameKey = (weekId: string) => profileB.actor.agent.post('/api/timetable-import/workbooks/confirm').set('Origin', testOrigin)
      .field('profileRevisionId', profileB.revisionId).field('academicYearId', targetB.year.id)
      .field('calendarVersionId', targetB.calendar.id).field('effectiveAcademicWeekId', weekId)
      .field('sheetName', 'TKB').field('headerRowNumber', '1').field('requestIdempotencyKey', 'same-race-key')
      .attach('file', bytesA2, 'tkb.xlsx');
    const sameKeyWeeks = [targetB.week.id, secondWeek.id];
    const keyFirstPass = await Promise.all(sameKeyWeeks.map((weekId) => sameKey(weekId)));
    for (const response of keyFirstPass) {
      expect([200, 409]).toContain(response.status);
      if (response.status === 409) {
        expect(['TIMETABLE_IMPORT_IDEMPOTENCY_KEY_REUSED', 'TIMETABLE_IMPORT_CONFIRM_CONCURRENCY_CONFLICT'])
          .toContain(response.body.error);
      }
    }
    const keyResults = [];
    for (const [index, response] of keyFirstPass.entries()) {
      const final = response.status === 409 && response.body.error === 'TIMETABLE_IMPORT_CONFIRM_CONCURRENCY_CONFLICT'
        ? await sameKey(sameKeyWeeks[index]!)
        : response;
      expect([200, 409]).toContain(final.status);
      expect(final.body.error).not.toBe('TIMETABLE_IMPORT_CONFIRM_CONCURRENCY_CONFLICT');
      keyResults.push(final);
    }
    expect(keyResults.map((item) => item.status).sort()).toEqual([200, 409]);
    expect(keyResults.find((item) => item.status === 409)?.body.error).toBe('TIMETABLE_IMPORT_IDEMPOTENCY_KEY_REUSED');
    expect(await harness.prisma.timetableVersion.count()).toBe(1);
    expect(await harness.prisma.timetableImportReceipt.count()).toBe(1);
    expect(await harness.prisma.timetableImportRequestKey.count()).toBe(1);
    expect(await harness.prisma.timetableEntry.count()).toBe(1);
    expect(await harness.prisma.auditEvent.count({ where: { action: 'TIMETABLE_IMPORT_COMMITTED' } })).toBe(1);
  });
});
