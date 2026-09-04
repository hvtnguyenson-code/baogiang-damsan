import { CatalogStatus, UserStatus } from '@prisma/client';
import request, { Agent } from 'supertest';
import { Phase01Harness, integration, testOrigin } from '../helpers/phase01-test-harness';
import * as homeroomPolicy from '../../src/homeroom-assignments/homeroom-assignment-policy';

const capability = 'HOMEROOM_ASSIGNMENT_MANAGE';
const origin = { Origin: testOrigin };

integration('Homeroom assignment control plane (isolated PostgreSQL integration)', () => {
  const h = new Phase01Harness();
  let businessDateSpy: jest.SpyInstance;

  beforeAll(async () => {
    businessDateSpy = jest.spyOn(homeroomPolicy, 'homeroomBusinessDate').mockReturnValue('2026-09-01');
    await h.start();
  });
  beforeEach(async () => {
    await h.clean();
    await h.seedCapabilities([
      { key: capability, scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
      { key: 'ACADEMIC_STRUCTURE_MANAGE', scopes: ['SCHOOL_WIDE'] },
    ]);
  });
  afterAll(async () => {
    await h.clean();
    await h.stop();
    businessDateSpy.mockRestore();
  });

  async function manager(): Promise<{ agent: Agent; id: string }> {
    return h.actor({ grants: [{ capabilityKey: capability }] });
  }

  async function teacher(overrides: Partial<{ status: UserStatus; isTeachingStaff: boolean; displayName: string }> = {}) {
    return h.prisma.user.create({
      data: {
        username: `teacher-${crypto.randomUUID().slice(0, 8)}`,
        passwordHash: 'integration-only',
        status: overrides.status ?? UserStatus.ACTIVE,
        mustChangePassword: false,
        profile: { create: { displayName: overrides.displayName ?? 'Teacher', isTeachingStaff: overrides.isTeachingStaff ?? true } },
      },
    });
  }

  async function setup() {
    const year = await h.prisma.academicYear.create({
      data: { code: `HR-${crypto.randomUUID().slice(0, 8)}`, name: 'Homeroom year' },
    });
    const calendar = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id, versionNumber: 1,
        startDate: new Date('2025-08-01T00:00:00Z'), endDate: new Date('2027-05-31T00:00:00Z'),
        officialWeekCount: 1, reserveWeekCount: 0, teachingWeekdays: ['MONDAY'],
        isActive: true, activatedAt: new Date(),
      },
    });
    const schoolClass = await h.prisma.schoolClass.create({
      data: { academicYearId: year.id, code: '10A1', name: '10A1', gradeLevel: 10 },
    });
    const otherClass = await h.prisma.schoolClass.create({
      data: { academicYearId: year.id, code: '10A2', name: '10A2', gradeLevel: 10 },
    });
    const firstTeacher = await teacher({ displayName: 'Teacher One' });
    const secondTeacher = await teacher({ displayName: 'Teacher Two' });
    return { year, calendar, schoolClass, otherClass, firstTeacher, secondTeacher };
  }

  async function create(agent: Agent, yearId: string, body: Record<string, unknown>, requestId?: string) {
    let command = agent.post(`/api/academic-years/${yearId}/homeroom-assignments`).set(origin);
    if (requestId) command = command.set('X-Request-Id', requestId);
    return command.send(body);
  }

  async function successAudit(action: string, requestId: string) {
    return h.prisma.auditEvent.count({ where: { action, requestId, result: 'SUCCESS' } });
  }

  it('enforces default deny, rejects SYSTEM_ADMIN-only, and allows the explicit Homeroom grant', async () => {
    const refs = await setup();
    expect((await request(h.app.getHttpServer()).get(`/api/academic-years/${refs.year.id}/homeroom-assignments`)).status).toBe(401);
    const none = await h.actor();
    expect((await none.agent.get(`/api/academic-years/${refs.year.id}/homeroom-assignments`)).status).toBe(403);
    const systemAdmin = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    expect((await systemAdmin.agent.get(`/api/academic-years/${refs.year.id}/homeroom-assignments`)).status).toBe(403);
    const academicManager = await h.actor({ grants: [{ capabilityKey: 'ACADEMIC_STRUCTURE_MANAGE' }] });
    expect((await academicManager.agent.get(`/api/academic-years/${refs.year.id}/homeroom-assignments`)).status).toBe(403);
    const authorized = await manager();
    expect((await authorized.agent.get(`/api/academic-years/${refs.year.id}/homeroom-assignments`)).status).toBe(200);
    expect((await authorized.agent.post(`/api/academic-years/${refs.year.id}/homeroom-assignments`).send({})).status).toBe(403);
    expect((await authorized.agent.get(`/api/academic-years/${refs.year.id}/homeroom-assignments/resolve`)
      .query({ schoolClassId: refs.schoolClass.id, on: 'not-a-date' })).status).toBe(400);
    expect((await authorized.agent.get(`/api/academic-years/${refs.year.id}/homeroom-assignments/resolve`)
      .query({ schoolClassId: refs.schoolClass.id, on: '2026-02-30' })).status).toBe(400);
    expect((await authorized.agent.get(`/api/academic-years/${refs.year.id}/homeroom-assignments/resolve`)
      .query({ schoolClassId: crypto.randomUUID(), on: '2026-08-10' })).status).toBe(404);
    const otherYear = await h.prisma.academicYear.create({ data: { code: `OTHER-${crypto.randomUUID().slice(0, 8)}`, name: 'Other year' } });
    const otherYearClass = await h.prisma.schoolClass.create({ data: { academicYearId: otherYear.id, code: '10B1', name: '10B1', gradeLevel: 10 } });
    expect((await authorized.agent.get(`/api/academic-years/${refs.year.id}/homeroom-assignments/resolve`)
      .query({ schoolClassId: otherYearClass.id, on: '2026-08-10' })).status).toBe(400);
  });

  it('provides Homeroom-only workspace options with historical identities and StaffSubject-independent eligibility', async () => {
    const refs = await setup();
    const { agent, id: actorId } = await manager();
    await h.prisma.homeroomAssignment.create({
      data: {
        academicYearId: refs.year.id, schoolClassId: refs.schoolClass.id, teacherUserId: refs.firstTeacher.id,
        validFrom: new Date('2026-08-01T00:00:00Z'), validUntil: new Date('2026-08-10T00:00:00Z'), createdByUserId: actorId,
      },
    });
    await h.prisma.user.update({ where: { id: refs.firstTeacher.id }, data: { status: UserStatus.DISABLED } });
    const years = await agent.get('/api/homeroom-assignment-options/academic-years');
    const workspace = await agent.get(`/api/homeroom-assignment-options/academic-years/${refs.year.id}`);
    const eligible = await agent.get(`/api/homeroom-assignment-options/academic-years/${refs.year.id}/eligible-teachers`)
      .query({ validFrom: '2026-09-10' });
    expect(years.status).toBe(200);
    expect(workspace.status).toBe(200);
    expect(workspace.body.historicalTeachers).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: refs.firstTeacher.id, userStatus: 'DISABLED' }),
    ]));
    expect(eligible.status).toBe(200);
    expect(eligible.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: refs.secondTeacher.id, isTeachingStaff: true }),
    ]));
    expect(eligible.body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ userId: refs.firstTeacher.id })]));
  });

  it('enforces current and bounded-historical eligibility, same-class exclusion, and atomic failure audits', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const inactive = await teacher({ status: UserStatus.DISABLED, isTeachingStaff: false });
    const currentBody = {
      schoolClassId: refs.schoolClass.id, teacherUserId: inactive.id, validFrom: '2026-09-10', validUntil: '2026-09-20',
      entryReason: 'Must not bypass current eligibility',
    };
    expect((await create(agent, refs.year.id, currentBody, 'current-ineligible')).status).toBe(409);
    expect(await successAudit('HOMEROOM_ASSIGNMENT_CREATED', 'current-ineligible')).toBe(0);

    const historicalBody = {
      schoolClassId: refs.schoolClass.id, teacherUserId: inactive.id, validFrom: '2026-08-01', validUntil: '2026-08-10',
    };
    expect((await create(agent, refs.year.id, historicalBody, 'history-no-reason')).status).toBe(400);
    const historical = await create(agent, refs.year.id, { ...historicalBody, entryReason: 'Nhập hồ sơ lưu' }, 'history-ok');
    expect(historical.status).toBe(201);
    expect(await successAudit('HOMEROOM_ASSIGNMENT_CREATED', 'history-ok')).toBe(1);

    const overlap = await create(agent, refs.year.id, {
      ...historicalBody, teacherUserId: refs.secondTeacher.id, validFrom: '2026-08-10', validUntil: '2026-08-15', entryReason: 'Overlap',
    }, 'history-overlap');
    expect(overlap.status).toBe(409);
    expect(await successAudit('HOMEROOM_ASSIGNMENT_CREATED', 'history-overlap')).toBe(0);

    const otherClass = await create(agent, refs.year.id, {
      ...historicalBody, schoolClassId: refs.otherClass.id, entryReason: 'Same teacher different class',
    });
    expect(otherClass.status).toBe(201);
  });

  it('splits inclusive history, retains correction lineage with gaps, and resolves without current User/calendar state', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const original = await create(agent, refs.year.id, {
      schoolClassId: refs.schoolClass.id, teacherUserId: refs.firstTeacher.id,
      validFrom: '2026-08-01', validUntil: '2026-08-20', entryReason: 'Historical source', note: 'Original',
    });
    expect(original.status).toBe(201);
    const changed = await agent.post(`/api/homeroom-assignments/${original.body.id as string}/change-teacher`).set(origin).send({
      newTeacherUserId: refs.secondTeacher.id, effectiveFrom: '2026-08-11', entryReason: 'Historical real change',
    });
    expect(changed.status).toBe(200);
    expect(changed.body.previous).toMatchObject({ validFrom: '2026-08-01', validUntil: '2026-08-10' });
    expect(changed.body.replacement).toMatchObject({ validFrom: '2026-08-11', validUntil: '2026-08-20', replacesId: null });

    const replacementId = changed.body.replacement.id as string;
    const overlap = await agent.post(`/api/homeroom-assignments/${replacementId}/correct`).set(origin)
      .set('X-Request-Id', 'correct-overlap').send({
        reason: 'Bad overlap', replacements: [
          { teacherUserId: refs.firstTeacher.id, validFrom: '2026-08-11', validUntil: '2026-08-16', entryReason: 'History' },
          { teacherUserId: refs.secondTeacher.id, validFrom: '2026-08-16', validUntil: '2026-08-20', entryReason: 'History' },
        ],
      });
    expect(overlap.status).toBe(400);
    expect(await successAudit('HOMEROOM_ASSIGNMENT_CORRECTED', 'correct-overlap')).toBe(0);

    const escape = await agent.post(`/api/homeroom-assignments/${replacementId}/correct`).set(origin).send({
      reason: 'Escape', replacements: [
        { teacherUserId: refs.firstTeacher.id, validFrom: '2026-08-10', validUntil: '2026-08-20', entryReason: 'History' },
      ],
    });
    expect(escape.status).toBe(400);

    const corrected = await agent.post(`/api/homeroom-assignments/${replacementId}/correct`).set(origin).set('X-Request-Id', 'correct-success').send({
      reason: 'Correct retained record', replacements: [
        { teacherUserId: refs.firstTeacher.id, validFrom: '2026-08-11', validUntil: '2026-08-14', entryReason: 'History' },
        { teacherUserId: refs.secondTeacher.id, validFrom: '2026-08-16', validUntil: '2026-08-20', entryReason: 'History' },
      ],
    });
    expect(corrected.status).toBe(200);
    expect(corrected.body.source).toMatchObject({ id: replacementId, status: 'REVERSED', reversalReason: 'Correct retained record' });
    expect(corrected.body.replacements).toHaveLength(2);
    expect(corrected.body.replacements).toEqual(expect.arrayContaining([
      expect.objectContaining({ replacesId: replacementId }), expect.objectContaining({ replacesId: replacementId }),
    ]));
    const correctionAudit = await h.prisma.auditEvent.findFirstOrThrow({ where: { requestId: 'correct-success' } });
    expect(correctionAudit.metadata).toMatchObject({
      reason: 'Correct retained record',
      replacementIds: corrected.body.replacements.map((replacement: { id: string }) => replacement.id),
      replacements: expect.arrayContaining([
        expect.objectContaining({ teacherUserId: refs.firstTeacher.id, validFrom: '2026-08-11', validUntil: '2026-08-14' }),
        expect.objectContaining({ teacherUserId: refs.secondTeacher.id, validFrom: '2026-08-16', validUntil: '2026-08-20' }),
      ]),
    });

    await h.prisma.user.update({ where: { id: refs.firstTeacher.id }, data: { status: UserStatus.DISABLED } });
    await h.prisma.academicCalendarVersion.update({ where: { id: refs.calendar.id }, data: { isActive: false, activatedAt: null } });
    const resolved = await agent.get(`/api/academic-years/${refs.year.id}/homeroom-assignments/resolve`)
      .query({ schoolClassId: refs.schoolClass.id, on: '2026-08-12' });
    const missing = await agent.get(`/api/academic-years/${refs.year.id}/homeroom-assignments/resolve`)
      .query({ schoolClassId: refs.schoolClass.id, on: '2026-08-15' });
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({ outcome: 'RESOLVED', assignment: { teacherUserId: refs.firstTeacher.id } });
    expect(missing.body).toEqual({ outcome: 'MISSING' });
    const history = await agent.get(`/api/academic-years/${refs.year.id}/homeroom-assignments`);
    expect(history.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: replacementId, status: 'REVERSED' }),
      expect.objectContaining({ status: 'ACTIVE', replacesId: replacementId }),
    ]));
  });

  it('ends after teacher/class state changes, rejects extension, and audits same-end no-op', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const created = await create(agent, refs.year.id, {
      schoolClassId: refs.schoolClass.id, teacherUserId: refs.firstTeacher.id, validFrom: '2026-09-10', validUntil: '2026-09-30',
    });
    await h.prisma.user.update({ where: { id: refs.firstTeacher.id }, data: { status: UserStatus.DISABLED } });
    await h.prisma.schoolClass.update({ where: { id: refs.schoolClass.id }, data: { status: CatalogStatus.INACTIVE } });
    const ended = await agent.post(`/api/homeroom-assignments/${created.body.id as string}/end`).set(origin)
      .set('X-Request-Id', 'end-ok').send({ endDate: '2026-09-20' });
    expect(ended.status).toBe(200);
    const noOp = await agent.post(`/api/homeroom-assignments/${created.body.id as string}/end`).set(origin)
      .set('X-Request-Id', 'end-no-op').send({ endDate: '2026-09-20' });
    expect(noOp.status).toBe(200);
    expect(await successAudit('HOMEROOM_ASSIGNMENT_ENDED', 'end-no-op')).toBe(1);
    const audit = await h.prisma.auditEvent.findFirstOrThrow({ where: { requestId: 'end-no-op' } });
    expect(audit.metadata).toMatchObject({ noOp: true });
    const extension = await agent.post(`/api/homeroom-assignments/${created.body.id as string}/end`).set(origin)
      .send({ endDate: '2026-09-21' });
    expect(extension.status).toBe(409);
  });

  it('rejects explicit null correction self-overlap before database writes', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const source = await create(agent, refs.year.id, {
      schoolClassId: refs.schoolClass.id, teacherUserId: refs.firstTeacher.id, validFrom: '2026-09-10',
    });
    const response = await agent.post(`/api/homeroom-assignments/${source.body.id as string}/correct`).set(origin)
      .set('X-Request-Id', 'correct-null-overlap').send({
        reason: 'Open ended overlap', replacements: [
          { teacherUserId: refs.firstTeacher.id, validFrom: '2026-09-10' },
          { teacherUserId: refs.secondTeacher.id, validFrom: '2026-09-11' },
        ],
      });
    expect(response.status).toBe(400);
    expect(await h.prisma.homeroomAssignment.findUniqueOrThrow({ where: { id: source.body.id as string } })).toMatchObject({ status: 'ACTIVE' });
    expect(await successAudit('HOMEROOM_ASSIGNMENT_CORRECTED', 'correct-null-overlap')).toBe(0);
  });
});
