import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, Prisma, TimeSlotDefinition as TimeSlotRow } from '@prisma/client';
import {
  TimeSlotDefinitionListResponse,
  TimeSlotDefinitionRecord,
  TimeSlotRevisionResult,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimeSlotDto, ListTimeSlotsDto, ReviseTimeSlotDto } from './dto';
import { formatWallClockTime, parseWallClockTime, wallClockSeconds } from './wall-clock-time';

const SLOT_CONSTRAINTS = [
  'time_slot_definitions_active_time_no_overlap',
  'time_slot_definitions_active_label_key',
  'time_slot_definitions_one_active_revision_key',
  'time_slot_definitions_logical_revision_key',
] as const;

export function toTimeSlotDefinitionRecord(row: TimeSlotRow): TimeSlotDefinitionRecord {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    weekday: row.weekday,
    session: row.session,
    ordinal: row.ordinal,
    revision: row.revision,
    displayLabel: row.displayLabel,
    startTime: formatWallClockTime(row.startTime),
    endTime: formatWallClockTime(row.endTime),
    isActive: row.isActive,
    allowRegularTeaching: row.allowRegularTeaching,
    allowMakeupTeaching: row.allowMakeupTeaching,
    allowSelfStudy: row.allowSelfStudy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function validateTimeSlotSemantics(input: {
  displayLabel: string;
  startTime: string;
  endTime: string;
  allowRegularTeaching: boolean;
  allowMakeupTeaching: boolean;
  allowSelfStudy: boolean;
}): void {
  if (!input.displayLabel.trim()) throw new BadRequestException('Nhãn tiết học không được để trống.');
  const start = wallClockSeconds(input.startTime);
  const end = wallClockSeconds(input.endTime);
  if (start >= end) throw new BadRequestException('Giờ bắt đầu phải trước giờ kết thúc.');
  if (!input.allowRegularTeaching && !input.allowMakeupTeaching && !input.allowSelfStudy) {
    throw new BadRequestException('Khung tiết phải cho phép ít nhất một mục đích sử dụng.');
  }
}

function isKnownTimeSlotConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2034' || error.code === 'P2002') return true;
    if (error.code !== 'P2004') return false;
    const detail = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
    return SLOT_CONSTRAINTS.some((constraint) => detail.includes(constraint));
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return SLOT_CONSTRAINTS.some((constraint) => error.message.includes(constraint));
  }
  return false;
}

@Injectable()
export class TimeSlotsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(academicYearId: string, query: ListTimeSlotsDto): Promise<TimeSlotDefinitionListResponse> {
    await this.requireAcademicYear(academicYearId);
    const where: Prisma.TimeSlotDefinitionWhereInput = {
      academicYearId,
      ...(query.weekday ? { weekday: query.weekday } : {}),
      ...(query.session ? { session: query.session } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.timeSlotDefinition.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [
          { weekday: 'asc' },
          { session: 'asc' },
          { ordinal: 'asc' },
          { revision: 'desc' },
          { id: 'asc' },
        ],
      }),
      this.prisma.timeSlotDefinition.count({ where }),
    ]);
    return { items: items.map(toTimeSlotDefinitionRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<TimeSlotDefinitionRecord> {
    const row = await this.prisma.timeSlotDefinition.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy phiên bản khung tiết.');
    return toTimeSlotDefinitionRecord(row);
  }

  async create(
    academicYearId: string,
    dto: CreateTimeSlotDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TimeSlotDefinitionRecord> {
    validateTimeSlotSemantics(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireAcademicYear(academicYearId, tx);
        const existing = await tx.timeSlotDefinition.findFirst({
          where: { academicYearId, weekday: dto.weekday, session: dto.session, ordinal: dto.ordinal },
          select: { id: true },
        });
        if (existing) throw new ConflictException('Tọa độ khung tiết đã có lịch sử; hãy dùng lệnh tạo phiên bản mới.');
        const row = await tx.timeSlotDefinition.create({
          data: {
            academicYearId,
            weekday: dto.weekday,
            session: dto.session,
            ordinal: dto.ordinal,
            revision: 1,
            displayLabel: dto.displayLabel.trim(),
            startTime: parseWallClockTime(dto.startTime),
            endTime: parseWallClockTime(dto.endTime),
            isActive: true,
            allowRegularTeaching: dto.allowRegularTeaching,
            allowMakeupTeaching: dto.allowMakeupTeaching,
            allowSelfStudy: dto.allowSelfStudy,
          },
        });
        await this.writeAudit(tx, actorUserId, meta, 'TIME_SLOT_CREATED', row.id, {
          academicYearId,
          weekday: row.weekday,
          session: row.session,
          ordinal: row.ordinal,
          revision: row.revision,
          startTime: dto.startTime,
          endTime: dto.endTime,
          allowRegularTeaching: row.allowRegularTeaching,
          allowMakeupTeaching: row.allowMakeupTeaching,
          allowSelfStudy: row.allowSelfStudy,
        });
        return toTimeSlotDefinitionRecord(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async revise(
    id: string,
    dto: ReviseTimeSlotDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TimeSlotRevisionResult> {
    validateTimeSlotSemantics(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const source = await tx.timeSlotDefinition.findUnique({ where: { id } });
        if (!source) throw new NotFoundException('Không tìm thấy phiên bản khung tiết.');
        await this.requireLatestRevision(tx, source);
        const previous = source.isActive
          ? await tx.timeSlotDefinition.update({ where: { id: source.id }, data: { isActive: false } })
          : source;
        const replacement = await tx.timeSlotDefinition.create({
          data: {
            academicYearId: source.academicYearId,
            weekday: source.weekday,
            session: source.session,
            ordinal: source.ordinal,
            revision: source.revision + 1,
            displayLabel: dto.displayLabel.trim(),
            startTime: parseWallClockTime(dto.startTime),
            endTime: parseWallClockTime(dto.endTime),
            isActive: true,
            allowRegularTeaching: dto.allowRegularTeaching,
            allowMakeupTeaching: dto.allowMakeupTeaching,
            allowSelfStudy: dto.allowSelfStudy,
          },
        });
        await this.writeAudit(tx, actorUserId, meta, 'TIME_SLOT_REVISED', replacement.id, {
          academicYearId: source.academicYearId,
          weekday: source.weekday,
          session: source.session,
          ordinal: source.ordinal,
          previousRevisionId: source.id,
          previousRevision: source.revision,
          replacementRevisionId: replacement.id,
          replacementRevision: replacement.revision,
        });
        return { previous: toTimeSlotDefinitionRecord(previous), replacement: toTimeSlotDefinitionRecord(replacement) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async retire(id: string, actorUserId: string, meta: RequestMeta): Promise<TimeSlotDefinitionRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const source = await tx.timeSlotDefinition.findUnique({ where: { id } });
        if (!source) throw new NotFoundException('Không tìm thấy phiên bản khung tiết.');
        await this.requireLatestRevision(tx, source);
        const noOp = !source.isActive;
        const row = noOp
          ? source
          : await tx.timeSlotDefinition.update({ where: { id: source.id }, data: { isActive: false } });
        await this.writeAudit(tx, actorUserId, meta, 'TIME_SLOT_RETIRED', row.id, {
          academicYearId: row.academicYearId,
          weekday: row.weekday,
          session: row.session,
          ordinal: row.ordinal,
          revision: row.revision,
          noOp,
        });
        return toTimeSlotDefinitionRecord(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  private async requireAcademicYear(id: string, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    if (!await tx.academicYear.findUnique({ where: { id }, select: { id: true } })) {
      throw new NotFoundException('Không tìm thấy năm học.');
    }
  }

  private async requireLatestRevision(tx: Prisma.TransactionClient, source: TimeSlotRow): Promise<void> {
    const latest = await tx.timeSlotDefinition.findFirst({
      where: {
        academicYearId: source.academicYearId,
        weekday: source.weekday,
        session: source.session,
        ordinal: source.ordinal,
      },
      orderBy: [{ revision: 'desc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (!latest || latest.id !== source.id) {
      throw new ConflictException('Phiên bản khung tiết đã cũ; không thể tạo nhánh lịch sử.');
    }
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    meta: RequestMeta,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.write({
      actorUserId,
      action,
      entityType: 'TimeSlotDefinition',
      entityId,
      requestId: meta.requestId,
      result: AuditResult.SUCCESS,
      metadata,
    }, tx);
  }

  private rethrowConflict(error: unknown): never {
    if (error instanceof HttpException) throw error;
    if (isKnownTimeSlotConflict(error)) {
      throw new ConflictException('Khung tiết bị trùng tọa độ, nhãn hoặc chồng lấn thời gian.');
    }
    throw error;
  }
}

export { isKnownTimeSlotConflict };
