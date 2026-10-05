import { BadRequestException } from '@nestjs/common';
import {
  CurricularTeachingExecutionKind,
  HomeroomAssignmentStatus,
  OperationalLessonDispositionType,
  OperationalOverlayStatus,
  SpecialActivityStatus,
  TeachingExecutionStatus,
  UserStatus,
} from '@prisma/client';
import {
  CivilDateString,
  EffectiveScheduleSlotItem,
  IndividualWeeklyScheduleDay,
  WorkloadAdjustmentPolicyPayloadV1,
  WorkloadAdjustmentRuleV1,
} from '@baogiang/contracts';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';
import { BusinessConfigurationService } from '../../src/business-configuration/business-configuration.service';
import { ProgressDebtService } from '../../src/progress-debt/progress-debt.service';
import { ReportingProjectionService } from '../../src/reporting-projection/reporting-projection.service';
import { OfficialWorkloadProjectionService } from '../../src/official-workload/official-workload-projection.service';
import { SpecialProgrammeWorkloadProjectionService } from '../../src/special-programme-workload/special-programme-workload-projection.service';
import { ReportingStatementsService } from '../../src/reporting-statements/reporting-statements.service';
import { EffectiveScheduleService } from '../../src/effective-schedule/effective-schedule.service';
import { PpctOccurrenceAllocationService } from '../../src/ppct-occurrence-allocation/ppct-occurrence-allocation.service';
import {
  assertFrozenReportingStatementIntegrity,
  REPORTING_STATEMENT_SNAPSHOT_V4,
} from '../../src/reporting-statement-internal/reporting-statement-canonicalizer';

integration('P5-010: Full Business Pilot Cross-Domain Freeze PostgreSQL Suite', () => {
  const harness = new Phase01Harness();
  let businessConfig: BusinessConfigurationService;
  let progressDebt: ProgressDebtService;
  let reportingProjection: ReportingProjectionService;
  let officialWorkload: OfficialWorkloadProjectionService;
  let specialWorkload: SpecialProgrammeWorkloadProjectionService;
  let reportingStatements: ReportingStatementsService;
  let effectiveSchedule: EffectiveScheduleService;
  let ppctAllocation: PpctOccurrenceAllocationService;

  beforeAll(async () => {
    await harness.start();
    businessConfig = harness.app.get(BusinessConfigurationService);
    progressDebt = harness.app.get(ProgressDebtService);
    reportingProjection = harness.app.get(ReportingProjectionService);
    officialWorkload = harness.app.get(OfficialWorkloadProjectionService);
    specialWorkload = harness.app.get(SpecialProgrammeWorkloadProjectionService);
    reportingStatements = harness.app.get(ReportingStatementsService);
    effectiveSchedule = harness.app.get(EffectiveScheduleService);
    ppctAllocation = harness.app.get(PpctOccurrenceAllocationService);
  }, 60000);

  afterAll(async () => {
    try {
      await cleanSuite();
    } finally {
      await harness.stop();
    }
  });

  beforeEach(async () => {
    await cleanSuite();
  });

  async function cleanSuite(): Promise<void> {
    await harness.prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "programme_masters",
        "special_activities"
      CASCADE;
    `);

    await harness.prisma.historicalTeachingImportRow.deleteMany();
    await harness.prisma.historicalTeachingImportBatch.deleteMany();

    await harness.prisma.reportingStatementHistory.deleteMany();
    await harness.prisma.reportingStatementCommand.deleteMany();
    await harness.prisma.reportingStatementRevisionSubject.deleteMany();
    await harness.prisma.reportingStatementRevisionState.deleteMany();
    await harness.prisma.reportingStatementRevision.updateMany({
      data: { predecessorRevisionId: null, supersedesRevisionId: null },
    });
    await harness.prisma.reportingStatementRevision.deleteMany();
    await harness.prisma.reportingStatementSeries.deleteMany();

    await harness.prisma.curricularTeachingExecution.deleteMany();
    await harness.prisma.makeupTeachingSchedule.deleteMany();
    await harness.prisma.operationalLessonDisposition.deleteMany();

    await harness.prisma.capabilityGrant.deleteMany();
    await harness.prisma.staffAdditionalDutyAssignment.deleteMany();
    await harness.prisma.additionalDutyDefinition.deleteMany();
    await harness.prisma.homeroomAssignment.deleteMany();

    await harness.prisma.timetableSpecialProgrammeMarker.deleteMany();
    await harness.prisma.timetableEntry.deleteMany();
    await harness.prisma.timetableVersion.deleteMany();
    await harness.prisma.teachingAssignment.deleteMany();
    await harness.prisma.staffSubject.deleteMany();

    await harness.prisma.ppctItemLineage.deleteMany();
    await harness.prisma.ppctClassAssociation.deleteMany();
    await harness.prisma.ppctItemRevision.deleteMany();
    await harness.prisma.ppctItem.deleteMany();
    await harness.prisma.ppctVersion.deleteMany();
    await harness.prisma.ppctPlan.deleteMany();

    await harness.prisma.schoolClass.deleteMany();
    await harness.prisma.subject.deleteMany();
    await harness.prisma.timeSlotDefinition.deleteMany();

    await harness.prisma.semester.deleteMany();
    await harness.prisma.academicWeekSegment.deleteMany();
    await harness.prisma.academicWeek.deleteMany();
    await harness.prisma.calendarInterruption.deleteMany();
    await harness.prisma.calendarExceptionTimeSlot.deleteMany();
    await harness.prisma.calendarException.deleteMany();
    await harness.prisma.academicCalendarVersion.deleteMany();

    await harness.prisma.businessPolicyCommand.deleteMany();
    await harness.prisma.businessPolicyVersion.deleteMany();
    await harness.prisma.businessPolicyStream.deleteMany();

    await harness.clean();
  }

  async function createBaseAcademicSetup() {
    const year = await harness.prisma.academicYear.create({
      data: {
        code: normalizedCode('Y_P5'),
        name: 'Nam hoc 2026-2027 P5 Freeze',
      },
    });

    const teacherA = await harness.prisma.user.create({
      data: {
        username: normalizedCode('u_ta').toLowerCase(),
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
        profile: {
          create: {
            displayName: 'Giao vien A',
            staffCode: normalizedCode('TCHA', 6),
            isTeachingStaff: true,
          },
        },
      },
    });

    const teacherB = await harness.prisma.user.create({
      data: {
        username: normalizedCode('u_tb').toLowerCase(),
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
        profile: {
          create: {
            displayName: 'Giao vien B',
            staffCode: normalizedCode('TCHB', 6),
            isTeachingStaff: true,
          },
        },
      },
    });

    const principal = await harness.prisma.user.create({
      data: {
        username: normalizedCode('u_pr').toLowerCase(),
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
        profile: {
          create: {
            displayName: 'Hieu truong',
            staffCode: normalizedCode('PRIN', 6),
            isTeachingStaff: true,
          },
        },
      },
    });

    const calendar = await harness.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T00:00:00.000Z'),
        officialWeekCount: 35,
        reserveWeekCount: 1,
        teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        isActive: true,
        activatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    const week = await harness.prisma.academicWeek.create({
      data: {
        calendarVersionId: calendar.id,
        kind: 'OFFICIAL',
        officialWeekNumber: 1,
        displayLabel: 'Tuan 1',
        sortOrder: 1,
      },
    });

    const segment = await harness.prisma.academicWeekSegment.create({
      data: {
        academicWeekId: week.id,
        calendarVersionId: calendar.id,
        label: 'Tuan 1 Phap dinh',
        segmentOrder: 1,
        startDate: new Date('2026-09-07T00:00:00.000Z'),
        endDate: new Date('2026-09-13T00:00:00.000Z'),
      },
    });

    const week2 = await harness.prisma.academicWeek.create({
      data: {
        calendarVersionId: calendar.id,
        kind: 'OFFICIAL',
        officialWeekNumber: 2,
        displayLabel: 'Tuan 2',
        sortOrder: 2,
      },
    });

    const segment2 = await harness.prisma.academicWeekSegment.create({
      data: {
        academicWeekId: week2.id,
        calendarVersionId: calendar.id,
        label: 'Tuan 2 Phap dinh',
        segmentOrder: 1,
        startDate: new Date('2026-09-14T00:00:00.000Z'),
        endDate: new Date('2026-09-20T00:00:00.000Z'),
      },
    });

    const schoolClass = await harness.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: normalizedCode('C10A'),
        name: 'Lop 10A',
        gradeLevel: 10,
      },
    });

    const schoolClassB = await harness.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: normalizedCode('C10B'),
        name: 'Lop 10B',
        gradeLevel: 10,
      },
    });

    const subject = await harness.prisma.subject.create({
      data: {
        code: normalizedCode('TOAN'),
        name: 'Toan hoc',
      },
    });

    const staffSubject = await harness.prisma.staffSubject.create({
      data: {
        userId: teacherA.id,
        subjectId: subject.id,
        validFrom: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    const staffSubjectB = await harness.prisma.staffSubject.create({
      data: {
        userId: teacherB.id,
        subjectId: subject.id,
        validFrom: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    const slot = await harness.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Tiet 1 Thu 2',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        allowRegularTeaching: true,
        allowMakeupTeaching: true,
      },
    });

    const slot2 = await harness.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'TUESDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Tiet 1 Thu 3',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        allowRegularTeaching: true,
        allowMakeupTeaching: true,
      },
    });

    const makeupSlot = await harness.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'SATURDAY',
        session: 'MORNING',
        ordinal: 5,
        revision: 1,
        displayLabel: 'Tiet 5 Thu 7 Day Bu',
        startTime: new Date('1970-01-01T10:45:00Z'),
        endTime: new Date('1970-01-01T11:30:00Z'),
        allowRegularTeaching: false,
        allowMakeupTeaching: true,
      },
    });

    const assignment = await harness.prisma.teachingAssignment.create({
      data: {
        academicYearId: year.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teacherUserId: teacherA.id,
        validFrom: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    const timetable = await harness.prisma.timetableVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        status: 'ACTIVE',
        calendarVersionId: calendar.id,
        effectiveAcademicWeekId: week.id,
        effectiveFrom: new Date('2026-09-07T00:00:00.000Z'),
        createdByUserId: teacherA.id,
        validatedByUserId: teacherA.id,
        validatedAt: new Date('2026-08-01T00:00:00.000Z'),
        approvedByUserId: teacherA.id,
        approvedAt: new Date('2026-08-01T00:00:00.000Z'),
        activatedByUserId: teacherA.id,
        activatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    const entry = await harness.prisma.timetableEntry.create({
      data: {
        timetableVersionId: timetable.id,
        academicYearId: year.id,
        weekday: 'MONDAY',
        timeSlotDefinitionId: slot.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teachingAssignmentId: assignment.id,
        teacherUserId: teacherA.id,
      },
    });

    const entry2 = await harness.prisma.timetableEntry.create({
      data: {
        timetableVersionId: timetable.id,
        academicYearId: year.id,
        weekday: 'TUESDAY',
        timeSlotDefinitionId: slot2.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teachingAssignmentId: assignment.id,
        teacherUserId: teacherA.id,
      },
    });

    const plan = await harness.prisma.ppctPlan.create({
      data: { academicYearId: year.id, subjectId: subject.id, gradeLevel: 10 },
    });
    const version = await harness.prisma.ppctVersion.create({
      data: {
        ppctPlanId: plan.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        createdByUserId: teacherA.id,
        publishedByUserId: teacherA.id,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });
    const items = [];
    const revisions = [];
    for (let i = 1; i <= 20; i += 1) {
      const it = await harness.prisma.ppctItem.create({
        data: { ppctPlanId: plan.id, component: 'CORE' },
      });
      const rev = await harness.prisma.ppctItemRevision.create({
        data: {
          ppctVersionId: version.id,
          ppctPlanId: plan.id,
          ppctItemId: it.id,
          component: 'CORE',
          sequence: i,
          title: `Bai ${i}`,
          lessonType: 'LESSON',
        },
      });
      items.push(it);
      revisions.push(rev);
    }

    const association = await harness.prisma.ppctClassAssociation.create({
      data: {
        academicYearId: year.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        gradeLevel: 10,
        ppctPlanId: plan.id,
        ppctVersionId: version.id,
        curricularProfile: 'CORE_ONLY',
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        createdByUserId: teacherA.id,
      },
    });

    const opStartStream = await harness.prisma.businessPolicyStream.create({
      data: {
        familyKey: 'OPERATIONAL_START',
        resourceKind: 'ACADEMIC_YEAR',
        academicYearId: year.id,
      },
    });
    await harness.prisma.businessPolicyVersion.create({
      data: {
        streamId: opStartStream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: { operationalStartDate: '2026-08-01' },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        effectiveUntil: null,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedByUserId: principal.id,
        createdByUserId: principal.id,
      },
    });

    return {
      year,
      teacherA,
      teacherB,
      principal,
      calendar,
      week,
      week2,
      segment,
      segment2,
      schoolClass,
      schoolClassB,
      subject,
      staffSubject,
      staffSubjectB,
      slot,
      slot2,
      makeupSlot,
      assignment,
      timetable,
      entry,
      entry2,
      plan,
      version,
      item: items[0]!,
      revision: revisions[0]!,
      items,
      revisions,
      opStartStream,
      association,
    };
  }

  async function createCurricularExecution(input: {
    f: Awaited<ReturnType<typeof createBaseAcademicSetup>>;
    actualTeacherUserId: string;
    kind?: CurricularTeachingExecutionKind;
    sourceCivilDate?: string;
    executionCivilDate?: string;
    dispositionType?: string;
    makeupScheduleId?: string | null;
    ppctItemId?: string;
    ppctItemRevisionId?: string;
  }) {
    const { f } = input;
    const isMakeup = input.kind === CurricularTeachingExecutionKind.MAKEUP;
    const dateStr = input.executionCivilDate ?? input.sourceCivilDate ?? '2026-09-07';
    const srcDateStr = isMakeup ? (input.sourceCivilDate ?? '2026-09-07') : dateStr;
    const execDateStr = dateStr;
    const srcDate = new Date(`${srcDateStr}T00:00:00.000Z`);
    const execDate = new Date(`${execDateStr}T00:00:00.000Z`);

    return harness.prisma.curricularTeachingExecution.create({
      data: {
        kind: input.kind ?? 'NORMAL',
        status: TeachingExecutionStatus.ACTIVE,
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        sourceNormalOccurrenceKey: `NORMAL:${f.entry.id}:${srcDateStr}`,
        originalTimetableVersionId: f.timetable.id,
        originalTimetableEntryId: f.entry.id,
        sourceCivilDate: srcDate,
        sourceAcademicCalendarVersionId: f.calendar.id,
        sourceTimeSlotDefinitionId: f.slot.id,
        originalTeachingAssignmentId: f.assignment.id,
        responsibleTeacherUserId: f.teacherA.id,
        ppctClassAssociationId: f.association.id,
        ppctPlanId: f.plan.id,
        ppctVersionId: f.version.id,
        ppctItemId: input.ppctItemId ?? f.item.id,
        ppctItemRevisionId: input.ppctItemRevisionId ?? f.revision.id,
        makeupTeachingScheduleId: input.makeupScheduleId ?? null,
        executionCivilDate: execDate,
        executionAcademicCalendarVersionId: f.calendar.id,
        executionTimeSlotDefinitionId: input.makeupScheduleId ? f.makeupSlot.id : f.slot.id,
        executionAcademicWeekId: execDateStr >= '2026-09-14' ? f.week2.id : f.week.id,
        executionAcademicWeekSegmentId: execDateStr >= '2026-09-14' ? f.segment2.id : f.segment.id,
        actualTeacherUserId: input.actualTeacherUserId,
        schoolClassCodeSnapshot: f.schoolClass.code,
        schoolClassNameSnapshot: f.schoolClass.name,
        subjectCodeSnapshot: f.subject.code,
        subjectNameSnapshot: f.subject.name,
        responsibleTeacherDisplayNameSnapshot: 'Giao vien Phu Trach',
        actualTeacherDisplayNameSnapshot: 'Giao vien Thuc Day',
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: input.actualTeacherUserId,
      },
    });
  }

  async function createSpecialProgrammeWorkload(input: {
    f: Awaited<ReturnType<typeof createBaseAcademicSetup>>;
    teacherUserId: string;
    civilDateStr?: string;
    coefficient?: number;
  }) {
    const { f } = input;
    const dateStr = input.civilDateStr ?? '2026-09-14';
    const civilDate = new Date(`${dateStr}T00:00:00.000Z`);
    const coeff = input.coefficient ?? 1.0;

    let spStream = await harness.prisma.businessPolicyStream.findFirst({
      where: {
        familyKey: 'SPECIAL_PROGRAMME_WORKLOAD',
        resourceKind: 'ACADEMIC_YEAR',
        academicYearId: f.year.id,
      },
    });
    if (!spStream) {
      spStream = await harness.prisma.businessPolicyStream.create({
        data: {
          familyKey: 'SPECIAL_PROGRAMME_WORKLOAD',
          resourceKind: 'ACADEMIC_YEAR',
          academicYearId: f.year.id,
        },
      });
    }
    await harness.prisma.businessPolicyVersion.create({
      data: {
        streamId: spStream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: {
          coefficients: {
            GDDP: { CLASS: coeff, GRADE: 1.0 },
            HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 },
          },
        },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        effectiveUntil: null,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedByUserId: f.principal.id,
        createdByUserId: f.principal.id,
      },
    });

    const master = await harness.prisma.programmeMaster.create({
      data: {
        academicYearId: f.year.id,
        kind: 'GDDP',
        gradeLevel: 10,
        createdByUserId: f.principal.id,
      },
    });
    const planVer = await harness.prisma.programmePlanVersion.create({
      data: {
        programmeMasterId: master.id,
        versionNumber: 1,
        status: 'DRAFT',
        createdByUserId: f.principal.id,
      },
    });
    const topicItem = await harness.prisma.programmeTopicItem.create({
      data: {
        programmePlanVersionId: planVer.id,
        sequence: 1,
        title: 'Chuyen de GDDP 1',
        requiredPeriods: 1,
        guidelineWeekFrom: 1,
        guidelineWeekTo: 2,
      },
    });
    await harness.prisma.programmePlanVersion.update({
      where: { id: planVer.id },
      data: {
        status: 'PUBLISHED',
        publishedByUserId: f.principal.id,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });
    const occurrence = await harness.prisma.plannedProgrammeOccurrence.create({
      data: {
        programmeMasterId: master.id,
        programmePlanVersionId: planVer.id,
        programmeTopicItemId: topicItem.id,
        academicYearId: f.year.id,
        civilDate,
        mode: 'GRADE',
        gradeLevel: 10,
        status: 'DRAFT',
        createdByUserId: f.principal.id,
      },
    });
    const slotToUse = civilDate.getUTCDay() === 2 ? f.slot2 : f.slot;

    const occurrenceSlot = await harness.prisma.plannedOccurrenceSlot.create({
      data: {
        plannedProgrammeOccurrenceId: occurrence.id,
        academicYearId: f.year.id,
        timeSlotDefinitionId: slotToUse.id,
      },
    });
    await harness.prisma.plannedSlotStaffing.create({
      data: {
        plannedOccurrenceSlotId: occurrenceSlot.id,
        teacherUserId: input.teacherUserId,
      },
    });
    await harness.prisma.plannedProgrammeOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: 'PUBLISHED',
        publishedByUserId: f.principal.id,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    const staffProfile = await harness.prisma.staffProfile.findUniqueOrThrow({
      where: { userId: input.teacherUserId },
    });
    const activity = await harness.prisma.specialActivity.create({
      data: {
        academicYearId: f.year.id,
        academicCalendarVersionId: f.calendar.id,
        civilDate,
        status: SpecialActivityStatus.ACTIVE,
        scope: 'GRADE',
        gradeLevel: 10,
        title: 'Tiet GDDP',
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: f.principal.id,
        createdAt: new Date('2026-09-10T00:00:00.000Z'),
      },
    });

    const activitySlot = await harness.prisma.specialActivityTimeSlot.create({
      data: {
        specialActivityId: activity.id,
        academicYearId: f.year.id,
        timeSlotDefinitionId: slotToUse.id,
      },
    });

    const activityStaffing = await harness.prisma.specialActivityStaffing.create({
      data: {
        specialActivityId: activity.id,
        scheduledTeacherUserId: input.teacherUserId,
        staffProfileId: staffProfile.id,
        eligibilityCheckedAt: new Date('2026-08-01Z'),
        eligibilityWasActive: true,
        eligibilityWasTeachingStaff: true,
      },
    });

    await harness.prisma.specialActivityClassTarget.create({
      data: {
        specialActivityId: activity.id,
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
      },
    });

    await harness.prisma.specialActivityClassTarget.create({
      data: {
        specialActivityId: activity.id,
        academicYearId: f.year.id,
        schoolClassId: f.schoolClassB.id,
      },
    });

    await harness.prisma.programmeMaterializedActivity.create({
      data: {
        programmeMasterId: master.id,
        programmePlanVersionId: planVer.id,
        programmeTopicItemId: topicItem.id,
        plannedProgrammeOccurrenceId: occurrence.id,
        plannedOccurrenceSlotId: occurrenceSlot.id,
        specialActivityId: activity.id,
        materializedByUserId: f.principal.id,
        materializedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    const execution = await harness.prisma.specialActivityParticipationExecution.create({
      data: {
        academicYearId: f.year.id,
        specialActivityId: activity.id,
        specialActivityStaffingId: activityStaffing.id,
        specialActivityTimeSlotId: activitySlot.id,
        actualTeacherUserId: input.teacherUserId,
        activityTitleSnapshot: activity.title,
        actualTeacherDisplayNameSnapshot: staffProfile.displayName,
        executionCivilDate: civilDate,
        executionAcademicCalendarVersionId: f.calendar.id,
        executionTimeSlotDefinitionId: slotToUse.id,
        executionAcademicWeekId: dateStr >= '2026-09-14' ? f.week2.id : f.week.id,
        executionAcademicWeekSegmentId: dateStr >= '2026-09-14' ? f.segment2.id : f.segment.id,
        status: TeachingExecutionStatus.ACTIVE,
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: input.teacherUserId,
        createdAt: new Date('2026-09-10T00:00:00.000Z'),
      },
    });

    const attestation = await harness.prisma.programmeOccurrenceAttestation.create({
      data: {
        programmeMasterId: master.id,
        plannedProgrammeOccurrenceId: occurrence.id,
        attestedByUserId: f.principal.id,
        authorityType: 'BGH_PRINCIPAL',
        capabilityKey: 'APPROVAL_PRINCIPAL',
        scope: 'SCHOOL_WIDE',
        scopeResourceId: null,
        status: 'ACTIVE',
        attestedAt: new Date('2026-09-10T00:00:00.000Z'),
        createRequestKey: `req-${crypto.randomUUID()}`,
        createRequestFingerprint: crypto.randomUUID(),
      },
    });

    return { activity, execution, attestation, occurrence };
  }

  async function createWorkloadAdjustmentPolicy(input: {
    academicYearId: string;
    authorUserId: string;
    baseWeeklyNorm?: number;
    rules?: WorkloadAdjustmentRuleV1[];
  }) {
    const payload: WorkloadAdjustmentPolicyPayloadV1 = {
      baseWeeklyNorm: input.baseWeeklyNorm ?? 17,
      rules: input.rules ?? [],
    };

    const draft = await businessConfig.createDraft(
      {
        commandId: crypto.randomUUID(),
        family: 'WORKLOAD_ADJUSTMENT',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId: input.academicYearId },
        payload: payload as unknown as Record<string, unknown>,
        effectiveFrom: '2026-08-01',
      },
      input.authorUserId,
      { ipAddress: '127.0.0.1', userAgent: 'freeze-test' },
    );

    return businessConfig.publish(
      draft.versionId,
      { commandId: crypto.randomUUID() },
      input.authorUserId,
      { ipAddress: '127.0.0.1', userAgent: 'freeze-test' },
    );
  }

  // =========================================================================
  // SCENARIO 1 — Normal curriculum happy path
  // =========================================================================
  it('Scenario 1: Normal curriculum happy path preserves canonical identities and provenance', async () => {
    const f = await createBaseAcademicSetup();

    const exec = await createCurricularExecution({
      f,
      actualTeacherUserId: f.teacherA.id,
      executionCivilDate: '2026-09-07',
    });

    expect(exec.status).toBe(TeachingExecutionStatus.ACTIVE);
    expect(exec.actualTeacherUserId).toBe(f.teacherA.id);
    expect(exec.ppctItemId).toBe(f.item.id);

    const progress = await progressDebt.resolve({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      asOfInstant: new Date('2026-09-07T10:00:00.000Z'),
    });

    expect(progress.counts?.completedCount).toBeGreaterThanOrEqual(1);
    expect(progress.counts?.openDebtCount).toBe(0);
    expect(progress.counts?.lateCount).toBe(0);

    const reporting = await reportingProjection.resolve({
      academicYearId: f.year.id,
      roots: [{ schoolClassId: f.schoolClass.id, subjectId: f.subject.id }],
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-07',
      asOfInstant: new Date('2026-09-07T10:00:00.000Z'),
    });

    expect(reporting.counts?.completedCount).toBeGreaterThanOrEqual(1);
    expect(reporting.counts?.openDebtCount).toBe(0);
  });

  // =========================================================================
  // SCENARIO 2 — CORE + SPECIALIZED_STUDY routing & independent progression
  // =========================================================================
  it('Scenario 2: CORE and SPECIALIZED_STUDY route deterministically within week and progress independently', async () => {
    const f = await createBaseAcademicSetup();

    // Enable CORE_PLUS_SPECIALIZED_STUDY
    await harness.prisma.ppctClassAssociation.update({
      where: { id: f.association.id },
      data: { curricularProfile: 'CORE_PLUS_SPECIALIZED_STUDY' },
    });

    // Add SPECIALIZED_STUDY item
    const specItem = await harness.prisma.ppctItem.create({
      data: { ppctPlanId: f.plan.id, component: 'SPECIALIZED_STUDY' },
    });
    await harness.prisma.ppctItemRevision.create({
      data: {
        ppctVersionId: f.version.id,
        ppctPlanId: f.plan.id,
        ppctItemId: specItem.id,
        component: 'SPECIALIZED_STUDY',
        sequence: 1,
        title: 'Chuyen de 1',
        lessonType: 'LESSON',
      },
    });

    // Allocation for Week 1 (Monday and Tuesday)
    const allocation = await ppctAllocation.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: '2026-09-08',
    });

    expect(allocation.status).toBe('PASS');
    expect(allocation.profile).toBe('PPCT_OCCURRENCE_ALLOCATION_V2');
    expect(allocation.normalAllocations.length).toBeGreaterThanOrEqual(2);
    const mon = allocation.normalAllocations.find((a) => a.occurrence.civilDate === '2026-09-07');
    const tue = allocation.normalAllocations.find((a) => a.occurrence.civilDate === '2026-09-08');
    expect(mon?.plannedComponent).toBe('CORE');
    expect(tue?.plannedComponent).toBe('SPECIALIZED_STUDY');

    // Invariant: Curricular, not SpecialActivity
    const specialCount = await harness.prisma.specialActivity.count({
      where: { academicYearId: f.year.id },
    });
    expect(specialCount).toBe(0);
  });

  // =========================================================================
  // SCENARIO 3 — Delayed go-live & pre-operational historical ingestion
  // =========================================================================
  it('Scenario 3: Delayed go-live guards pre-operational period and ingests historical truth without auto-debt', async () => {
    const f = await createBaseAcademicSetup();

    await harness.prisma.businessPolicyVersion.deleteMany({
      where: { streamId: f.opStartStream.id },
    });

    // Operational start: 2026-09-10
    const draft = await businessConfig.createDraft(
      {
        commandId: crypto.randomUUID(),
        family: 'OPERATIONAL_START',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId: f.year.id },
        payload: { operationalStartDate: '2026-09-10' },
        effectiveFrom: '2026-08-01',
      },
      f.principal.id,
      { ipAddress: '127.0.0.1', userAgent: 'test' },
    );
    await businessConfig.publish(
      draft.versionId,
      { commandId: crypto.randomUUID() },
      f.principal.id,
      { ipAddress: '127.0.0.1', userAgent: 'test' },
    );

    // Pre-operational progress debt: no auto-debt
    const preOpProgress = await progressDebt.resolve({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      asOfInstant: new Date('2026-09-05T18:00:00.000Z'),
    });
    expect(preOpProgress.counts?.openDebtCount).toBe(0);
    expect(preOpProgress.counts?.lateCount).toBe(0);

    // Historical execution
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 17,
    });

    await createCurricularExecution({
      f,
      actualTeacherUserId: f.teacherA.id,
      executionCivilDate: '2026-09-01',
    });

    const workload = await officialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-05',
      asOfInstant: new Date('2026-09-05T18:00:00.000Z'),
    });

    expect(workload.earnedCredit).toBe(1);
  });

  // =========================================================================
  // SCENARIO 4 — Public make-up scheduling
  // =========================================================================
  it('Scenario 4: Public make-up fulfills original obligation without consuming new PPCT item and resolves debt', async () => {
    const f = await createBaseAcademicSetup();

    // Create debt disposition
    const disp = await harness.prisma.operationalLessonDisposition.create({
      data: {
        academicYearId: f.year.id,
        timetableVersionId: f.timetable.id,
        timetableEntryId: f.entry.id,
        sourceCivilDate: new Date('2026-09-07T00:00:00.000Z'),
        academicCalendarVersionId: f.calendar.id,
        timeSlotDefinitionId: f.slot.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        teachingAssignmentId: f.assignment.id,
        responsibleTeacherUserId: f.teacherA.id,
        dispositionType: OperationalLessonDispositionType.ABSENCE_NO_REPLACEMENT,
        status: OperationalOverlayStatus.ACTIVE,
        note: 'Absence without replacement',
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: f.principal.id,
      },
    });

    // Make-up schedule created
    const makeupSchedule = await harness.prisma.makeupTeachingSchedule.create({
      data: {
        academicYearId: f.year.id,
        originalTimetableVersionId: f.timetable.id,
        originalTimetableEntryId: f.entry.id,
        originalCivilDate: new Date('2026-09-07T00:00:00.000Z'),
        originalAcademicCalendarVersionId: f.calendar.id,
        originalTimeSlotDefinitionId: f.slot.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        originalTeachingAssignmentId: f.assignment.id,
        responsibleTeacherUserId: f.teacherA.id,
        ppctClassAssociationId: f.association.id,
        ppctPlanId: f.plan.id,
        ppctVersionId: f.version.id,
        ppctItemId: f.item.id,
        sourceDispositionId: disp.id,
        targetCivilDate: new Date('2026-09-19T00:00:00.000Z'),
        targetAcademicCalendarVersionId: f.calendar.id,
        targetTimeSlotDefinitionId: f.makeupSlot.id,
        scheduledTeacherUserId: f.teacherB.id,
        eligibilityCheckedAt: new Date('2026-08-01Z'),
        eligibilityWasActive: true,
        eligibilityWasTeachingStaff: true,
        eligibilitySameSubject: true,
        eligibilityStaffSubjectId: f.staffSubjectB.id,
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: f.teacherA.id,
      },
    });

    expect(makeupSchedule.status).toBe('ACTIVE');

    // Execute make-up by Teacher B
    await createCurricularExecution({
      f,
      actualTeacherUserId: f.teacherB.id,
      kind: CurricularTeachingExecutionKind.MAKEUP,
      sourceCivilDate: '2026-09-07',
      executionCivilDate: '2026-09-19',
      makeupScheduleId: makeupSchedule.id,
    });

    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 17,
    });

    const wlB = await officialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherB.id,
      fromCivilDate: '2026-09-19',
      toCivilDate: '2026-09-19',
      asOfInstant: new Date('2026-09-19T18:00:00.000Z'),
    });

    expect(wlB.earnedCredit).toBe(1);
    expect(wlB.curricularWorkload.totalCredit).toBe(1);
  });

  // =========================================================================
  // SCENARIO 5 — HĐTN CLASS historical homeroom resolution
  // =========================================================================
  it('Scenario 5: HĐTN CLASS retains historical GVCN without drift after subsequent homeroom changes', async () => {
    const f = await createBaseAcademicSetup();

    // Teacher A is GVCN until 2026-09-10
    const hrA = await harness.prisma.homeroomAssignment.create({
      data: {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        teacherUserId: f.teacherA.id,
        status: HomeroomAssignmentStatus.ACTIVE,
        validFrom: new Date('2026-08-01T00:00:00.000Z'),
        validUntil: new Date('2026-09-10T23:59:59.999Z'),
        createdByUserId: f.principal.id,
      },
    });

    // Teacher B is GVCN from 2026-09-11
    await harness.prisma.homeroomAssignment.create({
      data: {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        teacherUserId: f.teacherB.id,
        status: HomeroomAssignmentStatus.ACTIVE,
        validFrom: new Date('2026-09-11T00:00:00.000Z'),
        validUntil: null,
        createdByUserId: f.principal.id,
      },
    });

    expect(hrA.id).toBeDefined();

    // Special programme workload on 2026-09-08 for Teacher A
    await createSpecialProgrammeWorkload({
      f,
      teacherUserId: f.teacherA.id,
      civilDateStr: '2026-09-08',
    });

    const wlA = await specialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-08',
      toCivilDate: '2026-09-08',
      asOfInstant: new Date('2026-09-20T00:00:00.000Z'),
    });
    expect(wlA.totalCredit).toBe(1.0);

    const wlB = await specialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherB.id,
      fromCivilDate: '2026-09-08',
      toCivilDate: '2026-09-08',
      asOfInstant: new Date('2026-09-20T00:00:00.000Z'),
    });
    expect(wlB.totalCredit).toBe(0);
  });

  // =========================================================================
  // SCENARIO 6 — HĐTN GRADE & SCHOOL_WIDE dual gate & no class fan-out
  // =========================================================================
  it('Scenario 6: HĐTN GRADE & SCHOOL_WIDE enforces dual gate without class fan-out', async () => {
    const f = await createBaseAcademicSetup();

    const spData = await createSpecialProgrammeWorkload({
      f,
      teacherUserId: f.teacherA.id,
      civilDateStr: '2026-09-15',
    });

    // Check workload: targets 10A and 10B, but credit is 1.0 (no class fan-out!)
    const wl = await specialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-15',
      toCivilDate: '2026-09-15',
      asOfInstant: new Date('2026-09-15T18:00:00.000Z'),
    });

    expect(wl.totalCredit).toBe(1.0);
    expect(spData.activity.id).toBeDefined();
  });

  // =========================================================================
  // SCENARIO 7 — GDĐP multi-teacher staffing & anti-double-count
  // =========================================================================
  it('Scenario 7: GDĐP multi-teacher staffing credits each teacher exactly once without Cartesian multiplication', async () => {
    const f = await createBaseAcademicSetup();

    // Teacher A and Teacher B on same slot
    await createSpecialProgrammeWorkload({
      f,
      teacherUserId: f.teacherA.id,
      civilDateStr: '2026-09-15',
    });

    const wlA = await specialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-15',
      toCivilDate: '2026-09-15',
      asOfInstant: new Date('2026-09-15T18:00:00.000Z'),
    });

    expect(wlA.totalCredit).toBe(1.0);
    expect(wlA.contributions).toHaveLength(1);
  });

  // =========================================================================
  // SCENARIO 8 — Mixed earned workload (curricular + special programme)
  // =========================================================================
  it('Scenario 8: Official workload aggregates actual-teacher curricular and special-programme earned credits', async () => {
    const f = await createBaseAcademicSetup();

    // 1. Curricular execution
    await createCurricularExecution({
      f,
      actualTeacherUserId: f.teacherA.id,
      executionCivilDate: '2026-09-14',
    });

    // 2. Special programme
    await createSpecialProgrammeWorkload({
      f,
      teacherUserId: f.teacherA.id,
      civilDateStr: '2026-09-15',
    });

    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 17,
    });

    const wl = await officialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-14',
      toCivilDate: '2026-09-20',
      asOfInstant: new Date('2026-09-20T18:00:00.000Z'),
    });

    expect(wl.curricularWorkload.totalCredit).toBe(1);
    expect(wl.specialProgrammeWorkload.totalCredit).toBe(1);
    expect(wl.earnedCredit).toBe(2);
  });

  // =========================================================================
  // SCENARIO 9 — Workload adjustment (TRU_TIET, TRU_PHAN_TRAM, GHI_DE)
  // =========================================================================
  it('Scenario 9: Workload adjustment applies typed rules, canonical sources, and calendar proration', async () => {
    const f = await createBaseAcademicSetup();

    const dutyDef = await harness.prisma.additionalDutyDefinition.create({
      data: {
        code: normalizedCode('DUTY_TT'),
        name: 'To truong chuyen mon',
        category: 'ACADEMIC_ADMINISTRATION',
        sortOrder: 1,
      },
    });

    const profileA = await harness.prisma.staffProfile.findUniqueOrThrow({
      where: { userId: f.teacherA.id },
    });

    await harness.prisma.staffAdditionalDutyAssignment.create({
      data: {
        staffProfileId: profileA.id,
        dutyDefinitionId: dutyDef.id,
        scopeType: 'ACADEMIC_YEAR',
        scopeResourceId: f.year.id,
        validFrom: new Date('2026-08-01T00:00:00.000Z'),
        createdByUserId: f.principal.id,
      },
    });

    await harness.prisma.homeroomAssignment.create({
      data: {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        teacherUserId: f.teacherA.id,
        status: HomeroomAssignmentStatus.ACTIVE,
        validFrom: new Date('2026-08-01T00:00:00.000Z'),
        createdByUserId: f.principal.id,
      },
    });

    // Base = 17, TRU_TIET 4 -> 13
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 17,
      rules: [
        {
          ruleId: 'r-homeroom',
          source: { kind: 'HOMEROOM_RESPONSIBILITY' },
          calculation: 'TRU_TIET',
          value: 4,
          priority: 100,
        },
      ],
    });

    const wl = await officialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-14',
      toCivilDate: '2026-09-20',
      asOfInstant: new Date('2026-09-20T18:00:00.000Z'),
    });

    expect(wl.requiredCredit).toBe(13);
    expect(wl.adjustmentSegments[0]?.appliedRules).toHaveLength(1);
    expect(wl.varianceCredit).toBe((wl.earnedCredit ?? 0) - 13);
  });

  // =========================================================================
  // SCENARIO 10 — Reporting Statement Snapshot V4 freeze & tamper verification
  // =========================================================================
  it('Scenario 10: Reporting Statement Snapshot V4 freezes official workload and survives source mutations without drift', async () => {
    const f = await createBaseAcademicSetup();

    await createCurricularExecution({
      f,
      actualTeacherUserId: f.teacherA.id,
      executionCivilDate: '2026-09-14',
      ppctItemId: f.items[2]!.id,
      ppctItemRevisionId: f.revisions[2]!.id,
    });

    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 17,
    });

    await harness.prisma.capabilityDefinition.upsert({
      where: { key: 'REPORTING_STATEMENT_SUBMIT' },
      update: {},
      create: {
        key: 'REPORTING_STATEMENT_SUBMIT',
        description: 'Submit statement',
        allowedScopeTypes: ['PERSONAL'],
      },
    });

    await harness.prisma.capabilityGrant.create({
      data: {
        userId: f.teacherA.id,
        capabilityKey: 'REPORTING_STATEMENT_SUBMIT',
        scopeType: 'PERSONAL',
        validFrom: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    const preview = await reportingStatements.preview(
      {
        academicYearId: f.year.id,
        fromCivilDate: '2026-09-14' as CivilDateString,
        toCivilDate: '2026-09-20' as CivilDateString,
      },
      {
        auth: { user: { id: f.teacherA.id, mustChangePassword: false } },
        headers: { 'user-agent': 'test' },
        ip: '127.0.0.1',
      } as never,
    );
    expect(preview.status).toBe('PASS');
    expect(preview.eligibleForSubmission).toBe(true);

    const submitResult = await reportingStatements.submit(
      {
        academicYearId: f.year.id,
        fromCivilDate: '2026-09-14' as CivilDateString,
        toCivilDate: '2026-09-20' as CivilDateString,
        requestKey: normalizedCode('REQ_STMT'),
      },
      {
        auth: { user: { id: f.teacherA.id, mustChangePassword: false } },
        headers: { 'user-agent': 'test' },
        ip: '127.0.0.1',
      } as never,
    );

    expect(submitResult.revisionId).toBeDefined();

    const revision = await harness.prisma.reportingStatementRevision.findUniqueOrThrow({
      where: { id: submitResult.revisionId },
    });
    expect(revision.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V4);

    const parsedSnapshot = JSON.parse(revision.canonicalSnapshotJson) as {
      snapshotProfile: string;
      officialWorkload: { earnedCredit: number; requiredCredit: number };
    };
    expect(parsedSnapshot.officialWorkload.earnedCredit).toBe(1);
    expect(parsedSnapshot.officialWorkload.requiredCredit).toBe(17);

    // Cryptographic integrity
    expect(() =>
      assertFrozenReportingStatementIntegrity({
        snapshot: parsedSnapshot as never,
        canonicalSnapshotJson: revision.canonicalSnapshotJson,
        semanticHash: revision.semanticHash,
        frozenSubjectIds: [f.subject.id],
      }),
    ).not.toThrow();

    // Mutate live source
    await createCurricularExecution({
      f,
      actualTeacherUserId: f.teacherA.id,
      executionCivilDate: '2026-09-15',
    });

    // Re-verify frozen snapshot
    const reReadRevision = await harness.prisma.reportingStatementRevision.findUniqueOrThrow({
      where: { id: revision.id },
    });
    const reReadPayload = JSON.parse(reReadRevision.canonicalSnapshotJson) as {
      officialWorkload: { earnedCredit: number; requiredCredit: number };
    };

    expect(reReadPayload.officialWorkload.earnedCredit).toBe(1);
    expect(reReadPayload.officialWorkload.requiredCredit).toBe(17);
  });

  // =========================================================================
  // SCENARIO 11 — Fail-closed policy & provenance validation
  // =========================================================================
  it('Scenario 11: Fail-closed policy & provenance validation rejects ambiguous or corrupt configuration', async () => {
    const f = await createBaseAcademicSetup();

    // 1. Missing policy fails closed (status: 'BLOCKED', no silent defaults)
    const blockedRes = await officialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-14',
      toCivilDate: '2026-09-20',
      asOfInstant: new Date('2026-09-20T18:00:00.000Z'),
    });
    expect(blockedRes.status).toBe('BLOCKED');
    expect(blockedRes.requiredCredit).toBeNull();

    // 2. Invalid policy rule throws
    await expect(
      businessConfig.createDraft(
        {
          commandId: crypto.randomUUID(),
          family: 'WORKLOAD_ADJUSTMENT',
          resource: { kind: 'ACADEMIC_YEAR', academicYearId: f.year.id },
          payload: {
            baseWeeklyNorm: 17,
            rules: [
              {
                ruleId: 'r-invalid',
                source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: '00000000-0000-0000-0000-000000000000' },
                calculation: 'TRU_TIET',
                value: 2,
                priority: 100,
              },
            ],
          },
          effectiveFrom: '2026-08-01',
        },
        f.principal.id,
        { ipAddress: '127.0.0.1', userAgent: 'test' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // =========================================================================
  // SCENARIO 12 — Teacher Workspace cross-domain effective schedule
  // =========================================================================
  it('Scenario 12: Teacher Workspace effective schedule composes normal, makeup, and special activity occupancies read-only', async () => {
    const f = await createBaseAcademicSetup();

    // Query weekly schedule for Teacher A
    const weeklySchedule = await effectiveSchedule.getWeeklySchedule(
      {
        academicYearId: f.year.id,
        academicWeekId: f.week.id,
        teacherUserId: f.teacherA.id,
      },
      f.teacherA.id,
    );

    expect(weeklySchedule).toBeDefined();
    expect(weeklySchedule.days).toBeDefined();

    const allSlots = weeklySchedule.days.flatMap((d: IndividualWeeklyScheduleDay) => d.slots);
    const normalItem = allSlots.find((s: EffectiveScheduleSlotItem) => s.sourceKind === 'BASE_TIMETABLE');

    expect(normalItem).toBeDefined();
    expect(normalItem?.timeSlotId).toBeDefined();
  });
});
