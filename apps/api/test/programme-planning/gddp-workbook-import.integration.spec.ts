import { ConflictException } from '@nestjs/common';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';
import { ProgrammePlanningService } from '../../src/programme-planning/programme-planning.service';
import {
  GddpImportAuthorityEvidence,
  GddpImportBootstrapContext,
  ResolvedGddpDraftPackage,
} from '../../src/programme-planning/gddp-workbook-importer.service';

integration('GddpWorkbookImport (PostgreSQL integration P4-073)', () => {
  const h = new Phase01Harness();
  let service: ProgrammePlanningService;

  async function clean(): Promise<void> {
    await h.clean();
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

  async function createValidEnvironment() {
    const year = await h.prisma.academicYear.create({
      data: {
        code: normalizedCode('Y_GDDP'),
        name: 'Năm học 2026-2027',
      },
    });

    const teacher = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_gddp_t').toLowerCase(),
        passwordHash: 'hash',
        status: 'ACTIVE',
        profile: {
          create: {
            displayName: 'Nguyễn Văn Địa Phương',
            staffCode: 'GV01',
            isTeachingStaff: true,
          },
        },
      },
    });

    const calVersion = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T00:00:00.000Z'),
        officialWeekCount: 35,
        reserveWeekCount: 1,
        teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        isActive: true,
        activatedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    const week1 = await h.prisma.academicWeek.create({
      data: {
        calendarVersionId: calVersion.id,
        kind: 'OFFICIAL',
        officialWeekNumber: 1,
        displayLabel: 'Tuần 1',
        sortOrder: 1,
      },
    });

    const segment1 = await h.prisma.academicWeekSegment.create({
      data: {
        academicWeekId: week1.id,
        calendarVersionId: calVersion.id,
        label: 'Đoạn 1',
        segmentOrder: 1,
        startDate: new Date('2026-09-07T00:00:00.000Z'),
        endDate: new Date('2026-09-12T00:00:00.000Z'),
      },
    });

    const class10A = await h.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: '10A',
        name: 'Lớp 10A',
        gradeLevel: 10,
        status: 'ACTIVE',
      },
    });

    const class10B = await h.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: '10B',
        name: 'Lớp 10B',
        gradeLevel: 10,
        status: 'ACTIVE',
      },
    });

    const slotM1 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 1,
        displayLabel: 'Thứ 2 Tiết 1',
        startTime: new Date('1970-01-01T07:00:00.000Z'),
        endTime: new Date('1970-01-01T07:45:00.000Z'),
        isActive: true,
      },
    });

    const lifecycleAt = new Date('2026-09-01T00:00:00.000Z');
    const tkbVersion = await h.prisma.timetableVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        status: 'ACTIVE',
        calendarVersionId: calVersion.id,
        effectiveAcademicWeekId: week1.id,
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        createdByUserId: teacher.id,
        validatedByUserId: teacher.id,
        validatedAt: lifecycleAt,
        approvedByUserId: teacher.id,
        approvedAt: lifecycleAt,
        activatedByUserId: teacher.id,
        activatedAt: lifecycleAt,
      },
    });

    const marker10A = await h.prisma.timetableSpecialProgrammeMarker.create({
      data: {
        timetableVersionId: tkbVersion.id,
        academicYearId: year.id,
        schoolClassId: class10A.id,
        timeSlotDefinitionId: slotM1.id,
        kind: 'GDDP',
      },
    });

    const marker10B = await h.prisma.timetableSpecialProgrammeMarker.create({
      data: {
        timetableVersionId: tkbVersion.id,
        academicYearId: year.id,
        schoolClassId: class10B.id,
        timeSlotDefinitionId: slotM1.id,
        kind: 'GDDP',
      },
    });

    const authorityEvidence: GddpImportAuthorityEvidence = {
      academicYearId: year.id,
      gradeLevel: 10,
      targetClassIds: [class10A.id, class10B.id],
      calendar: {
        calendarVersionId: calVersion.id,
        teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        interruptions: [],
      },
      weeks: [{ officialWeekNumber: 1, academicWeekId: week1.id }],
      segments: [
        { academicWeekId: week1.id, segmentId: segment1.id, startDate: '2026-09-07', endDate: '2026-09-12' },
      ],
      dateAuthorities: [
        { sourceRowNumber: 2, civilDate: '2026-09-07', timetableVersionId: tkbVersion.id },
      ],
      markerEvidence: [
        {
          sourceRowNumber: 2,
          civilDate: '2026-09-07',
          markerId: marker10A.id,
          timetableVersionId: tkbVersion.id,
          schoolClassId: class10A.id,
          timeSlotDefinitionId: slotM1.id,
          kind: 'GDDP',
        },
        {
          sourceRowNumber: 2,
          civilDate: '2026-09-07',
          markerId: marker10B.id,
          timetableVersionId: tkbVersion.id,
          schoolClassId: class10B.id,
          timeSlotDefinitionId: slotM1.id,
          kind: 'GDDP',
        },
      ],
      resolvedTeachers: [
        {
          sourceRowNumber: 2,
          staffCode: 'GV01',
          matchedUserId: teacher.id,
          displayName: 'Nguyễn Văn Địa Phương',
        },
      ],
    };

    const draftPackage: ResolvedGddpDraftPackage = {
      academicYearId: year.id,
      gradeLevel: 10,
      previewFingerprint: 'canonical-gddp-preview-fp-postgres-073',
      topics: [
        { sequence: 1, title: 'Chủ đề 1: Tổng quan GDĐP Lớp 10', requiredPeriods: 1, ppctCoordinates: [1] },
      ],
      occurrences: [
        {
          topicSequence: 1,
          civilDate: '2026-09-07',
          mode: 'GRADE',
          gradeLevel: 10,
          schoolClassId: null,
          slots: [
            {
              timeSlotDefinitionId: slotM1.id,
              teacherUserIds: [teacher.id],
            },
          ],
        },
      ],
    };

    const bootstrapContext: GddpImportBootstrapContext = {
      expectedProgrammeMasterId: null,
      canBootstrapMaster: true,
    };

    return {
      year,
      teacher,
      calVersion,
      week1,
      segment1,
      class10A,
      class10B,
      slotM1,
      tkbVersion,
      marker10A,
      marker10B,
      authorityEvidence,
      draftPackage,
      bootstrapContext,
    };
  }

  it('atomically creates GDDP DRAFT package with GRADE occurrence and supports idempotent replay', async () => {
    const env = await createValidEnvironment();

    // 1. Initial import succeeds
    const result1 = await service.importGddpDraftPackage(
      env.teacher.id,
      'cmd-gddp-import-001',
      env.draftPackage,
      env.bootstrapContext,
      env.authorityEvidence,
    );

    expect(result1.status).toBe('DRAFT');
    expect(result1.outcome).toBe('CREATED');
    expect(result1.topicItemCount).toBe(1);
    expect(result1.occurrenceCount).toBe(1);
    expect(result1.slotCount).toBe(1);
    expect(result1.staffingCount).toBe(1);

    // Verify DB state
    const master = await h.prisma.programmeMaster.findUnique({
      where: { id: result1.programmeMasterId },
    });
    expect(master).not.toBeNull();
    expect(master!.kind).toBe('GDDP');
    expect(master!.gradeLevel).toBe(10);

    const plan = await h.prisma.programmePlanVersion.findUnique({
      where: { id: result1.programmePlanVersionId },
    });
    expect(plan).not.toBeNull();
    expect(plan!.status).toBe('DRAFT');

    const topics = await h.prisma.programmeTopicItem.findMany({
      where: { programmePlanVersionId: result1.programmePlanVersionId },
    });
    expect(topics).toHaveLength(1);
    expect(topics[0]!.title).toBe('Chủ đề 1: Tổng quan GDĐP Lớp 10');
    expect(topics[0]!.requiredPeriods).toBe(1);

    const occurrences = await h.prisma.plannedProgrammeOccurrence.findMany({
      where: { programmePlanVersionId: result1.programmePlanVersionId },
    });
    expect(occurrences).toHaveLength(1);
    // Verified GRADE mode, no class fan-out
    expect(occurrences[0]!.mode).toBe('GRADE');
    expect(occurrences[0]!.gradeLevel).toBe(10);
    expect(occurrences[0]!.schoolClassId).toBeNull();

    const slots = await h.prisma.plannedOccurrenceSlot.findMany({
      where: { plannedProgrammeOccurrenceId: occurrences[0]!.id },
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]!.timeSlotDefinitionId).toBe(env.slotM1.id);

    const staffing = await h.prisma.plannedSlotStaffing.findMany({
      where: { plannedOccurrenceSlotId: slots[0]!.id },
    });
    expect(staffing).toHaveLength(1);
    expect(staffing[0]!.teacherUserId).toBe(env.teacher.id);

    // 2. Exact idempotent replay succeeds
    const replayResult = await service.importGddpDraftPackage(
      env.teacher.id,
      'cmd-gddp-import-001',
      env.draftPackage,
      env.bootstrapContext,
      env.authorityEvidence,
    );
    expect(replayResult.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(replayResult.programmePlanVersionId).toBe(result1.programmePlanVersionId);

    // 3. Command reuse with changed payload throws ConflictException
    const modifiedPackage: ResolvedGddpDraftPackage = {
      ...env.draftPackage,
      previewFingerprint: 'different-fingerprint-hex',
    };
    await expect(
      service.importGddpDraftPackage(
        env.teacher.id,
        'cmd-gddp-import-001',
        modifiedPackage,
        env.bootstrapContext,
        env.authorityEvidence,
      ),
    ).rejects.toThrow(ConflictException);

    // 4. New import when DRAFT already exists is blocked
    await expect(
      service.importGddpDraftPackage(
        env.teacher.id,
        'cmd-gddp-import-002',
        env.draftPackage,
        env.bootstrapContext,
        env.authorityEvidence,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rolls back atomically and leaves no partial rows on transaction failure', async () => {
    const env = await createValidEnvironment();

    // Corrupt package with invalid weekday to cause validation failure inside transaction
    const corruptedPackage: ResolvedGddpDraftPackage = {
      ...env.draftPackage,
      occurrences: [
        {
          ...env.draftPackage.occurrences[0]!,
          civilDate: '2026-09-08', // TUESDAY, but slot definition is MONDAY
        },
      ],
    };

    await expect(
      service.importGddpDraftPackage(
        env.teacher.id,
        'cmd-gddp-fail-atomic',
        corruptedPackage,
        env.bootstrapContext,
        env.authorityEvidence,
      ),
    ).rejects.toThrow();

    // Verify atomic rollback: no masters, plan versions, or occurrences created
    const mastersCount = await h.prisma.programmeMaster.count({ where: { academicYearId: env.year.id } });
    const versionsCount = await h.prisma.programmePlanVersion.count();
    const occurrencesCount = await h.prisma.plannedProgrammeOccurrence.count();
    expect(mastersCount).toBe(0);
    expect(versionsCount).toBe(0);
    expect(occurrencesCount).toBe(0);
  });

  it('rejects with ConflictException when active class set changes before confirmation', async () => {
    const env = await createValidEnvironment();

    // Before transaction commits, a new active class 10C is added to Grade 10
    await h.prisma.schoolClass.create({
      data: {
        academicYearId: env.year.id,
        code: '10C',
        name: 'Lớp 10C',
        gradeLevel: 10,
        status: 'ACTIVE',
      },
    });

    await expect(
      service.importGddpDraftPackage(
        env.teacher.id,
        'cmd-gddp-class-scope-drift',
        env.draftPackage,
        env.bootstrapContext,
        env.authorityEvidence,
      ),
    ).rejects.toThrow(ConflictException);
  });
});
