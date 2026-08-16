import { Injectable } from '@nestjs/common';
import { AcademicWeekday, OperationalOverlayStatus, PpctVersionStatus, Prisma, SpecialActivityStatus, TimetableVersion, TimetableVersionStatus } from '@prisma/client';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PpctAssociationReadService } from '../ppct/ppct-association-read.service';
import { PrismaService } from '../prisma/prisma.service';
import { intervalsOverlap } from './resolved-occurrence-policy';
import { MakeupStructuralOccurrence, NormalStructuralOccurrence, ResolveLessonOccurrencesInput, ResolvedLessonOccurrencesResult, RESOLVED_LESSON_OCCURRENCE_PROFILE, SpecialActivityStructuralOccurrence, StructuralOccurrenceFinding } from './resolved-occurrence.types';

const normalEntryInclude = { timeSlotDefinition: true, schoolClass: true, teachingAssignment: true } satisfies Prisma.TimetableEntryInclude;
const specialActivityInclude = { classTargets: true, timeSlots: { include: { timeSlotDefinition: true } }, staffing: true } satisfies Prisma.SpecialActivityInclude;
const makeupInclude = { targetTimeSlotDefinition: true } satisfies Prisma.MakeupTeachingScheduleInclude;
type SpecialActivityRow = Prisma.SpecialActivityGetPayload<{ include: typeof specialActivityInclude }>;
type MakeupRow = Prisma.MakeupTeachingScheduleGetPayload<{ include: typeof makeupInclude }>;

const time = (value: Date) => value.toISOString().slice(11, 19);
const weekdayFor = (date: Date) => ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][date.getUTCDay()];

@Injectable()
export class ResolvedLessonOccurrencesService {
  constructor(private readonly prisma: PrismaService, private readonly ppctAssociations: PpctAssociationReadService) {}

  async resolve(input: ResolveLessonOccurrencesInput): Promise<ResolvedLessonOccurrencesResult> {
    return this.prisma.$transaction((tx) => this.resolveSnapshot(tx, input), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private async resolveSnapshot(tx: Prisma.TransactionClient, input: ResolveLessonOccurrencesInput): Promise<ResolvedLessonOccurrencesResult> {
    const date = parseCivilDate(input.civilDate); const findings: StructuralOccurrenceFinding[] = [];
    const blocker = (code: StructuralOccurrenceFinding['code'], occurrenceKey: string | null, ...entityIds: string[]) => findings.push({ severity: 'BLOCKER', code, occurrenceKey, entityIds: entityIds.filter(Boolean).sort() });
    const [versions, activities, makeups] = await Promise.all([
      tx.timetableVersion.findMany({ where: { academicYearId: input.academicYearId, status: { in: [TimetableVersionStatus.ACTIVE, TimetableVersionStatus.SUPERSEDED] }, effectiveFrom: { lte: date }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: date } }] }, orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }] }),
      tx.specialActivity.findMany({ where: { academicYearId: input.academicYearId, civilDate: date, status: SpecialActivityStatus.ACTIVE }, include: specialActivityInclude, orderBy: { id: 'asc' } }),
      tx.makeupTeachingSchedule.findMany({ where: { academicYearId: input.academicYearId, targetCivilDate: date, status: OperationalOverlayStatus.ACTIVE }, include: makeupInclude, orderBy: { id: 'asc' } }),
    ]);
    const specialActivityOccurrences: SpecialActivityStructuralOccurrence[] = activities.map((a): SpecialActivityStructuralOccurrence => ({ occurrenceKey: `SPECIAL_ACTIVITY:${a.id}`, family: 'SPECIAL_ACTIVITY', id: a.id, academicYearId: a.academicYearId, academicCalendarVersionId: a.academicCalendarVersionId, civilDate: input.civilDate, title: a.title, note: a.note, classTargetIds: a.classTargets.map((x) => x.schoolClassId).sort(), timeSlots: a.timeSlots.map((x) => ({ id: x.timeSlotDefinition.id, weekday: x.timeSlotDefinition.weekday, session: x.timeSlotDefinition.session, startTime: time(x.timeSlotDefinition.startTime), endTime: time(x.timeSlotDefinition.endTime) })).sort((a,b) => a.id.localeCompare(b.id)), staffing: a.staffing.map((x) => ({ scheduledTeacherUserId: x.scheduledTeacherUserId, staffProfileId: x.staffProfileId, eligibilityCheckedAt: x.eligibilityCheckedAt.toISOString(), eligibilityWasActive: x.eligibilityWasActive, eligibilityWasTeachingStaff: x.eligibilityWasTeachingStaff })).sort((a,b) => String(a.scheduledTeacherUserId).localeCompare(String(b.scheduledTeacherUserId))) })).sort((a,b) => a.occurrenceKey.localeCompare(b.occurrenceKey));
    const makeupOccurrences: MakeupStructuralOccurrence[] = makeups.map((m): MakeupStructuralOccurrence => ({ occurrenceKey: `MAKEUP:${m.id}`, family: 'MAKEUP_TEACHING', target: { id: m.id, academicYearId: m.academicYearId, targetCivilDate: formatCivilDate(m.targetCivilDate), targetAcademicCalendarVersionId: m.targetAcademicCalendarVersionId, targetTimeSlotDefinitionId: m.targetTimeSlotDefinitionId, targetSlot: { session: m.targetTimeSlotDefinition.session, startTime: time(m.targetTimeSlotDefinition.startTime), endTime: time(m.targetTimeSlotDefinition.endTime), weekday: m.targetTimeSlotDefinition.weekday }, schoolClassId: m.schoolClassId, subjectId: m.subjectId, scheduledTeacherUserId: m.scheduledTeacherUserId }, originalObligation: { originalTimetableVersionId: m.originalTimetableVersionId, originalTimetableEntryId: m.originalTimetableEntryId, originalCivilDate: formatCivilDate(m.originalCivilDate), originalAcademicCalendarVersionId: m.originalAcademicCalendarVersionId, originalTimeSlotDefinitionId: m.originalTimeSlotDefinitionId, originalTeachingAssignmentId: m.originalTeachingAssignmentId, responsibleTeacherUserId: m.responsibleTeacherUserId, ppctClassAssociationId: m.ppctClassAssociationId, ppctPlanId: m.ppctPlanId, ppctVersionId: m.ppctVersionId, ppctItemId: m.ppctItemId, sourceDispositionId: m.sourceDispositionId } })).sort((a,b) => a.occurrenceKey.localeCompare(b.occurrenceKey));
    const normalOccurrences: NormalStructuralOccurrence[] = [];
    if (versions.length === 0) blocker('TIMETABLE_EFFECTIVE_VERSION_MISSING', null, input.academicYearId);
    if (versions.length > 1) blocker('TIMETABLE_EFFECTIVE_VERSION_AMBIGUOUS', null, ...versions.map((x) => x.id));
    if (versions.length === 1) await this.resolveNormal(tx, input, date, versions[0]!, activities, normalOccurrences, blocker);
    this.detectActivityCollisions(activities, makeups, blocker);
    findings.sort((a,b) => `${a.code}:${a.occurrenceKey ?? ''}:${a.entityIds.join(',')}`.localeCompare(`${b.code}:${b.occurrenceKey ?? ''}:${b.entityIds.join(',')}`));
    return { profile: RESOLVED_LESSON_OCCURRENCE_PROFILE, scope: input, status: findings.length ? 'BLOCKED' : 'PASS', coverage: { ppctItemAllocation: 'NOT_ASSESSED' }, normalOccurrences: normalOccurrences.sort((a,b) => a.occurrenceKey.localeCompare(b.occurrenceKey)), makeupOccurrences, specialActivityOccurrences, findings, evaluatedAt: new Date().toISOString() };
  }

  private async resolveNormal(tx: Prisma.TransactionClient, input: ResolveLessonOccurrencesInput, date: Date, version: TimetableVersion, activities: SpecialActivityRow[], output: NormalStructuralOccurrence[], blocker: (code: StructuralOccurrenceFinding['code'], occurrenceKey: string | null, ...ids: string[]) => void): Promise<void> {
    if (!version.calendarVersionId) { blocker('RETAINED_CALENDAR_INVALID', null, version.id); return; }
    const calendar = await tx.academicCalendarVersion.findUnique({ where: { id: version.calendarVersionId } });
    if (!calendar || calendar.academicYearId !== input.academicYearId || calendar.startDate > date || calendar.endDate < date) { blocker('RETAINED_CALENDAR_INVALID', null, version.id, version.calendarVersionId); return; }
    const [entries, interruptions, exceptions, dispositions] = await Promise.all([
      tx.timetableEntry.findMany({ where: { timetableVersionId: version.id, weekday: weekdayFor(date) as AcademicWeekday }, include: normalEntryInclude, orderBy: { id: 'asc' } }),
      tx.calendarInterruption.findMany({ where: { calendarVersionId: calendar.id, startDate: { lte: date }, endDate: { gte: date } }, orderBy: { id: 'asc' } }),
      tx.calendarException.findMany({ where: { academicYearId: input.academicYearId, academicCalendarVersionId: calendar.id, civilDate: date, status: OperationalOverlayStatus.ACTIVE }, include: { exactTimeSlots: true }, orderBy: { id: 'asc' } }),
      tx.operationalLessonDisposition.findMany({ where: { academicYearId: input.academicYearId, sourceCivilDate: date, status: OperationalOverlayStatus.ACTIVE }, orderBy: { id: 'asc' } }),
    ]);
    const associations = await this.ppctAssociations.findOverlappingRange(tx, [...new Map(entries.map((e) => [`${e.schoolClassId}:${e.subjectId}`, { academicYearId: input.academicYearId, schoolClassId: e.schoolClassId, subjectId: e.subjectId }])).values()], date, date);
    for (const entry of entries) {
      const key = `NORMAL:${entry.id}:${input.civilDate}`;
      if (entry.academicYearId !== input.academicYearId || entry.timetableVersionId !== version.id || entry.timeSlotDefinition.academicYearId !== input.academicYearId || entry.timeSlotDefinition.weekday !== entry.weekday || entry.schoolClass.academicYearId !== input.academicYearId || entry.teachingAssignment.academicYearId !== input.academicYearId || entry.teachingAssignment.schoolClassId !== entry.schoolClassId || entry.teachingAssignment.subjectId !== entry.subjectId || entry.teachingAssignment.teacherUserId !== entry.teacherUserId) blocker('NORMAL_PROVENANCE_INVALID', key, entry.id);
      const matches = associations.filter((a) => a.schoolClassId === entry.schoolClassId && a.subjectId === entry.subjectId && a.effectiveFrom <= date && (!a.effectiveUntil || a.effectiveUntil >= date));
      let ppctBinding: NormalStructuralOccurrence['ppctBinding'] = null;
      if (!matches.length) blocker('PPCT_ASSOCIATION_MISSING', key, entry.id);
      else if (matches.length > 1) blocker('PPCT_ASSOCIATION_AMBIGUOUS', key, ...matches.map((x) => x.id));
      else if (matches[0]!.ppctVersionStatus !== PpctVersionStatus.PUBLISHED && matches[0]!.ppctVersionStatus !== PpctVersionStatus.SUPERSEDED) blocker('PPCT_ASSOCIATION_INVALID_TARGET', key, matches[0]!.id);
      else ppctBinding = { ppctClassAssociationId: matches[0]!.id, ppctPlanId: matches[0]!.ppctPlanId, ppctVersionId: matches[0]!.ppctVersionId, ppctVersionStatus: matches[0]!.ppctVersionStatus as 'PUBLISHED' | 'SUPERSEDED' };
      const exceptionIds = exceptions.filter((e) => (e.scope === 'SCHOOL_WIDE' || (e.scope === 'GRADE' && e.gradeLevel === entry.schoolClass.gradeLevel) || (e.scope === 'CLASS' && e.schoolClassId === entry.schoolClassId)) && (e.timeSelector === 'WHOLE_DAY' || (e.timeSelector === 'SESSION' && e.session === entry.timeSlotDefinition.session) || (e.timeSelector === 'EXACT_SLOTS' && e.exactTimeSlots.some((s) => s.timeSlotDefinitionId === entry.timeSlotDefinitionId)))).map((x) => x.id).sort();
      const suppressionIds = activities.filter((a) => a.classTargets.some((x) => x.schoolClassId === entry.schoolClassId) && a.timeSlots.some((x) => intervalsOverlap(x.timeSlotDefinition.startTime, x.timeSlotDefinition.endTime, entry.timeSlotDefinition.startTime, entry.timeSlotDefinition.endTime))).map((x) => x.id).sort();
      const exactDispositions = dispositions.filter((d) => d.timetableEntryId === entry.id);
      if (exactDispositions.length > 1) blocker('OPERATIONAL_DISPOSITION_AMBIGUOUS', key, ...exactDispositions.map((d) => d.id));
      if (suppressionIds.length && exactDispositions.length) blocker('ACTIVE_SPECIAL_ACTIVITY_DISPOSITION_CONFLICT', key, ...suppressionIds, ...exactDispositions.map((d) => d.id));
      const effectiveKind = interruptions.length ? 'CALENDAR_INTERRUPTION' : exceptionIds.length ? 'CALENDAR_EXCEPTION' : suppressionIds.length ? 'SPECIAL_ACTIVITY_SUPPRESSED' : exactDispositions.length ? 'OPERATIONAL_DISPOSITION' : 'BASE_TIMETABLE';
      output.push({ occurrenceKey: key, family: 'NORMAL_TIMETABLE_OPPORTUNITY', civilDate: input.civilDate, academicYearId: input.academicYearId, academicCalendarVersionId: calendar.id, timetableVersionId: version.id, timetableEntryId: entry.id, timeSlot: { id: entry.timeSlotDefinition.id, weekday: entry.timeSlotDefinition.weekday, session: entry.timeSlotDefinition.session, startTime: time(entry.timeSlotDefinition.startTime), endTime: time(entry.timeSlotDefinition.endTime) }, schoolClass: { id: entry.schoolClass.id, gradeLevel: entry.schoolClass.gradeLevel }, subjectId: entry.subjectId, teachingAssignmentId: entry.teachingAssignmentId, responsibleTeacherUserId: entry.teacherUserId, ppctBinding, effectiveKind, interruptionIds: interruptions.map((x) => x.id).sort(), exceptionIds, suppressingSpecialActivityIds: suppressionIds, disposition: exactDispositions.length === 1 ? { id: exactDispositions[0]!.id, dispositionType: exactDispositions[0]!.dispositionType, responsibleTeacherUserId: exactDispositions[0]!.responsibleTeacherUserId, assignedTeacherUserId: exactDispositions[0]!.assignedTeacherUserId, eligibilityCheckedAt: exactDispositions[0]!.eligibilityCheckedAt?.toISOString() ?? null, eligibilityWasActive: exactDispositions[0]!.eligibilityWasActive, eligibilityWasTeachingStaff: exactDispositions[0]!.eligibilityWasTeachingStaff } : null });
    }
  }

  private detectActivityCollisions(activities: SpecialActivityRow[], makeups: MakeupRow[], blocker: (code: StructuralOccurrenceFinding['code'], occurrenceKey: string | null, ...ids: string[]) => void): void {
    for (const activity of activities) for (const makeup of makeups) if (activity.timeSlots.some((s) => intervalsOverlap(s.timeSlotDefinition.startTime, s.timeSlotDefinition.endTime, makeup.targetTimeSlotDefinition.startTime, makeup.targetTimeSlotDefinition.endTime)) && (activity.classTargets.some((x) => x.schoolClassId === makeup.schoolClassId) || activity.staffing.some((x) => x.scheduledTeacherUserId === makeup.scheduledTeacherUserId))) blocker('ACTIVE_SPECIAL_ACTIVITY_MAKEUP_COLLISION', `MAKEUP:${makeup.id}`, activity.id, makeup.id);
    for (let i = 0; i < activities.length; i += 1) for (let j = i + 1; j < activities.length; j += 1) { const a = activities[i]!, b = activities[j]!; if (a.timeSlots.some((x) => b.timeSlots.some((y) => intervalsOverlap(x.timeSlotDefinition.startTime, x.timeSlotDefinition.endTime, y.timeSlotDefinition.startTime, y.timeSlotDefinition.endTime))) && (a.classTargets.some((x) => b.classTargets.some((y) => y.schoolClassId === x.schoolClassId)) || a.staffing.some((x) => b.staffing.some((y) => y.scheduledTeacherUserId === x.scheduledTeacherUserId)))) blocker('ACTIVE_SPECIAL_ACTIVITY_COLLISION', null, a.id, b.id); }
  }
}
