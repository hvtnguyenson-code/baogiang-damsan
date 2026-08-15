import { createHash } from 'node:crypto';
import { AcademicWeekday, CalendarExceptionScope, CalendarExceptionTimeSelector, OperationalLessonDispositionType, TimeSlotSession } from '@prisma/client';

export const COLLISION_COVERAGE = {
  profile: 'CANONICAL_CLASS_TEACHER_TIME_V1',
  specialActivity: 'ASSESSED',
  room: 'NOT_ASSESSED',
} as const;

export const OVERLAY_CLOCK = Symbol('OVERLAY_CLOCK');
export interface OverlayClock { now(): Date; }
export class SystemOverlayClock implements OverlayClock { now(): Date { return new Date(); } }

export function sha256(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function calendarCreateFingerprint(value: {
  academicYearId: string; academicCalendarVersionId: string; civilDate: string; scope: CalendarExceptionScope;
  gradeLevel: number | null; schoolClassId: string | null; timeSelector: CalendarExceptionTimeSelector;
  session: TimeSlotSession | null; exactTimeSlotDefinitionIds: string[]; note: string | null; replacesId: string | null;
}): string {
  return sha256({
    version: 'calendar-exception-create-v1',
    academicYearId: value.academicYearId,
    academicCalendarVersionId: value.academicCalendarVersionId,
    civilDate: value.civilDate,
    scope: value.scope,
    gradeLevel: value.gradeLevel,
    schoolClassId: value.schoolClassId,
    timeSelector: value.timeSelector,
    session: value.session,
    exactTimeSlotDefinitionIds: value.exactTimeSlotDefinitionIds,
    note: value.note,
    replacesId: value.replacesId,
  });
}

export function dispositionCreateFingerprint(value: {
  timetableEntryId: string; sourceCivilDate: string; dispositionType: OperationalLessonDispositionType;
  assignedTeacherUserId: string | null; note: string | null; replacesId: string | null;
}): string {
  return sha256({
    version: 'lesson-disposition-create-v1',
    timetableEntryId: value.timetableEntryId,
    sourceCivilDate: value.sourceCivilDate,
    dispositionType: value.dispositionType,
    assignedTeacherUserId: value.assignedTeacherUserId,
    note: value.note,
    replacesId: value.replacesId,
  });
}

export function reverseFingerprint(entityId: string, expectedUpdatedAt: string, reversalReason: string): string {
  return sha256({ version: 'operational-overlay-reverse-v1', entityId, expectedUpdatedAt, reversalReason });
}

export function weekdayForCivilDate(date: Date): AcademicWeekday {
  return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][date.getUTCDay()] as AcademicWeekday;
}

export function isTeacherDisposition(type: OperationalLessonDispositionType): boolean {
  return type === OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION
    || type === OperationalLessonDispositionType.DIFFERENT_SUBJECT_SUPERVISION;
}

export function intervalsOverlap(left: { startTime: Date; endTime: Date }, right: { startTime: Date; endTime: Date }): boolean {
  return left.startTime < right.endTime && right.startTime < left.endTime;
}
