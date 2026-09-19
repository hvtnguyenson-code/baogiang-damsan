import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgrammePlanningService, weekdayForCivilDate } from './programme-planning.service';
import {
  CreateDraftOccurrenceDto,
  CreateDraftPlanVersionDto,
  CreateProgrammeMasterDto,
  CreateReplacementOccurrenceDto,
  CreateSuccessorDraftPlanVersionDto,
  EditDraftOccurrenceDto,
  EditDraftPlanVersionDto,
  PublishOccurrenceDto,
  PublishPlanVersionDto,
  ReplaceOccurrenceSlotsStaffingDto,
} from './dto';

type MockFn = jest.Mock;

interface MockTxClient {
  academicYear: { findUnique: MockFn };
  academicCalendarVersion: { findFirst: MockFn };
  schoolClass: { findUnique: MockFn };
  timeSlotDefinition: { findMany: MockFn };
  user: { findMany: MockFn };
  programmeMaster: {
    findUnique: MockFn;
    findFirst: MockFn;
    create: MockFn;
  };
  programmePlanVersion: {
    findUnique: MockFn;
    findFirst: MockFn;
    aggregate: MockFn;
    create: MockFn;
    updateMany: MockFn;
  };
  programmeTopicItem: {
    findUnique: MockFn;
    findMany: MockFn;
    count: MockFn;
    createMany: MockFn;
    deleteMany: MockFn;
  };
  plannedProgrammeOccurrence: {
    findUnique: MockFn;
    findFirst: MockFn;
    create: MockFn;
    updateMany: MockFn;
  };
  plannedOccurrenceSlot: {
    findMany: MockFn;
    create: MockFn;
    deleteMany: MockFn;
  };
  plannedSlotStaffing: {
    findMany: MockFn;
    createMany: MockFn;
    deleteMany: MockFn;
  };
  programmePlanningCommand: {
    findUnique: MockFn;
    create: MockFn;
  };
}

interface MockPrismaClient {
  $transaction: MockFn;
  programmeMaster: MockTxClient['programmeMaster'];
  programmePlanVersion: MockTxClient['programmePlanVersion'];
  programmeTopicItem: MockTxClient['programmeTopicItem'];
  plannedProgrammeOccurrence: MockTxClient['plannedProgrammeOccurrence'];
  plannedOccurrenceSlot: MockTxClient['plannedOccurrenceSlot'];
  plannedSlotStaffing: MockTxClient['plannedSlotStaffing'];
  programmePlanningCommand: MockTxClient['programmePlanningCommand'];
}

describe('ProgrammePlanningService', () => {
  let service: ProgrammePlanningService;
  let mockPrisma: MockPrismaClient;
  let mockAudit: AuditService;
  let mockTx: MockTxClient;
  let planVersionStore: Map<string, Record<string, unknown>>;
  let occurrenceStore: Map<string, Record<string, unknown>>;

  const actorUserId = '11111111-1111-1111-1111-111111111111';
  const academicYearId = '22222222-2222-2222-2222-222222222222';
  const gddpMasterId = '33333333-3333-3333-3333-333333333333';
  const hdtnMasterId = '44444444-4444-4444-4444-444444444444';
  const planVersionId = '55555555-5555-5555-5555-555555555555';
  const topicId = '66666666-6666-6666-6666-666666666666';
  const classGrade10Id = '77777777-7777-7777-7777-777777777777';
  const classGrade10BId = '77777777-7777-7777-7777-777777777779';
  const classGrade11Id = '77777777-7777-7777-7777-777777777778';
  const timeSlotMon1Id = '88888888-8888-8888-8888-888888888881';
  const timeSlotMon2Id = '88888888-8888-8888-8888-888888888882';
  const timeSlotTue1Id = '88888888-8888-8888-8888-888888888883';
  const teacherAId = '99999999-9999-9999-9999-999999999991';
  const teacherBId = '99999999-9999-9999-9999-999999999992';

  beforeEach(() => {
    planVersionStore = new Map<string, Record<string, unknown>>();
    planVersionStore.set(planVersionId, {
      id: planVersionId,
      programmeMasterId: gddpMasterId,
      versionNumber: 1,
      status: 'PUBLISHED',
      draftRevision: 1,
      predecessorVersionId: null,
      changeReason: null,
      createdByUserId: actorUserId,
      publishedByUserId: actorUserId,
      publishedAt: new Date(),
      supersededByUserId: null,
      supersededAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    occurrenceStore = new Map<string, Record<string, unknown>>();
    occurrenceStore.set('occ-draft-1', {
      id: 'occ-draft-1',
      programmeMasterId: gddpMasterId,
      programmePlanVersionId: planVersionId,
      programmeTopicItemId: topicId,
      academicYearId,
      civilDate: new Date('2026-10-05T00:00:00.000Z'),
      mode: 'CLASS',
      gradeLevel: null,
      schoolClassId: classGrade10Id,
      status: 'DRAFT',
      draftRevision: 1,
      note: null,
      replacesOccurrenceId: null,
      changeReason: null,
      createdByUserId: actorUserId,
      publishedByUserId: null,
      publishedAt: null,
      supersededByUserId: null,
      supersededAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    occurrenceStore.set('occ-published-1', {
      id: 'occ-published-1',
      programmeMasterId: gddpMasterId,
      programmePlanVersionId: planVersionId,
      programmeTopicItemId: topicId,
      academicYearId,
      civilDate: new Date('2026-10-05T00:00:00.000Z'),
      mode: 'CLASS',
      gradeLevel: null,
      schoolClassId: classGrade10Id,
      status: 'PUBLISHED',
      draftRevision: 1,
      note: null,
      replacesOccurrenceId: null,
      changeReason: null,
      createdByUserId: actorUserId,
      publishedByUserId: actorUserId,
      publishedAt: new Date(),
      supersededByUserId: null,
      supersededAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockTx = {
      academicYear: {
        findUnique: jest.fn().mockResolvedValue({ id: academicYearId }),
      },
      academicCalendarVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cal-1',
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2027-05-31T00:00:00.000Z'),
        }),
      },
      schoolClass: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === classGrade10Id) {
            return Promise.resolve({ id: classGrade10Id, academicYearId, gradeLevel: 10 });
          }
          if (where.id === classGrade10BId) {
            return Promise.resolve({ id: classGrade10BId, academicYearId, gradeLevel: 10 });
          }
          if (where.id === classGrade11Id) {
            return Promise.resolve({ id: classGrade11Id, academicYearId, gradeLevel: 11 });
          }
          return Promise.resolve(null);
        }),
      },
      timeSlotDefinition: {
        findMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) => {
          const ids: string[] = where.id.in;
          return Promise.resolve(
            ids.map((id) => {
              const isTue = id === timeSlotTue1Id;
              return {
                id,
                academicYearId,
                weekday: isTue ? 'TUESDAY' : 'MONDAY',
                session: 'MORNING',
                ordinal: 1,
                displayLabel: 'Tiết 1',
                isActive: true,
              };
            }),
          );
        }),
      },
      user: {
        findMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) => {
          const ids: string[] = where.id.in;
          return Promise.resolve(
            ids.map((id) => ({
              id,
              username: `teacher.${id.slice(-1)}`,
              status: 'ACTIVE',
              profile: { isTeachingStaff: true, displayName: 'Thầy Giáo' },
            })),
          );
        }),
      },
      programmeMaster: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === gddpMasterId) {
            return Promise.resolve({
              id: gddpMasterId,
              academicYearId,
              kind: 'GDDP',
              gradeLevel: 10,
              createdByUserId: actorUserId,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          if (where.id === hdtnMasterId) {
            return Promise.resolve({
              id: hdtnMasterId,
              academicYearId,
              kind: 'HDTN_HN',
              gradeLevel: null,
              createdByUserId: actorUserId,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          return Promise.resolve(null);
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'master-created-id',
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
      },
      programmePlanVersion: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (planVersionStore.has(where.id)) {
            return Promise.resolve(planVersionStore.get(where.id));
          }
          return Promise.resolve(null);
        }),
        findFirst: jest.fn().mockImplementation(({ where }: { where?: { programmeMasterId?: string; status?: string } } = {}) => {
          if (!where) return Promise.resolve(null);
          for (const item of planVersionStore.values()) {
            if (where.programmeMasterId && item.programmeMasterId !== where.programmeMasterId) continue;
            if (where.status && item.status !== where.status) continue;
            return Promise.resolve(item);
          }
          return Promise.resolve(null);
        }),
        aggregate: jest.fn().mockResolvedValue({ _max: { versionNumber: 0 } }),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const item = {
            id: (data.id as string | undefined) ?? `plan-${Math.random()}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          planVersionStore.set(item.id, item);
          return Promise.resolve(item);
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          if (planVersionStore.has(where.id)) {
            const current = planVersionStore.get(where.id);
            Object.assign(current ?? {}, data);
          }
          return Promise.resolve({ count: 1 });
        }),
      },
      programmeTopicItem: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === topicId) {
            return Promise.resolve({
              id: topicId,
              programmePlanVersionId: planVersionId,
              sequence: 1,
              title: 'Chủ đề 1',
              requiredPeriods: 2,
              guidelineWeekFrom: 1,
              guidelineWeekTo: 2,
              guidelineSegmentLabel: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: topicId,
            programmePlanVersionId: planVersionId,
            sequence: 1,
            title: 'Chủ đề 1',
            requiredPeriods: 2,
            guidelineWeekFrom: 1,
            guidelineWeekTo: 2,
            guidelineSegmentLabel: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      plannedProgrammeOccurrence: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (occurrenceStore.has(where.id)) {
            return Promise.resolve(occurrenceStore.get(where.id));
          }
          return Promise.resolve(null);
        }),
        findFirst: jest.fn().mockImplementation(({ where }: { where: { replacesOccurrenceId?: string } }) => {
          for (const item of occurrenceStore.values()) {
            if (where.replacesOccurrenceId && item.replacesOccurrenceId === where.replacesOccurrenceId) {
              return Promise.resolve(item);
            }
          }
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const item = {
            id: (data.id as string | undefined) ?? `occ-${Math.random()}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          occurrenceStore.set(item.id, item);
          return Promise.resolve(item);
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          if (occurrenceStore.has(where.id)) {
            const current = occurrenceStore.get(where.id);
            Object.assign(current ?? {}, data);
          }
          return Promise.resolve({ count: 1 });
        }),
      },
      plannedOccurrenceSlot: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'slot-1',
            plannedProgrammeOccurrenceId: 'occ-draft-1',
            academicYearId,
            timeSlotDefinitionId: timeSlotMon1Id,
            createdAt: new Date(),
          },
        ]),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'slot-created-id',
            ...data,
            createdAt: new Date(),
          }),
        ),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      plannedSlotStaffing: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'staff-1',
            plannedOccurrenceSlotId: 'slot-1',
            teacherUserId: teacherAId,
            createdAt: new Date(),
          },
        ]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      programmePlanningCommand: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'cmd-id' }),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (arg: (tx: MockTxClient) => Promise<unknown>) => {
        if (typeof arg === 'function') {
          return arg(mockTx);
        }
        return Promise.all(arg as unknown as Array<Promise<unknown>>);
      }),
      programmeMaster: mockTx.programmeMaster,
      programmePlanVersion: mockTx.programmePlanVersion,
      programmeTopicItem: mockTx.programmeTopicItem,
      plannedProgrammeOccurrence: mockTx.plannedProgrammeOccurrence,
      plannedOccurrenceSlot: mockTx.plannedOccurrenceSlot,
      plannedSlotStaffing: mockTx.plannedSlotStaffing,
      programmePlanningCommand: mockTx.programmePlanningCommand,
    };

    mockAudit = {
      write: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    service = new ProgrammePlanningService(
      mockPrisma as unknown as PrismaService,
      mockAudit,
    );
  });

  // =========================================================================
  // 1 & 2: GDDP & HDTN MASTER RULES
  // =========================================================================
  describe('Programme Master Rules', () => {
    it('1. GDDP master requires grade 10, 11, or 12', async () => {
      const dto10: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 10,
        commandId: 'cmd-gddp-10',
      };
      const res = await service.createMaster(dto10, actorUserId);
      expect(res.kind).toBe('GDDP');
      expect(res.gradeLevel).toBe(10);

      const dtoNoGrade: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'GDDP',
        commandId: 'cmd-gddp-no-grade',
      };
      await expect(service.createMaster(dtoNoGrade, actorUserId)).rejects.toThrow(BadRequestException);

      const dtoGrade9: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 9,
        commandId: 'cmd-gddp-9',
      };
      await expect(service.createMaster(dtoGrade9, actorUserId)).rejects.toThrow(BadRequestException);

      const dtoGrade13: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 13,
        commandId: 'cmd-gddp-13',
      };
      await expect(service.createMaster(dtoGrade13, actorUserId)).rejects.toThrow(BadRequestException);
    });

    it('2. HDTN_HN master does not carry grade authority at master level', async () => {
      const dtoValid: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'HDTN_HN',
        commandId: 'cmd-hdtn-valid',
      };
      const res = await service.createMaster(dtoValid, actorUserId);
      expect(res.kind).toBe('HDTN_HN');
      expect(res.gradeLevel).toBeNull();

      const dtoWithGrade: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'HDTN_HN',
        gradeLevel: 10,
        commandId: 'cmd-hdtn-with-grade',
      };
      await expect(service.createMaster(dtoWithGrade, actorUserId)).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate master when natural identity already exists', async () => {
      mockTx.programmeMaster.findFirst.mockResolvedValueOnce({ id: 'existing-master' });
      const dto: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 10,
        commandId: 'cmd-gddp-dup',
      };
      await expect(service.createMaster(dto, actorUserId)).rejects.toThrow(ConflictException);
    });
  });

  // =========================================================================
  // 3, 4, 5, 8: PLAN VERSION LIFECYCLE & IMMUTABILITY
  // =========================================================================
  describe('Programme Plan Version Lifecycle', () => {
    it('creates initial DRAFT with monotonic version number and topic items', async () => {
      planVersionStore.clear();
      const dto: CreateDraftPlanVersionDto = {
        programmeMasterId: gddpMasterId,
        commandId: 'cmd-plan-draft-1',
        initialTopics: [
          { sequence: 1, title: 'GDDP Topic 1', requiredPeriods: 2 },
          { sequence: 2, title: 'GDDP Topic 2', requiredPeriods: 1 },
        ],
      };
      const res = await service.createDraftPlanVersion(dto, actorUserId);
      expect(res.versionNumber).toBe(1);
      expect(res.status).toBe('DRAFT');
      expect(mockTx.programmeTopicItem.createMany).toHaveBeenCalled();
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PROGRAMME_PLAN_VERSION_DRAFT_CREATED' }),
        expect.anything(),
      );
    });

    it('rejects creating initial DRAFT if a DRAFT already exists for the master', async () => {
      planVersionStore.clear();
      planVersionStore.set('existing-draft', {
        id: 'existing-draft',
        programmeMasterId: gddpMasterId,
        status: 'DRAFT',
      });
      const dto: CreateDraftPlanVersionDto = {
        programmeMasterId: gddpMasterId,
        commandId: 'cmd-plan-draft-conflict',
      };
      await expect(service.createDraftPlanVersion(dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('Test A — generic draft cannot follow published history', async () => {
      planVersionStore.set(planVersionId, {
        id: planVersionId,
        programmeMasterId: gddpMasterId,
        versionNumber: 1,
        status: 'PUBLISHED',
        draftRevision: 1,
      });

      const dto: CreateDraftPlanVersionDto = {
        programmeMasterId: gddpMasterId,
        commandId: 'cmd-generic-draft-after-published',
      };
      await expect(service.createDraftPlanVersion(dto, actorUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('3. plan DRAFT optimistic concurrency: rejects edit if expectedRevision mismatches', async () => {
      planVersionStore.set('draft-plan-id', {
        id: 'draft-plan-id',
        programmeMasterId: gddpMasterId,
        status: 'DRAFT',
        draftRevision: 2,
      });

      const dto: EditDraftPlanVersionDto = {
        expectedRevision: 1,
        commandId: 'cmd-edit-draft-stale',
      };
      await expect(service.editDraftPlanVersion('draft-plan-id', dto, actorUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('4. published plan immutable: rejects edit on PUBLISHED plan', async () => {
      planVersionStore.set(planVersionId, {
        id: planVersionId,
        programmeMasterId: gddpMasterId,
        status: 'PUBLISHED',
        draftRevision: 1,
      });

      const dto: EditDraftPlanVersionDto = {
        expectedRevision: 1,
        commandId: 'cmd-edit-published',
      };
      await expect(service.editDraftPlanVersion(planVersionId, dto, actorUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('5. topic edits blocked after publish', async () => {
      planVersionStore.set(planVersionId, {
        id: planVersionId,
        programmeMasterId: gddpMasterId,
        status: 'PUBLISHED',
        draftRevision: 1,
      });

      const dto: EditDraftPlanVersionDto = {
        expectedRevision: 1,
        commandId: 'cmd-edit-topics-published',
        topics: [{ sequence: 1, title: 'Modified', requiredPeriods: 3 }],
      };
      await expect(service.editDraftPlanVersion(planVersionId, dto, actorUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('8. publish retains predecessor/supersession correctly', async () => {
      planVersionStore.clear();
      const draftId = 'draft-v2-id';
      const existingPublishedId = 'published-v1-id';

      planVersionStore.set(draftId, {
        id: draftId,
        programmeMasterId: gddpMasterId,
        versionNumber: 2,
        status: 'DRAFT',
        draftRevision: 1,
        predecessorVersionId: existingPublishedId,
        createdByUserId: actorUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      planVersionStore.set(existingPublishedId, {
        id: existingPublishedId,
        programmeMasterId: gddpMasterId,
        versionNumber: 1,
        status: 'PUBLISHED',
        createdByUserId: actorUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockTx.programmeTopicItem.count.mockResolvedValueOnce(2);

      const dto: PublishPlanVersionDto = {
        expectedRevision: 1,
        commandId: 'cmd-publish-v2',
      };
      await service.publishPlanVersion(draftId, dto, actorUserId);

      expect(mockTx.programmePlanVersion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existingPublishedId, status: 'PUBLISHED' },
          data: expect.objectContaining({
            status: 'SUPERSEDED',
            supersededByUserId: actorUserId,
          }),
        }),
      );

      expect(mockTx.programmePlanVersion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: draftId, status: 'DRAFT', draftRevision: 1 },
          data: expect.objectContaining({
            status: 'PUBLISHED',
            publishedByUserId: actorUserId,
          }),
        }),
      );

      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROGRAMME_PLAN_VERSION_PUBLISHED',
          metadata: expect.objectContaining({ supersededVersionId: existingPublishedId }),
        }),
        expect.anything(),
      );
    });

    it('Test B — successor path remains valid: creates successor draft and publishes with supersession', async () => {
      planVersionStore.set(planVersionId, {
        id: planVersionId,
        programmeMasterId: gddpMasterId,
        versionNumber: 1,
        status: 'PUBLISHED',
        draftRevision: 1,
      });

      const dto: CreateSuccessorDraftPlanVersionDto = {
        programmeMasterId: gddpMasterId,
        predecessorVersionId: planVersionId,
        changeReason: 'Cập nhật phân phối số tiết',
        commandId: 'cmd-succ-valid',
      };
      const v2 = await service.createSuccessorDraftPlanVersion(dto, actorUserId);
      expect(v2.status).toBe('DRAFT');
      expect(v2.predecessorVersionId).toBe(planVersionId);

      mockTx.programmeTopicItem.count.mockResolvedValueOnce(1);
      const pubDto: PublishPlanVersionDto = {
        expectedRevision: 1,
        commandId: 'cmd-publish-succ-v2',
      };
      const publishedV2 = await service.publishPlanVersion(v2.id, pubDto, actorUserId);
      expect(publishedV2.status).toBe('PUBLISHED');

      const v1 = planVersionStore.get(planVersionId);
      expect(v1?.status).toBe('SUPERSEDED');
    });

    it('Test C — publish rejects lineage mismatch when predecessor does not match current published plan', async () => {
      planVersionStore.set(planVersionId, {
        id: planVersionId,
        programmeMasterId: gddpMasterId,
        versionNumber: 1,
        status: 'PUBLISHED',
      });

      const draftId = 'draft-unlineaged-id';
      planVersionStore.set(draftId, {
        id: draftId,
        programmeMasterId: gddpMasterId,
        versionNumber: 2,
        status: 'DRAFT',
        draftRevision: 1,
        predecessorVersionId: null,
        createdByUserId: actorUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockTx.programmeTopicItem.count.mockResolvedValueOnce(1);

      const pubDto: PublishPlanVersionDto = {
        expectedRevision: 1,
        commandId: 'cmd-publish-mismatched-lineage',
      };
      await expect(service.publishPlanVersion(draftId, pubDto, actorUserId)).rejects.toThrow(
        ConflictException,
      );

      const v1 = planVersionStore.get(planVersionId);
      expect(v1?.status).toBe('PUBLISHED');
    });

    it('creates successor draft from published predecessor with changeReason', async () => {
      const dto: CreateSuccessorDraftPlanVersionDto = {
        programmeMasterId: gddpMasterId,
        predecessorVersionId: planVersionId,
        changeReason: 'Cập nhật phân phối số tiết theo chỉ đạo Sở GD&ĐT',
        commandId: 'cmd-successor-draft',
      };
      const res = await service.createSuccessorDraftPlanVersion(dto, actorUserId);
      expect(mockTx.programmePlanVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            predecessorVersionId: planVersionId,
            changeReason: 'Cập nhật phân phối số tiết theo chỉ đạo Sở GD&ĐT',
            status: 'DRAFT',
          }),
        }),
      );
      expect(res).toBeDefined();
    });

    it('rejects successor draft without changeReason', async () => {
      const dto: CreateSuccessorDraftPlanVersionDto = {
        programmeMasterId: gddpMasterId,
        predecessorVersionId: planVersionId,
        changeReason: '   ',
        commandId: 'cmd-successor-no-reason',
      };
      await expect(service.createSuccessorDraftPlanVersion(dto, actorUserId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // 9, 10, 11, 12, 13, 14, 15, 16: OCCURRENCE VALIDATION & RULES
  // =========================================================================
  describe('Planned Programme Occurrence Rules', () => {
    const validOccurrenceDto: CreateDraftOccurrenceDto = {
      programmeMasterId: gddpMasterId,
      programmePlanVersionId: planVersionId,
      programmeTopicItemId: topicId,
      academicYearId,
      civilDate: '2026-10-05',
      mode: 'CLASS',
      schoolClassId: classGrade10Id,
      slots: [
        {
          timeSlotDefinitionId: timeSlotMon1Id,
          teacherUserIds: [teacherAId, teacherBId],
        },
      ],
      commandId: 'cmd-occ-valid',
    };

    it('creates valid draft occurrence with exact slots and per-slot staffing', async () => {
      const res = await service.createDraftOccurrence(validOccurrenceDto, actorUserId);
      expect(res).toBeDefined();
      expect(mockTx.plannedProgrammeOccurrence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DRAFT',
            mode: 'CLASS',
            schoolClassId: classGrade10Id,
          }),
        }),
      );
      expect(mockTx.plannedOccurrenceSlot.create).toHaveBeenCalled();
      expect(mockTx.plannedSlotStaffing.createMany).toHaveBeenCalledWith({
        data: [
          { plannedOccurrenceSlotId: 'slot-created-id', teacherUserId: teacherAId },
          { plannedOccurrenceSlotId: 'slot-created-id', teacherUserId: teacherBId },
        ],
      });
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PLANNED_OCCURRENCE_DRAFT_CREATED' }),
        expect.anything(),
      );
    });

    it('9. occurrence mode shape: CLASS requires schoolClassId and gradeLevel null', async () => {
      const dtoBadClass: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        commandId: 'cmd-bad-class',
        schoolClassId: null,
      };
      await expect(service.createDraftOccurrence(dtoBadClass, actorUserId)).rejects.toThrow(
        BadRequestException,
      );

      const dtoClassWithGrade: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        commandId: 'cmd-bad-class-grade',
        gradeLevel: 10,
      };
      await expect(service.createDraftOccurrence(dtoClassWithGrade, actorUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('9. occurrence mode shape: GRADE requires gradeLevel 10..12 and schoolClassId null', async () => {
      const dtoValidGrade: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        mode: 'GRADE',
        gradeLevel: 10,
        schoolClassId: null,
        commandId: 'cmd-valid-grade',
      };
      const res = await service.createDraftOccurrence(dtoValidGrade, actorUserId);
      expect(res).toBeDefined();

      const dtoGradeWithClass: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        mode: 'GRADE',
        gradeLevel: 10,
        schoolClassId: classGrade10Id,
        commandId: 'cmd-grade-with-class',
      };
      await expect(service.createDraftOccurrence(dtoGradeWithClass, actorUserId)).rejects.toThrow(
        BadRequestException,
      );

      const dtoGradeInvalid: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        mode: 'GRADE',
        gradeLevel: 9,
        schoolClassId: null,
        commandId: 'cmd-grade-invalid',
      };
      await expect(service.createDraftOccurrence(dtoGradeInvalid, actorUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('9. occurrence mode shape: SCHOOL_WIDE requires both schoolClassId and gradeLevel null', async () => {
      const dtoSchoolWideWithClass: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        programmeMasterId: hdtnMasterId,
        mode: 'SCHOOL_WIDE',
        schoolClassId: classGrade10Id,
        gradeLevel: null,
        commandId: 'cmd-hdtn-schoolwide-bad',
      };
      await expect(service.createDraftOccurrence(dtoSchoolWideWithClass, actorUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('10. GDDP SCHOOL_WIDE rejected', async () => {
      const dtoGddpSchoolWide: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        programmeMasterId: gddpMasterId,
        mode: 'SCHOOL_WIDE',
        schoolClassId: null,
        gradeLevel: null,
        commandId: 'cmd-gddp-schoolwide',
      };
      await expect(service.createDraftOccurrence(dtoGddpSchoolWide, actorUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('11. GDDP target grade consistency: CLASS grade must match master grade', async () => {
      const dtoClassMismatch: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        schoolClassId: classGrade11Id,
        commandId: 'cmd-class-grade-mismatch',
      };
      await expect(service.createDraftOccurrence(dtoClassMismatch, actorUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('11. GDDP target grade consistency: GRADE target must match master grade', async () => {
      const dtoGradeMismatch: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        mode: 'GRADE',
        gradeLevel: 11,
        schoolClassId: null,
        commandId: 'cmd-grade-target-mismatch',
      };
      await expect(service.createDraftOccurrence(dtoGradeMismatch, actorUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('12. occurrence cannot use DRAFT plan authority', async () => {
      planVersionStore.set('draft-plan-id', {
        id: 'draft-plan-id',
        programmeMasterId: gddpMasterId,
        status: 'DRAFT',
      });
      const dto: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        programmePlanVersionId: 'draft-plan-id',
        commandId: 'cmd-occ-draft-plan',
      };
      await expect(service.createDraftOccurrence(dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('13. topic must belong to selected published version', async () => {
      mockTx.programmeTopicItem.findUnique.mockResolvedValueOnce({
        id: 'topic-other-version',
        programmePlanVersionId: 'different-plan-version-id',
      });
      const dto: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        programmeTopicItemId: 'topic-other-version',
        commandId: 'cmd-occ-topic-mismatch',
      };
      await expect(service.createDraftOccurrence(dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('14. slot/year mismatch rejected', async () => {
      mockTx.timeSlotDefinition.findMany.mockResolvedValueOnce([
        {
          id: timeSlotMon1Id,
          academicYearId: 'different-year-id',
          weekday: 'MONDAY',
          isActive: true,
        },
      ]);
      const dto: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        commandId: 'cmd-slot-year-mismatch',
      };
      await expect(service.createDraftOccurrence(dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('15. slot weekday/civilDate mismatch rejected', async () => {
      const dtoWeekdayMismatch: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        civilDate: '2026-10-05',
        slots: [
          {
            timeSlotDefinitionId: timeSlotTue1Id,
            teacherUserIds: [teacherAId],
          },
        ],
        commandId: 'cmd-weekday-mismatch',
      };
      await expect(service.createDraftOccurrence(dtoWeekdayMismatch, actorUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('16. exact staffing remains per-slot (Slot -> Set<Teacher>) without Cartesian flattening', async () => {
      const dtoMultipleSlots: CreateDraftOccurrenceDto = {
        ...validOccurrenceDto,
        slots: [
          {
            timeSlotDefinitionId: timeSlotMon1Id,
            teacherUserIds: [teacherAId],
          },
          {
            timeSlotDefinitionId: timeSlotMon2Id,
            teacherUserIds: [teacherBId],
          },
        ],
        commandId: 'cmd-exact-staffing-per-slot',
      };
      await service.createDraftOccurrence(dtoMultipleSlots, actorUserId);
      expect(mockTx.plannedOccurrenceSlot.create).toHaveBeenCalledTimes(2);
      expect(mockTx.plannedSlotStaffing.createMany).toHaveBeenCalledTimes(2);
    });

    it('partial edit preserves GRADE mode when updating gradeLevel without mode', async () => {
      const hdtnPlanVersionId = 'plan-hdtn-version-id';
      const hdtnTopicId = 'topic-hdtn-id';
      planVersionStore.set(hdtnPlanVersionId, {
        id: hdtnPlanVersionId,
        programmeMasterId: hdtnMasterId,
        versionNumber: 1,
        status: 'PUBLISHED',
      });
      mockTx.programmeTopicItem.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === hdtnTopicId) {
          return Promise.resolve({
            id: hdtnTopicId,
            programmePlanVersionId: hdtnPlanVersionId,
          });
        }
        if (where.id === topicId) {
          return Promise.resolve({
            id: topicId,
            programmePlanVersionId: planVersionId,
          });
        }
        return Promise.resolve(null);
      });

      const occId = 'occ-grade-draft-1';
      occurrenceStore.set(occId, {
        id: occId,
        programmeMasterId: hdtnMasterId,
        programmePlanVersionId: hdtnPlanVersionId,
        programmeTopicItemId: hdtnTopicId,
        academicYearId,
        civilDate: new Date('2026-10-05T00:00:00.000Z'),
        mode: 'GRADE',
        gradeLevel: 10,
        schoolClassId: null,
        status: 'DRAFT',
        draftRevision: 1,
        note: null,
        replacesOccurrenceId: null,
        changeReason: null,
        createdByUserId: actorUserId,
        publishedByUserId: null,
        publishedAt: null,
        supersededByUserId: null,
        supersededAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const editDto: EditDraftOccurrenceDto = {
        expectedRevision: 1,
        gradeLevel: 11,
        commandId: 'cmd-edit-grade-partial',
      };
      await service.editDraftOccurrence(occId, editDto, actorUserId);

      expect(mockTx.plannedProgrammeOccurrence.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: occId, status: 'DRAFT', draftRevision: 1 },
          data: expect.objectContaining({
            gradeLevel: 11,
          }),
        }),
      );
      const stored = occurrenceStore.get(occId);
      expect(stored?.gradeLevel).toBe(11);
      expect(stored?.mode).toBe('GRADE');
    });

    it('partial edit preserves CLASS mode when updating schoolClassId without mode', async () => {
      const occId = 'occ-class-draft-1';
      occurrenceStore.set(occId, {
        id: occId,
        programmeMasterId: gddpMasterId,
        programmePlanVersionId: planVersionId,
        programmeTopicItemId: topicId,
        academicYearId,
        civilDate: new Date('2026-10-05T00:00:00.000Z'),
        mode: 'CLASS',
        gradeLevel: null,
        schoolClassId: classGrade10Id,
        status: 'DRAFT',
        draftRevision: 1,
        note: null,
        replacesOccurrenceId: null,
        changeReason: null,
        createdByUserId: actorUserId,
        publishedByUserId: null,
        publishedAt: null,
        supersededByUserId: null,
        supersededAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const editDto: EditDraftOccurrenceDto = {
        expectedRevision: 1,
        schoolClassId: classGrade10BId,
        commandId: 'cmd-edit-class-partial',
      };
      await service.editDraftOccurrence(occId, editDto, actorUserId);

      expect(mockTx.plannedProgrammeOccurrence.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: occId, status: 'DRAFT', draftRevision: 1 },
          data: expect.objectContaining({
            schoolClassId: classGrade10BId,
          }),
        }),
      );
      const stored = occurrenceStore.get(occId);
      expect(stored?.schoolClassId).toBe(classGrade10BId);
      expect(stored?.mode).toBe('CLASS');
    });
  });

  // =========================================================================
  // 17, 18, 19: PUBLISHED OCCURRENCE IMMUTABILITY & REPLACEMENT
  // =========================================================================
  describe('Occurrence Immutability, Replacement & Supersession', () => {
    it('17. published occurrence cannot mutate in place', async () => {
      const dto: EditDraftOccurrenceDto = {
        expectedRevision: 1,
        note: 'Attempted in-place edit on published occurrence',
        commandId: 'cmd-edit-published-occ',
      };
      await expect(service.editDraftOccurrence('occ-published-1', dto, actorUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('18. replacement preserves retained lineage and supersedes predecessor upon publish', async () => {
      const replacementDto: CreateReplacementOccurrenceDto = {
        replacesOccurrenceId: 'occ-published-1',
        changeReason: 'Thay đổi thời khoá biểu theo kế hoạch thi giữa kì',
        civilDate: '2026-10-12',
        commandId: 'cmd-create-replacement-occ',
      };
      const rep = await service.createReplacementOccurrence('occ-published-1', replacementDto, actorUserId);
      expect(rep).toBeDefined();
      expect(rep.replacesOccurrenceId).toBe('occ-published-1');

      const publishDto: PublishOccurrenceDto = {
        expectedRevision: 1,
        commandId: 'cmd-publish-replacement',
      };
      await service.publishOccurrence(rep.id, publishDto, actorUserId);

      expect(mockTx.plannedProgrammeOccurrence.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'occ-published-1', status: 'PUBLISHED' },
          data: expect.objectContaining({
            status: 'SUPERSEDED',
            supersededByUserId: actorUserId,
          }),
        }),
      );

      expect(mockTx.plannedProgrammeOccurrence.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: rep.id, status: 'DRAFT', draftRevision: 1 },
          data: expect.objectContaining({
            status: 'PUBLISHED',
            publishedByUserId: actorUserId,
          }),
        }),
      );

      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PLANNED_OCCURRENCE_PUBLISHED',
          metadata: expect.objectContaining({ supersededOccurrenceId: 'occ-published-1' }),
        }),
        expect.anything(),
      );
    });

    it('19. child slot/staffing mutation rejected after publish', async () => {
      const replaceSlotsDto: ReplaceOccurrenceSlotsStaffingDto = {
        expectedRevision: 1,
        slots: [
          {
            timeSlotDefinitionId: timeSlotMon1Id,
            teacherUserIds: [teacherAId],
          },
        ],
        commandId: 'cmd-replace-slots-published',
      };
      await expect(
        service.replaceOccurrenceSlotsAndStaffing('occ-published-1', replaceSlotsDto, actorUserId),
      ).rejects.toThrow(ConflictException);
    });
  });

  // =========================================================================
  // 6, 7, 20, 21: IDEMPOTENCY, AUDIT ROLLBACK & CONCURRENCY CONFLICTS
  // =========================================================================
  describe('Idempotency, Audit Rollback & Concurrency Controls', () => {
    it('6. idempotent same command/same payload returns retained result without re-executing', async () => {
      const cachedResult = { outcome: 'RETAINED', masterId: 'cached-id' };
      const fingerprint = (service as unknown as { fingerprint(v: unknown): string }).fingerprint({
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 10,
        commandId: 'cmd-idempotent-1',
      });
      mockTx.programmePlanningCommand.findUnique.mockResolvedValueOnce({
        actorUserId,
        commandId: 'cmd-idempotent-1',
        commandType: 'CREATE_PROGRAMME_MASTER',
        fingerprint,
        result: cachedResult,
      });

      const dto: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 10,
        commandId: 'cmd-idempotent-1',
      };
      const res = await service.createMaster(dto, actorUserId);
      expect(res).toEqual(cachedResult);
      expect(mockTx.programmeMaster.create).not.toHaveBeenCalled();
    });

    it('7. same command/different payload throws ConflictException', async () => {
      mockTx.programmePlanningCommand.findUnique.mockResolvedValueOnce({
        actorUserId,
        commandId: 'cmd-conflict-1',
        commandType: 'CREATE_PROGRAMME_MASTER',
        fingerprint: 'different-fingerprint',
        result: { some: 'cached' },
      });

      const dto: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 10,
        commandId: 'cmd-conflict-1',
      };
      await expect(service.createMaster(dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('command type mismatch on replay throws ConflictException', async () => {
      const fingerprint = (service as unknown as { fingerprint(v: unknown): string }).fingerprint({
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 10,
        commandId: 'cmd-mismatch-type',
      });
      mockTx.programmePlanningCommand.findUnique.mockResolvedValueOnce({
        actorUserId,
        commandId: 'cmd-mismatch-type',
        commandType: 'DIFFERENT_COMMAND_TYPE',
        fingerprint,
        result: { some: 'cached' },
      });

      const dto: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 10,
        commandId: 'cmd-mismatch-type',
      };
      await expect(service.createMaster(dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('20. audit and command receipt rollback with failed transaction', async () => {
      mockPrisma.$transaction.mockImplementationOnce(async (fn: (tx: MockTxClient) => Promise<unknown>) => {
        await fn(mockTx);
      });

      mockTx.programmeMaster.create.mockRejectedValueOnce(new Error('Simulated DB failure'));

      const dto: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 10,
        commandId: 'cmd-rollback-test',
      };

      await expect(service.createMaster(dto, actorUserId)).rejects.toThrow();
      expect(mockTx.programmePlanningCommand.create).not.toHaveBeenCalled();
    });

    it('21. concurrent/race path (P2034, 40001, 40P01) returns deterministic conflict instead of raw error', async () => {
      const p2034Error = new Prisma.PrismaClientKnownRequestError(
        'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
        { code: 'P2034', clientVersion: '5' },
      );
      const deadlockError = new Prisma.PrismaClientUnknownRequestError(
        'PostgreSQL error 40P01: deadlock detected',
        { clientVersion: '5' },
      );

      mockPrisma.$transaction
        .mockRejectedValueOnce(p2034Error)
        .mockRejectedValueOnce(deadlockError)
        .mockRejectedValueOnce(deadlockError);

      const dto: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 10,
        commandId: 'cmd-race-exhausted',
      };

      await expect(service.createMaster(dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('retries on retryable race error and succeeds if next attempt passes', async () => {
      const p2034Error = new Prisma.PrismaClientKnownRequestError(
        'Transaction failed due to a write conflict or a deadlock',
        { code: 'P2034', clientVersion: '5' },
      );

      mockPrisma.$transaction
        .mockRejectedValueOnce(p2034Error)
        .mockImplementationOnce(async (fn: (tx: MockTxClient) => Promise<unknown>) => fn(mockTx));

      const dto: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 10,
        commandId: 'cmd-retry-success',
      };

      const res = await service.createMaster(dto, actorUserId);
      expect(res).toBeDefined();
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('translates database check_violation and unique_violation into deterministic ConflictException', async () => {
      const checkViolation = new Prisma.PrismaClientUnknownRequestError(
        'RAISE EXCEPTION \'GDDP occurrence cannot use SCHOOL_WIDE mode\' USING ERRCODE = \'23514\'',
        { clientVersion: '5' },
      );
      mockPrisma.$transaction.mockRejectedValueOnce(checkViolation);

      const dto: CreateProgrammeMasterDto = {
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 10,
        commandId: 'cmd-check-violation-test',
      };
      await expect(service.createMaster(dto, actorUserId)).rejects.toThrow(ConflictException);
    });
  });

  describe('weekdayForCivilDate utility', () => {
    it('correctly maps dates to AcademicWeekday', () => {
      expect(weekdayForCivilDate(new Date('2026-10-05T00:00:00.000Z'))).toBe('MONDAY');
      expect(weekdayForCivilDate(new Date('2026-10-06T00:00:00.000Z'))).toBe('TUESDAY');
      expect(weekdayForCivilDate(new Date('2026-10-07T00:00:00.000Z'))).toBe('WEDNESDAY');
      expect(weekdayForCivilDate(new Date('2026-10-08T00:00:00.000Z'))).toBe('THURSDAY');
      expect(weekdayForCivilDate(new Date('2026-10-09T00:00:00.000Z'))).toBe('FRIDAY');
      expect(weekdayForCivilDate(new Date('2026-10-10T00:00:00.000Z'))).toBe('SATURDAY');
      expect(weekdayForCivilDate(new Date('2026-10-11T00:00:00.000Z'))).toBe('SUNDAY');
    });
  });
});
