import { CatalogStatus, UserStatus } from '@prisma/client';
import request, { Agent } from 'supertest';
import { businessMidnight } from '../../src/teaching-assignments/teaching-assignment-policy';
import { Phase01Harness, integration, testOrigin } from '../helpers/phase01-test-harness';

const capability = 'SUBJECT_MANAGE';
const origin = { Origin: testOrigin };

integration('Teaching assignment control plane (isolated PostgreSQL integration)', () => {
  const h = new Phase01Harness();

  beforeAll(async () => h.start());
  beforeEach(async () => {
    await h.clean();
    await h.seedCapabilities([
      { key: capability, scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
  });
  afterAll(async () => h.stop());

  async function manager(): Promise<{ agent: Agent; id: string }> {
    return h.actor({ grants: [{ capabilityKey: capability }] });
  }

  async function setup(activeCalendar = true): Promise<{
    yearId: string;
    classId: string;
    subjectId: string;
    teacherId: string;
    secondTeacherId: string;
  }> {
    const year = await h.prisma.academicYear.create({ data: { code: `TA-${crypto.randomUUID().slice(0, 8)}`, name: 'Teaching assignment year' } });
    await h.prisma.academicCalendarVersion.create({ data: {
      academicYearId: year.id,
      versionNumber: 1,
      startDate: new Date('2026-08-03T00:00:00.000Z'),
      endDate: new Date('2026-09-18T00:00:00.000Z'),
      officialWeekCount: 5,
      reserveWeekCount: 0,
      teachingWeekdays: ['MONDAY'],
      isActive: activeCalendar,
      activatedAt: activeCalendar ? new Date() : null,
    } });
    const schoolClass = await h.prisma.schoolClass.create({ data: {
      academicYearId: year.id, code: `TA${crypto.randomUUID().slice(0, 4).toUpperCase()}`, name: 'Teaching class', gradeLevel: 10,
    } });
    const subject = await h.prisma.subject.create({ data: { code: `SUB${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'Teaching subject' } });
    const teacher = await h.prisma.user.create({ data: {
      username: `teacher-${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: 'integration-only',
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
      profile: { create: { displayName: 'Teacher One', staffCode: `GV${crypto.randomUUID().slice(0, 6).toUpperCase()}` } },
    } });
    const secondTeacher = await h.prisma.user.create({ data: {
      username: `teacher-${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: 'integration-only',
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
      profile: { create: { displayName: 'Teacher Two' } },
    } });
    await h.prisma.staffSubject.createMany({ data: [teacher.id, secondTeacher.id].map((userId) => ({
      userId,
      subjectId: subject.id,
      validFrom: businessMidnight('2026-08-03'),
      validUntil: businessMidnight('2026-09-19'),
    })) });
    return { yearId: year.id, classId: schoolClass.id, subjectId: subject.id, teacherId: teacher.id, secondTeacherId: secondTeacher.id };
  }

  function createBody(refs: Awaited<ReturnType<typeof setup>>, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      schoolClassId: refs.classId,
      subjectId: refs.subjectId,
      teacherUserId: refs.teacherId,
      validFrom: '2026-08-03',
      validUntil: '2026-08-10',
      note: ' Initial note ',
      ...overrides,
    };
  }

  it('enforces explicit SUBJECT_MANAGE authorization, CSRF, route validation and strict bodies', async () => {
    const refs = await setup();
    expect((await request(h.app.getHttpServer()).get(`/api/academic-years/${refs.yearId}/teaching-assignments`)).status).toBe(401);
    const none = await h.actor();
    expect((await none.agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments`)).status).toBe(403);
    const systemAdmin = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    expect((await systemAdmin.agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments`)).status).toBe(403);
    const authorized = await manager();
    expect((await authorized.agent.get('/api/academic-years/not-a-uuid/teaching-assignments')).status).toBe(400);
    expect((await authorized.agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).send(createBody(refs))).status).toBe(403);
    expect((await authorized.agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).set(origin).send(createBody(refs, { unknown: true }))).status).toBe(400);
  });

  it('creates, lists and reads enriched civil-date records with atomic audit and inclusive activeOn', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const created = await agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).set(origin).send(createBody(refs));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      academicYearId: refs.yearId,
      validFrom: '2026-08-03',
      validUntil: '2026-08-10',
      note: 'Initial note',
      schoolClass: { id: refs.classId, status: CatalogStatus.ACTIVE },
      subject: { id: refs.subjectId, status: CatalogStatus.ACTIVE },
      teacher: { userId: refs.teacherId, displayName: 'Teacher One', isTeachingStaff: true },
    });
    expect(await h.prisma.auditEvent.count({ where: { action: 'TEACHING_ASSIGNMENT_CREATED', result: 'SUCCESS' } })).toBe(1);
    expect((await agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments?activeOn=2026-08-10`)).body.total).toBe(1);
    expect((await agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments?activeOn=2026-08-11`)).body.total).toBe(0);
    expect((await agent.get(`/api/teaching-assignments/${created.body.id as string}`)).body.teacher.username).toContain('teacher-');
    await h.prisma.schoolClass.update({ where: { id: refs.classId }, data: { status: CatalogStatus.INACTIVE } });
    expect((await agent.get(`/api/teaching-assignments/${created.body.id as string}`)).status).toBe(200);
  });

  it('rejects missing active calendars and keeps failed mutations free of success audits', async () => {
    const refs = await setup(false);
    const { agent } = await manager();
    const response = await agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).set(origin).send(createBody(refs));
    expect(response.status).toBe(409);
    expect(await h.prisma.teachingAssignment.count()).toBe(0);
    expect(await h.prisma.auditEvent.count({ where: { action: 'TEACHING_ASSIGNMENT_CREATED', result: 'SUCCESS' } })).toBe(0);
  });

  it('maps database overlap to 409 while allowing the same teacher in another class', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const first = await agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).set(origin).send(createBody(refs));
    expect(first.status).toBe(201);
    const overlapping = await agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).set(origin).send(createBody(refs, { teacherUserId: refs.secondTeacherId }));
    expect(overlapping.status).toBe(409);
    const otherClass = await h.prisma.schoolClass.create({ data: { academicYearId: refs.yearId, code: `C${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'Other class', gradeLevel: 10 } });
    const allowed = await agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).set(origin).send(createBody(refs, { schoolClassId: otherClass.id }));
    expect(allowed.status).toBe(201);
    expect(await h.prisma.auditEvent.count({ where: { action: 'TEACHING_ASSIGNMENT_CREATED', result: 'SUCCESS' } })).toBe(2);
  });

  it('ends explicitly and changes teacher as an atomic historical split', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const created = await agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).set(origin).send(createBody(refs, { validUntil: null }));
    const changed = await agent.post(`/api/teaching-assignments/${created.body.id as string}/change-teacher`).set(origin).send({
      newTeacherUserId: refs.secondTeacherId,
      effectiveFrom: '2026-08-08',
      note: ' replacement ',
    });
    expect(changed.status).toBe(200);
    expect(changed.body.previous).toMatchObject({ validFrom: '2026-08-03', validUntil: '2026-08-07', note: 'Initial note' });
    expect(changed.body.replacement).toMatchObject({ teacherUserId: refs.secondTeacherId, validFrom: '2026-08-08', validUntil: null, note: 'replacement' });
    const ended = await agent.post(`/api/teaching-assignments/${changed.body.replacement.id as string}/end`).set(origin).send({ endDate: '2026-08-20' });
    expect(ended.status).toBe(200);
    const noOp = await agent.post(`/api/teaching-assignments/${changed.body.replacement.id as string}/end`).set(origin).send({ endDate: '2026-08-20' });
    expect(noOp.status).toBe(200);
    const audit = await h.prisma.auditEvent.findFirstOrThrow({ where: { action: 'TEACHING_ASSIGNMENT_ENDED' }, orderBy: { createdAt: 'desc' } });
    expect(audit.metadata).toMatchObject({ noOp: true });
  });
});
