import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { freezeReportingStatementSnapshot } from '../../src/reporting-statement-internal/reporting-statement-canonicalizer';
import { PERSONAL_REPORTING_STATEMENT_PROFILE } from '../../src/reporting-statements/reporting-statement.policy';
import { ReportingStatementsService } from '../../src/reporting-statements/reporting-statements.service';

const asOf = new Date('2026-08-25T00:00:00.000Z');
const req = (id = 'actor') => ({ auth: { user: { id, mustChangePassword: false } }, headers: {} }) as never;
const replay = { kind: 'REPLAY', command: { resultRevisionId: 'r', seriesId: 's', resultLifecycleState: 'APPROVED', resultLifecycleToken: 't', submissionAsOfInstant: null } };
type TransactionCallback = (transaction: { user: { findUnique: jest.Mock }; [key: string]: unknown }) => unknown | Promise<unknown>;

function makeFrozenRow(ownerId = 'owner', subjectIds = ['subject']) {
  const f = freezeReportingStatementSnapshot({
    statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE,
    submitterUserId: ownerId,
    submitterDisplayNameSnapshot: 'Owner',
    submitterStaffCodeSnapshot: 'GV-01',
    asOfInstant: asOf,
    projection: {
      profile: 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1',
      scope: { academicYearId: 'year', targetUserId: ownerId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', asOfInstant: asOf },
      responsibilityState: 'RESPONSIBILITY_PRESENT',
      status: 'PASS',
      counts: { distributedElapsedCount: 1, completedCount: 1, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 0 },
      responsibilityManifest: subjectIds.map((subjectId, i) => ({ teachingAssignmentId: `assignment-${i}`, schoolClassId: `class-${i}`, subjectId, validFrom: '2026-08-01', validUntil: null })),
      sections: [],
      findings: [],
      evaluatedAt: asOf.toISOString(),
    } as never,
  });
  return {
    id: 'r',
    seriesId: 's',
    snapshotProfile: f.snapshot.snapshotProfile,
    serializerVersion: f.snapshot.serializerVersion,
    canonicalSnapshotJson: f.canonicalSnapshotJson,
    semanticHash: f.semanticHash,
    asOfInstant: asOf,
    submitterDisplayNameSnapshot: 'Owner',
    submitterStaffCodeSnapshot: 'GV-01',
    submittedAt: asOf,
    predecessorRevisionId: null,
    supersedesRevisionId: null,
    series: {
      statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE,
      submitterUserId: ownerId,
      academicYearId: 'year',
      fromCivilDate: new Date('2026-08-01'),
      toCivilDate: new Date('2026-08-31'),
    },
    state: { lifecycleState: 'SUBMITTED' as const, lifecycleToken: 't' },
    subjects: subjectIds.map((subjectId) => ({ subjectId })),
    historyEntries: [],
  };
}

function setup(classifications: unknown[] = [replay], row: unknown = makeFrozenRow()) {
  const repository = {
    classifyAcceptedCommand: jest.fn(() => Promise.resolve(classifications.shift() ?? { kind: 'MISS' })),
    loadRevision: jest.fn().mockResolvedValue(row),
    lockSeries: jest.fn(),
    loadCurrentApproved: jest.fn().mockResolvedValue(null),
    createDecision: jest.fn().mockResolvedValue({ id: 'command' }),
    transitionLifecycleCas: jest.fn().mockResolvedValue({ transitioned: true }),
    appendDecisionHistory: jest.fn(),
    readFrozenRevision: jest.fn().mockResolvedValue(row),
    listRevisions: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  };
  const tx = { ...repository, user: { findUnique: jest.fn().mockResolvedValue({ profile: null }) } };
  const prisma = { $transaction: jest.fn(async (fn: TransactionCallback) => fn(tx)) };
  const auth = { evaluate: jest.fn().mockResolvedValue({ allowed: true }), listEffectiveCapabilities: jest.fn().mockResolvedValue([]) };
  return { sut: new ReportingStatementsService(prisma as never, repository as never, {} as never, auth as never, { write: jest.fn() } as never, { now: jest.fn(() => asOf) }), repository, auth, prisma };
}

describe('ReportingStatementsService decision/read', () => {
  it.each(['APPROVE', 'REJECT'] as const)('authorizes %s before exact replay', async command => {
    const x = setup();
    const out = await x.sut.decide('r', { expectedLifecycleToken: 't', requestKey: 'k' }, req(), command);
    expect(out.replay).toBe(true);
    expect(x.auth.evaluate.mock.invocationCallOrder[0]).toBeLessThan(x.repository.classifyAcceptedCommand.mock.invocationCallOrder[0]);
    expect(x.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('conflicts when replay fingerprint differs', async () => {
    const x = setup([{ kind: 'FINGERPRINT_CONFLICT', command: {} }]);
    await expect(x.sut.decide('r', { expectedLifecycleToken: 't', requestKey: 'k' }, req(), 'APPROVE')).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(['APPROVE', 'REJECT'] as const)('denies self %s before mutation', async command => {
    const x = setup([{ kind: 'MISS' }, { kind: 'MISS' }], { id: 'r', seriesId: 's', supersedesRevisionId: null, series: { submitterUserId: 'actor' }, state: { lifecycleState: 'SUBMITTED', lifecycleToken: 't' }, subjects: [] });
    await expect(x.sut.decide('r', { expectedLifecycleToken: 't', requestKey: 'k' }, req(), command)).rejects.toBeInstanceOf(ForbiddenException);
    expect(x.repository.createDecision).not.toHaveBeenCalled();
    expect(x.repository.transitionLifecycleCas).not.toHaveBeenCalled();
  });

  it('requires PERSONAL for owner read and SCHOOL_WIDE or every subject for non-owner', async () => {
    const owner = setup([], makeFrozenRow('actor', ['sub-1']));
    await owner.sut.read('r', req('actor'));
    expect(owner.auth.evaluate).toHaveBeenCalledWith(expect.objectContaining({ requestedScope: 'PERSONAL' }));

    const subject = setup([], makeFrozenRow('owner', ['a', 'b']));
    subject.auth.evaluate.mockResolvedValueOnce({ allowed: false }).mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: true });
    await expect(subject.sut.read('r', req())).resolves.toBeDefined();
  });

  it('denies partial and zero-subject SUBJECT-only reads', async () => {
    const partial = setup([], makeFrozenRow('owner', ['a', 'b']));
    partial.auth.evaluate.mockResolvedValueOnce({ allowed: false }).mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false });
    await expect(partial.sut.read('r', req())).rejects.toBeInstanceOf(ForbiddenException);

    const zero = setup([], { ...makeFrozenRow('owner', ['a']), subjects: [] });
    zero.auth.evaluate.mockResolvedValue({ allowed: false });
    await expect(zero.sut.read('r', req())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('retries P2034 after reauthorizing and reclassifying the decision', async () => {
    const x = setup([{ kind: 'MISS' }, { kind: 'MISS' }, { kind: 'MISS' }]);
    let attempts = 0;
    x.prisma.$transaction.mockImplementation(async (fn: TransactionCallback) => {
      attempts += 1;
      if (attempts === 1) {
        await fn({ ...x.repository, user: { findUnique: jest.fn() } });
        throw new Prisma.PrismaClientKnownRequestError('serialization', { code: 'P2034', clientVersion: '5' });
      }
      return fn({ ...x.repository, user: { findUnique: jest.fn().mockResolvedValue({ profile: null }) } });
    });
    await x.sut.decide('r', { expectedLifecycleToken: 't', requestKey: 'retry' }, req(), 'REJECT');
    expect(attempts).toBe(2);
    expect(x.auth.evaluate.mock.calls.length).toBeGreaterThan(2);
    expect(x.repository.classifyAcceptedCommand.mock.calls.length).toBeGreaterThan(2);
  });

  it('replays the concurrent winner after a command identity P2002 race', async () => {
    const x = setup([{ kind: 'MISS' }, { kind: 'MISS' }, replay]);
    x.repository.createDecision.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('unique race', { code: 'P2002', clientVersion: '5', meta: { target: 'reporting_statement_commands_actor_type_request_key' } }));
    await expect(x.sut.decide('r', { expectedLifecycleToken: 't', requestKey: 'race' }, req(), 'REJECT')).resolves.toMatchObject({ replay: true });
    expect(x.repository.createDecision).toHaveBeenCalledTimes(1);
    expect(x.repository.appendDecisionHistory).not.toHaveBeenCalled();
  });

  it('propagates P2002 outside command receipt creation without third attempt', async () => {
    const x = setup([{ kind: 'MISS' }, { kind: 'MISS' }]);
    x.repository.lockSeries.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('other unique', { code: 'P2002', clientVersion: '5', meta: { target: 'different_constraint' } }));
    await expect(x.sut.decide('r', { expectedLifecycleToken: 't', requestKey: 'other' }, req(), 'REJECT')).rejects.toMatchObject({ code: 'P2002' });
    expect(x.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each([null, { revisionId: 'different-approved', lifecycleToken: 'old' }])('fails closed for inconsistent correction approval', async approved => {
    const row = { id: 'r', seriesId: 's', supersedesRevisionId: 'old-approved', series: { submitterUserId: 'owner' }, state: { lifecycleState: 'SUBMITTED', lifecycleToken: 't' }, subjects: [] };
    const x = setup([{ kind: 'MISS' }, { kind: 'MISS' }], row);
    x.repository.loadCurrentApproved.mockResolvedValue(approved);
    await expect(x.sut.decide('r', { expectedLifecycleToken: 't', requestKey: crypto.randomUUID() }, req(), 'APPROVE')).rejects.toBeInstanceOf(ConflictException);
    expect(x.repository.createDecision).not.toHaveBeenCalled();
    expect(x.repository.transitionLifecycleCas).not.toHaveBeenCalled();
  });
});
