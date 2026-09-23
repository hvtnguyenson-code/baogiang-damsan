import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';

integration('P4-072 DRAFT plan/occurrence database guard', () => {
  const h = new Phase01Harness();

  beforeAll(async () => {
    await h.start();
  });

  beforeEach(async () => {
    await h.clean();
  });

  afterAll(async () => {
    try {
      await h.clean();
    } finally {
      await h.stop();
    }
  });

  it('allows DRAFT/DRAFT import rows but blocks occurrence publication until the plan is PUBLISHED', async () => {
    const year = await h.prisma.academicYear.create({
      data: {
        code: normalizedCode('Y_DRAFT_GUARD'),
        name: 'Năm học kiểm thử DRAFT guard',
      },
    });

    const actor = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_draft_guard').toLowerCase(),
        passwordHash: 'hash',
        status: 'ACTIVE',
        profile: {
          create: {
            displayName: 'Giáo viên kiểm thử DRAFT guard',
            isTeachingStaff: true,
          },
        },
      },
    });

    const master = await h.prisma.programmeMaster.create({
      data: {
        academicYearId: year.id,
        kind: 'HDTN_HN',
        gradeLevel: null,
        createdByUserId: actor.id,
      },
    });

    const plan = await h.prisma.programmePlanVersion.create({
      data: {
        programmeMasterId: master.id,
        versionNumber: 1,
        status: 'DRAFT',
        draftRevision: 1,
        createdByUserId: actor.id,
      },
    });

    const topic = await h.prisma.programmeTopicItem.create({
      data: {
        programmePlanVersionId: plan.id,
        sequence: 1,
        title: 'Chủ đề kiểm thử',
        requiredPeriods: 1,
      },
    });

    const occurrence = await h.prisma.plannedProgrammeOccurrence.create({
      data: {
        programmeMasterId: master.id,
        programmePlanVersionId: plan.id,
        programmeTopicItemId: topic.id,
        academicYearId: year.id,
        civilDate: new Date('2026-09-07T00:00:00.000Z'),
        mode: 'SCHOOL_WIDE',
        status: 'DRAFT',
        draftRevision: 1,
        createdByUserId: actor.id,
      },
    });

    await expect(
      h.prisma.plannedProgrammeOccurrence.update({
        where: { id: occurrence.id },
        data: {
          status: 'PUBLISHED',
          publishedByUserId: actor.id,
          publishedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow();

    const stillDraft = await h.prisma.plannedProgrammeOccurrence.findUniqueOrThrow({
      where: { id: occurrence.id },
    });
    expect(stillDraft.status).toBe('DRAFT');
    expect(stillDraft.publishedByUserId).toBeNull();
    expect(stillDraft.publishedAt).toBeNull();

    const publishedAt = new Date('2026-09-02T00:00:00.000Z');
    await h.prisma.programmePlanVersion.update({
      where: { id: plan.id },
      data: {
        status: 'PUBLISHED',
        publishedByUserId: actor.id,
        publishedAt,
      },
    });

    const publishedOccurrence = await h.prisma.plannedProgrammeOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: 'PUBLISHED',
        publishedByUserId: actor.id,
        publishedAt,
      },
    });

    expect(publishedOccurrence.status).toBe('PUBLISHED');
    expect(publishedOccurrence.publishedByUserId).toBe(actor.id);
  });
});
