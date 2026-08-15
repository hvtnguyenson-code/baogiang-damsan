import { CatalogStatus, PpctVersionStatus, UserStatus } from '@prisma/client';
import request from 'supertest';
import { integration, normalizedCode, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

integration('special activity runtime control plane (PostgreSQL)', () => {
  const h = new Phase01Harness();
  const civilDate = '2026-09-07';

  async function clean(): Promise<void> {
    await h.prisma.specialActivityStaffing.deleteMany();
    await h.prisma.specialActivityClassTarget.deleteMany();
    await h.prisma.specialActivityTimeSlot.deleteMany();
    await h.prisma.specialActivity.deleteMany();
    await h.prisma.makeupTeachingSchedule.deleteMany();
    await h.prisma.operationalLessonDisposition.deleteMany();
    await h.prisma.calendarExceptionTimeSlot.deleteMany();
    await h.prisma.calendarException.deleteMany();
    await h.prisma.ppctItemLineage.deleteMany();
    await h.prisma.ppctClassAssociation.deleteMany();
    await h.prisma.ppctItemRevision.deleteMany();
    await h.prisma.ppctItem.deleteMany();
    await h.prisma.ppctVersion.deleteMany();
    await h.prisma.ppctPlan.deleteMany();
    await h.clean();
  }

  beforeAll(async () => h.start());
  beforeEach(async () => {
    await clean();
    await h.seedCapabilities([
      { key: 'SPECIAL_ACTIVITY_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'CALENDAR_EXCEPTION_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'TEACHING_OPERATION_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
  });
  afterAll(async () => { try { await clean(); } finally { await h.stop(); } });

  async function fixture(createdByUserId: string) {
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });
    const calendar = await h.prisma.academicCalendarVersion.create({ data: {
      academicYearId: year.id, versionNumber: 1, startDate: new Date('2026-09-01Z'), endDate: new Date('2027-05-31Z'),
      officialWeekCount: 35, reserveWeekCount: 1, teachingWeekdays: ['MONDAY'], isActive: true, activatedAt: new Date(),
    } });
    const week = await h.prisma.academicWeek.create({ data: { calendarVersionId: calendar.id, kind: 'OFFICIAL', officialWeekNumber: 1, displayLabel: 'Week 1', sortOrder: 1 } });
    await h.prisma.academicWeekSegment.create({ data: { academicWeekId: week.id, calendarVersionId: calendar.id, label: 'W1', segmentOrder: 1, startDate: new Date('2026-09-07Z'), endDate: new Date('2026-09-13Z') } });
    const activeA = await h.prisma.schoolClass.create({ data: { academicYearId: year.id, code: normalizedCode('A'), name: '10A1', gradeLevel: 10, status: CatalogStatus.ACTIVE } });
    const activeB = await h.prisma.schoolClass.create({ data: { academicYearId: year.id, code: normalizedCode('B'), name: '10A2', gradeLevel: 10, status: CatalogStatus.ACTIVE } });
    const inactive = await h.prisma.schoolClass.create({ data: { academicYearId: year.id, code: normalizedCode('I'), name: '11A1', gradeLevel: 11, status: CatalogStatus.INACTIVE } });
    const subjectA = await h.prisma.subject.create({ data: { code: normalizedCode('SA'), name: 'Subject A', status: CatalogStatus.ACTIVE } });
    const subjectB = await h.prisma.subject.create({ data: { code: normalizedCode('SB'), name: 'Subject B', status: CatalogStatus.ACTIVE } });
    const slotA = await h.prisma.timeSlotDefinition.create({ data: { academicYearId: year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 1, revision: 1, displayLabel: 'A', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z'), isActive: true, allowRegularTeaching: true, allowMakeupTeaching: true, allowSelfStudy: false } });
    const slotB = await h.prisma.timeSlotDefinition.create({ data: { academicYearId: year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 2, revision: 1, displayLabel: 'B', startTime: new Date('1970-01-01T07:45:00Z'), endTime: new Date('1970-01-01T08:30:00Z'), isActive: true, allowRegularTeaching: true, allowMakeupTeaching: true, allowSelfStudy: false } });
    const slotC = await h.prisma.timeSlotDefinition.create({ data: { academicYearId: year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 3, revision: 1, displayLabel: 'C', startTime: new Date('1970-01-01T08:30:00Z'), endTime: new Date('1970-01-01T09:15:00Z'), isActive: true, allowRegularTeaching: true, allowMakeupTeaching: true, allowSelfStudy: false } });
    async function teacher(prefix: string, status = UserStatus.ACTIVE, teaching = true) {
      return h.prisma.user.create({ data: { username: `${prefix}-${crypto.randomUUID().slice(0, 8)}`, passwordHash: await h.passwords.hash('TeacherPassword9'), status, profile: { create: { displayName: prefix, isTeachingStaff: teaching } } }, include: { profile: true } });
    }
    const responsibleA = await teacher('responsible-a');
    const responsibleB = await teacher('responsible-b');
    const activityTeacher = await teacher('activity-teacher');
    const alternateTeacher = await teacher('alternate-teacher');
    const assignmentA = await h.prisma.teachingAssignment.create({ data: { academicYearId: year.id, schoolClassId: activeA.id, subjectId: subjectA.id, teacherUserId: responsibleA.id, validFrom: new Date('2026-09-01Z'), validUntil: new Date('2027-05-31Z') } });
    const assignmentB = await h.prisma.teachingAssignment.create({ data: { academicYearId: year.id, schoolClassId: activeB.id, subjectId: subjectB.id, teacherUserId: responsibleB.id, validFrom: new Date('2026-09-01Z'), validUntil: new Date('2027-05-31Z') } });
    const lifecycleAt = new Date('2026-08-01T00:00:00.000Z');
    const version = await h.prisma.timetableVersion.create({ data: { academicYearId: year.id, versionNumber: 1, status: 'ACTIVE', calendarVersionId: calendar.id, effectiveAcademicWeekId: week.id, effectiveFrom: new Date('2026-09-07Z'), createdByUserId, validatedByUserId: createdByUserId, validatedAt: lifecycleAt, approvedByUserId: createdByUserId, approvedAt: lifecycleAt, activatedByUserId: createdByUserId, activatedAt: lifecycleAt } });
    const entryA = await h.prisma.timetableEntry.create({ data: { timetableVersionId: version.id, academicYearId: year.id, weekday: 'MONDAY', timeSlotDefinitionId: slotA.id, schoolClassId: activeA.id, subjectId: subjectA.id, teachingAssignmentId: assignmentA.id, teacherUserId: responsibleA.id } });
    const entryB = await h.prisma.timetableEntry.create({ data: { timetableVersionId: version.id, academicYearId: year.id, weekday: 'MONDAY', timeSlotDefinitionId: slotA.id, schoolClassId: activeB.id, subjectId: subjectB.id, teachingAssignmentId: assignmentB.id, teacherUserId: responsibleB.id } });
    const staffSubjectA = await h.prisma.staffSubject.create({ data: { userId: activityTeacher.id, subjectId: subjectA.id, validFrom: new Date('2026-01-01Z'), isPrimary: true } });
    const staffSubjectB = await h.prisma.staffSubject.create({ data: { userId: activityTeacher.id, subjectId: subjectB.id, validFrom: new Date('2026-01-01Z'), isPrimary: true } });
    return { year, calendar, activeA, activeB, inactive, subjectA, subjectB, slotA, slotB, slotC, teacher, responsibleA, responsibleB, activityTeacher, alternateTeacher, assignmentA, assignmentB, version, entryA, entryB, staffSubjectA, staffSubjectB };
  }

  function payload(f: Awaited<ReturnType<typeof fixture>>, teacherId: string, patch: Record<string, unknown> = {}) {
    return { academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate, scope: 'CLASS', schoolClassId: f.activeA.id, exactTimeSlotDefinitionIds: [f.slotA.id], scheduledTeacherUserIds: [teacherId], title: 'Hoat dong', requestKey: crypto.randomUUID(), ...patch };
  }

  async function createDisposition(actor: Awaited<ReturnType<Phase01Harness['actor']>>, entryId: string, patch: Record<string, unknown> = {}) {
    return actor.agent.post('/api/operational-overlays/lesson-dispositions').set('Origin', testOrigin).send({ timetableEntryId: entryId, sourceCivilDate: civilDate, dispositionType: 'AUTHORIZED_CANCELLATION', requestKey: crypto.randomUUID(), ...patch });
  }

  async function createException(actor: Awaited<ReturnType<Phase01Harness['actor']>>, f: Awaited<ReturnType<typeof fixture>>, schoolClassId: string, timeSlotDefinitionId: string) {
    return actor.agent.post('/api/operational-overlays/calendar-exceptions').set('Origin', testOrigin).send({ academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate, scope: 'CLASS', schoolClassId, timeSelector: 'EXACT_SLOTS', exactTimeSlotDefinitionIds: [timeSlotDefinitionId], requestKey: crypto.randomUUID() });
  }

  async function createMakeup(f: Awaited<ReturnType<typeof fixture>>, entry: typeof f.entryA, scheduledTeacherId: string, eligibilityStaffSubjectId: string, targetSlotId: string) {
    const plan = await h.prisma.ppctPlan.create({ data: { academicYearId: f.year.id, subjectId: entry.subjectId, gradeLevel: 10 } });
    const ppctVersion = await h.prisma.ppctVersion.create({ data: { ppctPlanId: plan.id, versionNumber: 1, status: PpctVersionStatus.PUBLISHED, createdByUserId: f.version.createdByUserId, publishedByUserId: f.version.createdByUserId, publishedAt: new Date('2026-08-14T00:00:00Z') } });
    const item = await h.prisma.ppctItem.create({ data: { ppctPlanId: plan.id } });
    await h.prisma.ppctItemRevision.create({ data: { ppctVersionId: ppctVersion.id, ppctPlanId: plan.id, ppctItemId: item.id, sequence: 1, title: 'Lesson 1', lessonType: 'Theory' } });
    const association = await h.prisma.ppctClassAssociation.create({ data: { academicYearId: f.year.id, schoolClassId: entry.schoolClassId, subjectId: entry.subjectId, gradeLevel: 10, ppctPlanId: plan.id, ppctVersionId: ppctVersion.id, effectiveFrom: new Date('2026-09-01Z'), createdByUserId: f.version.createdByUserId } });
    return h.prisma.makeupTeachingSchedule.create({ data: {
      academicYearId: f.year.id, originalTimetableVersionId: f.version.id, originalTimetableEntryId: entry.id,
      originalCivilDate: new Date('2026-09-14Z'), originalAcademicCalendarVersionId: f.calendar.id,
      originalTimeSlotDefinitionId: entry.timeSlotDefinitionId, schoolClassId: entry.schoolClassId, subjectId: entry.subjectId,
      originalTeachingAssignmentId: entry.teachingAssignmentId, responsibleTeacherUserId: entry.teacherUserId,
      ppctClassAssociationId: association.id, ppctPlanId: plan.id, ppctVersionId: ppctVersion.id, ppctItemId: item.id,
      targetCivilDate: new Date(`${civilDate}T00:00:00.000Z`), targetAcademicCalendarVersionId: f.calendar.id,
      targetTimeSlotDefinitionId: targetSlotId, scheduledTeacherUserId: scheduledTeacherId, eligibilityCheckedAt: new Date(),
      eligibilityWasActive: true, eligibilityWasTeachingStaff: true, eligibilitySameSubject: true,
      eligibilityStaffSubjectId, createRequestKey: crypto.randomUUID(), createRequestFingerprint: crypto.randomUUID(), createdByUserId: f.version.createdByUserId,
    } });
  }

  it('A authority, persistence, frozen reads and audit', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }] });
    const admin = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    const f = await fixture(manager.id); const body = payload(f, f.alternateTeacher.id);
    expect((await request(h.app.getHttpServer()).post('/api/special-activities').send(body)).status).toBe(401);
    expect((await admin.agent.post('/api/special-activities').set('Origin', testOrigin).send(body)).status).toBe(403);
    const created = await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(body);
    expect(created.status).toBe(201);
    expect(created.body.collisionCoverage).toEqual({ profile: 'CANONICAL_CLASS_TEACHER_TIME_V1', specialActivity: 'ASSESSED', room: 'NOT_ASSESSED' });
    const row = await h.prisma.specialActivity.findUniqueOrThrow({ where: { id: created.body.record.id }, include: { timeSlots: true, classTargets: true, staffing: true } });
    expect(row).toMatchObject({ academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, status: 'ACTIVE' });
    expect(row.timeSlots).toHaveLength(1); expect(row.classTargets).toHaveLength(1);
    expect(row.staffing[0]).toMatchObject({ scheduledTeacherUserId: f.alternateTeacher.id, staffProfileId: f.alternateTeacher.profile!.id, eligibilityWasActive: true, eligibilityWasTeachingStaff: true });
    expect((await manager.agent.get(`/api/special-activities/${row.id}`)).body.frozenSchoolClassIds).toEqual([f.activeA.id]);
    expect(await h.prisma.auditEvent.count({ where: { entityId: row.id, action: 'SPECIAL_ACTIVITY_CREATED', result: 'SUCCESS' } })).toBe(1);
  });

  it('B C D E normalized replay, scope expansion, eligibility and retained source checks', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }] }); const f = await fixture(manager.id);
    const p = payload(f, f.alternateTeacher.id, { scope: 'GRADE', gradeLevel: 10, schoolClassId: undefined, exactTimeSlotDefinitionIds: [f.slotA.id, f.slotA.id], scheduledTeacherUserIds: [f.alternateTeacher.id, f.alternateTeacher.id], requestKey: 'same-key' });
    const first = await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(p); expect(first.status).toBe(201); expect(first.body.record.frozenSchoolClassIds.sort()).toEqual([f.activeA.id, f.activeB.id].sort());
    const replay = await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send({ ...p, exactTimeSlotDefinitionIds: [f.slotA.id] }); expect(replay.body.outcome).toBe('IDEMPOTENT_REPLAY');
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send({ ...p, title: 'changed' })).status).toBe(409);
    const nonTeaching = await f.teacher('non-teaching', UserStatus.ACTIVE, false);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, nonTeaching.id))).status).toBe(409);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.alternateTeacher.id, { civilDate: '2026-09-08' }))).status).toBe(409);
  });

  it('F reversal CAS, replay and replacement retain children', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }] }); const f = await fixture(manager.id);
    const made = await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.alternateTeacher.id)); const id = made.body.record.id as string;
    expect((await manager.agent.post(`/api/special-activities/${id}/reverse`).set('Origin', testOrigin).send({ requestKey: 'stale', expectedUpdatedAt: '2020-01-01T00:00:00.000Z', reversalReason: 'stale' })).status).toBe(409);
    const reversed = await manager.agent.post(`/api/special-activities/${id}/reverse`).set('Origin', testOrigin).send({ requestKey: 'reverse', expectedUpdatedAt: made.body.record.updatedAt, reversalReason: 'reason' });
    expect(reversed.status).toBe(200); expect((await h.prisma.specialActivityTimeSlot.count({ where: { specialActivityId: id } }))).toBe(1);
    expect((await manager.agent.post(`/api/special-activities/${id}/reverse`).set('Origin', testOrigin).send({ requestKey: 'reverse', expectedUpdatedAt: made.body.record.updatedAt, reversalReason: 'reason' })).body.outcome).toBe('IDEMPOTENT_REPLAY');
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.alternateTeacher.id, { replacesId: id }))).status).toBe(201);
  });

  it('G activity/activity treats touching canonical slot boundaries as non-overlapping', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }] }); const f = await fixture(manager.id);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.activityTeacher.id))).status).toBe(201);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.alternateTeacher.id, { exactTimeSlotDefinitionIds: [f.slotA.id] }))).status).toBe(409);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.alternateTeacher.id, { exactTimeSlotDefinitionIds: [f.slotB.id] }))).status).toBe(201);
  });

  it('H1 rejects an ACTIVE make-up for the same class at an overlapping real interval', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }] }); const f = await fixture(manager.id);
    await createMakeup(f, f.entryA, f.activityTeacher.id, f.staffSubjectA.id, f.slotA.id);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.alternateTeacher.id))).status).toBe(409);
  });

  it('H2 rejects an ACTIVE make-up for another class when the scheduled teacher overlaps', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }] }); const f = await fixture(manager.id);
    await createMakeup(f, f.entryB, f.activityTeacher.id, f.staffSubjectB.id, f.slotA.id);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.activityTeacher.id))).status).toBe(409);
  });

  it('I1 rejects a disposition created after an activity suppresses the same normal opportunity', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }, { capabilityKey: 'TEACHING_OPERATION_MANAGE' }] }); const f = await fixture(manager.id);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.alternateTeacher.id))).status).toBe(201);
    expect((await createDisposition(manager, f.entryA.id)).status).toBe(409);
  });

  it('I2 rejects an activity created after a disposition owns the same normal opportunity', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }, { capabilityKey: 'TEACHING_OPERATION_MANAGE' }] }); const f = await fixture(manager.id);
    expect((await createDisposition(manager, f.entryA.id)).status).toBe(201);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.alternateTeacher.id))).status).toBe(409);
  });

  it('I3 rejects activity staffing occupied by an ACTIVE substitution/supervision in another class', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }, { capabilityKey: 'TEACHING_OPERATION_MANAGE' }] }); const f = await fixture(manager.id);
    expect((await createDisposition(manager, f.entryB.id, { dispositionType: 'DIFFERENT_SUBJECT_SUPERVISION', assignedTeacherUserId: f.activityTeacher.id })).status).toBe(201);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.activityTeacher.id))).status).toBe(409);
  });

  it('I4 releases the original responsible teacher base occupancy after an ACTIVE disposition', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }, { capabilityKey: 'TEACHING_OPERATION_MANAGE' }] }); const f = await fixture(manager.id);
    expect((await createDisposition(manager, f.entryB.id)).status).toBe(201);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.responsibleB.id))).status).toBe(201);
  });

  it('I5 I6 blocks activity-first disposition assignment and excludes reversed activity', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }, { capabilityKey: 'TEACHING_OPERATION_MANAGE' }] }); const f = await fixture(manager.id);
    const activity = await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.activityTeacher.id));
    expect(activity.status).toBe(201);
    const dispositionPatch = { dispositionType: 'DIFFERENT_SUBJECT_SUPERVISION', assignedTeacherUserId: f.activityTeacher.id };
    expect((await createDisposition(manager, f.entryB.id, dispositionPatch)).status).toBe(409);
    expect((await manager.agent.post(`/api/special-activities/${activity.body.record.id}/reverse`).set('Origin', testOrigin).send({ requestKey: crypto.randomUUID(), expectedUpdatedAt: activity.body.record.updatedAt, reversalReason: 'Release teacher' })).status).toBe(200);
    expect((await createDisposition(manager, f.entryB.id, dispositionPatch)).status).toBe(201);
  });

  it('J1 allows explicit activity on a target class ordinary normal lesson', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }] }); const f = await fixture(manager.id);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.alternateTeacher.id))).status).toBe(201);
  });

  it('J2 allows the exact target base opportunity responsible teacher to staff the activity', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }] }); const f = await fixture(manager.id);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.responsibleA.id))).status).toBe(201);
  });

  it('J3 rejects a teacher with effective normal occupancy in another overlapping class', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }] }); const f = await fixture(manager.id);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.responsibleB.id))).status).toBe(409);
  });

  it('J4 permits explicit SpecialActivity during an applicable CalendarInterruption', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }] }); const f = await fixture(manager.id);
    await h.prisma.calendarInterruption.create({ data: { calendarVersionId: f.calendar.id, code: normalizedCode('INT'), name: 'Interruption', startDate: new Date(`${civilDate}T00:00:00.000Z`), endDate: new Date(`${civilDate}T00:00:00.000Z`) } });
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.alternateTeacher.id))).status).toBe(201);
  });

  it('J5 permits explicit SpecialActivity during an applicable ACTIVE CalendarException', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }, { capabilityKey: 'CALENDAR_EXCEPTION_MANAGE' }] }); const f = await fixture(manager.id);
    expect((await createException(manager, f, f.activeA.id, f.slotA.id)).status).toBe(201);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.alternateTeacher.id))).status).toBe(201);
  });

  it('J6 ignores another-class normal teacher occupancy suppressed by CalendarInterruption', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }] }); const f = await fixture(manager.id);
    await h.prisma.calendarInterruption.create({ data: { calendarVersionId: f.calendar.id, code: normalizedCode('INT'), name: 'Interruption', startDate: new Date(`${civilDate}T00:00:00.000Z`), endDate: new Date(`${civilDate}T00:00:00.000Z`) } });
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.responsibleB.id))).status).toBe(201);
  });

  it('J7 ignores another-class normal teacher occupancy suppressed by ACTIVE CalendarException', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }, { capabilityKey: 'CALENDAR_EXCEPTION_MANAGE' }] }); const f = await fixture(manager.id);
    expect((await createException(manager, f, f.activeB.id, f.slotA.id)).status).toBe(201);
    expect((await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.responsibleB.id))).status).toBe(201);
  });

  it('J8 allows a compatible CalendarException after activity and retains the readable ACTIVE activity', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }, { capabilityKey: 'CALENDAR_EXCEPTION_MANAGE' }] }); const f = await fixture(manager.id);
    const activity = await manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(payload(f, f.alternateTeacher.id)); expect(activity.status).toBe(201);
    expect((await createException(manager, f, f.activeA.id, f.slotA.id)).status).toBe(201);
    const readable = await manager.agent.get(`/api/special-activities/${activity.body.record.id}`);
    expect(readable.status).toBe(200); expect(readable.body).toMatchObject({ id: activity.body.record.id, status: 'ACTIVE' });
  });

  it('K dispatches real concurrent SERIALIZABLE commands and asserts one survivor/audit', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }] }); const f = await fixture(manager.id);
    const a = payload(f, f.activityTeacher.id, { requestKey: 'concurrent-a' }); const b = payload(f, f.activityTeacher.id, { requestKey: 'concurrent-b' });
    const [one, two] = await Promise.all([manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(a), manager.agent.post('/api/special-activities').set('Origin', testOrigin).send(b)]);
    expect([one.status, two.status].sort()).toEqual([201, 409]);
    expect(await h.prisma.specialActivity.findMany({ where: { academicYearId: f.year.id, status: 'ACTIVE' } })).toHaveLength(1);
    expect(await h.prisma.auditEvent.count({ where: { action: 'SPECIAL_ACTIVITY_CREATED', result: 'SUCCESS' } })).toBe(1);
  });
});
