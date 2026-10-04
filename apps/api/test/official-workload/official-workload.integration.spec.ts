import {
  CurricularTeachingExecutionKind,
  PrismaClient,
  TeachingExecutionStatus,
  UserStatus,
} from '@prisma/client';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';
import { BusinessConfigurationService } from '../../src/business-configuration/business-configuration.service';
import { OfficialWorkloadProjectionService } from '../../src/official-workload/official-workload-projection.service';
import { ReportingStatementsService } from '../../src/reporting-statements/reporting-statements.service';
import { PersonalReportingProjectionService } from '../../src/personal-reporting-projection/personal-reporting-projection.service';
import {
  assertFrozenReportingStatementIntegrity,
  REPORTING_STATEMENT_SNAPSHOT_V4,
} from '../../src/reporting-statement-internal/reporting-statement-canonicalizer';
import { presentReportingStatementDetail } from '../../src/reporting-statements/reporting-statement.presenter';

integration('P4-061: Official Workload & Workload Adjustment PostgreSQL Integration Suite', () => {
  const harness = new Phase01Harness();
  let prisma: PrismaClient;
  let reportingService: ReportingStatementsService;
  let officialWorkload: OfficialWorkloadProjectionService;
  let businessConfig: BusinessConfigurationService;

  const asOf = new Date('2026-09-20T12:00:00.000Z');

  // Shared mock for PersonalReportingProjectionService inside Nest DI
  const mockProjectionService = {
    resolveInTransaction: jest.fn(),
    resolve: jest.fn(),
  };

  beforeAll(async () => {
    // Override PersonalReportingProjectionService with mockProjectionService before compiling AppModule
    await harness.start([
      { token: PersonalReportingProjectionService, value: mockProjectionService },
    ]);
    prisma = harness.prisma;
    reportingService = harness.app.get(ReportingStatementsService);
    officialWorkload = harness.app.get(OfficialWorkloadProjectionService);
    businessConfig = harness.app.get(BusinessConfigurationService);
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

  async function cleanSuite() {
    // 1. Reporting Statements
    await harness.prisma.reportingStatementHistory.deleteMany();
    await harness.prisma.reportingStatementCommand.deleteMany();
    await harness.prisma.reportingStatementRevisionSubject.deleteMany();
    await harness.prisma.reportingStatementRevisionState.deleteMany();
    await harness.prisma.reportingStatementRevision.updateMany({
      data: { predecessorRevisionId: null, supersedesRevisionId: null },
    });
    await harness.prisma.reportingStatementRevision.deleteMany();
    await harness.prisma.reportingStatementSeries.deleteMany();

    // 2. Special Programme Workload & Materialized Activities & Attestations
    await harness.prisma.programmeOccurrenceAttestation.deleteMany();
    await harness.prisma.programmeMaterializedActivity.deleteMany();
    await harness.prisma.specialActivityParticipationExecution.deleteMany();
    await harness.prisma.specialActivityStaffing.deleteMany();
    await harness.prisma.specialActivityClassTarget.deleteMany();
    await harness.prisma.specialActivityTimeSlot.deleteMany();
    await harness.prisma.specialActivity.deleteMany();

    // 3. Curricular Teaching Executions, Makeups & Dispositions
    await harness.prisma.curricularTeachingExecution.deleteMany();
    await harness.prisma.makeupTeachingSchedule.deleteMany();
    await harness.prisma.operationalLessonDisposition.deleteMany();

    // 4. Additional Duty & Homeroom Assignments
    await harness.prisma.staffAdditionalDutyAssignment.deleteMany();
    await harness.prisma.additionalDutyDefinition.deleteMany();
    await harness.prisma.homeroomAssignment.deleteMany();

    // 5. Timetables & Entries
    await harness.prisma.timetableEntry.deleteMany();
    await harness.prisma.timetableVersion.deleteMany();
    await harness.prisma.teachingAssignment.deleteMany();
    await harness.prisma.staffSubject.deleteMany();

    // 6. Programme Planning entities
    await harness.prisma.plannedOccurrenceSlot.deleteMany();
    await harness.prisma.plannedProgrammeOccurrence.deleteMany();
    await harness.prisma.programmeTopicItem.deleteMany();
    await harness.prisma.programmePlanVersion.deleteMany();
    await harness.prisma.programmeMaster.deleteMany();
    await harness.prisma.programmePlanningCommand.deleteMany();

    // 7. PPCT
    await harness.prisma.ppctItemLineage.deleteMany();
    await harness.prisma.ppctClassAssociation.deleteMany();
    await harness.prisma.ppctItemRevision.deleteMany();
    await harness.prisma.ppctItem.deleteMany();
    await harness.prisma.ppctVersion.deleteMany();
    await harness.prisma.ppctPlan.deleteMany();

    // 8. Classes, Subjects, TimeSlots
    await harness.prisma.schoolClass.deleteMany();
    await harness.prisma.subject.deleteMany();
    await harness.prisma.timeSlotDefinition.deleteMany();

    // 9. Calendar
    await harness.prisma.academicWeekSegment.deleteMany();
    await harness.prisma.academicWeek.deleteMany();
    await harness.prisma.calendarInterruption.deleteMany();
    await harness.prisma.calendarExceptionTimeSlot.deleteMany();
    await harness.prisma.calendarException.deleteMany();
    await harness.prisma.academicCalendarVersion.deleteMany();

    // 10. Business Policy
    await harness.prisma.businessPolicyVersion.deleteMany();
    await harness.prisma.businessPolicyStream.deleteMany();

    // 11. Harness clean
    await harness.clean();
  }

  async function createBaseAcademicSetup(operationalStartDate = '2026-09-01') {
    const year = await harness.prisma.academicYear.create({
      data: {
        code: normalizedCode('Y_INT'),
        name: 'Nam hoc 2026-2027 Integration',
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
            isTeachingStaff: true,
          },
        },
      },
    });

    const principal = await harness.prisma.user.create({
      data: {
        username: normalizedCode('u_p').toLowerCase(),
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
        profile: {
          create: {
            displayName: 'Hieu truong',
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
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
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

    const makeupSlot = await harness.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'TUESDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Tiet 1 Thu 3 Day Bu',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
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
        effectiveFrom: new Date('2026-08-10T00:00:00.000Z'),
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
    const item = await harness.prisma.ppctItem.create({
      data: { ppctPlanId: plan.id, component: 'CORE' },
    });
    const revision = await harness.prisma.ppctItemRevision.create({
      data: {
        ppctVersionId: version.id,
        ppctPlanId: plan.id,
        ppctItemId: item.id,
        component: 'CORE',
        sequence: 1,
        title: 'Bai 1',
        lessonType: 'LESSON',
      },
    });
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

    // Canonical OPERATIONAL_START policy stream & version
    const opStream = await harness.prisma.businessPolicyStream.create({
      data: {
        familyKey: 'OPERATIONAL_START',
        resourceKind: 'ACADEMIC_YEAR',
        academicYearId: year.id,
      },
    });
    const opPolicyVersion = await harness.prisma.businessPolicyVersion.create({
      data: {
        streamId: opStream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: { operationalStartDate },
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
      segment,
      schoolClass,
      subject,
      staffSubject,
      slot,
      makeupSlot,
      assignment,
      timetable,
      entry,
      plan,
      version,
      item,
      revision,
      association,
      opStream,
      opPolicyVersion,
    };
  }

  async function createWorkloadAdjustmentPolicy(input: {
    academicYearId: string;
    authorUserId: string;
    baseWeeklyNorm?: number;
    rules?: unknown[];
    versionNumber?: number;
    effectiveFrom?: Date;
    effectiveUntil?: Date | null;
  }) {
    let stream = await harness.prisma.businessPolicyStream.findFirst({
      where: {
        familyKey: 'WORKLOAD_ADJUSTMENT',
        resourceKind: 'ACADEMIC_YEAR',
        academicYearId: input.academicYearId,
      },
    });
    if (!stream) {
      stream = await harness.prisma.businessPolicyStream.create({
        data: {
          familyKey: 'WORKLOAD_ADJUSTMENT',
          resourceKind: 'ACADEMIC_YEAR',
          academicYearId: input.academicYearId,
        },
      });
    }

    return harness.prisma.businessPolicyVersion.create({
      data: {
        streamId: stream.id,
        versionNumber: input.versionNumber ?? 1,
        status: 'PUBLISHED',
        payload: {
          baseWeeklyNorm: input.baseWeeklyNorm ?? 18,
          rules: input.rules ?? [],
        },
        validatorVersion: 'v1',
        effectiveFrom: input.effectiveFrom ?? new Date('2026-08-01T00:00:00.000Z'),
        effectiveUntil: input.effectiveUntil ?? null,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedByUserId: input.authorUserId,
        createdByUserId: input.authorUserId,
      },
    });
  }

  async function createCurricularExecution(input: {
    f: Awaited<ReturnType<typeof createBaseAcademicSetup>>;
    actualTeacherUserId: string;
    responsibleTeacherUserId?: string;
    executionCivilDate?: string;
    sourceCivilDate?: string;
    kind?: CurricularTeachingExecutionKind;
    status?: TeachingExecutionStatus;
    dispositionType?: 'SAME_SUBJECT_SUBSTITUTION' | null;
    makeupScheduleId?: string | null;
  }) {
    const { f } = input;
    const execDateStr = input.executionCivilDate ?? '2026-09-07';
    const srcDateStr = input.sourceCivilDate ?? '2026-09-07';
    const execDate = new Date(`${execDateStr}T00:00:00.000Z`);
    const srcDate = new Date(`${srcDateStr}T00:00:00.000Z`);
    const responsibleTeacherId = input.responsibleTeacherUserId ?? f.teacherA.id;

    let dispositionId: string | null = null;
    if (input.dispositionType === 'SAME_SUBJECT_SUBSTITUTION') {
      const disp = await harness.prisma.operationalLessonDisposition.create({
        data: {
          academicYearId: f.year.id,
          timetableVersionId: f.timetable.id,
          timetableEntryId: f.entry.id,
          sourceCivilDate: srcDate,
          academicCalendarVersionId: f.calendar.id,
          timeSlotDefinitionId: f.slot.id,
          schoolClassId: f.schoolClass.id,
          subjectId: f.subject.id,
          teachingAssignmentId: f.assignment.id,
          responsibleTeacherUserId: responsibleTeacherId,
          dispositionType: 'SAME_SUBJECT_SUBSTITUTION',
          assignedTeacherUserId: input.actualTeacherUserId,
          eligibilityCheckedAt: new Date('2026-08-01Z'),
          eligibilityWasActive: true,
          eligibilityWasTeachingStaff: true,
          eligibilitySameSubject: true,
          eligibilityStaffSubjectId: f.staffSubject.id,
          createRequestKey: crypto.randomUUID(),
          createRequestFingerprint: crypto.randomUUID(),
          createdByUserId: f.teacherA.id,
        },
      });
      dispositionId = disp.id;
    }

    return harness.prisma.curricularTeachingExecution.create({
      data: {
        kind: input.kind ?? 'NORMAL',
        status: input.status ?? 'ACTIVE',
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        sourceNormalOccurrenceKey: `norm-${crypto.randomUUID()}`,
        originalTimetableVersionId: f.timetable.id,
        originalTimetableEntryId: f.entry.id,
        sourceCivilDate: srcDate,
        sourceAcademicCalendarVersionId: f.calendar.id,
        sourceTimeSlotDefinitionId: f.slot.id,
        originalTeachingAssignmentId: f.assignment.id,
        responsibleTeacherUserId: responsibleTeacherId,
        ppctClassAssociationId: f.association.id,
        ppctPlanId: f.plan.id,
        ppctVersionId: f.version.id,
        ppctItemId: f.item.id,
        ppctItemRevisionId: f.revision.id,
        operationalLessonDispositionId: dispositionId,
        operationalDispositionType: input.dispositionType ?? null,
        makeupTeachingScheduleId: input.makeupScheduleId ?? null,
        executionCivilDate: execDate,
        executionAcademicCalendarVersionId: f.calendar.id,
        executionTimeSlotDefinitionId: input.makeupScheduleId ? f.makeupSlot.id : f.slot.id,
        executionAcademicWeekId: f.week.id,
        executionAcademicWeekSegmentId: f.segment.id,
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

  async function createNonZeroSpecialProgrammeWorkload(input: {
    f: Awaited<ReturnType<typeof createBaseAcademicSetup>>;
    teacherUserId: string;
    civilDateStr?: string;
    coefficient?: number;
  }) {
    const { f } = input;
    const dateStr = input.civilDateStr ?? '2026-09-08';
    const civilDate = new Date(`${dateStr}T00:00:00.000Z`);
    const coeff = input.coefficient ?? 1.5;

    // 1. Policy for SPECIAL_PROGRAMME_WORKLOAD
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
            GDDP: { CLASS: coeff },
            HDTN_HN: { CLASS: 1.0 },
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

    // 2. Programme Master & Plan
    const master = await harness.prisma.programmeMaster.create({
      data: {
        academicYearId: f.year.id,
        kind: 'GDDP',
        title: 'GDDP Lop 10',
        description: 'Giao duc dia phuong',
        status: 'ACTIVE',
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: f.principal.id,
      },
    });
    const planVer = await harness.prisma.programmePlanVersion.create({
      data: {
        programmeMasterId: master.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        academicYearId: f.year.id,
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        publishedByUserId: f.principal.id,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        createdByUserId: f.principal.id,
      },
    });
    const topicItem = await harness.prisma.programmeTopicItem.create({
      data: {
        programmePlanVersionId: planVer.id,
        topicCode: 'TOPIC1',
        title: 'Topic Dia phuong 1',
        sortOrder: 1,
        gradeLevel: 10,
        durationPeriods: 1,
      },
    });
    const occurrence = await harness.prisma.plannedProgrammeOccurrence.create({
      data: {
        academicYearId: f.year.id,
        programmeMasterId: master.id,
        programmePlanVersionId: planVer.id,
        programmeTopicItemId: topicItem.id,
        schoolClassId: f.schoolClass.id,
        mode: 'CLASS',
        status: 'PUBLISHED',
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        publishedByUserId: f.principal.id,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        createdByUserId: f.principal.id,
      },
    });
    const occSlot = await harness.prisma.plannedOccurrenceSlot.create({
      data: {
        academicYearId: f.year.id,
        plannedProgrammeOccurrenceId: occurrence.id,
        slotOrder: 1,
        timeSlotDefinitionId: f.slot.id,
      },
    });

    // 3. SpecialActivity root
    const staffProfile = await harness.prisma.staffProfile.findUniqueOrThrow({
      where: { userId: input.teacherUserId },
    });
    const activity = await harness.prisma.specialActivity.create({
      data: {
        academicYearId: f.year.id,
        academicCalendarVersionId: f.calendar.id,
        civilDate,
        status: SpecialActivityStatus.ACTIVE,
        scope: 'CLASS',
        title: 'Tiet GDDP',
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: f.principal.id,
        timeSlots: { create: { timeSlotDefinitionId: f.slot.id, academicYearId: f.year.id } },
        staffing: {
          create: {
            scheduledTeacherUserId: input.teacherUserId,
            staffProfileId: staffProfile.id,
            eligibilityCheckedAt: new Date('2026-08-01Z'),
            eligibilityWasActive: true,
            eligibilityWasTeachingStaff: true,
          },
        },
        classTargets: { create: { schoolClassId: f.schoolClass.id, academicYearId: f.year.id } },
      },
      include: { timeSlots: true, staffing: true },
    });

    // 4. ProgrammeMaterializedActivity
    const pma = await harness.prisma.programmeMaterializedActivity.create({
      data: {
        programmeMasterId: master.id,
        programmePlanVersionId: planVer.id,
        programmeTopicItemId: topicItem.id,
        plannedProgrammeOccurrenceId: occurrence.id,
        plannedOccurrenceSlotId: occSlot.id,
        specialActivityId: activity.id,
        materializedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    // 5. SpecialActivityParticipationExecution
    const spExecution = await harness.prisma.specialActivityParticipationExecution.create({
      data: {
        academicYearId: f.year.id,
        specialActivityId: activity.id,
        specialActivityStaffingId: activity.staffing[0]!.id,
        specialActivityTimeSlotId: activity.timeSlots[0]!.id,
        actualTeacherUserId: input.teacherUserId,
        executionCivilDate: civilDate,
        executionAcademicCalendarVersionId: f.calendar.id,
        executionTimeSlotDefinitionId: f.slot.id,
        executionAcademicWeekId: f.week.id,
        executionAcademicWeekSegmentId: f.segment.id,
        status: TeachingExecutionStatus.ACTIVE,
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: input.teacherUserId,
      },
    });

    // 6. ProgrammeOccurrenceAttestation
    const attestation = await harness.prisma.programmeOccurrenceAttestation.create({
      data: {
        programmeMasterId: master.id,
        plannedProgrammeOccurrenceId: occurrence.id,
        attestedByUserId: f.principal.id,
        authorityType: 'PRINCIPAL',
        capabilityKey: 'SPECIAL_PROGRAMME_ATTESTATION',
        scope: 'SCHOOL_WIDE',
        scopeResourceId: null,
        status: 'ACTIVE',
        attestedAt: new Date('2026-09-10T00:00:00.000Z'),
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: f.principal.id,
      },
    });

    return { master, planVer, topicItem, occurrence, occSlot, activity, pma, spExecution, attestation };
  }

  // 1. WORKLOAD_ADJUSTMENT create/publish/resolve
  it('1. WORKLOAD_ADJUSTMENT create/publish/resolve', async () => {
    const f = await createBaseAcademicSetup();
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 18,
      rules: [
        {
          ruleId: 'r_giam',
          calculation: 'TRU_TIET',
          value: 2,
          priority: 10,
          sourceKind: 'GENERAL',
        },
      ],
    });

    const resolvedPolicy = await businessConfig.resolveEffectiveBusinessPolicy(
      'WORKLOAD_ADJUSTMENT',
      { kind: 'ACADEMIC_YEAR', academicYearId: f.year.id },
      '2026-09-01',
      prisma,
    );
    expect(resolvedPolicy.outcome).toBe('RESOLVED');

    const res = await officialWorkload.projectOfficialWorkload(prisma, {
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-30',
      asOfInstant: asOf,
    });

    expect(res.status).toBe('PASS');
    expect(res.adjustmentSegments).toHaveLength(1);
    expect(res.adjustmentSegments[0]!.baseWeeklyNorm).toBe(18);
    expect(res.adjustmentSegments[0]!.adjustedWeeklyNorm).toBe(16);
    expect(res.adjustmentSegments[0]!.appliedRules).toHaveLength(1);
  });

  // 2. AdditionalDuty effective window
  it('2. AdditionalDuty effective window', async () => {
    const f = await createBaseAcademicSetup();
    const dutyDef = await harness.prisma.additionalDutyDefinition.create({
      data: {
        code: normalizedCode('DUTY_TT'),
        name: 'To truong chuyen mon',
        category: 'CHUYEN_MON',
        isActive: true,
      },
    });

    const staffProfile = await harness.prisma.staffProfile.findUniqueOrThrow({
      where: { userId: f.teacherA.id },
    });

    // Assignment active from 2026-09-01 to 2026-09-15
    await harness.prisma.staffAdditionalDutyAssignment.create({
      data: {
        staffProfileId: staffProfile.id,
        dutyDefinitionId: dutyDef.id,
        scopeType: 'SUBJECT',
        validFrom: new Date('2026-09-01T00:00:00.000Z'),
        validUntil: new Date('2026-09-15T00:00:00.000Z'),
        createdByUserId: f.principal.id,
      },
    });

    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 18,
      rules: [
        {
          ruleId: 'r_tt',
          calculation: 'TRU_TIET',
          value: 3,
          priority: 10,
          sourceKind: 'ADDITIONAL_DUTY',
          dutyDefinitionId: dutyDef.id,
        },
      ],
    });

    const res = await officialWorkload.projectOfficialWorkload(prisma, {
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-30',
      asOfInstant: asOf,
    });

    expect(res.status).toBe('PASS');
    expect(res.adjustmentSegments).toHaveLength(2);
    // Segment 1 (with duty active)
    expect(res.adjustmentSegments[0]!.fromCivilDate).toBe('2026-09-01');
    expect(res.adjustmentSegments[0]!.toCivilDate).toBe('2026-09-15');
    expect(res.adjustmentSegments[0]!.adjustedWeeklyNorm).toBe(15);
    expect(res.adjustmentSegments[0]!.appliedRules).toHaveLength(1);
    // Segment 2 (duty expired)
    expect(res.adjustmentSegments[1]!.fromCivilDate).toBe('2026-09-16');
    expect(res.adjustmentSegments[1]!.toCivilDate).toBe('2026-09-30');
    expect(res.adjustmentSegments[1]!.adjustedWeeklyNorm).toBe(18);
    expect(res.adjustmentSegments[1]!.appliedRules).toHaveLength(0);
  });

  // 3. Homeroom effective window
  it('3. Homeroom effective window', async () => {
    const f = await createBaseAcademicSetup();

    // Homeroom assignment active from 2026-09-01 to 2026-09-10
    await harness.prisma.homeroomAssignment.create({
      data: {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        teacherUserId: f.teacherA.id,
        validFrom: new Date('2026-09-01T00:00:00.000Z'),
        validUntil: new Date('2026-09-10T00:00:00.000Z'),
        status: HomeroomAssignmentStatus.ACTIVE,
        createdByUserId: f.principal.id,
      },
    });

    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 18,
      rules: [
        {
          ruleId: 'r_gvcn',
          calculation: 'TRU_TIET',
          value: 4,
          priority: 10,
          sourceKind: 'HOMEROOM_RESPONSIBILITY',
        },
      ],
    });

    const res = await officialWorkload.projectOfficialWorkload(prisma, {
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-30',
      asOfInstant: asOf,
    });

    expect(res.status).toBe('PASS');
    expect(res.adjustmentSegments).toHaveLength(2);
    // Segment 1 (homeroom active)
    expect(res.adjustmentSegments[0]!.fromCivilDate).toBe('2026-09-01');
    expect(res.adjustmentSegments[0]!.toCivilDate).toBe('2026-09-10');
    expect(res.adjustmentSegments[0]!.adjustedWeeklyNorm).toBe(14);
    expect(res.adjustmentSegments[0]!.appliedRules).toHaveLength(1);
    // Segment 2 (homeroom expired)
    expect(res.adjustmentSegments[1]!.fromCivilDate).toBe('2026-09-11');
    expect(res.adjustmentSegments[1]!.toCivilDate).toBe('2026-09-30');
    expect(res.adjustmentSegments[1]!.adjustedWeeklyNorm).toBe(18);
    expect(res.adjustmentSegments[1]!.appliedRules).toHaveLength(0);
  });

  // 4. ACTIVE NORMAL actual-teacher credit
  it('4. ACTIVE NORMAL actual-teacher credit', async () => {
    const f = await createBaseAcademicSetup();
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
    });

    // 2 active teaching executions
    await createCurricularExecution({ f, actualTeacherUserId: f.teacherA.id, executionCivilDate: '2026-09-07' });
    await createCurricularExecution({ f, actualTeacherUserId: f.teacherA.id, executionCivilDate: '2026-09-14' });

    const res = await officialWorkload.projectOfficialWorkload(prisma, {
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-30',
      asOfInstant: asOf,
    });

    expect(res.status).toBe('PASS');
    expect(res.curricularCredit).toBe(2);
    expect(res.curricularContributions).toHaveLength(2);
  });

  // 5. SAME_SUBJECT_SUBSTITUTION credits substitute only
  it('5. SAME_SUBJECT_SUBSTITUTION credits substitute only', async () => {
    const f = await createBaseAcademicSetup();
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
    });

    // Substitution: teacherB teaches, teacherA is responsible
    await createCurricularExecution({
      f,
      actualTeacherUserId: f.teacherB.id,
      responsibleTeacherUserId: f.teacherA.id,
      dispositionType: 'SAME_SUBJECT_SUBSTITUTION',
      executionCivilDate: '2026-09-07',
    });

    // Check teacherB (substitute)
    const resB = await officialWorkload.projectOfficialWorkload(prisma, {
      academicYearId: f.year.id,
      targetUserId: f.teacherB.id,
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-30',
      asOfInstant: asOf,
    });
    expect(resB.curricularCredit).toBe(1);

    // Check teacherA (responsible)
    const resA = await officialWorkload.projectOfficialWorkload(prisma, {
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-30',
      asOfInstant: asOf,
    });
    expect(resA.curricularCredit).toBe(0);
  });

  // 6. MAKEUP execution-date ownership
  it('6. MAKEUP execution-date ownership', async () => {
    const f = await createBaseAcademicSetup();
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
    });

    const makeupSchedule = await harness.prisma.makeupTeachingSchedule.create({
      data: {
        academicYearId: f.year.id,
        originalTimetableVersionId: f.timetable.id,
        originalTimetableEntryId: f.entry.id,
        originalCivilDate: new Date('2026-09-02T00:00:00.000Z'),
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
        targetCivilDate: new Date('2026-09-20T00:00:00.000Z'),
        targetAcademicCalendarVersionId: f.calendar.id,
        targetTimeSlotDefinitionId: f.makeupSlot.id,
        scheduledTeacherUserId: f.teacherA.id,
        eligibilityCheckedAt: new Date('2026-08-01Z'),
        eligibilityWasActive: true,
        eligibilityWasTeachingStaff: true,
        eligibilitySameSubject: true,
        eligibilityStaffSubjectId: f.staffSubject.id,
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: f.teacherA.id,
      },
    });

    await createCurricularExecution({
      f,
      actualTeacherUserId: f.teacherA.id,
      kind: CurricularTeachingExecutionKind.MAKEUP,
      sourceCivilDate: '2026-09-02',
      executionCivilDate: '2026-09-20',
      makeupScheduleId: makeupSchedule.id,
    });

    // Query covering originalCivilDate (2026-09-01..2026-09-10) => credit = 0
    const earlyRes = await officialWorkload.projectOfficialWorkload(prisma, {
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-10',
      asOfInstant: asOf,
    });
    expect(earlyRes.curricularCredit).toBe(0);

    // Query covering executionCivilDate (2026-09-15..2026-09-25) => credit = 1
    const lateRes = await officialWorkload.projectOfficialWorkload(prisma, {
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-15',
      toCivilDate: '2026-09-25',
      asOfInstant: asOf,
    });
    expect(lateRes.curricularCredit).toBe(1);
  });

  // 7. REVERSED execution exclusion
  it('7. REVERSED execution exclusion', async () => {
    const f = await createBaseAcademicSetup();
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
    });

    await createCurricularExecution({
      f,
      actualTeacherUserId: f.teacherA.id,
      status: TeachingExecutionStatus.ACTIVE,
      executionCivilDate: '2026-09-07',
    });
    await createCurricularExecution({
      f,
      actualTeacherUserId: f.teacherA.id,
      status: TeachingExecutionStatus.REVERSED,
      executionCivilDate: '2026-09-14',
    });

    const res = await officialWorkload.projectOfficialWorkload(prisma, {
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-30',
      asOfInstant: asOf,
    });

    expect(res.curricularCredit).toBe(1);
    expect(res.curricularContributions).toHaveLength(1);
  });

  // 8. combined curricular + P4-050 credit (real non-zero P4-050 contribution)
  it('8. combined curricular + P4-050 credit', async () => {
    const f = await createBaseAcademicSetup();
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
    });

    // 1 regular curricular teaching execution (credit = 1)
    await createCurricularExecution({
      f,
      actualTeacherUserId: f.teacherA.id,
      executionCivilDate: '2026-09-07',
    });

    // Real non-zero P4-050 SpecialActivity + execution + attestation (coeff 1.5 => credit 1.5)
    await createNonZeroSpecialProgrammeWorkload({
      f,
      teacherUserId: f.teacherA.id,
      civilDateStr: '2026-09-08',
      coefficient: 1.5,
    });

    const res = await officialWorkload.projectOfficialWorkload(prisma, {
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-30',
      asOfInstant: asOf,
    });

    expect(res.status).toBe('PASS');
    expect(res.curricularCredit).toBe(1);
    expect(res.specialProgrammeCredit).toBe(1.5);
    expect(res.earnedCredit).toBe(2.5);
    expect(res.earnedCredit).toBe(res.curricularCredit + res.specialProgrammeCredit);
    expect(res.specialProgrammeWorkload.contributions).toHaveLength(1);
    expect(res.specialProgrammeWorkload.contributions[0]!.credit).toBe(1.5);
  });

  // 9. arbitrary partial-range/calendar proration
  it('9. arbitrary partial-range/calendar proration', async () => {
    const f = await createBaseAcademicSetup();
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 18, // 18 / 6 = 3 daily
    });

    // Partial range: exactly 10 civil days (2026-09-05 to 2026-09-14)
    const res = await officialWorkload.projectOfficialWorkload(prisma, {
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-05',
      toCivilDate: '2026-09-14',
      asOfInstant: asOf,
    });

    expect(res.adjustmentSegments).toHaveLength(1);
    expect(res.adjustmentSegments[0]!.dailyRequiredCredit).toBe(3);
    // 10 days * 3 credit/day = 30 required credit
    expect(res.requiredCredit).toBe(30);
  });

  // 10. policy change inside report range
  it('10. policy change inside report range', async () => {
    const f = await createBaseAcademicSetup();

    // Policy Version 1: 18 norm (effective 2026-08-01 -> 2026-09-14)
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 18,
      versionNumber: 1,
      effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
      effectiveUntil: new Date('2026-09-14T00:00:00.000Z'),
    });

    // Policy Version 2: 12 norm (effective 2026-09-15 onwards)
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 12,
      versionNumber: 2,
      effectiveFrom: new Date('2026-09-15T00:00:00.000Z'),
      effectiveUntil: null,
    });

    const res = await officialWorkload.projectOfficialWorkload(prisma, {
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-30',
      asOfInstant: asOf,
    });

    expect(res.adjustmentSegments).toHaveLength(2);
    expect(res.adjustmentSegments[0]!.fromCivilDate).toBe('2026-09-01');
    expect(res.adjustmentSegments[0]!.toCivilDate).toBe('2026-09-14');
    expect(res.adjustmentSegments[0]!.baseWeeklyNorm).toBe(18);

    expect(res.adjustmentSegments[1]!.fromCivilDate).toBe('2026-09-15');
    expect(res.adjustmentSegments[1]!.toCivilDate).toBe('2026-09-30');
    expect(res.adjustmentSegments[1]!.baseWeeklyNorm).toBe(12);
  });

  // 11. Reporting Statement submit persists SNAPSHOT_V4
  it('11. Reporting Statement submit persists SNAPSHOT_V4', async () => {
    const f = await createBaseAcademicSetup();
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 18,
    });

    await createCurricularExecution({
      f,
      actualTeacherUserId: f.teacherA.id,
      executionCivilDate: '2026-09-07',
    });

    mockProjectionService.resolveInTransaction.mockResolvedValue({
      profile: 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1',
      scope: {
        academicYearId: f.year.id,
        targetUserId: f.teacherA.id,
        fromCivilDate: '2026-09-01',
        toCivilDate: '2026-09-30',
        asOfInstant: asOf,
      },
      status: 'PASS',
      counts: { distributedElapsedCount: 1, completedCount: 1, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 0 },
      responsibilityState: 'RESPONSIBILITY_PRESENT',
      responsibilityManifest: [
        {
          teachingAssignmentId: f.assignment.id,
          schoolClassId: f.schoolClass.id,
          subjectId: f.subject.id,
          validFrom: '2026-09-01',
          validUntil: null,
        },
      ],
      sections: [],
      findings: [],
      evaluatedAt: asOf.toISOString(),
    });

    // Grant capability so authorization check passes
    await harness.seedCapabilities([
      { key: 'REPORTING_STATEMENT_SUBMIT', scopes: ['PERSONAL'] },
      { key: 'REPORTING_STATEMENT_READ', scopes: ['PERSONAL'] },
    ]);

    const submitRes = await reportingService.submit(
      {
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        academicYearId: f.year.id,
        fromCivilDate: '2026-09-01' as CivilDateString,
        toCivilDate: '2026-09-30' as CivilDateString,
        requestKey: crypto.randomUUID(),
      },
      { auth: { user: { id: f.teacherA.id, mustChangePassword: false } } } as never,
    );

    expect(submitRes.outcome).toBe('CREATED');
    expect(submitRes.revisionId).toBeTruthy();

    const revision = await harness.prisma.reportingStatementRevision.findUniqueOrThrow({
      where: { id: submitRes.revisionId },
    });

    expect(revision.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V4);
    expect(revision.serializerVersion).toBe('REPORTING_STATEMENT_SERIALIZER_V1');
    expect(revision.semanticHash).toBeTruthy();

    const parsedSnapshot = JSON.parse(revision.canonicalSnapshotJson);
    expect(parsedSnapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V4);
    expect(parsedSnapshot.officialWorkload).toBeDefined();
    expect(parsedSnapshot.officialWorkload.curricularCredit).toBe(1);

    expect(() =>
      assertFrozenReportingStatementIntegrity({
        snapshot: parsedSnapshot,
        canonicalSnapshotJson: revision.canonicalSnapshotJson,
        semanticHash: revision.semanticHash,
        frozenSubjectIds: [f.subject.id],
      } as never),
    ).not.toThrow();
  });

  // 12. later policy/duty/homeroom mutation does not rewrite frozen V4
  it('12. later policy/duty/homeroom mutation does not rewrite frozen V4', async () => {
    const f = await createBaseAcademicSetup();
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 18,
    });

    await createCurricularExecution({
      f,
      actualTeacherUserId: f.teacherA.id,
      executionCivilDate: '2026-09-07',
    });

    mockProjectionService.resolveInTransaction.mockResolvedValue({
      profile: 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1',
      scope: {
        academicYearId: f.year.id,
        targetUserId: f.teacherA.id,
        fromCivilDate: '2026-09-01',
        toCivilDate: '2026-09-30',
        asOfInstant: asOf,
      },
      status: 'PASS',
      counts: { distributedElapsedCount: 1, completedCount: 1, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 0 },
      responsibilityState: 'RESPONSIBILITY_PRESENT',
      responsibilityManifest: [
        {
          teachingAssignmentId: f.assignment.id,
          schoolClassId: f.schoolClass.id,
          subjectId: f.subject.id,
          validFrom: '2026-09-01',
          validUntil: null,
        },
      ],
      sections: [],
      findings: [],
      evaluatedAt: asOf.toISOString(),
    });

    await harness.seedCapabilities([
      { key: 'REPORTING_STATEMENT_SUBMIT', scopes: ['PERSONAL'] },
      { key: 'REPORTING_STATEMENT_READ', scopes: ['PERSONAL'] },
    ]);

    const submitRes = await reportingService.submit(
      {
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        academicYearId: f.year.id,
        fromCivilDate: '2026-09-01' as CivilDateString,
        toCivilDate: '2026-09-30' as CivilDateString,
        requestKey: crypto.randomUUID(),
      },
      { auth: { user: { id: f.teacherA.id, mustChangePassword: false } } } as never,
    );

    const revisionBefore = await harness.prisma.reportingStatementRevision.findUniqueOrThrow({
      where: { id: submitRes.revisionId },
    });
    const frozenJsonBefore = revisionBefore.canonicalSnapshotJson;
    const semanticHashBefore = revisionBefore.semanticHash;

    // Mutate downstream authorities after submit:
    // 1. Mutate WORKLOAD_ADJUSTMENT policy
    await createWorkloadAdjustmentPolicy({
      academicYearId: f.year.id,
      authorUserId: f.principal.id,
      baseWeeklyNorm: 30, // Changed from 18 to 30
      versionNumber: 2,
    });

    // 2. Mutate StaffAdditionalDutyAssignment
    const dutyDef = await harness.prisma.additionalDutyDefinition.create({
      data: {
        code: normalizedCode('DUTY_MUT'),
        name: 'Nhiem vu moi sau submit',
        category: 'CHUYEN_MON',
        isActive: true,
      },
    });
    const staffProfile = await harness.prisma.staffProfile.findUniqueOrThrow({
      where: { userId: f.teacherA.id },
    });
    await harness.prisma.staffAdditionalDutyAssignment.create({
      data: {
        staffProfileId: staffProfile.id,
        dutyDefinitionId: dutyDef.id,
        scopeType: 'SCHOOL_WIDE',
        validFrom: new Date('2026-09-01T00:00:00.000Z'),
        createdByUserId: f.principal.id,
      },
    });

    // 3. Mutate HomeroomAssignment
    await harness.prisma.homeroomAssignment.create({
      data: {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        teacherUserId: f.teacherA.id,
        validFrom: new Date('2026-09-01T00:00:00.000Z'),
        status: HomeroomAssignmentStatus.ACTIVE,
        createdByUserId: f.principal.id,
      },
    });

    // Re-read revision from database
    const revisionAfter = await harness.prisma.reportingStatementRevision.findUniqueOrThrow({
      where: { id: submitRes.revisionId },
    });

    // Invariant: frozen JSON and semanticHash are immutable
    expect(revisionAfter.canonicalSnapshotJson).toBe(frozenJsonBefore);
    expect(revisionAfter.semanticHash).toBe(semanticHashBefore);

    // Present detail still faithfully represents the frozen snapshot
    const presented = presentReportingStatementDetail(revisionAfter.canonicalSnapshotJson as never);
    expect(presented.officialWorkload).toBeDefined();
    expect(presented.officialWorkload!.adjustmentSegments[0]!.baseWeeklyNorm).toBe(18); // Kept 18, not mutated to 30
  });
});
