import { CalendarExceptionRecord, OperationalLessonDispositionRecord } from '@baogiang/contracts';
import { Prisma } from '@prisma/client';
import { formatCivilDate } from '../common/validation/civil-date';

export const calendarExceptionInclude = { exactTimeSlots: { select: { timeSlotDefinitionId: true } } } satisfies Prisma.CalendarExceptionInclude;
export type CalendarExceptionWithSlots = Prisma.CalendarExceptionGetPayload<{ include: typeof calendarExceptionInclude }>;

export function toCalendarExceptionRecord(row: CalendarExceptionWithSlots): CalendarExceptionRecord {
  return {
    id: row.id, academicYearId: row.academicYearId, academicCalendarVersionId: row.academicCalendarVersionId,
    civilDate: formatCivilDate(row.civilDate), scope: row.scope, gradeLevel: row.gradeLevel as 10 | 11 | 12 | null,
    schoolClassId: row.schoolClassId, timeSelector: row.timeSelector, session: row.session,
    exactTimeSlotDefinitionIds: row.exactTimeSlots.map((item) => item.timeSlotDefinitionId).sort(),
    note: row.note, status: row.status, replacesId: row.replacesId, createdByUserId: row.createdByUserId,
    reversedByUserId: row.reversedByUserId, reversedAt: row.reversedAt?.toISOString() ?? null,
    reversalReason: row.reversalReason, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export function toLessonDispositionRecord(row: Prisma.OperationalLessonDispositionGetPayload<Record<string, never>>): OperationalLessonDispositionRecord {
  return {
    id: row.id, academicYearId: row.academicYearId, timetableVersionId: row.timetableVersionId,
    timetableEntryId: row.timetableEntryId, sourceCivilDate: formatCivilDate(row.sourceCivilDate),
    academicCalendarVersionId: row.academicCalendarVersionId, timeSlotDefinitionId: row.timeSlotDefinitionId,
    schoolClassId: row.schoolClassId, subjectId: row.subjectId, teachingAssignmentId: row.teachingAssignmentId,
    responsibleTeacherUserId: row.responsibleTeacherUserId, dispositionType: row.dispositionType,
    assignedTeacherUserId: row.assignedTeacherUserId, eligibilityCheckedAt: row.eligibilityCheckedAt?.toISOString() ?? null,
    eligibilityWasActive: row.eligibilityWasActive, eligibilityWasTeachingStaff: row.eligibilityWasTeachingStaff,
    eligibilitySameSubject: row.eligibilitySameSubject, eligibilityStaffSubjectId: row.eligibilityStaffSubjectId,
    note: row.note, status: row.status, replacesId: row.replacesId, createdByUserId: row.createdByUserId,
    reversedByUserId: row.reversedByUserId, reversedAt: row.reversedAt?.toISOString() ?? null,
    reversalReason: row.reversalReason, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}
