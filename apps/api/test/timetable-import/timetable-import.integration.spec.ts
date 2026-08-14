import { CatalogStatus, UserStatus } from '@prisma/client';
import request from 'supertest';
import { Phase01Harness, integration, normalizedCode, testOrigin } from '../helpers/phase01-test-harness';

const columnMappings = [
  ['WEEKDAY', ' Thứ '],
  ['SESSION', 'Buổi'],
  ['PERIOD_ORDINAL', 'Tiết'],
  ['SCHOOL_CLASS', 'Lớp'],
  ['SUBJECT', 'Môn học'],
  ['TEACHER', 'Giáo viên'],
].map(([semanticField, sourceHeader]) => ({ semanticField, sourceHeader }));

const revisionPayload = (overrides: Record<string, unknown> = {}) => ({
  teacherIdentifierMode: 'GENERIC_EXACT',
  sheetNameHint: '  Thời khóa   biểu ',
  headerRowHint: 2,
  columnMappings,
  ...overrides,
});

const profilePayload = (suffix = '') => ({
  sourceKey: ` SIS.DAMSAN${suffix} `,
  name: `  Cấu hình   nhập ${suffix || 'chính'} `,
  ...revisionPayload(),
});

integration('timetable import configuration control plane integration', () => {
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
    try { await harness.clean(); } finally { await harness.stop(); }
  });

  const manager = () => harness.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });

  it('enforces authentication, explicit professional capability, scope and CSRF', async () => {
    expect((await request(harness.app.getHttpServer()).get('/api/timetable-import/profiles')).status).toBe(401);
    const noCapability = await harness.actor();
    const systemAdmin = await harness.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    const wrongScope = await harness.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE', scopeType: 'SUBJECT', scopeResourceId: crypto.randomUUID() }] });
    for (const actor of [noCapability, systemAdmin, wrongScope]) {
      expect((await actor.agent.get('/api/timetable-import/profiles')).status).toBe(403);
      expect((await actor.agent.post('/api/timetable-import/profiles').set('Origin', testOrigin).send(profilePayload())).status).toBe(403);
    }
    const allowed = await manager();
    expect((await allowed.agent.get('/api/timetable-import/profiles')).status).toBe(200);
    expect((await allowed.agent.post('/api/timetable-import/profiles').send(profilePayload())).status).toBe(403);
    expect((await allowed.agent.post('/api/timetable-import/profiles').set('Origin', testOrigin).send(profilePayload())).status).toBe(201);
  });

  it('creates, normalizes, revises and retires an immutable profile chain with transactional audits', async () => {
    const actor = await manager();
    const created = await actor.agent.post('/api/timetable-import/profiles')
      .set('Origin', testOrigin).set('X-Request-Id', 'profile-create').send(profilePayload());
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ sourceKey: 'sis.damsan', name: 'Cấu hình nhập chính', activeRevision: { revision: 1, isActive: true, sheetNameHint: 'Thời khóa biểu' } });
    expect(created.body.activeRevision.columnMappings).toHaveLength(6);
    expect(await harness.prisma.timetableImportProfile.count()).toBe(1);
    expect(await harness.prisma.timetableImportProfileRevision.count()).toBe(1);
    expect(await harness.prisma.timetableImportColumnMapping.count()).toBe(6);
    expect((await harness.prisma.timetableImportColumnMapping.findFirst({ where: { semanticField: 'WEEKDAY' } }))?.sourceHeaderKey).toBe('thứ');
    expect(await harness.prisma.auditEvent.count({ where: { action: 'TIMETABLE_IMPORT_PROFILE_CREATED', actorUserId: actor.id } })).toBe(1);

    const duplicate = await actor.agent.post('/api/timetable-import/profiles').set('Origin', testOrigin).send(profilePayload());
    expect(duplicate.status).toBe(409);
    const beforeInvalid = await harness.prisma.timetableImportProfile.count();
    expect((await actor.agent.post('/api/timetable-import/profiles').set('Origin', testOrigin).send({ ...profilePayload('-bad'), columnMappings: columnMappings.slice(0, 5) })).status).toBe(400);
    expect(await harness.prisma.timetableImportProfile.count()).toBe(beforeInvalid);

    const profileId = created.body.id as string;
    const revisionOneId = created.body.activeRevision.id as string;
    const revised = await actor.agent.post(`/api/timetable-import/profiles/${profileId}/revise`).set('Origin', testOrigin).send(revisionPayload({
      expectedActiveRevisionId: revisionOneId,
      teacherIdentifierMode: 'STAFF_CODE',
      headerRowHint: 3,
      columnMappings: columnMappings.map((mapping) => ({ ...mapping, sourceHeader: `${mapping.sourceHeader.trim()} mới` })),
    }));
    expect(revised.status).toBe(200);
    expect(revised.body).toMatchObject({ activeRevision: { revision: 2, isActive: true }, revisions: [{ revision: 2 }, { revision: 1, isActive: false }] });
    expect(await harness.prisma.timetableImportColumnMapping.count()).toBe(12);
    expect((await harness.prisma.timetableImportColumnMapping.findMany({ where: { profileRevisionId: revisionOneId }, orderBy: { semanticField: 'asc' } })).map((item) => item.sourceHeader)).toContain('Thứ');
    const stale = await actor.agent.post(`/api/timetable-import/profiles/${profileId}/revise`).set('Origin', testOrigin)
      .send(revisionPayload({ expectedActiveRevisionId: revisionOneId }));
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('TIMETABLE_IMPORT_PROFILE_HEAD_CHANGED');
    expect(await harness.prisma.timetableImportProfileRevision.count()).toBe(2);

    const activeId = revised.body.activeRevision.id as string;
    const retired = await actor.agent.post(`/api/timetable-import/profiles/${profileId}/retire-active`).set('Origin', testOrigin).send({ expectedActiveRevisionId: activeId });
    expect(retired.status).toBe(200);
    expect(retired.body.activeRevision).toBeNull();
    expect(retired.body.revisions).toHaveLength(2);
    expect((await actor.agent.post(`/api/timetable-import/profiles/${profileId}/retire-active`).set('Origin', testOrigin).send({ expectedActiveRevisionId: activeId })).status).toBe(409);
    expect((await actor.agent.get(`/api/timetable-import/profiles/${profileId}`)).body.activeRevision).toBeNull();
    expect(await harness.prisma.auditEvent.count({ where: { action: 'TIMETABLE_IMPORT_PROFILE_REVISED' } })).toBe(1);
    expect(await harness.prisma.auditEvent.count({ where: { action: 'TIMETABLE_IMPORT_PROFILE_REVISION_RETIRED' } })).toBe(2);
  });

  it('allows exactly one competing revise from the same active head', async () => {
    const actor = await manager();
    const created = await actor.agent.post('/api/timetable-import/profiles').set('Origin', testOrigin).send(profilePayload());
    const profileId = created.body.id as string;
    const expectedActiveRevisionId = created.body.activeRevision.id as string;
    const body = revisionPayload({ expectedActiveRevisionId });
    const [first, second] = await Promise.all([
      actor.agent.post(`/api/timetable-import/profiles/${profileId}/revise`).set('Origin', testOrigin).send(body),
      actor.agent.post(`/api/timetable-import/profiles/${profileId}/revise`).set('Origin', testOrigin).send(body),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const revisions = await harness.prisma.timetableImportProfileRevision.findMany({ where: { profileId } });
    expect(revisions).toHaveLength(2);
    expect(revisions.filter((revision) => revision.isActive)).toHaveLength(1);
    expect(new Set(revisions.map((revision) => revision.revision)).size).toBe(2);
    expect(await harness.prisma.auditEvent.count({ where: { action: 'TIMETABLE_IMPORT_PROFILE_REVISED' } })).toBe(1);
  });

  it('creates and retires typed aliases while validating active canonical targets and exact class year', async () => {
    const actor = await manager();
    const profile = await actor.agent.post('/api/timetable-import/profiles').set('Origin', testOrigin).send(profilePayload());
    const profileId = profile.body.id as string;
    const teacher = await harness.prisma.user.create({
      data: { username: `teacher-${crypto.randomUUID()}`, passwordHash: 'fixture', status: UserStatus.ACTIVE, mustChangePassword: false, profile: { create: { displayName: 'Giáo viên', isTeachingStaff: true } } },
    });
    const nonTeacher = await harness.prisma.user.create({
      data: { username: `staff-${crypto.randomUUID()}`, passwordHash: 'fixture', status: UserStatus.ACTIVE, mustChangePassword: false, profile: { create: { displayName: 'Nhân viên', isTeachingStaff: false } } },
    });
    const disabledTeacher = await harness.prisma.user.create({
      data: { username: `disabled-${crypto.randomUUID()}`, passwordHash: 'fixture', status: UserStatus.DISABLED, mustChangePassword: false, profile: { create: { displayName: 'Giáo viên nghỉ', isTeachingStaff: true } } },
    });
    const subject = await harness.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Toán' } });
    const inactiveSubject = await harness.prisma.subject.create({ data: { code: normalizedCode('I'), name: 'Môn nghỉ', status: CatalogStatus.INACTIVE } });
    const yearA = await harness.prisma.academicYear.create({ data: { code: normalizedCode('YA'), name: 'Năm A' } });
    const yearB = await harness.prisma.academicYear.create({ data: { code: normalizedCode('YB'), name: 'Năm B' } });
    const classA = await harness.prisma.schoolClass.create({ data: { academicYearId: yearA.id, code: normalizedCode('CA'), name: '10A', gradeLevel: 10 } });
    const classB = await harness.prisma.schoolClass.create({ data: { academicYearId: yearB.id, code: normalizedCode('CB'), name: '10B', gradeLevel: 10 } });
    const inactiveClass = await harness.prisma.schoolClass.create({ data: { academicYearId: yearA.id, code: normalizedCode('CI'), name: '10C', gradeLevel: 10, status: CatalogStatus.INACTIVE } });

    const create = (body: Record<string, unknown>) => actor.agent.post(`/api/timetable-import/profiles/${profileId}/aliases`).set('Origin', testOrigin).send(body);
    const teacherAlias = await create({ entityType: 'TEACHER', sourceValue: '  GV   Ánh ', teacherUserId: teacher.id });
    expect(teacherAlias.status).toBe(201);
    expect(teacherAlias.body).toMatchObject({ sourceValue: 'GV Ánh', teacherUserId: teacher.id, isActive: true });
    expect((await create({ entityType: 'TEACHER', sourceValue: 'gv ánh', teacherUserId: teacher.id })).status).toBe(409);
    expect((await create({ entityType: 'TEACHER', sourceValue: 'NV', teacherUserId: nonTeacher.id })).status).toBe(409);
    expect((await create({ entityType: 'TEACHER', sourceValue: 'Nghỉ', teacherUserId: disabledTeacher.id })).status).toBe(409);
    expect((await create({ entityType: 'TEACHER', sourceValue: 'Thiếu', teacherUserId: crypto.randomUUID() })).status).toBe(404);
    const subjectAlias = await create({ entityType: 'SUBJECT', sourceValue: 'Toán', subjectId: subject.id });
    expect(subjectAlias.status).toBe(201);
    expect((await create({ entityType: 'SUBJECT', sourceValue: 'Nghỉ', subjectId: inactiveSubject.id })).status).toBe(409);
    const classAlias = await create({ entityType: 'SCHOOL_CLASS', sourceValue: '10A', academicYearId: yearA.id, schoolClassId: classA.id });
    expect(classAlias.status).toBe(201);
    expect((await create({ entityType: 'SCHOOL_CLASS', sourceValue: 'Lớp nghỉ', academicYearId: yearA.id, schoolClassId: inactiveClass.id })).status).toBe(409);
    expect((await create({ entityType: 'SCHOOL_CLASS', sourceValue: 'Sai năm', academicYearId: yearA.id, schoolClassId: classB.id })).status).toBe(404);

    await harness.prisma.subject.update({ where: { id: subject.id }, data: { status: CatalogStatus.INACTIVE } });
    await harness.prisma.schoolClass.update({ where: { id: classA.id }, data: { status: CatalogStatus.INACTIVE } });
    const retainedAfterTargetRetirement = await actor.agent.get(`/api/timetable-import/profiles/${profileId}/aliases`);
    expect(retainedAfterTargetRetirement.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: subjectAlias.body.id, subjectId: subject.id }),
      expect.objectContaining({ id: classAlias.body.id, schoolClassId: classA.id, academicYearId: yearA.id }),
    ]));

    const retired = await actor.agent.post(`/api/timetable-import/aliases/${teacherAlias.body.id as string}/retire`).set('Origin', testOrigin).send({});
    expect(retired.status).toBe(200);
    expect(retired.body.isActive).toBe(false);
    expect((await actor.agent.post(`/api/timetable-import/aliases/${teacherAlias.body.id as string}/retire`).set('Origin', testOrigin).send({})).status).toBe(409);
    expect((await create({ entityType: 'TEACHER', sourceValue: 'GV Ánh', teacherUserId: teacher.id })).status).toBe(201);
    const history = await actor.agent.get(`/api/timetable-import/profiles/${profileId}/aliases?includeRetired=true`);
    expect(history.status).toBe(200);
    expect(history.body.items.filter((item: { entityType: string }) => item.entityType === 'TEACHER')).toHaveLength(2);
    expect(await harness.prisma.auditEvent.count({ where: { action: { in: ['TIMETABLE_IMPORT_ALIAS_CREATED', 'TIMETABLE_IMPORT_ALIAS_RETIRED'] } } })).toBe(5);
  });
});
