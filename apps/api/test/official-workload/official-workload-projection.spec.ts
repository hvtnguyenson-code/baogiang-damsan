import { OfficialWorkloadProjectionService } from '../../src/official-workload/official-workload-projection.service';
import { BusinessConfigurationService } from '../../src/business-configuration/business-configuration.service';
import { SpecialProgrammeWorkloadProjectionService } from '../../src/special-programme-workload/special-programme-workload-projection.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CivilDateString } from '@baogiang/contracts';
import { TeachingExecutionStatus } from '@prisma/client';

interface MockExecutionWhere {
  status?: string;
  actualTeacherUserId?: string;
  academicYearId?: string;
  executionCivilDate?: {
    gte?: Date | string;
    lte?: Date | string;
  };
}

interface MockExecutionItem {
  id: string;
  status: string;
  actualTeacherUserId: string;
  responsibleTeacherUserId?: string;
  executionCivilDate: Date | string;
  sourceCivilDate?: Date | string;
  academicYearId: string;
  schoolClassId?: string;
  subjectId?: string;
  originalTimetableEntryId?: string;
  kind?: string;
  replacesId?: string | null;
}

interface HarnessOptions {
  curricularExecutions?: unknown[];
  calendarVersions?: unknown[];
  calendarInterruptions?: unknown[];
  homeroomAssignments?: unknown[];
  dutyAssignments?: unknown[];
  dutyDefinitions?: unknown[];
  policyResolver?: (family: string, resource: unknown, civilDate: string, tx: unknown) => Promise<unknown>;
  specialWorkloadResolver?: (input: unknown) => Promise<unknown>;
}

describe('OfficialWorkloadProjectionService (ADR-057, Sections 39-42)', () => {
  const academicYearId = '11111111-1111-4111-8111-111111111111';
  const targetTeacherId = '22222222-2222-4222-8222-222222222222';
  const otherTeacherId = '33333333-3333-4333-8333-333333333333';
  const calendarVersionId = '44444444-4444-4444-8444-444444444444';
  const dutyDefId = '55555555-5555-4555-8555-555555555555';
  const asOfInstant = new Date('2026-09-20T10:00:00.000Z');

  function setupHarness(opts: HarnessOptions = {}) {
    const defaultCalendar = {
      id: calendarVersionId,
      academicYearId,
      versionNumber: 1,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2027-05-31T00:00:00.000Z'),
      teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'], // 6 weekdays -> denominator K = 6
      isActive: true,
      interruptions: opts.calendarInterruptions ?? [],
    };

    const defaultPolicy = {
      outcome: 'RESOLVED',
      family: 'WORKLOAD_ADJUSTMENT',
      resource: { kind: 'ACADEMIC_YEAR', academicYearId },
      requestedCivilDate: '2026-09-07',
      policyVersionId: 'pol-ver-1',
      validatorVersion: 'v1',
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
          {
            ruleId: 'r_duty',
            source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: dutyDefId },
            calculation: 'TRU_TIET',
            value: 2,
            priority: 20,
          },
        ],
      },
      effectiveFrom: '2026-09-01',
      effectiveUntil: null,
    };

    const mockPrisma = {
      curricularTeachingExecution: {
        findMany: jest.fn().mockImplementation((args?: { where?: MockExecutionWhere }) => {
          let list: MockExecutionItem[] = ((opts.curricularExecutions as unknown as MockExecutionItem[]) ?? []).slice();
          if (args?.where) {
            const w = args.where;
            if (w.status) {
              list = list.filter((e) => e.status === w.status);
            }
            if (w.actualTeacherUserId) {
              list = list.filter((e) => e.actualTeacherUserId === w.actualTeacherUserId);
            }
            if (w.academicYearId) {
              list = list.filter((e) => e.academicYearId === w.academicYearId);
            }
            if (w.executionCivilDate?.gte) {
              const gteTime = new Date(w.executionCivilDate.gte).getTime();
              list = list.filter((e) => new Date(e.executionCivilDate).getTime() >= gteTime);
            }
            if (w.executionCivilDate?.lte) {
              const lteTime = new Date(w.executionCivilDate.lte).getTime();
              list = list.filter((e) => new Date(e.executionCivilDate).getTime() <= lteTime);
            }
          }
          return Promise.resolve(list);
        }),
      },
      academicCalendarVersion: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.calendarVersions ?? [defaultCalendar])),
      },
      calendarInterruption: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.calendarInterruptions ?? [])),
      },
      homeroomAssignment: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.homeroomAssignments ?? [])),
      },
      staffAdditionalDutyAssignment: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.dutyAssignments ?? [])),
      },
      additionalDutyDefinition: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.dutyDefinitions ?? [
          { id: dutyDefId, code: 'TPT', name: 'Tổng phụ trách Đội', isActive: true },
        ])),
        findUnique: jest.fn().mockImplementation((args: { where: { id: string } }) => {
          const list: Array<{ id: string; code: string; name: string; isActive: boolean }> =
            (opts.dutyDefinitions as Array<{ id: string; code: string; name: string; isActive: boolean }>) ?? [
              { id: dutyDefId, code: 'TPT', name: 'Tổng phụ trách Đội', isActive: true },
            ];
          return Promise.resolve(list.find((d) => d.id === args.where.id) ?? null);
        }),
      },
      staffProfile: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve({ id: 'profile-1', userId: targetTeacherId })),
      },
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
    };

    const mockBusinessConfig = {
      resolveEffectiveBusinessPolicy: jest.fn().mockImplementation(
        (family, res, civilDate, tx) => {
          if (opts.policyResolver) return opts.policyResolver(family, res, civilDate, tx);
          return Promise.resolve(defaultPolicy);
        },
      ),
    };

    const mockSpecialWorkload = {
      resolve: jest.fn().mockImplementation((input) => {
        if (opts.specialWorkloadResolver) return opts.specialWorkloadResolver(input);
        return Promise.resolve({
          profile: 'SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_V1',
          status: 'PASS',
          scope: input,
          totalCredit: 3,
          contributionCount: 2,
          contributions: [],
          pendingConfirmation: [],
          findings: [],
          evaluatedAt: new Date().toISOString(),
        });
      }),
      resolveInTransaction: jest.fn().mockImplementation((_tx, input) => {
        if (opts.specialWorkloadResolver) return opts.specialWorkloadResolver(input);
        return Promise.resolve({
          profile: 'SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_V1',
          status: 'PASS',
          scope: input,
          totalCredit: 3,
          contributionCount: 2,
          contributions: [],
          pendingConfirmation: [],
          findings: [],
          evaluatedAt: new Date().toISOString(),
        });
      }),
    };

    const service = new OfficialWorkloadProjectionService(
      mockPrisma as unknown as PrismaService,
      mockBusinessConfig as unknown as BusinessConfigurationService,
      mockSpecialWorkload as unknown as SpecialProgrammeWorkloadProjectionService,
    );

    return { service, mockPrisma, mockBusinessConfig, mockSpecialWorkload };
  }

  describe('Curricular Workload Ownership (Section 40)', () => {
    it('credits 1 to actualTeacherUserId for ACTIVE NORMAL execution', async () => {
      const { service } = setupHarness({
        curricularExecutions: [
          {
            id: 'exec-1',
            status: TeachingExecutionStatus.ACTIVE,
            actualTeacherUserId: targetTeacherId,
            responsibleTeacherUserId: targetTeacherId,
            executionCivilDate: new Date('2026-09-07T00:00:00.000Z'), // Monday
            sourceCivilDate: new Date('2026-09-07T00:00:00.000Z'),
            academicYearId,
            schoolClassId: 'class-1',
            subjectId: 'sub-1',
            originalTimetableEntryId: 'tt-1',
            kind: 'NORMAL',
            replacesId: null,
          },
        ],
      });

      const res = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-07' as CivilDateString,
        asOfInstant,
      });

      expect(res.status).toBe('PASS');
      expect(res.curricularWorkload.totalCredit).toBe(1);
      expect(res.curricularWorkload.contributionCount).toBe(1);
    });

    it('SAME_SUBJECT_SUBSTITUTION: credits substitute actual teacher; responsible teacher receives 0', async () => {
      const { service: serviceForSubstitute } = setupHarness({
        curricularExecutions: [
          {
            id: 'exec-sub',
            status: TeachingExecutionStatus.ACTIVE,
            actualTeacherUserId: targetTeacherId, // substitute
            responsibleTeacherUserId: otherTeacherId, // original responsible
            executionCivilDate: new Date('2026-09-07T00:00:00.000Z'),
            sourceCivilDate: new Date('2026-09-07T00:00:00.000Z'),
            academicYearId,
            schoolClassId: 'class-1',
            subjectId: 'sub-1',
            originalTimetableEntryId: 'tt-1',
            kind: 'SAME_SUBJECT_SUBSTITUTION',
            replacesId: null,
          },
        ],
      });

      const resSubstitute = await serviceForSubstitute.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-07' as CivilDateString,
        asOfInstant,
      });
      expect(resSubstitute.curricularWorkload.totalCredit).toBe(1);

      // Cho giáo viên responsibleTeacherUserId (otherTeacherId)
      const { service: serviceForResponsible } = setupHarness({
        curricularExecutions: [], // query theo actualTeacherUserId = otherTeacherId sẽ trả về empty
      });
      const resResponsible = await serviceForResponsible.resolve({
        academicYearId,
        targetUserId: otherTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-07' as CivilDateString,
        asOfInstant,
      });
      expect(resResponsible.curricularWorkload.totalCredit).toBe(0);
    });

    it('MAKEUP: credits actual teacher on executionCivilDate, not sourceCivilDate', async () => {
      const { service } = setupHarness({
        curricularExecutions: [
          {
            id: 'exec-makeup',
            status: TeachingExecutionStatus.ACTIVE,
            actualTeacherUserId: targetTeacherId,
            responsibleTeacherUserId: targetTeacherId,
            executionCivilDate: new Date('2026-09-14T00:00:00.000Z'), // execution date in week 2
            sourceCivilDate: new Date('2026-09-07T00:00:00.000Z'), // original date in week 1
            academicYearId,
            schoolClassId: 'class-1',
            subjectId: 'sub-1',
            originalTimetableEntryId: 'tt-1',
            kind: 'MAKEUP',
            replacesId: null,
          },
        ],
      });

      // Kiểm tra khi query tuần 2 (chứa 2026-09-14): nhận 1
      const resWeek2 = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-14' as CivilDateString,
        toCivilDate: '2026-09-14' as CivilDateString,
        asOfInstant,
      });
      expect(resWeek2.curricularWorkload.totalCredit).toBe(1);

      // Kiểm tra khi query tuần 1 (2026-09-07): nhận 0 vì executionCivilDate nằm ở 2026-09-14
      const resWeek1 = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-07' as CivilDateString,
        asOfInstant,
      });
      expect(resWeek1.curricularWorkload.totalCredit).toBe(0);
    });

    it('REVERSED execution receives 0 credit', async () => {
      const { service } = setupHarness({
        curricularExecutions: [
          {
            id: 'exec-rev',
            status: TeachingExecutionStatus.REVERSED,
            actualTeacherUserId: targetTeacherId,
            responsibleTeacherUserId: targetTeacherId,
            executionCivilDate: new Date('2026-09-07T00:00:00.000Z'),
            sourceCivilDate: new Date('2026-09-07T00:00:00.000Z'),
            academicYearId,
            schoolClassId: 'class-1',
            subjectId: 'sub-1',
            originalTimetableEntryId: 'tt-1',
            kind: 'NORMAL',
            replacesId: null,
          },
        ],
      });

      const res = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-07' as CivilDateString,
        asOfInstant,
      });
      expect(res.curricularWorkload.totalCredit).toBe(0);
      expect(res.curricularWorkload.contributionCount).toBe(0);
    });
  });

  describe('Special Programme Reuse (Section 41)', () => {
    it('combines curricular and special programme credit into earnedCredit', async () => {
      const { service } = setupHarness({
        curricularExecutions: [
          {
            id: 'exec-1',
            status: TeachingExecutionStatus.ACTIVE,
            actualTeacherUserId: targetTeacherId,
            responsibleTeacherUserId: targetTeacherId,
            executionCivilDate: new Date('2026-09-07T00:00:00.000Z'),
            sourceCivilDate: new Date('2026-09-07T00:00:00.000Z'),
            academicYearId,
            schoolClassId: 'class-1',
            subjectId: 'sub-1',
            originalTimetableEntryId: 'tt-1',
            kind: 'NORMAL',
            replacesId: null,
          },
        ],
        specialWorkloadResolver: () =>
          Promise.resolve({
            profile: 'SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_V1',
            status: 'PASS',
            totalCredit: 2.5,
            contributionCount: 2,
            contributions: [],
            pendingConfirmation: [],
            findings: [],
            evaluatedAt: new Date().toISOString(),
          }),
      });

      const res = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-07' as CivilDateString,
        asOfInstant,
      });

      expect(res.status).toBe('PASS');
      expect(res.curricularWorkload.totalCredit).toBe(1);
      expect(res.specialProgrammeWorkload.totalCredit).toBe(2.5);
      expect(res.earnedCredit).toBe(3.5); // 1 + 2.5 = 3.5
    });

    it('propagates BLOCKED status when special programme projection is BLOCKED', async () => {
      const { service } = setupHarness({
        specialWorkloadResolver: () =>
          Promise.resolve({
            profile: 'SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_V1',
            status: 'BLOCKED',
            totalCredit: null,
            contributionCount: null,
            contributions: [],
            pendingConfirmation: [],
            findings: [{ code: 'POLICY_NOT_CONFIGURED', message: 'No policy', severity: 'BLOCKER', entityIds: [] }],
            evaluatedAt: new Date().toISOString(),
          }),
      });

      const res = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-07' as CivilDateString,
        asOfInstant,
      });

      expect(res.status).toBe('BLOCKED');
      expect(res.findings.some((f) => f.code === 'SPECIAL_PROGRAMME_WORKLOAD_BLOCKED')).toBe(true);
    });
  });

  describe('Source Semantics (Section 39)', () => {
    it('HOMEROOM: applies reduction once per date even with multiple homeroom classes', async () => {
      // 2026-09-07 is Monday. Base norm 18, GVCN minus 4 => 14. Denominator K = 6 => 14 / 6 = 2.3333 daily
      const { service } = setupHarness({
        homeroomAssignments: [
          {
            id: 'hr-1',
            schoolClassId: 'class-1',
            teacherUserId: targetTeacherId,
            validFrom: new Date('2026-09-01T00:00:00.000Z'),
            validUntil: null,
          },
          {
            id: 'hr-2',
            schoolClassId: 'class-2',
            teacherUserId: targetTeacherId,
            validFrom: new Date('2026-09-01T00:00:00.000Z'),
            validUntil: null,
          },
        ],
      });

      const res = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-07' as CivilDateString,
        asOfInstant,
      });

      expect(res.status).toBe('PASS');
      // baseWeeklyNorm: 18, GVCN: -4 => adjustedWeeklyNorm = 14
      // dailyRequiredCredit = 14 / 6 = 2.3333
      expect(res.requiredCredit).toBe(2.3333);
      expect(res.adjustmentSegments[0].adjustedWeeklyNorm).toBe(14);
      expect(res.adjustmentSegments[0].appliedRules).toHaveLength(1);
    });

    it('ADDITIONAL_DUTY: applies reduction once per date even with multiple assignments; converts HCM date boundary', async () => {
      // ValidFrom inclusive, validUntil exclusive in HCM timezone
      // 2026-09-07 00:00 HCM = 2026-09-06T17:00:00.000Z
      // 2026-09-08 00:00 HCM = 2026-09-07T17:00:00.000Z
      const { service } = setupHarness({
        dutyAssignments: [
          {
            id: 'duty-assign-1',
            dutyDefinitionId: dutyDefId,
            staffProfileId: 'profile-1',
            validFrom: new Date('2026-09-06T17:00:00.000Z'), // 2026-09-07 00:00 HCM
            validUntil: new Date('2026-09-07T17:00:00.000Z'), // 2026-09-08 00:00 HCM (exclusive on 08)
          },
          {
            id: 'duty-assign-2',
            dutyDefinitionId: dutyDefId,
            staffProfileId: 'profile-1',
            validFrom: new Date('2026-09-06T17:00:00.000Z'),
            validUntil: null,
          },
        ],
      });

      const res = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-07' as CivilDateString,
        asOfInstant,
      });

      expect(res.status).toBe('PASS');
      // Base: 18, Duty: -2 => adjustedWeeklyNorm = 16. Denominator K = 6 => 16 / 6 = 2.6667
      expect(res.requiredCredit).toBe(2.6667);
      expect(res.adjustmentSegments[0].adjustedWeeklyNorm).toBe(16);
      expect(res.adjustmentSegments[0].appliedRules).toHaveLength(1);
    });
  });

  describe('Required Workload & Calendar Proration (Section 42)', () => {
    it('non-teaching weekday (Sunday) has daily required credit = 0', async () => {
      // 2026-09-06 is Sunday
      const { service } = setupHarness();
      const res = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-06' as CivilDateString,
        toCivilDate: '2026-09-06' as CivilDateString,
        asOfInstant,
      });

      expect(res.status).toBe('PASS');
      expect(res.requiredCredit).toBe(0);
    });

    it('CalendarInterruption covering date suppresses daily required credit to 0', async () => {
      // 2026-09-07 is Monday
      const { service } = setupHarness({
        calendarInterruptions: [
          {
            id: 'interruption-1',
            academicCalendarVersionId: calendarVersionId,
            startDate: new Date('2026-09-07T00:00:00.000Z'),
            endDate: new Date('2026-09-07T00:00:00.000Z'),
          },
        ],
      });

      const res = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-07' as CivilDateString,
        asOfInstant,
      });

      expect(res.status).toBe('PASS');
      expect(res.requiredCredit).toBe(0);
      expect(res.adjustmentSegments[0].hasInterruption).toBe(true);
    });

    it('Partition Additivity: required(A..C) = required(A..B) + required(B+1..C)', async () => {
      // 2026-09-07 (Mon) to 2026-09-12 (Sat) = 6 teaching days
      // Base norm = 18, no rules => daily = 18 / 6 = 3.0
      // Mon-Sat: total = 18.0
      // Part 1: Mon-Wed (3 days) = 9.0
      // Part 2: Thu-Sat (3 days) = 9.0
      const { service } = setupHarness();

      const fullRange = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-12' as CivilDateString,
        asOfInstant,
      });

      const part1 = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-09' as CivilDateString,
        asOfInstant,
      });

      const part2 = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-10' as CivilDateString,
        toCivilDate: '2026-09-12' as CivilDateString,
        asOfInstant,
      });

      expect(fullRange.status).toBe('PASS');
      expect(part1.status).toBe('PASS');
      expect(part2.status).toBe('PASS');

      expect(fullRange.requiredCredit).toBe(18);
      expect(part1.requiredCredit).toBe(9);
      expect(part2.requiredCredit).toBe(9);
      expect(part1.requiredCredit! + part2.requiredCredit!).toBe(fullRange.requiredCredit);
    });

    it('mid-range policy change resolves date-effective policy per day and creates segments', async () => {
      // 2026-09-07 (Mon) policy ver 1 (norm 18 -> daily 3)
      // 2026-09-08 (Tue) policy ver 2 (norm 12 -> daily 2)
      const { service } = setupHarness({
        policyResolver: (_family, _res, civilDate) => {
          if (civilDate === '2026-09-07') {
            return Promise.resolve({
              outcome: 'RESOLVED',
              family: 'WORKLOAD_ADJUSTMENT',
              policyVersionId: 'ver-1',
              validatorVersion: 'v1',
              payload: { baseWeeklyNorm: 18, rules: [] },
              effectiveFrom: '2026-09-01',
              effectiveUntil: '2026-09-07',
            });
          }
          return Promise.resolve({
            outcome: 'RESOLVED',
            family: 'WORKLOAD_ADJUSTMENT',
            policyVersionId: 'ver-2',
            validatorVersion: 'v1',
            payload: { baseWeeklyNorm: 12, rules: [] },
            effectiveFrom: '2026-09-08',
            effectiveUntil: null,
          });
        },
      });

      const res = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-08' as CivilDateString,
        asOfInstant,
      });

      expect(res.status).toBe('PASS');
      // 3 + 2 = 5
      expect(res.requiredCredit).toBe(5);
      expect(res.adjustmentSegments).toHaveLength(2);
      expect(res.adjustmentSegments[0].policyVersionId).toBe('ver-1');
      expect(res.adjustmentSegments[1].policyVersionId).toBe('ver-2');
    });

    it('fails closed (BLOCKED) when policy is missing on a workload-eligible teaching day', async () => {
      const { service } = setupHarness({
        policyResolver: () => Promise.resolve({ outcome: 'POLICY_NOT_CONFIGURED' }),
      });

      const res = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-07' as CivilDateString,
        toCivilDate: '2026-09-07' as CivilDateString,
        asOfInstant,
      });

      expect(res.status).toBe('BLOCKED');
      expect(res.findings.some((f) => f.code === 'WORKLOAD_ADJUSTMENT_POLICY_NOT_CONFIGURED')).toBe(true);
    });

    it('range with zero eligible dates yields requiredCredit = 0 without blocker', async () => {
      // 2026-09-06 is Sunday (non-teaching day)
      const { service } = setupHarness({
        policyResolver: () => Promise.resolve({ outcome: 'POLICY_NOT_CONFIGURED' }), // dù policy không có, nhưng ngày không eligible nên không block
      });

      const res = await service.resolve({
        academicYearId,
        targetUserId: targetTeacherId,
        fromCivilDate: '2026-09-06' as CivilDateString,
        toCivilDate: '2026-09-06' as CivilDateString,
        asOfInstant,
      });

      expect(res.status).toBe('PASS');
      expect(res.requiredCredit).toBe(0);
    });
  });
});
