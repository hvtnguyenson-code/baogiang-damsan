import {
  DayOfWeek,
  ExecutionMode,
  PrismaClient,
  TeachingExecutionKind,
  TeachingExecutionStatus,
  UserStatus,
} from '@prisma/client';
import {
  integration,
  normalizedCode,
  Phase01Harness,
} from '../helpers/phase01-test-harness';
import { BusinessConfigurationService } from '../../src/business-configuration/business-configuration.service';
import { PRODUCTION_BUSINESS_POLICY_FAMILIES } from '../../src/business-configuration/business-policy-registry';
import { SpecialProgrammeWorkloadProjectionService } from '../../src/special-programme-workload/special-programme-workload-projection.service';
import { OfficialWorkloadProjectionService } from '../../src/official-workload/official-workload-projection.service';
import { ReportingStatementsService } from '../../src/reporting-statements/reporting-statements.service';
import { ReportingStatementRepository } from '../../src/reporting-statement-internal/reporting-statement.repository';
import { AuditService } from '../../src/audit/audit.service';
import {
  REPORTING_STATEMENT_SNAPSHOT_V4,
} from '../../src/reporting-statement-internal/reporting-statement-canonicalizer';
import { presentReportingStatementDetail } from '../../src/reporting-statements/reporting-statement.presenter';

integration('P4-061: Official Workload & Workload Adjustment PostgreSQL Integration Suite', () => {
  const harness = new Phase01Harness();
  let prisma: PrismaClient;
  let businessConfig: BusinessConfigurationService;
  let specialWorkload: SpecialProgrammeWorkloadProjectionService;
  let officialWorkload: OfficialWorkloadProjectionService;
  let reportingService: ReportingStatementsService;
  let repository: ReportingStatementRepository;
  let auditService: AuditService;

  const asOf = new Date('2026-09-20T12:00:00.000Z');

  beforeAll(async () => {
    await harness.start();
    prisma = harness.prisma;
    auditService = new AuditService(prisma as never);
    businessConfig = new BusinessConfigurationService(
      prisma as never,
      auditService,
      PRODUCTION_BUSINESS_POLICY_FAMILIES,
    );
    specialWorkload = new SpecialProgrammeWorkloadProjectionService(
      prisma as never,
      businessConfig,
    );
    officialWorkload = new OfficialWorkloadProjectionService(
      prisma as never,
      businessConfig,
      specialWorkload,
    );
    repository = new ReportingStatementRepository();
    reportingService = new ReportingStatementsService(
      prisma as never,
      repository,
      {
        evaluate: jest.fn().mockResolvedValue({ allowed: true }),
        listEffectiveCapabilities: jest.fn().mockResolvedValue([
          { key: 'REPORTING_STATEMENT_SUBMIT', scope: 'PERSONAL' },
          { key: 'REPORTING_STATEMENT_READ', scope: 'PERSONAL' },
        ]),
      } as never,
      {
        resolve: jest.fn().mockResolvedValue({
          profile: 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1',
          scope: {
            academicYearId: 'dummy-year',
            targetUserId: 'dummy-user',
            fromCivilDate: '2026-09-01',
            toCivilDate: '2026-09-30',
            asOfInstant: asOf,
          },
          responsibilityState: 'RESPONSIBILITY_PRESENT',
          status: 'PASS',
          counts: {
            distributedElapsedCount: 1,
            completedCount: 1,
            openDebtCount: 0,
            lateCount: 0,
            unconfirmedGapCount: 0,
          },
          responsibilityManifest: [
            {
              teachingAssignmentId: 'ta-1',
              schoolClassId: 'sc-1',
              subjectId: 'sub-1',
              validFrom: '2026-09-01',
              validUntil: null,
            },
          ],
          sections: [],
          findings: [],
          evaluatedAt: asOf.toISOString(),
        }),
        resolveInTransaction: jest.fn().mockResolvedValue({
          profile: 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1',
          scope: {
            academicYearId: 'dummy-year',
            targetUserId: 'dummy-user',
            fromCivilDate: '2026-09-01',
            toCivilDate: '2026-09-30',
            asOfInstant: asOf,
          },
          responsibilityState: 'RESPONSIBILITY_PRESENT',
          status: 'PASS',
          counts: {
            distributedElapsedCount: 1,
            completedCount: 1,
            openDebtCount: 0,
            lateCount: 0,
            unconfirmedGapCount: 0,
          },
          responsibilityManifest: [
            {
              teachingAssignmentId: 'ta-1',
              schoolClassId: 'sc-1',
              subjectId: 'sub-1',
              validFrom: '2026-09-01',
              validUntil: null,
            },
          ],
          sections: [],
          findings: [],
          evaluatedAt: asOf.toISOString(),
        }),
      } as never,
      businessConfig,
      { now: () => asOf },
      specialWorkload,
      officialWorkload,
    );
  }, 60000);

  afterAll(async () => {
    await harness.stop();
  });

  beforeEach(async () => {
    await harness.clean();
  });

  async function createTeacher(prefix = 'teacher') {
    return prisma.user.create({
      data: {
        username: normalizedCode(prefix),
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
        profile: {
          create: {
            displayName: `Teacher ${prefix}`,
            staffCode: normalizedCode('GV'),
          },
        },
      },
    });
  }

  async function createAcademicYear() {
    const year = await prisma.academicYear.create({
      data: {
        code: normalizedCode('Y'),
        name: 'Năm học 2026-2027',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T00:00:00.000Z'),
      },
    });
    const cal = await prisma.calendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T00:00:00.000Z'),
        teachingDaysPerWeek: 6,
        teachingWeekdays: [
          DayOfWeek.MONDAY,
          DayOfWeek.TUESDAY,
          DayOfWeek.WEDNESDAY,
          DayOfWeek.THURSDAY,
          DayOfWeek.FRIDAY,
          DayOfWeek.SATURDAY,
        ],
        isActive: true,
      },
    });
    return { year, cal };
  }

  it('1. WORKLOAD_ADJUSTMENT create/publish/resolve', async () => {
    const { year } = await createAcademicYear();
    const admin = await createTeacher('admin');

    const draft = await businessConfig.createDraft(
      {
        family: 'WORKLOAD_ADJUSTMENT',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId: year.id },
        payload: {
          baseWeeklyNorm: 18,
          rules: [
            {
              ruleId: 'r_gvcn',
              source: { kind: 'HOMEROOM_RESPONSIBILITY' },
              calculation: 'TRU_TIET',
              value: 4,
              priority: 10,
            },
          ],
        },
        commandId: normalizedCode('cmd'),
        effectiveFrom: '2026-09-01',
      },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );

    await businessConfig.publish(
      draft.version.id,
      { commandId: normalizedCode('cmd_pub'), effectiveFrom: '2026-09-01' },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );

    const resolved = await businessConfig.resolveEffectiveBusinessPolicy(
      'WORKLOAD_ADJUSTMENT',
      { kind: 'ACADEMIC_YEAR', academicYearId: year.id },
      '2026-09-10',
    );

    expect(resolved).toBeDefined();
    expect(resolved?.payload).toEqual(
      expect.objectContaining({
        baseWeeklyNorm: 18,
      }),
    );
  });

  it('2. AdditionalDuty effective window', async () => {
    const { year } = await createAcademicYear();
    const teacher = await createTeacher('teacher_duty');
    const admin = await createTeacher('admin_duty');

    const duty = await prisma.additionalDutyDefinition.create({
      data: {
        code: normalizedCode('DUTY'),
        name: 'Tổ trưởng chuyên môn',
        sortOrder: 1,
        isActive: true,
      },
    });

    await prisma.teacherAdditionalDutyAssignment.create({
      data: {
        teacherUserId: teacher.id,
        dutyDefinitionId: duty.id,
        academicYearId: year.id,
        validFrom: new Date('2026-09-10T00:00:00.000Z'),
        validUntil: new Date('2026-09-20T00:00:00.000Z'),
      },
    });

    const draft = await businessConfig.createDraft(
      {
        family: 'WORKLOAD_ADJUSTMENT',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId: year.id },
        payload: {
          baseWeeklyNorm: 17,
          rules: [
            {
              ruleId: 'r_duty',
              source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: duty.id },
              calculation: 'TRU_TIET',
              value: 3,
              priority: 10,
            },
          ],
        },
        commandId: normalizedCode('cmd'),
        effectiveFrom: '2026-09-01',
      },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );
    await businessConfig.publish(
      draft.version.id,
      { commandId: normalizedCode('cmd_pub'), effectiveFrom: '2026-09-01' },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );

    const projection = await officialWorkload.resolve({
      academicYearId: year.id,
      targetUserId: teacher.id,
      fromCivilDate: '2026-09-01' as never,
      toCivilDate: '2026-09-30' as never,
      asOfInstant: asOf,
    });

    expect(projection.status).toBe('PASS');
    const dutySegment = projection.adjustmentSegments.find(
      (s) => s.appliedRules.some((r) => r.ruleId === 'r_duty'),
    );
    expect(dutySegment).toBeDefined();
    expect(dutySegment?.adjustedWeeklyNorm).toBe(14);
  });

  it('3. Homeroom effective window', async () => {
    const { year } = await createAcademicYear();
    const teacher = await createTeacher('teacher_hr');
    const admin = await createTeacher('admin_hr');

    const sc = await prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: normalizedCode('12A'),
        name: 'Lớp 12A1',
      },
    });

    await prisma.homeroomAssignment.create({
      data: {
        teacherUserId: teacher.id,
        schoolClassId: sc.id,
        validFrom: new Date('2026-09-01T00:00:00.000Z'),
        validUntil: new Date('2026-09-15T00:00:00.000Z'),
      },
    });

    const draft = await businessConfig.createDraft(
      {
        family: 'WORKLOAD_ADJUSTMENT',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId: year.id },
        payload: {
          baseWeeklyNorm: 17,
          rules: [
            {
              ruleId: 'r_hr',
              source: { kind: 'HOMEROOM_RESPONSIBILITY' },
              calculation: 'TRU_TIET',
              value: 4,
              priority: 10,
            },
          ],
        },
        commandId: normalizedCode('cmd'),
        effectiveFrom: '2026-09-01',
      },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );
    await businessConfig.publish(
      draft.version.id,
      { commandId: normalizedCode('cmd_pub'), effectiveFrom: '2026-09-01' },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );

    const projection = await officialWorkload.resolve({
      academicYearId: year.id,
      targetUserId: teacher.id,
      fromCivilDate: '2026-09-01' as never,
      toCivilDate: '2026-09-30' as never,
      asOfInstant: asOf,
    });

    expect(projection.status).toBe('PASS');
    const activeHr = projection.adjustmentSegments.find(
      (s) => s.fromCivilDate <= '2026-09-15' && s.appliedRules.some((r) => r.ruleId === 'r_hr'),
    );
    expect(activeHr).toBeDefined();
    expect(activeHr?.adjustedWeeklyNorm).toBe(13);
  });

  it('4. ACTIVE NORMAL actual-teacher credit', async () => {
    const { year } = await createAcademicYear();
    const teacher = await createTeacher('teacher_normal');
    const subject = await prisma.subject.create({
      data: { code: normalizedCode('TOAN'), name: 'Toán học' },
    });
    const sc = await prisma.schoolClass.create({
      data: { academicYearId: year.id, code: normalizedCode('C'), name: '10A' },
    });
    const tv = await prisma.timetableVersion.create({
      data: { academicYearId: year.id, versionNumber: 1, validFrom: new Date('2026-09-01'), validUntil: null, isActive: true },
    });
    const entry = await prisma.timetableEntry.create({
      data: {
        timetableVersionId: tv.id,
        schoolClassId: sc.id,
        subjectId: subject.id,
        teacherUserId: teacher.id,
        dayOfWeek: DayOfWeek.MONDAY,
        periodOfDay: 1,
      },
    });

    await prisma.teachingExecution.create({
      data: {
        timetableEntryId: entry.id,
        actualTeacherUserId: teacher.id,
        executionCivilDate: new Date('2026-09-07T00:00:00.000Z'),
        sourceCivilDate: new Date('2026-09-07T00:00:00.000Z'),
        periodOfDay: 1,
        mode: ExecutionMode.REGULAR,
        kind: TeachingExecutionKind.NORMAL,
        status: TeachingExecutionStatus.ACTIVE,
      },
    });

    const projection = await officialWorkload.resolve({
      academicYearId: year.id,
      targetUserId: teacher.id,
      fromCivilDate: '2026-09-01' as never,
      toCivilDate: '2026-09-30' as never,
      asOfInstant: asOf,
    });

    expect(projection.curricularWorkload.totalCredit).toBe(1);
    expect(projection.curricularWorkload.contributions).toHaveLength(1);
    expect(projection.curricularWorkload.contributions[0].actualTeacherUserId).toBe(teacher.id);
  });

  it('5. SAME_SUBJECT_SUBSTITUTION credits substitute only', async () => {
    const { year } = await createAcademicYear();
    const origTeacher = await createTeacher('orig');
    const subTeacher = await createTeacher('sub');
    const subject = await prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Sử' } });
    const sc = await prisma.schoolClass.create({ data: { academicYearId: year.id, code: normalizedCode('C'), name: '11B' } });
    const tv = await prisma.timetableVersion.create({
      data: { academicYearId: year.id, versionNumber: 1, validFrom: new Date('2026-09-01'), validUntil: null, isActive: true },
    });
    const entry = await prisma.timetableEntry.create({
      data: { timetableVersionId: tv.id, schoolClassId: sc.id, subjectId: subject.id, teacherUserId: origTeacher.id, dayOfWeek: DayOfWeek.TUESDAY, periodOfDay: 2 },
    });

    await prisma.teachingExecution.create({
      data: {
        timetableEntryId: entry.id,
        actualTeacherUserId: subTeacher.id,
        executionCivilDate: new Date('2026-09-08T00:00:00.000Z'),
        sourceCivilDate: new Date('2026-09-08T00:00:00.000Z'),
        periodOfDay: 2,
        mode: ExecutionMode.SUBSTITUTION,
        kind: TeachingExecutionKind.SAME_SUBJECT_SUBSTITUTION,
        status: TeachingExecutionStatus.ACTIVE,
      },
    });

    const origProjection = await officialWorkload.resolve({
      academicYearId: year.id,
      targetUserId: origTeacher.id,
      fromCivilDate: '2026-09-01' as never,
      toCivilDate: '2026-09-30' as never,
      asOfInstant: asOf,
    });
    expect(origProjection.curricularWorkload.totalCredit).toBe(0);

    const subProjection = await officialWorkload.resolve({
      academicYearId: year.id,
      targetUserId: subTeacher.id,
      fromCivilDate: '2026-09-01' as never,
      toCivilDate: '2026-09-30' as never,
      asOfInstant: asOf,
    });
    expect(subProjection.curricularWorkload.totalCredit).toBe(1);
  });

  it('6. MAKEUP execution-date ownership', async () => {
    const { year } = await createAcademicYear();
    const teacher = await createTeacher('makeup');
    const subject = await prisma.subject.create({ data: { code: normalizedCode('D'), name: 'Địa' } });
    const sc = await prisma.schoolClass.create({ data: { academicYearId: year.id, code: normalizedCode('C'), name: '10C' } });
    const tv = await prisma.timetableVersion.create({
      data: { academicYearId: year.id, versionNumber: 1, validFrom: new Date('2026-09-01'), validUntil: null, isActive: true },
    });
    const entry = await prisma.timetableEntry.create({
      data: { timetableVersionId: tv.id, schoolClassId: sc.id, subjectId: subject.id, teacherUserId: teacher.id, dayOfWeek: DayOfWeek.WEDNESDAY, periodOfDay: 1 },
    });

    await prisma.teachingExecution.create({
      data: {
        timetableEntryId: entry.id,
        actualTeacherUserId: teacher.id,
        executionCivilDate: new Date('2026-10-05T00:00:00.000Z'),
        sourceCivilDate: new Date('2026-09-09T00:00:00.000Z'),
        periodOfDay: 1,
        mode: ExecutionMode.MAKE_UP,
        kind: TeachingExecutionKind.MAKEUP,
        status: TeachingExecutionStatus.ACTIVE,
      },
    });

    // In September: not included
    const sepProjection = await officialWorkload.resolve({
      academicYearId: year.id,
      targetUserId: teacher.id,
      fromCivilDate: '2026-09-01' as never,
      toCivilDate: '2026-09-30' as never,
      asOfInstant: asOf,
    });
    expect(sepProjection.curricularWorkload.totalCredit).toBe(0);

    // In October: included
    const octProjection = await officialWorkload.resolve({
      academicYearId: year.id,
      targetUserId: teacher.id,
      fromCivilDate: '2026-10-01' as never,
      toCivilDate: '2026-10-31' as never,
      asOfInstant: new Date('2026-10-15T00:00:00.000Z'),
    });
    expect(octProjection.curricularWorkload.totalCredit).toBe(1);
  });

  it('7. REVERSED execution exclusion', async () => {
    const { year } = await createAcademicYear();
    const teacher = await createTeacher('rev');
    const subject = await prisma.subject.create({ data: { code: normalizedCode('V'), name: 'Văn' } });
    const sc = await prisma.schoolClass.create({ data: { academicYearId: year.id, code: normalizedCode('C'), name: '10D' } });
    const tv = await prisma.timetableVersion.create({
      data: { academicYearId: year.id, versionNumber: 1, validFrom: new Date('2026-09-01'), validUntil: null, isActive: true },
    });
    const entry = await prisma.timetableEntry.create({
      data: { timetableVersionId: tv.id, schoolClassId: sc.id, subjectId: subject.id, teacherUserId: teacher.id, dayOfWeek: DayOfWeek.THURSDAY, periodOfDay: 3 },
    });

    await prisma.teachingExecution.create({
      data: {
        timetableEntryId: entry.id,
        actualTeacherUserId: teacher.id,
        executionCivilDate: new Date('2026-09-10T00:00:00.000Z'),
        sourceCivilDate: new Date('2026-09-10T00:00:00.000Z'),
        periodOfDay: 3,
        mode: ExecutionMode.REGULAR,
        kind: TeachingExecutionKind.NORMAL,
        status: TeachingExecutionStatus.REVERSED,
      },
    });

    const projection = await officialWorkload.resolve({
      academicYearId: year.id,
      targetUserId: teacher.id,
      fromCivilDate: '2026-09-01' as never,
      toCivilDate: '2026-09-30' as never,
      asOfInstant: asOf,
    });
    expect(projection.curricularWorkload.totalCredit).toBe(0);
  });

  it('8. combined curricular + P4-050 credit', async () => {
    const { year } = await createAcademicYear();
    const teacher = await createTeacher('combined');
    const subject = await prisma.subject.create({ data: { code: normalizedCode('T'), name: 'Tin' } });
    const sc = await prisma.schoolClass.create({ data: { academicYearId: year.id, code: normalizedCode('C'), name: '12C' } });
    const tv = await prisma.timetableVersion.create({
      data: { academicYearId: year.id, versionNumber: 1, validFrom: new Date('2026-09-01'), validUntil: null, isActive: true },
    });
    const entry = await prisma.timetableEntry.create({
      data: { timetableVersionId: tv.id, schoolClassId: sc.id, subjectId: subject.id, teacherUserId: teacher.id, dayOfWeek: DayOfWeek.FRIDAY, periodOfDay: 4 },
    });

    await prisma.teachingExecution.create({
      data: {
        timetableEntryId: entry.id,
        actualTeacherUserId: teacher.id,
        executionCivilDate: new Date('2026-09-11T00:00:00.000Z'),
        sourceCivilDate: new Date('2026-09-11T00:00:00.000Z'),
        periodOfDay: 4,
        mode: ExecutionMode.REGULAR,
        kind: TeachingExecutionKind.NORMAL,
        status: TeachingExecutionStatus.ACTIVE,
      },
    });

    const projection = await officialWorkload.resolve({
      academicYearId: year.id,
      targetUserId: teacher.id,
      fromCivilDate: '2026-09-01' as never,
      toCivilDate: '2026-09-30' as never,
      asOfInstant: asOf,
    });

    expect(projection.curricularWorkload.totalCredit).toBe(1);
    expect(projection.earnedCredit).toBe(1);
    expect(projection.status).toBe('PASS');
  });

  it('9. arbitrary partial-range/calendar proration', async () => {
    const { year } = await createAcademicYear();
    const teacher = await createTeacher('proration');
    const admin = await createTeacher('admin_proration');

    const draft = await businessConfig.createDraft(
      {
        family: 'WORKLOAD_ADJUSTMENT',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId: year.id },
        payload: { baseWeeklyNorm: 18, rules: [] },
        commandId: normalizedCode('cmd'),
        effectiveFrom: '2026-09-01',
      },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );
    await businessConfig.publish(
      draft.version.id,
      { commandId: normalizedCode('cmd_pub'), effectiveFrom: '2026-09-01' },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );

    // 2026-09-01 (Tue) to 2026-09-05 (Sat) = 5 teaching days (Tue, Wed, Thu, Fri, Sat)
    // Daily required = 18 / 6 = 3. Total required = 5 * 3 = 15
    const projection = await officialWorkload.resolve({
      academicYearId: year.id,
      targetUserId: teacher.id,
      fromCivilDate: '2026-09-01' as never,
      toCivilDate: '2026-09-05' as never,
      asOfInstant: asOf,
    });

    expect(projection.status).toBe('PASS');
    expect(projection.requiredCredit).toBe(15);
  });

  it('10. policy change inside report range', async () => {
    const { year } = await createAcademicYear();
    const teacher = await createTeacher('policy_change');
    const admin = await createTeacher('admin_policy');

    const draft1 = await businessConfig.createDraft(
      {
        family: 'WORKLOAD_ADJUSTMENT',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId: year.id },
        payload: { baseWeeklyNorm: 18, rules: [] },
        commandId: normalizedCode('cmd1'),
        effectiveFrom: '2026-09-01',
      },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );
    await businessConfig.publish(
      draft1.version.id,
      { commandId: normalizedCode('cmd1_pub'), effectiveFrom: '2026-09-01' },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );

    const draft2 = await businessConfig.createDraft(
      {
        family: 'WORKLOAD_ADJUSTMENT',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId: year.id },
        payload: { baseWeeklyNorm: 12, rules: [] },
        commandId: normalizedCode('cmd2'),
        effectiveFrom: '2026-09-16',
      },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );
    await businessConfig.publish(
      draft2.version.id,
      { commandId: normalizedCode('cmd2_pub'), effectiveFrom: '2026-09-16' },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );

    const projection = await officialWorkload.resolve({
      academicYearId: year.id,
      targetUserId: teacher.id,
      fromCivilDate: '2026-09-01' as never,
      toCivilDate: '2026-09-30' as never,
      asOfInstant: asOf,
    });

    expect(projection.status).toBe('PASS');
    expect(projection.adjustmentSegments.length).toBeGreaterThanOrEqual(2);
    const seg1 = projection.adjustmentSegments.find((s) => s.fromCivilDate === '2026-09-01');
    const seg2 = projection.adjustmentSegments.find((s) => s.fromCivilDate === '2026-09-16');
    expect(seg1?.baseWeeklyNorm).toBe(18);
    expect(seg2?.baseWeeklyNorm).toBe(12);
  });

  it('11. Reporting Statement submit persists SNAPSHOT_V4', async () => {
    const { year } = await createAcademicYear();
    const teacher = await createTeacher('statement_submit');
    const admin = await createTeacher('admin_submit');

    const draft = await businessConfig.createDraft(
      {
        family: 'WORKLOAD_ADJUSTMENT',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId: year.id },
        payload: { baseWeeklyNorm: 18, rules: [] },
        commandId: normalizedCode('cmd'),
        effectiveFrom: '2026-09-01',
      },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );
    await businessConfig.publish(
      draft.version.id,
      { commandId: normalizedCode('cmd_pub'), effectiveFrom: '2026-09-01' },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );

    // Setup operational start policy for reporting statement
    const opDraft = await businessConfig.createDraft(
      {
        family: 'PROGRESS_DEBT_OPERATIONAL_START',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId: year.id },
        payload: { operationalStartDate: '2026-09-01' },
        commandId: normalizedCode('op_cmd'),
        effectiveFrom: '2026-09-01',
      },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );
    await businessConfig.publish(
      opDraft.version.id,
      { commandId: normalizedCode('op_pub'), effectiveFrom: '2026-09-01' },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );

    const submitResult = await reportingService.submit(
      {
        academicYearId: year.id,
        fromCivilDate: '2026-09-01',
        toCivilDate: '2026-09-30',
        requestKey: normalizedCode('req'),
      },
      { auth: { user: { id: teacher.id } } } as never,
    );

    expect(submitResult.status).toBe('SUBMITTED');
    const revision = await prisma.reportingStatementRevision.findUniqueOrThrow({
      where: { id: submitResult.revisionId },
    });
    const snapshot = revision.frozenSnapshot as Record<string, unknown>;
    expect(snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V4);
    expect(snapshot.officialWorkload).toBeDefined();
  });

  it('12. later policy/duty/homeroom mutation does not rewrite frozen V4', async () => {
    const { year } = await createAcademicYear();
    const teacher = await createTeacher('frozen_v4');
    const admin = await createTeacher('admin_frozen');

    const draft = await businessConfig.createDraft(
      {
        family: 'WORKLOAD_ADJUSTMENT',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId: year.id },
        payload: { baseWeeklyNorm: 18, rules: [] },
        commandId: normalizedCode('cmd'),
        effectiveFrom: '2026-09-01',
      },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );
    await businessConfig.publish(
      draft.version.id,
      { commandId: normalizedCode('cmd_pub'), effectiveFrom: '2026-09-01' },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );

    const opDraft = await businessConfig.createDraft(
      {
        family: 'PROGRESS_DEBT_OPERATIONAL_START',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId: year.id },
        payload: { operationalStartDate: '2026-09-01' },
        commandId: normalizedCode('op_cmd'),
        effectiveFrom: '2026-09-01',
      },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );
    await businessConfig.publish(
      opDraft.version.id,
      { commandId: normalizedCode('op_pub'), effectiveFrom: '2026-09-01' },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );

    const submitResult = await reportingService.submit(
      {
        academicYearId: year.id,
        fromCivilDate: '2026-09-01',
        toCivilDate: '2026-09-30',
        requestKey: normalizedCode('req'),
      },
      { auth: { user: { id: teacher.id } } } as never,
    );

    const initialRevision = await prisma.reportingStatementRevision.findUniqueOrThrow({
      where: { id: submitResult.revisionId },
      include: { series: true, subjects: true },
    });
    const initialCanonicalJson = initialRevision.canonicalSnapshotJson;
    const initialHash = initialRevision.semanticHash;

    // Mutate business policy later
    const draftMutation = await businessConfig.createDraft(
      {
        family: 'WORKLOAD_ADJUSTMENT',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId: year.id },
        payload: { baseWeeklyNorm: 10, rules: [] },
        commandId: normalizedCode('cmd_mut'),
        effectiveFrom: '2026-09-01',
      },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );
    await businessConfig.publish(
      draftMutation.version.id,
      { commandId: normalizedCode('cmd_mut_pub'), effectiveFrom: '2026-09-01' },
      admin.id,
      { ip: '127.0.0.1', userAgent: 'test' },
    );

    // Read detail via presenter
    const detail = presentReportingStatementDetail(initialRevision as never);
    expect(detail.snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V4);

    // Verify raw row in database did not change
    const rereadRevision = await prisma.reportingStatementRevision.findUniqueOrThrow({
      where: { id: submitResult.revisionId },
    });
    expect(rereadRevision.canonicalSnapshotJson).toBe(initialCanonicalJson);
    expect(rereadRevision.semanticHash).toBe(initialHash);
  });
});
