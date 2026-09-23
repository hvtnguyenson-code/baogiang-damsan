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
    calendar: {
      calendarVersionId: 'cal-v1',
      teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
      interruptions: [],
    },
    weeks: [
      { officialWeekNumber: 1, academicWeekId: 'week-1' },
    ],
    segments: [
      { academicWeekId: 'week-1', segmentId: 'seg-1', startDate: '2026-09-07', endDate: '2026-09-12' },
    ],
    scopeSnapshots: [
      { sourceRowNumber: 1, organizingScope: 'CLASS', gradeLevel: 10, targetClassIds: ['class-10a', 'class-10b'] },
    ],
    dateAuthorities: [
      { sourceRowNumber: 1, civilDate: '2026-09-07', timetableVersionId: 'tkb-v1' },
    ],
    markerEvidence: [
      { sourceRowNumber: 1, civilDate: '2026-09-07', markerId: 'm-1', timetableVersionId: 'tkb-v1', schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      { sourceRowNumber: 1, civilDate: '2026-09-07', markerId: 'm-2', timetableVersionId: 'tkb-v1', schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN' },
    ],
    homeroomAssignments: [
      { civilDate: '2026-09-07', schoolClassId: 'class-10a', homeroomAssignmentId: 'hr-10a', teacherUserId: 'gvcn-10a' },
      { civilDate: '2026-09-07', schoolClassId: 'class-10b', homeroomAssignmentId: 'hr-10b', teacherUserId: 'gvcn-10b' },
    ],
    explicitTeacherUserIds: ['teacher-a'],
    resolvedTeachers: [
      {
        sourceRowNumber: 1,
        normalizedTeacherName: 'nguyễn văn a',
        matchedUserId: 'teacher-a',
        displayName: 'Nguyễn Văn A',
      },
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
        findMany: jest.fn().mockResolvedValue([{
          id: 'tkb-v1',
          academicYearId,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
          effectiveUntil: null,
        }]),
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
          { id: 'm-1', timetableVersionId: 'tkb-v1', schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN', timeSlotDefinition: { weekday: 'MONDAY' } },
          { id: 'm-2', timetableVersionId: 'tkb-v1', schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN', timeSlotDefinition: { weekday: 'MONDAY' } },
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
            { id: 'teacher-a', username: 'teachera', status: 'ACTIVE', profile: { displayName: 'Nguyễn Văn A', isTeachingStaff: true } },
            { id: 'gvcn-10a', username: 'gvcn10a', status: 'ACTIVE', profile: { displayName: 'Trần Thị B', isTeachingStaff: true } },
            { id: 'gvcn-10b', username: 'gvcn10b', status: 'ACTIVE', profile: { displayName: 'Lê Văn C', isTeachingStaff: true } },
          ];
          if (where?.id?.in && Array.isArray(where.id.in)) {
            const inList = where.id.in;
            return all.filter((u) => inList.includes(u.id));
          }
          return all;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
          if (where.id === 'gvcn-10a') return { id: 'gvcn-10a', username: 'gvcn10a', status: 'ACTIVE', profile: { displayName: 'Trần Thị B', isTeachingStaff: true } };
          if (where.id === 'gvcn-10b') return { id: 'gvcn-10b', username: 'gvcn10b', status: 'ACTIVE', profile: { displayName: 'Lê Văn C', isTeachingStaff: true } };
          if (where.id === 'teacher-a') return { id: 'teacher-a', username: 'teachera', status: 'ACTIVE', profile: { displayName: 'Nguyễn Văn A', isTeachingStaff: true } };
          return null;
        }),
      },
      academicCalendarVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cal-v1',
          academicYearId,
          isActive: true,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-05-31'),
          teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'cal-v1',
          academicYearId,
          isActive: true,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-05-31'),
          teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cal-v1',
            academicYearId,
            isActive: true,
            startDate: new Date('2026-09-01'),
            endDate: new Date('2027-05-31'),
            teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
          },
        ]),
      },
      calendarInterruption: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      academicWeek: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'week-1',
            officialWeekNumber: 1,
            calendarVersionId: 'cal-v1',
            segments: [
              {
                id: 'seg-1',
                academicWeekId: 'week-1',
                startDate: new Date('2026-09-07T00:00:00.000Z'),
                endDate: new Date('2026-09-12T00:00:00.000Z'),
              },
            ],
          },
        ]),
      },
      academicWeekSegment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'seg-1',
            academicWeekId: 'week-1',
            startDate: new Date('2026-09-07T00:00:00.000Z'),
            endDate: new Date('2026-09-12T00:00:00.000Z'),
          },
        ]),
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

    it('Scope-Race A: blocks when new active class 10C appears in GRADE scope before transaction', async () => {
      // Preview expected targetClassIds = ['class-10a', 'class-10b']
      // In transaction, a new active class 10C appears
      mockTx.schoolClass.findMany.mockResolvedValueOnce([
        { id: 'class-10a', academicYearId, code: '10A', status: 'ACTIVE', gradeLevel: 10 },
        { id: 'class-10b', academicYearId, code: '10B', status: 'ACTIVE', gradeLevel: 10 },
        { id: 'class-10c', academicYearId, code: '10C', status: 'ACTIVE', gradeLevel: 10 },
      ]);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-scope-race-a',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Scope-Race B: blocks when new active class appears in SCHOOL_WIDE scope before transaction', async () => {
      const schoolWideEvidence: HdtnImportAuthorityEvidence = {
        ...validEvidence,
        scopeSnapshots: [
          { sourceRowNumber: 1, organizingScope: 'SCHOOL_WIDE', gradeLevel: null, targetClassIds: ['class-10a', 'class-10b'] },
        ],
      };

      mockTx.schoolClass.findMany.mockResolvedValueOnce([
        { id: 'class-10a', academicYearId, code: '10A', status: 'ACTIVE', gradeLevel: 10 },
        { id: 'class-10b', academicYearId, code: '10B', status: 'ACTIVE', gradeLevel: 10 },
        { id: 'class-11a', academicYearId, code: '11A', status: 'ACTIVE', gradeLevel: 11 },
      ]);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-scope-race-b',
          validPackage,
          bghBootstrapContext,
          schoolWideEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Scope-Race C: blocks when unexpected extra marker appears in relevant scope/date', async () => {
      // Expected markers: m-1, m-2. In transaction, an extra marker m-3 appears
      mockTx.timetableSpecialProgrammeMarker.findMany.mockResolvedValueOnce([
        { id: 'm-1', timetableVersionId: 'tkb-v1', schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN', timeSlotDefinition: { weekday: 'MONDAY' } },
        { id: 'm-2', timetableVersionId: 'tkb-v1', schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN', timeSlotDefinition: { weekday: 'MONDAY' } },
        { id: 'm-3', timetableVersionId: 'tkb-v1', schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN', timeSlotDefinition: { weekday: 'MONDAY' } },
      ]);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-scope-race-c',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Scope-Race C2: blocks when marker was replaced with new markerId even if tuple matches', async () => {
      // Marker id changed from m-1 to m-rebuilt-1
      mockTx.timetableSpecialProgrammeMarker.findMany.mockResolvedValueOnce([
        { id: 'm-rebuilt-1', timetableVersionId: 'tkb-v1', schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN', timeSlotDefinition: { weekday: 'MONDAY' } },
        { id: 'm-2', timetableVersionId: 'tkb-v1', schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN', timeSlotDefinition: { weekday: 'MONDAY' } },
      ]);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-scope-race-c2',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Scope-Race D: blocks when timetableVersion effectivity changes or becomes ambiguous', async () => {
      // Two overlapping timetable versions found for civilDate
      mockTx.timetableVersion.findMany.mockResolvedValueOnce([
        { id: 'tkb-v1', academicYearId, status: 'ACTIVE', effectiveFrom: new Date('2026-09-01'), effectiveUntil: null },
        { id: 'tkb-v2-overlap', academicYearId, status: 'ACTIVE', effectiveFrom: new Date('2026-09-01'), effectiveUntil: null },
      ]);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-scope-race-d',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Scope-Race E: blocks when academic calendar week segment boundary changes', async () => {
      // Segment dates changed from 2026-09-07..12 to 2026-09-08..13
      mockTx.academicWeekSegment.findMany.mockResolvedValueOnce([
        {
          id: 'seg-1',
          academicWeekId: 'week-1',
          startDate: new Date('2026-09-08T00:00:00.000Z'),
          endDate: new Date('2026-09-13T00:00:00.000Z'),
        },
      ]);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-scope-race-e',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Historical Retained Slot: allows inactive slot in HĐTN import (RETAINED_TIMETABLE_EVIDENCE), but blocks manual authoring', async () => {
      // Slot slot-m1 is historical / inactive (isActive: false)
      mockTx.timeSlotDefinition.findMany.mockImplementation(async ({ where }: { where?: { id?: { in?: string[] } } }) => {
        const all = [
          { id: 'slot-m1', academicYearId, weekday: 'MONDAY', ordinal: 1, isActive: false },
          { id: 'slot-m2', academicYearId, weekday: 'MONDAY', ordinal: 2, isActive: true },
        ];
        if (where?.id?.in && Array.isArray(where.id.in)) {
          const inList = where.id.in;
          return all.filter((s) => inList.includes(s.id));
        }
        return all;
      });

      // 1. HĐTN import uses RETAINED_TIMETABLE_EVIDENCE -> should SUCCEED
      const importRes = await service.importHdtnDraftPackage(
        actorUserId,
        'cmd-inactive-slot-import',
        validPackage,
        bghBootstrapContext,
        validEvidence,
      );
      expect(importRes.outcome).toBe('CREATED');
      expect(importRes.status).toBe('DRAFT');

      // 2. Normal manual occurrence authoring uses CURRENT_AUTHORING -> should be BLOCKED with ConflictException
      mockTx.programmePlanVersion.findUnique = jest.fn().mockResolvedValue({
        id: 'plan-v1',
        programmeMasterId: 'master-hdtn-1',
        versionNumber: 1,
        status: 'PUBLISHED',
      });
      mockTx.programmeTopicItem.findUnique = jest.fn().mockResolvedValue({
        id: 'topic-item-1',
        programmePlanVersionId: 'plan-v1',
        sequence: 1,
      });

      await expect(
        service.createDraftOccurrence(
          {
            commandId: 'cmd-manual-create-inactive',
            programmeMasterId: 'master-hdtn-1',
            programmePlanVersionId: 'plan-v1',
            programmeTopicItemId: 'topic-item-1',
            academicYearId,
            civilDate: '2026-09-07',
            mode: 'CLASS',
            gradeLevel: null,
            schoolClassId: 'class-10a',
            slots: [{ timeSlotDefinitionId: 'slot-m1', teacherUserIds: ['gvcn-10a'] }],
          },
          actorUserId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Blocker A Regression: Grade 11 markers on same timetable do NOT stale Grade 10 import, but Grade 10 marker mutation DOES stale', async () => {
      // 1. Database timetable markers: contains Grade 10 markers (m-1, m-2) and Grade 11 markers (m-11a, m-11b)
      mockTx.timetableSpecialProgrammeMarker.findMany.mockImplementation(async ({ where }: { where: { schoolClassId: { in: string[] } } }) => {
        const allMarkers = [
          { id: 'm-1', timetableVersionId: 'tkb-v1', schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN', timeSlotDefinition: { weekday: 'MONDAY' } },
          { id: 'm-2', timetableVersionId: 'tkb-v1', schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN', timeSlotDefinition: { weekday: 'MONDAY' } },
          { id: 'm-11a', timetableVersionId: 'tkb-v1', schoolClassId: 'class-11a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN', timeSlotDefinition: { weekday: 'MONDAY' } },
          { id: 'm-11b', timetableVersionId: 'tkb-v1', schoolClassId: 'class-11b', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN', timeSlotDefinition: { weekday: 'MONDAY' } },
        ];
        return allMarkers.filter((m) => where.schoolClassId.in.includes(m.schoolClassId));
      });

      // Grade 10 row targets {10A, 10B}. Even though Grade 11 has markers, transaction revalidation PASSES!
      const res = await service.importHdtnDraftPackage(
        actorUserId,
        'cmd-blocker-a-row-scope-pass',
        validPackage,
        bghBootstrapContext,
        validEvidence,
      );
      expect(res.outcome).toBe('CREATED');

      // 2. Grade 10 marker mutation: Grade 10 marker m-1 removed or replaced -> DOES stale!
      mockTx.timetableSpecialProgrammeMarker.findMany.mockImplementation(async ({ where }: { where: { schoolClassId: { in: string[] } } }) => {
        const mutatedMarkers = [
          { id: 'm-2', timetableVersionId: 'tkb-v1', schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN', timeSlotDefinition: { weekday: 'MONDAY' } },
          { id: 'm-11a', timetableVersionId: 'tkb-v1', schoolClassId: 'class-11a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN', timeSlotDefinition: { weekday: 'MONDAY' } },
        ];
        return mutatedMarkers.filter((m) => where.schoolClassId.in.includes(m.schoolClassId));
      });

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-blocker-a-grade-10-stale',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Blocker B: blocks when teachingWeekdays changes between preview and transaction', async () => {
      // TeachingWeekdays changed from Mon-Sat to Mon-Fri
      mockTx.academicCalendarVersion.findMany.mockResolvedValueOnce([
        {
          id: 'cal-v1',
          academicYearId,
          isActive: true,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-05-31'),
          teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], // Saturday removed
        },
      ]);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-teaching-weekdays-changed',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Blocker B: blocks when interruption is added covering a candidate date', async () => {
      // Interruption added in DB
      mockTx.calendarInterruption.findMany.mockResolvedValueOnce([
        {
          id: 'inter-1',
          calendarVersionId: 'cal-v1',
          code: 'BAO_SO_1',
          name: 'Nghỉ tránh bão số 1',
          startDate: new Date('2026-09-07T00:00:00.000Z'),
          endDate: new Date('2026-09-07T00:00:00.000Z'),
        },
      ]);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-interruption-added',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Blocker B: blocks when interruption is removed exposing a new date', async () => {
      const evidenceWithInterruption: HdtnImportAuthorityEvidence = {
        ...validEvidence,
        calendar: {
          ...validEvidence.calendar,
          interruptions: [
            {
              id: 'inter-1',
              code: 'BAO_SO_1',
              name: 'Nghỉ bão',
              startDate: '2026-09-07',
              endDate: '2026-09-07',
            },
          ],
        },
      };

      // DB has 0 interruptions (it was removed)
      mockTx.calendarInterruption.findMany.mockResolvedValueOnce([]);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-interruption-removed',
          validPackage,
          bghBootstrapContext,
          evidenceWithInterruption,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Blocker B: blocks when interruption date range changes', async () => {
      const evidenceWithInterruption: HdtnImportAuthorityEvidence = {
        ...validEvidence,
        calendar: {
          ...validEvidence.calendar,
          interruptions: [
            {
              id: 'inter-1',
              code: 'BAO_SO_1',
              name: 'Nghỉ bão',
              startDate: '2026-09-07',
              endDate: '2026-09-08',
            },
          ],
        },
      };

      // DB has changed endDate
      mockTx.calendarInterruption.findMany.mockResolvedValueOnce([
        {
          id: 'inter-1',
          calendarVersionId: 'cal-v1',
          code: 'BAO_SO_1',
          name: 'Nghỉ bão',
          startDate: new Date('2026-09-07T00:00:00.000Z'),
          endDate: new Date('2026-09-09T00:00:00.000Z'), // Changed
        },
      ]);

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-interruption-dates-changed',
          validPackage,
          bghBootstrapContext,
          evidenceWithInterruption,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Blocker C: blocks when another active teaching user gains same normalized displayName (duplicate-name race)', async () => {
      // Another user 'teacher-b' gains same displayName 'Nguyễn Văn A'
      mockTx.user.findMany.mockImplementation(async ({ where }: { where?: { id?: { in?: string[] } } }) => {
        const all = [
          { id: 'teacher-a', username: 'teachera', status: 'ACTIVE', profile: { displayName: 'Nguyễn Văn A', isTeachingStaff: true } },
          { id: 'teacher-b', username: 'teacherb', status: 'ACTIVE', profile: { displayName: 'Nguyễn Văn  A', isTeachingStaff: true } },
          { id: 'gvcn-10a', username: 'gvcn10a', status: 'ACTIVE', profile: { displayName: 'Trần Thị B', isTeachingStaff: true } },
          { id: 'gvcn-10b', username: 'gvcn10b', status: 'ACTIVE', profile: { displayName: 'Lê Văn C', isTeachingStaff: true } },
        ];
        if (where?.id?.in && Array.isArray(where.id.in)) {
          return all.filter((u) => where.id!.in!.includes(u.id));
        }
        return all;
      });

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-duplicate-teacher-name',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Blocker C: blocks when resolved teacher displayName changes after preview', async () => {
      // Teacher-A displayName changed to 'Nguyễn Văn X'
      mockTx.user.findMany.mockImplementation(async ({ where }: { where?: { id?: { in?: string[] } } }) => {
        const all = [
          { id: 'teacher-a', username: 'teachera', status: 'ACTIVE', profile: { displayName: 'Nguyễn Văn X', isTeachingStaff: true } },
          { id: 'gvcn-10a', username: 'gvcn10a', status: 'ACTIVE', profile: { displayName: 'Trần Thị B', isTeachingStaff: true } },
          { id: 'gvcn-10b', username: 'gvcn10b', status: 'ACTIVE', profile: { displayName: 'Lê Văn C', isTeachingStaff: true } },
        ];
        if (where?.id?.in && Array.isArray(where.id.in)) {
          return all.filter((u) => where.id!.in!.includes(u.id));
        }
        return all;
      });

      await expect(
        service.importHdtnDraftPackage(
          actorUserId,
          'cmd-teacher-name-changed',
          validPackage,
          bghBootstrapContext,
          validEvidence,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Blocker C: unrelated teacher changes do NOT cause stale conflict', async () => {
      // Unrelated teacher-z changes or appears
      mockTx.user.findMany.mockImplementation(async ({ where }: { where?: { id?: { in?: string[] } } }) => {
        const all = [
          { id: 'teacher-a', username: 'teachera', status: 'ACTIVE', profile: { displayName: 'Nguyễn Văn A', isTeachingStaff: true } },
          { id: 'teacher-z', username: 'teacherz', status: 'ACTIVE', profile: { displayName: 'Phạm Văn Z', isTeachingStaff: true } },
          { id: 'gvcn-10a', username: 'gvcn10a', status: 'ACTIVE', profile: { displayName: 'Trần Thị B', isTeachingStaff: true } },
          { id: 'gvcn-10b', username: 'gvcn10b', status: 'ACTIVE', profile: { displayName: 'Lê Văn C', isTeachingStaff: true } },
        ];
        if (where?.id?.in && Array.isArray(where.id.in)) {
          return all.filter((u) => where.id!.in!.includes(u.id));
        }
        return all;
      });

      const res = await service.importHdtnDraftPackage(
        actorUserId,
        'cmd-unrelated-teacher-ok',
        validPackage,
        bghBootstrapContext,
        validEvidence,
      );
      expect(res.outcome).toBe('CREATED');
    });

    it('Blocker C: staffCode change does NOT cause stale conflict for HĐTN teacher authority', async () => {
      // Teacher-A staffCode changed / set on profile, but displayName and matchedUserId match
      mockTx.user.findMany.mockImplementation(async ({ where }: { where?: { id?: { in?: string[] } } }) => {
        const all = [
          { id: 'teacher-a', username: 'teachera', status: 'ACTIVE', profile: { displayName: 'Nguyễn Văn A', staffCode: 'NEW_STAFF_CODE_999', isTeachingStaff: true } },
          { id: 'gvcn-10a', username: 'gvcn10a', status: 'ACTIVE', profile: { displayName: 'Trần Thị B', staffCode: 'GVCN_A', isTeachingStaff: true } },
          { id: 'gvcn-10b', username: 'gvcn10b', status: 'ACTIVE', profile: { displayName: 'Lê Văn C', staffCode: 'GVCN_B', isTeachingStaff: true } },
        ];
        if (where?.id?.in && Array.isArray(where.id.in)) {
          return all.filter((u) => where.id!.in!.includes(u.id));
        }
        return all;
      });

      const res = await service.importHdtnDraftPackage(
        actorUserId,
        'cmd-staffcode-change-ok',
        validPackage,
        bghBootstrapContext,
        validEvidence,
      );
      expect(res.outcome).toBe('CREATED');
    });
  });
});
