import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProgrammePlanningWorkspaceService } from './programme-planning-workspace.service';

describe('ProgrammePlanningWorkspaceService', () => {
  let service: ProgrammePlanningWorkspaceService;
  let prismaMock: Record<string, Record<string, jest.Mock>>;
  let authorizationMock: { evaluate: jest.Mock };
  let authServiceMock: {
    resolveProgrammeAuthority: jest.Mock;
    requireProgrammeAuthority: jest.Mock;
  };

  const actorId = 'actor-user-uuid-1';
  const yearId = 'year-2024-2025-uuid';
  const gddpMasterId = 'gddp-master-uuid-10';
  const hdtnMasterId = 'hdtn-master-uuid-all';

  const defaultUser = {
    id: actorId,
    status: 'ACTIVE',
    mustChangePassword: false,
    lockedUntil: null,
  };

  const academicYear2024 = {
    id: yearId,
    code: '2024-2025',
    name: 'Năm học 2024 - 2025',
  };

  const gddpMaster = {
    id: gddpMasterId,
    academicYearId: yearId,
    kind: 'GDDP' as const,
    gradeLevel: 10,
    createdByUserId: 'creator-uuid',
    createdAt: new Date('2024-09-01T00:00:00Z'),
    updatedAt: new Date('2024-09-01T00:00:00Z'),
  };

  const hdtnMaster = {
    id: hdtnMasterId,
    academicYearId: yearId,
    kind: 'HDTN_HN' as const,
    gradeLevel: null,
    createdByUserId: 'creator-uuid',
    createdAt: new Date('2024-09-02T00:00:00Z'),
    updatedAt: new Date('2024-09-02T00:00:00Z'),
  };

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue(defaultUser),
        findMany: jest.fn().mockResolvedValue([]),
      },
      academicYear: {
        findUnique: jest.fn().mockResolvedValue(academicYear2024),
        findMany: jest.fn().mockResolvedValue([academicYear2024]),
      },
      programmeMaster: {
        findUnique: jest.fn().mockResolvedValue(gddpMaster),
        findMany: jest.fn().mockResolvedValue([gddpMaster, hdtnMaster]),
      },
      programmePlanVersion: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      programmeTopicItem: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      plannedProgrammeOccurrence: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      plannedOccurrenceSlot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      plannedSlotStaffing: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      schoolClass: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      timeSlotDefinition: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffProfile: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      programmeMaterializedActivity: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      programmeOccurrenceAttestation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    authorizationMock = {
      evaluate: jest.fn().mockResolvedValue({ allowed: false }),
    };

    authServiceMock = {
      resolveProgrammeAuthority: jest.fn().mockResolvedValue({ qualified: false }),
      requireProgrammeAuthority: jest.fn().mockResolvedValue({ qualified: true }),
    };

    service = new ProgrammePlanningWorkspaceService(
      prismaMock as never,
      authorizationMock as never,
      authServiceMock as never,
    );
  });

  // =========================================================================
  // SECTION 10: AUTHORIZATION TEST MATRIX
  // =========================================================================
  describe('Authorization Test Matrix (Section 10)', () => {
    it('1. Principal SCHOOL_WIDE -> workspace options allowed', async () => {
      authorizationMock.evaluate.mockImplementation(async ({ capabilityKey, requestedScope }) => {
        if (capabilityKey === 'APPROVAL_PRINCIPAL' && requestedScope === 'SCHOOL_WIDE') {
          return { allowed: true, reasonCode: 'ALLOWED' };
        }
        return { allowed: false, reasonCode: 'FORBIDDEN' };
      });

      const res = await service.getWorkspaceOptions(actorId);

      expect(res.academicYears).toHaveLength(1);
      expect(res.academicYears[0].code).toBe('2024-2025');
      expect(res.masters).toHaveLength(2);
      expect(res.masters[0].id).toBe(gddpMasterId);
      expect(res.masters[0].kindLabel).toBe('Giáo dục địa phương');
      expect(res.masters[0].label).toBe('Giáo dục địa phương - Khối 10');
      expect(res.masters[1].id).toBe(hdtnMasterId);
      expect(res.masters[1].kindLabel).toBe('Hoạt động trải nghiệm, hướng nghiệp');
    });

    it('2. Vice Principal SCHOOL_WIDE -> allowed', async () => {
      authorizationMock.evaluate.mockImplementation(async ({ capabilityKey, requestedScope }) => {
        if (capabilityKey === 'APPROVAL_VICE_PRINCIPAL' && requestedScope === 'SCHOOL_WIDE') {
          return { allowed: true, reasonCode: 'ALLOWED' };
        }
        return { allowed: false, reasonCode: 'FORBIDDEN' };
      });

      const res = await service.getWorkspaceOptions(actorId);

      expect(res.academicYears).toHaveLength(1);
      expect(res.masters).toHaveLength(2);
    });

    it('3. GDDP coordinator exact master -> sees exact authorized master', async () => {
      authServiceMock.resolveProgrammeAuthority.mockImplementation(async (_actorId, master) => {
        if (master.id === gddpMasterId) {
          return {
            qualified: true,
            authorityType: 'COORDINATOR',
            capabilityKey: 'GDDP_COORDINATOR',
            scope: 'ACTIVITY',
            resourceId: gddpMasterId,
          };
        }
        return { qualified: false, reasonCode: 'FORBIDDEN' };
      });

      const res = await service.getWorkspaceOptions(actorId);

      expect(res.masters).toHaveLength(1);
      expect(res.masters[0].id).toBe(gddpMasterId);
      expect(res.masters[0].kind).toBe('GDDP');
      expect(res.masters[0].gradeLevel).toBe(10);
      expect(res.academicYears).toHaveLength(1);
      expect(res.academicYears[0].id).toBe(yearId);
    });

    it('4. HĐTN coordinator exact master -> sees exact authorized master', async () => {
      authServiceMock.resolveProgrammeAuthority.mockImplementation(async (_actorId, master) => {
        if (master.id === hdtnMasterId) {
          return {
            qualified: true,
            authorityType: 'COORDINATOR',
            capabilityKey: 'HĐTN_COORDINATOR',
            scope: 'ACTIVITY',
            resourceId: hdtnMasterId,
          };
        }
        return { qualified: false, reasonCode: 'FORBIDDEN' };
      });

      const res = await service.getWorkspaceOptions(actorId);

      expect(res.masters).toHaveLength(1);
      expect(res.masters[0].id).toBe(hdtnMasterId);
      expect(res.masters[0].kind).toBe('HDTN_HN');
      expect(res.masters[0].gradeLevel).toBeNull();
      expect(res.masters[0].label).toBe('Hoạt động trải nghiệm, hướng nghiệp');
    });

    it('5. Coordinator master A does not see master B', async () => {
      authServiceMock.resolveProgrammeAuthority.mockImplementation(async (_actorId, master) => {
        if (master.id === gddpMasterId) {
          return { qualified: true, authorityType: 'COORDINATOR' };
        }
        return { qualified: false, reasonCode: 'FORBIDDEN' };
      });

      const res = await service.getWorkspaceOptions(actorId);

      expect(res.masters.map((m) => m.id)).toEqual([gddpMasterId]);
      expect(res.masters.map((m) => m.id)).not.toContain(hdtnMasterId);
    });

    it('6. Wrong programme-kind coordinator does not get false authority', async () => {
      authServiceMock.resolveProgrammeAuthority.mockResolvedValue({
        qualified: false,
        reasonCode: 'FORBIDDEN',
      });

      await expect(service.getWorkspaceOptions(actorId)).rejects.toThrow(ForbiddenException);
    });

    it('7. Inactive user fails closed', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...defaultUser,
        status: 'INACTIVE',
      });

      await expect(service.getWorkspaceOptions(actorId)).rejects.toThrow(ForbiddenException);
      expect(authorizationMock.evaluate).not.toHaveBeenCalled();
    });

    it('8. mustChangePassword fails closed', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...defaultUser,
        mustChangePassword: true,
      });

      await expect(service.getWorkspaceOptions(actorId)).rejects.toThrow(ForbiddenException);
      expect(authorizationMock.evaluate).not.toHaveBeenCalled();
    });

    it('9. locked user fails closed', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...defaultUser,
        lockedUntil: new Date(Date.now() + 3600000),
      });

      await expect(service.getWorkspaceOptions(actorId)).rejects.toThrow(ForbiddenException);
      expect(authorizationMock.evaluate).not.toHaveBeenCalled();
    });

    it('10. teacher with only TEACHER_BASE does not get programme workspace authority', async () => {
      authorizationMock.evaluate.mockResolvedValue({ allowed: false, reasonCode: 'FORBIDDEN' });
      authServiceMock.resolveProgrammeAuthority.mockResolvedValue({
        qualified: false,
        reasonCode: 'FORBIDDEN',
      });

      await expect(service.getWorkspaceOptions(actorId)).rejects.toThrow(ForbiddenException);
    });

    it('11. does not require ACADEMIC_STRUCTURE_MANAGE', async () => {
      authServiceMock.resolveProgrammeAuthority.mockImplementation(async (_actorId, master) => {
        if (master.id === gddpMasterId) {
          return { qualified: true, authorityType: 'COORDINATOR' };
        }
        return { qualified: false };
      });

      const res = await service.getWorkspaceOptions(actorId);

      expect(res.masters).toHaveLength(1);
      const evaluatedCapabilities = authorizationMock.evaluate.mock.calls.map(
        ([args]) => args.capabilityKey,
      );
      expect(evaluatedCapabilities).not.toContain('ACADEMIC_STRUCTURE_MANAGE');
    });

    it('12. does not require USER_MANAGE', async () => {
      authServiceMock.resolveProgrammeAuthority.mockImplementation(async (_actorId, master) => {
        if (master.id === gddpMasterId) {
          return { qualified: true, authorityType: 'COORDINATOR' };
        }
        return { qualified: false };
      });

      await service.getWorkspaceOptions(actorId);

      const evaluatedCapabilities = authorizationMock.evaluate.mock.calls.map(
        ([args]) => args.capabilityKey,
      );
      expect(evaluatedCapabilities).not.toContain('USER_MANAGE');
    });
  });

  // =========================================================================
  // SECTION 11: READ MODEL TEST MATRIX
  // =========================================================================
  describe('Read Model Test Matrix (Section 11)', () => {
    const classId = 'class-10a1-uuid';
    const topicId = 'topic-1-uuid';
    const occClassId = 'occ-class-uuid-1';
    const occGradeId = 'occ-grade-uuid-1';
    const occSchoolId = 'occ-school-uuid-1';
    const slotId = 'slot-uuid-1';
    const timeSlotDefId = 'slot-def-uuid-1';
    const teacherId1 = 'teacher-uuid-1';
    const teacherId2 = 'teacher-uuid-2';

    const sampleTopic = {
      id: topicId,
      programmePlanVersionId: 'plan-1-uuid',
      sequence: 1,
      title: 'Chủ đề 1: Tìm hiểu truyền thống địa phương',
      requiredPeriods: 2,
      guidelineWeekFrom: 1,
      guidelineWeekTo: 2,
      guidelineSegmentLabel: 'Học kỳ 1',
    };

    const samplePlan = {
      id: 'plan-1-uuid',
      programmeMasterId: hdtnMasterId,
      versionNumber: 1,
      status: 'PUBLISHED' as const,
      draftRevision: 2,
      changeReason: 'Kế hoạch học kỳ 1 ban hành',
      publishedAt: new Date('2024-09-05T08:00:00Z'),
    };

    const sampleTimeSlotDef = {
      id: timeSlotDefId,
      ordinal: 1,
      startTime: new Date('1970-01-01T07:00:00Z'),
      endTime: new Date('1970-01-01T07:45:00Z'),
      displayLabel: 'Tiết 1',
    };

    const sampleClass = {
      id: classId,
      code: '10A1',
      name: 'Lớp 10A1',
    };

    const sampleProfile1 = {
      userId: teacherId1,
      displayName: 'Nguyễn Văn A',
      staffCode: 'GV001',
    };

    const sampleProfile2 = {
      userId: teacherId2,
      displayName: 'Trần Thị B',
      staffCode: 'GV002',
    };

    it('HĐTN CLASS: class code/name + topic + civil date + slot + teacher display', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue(hdtnMaster);
      prismaMock.programmePlanVersion.findFirst.mockResolvedValue(samplePlan);
      prismaMock.programmeTopicItem.findMany.mockResolvedValue([sampleTopic]);
      prismaMock.schoolClass.findMany.mockResolvedValue([sampleClass]);
      prismaMock.timeSlotDefinition.findMany.mockResolvedValue([sampleTimeSlotDef]);
      prismaMock.staffProfile.findMany.mockResolvedValue([sampleProfile1]);

      const occ = {
        id: occClassId,
        programmeMasterId: hdtnMasterId,
        programmePlanVersionId: samplePlan.id,
        programmeTopicItemId: topicId,
        academicYearId: yearId,
        civilDate: new Date('2024-09-09T00:00:00Z'),
        mode: 'CLASS' as const,
        gradeLevel: 10,
        schoolClassId: classId,
        status: 'PUBLISHED' as const,
        draftRevision: 1,
        note: 'Tiết sinh hoạt lớp',
        replacesOccurrenceId: null,
      };
      prismaMock.plannedProgrammeOccurrence.findMany.mockResolvedValue([occ]);

      const slot = {
        id: slotId,
        plannedProgrammeOccurrenceId: occClassId,
        academicYearId: yearId,
        timeSlotDefinitionId: timeSlotDefId,
        createdAt: new Date(),
      };
      prismaMock.plannedOccurrenceSlot.findMany.mockResolvedValue([slot]);

      const staffing = {
        id: 'staff-1',
        plannedOccurrenceSlotId: slotId,
        teacherUserId: teacherId1,
        createdAt: new Date(),
      };
      prismaMock.plannedSlotStaffing.findMany.mockResolvedValue([staffing]);

      const res = await service.getWorkspaceMasterDetail(hdtnMasterId);

      expect(res.master.kind).toBe('HDTN_HN');
      expect(res.master.kindLabel).toBe('Hoạt động trải nghiệm, hướng nghiệp');
      expect(res.master.academicYearCode).toBe('2024-2025');

      expect(res.occurrences).toHaveLength(1);
      const o = res.occurrences[0];
      expect(o.schoolClassCode).toBe('10A1');
      expect(o.schoolClassName).toBe('Lớp 10A1');
      expect(o.topicTitle).toBe(sampleTopic.title);
      expect(o.topicSequence).toBe(1);
      expect(o.civilDate).toBe('2024-09-09');
      expect(o.mode).toBe('CLASS');
      expect(o.modeLabel).toBe('Theo lớp');

      expect(o.slots).toHaveLength(1);
      const s = o.slots[0];
      expect(s.periodNumber).toBe(1);
      expect(s.startTime).toBe('07:00:00');
      expect(s.endTime).toBe('07:45:00');
      expect(s.staffing).toHaveLength(1);
      expect(s.staffing[0].displayName).toBe('Nguyễn Văn A');
      expect(s.staffing[0].staffCode).toBe('GV001');
    });

    it('HĐTN GRADE: no fake per-class occurrence fan-out', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue(hdtnMaster);
      prismaMock.programmePlanVersion.findFirst.mockResolvedValue(samplePlan);
      prismaMock.programmeTopicItem.findMany.mockResolvedValue([sampleTopic]);

      const gradeOcc = {
        id: occGradeId,
        programmeMasterId: hdtnMasterId,
        programmePlanVersionId: samplePlan.id,
        programmeTopicItemId: topicId,
        academicYearId: yearId,
        civilDate: new Date('2024-09-16T00:00:00Z'),
        mode: 'GRADE' as const,
        gradeLevel: 11,
        schoolClassId: null,
        status: 'PUBLISHED' as const,
        draftRevision: 1,
        note: 'Sinh hoạt dưới cờ toàn khối',
        replacesOccurrenceId: null,
      };
      prismaMock.plannedProgrammeOccurrence.findMany.mockResolvedValue([gradeOcc]);

      const res = await service.getWorkspaceMasterDetail(hdtnMasterId);

      expect(res.occurrences).toHaveLength(1);
      expect(res.occurrences[0].mode).toBe('GRADE');
      expect(res.occurrences[0].modeLabel).toBe('Theo khối');
      expect(res.occurrences[0].gradeLevel).toBe(11);
      expect(res.occurrences[0].schoolClassId).toBeNull();
      expect(res.occurrences[0].schoolClassCode).toBeNull();
    });

    it('HĐTN SCHOOL_WIDE: one logical occurrence remains one logical occurrence', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue(hdtnMaster);
      prismaMock.programmePlanVersion.findFirst.mockResolvedValue(samplePlan);
      prismaMock.programmeTopicItem.findMany.mockResolvedValue([sampleTopic]);

      const schoolWideOcc = {
        id: occSchoolId,
        programmeMasterId: hdtnMasterId,
        programmePlanVersionId: samplePlan.id,
        programmeTopicItemId: topicId,
        academicYearId: yearId,
        civilDate: new Date('2024-09-23T00:00:00Z'),
        mode: 'SCHOOL_WIDE' as const,
        gradeLevel: null,
        schoolClassId: null,
        status: 'PUBLISHED' as const,
        draftRevision: 1,
        note: 'Chào cờ đầu tuần',
        replacesOccurrenceId: null,
      };
      prismaMock.plannedProgrammeOccurrence.findMany.mockResolvedValue([schoolWideOcc]);

      const res = await service.getWorkspaceMasterDetail(hdtnMasterId);

      expect(res.occurrences).toHaveLength(1);
      expect(res.occurrences[0].mode).toBe('SCHOOL_WIDE');
      expect(res.occurrences[0].modeLabel).toBe('Toàn trường');
      expect(res.occurrences[0].gradeLevel).toBeNull();
      expect(res.occurrences[0].schoolClassId).toBeNull();
    });

    it('GDĐP GRADE: grade level + PPCT-derived topic persistence view + multi-teacher slot display', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue(gddpMaster);
      const gddpPlan = {
        id: 'plan-gddp-1',
        programmeMasterId: gddpMasterId,
        versionNumber: 1,
        status: 'PUBLISHED' as const,
        draftRevision: 1,
        changeReason: 'Ban hành chương trình GDĐP khối 10',
        publishedAt: new Date('2024-09-01T08:00:00Z'),
      };
      prismaMock.programmePlanVersion.findFirst.mockResolvedValue(gddpPlan);

      const gddpTopic = {
        id: 'gddp-topic-1',
        programmePlanVersionId: gddpPlan.id,
        sequence: 1,
        title: 'Chuyên đề 1: Lịch sử Đắk Lắk',
        requiredPeriods: 6,
        guidelineWeekFrom: 1,
        guidelineWeekTo: 3,
        guidelineSegmentLabel: 'Chủ đề Lịch sử',
      };
      prismaMock.programmeTopicItem.findMany.mockResolvedValue([gddpTopic]);
      prismaMock.timeSlotDefinition.findMany.mockResolvedValue([sampleTimeSlotDef]);
      prismaMock.staffProfile.findMany.mockResolvedValue([sampleProfile1, sampleProfile2]);

      const gddpOcc = {
        id: 'gddp-occ-1',
        programmeMasterId: gddpMasterId,
        programmePlanVersionId: gddpPlan.id,
        programmeTopicItemId: gddpTopic.id,
        academicYearId: yearId,
        civilDate: new Date('2024-09-10T00:00:00Z'),
        mode: 'GRADE' as const,
        gradeLevel: 10,
        schoolClassId: null,
        status: 'PUBLISHED' as const,
        draftRevision: 1,
        note: null,
        replacesOccurrenceId: null,
      };
      prismaMock.plannedProgrammeOccurrence.findMany.mockResolvedValue([gddpOcc]);

      const gddpSlot = {
        id: 'gddp-slot-1',
        plannedProgrammeOccurrenceId: gddpOcc.id,
        academicYearId: yearId,
        timeSlotDefinitionId: timeSlotDefId,
        createdAt: new Date(),
      };
      prismaMock.plannedOccurrenceSlot.findMany.mockResolvedValue([gddpSlot]);

      const staffing1 = {
        id: 'staff-gddp-1',
        plannedOccurrenceSlotId: gddpSlot.id,
        teacherUserId: teacherId1,
      };
      const staffing2 = {
        id: 'staff-gddp-2',
        plannedOccurrenceSlotId: gddpSlot.id,
        teacherUserId: teacherId2,
      };
      prismaMock.plannedSlotStaffing.findMany.mockResolvedValue([staffing1, staffing2]);

      const res = await service.getWorkspaceMasterDetail(gddpMasterId);

      expect(res.master.kind).toBe('GDDP');
      expect(res.master.gradeLevel).toBe(10);
      expect(res.master.label).toBe('Giáo dục địa phương - Khối 10');

      expect(res.plan?.topics).toHaveLength(1);
      expect(res.plan?.topics[0].guidelineSegmentLabel).toBe('Chủ đề Lịch sử');

      expect(res.occurrences[0].slots[0].staffing).toHaveLength(2);
      expect(res.occurrences[0].slots[0].staffing.map((t) => t.displayName)).toEqual([
        'Nguyễn Văn A',
        'Trần Thị B',
      ]);
    });

    it('DRAFT state visible', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue(gddpMaster);
      const draftPlan = {
        id: 'plan-draft-1',
        programmeMasterId: gddpMasterId,
        versionNumber: 1,
        status: 'DRAFT' as const,
        draftRevision: 1,
        changeReason: null,
        publishedAt: null,
      };
      prismaMock.programmePlanVersion.findFirst.mockResolvedValue(draftPlan);

      const draftOcc = {
        id: 'occ-draft-1',
        programmeMasterId: gddpMasterId,
        programmePlanVersionId: draftPlan.id,
        programmeTopicItemId: topicId,
        academicYearId: yearId,
        civilDate: new Date('2024-09-12T00:00:00Z'),
        mode: 'CLASS' as const,
        gradeLevel: 10,
        schoolClassId: classId,
        status: 'DRAFT' as const,
        draftRevision: 1,
        note: 'Dự thảo tiết học',
        replacesOccurrenceId: null,
      };
      prismaMock.plannedProgrammeOccurrence.findMany.mockResolvedValue([draftOcc]);

      const res = await service.getWorkspaceMasterDetail(gddpMasterId);

      expect(res.plan?.status).toBe('DRAFT');
      expect(res.plan?.publishedAt).toBeNull();
      expect(res.occurrences[0].status).toBe('DRAFT');
    });

    it('PUBLISHED state visible', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue(hdtnMaster);
      prismaMock.programmePlanVersion.findFirst.mockResolvedValue(samplePlan);

      const pubOcc = {
        id: 'occ-pub-1',
        programmeMasterId: hdtnMasterId,
        programmePlanVersionId: samplePlan.id,
        programmeTopicItemId: topicId,
        academicYearId: yearId,
        civilDate: new Date('2024-09-15T00:00:00Z'),
        mode: 'GRADE' as const,
        gradeLevel: 10,
        schoolClassId: null,
        status: 'PUBLISHED' as const,
        draftRevision: 1,
        note: null,
        replacesOccurrenceId: null,
      };
      prismaMock.plannedProgrammeOccurrence.findMany.mockResolvedValue([pubOcc]);

      const res = await service.getWorkspaceMasterDetail(hdtnMasterId);

      expect(res.plan?.status).toBe('PUBLISHED');
      expect(res.occurrences[0].status).toBe('PUBLISHED');
    });

    it('materialized false/true correct', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue(hdtnMaster);
      prismaMock.programmePlanVersion.findFirst.mockResolvedValue(samplePlan);

      const occ1 = {
        id: 'occ-1',
        programmeMasterId: hdtnMasterId,
        programmePlanVersionId: samplePlan.id,
        programmeTopicItemId: topicId,
        academicYearId: yearId,
        civilDate: new Date('2024-09-15T00:00:00Z'),
        mode: 'GRADE' as const,
        gradeLevel: 10,
        schoolClassId: null,
        status: 'PUBLISHED' as const,
        draftRevision: 1,
        note: null,
        replacesOccurrenceId: null,
      };
      const occ2 = {
        id: 'occ-2',
        programmeMasterId: hdtnMasterId,
        programmePlanVersionId: samplePlan.id,
        programmeTopicItemId: topicId,
        academicYearId: yearId,
        civilDate: new Date('2024-09-22T00:00:00Z'),
        mode: 'GRADE' as const,
        gradeLevel: 10,
        schoolClassId: null,
        status: 'PUBLISHED' as const,
        draftRevision: 1,
        note: null,
        replacesOccurrenceId: null,
      };
      prismaMock.plannedProgrammeOccurrence.findMany.mockResolvedValue([occ1, occ2]);

      // occ1 is materialized, occ2 is not
      prismaMock.programmeMaterializedActivity.findMany.mockResolvedValue([
        { id: 'mat-1', plannedProgrammeOccurrenceId: 'occ-1', specialActivityId: 'spec-1' },
      ]);

      const res = await service.getWorkspaceMasterDetail(hdtnMasterId);

      expect(res.occurrences[0].lifecycleSummary.materialized).toBe(true);
      expect(res.occurrences[0].lifecycleSummary.materializedActivityCount).toBe(1);

      expect(res.occurrences[1].lifecycleSummary.materialized).toBe(false);
      expect(res.occurrences[1].lifecycleSummary.materializedActivityCount).toBe(0);

      expect(res.lifecycleSummary.totalOccurrences).toBe(2);
      expect(res.lifecycleSummary.materializedOccurrences).toBe(1);
      expect(res.lifecycleSummary.isFullyMaterialized).toBe(false);
    });

    it('attestation active count correct (excludes reversed)', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue(hdtnMaster);
      prismaMock.programmePlanVersion.findFirst.mockResolvedValue(samplePlan);

      const occ = {
        id: 'occ-attest-test',
        programmeMasterId: hdtnMasterId,
        programmePlanVersionId: samplePlan.id,
        programmeTopicItemId: topicId,
        academicYearId: yearId,
        civilDate: new Date('2024-09-15T00:00:00Z'),
        mode: 'GRADE' as const,
        gradeLevel: 10,
        schoolClassId: null,
        status: 'PUBLISHED' as const,
        draftRevision: 1,
        note: null,
        replacesOccurrenceId: null,
      };
      prismaMock.plannedProgrammeOccurrence.findMany.mockResolvedValue([occ]);

      // Active attestations queried with status: 'ACTIVE'
      prismaMock.programmeOccurrenceAttestation.findMany.mockResolvedValue([
        { id: 'attest-1', plannedProgrammeOccurrenceId: occ.id, status: 'ACTIVE' },
        { id: 'attest-2', plannedProgrammeOccurrenceId: occ.id, status: 'ACTIVE' },
      ]);

      const res = await service.getWorkspaceMasterDetail(hdtnMasterId);

      expect(res.occurrences[0].lifecycleSummary.hasActiveAttestation).toBe(true);
      expect(res.occurrences[0].lifecycleSummary.activeAttestationCount).toBe(2);
      expect(res.lifecycleSummary.attestedOccurrences).toBe(1);
    });

    it('technical IDs not converted into fake user-facing labels', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue(hdtnMaster);
      prismaMock.programmePlanVersion.findFirst.mockResolvedValue(samplePlan);
      prismaMock.timeSlotDefinition.findMany.mockResolvedValue([sampleTimeSlotDef]);
      prismaMock.staffProfile.findMany.mockResolvedValue([sampleProfile1]);

      const occ = {
        id: 'occ-clean-labels',
        programmeMasterId: hdtnMasterId,
        programmePlanVersionId: samplePlan.id,
        programmeTopicItemId: topicId,
        academicYearId: yearId,
        civilDate: new Date('2024-09-15T00:00:00Z'),
        mode: 'CLASS' as const,
        gradeLevel: 10,
        schoolClassId: classId,
        status: 'PUBLISHED' as const,
        draftRevision: 1,
        note: null,
        replacesOccurrenceId: null,
      };
      prismaMock.plannedProgrammeOccurrence.findMany.mockResolvedValue([occ]);
      prismaMock.plannedOccurrenceSlot.findMany.mockResolvedValue([
        {
          id: 'slot-1',
          plannedProgrammeOccurrenceId: occ.id,
          timeSlotDefinitionId: timeSlotDefId,
        },
      ]);
      prismaMock.plannedSlotStaffing.findMany.mockResolvedValue([
        {
          id: 'staff-1',
          plannedOccurrenceSlotId: 'slot-1',
          teacherUserId: teacherId1,
        },
      ]);

      const res = await service.getWorkspaceMasterDetail(hdtnMasterId);

      const slot = res.occurrences[0].slots[0];
      expect(slot.periodNumber).toBe(1);
      expect(slot.startTime).toBe('07:00:00');
      expect(slot.endTime).toBe('07:45:00');
      expect(slot.staffing[0].displayName).toBe('Nguyễn Văn A');
      // No synthetic string like "Slot UUID..." in display properties
      expect(res.occurrences[0].modeLabel).toBe('Theo lớp');
    });

    it('throws NotFoundException when master is not found', async () => {
      prismaMock.programmeMaster.findUnique.mockResolvedValue(null);

      await expect(service.getWorkspaceMasterDetail('missing-master-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
