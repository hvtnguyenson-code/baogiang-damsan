import { CivilDateString } from '@baogiang/contracts';

export const RESOLVED_LESSON_OCCURRENCE_PROFILE = 'RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1' as const;
export type StructuralOccurrenceFindingCode =
  | 'TIMETABLE_EFFECTIVE_VERSION_MISSING' | 'TIMETABLE_EFFECTIVE_VERSION_AMBIGUOUS'
  | 'RETAINED_CALENDAR_INVALID' | 'NORMAL_PROVENANCE_INVALID'
  | 'PPCT_ASSOCIATION_MISSING' | 'PPCT_ASSOCIATION_AMBIGUOUS' | 'PPCT_ASSOCIATION_INVALID_TARGET'
  | 'OPERATIONAL_DISPOSITION_AMBIGUOUS' | 'ACTIVE_SPECIAL_ACTIVITY_DISPOSITION_CONFLICT'
  | 'ACTIVE_SPECIAL_ACTIVITY_MAKEUP_COLLISION' | 'ACTIVE_SPECIAL_ACTIVITY_COLLISION';

export interface ResolveLessonOccurrencesInput { academicYearId: string; civilDate: CivilDateString; }
export interface StructuralOccurrenceFinding { severity: 'BLOCKER'; code: StructuralOccurrenceFindingCode; occurrenceKey: string | null; entityIds: string[]; }
export interface StructuralSlot { id: string; weekday: string; session: string; startTime: string; endTime: string; }
export interface StructuralDispositionProvenance {
  id: string; dispositionType: string; responsibleTeacherUserId: string; assignedTeacherUserId: string | null;
  eligibilityCheckedAt: string | null; eligibilityWasActive: boolean | null; eligibilityWasTeachingStaff: boolean | null;
}
export interface StructuralActivityStaffing {
  scheduledTeacherUserId: string; staffProfileId: string; eligibilityCheckedAt: string;
  eligibilityWasActive: boolean; eligibilityWasTeachingStaff: boolean;
}
export interface MakeupStructuralTarget {
  id: string; academicYearId: string; targetCivilDate: CivilDateString; targetAcademicCalendarVersionId: string;
  targetTimeSlotDefinitionId: string; targetSlot: Omit<StructuralSlot, 'id'>; schoolClassId: string; subjectId: string; scheduledTeacherUserId: string;
}
export interface MakeupOriginalObligation {
  originalTimetableVersionId: string; originalTimetableEntryId: string; originalCivilDate: CivilDateString;
  originalAcademicCalendarVersionId: string; originalTimeSlotDefinitionId: string; originalTeachingAssignmentId: string;
  responsibleTeacherUserId: string; ppctClassAssociationId: string; ppctPlanId: string; ppctVersionId: string;
  ppctItemId: string; sourceDispositionId: string | null;
}
export interface NormalStructuralOccurrence {
  occurrenceKey: string; family: 'NORMAL_TIMETABLE_OPPORTUNITY'; civilDate: CivilDateString;
  academicYearId: string; academicCalendarVersionId: string; timetableVersionId: string; timetableEntryId: string;
  timeSlot: StructuralSlot; schoolClass: { id: string; gradeLevel: number }; subjectId: string;
  teachingAssignmentId: string; responsibleTeacherUserId: string;
  ppctBinding: { ppctClassAssociationId: string; ppctPlanId: string; ppctVersionId: string; ppctVersionStatus: 'PUBLISHED' | 'SUPERSEDED' } | null;
  effectiveKind: 'CALENDAR_INTERRUPTION' | 'CALENDAR_EXCEPTION' | 'SPECIAL_ACTIVITY_SUPPRESSED' | 'OPERATIONAL_DISPOSITION' | 'BASE_TIMETABLE';
  interruptionIds: string[]; exceptionIds: string[]; suppressingSpecialActivityIds: string[]; disposition: StructuralDispositionProvenance | null;
}
export interface MakeupStructuralOccurrence { occurrenceKey: string; family: 'MAKEUP_TEACHING'; target: MakeupStructuralTarget; originalObligation: MakeupOriginalObligation; }
export interface SpecialActivityStructuralOccurrence { occurrenceKey: string; family: 'SPECIAL_ACTIVITY'; id: string; academicYearId: string; academicCalendarVersionId: string; civilDate: CivilDateString; title: string; note: string | null; classTargetIds: string[]; timeSlots: StructuralSlot[]; staffing: StructuralActivityStaffing[]; }
export interface ResolvedLessonOccurrencesResult {
  profile: typeof RESOLVED_LESSON_OCCURRENCE_PROFILE; scope: ResolveLessonOccurrencesInput; status: 'PASS' | 'BLOCKED';
  coverage: { ppctItemAllocation: 'NOT_ASSESSED' }; normalOccurrences: NormalStructuralOccurrence[];
  makeupOccurrences: MakeupStructuralOccurrence[]; specialActivityOccurrences: SpecialActivityStructuralOccurrence[];
  findings: StructuralOccurrenceFinding[]; evaluatedAt: string;
}
