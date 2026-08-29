import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { freezeReportingStatementSnapshot } from '../../src/reporting-statement-internal/reporting-statement-canonicalizer';
import { PERSONAL_REPORTING_STATEMENT_PROFILE } from '../../src/reporting-statements/reporting-statement.policy';
import { ReportingStatementsService } from '../../src/reporting-statements/reporting-statements.service';

const asOf = new Date('2026-08-25T08:00:00.000Z');
const req = (id = 'actor-user-id') => ({ auth: { user: { id, mustChangePassword: false } }, headers: {} }) as never;

function createMockProjection(status: 'PASS' | 'BLOCKED' = 'PASS', responsibilityState: 'RESPONSIBILITY_PRESENT' | 'ZERO_RESPONSIBILITY' = 'RESPONSIBILITY_PRESENT') {
  return {
    profile: 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1',
    scope: {
      academicYearId: 'year-1',
      targetUserId: 'actor-user-id',
      fromCivilDate: '2026-08-01',
      toCivilDate: '2026-08-31',
      asOfInstant: asOf,
    },
    responsibilityState,
    status,
    counts: status === 'PASS' && responsibilityState === 'RESPONSIBILITY_PRESENT'
      ? { distributedElapsedCount: 2, completedCount: 2, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 0 }
      : responsibilityState === 'ZERO_RESPONSIBILITY'
      ? { distributedElapsedCount: 0, completedCount: 0, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 0 }
      : null,
    responsibilityManifest: responsibilityState === 'RESPONSIBILITY_PRESENT'
      ? [{ teachingAssignmentId: 'a1', schoolClassId: 'c1', subjectId: 's1', validFrom: '2026-08-01', validUntil: null }]
      : [],
    sections: responsibilityState === 'RESPONSIBILITY_PRESENT'
      ? [
          {
            schoolClassId: 'c1',
            subjectId: 's1',
            responsibilityIntervals: [{ teachingAssignmentId: 'a1', schoolClassId: 'c1', subjectId: 's1', validFrom: '2026-08-01', validUntil: null }],
            status,
            counts: status === 'PASS' ? { distributedElapsedCount: 2, completedCount: 2, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 0 } : null,
            details: [],
            findings: status === 'BLOCKED' ? [{ severity: 'BLOCKER', code: 'RECONCILIATION_REQUIRED', reason: 'Blocked stream', entityIds: ['e1'], occurrenceKey: 'k1' }] : [],
          },
        ]
      : [],
    findings: status === 'BLOCKED' ? [{ severity: 'BLOCKER', code: 'RECONCILIATION_REQUIRED', reason: 'Blocked stream', entityIds: ['e1'], occurrenceKey: 'k1' }] : [],
    evaluatedAt: asOf.toISOString(),
  };
}

function makeFrozenRevision(ownerId = 'owner-1', subjectIds = ['s1']) {
  const f = freezeReportingStatementSnapshot({
    statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE,
    submitterUserId: ownerId,
    submitterDisplayNameSnapshot: 'Teacher A',
    submitterStaffCodeSnapshot: 'GV001',
    asOfInstant: asOf,
    projection: {
      profile: 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1',
      scope: { academicYearId: 'year-1', targetUserId: ownerId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', asOfInstant: asOf },
      responsibilityState: 'RESPONSIBILITY_PRESENT',
      status: 'PASS',
      counts: { distributedElapsedCount: 2, completedCount: 2, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 0 },
      responsibilityManifest: subjectIds.map((subjectId, i) => ({ teachingAssignmentId: `a-${i}`, schoolClassId: `c-${i}`, subjectId, validFrom: '2026-08-01', validUntil: null })),
      sections: [],
      findings: [],
      evaluatedAt: asOf.toISOString(),
    } as never,
  });

  return {
    id: `rev-${ownerId}`,
    seriesId: `series-${ownerId}`,
    snapshotProfile: f.snapshot.snapshotProfile,
    serializerVersion: f.snapshot.serializerVersion,
    canonicalSnapshotJson: f.canonicalSnapshotJson,
    semanticHash: f.semanticHash,
    asOfInstant: asOf,
    submitterDisplayNameSnapshot: 'Teacher A',
    submitterStaffCodeSnapshot: 'GV001',
    submittedAt: asOf,
    predecessorRevisionId: null,
    supersedesRevisionId: null,
    series: {
      statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE,
      submitterUserId: ownerId,
      academicYearId: 'year-1',
      fromCivilDate: new Date('2026-08-01'),
      toCivilDate: new Date('2026-08-31'),
    },
    state: { lifecycleState: 'SUBMITTED' as const, lifecycleToken: 'token-1' },
    subjects: subjectIds.map((subjectId) => ({ subjectId })),
    historyEntries: [],
  };
}

describe('ReportingStatementsService Discovery, Preview, and Read API', () => {
  let repository: {
    listRevisions: jest.Mock;
    readFrozenRevision: jest.Mock;
    findSeriesByLogicalKey: jest.Mock;
    classifyAcceptedCommand: jest.Mock;
  };
  let projection: { resolve: jest.Mock; resolveInTransaction: jest.Mock };
  let authorization: { evaluate: jest.Mock; listEffectiveCapabilities: jest.Mock };
  let audit: { write: jest.Mock };
  let clock: { now: jest.Mock };
  let sut: ReportingStatementsService;

  beforeEach(() => {
    repository = {
      listRevisions: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      readFrozenRevision: jest.fn(),
      findSeriesByLogicalKey: jest.fn(),
      classifyAcceptedCommand: jest.fn(),
    };
    projection = {
      resolve: jest.fn().mockResolvedValue(createMockProjection('PASS', 'RESPONSIBILITY_PRESENT')),
      resolveInTransaction: jest.fn(),
    };
    authorization = {
      evaluate: jest.fn().mockResolvedValue({ allowed: true }),
      listEffectiveCapabilities: jest.fn().mockResolvedValue([]),
    };
    audit = { write: jest.fn().mockResolvedValue(undefined) };
    clock = { now: jest.fn(() => asOf) };

    sut = new ReportingStatementsService(
      {} as never,
      repository as never,
      projection as never,
      authorization as never,
      audit as never,
      clock,
    );
  });

  describe('preview', () => {
    const previewDto = {
      academicYearId: 'year-1',
      fromCivilDate: '2026-08-01',
      toCivilDate: '2026-08-31',
    };

    it('requires REPORTING_STATEMENT_SUBMIT with PERSONAL scope', async () => {
      authorization.evaluate.mockResolvedValueOnce({ allowed: false });
      await expect(sut.preview(previewDto, req())).rejects.toThrow(ForbiddenException);
      expect(authorization.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilityKey: 'REPORTING_STATEMENT_SUBMIT',
          requestedScope: 'PERSONAL',
        }),
      );
      expect(projection.resolve).not.toHaveBeenCalled();
    });

    it('rejects invalid date range (from > to)', async () => {
      await expect(
        sut.preview({ ...previewDto, fromCivilDate: '2026-08-31', toCivilDate: '2026-08-01' }, req()),
      ).rejects.toThrow(BadRequestException);
      expect(projection.resolve).not.toHaveBeenCalled();
    });

    it('returns eligibleForSubmission = true on PASS + RESPONSIBILITY_PRESENT without DB mutation', async () => {
      const result = await sut.preview(previewDto, req('user-1'));
      expect(result.eligibleForSubmission).toBe(true);
      expect(result.status).toBe('PASS');
      expect(result.responsibilityState).toBe('RESPONSIBILITY_PRESENT');
      expect(result.counts).toEqual({
        distributedElapsedCount: 2,
        completedCount: 2,
        openDebtCount: 0,
        lateCount: 0,
        unconfirmedGapCount: 0,
      });
      expect(result.previewAsOfInstant).toBe(asOf.toISOString());
      expect(projection.resolve).toHaveBeenCalledWith({
        academicYearId: 'year-1',
        targetUserId: 'user-1',
        fromCivilDate: '2026-08-01',
        toCivilDate: '2026-08-31',
        asOfInstant: asOf,
      });
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('returns eligibleForSubmission = false on BLOCKED projection without erroring', async () => {
      projection.resolve.mockResolvedValueOnce(createMockProjection('BLOCKED', 'RESPONSIBILITY_PRESENT'));
      const result = await sut.preview(previewDto, req());
      expect(result.eligibleForSubmission).toBe(false);
      expect(result.status).toBe('BLOCKED');
      expect(result.counts).toBeNull();
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({ code: 'RECONCILIATION_REQUIRED', severity: 'BLOCKER' });
    });

    it('returns eligibleForSubmission = false on ZERO_RESPONSIBILITY projection without erroring', async () => {
      projection.resolve.mockResolvedValueOnce(createMockProjection('PASS', 'ZERO_RESPONSIBILITY'));
      const result = await sut.preview(previewDto, req());
      expect(result.eligibleForSubmission).toBe(false);
      expect(result.responsibilityState).toBe('ZERO_RESPONSIBILITY');
      expect(result.counts).toEqual({
        distributedElapsedCount: 0,
        completedCount: 0,
        openDebtCount: 0,
        lateCount: 0,
        unconfirmedGapCount: 0,
      });
      expect(result.responsibilityManifest).toHaveLength(0);
    });
  });

  describe('listMine', () => {
    it('requires REPORTING_STATEMENT_READ PERSONAL and filters by actor userId', async () => {
      const rev = makeFrozenRevision('actor-1');
      repository.listRevisions.mockResolvedValueOnce({ items: [rev], total: 1 });

      const res = await sut.listMine({ page: 1, pageSize: 10 }, req('actor-1'));
      expect(authorization.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'actor-1',
          capabilityKey: 'REPORTING_STATEMENT_READ',
          requestedScope: 'PERSONAL',
        }),
      );
      expect(repository.listRevisions).toHaveBeenCalledWith(
        expect.anything(),
        { series: { submitterUserId: 'actor-1' } },
        1,
        10,
      );
      expect(res.items).toHaveLength(1);
      expect(res.items[0].revisionId).toBe('rev-actor-1');
    });

    it('denies listMine when actor lacks REPORTING_STATEMENT_READ PERSONAL', async () => {
      authorization.evaluate.mockResolvedValueOnce({ allowed: false });
      await expect(sut.listMine({ page: 1, pageSize: 20 }, req())).rejects.toThrow(ForbiddenException);
      expect(repository.listRevisions).not.toHaveBeenCalled();
    });
  });

  describe('listAccessible', () => {
    it('includes own revisions with PERSONAL and non-owner with SCHOOL_WIDE', async () => {
      authorization.evaluate
        .mockResolvedValueOnce({ allowed: true }) // PERSONAL
        .mockResolvedValueOnce({ allowed: true }); // SCHOOL_WIDE

      await sut.listAccessible({ page: 1, pageSize: 20 }, req('user-1'));
      expect(repository.listRevisions).toHaveBeenCalledWith(
        expect.anything(),
        {
          OR: [
            { series: { submitterUserId: 'user-1' } },
            { series: { submitterUserId: { not: 'user-1' } } },
          ],
        },
        1,
        20,
      );
    });

    it('filters non-owner revisions using all-granted-subjects rule when not SCHOOL_WIDE', async () => {
      authorization.evaluate
        .mockResolvedValueOnce({ allowed: true }) // PERSONAL
        .mockResolvedValueOnce({ allowed: false }); // SCHOOL_WIDE
      authorization.listEffectiveCapabilities.mockResolvedValueOnce([
        { key: 'REPORTING_STATEMENT_READ', scope: 'SUBJECT', resourceId: 'sub-math' },
        { key: 'REPORTING_STATEMENT_READ', scope: 'SUBJECT', resourceId: 'sub-phys' },
      ]);

      await sut.listAccessible({ page: 1, pageSize: 20 }, req('user-1'));
      expect(repository.listRevisions).toHaveBeenCalledWith(
        expect.anything(),
        {
          OR: [
            { series: { submitterUserId: 'user-1' } },
            {
              series: { submitterUserId: { not: 'user-1' } },
              subjects: {
                some: {},
                none: {
                  subjectId: { notIn: ['sub-math', 'sub-phys'] },
                },
              },
            },
          ],
        },
        1,
        20,
      );
    });

    it('returns empty result if actor has no read capabilities at all', async () => {
      authorization.evaluate
        .mockResolvedValueOnce({ allowed: false }) // PERSONAL
        .mockResolvedValueOnce({ allowed: false }); // SCHOOL_WIDE
      authorization.listEffectiveCapabilities.mockResolvedValueOnce([]);

      const result = await sut.listAccessible({ page: 1, pageSize: 20 }, req('user-1'));
      expect(result).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
      expect(repository.listRevisions).not.toHaveBeenCalled();
    });
  });

  describe('listPendingDecision', () => {
    it('requires APPROVAL_PRINCIPAL or APPROVAL_VICE_PRINCIPAL school-wide', async () => {
      authorization.evaluate
        .mockResolvedValueOnce({ allowed: false }) // APPROVAL_PRINCIPAL
        .mockResolvedValueOnce({ allowed: false }); // APPROVAL_VICE_PRINCIPAL

      await expect(sut.listPendingDecision({ page: 1, pageSize: 20 }, req('user-1'))).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.listRevisions).not.toHaveBeenCalled();
    });

    it('filters SUBMITTED revisions excluding own revisions for authorized approver', async () => {
      authorization.evaluate
        .mockResolvedValueOnce({ allowed: true }) // APPROVAL_PRINCIPAL
        .mockResolvedValueOnce({ allowed: true }); // SCHOOL_WIDE read

      await sut.listPendingDecision({ page: 1, pageSize: 20 }, req('approver-1'));
      expect(repository.listRevisions).toHaveBeenCalledWith(
        expect.anything(),
        {
          state: { lifecycleState: 'SUBMITTED' },
          series: { submitterUserId: { not: 'approver-1' } },
        },
        1,
        20,
      );
    });

    it('enforces every-frozen-subject read check when approver lacks school-wide read', async () => {
      authorization.evaluate
        .mockResolvedValueOnce({ allowed: true }) // APPROVAL_PRINCIPAL
        .mockResolvedValueOnce({ allowed: false }); // SCHOOL_WIDE read
      authorization.listEffectiveCapabilities.mockResolvedValueOnce([
        { key: 'REPORTING_STATEMENT_READ', scope: 'SUBJECT', resourceId: 'sub-lit' },
      ]);

      await sut.listPendingDecision({ page: 1, pageSize: 20 }, req('approver-1'));
      expect(repository.listRevisions).toHaveBeenCalledWith(
        expect.anything(),
        {
          state: { lifecycleState: 'SUBMITTED' },
          series: { submitterUserId: { not: 'approver-1' } },
          subjects: {
            some: {},
            none: {
              subjectId: { notIn: ['sub-lit'] },
            },
          },
        },
        1,
        20,
      );
    });
  });

  describe('read & allowedActions', () => {
    it('throws NotFoundException when revision does not exist', async () => {
      repository.readFrozenRevision.mockResolvedValueOnce(null);
      await expect(sut.read('non-existent-uuid', req())).rejects.toThrow(NotFoundException);
    });

    it('computes allowedActions = [APPROVE, REJECT] for non-owner approver on SUBMITTED revision', async () => {
      const rev = makeFrozenRevision('owner-1', ['s1']);
      repository.readFrozenRevision.mockResolvedValueOnce(rev);
      authorization.evaluate
        .mockResolvedValueOnce({ allowed: true }) // SCHOOL_WIDE read
        .mockResolvedValueOnce({ allowed: true }); // APPROVAL_PRINCIPAL

      const detail = await sut.read('rev-owner-1', req('approver-1'));
      expect(detail.allowedActions).toEqual(['APPROVE', 'REJECT']);
    });

    it('computes allowedActions = [] for owner on own SUBMITTED revision (denies self-decision)', async () => {
      const rev = makeFrozenRevision('owner-1', ['s1']);
      repository.readFrozenRevision.mockResolvedValueOnce(rev);
      authorization.evaluate.mockResolvedValueOnce({ allowed: true }); // PERSONAL read

      const detail = await sut.read('rev-owner-1', req('owner-1'));
      expect(detail.allowedActions).toEqual([]);
    });

    it('computes allowedActions = [] for non-approver reader', async () => {
      const rev = makeFrozenRevision('owner-1', ['s1']);
      repository.readFrozenRevision.mockResolvedValueOnce(rev);
      authorization.evaluate
        .mockResolvedValueOnce({ allowed: true }) // SCHOOL_WIDE read
        .mockResolvedValueOnce({ allowed: false }) // APPROVAL_PRINCIPAL
        .mockResolvedValueOnce({ allowed: false }); // APPROVAL_VICE_PRINCIPAL

      const detail = await sut.read('rev-owner-1', req('reader-1'));
      expect(detail.allowedActions).toEqual([]);
    });
  });
});
