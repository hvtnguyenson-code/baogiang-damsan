import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CatalogStatus, Prisma, UserStatus } from '@prisma/client';
import {
  CivilDateString,
  TeachingAssignmentAcademicYearOptionListResponse,
  TeachingAssignmentEligibleTeacherListResponse,
  TeachingAssignmentTeacherSummary,
  TeachingAssignmentWorkspaceOptionsResponse,
} from '@baogiang/contracts';
import { formatCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { ListEligibleTeachingAssignmentTeachersDto, TeachingAssignmentPageDto } from './dto';
import {
  requireActiveCalendar,
  requireCalendarEnvelope,
  staffSubjectCoverageWhere,
} from './teaching-assignment-policy';

const teacherOptionSelect = {
  id: true,
  username: true,
  status: true,
  profile: { select: { displayName: true, staffCode: true, isTeachingStaff: true } },
} satisfies Prisma.UserSelect;

type TeacherOptionRow = Prisma.UserGetPayload<{ select: typeof teacherOptionSelect }>;

function toTeacherOption(row: TeacherOptionRow): TeachingAssignmentTeacherSummary {
  return {
    userId: row.id,
    username: row.username,
    displayName: row.profile?.displayName ?? row.username,
    staffCode: row.profile?.staffCode ?? null,
    userStatus: row.status,
    isTeachingStaff: row.profile?.isTeachingStaff ?? null,
  };
}

@Injectable()
export class TeachingAssignmentOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAcademicYears(query: TeachingAssignmentPageDto): Promise<TeachingAssignmentAcademicYearOptionListResponse> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.academicYear.findMany({
        select: { id: true, code: true, name: true },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ createdAt: 'desc' }, { code: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.academicYear.count(),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async getWorkspace(academicYearId: string): Promise<TeachingAssignmentWorkspaceOptionsResponse> {
    const academicYear = await this.prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { id: true, code: true, name: true },
    });
    if (!academicYear) throw new NotFoundException('Không tìm thấy năm học.');

    const [activeCalendar, classes, subjects, historicalTeachers] = await this.prisma.$transaction([
      this.prisma.academicCalendarVersion.findFirst({
        where: { academicYearId, isActive: true },
        select: { id: true, versionNumber: true, startDate: true, endDate: true },
        orderBy: [{ versionNumber: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.schoolClass.findMany({
        where: { academicYearId },
        select: { id: true, code: true, name: true, gradeLevel: true, status: true },
        orderBy: [{ gradeLevel: 'asc' }, { code: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.subject.findMany({
        select: { id: true, code: true, name: true, status: true },
        orderBy: [{ name: 'asc' }, { code: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.user.findMany({
        where: { teachingAssignments: { some: { academicYearId } } },
        select: teacherOptionSelect,
        orderBy: [{ profile: { displayName: 'asc' } }, { username: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return {
      academicYear,
      activeCalendar: activeCalendar ? {
        id: activeCalendar.id,
        versionNumber: activeCalendar.versionNumber,
        startDate: formatCivilDate(activeCalendar.startDate),
        endDate: formatCivilDate(activeCalendar.endDate),
      } : null,
      classes,
      subjects,
      historicalTeachers: historicalTeachers.map(toTeacherOption),
    };
  }

  async listEligibleTeachers(
    academicYearId: string,
    query: ListEligibleTeachingAssignmentTeachersDto,
  ): Promise<TeachingAssignmentEligibleTeacherListResponse> {
    if (!await this.prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true } })) {
      throw new NotFoundException('Không tìm thấy năm học.');
    }
    const calendar = await requireActiveCalendar(this.prisma, academicYearId);
    const validFrom = query.validFrom as CivilDateString;
    const validUntil = (query.validUntil ?? null) as CivilDateString | null;
    requireCalendarEnvelope(validFrom, validUntil, calendar);

    const subject = await this.prisma.subject.findUnique({ where: { id: query.subjectId }, select: { status: true } });
    if (!subject) throw new NotFoundException('Không tìm thấy môn học.');
    if (subject.status !== CatalogStatus.ACTIVE) throw new ConflictException('Môn học không còn hoạt động.');

    const effectiveEnd = validUntil ?? formatCivilDate(calendar.endDate);
    const where: Prisma.UserWhereInput = {
      status: UserStatus.ACTIVE,
      profile: { is: { isTeachingStaff: true } },
      staffSubjects: { some: staffSubjectCoverageWhere(query.subjectId, validFrom, effectiveEnd) },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: teacherOptionSelect,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ profile: { displayName: 'asc' } }, { username: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: items.map(toTeacherOption), page: query.page, pageSize: query.pageSize, total };
  }
}
