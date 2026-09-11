import {
  CatalogStatus,
  OperationalOverlayStatus,
  PpctClassCurricularProfile,
  PpctCurricularComponent,
  PpctVersionStatus,
  UserStatus,
} from '@prisma/client';
import { PpctOccurrenceAllocationService } from '../../src/ppct-occurrence-allocation/ppct-occurrence-allocation.service';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';

// Dates for 2 weeks:
// Week 1: Mon 2026-09-07, Thu 2026-09-10
// Week 2: Mon 2026-09-14, Thu 2026-09-17
const DATES = {
  W1_MON: '2026-09-07',
  W1_WED: '2026-09-09',
  W1_THU: '2026-09-10',
  W1_FRI: '2026-09-11',
  W2_MON: '2026-09-14',
  W2_THU: '2026-09-17',
} as const;

integration('PPCT occurrence allocation V2 read model (PostgreSQL)', () => {
  const h = new Phase01Harness();
  beforeAll(async () => h.start());
  afterAll(async () => {
    try {
      await clean();
    } finally {
      await h.stop();
    }
  });
  beforeEach(async () => clean());

  async function clean() {
    await h.prisma.specialActivityStaffing.deleteMany();
    await h.prisma.specialActivityClassTarget.deleteMany();
    await h.prisma.specialActivityTimeSlot.deleteMany();
    await h.prisma.specialActivity.deleteMany();
    await h.prisma.makeupTeachingSchedule.deleteMany();
    await h.prisma.operationalLessonDisposition.deleteMany();
    await h.prisma.calendarExceptionTimeSlot.deleteMany();
    await h.prisma.calendarException.deleteMany();
    await h.prisma.ppctItemLineage.deleteMany();
    await h.prisma.ppctClassAssociation.deleteMany();
    await h.prisma.ppctItemRevision.deleteMany();
    await h.prisma.ppctItem.deleteMany();
    await h.prisma.ppctVersion.deleteMany();
    await h.prisma.ppctPlan.deleteMany();
    await h.clean();
  }

  async function fixture(options: { nonContiguousSegments?: boolean; secondCalendar?: boolean } = {}) {
    const lifecycleAt = new Date('2026-08-01T00:00:00.000Z');
    const year = await h.prisma.academicYear.create({
      data: { code: normalizedCode('ALLOC2'), name: 'Allocation V2 year' },
    });
    const actor = await h.prisma.user.create({
      data: {
        username: `alloc2-${crypto.randomUUID().slice(0, 8)}`,
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
        profile: { create: { displayName: 'Allocation V2 actor', isTeachingStaff: true } },
      },
      include: { profile: true },
    });
    const calendar = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date('2026-09-01Z'),
        endDate: new Date('2027-05-31Z'),
        officialWeekCount: 35,
        reserveWeekCount: 1,
        teachingWeekdays: ['MONDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        isActive: true,
        activatedAt: lifecycleAt,
      },
    });

    // Week 1
    const week1 = await h.prisma.academicWeek.create({
      data: {
        calendarVersionId: calendar.id,
        kind: 'OFFICIAL',
        officialWeekNumber: 1,
        displayLabel: 'Week 1',
        sortOrder: 1,
      },
    });

    if (options.nonContiguousSegments) {
      // Non-contiguous segments: 1a (Mon-Tue), 1b (Thu-Fri), Wednesday is in interruption gap
      await h.prisma.academicWeekSegment.create({
        data: {
          academicWeekId: week1.id,
          calendarVersionId: calendar.id,
          label: '1a',
          segmentOrder: 1,
          startDate: new Date('2026-09-07T00:00:00Z'),
          endDate: new Date('2026-09-08T00:00:00Z'),
        },
      });
      await h.prisma.academicWeekSegment.create({
        data: {
          academicWeekId: week1.id,
          calendarVersionId: calendar.id,
          label: '1b',
          segmentOrder: 2,
          startDate: new Date('2026-09-10T00:00:00Z'),
          endDate: new Date('2026-09-11T00:00:00Z'),
        },
      });
    } else {
      // Normal contiguous segment: Mon-Fri
      await h.prisma.academicWeekSegment.create({
        data: {
          academicWeekId: week1.id,
          calendarVersionId: calendar.id,
          label: '1',
          segmentOrder: 1,
          startDate: new Date('2026-09-07T00:00:00Z'),
          endDate: new Date('2026-09-11T00:00:00Z'),
        },
      });
    }

    // Week 2
    const week2 = await h.prisma.academicWeek.create({
      data: {
        calendarVersionId: calendar.id,
        kind: 'OFFICIAL',
        officialWeekNumber: 2,
        displayLabel: 'Week 2',
        sortOrder: 2,
      },
    });
    await h.prisma.academicWeekSegment.create({
      data: {
        academicWeekId: week2.id,
        calendarVersionId: calendar.id,
        label: '2',
        segmentOrder: 1,
        startDate: new Date('2026-09-14T00:00:00Z'),
        endDate: new Date('2026-09-18T00:00:00Z'),
      },
    });

    let calendar2 = null;
    let week1Cal2 = null;
    if (options.secondCalendar) {
      calendar2 = await h.prisma.academicCalendarVersion.create({
        data: {
          academicYearId: year.id,
          versionNumber: 2,
          startDate: new Date('2026-09-01Z'),
          endDate: new Date('2027-05-31Z'),
          officialWeekCount: 35,
          reserveWeekCount: 1,
          teachingWeekdays: ['MONDAY', 'THURSDAY'],
          isActive: false,
        },
      });
      week1Cal2 = await h.prisma.academicWeek.create({
        data: {
          calendarVersionId: calendar2.id,
          kind: 'OFFICIAL',
          officialWeekNumber: 1,
          displayLabel: 'Week 1 Cal2',
          sortOrder: 1,
        },
      });
      await h.prisma.academicWeekSegment.create({
        data: {
          academicWeekId: week1Cal2.id,
          calendarVersionId: calendar2.id,
          label: '1',
          segmentOrder: 1,
          startDate: new Date('2026-09-07T00:00:00Z'),
          endDate: new Date('2026-09-11T00:00:00Z'),
        },
      });
    }

    const schoolClass = await h.prisma.schoolClass.create({
      data: { academicYearId: year.id, code: normalizedCode('C'), name: '10A1', gradeLevel: 10, status: CatalogStatus.ACTIVE },
    });
    const subject = await h.prisma.subject.create({
      data: { code: normalizedCode('S'), name: 'Subject V2', status: CatalogStatus.ACTIVE },
    });

    const slotMon = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Mon Slot 1',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        isActive: true,
        allowRegularTeaching: true,
        allowMakeupTeaching: true,
        allowSelfStudy: false,
      },
    });
    const slotWed = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'WEDNESDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Wed Slot 1',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        isActive: true,
        allowRegularTeaching: true,
        allowMakeupTeaching: true,
        allowSelfStudy: false,
      },
    });
    const slotThu = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'THURSDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Thu Slot 1',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        isActive: true,
        allowRegularTeaching: true,
        allowMakeupTeaching: true,
        allowSelfStudy: false,
      },
    });
    const slotFri = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'FRIDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Fri Slot 1',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        isActive: true,
        allowRegularTeaching: true,
        allowMakeupTeaching: true,
        allowSelfStudy: false,
      },
    });

    const assignment = await h.prisma.teachingAssignment.create({
      data: {
        academicYearId: year.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teacherUserId: actor.id,
        validFrom: new Date('2026-09-01Z'),
      },
    });

    const timetable = await h.prisma.timetableVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        status: 'ACTIVE',
        calendarVersionId: calendar.id,
        effectiveAcademicWeekId: week1.id,
        effectiveFrom: new Date('2026-09-07T00:00:00Z'),
        createdByUserId: actor.id,
        validatedByUserId: actor.id,
        validatedAt: lifecycleAt,
        approvedByUserId: actor.id,
        approvedAt: lifecycleAt,
        activatedByUserId: actor.id,
        activatedAt: lifecycleAt,
      },
    });

    // Default: Mon and Thu entries
    const entryMon = await h.prisma.timetableEntry.create({
      data: {
        timetableVersionId: timetable.id,
        academicYearId: year.id,
        weekday: 'MONDAY',
        timeSlotDefinitionId: slotMon.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teachingAssignmentId: assignment.id,
        teacherUserId: actor.id,
      },
    });
    const entryThu = await h.prisma.timetableEntry.create({
      data: {
        timetableVersionId: timetable.id,
        academicYearId: year.id,
        weekday: 'THURSDAY',
        timeSlotDefinitionId: slotThu.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teachingAssignmentId: assignment.id,
        teacherUserId: actor.id,
      },
    });

    const plan = await h.prisma.ppctPlan.create({
      data: { academicYearId: year.id, subjectId: subject.id, gradeLevel: 10 },
    });
    const service = h.app.get(PpctOccurrenceAllocationService);

    const items = new Map<string, { id: string }>();
    async function item(name: string, component: PpctCurricularComponent = 'CORE') {
      const existing = items.get(name);
      if (existing) return existing;
      const created = await h.prisma.ppctItem.create({ data: { ppctPlanId: plan.id, component } });
      items.set(name, created);
      return created;
    }

    async function addVersion(
      versionNumber: number,
      coreNames: string[],
      specializedNames: string[] = [],
      status: PpctVersionStatus = PpctVersionStatus.PUBLISHED,
    ) {
      const version = await h.prisma.ppctVersion.create({
        data: {
          ppctPlanId: plan.id,
          versionNumber,
          status,
          createdByUserId: actor.id,
          publishedByUserId: actor.id,
          publishedAt: lifecycleAt,
          ...(status === PpctVersionStatus.SUPERSEDED
            ? { supersededByUserId: actor.id, supersededAt: new Date(lifecycleAt.getTime() + versionNumber * 1000) }
            : {}),
        },
      });
      const coreRevisions = [];
      for (let i = 0; i < coreNames.length; i += 1) {
        const stable = await item(coreNames[i]!, 'CORE');
        coreRevisions.push(
          await h.prisma.ppctItemRevision.create({
            data: {
              ppctVersionId: version.id,
              ppctPlanId: plan.id,
              ppctItemId: stable.id,
              component: 'CORE',
              sequence: i + 1,
              title: coreNames[i]!,
              lessonType: 'LESSON',
            },
          }),
        );
      }
      const specializedRevisions = [];
      for (let i = 0; i < specializedNames.length; i += 1) {
        const stable = await item(specializedNames[i]!, 'SPECIALIZED_STUDY');
        specializedRevisions.push(
          await h.prisma.ppctItemRevision.create({
            data: {
              ppctVersionId: version.id,
              ppctPlanId: plan.id,
              ppctItemId: stable.id,
              component: 'SPECIALIZED_STUDY',
              sequence: i + 1,
              title: specializedNames[i]!,
              lessonType: 'SPECIALIZED',
            },
          }),
        );
      }
      return {
        version,
        coreRevisions,
        specializedRevisions,
        revisions: [...coreRevisions, ...specializedRevisions],
      };
    }

    async function associate(
      ppctVersionId: string,
      from: string,
      profile: PpctClassCurricularProfile = 'CORE_PLUS_SPECIALIZED_STUDY',
      until?: string,
    ) {
      return h.prisma.ppctClassAssociation.create({
        data: {
          academicYearId: year.id,
          schoolClassId: schoolClass.id,
          subjectId: subject.id,
          gradeLevel: 10,
          ppctPlanId: plan.id,
          ppctVersionId,
          curricularProfile: profile,
          effectiveFrom: new Date(`${from}T00:00:00Z`),
          effectiveUntil: until ? new Date(`${until}T00:00:00Z`) : null,
          createdByUserId: actor.id,
        },
      });
    }

    async function lineage(
      predecessorRev: { ppctItemId: string },
      successorRev: { ppctItemId: string },
      component: PpctCurricularComponent,
      predecessorVersionId: string,
      successorVersionId: string,
    ) {
      return h.prisma.ppctItemLineage.create({
        data: {
          ppctPlanId: plan.id,
          predecessorVersionId,
          predecessorItemId: predecessorRev.ppctItemId,
          successorVersionId,
          successorItemId: successorRev.ppctItemId,
          component,
        },
      });
    }

    return {
      year,
      actor,
      calendar,
      calendar2,
      week1,
      week2,
      week1Cal2,
      schoolClass,
      subject,
      slotMon,
      slotWed,
      slotThu,
      slotFri,
      assignment,
      timetable,
      entryMon,
      entryThu,
      plan,
      service,
      addVersion,
      associate,
      lineage,
    };
  }

  it('1. CORE_ONLY routes all opportunities to CORE without specialized', async () => {
    const f = await fixture();
    const v1 = await f.addVersion(1, ['C1', 'C2', 'C3'], []);
    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_ONLY');

    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W1_THU,
    });

    expect(result.status).toBe('PASS');
    expect(result.profile).toBe('PPCT_OCCURRENCE_ALLOCATION_V2');
    expect(result.normalAllocations).toHaveLength(2);
    expect(result.normalAllocations[0]!.plannedComponent).toBe('CORE');
    expect(result.normalAllocations[0]!.expectedPpctItem?.component).toBe('CORE');
    expect(result.normalAllocations[0]!.expectedPpctItem?.title).toBe('C1');
    expect(result.normalAllocations[1]!.plannedComponent).toBe('CORE');
    expect(result.normalAllocations[1]!.expectedPpctItem?.component).toBe('CORE');
    expect(result.normalAllocations[1]!.expectedPpctItem?.title).toBe('C2');
  });

  it('2. CORE_PLUS_SPECIALIZED_STUDY plans chronologically last opportunity as SPECIALIZED_STUDY', async () => {
    const f = await fixture();
    const v1 = await f.addVersion(1, ['C1', 'C2'], ['S1']);
    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_PLUS_SPECIALIZED_STUDY');

    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W1_THU,
    });

    expect(result.status).toBe('PASS');
    expect(result.normalAllocations).toHaveLength(2);
    expect(result.normalAllocations[0]!.plannedComponent).toBe('CORE');
    expect(result.normalAllocations[0]!.expectedPpctItem?.component).toBe('CORE');
    expect(result.normalAllocations[0]!.expectedPpctItem?.title).toBe('C1');
    expect(result.normalAllocations[1]!.plannedComponent).toBe('SPECIALIZED_STUDY');
    expect(result.normalAllocations[1]!.expectedPpctItem?.component).toBe('SPECIALIZED_STUDY');
    expect(result.normalAllocations[1]!.expectedPpctItem?.title).toBe('S1');
  });

  it('3. Non-contiguous AcademicWeekSegments excludes gap from routing membership', async () => {
    const f = await fixture({ nonContiguousSegments: true });
    // Add Wed and Fri entries
    await h.prisma.timetableEntry.create({
      data: {
        timetableVersionId: f.timetable.id,
        academicYearId: f.year.id,
        weekday: 'WEDNESDAY',
        timeSlotDefinitionId: f.slotWed.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        teachingAssignmentId: f.assignment.id,
        teacherUserId: f.actor.id,
      },
    });
    await h.prisma.timetableEntry.create({
      data: {
        timetableVersionId: f.timetable.id,
        academicYearId: f.year.id,
        weekday: 'FRIDAY',
        timeSlotDefinitionId: f.slotFri.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        teachingAssignmentId: f.assignment.id,
        teacherUserId: f.actor.id,
      },
    });
    const v1 = await f.addVersion(1, ['C1', 'C2', 'C3'], ['S1']);
    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_PLUS_SPECIALIZED_STUDY');

    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W1_FRI,
    });

    expect(result.status).toBe('PASS');
    expect(result.normalAllocations).toHaveLength(4);

    // Mon: routing member -> CORE
    expect(result.normalAllocations[0]!.occurrence.civilDate).toBe(DATES.W1_MON);
    expect(result.normalAllocations[0]!.plannedComponent).toBe('CORE');
    expect(result.normalAllocations[0]!.allocationStatus).toBe('ALLOCATED');

    // Wed: in interruption gap between segments 1a and 1b -> NOT a routing member!
    expect(result.normalAllocations[1]!.occurrence.civilDate).toBe(DATES.W1_WED);
    expect(result.normalAllocations[1]!.plannedComponent).toBeNull();
    expect(result.normalAllocations[1]!.allocationEffect).toBe('DOES_NOT_CONSUME_ITEM');
    expect(result.normalAllocations[1]!.allocationStatus).toBe('NOT_CONSUMED');

    // Thu: routing member -> CORE
    expect(result.normalAllocations[2]!.occurrence.civilDate).toBe(DATES.W1_THU);
    expect(result.normalAllocations[2]!.plannedComponent).toBe('CORE');
    expect(result.normalAllocations[2]!.allocationStatus).toBe('ALLOCATED');

    // Fri: last routing member -> SPECIALIZED_STUDY
    expect(result.normalAllocations[3]!.occurrence.civilDate).toBe(DATES.W1_FRI);
    expect(result.normalAllocations[3]!.plannedComponent).toBe('SPECIALIZED_STUDY');
    expect(result.normalAllocations[3]!.expectedPpctItem?.title).toBe('S1');
  });

  it('4. Planned specialized opportunity suppressed does not promote earlier CORE opportunity', async () => {
    const f = await fixture();
    const v1 = await f.addVersion(1, ['C1', 'C2'], ['S1']);
    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_PLUS_SPECIALIZED_STUDY');

    // Suppress Thursday's specialized opportunity with CalendarException
    await h.prisma.calendarException.create({
      data: {
        academicYearId: f.year.id,
        academicCalendarVersionId: f.calendar.id,
        civilDate: new Date(`${DATES.W1_THU}T00:00:00Z`),
        scope: 'CLASS',
        schoolClassId: f.schoolClass.id,
        timeSelector: 'WHOLE_DAY',
        status: OperationalOverlayStatus.ACTIVE,
        createRequestKey: crypto.randomUUID(),
        createRequestFingerprint: crypto.randomUUID(),
        createdByUserId: f.actor.id,
      },
    });

    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W1_THU,
    });

    expect(result.status).toBe('PASS');
    expect(result.normalAllocations).toHaveLength(2);

    // Mon: still CORE, consumes C1
    expect(result.normalAllocations[0]!.plannedComponent).toBe('CORE');
    expect(result.normalAllocations[0]!.allocationStatus).toBe('ALLOCATED');
    expect(result.normalAllocations[0]!.expectedPpctItem?.title).toBe('C1');

    // Thu: plannedComponent is SPECIALIZED_STUDY, but does NOT consume
    expect(result.normalAllocations[1]!.plannedComponent).toBe('SPECIALIZED_STUDY');
    expect(result.normalAllocations[1]!.allocationEffect).toBe('DOES_NOT_CONSUME_ITEM');
    expect(result.normalAllocations[1]!.allocationStatus).toBe('NOT_CONSUMED');
    expect(result.normalAllocations[1]!.expectedPpctItem).toBeNull();
  });

  it('5. Specialized-enabled week with exactly 1 routing opportunity fails closed with PPCT_COMPONENT_WEEK_CAPACITY_INVALID', async () => {
    const f = await fixture();
    // Delete Thursday entry so that only Monday exists
    await h.prisma.timetableEntry.delete({ where: { id: f.entryThu.id } });

    const v1 = await f.addVersion(1, ['C1'], ['S1']);
    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_PLUS_SPECIALIZED_STUDY');

    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W1_MON,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PPCT_COMPONENT_WEEK_CAPACITY_INVALID',
          severity: 'BLOCKER',
        }),
      ]),
    );
    expect(result.normalAllocations[0]!.allocationStatus).toBe('BLOCKED');
  });

  it('6. Historical retained profile split fails closed with PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT', async () => {
    const f = await fixture();
    const v1 = await f.addVersion(1, ['C1', 'C2'], ['S1']);
    // Association 1 on Mon is CORE_ONLY, Association 2 on Thu is CORE_PLUS_SPECIALIZED_STUDY
    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_ONLY', '2026-09-09');
    await f.associate(v1.version.id, DATES.W1_THU, 'CORE_PLUS_SPECIALIZED_STUDY');

    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W1_THU,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT',
          severity: 'BLOCKER',
        }),
      ]),
    );
  });

  it('7. Same-profile midweek PPCT version change is legal and passes', async () => {
    const f = await fixture();
    const v1 = await f.addVersion(1, ['C1'], ['S1'], PpctVersionStatus.SUPERSEDED);
    const v2 = await f.addVersion(2, ['C1', 'C2'], ['S1'], PpctVersionStatus.PUBLISHED);
    // Both associations have CORE_PLUS_SPECIALIZED_STUDY
    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_PLUS_SPECIALIZED_STUDY', '2026-09-09');
    await f.associate(v2.version.id, DATES.W1_THU, 'CORE_PLUS_SPECIALIZED_STUDY');

    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W1_THU,
    });

    expect(result.status).toBe('PASS');
    expect(result.normalAllocations).toHaveLength(2);
    expect(result.normalAllocations[0]!.expectedPpctItem?.title).toBe('C1');
    expect(result.normalAllocations[1]!.expectedPpctItem?.title).toBe('S1');
  });

  it('8. Multiple TimetableVersions in same exact calendar and week is legal', async () => {
    const f = await fixture();
    // Set timetable 1 effectiveUntil to 2026-09-08 and supersede it first
    await h.prisma.timetableVersion.update({
      where: { id: f.timetable.id },
      data: {
        effectiveUntil: new Date('2026-09-08T00:00:00Z'),
        status: 'SUPERSEDED',
        supersededAt: new Date(),
      },
    });

    // Second timetable version effective from Wednesday of Week 1
    const timetable2 = await h.prisma.timetableVersion.create({
      data: {
        academicYearId: f.year.id,
        versionNumber: 2,
        status: 'ACTIVE',
        calendarVersionId: f.calendar.id,
        effectiveAcademicWeekId: f.week1.id,
        effectiveFrom: new Date('2026-09-09T00:00:00Z'),
        createdByUserId: f.actor.id,
        validatedByUserId: f.actor.id,
        validatedAt: new Date(),
        approvedByUserId: f.actor.id,
        approvedAt: new Date(),
        activatedByUserId: f.actor.id,
        activatedAt: new Date(),
      },
    });
    // Entry in timetable2 for Thursday
    await h.prisma.timetableEntry.create({
      data: {
        timetableVersionId: timetable2.id,
        academicYearId: f.year.id,
        weekday: 'THURSDAY',
        timeSlotDefinitionId: f.slotThu.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        teachingAssignmentId: f.assignment.id,
        teacherUserId: f.actor.id,
      },
    });

    const v1 = await f.addVersion(1, ['C1', 'C2'], ['S1']);
    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_PLUS_SPECIALIZED_STUDY');

    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W1_THU,
    });

    expect(result.status).toBe('PASS');
    expect(result.normalAllocations).toHaveLength(2);
    expect(result.normalAllocations[0]!.plannedComponent).toBe('CORE');
    expect(result.normalAllocations[1]!.plannedComponent).toBe('SPECIALIZED_STUDY');
  });

  it('9. Exact calendar/week split fails closed with PPCT_COMPONENT_WEEK_CALENDAR_SPLIT', async () => {
    const f = await fixture({ secondCalendar: true });
    // Supersede timetable 1 first
    await h.prisma.timetableVersion.update({
      where: { id: f.timetable.id },
      data: {
        effectiveUntil: new Date('2026-09-08T00:00:00Z'),
        status: 'SUPERSEDED',
        supersededAt: new Date(),
      },
    });

    // Timetable 2 uses calendar2
    const timetable2 = await h.prisma.timetableVersion.create({
      data: {
        academicYearId: f.year.id,
        versionNumber: 2,
        status: 'ACTIVE',
        calendarVersionId: f.calendar2!.id,
        effectiveAcademicWeekId: f.week1Cal2!.id,
        effectiveFrom: new Date('2026-09-09T00:00:00Z'),
        createdByUserId: f.actor.id,
        validatedByUserId: f.actor.id,
        validatedAt: new Date(),
        approvedByUserId: f.actor.id,
        approvedAt: new Date(),
        activatedByUserId: f.actor.id,
        activatedAt: new Date(),
      },
    });
    await h.prisma.timetableEntry.create({
      data: {
        timetableVersionId: timetable2.id,
        academicYearId: f.year.id,
        weekday: 'THURSDAY',
        timeSlotDefinitionId: f.slotThu.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        teachingAssignmentId: f.assignment.id,
        teacherUserId: f.actor.id,
      },
    });

    const v1 = await f.addVersion(1, ['C1', 'C2'], ['S1']);
    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_PLUS_SPECIALIZED_STUDY');

    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W1_THU,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PPCT_COMPONENT_WEEK_CALENDAR_SPLIT',
          severity: 'BLOCKER',
        }),
      ]),
    );
  });

  it('10. Independent CORE and SPECIALIZED_STUDY progression over multiple weeks', async () => {
    const f = await fixture();
    const v1 = await f.addVersion(1, ['C1', 'C2', 'C3'], ['S1', 'S2']);
    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_PLUS_SPECIALIZED_STUDY');

    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W2_THU,
    });

    expect(result.status).toBe('PASS');
    expect(result.normalAllocations).toHaveLength(4);

    // Week 1 Mon: CORE 1
    expect(result.normalAllocations[0]!.expectedPpctItem?.title).toBe('C1');
    expect(result.normalAllocations[0]!.expectedPpctItem?.component).toBe('CORE');

    // Week 1 Thu: SPECIALIZED 1
    expect(result.normalAllocations[1]!.expectedPpctItem?.title).toBe('S1');
    expect(result.normalAllocations[1]!.expectedPpctItem?.component).toBe('SPECIALIZED_STUDY');

    // Week 2 Mon: CORE 2
    expect(result.normalAllocations[2]!.expectedPpctItem?.title).toBe('C2');
    expect(result.normalAllocations[2]!.expectedPpctItem?.component).toBe('CORE');

    // Week 2 Thu: SPECIALIZED 2
    expect(result.normalAllocations[3]!.expectedPpctItem?.title).toBe('S2');
    expect(result.normalAllocations[3]!.expectedPpctItem?.component).toBe('SPECIALIZED_STUDY');
  });

  it('11. CORE exhaustion blocks with PPCT_ALLOCATION_EXHAUSTED and component context without borrowing from SPECIALIZED', async () => {
    const f = await fixture();
    // Only 1 CORE item, but 2 SPECIALIZED items
    const v1 = await f.addVersion(1, ['C1'], ['S1', 'S2']);
    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_PLUS_SPECIALIZED_STUDY');

    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W2_MON,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PPCT_ALLOCATION_EXHAUSTED',
          component: 'CORE',
          reason: 'CORE',
        }),
      ]),
    );

    // Week 1 Mon consumed C1
    expect(result.normalAllocations[0]!.expectedPpctItem?.title).toBe('C1');
    // Week 1 Thu consumed S1
    expect(result.normalAllocations[1]!.expectedPpctItem?.title).toBe('S1');
    // Week 2 Mon blocked because CORE is exhausted (did NOT borrow S2!)
    expect(result.normalAllocations[2]!.allocationStatus).toBe('BLOCKED');
    expect(result.normalAllocations[2]!.expectedPpctItem).toBeNull();
  });

  it('12. SPECIALIZED_STUDY exhaustion blocks with PPCT_ALLOCATION_EXHAUSTED and component context without borrowing from CORE', async () => {
    const f = await fixture();
    // 3 CORE items, but only 1 SPECIALIZED item
    const v1 = await f.addVersion(1, ['C1', 'C2', 'C3'], ['S1']);
    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_PLUS_SPECIALIZED_STUDY');

    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W2_THU,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PPCT_ALLOCATION_EXHAUSTED',
          component: 'SPECIALIZED_STUDY',
          reason: 'SPECIALIZED_STUDY',
        }),
      ]),
    );

    // Week 1 Mon: C1
    expect(result.normalAllocations[0]!.expectedPpctItem?.title).toBe('C1');
    // Week 1 Thu: S1
    expect(result.normalAllocations[1]!.expectedPpctItem?.title).toBe('S1');
    // Week 2 Mon: C2
    expect(result.normalAllocations[2]!.expectedPpctItem?.title).toBe('C2');
    // Week 2 Thu: BLOCKED (SPECIALIZED exhausted, did NOT borrow C3!)
    expect(result.normalAllocations[3]!.allocationStatus).toBe('BLOCKED');
    expect(result.normalAllocations[3]!.expectedPpctItem).toBeNull();
  });

  it('13. Component-local lineage MERGE credits successor in SPECIALIZED_STUDY', async () => {
    const f = await fixture();
    const v1 = await f.addVersion(1, ['C1', 'C2'], ['S_A', 'S_B'], PpctVersionStatus.SUPERSEDED);
    const v2 = await f.addVersion(2, ['C1', 'C2'], ['S_M'], PpctVersionStatus.PUBLISHED);
    // Lineage MERGE S_A + S_B -> S_M in SPECIALIZED_STUDY
    await f.lineage(v1.specializedRevisions[0]!, v2.specializedRevisions[0]!, 'SPECIALIZED_STUDY', v1.version.id, v2.version.id);
    await f.lineage(v1.specializedRevisions[1]!, v2.specializedRevisions[0]!, 'SPECIALIZED_STUDY', v1.version.id, v2.version.id);

    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_PLUS_SPECIALIZED_STUDY', DATES.W1_THU);
    await f.associate(v2.version.id, DATES.W2_MON, 'CORE_PLUS_SPECIALIZED_STUDY');

    // When S_A was consumed in Week 1, but S_B was NOT yet consumed:
    // In Week 1: only Thu was consumed (which is S_A). S_B was NOT consumed.
    // Transition to v2 requires both predecessors for merge!
    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W2_MON,
    });

    // In Week 1, only 1 specialized opportunity elapsed (consumed S_A). S_B was not consumed.
    // So transition to v2 partial merge fails closed with PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION!
    expect(result.status).toBe('BLOCKED');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION',
        }),
      ]),
    );
  });

  it('14. Partial replay resolves early in week knowing canonical last opportunity is SPECIALIZED_STUDY without consuming future opportunity', async () => {
    const f = await fixture();
    const v1 = await f.addVersion(1, ['C1', 'C2'], ['S1']);
    await f.associate(v1.version.id, DATES.W1_MON, 'CORE_PLUS_SPECIALIZED_STUDY');

    // Resolve ONLY up to Monday of Week 1
    const result = await f.service.resolveV2({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      throughCivilDate: DATES.W1_MON,
    });

    expect(result.status).toBe('PASS');
    // Only Monday is returned in normalAllocations
    expect(result.normalAllocations).toHaveLength(1);
    expect(result.normalAllocations[0]!.occurrence.civilDate).toBe(DATES.W1_MON);
    // Monday is planned as CORE (because Thursday is the canonical last opportunity of Week 1!)
    expect(result.normalAllocations[0]!.plannedComponent).toBe('CORE');
    expect(result.normalAllocations[0]!.expectedPpctItem?.component).toBe('CORE');
    expect(result.normalAllocations[0]!.expectedPpctItem?.title).toBe('C1');
    // Thursday was NOT consumed (in the future)
  });
});
