import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AcademicCalendarVersion, CatalogStatus, Prisma, UserStatus } from '@prisma/client';
import { CivilDateString } from '@baogiang/contracts';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';

export type HomeroomDb = Prisma.TransactionClient;
export type HomeroomIntervalKind = 'BOUNDED_HISTORICAL' | 'CURRENT_OR_FUTURE';

export function homeroomBusinessDate(now = new Date()): CivilDateString {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}` as CivilDateString;
}

export function classifyHomeroomInterval(validUntil: CivilDateString | null, businessDate: CivilDateString): HomeroomIntervalKind {
  return validUntil !== null && validUntil < businessDate ? 'BOUNDED_HISTORICAL' : 'CURRENT_OR_FUTURE';
}

export function previousHomeroomCivilDate(value: CivilDateString): CivilDateString {
  const date = parseCivilDate(value); date.setUTCDate(date.getUTCDate() - 1); return formatCivilDate(date);
}

export async function requireHomeroomActiveCalendar(db: HomeroomDb, academicYearId: string): Promise<AcademicCalendarVersion> {
  const rows = await db.academicCalendarVersion.findMany({ where: { academicYearId, isActive: true }, orderBy: [{ versionNumber: 'desc' }, { id: 'asc' }] });
  if (rows.length !== 1) throw new ConflictException('Năm học phải có đúng một phiên lịch đang áp dụng.');
  return rows[0];
}

export function requireHomeroomEnvelope(validFrom: CivilDateString, validUntil: CivilDateString | null, calendar: Pick<AcademicCalendarVersion, 'startDate' | 'endDate'>): void {
  const start = formatCivilDate(calendar.startDate); const end = formatCivilDate(calendar.endDate);
  if (validUntil !== null && validUntil < validFrom) throw new BadRequestException('Khoảng ngày hiệu lực không hợp lệ.');
  if (validFrom < start || validFrom > end || (validUntil !== null && validUntil > end)) throw new BadRequestException('Khoảng ngày hiệu lực nằm ngoài lịch năm học đang áp dụng.');
}

export async function validateHomeroomCandidate(db: HomeroomDb, input: { academicYearId: string; schoolClassId: string; teacherUserId: string; validFrom: CivilDateString; validUntil: CivilDateString | null; entryReason?: string; businessDate: CivilDateString; excludedAssignmentIds?: string[] }): Promise<void> {
  const schoolClass = await db.schoolClass.findUnique({ where: { id: input.schoolClassId } });
  if (!schoolClass) throw new NotFoundException('Không tìm thấy lớp học.');
  if (schoolClass.academicYearId !== input.academicYearId) throw new BadRequestException('Lớp học không thuộc năm học đã chọn.');
  const teacher = await db.user.findUnique({ where: { id: input.teacherUserId }, include: { profile: true } });
  if (!teacher) throw new NotFoundException('Không tìm thấy người dùng giáo viên.');
  const overlap = await db.homeroomAssignment.findFirst({
    where: {
      academicYearId: input.academicYearId,
      schoolClassId: input.schoolClassId,
      status: 'ACTIVE',
      ...(input.excludedAssignmentIds?.length ? { id: { notIn: input.excludedAssignmentIds } } : {}),
      validFrom: { lte: parseCivilDate(input.validUntil ?? '9999-12-31') },
      OR: [{ validUntil: null }, { validUntil: { gte: parseCivilDate(input.validFrom) } }],
    },
    select: { id: true },
  });
  if (overlap) throw new ConflictException('Lớp đã có phân công chủ nhiệm chồng lấn thời gian.');
  if (classifyHomeroomInterval(input.validUntil, input.businessDate) === 'BOUNDED_HISTORICAL') {
    if (!input.entryReason?.trim()) throw new BadRequestException('Bổ sung lịch sử phải có lý do nhập liệu.');
    return;
  }
  if (schoolClass.status !== CatalogStatus.ACTIVE) throw new ConflictException('Lớp học không còn hoạt động.');
  if (teacher.status !== UserStatus.ACTIVE || !teacher.profile?.isTeachingStaff) throw new ConflictException('Giáo viên chưa đủ điều kiện hoạt động để làm giáo viên chủ nhiệm.');
}

export async function ensureHomeroomCalendarActivationCompatibility(db: HomeroomDb, calendar: Pick<AcademicCalendarVersion, 'academicYearId'|'startDate'|'endDate'>): Promise<void> {
  const rows=await db.homeroomAssignment.findMany({where:{academicYearId:calendar.academicYearId},select:{validFrom:true,validUntil:true}});
  for(const row of rows){const from=formatCivilDate(row.validFrom),until=row.validUntil?formatCivilDate(row.validUntil):null;try{requireHomeroomEnvelope(from,until,calendar);}catch{throw new ConflictException('Phiên lịch mới không tương thích với lịch sử giáo viên chủ nhiệm đang lưu.');}}
}
