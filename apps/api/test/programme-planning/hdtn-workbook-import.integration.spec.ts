import { ConflictException } from '@nestjs/common';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';
import { ProgrammePlanningService } from '../../src/programme-planning/programme-planning.service';
import {
  HdtnImportAuthorityEvidence,
  HdtnImportBootstrapContext,
  ResolvedHdtnDraftPackage,
} from '../../src/programme-planning/hdtn-workbook-importer.service';

integration('HdtnWorkbookImport (PostgreSQL integration P4-072)', () => {
  const h = new Phase01Harness();
  let service: ProgrammePlanningService;

  async function clean(): Promise<void> {
    await h.prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "programme_planning_commands",
        "planned_programme_slot_staffings",
        "planned_programme_occurrence_slots",
        "planned_programme_occurrences",
        "programme_topic_items",
        "programme_plan_versions",
        "programme_masters",
        "timetable_special_programme_markers",
        "time_slot_definitions",
        "timetable_versions",
        "homeroom_assignments",
        "school_classes",
        "grades",
        "academic_week_segments",
        "academic_weeks",
        "academic_calendar_versions",
        "academic_years",
        "staff_profiles",
        "users"
      CASCADE;
    `);
  }

  beforeAll(async () => {
    await h.start();
    service = h.app.get(ProgrammePlanningService);
  });

  beforeEach(async () => {
    await clean();
  });

  afterAll(async () => {
    try {
      await clean();
    } finally {
      await h.stop();
    }
  });

  it('atomically creates DRAFT package and supports idempotent replay or rollback', async () => {
    const year = await h.prisma.academicYear.create({
      data: {
        code: normalizedCode('Y'),
        name: 'Năm học 2026-2027',
      },
    });

    const teacherA = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_ta'),
        passwordHash: 'hash',
        fullName: 'Nguyễn Văn A',
        status: 'ACTIVE',
        profile: {
          create: {
            fullName: 'Nguyễn Văn A',
            isTeachingStaff: true,
          },
        },
      },
    });

    const gvcn10A = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_g10a'),
        passwordHash: 'hash',
        fullName: 'Trần Thị B',
        status: 'ACTIVE',
        profile: {
          create: {
            fullName: 'Trần Thị B',
            isTeachingStaff: true,
          },
        },
      },
    });

    const gvcn10B = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_g10b'),
        passwordHash: 'hash',
        fullName: 'Lê Văn C',
        status: 'ACTIVE',
        profile: {
          create: {
            fullName: 'Lê Văn C',
            isTeachingStaff: true,
          },
        },
      },
    });

    const calVersion = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        status: 'ACTIVE',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-05-31'),
      },
    });

    const week1 = await h.prisma.academicWeek.create({
      data: {
        calendarVersionId: calVersion.id,
        weekNumber: 1,
        startDate: new Date('2026-09-07'),
        endDate: new Date('2026-09-13'),
        term: 'TERM_1',
      },
    });

    const segment1 = await h.prisma.academicWeekSegment.create({
      data: {
        weekId: week1.id,
        segmentType: 'TEACHING',
        startDate: new Date('2026-09-07'),
        endDate: new Date('2026-09-13'),
      },
    });

    const grade10 = await h.prisma.grade.create({
      data: {
        academicYearId: year.id,
        level: 10,
        code: 'K10',
      },
    });

    const class10A = await h.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        gradeId: grade10.id,
        code: '10A',
        name: 'Lớp 10A',
        status: 'ACTIVE',
      },
    });

    const class10B = await h.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        gradeId: grade10.id,
        code: '10B',
        name: 'Lớp 10B',
        status: 'ACTIVE',
      },
    });

    const hr10A = await h.prisma.homeroomAssignment.create({
      data: {
        academicYearId: year.id,
        schoolClassId: class10A.id,
        teacherUserId: gvcn10A.id,
        status: 'ACTIVE',
        validFrom: new Date('2026-09-01'),
        validUntil: null,
      },
    });

    const hr10B = await h.prisma.homeroomAssignment.create({
      data: {
        academicYearId: year.id,
        schoolClassId: class10B.id,
        teacherUserId: gvcn10B.id,
        status: 'ACTIVE',
        validFrom: new Date('2026-09-01'),
        validUntil: null,
      },
    });

    const slotM1 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        period: 1,
        startTime: '07:00',
        endTime: '07:45',
        isActive: true,
      },
    });

    const slotM2 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        period: 2,
        startTime: '07:50',
        endTime: '08:35',
        isActive: true,
      },
    });

    const tkbVersion = await h.prisma.timetableVersion.create({
      data: {
        academicYearId: year.id,
        title: 'TKB V1',
        effectiveFrom: new Date('2026-09-01'),
        effectiveUntil: null,
        status: 'ACTIVE',
      },
    });

    await h.prisma.timetableSpecialProgrammeMarker.create({
      data: {
        timetableVersionId: tkbVersion.id,
        schoolClassId: class10A.id,
        timeSlotDefinitionId: slotM1.id,
        kind: 'HDTN_HN',
      },
    });

    await h.prisma.timetableSpecialProgrammeMarker.create({
      data: {
        timetableVersionId: tkbVersion.id,
        schoolClassId: class10B.id,
        timeSlotDefinitionId: slotM2.id,
        kind: 'HDTN_HN',
      },
    });

    const authorityEvidence: HdtnImportAuthorityEvidence = {
      academicYearId: year.id,
      calendarVersionId: calVersion.id,
      academicWeekIds: [week1.id],
      academicWeekSegmentIds: [segment1.id],
      segmentDateRanges: [{ segmentId: segment1.id, startDate: '2026-09-07', endDate: '2026-09-13' }],
      targetClassIds: [class10A.id, class10B.id],
      timetableVersionIds: [tkbVersion.id],
      timeSlotDefinitionIds: [slotM1.id, slotM2.id],
      explicitTeacherUserIds: [teacherA.id],
      homeroomAssignments: [
        { civilDate: '2026-09-07', schoolClassId: class10A.id, homeroomAssignmentId: hr10A.id, teacherUserId: gvcn10A.id },
        { civilDate: '2026-09-07', schoolClassId: class10B.id, homeroomAssignmentId: hr10B.id, teacherUserId: gvcn10B.id },
      ],
      markerTuples: [
        { timetableVersionId: tkbVersion.id, schoolClassId: class10A.id, timeSlotDefinitionId: slotM1.id, kind: 'HDTN_HN', civilDate: '2026-09-07' },
        { timetableVersionId: tkbVersion.id, schoolClassId: class10B.id, timeSlotDefinitionId: slotM2.id, kind: 'HDTN_HN', civilDate: '2026-09-07' },
      ],
    };

    const draftPackage: ResolvedHdtnDraftPackage = {
      academicYearId: year.id,
      previewFingerprint: 'canonical-preview-fp-postgres-072',
      topics: [
        { sequence: 1, title: 'Chủ đề 1: Khám phá trường mới', requiredPeriods: 1, guidelineWeekFrom: 1, guidelineWeekTo: 1 },
      ],
      occurrences: [
        {
          topicSequence: 1,
          civilDate: '2026-09-07',
          mode: 'CLASS',
          gradeLevel: null,
          schoolClassId: class10A.id,
          slots: [{ timeSlotDefinitionId: slotM1.id, teacherUserIds: [gvcn10A.id] }],
        },
        {
          topicSequence: 1,
          civilDate: '2026-09-07',
          mode: 'CLASS',
          gradeLevel: null,
          schoolClassId: class10B.id,
          slots: [{ timeSlotDefinitionId: slotM2.id, teacherUserIds: [gvcn10B.id] }],
        },
      ],
    };

    const bootstrapContext: HdtnImportBootstrapContext = {
      expectedProgrammeMasterId: null,
      canBootstrapMaster: true,
    };

    // 1. Initial import succeeds
    const result1 = await service.importHdtnDraftPackage(
      teacherA.id,
      'cmd-pg-import-001',
      draftPackage,
      bootstrapContext,
      authorityEvidence,
    );
    expect(result1.status).toBe('DRAFT');
    expect(result1.outcome).toBe('CREATED');

    // Verify DB state
    const createdPlan = await h.prisma.programmePlanVersion.findUnique({
      where: { id: result1.programmePlanVersionId },
      include: {
        topics: true,
        occurrences: {
          include: {
            slots: {
              include: {
                staffings: true,
              },
            },
          },
        },
      },
    });
    expect(createdPlan).not.toBeNull();
    expect(createdPlan!.topics.length).toBe(1);
    expect(createdPlan!.occurrences.length).toBe(2);

    // Finding A: verify per-class slots preserved in DB
    const occ10A = createdPlan!.occurrences.find((o: { schoolClassId: string | null }) => o.schoolClassId === class10A.id);
    const occ10B = createdPlan!.occurrences.find((o: { schoolClassId: string | null }) => o.schoolClassId === class10B.id);
    expect(occ10A!.slots.length).toBe(1);
    expect(occ10A!.slots[0]!.timeSlotDefinitionId).toBe(slotM1.id);
    expect(occ10B!.slots.length).toBe(1);
    expect(occ10B!.slots[0]!.timeSlotDefinitionId).toBe(slotM2.id);

    // 2. Exact idempotent replay succeeds
    const replayResult = await service.importHdtnDraftPackage(
      teacherA.id,
      'cmd-pg-import-001',
      draftPackage,
      bootstrapContext,
      authorityEvidence,
    );
    expect(replayResult.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(replayResult.programmePlanVersionId).toBe(result1.programmePlanVersionId);

    // 3. Command reuse with changed payload throws ConflictException
    const modifiedPackage: ResolvedHdtnDraftPackage = {
      ...draftPackage,
      previewFingerprint: 'different-fingerprint',
    };
    await expect(
      service.importHdtnDraftPackage(
        teacherA.id,
        'cmd-pg-import-001',
        modifiedPackage,
        bootstrapContext,
        authorityEvidence,
      ),
    ).rejects.toThrow(ConflictException);

    // 4. New import when DRAFT already exists is blocked
    await expect(
      service.importHdtnDraftPackage(
        teacherA.id,
        'cmd-pg-import-002',
        draftPackage,
        bootstrapContext,
        authorityEvidence,
      ),
    ).rejects.toThrow(ConflictException);
  });
});
