import { randomUUID } from 'node:crypto';
import {
  CurricularTeachingExecutionKind,
  HomeroomAssignmentStatus,
  OperationalLessonDispositionType,
  OperationalOverlayStatus,
  SpecialActivityScope,
  SpecialActivityStatus,
  TeachingExecutionStatus,
  UserStatus,
} from '@prisma/client';
import {
  CivilDateString,
} from '@baogiang/contracts';
import { integration, normalizedCode, Phase01Harness, testOrigin, testPassword } from '../helpers/phase01-test-harness';
import { ProgressDebtService } from '../../src/progress-debt/progress-debt.service';
import { ReportingProjectionService } from '../../src/reporting-projection/reporting-projection.service';
import { OfficialWorkloadProjectionService } from '../../src/official-workload/official-workload-projection.service';
import { SpecialProgrammeWorkloadProjectionService } from '../../src/special-programme-workload/special-programme-workload-projection.service';
import { ReportingStatementsService } from '../../src/reporting-statements/reporting-statements.service';
import { EffectiveScheduleService } from '../../src/effective-schedule/effective-schedule.service';
import { PpctOccurrenceAllocationService } from '../../src/ppct-occurrence-allocation/ppct-occurrence-allocation.service';
import { HistoricalTeachingService } from '../../src/historical-teaching/historical-teaching.service';
import { MakeupSchedulesService } from '../../src/operational-overlays/makeup-schedules.service';
import { OVERLAY_CLOCK } from '../../src/operational-overlays/operational-overlay-policy';
import { TeachingExecutionsService } from '../../src/teaching-executions/teaching-executions.service';
import { ProgrammePlanningService } from '../../src/programme-planning/programme-planning.service';
import { AuthenticatedRequest } from '../../src/auth/auth.types';
import {
  assertFrozenReportingStatementIntegrity,
  REPORTING_STATEMENT_SNAPSHOT_V4,
} from '../../src/reporting-statement-internal/reporting-statement-canonicalizer';

const fixedNow = new Date('2026-09-07T08:00:00.000Z');
const fixedClock = {
  now: () => new Date(fixedNow.getTime()),
};

integration('P5-010: Full Business Pilot Cross-Domain Freeze PostgreSQL Suite', () => {
  const harness = new Phase01Harness();
  let progressDebt: ProgressDebtService;
  let reportingProjection: ReportingProjectionService;
  let officialWorkload: OfficialWorkloadProjectionService;
  let specialWorkload: SpecialProgrammeWorkloadProjectionService;
  let reportingStatements: ReportingStatementsService;
  let effectiveSchedule: EffectiveScheduleService;
  let ppctAllocation: PpctOccurrenceAllocationService;
  let historicalTeaching: HistoricalTeachingService;
  let makeupSchedules: MakeupSchedulesService;
  let teachingExecutions: TeachingExecutionsService;
  let programmePlanning: ProgrammePlanningService;

  beforeAll(async () => {
    await harness.start([
      { token: OVERLAY_CLOCK, value: fixedClock },
    ]);
    progressDebt = harness.app.get(ProgressDebtService);
    reportingProjection = harness.app.get(ReportingProjectionService);
    officialWorkload = harness.app.get(OfficialWorkloadProjectionService);
    specialWorkload = harness.app.get(SpecialProgrammeWorkloadProjectionService);
    reportingStatements = harness.app.get(ReportingStatementsService);
    effectiveSchedule = harness.app.get(EffectiveScheduleService);
    ppctAllocation = harness.app.get(PpctOccurrenceAllocationService);
    historicalTeaching = harness.app.get(HistoricalTeachingService, { strict: false });
    makeupSchedules = harness.app.get(MakeupSchedulesService);
    teachingExecutions = harness.app.get(TeachingExecutionsService, { strict: false });
    programmePlanning = harness.app.get(ProgrammePlanningService, { strict: false });
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
    await seedRequiredCapabilities();
  });

  async function seedRequiredCapabilities(): Promise<void> {
    await harness.seedCapabilities([
      { key: 'APPROVAL_PRINCIPAL', scopes: ['SCHOOL_WIDE'] },
      { key: 'APPROVAL_VICE_PRINCIPAL', scopes: ['SCHOOL_WIDE'] },
      { key: 'GDDP_COORDINATOR', scopes: ['ACTIVITY'] },
      { key: 'HĐTN_COORDINATOR', scopes: ['ACTIVITY'] },
      { key: 'SPECIAL_ACTIVITY_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'TEACHING_EXECUTION_RECORD', scopes: ['PERSONAL'] },
      { key: 'TEACHING_EXECUTION_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
      { key: 'TEACHING_OPERATION_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
      { key: 'CALENDAR_EXCEPTION_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'BUSINESS_CONFIGURATION_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'REPORTING_STATEMENT_SUBMIT', scopes: ['PERSONAL'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
  }

  async function cleanSuite(): Promise<void> {
    await harness.prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "audit_events",
        "auth_sessions",
        "capability_grants",
        "capability_definitions",
        "subject_groups",
        "academic_years",
        "users"
      CASCADE;
    `);
    await harness.clean();
  }

  function mockAuthRequest(user: { id: string; username?: string; displayName?: string }): AuthenticatedRequest {
    return {
      auth: {
        sessionId: `sess-${randomUUID().slice(0, 8)}`,
        user: {
          id: user.id,
          username: user.username ?? 'actor',
          displayName: user.displayName ?? 'Actor',
          mustChangePassword: false,
        },
      },
      header: (name: string) => (name.toLowerCase() === 'origin' ? testOrigin : undefined),
      headers: { origin: testOrigin },
    } as unknown as AuthenticatedRequest;
  }

  async function createBaseAcademicSetup(options?: { operationalStartDate?: string }) {
    const year = await harness.prisma.academicYear.create({
      data: {
        code: normalizedCode('Y_P5'),
        name: 'Nam hoc 2026-2027 P5 Freeze',
      },
    });

    const teacherAPasswordHash = await harness.passwords.hash(testPassword);
    const teacherA = await harness.prisma.user.create({
      data: {
        username: normalizedCode('u_ta').toLowerCase(),
        passwordHash: teacherAPasswordHash,
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
      include: { profile: true },
    });

    const teacherB = await harness.prisma.user.create({
      data: {
        username: normalizedCode('u_tb').toLowerCase(),
        passwordHash: teacherAPasswordHash,
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
      include: { profile: true },
    });

    const principal = await harness.prisma.user.create({
      data: {
        username: normalizedCode('u_pr').toLowerCase(),
        passwordHash: teacherAPasswordHash,
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
      include: { profile: true },
    });

    // Grant teacherA capability to record personal executions and submit personal statements
    await harness.prisma.capabilityGrant.createMany({
      data: [
        { userId: teacherA.id, capabilityKey: 'TEACHING_EXECUTION_RECORD', scopeType: 'PERSONAL' },
        { userId: teacherA.id, capabilityKey: 'REPORTING_STATEMENT_SUBMIT', scopeType: 'PERSONAL' },
        { userId: teacherB.id, capabilityKey: 'TEACHING_EXECUTION_RECORD', scopeType: 'PERSONAL' },
        { userId: principal.id, capabilityKey: 'TEACHING_EXECUTION_MANAGE', scopeType: 'SCHOOL_WIDE' },
        { userId: principal.id, capabilityKey: 'TEACHING_OPERATION_MANAGE', scopeType: 'SCHOOL_WIDE' },
        { userId: principal.id, capabilityKey: 'APPROVAL_PRINCIPAL', scopeType: 'SCHOOL_WIDE' },
        { userId: principal.id, capabilityKey: 'SPECIAL_ACTIVITY_MANAGE', scopeType: 'SCHOOL_WIDE' },
        { userId: principal.id, capabilityKey: 'GDDP_COORDINATOR', scopeType: 'SCHOOL_WIDE' },
        { userId: principal.id, capabilityKey: 'HĐTN_COORDINATOR', scopeType: 'SCHOOL_WIDE' },
      ],
    });

    const calendar = await harness.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T00:00:00.000Z'),
        officialWeekCount: 35,
        reserveWeekCount: 1,
        teachingWeekdays: ['MONDAY', 'TUESDAY'],
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
        allowMakeupTeaching: false,
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
        payload: { operationalStartDate: options?.operationalStartDate ?? '2026-08-01' },
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

  // =========================================================================
  // SCENARIO 1: Normal curriculum happy path
  // =========================================================================
  it('Scenario 1: Normal curriculum happy path preserves canonical identities and provenance', async () => {
    const f = await createBaseAcademicSetup();

    const allocation = await ppctAllocation.resolve({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: '2026-09-07',
    });

    expect(allocation.status).toBe('PASS');
    expect(allocation.normalAllocations).toHaveLength(1);
    const occ = allocation.normalAllocations[0]!;
    expect(occ.occurrence.civilDate).toBe('2026-09-07');
    expect(occ.allocationStatus).toBe('ALLOCATED');
    expect(occ.expectedPpctItem?.ppctItemId).toBe(f.item.id);

    // Confirm execution via production service TeachingExecutionsService.confirmNormal
    const execResult = await teachingExecutions.confirmNormal(
      {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        timetableEntryId: f.entry.id,
        sourceCivilDate: '2026-09-07',
        requestKey: `sc1-normal-exec-${randomUUID()}`,
      },
      mockAuthRequest(f.teacherA),
    );
    expect(execResult.outcome).toBe('CREATED');
    const execution = execResult.item;

    expect(execution.kind).toBe(CurricularTeachingExecutionKind.NORMAL);
    expect(execution.actualTeacherUserId).toBe(f.teacherA.id);

    const asOf = new Date('2026-09-07T18:00:00.000Z');
    const progress = await progressDebt.resolve({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      asOfInstant: asOf,
    });

    expect(progress.status).toBe('PASS');
    expect(progress.counts!.completedCount).toBe(1);
    expect(progress.counts!.openDebtCount).toBe(0);

    const report = await reportingProjection.resolve({
      academicYearId: f.year.id,
      roots: [{ schoolClassId: f.schoolClass.id, subjectId: f.subject.id }],
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: asOf,
    });
    expect(report.status).toBe('PASS');
    expect(report.counts!.completedCount).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // SCENARIO 2: CORE + SPECIALIZED_STUDY routing & independent progression (Correction A)
  // =========================================================================
  it('Scenario 2: CORE and SPECIALIZED_STUDY route deterministically within week and progress independently', async () => {
    const f = await createBaseAcademicSetup();

    // Mark previous version SUPERSEDED to adhere to ppct_versions_one_published_per_plan_key
    await harness.prisma.ppctVersion.update({
      where: { id: f.version.id },
      data: {
        status: 'SUPERSEDED',
        supersededByUserId: f.teacherA.id,
        supersededAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    const specVer = await harness.prisma.ppctVersion.create({
      data: {
        ppctPlanId: f.plan.id,
        versionNumber: 2,
        status: 'PUBLISHED',
        createdByUserId: f.teacherA.id,
        publishedByUserId: f.teacherA.id,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    const coreItem = await harness.prisma.ppctItem.create({
      data: { ppctPlanId: f.plan.id, component: 'CORE' },
    });
    await harness.prisma.ppctItemRevision.create({
      data: {
        ppctVersionId: specVer.id,
        ppctPlanId: f.plan.id,
        ppctItemId: coreItem.id,
        component: 'CORE',
        sequence: 1,
        title: 'Core Lesson 1',
        lessonType: 'LESSON',
      },
    });

    const specItem = await harness.prisma.ppctItem.create({
      data: { ppctPlanId: f.plan.id, component: 'SPECIALIZED_STUDY' },
    });
    await harness.prisma.ppctItemRevision.create({
      data: {
        ppctVersionId: specVer.id,
        ppctPlanId: f.plan.id,
        ppctItemId: specItem.id,
        component: 'SPECIALIZED_STUDY',
        sequence: 1,
        title: 'Chuyen de 1',
        lessonType: 'LESSON',
      },
    });

    await harness.prisma.ppctClassAssociation.updateMany({
      where: { schoolClassId: f.schoolClass.id, subjectId: f.subject.id },
      data: {
        ppctPlanId: f.plan.id,
        ppctVersionId: specVer.id,
        curricularProfile: 'CORE_PLUS_SPECIALIZED_STUDY',
      },
    });

    // Occurrence allocation v2 resolves both CORE on Monday and SPECIALIZED_STUDY on Tuesday
    const allocation = await ppctAllocation.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: '2026-09-08',
    });

    expect(allocation.status).toBe('PASS');
    expect(allocation.normalAllocations).toHaveLength(2);

    const monAlloc = allocation.normalAllocations.find((a) => a.occurrence.civilDate === '2026-09-07')!;
    const tueAlloc = allocation.normalAllocations.find((a) => a.occurrence.civilDate === '2026-09-08')!;

    expect(monAlloc.plannedComponent).toBe('CORE');
    expect(monAlloc.expectedPpctItem?.component).toBe('CORE');
    expect(monAlloc.expectedPpctItem?.ppctItemId).toBe(coreItem.id);

    expect(tueAlloc.plannedComponent).toBe('SPECIALIZED_STUDY');
    expect(tueAlloc.expectedPpctItem?.component).toBe('SPECIALIZED_STUDY');
    expect(tueAlloc.expectedPpctItem?.ppctItemId).toBe(specItem.id);

    // Step A: Execute CORE only on Monday via production service
    await teachingExecutions.confirmNormal(
      {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        timetableEntryId: f.entry.id,
        sourceCivilDate: '2026-09-07',
        requestKey: `sc2-core-exec-${randomUUID()}`,
      },
      mockAuthRequest(f.teacherA),
    );

    // ProgressDebtService.resolveV2 through Monday shows CORE completed, Tuesday still pending
    const progressMon = await progressDebt.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      asOfInstant: new Date('2026-09-07T18:00:00.000Z'),
    });
    expect(progressMon.status).toBe('PASS');
    const monItem = progressMon.items.find((i) => i.sourceCivilDate === '2026-09-07')!;
    expect(monItem.classification).toBe('COMPLETED');
    expect(monItem.component).toBe('CORE');

    // Step B: ProgressDebtService.resolveV2 through Tuesday shows CORE completed, but SPECIALIZED_STUDY was NOT consumed by CORE
    const progressTueBefore = await progressDebt.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      asOfInstant: new Date('2026-09-08T18:00:00.000Z'),
    });
    expect(progressTueBefore.status).toBe('PASS');
    const tueItemPending = progressTueBefore.items.find((i) => i.sourceCivilDate === '2026-09-08')!;
    expect(tueItemPending.classification).toBe('UNCONFIRMED_COMPLETION_GAP');
    expect(tueItemPending.component).toBe('SPECIALIZED_STUDY');

    // Step C: Execute SPECIALIZED_STUDY on Tuesday via production service
    await teachingExecutions.confirmNormal(
      {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        timetableEntryId: f.entry2.id,
        sourceCivilDate: '2026-09-08',
        requestKey: `sc2-spec-exec-${randomUUID()}`,
      },
      mockAuthRequest(f.teacherA),
    );

    const progressTueAfter = await progressDebt.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      asOfInstant: new Date('2026-09-08T18:00:00.000Z'),
    });
    expect(progressTueAfter.status).toBe('PASS');
    expect(progressTueAfter.counts!.completedCount).toBe(2);

    // SPECIALIZED_STUDY never creates SpecialActivity records (remains ordinary curriculum)
    const specialActivityCount = await harness.prisma.specialActivity.count({
      where: { academicYearId: f.year.id },
    });
    expect(specialActivityCount).toBe(0);
  });

  // =========================================================================
  // SCENARIO 3: Delayed go-live & Historical Ingestion (Correction B)
  // =========================================================================
  it('Scenario 3: Delayed go-live guards pre-operational period and ingests historical truth via production HistoricalTeachingService', async () => {
    // Set OPERATIONAL_START to 2026-09-10 (making 2026-09-07 and 2026-09-08 strictly pre-operational)
    const f = await createBaseAcademicSetup({ operationalStartDate: '2026-09-10' });

    const teacherCode = f.teacherA.profile!.staffCode!;
    const sourceText = [
      'LOP,MON,NGAY_GOC,BUOI_GOC,TIET_GOC,GIAO_VIEN_THUC_DAY,LOAI,NGAY_DAY_THUC_TE,BUOI_THUC_TE,TIET_THUC_TE,GHI_CHU',
      `${f.schoolClass.code},${f.subject.code},2026-09-07,SANG,1,${teacherCode},BINH_THUONG,2026-09-07,SANG,1,Lich su xac minh qua production`,
    ].join('\n');

    // Call production HistoricalTeachingService.preview
    const previewRes = await historicalTeaching.preview({
      academicYearId: f.year.id,
      sourceText,
    });
    expect(previewRes.canConfirm).toBe(true);
    expect(previewRes.rows).toHaveLength(1);
    expect(previewRes.rows[0]!.kind).toBe('NORMAL');

    // Call production HistoricalTeachingService.confirm
    const confirmRes = await historicalTeaching.confirm(
      {
        academicYearId: f.year.id,
        sourceText,
        batchRef: previewRes.batchRef,
        requestFingerprint: previewRes.requestFingerprint,
        requestKey: `hist-req-p5-${randomUUID()}`,
      },
      mockAuthRequest(f.principal),
    );
    expect(confirmRes.outcome).toBe('CREATED');
    expect(confirmRes.rows).toHaveLength(1);
    const executionId = confirmRes.rows[0]!.executionId!;
    expect(executionId).toBeDefined();

    // Verify retained HistoricalTeachingImportBatch and Row provenance in DB
    const batch = await harness.prisma.historicalTeachingImportBatch.findUniqueOrThrow({
      where: { id: confirmRes.batchId },
      include: { rows: true },
    });
    expect(batch.academicYearId).toBe(f.year.id);
    expect(batch.rows).toHaveLength(1);
    expect(batch.rows[0]!.curricularTeachingExecutionId).toBe(executionId);

    // Verify canonical CurricularTeachingExecution created
    const exec = await harness.prisma.curricularTeachingExecution.findUniqueOrThrow({
      where: { id: executionId },
    });
    expect(exec.status).toBe(TeachingExecutionStatus.ACTIVE);
    expect(exec.actualTeacherUserId).toBe(f.teacherA.id);
    expect(exec.ppctItemId).toBe(f.item.id);

    // Assert pre-operational missing occurrence on 2026-09-08 does NOT trigger debt
    const progress = await progressDebt.resolve({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      asOfInstant: new Date('2026-09-09T00:00:00.000Z'),
    });
    expect(progress.status).toBe('PASS');
    expect(progress.counts!.openDebtCount).toBe(0);
    expect(progress.counts!.unconfirmedGapCount).toBe(0);
    expect(progress.counts!.completedCount).toBe(1);

    // Seed minimal workload policy to verify official workload projection receives historical execution
    const wlStream = await harness.prisma.businessPolicyStream.create({
      data: { familyKey: 'WORKLOAD_ADJUSTMENT', resourceKind: 'ACADEMIC_YEAR', academicYearId: f.year.id },
    });
    await harness.prisma.businessPolicyVersion.create({
      data: {
        streamId: wlStream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: { baseWeeklyNorm: 17, rules: [] },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedByUserId: f.principal.id,
        createdByUserId: f.principal.id,
      },
    });

    const workload = await officialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: new Date('2026-09-13T00:00:00.000Z'),
    });
    expect(workload.status).toBe('PASS');
    expect(workload.curricularWorkload.totalCredit).toBe(1);
  });

  // =========================================================================
  // SCENARIO 4: Public MAKEUP scheduling (Correction C)
  // =========================================================================
  it('Scenario 4: Public make-up fulfills original obligation without consuming new PPCT item and resolves debt', async () => {
    const f = await createBaseAcademicSetup();

    // Create operational disposition: Teacher A absent on Monday 2026-09-07
    const disposition = await harness.prisma.operationalLessonDisposition.create({
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
        createRequestKey: `disp-sc4-${randomUUID()}`,
        createRequestFingerprint: 'fp-disp-sc4',
        createdByUserId: f.principal.id,
      },
    });

    const sourceNormalOccurrenceKey = `NORMAL:${f.entry.id}:2026-09-07`;

    // 1. ProgressDebtService shows proven open debt
    const debtBefore = await progressDebt.resolve({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      asOfInstant: new Date('2026-09-08T00:00:00.000Z'),
    });
    expect(debtBefore.status).toBe('PASS');
    expect(debtBefore.counts!.openDebtCount).toBe(1);

    // 2. Production query: listCandidates finds this proven debt
    const candidates = await makeupSchedules.listCandidates(
      { academicYearId: f.year.id, page: 1, pageSize: 20 },
      mockAuthRequest(f.principal),
    );
    expect(candidates.items.some((c) => c.sourceNormalOccurrenceKey === sourceNormalOccurrenceKey)).toBe(true);

    // Record PPCT items count before scheduling makeup
    const ppctCountBefore = await harness.prisma.ppctItem.count({ where: { ppctPlanId: f.plan.id } });

    // 3. Production command: createMakeupSchedule via production create
    const makeupRes = await makeupSchedules.create(
      {
        academicYearId: f.year.id,
        sourceNormalOccurrenceKey,
        targetCivilDate: '2026-09-12', // Saturday
        targetTimeSlotDefinitionId: f.makeupSlot.id,
        scheduledTeacherUserId: f.teacherA.id,
        note: 'Lập lịch dạy bù công khai cho tiết ngày 07/09',
        requestKey: `makeup-cmd-sc4-${randomUUID()}`,
      },
      mockAuthRequest(f.principal),
    );
    expect(makeupRes.outcome).toBe('CREATED');
    const scheduleId = makeupRes.record.id;

    // Verify MakeupTeachingSchedule links exact source disposition and original PPCT item
    const persistedSchedule = await harness.prisma.makeupTeachingSchedule.findUniqueOrThrow({
      where: { id: scheduleId },
    });
    expect(persistedSchedule.status).toBe('ACTIVE');
    expect(persistedSchedule.sourceDispositionId).toBe(disposition.id);
    expect(persistedSchedule.ppctItemId).toBe(f.item.id);

    // Collision check: duplicate schedule creation at same slot is rejected
    await expect(
      makeupSchedules.create(
        {
          academicYearId: f.year.id,
          sourceNormalOccurrenceKey,
          targetCivilDate: '2026-09-12',
          targetTimeSlotDefinitionId: f.makeupSlot.id,
          scheduledTeacherUserId: f.teacherA.id,
          requestKey: `makeup-cmd-dup-${randomUUID()}`,
        },
        mockAuthRequest(f.principal),
      ),
    ).rejects.toThrow();

    // Verify PPCT items count remains invariant (zero new PPCT item consumption)
    const ppctCountAfter = await harness.prisma.ppctItem.count({ where: { ppctPlanId: f.plan.id } });
    expect(ppctCountAfter).toBe(ppctCountBefore);

    // 4. Confirm makeup execution via production TeachingExecutionsService.confirmMakeup
    const confirmExecRes = await teachingExecutions.confirmMakeup(
      {
        makeupTeachingScheduleId: scheduleId,
        requestKey: `exec-makeup-sc4-${randomUUID()}`,
      },
      mockAuthRequest(f.teacherA),
    );
    expect(confirmExecRes.outcome).toBe('CREATED');
    expect(confirmExecRes.item.kind).toBe(CurricularTeachingExecutionKind.MAKEUP);

    // 5. Debt is resolved via makeup execution
    const debtAfter = await progressDebt.resolve({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      asOfInstant: new Date('2026-09-13T00:00:00.000Z'),
    });
    expect(debtAfter.status).toBe('PASS');
    expect(debtAfter.counts!.openDebtCount).toBe(0);
    expect(debtAfter.counts!.completedCount).toBe(1);
  });

  // =========================================================================
  // SCENARIO 5: HĐTN CLASS historical homeroom preservation (Correction D)
  // =========================================================================
  it('Scenario 5: HĐTN CLASS retains historical GVCN without drift after subsequent homeroom changes', async () => {
    const f = await createBaseAcademicSetup();

    // Special programme policy
    const spStream = await harness.prisma.businessPolicyStream.create({
      data: { familyKey: 'SPECIAL_PROGRAMME_WORKLOAD', resourceKind: 'ACADEMIC_YEAR', academicYearId: f.year.id },
    });
    await harness.prisma.businessPolicyVersion.create({
      data: {
        streamId: spStream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: {
          coefficients: {
            GDDP: { CLASS: 1.0, GRADE: 1.0 },
            HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 },
          },
        },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedByUserId: f.principal.id,
        createdByUserId: f.principal.id,
      },
    });

    // Programme planning: HDTN_HN / CLASS
    const master = await harness.prisma.programmeMaster.create({
      data: {
        academicYearId: f.year.id,
        kind: 'HDTN_HN',
        gradeLevel: null,
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
        title: 'Sinh hoat lop tuan 1',
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
        civilDate: new Date('2026-09-08T00:00:00.000Z'), // Tuesday
        mode: 'CLASS',
        gradeLevel: null,
        schoolClassId: f.schoolClass.id,
        status: 'DRAFT',
        createdByUserId: f.principal.id,
      },
    });
    await harness.prisma.plannedOccurrenceSlot.create({
      data: {
        plannedProgrammeOccurrenceId: occurrence.id,
        academicYearId: f.year.id,
        timeSlotDefinitionId: f.slot2.id,
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

    // Historical homeroom assignment for Teacher A valid on 2026-09-08
    const homeroomA = await harness.prisma.homeroomAssignment.create({
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

    // Materialize occurrence via production ProgrammePlanningService
    const matRecords = await programmePlanning.materializeOccurrence(
      occurrence.id,
      { commandId: `cmd-mat-hdtn-${randomUUID()}` },
      f.principal.id,
    );
    expect(matRecords).toHaveLength(1);
    const mat = matRecords[0]!;
    expect(mat.homeroomTeacherUserId).toBe(f.teacherA.id);

    // Verify SpecialActivity created in DB retains historical homeroom assignment ID and Teacher A staffing
    const act = await harness.prisma.specialActivity.findUniqueOrThrow({
      where: { id: mat.specialActivityId },
      include: { staffing: true, timeSlots: true },
    });
    expect(act.staffing[0]!.scheduledTeacherUserId).toBe(f.teacherA.id);
    expect(act.staffing[0]!.historicalHomeroomAssignmentId).toBe(homeroomA.id);

    // Now change/assign subsequent Homeroom to Teacher B from 2026-09-11 onwards
    await harness.prisma.homeroomAssignment.create({
      data: {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        teacherUserId: f.teacherB.id,
        validFrom: new Date('2026-09-11T00:00:00.000Z'),
        validUntil: null,
        status: HomeroomAssignmentStatus.ACTIVE,
        createdByUserId: f.principal.id,
      },
    });

    // Teacher A executes participation via production service TeachingExecutionsService.confirmActivity
    const actSlot = act.timeSlots[0]!;
    const confirmActRes = await teachingExecutions.confirmActivity(
      {
        specialActivityId: act.id,
        specialActivityStaffingId: act.staffing[0]!.id,
        specialActivityTimeSlotId: actSlot.id,
        requestKey: `exec-hdtn-sc5-${randomUUID()}`,
      },
      mockAuthRequest(f.teacherA),
    );
    expect(confirmActRes.outcome).toBe('CREATED');

    // Add active coordinator attestation
    await harness.prisma.programmeOccurrenceAttestation.create({
      data: {
        programmeMasterId: master.id,
        plannedProgrammeOccurrenceId: occurrence.id,
        attestedByUserId: f.principal.id,
        authorityType: 'BGH_PRINCIPAL',
        capabilityKey: 'APPROVAL_PRINCIPAL',
        scope: 'SCHOOL_WIDE',
        scopeResourceId: null,
        status: 'ACTIVE',
        attestedAt: new Date('2026-09-08T12:00:00.000Z'),
        createRequestKey: randomUUID(),
        createRequestFingerprint: randomUUID(),
      },
    });

    // Teacher A receives workload credit
    const workloadA = await specialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: new Date(),
    });
    expect(workloadA.totalCredit).toBe(1);
    expect(workloadA.contributionCount).toBe(1);

    // Teacher B receives ZERO workload credit (no drift to new homeroom teacher)
    const workloadB = await specialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherB.id,
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: new Date(),
    });
    expect(workloadB.totalCredit).toBe(0);
  });

  // =========================================================================
  // SCENARIO 6: HĐTN GRADE & SCHOOL_WIDE dual gate (Correction E)
  // =========================================================================
  it('Scenario 6: HĐTN GRADE & SCHOOL_WIDE enforces dual gate and anti-class fan-out', async () => {
    const f = await createBaseAcademicSetup();

    const spStream = await harness.prisma.businessPolicyStream.create({
      data: { familyKey: 'SPECIAL_PROGRAMME_WORKLOAD', resourceKind: 'ACADEMIC_YEAR', academicYearId: f.year.id },
    });
    await harness.prisma.businessPolicyVersion.create({
      data: {
        streamId: spStream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: {
          coefficients: {
            GDDP: { CLASS: 1.0, GRADE: 1.0 },
            HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 },
          },
        },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedByUserId: f.principal.id,
        createdByUserId: f.principal.id,
      },
    });

    const master = await harness.prisma.programmeMaster.create({
      data: { academicYearId: f.year.id, kind: 'HDTN_HN', gradeLevel: null, createdByUserId: f.principal.id },
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
        title: 'Hoat dong khoi 10',
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

    // Occurrence 1: HDTN_HN / GRADE targeting multiple classes (10A and 10B)
    const occGrade = await harness.prisma.plannedProgrammeOccurrence.create({
      data: {
        programmeMasterId: master.id,
        programmePlanVersionId: planVer.id,
        programmeTopicItemId: topicItem.id,
        academicYearId: f.year.id,
        civilDate: new Date('2026-09-08T00:00:00.000Z'),
        mode: 'GRADE',
        gradeLevel: 10,
        status: 'DRAFT',
        createdByUserId: f.principal.id,
      },
    });
    const occSlot = await harness.prisma.plannedOccurrenceSlot.create({
      data: {
        plannedProgrammeOccurrenceId: occGrade.id,
        academicYearId: f.year.id,
        timeSlotDefinitionId: f.slot2.id,
      },
    });
    await harness.prisma.plannedSlotStaffing.create({
      data: { plannedOccurrenceSlotId: occSlot.id, teacherUserId: f.teacherA.id },
    });
    await harness.prisma.plannedProgrammeOccurrence.update({
      where: { id: occGrade.id },
      data: {
        status: 'PUBLISHED',
        publishedByUserId: f.principal.id,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    // Materialize GRADE occurrence
    const matRecords = await programmePlanning.materializeOccurrence(
      occGrade.id,
      { commandId: `cmd-mat-grade-${randomUUID()}` },
      f.principal.id,
    );
    const actGrade = await harness.prisma.specialActivity.findUniqueOrThrow({
      where: { id: matRecords[0]!.specialActivityId },
      include: { staffing: true, timeSlots: true },
    });

    // Step A: Dual gate negative test - Execution present, but NO qualifying attestation
    await teachingExecutions.confirmActivity(
      {
        specialActivityId: actGrade.id,
        specialActivityStaffingId: actGrade.staffing[0]!.id,
        specialActivityTimeSlotId: actGrade.timeSlots[0]!.id,
        requestKey: `exec-grade-sc6-${randomUUID()}`,
      },
      mockAuthRequest(f.teacherA),
    );

    const workloadNoAtt = await specialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: new Date(),
    });
    expect(workloadNoAtt.totalCredit).toBe(0);
    expect(workloadNoAtt.pendingConfirmation).toHaveLength(1);

    // Step B: Dual gate positive test - Coordinator adds attestation -> Credit awarded
    await harness.prisma.programmeOccurrenceAttestation.create({
      data: {
        programmeMasterId: master.id,
        plannedProgrammeOccurrenceId: occGrade.id,
        attestedByUserId: f.principal.id,
        authorityType: 'BGH_PRINCIPAL',
        capabilityKey: 'APPROVAL_PRINCIPAL',
        scope: 'SCHOOL_WIDE',
        scopeResourceId: null,
        status: 'ACTIVE',
        attestedAt: new Date('2026-09-08T12:00:00.000Z'),
        createRequestKey: randomUUID(),
        createRequestFingerprint: randomUUID(),
      },
    });

    const workloadWithAtt = await specialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: new Date(),
    });
    // Anti-class fan-out: credit is exactly 1 (not multiplied by number of classes)
    expect(workloadWithAtt.totalCredit).toBe(1);
    expect(workloadWithAtt.contributionCount).toBe(1);

    // Step C: Dual gate negative test - Attestation present, but NO execution
    const slotSchoolWide = await harness.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: f.year.id,
        weekday: 'TUESDAY',
        session: 'MORNING',
        ordinal: 2,
        revision: 1,
        displayLabel: 'Tiet 2 Thu 3 HDTN Toan truong',
        startTime: new Date('1970-01-01T07:50:00Z'),
        endTime: new Date('1970-01-01T08:35:00Z'),
        allowRegularTeaching: false,
        allowMakeupTeaching: false,
        allowSelfStudy: true,
      },
    });

    const occSchoolWide = await harness.prisma.plannedProgrammeOccurrence.create({
      data: {
        programmeMasterId: master.id,
        programmePlanVersionId: planVer.id,
        programmeTopicItemId: topicItem.id,
        academicYearId: f.year.id,
        civilDate: new Date('2026-09-08T00:00:00.000Z'),
        mode: 'SCHOOL_WIDE',
        status: 'DRAFT',
        createdByUserId: f.principal.id,
      },
    });
    const occSlotSW = await harness.prisma.plannedOccurrenceSlot.create({
      data: {
        plannedProgrammeOccurrenceId: occSchoolWide.id,
        academicYearId: f.year.id,
        timeSlotDefinitionId: slotSchoolWide.id,
      },
    });
    await harness.prisma.plannedSlotStaffing.create({
      data: { plannedOccurrenceSlotId: occSlotSW.id, teacherUserId: f.teacherB.id },
    });
    await harness.prisma.plannedProgrammeOccurrence.update({
      where: { id: occSchoolWide.id },
      data: {
        status: 'PUBLISHED',
        publishedByUserId: f.principal.id,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });
    await programmePlanning.materializeOccurrence(
      occSchoolWide.id,
      { commandId: `cmd-mat-sw-${randomUUID()}` },
      f.principal.id,
    );
    await harness.prisma.programmeOccurrenceAttestation.create({
      data: {
        programmeMasterId: master.id,
        plannedProgrammeOccurrenceId: occSchoolWide.id,
        attestedByUserId: f.principal.id,
        authorityType: 'BGH_PRINCIPAL',
        capabilityKey: 'APPROVAL_PRINCIPAL',
        scope: 'SCHOOL_WIDE',
        scopeResourceId: null,
        status: 'ACTIVE',
        attestedAt: new Date('2026-09-08T12:00:00.000Z'),
        createRequestKey: randomUUID(),
        createRequestFingerprint: randomUUID(),
      },
    });

    // Teacher B has not executed participation -> total credit remains 0
    const workloadB = await specialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherB.id,
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: new Date(),
    });
    expect(workloadB.totalCredit).toBe(0);
    expect(workloadB.contributionCount).toBe(0);
  });

  // =========================================================================
  // SCENARIO 7: GDĐP multi-teacher staffing & anti-Cartesian (Correction F)
  // =========================================================================
  it('Scenario 7: GDĐP multi-teacher staffing credits each teacher exactly once without Cartesian multiplication', async () => {
    const f = await createBaseAcademicSetup();

    const spStream = await harness.prisma.businessPolicyStream.create({
      data: { familyKey: 'SPECIAL_PROGRAMME_WORKLOAD', resourceKind: 'ACADEMIC_YEAR', academicYearId: f.year.id },
    });
    await harness.prisma.businessPolicyVersion.create({
      data: {
        streamId: spStream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: {
          coefficients: {
            GDDP: { CLASS: 1.0, GRADE: 1.0 },
            HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 },
          },
        },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedByUserId: f.principal.id,
        createdByUserId: f.principal.id,
      },
    });

    const master = await harness.prisma.programmeMaster.create({
      data: { academicYearId: f.year.id, kind: 'GDDP', gradeLevel: 10, createdByUserId: f.principal.id },
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
        title: 'GDDP Dia li dia phuong',
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

    const occ = await harness.prisma.plannedProgrammeOccurrence.create({
      data: {
        programmeMasterId: master.id,
        programmePlanVersionId: planVer.id,
        programmeTopicItemId: topicItem.id,
        academicYearId: f.year.id,
        civilDate: new Date('2026-09-08T00:00:00.000Z'),
        mode: 'GRADE',
        gradeLevel: 10,
        status: 'DRAFT',
        createdByUserId: f.principal.id,
      },
    });

    // Exactly ONE planned occurrence slot
    const occSlot = await harness.prisma.plannedOccurrenceSlot.create({
      data: {
        plannedProgrammeOccurrenceId: occ.id,
        academicYearId: f.year.id,
        timeSlotDefinitionId: f.slot2.id,
      },
    });

    // Staffing = { Teacher A, Teacher B } on this exact single slot
    await harness.prisma.plannedSlotStaffing.createMany({
      data: [
        { plannedOccurrenceSlotId: occSlot.id, teacherUserId: f.teacherA.id },
        { plannedOccurrenceSlotId: occSlot.id, teacherUserId: f.teacherB.id },
      ],
    });

    await harness.prisma.plannedProgrammeOccurrence.update({
      where: { id: occ.id },
      data: {
        status: 'PUBLISHED',
        publishedByUserId: f.principal.id,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    // Materialize occurrence: exactly 1 SpecialActivity root, with staffing for both teachers
    const matRecords = await programmePlanning.materializeOccurrence(
      occ.id,
      { commandId: `cmd-mat-multiteacher-${randomUUID()}` },
      f.principal.id,
    );
    expect(matRecords).toHaveLength(1);

    const act = await harness.prisma.specialActivity.findUniqueOrThrow({
      where: { id: matRecords[0]!.specialActivityId },
      include: { staffing: true, timeSlots: true, classTargets: true },
    });
    expect(act.timeSlots).toHaveLength(1);
    expect(act.staffing).toHaveLength(2);
    // Grade mode materializes both 10A and 10B
    expect(act.classTargets).toHaveLength(2);

    const staffA = act.staffing.find((s) => s.scheduledTeacherUserId === f.teacherA.id)!;
    const staffB = act.staffing.find((s) => s.scheduledTeacherUserId === f.teacherB.id)!;
    expect(staffA).toBeDefined();
    expect(staffB).toBeDefined();

    // Attestation on the occurrence
    await harness.prisma.programmeOccurrenceAttestation.create({
      data: {
        programmeMasterId: master.id,
        plannedProgrammeOccurrenceId: occ.id,
        attestedByUserId: f.principal.id,
        authorityType: 'BGH_PRINCIPAL',
        capabilityKey: 'APPROVAL_PRINCIPAL',
        scope: 'SCHOOL_WIDE',
        scopeResourceId: null,
        status: 'ACTIVE',
        attestedAt: new Date('2026-09-08T12:00:00.000Z'),
        createRequestKey: randomUUID(),
        createRequestFingerprint: randomUUID(),
      },
    });

    // Both teachers record participation execution on their respective staffing
    await teachingExecutions.confirmActivity(
      {
        specialActivityId: act.id,
        specialActivityStaffingId: staffA.id,
        specialActivityTimeSlotId: act.timeSlots[0]!.id,
        requestKey: `exec-multi-a-${randomUUID()}`,
      },
      mockAuthRequest(f.teacherA),
    );

    await teachingExecutions.confirmActivity(
      {
        specialActivityId: act.id,
        specialActivityStaffingId: staffB.id,
        specialActivityTimeSlotId: act.timeSlots[0]!.id,
        requestKey: `exec-multi-b-${randomUUID()}`,
      },
      mockAuthRequest(f.teacherB),
    );

    // Resolve workload: Teacher A gets exactly 1 credit, Teacher B gets exactly 1 credit
    // Anti-Cartesian verification: 2 teachers x 2 class targets does NOT yield 2 or 4 credits per teacher.
    const workloadA = await specialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: new Date(),
    });
    expect(workloadA.totalCredit).toBe(1);
    expect(workloadA.contributionCount).toBe(1);

    const workloadB = await specialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherB.id,
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: new Date(),
    });
    expect(workloadB.totalCredit).toBe(1);
    expect(workloadB.contributionCount).toBe(1);
  });

  // =========================================================================
  // SCENARIO 8: Curricular actual-teacher semantics & mixed earned workload (Correction J)
  // =========================================================================
  it('Scenario 8: Official workload credits actual teacher on substitution and combines mixed earned credits', async () => {
    const f = await createBaseAcademicSetup();

    // Workload adjustment policy
    const wlStream = await harness.prisma.businessPolicyStream.create({
      data: { familyKey: 'WORKLOAD_ADJUSTMENT', resourceKind: 'ACADEMIC_YEAR', academicYearId: f.year.id },
    });
    await harness.prisma.businessPolicyVersion.create({
      data: {
        streamId: wlStream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: { baseWeeklyNorm: 17, rules: [] },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedByUserId: f.principal.id,
        createdByUserId: f.principal.id,
      },
    });

    // Special programme policy
    const spStream = await harness.prisma.businessPolicyStream.create({
      data: { familyKey: 'SPECIAL_PROGRAMME_WORKLOAD', resourceKind: 'ACADEMIC_YEAR', academicYearId: f.year.id },
    });
    await harness.prisma.businessPolicyVersion.create({
      data: {
        streamId: spStream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: { coefficients: { GDDP: { CLASS: 1.0, GRADE: 1.0 }, HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 } } },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedByUserId: f.principal.id,
        createdByUserId: f.principal.id,
      },
    });

    // Curricular teaching assignment is assigned to Teacher A.
    // However, on Monday 2026-09-07, Teacher B teaches as substitute!
    // Operational disposition: SAME_SUBJECT_SUBSTITUTION with substitute teacher B
    await harness.prisma.operationalLessonDisposition.create({
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
        assignedTeacherUserId: f.teacherB.id,
        dispositionType: OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION,
        eligibilityCheckedAt: new Date('2026-08-01T00:00:00.000Z'),
        eligibilityWasActive: true,
        eligibilityWasTeachingStaff: true,
        eligibilitySameSubject: true,
        eligibilityStaffSubjectId: f.staffSubjectB.id,
        status: OperationalOverlayStatus.ACTIVE,
        createRequestKey: `disp-sub-${randomUUID()}`,
        createRequestFingerprint: 'fp-sub',
        createdByUserId: f.principal.id,
      },
    });

    // Curricular execution recorded via production confirmNormal with actualTeacher = Teacher B
    const confirmSubRes = await teachingExecutions.confirmNormal(
      {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        timetableEntryId: f.entry.id,
        sourceCivilDate: '2026-09-07',
        requestKey: `sc8-sub-exec-${randomUUID()}`,
      },
      mockAuthRequest(f.teacherB),
    );
    expect(confirmSubRes.outcome).toBe('CREATED');
    expect(confirmSubRes.item.actualTeacherUserId).toBe(f.teacherB.id);
    expect(confirmSubRes.item.responsibleTeacherUserId).toBe(f.teacherA.id);

    // Special programme execution on Tuesday 2026-09-08 for Teacher B
    const master = await harness.prisma.programmeMaster.create({
      data: { academicYearId: f.year.id, kind: 'GDDP', gradeLevel: 10, createdByUserId: f.principal.id },
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
        title: 'Chuyen de GDDP',
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
    const occ = await harness.prisma.plannedProgrammeOccurrence.create({
      data: {
        programmeMasterId: master.id,
        programmePlanVersionId: planVer.id,
        programmeTopicItemId: topicItem.id,
        academicYearId: f.year.id,
        civilDate: new Date('2026-09-08T00:00:00.000Z'),
        mode: 'GRADE',
        gradeLevel: 10,
        status: 'DRAFT',
        createdByUserId: f.principal.id,
      },
    });
    const occSlot = await harness.prisma.plannedOccurrenceSlot.create({
      data: { plannedProgrammeOccurrenceId: occ.id, academicYearId: f.year.id, timeSlotDefinitionId: f.slot2.id },
    });
    await harness.prisma.plannedSlotStaffing.create({
      data: { plannedOccurrenceSlotId: occSlot.id, teacherUserId: f.teacherB.id },
    });
    await harness.prisma.plannedProgrammeOccurrence.update({
      where: { id: occ.id },
      data: {
        status: 'PUBLISHED',
        publishedByUserId: f.principal.id,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });
    const matRecords = await programmePlanning.materializeOccurrence(
      occ.id,
      { commandId: `cmd-mat-sc8-${randomUUID()}` },
      f.principal.id,
    );
    const act = await harness.prisma.specialActivity.findUniqueOrThrow({
      where: { id: matRecords[0]!.specialActivityId },
      include: { staffing: true, timeSlots: true },
    });
    await harness.prisma.programmeOccurrenceAttestation.create({
      data: {
        programmeMasterId: master.id,
        plannedProgrammeOccurrenceId: occ.id,
        attestedByUserId: f.principal.id,
        authorityType: 'BGH_PRINCIPAL',
        capabilityKey: 'APPROVAL_PRINCIPAL',
        scope: 'SCHOOL_WIDE',
        scopeResourceId: null,
        status: 'ACTIVE',
        attestedAt: new Date('2026-09-08T12:00:00.000Z'),
        createRequestKey: randomUUID(),
        createRequestFingerprint: randomUUID(),
      },
    });
    await teachingExecutions.confirmActivity(
      { specialActivityId: act.id, specialActivityStaffingId: act.staffing[0]!.id, specialActivityTimeSlotId: act.timeSlots[0]!.id, requestKey: `exec-sc8-${randomUUID()}` },
      mockAuthRequest(f.teacherB),
    );

    // Official workload projection for Teacher B (Substitute):
    // Earned curricular credit = 1 (earned because actualTeacherUserId = B)
    // Earned special-programme credit = 1
    // Total earned credit = 2
    const workloadB = await officialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherB.id,
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: new Date(),
    });
    expect(workloadB.status).toBe('PASS');
    expect(workloadB.curricularWorkload.totalCredit).toBe(1);
    expect(workloadB.specialProgrammeWorkload.totalCredit).toBe(1);
    expect(workloadB.earnedCredit).toBe(2);

    // Official workload projection for Teacher A (Nominally assigned teacher):
    // Earned curricular credit = 0 (because they did not actually teach)
    const workloadA = await officialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: new Date(),
    });
    expect(workloadA.status).toBe('PASS');
    expect(workloadA.curricularWorkload.totalCredit).toBe(0);
    expect(workloadA.earnedCredit).toBe(0);
  });

  // =========================================================================
  // SCENARIO 9: Workload adjustment (Correction G)
  // =========================================================================
  it('Scenario 9: Workload adjustment applies TRU_TIET, TRU_PHAN_TRAM, priority order, and calendar proration', async () => {
    const f = await createBaseAcademicSetup();

    // 1. Create canonical AdditionalDutyDefinitions in DB
    const dutyDef = await harness.prisma.additionalDutyDefinition.create({
      data: {
        code: normalizedCode('TO_TRUONG'),
        name: 'To truong chuyen mon',
        category: 'CHUYEN_MON',
        isActive: true,
      },
    });

    const dutyDef2 = await harness.prisma.additionalDutyDefinition.create({
      data: {
        code: normalizedCode('BI_THU_DOAN'),
        name: 'Bi thu Doan truong',
        category: 'DOAN_THE',
        isActive: true,
      },
    });

    // 2. Assign these additional duties to Teacher A
    await harness.prisma.staffAdditionalDutyAssignment.create({
      data: {
        staffProfileId: f.teacherA.profile!.id,
        dutyDefinitionId: dutyDef.id,
        scopeType: 'SUBJECT',
        validFrom: new Date('2026-08-01T00:00:00.000Z'),
        validUntil: null,
        createdByUserId: f.principal.id,
      },
    });

    await harness.prisma.staffAdditionalDutyAssignment.create({
      data: {
        staffProfileId: f.teacherA.profile!.id,
        dutyDefinitionId: dutyDef2.id,
        scopeType: 'SCHOOL_WIDE',
        validFrom: new Date('2026-08-01T00:00:00.000Z'),
        validUntil: null,
        createdByUserId: f.principal.id,
      },
    });

    // 3. Assign Homeroom responsibility to Teacher A
    await harness.prisma.homeroomAssignment.create({
      data: {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        teacherUserId: f.teacherA.id,
        validFrom: new Date('2026-08-01T00:00:00.000Z'),
        status: HomeroomAssignmentStatus.ACTIVE,
        createdByUserId: f.principal.id,
      },
    });

    // 4. Create WORKLOAD_ADJUSTMENT policy:
    // Base weekly norm = 17
    // Rule 1 (priority 1): HOMEROOM_RESPONSIBILITY -> GHI_DE = 20 (ADR-057 non-terminating override)
    // Rule 2 (priority 2): ADDITIONAL_DUTY with dutyDef.id -> TRU_TIET = 4 (20 - 4 = 16)
    // Rule 3 (priority 3): ADDITIONAL_DUTY with dutyDef2.id -> TRU_PHAN_TRAM = 25% (16 * (1 - 0.25) = 12.0)
    const wlStream = await harness.prisma.businessPolicyStream.create({
      data: { familyKey: 'WORKLOAD_ADJUSTMENT', resourceKind: 'ACADEMIC_YEAR', academicYearId: f.year.id },
    });
    await harness.prisma.businessPolicyVersion.create({
      data: {
        streamId: wlStream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: {
          baseWeeklyNorm: 17,
          rules: [
            {
              ruleId: 'rule-homeroom-override',
              source: { kind: 'HOMEROOM_RESPONSIBILITY' },
              calculation: 'GHI_DE',
              value: 20,
              priority: 1,
            },
            {
              ruleId: 'rule-duty-trutiet',
              source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: dutyDef.id },
              calculation: 'TRU_TIET',
              value: 4,
              priority: 2,
            },
            {
              ruleId: 'rule-duty-truphantram',
              source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: dutyDef2.id },
              calculation: 'TRU_PHAN_TRAM',
              value: 25,
              priority: 3,
            },
          ],
        },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedByUserId: f.principal.id,
        createdByUserId: f.principal.id,
      },
    });

    // 5. Introduce calendar interruption on Tuesday 2026-09-08
    // Teaching weekdays configured in calendar: ['MONDAY', 'TUESDAY'] (denominator K = 2)
    // Tuesday is interrupted -> Only Monday is eligible for required workload!
    await harness.prisma.calendarInterruption.create({
      data: {
        calendarVersionId: f.calendar.id,
        code: normalizedCode('INT_HOLIDAY'),
        name: 'Nghi le giua tuan',
        startDate: new Date('2026-09-08T00:00:00.000Z'),
        endDate: new Date('2026-09-08T23:59:59.999Z'),
      },
    });

    const projection = await officialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: new Date('2026-09-13T00:00:00.000Z'),
    });

    expect(projection.status).toBe('PASS');
    expect(projection.adjustmentSegments[0]!.baseWeeklyNorm).toBe(17);
    expect(projection.adjustmentSegments[0]!.adjustedWeeklyNorm).toBe(12.0);

    // Proration: denominator K = 2. Monday is eligible (12 / 2 = 6.0), Tuesday is interrupted (0).
    // Total required credit for this week = 6.0 (prorated by exactly 1 eligible day)
    expect(projection.requiredCredit).toBe(6.0);
    expect(projection.adjustmentSegments[0]!.appliedRules).toHaveLength(3);
    expect(projection.adjustmentSegments[0]!.appliedRules[0]!.ruleId).toBe('rule-homeroom-override');
    expect(projection.adjustmentSegments[0]!.appliedRules[0]!.calculation).toBe('GHI_DE');
    expect(projection.adjustmentSegments[0]!.appliedRules[1]!.ruleId).toBe('rule-duty-trutiet');
    expect(projection.adjustmentSegments[0]!.appliedRules[1]!.calculation).toBe('TRU_TIET');
    expect(projection.adjustmentSegments[0]!.appliedRules[2]!.ruleId).toBe('rule-duty-truphantram');
    expect(projection.adjustmentSegments[0]!.appliedRules[2]!.calculation).toBe('TRU_PHAN_TRAM');
  });

  // =========================================================================
  // SCENARIO 10: Reporting Statement Snapshot V4 freeze
  // =========================================================================
  it('Scenario 10: Reporting Statement Snapshot V4 freezes official workload and survives source mutations without drift', async () => {
    const f = await createBaseAcademicSetup();

    const wlStream = await harness.prisma.businessPolicyStream.create({
      data: { familyKey: 'WORKLOAD_ADJUSTMENT', resourceKind: 'ACADEMIC_YEAR', academicYearId: f.year.id },
    });
    await harness.prisma.businessPolicyVersion.create({
      data: {
        streamId: wlStream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: { baseWeeklyNorm: 17, rules: [] },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedByUserId: f.principal.id,
        createdByUserId: f.principal.id,
      },
    });

    // Record curricular execution via production service on Week 2 Monday
    await teachingExecutions.confirmNormal(
      {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        timetableEntryId: f.entry.id,
        sourceCivilDate: '2026-09-14',
        requestKey: `sc10-normal-${randomUUID()}`,
      },
      mockAuthRequest(f.teacherA),
    );

    // Production preview
    const preview = await reportingStatements.preview(
      {
        academicYearId: f.year.id,
        fromCivilDate: '2026-09-14' as CivilDateString,
        toCivilDate: '2026-09-20' as CivilDateString,
      },
      mockAuthRequest(f.teacherA),
    );
    expect(preview.status).toBe('PASS');
    expect(preview.eligibleForSubmission).toBe(true);

    // Production submit under Snapshot V4
    const submitRes = await reportingStatements.submit(
      {
        academicYearId: f.year.id,
        fromCivilDate: '2026-09-14' as CivilDateString,
        toCivilDate: '2026-09-20' as CivilDateString,
        requestKey: `sc10-cmd-${randomUUID()}`,
      },
      mockAuthRequest(f.teacherA),
    );

    const revision = await harness.prisma.reportingStatementRevision.findUniqueOrThrow({
      where: { id: submitRes.revisionId },
    });
    expect(revision.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V4);

    const parsedSnapshot = JSON.parse(revision.canonicalSnapshotJson);
    expect(parsedSnapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V4);
    expect(parsedSnapshot.officialWorkload.earnedCredit).toBe(1);
    expect(parsedSnapshot.officialWorkload.requiredCredit).toBe(17);

    // Cryptographic integrity verification
    expect(() =>
      assertFrozenReportingStatementIntegrity({
        snapshot: parsedSnapshot,
        canonicalSnapshotJson: revision.canonicalSnapshotJson,
        semanticHash: revision.semanticHash,
        frozenSubjectIds: [f.subject.id],
      }),
    ).not.toThrow();

    // Source mutation immunity: Add another execution via production service on Tuesday after statement is frozen
    await teachingExecutions.confirmNormal(
      {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        timetableEntryId: f.entry2.id,
        sourceCivilDate: '2026-09-15',
        requestKey: `mut-exec-${randomUUID()}`,
      },
      mockAuthRequest(f.teacherA),
    );

    // Re-read statement: frozen snapshot remains untouched, hash verification passes
    const reloaded = await harness.prisma.reportingStatementRevision.findUniqueOrThrow({
      where: { id: submitRes.revisionId },
    });
    expect(reloaded.semanticHash).toBe(revision.semanticHash);
    expect(() =>
      assertFrozenReportingStatementIntegrity({
        snapshot: parsedSnapshot,
        canonicalSnapshotJson: reloaded.canonicalSnapshotJson,
        semanticHash: reloaded.semanticHash,
        frozenSubjectIds: [f.subject.id],
      }),
    ).not.toThrow();
  });

  // =========================================================================
  // SCENARIO 11: Fail-closed policy & provenance validation (Correction H)
  // =========================================================================
  it('Scenario 11: Fail-closed policy & provenance validation rejects ambiguous or corrupt configuration', async () => {
    const f = await createBaseAcademicSetup();

    // 1. Missing policy -> status BLOCKED, finding WORKLOAD_ADJUSTMENT_POLICY_MISSING
    const missingRes = await officialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: new Date('2026-09-13T00:00:00.000Z'),
    });
    expect(missingRes.status).toBe('BLOCKED');
    expect(missingRes.findings.some((find) => find.code.includes('WORKLOAD_ADJUSTMENT'))).toBe(true);

    // 2. Policy referencing nonexistent dutyDefinitionId -> status BLOCKED, finding ADDITIONAL_DUTY_DEFINITION_MISSING
    const fakeDutyId = randomUUID();
    const stream = await harness.prisma.businessPolicyStream.create({
      data: { familyKey: 'WORKLOAD_ADJUSTMENT', resourceKind: 'ACADEMIC_YEAR', academicYearId: f.year.id },
    });
    await harness.prisma.businessPolicyVersion.create({
      data: {
        streamId: stream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: {
          baseWeeklyNorm: 17,
          rules: [
            {
              ruleId: 'bad-duty-rule',
              source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: fakeDutyId },
              calculation: 'TRU_TIET',
              value: 1,
              priority: 1,
            },
          ],
        },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedByUserId: f.principal.id,
        createdByUserId: f.principal.id,
      },
    });

    const corruptRes = await officialWorkload.resolve({
      academicYearId: f.year.id,
      targetUserId: f.teacherA.id,
      fromCivilDate: '2026-09-07',
      toCivilDate: '2026-09-13',
      asOfInstant: new Date('2026-09-13T00:00:00.000Z'),
    });
    expect(corruptRes.status).toBe('BLOCKED');
    expect(corruptRes.findings.some((find) => find.code === 'ADDITIONAL_DUTY_DEFINITION_MISSING')).toBe(true);
  });

  // =========================================================================
  // SCENARIO 12: Teacher Workspace cross-domain effective schedule (Correction I)
  // =========================================================================
  it('Scenario 12: Teacher Workspace effective schedule composes normal, makeup, and special activity occupancies read-only', async () => {
    const f = await createBaseAcademicSetup();

    // 1. Normal timetable occupancy: Teacher A has regular teaching on Monday 2026-09-07 (from f.entry)

    // 2. Public makeup occupancy: Teacher A has makeup scheduled on Tuesday 2026-09-08
    await harness.prisma.operationalLessonDisposition.create({
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
        createRequestKey: `disp-sc12-${randomUUID()}`,
        createRequestFingerprint: 'fp-sc12-disp',
        createdByUserId: f.principal.id,
      },
    });

    const slotTuesdayMakeup = await harness.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: f.year.id,
        weekday: 'TUESDAY',
        session: 'MORNING',
        ordinal: 3,
        revision: 1,
        displayLabel: 'Tiet 3 Thu 3 Day Bu',
        startTime: new Date('1970-01-01T08:40:00Z'),
        endTime: new Date('1970-01-01T09:25:00Z'),
        allowRegularTeaching: false,
        allowMakeupTeaching: true,
      },
    });

    const makeupRes = await makeupSchedules.create(
      {
        academicYearId: f.year.id,
        sourceNormalOccurrenceKey: `NORMAL:${f.entry.id}:2026-09-07`,
        targetCivilDate: '2026-09-08', // Tuesday
        targetTimeSlotDefinitionId: slotTuesdayMakeup.id,
        scheduledTeacherUserId: f.teacherA.id,
        note: 'Dạy bù cho tiết ngày 07/09',
        requestKey: `makeup-sc12-${randomUUID()}`,
      },
      mockAuthRequest(f.principal),
    );
    expect(makeupRes.outcome).toBe('CREATED');

    // 3. Special activity occupancy: Teacher A scheduled on Tuesday Period 2
    const slotTuesdayPeriod2 = await harness.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: f.year.id,
        weekday: 'TUESDAY',
        session: 'MORNING',
        ordinal: 2,
        revision: 1,
        displayLabel: 'Tiet 2 Thu 3',
        startTime: new Date('1970-01-01T07:50:00Z'),
        endTime: new Date('1970-01-01T08:35:00Z'),
        allowRegularTeaching: false,
        allowMakeupTeaching: false,
        allowSelfStudy: true,
      },
    });

    await harness.prisma.specialActivity.create({
      data: {
        academicYearId: f.year.id,
        academicCalendarVersionId: f.calendar.id,
        civilDate: new Date('2026-09-08T00:00:00.000Z'),
        scope: SpecialActivityScope.SCHOOL_WIDE,
        status: SpecialActivityStatus.ACTIVE,
        title: 'Dai hoi toan truong',
        createRequestKey: `act-sc12-${randomUUID()}`,
        createRequestFingerprint: 'fp-sc12-act',
        createdByUserId: f.principal.id,
        timeSlots: {
          create: {
            timeSlotDefinitionId: slotTuesdayPeriod2.id,
          },
        },
        staffing: {
          create: {
            scheduledTeacherUserId: f.teacherA.id,
            staffProfileId: f.teacherA.profile!.id,
            eligibilityCheckedAt: new Date('2026-08-01T00:00:00.000Z'),
            eligibilityWasActive: true,
            eligibilityWasTeachingStaff: true,
          },
        },
      },
    });

    // Call production EffectiveScheduleService.getWeeklySchedule
    const weeklySchedule = await effectiveSchedule.getWeeklySchedule(
      {
        academicYearId: f.year.id,
        academicWeekId: f.week.id,
        teacherUserId: f.teacherA.id,
      },
      f.teacherA.id,
    );

    expect(weeklySchedule.teacherUserId).toBe(f.teacherA.id);
    expect(weeklySchedule.academicWeekId).toBe(f.week.id);

    // Extract all occupied slots across the week
    const occupiedSlots = weeklySchedule.days
      .flatMap((day) => day.slots)
      .filter((slot) => slot.occupancyState === 'OCCUPIED');

    const sourceKinds = occupiedSlots.map((slot) => slot.sourceKind);

    // Assert that all 3 distinct canonical source kinds are present in the effective weekly schedule
    expect(sourceKinds).toContain('BASE_TIMETABLE');
    expect(sourceKinds).toContain('MAKEUP_TEACHING');
    expect(sourceKinds).toContain('SPECIAL_ACTIVITY');

    // Read-only invariant: zero database mutation occurred
    const verifiedSchedule = await effectiveSchedule.getWeeklySchedule(
      {
        academicYearId: f.year.id,
        academicWeekId: f.week.id,
        teacherUserId: f.teacherA.id,
      },
      f.teacherA.id,
    );
    expect(verifiedSchedule.days).toHaveLength(weeklySchedule.days.length);
  });
});
