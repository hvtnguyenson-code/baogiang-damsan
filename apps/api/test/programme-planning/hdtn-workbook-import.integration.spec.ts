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
        code: normalizedCode('Y'),
        name: 'Năm học 2026-2027',
      },
    });

    const teacherA = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_ta'),
        passwordHash: 'hash',
        status: 'ACTIVE',
        profile: {
          create: {
            displayName: 'Nguyễn Văn A',
            isTeachingStaff: true,
          },
        },
      },
    });

    const gvcn10A = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_g10a'),
        passwordHash: 'hash',
        status: 'ACTIVE',
        profile: {
          create: {
            displayName: 'Trần Thị B',
            isTeachingStaff: true,
          },
        },
      },
    });

    const gvcn10B = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_g10b'),
        passwordHash: 'hash',
        status: 'ACTIVE',
        profile: {
          create: {
            displayName: 'Lê Văn C',
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

    const hr10A = await h.prisma.homeroomAssignment.create({
      data: {
        academicYearId: year.id,
        schoolClassId: class10A.id,
        teacherUserId: gvcn10A.id,
        status: 'ACTIVE',
        validFrom: new Date('2026-09-01T00:00:00.000Z'),
        createdByUserId: teacherA.id,
      },
    });

    const hr10B = await h.prisma.homeroomAssignment.create({
      data: {
        academicYearId: year.id,
        schoolClassId: class10B.id,
        teacherUserId: gvcn10B.id,
        status: 'ACTIVE',
        validFrom: new Date('2026-09-01T00:00:00.000Z'),
        createdByUserId: teacherA.id,
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

    const slotM2 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 2,
        displayLabel: 'Thứ 2 Tiết 2',
        startTime: new Date('1970-01-01T07:50:00.000Z'),
        endTime: new Date('1970-01-01T08:35:00.000Z'),
        isActive: true,
      },
    });

    const tkbVersion = await h.prisma.timetableVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        status: 'ACTIVE',
        calendarVersionId: calVersion.id,
        effectiveAcademicWeekId: week1.id,
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        createdByUserId: teacherA.id,
      },
    });

    const marker1 = await h.prisma.timetableSpecialProgrammeMarker.create({
      data: {
        timetableVersionId: tkbVersion.id,
        academicYearId: year.id,
        schoolClassId: class10A.id,
        timeSlotDefinitionId: slotM1.id,
        kind: 'HDTN_HN',
      },
    });

    const marker2 = await h.prisma.timetableSpecialProgrammeMarker.create({
      data: {
        timetableVersionId: tkbVersion.id,
        academicYearId: year.id,
        schoolClassId: class10B.id,
        timeSlotDefinitionId: slotM2.id,
        kind: 'HDTN_HN',
      },
    });

    const authorityEvidence: HdtnImportAuthorityEvidence = {
      academicYearId: year.id,
      calendar: {
        calendarVersionId: calVersion.id,
      },
      weeks: [
        { officialWeekNumber: 1, academicWeekId: week1.id },
      ],
      segments: [
        { academicWeekId: week1.id, segmentId: segment1.id, startDate: '2026-09-07', endDate: '2026-09-12' },
      ],
      scopeSnapshots: [
        { sourceRowNumber: 1, organizingScope: 'CLASS', gradeLevel: 10, targetClassIds: [class10A.id, class10B.id] },
      ],
      dateAuthorities: [
        { sourceRowNumber: 1, civilDate: '2026-09-07', timetableVersionId: tkbVersion.id },
      ],
      markerEvidence: [
        { sourceRowNumber: 1, civilDate: '2026-09-07', markerId: marker1.id, timetableVersionId: tkbVersion.id, schoolClassId: class10A.id, timeSlotDefinitionId: slotM1.id, kind: 'HDTN_HN' },
        { sourceRowNumber: 1, civilDate: '2026-09-07', markerId: marker2.id, timetableVersionId: tkbVersion.id, schoolClassId: class10B.id, timeSlotDefinitionId: slotM2.id, kind: 'HDTN_HN' },
      ],
      homeroomAssignments: [
        { civilDate: '2026-09-07', schoolClassId: class10A.id, homeroomAssignmentId: hr10A.id, teacherUserId: gvcn10A.id },
        { civilDate: '2026-09-07', schoolClassId: class10B.id, homeroomAssignmentId: hr10B.id, teacherUserId: gvcn10B.id },
      ],
      explicitTeacherUserIds: [teacherA.id],
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

    return {
      year,
      teacherA,
      gvcn10A,
      gvcn10B,
      calVersion,
      week1,
      segment1,
      class10A,
      class10B,
      slotM1,
      slotM2,
      tkbVersion,
      marker1,
      marker2,
      authorityEvidence,
      draftPackage,
      bootstrapContext,
    };
  }

  it('atomically creates DRAFT package and supports idempotent replay or conflict rejection', async () => {
    const env = await createValidEnvironment();

    // 1. Initial import succeeds
    const result1 = await service.importHdtnDraftPackage(
      env.teacherA.id,
      'cmd-pg-import-001',
      env.draftPackage,
      env.bootstrapContext,
      env.authorityEvidence,
    );
    expect(result1.status).toBe('DRAFT');
    expect(result1.outcome).toBe('CREATED');

    // Verify DB state
    const createdPlan = await h.prisma.programmePlanVersion.findUnique({
      where: { id: result1.programmePlanVersionId },
    });
    expect(createdPlan).not.toBeNull();

    const topics = await h.prisma.programmeTopicItem.findMany({
      where: { programmePlanVersionId: result1.programmePlanVersionId },
    });
    const occurrences = await h.prisma.plannedProgrammeOccurrence.findMany({
      where: { programmePlanVersionId: result1.programmePlanVersionId },
    });
    expect(topics.length).toBe(1);
    expect(occurrences.length).toBe(2);

    // Finding A: verify per-class slots preserved in DB
    const occ10A = occurrences.find((o) => o.schoolClassId === env.class10A.id);
    const occ10B = occurrences.find((o) => o.schoolClassId === env.class10B.id);
    expect(occ10A).toBeDefined();
    expect(occ10B).toBeDefined();

    const slots10A = await h.prisma.plannedOccurrenceSlot.findMany({
      where: { plannedProgrammeOccurrenceId: occ10A!.id },
    });
    const slots10B = await h.prisma.plannedOccurrenceSlot.findMany({
      where: { plannedProgrammeOccurrenceId: occ10B!.id },
    });
    expect(slots10A.length).toBe(1);
    expect(slots10A[0]!.timeSlotDefinitionId).toBe(env.slotM1.id);
    expect(slots10B.length).toBe(1);
    expect(slots10B[0]!.timeSlotDefinitionId).toBe(env.slotM2.id);

    // 2. Exact idempotent replay succeeds
    const replayResult = await service.importHdtnDraftPackage(
      env.teacherA.id,
      'cmd-pg-import-001',
      env.draftPackage,
      env.bootstrapContext,
      env.authorityEvidence,
    );
    expect(replayResult.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(replayResult.programmePlanVersionId).toBe(result1.programmePlanVersionId);

    // 3. Command reuse with changed payload throws ConflictException
    const modifiedPackage: ResolvedHdtnDraftPackage = {
      ...env.draftPackage,
      previewFingerprint: 'different-fingerprint',
    };
    await expect(
      service.importHdtnDraftPackage(
        env.teacherA.id,
        'cmd-pg-import-001',
        modifiedPackage,
        env.bootstrapContext,
        env.authorityEvidence,
      ),
    ).rejects.toThrow(ConflictException);

    // 4. New import when DRAFT already exists is blocked
    await expect(
      service.importHdtnDraftPackage(
        env.teacherA.id,
        'cmd-pg-import-002',
        env.draftPackage,
        env.bootstrapContext,
        env.authorityEvidence,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rolls back atomically and leaves no partial rows on transaction failure', async () => {
    const env = await createValidEnvironment();

    // Corrupt package with invalid weekday to cause validation failure inside transaction
    const corruptedPackage: ResolvedHdtnDraftPackage = {
      ...env.draftPackage,
      occurrences: [
        {
          ...env.draftPackage.occurrences[0],
          civilDate: '2026-09-08', // TUESDAY, but slot is MONDAY
        },
      ],
    };

    await expect(
      service.importHdtnDraftPackage(
        env.teacherA.id,
        'cmd-pg-fail-atomic',
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

  it('rejects with ConflictException when new active class appears in scope before transaction', async () => {
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
      service.importHdtnDraftPackage(
        env.teacherA.id,
        'cmd-pg-scope-race',
        env.draftPackage,
        env.bootstrapContext,
        env.authorityEvidence,
      ),
    ).rejects.toThrow(ConflictException);
  });
});
