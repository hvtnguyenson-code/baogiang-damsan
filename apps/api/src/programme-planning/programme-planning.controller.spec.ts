import { BadRequestException } from '@nestjs/common';
import { ProgrammePlanningController } from './programme-planning.controller';

describe('ProgrammePlanningController', () => {
  let controller: ProgrammePlanningController;
  let serviceMock: Record<string, jest.Mock>;

  const actorId = 'actor-user-1';
  const masterId = 'master-uuid-1';
  const occId = 'occ-uuid-1';
  const planId = 'plan-uuid-1';

  const fakeReq = {
    auth: { user: { id: actorId } },
    route: { path: '/api/test' },
    method: 'POST',
  } as never;

  beforeEach(() => {
    serviceMock = {
      createMaster: jest.fn().mockResolvedValue({ id: masterId }),
      listMasters: jest.fn().mockResolvedValue([]),
      getMaster: jest.fn().mockResolvedValue({ id: masterId }),
      createDraftPlanVersion: jest.fn().mockResolvedValue({ id: planId }),
      createSuccessorDraftPlanVersion: jest.fn().mockResolvedValue({ id: planId }),
      listPlanVersions: jest.fn().mockResolvedValue([]),
      getPlanVersion: jest.fn().mockResolvedValue({ id: planId }),
      editDraftPlanVersion: jest.fn().mockResolvedValue({ id: planId }),
      publishPlanVersion: jest.fn().mockResolvedValue({ id: planId }),
      createDraftOccurrence: jest.fn().mockResolvedValue({ id: occId }),
      listOccurrences: jest.fn().mockResolvedValue([]),
      getOccurrence: jest.fn().mockResolvedValue({ id: occId }),
      editDraftOccurrence: jest.fn().mockResolvedValue({ id: occId }),
      replaceOccurrenceSlotsAndStaffing: jest.fn().mockResolvedValue({ id: occId }),
      publishOccurrence: jest.fn().mockResolvedValue({ id: occId }),
      createReplacementOccurrence: jest.fn().mockResolvedValue({ id: 'occ-rep-1' }),
    };

    controller = new ProgrammePlanningController(serviceMock as never);
  });

  describe('Route vs Body Parameter Mismatch Guards (Tests 22 & 23)', () => {
    it('22. createDraftPlanVersion rejects body/route master mismatch before mutation', async () => {
      const dto = { programmeMasterId: 'different-master-id', commandId: 'cmd-1' };
      await expect(
        controller.createDraftPlanVersion(masterId, dto as never, fakeReq),
      ).rejects.toThrow(BadRequestException);
      expect(serviceMock.createDraftPlanVersion).not.toHaveBeenCalled();
    });

    it('createDraftPlanVersion sets programmeMasterId from route if omitted in body', async () => {
      const dto = { commandId: 'cmd-1' } as never;
      await controller.createDraftPlanVersion(masterId, dto, fakeReq);
      expect(serviceMock.createDraftPlanVersion).toHaveBeenCalledWith(
        expect.objectContaining({ programmeMasterId: masterId }),
        actorId,
        expect.anything(),
      );
    });

    it('createSuccessorDraftPlanVersion rejects body/route master mismatch', async () => {
      const dto = {
        programmeMasterId: 'different-master-id',
        predecessorVersionId: 'plan-1',
        changeReason: 'reason',
        commandId: 'cmd-2',
      };
      await expect(
        controller.createSuccessorDraftPlanVersion(masterId, dto as never, fakeReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('createDraftOccurrence rejects body/route master mismatch', async () => {
      const dto = { programmeMasterId: 'different-master-id', commandId: 'cmd-3' };
      await expect(
        controller.createDraftOccurrence(masterId, dto as never, fakeReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('listMasterOccurrences rejects query/route master mismatch', async () => {
      const query = { programmeMasterId: 'different-master-id' };
      await expect(
        controller.listMasterOccurrences(masterId, query as never, fakeReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('23. createReplacementOccurrence rejects body/route occurrence mismatch', async () => {
      const dto = {
        replacesOccurrenceId: 'different-occurrence-id',
        changeReason: 'test replace',
        commandId: 'cmd-rep',
      };
      await expect(
        controller.createReplacementOccurrence(occId, dto as never, fakeReq),
      ).rejects.toThrow(BadRequestException);
      expect(serviceMock.createReplacementOccurrence).not.toHaveBeenCalled();
    });

    it('createReplacementOccurrence sets replacesOccurrenceId from route if omitted', async () => {
      const dto = { changeReason: 'test replace', commandId: 'cmd-rep' } as never;
      await controller.createReplacementOccurrence(occId, dto, fakeReq);
      expect(serviceMock.createReplacementOccurrence).toHaveBeenCalledWith(
        occId,
        expect.objectContaining({ replacesOccurrenceId: occId }),
        actorId,
        expect.anything(),
      );
    });
  });

  describe('Clean Endpoint Dispatch', () => {
    it('createMaster dispatches to service with actor id and audit context', async () => {
      const dto = { academicYearId: 'year-1', kind: 'GDDP' as const, gradeLevel: 10, commandId: 'cmd-m' };
      await controller.createMaster(dto, fakeReq);
      expect(serviceMock.createMaster).toHaveBeenCalledWith(dto, actorId, expect.anything());
    });

    it('getMaster dispatches with masterId and actorId', async () => {
      await controller.getMaster(masterId, fakeReq);
      expect(serviceMock.getMaster).toHaveBeenCalledWith(masterId, actorId, expect.anything());
    });

    it('editDraftOccurrence dispatches with occurrenceId and actorId', async () => {
      const dto = { expectedRevision: 1, commandId: 'cmd-edit' };
      await controller.editDraftOccurrence(occId, dto, fakeReq);
      expect(serviceMock.editDraftOccurrence).toHaveBeenCalledWith(occId, dto, actorId, expect.anything());
    });

    it('publishOccurrence dispatches with occurrenceId and actorId', async () => {
      const dto = { expectedRevision: 1, commandId: 'cmd-pub' };
      await controller.publishOccurrence(occId, dto, fakeReq);
      expect(serviceMock.publishOccurrence).toHaveBeenCalledWith(occId, dto, actorId, expect.anything());
    });

    it('inspectHdtnWorkbook dispatches to service with file', async () => {
      serviceMock.inspectHdtnWorkbook = jest.fn().mockResolvedValue({ sourceFileName: 'test.xlsx' });
      const fakeFile = { originalname: 'test.xlsx', buffer: Buffer.from('') } as never;
      await controller.inspectHdtnWorkbook(fakeFile);
      expect(serviceMock.inspectHdtnWorkbook).toHaveBeenCalledWith(fakeFile);
    });

    it('previewHdtnWorkbook dispatches to service with file, academicYearId, and actorId', async () => {
      serviceMock.previewHdtnWorkbook = jest.fn().mockResolvedValue({ canConfirm: true });
      const fakeFile = { originalname: 'test.xlsx', buffer: Buffer.from('') } as never;
      const dto = { academicYearId: 'year-1' };
      await controller.previewHdtnWorkbook(fakeFile, dto, fakeReq);
      expect(serviceMock.previewHdtnWorkbook).toHaveBeenCalledWith(
        fakeFile,
        'year-1',
        actorId,
        expect.anything(),
      );
    });

    it('confirmHdtnWorkbook dispatches to service with file, dto, and actorId', async () => {
      serviceMock.confirmHdtnWorkbook = jest.fn().mockResolvedValue({ status: 'DRAFT' });
      const fakeFile = { originalname: 'test.xlsx', buffer: Buffer.from('') } as never;
      const dto = {
        academicYearId: 'year-1',
        commandId: 'cmd-1',
        expectedPreviewFingerprint: 'fp-1',
      };
      await controller.confirmHdtnWorkbook(fakeFile, dto, fakeReq);
      expect(serviceMock.confirmHdtnWorkbook).toHaveBeenCalledWith(
        fakeFile,
        dto,
        actorId,
        expect.anything(),
      );
    });

    it('inspectGddpWorkbook dispatches to service with file', async () => {
      serviceMock.inspectGddpWorkbook = jest.fn().mockResolvedValue({ sourceFileName: 'gddp.xlsx' });
      const fakeFile = { originalname: 'gddp.xlsx', buffer: Buffer.from('') } as never;
      await controller.inspectGddpWorkbook(fakeFile);
      expect(serviceMock.inspectGddpWorkbook).toHaveBeenCalledWith(fakeFile);
    });

    it('previewGddpWorkbook dispatches to service with file, academicYearId, gradeLevel, and actorId', async () => {
      serviceMock.previewGddpWorkbook = jest.fn().mockResolvedValue({ canConfirm: true });
      const fakeFile = { originalname: 'gddp.xlsx', buffer: Buffer.from('') } as never;
      const dto = { academicYearId: 'year-1', gradeLevel: 10 };
      await controller.previewGddpWorkbook(fakeFile, dto, fakeReq);
      expect(serviceMock.previewGddpWorkbook).toHaveBeenCalledWith(
        fakeFile,
        'year-1',
        10,
        actorId,
        expect.anything(),
      );
    });

    it('confirmGddpWorkbook dispatches to service with file, dto, and actorId', async () => {
      serviceMock.confirmGddpWorkbook = jest.fn().mockResolvedValue({ status: 'DRAFT' });
      const fakeFile = { originalname: 'gddp.xlsx', buffer: Buffer.from('') } as never;
      const dto = {
        academicYearId: 'year-1',
        gradeLevel: 10,
        commandId: 'cmd-gddp-1',
        expectedPreviewFingerprint: 'fp-gddp-1',
      };
      await controller.confirmGddpWorkbook(fakeFile, dto, fakeReq);
      expect(serviceMock.confirmGddpWorkbook).toHaveBeenCalledWith(
        fakeFile,
        dto,
        actorId,
        expect.anything(),
      );
    });
  });
});
