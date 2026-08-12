import { CatalogStatus, UserStatus } from '@prisma/client';
import { integration, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

integration('timetable draft validation control plane (PostgreSQL)', () => {
  const h = new Phase01Harness();

  beforeAll(async () => h.start());
  afterAll(async () => h.stop());
  beforeEach(async () => {
    await h.clean();
    await h.seedCapabilities([
      { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
      { key: 'ACADEMIC_STRUCTURE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SUBJECT_MANAGE', scopes: ['SCHOOL_WIDE'] },
    ]);
  });

  async function academicFixture() {
    const year = await h.prisma.academicYear.create({ data: { code: `Y${crypto.randomUUID().slice(0, 6)}`, name: '2026-2027' } });
    const calendar = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id, versionNumber: 1, startDate: new Date('2026-09-01Z'), endDate: new Date('2027-05-31Z'),
        officialWeekCount: 35, reserveWeekCount: 1, teachingWeekdays: ['MONDAY'], isActive: false,
      },
    });
    const week = await h.prisma.academicWeek.create({
      data: { calendarVersionId: calendar.id, kind: 'RESERVE', reserveWeekNumber: 1, displayLabel: 'DP1', sortOrder: 36 },
    });
    await h.prisma.academicWeekSegment.createMany({ data: [
      { academicWeekId: week.id, calendarVersionId: calendar.id, label: 'DP1a', segmentOrder: 1, startDate: new Date('2026-09-07Z'), endDate: new Date('2026-09-08Z') },
      { academicWeekId: week.id, calendarVersionId: calendar.id, label: 'DP1b', segmentOrder: 2, startDate: new Date('2026-09-10Z'), endDate: new Date('2026-09-11Z') },
    ] });
    const schoolClass = await h.prisma.schoolClass.create({
      data: { academicYearId: year.id, code: '10A1', name: '10A1', gradeLevel: 10, status: CatalogStatus.ACTIVE },
    });
    const subject = await h.prisma.subject.create({ data: { code: `S${crypto.randomUUID().slice(0, 6)}`, name: 'ToÃ¡n', status: CatalogStatus.ACTIVE } });
    const teacher = await h.prisma.user.create({
      data: {
        username: `teacher-${crypto.randomUUID().slice(0, 8)}`, passwordHash: await h.passwords.hash('TeacherPassword9'),
        status: UserStatus.ACTIVE, mustChangePassword: false,
        profile: { create: { displayName: 'GiÃ¡o viÃªn', isTeachingStaff: true } },
      },
    });
    const assignment = await h.prisma.teachingAssignment.create({
      data: {
        academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: teacher.id,
        validFrom: new Date('2026-09-01Z'), validUntil: new Date('2027-05-31Z'),
      },
    });
    const slot = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 1, revision: 1,
        displayLabel: 'Tiáº¿t 1', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z'),
        isActive: true, allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false,
      },
    });
    return { year, calendar, week, schoolClass, subject, teacher, assignment, slot };
  }

  it('enforces exact capability and CSRF composition', async () => {
    const { year } = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const noGrant = await h.actor();
    const systemAdmin = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    const academicManager = await h.actor({ grants: [{ capabilityKey: 'ACADEMIC_STRUCTURE_MANAGE' }] });
    const subjectManager = await h.actor({ grants: [{ capabilityKey: 'SUBJECT_MANAGE' }] });
    const wrongScope = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE', scopeType: 'PERSONAL' }] });

    expect((await manager.agent.get(`/api/academic-years/${year.id}/timetable-versions`)).status).toBe(200);
    for (const denied of [noGrant, systemAdmin, academicManager, subjectManager, wrongScope]) {
      expect((await denied.agent.get(`/api/academic-years/${year.id}/timetable-versions`)).status).toBe(403);
    }
    expect((await manager.agent.post(`/api/academic-years/${year.id}/timetable-versions`).send({})).status).toBe(403);
    expect((await manager.agent.post(`/api/academic-years/${year.id}/timetable-versions`).set('Origin', testOrigin).send({ note: ' NhÃ¡p ' })).status).toBe(201);
  });

  it('derives target, snapshots teacher, replaces atomically, validates, audits, and freezes content', async () => {
    const fixture = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const created = await manager.agent.post(`/api/academic-years/${fixture.year.id}/timetable-versions`)
      .set('Origin', testOrigin).send({ note: ' NhÃ¡p 1 ' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ versionNumber: 1, status: 'DRAFT', note: 'NhÃ¡p 1', calendarVersionId: null, contentChecksum: null, entryCount: 0 });

    const targeted = await manager.agent.post(`/api/timetable-versions/${created.body.id}/target`).set('Origin', testOrigin).send({
      expectedUpdatedAt: created.body.updatedAt,
      calendarVersionId: fixture.calendar.id,
      effectiveAcademicWeekId: fixture.week.id,
    });
    expect(targeted.status).toBe(200);
    expect(targeted.body.effectiveFrom).toBe('2026-09-07');
    expect(new Date(targeted.body.updatedAt).getTime()).toBeGreaterThan(new Date(created.body.updatedAt).getTime());

    const normalized = {
      weekday: 'MONDAY', timeSlotDefinitionId: fixture.slot.id, schoolClassId: fixture.schoolClass.id,
      subjectId: fixture.subject.id, teachingAssignmentId: fixture.assignment.id,
    };
    const replaced = await manager.agent.put(`/api/timetable-versions/${created.body.id}/entries`).set('Origin', testOrigin).send({
      expectedUpdatedAt: targeted.body.updatedAt, entries: [normalized],
    });
    expect(replaced.status).toBe(200);
    const stored = await h.prisma.timetableEntry.findFirstOrThrow({ where: { timetableVersionId: created.body.id } });
    expect(stored.teacherUserId).toBe(fixture.assignment.teacherUserId);

    const stale = await manager.agent.put(`/api/timetable-versions/${created.body.id}/entries`).set('Origin', testOrigin).send({
      expectedUpdatedAt: targeted.body.updatedAt, entries: [],
    });
    expect(stale.status).toBe(409);
    expect(await h.prisma.timetableEntry.count({ where: { timetableVersionId: created.body.id } })).toBe(1);

    const validated = await manager.agent.post(`/api/timetable-versions/${created.body.id}/validate`).set('Origin', testOrigin).send({
      expectedUpdatedAt: replaced.body.version.updatedAt,
    });
    expect(validated.status).toBe(200);
    expect(validated.body).toMatchObject({
      valid: true, statusBefore: 'DRAFT', statusAfter: 'VALIDATED', validationScope: 'NORMAL_BASE_TIMETABLE',
      deferredChecks: ['TIMETABLE_COMPLETENESS', 'PPCT_ASSOCIATION', 'SPECIAL_ACTIVITY_COLLISIONS'],
    });
    expect(validated.body.validatedByUserId).toBe(manager.id);
    expect(validated.body.validatedAt).toEqual(expect.any(String));
    expect((await manager.agent.put(`/api/timetable-versions/${created.body.id}/entries`).set('Origin', testOrigin).send({
      expectedUpdatedAt: validated.body.version.updatedAt, entries: [],
    })).status).toBe(409);
    expect((await manager.agent.post(`/api/timetable-versions/${created.body.id}/target`).set('Origin', testOrigin).send({
      expectedUpdatedAt: validated.body.version.updatedAt,
      calendarVersionId: fixture.calendar.id,
      effectiveAcademicWeekId: fixture.week.id,
    })).status).toBe(409);

    const actions = (await h.prisma.auditEvent.findMany({ where: { entityId: created.body.id }, orderBy: { createdAt: 'asc' } })).map((row) => row.action);
    expect(actions).toEqual([
      'TIMETABLE_VERSION_DRAFT_CREATED', 'TIMETABLE_VERSION_TARGET_SET', 'TIMETABLE_ENTRIES_REPLACED', 'TIMETABLE_VALIDATION_RUN',
    ]);
    expect((await h.prisma.timetableVersion.findUniqueOrThrow({ where: { id: created.body.id } })).contentChecksum).toBeNull();
  });

  it('returns an invalid report for empty content and advances the draft token', async () => {
    const fixture = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const created = await manager.agent.post(`/api/academic-years/${fixture.year.id}/timetable-versions`).set('Origin', testOrigin).send({});
    const report = await manager.agent.post(`/api/timetable-versions/${created.body.id}/validate`).set('Origin', testOrigin).send({ expectedUpdatedAt: created.body.updatedAt });
    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({ valid: false, statusAfter: 'DRAFT', validatedAt: null, validatedByUserId: null });
    expect(report.body.issues.map((value: { code: string }) => value.code)).toEqual(['TARGET_REQUIRED', 'EMPTY_TIMETABLE']);
    expect(new Date(report.body.version.updatedAt).getTime()).toBeGreaterThan(new Date(created.body.updatedAt).getTime());
  });

  it('allows at most one concurrent validate or entry replacement to commit with one draft token', async () => {
    const fixture = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const created = await manager.agent.post(`/api/academic-years/${fixture.year.id}/timetable-versions`).set('Origin', testOrigin).send({});
    const targeted = await manager.agent.post(`/api/timetable-versions/${created.body.id}/target`).set('Origin', testOrigin).send({
      expectedUpdatedAt: created.body.updatedAt, calendarVersionId: fixture.calendar.id, effectiveAcademicWeekId: fixture.week.id,
    });
    const authored = await manager.agent.put(`/api/timetable-versions/${created.body.id}/entries`).set('Origin', testOrigin).send({
      expectedUpdatedAt: targeted.body.updatedAt,
      entries: [{
        weekday: 'MONDAY', timeSlotDefinitionId: fixture.slot.id, schoolClassId: fixture.schoolClass.id,
        subjectId: fixture.subject.id, teachingAssignmentId: fixture.assignment.id,
      }],
    });
    const token = authored.body.version.updatedAt as string;
    const [validation, replacement] = await Promise.all([
      manager.agent.post(`/api/timetable-versions/${created.body.id}/validate`).set('Origin', testOrigin).send({ expectedUpdatedAt: token }),
      manager.agent.put(`/api/timetable-versions/${created.body.id}/entries`).set('Origin', testOrigin).send({ expectedUpdatedAt: token, entries: [] }),
    ]);
    expect([validation.status, replacement.status].filter((status) => status === 200)).toHaveLength(1);
    expect([validation.status, replacement.status].filter((status) => status === 409)).toHaveLength(1);
    const final = await h.prisma.timetableVersion.findUniqueOrThrow({ where: { id: created.body.id } });
    const entryCount = await h.prisma.timetableEntry.count({ where: { timetableVersionId: created.body.id } });
    if (final.status === 'VALIDATED') expect(entryCount).toBe(1);
    else expect(entryCount).toBe(0);
  });
});
