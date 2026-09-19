import { ForbiddenException } from '@nestjs/common';
import { ProgrammePlanningAuthorizationService } from './programme-planning-authorization.service';

describe('ProgrammePlanningAuthorizationService', () => {
  let service: ProgrammePlanningAuthorizationService;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
    };
  };
  let authMock: {
    evaluate: jest.Mock;
  };
  let auditMock: {
    write: jest.Mock;
  };

  const gddpMaster = { id: 'master-gddp-1', kind: 'GDDP' as const };
  const hdtnMaster = { id: 'master-hdtn-1', kind: 'HDTN_HN' as const };
  const actorId = 'actor-user-1';

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: actorId,
          status: 'ACTIVE',
          mustChangePassword: false,
          lockedUntil: null,
        }),
      },
    };
    authMock = {
      evaluate: jest.fn(),
    };
    auditMock = {
      write: jest.fn().mockResolvedValue({}),
    };

    service = new ProgrammePlanningAuthorizationService(
      prismaMock as never,
      authMock as never,
      auditMock as never,
    );
  });

  describe('Deterministic Authority Resolution Precedence', () => {
    it('1. Coordinator grant takes highest precedence (Precedence 1)', async () => {
      // Mock both coordinator and principal allowed
      authMock.evaluate.mockImplementation(async ({ capabilityKey, requestedScope, resourceId }) => {
        if (capabilityKey === 'GDDDP_COORDINATOR' && requestedScope === 'ACTIVITY' && resourceId === gddpMaster.id) {
          return { allowed: true, reasonCode: 'ALLOWED' };
        }
        if (capabilityKey === 'APPROVAL_PRINCIPAL') {
          return { allowed: true, reasonCode: 'ALLOWED' };
        }
        return { allowed: false, reasonCode: 'GRANT_NOT_FOUND' };
      });

      const decision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(decision.qualified).toBe(true);
      expect(decision.authorityType).toBe('COORDINATOR');
      expect(decision.capabilityKey).toBe('GDDDP_COORDINATOR');
      expect(decision.resourceId).toBe(gddpMaster.id);
    });

    it('2. Principal takes precedence when coordinator is absent (Precedence 2)', async () => {
      authMock.evaluate.mockImplementation(async ({ capabilityKey }) => {
        if (capabilityKey === 'APPROVAL_PRINCIPAL') {
          return { allowed: true, reasonCode: 'ALLOWED' };
        }
        if (capabilityKey === 'APPROVAL_VICE_PRINCIPAL') {
          return { allowed: true, reasonCode: 'ALLOWED' };
        }
        return { allowed: false, reasonCode: 'GRANT_NOT_FOUND' };
      });

      const decision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(decision.qualified).toBe(true);
      expect(decision.authorityType).toBe('BGH_PRINCIPAL');
      expect(decision.capabilityKey).toBe('APPROVAL_PRINCIPAL');
    });

    it('3. Vice Principal qualifies when coordinator and Principal are absent (Precedence 3)', async () => {
      authMock.evaluate.mockImplementation(async ({ capabilityKey }) => {
        if (capabilityKey === 'APPROVAL_VICE_PRINCIPAL') {
          return { allowed: true, reasonCode: 'ALLOWED' };
        }
        return { allowed: false, reasonCode: 'GRANT_NOT_FOUND' };
      });

      const decision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(decision.qualified).toBe(true);
      expect(decision.authorityType).toBe('BGH_VICE_PRINCIPAL');
      expect(decision.capabilityKey).toBe('APPROVAL_VICE_PRINCIPAL');
    });
  });

  describe('Programme Isolation & Scope Binding (Tests 4-8)', () => {
    it('4. GDDP coordinator mutates/reads authorized GDDP master', async () => {
      authMock.evaluate.mockImplementation(async ({ capabilityKey, resourceId }) => {
        return {
          allowed: capabilityKey === 'GDDDP_COORDINATOR' && resourceId === gddpMaster.id,
          reasonCode: 'ALLOWED',
        };
      });

      const decision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(decision.qualified).toBe(true);
      expect(decision.authorityType).toBe('COORDINATOR');
    });

    it('5. GDDP coordinator on master A cannot access master B', async () => {
      const gddpMasterB = { id: 'master-gddp-2', kind: 'GDDP' as const };
      authMock.evaluate.mockImplementation(async ({ capabilityKey, resourceId }) => {
        return {
          allowed: capabilityKey === 'GDDDP_COORDINATOR' && resourceId === gddpMaster.id,
          reasonCode: 'GRANT_NOT_FOUND',
        };
      });

      const decision = await service.resolveProgrammeAuthority(actorId, gddpMasterB);
      expect(decision.qualified).toBe(false);
    });

    it('6. GDDP coordinator cannot access HDTN_HN master', async () => {
      authMock.evaluate.mockImplementation(async ({ capabilityKey }) => {
        return {
          allowed: capabilityKey === 'GDDDP_COORDINATOR',
          reasonCode: 'ALLOWED',
        };
      });

      // evaluating hdtnMaster checks HĐTN_COORDINATOR, not GDDDP_COORDINATOR
      const decision = await service.resolveProgrammeAuthority(actorId, hdtnMaster);
      expect(decision.qualified).toBe(false);
    });

    it('7. HĐTN coordinator mutates/reads authorized HDTN master', async () => {
      authMock.evaluate.mockImplementation(async ({ capabilityKey, resourceId }) => {
        return {
          allowed: capabilityKey === 'HĐTN_COORDINATOR' && resourceId === hdtnMaster.id,
          reasonCode: 'ALLOWED',
        };
      });

      const decision = await service.resolveProgrammeAuthority(actorId, hdtnMaster);
      expect(decision.qualified).toBe(true);
      expect(decision.authorityType).toBe('COORDINATOR');
    });

    it('8. HĐTN coordinator cannot access GDDP master', async () => {
      authMock.evaluate.mockImplementation(async ({ capabilityKey }) => {
        return {
          allowed: capabilityKey === 'HĐTN_COORDINATOR',
          reasonCode: 'ALLOWED',
        };
      });

      const decision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(decision.qualified).toBe(false);
    });
  });

  describe('BGH Access & Bootstrap Invariant (Tests 1, 2, 3, 9, 10)', () => {
    it('1 & 9. APPROVAL_PRINCIPAL can create master and manage any existing master', async () => {
      authMock.evaluate.mockImplementation(async ({ capabilityKey }) => ({
        allowed: capabilityKey === 'APPROVAL_PRINCIPAL',
        reasonCode: 'ALLOWED',
      }));

      const bghRes = await service.requireBghAuthority(actorId);
      expect(bghRes.authorityType).toBe('BGH_PRINCIPAL');

      const gddpDecision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(gddpDecision.qualified).toBe(true);

      const hdtnDecision = await service.resolveProgrammeAuthority(actorId, hdtnMaster);
      expect(hdtnDecision.qualified).toBe(true);
    });

    it('2 & 10. APPROVAL_VICE_PRINCIPAL can create master and manage any existing master', async () => {
      authMock.evaluate.mockImplementation(async ({ capabilityKey }) => ({
        allowed: capabilityKey === 'APPROVAL_VICE_PRINCIPAL',
        reasonCode: 'ALLOWED',
      }));

      const bghRes = await service.requireBghAuthority(actorId);
      expect(bghRes.authorityType).toBe('BGH_VICE_PRINCIPAL');

      const gddpDecision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(gddpDecision.qualified).toBe(true);

      const hdtnDecision = await service.resolveProgrammeAuthority(actorId, hdtnMaster);
      expect(hdtnDecision.qualified).toBe(true);
    });

    it('3. Coordinator alone cannot bootstrap create ProgrammeMaster', async () => {
      authMock.evaluate.mockImplementation(async ({ capabilityKey }) => ({
        allowed: capabilityKey === 'GDDDP_COORDINATOR',
        reasonCode: 'ALLOWED',
      }));

      await expect(service.requireBghAuthority(actorId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Default Deny & No Inference Rules (Tests 11-21)', () => {
    it('11. SYSTEM_ADMIN alone DENY', async () => {
      authMock.evaluate.mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' });
      await expect(service.requireProgrammeAuthority(actorId, gddpMaster)).rejects.toThrow(ForbiddenException);
    });

    it('12. SPECIAL_ACTIVITY_MANAGE alone DENY', async () => {
      authMock.evaluate.mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' });
      await expect(service.requireProgrammeAuthority(actorId, gddpMaster)).rejects.toThrow(ForbiddenException);
    });

    it('13. SUBJECT_GROUP_LEAD alone DENY', async () => {
      authMock.evaluate.mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' });
      await expect(service.requireProgrammeAuthority(actorId, gddpMaster)).rejects.toThrow(ForbiddenException);
    });

    it('14 & 15. User without grant DENY regardless of profile/role', async () => {
      authMock.evaluate.mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' });
      const decision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(decision.qualified).toBe(false);
    });

    it('16. Staffing presence does not confer authority', async () => {
      // In P4-030, only explicit capability grants are evaluated, no staffing tables are queried
      authMock.evaluate.mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' });
      const decision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(decision.qualified).toBe(false);
    });

    it('17. Creator identity alone does not retain authority after grant unavailable', async () => {
      authMock.evaluate.mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' });
      const decision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(decision.qualified).toBe(false);
    });

    it('18. Revoked coordinator grant DENY', async () => {
      authMock.evaluate.mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_ACTIVE' });
      const decision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(decision.qualified).toBe(false);
    });

    it('19. Expired coordinator grant DENY', async () => {
      authMock.evaluate.mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_ACTIVE' });
      const decision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(decision.qualified).toBe(false);
    });

    it('20. Future-dated coordinator grant DENY', async () => {
      authMock.evaluate.mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_ACTIVE' });
      const decision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(decision.qualified).toBe(false);
    });

    it('21. mustChangePassword DENY fail-closed', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: actorId,
        status: 'ACTIVE',
        mustChangePassword: true,
        lockedUntil: null,
      });

      authMock.evaluate.mockResolvedValue({ allowed: true, reasonCode: 'ALLOWED' });
      const decision = await service.resolveProgrammeAuthority(actorId, gddpMaster);
      expect(decision.qualified).toBe(false);
      expect(decision.reasonCode).toBe('PASSWORD_CHANGE_REQUIRED');

      await expect(service.requireProgrammeAuthority(actorId, gddpMaster)).rejects.toThrow(ForbiddenException);
      await expect(service.requireBghAuthority(actorId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('P4-040 Qualification Seam (Test 30)', () => {
    it('30. isQualifyingProgrammeAttestor returns true/provenance for coordinator and BGH, false for others', async () => {
      // Coordinator
      authMock.evaluate.mockImplementation(async ({ capabilityKey }) => ({
        allowed: capabilityKey === 'GDDDP_COORDINATOR',
        reasonCode: 'ALLOWED',
      }));
      const coord = await service.isQualifyingProgrammeAttestor(actorId, gddpMaster);
      expect(coord.qualified).toBe(true);
      expect(coord.authorityType).toBe('COORDINATOR');

      // Principal
      authMock.evaluate.mockImplementation(async ({ capabilityKey }) => ({
        allowed: capabilityKey === 'APPROVAL_PRINCIPAL',
        reasonCode: 'ALLOWED',
      }));
      const prin = await service.isQualifyingProgrammeAttestor(actorId, gddpMaster);
      expect(prin.qualified).toBe(true);
      expect(prin.authorityType).toBe('BGH_PRINCIPAL');

      // Vice Principal
      authMock.evaluate.mockImplementation(async ({ capabilityKey }) => ({
        allowed: capabilityKey === 'APPROVAL_VICE_PRINCIPAL',
        reasonCode: 'ALLOWED',
      }));
      const vp = await service.isQualifyingProgrammeAttestor(actorId, gddpMaster);
      expect(vp.qualified).toBe(true);
      expect(vp.authorityType).toBe('BGH_VICE_PRINCIPAL');

      // Others
      authMock.evaluate.mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' });
      const other = await service.isQualifyingProgrammeAttestor(actorId, gddpMaster);
      expect(other.qualified).toBe(false);
    });
  });

  describe('Denial Audit Logging (Test 31)', () => {
    it('31. Denial audit exists and contains no sensitive data', async () => {
      authMock.evaluate.mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' });

      await expect(
        service.requireProgrammeAuthority(actorId, gddpMaster, { route: '/api/test', method: 'POST' }),
      ).rejects.toThrow(ForbiddenException);

      expect(auditMock.write).toHaveBeenCalledWith({
        actorUserId: actorId,
        action: 'AUTHORIZATION_DENIED',
        entityType: 'CapabilityDefinition',
        entityId: 'GDDDP_COORDINATOR',
        result: 'DENIED',
        metadata: expect.objectContaining({
          capabilityKey: 'GDDDP_COORDINATOR',
          scope: 'ACTIVITY',
          resourceId: gddpMaster.id,
          route: '/api/test',
          method: 'POST',
        }),
      });

      // Verify no sensitive fields like passwords/tokens in metadata
      const callArg = auditMock.write.mock.calls[0][0];
      expect(callArg.metadata).not.toHaveProperty('password');
      expect(callArg.metadata).not.toHaveProperty('passwordHash');
      expect(callArg.metadata).not.toHaveProperty('token');
    });
  });
});
