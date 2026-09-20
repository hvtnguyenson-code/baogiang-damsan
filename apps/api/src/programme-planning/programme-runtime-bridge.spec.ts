import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  ProgrammeKind,
  ProgrammeOccurrenceMode,
  ProgrammeOccurrenceStatus,
  SpecialActivityScope,
  SpecialActivityStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SpecialActivitiesService } from '../special-activities/special-activities.service';
import { ProgrammePlanningService } from './programme-planning.service';
import {
  AttestOccurrenceDto,
  MaterializeOccurrenceDto,
  ReplaceMaterializedSlotDto,
  ReverseAttestationDto,
} from './dto';

type MockEntity = Record<string, unknown>;
type MockPrismaClient = {
  $transaction: jest.Mock;
  programmeMaterializedActivity: unknown;
  programmeOccurrenceAttestation: unknown;
  specialActivity: { findMany: jest.Mock };
  [key: string]: unknown;
};
type MockSpecialActivitiesService = {
  createMaterializedRoot: jest.Mock;
  reverseMaterializedRoot: jest.Mock;
};

describe('ProgrammeRuntimeBridge (P4-040)', () => {
  let service: ProgrammePlanningService;
  let mockPrisma: MockPrismaClient;
  let mockAudit: AuditService;
  let mockSpecialActivities: MockSpecialActivitiesService;
  let mockTx: Record<string, Record<string, jest.Mock>>;

  const actorUserId = '11111111-1111-1111-1111-111111111111';
  const principalUserId = '11111111-1111-1111-1111-111111111112';
  const academicYearId = '22222222-2222-2222-2222-222222222222';
  const calendarVersionId = '22222222-2222-2222-2222-333333333333';
  const gddpMasterId = '33333333-3333-3333-3333-333333333333';
  const hdtnMasterId = '44444444-4444-4444-4444-444444444444';
  const planVersionId = '55555555-5555-5555-5555-555555555555';
  const topicId = '66666666-6666-6666-6666-666666666666';
  const schoolClassId = '77777777-7777-7777-7777-777777777777';
  const slot1Id = '88888888-8888-8888-8888-888888888881';
  const slot2Id = '88888888-8888-8888-8888-888888888882';
  const timeSlotDef1Id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  const timeSlotDef2Id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
  const teacher1Id = '99999999-9999-9999-9999-999999999991';
  const teacher2Id = '99999999-9999-9999-9999-999999999992';
  const replacementTeacherId = '99999999-9999-9999-9999-999999999993';
  const homeroomTeacherId = '99999999-9999-9999-9999-999999999994';
  const homeroomAssignmentId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  let occurrenceStore: Map<string, MockEntity>;
  let materializedStore: Map<string, MockEntity>;
  let attestationStore: Map<string, MockEntity>;
  let commandStore: Map<string, MockEntity>;
  let lastMasterId: string | null = null;

  beforeEach(() => {
    lastMasterId = null;
    occurrenceStore = new Map();
    materializedStore = new Map();
    attestationStore = new Map();
    commandStore = new Map();

    const occurrencePublished = {
      id: 'occ-pub-1',
      programmeMasterId: gddpMasterId,
      programmePlanVersionId: planVersionId,
      programmeTopicItemId: topicId,
      academicYearId,
      civilDate: new Date('2026-10-05T00:00:00.000Z'),
      mode: ProgrammeOccurrenceMode.GRADE,
      gradeLevel: 10,
      schoolClassId: null,
      status: ProgrammeOccurrenceStatus.PUBLISHED,
      draftRevision: 1,
      note: 'GDDP topic 1 execution',
      replacesOccurrenceId: null,
      changeReason: null,
      createdByUserId: actorUserId,
      publishedByUserId: actorUserId,
      publishedAt: new Date('2026-09-18T10:00:00.000Z'),
      supersededByUserId: null,
      supersededAt: null,
      createdAt: new Date('2026-09-18T09:00:00.000Z'),
      updatedAt: new Date('2026-09-18T10:00:00.000Z'),
    };
    occurrenceStore.set(occurrencePublished.id, occurrencePublished);

    const hdtnOccurrence = {
      id: 'occ-hdtn-class-1',
      programmeMasterId: hdtnMasterId,
      programmePlanVersionId: planVersionId,
      programmeTopicItemId: topicId,
      academicYearId,
      civilDate: new Date('2026-10-05T00:00:00.000Z'),
      mode: ProgrammeOccurrenceMode.CLASS,
      gradeLevel: null,
      schoolClassId,
      status: ProgrammeOccurrenceStatus.PUBLISHED,
      draftRevision: 1,
      note: 'HDTN class occurrence',
      replacesOccurrenceId: null,
      changeReason: null,
      createdByUserId: actorUserId,
      publishedByUserId: actorUserId,
      publishedAt: new Date('2026-09-18T10:00:00.000Z'),
      supersededByUserId: null,
      supersededAt: null,
      createdAt: new Date('2026-09-18T09:00:00.000Z'),
      updatedAt: new Date('2026-09-18T10:00:00.000Z'),
    };
    occurrenceStore.set(hdtnOccurrence.id, hdtnOccurrence);

    const occurrenceDraft = {
      ...occurrencePublished,
      id: 'occ-draft-1',
      status: ProgrammeOccurrenceStatus.DRAFT,
      publishedByUserId: null,
      publishedAt: null,
    };
    occurrenceStore.set(occurrenceDraft.id, occurrenceDraft);

    mockTx = {
      plannedProgrammeOccurrence: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }) => Promise.resolve(occurrenceStore.get(id) ?? null)),
      },
      programmeMaster: {
        findUniqueOrThrow: jest.fn().mockImplementation(({ where: { id } }) => {
          lastMasterId = id;
          if (id === gddpMasterId) {
            return Promise.resolve({ id, academicYearId, kind: ProgrammeKind.GDDP, gradeLevel: 10 });
          }
          if (id === hdtnMasterId) {
            return Promise.resolve({ id, academicYearId, kind: ProgrammeKind.HDTN_HN, gradeLevel: null });
          }
          return Promise.resolve({ id, academicYearId, kind: ProgrammeKind.GDDP, gradeLevel: 10 });
        }),
      },
      programmePlanVersion: {
        findUniqueOrThrow: jest.fn().mockImplementation(({ where: { id } }) => {
          return Promise.resolve({
            id,
            programmeMasterId: lastMasterId ?? gddpMasterId,
            status: 'PUBLISHED',
            publishedAt: new Date('2026-09-01T00:00:00.000Z'),
          });
        }),
      },
      programmeTopicItem: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: topicId,
          programmePlanVersionId: planVersionId,
          title: 'Tìm hiểu lịch sử và văn hóa địa phương',
        }),
      },
      academicCalendarVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: calendarVersionId,
          academicYearId,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-06-30T00:00:00.000Z'),
          isActive: true,
        }),
      },
      plannedOccurrenceSlot: {
        findMany: jest.fn().mockImplementation(({ where: { plannedProgrammeOccurrenceId } }) => {
          return Promise.resolve([
            { id: slot1Id, plannedProgrammeOccurrenceId, academicYearId, timeSlotDefinitionId: timeSlotDef1Id, createdAt: new Date('2026-09-18T09:10:00.000Z') },
            { id: slot2Id, plannedProgrammeOccurrenceId, academicYearId, timeSlotDefinitionId: timeSlotDef2Id, createdAt: new Date('2026-09-18T09:11:00.000Z') },
          ]);
        }),
        findUniqueOrThrow: jest.fn().mockImplementation(({ where: { id } }) => {
          return Promise.resolve({
            id,
            plannedProgrammeOccurrenceId: 'occ-pub-1',
            academicYearId,
            timeSlotDefinitionId: timeSlotDef1Id,
          });
        }),
      },
      plannedSlotStaffing: {
        findMany: jest.fn().mockImplementation(({ where: { plannedOccurrenceSlotId: { in: ids } } }) => {
          const result: MockEntity[] = [];
          if (ids.includes(slot1Id)) {
            result.push({ id: 'staff-1', plannedOccurrenceSlotId: slot1Id, teacherUserId: teacher1Id, createdAt: new Date() });
          }
          if (ids.includes(slot2Id)) {
            result.push({ id: 'staff-2', plannedOccurrenceSlotId: slot2Id, teacherUserId: teacher2Id, createdAt: new Date() });
          }
          return Promise.resolve(result);
        }),
      },
      homeroomAssignment: {
        findMany: jest.fn().mockImplementation(({ where }: { where: { status?: string; [k: string]: unknown } }) => {
          if (where.status === 'ACTIVE') {
            return Promise.resolve([
              {
                id: homeroomAssignmentId,
                academicYearId,
                schoolClassId,
                teacherUserId: homeroomTeacherId,
                validFrom: new Date('2026-09-01'),
                validUntil: null,
                status: 'ACTIVE',
                replacesId: null,
                reversedByUserId: null,
                reversedAt: null,
                reversalReason: null,
              },
            ]);
          }
          return Promise.resolve([
            {
              id: homeroomAssignmentId,
              academicYearId,
              schoolClassId,
              status: 'ACTIVE',
              replacesId: null,
              reversedByUserId: null,
              reversedAt: null,
              reversalReason: null,
            },
          ]);
        }),
      },
      user: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
          return Promise.resolve({
            id,
            status: 'ACTIVE',
            profile: { id: 'prof-' + id, isTeachingStaff: true },
          });
        }),
      },
      specialActivity: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
          return Promise.resolve({
            id,
            academicYearId,
            academicCalendarVersionId: calendarVersionId,
            civilDate: new Date('2026-10-05'),
            scope: SpecialActivityScope.GRADE,
            gradeLevel: 10,
            schoolClassId: null,
            status: SpecialActivityStatus.ACTIVE,
            note: 'Old note',
            updatedAt: new Date('2026-10-05T08:00:00.000Z'),
          });
        }),
      },
      programmeMaterializedActivity: {
        findMany: jest.fn().mockImplementation(({ where: { plannedProgrammeOccurrenceId } }) => {
          const list = Array.from(materializedStore.values()).filter(
            (m) => m.plannedProgrammeOccurrenceId === plannedProgrammeOccurrenceId,
          );
          return Promise.resolve(list);
        }),
        findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
          return Promise.resolve(materializedStore.get(id) ?? null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const row = { id: 'mat-' + Math.random().toString(36).slice(2), ...data, createdAt: new Date(), updatedAt: new Date(), materializedAt: new Date() };
          materializedStore.set(row.id, row);
          return Promise.resolve(row);
        }),
      },
      programmeOccurrenceAttestation: {
        findFirst: jest.fn().mockImplementation(({ where: { plannedProgrammeOccurrenceId, attestedByUserId, status } }) => {
          const match = Array.from(attestationStore.values()).find(
            (a) =>
              a.plannedProgrammeOccurrenceId === plannedProgrammeOccurrenceId &&
              (!attestedByUserId || a.attestedByUserId === attestedByUserId) &&
              (!status || a.status === status),
          );
          return Promise.resolve(match ?? null);
        }),
        findUnique: jest.fn().mockImplementation(({ where: { id } }) => Promise.resolve(attestationStore.get(id) ?? null)),
        findUniqueOrThrow: jest.fn().mockImplementation(({ where: { id } }) => {
          const row = attestationStore.get(id);
          if (!row) throw new Error('Not found');
          return Promise.resolve(row);
        }),
        findMany: jest.fn().mockImplementation(({ where: { plannedProgrammeOccurrenceId } }) => {
          const list = Array.from(attestationStore.values()).filter(
            (a) => a.plannedProgrammeOccurrenceId === plannedProgrammeOccurrenceId,
          );
          return Promise.resolve(list);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const row = { id: 'att-' + Math.random().toString(36).slice(2), ...data, createdAt: new Date(), updatedAt: new Date(), attestedAt: new Date() };
          attestationStore.set(row.id, row);
          return Promise.resolve(row);
        }),
        updateMany: jest.fn().mockImplementation(({ where: { id, status, updatedAt }, data }) => {
          const row = attestationStore.get(id);
          if (!row || row.status !== status) return Promise.resolve({ count: 0 });
          if (updatedAt && (row.updatedAt as Date).getTime() !== updatedAt.getTime()) return Promise.resolve({ count: 0 });
          Object.assign(row, data);
          return Promise.resolve({ count: 1 });
        }),
        count: jest.fn().mockImplementation(({ where: { plannedProgrammeOccurrenceId, status } }) => {
          const count = Array.from(attestationStore.values()).filter(
            (a) =>
              a.plannedProgrammeOccurrenceId === plannedProgrammeOccurrenceId &&
              (!status || a.status === status),
          ).length;
          return Promise.resolve(count);
        }),
      },
      programmePlanningCommand: {
        findUnique: jest.fn().mockImplementation(({ where: { actorUserId_commandId: { actorUserId, commandId } } }) => {
          return Promise.resolve(commandStore.get(`${actorUserId}:${commandId}`) ?? null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          commandStore.set(`${data.actorUserId}:${data.commandId}`, data);
          return Promise.resolve(data);
        }),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(mockTx)),
      programmeMaterializedActivity: mockTx.programmeMaterializedActivity,
      programmeOccurrenceAttestation: mockTx.programmeOccurrenceAttestation,
      specialActivity: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockAudit = {
      write: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    mockSpecialActivities = {
      createMaterializedRoot: jest.fn().mockImplementation((_tx, input) => {
        return Promise.resolve({
          id: 'sa-' + Math.random().toString(36).slice(2),
          academicYearId: input.academicYearId,
          academicCalendarVersionId: input.academicCalendarVersionId,
          civilDate: new Date(input.civilDate),
          scope: input.scope,
          gradeLevel: input.gradeLevel,
          schoolClassId: input.schoolClassId,
          title: input.title,
          note: input.note ?? null,
          replacesId: input.replacesId ?? null,
          status: SpecialActivityStatus.ACTIVE,
          createRequestKey: input.requestKey,
          createdByUserId: input.actorUserId,
          timeSlots: input.exactTimeSlotDefinitionIds.map((id: string) => ({ timeSlotDefinitionId: id })),
          staffing: input.scheduledTeacherUserIds.map((id: string) => ({ scheduledTeacherUserId: id })),
          classTargets: [],
        });
      }),
      reverseMaterializedRoot: jest.fn().mockImplementation((_tx, input) => {
        return Promise.resolve({
          id: input.id,
          status: SpecialActivityStatus.REVERSED,
          reversedByUserId: input.actorUserId,
          reversedAt: new Date(),
          reversalReason: input.reversalReason,
          reverseRequestKey: input.requestKey,
        });
      }),
    };

    service = new ProgrammePlanningService(
      mockPrisma as unknown as PrismaService,
      mockAudit,
      mockSpecialActivities as unknown as SpecialActivitiesService,
    );
  });

  // =========================================================================
  // 1. MATERIALIZATION TOPOLOGY & ELIGIBILITY (T12, T17, T31)
  // =========================================================================

  describe('Materialization Strategy & Invariants (T12, T17, T31)', () => {
    it('1. materializes published occurrence into exactly 1 SpecialActivity root per exact planned slot', async () => {
      const dto: MaterializeOccurrenceDto = { commandId: 'cmd-mat-001' };
      const records = await service.materializeOccurrence('occ-pub-1', dto, actorUserId);

      // Occurrence has 2 exact slots (slot1Id, slot2Id) -> must create exactly 2 roots
      expect(records).toHaveLength(2);
      expect(mockSpecialActivities.createMaterializedRoot).toHaveBeenCalledTimes(2);

      // Verify each slot materialized independently
      expect(records[0].plannedOccurrenceSlotId).toBe(slot1Id);
      expect(records[1].plannedOccurrenceSlotId).toBe(slot2Id);
      expect(records[0].specialActivityId).toBeDefined();
      expect(records[1].specialActivityId).toBeDefined();
      expect(records[0].specialActivityId).not.toBe(records[1].specialActivityId);

      // Verify exact staffing was preserved per slot without Cartesian multiplication
      const call1 = mockSpecialActivities.createMaterializedRoot.mock.calls[0][1];
      const call2 = mockSpecialActivities.createMaterializedRoot.mock.calls[1][1];
      expect(call1.exactTimeSlotDefinitionIds).toEqual([timeSlotDef1Id]);
      expect(call1.scheduledTeacherUserIds).toEqual([teacher1Id]);
      expect(call2.exactTimeSlotDefinitionIds).toEqual([timeSlotDef2Id]);
      expect(call2.scheduledTeacherUserIds).toEqual([teacher2Id]);
    });

    it('2. rejects materialization on DRAFT occurrence', async () => {
      const dto: MaterializeOccurrenceDto = { commandId: 'cmd-mat-draft' };
      await expect(service.materializeOccurrence('occ-draft-1', dto, actorUserId)).rejects.toThrow(ConflictException);
      expect(mockSpecialActivities.createMaterializedRoot).not.toHaveBeenCalled();
    });

    it('3. rejects materialization on already-materialized occurrence', async () => {
      materializedStore.set('existing-mat', {
        id: 'existing-mat',
        plannedProgrammeOccurrenceId: 'occ-pub-1',
      });
      const dto: MaterializeOccurrenceDto = { commandId: 'cmd-mat-duplicate' };
      await expect(service.materializeOccurrence('occ-pub-1', dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('4. rejects materialization when active academic calendar is missing', async () => {
      mockTx.academicCalendarVersion.findFirst.mockResolvedValueOnce(null);
      const dto: MaterializeOccurrenceDto = { commandId: 'cmd-mat-no-cal' };
      await expect(service.materializeOccurrence('occ-pub-1', dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('5. rejects materialization when civilDate is outside active calendar window', async () => {
      mockTx.academicCalendarVersion.findFirst.mockResolvedValueOnce({
        id: calendarVersionId,
        startDate: new Date('2026-11-01'),
        endDate: new Date('2027-05-31'),
        isActive: true,
      });
      const dto: MaterializeOccurrenceDto = { commandId: 'cmd-mat-date-out' };
      await expect(service.materializeOccurrence('occ-pub-1', dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('6. rejects materialization when occurrence has 0 planned slots', async () => {
      mockTx.plannedOccurrenceSlot.findMany.mockResolvedValueOnce([]);
      const dto: MaterializeOccurrenceDto = { commandId: 'cmd-mat-no-slots' };
      await expect(service.materializeOccurrence('occ-pub-1', dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('7. rejects materialization when any slot has no scheduled teachers', async () => {
      mockTx.plannedSlotStaffing.findMany.mockResolvedValueOnce([
        { id: 'staff-1', plannedOccurrenceSlotId: slot1Id, teacherUserId: teacher1Id },
        // slot2 has no staffing
      ]);
      const dto: MaterializeOccurrenceDto = { commandId: 'cmd-mat-empty-staff' };
      await expect(service.materializeOccurrence('occ-pub-1', dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('8. idempotently replays when same commandId and payload are submitted', async () => {
      const dto: MaterializeOccurrenceDto = { commandId: 'cmd-mat-idempotent' };
      const records1 = await service.materializeOccurrence('occ-pub-1', dto, actorUserId);
      const records2 = await service.materializeOccurrence('occ-pub-1', dto, actorUserId);
      expect(records2).toEqual(records1);
      // createMaterializedRoot only executed on the first attempt
      expect(mockSpecialActivities.createMaterializedRoot).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 2. HĐTN CLASS HOMEROOM RESOLUTION & FREEZE
  // =========================================================================

  describe('HĐTN CLASS Homeroom Resolution & Provenance Freeze', () => {
    it('9. resolves and freezes active GVCN provenance for HĐTN CLASS occurrence', async () => {
      const dto: MaterializeOccurrenceDto = { commandId: 'cmd-hdtn-class-ok' };
      const records = await service.materializeOccurrence('occ-hdtn-class-1', dto, actorUserId);

      expect(records).toHaveLength(2);
      expect(records[0].homeroomAssignmentId).toBe(homeroomAssignmentId);
      expect(records[0].homeroomTeacherUserId).toBe(homeroomTeacherId);
      expect(records[1].homeroomAssignmentId).toBe(homeroomAssignmentId);
      expect(records[1].homeroomTeacherUserId).toBe(homeroomTeacherId);
    });

    it('10. leaves homeroomAssignmentId and homeroomTeacherUserId null for GDDP', async () => {
      const dto: MaterializeOccurrenceDto = { commandId: 'cmd-gddp-no-gvcn' };
      const records = await service.materializeOccurrence('occ-pub-1', dto, actorUserId);

      expect(records[0].homeroomAssignmentId).toBeNull();
      expect(records[0].homeroomTeacherUserId).toBeNull();
    });

    it('11. fails closed when homeroom assignment is MISSING for HĐTN CLASS on civil date', async () => {
      mockTx.homeroomAssignment.findMany.mockResolvedValueOnce([]); // no active covering assignment
      const dto: MaterializeOccurrenceDto = { commandId: 'cmd-hdtn-missing-gvcn' };
      await expect(service.materializeOccurrence('occ-hdtn-class-1', dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('12. fails closed when homeroom assignment is AMBIGUOUS for HĐTN CLASS', async () => {
      mockTx.homeroomAssignment.findMany.mockImplementation(({ where }: { where: { status?: string; [k: string]: unknown } }) => {
        if (where.status === 'ACTIVE') {
          return Promise.resolve([
            { id: 'ha-1', teacherUserId: teacher1Id, status: 'ACTIVE' },
            { id: 'ha-2', teacherUserId: teacher2Id, status: 'ACTIVE' },
          ]);
        }
        return Promise.resolve([]);
      });
      const dto: MaterializeOccurrenceDto = { commandId: 'cmd-hdtn-ambiguous' };
      await expect(service.materializeOccurrence('occ-hdtn-class-1', dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('13. fails closed when assigned homeroom teacher is not active teaching staff', async () => {
      mockTx.user.findUnique.mockResolvedValueOnce({
        id: homeroomTeacherId,
        status: 'ACTIVE',
        profile: { isTeachingStaff: false }, // not teaching staff
      });
      const dto: MaterializeOccurrenceDto = { commandId: 'cmd-hdtn-nonteaching' };
      await expect(service.materializeOccurrence('occ-hdtn-class-1', dto, actorUserId)).rejects.toThrow(ConflictException);
    });
  });

  // =========================================================================
  // 3. POST-MATERIALIZATION CAS REPLACEMENT (T43)
  // =========================================================================

  describe('Post-Materialization CAS Replacement (T43)', () => {
    const existingMatId = 'mat-existing-slot-1';
    const oldSpecialActivityId = 'sa-old-root-1';
    const expectedUpdatedAt = '2026-10-05T08:00:00.000Z';

    beforeEach(() => {
      materializedStore.set(existingMatId, {
        id: existingMatId,
        programmeMasterId: gddpMasterId,
        programmePlanVersionId: planVersionId,
        programmeTopicItemId: topicId,
        plannedProgrammeOccurrenceId: 'occ-pub-1',
        plannedOccurrenceSlotId: slot1Id,
        specialActivityId: oldSpecialActivityId,
        homeroomAssignmentId: null,
        homeroomTeacherUserId: null,
        materializedByUserId: actorUserId,
        createdAt: new Date('2026-10-05T08:00:00.000Z'),
        updatedAt: new Date('2026-10-05T08:00:00.000Z'),
      });
    });

    it('14. replaces individual materialized slot root via CAS reversal and creates replacement root with replacesId', async () => {
      const dto: ReplaceMaterializedSlotDto = {
        commandId: 'cmd-rep-slot-1',
        expectedUpdatedAt,
        reversalReason: 'Giáo viên 1 bận đột xuất, thay bằng giáo viên 3',
        replacementTeacherUserIds: [replacementTeacherId],
        note: 'Replacement slot 1',
      };

      const record = await service.replaceMaterializedSlot(existingMatId, dto, actorUserId);

      // Verify old root was CAS reversed
      expect(mockSpecialActivities.reverseMaterializedRoot).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          id: oldSpecialActivityId,
          expectedUpdatedAt,
          reversalReason: dto.reversalReason,
        }),
      );

      // Verify replacement root was created with replacesId linking to old root
      expect(mockSpecialActivities.createMaterializedRoot).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          replacesId: oldSpecialActivityId,
          scheduledTeacherUserIds: [replacementTeacherId],
        }),
      );

      // Verify new ProgrammeMaterializedActivity links replacement root
      expect(record.specialActivityId).toBeDefined();
      expect(record.specialActivityId).not.toBe(oldSpecialActivityId);
      expect(record.plannedOccurrenceSlotId).toBe(slot1Id);
    });

    it('15. rejects replacement when replacementTeacherUserIds is empty', async () => {
      const dto: ReplaceMaterializedSlotDto = {
        commandId: 'cmd-rep-empty-teachers',
        expectedUpdatedAt,
        reversalReason: 'Reason',
        replacementTeacherUserIds: [],
      };
      await expect(service.replaceMaterializedSlot(existingMatId, dto, actorUserId)).rejects.toThrow(BadRequestException);
    });

    it('16. rejects replacement when target root is not ACTIVE', async () => {
      mockTx.specialActivity.findUnique.mockResolvedValueOnce({
        id: oldSpecialActivityId,
        status: SpecialActivityStatus.REVERSED, // already reversed
      });
      const dto: ReplaceMaterializedSlotDto = {
        commandId: 'cmd-rep-already-reversed',
        expectedUpdatedAt,
        reversalReason: 'Reason',
        replacementTeacherUserIds: [replacementTeacherId],
      };
      await expect(service.replaceMaterializedSlot(existingMatId, dto, actorUserId)).rejects.toThrow(ConflictException);
    });
  });

  // =========================================================================
  // 4. PROGRAMME OCCURRENCE ATTESTATION & EXISTENTIAL GATE (T44)
  // =========================================================================

  describe('Programme Occurrence Attestation & Gate (T44)', () => {
    const coordinatorDecision = {
      qualified: true,
      authorityType: 'COORDINATOR' as const,
      capabilityKey: 'GDDDP_COORDINATOR',
      scope: 'ACTIVITY',
      resourceId: gddpMasterId,
    };

    const principalDecision = {
      qualified: true,
      authorityType: 'BGH_PRINCIPAL' as const,
      capabilityKey: 'APPROVAL_PRINCIPAL',
      scope: 'SCHOOL_WIDE',
      resourceId: null,
    };

    it('17. creates ACTIVE attestation with frozen authority provenance', async () => {
      const dto: AttestOccurrenceDto = { commandId: 'cmd-attest-001' };
      const record = await service.attestOccurrence('occ-pub-1', dto, actorUserId, coordinatorDecision);

      expect(record.status).toBe('ACTIVE');
      expect(record.attestedByUserId).toBe(actorUserId);
      expect(record.authorityType).toBe('COORDINATOR');
      expect(record.capabilityKey).toBe('GDDDP_COORDINATOR');
      expect(record.scope).toBe('ACTIVITY');
      expect(record.scopeResourceId).toBe(gddpMasterId);
    });

    it('18. rejects duplicate ACTIVE attestation by the same actor on the same occurrence', async () => {
      attestationStore.set('att-1', {
        id: 'att-1',
        plannedProgrammeOccurrenceId: 'occ-pub-1',
        attestedByUserId: actorUserId,
        status: 'ACTIVE',
      });
      const dto: AttestOccurrenceDto = { commandId: 'cmd-attest-dup' };
      await expect(service.attestOccurrence('occ-pub-1', dto, actorUserId, coordinatorDecision)).rejects.toThrow(ConflictException);
    });

    it('19. allows multiple distinct actors to attest the same occurrence (e.g. coordinator AND principal)', async () => {
      attestationStore.set('att-coord', {
        id: 'att-coord',
        plannedProgrammeOccurrenceId: 'occ-pub-1',
        attestedByUserId: actorUserId,
        status: 'ACTIVE',
      });

      const dto: AttestOccurrenceDto = { commandId: 'cmd-attest-principal' };
      const record = await service.attestOccurrence('occ-pub-1', dto, principalUserId, principalDecision);

      expect(record.status).toBe('ACTIVE');
      expect(record.attestedByUserId).toBe(principalUserId);
      expect(record.authorityType).toBe('BGH_PRINCIPAL');

      // Both attestations are concurrently ACTIVE
      expect(attestationStore.size).toBe(2);
    });

    it('20. rejects attestation on DRAFT occurrence', async () => {
      const dto: AttestOccurrenceDto = { commandId: 'cmd-attest-draft' };
      await expect(service.attestOccurrence('occ-draft-1', dto, actorUserId, coordinatorDecision)).rejects.toThrow(ConflictException);
    });

    it('21. reverses active attestation with CAS timestamp and reversal reason', async () => {
      const attId = 'att-to-reverse';
      const expectedUpdatedAt = '2026-10-05T09:00:00.000Z';
      attestationStore.set(attId, {
        id: attId,
        plannedProgrammeOccurrenceId: 'occ-pub-1',
        attestedByUserId: actorUserId,
        authorityType: 'COORDINATOR',
        capabilityKey: 'GDDDP_COORDINATOR',
        scope: 'ACTIVITY',
        scopeResourceId: gddpMasterId,
        status: 'ACTIVE',
        attestedAt: new Date(expectedUpdatedAt),
        createdAt: new Date(expectedUpdatedAt),
        updatedAt: new Date(expectedUpdatedAt),
        reversedByUserId: null,
        reversedAt: null,
        reversalReason: null,
      });

      const dto: ReverseAttestationDto = {
        commandId: 'cmd-rev-attest',
        expectedUpdatedAt,
        reversalReason: 'Đảo ngược do phát hiện sai sót số tiết',
      };

      const record = await service.reverseAttestation(attId, dto, actorUserId);
      expect(record.status).toBe('REVERSED');
      expect(record.reversalReason).toBe(dto.reversalReason);
      expect(record.reversedByUserId).toBe(actorUserId);
      expect(record.reversedAt).toBeDefined();
    });

    it('22. rejects reversing non-ACTIVE attestation', async () => {
      const attId = 'att-already-rev';
      attestationStore.set(attId, {
        id: attId,
        plannedProgrammeOccurrenceId: 'occ-pub-1',
        status: 'REVERSED',
        updatedAt: new Date(),
      });
      const dto: ReverseAttestationDto = {
        commandId: 'cmd-rev-again',
        expectedUpdatedAt: new Date().toISOString(),
        reversalReason: 'Reason',
      };
      await expect(service.reverseAttestation(attId, dto, actorUserId)).rejects.toThrow(ConflictException);
    });

    it('23. evaluates Existential Confirmation Gate correctly (0 -> false, >=1 -> true, reversed -> false)', async () => {
      // 0 attestations -> false
      const listEmpty = await service.listOccurrenceAttestations('occ-pub-1');
      expect(listEmpty.hasQualifyingNonReversedAttestation).toBe(false);
      expect(listEmpty.activeAttestationCount).toBe(0);

      // Add 1 active attestation -> true
      attestationStore.set('att-1', {
        id: 'att-1',
        plannedProgrammeOccurrenceId: 'occ-pub-1',
        attestedByUserId: actorUserId,
        authorityType: 'COORDINATOR',
        capabilityKey: 'GDDDP_COORDINATOR',
        scope: 'ACTIVITY',
        scopeResourceId: gddpMasterId,
        status: 'ACTIVE',
        attestedAt: new Date(),
        reversedByUserId: null,
        reversedAt: null,
        reversalReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const listOne = await service.listOccurrenceAttestations('occ-pub-1');
      expect(listOne.hasQualifyingNonReversedAttestation).toBe(true);
      expect(listOne.activeAttestationCount).toBe(1);

      // Add second active attestation -> gate remains boolean true without multiplicative effect
      attestationStore.set('att-2', {
        id: 'att-2',
        plannedProgrammeOccurrenceId: 'occ-pub-1',
        attestedByUserId: principalUserId,
        authorityType: 'BGH_PRINCIPAL',
        capabilityKey: 'APPROVAL_PRINCIPAL',
        scope: 'SCHOOL_WIDE',
        scopeResourceId: null,
        status: 'ACTIVE',
        attestedAt: new Date(),
        reversedByUserId: null,
        reversedAt: null,
        reversalReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const listTwo = await service.listOccurrenceAttestations('occ-pub-1');
      expect(listTwo.hasQualifyingNonReversedAttestation).toBe(true);
      expect(listTwo.activeAttestationCount).toBe(2);

      // When both are reversed -> gate returns false
      attestationStore.get('att-1')!.status = 'REVERSED';
      attestationStore.get('att-2')!.status = 'REVERSED';
      const listReversed = await service.listOccurrenceAttestations('occ-pub-1');
      expect(listReversed.hasQualifyingNonReversedAttestation).toBe(false);
      expect(listReversed.activeAttestationCount).toBe(0);
    });
  });
});
