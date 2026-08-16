import { CatalogStatus, OperationalOverlayStatus, PpctVersionStatus, UserStatus } from '@prisma/client';
import { ResolvedLessonOccurrencesService } from '../../src/resolved-occurrences/resolved-occurrences.service';
import { PpctAssociationReadService } from '../../src/ppct/ppct-association-read.service';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';

const civilDate = '2026-09-07';
integration('resolved lesson occurrences structural read model (PostgreSQL)', () => {
  const h = new Phase01Harness();
  beforeAll(async () => h.start());
  afterAll(async () => { try { await clean(); } finally { await h.stop(); } });
  beforeEach(async () => clean());
  async function clean() {
    await h.prisma.specialActivityStaffing.deleteMany(); await h.prisma.specialActivityClassTarget.deleteMany(); await h.prisma.specialActivityTimeSlot.deleteMany(); await h.prisma.specialActivity.deleteMany(); await h.prisma.makeupTeachingSchedule.deleteMany(); await h.prisma.operationalLessonDisposition.deleteMany(); await h.prisma.calendarExceptionTimeSlot.deleteMany(); await h.prisma.calendarException.deleteMany(); await h.prisma.ppctClassAssociation.deleteMany(); await h.prisma.ppctItemRevision.deleteMany(); await h.prisma.ppctItem.deleteMany(); await h.prisma.ppctVersion.deleteMany(); await h.prisma.ppctPlan.deleteMany(); await h.clean();
  }
  async function fixture() {
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('OCC'), name: 'Occurrence year' } });
    const actor = await h.prisma.user.create({ data: { username: `occ-${crypto.randomUUID().slice(0, 8)}`, passwordHash: 'hash', status: UserStatus.ACTIVE, mustChangePassword: false, profile: { create: { displayName: 'Actor', isTeachingStaff: true } } }, include: { profile: true } });
    const calendar = await h.prisma.academicCalendarVersion.create({ data: { academicYearId: year.id, versionNumber: 1, startDate: new Date('2026-09-01Z'), endDate: new Date('2027-05-31Z'), officialWeekCount: 35, reserveWeekCount: 1, teachingWeekdays: ['MONDAY'], isActive: true } });
    const week = await h.prisma.academicWeek.create({ data: { calendarVersionId: calendar.id, kind: 'OFFICIAL', officialWeekNumber: 1, displayLabel: 'Week 1', sortOrder: 1 } });
    const schoolClass = await h.prisma.schoolClass.create({ data: { academicYearId: year.id, code: normalizedCode('C'), name: '10A1', gradeLevel: 10, status: CatalogStatus.ACTIVE } });
    const subject = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Subject', status: CatalogStatus.ACTIVE } });
    const slot = await h.prisma.timeSlotDefinition.create({ data: { academicYearId: year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 1, revision: 1, displayLabel: 'One', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z'), isActive: true, allowRegularTeaching: true, allowMakeupTeaching: true, allowSelfStudy: false } });
    const touchingSlot = await h.prisma.timeSlotDefinition.create({ data: { academicYearId: year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 2, revision: 1, displayLabel: 'Two', startTime: new Date('1970-01-01T07:45:00Z'), endTime: new Date('1970-01-01T08:30:00Z'), isActive: true, allowRegularTeaching: true, allowMakeupTeaching: true, allowSelfStudy: false } });
    const assignment = await h.prisma.teachingAssignment.create({ data: { academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: actor.id, validFrom: new Date('2026-09-01Z') } });
    const timetable = await h.prisma.timetableVersion.create({ data: { academicYearId: year.id, versionNumber: 1, status: 'ACTIVE', calendarVersionId: calendar.id, effectiveAcademicWeekId: week.id, effectiveFrom: new Date(`${civilDate}Z`), createdByUserId: actor.id } });
    const timetableEntry = await h.prisma.timetableEntry.create({ data: { timetableVersionId: timetable.id, academicYearId: year.id, weekday: 'MONDAY', timeSlotDefinitionId: slot.id, schoolClassId: schoolClass.id, subjectId: subject.id, teachingAssignmentId: assignment.id, teacherUserId: actor.id } });
    const plan = await h.prisma.ppctPlan.create({ data: { academicYearId: year.id, subjectId: subject.id, gradeLevel: 10 } });
    const ppctVersion = await h.prisma.ppctVersion.create({ data: { ppctPlanId: plan.id, versionNumber: 1, status: PpctVersionStatus.PUBLISHED, createdByUserId: actor.id, publishedByUserId: actor.id, publishedAt: new Date('2026-08-01Z') } });
    const association = await h.prisma.ppctClassAssociation.create({ data: { academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, gradeLevel: 10, ppctPlanId: plan.id, ppctVersionId: ppctVersion.id, effectiveFrom: new Date('2026-09-01Z'), createdByUserId: actor.id } });
    const service = new ResolvedLessonOccurrencesService(h.prisma as never, new PpctAssociationReadService(h.prisma as never));
    return { year, actor, calendar, schoolClass, subject, slot, touchingSlot, assignment, timetable, timetableEntry, plan, ppctVersion, association, service };
  }
  it('retains the existing missing-timetable read-only outcome', async () => {
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('MISS'), name: 'Missing' } }); const service = new ResolvedLessonOccurrencesService(h.prisma as never, new PpctAssociationReadService(h.prisma as never)); const before = await h.prisma.academicYear.count(); const result = await service.resolve({ academicYearId: year.id, civilDate });
    expect(result.findings).toEqual([expect.objectContaining({ code: 'TIMETABLE_EFFECTIVE_VERSION_MISSING' })]); expect(await h.prisma.academicYear.count()).toBe(before);
  });
  it('resolves normal BASE_TIMETABLE with exact PPCT binding and no writes', async () => {
    const f = await fixture(); const before = await Promise.all([h.prisma.timetableEntry.count(), h.prisma.ppctClassAssociation.count(), h.prisma.specialActivity.count()]); const result = await f.service.resolve({ academicYearId: f.year.id, civilDate }); const after = await Promise.all([h.prisma.timetableEntry.count(), h.prisma.ppctClassAssociation.count(), h.prisma.specialActivity.count()]);
    expect(result).toMatchObject({ status: 'PASS', coverage: { ppctItemAllocation: 'NOT_ASSESSED' }, normalOccurrences: [expect.objectContaining({ occurrenceKey: `NORMAL:${f.timetableEntry.id}:${civilDate}`, effectiveKind: 'BASE_TIMETABLE', academicCalendarVersionId: f.calendar.id, timetableVersionId: f.timetable.id, timetableEntryId: f.timetableEntry.id, teachingAssignmentId: f.assignment.id, subjectId: f.subject.id, responsibleTeacherUserId: f.actor.id, ppctBinding: { ppctClassAssociationId: f.association.id, ppctPlanId: f.plan.id, ppctVersionId: f.ppctVersion.id, ppctVersionStatus: 'PUBLISHED' } })] }); expect(after).toEqual(before);
  });
  it('retains normal occurrence under a CalendarException', async () => {
    const f = await fixture(); const exception = await h.prisma.calendarException.create({ data: { academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate: new Date(`${civilDate}Z`), scope: 'CLASS', schoolClassId: f.schoolClass.id, timeSelector: 'EXACT_SLOTS', status: OperationalOverlayStatus.ACTIVE, createRequestKey: crypto.randomUUID(), createRequestFingerprint: crypto.randomUUID(), createdByUserId: f.actor.id, exactTimeSlots: { create: { academicYearId: f.year.id, timeSlotDefinitionId: f.slot.id } } } }); const result = await f.service.resolve({ academicYearId: f.year.id, civilDate });
    expect(result.normalOccurrences[0]).toMatchObject({ effectiveKind: 'CALENDAR_EXCEPTION', exceptionIds: [exception.id] });
  });
  it('returns one active SpecialActivity root and suppresses matching normal', async () => {
    const f = await fixture(); const activity = await h.prisma.specialActivity.create({ data: { academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate: new Date(`${civilDate}Z`), scope: 'CLASS', schoolClassId: f.schoolClass.id, title: 'Activity', status: 'ACTIVE', createRequestKey: crypto.randomUUID(), createRequestFingerprint: crypto.randomUUID(), createdByUserId: f.actor.id, timeSlots: { create: { academicYearId: f.year.id, timeSlotDefinitionId: f.slot.id } }, classTargets: { create: { academicYearId: f.year.id, schoolClassId: f.schoolClass.id } }, staffing: { create: { scheduledTeacherUserId: f.actor.id, staffProfileId: f.actor.profile!.id, eligibilityCheckedAt: new Date(), eligibilityWasActive: true, eligibilityWasTeachingStaff: true } } } }); const result = await f.service.resolve({ academicYearId: f.year.id, civilDate });
    expect(result.normalOccurrences[0]).toMatchObject({ effectiveKind: 'SPECIAL_ACTIVITY_SUPPRESSED', suppressingSpecialActivityIds: [activity.id] }); expect(result.specialActivityOccurrences).toHaveLength(1);
  });
  it('resolves an exact active operational disposition', async () => {
    const f = await fixture(); const disposition = await h.prisma.operationalLessonDisposition.create({ data: { academicYearId: f.year.id, timetableVersionId: f.timetable.id, timetableEntryId: f.timetableEntry.id, sourceCivilDate: new Date(`${civilDate}Z`), academicCalendarVersionId: f.calendar.id, timeSlotDefinitionId: f.slot.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, teachingAssignmentId: f.assignment.id, responsibleTeacherUserId: f.actor.id, dispositionType: 'AUTHORIZED_CANCELLATION', status: OperationalOverlayStatus.ACTIVE, createRequestKey: crypto.randomUUID(), createRequestFingerprint: crypto.randomUUID(), createdByUserId: f.actor.id } }); const result = await f.service.resolve({ academicYearId: f.year.id, civilDate });
    expect(result.normalOccurrences[0]).toMatchObject({ effectiveKind: 'OPERATIONAL_DISPOSITION', disposition: expect.objectContaining({ id: disposition.id }) });
  });
  it('treats touching activity slot boundary as non-overlap', async () => {
    const f = await fixture(); await h.prisma.specialActivity.create({ data: { academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate: new Date(`${civilDate}Z`), scope: 'CLASS', schoolClassId: f.schoolClass.id, title: 'Touching', status: 'ACTIVE', createRequestKey: crypto.randomUUID(), createRequestFingerprint: crypto.randomUUID(), createdByUserId: f.actor.id, timeSlots: { create: { academicYearId: f.year.id, timeSlotDefinitionId: f.touchingSlot.id } }, classTargets: { create: { academicYearId: f.year.id, schoolClassId: f.schoolClass.id } }, staffing: { create: { scheduledTeacherUserId: f.actor.id, staffProfileId: f.actor.profile!.id, eligibilityCheckedAt: new Date(), eligibilityWasActive: true, eligibilityWasTeachingStaff: true } } } }); const result = await f.service.resolve({ academicYearId: f.year.id, civilDate });
    expect(result.normalOccurrences[0]).toMatchObject({ effectiveKind: 'BASE_TIMETABLE', suppressingSpecialActivityIds: [] });
  });
});
