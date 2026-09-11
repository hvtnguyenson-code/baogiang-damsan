import { CatalogStatus, OperationalLessonDispositionType, PpctClassCurricularProfile, PpctCurricularComponent, PpctVersionStatus } from '@prisma/client';
import { ProgressDebtService } from '../../src/progress-debt/progress-debt.service';
import { TEACHING_PROGRESS_DEBT_PROFILE_V2 } from '../../src/progress-debt/progress-debt.types';
import { integration, normalizedCode, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

const MONDAY_DATE = '2026-08-10';
const TUESDAY_DATE = '2026-08-11';
const MAKEUP_DATE = '2026-08-12';
const MONDAY_AS_OF = new Date('2026-08-10T08:00:00.000Z');
const TUESDAY_AS_OF = new Date('2026-08-11T08:00:00.000Z');
const MAKEUP_AS_OF = new Date('2026-08-12T08:00:00.000Z');

integration('Progress/debt projection V2 (PostgreSQL)', () => {
  const h = new Phase01Harness();
  beforeAll(async () => h.start());
  afterAll(async () => { try { await clean(); } finally { await h.stop(); } });
  beforeEach(async () => clean());

  async function clean() {
    await h.prisma.specialActivityParticipationExecution.deleteMany();
    await h.prisma.curricularTeachingExecution.deleteMany();
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

  async function fixture(profile: PpctClassCurricularProfile = PpctClassCurricularProfile.CORE_PLUS_SPECIALIZED_STUDY) {
    const lifecycleAt = new Date('2026-08-01T00:00:00.000Z');
    await h.seedCapabilities([{ key: 'TEACHING_EXECUTION_RECORD', scopes: ['PERSONAL'] }]);
    const actor = await h.actor({ grants: [{ capabilityKey: 'TEACHING_EXECUTION_RECORD', scopeType: 'PERSONAL' }] });
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('PROG2'), name: 'Progress V2 year' } });
    const calendar = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date('2026-08-01Z'),
        endDate: new Date('2027-05-31Z'),
        officialWeekCount: 35,
        reserveWeekCount: 1,
        teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY'],
        isActive: true,
        activatedAt: lifecycleAt,
      },
    });
    const week = await h.prisma.academicWeek.create({
      data: { calendarVersionId: calendar.id, kind: 'OFFICIAL', officialWeekNumber: 1, displayLabel: 'Week 1', sortOrder: 1 },
    });
    const segment = await h.prisma.academicWeekSegment.create({
      data: { academicWeekId: week.id, calendarVersionId: calendar.id, label: 'Week 1', segmentOrder: 1, startDate: new Date('2026-08-10T00:00:00Z'), endDate: new Date('2026-08-16T23:59:59Z') },
    });
    const schoolClass = await h.prisma.schoolClass.create({
      data: { academicYearId: year.id, code: normalizedCode('C'), name: '10A', gradeLevel: 10, status: CatalogStatus.ACTIVE },
    });
    const subject = await h.prisma.subject.create({
      data: { code: normalizedCode('S'), name: 'Subject', status: CatalogStatus.ACTIVE },
    });
    const slot1 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Monday Slot',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        allowRegularTeaching: true,
        allowMakeupTeaching: true,
      },
    });
    const slot2 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'TUESDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Tuesday Slot',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        allowRegularTeaching: true,
        allowMakeupTeaching: true,
      },
    });
    const makeupSlot = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'WEDNESDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Wednesday Makeup',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        allowRegularTeaching: false,
        allowMakeupTeaching: true,
      },
    });
    const assignment = await h.prisma.teachingAssignment.create({
      data: { academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: actor.id, validFrom: new Date('2026-08-01Z') },
    });
    const timetable = await h.prisma.timetableVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        status: 'ACTIVE',
        calendarVersionId: calendar.id,
        effectiveAcademicWeekId: week.id,
        effectiveFrom: new Date(`${MONDAY_DATE}Z`),
        createdByUserId: actor.id,
        validatedByUserId: actor.id,
        validatedAt: lifecycleAt,
        approvedByUserId: actor.id,
        approvedAt: lifecycleAt,
        activatedByUserId: actor.id,
        activatedAt: lifecycleAt,
      },
    });
    const entry1 = await h.prisma.timetableEntry.create({
      data: { timetableVersionId: timetable.id, academicYearId: year.id, weekday: 'MONDAY', timeSlotDefinitionId: slot1.id, schoolClassId: schoolClass.id, subjectId: subject.id, teachingAssignmentId: assignment.id, teacherUserId: actor.id },
    });
    const entry2 = await h.prisma.timetableEntry.create({
      data: { timetableVersionId: timetable.id, academicYearId: year.id, weekday: 'TUESDAY', timeSlotDefinitionId: slot2.id, schoolClassId: schoolClass.id, subjectId: subject.id, teachingAssignmentId: assignment.id, teacherUserId: actor.id },
    });

    const plan = await h.prisma.ppctPlan.create({
      data: { academicYearId: year.id, subjectId: subject.id, gradeLevel: 10 },
    });
    const version = await h.prisma.ppctVersion.create({
      data: { ppctPlanId: plan.id, versionNumber: 1, status: PpctVersionStatus.PUBLISHED, createdByUserId: actor.id, publishedByUserId: actor.id, publishedAt: lifecycleAt },
    });

    // 2 CORE items, 2 SPECIALIZED_STUDY items
    const coreItem1 = await h.prisma.ppctItem.create({ data: { ppctPlanId: plan.id, component: PpctCurricularComponent.CORE } });
    await h.prisma.ppctItemRevision.create({ data: { ppctVersionId: version.id, ppctPlanId: plan.id, ppctItemId: coreItem1.id, component: PpctCurricularComponent.CORE, sequence: 1, title: 'Core Lesson 1', lessonType: 'LESSON' } });
    const coreItem2 = await h.prisma.ppctItem.create({ data: { ppctPlanId: plan.id, component: PpctCurricularComponent.CORE } });
    await h.prisma.ppctItemRevision.create({ data: { ppctVersionId: version.id, ppctPlanId: plan.id, ppctItemId: coreItem2.id, component: PpctCurricularComponent.CORE, sequence: 2, title: 'Core Lesson 2', lessonType: 'LESSON' } });

    const specItem1 = await h.prisma.ppctItem.create({ data: { ppctPlanId: plan.id, component: PpctCurricularComponent.SPECIALIZED_STUDY } });
    await h.prisma.ppctItemRevision.create({ data: { ppctVersionId: version.id, ppctPlanId: plan.id, ppctItemId: specItem1.id, component: PpctCurricularComponent.SPECIALIZED_STUDY, sequence: 1, title: 'Spec Lesson 1', lessonType: 'LESSON' } });
    const specItem2 = await h.prisma.ppctItem.create({ data: { ppctPlanId: plan.id, component: PpctCurricularComponent.SPECIALIZED_STUDY } });
    await h.prisma.ppctItemRevision.create({ data: { ppctVersionId: version.id, ppctPlanId: plan.id, ppctItemId: specItem2.id, component: PpctCurricularComponent.SPECIALIZED_STUDY, sequence: 2, title: 'Spec Lesson 2', lessonType: 'LESSON' } });

    const association = await h.prisma.ppctClassAssociation.create({
      data: {
        academicYearId: year.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        gradeLevel: 10,
        ppctPlanId: plan.id,
        ppctVersionId: version.id,
        curricularProfile: profile,
        effectiveFrom: new Date('2026-08-01Z'),
        createdByUserId: actor.id,
      },
    });

    const staffSubject = await h.prisma.staffSubject.create({
      data: { userId: actor.id, subjectId: subject.id, validFrom: new Date('2026-08-01Z') },
    });

    return {
      actor, year, calendar, week, segment, schoolClass, subject,
      slot1, slot2, makeupSlot, assignment, timetable, entry1, entry2,
      plan, version, coreItem1, coreItem2, specItem1, specItem2,
      association, staffSubject,
      service: h.app.get(ProgressDebtService),
    };
  }

  function resolveV2(f: Awaited<ReturnType<typeof fixture>>, asOfInstant = TUESDAY_AS_OF) {
    return f.service.resolveV2({ academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, asOfInstant });
  }

  it('V2-DB1: CORE_PLUS_SPECIALIZED_STUDY routes chronologically last slot as SPECIALIZED_STUDY', async () => {
    const f = await fixture();
    const result = await resolveV2(f, TUESDAY_AS_OF);
    expect(result.status).toBe('PASS');
    expect(result.profile).toBe(TEACHING_PROGRESS_DEBT_PROFILE_V2);
    expect(result.counts).toMatchObject({
      distributedElapsedCount: 2,
      completedCount: 0,
      openDebtCount: 0,
      unconfirmedGapCount: 2,
    });
    expect(result.items).toHaveLength(2);
    const mondayItem = result.items.find((i) => i.sourceCivilDate === MONDAY_DATE);
    const tuesdayItem = result.items.find((i) => i.sourceCivilDate === TUESDAY_DATE);
    expect(mondayItem?.component).toBe('CORE');
    expect(tuesdayItem?.component).toBe('SPECIALIZED_STUDY');
  });

  it('V2-DB2: CORE_ONLY routes all opportunities to CORE without specialized progress or debt', async () => {
    const f = await fixture(PpctClassCurricularProfile.CORE_ONLY);
    const result = await resolveV2(f, TUESDAY_AS_OF);
    expect(result.status).toBe('PASS');
    expect(result.counts?.distributedElapsedCount).toBe(2);
    expect(result.items.every((i) => i.component === 'CORE')).toBe(true);
  });

  it('V2-DB3: ABSENCE_NO_REPLACEMENT on specialized opportunity creates proven debt with SPECIALIZED_STUDY component', async () => {
    const f = await fixture();
    await h.prisma.operationalLessonDisposition.create({
      data: {
        academicYearId: f.year.id,
        timetableVersionId: f.timetable.id,
        timetableEntryId: f.entry2.id,
        sourceCivilDate: new Date(`${TUESDAY_DATE}Z`),
        academicCalendarVersionId: f.calendar.id,
        timeSlotDefinitionId: f.slot2.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        teachingAssignmentId: f.assignment.id,
        responsibleTeacherUserId: f.actor.id,
        dispositionType: OperationalLessonDispositionType.ABSENCE_NO_REPLACEMENT,
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: f.actor.id,
      },
    });
    const result = await resolveV2(f, TUESDAY_AS_OF);
    expect(result.status).toBe('PASS');
    expect(result.counts).toMatchObject({
      distributedElapsedCount: 2,
      completedCount: 0,
      openDebtCount: 1,
      lateCount: 1,
      unconfirmedGapCount: 1,
    });
    const specDebt = result.items.find((i) => i.classification === 'PROVEN_OPEN_DEBT');
    expect(specDebt?.component).toBe('SPECIALIZED_STUDY');
    expect(specDebt?.sourceCivilDate).toBe(TUESDAY_DATE);
  });

  it('V2-DB4: exact persisted ACTIVE NORMAL execution completes CORE obligation with CORE component', async () => {
    const f = await fixture();
    const coreRev = await h.prisma.ppctItemRevision.findFirstOrThrow({ where: { ppctItemId: f.coreItem1.id } });
    await h.prisma.curricularTeachingExecution.create({
      data: {
        kind: 'NORMAL',
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        sourceNormalOccurrenceKey: `NORMAL:${f.entry1.id}:${MONDAY_DATE}`,
        originalTimetableVersionId: f.timetable.id,
        originalTimetableEntryId: f.entry1.id,
        sourceCivilDate: new Date(`${MONDAY_DATE}Z`),
        sourceAcademicCalendarVersionId: f.calendar.id,
        sourceTimeSlotDefinitionId: f.slot1.id,
        originalTeachingAssignmentId: f.assignment.id,
        responsibleTeacherUserId: f.actor.id,
        ppctClassAssociationId: f.association.id,
        ppctPlanId: f.plan.id,
        ppctVersionId: f.version.id,
        ppctItemId: f.coreItem1.id,
        ppctItemRevisionId: coreRev.id,
        operationalLessonDispositionId: null,
        operationalDispositionType: null,
        executionCivilDate: new Date(`${MONDAY_DATE}Z`),
        executionAcademicCalendarVersionId: f.calendar.id,
        executionTimeSlotDefinitionId: f.slot1.id,
        executionAcademicWeekId: f.week.id,
        executionAcademicWeekSegmentId: f.segment.id,
        actualTeacherUserId: f.actor.id,
        schoolClassCodeSnapshot: f.schoolClass.code,
        schoolClassNameSnapshot: f.schoolClass.name,
        subjectCodeSnapshot: f.subject.code,
        subjectNameSnapshot: f.subject.name,
        responsibleTeacherDisplayNameSnapshot: 'Teacher',
        actualTeacherDisplayNameSnapshot: 'Teacher',
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: f.actor.id,
      },
    });

    const result = await resolveV2(f, MONDAY_AS_OF);
    expect(result.status).toBe('PASS');
    expect(result.counts?.completedCount).toBe(1);
    expect(result.items[0]!.component).toBe('CORE');
    expect(result.items[0]!.classification).toBe('COMPLETED');
  });

  it('V2-DB5: exact persisted ACTIVE MAKEUP completes SPECIALIZED_STUDY obligation preserving component', async () => {
    const f = await fixture();
    // Absence on Tuesday (SPECIALIZED_STUDY)
    await h.prisma.operationalLessonDisposition.create({
      data: {
        academicYearId: f.year.id,
        timetableVersionId: f.timetable.id,
        timetableEntryId: f.entry2.id,
        sourceCivilDate: new Date(`${TUESDAY_DATE}Z`),
        academicCalendarVersionId: f.calendar.id,
        timeSlotDefinitionId: f.slot2.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        teachingAssignmentId: f.assignment.id,
        responsibleTeacherUserId: f.actor.id,
        dispositionType: OperationalLessonDispositionType.ABSENCE_NO_REPLACEMENT,
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: f.actor.id,
      },
    });

    // Create Makeup schedule pointing to Tuesday specialized obligation
    const makeup = await h.prisma.makeupTeachingSchedule.create({
      data: {
        academicYearId: f.year.id,
        originalTimetableVersionId: f.timetable.id,
        originalTimetableEntryId: f.entry2.id,
        originalCivilDate: new Date(`${TUESDAY_DATE}Z`),
        originalAcademicCalendarVersionId: f.calendar.id,
        originalTimeSlotDefinitionId: f.slot2.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        originalTeachingAssignmentId: f.assignment.id,
        responsibleTeacherUserId: f.actor.id,
        ppctClassAssociationId: f.association.id,
        ppctPlanId: f.plan.id,
        ppctVersionId: f.version.id,
        ppctItemId: f.specItem1.id,
        targetCivilDate: new Date(`${MAKEUP_DATE}Z`),
        targetAcademicCalendarVersionId: f.calendar.id,
        targetTimeSlotDefinitionId: f.makeupSlot.id,
        scheduledTeacherUserId: f.actor.id,
        eligibilityCheckedAt: new Date('2026-08-01Z'),
        eligibilityWasActive: true,
        eligibilityWasTeachingStaff: true,
        eligibilitySameSubject: true,
        eligibilityStaffSubjectId: f.staffSubject.id,
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: f.actor.id,
      },
    });

    const response = await f.actor.agent.post('/api/teaching-executions/curricular/makeup').set('Origin', testOrigin).send({
      makeupTeachingScheduleId: makeup.id,
      requestKey: crypto.randomUUID(),
    });
    expect(response.status).toBe(201);

    const result = await resolveV2(f, MAKEUP_AS_OF);
    expect(result.status).toBe('PASS');
    const specItem = result.items.find((i) => i.sourceCivilDate === TUESDAY_DATE);
    expect(specItem?.classification).toBe('COMPLETED');
    expect(specItem?.component).toBe('SPECIALIZED_STUDY');
    expect(specItem?.fulfillmentKind).toBe('MAKEUP');
    expect(result.counts?.openDebtCount).toBe(0);
  });

  it('V2-DB6: projection is strictly read-only and mutates zero rows', async () => {
    const f = await fixture();
    async function readCounts() {
      return Promise.all([
        h.prisma.curricularTeachingExecution.count({ where: { academicYearId: f.year.id } }),
        h.prisma.makeupTeachingSchedule.count({ where: { academicYearId: f.year.id } }),
        h.prisma.operationalLessonDisposition.count({ where: { academicYearId: f.year.id } }),
        h.prisma.ppctClassAssociation.count({ where: { academicYearId: f.year.id } }),
        h.prisma.ppctVersion.count({ where: { ppctPlanId: f.plan.id } }),
        h.prisma.ppctItem.count({ where: { ppctPlanId: f.plan.id } }),
        h.prisma.timetableVersion.count({ where: { academicYearId: f.year.id } }),
        h.prisma.timetableEntry.count({ where: { academicYearId: f.year.id } }),
      ]);
    }
    const before = await readCounts();
    await resolveV2(f, TUESDAY_AS_OF);
    const after = await readCounts();
    expect(after).toEqual(before);
  });
});
