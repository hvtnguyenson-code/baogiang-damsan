import { ForbiddenException } from '@nestjs/common';
import { AppointmentPreflightService, B1_ADVISORY_PREVIEW_LIMIT } from '../../src/capabilities/appointment-preflight.service';
import { B1RepositoryInspector } from '../../src/capabilities/b1-repository-inspector';

const linked = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
];

const previewResult = {
  templateKey: 'VICE_PRINCIPAL_ACADEMIC', version: 'v1',
  targetUser: { id: 'target', username: 'target', displayName: 'Target', isTeachingStaff: true, status: 'ACTIVE' },
  eligibility: { isEligible: true },
  requiredResources: { kind: 'NONE', provided: true },
  grantsToAdd: [], alreadyPresent: [], conflicts: [], forbiddenDefaults: [], notes: [],
};

const supportCandidate = {
  verdict: 'SUPPORT_CANDIDATE' as const, reason: 'CANDIDATE_ONLY' as const,
  supportingSourceCount: 2, canConfirm: false as const, provenanceVerified: false as const,
};
const unverified = {
  verdict: 'UNVERIFIED' as const, reason: 'INCOMPLETE_HISTORY' as const,
  supportingSourceCount: 0, canConfirm: false as const, provenanceVerified: false as const,
};

function setup(grantRows: Array<{ id: string; coordinateId: string | null }>) {
  const prisma = {
    capabilityGrant: { findMany: jest.fn().mockResolvedValue(grantRows) },
    roleAppointment: { count: jest.fn().mockResolvedValue(0) },
  };
  const authorization = { hasCapability: jest.fn().mockResolvedValue(true) };
  const baselines = { previewTemplate: jest.fn().mockResolvedValue(previewResult) };
  const service = new AppointmentPreflightService(prisma as never, authorization as never, baselines as never);
  const preview = () => service.preview({ templateKey: 'VICE_PRINCIPAL_ACADEMIC', targetUserId: 'target' }, 'admin');
  return { prisma, authorization, baselines, service, preview };
}

describe('P5-057 WS1-B B1 advisory-only preflight integration', () => {
  afterEach(() => jest.restoreAllMocks());

  it('skips B1 SQL for legacy NULL grants while preserving the existing read-only contract', async () => {
    const inspect = jest.spyOn(B1RepositoryInspector.prototype, 'inspect');
    const fixture = setup([{ id: linked[0], coordinateId: null }]);
    const result = await fixture.preview();
    expect(inspect).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      mode: 'READ_ONLY', canConfirm: false,
      confirmationBlocker: 'B1_SOURCE_WRITER_NOT_ACTIVE',
      authorityBasis: 'CAPABILITY_PRECHECK_ONLY',
      evidence: {
        activeGrantCount: 1, legacyUnlinkedActiveGrantCount: 1,
        provenanceVerified: false,
        b1Advisory: {
          mode: 'ADVISORY_ONLY', state: 'NO_LINKED_GRANTS',
          inspectedGrantCount: 0, supportCandidateGrantCount: 0,
          unverifiedLinkedGrantCount: 0, deferredLinkedGrantCount: 0,
        },
      },
    });
  });

  it('counts source candidates without converting candidates into verified provenance', async () => {
    const inspect = jest.spyOn(B1RepositoryInspector.prototype, 'inspect')
      .mockResolvedValueOnce(supportCandidate)
      .mockResolvedValueOnce(unverified);
    const fixture = setup(linked.slice(0, 2).map((id) => ({ id, coordinateId: linked[3] })));
    const result = await fixture.preview();
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(inspect).toHaveBeenNthCalledWith(1, linked[0]);
    expect(inspect).toHaveBeenNthCalledWith(2, linked[1]);
    expect(result).toMatchObject({
      mode: 'READ_ONLY', canConfirm: false,
      confirmationBlocker: 'B1_SOURCE_WRITER_NOT_ACTIVE',
      evidence: {
        b1LinkedButUnverifiedActiveGrantCount: 2, provenanceVerified: false,
        b1Advisory: {
          mode: 'ADVISORY_ONLY', state: 'INSPECTED',
          inspectedGrantCount: 2, supportCandidateGrantCount: 1,
          unverifiedLinkedGrantCount: 1, deferredLinkedGrantCount: 0,
        },
      },
    });
  });

  it('treats a rejected inspector query as unverified instead of breaking preview', async () => {
    jest.spyOn(B1RepositoryInspector.prototype, 'inspect')
      .mockRejectedValueOnce(new Error('postgres unavailable'));
    const result = await setup([{ id: linked[0], coordinateId: linked[3] }]).preview();
    expect(result.evidence.b1Advisory).toMatchObject({
      state: 'INSPECTED', inspectedGrantCount: 1,
      supportCandidateGrantCount: 0, unverifiedLinkedGrantCount: 1,
    });
    expect(result.canConfirm).toBe(false);
  });

  it('defers every linked grant if the bounded transaction budget is exceeded', async () => {
    expect(B1_ADVISORY_PREVIEW_LIMIT).toBe(4);
    const inspect = jest.spyOn(B1RepositoryInspector.prototype, 'inspect');
    const result = await setup(linked.map((id) => ({ id, coordinateId: linked[3] }))).preview();
    expect(inspect).not.toHaveBeenCalled();
    expect(result.evidence.b1Advisory).toMatchObject({
      mode: 'ADVISORY_ONLY', state: 'DEFERRED_LIMIT',
      inspectedGrantCount: 0, supportCandidateGrantCount: 0,
      unverifiedLinkedGrantCount: 0, deferredLinkedGrantCount: 5,
    });
  });

  it('does not trust an inspector result attempting to claim authorization', async () => {
    jest.spyOn(B1RepositoryInspector.prototype, 'inspect').mockResolvedValueOnce({
      ...supportCandidate, canConfirm: true, provenanceVerified: true,
    } as never);
    const result = await setup([{ id: linked[0], coordinateId: linked[3] }]).preview();
    expect(result.canConfirm).toBe(false);
    expect(result.evidence.provenanceVerified).toBe(false);
    expect(result.evidence.b1Advisory).toMatchObject({
      supportCandidateGrantCount: 0, unverifiedLinkedGrantCount: 1,
    });
  });

  it('checks authorization before any grant query or B1 inspector access', async () => {
    const inspect = jest.spyOn(B1RepositoryInspector.prototype, 'inspect');
    const fixture = setup([{ id: linked[0], coordinateId: linked[3] }]);
    fixture.authorization.hasCapability.mockResolvedValue(false);
    await expect(fixture.preview()).rejects.toThrow(ForbiddenException);
    expect(fixture.prisma.capabilityGrant.findMany).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });

  it('uses only grant IDs fetched by the backend and never alters user role/grant data', async () => {
    const inspect = jest.spyOn(B1RepositoryInspector.prototype, 'inspect')
      .mockResolvedValue(supportCandidate);
    const fixture = setup([{ id: linked[0], coordinateId: linked[3] }]);
    const result = await fixture.preview();
    expect(inspect).toHaveBeenCalledWith(linked[0]);
    expect(fixture.prisma.capabilityGrant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'target' }),
      select: { id: true, coordinateId: true },
    }));
    expect(Object.keys(fixture.prisma.capabilityGrant)).toEqual(['findMany']);
    expect(Object.keys(fixture.prisma.roleAppointment)).toEqual(['count']);
    expect(result.evidence.b1Advisory?.supportCandidateGrantCount).toBe(1);
    expect(result.evidence.provenanceVerified).toBe(false);
  });
});
