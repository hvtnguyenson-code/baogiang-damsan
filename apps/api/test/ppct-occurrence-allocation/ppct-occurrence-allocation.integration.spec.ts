import { CatalogStatus, OperationalOverlayStatus, PpctVersionStatus, UserStatus } from '@prisma/client';
import { PpctOccurrenceAllocationService } from '../../src/ppct-occurrence-allocation/ppct-occurrence-allocation.service';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';

const MONDAYS = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'] as const;

integration('PPCT occurrence allocation read model (PostgreSQL)', () => {
  const h = new Phase01Harness();
  beforeAll(async () => h.start());
  afterAll(async () => { try { await clean(); } finally { await h.stop(); } });
  beforeEach(async () => clean());

  async function clean() {
    await h.prisma.specialActivityStaffing.deleteMany(); await h.prisma.specialActivityClassTarget.deleteMany(); await h.prisma.specialActivityTimeSlot.deleteMany(); await h.prisma.specialActivity.deleteMany();
    await h.prisma.makeupTeachingSchedule.deleteMany(); await h.prisma.operationalLessonDisposition.deleteMany(); await h.prisma.calendarExceptionTimeSlot.deleteMany(); await h.prisma.calendarException.deleteMany();
    await h.prisma.ppctItemLineage.deleteMany(); await h.prisma.ppctClassAssociation.deleteMany(); await h.prisma.ppctItemRevision.deleteMany(); await h.prisma.ppctItem.deleteMany(); await h.prisma.ppctVersion.deleteMany(); await h.prisma.ppctPlan.deleteMany();
    await h.clean();
  }

  async function fixture() {
    const lifecycleAt = new Date('2026-08-01T00:00:00.000Z');
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('ALLOC'), name: 'Allocation year' } });
    const actor = await h.prisma.user.create({ data: { username: `alloc-${crypto.randomUUID().slice(0, 8)}`, passwordHash: 'hash', status: UserStatus.ACTIVE, mustChangePassword: false, profile: { create: { displayName: 'Allocation actor', isTeachingStaff: true } } }, include: { profile: true } });
    const calendar = await h.prisma.academicCalendarVersion.create({ data: { academicYearId: year.id, versionNumber: 1, startDate: new Date('2026-09-01Z'), endDate: new Date('2027-05-31Z'), officialWeekCount: 35, reserveWeekCount: 1, teachingWeekdays: ['MONDAY'], isActive: true, activatedAt: lifecycleAt } });
    const week = await h.prisma.academicWeek.create({ data: { calendarVersionId: calendar.id, kind: 'OFFICIAL', officialWeekNumber: 1, displayLabel: 'Week 1', sortOrder: 1 } });
    const schoolClass = await h.prisma.schoolClass.create({ data: { academicYearId: year.id, code: normalizedCode('C'), name: '10A1', gradeLevel: 10, status: CatalogStatus.ACTIVE } });
    const subject = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Subject', status: CatalogStatus.ACTIVE } });
    const slot = await h.prisma.timeSlotDefinition.create({ data: { academicYearId: year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 1, revision: 1, displayLabel: 'One', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z'), isActive: true, allowRegularTeaching: true, allowMakeupTeaching: true, allowSelfStudy: false } });
    const assignment = await h.prisma.teachingAssignment.create({ data: { academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: actor.id, validFrom: new Date('2026-09-01Z') } });
    const staffSubject = await h.prisma.staffSubject.create({ data: { userId: actor.id, subjectId: subject.id } });
    const timetable = await h.prisma.timetableVersion.create({ data: { academicYearId: year.id, versionNumber: 1, status: 'ACTIVE', calendarVersionId: calendar.id, effectiveAcademicWeekId: week.id, effectiveFrom: new Date(`${MONDAYS[0]}T00:00:00Z`), effectiveUntil: new Date(`${MONDAYS[3]}T00:00:00Z`), createdByUserId: actor.id, validatedByUserId: actor.id, validatedAt: lifecycleAt, approvedByUserId: actor.id, approvedAt: lifecycleAt, activatedByUserId: actor.id, activatedAt: lifecycleAt } });
    const timetableEntry = await h.prisma.timetableEntry.create({ data: { timetableVersionId: timetable.id, academicYearId: year.id, weekday: 'MONDAY', timeSlotDefinitionId: slot.id, schoolClassId: schoolClass.id, subjectId: subject.id, teachingAssignmentId: assignment.id, teacherUserId: actor.id } });
    const plan = await h.prisma.ppctPlan.create({ data: { academicYearId: year.id, subjectId: subject.id, gradeLevel: 10 } });
    const service = h.app.get(PpctOccurrenceAllocationService);
    const items = new Map<string, { id: string }>();
    async function item(name: string) {
      const existing = items.get(name); if (existing) return existing;
      const created = await h.prisma.ppctItem.create({ data: { ppctPlanId: plan.id } }); items.set(name, created); return created;
    }
    async function addVersion(versionNumber: number, names: string[], status: PpctVersionStatus) {
      const version = await h.prisma.ppctVersion.create({ data: { ppctPlanId: plan.id, versionNumber, status, createdByUserId: actor.id, publishedByUserId: actor.id, publishedAt: lifecycleAt, ...(status === PpctVersionStatus.SUPERSEDED ? { supersededByUserId: actor.id, supersededAt: new Date(lifecycleAt.getTime() + versionNumber * 1000) } : {}) } });
      const revisions = [];
      for (let index = 0; index < names.length; index += 1) {
        const stable = await item(names[index]!);
        revisions.push(await h.prisma.ppctItemRevision.create({ data: { ppctVersionId: version.id, ppctPlanId: plan.id, ppctItemId: stable.id, sequence: index + 1, title: names[index]!, lessonType: 'LESSON' } }));
      }
      return { version, revisions };
    }
    async function associate(ppctVersionId: string, from: string, until?: string) {
      return h.prisma.ppctClassAssociation.create({ data: { academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, gradeLevel: 10, ppctPlanId: plan.id, ppctVersionId, effectiveFrom: new Date(`${from}T00:00:00Z`), effectiveUntil: until ? new Date(`${until}T00:00:00Z`) : null, createdByUserId: actor.id } });
    }
    async function lineage(predecessor: { version: { id: string }; revisions: Array<{ ppctItemId: string }> }, predecessorIndex: number, successor: { version: { id: string }; revisions: Array<{ ppctItemId: string }> }, successorIndex: number) {
      return h.prisma.ppctItemLineage.create({ data: { ppctPlanId: plan.id, predecessorVersionId: predecessor.version.id, predecessorItemId: predecessor.revisions[predecessorIndex]!.ppctItemId, successorVersionId: successor.version.id, successorItemId: successor.revisions[successorIndex]!.ppctItemId } });
    }
    async function addMakeup(options: { id?: string; associationId: string; ppctVersionId: string; ppctItemId: string; sourceDate: string; targetDate: string }) {
      return h.prisma.makeupTeachingSchedule.create({ data: { id: options.id, academicYearId: year.id, originalTimetableVersionId: timetable.id, originalTimetableEntryId: timetableEntry.id, originalCivilDate: new Date(`${options.sourceDate}T00:00:00Z`), originalAcademicCalendarVersionId: calendar.id, originalTimeSlotDefinitionId: slot.id, schoolClassId: schoolClass.id, subjectId: subject.id, originalTeachingAssignmentId: assignment.id, responsibleTeacherUserId: actor.id, ppctClassAssociationId: options.associationId, ppctPlanId: plan.id, ppctVersionId: options.ppctVersionId, ppctItemId: options.ppctItemId, targetCivilDate: new Date(`${options.targetDate}T00:00:00Z`), targetAcademicCalendarVersionId: calendar.id, targetTimeSlotDefinitionId: slot.id, scheduledTeacherUserId: actor.id, eligibilityCheckedAt: lifecycleAt, eligibilityWasActive: true, eligibilityWasTeachingStaff: true, eligibilitySameSubject: true, eligibilityStaffSubjectId: staffSubject.id, status: OperationalOverlayStatus.ACTIVE, createRequestKey: crypto.randomUUID(), createRequestFingerprint: crypto.randomUUID(), createdByUserId: actor.id } });
    }
    async function readOnlyCounts() {
      return Promise.all([
        h.prisma.timetableVersion.count({ where: { academicYearId: year.id } }), h.prisma.timetableEntry.count({ where: { academicYearId: year.id } }),
        h.prisma.ppctClassAssociation.count({ where: { academicYearId: year.id } }), h.prisma.ppctVersion.count({ where: { ppctPlanId: plan.id } }),
        h.prisma.ppctItem.count({ where: { ppctPlanId: plan.id } }), h.prisma.ppctItemRevision.count({ where: { ppctPlanId: plan.id } }),
        h.prisma.ppctItemLineage.count({ where: { ppctPlanId: plan.id } }), h.prisma.calendarException.count({ where: { academicYearId: year.id } }),
        h.prisma.operationalLessonDisposition.count({ where: { academicYearId: year.id } }), h.prisma.specialActivity.count({ where: { academicYearId: year.id } }),
        h.prisma.makeupTeachingSchedule.count({ where: { academicYearId: year.id } }), h.prisma.auditEvent.count({ where: { actorUserId: actor.id } }),
      ]);
    }
    return { year, actor, calendar, schoolClass, subject, slot, assignment, staffSubject, timetable, timetableEntry, plan, service, addVersion, associate, lineage, addMakeup, readOnlyCounts };
  }

  it('I1 distributes chronological BASE revisions in sequence and I9 writes nothing', async () => {
    const f = await fixture(); const v1 = await f.addVersion(1, ['A', 'B', 'C'], PpctVersionStatus.PUBLISHED); await f.associate(v1.version.id, MONDAYS[0]);
    const before = await f.readOnlyCounts();
    const result = await f.service.resolve({ academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, throughCivilDate: MONDAYS[2] });
    const after = await f.readOnlyCounts();
    expect(result.status).toBe('PASS'); expect(result.coverage).toMatchObject({ ppctItemAllocation: 'ASSESSED', completion: 'NOT_ASSESSED', debt: 'NOT_ASSESSED' }); expect(result.normalAllocations.map((row) => row.expectedPpctItem?.title)).toEqual(['A', 'B', 'C']); expect(after).toEqual(before);
  });

  it('I2 real CalendarException does not consume and leaves A for the next occurrence', async () => {
    const f = await fixture(); const v1 = await f.addVersion(1, ['A', 'B'], PpctVersionStatus.PUBLISHED); await f.associate(v1.version.id, MONDAYS[0]);
    await h.prisma.calendarException.create({ data: { academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate: new Date(`${MONDAYS[0]}T00:00:00Z`), scope: 'CLASS', schoolClassId: f.schoolClass.id, timeSelector: 'WHOLE_DAY', status: OperationalOverlayStatus.ACTIVE, createRequestKey: crypto.randomUUID(), createRequestFingerprint: crypto.randomUUID(), createdByUserId: f.actor.id } });
    const result = await f.service.resolve({ academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, throughCivilDate: MONDAYS[1] });
    expect(result.normalAllocations[0]).toMatchObject({ allocationStatus: 'NOT_CONSUMED', expectedPpctItem: null }); expect(result.normalAllocations[1]?.expectedPpctItem?.title).toBe('A');
  });

  it('I3 ABSENCE_NO_REPLACEMENT consumes distribution without claiming completion', async () => {
    const f = await fixture(); const v1 = await f.addVersion(1, ['A'], PpctVersionStatus.PUBLISHED); await f.associate(v1.version.id, MONDAYS[0]);
    await h.prisma.operationalLessonDisposition.create({ data: { academicYearId: f.year.id, timetableVersionId: f.timetable.id, timetableEntryId: f.timetableEntry.id, sourceCivilDate: new Date(`${MONDAYS[0]}T00:00:00Z`), academicCalendarVersionId: f.calendar.id, timeSlotDefinitionId: f.slot.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, teachingAssignmentId: f.assignment.id, responsibleTeacherUserId: f.actor.id, dispositionType: 'ABSENCE_NO_REPLACEMENT', status: OperationalOverlayStatus.ACTIVE, createRequestKey: crypto.randomUUID(), createRequestFingerprint: crypto.randomUUID(), createdByUserId: f.actor.id } });
    const result = await f.service.resolve({ academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, throughCivilDate: MONDAYS[0] });
    expect(result.normalAllocations[0]).toMatchObject({ allocationEffect: 'CONSUMES_NEXT_ITEM', allocationStatus: 'ALLOCATED', expectedPpctItem: { title: 'A' } }); expect(result.coverage.completion).toBe('NOT_ASSESSED');
  });

  it('I4 carries a covered stable UUID without redistributing it', async () => {
    const f = await fixture(); const v1 = await f.addVersion(1, ['A'], PpctVersionStatus.SUPERSEDED); const v2 = await f.addVersion(2, ['A', 'B'], PpctVersionStatus.PUBLISHED); await f.associate(v1.version.id, MONDAYS[0], MONDAYS[0]); await f.associate(v2.version.id, MONDAYS[1]);
    const result = await f.service.resolve({ academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, throughCivilDate: MONDAYS[1] });
    expect(result.normalAllocations.map((row) => row.expectedPpctItem?.title)).toEqual(['A', 'B']);
  });

  it('I5 processes a skipped non-DRAFT split frontier and blocks', async () => {
    const f = await fixture(); const v1 = await f.addVersion(1, ['A'], PpctVersionStatus.SUPERSEDED); const v2 = await f.addVersion(2, ['B', 'C'], PpctVersionStatus.SUPERSEDED); const v3 = await f.addVersion(3, ['B', 'C'], PpctVersionStatus.PUBLISHED); await f.lineage(v1, 0, v2, 0); await f.lineage(v1, 0, v2, 1); await f.associate(v1.version.id, MONDAYS[0], MONDAYS[0]); await f.associate(v3.version.id, MONDAYS[1]);
    const result = await f.service.resolve({ academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, throughCivilDate: MONDAYS[1] });
    expect(result.normalAllocations[0]?.expectedPpctItem?.title).toBe('A'); expect(result.normalAllocations[1]?.allocationStatus).toBe('BLOCKED'); expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION' })]));
  });

  it('I6 derives all-covered merge credit and later allocates only the next item', async () => {
    const f = await fixture(); const v1 = await f.addVersion(1, ['A', 'X'], PpctVersionStatus.SUPERSEDED); const v2 = await f.addVersion(2, ['M'], PpctVersionStatus.SUPERSEDED); const v3 = await f.addVersion(3, ['M', 'Z'], PpctVersionStatus.PUBLISHED); await f.lineage(v1, 0, v2, 0); await f.lineage(v1, 1, v2, 0); await f.associate(v1.version.id, MONDAYS[0], MONDAYS[1]); await f.associate(v3.version.id, MONDAYS[2]);
    const result = await f.service.resolve({ academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, throughCivilDate: MONDAYS[2] });
    expect(result.normalAllocations.map((row) => row.expectedPpctItem?.title)).toEqual(['A', 'X', 'Z']);
  });

  it('I7 keeps an explicit 1-to-1 new UUID pending for direct distribution', async () => {
    const f = await fixture(); const v1 = await f.addVersion(1, ['A'], PpctVersionStatus.SUPERSEDED); const v2 = await f.addVersion(2, ['B'], PpctVersionStatus.PUBLISHED); await f.lineage(v1, 0, v2, 0); await f.associate(v1.version.id, MONDAYS[0], MONDAYS[0]); await f.associate(v2.version.id, MONDAYS[1]);
    const result = await f.service.resolve({ academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, throughCivilDate: MONDAYS[1] }); expect(result.normalAllocations.map((row) => row.expectedPpctItem?.title)).toEqual(['A', 'B']);
  });

  it('I8 matches a make-up only to the exact direct distribution obligation', async () => {
    const f = await fixture(); const v1 = await f.addVersion(1, ['A', 'B'], PpctVersionStatus.PUBLISHED); const association = await f.associate(v1.version.id, MONDAYS[0]);
    await f.addMakeup({ associationId: association.id, ppctVersionId: v1.version.id, ppctItemId: v1.revisions[0]!.ppctItemId, sourceDate: MONDAYS[0], targetDate: MONDAYS[1] });
    const result = await f.service.resolve({ academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, throughCivilDate: MONDAYS[1] }); expect(result.makeupSourceMatches).toEqual([expect.objectContaining({ status: 'MATCH', expectedPpctItem: expect.objectContaining({ title: 'A' }) })]);
  });

  it('I8B reports exact make-up source mismatch for a different DB-valid item', async () => {
    const f = await fixture(); const v1 = await f.addVersion(1, ['A', 'B'], PpctVersionStatus.PUBLISHED); const association = await f.associate(v1.version.id, MONDAYS[0]);
    const row = await f.addMakeup({ associationId: association.id, ppctVersionId: v1.version.id, ppctItemId: v1.revisions[1]!.ppctItemId, sourceDate: MONDAYS[0], targetDate: MONDAYS[1] });
    const result = await f.service.resolve({ academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, throughCivilDate: MONDAYS[1] });
    expect(result.makeupSourceMatches).toEqual([expect.objectContaining({ occurrenceKey: `MAKEUP:${row.id}`, status: 'MISMATCH', expectedPpctItem: null })]); expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PPCT_MAKEUP_SOURCE_ALLOCATION_MISMATCH', occurrenceKey: `MAKEUP:${row.id}` })]));
  });

  it('I8C reports history-blocked make-up source without a false mismatch', async () => {
    const f = await fixture(); const v1 = await f.addVersion(1, ['A'], PpctVersionStatus.PUBLISHED); const association = await f.associate(v1.version.id, MONDAYS[0]);
    const row = await f.addMakeup({ associationId: association.id, ppctVersionId: v1.version.id, ppctItemId: v1.revisions[0]!.ppctItemId, sourceDate: MONDAYS[1], targetDate: MONDAYS[2] });
    const result = await f.service.resolve({ academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, throughCivilDate: MONDAYS[2] });
    expect(result.makeupSourceMatches).toEqual([expect.objectContaining({ occurrenceKey: `MAKEUP:${row.id}`, status: 'NOT_ASSESSED_HISTORY_BLOCKED', expectedPpctItem: null })]); expect(result.findings.filter((finding) => finding.occurrenceKey === `MAKEUP:${row.id}`)).toEqual([]);
  });
});
