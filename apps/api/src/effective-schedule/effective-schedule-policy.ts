import {
  EffectiveOccupancySourceKind,
  EffectiveOccupancyState,
  EffectiveScheduleComparisonState,
} from '@baogiang/contracts';

/**
 * Normalizes a time value (Date or HH:mm:ss string) to a standard HH:mm:ss string.
 */
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

/**
 * Evaluates whether two half-open real-time intervals [leftStart, leftEnd)
 * and [rightStart, rightEnd) overlap.
 * Touching boundaries (e.g. 07:00-07:45 and 07:45-08:30) do NOT overlap.
 */
export function intervalsOverlap(
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
 * Maps technical source kinds to friendly Vietnamese presentation labels.
 * Never leaks raw technical enums into user-facing copy.
 */
export function sourceKindToVietnamese(kind: EffectiveOccupancySourceKind | string | null | undefined): string {
  switch (kind) {
    case 'BASE_TIMETABLE':
      return 'Lịch cơ sở';
    case 'SAME_SUBJECT_SUBSTITUTION':
      return 'Dạy thay (cùng môn)';
    case 'DIFFERENT_SUBJECT_SUPERVISION':
      return 'Coi thay (khác môn)';
    case 'MAKEUP_TEACHING':
      return 'Dạy bù';
    case 'SPECIAL_ACTIVITY':
      return 'Hoạt động chuyên biệt';
    default:
      return 'Không xác định';
  }
}

/**
 * Maps comparison states to informational Vietnamese descriptive text.
 * Strictly descriptive facts: never implies swap/substitution eligibility.
 */
export function comparisonStateToVietnamese(state: EffectiveScheduleComparisonState | string | null | undefined): string {
  switch (state) {
    case 'BOTH_BUSY':
      return 'Cả hai đều bận';
    case 'BOTH_FREE':
      return 'Cả hai đều trống';
    case 'SELF_BUSY_PEER_FREE':
      return 'Tôi bận / Đồng nghiệp trống';
    case 'SELF_FREE_PEER_BUSY':
      return 'Tôi trống / Đồng nghiệp bận';
    case 'BLOCKED':
      return 'Dữ liệu bị chặn / Không thể xác định';
    default:
      return 'Không xác định';
  }
}

/**
 * Maps occupancy state to Vietnamese copy.
 */
export function occupancyStateToVietnamese(state: EffectiveOccupancyState | string | null | undefined): string {
  switch (state) {
    case 'OCCUPIED':
      return 'Có tiết';
    case 'FREE':
      return 'Trống';
    case 'BLOCKED':
      return 'Bị chặn';
    default:
      return 'Không xác định';
  }
}
