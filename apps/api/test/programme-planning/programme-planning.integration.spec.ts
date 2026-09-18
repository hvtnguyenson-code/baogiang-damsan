import { ProgrammePlanningService } from '../../src/programme-planning/programme-planning.service';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';

integration('Programme Planning Control Plane (PostgreSQL integration)', () => {
  const h = new Phase01Harness();
  let service: ProgrammePlanningService;

  async function clean(): Promise<void> {
    await h.prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "programme_planning_commands",
        "planned_slot_staffing",
        "planned_occurrence_slots",
        "planned_programme_occurrences",
        "programme_topic_items",
        "programme_plan_versions",
        "programme_masters"
      CASCADE;
    `);
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

    await h.prisma.staffProfile.update({
      where: { userId: teacherA.id },
      data: {
        displayName: 'Giáo viên A',
        isTeachingStaff: true,
      },
    });

    await h.prisma.staffProfile.update({
      where: { userId: teacherB.id },
      data: {
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
        activatedAt: new Date('2026-09-01T00:00:00.000Z'),
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

    // 3. Publish Plan Version V1
    const publishedV1 = await service.publishPlanVersion(
      planV1.id,
      { expectedRevision: 1, commandId: 'cmd-int-pub-v1' },
      f.actor.id,
    );
    expect(publishedV1.status).toBe('PUBLISHED');

    // 3b. Generic draft rejected after master has published history
    await expect(
      service.createDraftPlanVersion(
        { programmeMasterId: gddpMaster.id, commandId: 'cmd-int-plan-unlineaged' },
        f.actor.id,
      ),
    ).rejects.toThrow();

    // 3c. Successor draft retains lineage and supersedes V1 upon publish
    const successorV2 = await service.createSuccessorDraftPlanVersion(
      {
        programmeMasterId: gddpMaster.id,
        predecessorVersionId: publishedV1.id,
        changeReason: 'Cập nhật phân phối số tiết học kì 2',
        commandId: 'cmd-int-plan-succ-v2',
      },
      f.actor.id,
    );
    expect(successorV2.versionNumber).toBe(2);
    expect(successorV2.status).toBe('DRAFT');
    expect(successorV2.predecessorVersionId).toBe(publishedV1.id);

    const publishedV2 = await service.publishPlanVersion(
      successorV2.id,
      { expectedRevision: 1, commandId: 'cmd-int-pub-v2' },
      f.actor.id,
    );
    expect(publishedV2.status).toBe('PUBLISHED');
    const supersededV1 = await service.getPlanVersion(publishedV1.id);
    expect(supersededV1.status).toBe('SUPERSEDED');

    // 4. Occurrence: Monday 2026-10-05 with slotMon1 on published V2
    const occ = await service.createDraftOccurrence(
      {
        programmeMasterId: gddpMaster.id,
        programmePlanVersionId: publishedV2.id,
        programmeTopicItemId: publishedV2.topicItems[0].id,
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

    // 4b. Partial edit without mode preserves CLASS mode and schoolClassId
    const editedOcc = await service.editDraftOccurrence(
      occ.id,
      {
        expectedRevision: 1,
        note: 'Ghi chú cập nhật không đổi mode',
        commandId: 'cmd-int-occ-edit-partial',
      },
      f.actor.id,
    );
    expect(editedOcc.mode).toBe('CLASS');
    expect(editedOcc.schoolClassId).toBe(f.class10A.id);
    expect(editedOcc.note).toBe('Ghi chú cập nhật không đổi mode');

    // 5. Publish Occurrence
    const publishedOcc = await service.publishOccurrence(
      occ.id,
      { expectedRevision: 2, commandId: 'cmd-int-pub-occ-1' },
      f.actor.id,
    );
    expect(publishedOcc.status).toBe('PUBLISHED');
  });
});
