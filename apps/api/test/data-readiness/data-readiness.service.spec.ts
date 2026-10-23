import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataReadinessService } from '../../src/data-readiness/data-readiness.service';

describe('DataReadinessService (Unit)', () => {
  let service: DataReadinessService;
  let prismaMock: Record<string, Record<string, jest.Mock>>;
  let policyMock: { resolveEffectiveBusinessPolicy: jest.Mock };
  let authMock: { listEffectiveCapabilities: jest.Mock };

  const validUser = { id: 'user-bgh', status: 'ACTIVE', lockedUntil: null, mustChangePassword: false };
  const mockReq = { auth: { user: validUser } } as unknown as Parameters<DataReadinessService['getSummary']>[0];

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue(validUser),
      },
      academicYear: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'year-1', code: '2026-2027', name: 'Năm học 2026-2027' },
        ]),
      },
      timetableVersion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      academicCalendarVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      timeSlotDefinition: {
        count: jest.fn().mockResolvedValue(10),
      },
      subject: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'subj-1', code: 'TOAN', name: 'Toán' },
          { id: 'subj-2', code: 'VAN', name: 'Ngữ văn' },
        ]),
      },
      ppctPlan: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      ppctClassAssociation: { findMany: jest.fn().mockResolvedValue([]) },
      teachingAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      businessPolicyVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      historicalTeachingImportBatch: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      curricularTeachingExecution: {
        count: jest.fn().mockResolvedValue(0),
      },
      programmeMaster: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      programmePlanVersion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      plannedProgrammeOccurrence: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    authMock = {
      listEffectiveCapabilities: jest.fn().mockResolvedValue([
        { key: 'APPROVAL_PRINCIPAL', scope: 'SCHOOL_WIDE' },
      ]),
    };

    policyMock = { resolveEffectiveBusinessPolicy: jest.fn().mockResolvedValue({ outcome: 'POLICY_NOT_CONFIGURED' }) };
    service = new DataReadinessService(prismaMock as unknown as ConstructorParameters<typeof DataReadinessService>[0], authMock as unknown as ConstructorParameters<typeof DataReadinessService>[1], policyMock as unknown as ConstructorParameters<typeof DataReadinessService>[2]);
  });

  describe('Authorization & Fail-closed guards', () => {
    it('throws ForbiddenException if request has no auth or user must change password', async () => {
      await expect(service.getSummary({ auth: null } as unknown as Parameters<DataReadinessService['getSummary']>[0])).rejects.toThrow(ForbiddenException);
      await expect(
        service.getSummary({ auth: { user: { id: 'u1', mustChangePassword: true } } } as unknown as Parameters<DataReadinessService['getSummary']>[0]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if user is inactive in database', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ status: 'SUSPENDED', lockedUntil: null });
      await expect(service.getSummary(mockReq)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if caller has only personal teacher capabilities', async () => {
      authMock.listEffectiveCapabilities.mockResolvedValueOnce([
        { key: 'TEACHER_BASE', scope: 'PERSONAL' },
        { key: 'REPORTING_STATEMENT_SUBMIT', scope: 'PERSONAL' },
      ]);
      await expect(service.getSummary(mockReq)).rejects.toThrow(ForbiddenException);
    });

    it('allows Principal (APPROVAL_PRINCIPAL / SCHOOL_WIDE)', async () => {
      authMock.listEffectiveCapabilities.mockResolvedValueOnce([
        { key: 'APPROVAL_PRINCIPAL', scope: 'SCHOOL_WIDE' },
      ]);
      const res = await service.getSummary(mockReq);
      expect(res).toBeDefined();
      expect(res.domains).toHaveLength(5);
    });

    it('allows Vice Principal (APPROVAL_VICE_PRINCIPAL / SCHOOL_WIDE)', async () => {
      authMock.listEffectiveCapabilities.mockResolvedValueOnce([
        { key: 'APPROVAL_VICE_PRINCIPAL', scope: 'SCHOOL_WIDE' },
      ]);
      const res = await service.getSummary(mockReq);
      expect(res).toBeDefined();
      expect(res.domains).toHaveLength(5);
    });

    it('allows Timetable Admin (TIMETABLE_MANAGE / SCHOOL_WIDE)', async () => {
      authMock.listEffectiveCapabilities.mockResolvedValueOnce([
        { key: 'TIMETABLE_MANAGE', scope: 'SCHOOL_WIDE' },
      ]);
      const res = await service.getSummary(mockReq);
      expect(res).toBeDefined();
    });
  });

  describe('Empty academic years scenario', () => {
    it('returns graceful NO_DATA response if no academic years exist', async () => {
      prismaMock.academicYear.findMany.mockResolvedValueOnce([]);
      const res = await service.getSummary(mockReq);
      expect(res.academicYear).toBeNull();
      expect(res.overallStatus).toBe('NO_DATA');
      expect(res.domains).toHaveLength(5);
      expect(res.domains.every((d) => d.status === 'NO_DATA')).toBe(true);
    });
  });

  const day = (value: string) => new Date(value);
  async function domain(key: string) {
    return (await service.getSummary(mockReq, 'year-1')).domains.find((d) => d.key === key)!;
  }
  function calendar() {
    prismaMock.academicCalendarVersion.findFirst.mockResolvedValue({ id: 'cal', startDate: day('2026-09-01'), endDate: day('2027-06-01'), isActive: true });
  }
  function policy(date = '2026-09-01') {
    policyMock.resolveEffectiveBusinessPolicy.mockResolvedValue({ outcome: 'RESOLVED', payload: { operationalStartDate: date } });
  }
  function ppct() {
    const plans = [10, 11].map((gradeLevel) => ({ id: `p${gradeLevel}`, subjectId: 'math', gradeLevel, versions: [{ id: `v${gradeLevel}`, versionNumber: 1, status: 'PUBLISHED', updatedAt: new Date() }] }));
    prismaMock.ppctPlan.findMany.mockResolvedValue(plans);
    prismaMock.teachingAssignment.findMany.mockResolvedValue(plans.map((p) => ({ subjectId: p.subjectId, schoolClassId: `c${p.gradeLevel}`, schoolClass: { gradeLevel: p.gradeLevel }, validFrom: day('2026-09-01'), validUntil: day('2027-06-01') })));
    prismaMock.ppctClassAssociation.findMany.mockResolvedValue(plans.map((p) => ({ schoolClassId: `c${p.gradeLevel}`, subjectId: p.subjectId, effectiveFrom: day('2026-09-01'), effectiveUntil: null, ppctPlan: p, ppctVersion: p.versions[0] })));
    return plans;
  }
  function programme(kind: 'GDDP' | 'HDTN_HN', statuses: Array<string | null>) {
    prismaMock.programmeMaster.findMany.mockImplementation(async ({ where }: { where: { kind: string } }) => where.kind === kind ? statuses.map((_, i) => ({ id: `m${i}`, gradeLevel: kind === 'GDDP' ? 10 + i : null })) : []);
    prismaMock.programmePlanVersion.findMany.mockResolvedValue(statuses.flatMap((status, i) => status ? [{ programmeMasterId: `m${i}`, versionNumber: 1, status, createdAt: new Date(), updatedAt: new Date() }] : []));
  }

  it.each([undefined, []])('rejects an explicit unknown year even without available years: %s', async (years) => {
    if (years) prismaMock.academicYear.findMany.mockResolvedValue(years);
    await expect(service.getSummary(mockReq, 'unknown')).rejects.toThrow(NotFoundException);
    expect(prismaMock.timetableVersion.findMany).not.toHaveBeenCalled();
  });
  it('selects the requested year, and defaults only when no ID is supplied', async () => {
    prismaMock.academicYear.findMany.mockResolvedValue([{ id: 'year-2' }, { id: 'year-1' }]);
    expect((await service.getSummary(mockReq, 'year-1')).academicYear?.id).toBe('year-1');
    expect((await service.getSummary(mockReq)).academicYear?.id).toBe('year-2');
  });

  it.each(['POLICY_NOT_CONFIGURED', 'POLICY_AMBIGUOUS', 'POLICY_CORRUPT'])('history fails closed for %s', async (outcome) => {
    calendar();
    policyMock.resolveEffectiveBusinessPolicy.mockResolvedValue({ outcome });
    const item = await domain('HISTORICAL_TEACHING');
    expect(item.status).toBe('NOT_READY');
    expect(item.findings[0].code).toBe(outcome);
    expect(item.stats.delayedGoLiveApplies).toBeNull();
  });
  it('history fails closed without a calendar despite a valid policy', async () => {
    policy();
    expect((await domain('HISTORICAL_TEACHING')).status).toBe('NOT_READY');
  });
  it.each(['2026-08-31', '2027-06-02'])('history rejects a date outside the active calendar: %s', async (date) => {
    calendar(); policy(date);
    expect((await domain('HISTORICAL_TEACHING')).status).toBe('NOT_READY');
  });
  it('preserves READY only for verified non-delayed go-live', async () => {
    calendar(); policy();
    const item = await domain('HISTORICAL_TEACHING');
    expect(item.status).toBe('READY');
    expect(item.stats.delayedGoLiveApplies).toBe(false);
    expect(policyMock.resolveEffectiveBusinessPolicy).toHaveBeenCalledWith('OPERATIONAL_START', { kind: 'ACADEMIC_YEAR', academicYearId: 'year-1' }, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });
  it('requires evidence for delayed go-live', async () => {
    calendar(); policy('2026-10-01');
    expect((await domain('HISTORICAL_TEACHING')).status).toBe('NOT_READY');
  });
  it('does not mistake an import receipt or execution count for complete reconciliation', async () => {
    calendar(); policy('2026-10-01');
    prismaMock.historicalTeachingImportBatch.findMany.mockResolvedValue([{ id: 'b', createdAt: new Date(), _count: { rows: 1 } }]);
    prismaMock.curricularTeachingExecution.count.mockResolvedValue(1);
    const item = await domain('HISTORICAL_TEACHING');
    expect(item.status).toBe('ATTENTION_REQUIRED');
    expect(item.findings[0].code).toBe('HISTORY_RECONCILIATION_REQUIRED');
  });

  it('PPCT preserves READY for issued plans with legitimate grade coverage and exact bindings', async () => {
    ppct();
    // Catalog subjects (including special programmes) are not a curricular requirement list.
    prismaMock.subject.findMany.mockResolvedValue([{ id: 'gddp' }, { id: 'hdtn' }, { id: 'unused' }]);
    expect((await domain('PPCT')).status).toBe('READY');
    expect(prismaMock.subject.findMany).not.toHaveBeenCalled();
  });
  it.each([null, 'SUPERSEDED', 'DRAFT'])('PPCT cannot be READY with latest version %s', async (status) => {
    const plans = ppct();
    plans[0].versions = status ? [{ ...plans[0].versions[0], status }] : [];
    const item = await domain('PPCT');
    expect(item.status).not.toBe('READY');
    expect(item.workflowSteps[5].isCompleted).toBe(false);
  });
  it('PPCT detects missing required grade even when plan count is large enough', async () => {
    const plans = ppct();
    plans[1].gradeLevel = 12;
    const item = await domain('PPCT');
    expect(item.status).toBe('NOT_READY');
    expect(item.stats.missingSubjectCount).toBe(1);
  });
  it('PPCT detects missing subject despite extra plans for another subject', async () => {
    const plans = ppct(); plans[1].subjectId = 'other';
    expect((await domain('PPCT')).status).toBe('NOT_READY');
  });
  it('PPCT does not invent coverage without assignments', async () => {
    ppct(); prismaMock.teachingAssignment.findMany.mockResolvedValue([]);
    expect((await domain('PPCT')).status).toBe('NOT_ASSESSED');
  });
  it('PPCT does not default to CORE without associations', async () => {
    ppct(); prismaMock.ppctClassAssociation.findMany.mockResolvedValue([]);
    expect((await domain('PPCT')).status).toBe('ATTENTION_REQUIRED');
  });
  it.each(['wrong-grade', 'draft-binding', 'partial', 'ambiguous', 'missing-class'])('PPCT does not accept %s bindings', async (problem) => {
    ppct();
    const rows = await prismaMock.ppctClassAssociation.findMany();
    if (problem === 'wrong-grade') rows[0].ppctPlan.gradeLevel = 12;
    if (problem === 'draft-binding') rows[0].ppctVersion.status = 'DRAFT';
    if (problem === 'partial') rows[0].effectiveUntil = day('2026-12-01');
    if (problem === 'ambiguous') rows.push(rows[0]);
    if (problem === 'missing-class') rows.splice(0, 1);
    expect((await domain('PPCT')).status).not.toBe('READY');
  });

  it.each(['GDDP', 'HDTN_HN'] as const)('%s preserves fully published READY', async (kind) => {
    programme(kind, ['PUBLISHED', 'PUBLISHED', 'PUBLISHED']);
    expect((await domain(kind)).status).toBe('READY');
  });
  it.each(['GDDP', 'HDTN_HN'] as const)('%s requires every master to have a plan', async (kind) => {
    programme(kind, ['PUBLISHED', null, 'PUBLISHED']);
    const item = await domain(kind);
    expect(item.status).toBe('NOT_READY');
    expect(item.workflowSteps[5].isCompleted).toBe(false);
  });
  it.each(['GDDP', 'HDTN_HN'] as const)('%s rejects superseded-only master despite another published master', async (kind) => {
    programme(kind, ['PUBLISHED', 'SUPERSEDED', 'PUBLISHED']);
    expect((await domain(kind)).status).toBe('NOT_READY');
  });
  it.each(['GDDP', 'HDTN_HN'] as const)('%s reports pending drafts', async (kind) => {
    programme(kind, ['PUBLISHED', 'DRAFT', 'PUBLISHED']);
    expect((await domain(kind)).status).toBe('ATTENTION_REQUIRED');
  });
  it('GDDP requires all three grades even if all existing plans are published', async () => {
    programme('GDDP', ['PUBLISHED', 'PUBLISHED']);
    expect((await domain('GDDP')).status).toBe('NOT_READY');
  });

  it.each(['DRAFT', 'APPROVED', 'ACTIVE', 'SUPERSEDED'])('TKB %s is not proof of authoritative readiness', async (status) => {
    calendar();
    prismaMock.timetableVersion.findMany.mockResolvedValue([{ id: 'v', versionNumber: 1, status, updatedAt: new Date(), _count: { entries: 20 } }]);
    const item = await domain('TKB');
    expect(item.status).not.toBe('READY');
    if (status === 'ACTIVE') expect(item.findings[0].code).toBe('TKB_READINESS_NOT_ASSESSED');
    expect((await service.getSummary(mockReq)).overallStatus).not.toBe('READY');
  });
});
