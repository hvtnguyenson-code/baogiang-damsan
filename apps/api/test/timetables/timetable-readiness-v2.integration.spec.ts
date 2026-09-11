import { CatalogStatus, PpctVersionStatus, UserStatus } from '@prisma/client';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';

integration('deterministic component-aware timetable readiness V2 (PostgreSQL)', () => {
  const h = new Phase01Harness();

  async function clean(): Promise<void> {
    await h.prisma.ppctItemLineage.deleteMany();
    await h.prisma.ppctClassAssociation.deleteMany();
    await h.prisma.ppctItemRevision.deleteMany();
    await h.prisma.ppctItem.deleteMany();
    await h.prisma.ppctVersion.deleteMany();
    await h.prisma.ppctPlan.deleteMany();
    await h.clean();
  }

  beforeAll(async () => h.start());
  afterAll(async () => {
    try { await clean(); } finally { await h.stop(); }
  });
  beforeEach(async () => {
    await clean();
    await h.seedCapabilities([
      { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'PPCT_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
  });

  async function fixture(actorUserId: string) {
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });
    const calendar = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date('2026-09-01Z'),
        endDate: new Date('2027-05-31Z'),
        officialWeekCount: 1,
        reserveWeekCount: 1,
        teachingWeekdays: ['MONDAY', 'TUESDAY'],
        isActive: false,
      },
    });
    const reserveWeek = await h.prisma.academicWeek.create({
      data: {
        calendarVersionId: calendar.id,
        kind: 'RESERVE',
        reserveWeekNumber: 1,
        displayLabel: 'DP1',
        sortOrder: 1,
      },
    });
    const officialWeek = await h.prisma.academicWeek.create({
      data: {
        calendarVersionId: calendar.id,
        kind: 'OFFICIAL',
        officialWeekNumber: 1,
        displayLabel: 'T1',
        sortOrder: 2,
      },
    });
    await h.prisma.academicWeekSegment.createMany({
      data: [
        { academicWeekId: reserveWeek.id, calendarVersionId: calendar.id, label: 'DP1a', segmentOrder: 1, startDate: new Date('2026-09-07Z'), endDate: new Date('2026-09-07Z') },
        { academicWeekId: reserveWeek.id, calendarVersionId: calendar.id, label: 'DP1b', segmentOrder: 2, startDate: new Date('2026-09-08Z'), endDate: new Date('2026-09-08Z') },
        { academicWeekId: officialWeek.id, calendarVersionId: calendar.id, label: 'T1', segmentOrder: 1, startDate: new Date('2026-09-21Z'), endDate: new Date('2026-09-21Z') },
      ],
    });
    const schoolClass = await h.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: normalizedCode('C'),
        name: '10A1',
        gradeLevel: 10,
        status: CatalogStatus.ACTIVE,
      },
    });
    const subject = await h.prisma.subject.create({
      data: { code: normalizedCode('S'), name: 'Toán', status: CatalogStatus.ACTIVE },
    });
    const teacher = await h.prisma.user.create({
      data: {
        username: `teacher-${crypto.randomUUID().slice(0, 8)}`,
        passwordHash: await h.passwords.hash('TeacherPassword9'),
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
        profile: { create: { displayName: 'Giáo viên', isTeachingStaff: true } },
      },
    });
    const assignment = await h.prisma.teachingAssignment.create({
      data: {
        academicYearId: year.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teacherUserId: teacher.id,
        validFrom: new Date('2026-09-01Z'),
        validUntil: new Date('2027-05-31Z'),
      },
    });
    const mondaySlot = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Tiết 1',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        isActive: true,
        allowRegularTeaching: true,
        allowMakeupTeaching: false,
        allowSelfStudy: false,
      },
    });
    const tuesdaySlot = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'TUESDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Tiết 1',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        isActive: true,
        allowRegularTeaching: true,
        allowMakeupTeaching: false,
        allowSelfStudy: false,
      },
    });
    const timetable = await h.prisma.timetableVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        status: 'VALIDATED',
        calendarVersionId: calendar.id,
        effectiveAcademicWeekId: reserveWeek.id,
        effectiveFrom: new Date('2026-09-07Z'),
        createdByUserId: actorUserId,
        validatedByUserId: actorUserId,
        validatedAt: new Date('2026-08-14T00:00:00Z'),
      },
    });
    await h.prisma.timetableEntry.createMany({
      data: [
        {
          timetableVersionId: timetable.id,
          academicYearId: year.id,
          weekday: 'MONDAY',
          timeSlotDefinitionId: mondaySlot.id,
          schoolClassId: schoolClass.id,
          subjectId: subject.id,
          teachingAssignmentId: assignment.id,
          teacherUserId: teacher.id,
        },
        {
          timetableVersionId: timetable.id,
          academicYearId: year.id,
          weekday: 'TUESDAY',
          timeSlotDefinitionId: tuesdaySlot.id,
          schoolClassId: schoolClass.id,
          subjectId: subject.id,
          teachingAssignmentId: assignment.id,
          teacherUserId: teacher.id,
        },
      ],
    });
    const plan = await h.prisma.ppctPlan.create({
      data: { academicYearId: year.id, subjectId: subject.id, gradeLevel: 10 },
    });
    const ppctVersion = await h.prisma.ppctVersion.create({
      data: {
        ppctPlanId: plan.id,
        versionNumber: 1,
        status: PpctVersionStatus.PUBLISHED,
        createdByUserId: actorUserId,
        publishedByUserId: actorUserId,
        publishedAt: new Date('2026-08-14T00:00:00Z'),
      },
    });
    const item1 = await h.prisma.ppctItem.create({ data: { ppctPlanId: plan.id, component: 'CORE' } });
    await h.prisma.ppctItemRevision.create({
      data: {
        ppctVersionId: ppctVersion.id,
        ppctPlanId: plan.id,
        ppctItemId: item1.id,
        component: 'CORE',
        sequence: 1,
        title: 'Tiết 1: Đọc',
        lessonType: 'Lý thuyết',
      },
    });
    const item2 = await h.prisma.ppctItem.create({ data: { ppctPlanId: plan.id, component: 'CORE' } });
    await h.prisma.ppctItemRevision.create({
      data: {
        ppctVersionId: ppctVersion.id,
        ppctPlanId: plan.id,
        ppctItemId: item2.id,
        component: 'CORE',
        sequence: 2,
        title: 'Tiết 2: Viết',
        lessonType: 'Lý thuyết',
      },
    });
    const association = await h.prisma.ppctClassAssociation.create({
      data: {
        academicYearId: year.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        gradeLevel: 10,
        ppctPlanId: plan.id,
        ppctVersionId: ppctVersion.id,
        curricularProfile: 'CORE_ONLY',
        effectiveFrom: new Date('2026-09-01Z'),
        effectiveUntil: null,
        createdByUserId: actorUserId,
      },
    });
    return { year, calendar, reserveWeek, schoolClass, subject, teacher, timetable, plan, ppctVersion, association };
  }

  it('evaluates explicit V2 profile via HTTP and preserves V1 when omitted', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const f = await fixture(manager.id);

    // 1. Without profile query param -> resolves V1
    const v1Res = await manager.agent.get(
      `/api/timetable-versions/${f.timetable.id}/readiness?from=2026-09-07&to=2026-09-08`,
    );
    expect(v1Res.status).toBe(200);
    expect(v1Res.body.profile).toBe('NORMAL_BASE_PPCT_V1');
    expect(v1Res.body.productLabel).toBe('TIMETABLE READINESS — NORMAL BASE + PPCT BINDING');
    expect(v1Res.body.result).toBe('PASS');
    expect(v1Res.body.dimensions.find((d: { key: string }) => d.key === 'PPCT_CAPACITY')).toMatchObject({
      key: 'PPCT_CAPACITY',
      state: 'NOT_ASSESSED',
      required: false,
    });

    // 2. With profile=NORMAL_BASE_PPCT_COMPONENT_V2 -> resolves V2
    const v2Res = await manager.agent.get(
      `/api/timetable-versions/${f.timetable.id}/readiness?from=2026-09-07&to=2026-09-08&profile=NORMAL_BASE_PPCT_COMPONENT_V2`,
    );
    expect(v2Res.status).toBe(200);
    expect(v2Res.body.profile).toBe('NORMAL_BASE_PPCT_COMPONENT_V2');
    expect(v2Res.body.productLabel).toBe('TIMETABLE READINESS — NORMAL BASE + PPCT COMPONENT');
    expect(v2Res.body.result).toBe('PASS');
    expect(v2Res.body.dimensions.find((d: { key: string }) => d.key === 'PPCT_CAPACITY')).toMatchObject({
      key: 'PPCT_CAPACITY',
      state: 'PASS',
      required: true,
    });
  });

  it('fails closed on V2 when CORE_PLUS_SPECIALIZED_STUDY lacks specialized content, while V1 remains PASS', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const f = await fixture(manager.id);

    // Change association to CORE_PLUS_SPECIALIZED_STUDY (no SPECIALIZED_STUDY items exist in ppctVersion)
    await h.prisma.ppctClassAssociation.update({
      where: { id: f.association.id },
      data: { curricularProfile: 'CORE_PLUS_SPECIALIZED_STUDY' },
    });

    // V1 evaluation remains PASS (unaware of curricular component requirements)
    const v1Res = await manager.agent.get(
      `/api/timetable-versions/${f.timetable.id}/readiness?from=2026-09-07&to=2026-09-08`,
    );
    expect(v1Res.status).toBe(200);
    expect(v1Res.body.profile).toBe('NORMAL_BASE_PPCT_V1');
    expect(v1Res.body.result).toBe('PASS');

    // V2 evaluation fails closed with PPCT_SPECIALIZED_CONTENT_MISSING
    const v2Res = await manager.agent.get(
      `/api/timetable-versions/${f.timetable.id}/readiness?from=2026-09-07&to=2026-09-08&profile=NORMAL_BASE_PPCT_COMPONENT_V2`,
    );
    expect(v2Res.status).toBe(200);
    expect(v2Res.body.profile).toBe('NORMAL_BASE_PPCT_COMPONENT_V2');
    expect(v2Res.body.result).toBe('FAIL');
    expect(v2Res.body.findings).toContainEqual(
      expect.objectContaining({
        code: 'PPCT_SPECIALIZED_CONTENT_MISSING',
        dimension: 'PPCT_CAPACITY',
        severity: 'BLOCKER',
      }),
    );
    expect(v2Res.body.dimensions.find((d: { key: string }) => d.key === 'PPCT_CAPACITY')).toMatchObject({
      key: 'PPCT_CAPACITY',
      state: 'FAIL',
      required: true,
    });

    // Add a SPECIALIZED_STUDY item revision to ppctVersion
    const specItem = await h.prisma.ppctItem.create({
      data: { ppctPlanId: f.plan.id, component: 'SPECIALIZED_STUDY' },
    });
    await h.prisma.ppctItemRevision.create({
      data: {
        ppctVersionId: f.ppctVersion.id,
        ppctPlanId: f.plan.id,
        ppctItemId: specItem.id,
        component: 'SPECIALIZED_STUDY',
        sequence: 3,
        title: 'Chuyên đề 1: Chuyên đề học tập',
        lessonType: 'Chuyên đề',
      },
    });

    // Now V2 passes
    const v2Fixed = await manager.agent.get(
      `/api/timetable-versions/${f.timetable.id}/readiness?from=2026-09-07&to=2026-09-08&profile=NORMAL_BASE_PPCT_COMPONENT_V2`,
    );
    expect(v2Fixed.status).toBe(200);
    expect(v2Fixed.body.result).toBe('PASS');
    expect(v2Fixed.body.dimensions.find((d: { key: string }) => d.key === 'PPCT_CAPACITY')).toMatchObject({
      key: 'PPCT_CAPACITY',
      state: 'PASS',
      required: true,
    });
  });
});
