import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AuditResult } from '@prisma/client';
import { AuditService } from '../../src/audit/audit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SpecialActivitiesService } from '../../src/special-activities/special-activities.service';
import {
  HdtnImportAuthorityEvidence,
  HdtnImportBootstrapContext,
  ProgrammePlanningService,
  ResolvedHdtnDraftPackage,
} from '../../src/programme-planning/programme-planning.service';

describe('ProgrammePlanningService.importHdtnDraftPackage', () => {
  const actorUserId = 'actor-user-1';
  const academicYearId = 'year-uuid-1';
  const commandId = 'cmd-hdtn-import-1';

  let mockPrisma: Record<string, unknown>;
  let mockTx: Record<string, Record<string, jest.Mock>>;
  let mockAudit: { write: jest.Mock };
  let mockSpecialActivities: { createMaterializedRoot: jest.Mock; reverseMaterializedRoot: jest.Mock };
  let service: ProgrammePlanningService;

  const validEvidence: HdtnImportAuthorityEvidence = {
    academicYearId,
    calendarVersionId: 'cal-v1',
    academicWeekIds: ['week-1'],
    academicWeekSegmentIds: ['seg-1'],
    segmentDateRanges: [{ segmentId: 'seg-1', startDate: '2026-09-07', endDate: '2026-09-12' }],
    targetClassIds: ['class-10a', 'class-10b'],
    timetableVersionIds: ['tkb-v1'],
    timeSlotDefinitionIds: ['slot-m1', 'slot-m2'],
    explicitTeacherUserIds: ['teacher-a'],
    homeroomAssignments: [
      { civilDate: '2026-09-07', schoolClassId: 'class-10a', homeroomAssignmentId: 'hr-10a', teacherUserId: 'gvcn-10a' },
      { civilDate: '2026-09-07', schoolClassId: 'class-10b', homeroomAssignmentId: 'hr-10b', teacherUserId: 'gvcn-10b' },
    ],
    markerTuples: [
      { timetableVersionId: 'tkb-v1', schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN', civilDate: '2026-09-07' },
      { timetableVersionId: 'tkb-v1', schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN', civilDate: '2026-09-07' },
    ],
  };

  const validPackage: ResolvedHdtnDraftPackage = {
    academicYearId,
    previewFingerprint: 'fingerprint-abc-123',
    topics: [
      { sequence: 1, title: 'Chủ đề 1: Tự hào truyền thống nhà trường', requiredPeriods: 1, guidelineWeekFrom: 1, guidelineWeekTo: 1 },
    ],
    occurrences: [
      {
        topicSequence: 1,
        civilDate: '2026-09-07',
        mode: 'CLASS',
        gradeLevel: null,
        schoolClassId: 'class-10a',
        slots: [{ timeSlotDefinitionId: 'slot-m1', teacherUserIds: ['gvcn-10a'] }],
      },
      {
        topicSequence: 1,
        civilDate: '2026-09-07',
        mode: 'CLASS',
        gradeLevel: null,
        schoolClassId: 'class-10b',
        slots: [{ timeSlotDefinitionId: 'slot-m2', teacherUserIds: ['gvcn-10b'] }],
      },
    ],
  };

  const bghBootstrapContext: HdtnImportBootstrapContext = {
    expectedProgrammeMasterId: null,
    canBootstrapMaster: true,
  };

  const coordinatorContext: HdtnImportBootstrapContext = {
    expectedProgrammeMasterId: 'master-hdtn-1',
    canBootstrapMaster: false,
  };

  beforeEach(() => {
    const commandsStore = new Map<string, { commandType: string; fingerprint: string; result: unknown }>();

    mockTx = {
      academicYear: {
        findUnique: jest.fn().mockResolvedValue({ id: academicYearId }),
      },
      schoolClass: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'class-10a', academicYearId, code: '10A', status: 'ACTIVE', gradeLevel: 10 },
          { id: 'class-10b', academicYearId, code: '10B', status: 'ACTIVE', gradeLevel: 10 },
        ]),
        findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
          if (where.id === 'class-10a') return { id: 'class-10a', academicYearId, code: '10A', status: 'ACTIVE', gradeLevel: 10 };
          if (where.id === 'class-10b') return { id: 'class-10b', academicYearId, code: '10B', status: 'ACTIVE', gradeLevel: 10 };
          return null;
        }),
      },
      timetableVersion: {
        findMany: jest.fn().mockResolvedValue([{ id: 'tkb-v1', academicYearId, status: 'ACTIVE' }]),
      },
      timeSlotDefinition: {
        findMany: jest.fn().mockImplementation(async ({ where }: { where?: { id?: { in?: string[] } } }) => {
          const all = [
            { id: 'slot-m1', academicYearId, weekday: 'MONDAY', ordinal: 1, isActive: true },
            { id: 'slot-m2', academicYearId, weekday: 'MONDAY', ordinal: 2, isActive: true },
          ];
          if (where?.id?.in && Array.isArray(where.id.in)) {
            const inList = where.id.in;
            return all.filter((s) => inList.includes(s.id));
          }
          return all;
        }),
      },
      timetableSpecialProgrammeMarker: {
        findMany: jest.fn().mockResolvedValue([
          { timetableVersionId: 'tkb-v1', schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
          { timetableVersionId: 'tkb-v1', schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN' },
        ]),
      },
      homeroomAssignment: {
        findMany: jest.fn().mockImplementation(async ({ where }: { where: { schoolClassId: string } }) => {
          if (where.schoolClassId === 'class-10a') {
            return [{
              id: 'hr-10a',
              academicYearId: 'ay-2026-2027',
              schoolClassId: 'class-10a',
              teacherUserId: 'gvcn-10a',
              status: 'ACTIVE',
              validFrom: new Date('2026-09-01'),
              validUntil: null,
              replacesId: null,
              reversedByUserId: null,
              reversedAt: null,
              reversalReason: null,
            }];
          }
          if (where.schoolClassId === 'class-10b') {
            return [{
              id: 'hr-10b',
              academicYearId: 'ay-2026-2027',
              schoolClassId: 'class-10b',
              teacherUserId: 'gvcn-10b',
              status: 'ACTIVE',
              validFrom: new Date('2026-09-01'),
              validUntil: null,
              replacesId: null,
              reversedByUserId: null,
              reversedAt: null,
              reversalReason: null,
            }];
          }
          return [];
        }),
      },
      user: {
        findMany: jest.fn().mockImplementation(async ({ where }: { where?: { id?: { in?: string[] } } }) => {
          const all = [
            { id: 'teacher-a', username: 'teachera', status: 'ACTIVE', profile: { isTeachingStaff: true } },
            { id: 'gvcn-10a', username: 'gvcn10a', status: 'ACTIVE', profile: { isTeachingStaff: true } },
            { id: 'gvcn-10b', username: 'gvcn10b', status: 'ACTIVE', profile: { isTeachingStaff: true } },
          ];
          if (where?.id?.in && Array.isArray(where.id.in)) {
            const inList = where.id.in;
            return all.filter((u) => inList.includes(u.id));
          }
          return all;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
          if (where.id === 'gvcn-10a') return { id: 'gvcn-10a', username: 'gvcn10a', status: 'ACTIVE', profile: { isTeachingStaff: true } };
          if (where.id === 'gvcn-10b') return { id: 'gvcn-10b', username: 'gvcn10b', status: 'ACTIVE', profile: { isTeachingStaff: true } };
          if (where.id === 'teacher-a') return { id: 'teacher-a', username: 'teachera', status: 'ACTIVE', profile: { isTeachingStaff: true } };
          return null;
        }),
      },
      academicCalendarVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cal-v1',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-05-31'),
        }),
      },
      programmeMaster: {
        findUnique: jest.fn().mockResolvedValue({ id: 'master-hdtn-1', academicYearId, kind: 'HDTN_HN', gradeLevel: null }),
        findFirst: jest.fn().mockResolvedValue({ id: 'master-hdtn-1', academicYearId, kind: 'HDTN_HN', gradeLevel: null }),
        create: jest.fn().mockResolvedValue({ id: 'master-hdtn-created', academicYearId, kind: 'HDTN_HN', gradeLevel: null }),
      },
      programmePlanVersion: {
        findMany: jest.fn().mockResolvedValue([]), // No existing versions
        create: jest.fn().mockResolvedValue({ id: 'plan-v1', programmeMasterId: 'master-hdtn-1', versionNumber: 1, status: 'DRAFT' }),
      },
      programmeTopicItem: {
        create: jest.fn().mockResolvedValue({ id: 'topic-item-1', programmePlanVersionId: 'plan-v1', sequence: 1 }),
      },
      plannedProgrammeOccurrence: {
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: `occ-${Math.random()}`,
          ...data,
        })),
      },
      plannedOccurrenceSlot: {
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: `slot-${Math.random()}`,
          ...data,
        })),
      },
      plannedSlotStaffing: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      programmePlanningCommand: {
        findUnique: jest.fn().mockImplementation(async ({ where }: { where: { actorUserId_commandId: { commandId: string } } }) => {
          return commandsStore.get(where.actorUserId_commandId.commandId) ?? null;
        }),
        create: jest.fn().mockImplementation(async ({ data }: { data: { commandId: string; commandType: string; fingerprint: string; result: unknown } }) => {
          commandsStore.set(data.commandId, data);
          return data;
        }),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      programmePlanningCommand: mockTx.programmePlanningCommand,
    };

    mockAudit = { write: jest.fn().mockResolvedValue(undefined) };
    mockSpecialActivities = { createMaterializedRoot: jest.fn(), reverseMaterializedRoot: jest.fn() };

    service = new ProgrammePlanningService(
      mockPrisma as unknown as PrismaService,
      mockAudit as unknown as AuditService,
      mockSpecialActivities as unknown as SpecialActivitiesService,
    );
  });

  describe('DRAFT Package Confirmation & Atomic Persistence', () => {
    it('creates initial DRAFT plan version with topics, occurrences, slots and staffing', async () => {
      const result = await service.importHdtnDraftPackage(
        actorUserId,
        commandId,
        validPackage,
        bghBootstrapContext,
        validEvidence,
      );

      expect(result.outcome).toBe('CREATED');
      expect(result.status).toBe('DRAFT');
      expect(result.versionNumber).toBe(1);
      expect(result.topicItemCount).toBe(1);
      expect(result.occurrenceCount).toBe(2);
      expect(result.slotCount).toBe(2);
      expect(result.staffingCount).toBe(2);

      expect(mockTx.programmePlanVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DRAFT',
            versionNumber: 1,
          }),
        }),
      );
      expect(mockTx.programmeTopicItem.create).toHaveBeenCalledTimes(1);
      expect(mockTx.plannedProgrammeOccurrence.create).toHaveBeenCalledTimes(2);
      expect(mockTx.plannedOccurrenceSlot.create).toHaveBeenCalledTimes(2);
      expect(mockTx.plannedSlotStaffing.createMany).toHaveBeenCalledTimes(2);
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROGRAMME_PLAN_VERSION_DRAFT_IMPORTED',
          result: AuditResult.SUCCESS,
        }),
        mockTx,
      );
    });

    it('returns IDEMPOTENT_REPLAY when replaying same command with identical fingerprint', async () => {
      // First call: CREATED
      const res1 = await service.importHdtnDraftPackage(
        actorUserId,
        commandId,
        validPackage,
        bghBootstrapContext,
        validEvidence,
      );
      expect(res1.outcome).toBe('CREATED');

      // Second call: IDEMPOTENT_REPLAY
      const res2 = await service.importHdtnDraftPackage(
        actorUserId,
        commandId,
        validPackage,
        bghBootstrapContext,
        validEvidence,
      );
      expect(res2.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(res2.programmePlanVersionId).toBe(res1.programmePlanVersionId);

      // Plan version creation called only ONCE
      expect(mockTx.programmePlanVersion.create).toHaveBeenCalledTimes(1);
    });

    it('rejects with ConflictException when commandId is reused with different package/fingerprint', async () => {
      // First call
      await service.importHdtnDraftPackage(
        actorUserId,
        commandId,
        validPackage,
        bghBootstrapContext,
        validEvidence,
      );

      // Second call with different previewFingerprint
      const modifiedPackage = {
        ...validPackage,
        previewFingerprint: 'different-fingerprint-999',
      };

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          commandId,
          modifiedPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('blocks import when an existing DRAFT plan version already exists on master', async () => {
      mockTx.programmePlanVersion.findMany.mockResolvedValueOnce([
        { id: 'existing-draft-v1', status: 'DRAFT' },
      ]);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-new-draft',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('blocks import when master already has retained PUBLISHED history (no disconnected root)', async () => {
      mockTx.programmePlanVersion.findMany.mockResolvedValueOnce([
        { id: 'existing-pub-v1', status: 'PUBLISHED' },
      ]);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-new-pub',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('blocks coordinator from bootstrapping new master when master does not exist', async () => {
      mockTx.programmeMaster.findFirst.mockResolvedValue(null);
      mockTx.programmeMaster.findUnique.mockResolvedValue(null);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-coord-missing-master',
          validPackage,
          { expectedProgrammeMasterId: null, canBootstrapMaster: false },
          validEvidence,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks coordinator when expected master has been deleted or changed', async () => {
      mockTx.programmeMaster.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-coord-deleted-master',
          validPackage,
          coordinatorContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('revalidates authority evidence and blocks when timetableVersion has changed', async () => {
      mockTx.timetableVersion.findMany.mockResolvedValueOnce([]); // Missing expected timetableVersion

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-stale-tkb',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('revalidates authority evidence and blocks when target classes do not match', async () => {
      // Return only 1 active class instead of 2
      mockTx.schoolClass.findMany.mockResolvedValueOnce([
        { id: 'class-10a', academicYearId, code: '10A', status: 'ACTIVE', gradeLevel: 10 },
      ]);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-stale-class',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('revalidates authority evidence and blocks when retained markers do not match', async () => {
      mockTx.timetableSpecialProgrammeMarker.findMany.mockResolvedValueOnce([]); // Markers missing

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-stale-markers',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('validates occurrence structure and rolls back if slot weekday does not match civilDate', async () => {
      // civilDate is 2026-09-07 (MONDAY), but slot weekday is TUESDAY
      mockTx.timeSlotDefinition.findMany.mockImplementation(async ({ where }: { where?: { id?: { in?: string[] } } }) => {
        const all = [
          { id: 'slot-m1', academicYearId, weekday: 'TUESDAY', ordinal: 1, isActive: true },
          { id: 'slot-m2', academicYearId, weekday: 'TUESDAY', ordinal: 2, isActive: true },
        ];
        if (where?.id?.in && Array.isArray(where.id.in)) {
          const inList = where.id.in;
          return all.filter((s) => inList.includes(s.id));
        }
        return all;
      });

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-weekday-mismatch',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('validates occurrence structure and rolls back if teacher is not ACTIVE teaching staff', async () => {
      mockTx.user.findMany.mockImplementation(async ({ where }: { where?: { id?: { in?: string[] } } }) => {
        const all = [
          { id: 'teacher-a', username: 'teachera', status: 'ACTIVE', profile: { isTeachingStaff: true } },
          { id: 'gvcn-10a', username: 'gvcn10a', status: 'INACTIVE', profile: { isTeachingStaff: true } }, // Inactive!
          { id: 'gvcn-10b', username: 'gvcn10b', status: 'ACTIVE', profile: { isTeachingStaff: true } },
        ];
        if (where?.id?.in && Array.isArray(where.id.in)) {
          const inList = where.id.in;
          return all.filter((u) => inList.includes(u.id));
        }
        return all;
      });

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-inactive-teacher',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });
});
