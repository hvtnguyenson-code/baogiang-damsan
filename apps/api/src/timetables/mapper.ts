import { Prisma } from '@prisma/client';
import { TimetableEntryRecord, TimetableVersionRecord } from '@baogiang/contracts';
import { formatCivilDate } from '../common/validation/civil-date';
import { toTimeSlotDefinitionRecord } from '../time-slots/time-slots.service';

export const timetableVersionCountSelect = {
  _count: { select: { entries: true } },
} satisfies Prisma.TimetableVersionInclude;

export type TimetableVersionWithCount = Prisma.TimetableVersionGetPayload<{ include: typeof timetableVersionCountSelect }>;

export const timetableEntryInclude = {
  timeSlotDefinition: true,
  schoolClass: true,
  subject: true,
  teacher: { include: { profile: true } },
  teachingAssignment: true,
} satisfies Prisma.TimetableEntryInclude;

export type EnrichedTimetableEntry = Prisma.TimetableEntryGetPayload<{ include: typeof timetableEntryInclude }>;

export function toTimetableVersionRecord(row: TimetableVersionWithCount): TimetableVersionRecord {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    versionNumber: row.versionNumber,
    status: row.status,
    calendarVersionId: row.calendarVersionId,
    effectiveAcademicWeekId: row.effectiveAcademicWeekId,
    effectiveFrom: row.effectiveFrom ? formatCivilDate(row.effectiveFrom) : null,
    effectiveUntil: row.effectiveUntil ? formatCivilDate(row.effectiveUntil) : null,
    contentChecksum: row.contentChecksum,
    note: row.note,
    createdByUserId: row.createdByUserId,
    validatedByUserId: row.validatedByUserId,
    validatedAt: row.validatedAt?.toISOString() ?? null,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    activatedByUserId: row.activatedByUserId,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    supersededAt: row.supersededAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    entryCount: row._count.entries,
  };
}

export function toTimetableEntryRecord(row: EnrichedTimetableEntry): TimetableEntryRecord {
  return {
    id: row.id,
    timetableVersionId: row.timetableVersionId,
    academicYearId: row.academicYearId,
    weekday: row.weekday,
    timeSlotDefinitionId: row.timeSlotDefinitionId,
    schoolClassId: row.schoolClassId,
    subjectId: row.subjectId,
    teachingAssignmentId: row.teachingAssignmentId,
    teacherUserId: row.teacherUserId,
    createdAt: row.createdAt.toISOString(),
    timeSlot: toTimeSlotDefinitionRecord(row.timeSlotDefinition),
    schoolClass: {
      id: row.schoolClass.id,
      code: row.schoolClass.code,
      name: row.schoolClass.name,
      gradeLevel: row.schoolClass.gradeLevel,
      status: row.schoolClass.status,
    },
    subject: {
      id: row.subject.id,
      code: row.subject.code,
      name: row.subject.name,
      status: row.subject.status,
    },
    teacher: {
      userId: row.teacher.id,
      username: row.teacher.username,
      displayName: row.teacher.profile?.displayName ?? row.teacher.username,
      staffCode: row.teacher.profile?.staffCode ?? null,
      userStatus: row.teacher.status,
      isTeachingStaff: row.teacher.profile?.isTeachingStaff ?? null,
    },
    teachingAssignment: {
      id: row.teachingAssignment.id,
      validFrom: formatCivilDate(row.teachingAssignment.validFrom),
      validUntil: row.teachingAssignment.validUntil ? formatCivilDate(row.teachingAssignment.validUntil) : null,
    },
  };
}
