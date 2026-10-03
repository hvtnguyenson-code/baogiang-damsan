import { CatalogStatus, OperationalLessonDispositionType, OperationalOverlayStatus, TeachingExecutionStatus, TimeSlotSession, UserStatus } from '@prisma/client';
import { OVERLAY_CLOCK } from '../../src/operational-overlays/operational-overlay-policy';
import { integration, normalizedCode, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

const fixedNow = new Date('2026-09-08T08:00:00.000Z');
const fixedClock = {
  now: () => new Date(fixedNow.getTime()),
};

integration('P3-031 MakeupTeachingSchedule control plane (PostgreSQL)', () => {
  const h = new Phase01Harness();

  async function clean(): Promise<void> {
    await h.prisma.curricularTeachingExecution.deleteMany();
    await h.prisma.makeupTeachingSchedule.deleteMany();
    await h.prisma.operationalLessonDisposition.deleteMany();
    await h.prisma.calendarExceptionTimeSlot.deleteMany();
    await h.prisma.calendarException.deleteMany();
    await h.prisma.ppctClassAssociation.deleteMany();
    await h.prisma.ppctItemRevision.deleteMany();
    await h.prisma.ppctItem.deleteMany();
    await h.prisma.ppctVersion.deleteMany();
    await h.prisma.ppctPlan.deleteMany();
    await h.clean();
  }

  beforeAll(async () => h.start([
    { token: OVERLAY_CLOCK, value: fixedClock },
  ]));

  afterAll(async () => {
    try { await clean(); } finally { await h.stop(); }
  });

  beforeEach(async () => {
    await clean();
    await h.seedCapabilities([
      { key: 'CALENDAR_EXCEPTION_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'TEACHING_OPERATION_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
      { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'TEACHING_EXECUTION_RECORD', scopes: ['PERSONAL'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
  });

  async function fixture(creatorUserId: string) {
    const year = await h.prisma.academicYear.create({
      data: { code: normalizedCode('Y'), name: '2026-2027' },
    });

    const calendar = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date('2026-09-01T00:00:00Z'),
        endDate: new Date('2027-05-31T00:00:00Z'),
        officialWeekCount: 35,
        reserveWeekCount: 1,
        teachingWeekdays: ['MONDAY', 'TUESDAY'],
        isActive: true,
        activatedAt: new Date(),
      },
    });

    const week = await h.prisma.academicWeek.create({
      data: {
        calendarVersionId: calendar.id,
        kind: 'OFFICIAL',
        officialWeekNumber: 1,
        displayLabel: 'Tuần 1',
        sortOrder: 1,
      },
    });

    await h.prisma.academicWeekSegment.create({
      data: {
        academicWeekId: week.id,
        calendarVersionId: calendar.id,
        label: 'W1',
        segmentOrder: 1,
        startDate: new Date('2026-09-01T00:00:00Z'),
        endDate: new Date('2026-09-07T00:00:00Z'),
      },
    });

    const week2 = await h.prisma.academicWeek.create({
      data: {
        calendarVersionId: calendar.id,
        kind: 'OFFICIAL',
        officialWeekNumber: 2,
        displayLabel: 'Tuần 2',
        sortOrder: 2,
      },
    });

    await h.prisma.academicWeekSegment.create({
      data: {
        academicWeekId: week2.id,
        calendarVersionId: calendar.id,
        label: 'W2',
        segmentOrder: 2,
        startDate: new Date('2026-09-08T00:00:00Z'),
        endDate: new Date('2026-09-14T00:00:00Z'),
      },
    });

    const week3 = await h.prisma.academicWeek.create({
      data: {
        calendarVersionId: calendar.id,
        kind: 'OFFICIAL',
        officialWeekNumber: 3,
        displayLabel: 'Tuần 3',
        sortOrder: 3,
      },
    });

    const segment3 = await h.prisma.academicWeekSegment.create({
      data: {
        academicWeekId: week3.id,
        calendarVersionId: calendar.id,
        label: 'W3',
        segmentOrder: 3,
        startDate: new Date('2026-09-15T00:00:00Z'),
        endDate: new Date('2026-09-21T00:00:00Z'),
      },
    });

    const schoolClass = await h.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: normalizedCode('C'),
        name: '10A1',
        gradeLevel: 10,
        status: CatalogStatus.ACTIVE,
      },
    });

    const subject = await h.prisma.subject.create({
      data: { code: normalizedCode('S'), name: 'Toán học', status: CatalogStatus.ACTIVE },
    });

    const teacher = await h.prisma.user.create({
      data: {
        username: `teacher-${crypto.randomUUID().slice(0, 8)}`,
        passwordHash: await h.passwords.hash('TeacherPassword9'),
        status: UserStatus.ACTIVE,
        profile: { create: { displayName: 'Thầy Giáo Viên', isTeachingStaff: true } },
      },
    });

    const substituteTeacher = await h.prisma.user.create({
      data: {
        username: `substitute-${crypto.randomUUID().slice(0, 8)}`,
        passwordHash: await h.passwords.hash('TeacherPassword9'),
        status: UserStatus.ACTIVE,
        profile: { create: { displayName: 'Cô Thay Thế', isTeachingStaff: true } },
      },
    });

    const assignment = await h.prisma.teachingAssignment.create({
      data: {
        academicYearId: year.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teacherUserId: teacher.id,
        validFrom: new Date('2026-09-01T00:00:00Z'),
        validUntil: new Date('2027-05-31T00:00:00Z'),
      },
    });

    const staffSubject1 = await h.prisma.staffSubject.create({
      data: {
        userId: teacher.id,
        subjectId: subject.id,
        validFrom: new Date('2026-09-01T00:00:00Z'),
        isPrimary: true,
      },
    });

    const staffSubject2 = await h.prisma.staffSubject.create({
      data: {
        userId: substituteTeacher.id,
        subjectId: subject.id,
        validFrom: new Date('2026-09-01T00:00:00Z'),
        isPrimary: true,
      },
    });

    const sourceSlot = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: TimeSlotSession.MORNING,
        ordinal: 1,
        revision: 1,
        displayLabel: 'Tiết 1',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        isActive: true,
        allowRegularTeaching: true,
        allowMakeupTeaching: false,
      },
    });

    const targetSlot = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'TUESDAY',
        session: TimeSlotSession.AFTERNOON,
        ordinal: 1,
        revision: 1,
        displayLabel: 'Tiết 1 Chiều',
        startTime: new Date('1970-01-01T14:00:00Z'),
        endTime: new Date('1970-01-01T14:45:00Z'),
        isActive: true,
        allowRegularTeaching: false,
        allowMakeupTeaching: true,
      },
    });

    const lifecycleAt = new Date('2026-08-15T00:00:00.000Z');
    const timetable = await h.prisma.timetableVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        status: 'ACTIVE',
        calendarVersionId: calendar.id,
        effectiveAcademicWeekId: week.id,
        effectiveFrom: new Date('2026-09-01T00:00:00Z'),
        createdByUserId: creatorUserId,
        validatedByUserId: creatorUserId,
        validatedAt: lifecycleAt,
        approvedByUserId: creatorUserId,
        approvedAt: lifecycleAt,
        activatedByUserId: creatorUserId,
        activatedAt: lifecycleAt,
      },
    });

    const timetableEntry = await h.prisma.timetableEntry.create({
      data: {
        timetableVersionId: timetable.id,
        academicYearId: year.id,
        weekday: 'MONDAY',
        timeSlotDefinitionId: sourceSlot.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teachingAssignmentId: assignment.id,
        teacherUserId: teacher.id,
      },
    });

    const plan = await h.prisma.ppctPlan.create({
      data: { academicYearId: year.id, subjectId: subject.id, gradeLevel: 10 },
    });

    const ppctVersion = await h.prisma.ppctVersion.create({
      data: {
        ppctPlanId: plan.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        createdByUserId: creatorUserId,
        publishedByUserId: creatorUserId,
        publishedAt: lifecycleAt,
      },
    });

    const ppctItem = await h.prisma.ppctItem.create({
      data: { ppctPlanId: plan.id, component: 'CORE' },
    });

    const ppctItemRevision = await h.prisma.ppctItemRevision.create({
      data: {
        ppctVersionId: ppctVersion.id,
        ppctPlanId: plan.id,
        ppctItemId: ppctItem.id,
        component: 'CORE',
        sequence: 1,
        title: 'Bài 1: Mệnh đề',
        lessonType: 'LESSON',
      },
    });

    const ppctAssociation = await h.prisma.ppctClassAssociation.create({
      data: {
        academicYearId: year.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        gradeLevel: 10,
        ppctPlanId: plan.id,
        ppctVersionId: ppctVersion.id,
        curricularProfile: 'CORE_ONLY',
        effectiveFrom: new Date('2026-09-01T00:00:00Z'),
        createdByUserId: creatorUserId,
      },
    });

    // Operational start policy
    const stream = await h.prisma.businessPolicyStream.create({
      data: {
        familyKey: 'OPERATIONAL_START',
        resourceKind: 'ACADEMIC_YEAR',
        academicYearId: year.id,
      },
    });
    await h.prisma.businessPolicyVersion.create({
      data: {
        streamId: stream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: { operationalStartDate: '2026-09-01' },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-09-01T00:00:00Z'),
        effectiveUntil: null,
        publishedAt: new Date('2026-09-01T00:00:00Z'),
        publishedByUserId: creatorUserId,
        createdByUserId: creatorUserId,
      },
    });

    // Source disposition on 2026-09-07 (Monday)
    const sourceDisposition = await h.prisma.operationalLessonDisposition.create({
      data: {
        academicYearId: year.id,
        timetableVersionId: timetable.id,
        timetableEntryId: timetableEntry.id,
        sourceCivilDate: new Date('2026-09-07T00:00:00Z'),
        academicCalendarVersionId: calendar.id,
        timeSlotDefinitionId: sourceSlot.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teachingAssignmentId: assignment.id,
        responsibleTeacherUserId: teacher.id,
        dispositionType: OperationalLessonDispositionType.ABSENCE_NO_REPLACEMENT,
        status: OperationalOverlayStatus.ACTIVE,
        createRequestKey: 'disp-create-1',
        createRequestFingerprint: 'disp-fp-1',
        createdByUserId: creatorUserId,
      },
    });

    const sourceNormalOccurrenceKey = `NORMAL:${timetableEntry.id}:2026-09-07`;

    return {
      year,
      calendar,
      schoolClass,
      subject,
      teacher,
      substituteTeacher,
      assignment,
      staffSubject1,
      staffSubject2,
      sourceSlot,
      targetSlot,
      timetable,
      timetableEntry,
      plan,
      ppctVersion,
      ppctItem,
      ppctItemRevision,
      ppctAssociation,
      sourceDisposition,
      sourceNormalOccurrenceKey,
      week3,
      segment3,
    };
  }

  it('covers full P3-031 make-up scheduling PostgreSQL lifecycle and constraints', async () => {
    const manager = await h.actor({
      grants: [{ capabilityKey: 'TEACHING_OPERATION_MANAGE', scopeType: 'SCHOOL_WIDE' }],
    });
    const f = await fixture(manager.id);

    // 1 & 2 & 3. POST contract with canonical sourceNormalOccurrenceKey, no PPCT coords, derives PPCT/sourceDisposition authority
    const createPayload = {
      academicYearId: f.year.id,
      sourceNormalOccurrenceKey: f.sourceNormalOccurrenceKey,
      targetCivilDate: '2026-09-15', // Tuesday of Week 3
      targetTimeSlotDefinitionId: f.targetSlot.id,
      scheduledTeacherUserId: f.substituteTeacher.id,
      note: 'Dạy bù cho tiết ngày 07/09',
      requestKey: 'makeup-create-req-1',
    };

    const createRes = await manager.agent
      .post('/api/operational-overlays/makeup-schedules')
      .set('Origin', testOrigin)
      .send(createPayload);

    expect(createRes.status).toBe(201);
    expect(createRes.body.outcome).toBe('CREATED');
    const scheduleId = createRes.body.record.id as string;

    // Check DB record
    const persisted = await h.prisma.makeupTeachingSchedule.findUniqueOrThrow({
      where: { id: scheduleId },
    });
    expect(persisted.status).toBe('ACTIVE');
    expect(persisted.sourceDispositionId).toBe(f.sourceDisposition.id);
    expect(persisted.ppctItemId).toBe(f.ppctItem.id);
    expect(persisted.scheduledTeacherUserId).toBe(f.substituteTeacher.id);
    expect(persisted.eligibilitySameSubject).toBe(true);

    // 12. Ensure NO CurricularTeachingExecution was created by schedule creation
    const executionCount = await h.prisma.curricularTeachingExecution.count({
      where: { academicYearId: f.year.id },
    });
    expect(executionCount).toBe(0);

    // 5. Request-key idempotent replay
    const replayRes = await manager.agent
      .post('/api/operational-overlays/makeup-schedules')
      .set('Origin', testOrigin)
      .send(createPayload);
    expect(replayRes.status).toBe(201);
    expect(replayRes.body.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(replayRes.body.record.id).toBe(scheduleId);

    // 4 & 10. Duplicate ACTIVE obligation cannot be committed (and retained DB partial unique invariant participates)
    const dupRes = await manager.agent
      .post('/api/operational-overlays/makeup-schedules')
      .set('Origin', testOrigin)
      .send({
        ...createPayload,
        requestKey: 'makeup-create-dup-key',
      });
    expect(dupRes.status).toBe(409);

    // 8. ACTIVE make-up blocks source disposition reversal
    const dispReverseRes = await manager.agent
      .post(`/api/operational-overlays/lesson-dispositions/${f.sourceDisposition.id}/reverse`)
      .set('Origin', testOrigin)
      .send({
        requestKey: 'disp-rev-req-1',
        expectedUpdatedAt: f.sourceDisposition.updatedAt.toISOString(),
        reversalReason: 'Thử hủy disposition có make-up',
      });
    expect(dispReverseRes.status).toBe(409);

    // 6. Reverse with CAS
    // Stale CAS fails
    const staleRevRes = await manager.agent
      .post(`/api/operational-overlays/makeup-schedules/${scheduleId}/reverse`)
      .set('Origin', testOrigin)
      .send({
        requestKey: 'makeup-rev-stale',
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
        reversalReason: 'CAS stale',
      });
    expect(staleRevRes.status).toBe(409);

    // Successful reversal
    const reverseRes = await manager.agent
      .post(`/api/operational-overlays/makeup-schedules/${scheduleId}/reverse`)
      .set('Origin', testOrigin)
      .send({
        requestKey: 'makeup-rev-1',
        expectedUpdatedAt: persisted.updatedAt.toISOString(),
        reversalReason: 'Đổi lịch dạy bù khác',
      });
    expect(reverseRes.status).toBe(200);
    expect(reverseRes.body.outcome).toBe('REVERSED');

    const reversedRecord = await h.prisma.makeupTeachingSchedule.findUniqueOrThrow({
      where: { id: scheduleId },
    });
    expect(reversedRecord.status).toBe('REVERSED');
    expect(reversedRecord.reversalReason).toBe('Đổi lịch dạy bù khác');

    // 9. Reverse then replacement lifecycle
    // Create a new target slot on Tuesday afternoon slot 2
    const targetSlot2 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: f.year.id,
        weekday: 'TUESDAY',
        session: TimeSlotSession.AFTERNOON,
        ordinal: 2,
        revision: 1,
        displayLabel: 'Tiết 2 Chiều',
        startTime: new Date('1970-01-01T15:00:00Z'),
        endTime: new Date('1970-01-01T15:45:00Z'),
        isActive: true,
        allowRegularTeaching: false,
        allowMakeupTeaching: true,
      },
    });

    const replacementPayload = {
      academicYearId: f.year.id,
      sourceNormalOccurrenceKey: f.sourceNormalOccurrenceKey,
      targetCivilDate: '2026-09-15',
      targetTimeSlotDefinitionId: targetSlot2.id,
      scheduledTeacherUserId: f.teacher.id,
      replacesId: scheduleId,
      note: 'Thay thế lịch dạy bù trước đó',
      requestKey: 'makeup-replacement-key-1',
    };

    const replaceRes = await manager.agent
      .post('/api/operational-overlays/makeup-schedules')
      .set('Origin', testOrigin)
      .send(replacementPayload);
    expect(replaceRes.status).toBe(201);
    expect(replaceRes.body.outcome).toBe('CREATED');
    const replacementId = replaceRes.body.record.id as string;

    const replacementPersisted = await h.prisma.makeupTeachingSchedule.findUniqueOrThrow({
      where: { id: replacementId },
    });
    expect(replacementPersisted.replacesId).toBe(scheduleId);
    expect(replacementPersisted.status).toBe('ACTIVE');

    // 7. ACTIVE MAKEUP execution blocks schedule reversal
    // Create a mock CurricularTeachingExecution referencing this schedule
    await h.prisma.curricularTeachingExecution.create({
      data: {
        kind: 'MAKEUP',
        status: TeachingExecutionStatus.ACTIVE,
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        sourceNormalOccurrenceKey: f.sourceNormalOccurrenceKey,
        originalTimetableVersionId: f.timetable.id,
        originalTimetableEntryId: f.timetableEntry.id,
        sourceCivilDate: new Date('2026-09-07T00:00:00Z'),
        sourceAcademicCalendarVersionId: f.calendar.id,
        sourceTimeSlotDefinitionId: f.sourceSlot.id,
        originalTeachingAssignmentId: f.assignment.id,
        responsibleTeacherUserId: f.teacher.id,
        ppctClassAssociationId: f.ppctAssociation.id,
        ppctPlanId: f.plan.id,
        ppctVersionId: f.ppctVersion.id,
        ppctItemId: f.ppctItem.id,
        ppctItemRevisionId: f.ppctItemRevision.id,
        operationalLessonDispositionId: f.sourceDisposition.id,
        operationalDispositionType: OperationalLessonDispositionType.ABSENCE_NO_REPLACEMENT,
        makeupTeachingScheduleId: replacementId,
        executionCivilDate: new Date('2026-09-15T00:00:00Z'),
        executionAcademicCalendarVersionId: f.calendar.id,
        executionTimeSlotDefinitionId: targetSlot2.id,
        executionAcademicWeekId: f.week3.id,
        executionAcademicWeekSegmentId: f.segment3.id,
        actualTeacherUserId: f.teacher.id,
        schoolClassCodeSnapshot: f.schoolClass.code,
        schoolClassNameSnapshot: f.schoolClass.name,
        subjectCodeSnapshot: f.subject.code,
        subjectNameSnapshot: f.subject.name,
        responsibleTeacherDisplayNameSnapshot: 'Thầy Giáo Viên',
        actualTeacherDisplayNameSnapshot: 'Thầy Giáo Viên',
        createRequestKey: 'exec-makeup-key-1',
        createRequestFingerprint: 'exec-fp-1',
        createdByUserId: manager.id,
      },
    });

    const blockRevRes = await manager.agent
      .post(`/api/operational-overlays/makeup-schedules/${replacementId}/reverse`)
      .set('Origin', testOrigin)
      .send({
        requestKey: 'makeup-rev-blocked-key',
        expectedUpdatedAt: replacementPersisted.updatedAt.toISOString(),
        reversalReason: 'Thử hủy khi đã có execution',
      });
    expect(blockRevRes.status).toBe(409);
  });

  it('11. enforces representative canonical occupancy collision using resolved/effective semantics', async () => {
    const manager = await h.actor({
      grants: [{ capabilityKey: 'TEACHING_OPERATION_MANAGE', scopeType: 'SCHOOL_WIDE' }],
    });
    const f = await fixture(manager.id);

    // Create an active make-up schedule at targetSlot on Tuesday 2026-09-15
    const createPayload = {
      academicYearId: f.year.id,
      sourceNormalOccurrenceKey: f.sourceNormalOccurrenceKey,
      targetCivilDate: '2026-09-15',
      targetTimeSlotDefinitionId: f.targetSlot.id,
      scheduledTeacherUserId: f.substituteTeacher.id,
      note: 'Lịch 1',
      requestKey: 'collision-test-key-1',
    };
    const res1 = await manager.agent
      .post('/api/operational-overlays/makeup-schedules')
      .set('Origin', testOrigin)
      .send(createPayload);
    expect(res1.status).toBe(201);

    // Now attempt another schedule for a different source debt but same teacher & target slot & date
    // Create another class & disposition to give substituteTeacher another debt
    const class2 = await h.prisma.schoolClass.create({
      data: { academicYearId: f.year.id, code: normalizedCode('C2'), name: '10A2', gradeLevel: 10 },
    });
    const assign2 = await h.prisma.teachingAssignment.create({
      data: {
        academicYearId: f.year.id,
        schoolClassId: class2.id,
        subjectId: f.subject.id,
        teacherUserId: f.substituteTeacher.id,
        validFrom: new Date('2026-09-01T00:00:00Z'),
      },
    });
    const entry2 = await h.prisma.timetableEntry.create({
      data: {
        timetableVersionId: f.timetable.id,
        academicYearId: f.year.id,
        weekday: 'MONDAY',
        timeSlotDefinitionId: f.sourceSlot.id,
        schoolClassId: class2.id,
        subjectId: f.subject.id,
        teachingAssignmentId: assign2.id,
        teacherUserId: f.substituteTeacher.id,
      },
    });
    await h.prisma.ppctClassAssociation.create({
      data: {
        academicYearId: f.year.id,
        schoolClassId: class2.id,
        subjectId: f.subject.id,
        gradeLevel: 10,
        ppctPlanId: f.plan.id,
        ppctVersionId: f.ppctVersion.id,
        curricularProfile: 'CORE_ONLY',
        effectiveFrom: new Date('2026-09-01T00:00:00Z'),
        createdByUserId: manager.id,
      },
    });
    await h.prisma.operationalLessonDisposition.create({
      data: {
        academicYearId: f.year.id,
        timetableVersionId: f.timetable.id,
        timetableEntryId: entry2.id,
        sourceCivilDate: new Date('2026-09-07T00:00:00Z'),
        academicCalendarVersionId: f.calendar.id,
        timeSlotDefinitionId: f.sourceSlot.id,
        schoolClassId: class2.id,
        subjectId: f.subject.id,
        teachingAssignmentId: assign2.id,
        responsibleTeacherUserId: f.substituteTeacher.id,
        dispositionType: OperationalLessonDispositionType.ABSENCE_NO_REPLACEMENT,
        status: OperationalOverlayStatus.ACTIVE,
        createRequestKey: 'disp-create-2',
        createRequestFingerprint: 'disp-fp-2',
        createdByUserId: manager.id,
      },
    });

    const collisionPayload = {
      academicYearId: f.year.id,
      sourceNormalOccurrenceKey: `NORMAL:${entry2.id}:2026-09-07`,
      targetCivilDate: '2026-09-15',
      targetTimeSlotDefinitionId: f.targetSlot.id, // SAME slot and date
      scheduledTeacherUserId: f.substituteTeacher.id, // SAME teacher
      note: 'Lịch 2 va chạm',
      requestKey: 'collision-test-key-2',
    };

    const res2 = await manager.agent
      .post('/api/operational-overlays/makeup-schedules')
      .set('Origin', testOrigin)
      .send(collisionPayload);

    // Collision should be detected via canonical occupancy semantics and rejected with 409
    expect(res2.status).toBe(409);
    expect(res2.body.message).toMatch(/giáo viên|lịch dạy bù|occup/i);
  });
});
