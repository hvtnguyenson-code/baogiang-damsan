import {
  CivilDateString,
  EffectiveOccupancySourceKind,
} from '@baogiang/contracts';
import { ResolvedLessonOccurrencesResult } from './resolved-occurrence.types';

export interface CanonicalEffectiveOccupancy {
  id: string;
  sourceKind: EffectiveOccupancySourceKind;
  civilDate: CivilDateString;
  timeSlotId: string;
  startTime: string; // HH:mm:ss
  endTime: string;   // HH:mm:ss
  weekday: string;
  session: 'MORNING' | 'AFTERNOON';
  teacherUserId?: string | null;
  schoolClassId?: string | null;
  subjectId?: string | null;
  activityTitle?: string | null;
}

export function normalizeTimeString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(11, 19);
  }
  const match = value.match(/^(\d{2}:\d{2}(?::\d{2})?)/);
  if (match && match[1]) {
    return match[1].length === 5 ? `${match[1]}:00` : match[1];
  }
  return value;
}

export function intervalsOverlapTimes(
  leftStart: Date | string,
  leftEnd: Date | string,
  rightStart: Date | string,
  rightEnd: Date | string,
): boolean {
  const lStart = normalizeTimeString(leftStart);
  const lEnd = normalizeTimeString(leftEnd);
  const rStart = normalizeTimeString(rightStart);
  const rEnd = normalizeTimeString(rightEnd);

  return lStart < rEnd && rStart < lEnd;
}

/**
 * Extracts canonical effective occupancies for teachers and school classes from
 * a resolved lesson occurrence result.
 *
 * Rules:
 * - CALENDAR_INTERRUPTION, CALENDAR_EXCEPTION, SPECIAL_ACTIVITY_SUPPRESSED -> normal occupancy released
 * - AUTHORIZED_CANCELLATION, ABSENCE_NO_REPLACEMENT -> normal occupancy released
 * - SAME_SUBJECT_SUBSTITUTION -> exact assigned substitute teacher + school class
 * - DIFFERENT_SUBJECT_SUPERVISION -> exact assigned supervising teacher + school class
 * - BASE_TIMETABLE -> responsible teacher + school class
 * - MAKEUP_TEACHING (ACTIVE) -> scheduled teacher + school class
 * - SPECIAL_ACTIVITY (ACTIVE) -> each scheduled staffing teacher + each class target
 */
export function extractCanonicalOccupancies(
  resolution: ResolvedLessonOccurrencesResult,
): CanonicalEffectiveOccupancy[] {
  const list: CanonicalEffectiveOccupancy[] = [];
  const seenKeys = new Set<string>();

  // 1. Normal occurrences
  for (const normal of resolution.normalOccurrences) {
    if (
      normal.effectiveKind === 'CALENDAR_INTERRUPTION' ||
      normal.effectiveKind === 'CALENDAR_EXCEPTION' ||
      normal.effectiveKind === 'SPECIAL_ACTIVITY_SUPPRESSED'
    ) {
      continue;
    }

    if (normal.effectiveKind === 'OPERATIONAL_DISPOSITION' && normal.disposition) {
      const dType = normal.disposition.dispositionType;
      if (dType === 'AUTHORIZED_CANCELLATION' || dType === 'ABSENCE_NO_REPLACEMENT') {
        continue;
      }

      if (dType === 'SAME_SUBJECT_SUBSTITUTION' && normal.disposition.assignedTeacherUserId) {
        const key = `NORMAL_SUB:${normal.disposition.assignedTeacherUserId}:${normal.civilDate}:${normal.timeSlot.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          list.push({
            id: `sub:${normal.disposition.id}`,
            teacherUserId: normal.disposition.assignedTeacherUserId,
            civilDate: normal.civilDate,
            timeSlotId: normal.timeSlot.id,
            startTime: normal.timeSlot.startTime,
            endTime: normal.timeSlot.endTime,
            weekday: normal.timeSlot.weekday,
            session: normal.timeSlot.session as 'MORNING' | 'AFTERNOON',
            sourceKind: 'SAME_SUBJECT_SUBSTITUTION',
            schoolClassId: normal.schoolClass.id,
            subjectId: normal.subjectId,
          });
        }
        continue;
      }

      if (dType === 'DIFFERENT_SUBJECT_SUPERVISION' && normal.disposition.assignedTeacherUserId) {
        const key = `NORMAL_SUP:${normal.disposition.assignedTeacherUserId}:${normal.civilDate}:${normal.timeSlot.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          list.push({
            id: `sup:${normal.disposition.id}`,
            teacherUserId: normal.disposition.assignedTeacherUserId,
            civilDate: normal.civilDate,
            timeSlotId: normal.timeSlot.id,
            startTime: normal.timeSlot.startTime,
            endTime: normal.timeSlot.endTime,
            weekday: normal.timeSlot.weekday,
            session: normal.timeSlot.session as 'MORNING' | 'AFTERNOON',
            sourceKind: 'DIFFERENT_SUBJECT_SUPERVISION',
            schoolClassId: normal.schoolClass.id,
            subjectId: normal.subjectId,
          });
        }
        continue;
      }
    }

    if (normal.effectiveKind === 'BASE_TIMETABLE') {
      const key = `NORMAL_BASE:${normal.responsibleTeacherUserId}:${normal.civilDate}:${normal.timeSlot.id}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        list.push({
          id: `base:${normal.timetableEntryId}`,
          teacherUserId: normal.responsibleTeacherUserId,
          civilDate: normal.civilDate,
          timeSlotId: normal.timeSlot.id,
          startTime: normal.timeSlot.startTime,
          endTime: normal.timeSlot.endTime,
          weekday: normal.timeSlot.weekday,
          session: normal.timeSlot.session as 'MORNING' | 'AFTERNOON',
          sourceKind: 'BASE_TIMETABLE',
          schoolClassId: normal.schoolClass.id,
          subjectId: normal.subjectId,
        });
      }
    }
  }

  // 2. Make-up teaching
  for (const makeup of resolution.makeupOccurrences) {
    const key = `MAKEUP:${makeup.target.scheduledTeacherUserId}:${makeup.target.targetCivilDate}:${makeup.target.targetTimeSlotDefinitionId}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      list.push({
        id: `makeup:${makeup.target.id}`,
        teacherUserId: makeup.target.scheduledTeacherUserId,
        civilDate: makeup.target.targetCivilDate,
        timeSlotId: makeup.target.targetTimeSlotDefinitionId,
        startTime: makeup.target.targetSlot.startTime,
        endTime: makeup.target.targetSlot.endTime,
        weekday: makeup.target.targetSlot.weekday,
        session: makeup.target.targetSlot.session as 'MORNING' | 'AFTERNOON',
        sourceKind: 'MAKEUP_TEACHING',
        schoolClassId: makeup.target.schoolClassId,
        subjectId: makeup.target.subjectId,
      });
    }
  }

  // 3. Special activities (including materialized GDĐP/HĐTN-HN)
  for (const act of resolution.specialActivityOccurrences) {
    for (const slot of act.timeSlots) {
      // Teachers occupied
      for (const staff of act.staffing) {
        const key = `ACTIVITY_STAFF:${staff.scheduledTeacherUserId}:${act.civilDate}:${slot.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          list.push({
            id: `act:${act.id}:${slot.id}:${staff.scheduledTeacherUserId}`,
            teacherUserId: staff.scheduledTeacherUserId,
            civilDate: act.civilDate,
            timeSlotId: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            weekday: slot.weekday,
            session: slot.session as 'MORNING' | 'AFTERNOON',
            sourceKind: 'SPECIAL_ACTIVITY',
            activityTitle: act.title,
          });
        }
      }
      // Classes occupied
      for (const classId of act.classTargetIds) {
        const key = `ACTIVITY_CLASS:${classId}:${act.civilDate}:${slot.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          list.push({
            id: `act_cls:${act.id}:${slot.id}:${classId}`,
            schoolClassId: classId,
            civilDate: act.civilDate,
            timeSlotId: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            weekday: slot.weekday,
            session: slot.session as 'MORNING' | 'AFTERNOON',
            sourceKind: 'SPECIAL_ACTIVITY',
            activityTitle: act.title,
          });
        }
      }
    }
  }

  return list;
}
