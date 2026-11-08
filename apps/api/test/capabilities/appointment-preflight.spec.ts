import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AppointmentPreflightService } from '../../src/capabilities/appointment-preflight.service';

describe('P5-057 WS1 appointment preflight — read-only and fail-closed', () => {
  const previewResult = {
    templateKey: 'VICE_PRINCIPAL_ACADEMIC', version: 'v1',
    targetUser: { id: 'target', username: 'target', displayName: 'Target', isTeachingStaff: true, status: 'ACTIVE' },
    eligibility: { isEligible: true }, requiredResources: { kind: 'NONE', provided: true },
    grantsToAdd: [], alreadyPresent: [], conflicts: [], forbiddenDefaults: [], notes: [],
  };
  const setup = () => {
    const prisma = {
      capabilityGrant: { findMany: jest.fn().mockResolvedValue([{ coordinateId: null }, { coordinateId: 'coordinate-1' }]) },
      roleAppointment: { count: jest.fn().mockResolvedValue(1) },
    };
    const authorization = { hasCapability: jest.fn().mockResolvedValue(true) };
    const baselines = { previewTemplate: jest.fn().mockResolvedValue(previewResult) };
    const service = new AppointmentPreflightService(prisma as never, authorization as never, baselines as never);
    return { prisma, authorization, baselines, service };
  };

  it('denies self-appointment and forced password change before accessing data', async () => {
    const { prisma, authorization, service } = setup();
    await expect(service.preview({
      templateKey: 'VICE_PRINCIPAL_ACADEMIC', targetUserId: 'actor',
    }, 'actor')).rejects.toThrow(ForbiddenException);
    await expect(service.preview({
      templateKey: 'VICE_PRINCIPAL_ACADEMIC', targetUserId: 'target',
    }, 'actor', true)).rejects.toThrow(ForbiddenException);
    expect(authorization.hasCapability).not.toHaveBeenCalled();
    expect(prisma.capabilityGrant.findMany).not.toHaveBeenCalled();
  });

  it('rejects incomplete or unrelated scope without invoking authorization', async () => {
    const { authorization, service } = setup();
    await expect(service.preview({
      templateKey: 'SUBJECT_LEADER', targetUserId: 'target',
    }, 'actor')).rejects.toThrow(BadRequestException);
    await expect(service.preview({
      templateKey: 'VICE_PRINCIPAL_ACADEMIC', targetUserId: 'target', subjectGroupId: 'group-1',
    }, 'actor')).rejects.toThrow(BadRequestException);
    expect(authorization.hasCapability).not.toHaveBeenCalled();
  });

  it('requires both technical Admin capabilities to inspect PHT appointment', async () => {
    const { prisma, authorization, service } = setup();
    authorization.hasCapability.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(service.preview({
      templateKey: 'VICE_PRINCIPAL_ACADEMIC', targetUserId: 'target',
    }, 'actor')).rejects.toThrow(ForbiddenException);
    expect(prisma.capabilityGrant.findMany).not.toHaveBeenCalled();
  });

  it('requires PHT academic approval capability to inspect TTCM appointment', async () => {
    const { authorization, baselines, service } = setup();
    authorization.hasCapability.mockResolvedValueOnce(false);
    await expect(service.preview({
      templateKey: 'SUBJECT_LEADER', targetUserId: 'target', subjectGroupId: 'group-1',
    }, 'actor')).rejects.toThrow(ForbiddenException);
    expect(baselines.previewTemplate).not.toHaveBeenCalled();
  });

  it('reports existing evidence without verifying provenance or performing mutations', async () => {
    const { prisma, authorization, baselines, service } = setup();
    const result = await service.preview({
      templateKey: 'SUBJECT_LEADER', targetUserId: 'target', subjectGroupId: 'group-1',
    }, 'pht');
    expect(authorization.hasCapability).toHaveBeenCalledWith({
      userId: 'pht', capabilityKey: 'APPROVAL_VICE_PRINCIPAL', requestedScope: 'SCHOOL_WIDE',
    });
    expect(baselines.previewTemplate).toHaveBeenCalledWith('target', {
      templateKey: 'SUBJECT_LEADER', subjectGroupId: 'group-1',
    });
    expect(result).toMatchObject({
      mode: 'READ_ONLY', canConfirm: false,
      confirmationBlocker: 'B1_SOURCE_WRITER_NOT_ACTIVE',
      authorityBasis: 'CAPABILITY_PRECHECK_ONLY',
      evidence: {
        activeGrantCount: 2,
        legacyUnlinkedActiveGrantCount: 1,
        b1LinkedButUnverifiedActiveGrantCount: 1,
        activeRoleAppointmentCount: 1,
        provenanceVerified: false,
      },
    });
    expect(prisma.capabilityGrant.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.roleAppointment.count).toHaveBeenCalledTimes(1);
    expect(Object.keys(prisma.capabilityGrant)).toEqual(['findMany']);
    expect(Object.keys(prisma.roleAppointment)).toEqual(['count']);
  });
});
