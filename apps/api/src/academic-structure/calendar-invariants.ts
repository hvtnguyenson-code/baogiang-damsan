import { BadRequestException } from '@nestjs/common';
import { AcademicWeekKind, AcademicWeekday } from '@prisma/client';
import { civilDateDayNumber, formatCivilDate, parseCivilDate } from '../common/validation/civil-date';

export interface CalendarRange { startDate: string; endDate: string }
export interface CalendarSemesterInput extends CalendarRange { code: string; name: string; ordinal: number }
export interface CalendarSegmentInput extends CalendarRange { label: string; segmentOrder: number }
export interface CalendarWeekInput {
  kind: AcademicWeekKind;
  officialWeekNumber?: number | null;
  reserveWeekNumber?: number | null;
  displayLabel: string;
  sortOrder: number;
  segments: CalendarSegmentInput[];
}
export interface CalendarInterruptionInput extends CalendarRange { code: string; name: string }
export interface CalendarAggregateInput extends CalendarRange {
  officialWeekCount: number;
  reserveWeekCount: number;
  teachingWeekdays: AcademicWeekday[];
  semesters: CalendarSemesterInput[];
  weeks: CalendarWeekInput[];
  interruptions: CalendarInterruptionInput[];
}

const weekdayByUtcDay: AcademicWeekday[] = [
  AcademicWeekday.SUNDAY, AcademicWeekday.MONDAY, AcademicWeekday.TUESDAY, AcademicWeekday.WEDNESDAY,
  AcademicWeekday.THURSDAY, AcademicWeekday.FRIDAY, AcademicWeekday.SATURDAY,
];

function fail(message: string): never { throw new BadRequestException(message); }
function rangeOf(value: CalendarRange): [number, number] {
  const start = civilDateDayNumber(value.startDate);
  const end = civilDateDayNumber(value.endDate);
  if (start > end) fail('Khoảng ngày dân sự không hợp lệ.');
  return [start, end];
}
function overlaps(left: [number, number], right: [number, number]): boolean {
  return left[0] <= right[1] && right[0] <= left[1];
}
function assertInside(value: CalendarRange, parent: [number, number], label: string): [number, number] {
  const range = rangeOf(value);
  if (range[0] < parent[0] || range[1] > parent[1]) fail(`${label} phải nằm trong phạm vi phiên lịch.`);
  return range;
}
function assertUnique<T>(values: T[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} không được trùng lặp.`);
}
function assertExactNumbers(values: number[], count: number, label: string): void {
  assertUnique(values, `${label} tuần`);
  const expected = Array.from({ length: count }, (_item, index) => index + 1);
  if (values.length !== expected.length || [...values].sort((a, b) => a - b).some((value, index) => value !== expected[index])) {
    fail(`${label} phải tạo thành tập số liên tục 1..${count}.`);
  }
}
function containsTeachingDate(range: [number, number], teachingWeekdays: Set<AcademicWeekday>): boolean {
  for (let day = range[0]; day <= range[1]; day += 1) {
    const date = new Date(day * 86_400_000);
    if (teachingWeekdays.has(weekdayByUtcDay[date.getUTCDay()])) return true;
  }
  return false;
}

export function validateCalendarAggregate(input: CalendarAggregateInput): void {
  const parent = rangeOf(input);
  if (input.teachingWeekdays.length === 0) fail('Phải cấu hình ít nhất một ngày dạy học.');
  assertUnique(input.teachingWeekdays, 'Ngày dạy học');
  const teachingWeekdays = new Set(input.teachingWeekdays);

  if (input.semesters.length === 0) fail('Phiên lịch phải có ít nhất một học kỳ.');
  assertUnique(input.semesters.map((semester) => semester.code), 'Mã học kỳ');
  assertUnique(input.semesters.map((semester) => semester.ordinal), 'Thứ tự học kỳ');
  const semesterRanges = input.semesters.map((semester) => {
    if (semester.ordinal <= 0) fail('Thứ tự học kỳ phải là số dương.');
    return assertInside(semester, parent, 'Học kỳ');
  });
  for (let index = 0; index < semesterRanges.length; index += 1) {
    for (let other = index + 1; other < semesterRanges.length; other += 1) {
      if (overlaps(semesterRanges[index], semesterRanges[other])) fail('Các học kỳ không được chồng lấn.');
    }
  }

  assertUnique(input.weeks.map((week) => week.sortOrder), 'Thứ tự tuần');
  assertUnique(input.weeks.map((week) => week.displayLabel), 'Nhãn tuần');
  const official: number[] = [];
  const reserve: number[] = [];
  const orderedWeeks = [...input.weeks].sort((left, right) => left.sortOrder - right.sortOrder);
  let priorFinalSegment: number | undefined;
  const allSegmentRanges: Array<[number, number]> = [];
  for (const week of orderedWeeks) {
    if (week.sortOrder <= 0) fail('Thứ tự tuần phải là số dương.');
    if (week.kind === AcademicWeekKind.OFFICIAL) {
      if (!Number.isInteger(week.officialWeekNumber) || week.officialWeekNumber! <= 0 || week.reserveWeekNumber != null) {
        fail('Tuần OFFICIAL chỉ được có officialWeekNumber dương.');
      }
      official.push(week.officialWeekNumber!);
    } else if (week.kind === AcademicWeekKind.RESERVE) {
      if (!Number.isInteger(week.reserveWeekNumber) || week.reserveWeekNumber! <= 0 || week.officialWeekNumber != null) {
        fail('Tuần RESERVE chỉ được có reserveWeekNumber dương.');
      }
      reserve.push(week.reserveWeekNumber!);
    } else fail('Loại tuần không hợp lệ.');
    if (week.segments.length === 0) fail('Mỗi tuần phải có ít nhất một phân đoạn.');
    assertUnique(week.segments.map((segment) => segment.segmentOrder), 'Thứ tự phân đoạn');
    assertUnique(week.segments.map((segment) => segment.label), 'Nhãn phân đoạn');
    const orderedSegments = [...week.segments].sort((left, right) => left.segmentOrder - right.segmentOrder);
    let priorEnd: number | undefined;
    for (const segment of orderedSegments) {
      if (segment.segmentOrder <= 0) fail('Thứ tự phân đoạn phải là số dương.');
      const range = assertInside(segment, parent, 'Phân đoạn tuần');
      if (priorEnd !== undefined && range[0] <= priorEnd) fail('Thứ tự/ngày phân đoạn không hợp lệ hoặc bị chồng lấn.');
      if (!containsTeachingDate(range, teachingWeekdays)) fail('Phân đoạn phải chứa ít nhất một ngày dạy học đã cấu hình.');
      priorEnd = range[1];
      allSegmentRanges.push(range);
    }
    const first = assertInside(orderedSegments[0], parent, 'Phân đoạn tuần')[0];
    const last = assertInside(orderedSegments[orderedSegments.length - 1], parent, 'Phân đoạn tuần')[1];
    if (priorFinalSegment !== undefined && first <= priorFinalSegment) fail('Trình tự ngày giữa các tuần không hợp lệ.');
    priorFinalSegment = last;
  }
  assertExactNumbers(official, input.officialWeekCount, 'Tuần chính thức');
  assertExactNumbers(reserve, input.reserveWeekCount, 'Tuần dự phòng');

  assertUnique(input.interruptions.map((interruption) => interruption.code), 'Mã gián đoạn');
  const interruptionRanges = input.interruptions.map((interruption) => assertInside(interruption, parent, 'Gián đoạn'));
  for (let index = 0; index < interruptionRanges.length; index += 1) {
    for (let other = index + 1; other < interruptionRanges.length; other += 1) {
      if (overlaps(interruptionRanges[index], interruptionRanges[other])) fail('Các gián đoạn không được chồng lấn.');
    }
    if (allSegmentRanges.some((segment) => overlaps(interruptionRanges[index], segment))) {
      fail('Gián đoạn không được chồng lấn phân đoạn tuần.');
    }
  }
}

export function storedDate(date: Date): string { return formatCivilDate(date); }
export function inputDate(date: string): Date { return parseCivilDate(date); }
