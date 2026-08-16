import { ResolvedLessonOccurrencesService } from '../../src/resolved-occurrences/resolved-occurrences.service';

const civilDate = '2026-08-17' as const;
const date = (value: string) => new Date(value);
const version = (id = 'version') => ({ id, academicYearId: 'year', calendarVersionId: 'calendar', effectiveFrom: date('2026-08-01Z'), effectiveUntil: null });
const calendar = { id: 'calendar', academicYearId: 'year', startDate: date('2026-08-01Z'), endDate: date('2026-08-31Z') };
const entry = (id = 'entry') => ({ id, academicYearId: 'year', timetableVersionId: 'version', weekday: 'MONDAY', timeSlotDefinitionId: 'slot', schoolClassId: 'class', subjectId: 'subject', teachingAssignmentId: 'assignment', teacherUserId: 'teacher', timeSlotDefinition: { id: 'slot', academicYearId: 'year', weekday: 'MONDAY', session: 'MORNING', startTime: date('1970-01-01T07:00:00Z'), endTime: date('1970-01-01T07:45:00Z') }, schoolClass: { id: 'class', academicYearId: 'year', gradeLevel: 10 }, teachingAssignment: { academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', teacherUserId: 'teacher' } });
const association = (status = 'PUBLISHED') => ({ id: 'association', academicYearId: 'year', schoolClassId: 'class', subjectId: 'subject', ppctPlanId: 'plan', ppctVersionId: 'ppct-version', ppctVersionStatus: status, effectiveFrom: date('2026-08-01Z'), effectiveUntil: null });
const activity = (id: string, schoolClassId = 'class', teacher = 'activity-teacher', start = '07:15:00Z', end = '08:00:00Z') => ({ id, academicYearId: 'year', academicCalendarVersionId: 'calendar', title: id, note: null, classTargets: [{ schoolClassId }], timeSlots: [{ timeSlotDefinition: { id: `${id}-slot`, weekday: 'MONDAY', session: 'MORNING', startTime: date(`1970-01-01T${start}`), endTime: date(`1970-01-01T${end}`) } }], staffing: [{ scheduledTeacherUserId: teacher, staffProfileId: `${teacher}-profile`, eligibilityCheckedAt: date('2026-01-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true }] });
const disposition = (id = 'disposition') => ({ id, timetableEntryId: 'entry', dispositionType: 'AUTHORIZED_CANCELLATION', responsibleTeacherUserId: 'teacher', assignedTeacherUserId: null, eligibilityCheckedAt: null, eligibilityWasActive: null, eligibilityWasTeachingStaff: null });
const makeup = (id: string, schoolClassId = 'class', teacher = 'makeup-teacher', start = '07:30:00Z', end = '08:00:00Z') => ({ id, academicYearId: 'year', targetCivilDate: date('2026-08-17Z'), targetAcademicCalendarVersionId: 'calendar', targetTimeSlotDefinitionId: `${id}-slot`, schoolClassId, subjectId: 'subject', scheduledTeacherUserId: teacher, targetTimeSlotDefinition: { weekday: 'MONDAY', session: 'MORNING', startTime: date(`1970-01-01T${start}`), endTime: date(`1970-01-01T${end}`) }, originalTimetableVersionId: 'version', originalTimetableEntryId: 'entry', originalCivilDate: date('2026-08-10Z'), originalAcademicCalendarVersionId: 'calendar', originalTimeSlotDefinitionId: 'slot', originalTeachingAssignmentId: 'assignment', responsibleTeacherUserId: 'teacher', ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'ppct-version', ppctItemId: 'item', sourceDispositionId: null });

function harness(options: { versions?: object[]; entries?: object[]; activities?: object[]; makeups?: object[]; interruptions?: object[]; exceptions?: object[]; dispositions?: object[]; associations?: object[]; calendar?: object | null } = {}) {
  const tx = { timetableVersion: { findMany: jest.fn().mockResolvedValue(options.versions ?? [version()]) }, specialActivity: { findMany: jest.fn().mockResolvedValue(options.activities ?? []) }, makeupTeachingSchedule: { findMany: jest.fn().mockResolvedValue(options.makeups ?? []) }, academicCalendarVersion: { findUnique: jest.fn().mockResolvedValue(options.calendar === undefined ? calendar : options.calendar) }, timetableEntry: { findMany: jest.fn().mockResolvedValue(options.entries ?? [entry()]) }, calendarInterruption: { findMany: jest.fn().mockResolvedValue(options.interruptions ?? []) }, calendarException: { findMany: jest.fn().mockResolvedValue(options.exceptions ?? []) }, operationalLessonDisposition: { findMany: jest.fn().mockResolvedValue(options.dispositions ?? []) } };
  const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
  const ppct = { findOverlappingRange: jest.fn().mockResolvedValue(options.associations ?? [association()]) };
  return { tx, prisma, ppct, service: new ResolvedLessonOccurrencesService(prisma as never, ppct as never) };
}

describe('ResolvedLessonOccurrencesService structural profile', () => {
  it('uses one RepeatableRead transaction, passes its tx to PPCT, and returns base provenance', async () => {
    const h = harness(); const result = await h.service.resolve({ academicYearId: 'year', civilDate });
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' }); expect(h.ppct.findOverlappingRange).toHaveBeenCalledWith(h.tx, expect.any(Array), expect.any(Date), expect.any(Date));
    expect(result).toMatchObject({ status: 'PASS', coverage: { ppctItemAllocation: 'NOT_ASSESSED' }, normalOccurrences: [expect.objectContaining({ occurrenceKey: 'NORMAL:entry:2026-08-17', academicCalendarVersionId: 'calendar', effectiveKind: 'BASE_TIMETABLE', ppctBinding: { ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'ppct-version', ppctVersionStatus: 'PUBLISHED' } })] });
  });

  it.each([['missing', [], 'TIMETABLE_EFFECTIVE_VERSION_MISSING'], ['ambiguous', [version('a'), version('b')], 'TIMETABLE_EFFECTIVE_VERSION_AMBIGUOUS']])('fails closed for %s effective timetable', async (_label, versions, code) => {
    const h = harness({ versions }); const result = await h.service.resolve({ academicYearId: 'year', civilDate }); expect(result.findings).toEqual([expect.objectContaining({ code })]); expect(h.tx.academicCalendarVersion.findUnique).not.toHaveBeenCalled();
  });

  it.each([['missing', [], 'PPCT_ASSOCIATION_MISSING'], ['ambiguous', [association(), { ...association(), id: 'two' }], 'PPCT_ASSOCIATION_AMBIGUOUS'], ['draft', [association('DRAFT')], 'PPCT_ASSOCIATION_INVALID_TARGET']])('blocks %s PPCT', async (_label, associations, code) => {
    const result = await harness({ associations }).service.resolve({ academicYearId: 'year', civilDate }); expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  });

  it('accepts a SUPERSEDED historical PPCT binding', async () => {
    const result = await harness({ associations: [association('SUPERSEDED')] }).service.resolve({ academicYearId: 'year', civilDate }); expect(result).toMatchObject({ status: 'PASS', normalOccurrences: [expect.objectContaining({ ppctBinding: expect.objectContaining({ ppctVersionStatus: 'SUPERSEDED' }) })] });
  });

  it.each([[{ scope: 'SCHOOL_WIDE', timeSelector: 'WHOLE_DAY', gradeLevel: null, schoolClassId: null, session: null, exactTimeSlots: [] }], [{ scope: 'GRADE', timeSelector: 'SESSION', gradeLevel: 10, schoolClassId: null, session: 'MORNING', exactTimeSlots: [] }], [{ scope: 'CLASS', timeSelector: 'EXACT_SLOTS', gradeLevel: null, schoolClassId: 'class', session: null, exactTimeSlots: [{ timeSlotDefinitionId: 'slot' }] }]])('matches exception scope/time selectors', async (value) => {
    const result = await harness({ exceptions: [{ id: 'exception', ...value }] }).service.resolve({ academicYearId: 'year', civilDate }); expect(result.normalOccurrences[0]?.effectiveKind).toBe('CALENDAR_EXCEPTION');
  });

  it('retains normal and activity, enforcing interruption precedence over exception/activity/disposition', async () => {
    const activity = { id: 'activity', academicYearId: 'year', academicCalendarVersionId: 'calendar', title: 'Activity', note: null, classTargets: [{ schoolClassId: 'class' }], timeSlots: [{ timeSlotDefinition: { id: 'other', weekday: 'MONDAY', session: 'MORNING', startTime: date('1970-01-01T07:15:00Z'), endTime: date('1970-01-01T08:00:00Z') } }], staffing: [] };
    const disposition = { id: 'd', timetableEntryId: 'entry', dispositionType: 'AUTHORIZED_CANCELLATION', responsibleTeacherUserId: 'teacher', assignedTeacherUserId: null, eligibilityCheckedAt: null, eligibilityWasActive: null, eligibilityWasTeachingStaff: null };
    const result = await harness({ activities: [activity], interruptions: [{ id: 'i' }], exceptions: [{ id: 'e', scope: 'SCHOOL_WIDE', timeSelector: 'WHOLE_DAY', gradeLevel: null, schoolClassId: null, session: null, exactTimeSlots: [] }], dispositions: [disposition] }).service.resolve({ academicYearId: 'year', civilDate });
    expect(result.normalOccurrences[0]).toMatchObject({ effectiveKind: 'CALENDAR_INTERRUPTION', interruptionIds: ['i'], exceptionIds: ['e'], suppressingSpecialActivityIds: ['activity'] }); expect(result.specialActivityOccurrences).toHaveLength(1); expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ACTIVE_SPECIAL_ACTIVITY_DISPOSITION_CONFLICT' })]));
  });

  it('does not suppress at touching half-open boundary or an unmatched exception', async () => {
    const activity = { id: 'activity', academicYearId: 'year', academicCalendarVersionId: 'calendar', title: 'Activity', note: null, classTargets: [{ schoolClassId: 'class' }], timeSlots: [{ timeSlotDefinition: { id: 'later', weekday: 'MONDAY', session: 'MORNING', startTime: date('1970-01-01T07:45:00Z'), endTime: date('1970-01-01T08:15:00Z') } }], staffing: [] };
    const result = await harness({ activities: [activity], exceptions: [{ id: 'wrong', scope: 'GRADE', timeSelector: 'SESSION', gradeLevel: 11, schoolClassId: null, session: 'AFTERNOON', exactTimeSlots: [] }] }).service.resolve({ academicYearId: 'year', civilDate }); expect(result.normalOccurrences[0]).toMatchObject({ effectiveKind: 'BASE_TIMETABLE', exceptionIds: [], suppressingSpecialActivityIds: [] });
  });

  it('blocks duplicate exact dispositions and recomputes without a cache', async () => {
    const disposition = { id: 'd1', timetableEntryId: 'entry', dispositionType: 'AUTHORIZED_CANCELLATION', responsibleTeacherUserId: 'teacher', assignedTeacherUserId: null, eligibilityCheckedAt: null, eligibilityWasActive: null, eligibilityWasTeachingStaff: null }; const h = harness({ dispositions: [disposition, { ...disposition, id: 'd2' }] }); const first = await h.service.resolve({ academicYearId: 'year', civilDate }); h.tx.timetableVersion.findMany.mockResolvedValue([]); const second = await h.service.resolve({ academicYearId: 'year', civilDate });
    expect(first.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'OPERATIONAL_DISPOSITION_AMBIGUOUS' })])); expect(second.findings[0]?.code).toBe('TIMETABLE_EFFECTIVE_VERSION_MISSING'); expect(first.normalOccurrences).toHaveLength(1);
  });

  it('returns make-up original obligation and blocks overlapping activity resource collision without writes', async () => {
    const activity = { id: 'activity', academicYearId: 'year', academicCalendarVersionId: 'calendar', title: 'Activity', note: null, classTargets: [{ schoolClassId: 'class' }], timeSlots: [{ timeSlotDefinition: { id: 'activity-slot', weekday: 'MONDAY', session: 'MORNING', startTime: date('1970-01-01T07:15:00Z'), endTime: date('1970-01-01T08:00:00Z') } }], staffing: [{ scheduledTeacherUserId: 'makeup-teacher', staffProfileId: 'profile', eligibilityCheckedAt: date('2026-01-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true }] };
    const makeup = { id: 'makeup', academicYearId: 'year', targetCivilDate: date('2026-08-17Z'), targetAcademicCalendarVersionId: 'calendar', targetTimeSlotDefinitionId: 'slot', schoolClassId: 'class', subjectId: 'subject', scheduledTeacherUserId: 'makeup-teacher', targetTimeSlotDefinition: { weekday: 'MONDAY', session: 'MORNING', startTime: date('1970-01-01T07:30:00Z'), endTime: date('1970-01-01T08:00:00Z') }, originalTimetableVersionId: 'version', originalTimetableEntryId: 'entry', originalCivilDate: date('2026-08-10Z'), originalAcademicCalendarVersionId: 'calendar', originalTimeSlotDefinitionId: 'slot', originalTeachingAssignmentId: 'assignment', responsibleTeacherUserId: 'teacher', ppctClassAssociationId: 'association', ppctPlanId: 'plan', ppctVersionId: 'ppct-version', ppctItemId: 'item', sourceDispositionId: null };
    const h = harness({ activities: [activity], makeups: [makeup] }); const result = await h.service.resolve({ academicYearId: 'year', civilDate }); expect(result.makeupOccurrences[0]).toMatchObject({ occurrenceKey: 'MAKEUP:makeup', originalObligation: { ppctItemId: 'item' } }); expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ACTIVE_SPECIAL_ACTIVITY_MAKEUP_COLLISION' })])); expect(Object.values(h.tx).flatMap((delegate) => Object.keys(delegate))).not.toEqual(expect.arrayContaining(['create', 'update', 'delete', 'upsert']));
  });

  it.each([{ calendar: null }, { calendar: { ...calendar, academicYearId: 'other' } }])('blocks missing or invalid retained calendar', async (invalidCalendar) => {
    const result = await harness({ calendar: invalidCalendar }).service.resolve({ academicYearId: 'year', civilDate }); expect(result.findings).toEqual([expect.objectContaining({ code: 'RETAINED_CALENDAR_INVALID' })]);
  });

  it('blocks contradictory normal provenance without rebinding it', async () => {
    const result = await harness({ entries: [{ ...entry(), teachingAssignment: { academicYearId: 'year', schoolClassId: 'class', subjectId: 'other-subject', teacherUserId: 'teacher' } }] }).service.resolve({ academicYearId: 'year', civilDate }); expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'NORMAL_PROVENANCE_INVALID' })]));
  });

  it('suppresses for real positive overlap and preserves one multi-child activity root in sorted order', async () => {
    const activity = { id: 'activity', academicYearId: 'year', academicCalendarVersionId: 'calendar', title: 'Activity', note: null, classTargets: [{ schoolClassId: 'z' }, { schoolClassId: 'class' }], timeSlots: [{ timeSlotDefinition: { id: 'z-slot', weekday: 'MONDAY', session: 'MORNING', startTime: date('1970-01-01T08:00:00Z'), endTime: date('1970-01-01T08:30:00Z') } }, { timeSlotDefinition: { id: 'a-slot', weekday: 'MONDAY', session: 'MORNING', startTime: date('1970-01-01T07:15:00Z'), endTime: date('1970-01-01T08:00:00Z') } }], staffing: [{ scheduledTeacherUserId: 'z', staffProfileId: 'z', eligibilityCheckedAt: date('2026-01-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true }, { scheduledTeacherUserId: 'a', staffProfileId: 'a', eligibilityCheckedAt: date('2026-01-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true }] };
    const result = await harness({ activities: [activity] }).service.resolve({ academicYearId: 'year', civilDate }); expect(result.normalOccurrences[0]).toMatchObject({ effectiveKind: 'SPECIAL_ACTIVITY_SUPPRESSED', suppressingSpecialActivityIds: ['activity'] }); expect(result.specialActivityOccurrences).toHaveLength(1); expect(result.specialActivityOccurrences[0]).toMatchObject({ classTargetIds: ['class', 'z'], timeSlots: [expect.objectContaining({ id: 'a-slot' }), expect.objectContaining({ id: 'z-slot' })], staffing: [expect.objectContaining({ scheduledTeacherUserId: 'a' }), expect.objectContaining({ scheduledTeacherUserId: 'z' })] });
  });

  it.each([
    ['class', [{ id: 'a', academicYearId: 'year', academicCalendarVersionId: 'calendar', title: 'A', note: null, classTargets: [{ schoolClassId: 'class' }], timeSlots: [{ timeSlotDefinition: { startTime: date('1970-01-01T07:00:00Z'), endTime: date('1970-01-01T07:45:00Z') } }], staffing: [] }, { id: 'b', academicYearId: 'year', academicCalendarVersionId: 'calendar', title: 'B', note: null, classTargets: [{ schoolClassId: 'class' }], timeSlots: [{ timeSlotDefinition: { startTime: date('1970-01-01T07:15:00Z'), endTime: date('1970-01-01T08:00:00Z') } }], staffing: [] }]],
    ['teacher', [{ id: 'a', academicYearId: 'year', academicCalendarVersionId: 'calendar', title: 'A', note: null, classTargets: [], timeSlots: [{ timeSlotDefinition: { startTime: date('1970-01-01T07:00:00Z'), endTime: date('1970-01-01T07:45:00Z') } }], staffing: [{ scheduledTeacherUserId: 'teacher', staffProfileId: 'profile', eligibilityCheckedAt: date('2026-01-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true }] }, { id: 'b', academicYearId: 'year', academicCalendarVersionId: 'calendar', title: 'B', note: null, classTargets: [], timeSlots: [{ timeSlotDefinition: { startTime: date('1970-01-01T07:15:00Z'), endTime: date('1970-01-01T08:00:00Z') } }], staffing: [{ scheduledTeacherUserId: 'teacher', staffProfileId: 'profile', eligibilityCheckedAt: date('2026-01-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true }] }]],
  ])('blocks overlapping activity collision by %s', async (_kind, activities) => { const result = await harness({ activities }).service.resolve({ academicYearId: 'year', civilDate }); expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ACTIVE_SPECIAL_ACTIVITY_COLLISION' })])); });

  it.each([
    ['exception', { exceptions: [{ id: 'exception', scope: 'SCHOOL_WIDE', gradeLevel: null, schoolClassId: null, timeSelector: 'WHOLE_DAY', session: null, exactTimeSlots: [] }], activities: [activity('activity')], dispositions: [disposition()] }, 'CALENDAR_EXCEPTION'],
    ['activity', { activities: [activity('activity')], dispositions: [disposition()] }, 'SPECIAL_ACTIVITY_SUPPRESSED'],
    ['disposition', { dispositions: [disposition()] }, 'OPERATIONAL_DISPOSITION'],
    ['base', {}, 'BASE_TIMETABLE'],
  ])('applies normal precedence at %s layer', async (_layer, options, effectiveKind) => {
    const result = await harness(options).service.resolve({ academicYearId: 'year', civilDate }); expect(result.normalOccurrences[0]?.effectiveKind).toBe(effectiveKind);
    if (_layer === 'exception' || _layer === 'activity') expect(result).toMatchObject({ status: 'BLOCKED', findings: expect.arrayContaining([expect.objectContaining({ code: 'ACTIVE_SPECIAL_ACTIVITY_DISPOSITION_CONFLICT' })]) });
  });

  it.each([
    ['class', activity('activity', 'class', 'activity-teacher'), makeup('makeup', 'class', 'other-teacher'), true],
    ['teacher', activity('activity', 'other-class', 'shared-teacher'), makeup('makeup', 'class', 'shared-teacher'), true],
    ['touching', activity('activity', 'class', 'shared-teacher', '07:45:00Z', '08:30:00Z'), makeup('makeup', 'class', 'shared-teacher', '07:00:00Z', '07:45:00Z'), false],
    ['disjoint', activity('activity', 'other-class', 'activity-teacher'), makeup('makeup', 'class', 'makeup-teacher'), false],
  ])('evaluates activity/make-up %s collision branch independently', async (_kind, active, scheduled, collides) => {
    const result = await harness({ activities: [active], makeups: [scheduled] }).service.resolve({ academicYearId: 'year', civilDate }); const codes = result.findings.map((finding) => finding.code);
    expect(codes.includes('ACTIVE_SPECIAL_ACTIVITY_MAKEUP_COLLISION')).toBe(collides);
  });

  it.each([
    ['disjoint resources', [activity('a', 'class-a', 'teacher-a'), activity('b', 'class-b', 'teacher-b')]],
    ['touching shared class', [activity('a', 'class', 'teacher-a', '07:00:00Z', '07:45:00Z'), activity('b', 'class', 'teacher-b', '07:45:00Z', '08:30:00Z')]],
  ])('does not report activity/activity collision for %s', async (_kind, activities) => {
    const result = await harness({ activities }).service.resolve({ academicYearId: 'year', civilDate }); expect(result.findings.map((finding) => finding.code)).not.toContain('ACTIVE_SPECIAL_ACTIVITY_COLLISION');
  });

  it('sorts deliberately unsorted structural output deterministically', async () => {
    const entryA = { ...entry('z-entry'), schoolClassId: 'class-a', subjectId: 'subject-a', schoolClass: { id: 'class-a', academicYearId: 'year', gradeLevel: 10 }, teachingAssignment: { academicYearId: 'year', schoolClassId: 'class-a', subjectId: 'subject-a', teacherUserId: 'teacher' } }; const entryB = { ...entry('a-entry'), schoolClassId: 'class-b', subjectId: 'subject-b', schoolClass: { id: 'class-b', academicYearId: 'year', gradeLevel: 10 }, teachingAssignment: { academicYearId: 'year', schoolClassId: 'class-b', subjectId: 'subject-b', teacherUserId: 'teacher' } };
    const alpha = { ...activity('a-activity', 'class-b', 'teacher-b'), classTargets: [{ schoolClassId: 'z' }, { schoolClassId: 'class-b' }], timeSlots: [{ timeSlotDefinition: { id: 'z-slot', weekday: 'MONDAY', session: 'MORNING', startTime: date('1970-01-01T08:00:00Z'), endTime: date('1970-01-01T08:30:00Z') } }, { timeSlotDefinition: { id: 'a-slot', weekday: 'MONDAY', session: 'MORNING', startTime: date('1970-01-01T07:15:00Z'), endTime: date('1970-01-01T08:00:00Z') } }], staffing: [{ scheduledTeacherUserId: 'z', staffProfileId: 'z', eligibilityCheckedAt: date('2026-01-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true }, { scheduledTeacherUserId: 'a', staffProfileId: 'a', eligibilityCheckedAt: date('2026-01-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true }] };
    const result = await harness({ entries: [entryA, entryB], activities: [activity('z-activity', 'class-a', 'teacher-a'), alpha], makeups: [makeup('z-makeup'), makeup('a-makeup')], interruptions: [{ id: 'z' }, { id: 'a' }], exceptions: [{ id: 'z-ex', scope: 'SCHOOL_WIDE', gradeLevel: null, schoolClassId: null, timeSelector: 'WHOLE_DAY', session: null, exactTimeSlots: [] }, { id: 'a-ex', scope: 'SCHOOL_WIDE', gradeLevel: null, schoolClassId: null, timeSelector: 'WHOLE_DAY', session: null, exactTimeSlots: [] }], associations: [{ ...association(), id: 'z-assoc', schoolClassId: 'class-a', subjectId: 'subject-a' }, { ...association(), id: 'a-assoc', schoolClassId: 'class-a', subjectId: 'subject-a' }, { ...association(), id: 'b-assoc', schoolClassId: 'class-b', subjectId: 'subject-b' }] }).service.resolve({ academicYearId: 'year', civilDate });
    expect(result.normalOccurrences.map((row) => row.occurrenceKey)).toEqual(['NORMAL:a-entry:2026-08-17', 'NORMAL:z-entry:2026-08-17']); expect(result.makeupOccurrences.map((row) => row.occurrenceKey)).toEqual(['MAKEUP:a-makeup', 'MAKEUP:z-makeup']); expect(result.specialActivityOccurrences.map((row) => row.occurrenceKey)).toEqual(['SPECIAL_ACTIVITY:a-activity', 'SPECIAL_ACTIVITY:z-activity']); expect(result.normalOccurrences[0]).toMatchObject({ interruptionIds: ['a', 'z'], exceptionIds: ['a-ex', 'z-ex'], suppressingSpecialActivityIds: ['a-activity'] }); expect(result.specialActivityOccurrences[0]).toMatchObject({ classTargetIds: ['class-b', 'z'], timeSlots: [expect.objectContaining({ id: 'a-slot' }), expect.objectContaining({ id: 'z-slot' })], staffing: [expect.objectContaining({ scheduledTeacherUserId: 'a' }), expect.objectContaining({ scheduledTeacherUserId: 'z' })] }); expect(result.findings).toEqual([expect.objectContaining({ code: 'PPCT_ASSOCIATION_AMBIGUOUS', occurrenceKey: 'NORMAL:z-entry:2026-08-17', entityIds: ['a-assoc', 'z-assoc'] })]);
  });
});
