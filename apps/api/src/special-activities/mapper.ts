import { Prisma } from '@prisma/client';
import { SpecialActivityRecord } from '@baogiang/contracts';
import { formatCivilDate } from '../common/validation/civil-date';

export const specialActivityInclude = { timeSlots: { select: { timeSlotDefinitionId: true } }, classTargets: { select: { schoolClassId: true } }, staffing: { select: { scheduledTeacherUserId: true, staffProfileId: true, eligibilityCheckedAt: true, eligibilityWasActive: true, eligibilityWasTeachingStaff: true } } } satisfies Prisma.SpecialActivityInclude;
export type SpecialActivityWithChildren = Prisma.SpecialActivityGetPayload<{ include: typeof specialActivityInclude }>;
export function toSpecialActivityRecord(row: SpecialActivityWithChildren): SpecialActivityRecord {
  return { id: row.id, academicYearId: row.academicYearId, academicCalendarVersionId: row.academicCalendarVersionId, civilDate: formatCivilDate(row.civilDate), scope: row.scope, gradeLevel: row.gradeLevel as 10 | 11 | 12 | null, schoolClassId: row.schoolClassId, title: row.title, note: row.note, status: row.status, replacesId: row.replacesId, createdByUserId: row.createdByUserId, reversedByUserId: row.reversedByUserId, reversedAt: row.reversedAt?.toISOString() ?? null, reversalReason: row.reversalReason, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), exactTimeSlotDefinitionIds: row.timeSlots.map((x) => x.timeSlotDefinitionId).sort(), frozenSchoolClassIds: row.classTargets.map((x) => x.schoolClassId).sort(), staffing: row.staffing.map((x) => ({ ...x, eligibilityCheckedAt: x.eligibilityCheckedAt.toISOString() })).sort((a, b) => a.scheduledTeacherUserId.localeCompare(b.scheduledTeacherUserId)) };
}
