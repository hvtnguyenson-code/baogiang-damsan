import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReportingStatementsService } from '../../src/reporting-statements/reporting-statements.service';
import { REPORTING_STATEMENT_SNAPSHOT_V2 } from '../../src/reporting-statement-internal/reporting-statement-canonicalizer';

const asOf = new Date('2026-08-25T00:00:00.000Z');
const dto = {
  academicYearId: 'year',
  fromCivilDate: '2026-08-01',
  toCivilDate: '2026-08-31',
  requestKey: 'key',
};
const request = { auth: { user: { id: 'actor', mustChangePassword: false } }, headers: {} } as never;

const projection = (overrides: Record<string, unknown> = {}) => ({
  profile: 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1',
  scope: {
    academicYearId: 'year',
    targetUserId: 'actor',
    fromCivilDate: '2026-08-01',
    toCivilDate: '2026-08-31',
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
      teachingAssignmentId: 'assignment',
      schoolClassId: 'class',
      subjectId: 'subject',
      validFrom: '2026-08-01',
      validUntil: null,
    },
  ],
  sections: [
    {
      schoolClassId: 'class',
      subjectId: 'subject',
      responsibilityIntervals: [],
      status: 'PASS',
      counts: {
        distributedElapsedCount: 1,
        completedCount: 1,
        openDebtCount: 0,
        lateCount: 0,
        unconfirmedGapCount: 0,
      },
      details: [],
      findings: [],
    },
  ],
  findings: [],
  evaluatedAt: asOf.toISOString(),
  ...overrides,
});

function setup(classifications: unknown[], currentAsOf: Date = asOf) {
  const repository = {
    classifyAcceptedCommand: jest.fn(() =>
      Promise.resolve(classifications.shift() ?? { kind: 'MISS' }),
    ),
    findSeriesByLogicalKey: jest.fn().mockResolvedValue(null),
    lockSeries: jest.fn(),
    lineageTail: jest.fn(),
    loadCurrentApproved: jest.fn(),
    loadCurrentSubmitted: jest.fn(),
    persistSubmittedRevision: jest.fn().mockResolvedValue({
      revision: { id: 'revision' },
      series: { id: 'series' },
      state: { lifecycleState: 'SUBMITTED', lifecycleToken: 'token' },
    }),
  };
  const tx = {
    ...repository,
    user: { findUnique: jest.fn().mockResolvedValue({ profile: null }) },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (value: unknown) => unknown) => fn(tx)),
  };
  const auth = { evaluate: jest.fn().mockResolvedValue({ allowed: true }) };
  const resolver = {
    resolveInTransaction: jest.fn().mockImplementation(() =>
      Promise.resolve(
        projection({ scope: { ...projection().scope, asOfInstant: currentAsOf } }),
      ),
    ),
  };
  const clock = { now: jest.fn(() => currentAsOf) };
  const businessConfiguration = {
    resolveOperationalStartPolicy: jest.fn().mockResolvedValue({
      operationalStartDate: '2026-08-15',
      policyVersionId: 'policy-v1',
      validatorVersion: 'v1',
      academicYearId: 'year',
      effectiveFrom: '2026-08-01',
      effectiveUntil: null,
    }),
  };

  return {
    sut: new ReportingStatementsService(
      prisma as never,
      repository as never,
      resolver as never,
      auth as never,
      { write: jest.fn() } as never,
      businessConfiguration as never,
      clock,
    ),
    repository,
    resolver,
    auth,
    clock,
    prisma,
    businessConfiguration,
    tx,
  };
}

describe('ReportingStatementsService.submit', () => {
  it('authorizes before exact replay without semantic work or policy resolution', async () => {
    const x = setup([
      {
        kind: 'REPLAY',
        command: {
          resultRevisionId: 'r',
          seriesId: 's',
          resultLifecycleState: 'SUBMITTED',
          resultLifecycleToken: 't',
          submissionAsOfInstant: asOf,
        },
      },
    ]);
    const result = await x.sut.submit(dto as never, request);
    expect(result.replay).toBe(true);
    expect(x.auth.evaluate.mock.invocationCallOrder[0]).toBeLessThan(
      x.repository.classifyAcceptedCommand.mock.invocationCallOrder[0],
    );
    expect(x.clock.now).not.toHaveBeenCalled();
    expect(x.businessConfiguration.resolveOperationalStartPolicy).not.toHaveBeenCalled();
    expect(x.resolver.resolveInTransaction).not.toHaveBeenCalled();
    expect(x.repository.persistSubmittedRevision).not.toHaveBeenCalled();
  });

  // J. accepted-command replay inside transaction: resolver NOT called
  it('bypasses policy resolution on inner transaction replay hit', async () => {
    const replay = {
      kind: 'REPLAY',
      command: {
        resultRevisionId: 'r',
        seriesId: 's',
        resultLifecycleState: 'SUBMITTED',
        resultLifecycleToken: 't',
        submissionAsOfInstant: asOf,
      },
    };
    const x = setup([{ kind: 'MISS' }, replay]);
    const result = await x.sut.submit(dto as never, request);
    expect(result.replay).toBe(true);
    expect(x.businessConfiguration.resolveOperationalStartPolicy).not.toHaveBeenCalled();
    expect(x.resolver.resolveInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a fingerprint conflict before clock and projection', async () => {
    const x = setup([{ kind: 'FINGERPRINT_CONFLICT', command: {} }]);
    await expect(x.sut.submit(dto as never, request)).rejects.toBeInstanceOf(ConflictException);
    expect(x.clock.now).not.toHaveBeenCalled();
    expect(x.businessConfiguration.resolveOperationalStartPolicy).not.toHaveBeenCalled();
    expect(x.resolver.resolveInTransaction).not.toHaveBeenCalled();
  });

  // A, C, D, E, F. Pinned asOf, resolver called with tx and HCM date, downstream authority, freeze V2
  it('pins clock once and resolves policy inside transaction with exact HCM date and passes authority downstream', async () => {
    const x = setup([{ kind: 'MISS' }, { kind: 'MISS' }]);
    await x.sut.submit(dto as never, request);

    // A. asOf pinned once
    expect(x.clock.now).toHaveBeenCalledTimes(1);

    // C, D. resolveOperationalStartPolicy called once with academicYearId, HCM date '2026-08-25', and tx
    expect(x.businessConfiguration.resolveOperationalStartPolicy).toHaveBeenCalledTimes(1);
    expect(x.businessConfiguration.resolveOperationalStartPolicy).toHaveBeenCalledWith(
      'year',
      '2026-08-25',
      x.tx,
    );

    // E. projection receives exact same authority and context
    expect(x.resolver.resolveInTransaction).toHaveBeenCalledWith(
      x.tx,
      expect.objectContaining({ asOfInstant: asOf }),
      {
        reportingProjection: {
          operationalStartPolicy: {
            operationalStartDate: '2026-08-15',
            policyVersionId: 'policy-v1',
            validatorVersion: 'v1',
            effectiveFrom: '2026-08-01',
            effectiveUntil: null,
          },
          policyResolutionCivilDate: '2026-08-25',
        },
      },
    );

    // F. freeze snapshot persisted with V2 and exact provenance
    expect(x.repository.persistSubmittedRevision).toHaveBeenCalledTimes(1);
    const persistedCall = x.repository.persistSubmittedRevision.mock.calls[0][1];
    expect(persistedCall.frozen.snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V2);
    expect(persistedCall.frozen.snapshot.operationalStartPolicyVersionId).toBe('policy-v1');
    expect(persistedCall.frozen.snapshot.operationalStartDate).toBe('2026-08-15');
  });

  // B. HCM anchor exact at UTC/VN boundary
  it('derives correct HCM civil date across UTC/Vietnam boundary (17:00Z -> next civil date)', async () => {
    // 2026-09-12T17:00:00.000Z -> 2026-09-13T00:00:00 in UTC+7 (HCM)
    const boundaryAfter = new Date('2026-09-12T17:00:00.000Z');
    const xAfter = setup([{ kind: 'MISS' }, { kind: 'MISS' }], boundaryAfter);
    await xAfter.sut.submit(dto as never, request);
    expect(xAfter.businessConfiguration.resolveOperationalStartPolicy).toHaveBeenCalledWith(
      'year',
      '2026-09-13',
      xAfter.tx,
    );

    // 2026-09-12T16:59:59.999Z -> 2026-09-12T23:59:59.999 in UTC+7 (HCM)
    const boundaryBefore = new Date('2026-09-12T16:59:59.999Z');
    const xBefore = setup([{ kind: 'MISS' }, { kind: 'MISS' }], boundaryBefore);
    await xBefore.sut.submit(dto as never, request);
    expect(xBefore.businessConfiguration.resolveOperationalStartPolicy).toHaveBeenCalledWith(
      'year',
      '2026-09-12',
      xBefore.tx,
    );
  });

  // H. POLICY_NOT_CONFIGURED: submission fails and repository persistence not called
  it('fails closed with ConflictException when POLICY_NOT_CONFIGURED and prevents persistence', async () => {
    const x = setup([{ kind: 'MISS' }, { kind: 'MISS' }]);
    x.businessConfiguration.resolveOperationalStartPolicy.mockRejectedValue(
      new ConflictException('POLICY_NOT_CONFIGURED'),
    );
    await expect(x.sut.submit(dto as never, request)).rejects.toBeInstanceOf(ConflictException);
    expect(x.resolver.resolveInTransaction).not.toHaveBeenCalled();
    expect(x.repository.persistSubmittedRevision).not.toHaveBeenCalled();
  });

  // I. POLICY_AMBIGUOUS / POLICY_CORRUPT: propagate
  it.each(['POLICY_AMBIGUOUS', 'POLICY_CORRUPT'])(
    'propagates %s ConflictException without persistence',
    async (errorCode) => {
      const x = setup([{ kind: 'MISS' }, { kind: 'MISS' }]);
      x.businessConfiguration.resolveOperationalStartPolicy.mockRejectedValue(
        new ConflictException(errorCode),
      );
      await expect(x.sut.submit(dto as never, request)).rejects.toMatchObject({
        message: errorCode,
      });
      expect(x.repository.persistSubmittedRevision).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['BLOCKED', projection({ status: 'BLOCKED', counts: null })],
    [
      'ZERO_RESPONSIBILITY',
      projection({
        responsibilityState: 'ZERO_RESPONSIBILITY',
        responsibilityManifest: [],
        sections: [],
        counts: {
          distributedElapsedCount: 0,
          completedCount: 0,
          openDebtCount: 0,
          lateCount: 0,
          unconfirmedGapCount: 0,
        },
      }),
    ],
  ])('rejects %s personal truth before persistence artifacts', async (_case, unsafeProjection) => {
    const x = setup([{ kind: 'MISS' }, { kind: 'MISS' }]);
    x.resolver.resolveInTransaction.mockResolvedValue(unsafeProjection);
    await expect(x.sut.submit(dto as never, request)).rejects.toThrow();
    expect(x.repository.persistSubmittedRevision).not.toHaveBeenCalled();
  });

  // K. retry: same asOf and same policyResolutionCivilDate reused
  it('retries P2034 with reauthorization, reclassification, and reuses same pinned asOf and HCM date', async () => {
    const x = setup([{ kind: 'MISS' }, { kind: 'MISS' }, { kind: 'MISS' }]);
    let calls = 0;
    x.repository.persistSubmittedRevision.mockImplementation(() => {
      calls += 1;
      if (calls === 1)
        throw new Prisma.PrismaClientKnownRequestError('serialization', {
          code: 'P2034',
          clientVersion: '5',
        });
      return Promise.resolve({
        revision: { id: 'r' },
        series: { id: 's' },
        state: { lifecycleState: 'SUBMITTED', lifecycleToken: 't' },
      });
    });

    await x.sut.submit(dto as never, request);

    // asOf pinned once outside retry
    expect(x.clock.now).toHaveBeenCalledTimes(1);

    // resolver called once per retry attempt, but with identical civilDate
    expect(x.businessConfiguration.resolveOperationalStartPolicy).toHaveBeenCalledTimes(2);
    expect(x.businessConfiguration.resolveOperationalStartPolicy.mock.calls[0][1]).toBe('2026-08-25');
    expect(x.businessConfiguration.resolveOperationalStartPolicy.mock.calls[1][1]).toBe('2026-08-25');

    // projection called with same asOfInstant
    expect(x.resolver.resolveInTransaction).toHaveBeenCalledTimes(2);
    expect(x.resolver.resolveInTransaction.mock.calls[0][1].asOfInstant).toBe(
      x.resolver.resolveInTransaction.mock.calls[1][1].asOfInstant,
    );
  });

  it('retries a known command identity P2002 and replays the accepted command', async () => {
    const replay = {
      kind: 'REPLAY',
      command: {
        resultRevisionId: 'r',
        seriesId: 's',
        resultLifecycleState: 'SUBMITTED',
        resultLifecycleToken: 't',
        submissionAsOfInstant: asOf,
      },
    };
    const x = setup([{ kind: 'MISS' }, { kind: 'MISS' }, replay]);
    x.repository.persistSubmittedRevision.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('command identity race', {
        code: 'P2002',
        clientVersion: '5',
        meta: { target: 'reporting_statement_commands_actor_type_request_key' },
      }),
    );
    const result = await x.sut.submit(dto as never, request);
    expect(result.replay).toBe(true);
    expect(x.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(x.clock.now).toHaveBeenCalledTimes(1);
    expect(x.resolver.resolveInTransaction).toHaveBeenCalledTimes(1);
    expect(x.repository.persistSubmittedRevision).toHaveBeenCalledTimes(1);
  });

  it('propagates an unrelated P2002 without retrying', async () => {
    const x = setup([{ kind: 'MISS' }, { kind: 'MISS' }]);
    const error = new Prisma.PrismaClientKnownRequestError('unrelated unique constraint', {
      code: 'P2002',
      clientVersion: '5',
      meta: { target: 'some_other_unique_constraint' },
    });
    x.repository.persistSubmittedRevision.mockRejectedValue(error);
    await expect(x.sut.submit(dto as never, request)).rejects.toBe(error);
    expect(x.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
