import { ProgrammePlanningService } from '../../src/programme-planning/programme-planning.service';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';

integration('Programme Planning Control Plane (PostgreSQL integration)', () => {
  const h = new Phase01Harness();
  let service: ProgrammePlanningService;

  async function clean(): Promise<void> {
    await h.prisma.programmePlanningCommand.deleteMany();
    await h.prisma.plannedSlotStaffing.deleteMany();
    await h.prisma.plannedOccurrenceSlot.deleteMany();
    await h.prisma.plannedProgrammeOccurrence.deleteMany();
    await h.prisma.programmeTopicItem.deleteMany();
    await h.prisma.programmePlanVersion.deleteMany();
    await h.prisma.programmeMaster.deleteMany();
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

  async function setupFixture() {
    const actor = await h.actor();
    const teacherA = await h.actor();
    const teacherB = await h.actor();

    await h.prisma.staffProfile.create({
      data: {
        userId: teacherA.id,
        displayName: 'Giáo viên A',
        isTeachingStaff: true,
      },
    });

    await h.prisma.staffProfile.create({
      data: {
        userId: teacherB.id,
        displayName: 'Giáo viên B',
        isTeachingStaff: true,
      },
    });

    const year = await h.prisma.academicYear.create({
      data: {
        code: normalizedCode('Y'),
        name: 'Năm học 2026-2027',
      },
    });

    const calendar = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T00:00:00.000Z'),
        officialWeekCount: 35,
        reserveWeekCount: 1,
        teachingWeekdays: ['MONDAY', 'TUESDAY'],
        isActive: true,
      },
    });

    const class10A = await h.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: normalizedCode('C10'),
        name: '10A1',
        gradeLevel: 10,
      },
    });

    const class11A = await h.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: normalizedCode('C11'),
        name: '11A1',
        gradeLevel: 11,
      },
    });

    const slotMon1 = await h.prisma.timeSlotDefinition.create({
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

    const slotTue1 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'TUESDAY',
        session: 'MORNING',
        ordinal: 1,
        displayLabel: 'Thứ 3 Tiết 1',
        startTime: new Date('1970-01-01T07:00:00.000Z'),
        endTime: new Date('1970-01-01T07:45:00.000Z'),
        isActive: true,
      },
    });

    return {
      actor,
      teacherA,
      teacherB,
      year,
      calendar,
      class10A,
      class11A,
      slotMon1,
      slotTue1,
    };
  }

  it('enforces DB invariants for programme master, plan versions, and occurrences', async () => {
    const f = await setupFixture();

    // 1. Create GDDP Master
    const gddpMaster = await service.createMaster(
      {
        academicYearId: f.year.id,
        kind: 'GDDP',
        gradeLevel: 10,
        commandId: 'cmd-int-gddp-master',
      },
      f.actor.id,
    );
    expect(gddpMaster.kind).toBe('GDDP');
    expect(gddpMaster.gradeLevel).toBe(10);

    // 2. Create Plan Version with topics
    const planV1 = await service.createDraftPlanVersion(
      {
        programmeMasterId: gddpMaster.id,
        commandId: 'cmd-int-plan-v1',
        initialTopics: [
          { sequence: 1, title: 'GDDP Topic 1', requiredPeriods: 2 },
          { sequence: 2, title: 'GDDP Topic 2', requiredPeriods: 1 },
        ],
      },
      f.actor.id,
    );
    expect(planV1.versionNumber).toBe(1);
    expect(planV1.status).toBe('DRAFT');

    // 3. Publish Plan Version
    const publishedV1 = await service.publishPlanVersion(
      planV1.id,
      { expectedRevision: 1, commandId: 'cmd-int-pub-v1' },
      f.actor.id,
    );
    expect(publishedV1.status).toBe('PUBLISHED');

    // 4. Occurrence: Monday 2026-10-05 with slotMon1
    const occ = await service.createDraftOccurrence(
      {
        programmeMasterId: gddpMaster.id,
        programmePlanVersionId: publishedV1.id,
        programmeTopicItemId: publishedV1.topicItems[0].id,
        academicYearId: f.year.id,
        civilDate: '2026-10-05',
        mode: 'CLASS',
        schoolClassId: f.class10A.id,
        slots: [
          {
            timeSlotDefinitionId: f.slotMon1.id,
            teacherUserIds: [f.teacherA.id],
          },
        ],
        commandId: 'cmd-int-occ-1',
      },
      f.actor.id,
    );
    expect(occ.status).toBe('DRAFT');

    // 5. Publish Occurrence
    const publishedOcc = await service.publishOccurrence(
      occ.id,
      { expectedRevision: 1, commandId: 'cmd-int-pub-occ-1' },
      f.actor.id,
    );
    expect(publishedOcc.status).toBe('PUBLISHED');
  });
});
