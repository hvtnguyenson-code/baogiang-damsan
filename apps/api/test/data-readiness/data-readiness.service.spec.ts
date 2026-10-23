import { ForbiddenException } from '@nestjs/common';
import { DataReadinessService } from '../../src/data-readiness/data-readiness.service';

describe('DataReadinessService (Unit)', () => {
  let service: DataReadinessService;
  let prismaMock: Record<string, Record<string, jest.Mock>>;
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
      ppctClassAssociation: {
        count: jest.fn().mockResolvedValue(0),
      },
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

    service = new DataReadinessService(prismaMock, authMock);
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

  describe('5 domains evaluation', () => {
    it('evaluates TKB: NO_DATA when no timetable versions exist', async () => {
      prismaMock.timetableVersion.findMany.mockResolvedValueOnce([]);
      const res = await service.getSummary(mockReq);
      const tkb = res.domains.find((d) => d.key === 'TKB')!;
      expect(tkb.status).toBe('NO_DATA');
      expect(tkb.findings.some((f) => f.code === 'TKB_NO_VERSION')).toBe(true);
    });

    it('evaluates TKB: NOT_READY when latest version is DRAFT', async () => {
      prismaMock.timetableVersion.findMany.mockResolvedValueOnce([
        {
          id: 'v1',
          versionNumber: 1,
          status: 'DRAFT',
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { entries: 50 },
        },
      ]);
      const res = await service.getSummary(mockReq);
      const tkb = res.domains.find((d) => d.key === 'TKB')!;
      expect(tkb.status).toBe('NOT_READY');
      expect(tkb.findings.some((f) => f.code === 'TKB_DRAFT_ONLY')).toBe(true);
    });

    it('evaluates TKB: ATTENTION_REQUIRED when latest is VALIDATED/APPROVED but not ACTIVE', async () => {
      prismaMock.timetableVersion.findMany.mockResolvedValueOnce([
        {
          id: 'v1',
          versionNumber: 1,
          status: 'APPROVED',
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { entries: 50 },
        },
      ]);
      const res = await service.getSummary(mockReq);
      const tkb = res.domains.find((d) => d.key === 'TKB')!;
      expect(tkb.status).toBe('ATTENTION_REQUIRED');
      expect(tkb.findings.some((f) => f.code === 'TKB_PENDING_ACTIVATION')).toBe(true);
    });

    it('evaluates TKB: READY when active version exists with slots and active calendar', async () => {
      prismaMock.timetableVersion.findMany.mockResolvedValueOnce([
        {
          id: 'v1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-01'),
          effectiveUntil: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { entries: 50 },
        },
      ]);
      prismaMock.timeSlotDefinition.count.mockResolvedValueOnce(12);
      prismaMock.academicCalendarVersion.findFirst.mockResolvedValueOnce({
        id: 'cal-1',
        isActive: true,
      });

      const res = await service.getSummary(mockReq);
      const tkb = res.domains.find((d) => d.key === 'TKB')!;
      expect(tkb.status).toBe('READY');
      expect(tkb.statusLabel).toBe('Đang áp dụng');
      expect(tkb.findings).toHaveLength(0);
    });

    it('evaluates PPCT: ATTENTION_REQUIRED when DRAFT plans exist', async () => {
      prismaMock.ppctPlan.findMany.mockResolvedValueOnce([
        {
          id: 'p1',
          subjectId: 'subj-1',
          gradeLevel: 10,
          versions: [{ id: 'pv1', versionNumber: 1, status: 'DRAFT', updatedAt: new Date() }],
        },
      ]);
      const res = await service.getSummary(mockReq);
      const ppct = res.domains.find((d) => d.key === 'PPCT')!;
      expect(ppct.status).toBe('ATTENTION_REQUIRED');
      expect(ppct.findings.some((f) => f.code === 'PPCT_DRAFT_PENDING')).toBe(true);
    });

    it('evaluates PPCT: READY when all plans are PUBLISHED', async () => {
      prismaMock.ppctClassAssociation.count.mockResolvedValueOnce(5);
      prismaMock.ppctPlan.findMany.mockResolvedValueOnce([
        {
          id: 'p1',
          subjectId: 'subj-1',
          gradeLevel: 10,
          versions: [{ id: 'pv1', versionNumber: 1, status: 'PUBLISHED', updatedAt: new Date() }],
        },
        {
          id: 'p2',
          subjectId: 'subj-2',
          gradeLevel: 10,
          versions: [{ id: 'pv2', versionNumber: 1, status: 'PUBLISHED', updatedAt: new Date() }],
        },
      ]);
      const res = await service.getSummary(mockReq);
      const ppct = res.domains.find((d) => d.key === 'PPCT')!;
      expect(ppct.status).toBe('READY');
      expect(ppct.findings).toHaveLength(0);
    });

    it('evaluates Historical Teaching: READY when delayed go-live does not apply', async () => {
      // No operational start policy -> delayed go-live does not apply
      const res = await service.getSummary(mockReq);
      const hist = res.domains.find((d) => d.key === 'HISTORICAL_TEACHING')!;
      expect(hist.status).toBe('READY');
      expect(hist.statusLabel).toBe('Không yêu cầu nạp lịch sử');
    });

    it('evaluates Historical Teaching: NOT_READY when delayed go-live applies but no batches', async () => {
      prismaMock.academicCalendarVersion.findFirst.mockResolvedValue({
        id: 'cal-1',
        isActive: true,
        startDate: new Date('2026-09-01'),
      });
      prismaMock.businessPolicyVersion.findFirst.mockResolvedValueOnce({
        id: 'bp-1',
        status: 'PUBLISHED',
        payload: { operationalStartDate: '2026-10-01' },
      });
      prismaMock.historicalTeachingImportBatch.findMany.mockResolvedValueOnce([]);

      const res = await service.getSummary(mockReq);
      const hist = res.domains.find((d) => d.key === 'HISTORICAL_TEACHING')!;
      expect(hist.status).toBe('NOT_READY');
      expect(hist.statusLabel).toBe('Chưa nạp lịch sử');
      expect(hist.findings.some((f) => f.code === 'HISTORICAL_DATA_MISSING')).toBe(true);
    });

    it('evaluates GDĐP: READY when all 3 grades have PUBLISHED plans', async () => {
      prismaMock.programmeMaster.findMany.mockImplementation(async ({ where }: { where?: { kind?: string } }) => {
        if (where?.kind === 'GDDP') {
          return [
            { id: 'm10', kind: 'GDDP', gradeLevel: 10 },
            { id: 'm11', kind: 'GDDP', gradeLevel: 11 },
            { id: 'm12', kind: 'GDDP', gradeLevel: 12 },
          ];
        }
        return [];
      });
      prismaMock.programmePlanVersion.findMany.mockResolvedValue([
        { id: 'pv10', programmeMasterId: 'm10', versionNumber: 1, status: 'PUBLISHED', createdAt: new Date(), updatedAt: new Date() },
        { id: 'pv11', programmeMasterId: 'm11', versionNumber: 1, status: 'PUBLISHED', createdAt: new Date(), updatedAt: new Date() },
        { id: 'pv12', programmeMasterId: 'm12', versionNumber: 1, status: 'PUBLISHED', createdAt: new Date(), updatedAt: new Date() },
      ]);
      prismaMock.plannedProgrammeOccurrence.findMany.mockResolvedValue([
        { id: 'occ1', programmeMasterId: 'm10', status: 'PUBLISHED' },
      ]);

      const res = await service.getSummary(mockReq);
      const gddp = res.domains.find((d) => d.key === 'GDDP')!;
      expect(gddp.status).toBe('READY');
      expect(gddp.statusLabel).toBe('Đã ban hành đầy đủ');
    });

    it('evaluates HĐTN-HN: ATTENTION_REQUIRED when DRAFT plans exist', async () => {
      prismaMock.programmeMaster.findMany.mockResolvedValue([
        { id: 'm-hdtn', kind: 'HDTN_HN', gradeLevel: null },
      ]);
      prismaMock.programmePlanVersion.findMany.mockResolvedValue([
        { id: 'pv-hdtn', programmeMasterId: 'm-hdtn', versionNumber: 1, status: 'DRAFT', createdAt: new Date(), updatedAt: new Date() },
      ]);

      const res = await service.getSummary(mockReq);
      const hdtn = res.domains.find((d) => d.key === 'HDTN_HN')!;
      expect(hdtn.status).toBe('ATTENTION_REQUIRED');
      expect(hdtn.findings.some((f) => f.code === 'HDTN_DRAFT_PENDING')).toBe(true);
    });
  });

  describe('Overall Status derivation', () => {
    it('returns READY when all 5 domains are READY', async () => {
      // Mock TKB ready
      prismaMock.timetableVersion.findMany.mockResolvedValueOnce([
        { id: 'v1', versionNumber: 1, status: 'ACTIVE', effectiveFrom: new Date(), updatedAt: new Date(), _count: { entries: 50 } },
      ]);
      prismaMock.timeSlotDefinition.count.mockResolvedValueOnce(10);
      prismaMock.academicCalendarVersion.findFirst.mockResolvedValue({ id: 'c1', isActive: true, startDate: new Date('2026-09-01') });

      // Mock PPCT ready
      prismaMock.ppctPlan.findMany.mockResolvedValueOnce([
        { id: 'p1', subjectId: 'subj-1', versions: [{ id: 'pv1', versionNumber: 1, status: 'PUBLISHED', updatedAt: new Date() }] },
        { id: 'p2', subjectId: 'subj-2', versions: [{ id: 'pv2', versionNumber: 1, status: 'PUBLISHED', updatedAt: new Date() }] },
      ]);

      // Mock History ready (no delayed go-live)
      prismaMock.businessPolicyVersion.findFirst.mockResolvedValueOnce(null);

      // Mock GDDP ready (10, 11, 12 published)
      prismaMock.programmeMaster.findMany
        .mockResolvedValueOnce([
          { id: 'm10', kind: 'GDDP', gradeLevel: 10 },
          { id: 'm11', kind: 'GDDP', gradeLevel: 11 },
          { id: 'm12', kind: 'GDDP', gradeLevel: 12 },
        ])
        .mockResolvedValueOnce([
          { id: 'm-hdtn', kind: 'HDTN_HN', gradeLevel: null },
        ]);

      prismaMock.programmePlanVersion.findMany
        .mockResolvedValueOnce([
          { id: 'pv10', programmeMasterId: 'm10', versionNumber: 1, status: 'PUBLISHED', updatedAt: new Date() },
          { id: 'pv11', programmeMasterId: 'm11', versionNumber: 1, status: 'PUBLISHED', updatedAt: new Date() },
          { id: 'pv12', programmeMasterId: 'm12', versionNumber: 1, status: 'PUBLISHED', updatedAt: new Date() },
        ])
        .mockResolvedValueOnce([
          { id: 'pv-hdtn', programmeMasterId: 'm-hdtn', versionNumber: 1, status: 'PUBLISHED', updatedAt: new Date() },
        ]);

      const res = await service.getSummary(mockReq);
      expect(res.overallStatus).toBe('READY');
      expect(res.overallStatusLabel).toBe('Tất cả dữ liệu năm học đã sẵn sàng vận hành');
    });
  });
});
