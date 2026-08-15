import { CatalogStatus, UserStatus } from '@prisma/client';
import request from 'supertest';
import { integration, normalizedCode, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

integration('operational overlay control plane (PostgreSQL)', () => {
  const h = new Phase01Harness();

  async function clean(): Promise<void> {
    await h.prisma.makeupTeachingSchedule.deleteMany();
    await h.prisma.operationalLessonDisposition.deleteMany();
    await h.prisma.calendarExceptionTimeSlot.deleteMany();
    await h.prisma.calendarException.deleteMany();
    await h.clean();
  }

  beforeAll(async () => h.start());
  afterAll(async () => {
    try { await clean(); } finally { await h.stop(); }
  });
  beforeEach(async () => {
    await clean();
    await h.seedCapabilities([
      { key: 'CALENDAR_EXCEPTION_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'TEACHING_OPERATION_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
      { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
  });

  async function fixture(createdByUserId: string) {
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });
    const calendar = await h.prisma.academicCalendarVersion.create({ data: {
      academicYearId: year.id, versionNumber: 1, startDate: new Date('2026-09-01Z'), endDate: new Date('2027-05-31Z'),
      officialWeekCount: 35, reserveWeekCount: 1, teachingWeekdays: ['MONDAY'], isActive: true, activatedAt: new Date(),
    } });
    const schoolClass = await h.prisma.schoolClass.create({ data: {
      academicYearId: year.id, code: normalizedCode('C'), name: '10A1', gradeLevel: 10, status: CatalogStatus.ACTIVE,
    } });
    const subject = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Toán', status: CatalogStatus.ACTIVE } });
    const otherSubject = await h.prisma.subject.create({ data: { code: normalizedCode('O'), name: 'Vật lý', status: CatalogStatus.ACTIVE } });
    const teacher = await h.prisma.user.create({ data: {
      username: `teacher-${crypto.randomUUID().slice(0, 8)}`, passwordHash: await h.passwords.hash('TeacherPassword9'),
      status: UserStatus.ACTIVE, profile: { create: { displayName: 'Giáo viên', isTeachingStaff: true } },
    } });
    const substitute = await h.prisma.user.create({ data: {
      username: `substitute-${crypto.randomUUID().slice(0, 8)}`, passwordHash: await h.passwords.hash('SubstitutePassword9'),
      status: UserStatus.ACTIVE, profile: { create: { displayName: 'Giáo viên thay thế', isTeachingStaff: true } },
    } });
    const assignment = await h.prisma.teachingAssignment.create({ data: {
      academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: teacher.id,
      validFrom: new Date('2026-09-01Z'), validUntil: new Date('2027-05-31Z'),
    } });
    const staffSubject = await h.prisma.staffSubject.create({ data: {
      userId: substitute.id, subjectId: subject.id, validFrom: new Date('2026-01-01Z'), isPrimary: true,
    } });
    const slot = await h.prisma.timeSlotDefinition.create({ data: {
      academicYearId: year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 1, revision: 1, displayLabel: 'Tiết 1',
      startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z'),
      isActive: true, allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false,
    } });
    const version = await h.prisma.timetableVersion.create({ data: {
      academicYearId: year.id, versionNumber: 1, status: 'ACTIVE', calendarVersionId: calendar.id,
      effectiveFrom: new Date('2026-09-01Z'), createdByUserId, activatedByUserId: createdByUserId, activatedAt: new Date(),
    } });
    const entry = await h.prisma.timetableEntry.create({ data: {
      timetableVersionId: version.id, academicYearId: year.id, weekday: 'MONDAY', timeSlotDefinitionId: slot.id,
      schoolClassId: schoolClass.id, subjectId: subject.id, teachingAssignmentId: assignment.id, teacherUserId: teacher.id,
    } });
    return { year, calendar, schoolClass, subject, otherSubject, substitute, staffSubject, slot, version, entry, assignment, teacher };
  }

  it('enforces exact overlay authority and persists an idempotent calendar exception with its real 05C1 FK row', async () => {
    const calendarManager = await h.actor({ grants: [{ capabilityKey: 'CALENDAR_EXCEPTION_MANAGE' }] });
    const systemAdmin = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    const f = await fixture(calendarManager.id);
    const payload = {
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate: '2026-09-14', scope: 'CLASS',
      schoolClassId: f.schoolClass.id, timeSelector: 'EXACT_SLOTS', exactTimeSlotDefinitionIds: [f.slot.id], requestKey: 'calendar-create-1',
    };

    expect((await request(h.app.getHttpServer()).post('/api/operational-overlays/calendar-exceptions').send(payload)).status).toBe(401);
    expect((await systemAdmin.agent.post('/api/operational-overlays/calendar-exceptions').set('Origin', testOrigin).send(payload)).status).toBe(403);

    const created = await calendarManager.agent.post('/api/operational-overlays/calendar-exceptions').set('Origin', testOrigin).send(payload);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ outcome: 'CREATED', record: { status: 'ACTIVE', exactTimeSlotDefinitionIds: [f.slot.id] } });
    const persisted = await h.prisma.calendarException.findUniqueOrThrow({ where: { id: created.body.record.id }, include: { exactTimeSlots: true } });
    expect(persisted).toMatchObject({ academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, schoolClassId: f.schoolClass.id, status: 'ACTIVE' });
    expect(persisted.exactTimeSlots).toHaveLength(1);
    expect(persisted.exactTimeSlots[0]).toMatchObject({ academicYearId: f.year.id, timeSlotDefinitionId: f.slot.id });
    expect(await h.prisma.auditEvent.count({ where: { entityId: persisted.id, action: 'CALENDAR_EXCEPTION_CREATED', result: 'SUCCESS' } })).toBe(1);

    const replay = await calendarManager.agent.post('/api/operational-overlays/calendar-exceptions').set('Origin', testOrigin).send(payload);
    expect(replay.status).toBe(201);
    expect(replay.body.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(await h.prisma.auditEvent.count({ where: { entityId: persisted.id, action: 'CALENDAR_EXCEPTION_CREATED', result: 'SUCCESS' } })).toBe(1);
    expect((await calendarManager.agent.post('/api/operational-overlays/calendar-exceptions').set('Origin', testOrigin)
      .send({ ...payload, note: 'payload khác' })).status).toBe(409);
  });

  it('reverses a persisted calendar exception with real CAS and retains its historical relationship', async () => {
    const calendarManager = await h.actor({ grants: [{ capabilityKey: 'CALENDAR_EXCEPTION_MANAGE' }] });
    const f = await fixture(calendarManager.id);
    const created = await calendarManager.agent.post('/api/operational-overlays/calendar-exceptions').set('Origin', testOrigin).send({
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate: '2026-09-14', scope: 'CLASS',
      schoolClassId: f.schoolClass.id, timeSelector: 'EXACT_SLOTS', exactTimeSlotDefinitionIds: [f.slot.id], requestKey: 'calendar-reverse-create',
    });
    expect(created.status).toBe(201);
    const id = created.body.record.id as string;
    expect((await calendarManager.agent.post(`/api/operational-overlays/calendar-exceptions/${id}/reverse`).set('Origin', testOrigin)
      .send({ requestKey: 'calendar-reverse-stale', expectedUpdatedAt: '2020-01-01T00:00:00.000Z', reversalReason: 'stale' })).status).toBe(409);
    const reversed = await calendarManager.agent.post(`/api/operational-overlays/calendar-exceptions/${id}/reverse`).set('Origin', testOrigin)
      .send({ requestKey: 'calendar-reverse-current', expectedUpdatedAt: created.body.record.updatedAt, reversalReason: 'đã hủy' });
    expect(reversed.status).toBe(200);
    expect(reversed.body).toMatchObject({ outcome: 'REVERSED', record: { id, status: 'REVERSED', reversalReason: 'đã hủy' } });
    const persisted = await h.prisma.calendarException.findUniqueOrThrow({ where: { id }, include: { exactTimeSlots: true } });
    expect(persisted.status).toBe('REVERSED');
    expect(persisted.exactTimeSlots).toHaveLength(1);
    expect(await h.prisma.auditEvent.count({ where: { entityId: id, action: 'CALENDAR_EXCEPTION_REVERSED', result: 'SUCCESS' } })).toBe(1);
  });

  it('derives a disposition source through the HTTP boundary, enforces subject scope, real uniqueness, and retained reversal history', async () => {
    const command = await h.actor({ grants: [{ capabilityKey: 'TEACHING_OPERATION_MANAGE', scopeType: 'SUBJECT', scopeResourceId: crypto.randomUUID() }] });
    const f = await fixture(command.id);
    await h.prisma.capabilityGrant.updateMany({ where: { userId: command.id }, data: { scopeResourceId: f.subject.id } });
    const unauthorized = await h.actor({ grants: [{ capabilityKey: 'TEACHING_OPERATION_MANAGE', scopeType: 'SUBJECT', scopeResourceId: f.otherSubject.id }] });
    const payload = {
      timetableEntryId: f.entry.id, sourceCivilDate: '2026-09-07', dispositionType: 'SAME_SUBJECT_SUBSTITUTION',
      assignedTeacherUserId: f.substitute.id, requestKey: 'disposition-create-1',
    };

    expect((await unauthorized.agent.post('/api/operational-overlays/lesson-dispositions').set('Origin', testOrigin).send(payload)).status).toBe(403);
    const created = await command.agent.post('/api/operational-overlays/lesson-dispositions').set('Origin', testOrigin).send(payload);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ outcome: 'CREATED', record: {
      status: 'ACTIVE', timetableVersionId: f.version.id, timetableEntryId: f.entry.id, academicCalendarVersionId: f.calendar.id,
      timeSlotDefinitionId: f.slot.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id,
      teachingAssignmentId: f.assignment.id, responsibleTeacherUserId: f.teacher.id, eligibilityStaffSubjectId: f.staffSubject.id,
    } });
    const persisted = await h.prisma.operationalLessonDisposition.findUniqueOrThrow({ where: { id: created.body.record.id } });
    expect(persisted).toMatchObject({ timetableEntryId: f.entry.id, timetableVersionId: f.version.id, status: 'ACTIVE' });
    expect(await h.prisma.auditEvent.count({ where: { entityId: persisted.id, action: 'OPERATIONAL_LESSON_DISPOSITION_CREATED', result: 'SUCCESS' } })).toBe(1);
    expect((await command.agent.post('/api/operational-overlays/lesson-dispositions').set('Origin', testOrigin)
      .send({ ...payload, requestKey: 'disposition-create-2' })).status).toBe(409);

    const reversed = await command.agent.post(`/api/operational-overlays/lesson-dispositions/${persisted.id}/reverse`).set('Origin', testOrigin)
      .send({ requestKey: 'disposition-reverse-1', expectedUpdatedAt: created.body.record.updatedAt, reversalReason: 'khôi phục lịch' });
    expect(reversed.status).toBe(200);
    expect(await h.prisma.operationalLessonDisposition.findUniqueOrThrow({ where: { id: persisted.id } })).toMatchObject({
      status: 'REVERSED', timetableEntryId: f.entry.id, teachingAssignmentId: f.assignment.id,
    });
  });
});
