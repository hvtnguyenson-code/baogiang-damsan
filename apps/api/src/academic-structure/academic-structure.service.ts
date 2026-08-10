import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AcademicCalendarVersion, AcademicYear, AuditResult, CatalogStatus, Prisma, SchoolClass,
} from '@prisma/client';
import {
  AcademicCalendarVersionDetail, AcademicCalendarVersionListResponse, AcademicCalendarVersionSummary,
  AcademicWeekKind, AcademicWeekday, AcademicYearListResponse, AcademicYearRecord,
  CalendarInterruptionRecord, SchoolClassListResponse, SchoolClassRecord,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarAggregateInput, validateCalendarAggregate } from './calendar-invariants';
import {
  CreateAcademicYearDto, CreateCalendarVersionDto, CreateSchoolClassDto, ListSchoolClassesDto,
  PageDto, UpdateAcademicYearDto, UpdateSchoolClassDto,
} from './dto';

const fullCalendarInclude = {
  semesters: { orderBy: [{ ordinal: 'asc' as const }, { id: 'asc' as const }] },
  weeks: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    include: { segments: { orderBy: [{ segmentOrder: 'asc' as const }, { id: 'asc' as const }] } },
  },
  interruptions: { orderBy: [{ startDate: 'asc' as const }, { code: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.AcademicCalendarVersionInclude;
type FullCalendar = Prisma.AcademicCalendarVersionGetPayload<{ include: typeof fullCalendarInclude }>;

function academicYearRecord(row: AcademicYear): AcademicYearRecord {
  return { id: row.id, code: row.code, name: row.name, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
function calendarSummary(row: AcademicCalendarVersion): AcademicCalendarVersionSummary {
  return {
    id: row.id, academicYearId: row.academicYearId, versionNumber: row.versionNumber,
    startDate: formatCivilDate(row.startDate), endDate: formatCivilDate(row.endDate),
    officialWeekCount: row.officialWeekCount, reserveWeekCount: row.reserveWeekCount,
    teachingWeekdays: row.teachingWeekdays as AcademicWeekday[], isActive: row.isActive,
    activatedAt: row.activatedAt?.toISOString() ?? null, note: row.note,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}
function calendarDetail(row: FullCalendar): AcademicCalendarVersionDetail {
  return {
    ...calendarSummary(row),
    semesters: row.semesters.map((item) => ({
      id: item.id, code: item.code, name: item.name, ordinal: item.ordinal,
      startDate: formatCivilDate(item.startDate), endDate: formatCivilDate(item.endDate),
      createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    })),
    weeks: row.weeks.map((item) => ({
      id: item.id, kind: item.kind as AcademicWeekKind, officialWeekNumber: item.officialWeekNumber,
      reserveWeekNumber: item.reserveWeekNumber, displayLabel: item.displayLabel, sortOrder: item.sortOrder,
      createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
      segments: item.segments.map((segment) => ({
        id: segment.id, label: segment.label, segmentOrder: segment.segmentOrder,
        startDate: formatCivilDate(segment.startDate), endDate: formatCivilDate(segment.endDate),
        createdAt: segment.createdAt.toISOString(), updatedAt: segment.updatedAt.toISOString(),
      })),
    })),
    interruptions: row.interruptions.map((item): CalendarInterruptionRecord => ({
      id: item.id, code: item.code, name: item.name, startDate: formatCivilDate(item.startDate),
      endDate: formatCivilDate(item.endDate), createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    })),
  };
}
function schoolClassRecord(row: SchoolClass): SchoolClassRecord {
  return {
    id: row.id, academicYearId: row.academicYearId, code: row.code, name: row.name,
    gradeLevel: row.gradeLevel as 10 | 11 | 12, status: row.status,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}
function storedAggregate(row: FullCalendar): CalendarAggregateInput {
  return {
    startDate: formatCivilDate(row.startDate), endDate: formatCivilDate(row.endDate),
    officialWeekCount: row.officialWeekCount, reserveWeekCount: row.reserveWeekCount,
    teachingWeekdays: row.teachingWeekdays,
    semesters: row.semesters.map((item) => ({ ...item, startDate: formatCivilDate(item.startDate), endDate: formatCivilDate(item.endDate) })),
    weeks: row.weeks.map((item) => ({
      ...item,
      segments: item.segments.map((segment) => ({ ...segment, startDate: formatCivilDate(segment.startDate), endDate: formatCivilDate(segment.endDate) })),
    })),
    interruptions: row.interruptions.map((item) => ({ ...item, startDate: formatCivilDate(item.startDate), endDate: formatCivilDate(item.endDate) })),
  };
}

@Injectable()
export class AcademicStructureService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async createAcademicYear(dto: CreateAcademicYearDto, actor: string, meta: RequestMeta): Promise<AcademicYearRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.academicYear.create({ data: { code: dto.code.trim().toUpperCase(), name: dto.name.trim() } });
        await this.writeAudit(tx, actor, meta, 'ACADEMIC_YEAR_CREATED', 'AcademicYear', row.id);
        return academicYearRecord(row);
      });
    } catch (error) { this.rethrowConflict(error, 'Mã năm học đã tồn tại.'); }
  }

  async listAcademicYears(query: PageDto): Promise<AcademicYearListResponse> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.academicYear.findMany({ skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ code: 'asc' }, { id: 'asc' }] }),
      this.prisma.academicYear.count(),
    ]);
    return { items: rows.map(academicYearRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async getAcademicYear(id: string): Promise<AcademicYearRecord> {
    const row = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy năm học.');
    return academicYearRecord(row);
  }

  async updateAcademicYear(id: string, dto: UpdateAcademicYearDto, actor: string, meta: RequestMeta): Promise<AcademicYearRecord> {
    if (dto.code === undefined && dto.name === undefined) throw new BadRequestException('Yêu cầu cập nhật phải có ít nhất một trường.');
    const data = { ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}), ...(dto.name !== undefined ? { name: dto.name.trim() } : {}) };
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!await tx.academicYear.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Không tìm thấy năm học.');
        const row = await tx.academicYear.update({ where: { id }, data });
        await this.writeAudit(tx, actor, meta, 'ACADEMIC_YEAR_UPDATED', 'AcademicYear', id, { changedFields: Object.keys(data) });
        return academicYearRecord(row);
      });
    } catch (error) { this.rethrowConflict(error, 'Mã năm học đã tồn tại.'); }
  }

  async listCalendarVersions(academicYearId: string, query: PageDto): Promise<AcademicCalendarVersionListResponse> {
    await this.requireAcademicYear(academicYearId);
    const where = { academicYearId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.academicCalendarVersion.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ versionNumber: 'desc' }, { id: 'asc' }] }),
      this.prisma.academicCalendarVersion.count({ where }),
    ]);
    return { items: rows.map(calendarSummary), page: query.page, pageSize: query.pageSize, total };
  }

  async getCalendarVersion(id: string): Promise<AcademicCalendarVersionDetail> {
    const row = await this.prisma.academicCalendarVersion.findUnique({ where: { id }, include: fullCalendarInclude });
    if (!row) throw new NotFoundException('Không tìm thấy phiên lịch năm học.');
    return calendarDetail(row);
  }

  async createCalendarVersion(academicYearId: string, dto: CreateCalendarVersionDto, actor: string, meta: RequestMeta): Promise<AcademicCalendarVersionDetail> {
    validateCalendarAggregate(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!await tx.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true } })) throw new NotFoundException('Không tìm thấy năm học.');
        const maximum = await tx.academicCalendarVersion.aggregate({ where: { academicYearId }, _max: { versionNumber: true } });
        const versionNumber = (maximum._max.versionNumber ?? 0) + 1;
        const version = await tx.academicCalendarVersion.create({ data: {
          academicYearId, versionNumber, startDate: parseCivilDate(dto.startDate), endDate: parseCivilDate(dto.endDate),
          officialWeekCount: dto.officialWeekCount, reserveWeekCount: dto.reserveWeekCount,
          teachingWeekdays: dto.teachingWeekdays, note: dto.note?.trim() || null,
        } });
        await tx.semester.createMany({ data: dto.semesters.map((item) => ({
          calendarVersionId: version.id, code: item.code.trim().toUpperCase(), name: item.name.trim(), ordinal: item.ordinal,
          startDate: parseCivilDate(item.startDate), endDate: parseCivilDate(item.endDate),
        })) });
        let segmentCount = 0;
        for (const week of dto.weeks) {
          const createdWeek = await tx.academicWeek.create({ data: {
            calendarVersionId: version.id, kind: week.kind,
            officialWeekNumber: week.officialWeekNumber ?? null, reserveWeekNumber: week.reserveWeekNumber ?? null,
            displayLabel: week.displayLabel.trim(), sortOrder: week.sortOrder,
          } });
          await tx.academicWeekSegment.createMany({ data: week.segments.map((segment) => ({
            academicWeekId: createdWeek.id, calendarVersionId: version.id, label: segment.label.trim(),
            segmentOrder: segment.segmentOrder, startDate: parseCivilDate(segment.startDate), endDate: parseCivilDate(segment.endDate),
          })) });
          segmentCount += week.segments.length;
        }
        if (dto.interruptions.length > 0) {
          await tx.calendarInterruption.createMany({ data: dto.interruptions.map((item) => ({
            calendarVersionId: version.id, code: item.code.trim().toUpperCase(), name: item.name.trim(),
            startDate: parseCivilDate(item.startDate), endDate: parseCivilDate(item.endDate),
          })) });
        }
        await this.writeAudit(tx, actor, meta, 'ACADEMIC_CALENDAR_VERSION_CREATED', 'AcademicCalendarVersion', version.id, {
          academicYearId, versionNumber, officialWeekCount: dto.officialWeekCount, reserveWeekCount: dto.reserveWeekCount,
          semesterCount: dto.semesters.length, segmentCount, interruptionCount: dto.interruptions.length,
        });
        return calendarDetail(await tx.academicCalendarVersion.findUniqueOrThrow({ where: { id: version.id }, include: fullCalendarInclude }));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { this.rethrowConflict(error, 'Không thể tạo phiên lịch do xung đột dữ liệu hoặc phiên bản đồng thời.'); }
  }

  async activateCalendarVersion(id: string, actor: string, meta: RequestMeta): Promise<AcademicCalendarVersionDetail> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const target = await tx.academicCalendarVersion.findUnique({ where: { id }, include: fullCalendarInclude });
        if (!target) throw new NotFoundException('Không tìm thấy phiên lịch năm học.');
        validateCalendarAggregate(storedAggregate(target));
        const previous = await tx.academicCalendarVersion.findFirst({
          where: { academicYearId: target.academicYearId, isActive: true }, orderBy: [{ versionNumber: 'asc' }, { id: 'asc' }],
        });
        const noOp = target.isActive && previous?.id === target.id;
        if (!noOp) {
          await tx.academicCalendarVersion.updateMany({ where: { academicYearId: target.academicYearId, isActive: true }, data: { isActive: false } });
          await tx.academicCalendarVersion.update({ where: { id }, data: { isActive: true, activatedAt: new Date() } });
        }
        await this.writeAudit(tx, actor, meta, 'ACADEMIC_CALENDAR_VERSION_ACTIVATED', 'AcademicCalendarVersion', id, {
          academicYearId: target.academicYearId, versionNumber: target.versionNumber,
          previousActiveVersionId: previous?.id, noOp,
        });
        return calendarDetail(await tx.academicCalendarVersion.findUniqueOrThrow({ where: { id }, include: fullCalendarInclude }));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { this.rethrowConflict(error, 'Không thể kích hoạt phiên lịch do xung đột vòng đời.'); }
  }

  async createSchoolClass(academicYearId: string, dto: CreateSchoolClassDto, actor: string, meta: RequestMeta): Promise<SchoolClassRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!await tx.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true } })) throw new NotFoundException('Không tìm thấy năm học.');
        const row = await tx.schoolClass.create({ data: { academicYearId, code: dto.code.trim().toUpperCase(), name: dto.name.trim(), gradeLevel: dto.gradeLevel } });
        await this.writeAudit(tx, actor, meta, 'SCHOOL_CLASS_CREATED', 'SchoolClass', row.id, { academicYearId });
        return schoolClassRecord(row);
      });
    } catch (error) { this.rethrowConflict(error, 'Mã lớp đã tồn tại trong năm học.'); }
  }

  async listSchoolClasses(academicYearId: string, query: ListSchoolClassesDto): Promise<SchoolClassListResponse> {
    await this.requireAcademicYear(academicYearId);
    const where: Prisma.SchoolClassWhereInput = { academicYearId, ...(query.status ? { status: query.status } : {}), ...(query.gradeLevel ? { gradeLevel: query.gradeLevel } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.schoolClass.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ gradeLevel: 'asc' }, { code: 'asc' }, { id: 'asc' }] }),
      this.prisma.schoolClass.count({ where }),
    ]);
    return { items: rows.map(schoolClassRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async getSchoolClass(id: string): Promise<SchoolClassRecord> {
    const row = await this.prisma.schoolClass.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy lớp học.');
    return schoolClassRecord(row);
  }

  async updateSchoolClass(id: string, dto: UpdateSchoolClassDto, actor: string, meta: RequestMeta): Promise<SchoolClassRecord> {
    if (dto.code === undefined && dto.name === undefined && dto.gradeLevel === undefined) throw new BadRequestException('Yêu cầu cập nhật phải có ít nhất một trường.');
    const data = {
      ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.gradeLevel !== undefined ? { gradeLevel: dto.gradeLevel } : {}),
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!await tx.schoolClass.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Không tìm thấy lớp học.');
        const row = await tx.schoolClass.update({ where: { id }, data });
        await this.writeAudit(tx, actor, meta, 'SCHOOL_CLASS_UPDATED', 'SchoolClass', id, { changedFields: Object.keys(data) });
        return schoolClassRecord(row);
      });
    } catch (error) { this.rethrowConflict(error, 'Mã lớp đã tồn tại trong năm học.'); }
  }

  async changeSchoolClassStatus(id: string, status: CatalogStatus, actor: string, meta: RequestMeta): Promise<SchoolClassRecord> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.schoolClass.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Không tìm thấy lớp học.');
      const row = existing.status === status ? existing : await tx.schoolClass.update({ where: { id }, data: { status } });
      await this.writeAudit(tx, actor, meta, status === CatalogStatus.ACTIVE ? 'SCHOOL_CLASS_ACTIVATED' : 'SCHOOL_CLASS_DEACTIVATED', 'SchoolClass', id, {
        previousStatus: existing.status, newStatus: status, noOp: existing.status === status,
      });
      return schoolClassRecord(row);
    });
  }

  private async requireAcademicYear(id: string): Promise<void> {
    if (!await this.prisma.academicYear.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Không tìm thấy năm học.');
  }

  private async writeAudit(tx: Prisma.TransactionClient, actor: string, meta: RequestMeta, action: string, entityType: string, entityId: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.audit.write({ actorUserId: actor, action, entityType, entityId, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata }, tx);
  }

  private rethrowConflict(error: unknown, message: string): never {
    if (error instanceof HttpException) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2004', 'P2034'].includes(error.code)) throw new ConflictException(message);
    if (error instanceof Prisma.PrismaClientUnknownRequestError
      && /(semesters|academic_week_segments|calendar_interruptions)_no_overlap|one_active_per_year/u.test(error.message)) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
