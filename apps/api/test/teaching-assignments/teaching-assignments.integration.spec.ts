import { ConflictException } from '@nestjs/common';
import { CatalogStatus, Prisma, UserStatus } from '@prisma/client';
import { CivilDateString } from '@baogiang/contracts';
import request, { Agent } from 'supertest';
import { TeachingAssignmentsService } from '../../src/teaching-assignments/teaching-assignments.service';
import { businessMidnight } from '../../src/teaching-assignments/teaching-assignment-policy';
import { Phase01Harness, integration, testOrigin } from '../helpers/phase01-test-harness';

const capability = 'SUBJECT_MANAGE';
const origin = { Origin: testOrigin };
const calendarStart = '2026-08-03';
const calendarEnd = '2026-09-18';

interface Refs {
  yearId: string;
  calendarId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  secondTeacherId: string;
}

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
  afterAll(async () => {
    await h.clean();
    await h.stop();
  });

  async function manager(prefix = 'manager'): Promise<{ agent: Agent; id: string }> {
    return h.actor({ grants: [{ capabilityKey: capability }], usernamePrefix: prefix });
  }

  async function createYear(activeCalendar = true, startDate = calendarStart, endDate = calendarEnd): Promise<{
    yearId: string;
    calendarId: string;
  }> {
    const year = await h.prisma.academicYear.create({
      data: { code: `TA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, name: 'Teaching assignment year' },
    });
    const calendar = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date(`${startDate}T00:00:00.000Z`),
        endDate: new Date(`${endDate}T00:00:00.000Z`),
        officialWeekCount: 5,
        reserveWeekCount: 0,
        teachingWeekdays: ['MONDAY'],
        isActive: activeCalendar,
        activatedAt: activeCalendar ? new Date() : null,
      },
    });
    return { yearId: year.id, calendarId: calendar.id };
  }

  async function createClass(yearId: string, overrides: Partial<{
    code: string;
    name: string;
    gradeLevel: number;
    status: CatalogStatus;
  }> = {}) {
    return h.prisma.schoolClass.create({
      data: {
        academicYearId: yearId,
        code: overrides.code ?? `C${crypto.randomUUID().slice(0, 7).toUpperCase()}`,
        name: overrides.name ?? 'Teaching class',
        gradeLevel: overrides.gradeLevel ?? 10,
        status: overrides.status,
      },
    });
  }

  async function createSubject(overrides: Partial<{ code: string; name: string; status: CatalogStatus }> = {}) {
    return h.prisma.subject.create({
      data: {
        code: overrides.code ?? `S${crypto.randomUUID().slice(0, 7).toUpperCase()}`,
        name: overrides.name ?? 'Teaching subject',
        status: overrides.status,
      },
    });
  }

  async function createTeacher(options: {
    status?: UserStatus;
    profile?: boolean;
    isTeachingStaff?: boolean;
    displayName?: string;
    staffCode?: string | null;
  } = {}) {
    return h.prisma.user.create({
      data: {
        username: `teacher-${crypto.randomUUID().slice(0, 8)}`,
        passwordHash: 'integration-only',
        status: options.status ?? UserStatus.ACTIVE,
        mustChangePassword: false,
        ...(options.profile === false ? {} : {
          profile: {
            create: {
              displayName: options.displayName ?? 'Teacher',
              staffCode: options.staffCode ?? null,
              isTeachingStaff: options.isTeachingStaff ?? true,
            },
          },
        }),
      },
    });
  }

  async function cover(
    userId: string,
    subjectId: string,
    validFrom: CivilDateString = calendarStart,
    endExclusive: CivilDateString = '2026-09-19',
  ) {
    return h.prisma.staffSubject.create({
      data: {
        userId,
        subjectId,
        validFrom: businessMidnight(validFrom),
        validUntil: businessMidnight(endExclusive),
      },
    });
  }

  async function setup(activeCalendar = true): Promise<Refs> {
    const { yearId, calendarId } = await createYear(activeCalendar);
    const schoolClass = await createClass(yearId);
    const subject = await createSubject();
    const teacher = await createTeacher({
      displayName: 'Teacher One',
      staffCode: `GV${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    });
    const secondTeacher = await createTeacher({ displayName: 'Teacher Two' });
    await cover(teacher.id, subject.id);
    await cover(secondTeacher.id, subject.id);
    return {
      yearId,
      calendarId,
      classId: schoolClass.id,
      subjectId: subject.id,
      teacherId: teacher.id,
      secondTeacherId: secondTeacher.id,
    };
  }

  function createBody(refs: Pick<Refs, 'classId' | 'subjectId' | 'teacherId'>, overrides: Record<string, unknown> = {}) {
    return {
      schoolClassId: refs.classId,
      subjectId: refs.subjectId,
      teacherUserId: refs.teacherId,
      validFrom: calendarStart,
      validUntil: '2026-08-10',
      note: ' Initial note ',
      ...overrides,
    };
  }

  async function createAssignment(agent: Agent, refs: Refs, overrides: Record<string, unknown> = {}, requestId?: string) {
    let command = agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).set(origin);
    if (requestId) command = command.set('X-Request-Id', requestId);
    return command.send(createBody(refs, overrides));
  }

  async function successAuditCount(action: string, requestId: string): Promise<number> {
    return h.prisma.auditEvent.count({ where: { action, requestId, result: 'SUCCESS' } });
  }

  async function expectCreateFailure(
    agent: Agent,
    refs: Refs,
    requestId: string,
    expectedStatus: number,
    overrides: Record<string, unknown> = {},
    routeYearId = refs.yearId,
  ): Promise<void> {
    const before = await h.prisma.teachingAssignment.count();
    const response = await agent.post(`/api/academic-years/${routeYearId}/teaching-assignments`)
      .set(origin).set('X-Request-Id', requestId).send(createBody(refs, overrides));
    expect(response.status).toBe(expectedStatus);
    expect(await h.prisma.teachingAssignment.count()).toBe(before);
    expect(await successAuditCount('TEACHING_ASSIGNMENT_CREATED', requestId)).toBe(0);
  }

  it('enforces authorization, CSRF, UUID routes and strict command bodies', async () => {
    const refs = await setup();
    expect((await request(h.app.getHttpServer()).get(`/api/academic-years/${refs.yearId}/teaching-assignments`)).status).toBe(401);
    const none = await h.actor();
    expect((await none.agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments`)).status).toBe(403);
    const systemAdmin = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    expect((await systemAdmin.agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments`)).status).toBe(403);
    const authorized = await manager();
    expect((await authorized.agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments`)).status).toBe(200);
    expect((await authorized.agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).send(createBody(refs))).status).toBe(403);
    expect((await authorized.agent.get('/api/academic-years/not-a-uuid/teaching-assignments')).status).toBe(400);
    expect((await authorized.agent.get('/api/teaching-assignments/not-a-uuid')).status).toBe(400);
    expect((await authorized.agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).set(origin)
      .send(createBody(refs, { unknown: true }))).status).toBe(400);
    const created = await createAssignment(authorized.agent, refs);
    expect(created.status).toBe(201);
    expect((await authorized.agent.post(`/api/teaching-assignments/${created.body.id as string}/end`).set(origin)
      .send({ endDate: '2026-08-09', unknown: true })).status).toBe(400);
    expect((await authorized.agent.post(`/api/teaching-assignments/${created.body.id as string}/change-teacher`).set(origin)
      .send({ newTeacherUserId: refs.secondTeacherId, effectiveFrom: '2026-08-08', unknown: true })).status).toBe(400);
  });

  it('rejects missing year or active calendar without rows or success audits', async () => {
    const refs = await setup();
    const { agent } = await manager();
    await expectCreateFailure(agent, refs, 'create-missing-year', 404, {}, crypto.randomUUID());

    await h.prisma.academicCalendarVersion.update({ where: { id: refs.calendarId }, data: { isActive: false } });
    await expectCreateFailure(agent, refs, 'create-no-active-calendar', 409);
  });

  it('enforces the complete class parent matrix atomically', async () => {
    const refs = await setup();
    const { agent } = await manager();
    await expectCreateFailure(agent, refs, 'create-class-missing', 404, { schoolClassId: crypto.randomUUID() });
    const otherYear = await createYear();
    const otherClass = await createClass(otherYear.yearId);
    await expectCreateFailure(agent, refs, 'create-class-other-year', 400, { schoolClassId: otherClass.id });
    await h.prisma.schoolClass.update({ where: { id: refs.classId }, data: { status: CatalogStatus.INACTIVE } });
    await expectCreateFailure(agent, refs, 'create-class-inactive', 409);
  });

  it('enforces subject and teacher operational eligibility atomically', async () => {
    const refs = await setup();
    const { agent } = await manager();
    await expectCreateFailure(agent, refs, 'create-subject-missing', 404, { subjectId: crypto.randomUUID() });
    const inactiveSubject = await createSubject({ status: CatalogStatus.INACTIVE });
    await expectCreateFailure(agent, refs, 'create-subject-inactive', 409, { subjectId: inactiveSubject.id });
    await expectCreateFailure(agent, refs, 'create-teacher-missing', 404, { teacherUserId: crypto.randomUUID() });
    const inactive = await createTeacher({ status: UserStatus.DISABLED });
    await expectCreateFailure(agent, refs, 'create-teacher-inactive', 409, { teacherUserId: inactive.id });
    const noProfile = await createTeacher({ profile: false });
    await expectCreateFailure(agent, refs, 'create-teacher-no-profile', 409, { teacherUserId: noProfile.id });
    const nonTeacher = await createTeacher({ isTeachingStaff: false });
    await expectCreateFailure(agent, refs, 'create-teacher-not-teaching', 409, { teacherUserId: nonTeacher.id });
  });

  it('enforces exact-subject StaffSubject half-open coverage including equality at end-exclusive', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const noExactSubject = await createTeacher();
    const anotherSubject = await createSubject();
    await cover(noExactSubject.id, anotherSubject.id);
    await expectCreateFailure(agent, refs, 'coverage-wrong-subject', 409, { teacherUserId: noExactSubject.id });

    const lateCoverage = await createTeacher();
    await cover(lateCoverage.id, refs.subjectId, '2026-08-04');
    await expectCreateFailure(agent, refs, 'coverage-starts-late', 409, { teacherUserId: lateCoverage.id });

    const earlyEnd = await createTeacher();
    await cover(earlyEnd.id, refs.subjectId, calendarStart, '2026-08-10');
    await expectCreateFailure(agent, refs, 'coverage-ends-early', 409, { teacherUserId: earlyEnd.id });

    const exactEnd = await createTeacher();
    await cover(exactEnd.id, refs.subjectId, calendarStart, '2026-08-11');
    const accepted = await createAssignment(agent, refs, { teacherUserId: exactEnd.id }, 'coverage-exact-end');
    expect(accepted.status).toBe(201);
    expect(await successAuditCount('TEACHING_ASSIGNMENT_CREATED', 'coverage-exact-end')).toBe(1);
  });

  it('enforces strict inclusive calendar and civil-date boundaries', async () => {
    const refs = await setup();
    const { agent } = await manager();
    await expectCreateFailure(agent, refs, 'before-calendar', 400, { validFrom: '2026-08-02' });
    await expectCreateFailure(agent, refs, 'after-calendar', 400, { validFrom: '2026-09-19', validUntil: null });
    await expectCreateFailure(agent, refs, 'reverse-interval', 400, { validFrom: '2026-08-10', validUntil: '2026-08-09' });
    await expectCreateFailure(agent, refs, 'end-after-calendar', 400, { validUntil: '2026-09-19' });
    for (const [index, invalidDate] of ['2026-8-03', '2026-02-29', '2026-08-03T00:00:00Z'].entries()) {
      await expectCreateFailure(agent, refs, `invalid-civil-${index}`, 400, { validFrom: invalidDate });
    }
    const lower = await createAssignment(agent, refs, { validFrom: calendarStart, validUntil: calendarStart });
    expect(lower.status).toBe(201);
    const otherClass = await createClass(refs.yearId);
    const upper = await createAssignment(agent, refs, {
      schoolClassId: otherClass.id,
      validFrom: calendarEnd,
      validUntil: calendarEnd,
    });
    expect(upper.status).toBe(201);
  });

  it('keeps open-ended validUntil null and validates StaffSubject through the active calendar end', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const accepted = await createAssignment(agent, refs, { validUntil: null }, 'open-create');
    expect(accepted.status).toBe(201);
    expect(accepted.body.validUntil).toBeNull();
    expect((await h.prisma.teachingAssignment.findUniqueOrThrow({ where: { id: accepted.body.id as string } })).validUntil).toBeNull();

    const otherClass = await createClass(refs.yearId);
    const { validUntil: omitted, ...bodyWithoutValidUntil } = createBody(refs, { schoolClassId: otherClass.id });
    expect(omitted).toBeDefined();
    const omittedResponse = await agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).set(origin)
      .set('X-Request-Id', 'open-create-omitted').send(bodyWithoutValidUntil);
    expect(omittedResponse.status).toBe(201);
    expect(omittedResponse.body.validUntil).toBeNull();

    const insufficientClass = await createClass(refs.yearId);
    const insufficient = await createTeacher();
    await cover(insufficient.id, refs.subjectId, calendarStart, '2026-09-18');
    await expectCreateFailure(agent, refs, 'open-insufficient-horizon', 409, {
      schoolClassId: insufficientClass.id,
      teacherUserId: insufficient.id,
      validUntil: null,
    });
  });

  it('enforces class-subject cardinality while allowing different class or subject', async () => {
    const refs = await setup();
    const { agent } = await manager();
    expect((await createAssignment(agent, refs, {}, 'overlap-first')).status).toBe(201);
    await expectCreateFailure(agent, refs, 'overlap-rejected', 409, { teacherUserId: refs.secondTeacherId });
    const otherClass = await createClass(refs.yearId);
    expect((await createAssignment(agent, refs, { schoolClassId: otherClass.id }, 'other-class')).status).toBe(201);
    const otherSubject = await createSubject();
    await cover(refs.teacherId, otherSubject.id);
    expect((await createAssignment(agent, refs, { subjectId: otherSubject.id }, 'other-subject')).status).toBe(201);
  });

  it('allows exactly one of two genuinely concurrent overlapping creates', async () => {
    const refs = await setup();
    const firstActor = await manager('concurrent-a');
    const secondActor = await manager('concurrent-b');
    const requests = [
      firstActor.agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).set(origin)
        .set('X-Request-Id', 'concurrent-create-a').send(createBody(refs, { teacherUserId: refs.teacherId })),
      secondActor.agent.post(`/api/academic-years/${refs.yearId}/teaching-assignments`).set(origin)
        .set('X-Request-Id', 'concurrent-create-b').send(createBody(refs, { teacherUserId: refs.secondTeacherId })),
    ];
    const [a, b] = await Promise.all(requests);
    expect([a.status, b.status].sort((left, right) => left - right)).toEqual([201, 409]);
    const stored = await h.prisma.teachingAssignment.findMany({
      where: { academicYearId: refs.yearId, schoolClassId: refs.classId, subjectId: refs.subjectId },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ validFrom: new Date('2026-08-03T00:00:00.000Z'), validUntil: new Date('2026-08-10T00:00:00.000Z') });
    expect(await h.prisma.auditEvent.count({
      where: { requestId: { in: ['concurrent-create-a', 'concurrent-create-b'] }, action: 'TEACHING_ASSIGNMENT_CREATED', result: 'SUCCESS' },
    })).toBe(1);
  });

  it('scopes, filters, paginates and deterministically orders list history', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const otherClass = await createClass(refs.yearId);
    const otherSubject = await createSubject();
    await cover(refs.secondTeacherId, otherSubject.id);
    const otherYear = await createYear();
    const otherYearClass = await createClass(otherYear.yearId);
    await h.prisma.teachingAssignment.createMany({ data: [
      { academicYearId: refs.yearId, schoolClassId: refs.classId, subjectId: refs.subjectId, teacherUserId: refs.teacherId, validFrom: new Date('2026-08-03'), validUntil: new Date('2026-08-05'), note: 'ended' },
      { academicYearId: refs.yearId, schoolClassId: otherClass.id, subjectId: refs.subjectId, teacherUserId: refs.secondTeacherId, validFrom: new Date('2026-08-10'), validUntil: null },
      { academicYearId: refs.yearId, schoolClassId: refs.classId, subjectId: otherSubject.id, teacherUserId: refs.secondTeacherId, validFrom: new Date('2026-08-08'), validUntil: new Date('2026-08-12') },
      { academicYearId: otherYear.yearId, schoolClassId: otherYearClass.id, subjectId: refs.subjectId, teacherUserId: refs.teacherId, validFrom: new Date('2026-08-03'), validUntil: null },
    ] });

    const all = await agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments?page=1&pageSize=2`);
    expect(all.body).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(all.body.items.map((item: { validFrom: string }) => item.validFrom)).toEqual(['2026-08-10', '2026-08-08']);
    expect((await agent.get(`/api/academic-years/${otherYear.yearId}/teaching-assignments`)).body.total).toBe(1);
    expect((await agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments?schoolClassId=${otherClass.id}`)).body.total).toBe(1);
    expect((await agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments?subjectId=${otherSubject.id}`)).body.total).toBe(1);
    expect((await agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments?teacherUserId=${refs.teacherId}`)).body.total).toBe(1);
    expect((await agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments?activeOn=2026-08-03`)).body.total).toBe(1);
    expect((await agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments?activeOn=2026-08-05`)).body.total).toBe(1);
    expect((await agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments?activeOn=2026-08-06`)).body.total).toBe(0);
    expect((await agent.get(`/api/academic-years/${refs.yearId}/teaching-assignments?activeOn=2026-09-18`)).body.total).toBe(1);
  });

  it('returns enriched detail and preserves readable history after parent status changes', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const created = await createAssignment(agent, refs);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({
      schoolClass: { id: refs.classId, status: CatalogStatus.ACTIVE },
      subject: { id: refs.subjectId, status: CatalogStatus.ACTIVE },
      teacher: { userId: refs.teacherId, displayName: 'Teacher One', isTeachingStaff: true },
    });
    expect((await agent.get(`/api/teaching-assignments/${crypto.randomUUID()}`)).status).toBe(404);
    await h.prisma.schoolClass.update({ where: { id: refs.classId }, data: { status: CatalogStatus.INACTIVE } });
    await h.prisma.subject.update({ where: { id: refs.subjectId }, data: { status: CatalogStatus.INACTIVE } });
    await h.prisma.user.update({ where: { id: refs.teacherId }, data: { status: UserStatus.DISABLED } });
    const historical = await agent.get(`/api/teaching-assignments/${id}`);
    expect(historical.status).toBe(200);
    expect(historical.body).toMatchObject({
      id,
      schoolClass: { status: CatalogStatus.INACTIVE },
      subject: { status: CatalogStatus.INACTIVE },
      teacher: { userStatus: UserStatus.DISABLED, displayName: 'Teacher One' },
    });
  });

  it('ends open and explicit assignments, including audited idempotency', async () => {
    const refs = await setup();
    const { agent } = await manager();
    expect((await agent.post(`/api/teaching-assignments/${crypto.randomUUID()}/end`).set(origin)
      .set('X-Request-Id', 'end-missing').send({ endDate: '2026-08-10' })).status).toBe(404);
    expect(await successAuditCount('TEACHING_ASSIGNMENT_ENDED', 'end-missing')).toBe(0);
    const open = await createAssignment(agent, refs, { validUntil: null });
    const ended = await agent.post(`/api/teaching-assignments/${open.body.id as string}/end`).set(origin)
      .set('X-Request-Id', 'end-open').send({ endDate: '2026-08-20' });
    expect(ended.status).toBe(200);
    expect(ended.body.validUntil).toBe('2026-08-20');
    const repeated = await agent.post(`/api/teaching-assignments/${open.body.id as string}/end`).set(origin)
      .set('X-Request-Id', 'end-no-op').send({ endDate: '2026-08-20' });
    expect(repeated.status).toBe(200);
    expect((await h.prisma.auditEvent.findFirstOrThrow({ where: { requestId: 'end-no-op' } })).metadata).toMatchObject({ noOp: true });

    const otherClass = await createClass(refs.yearId);
    const bounded = await createAssignment(agent, refs, { schoolClassId: otherClass.id, validUntil: '2026-09-10' });
    const shortened = await agent.post(`/api/teaching-assignments/${bounded.body.id as string}/end`).set(origin)
      .send({ endDate: '2026-08-30' });
    expect(shortened.body.validUntil).toBe('2026-08-30');
  });

  it('rejects the complete end failure matrix without mutation or success audit', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const created = await createAssignment(agent, refs, { validUntil: '2026-08-20' });
    const id = created.body.id as string;
    const original = await h.prisma.teachingAssignment.findUniqueOrThrow({ where: { id } });
    const cases: Array<[string, unknown, number]> = [
      ['end-before-start', '2026-08-02', 400],
      ['end-extends-explicit', '2026-08-21', 409],
      ['end-after-calendar', '2026-09-19', 400],
      ['end-malformed', '2026-8-10', 400],
    ];
    for (const [requestId, endDate, expectedStatus] of cases) {
      const response = await agent.post(`/api/teaching-assignments/${id}/end`).set(origin)
        .set('X-Request-Id', requestId).send({ endDate });
      expect(response.status).toBe(expectedStatus);
      expect(await h.prisma.teachingAssignment.findUniqueOrThrow({ where: { id } })).toMatchObject({
        teacherUserId: original.teacherUserId,
        validFrom: original.validFrom,
        validUntil: original.validUntil,
      });
      expect(await successAuditCount('TEACHING_ASSIGNMENT_ENDED', requestId)).toBe(0);
    }
    await h.prisma.academicCalendarVersion.update({ where: { id: refs.calendarId }, data: { isActive: false } });
    const noCalendar = await agent.post(`/api/teaching-assignments/${id}/end`).set(origin)
      .set('X-Request-Id', 'end-no-calendar').send({ endDate: '2026-08-10' });
    expect(noCalendar.status).toBe(409);
    expect(await h.prisma.teachingAssignment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      teacherUserId: original.teacherUserId,
      validFrom: original.validFrom,
      validUntil: original.validUntil,
    });
    expect(await successAuditCount('TEACHING_ASSIGNMENT_ENDED', 'end-no-calendar')).toBe(0);
  });

  it('changes teacher by an atomic historical split and writes public-safe metadata', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const created = await createAssignment(agent, refs, { validUntil: '2026-08-20', note: ' Original note ' });
    const changed = await agent.post(`/api/teaching-assignments/${created.body.id as string}/change-teacher`).set(origin)
      .set('X-Request-Id', 'change-explicit').send({
        newTeacherUserId: refs.secondTeacherId,
        effectiveFrom: '2026-08-08',
        note: ' replacement ',
      });
    expect(changed.status).toBe(200);
    expect(changed.body.previous).toMatchObject({
      id: created.body.id,
      teacherUserId: refs.teacherId,
      validFrom: '2026-08-03',
      validUntil: '2026-08-07',
      note: 'Original note',
    });
    expect(changed.body.replacement).toMatchObject({
      teacherUserId: refs.secondTeacherId,
      validFrom: '2026-08-08',
      validUntil: '2026-08-20',
      note: 'replacement',
    });
    expect(changed.body.replacement.id).not.toBe(created.body.id);
    const audit = await h.prisma.auditEvent.findFirstOrThrow({ where: { requestId: 'change-explicit' } });
    expect(audit).toMatchObject({ action: 'TEACHING_ASSIGNMENT_TEACHER_CHANGED', entityId: created.body.id, result: 'SUCCESS' });
    expect(audit.metadata).toMatchObject({
      previousTeacherUserId: refs.teacherId,
      newTeacherUserId: refs.secondTeacherId,
      effectiveFrom: '2026-08-08',
      previousAssignmentNewValidUntil: '2026-08-07',
      replacementAssignmentId: changed.body.replacement.id,
      replacementValidUntil: '2026-08-20',
    });
    expect(JSON.stringify(audit.metadata)).not.toMatch(/password|cookie|token|secret/iu);
    expect(await successAuditCount('TEACHING_ASSIGNMENT_TEACHER_CHANGED', 'change-explicit')).toBe(1);
  });

  it('preserves null open end and defaults omitted replacement note to null', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const created = await createAssignment(agent, refs, { validUntil: null, note: 'Original' });
    const changed = await agent.post(`/api/teaching-assignments/${created.body.id as string}/change-teacher`).set(origin).send({
      newTeacherUserId: refs.secondTeacherId,
      effectiveFrom: '2026-08-08',
    });
    expect(changed.status).toBe(200);
    expect(changed.body.previous.note).toBe('Original');
    expect(changed.body.replacement).toMatchObject({ validUntil: null, note: null });
    expect((await h.prisma.teachingAssignment.findUniqueOrThrow({ where: { id: changed.body.replacement.id as string } })).validUntil).toBeNull();
  });

  it('rejects change-teacher date and identity failures without changing history', async () => {
    const refs = await setup();
    const { agent } = await manager();
    expect((await agent.post(`/api/teaching-assignments/${crypto.randomUUID()}/change-teacher`).set(origin)
      .set('X-Request-Id', 'change-missing-assignment').send({
      newTeacherUserId: refs.secondTeacherId, effectiveFrom: '2026-08-08',
    })).status).toBe(404);
    expect(await successAuditCount('TEACHING_ASSIGNMENT_TEACHER_CHANGED', 'change-missing-assignment')).toBe(0);
    const created = await createAssignment(agent, refs, { validUntil: '2026-08-20' });
    const id = created.body.id as string;
    const original = await h.prisma.teachingAssignment.findUniqueOrThrow({ where: { id } });
    const cases: Array<[string, Record<string, unknown>, number]> = [
      ['change-same-teacher', { newTeacherUserId: refs.teacherId, effectiveFrom: '2026-08-08' }, 400],
      ['change-at-start', { newTeacherUserId: refs.secondTeacherId, effectiveFrom: '2026-08-03' }, 400],
      ['change-before-start', { newTeacherUserId: refs.secondTeacherId, effectiveFrom: '2026-08-02' }, 400],
      ['change-after-end', { newTeacherUserId: refs.secondTeacherId, effectiveFrom: '2026-08-21' }, 400],
      ['change-outside-calendar', { newTeacherUserId: refs.secondTeacherId, effectiveFrom: '2026-09-19' }, 400],
      ['change-missing-teacher', { newTeacherUserId: crypto.randomUUID(), effectiveFrom: '2026-08-08' }, 404],
    ];
    for (const [requestId, body, expectedStatus] of cases) {
      const response = await agent.post(`/api/teaching-assignments/${id}/change-teacher`).set(origin)
        .set('X-Request-Id', requestId).send(body);
      expect(response.status).toBe(expectedStatus);
      expect(await h.prisma.teachingAssignment.findMany({ where: { academicYearId: refs.yearId } })).toHaveLength(1);
      expect(await h.prisma.teachingAssignment.findUniqueOrThrow({ where: { id } })).toMatchObject({
        teacherUserId: original.teacherUserId,
        validFrom: original.validFrom,
        validUntil: original.validUntil,
      });
      expect(await successAuditCount('TEACHING_ASSIGNMENT_TEACHER_CHANGED', requestId)).toBe(0);
    }
  });

  it('rejects replacement-teacher operational and StaffSubject failures atomically', async () => {
    const refs = await setup();
    const { agent } = await manager();
    const created = await createAssignment(agent, refs, { validUntil: '2026-08-20' });
    const id = created.body.id as string;
    const original = await h.prisma.teachingAssignment.findUniqueOrThrow({ where: { id } });
    const inactive = await createTeacher({ status: UserStatus.DISABLED });
    const noProfile = await createTeacher({ profile: false });
    const nonTeacher = await createTeacher({ isTeachingStaff: false });
    const noCoverage = await createTeacher();
    const partialCoverage = await createTeacher();
    await cover(partialCoverage.id, refs.subjectId, '2026-08-08', '2026-08-20');
    const cases: Array<[string, string]> = [
      ['change-inactive-teacher', inactive.id],
      ['change-no-profile', noProfile.id],
      ['change-not-teaching', nonTeacher.id],
      ['change-no-subject', noCoverage.id],
      ['change-partial-coverage', partialCoverage.id],
    ];
    for (const [requestId, newTeacherUserId] of cases) {
      const response = await agent.post(`/api/teaching-assignments/${id}/change-teacher`).set(origin)
        .set('X-Request-Id', requestId).send({ newTeacherUserId, effectiveFrom: '2026-08-08' });
      expect(response.status).toBe(409);
      expect(await h.prisma.teachingAssignment.findMany({ where: { academicYearId: refs.yearId } })).toHaveLength(1);
      expect(await h.prisma.teachingAssignment.findUniqueOrThrow({ where: { id } })).toMatchObject({
        teacherUserId: original.teacherUserId,
        validFrom: original.validFrom,
        validUntil: original.validUntil,
      });
      expect(await successAuditCount('TEACHING_ASSIGNMENT_TEACHER_CHANGED', requestId)).toBe(0);
    }
  });

  it('rolls back the old-row shortening when the replacement hits the real exclusion constraint', async () => {
    const refs = await setup();
    const actor = await manager();
    const created = await createAssignment(actor.agent, refs, { validUntil: '2026-08-20' });
    const id = created.body.id as string;
    const original = await h.prisma.teachingAssignment.findUniqueOrThrow({ where: { id } });
    let injected = false;
    const transactionInstrument = {
      $transaction: async <T>(
        callback: (tx: Prisma.TransactionClient) => Promise<T>,
        options?: { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number },
      ): Promise<T> => (
        h.prisma.$transaction(async (tx) => {
          const assignmentProxy = new Proxy(tx.teachingAssignment, {
            get(target, property, receiver) {
              if (property !== 'create') return Reflect.get(target, property, receiver);
              return async (args: Prisma.TeachingAssignmentCreateArgs) => {
                if (!injected) {
                  injected = true;
                  await tx.teachingAssignment.create({
                    data: {
                      academicYearId: refs.yearId,
                      schoolClassId: refs.classId,
                      subjectId: refs.subjectId,
                      teacherUserId: refs.teacherId,
                      validFrom: new Date('2026-08-08T00:00:00.000Z'),
                      validUntil: new Date('2026-08-20T00:00:00.000Z'),
                      note: 'transaction-local conflicting history',
                    },
                  });
                }
                return target.create(args);
              };
            },
          });
          return callback(new Proxy(tx, {
            get(target, property, receiver) {
              return property === 'teachingAssignment' ? assignmentProxy : Reflect.get(target, property, receiver);
            },
          }));
        }, options)
      ),
    };
    const service = new TeachingAssignmentsService(transactionInstrument as never, { write: jest.fn() } as never);
    const failure = service.changeTeacher(id, {
      newTeacherUserId: refs.secondTeacherId,
      effectiveFrom: '2026-08-08',
    }, actor.id, { requestId: 'change-db-conflict' });
    await expect(failure).rejects.toBeInstanceOf(ConflictException);
    await expect(failure).rejects.toMatchObject({ status: 409 });
    expect(injected).toBe(true);
    expect(await h.prisma.teachingAssignment.findMany({ where: { academicYearId: refs.yearId } })).toHaveLength(1);
    expect(await h.prisma.teachingAssignment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      teacherUserId: original.teacherUserId,
      validFrom: original.validFrom,
      validUntil: original.validUntil,
    });
    expect(await successAuditCount('TEACHING_ASSIGNMENT_TEACHER_CHANGED', 'change-db-conflict')).toBe(0);
  });
});
