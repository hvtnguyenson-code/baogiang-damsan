import { NotFoundException } from '@nestjs/common';
import { AuthorizedProgrammePlanningService } from './authorized-programme-planning.service';
import { ProgrammePlanningModule } from './programme-planning.module';
import { ProgrammePlanningService } from './programme-planning.service';

describe('AuthorizedProgrammePlanningService', () => {
  let authorizedService: AuthorizedProgrammePlanningService;
  let rawServiceMock: Record<string, jest.Mock>;
  let authServiceMock: Record<string, jest.Mock>;
  let authorizationMock: Record<string, jest.Mock>;
  let prismaMock: {
    user: { findUnique: jest.Mock };
    programmeMaster: { findUnique: jest.Mock };
    programmePlanVersion: { findUnique: jest.Mock };
    plannedProgrammeOccurrence: { findUnique: jest.Mock };
  };

  const actorId = 'actor-user-1';
  const masterId = 'master-uuid-1';
  const gddpMaster = { id: masterId, kind: 'GDDP' as const };

  beforeEach(() => {
    rawServiceMock = {
      createMaster: jest.fn().mockResolvedValue({ id: masterId }),
      getMaster: jest.fn().mockResolvedValue({ id: masterId }),
      listMasters: jest.fn().mockResolvedValue([{ id: masterId, kind: 'GDDP' }]),
      createDraftPlanVersion: jest.fn().mockResolvedValue({ id: 'plan-1' }),
      createSuccessorDraftPlanVersion: jest.fn().mockResolvedValue({ id: 'plan-2' }),
      editDraftPlanVersion: jest.fn().mockResolvedValue({ id: 'plan-1' }),
      publishPlanVersion: jest.fn().mockResolvedValue({ id: 'plan-1' }),
      getPlanVersion: jest.fn().mockResolvedValue({ id: 'plan-1' }),
      listPlanVersions: jest.fn().mockResolvedValue([{ id: 'plan-1' }]),
      createDraftOccurrence: jest.fn().mockResolvedValue({ id: 'occ-1' }),
      editDraftOccurrence: jest.fn().mockResolvedValue({ id: 'occ-1' }),
      replaceOccurrenceSlotsAndStaffing: jest.fn().mockResolvedValue({ id: 'occ-1' }),
      publishOccurrence: jest.fn().mockResolvedValue({ id: 'occ-1' }),
      createReplacementOccurrence: jest.fn().mockResolvedValue({ id: 'occ-2' }),
      getOccurrence: jest.fn().mockResolvedValue({ id: 'occ-1' }),
      listOccurrences: jest.fn().mockResolvedValue([{ id: 'occ-1', programmeMasterId: masterId }]),
    };

    authServiceMock = {
      requireBghAuthority: jest.fn().mockResolvedValue({ authorityType: 'BGH_PRINCIPAL' }),
      requireProgrammeAuthority: jest.fn().mockResolvedValue({ qualified: true }),
      resolveProgrammeAuthority: jest.fn().mockResolvedValue({ qualified: true }),
    };

    authorizationMock = {
      evaluate: jest.fn().mockResolvedValue({ allowed: false }),
    };

    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: actorId,
          status: 'ACTIVE',
          mustChangePassword: false,
          lockedUntil: null,
        }),
      },
      programmeMaster: {
        findUnique: jest.fn().mockResolvedValue(gddpMaster),
      },
      programmePlanVersion: {
        findUnique: jest.fn().mockResolvedValue({ id: 'plan-1', programmeMasterId: masterId }),
      },
      plannedProgrammeOccurrence: {
        findUnique: jest.fn().mockResolvedValue({ id: 'occ-1', programmeMasterId: masterId }),
      },
    };

    authorizedService = new AuthorizedProgrammePlanningService(
      rawServiceMock as never,
      authServiceMock as never,
      authorizationMock as never,
      prismaMock as never,
    );
  });

  describe('Master Commands & Queries', () => {
    it('createMaster requires BGH authority before delegating', async () => {
      const dto = { academicYearId: 'year-1', kind: 'GDDP' as const, gradeLevel: 10, commandId: 'cmd-1' };
      const res = await authorizedService.createMaster(dto, actorId);

      expect(authServiceMock.requireBghAuthority).toHaveBeenCalledWith(actorId, undefined);
      expect(rawServiceMock.createMaster).toHaveBeenCalledWith(dto, actorId);
      expect(res).toEqual({ id: masterId });
    });

    it('getMaster verifies authority and returns record', async () => {
      const res = await authorizedService.getMaster(masterId, actorId);
      expect(prismaMock.programmeMaster.findUnique).toHaveBeenCalledWith({
        where: { id: masterId },
        select: { id: true, kind: true },
      });
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.getMaster).toHaveBeenCalledWith(masterId);
      expect(res).toEqual({ id: masterId });
    });

    it('getMaster throws NotFoundException if master does not exist', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue(null);
      await expect(authorizedService.getMaster('missing-id', actorId)).rejects.toThrow(NotFoundException);
      expect(rawServiceMock.getMaster).not.toHaveBeenCalled();
    });

    it('24. listMasters does not leak unauthorized masters to non-BGH actor', async () => {
      const otherMaster = { id: 'other-master-uuid', kind: 'GDDP' as const };
      rawServiceMock.listMasters.mockResolvedValue([gddpMaster, otherMaster]);

      // Actor is coordinator ONLY for gddpMaster, not otherMaster
      authServiceMock.resolveProgrammeAuthority.mockImplementation(async (_uid, m) => {
        return { qualified: m.id === masterId };
      });

      const res = await authorizedService.listMasters({ academicYearId: 'year-1' }, actorId);
      expect(res).toEqual([gddpMaster]);
      expect(res).not.toContainEqual(otherMaster);
    });

    it('listMasters returns all matching masters for BGH actor', async () => {
      const otherMaster = { id: 'other-master-uuid', kind: 'GDDP' as const };
      rawServiceMock.listMasters.mockResolvedValue([gddpMaster, otherMaster]);
      authorizationMock.evaluate.mockImplementation(async ({ capabilityKey }) => ({
        allowed: capabilityKey === 'APPROVAL_PRINCIPAL',
      }));

      const res = await authorizedService.listMasters({ academicYearId: 'year-1' }, actorId);
      expect(res).toEqual([gddpMaster, otherMaster]);
    });
  });

  describe('Plan Version Commands & Queries', () => {
    it('createDraftPlanVersion validates authority on target master', async () => {
      const dto = { programmeMasterId: masterId, commandId: 'cmd-p1' };
      await authorizedService.createDraftPlanVersion(dto, actorId);
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.createDraftPlanVersion).toHaveBeenCalledWith(dto, actorId);
    });

    it('createSuccessorDraftPlanVersion validates authority on target master', async () => {
      const dto = { programmeMasterId: masterId, predecessorVersionId: 'plan-1', changeReason: 'update', commandId: 'cmd-p2' };
      await authorizedService.createSuccessorDraftPlanVersion(dto, actorId);
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.createSuccessorDraftPlanVersion).toHaveBeenCalledWith(dto, actorId);
    });

    it('editDraftPlanVersion resolves authoritative master from plan version in DB', async () => {
      const dto = { expectedRevision: 1, commandId: 'cmd-edit' };
      await authorizedService.editDraftPlanVersion('plan-1', dto, actorId);
      expect(prismaMock.programmePlanVersion.findUnique).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        select: { programmeMasterId: true },
      });
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.editDraftPlanVersion).toHaveBeenCalledWith('plan-1', dto, actorId);
    });

    it('publishPlanVersion resolves authoritative master from plan version in DB', async () => {
      const dto = { expectedRevision: 1, commandId: 'cmd-pub' };
      await authorizedService.publishPlanVersion('plan-1', dto, actorId);
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.publishPlanVersion).toHaveBeenCalledWith('plan-1', dto, actorId);
    });

    it('getPlanVersion resolves authoritative master from plan version in DB', async () => {
      await authorizedService.getPlanVersion('plan-1', actorId);
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.getPlanVersion).toHaveBeenCalledWith('plan-1');
    });

    it('listPlanVersions checks authority on master', async () => {
      await authorizedService.listPlanVersions(masterId, actorId);
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.listPlanVersions).toHaveBeenCalledWith(masterId);
    });
  });

  describe('Occurrence Commands & Queries', () => {
    it('createDraftOccurrence validates authority on target master', async () => {
      const dto = {
        programmeMasterId: masterId,
        programmePlanVersionId: 'plan-1',
        programmeTopicItemId: 'topic-1',
        academicYearId: 'year-1',
        civilDate: '2026-09-15',
        mode: 'CLASS' as const,
        schoolClassId: 'class-1',
        commandId: 'cmd-occ-create',
      };
      await authorizedService.createDraftOccurrence(dto, actorId);
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.createDraftOccurrence).toHaveBeenCalledWith(dto, actorId);
    });

    it('editDraftOccurrence resolves authoritative master from occurrence in DB', async () => {
      const dto = { expectedRevision: 1, commandId: 'cmd-occ-edit' };
      await authorizedService.editDraftOccurrence('occ-1', dto, actorId);
      expect(prismaMock.plannedProgrammeOccurrence.findUnique).toHaveBeenCalledWith({
        where: { id: 'occ-1' },
        select: { programmeMasterId: true },
      });
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.editDraftOccurrence).toHaveBeenCalledWith('occ-1', dto, actorId);
    });

    it('replaceOccurrenceSlotsAndStaffing resolves authoritative master from occurrence in DB', async () => {
      const dto = { expectedRevision: 1, commandId: 'cmd-slots', slots: [] };
      await authorizedService.replaceOccurrenceSlotsAndStaffing('occ-1', dto, actorId);
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.replaceOccurrenceSlotsAndStaffing).toHaveBeenCalledWith('occ-1', dto, actorId);
    });

    it('publishOccurrence resolves authoritative master from occurrence in DB', async () => {
      const dto = { expectedRevision: 1, commandId: 'cmd-occ-pub' };
      await authorizedService.publishOccurrence('occ-1', dto, actorId);
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.publishOccurrence).toHaveBeenCalledWith('occ-1', dto, actorId);
    });

    it('createReplacementOccurrence resolves authoritative master from replaced occurrence in DB', async () => {
      const dto = {
        replacesOccurrenceId: 'occ-1',
        changeReason: 'replacement test',
        commandId: 'cmd-occ-replace',
      };
      await authorizedService.createReplacementOccurrence('occ-1', dto, actorId);
      expect(prismaMock.plannedProgrammeOccurrence.findUnique).toHaveBeenCalledWith({
        where: { id: 'occ-1' },
        select: { programmeMasterId: true },
      });
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.createReplacementOccurrence).toHaveBeenCalledWith('occ-1', dto, actorId);
    });

    it('getOccurrence resolves authoritative master from occurrence in DB', async () => {
      await authorizedService.getOccurrence('occ-1', actorId);
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.getOccurrence).toHaveBeenCalledWith('occ-1');
    });

    it('listOccurrences with programmeMasterId checks authority on that master', async () => {
      await authorizedService.listOccurrences({ programmeMasterId: masterId }, actorId);
      expect(authServiceMock.requireProgrammeAuthority).toHaveBeenCalledWith(actorId, gddpMaster, undefined);
      expect(rawServiceMock.listOccurrences).toHaveBeenCalledWith({ programmeMasterId: masterId });
    });
  });

  describe('32. Module Seam Encapsulation', () => {
    it('32. Raw ProgrammePlanningService is not exported from ProgrammePlanningModule', () => {
      const exports = Reflect.getMetadata('exports', ProgrammePlanningModule) as unknown[];
      expect(exports).toBeDefined();
      expect(exports).not.toContain(ProgrammePlanningService);
      expect(exports).toContain(AuthorizedProgrammePlanningService);
    });
  });
});
