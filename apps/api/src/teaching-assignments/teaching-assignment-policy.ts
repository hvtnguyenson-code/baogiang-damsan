import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AcademicCalendarVersion, CatalogStatus, Prisma, UserStatus } from '@prisma/client';
import { BUSINESS_UTC_OFFSET } from '@baogiang/config';
import { CivilDateString } from '@baogiang/contracts';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';

export type TeachingAssignmentDb = Prisma.TransactionClient;

function compareCivilDates(left: CivilDateString, right: CivilDateString): number {
  return left.localeCompare(right);
}

function addCivilDays(value: CivilDateString, days: number): CivilDateString {
  const date = parseCivilDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatCivilDate(date);
}

export function previousCivilDate(value: CivilDateString): CivilDateString {
  return addCivilDays(value, -1);
}

export function nextCivilDate(value: CivilDateString): CivilDateString {
  return addCivilDays(value, 1);
}

export function businessMidnight(value: CivilDateString): Date {
  return new Date(`${value}T00:00:00.000${BUSINESS_UTC_OFFSET}`);
}

export function intervalIsWithinCalendar(
  validFrom: CivilDateString,
  validUntil: CivilDateString | null,
  calendar: Pick<AcademicCalendarVersion, 'startDate' | 'endDate'>,
): boolean {
  const start = formatCivilDate(calendar.startDate);
  const end = formatCivilDate(calendar.endDate);
  return compareCivilDates(validFrom, start) >= 0
    && compareCivilDates(validFrom, end) <= 0
    && (validUntil === null || (compareCivilDates(validUntil, validFrom) >= 0 && compareCivilDates(validUntil, end) <= 0));
}

export async function requireActiveCalendar(
  db: TeachingAssignmentDb,
  academicYearId: string,
): Promise<AcademicCalendarVersion> {
  const calendar = await db.academicCalendarVersion.findFirst({
    where: { academicYearId, isActive: true },
    orderBy: [{ versionNumber: 'desc' }, { id: 'asc' }],
  });
  if (!calendar) throw new ConflictException('Năm học chưa có phiên lịch đang áp dụng.');
  return calendar;
}

export function requireCalendarEnvelope(
  validFrom: CivilDateString,
  validUntil: CivilDateString | null,
  calendar: Pick<AcademicCalendarVersion, 'startDate' | 'endDate'>,
): void {
  if (validUntil !== null && compareCivilDates(validUntil, validFrom) < 0) {
    throw new BadRequestException('Khoảng ngày hiệu lực không hợp lệ.');
  }
  if (!intervalIsWithinCalendar(validFrom, validUntil, calendar)) {
    throw new BadRequestException('Khoảng ngày hiệu lực nằm ngoài lịch năm học đang áp dụng.');
  }
}

export async function validateTeachingAssignmentCandidate(
  db: TeachingAssignmentDb,
  input: {
    academicYearId: string;
    schoolClassId: string;
    subjectId: string;
    teacherUserId: string;
    validFrom: CivilDateString;
    effectiveEnd: CivilDateString;
  },
): Promise<void> {
  const schoolClass = await db.schoolClass.findUnique({ where: { id: input.schoolClassId } });
  if (!schoolClass) throw new NotFoundException('Không tìm thấy lớp học.');
  if (schoolClass.academicYearId !== input.academicYearId) {
    throw new BadRequestException('Lớp học không thuộc năm học đã chọn.');
  }
  if (schoolClass.status !== CatalogStatus.ACTIVE) throw new ConflictException('Lớp học không còn hoạt động.');

  const subject = await db.subject.findUnique({ where: { id: input.subjectId } });
  if (!subject) throw new NotFoundException('Không tìm thấy môn học.');
  if (subject.status !== CatalogStatus.ACTIVE) throw new ConflictException('Môn học không còn hoạt động.');

  const teacher = await db.user.findUnique({ where: { id: input.teacherUserId }, include: { profile: true } });
  if (!teacher) throw new NotFoundException('Không tìm thấy người dùng giáo viên.');
  if (teacher.status !== UserStatus.ACTIVE || !teacher.profile || !teacher.profile.isTeachingStaff) {
    throw new ConflictException('Giáo viên chưa đủ điều kiện hoạt động để được phân công.');
  }

  await requireStaffSubjectCoverage(db, input.teacherUserId, input.subjectId, input.validFrom, input.effectiveEnd);
}

export async function requireStaffSubjectCoverage(
  db: TeachingAssignmentDb,
  teacherUserId: string,
  subjectId: string,
  validFrom: CivilDateString,
  effectiveEnd: CivilDateString,
): Promise<void> {
  const coverageStart = businessMidnight(validFrom);
  const coverageEndExclusive = businessMidnight(nextCivilDate(effectiveEnd));
  const coverage = await db.staffSubject.findFirst({
    where: {
      userId: teacherUserId,
      subjectId,
      validFrom: { lte: coverageStart },
      OR: [{ validUntil: null }, { validUntil: { gte: coverageEndExclusive } }],
    },
    select: { id: true },
  });
  if (!coverage) {
    throw new ConflictException('Giáo viên chưa được phân công môn học này trong toàn bộ khoảng hiệu lực.');
  }
}

export async function ensureCalendarActivationCompatibility(
  db: TeachingAssignmentDb,
  calendar: Pick<AcademicCalendarVersion, 'academicYearId' | 'startDate' | 'endDate'>,
): Promise<void> {
  const assignments = await db.teachingAssignment.findMany({
    where: { academicYearId: calendar.academicYearId },
    select: { validFrom: true, validUntil: true, teacherUserId: true, subjectId: true },
  });
  const targetEnd = formatCivilDate(calendar.endDate);
  for (const assignment of assignments) {
    const validFrom = formatCivilDate(assignment.validFrom);
    const validUntil = assignment.validUntil ? formatCivilDate(assignment.validUntil) : null;
    if (!intervalIsWithinCalendar(validFrom, validUntil, calendar)) {
      throw new ConflictException('Phiên lịch mới không tương thích với phân công giảng dạy đang lưu.');
    }
    if (validUntil === null) {
      await requireStaffSubjectCoverage(db, assignment.teacherUserId, assignment.subjectId, validFrom, targetEnd);
    }
  }
}
