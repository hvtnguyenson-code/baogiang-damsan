import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdditionalDutyDefinition, AuditResult, Prisma, StaffAdditionalDutyAssignment } from '@prisma/client';
import {
  AdditionalDutyDefinitionListResponse,
  AdditionalDutyDefinitionOptionsResponse,
  AdditionalDutyDefinitionRecord,
  StaffAdditionalDutyAssignmentListResponse,
  StaffAdditionalDutyAssignmentRecord,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDefinitionDto,
  CreateDutyAssignmentDto,
  EndDutyAssignmentDto,
  ListDefinitionOptionsDto,
  ListDefinitionsDto,
  ListDutyAssignmentsDto,
  UpdateDefinitionDto,
  UpdateDutyAssignmentDto,
} from './dto';

const DUTY_ASSIGNMENT_CONSTRAINT = 'staff_duty_assignments_no_overlap';

function parseWindow(validFrom?: string, validUntil?: string): { validFrom: Date; validUntil: Date | null } {
  const from = validFrom ? new Date(validFrom) : new Date();
  const until = validUntil ? new Date(validUntil) : null;
  if (Number.isNaN(from.getTime()) || (until && Number.isNaN(until.getTime())) || (until && until <= from)) {
    throw new BadRequestException('Khoảng thời gian không hợp lệ.');
  }
  return { validFrom: from, validUntil: until };
}

function isAssignmentConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2002') return true;
  if (error.code !== 'P2004') return false;
  return JSON.stringify(error.meta ?? {}).includes(DUTY_ASSIGNMENT_CONSTRAINT) || error.message.includes(DUTY_ASSIGNMENT_CONSTRAINT);
}

export function toDefinitionRecord(row: AdditionalDutyDefinition): AdditionalDutyDefinitionRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    category: row.category,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    validFrom: row.validFrom.toISOString(),
    ...(row.validUntil ? { validUntil: row.validUntil.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDutyAssignmentRecord(row: StaffAdditionalDutyAssignment): StaffAdditionalDutyAssignmentRecord {
  return {
    id: row.id,
    staffProfileId: row.staffProfileId,
    dutyDefinitionId: row.dutyDefinitionId,
    scopeType: row.scopeType as StaffAdditionalDutyAssignmentRecord['scopeType'],
    ...(row.scopeResourceId ? { scopeResourceId: row.scopeResourceId } : {}),
    validFrom: row.validFrom.toISOString(),
    ...(row.validUntil ? { validUntil: row.validUntil.toISOString() } : {}),
    ...(row.note ? { note: row.note } : {}),
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class AdditionalDutiesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listDefinitions(query: ListDefinitionsDto): Promise<AdditionalDutyDefinitionListResponse> {
    const effectiveAt = query.effectiveAt ? new Date(query.effectiveAt) : undefined;
    const where: Prisma.AdditionalDutyDefinitionWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(effectiveAt ? { AND: [{ validFrom: { lte: effectiveAt } }, { OR: [{ validUntil: null }, { validUntil: { gt: effectiveAt } }] }] } : {}),
    };
    return this.definitionPage(where, query.page, query.pageSize);
  }

  async listOptions(query: ListDefinitionOptionsDto): Promise<AdditionalDutyDefinitionOptionsResponse> {
    const effectiveAt = query.effectiveAt ? new Date(query.effectiveAt) : new Date();
    const where: Prisma.AdditionalDutyDefinitionWhereInput = {
      isActive: true,
      ...(query.category ? { category: query.category } : {}),
      AND: [{ validFrom: { lte: effectiveAt } }, { OR: [{ validUntil: null }, { validUntil: { gt: effectiveAt } }] }],
    };
    return this.definitionPage(where, query.page, query.pageSize);
  }

  async getDefinition(id: string): Promise<AdditionalDutyDefinitionRecord> {
    const row = await this.prisma.additionalDutyDefinition.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy định nghĩa kiêm nhiệm.');
    return toDefinitionRecord(row);
  }

  async createDefinition(dto: CreateDefinitionDto, actor: string, meta: RequestMeta): Promise<AdditionalDutyDefinitionRecord> {
    const window = parseWindow(dto.validFrom, dto.validUntil);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.additionalDutyDefinition.create({
          data: { code: dto.code, name: dto.name, ...(dto.description !== undefined ? { description: dto.description } : {}), category: dto.category, sortOrder: dto.sortOrder ?? 0, ...window },
        });
        await this.audit.write({ actorUserId: actor, action: 'ADDITIONAL_DUTY_DEFINITION_CREATED', entityType: 'AdditionalDutyDefinition', entityId: row.id, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata: { code: row.code, category: row.category } }, tx);
        return toDefinitionRecord(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Mã kiêm nhiệm đã tồn tại.');
      throw error;
    }
  }

  async updateDefinition(id: string, dto: UpdateDefinitionDto, actor: string, meta: RequestMeta): Promise<AdditionalDutyDefinitionRecord> {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Phải có dữ liệu cập nhật.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const old = await tx.additionalDutyDefinition.findUnique({ where: { id }, include: { assignments: { select: { id: true }, take: 1 } } });
        if (!old) throw new NotFoundException('Không tìm thấy định nghĩa kiêm nhiệm.');
        if (old.assignments.length > 0 && (dto.code !== undefined || dto.validFrom !== undefined || dto.validUntil !== undefined)) {
          throw new ConflictException('Không thể thay đổi code hoặc hiệu lực của định nghĩa đã được sử dụng.');
        }
        const window = dto.validFrom !== undefined || dto.validUntil !== undefined
          ? parseWindow(dto.validFrom ?? old.validFrom.toISOString(), dto.validUntil ?? old.validUntil?.toISOString())
          : undefined;
        const row = await tx.additionalDutyDefinition.update({
          where: { id },
          data: {
            ...(dto.code !== undefined ? { code: dto.code } : {}),
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.category !== undefined ? { category: dto.category } : {}),
            ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
            ...window,
          },
        });
        await this.audit.write({ actorUserId: actor, action: 'ADDITIONAL_DUTY_DEFINITION_UPDATED', entityType: 'AdditionalDutyDefinition', entityId: id, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata: { changedFields: Object.keys(dto) } }, tx);
        return toDefinitionRecord(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Mã kiêm nhiệm đã tồn tại.');
      throw error;
    }
  }

  async disableDefinition(id: string, actor: string, meta: RequestMeta): Promise<AdditionalDutyDefinitionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.additionalDutyDefinition.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Không tìm thấy định nghĩa kiêm nhiệm.');
      if (!old.isActive) return toDefinitionRecord(old);
      const row = await tx.additionalDutyDefinition.update({ where: { id }, data: { isActive: false } });
      await this.audit.write({ actorUserId: actor, action: 'ADDITIONAL_DUTY_DEFINITION_DISABLED', entityType: 'AdditionalDutyDefinition', entityId: id, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata: { previousIsActive: true, newIsActive: false } }, tx);
      return toDefinitionRecord(row);
    });
  }

  async listAssignments(query: ListDutyAssignmentsDto, authorizationWhere: Prisma.StaffAdditionalDutyAssignmentWhereInput): Promise<StaffAdditionalDutyAssignmentListResponse> {
    const activeAt = query.activeAt ? new Date(query.activeAt) : undefined;
    const where: Prisma.StaffAdditionalDutyAssignmentWhereInput = {
      AND: [
        authorizationWhere,
        {
          ...(query.staffProfileId ? { staffProfileId: query.staffProfileId } : {}),
          ...(query.dutyDefinitionId ? { dutyDefinitionId: query.dutyDefinitionId } : {}),
          ...(query.scopeType ? { scopeType: query.scopeType } : {}),
          ...(query.scopeResourceId ? { scopeResourceId: query.scopeResourceId } : {}),
          ...(activeAt ? { AND: [{ validFrom: { lte: activeAt } }, { OR: [{ validUntil: null }, { validUntil: { gt: activeAt } }] }] } : {}),
        },
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.staffAdditionalDutyAssignment.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ validFrom: 'desc' }, { id: 'asc' }] }),
      this.prisma.staffAdditionalDutyAssignment.count({ where }),
    ]);
    return { items: items.map(toDutyAssignmentRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async getAssignmentScope(id: string): Promise<Pick<StaffAdditionalDutyAssignment, 'scopeType' | 'scopeResourceId'>> {
    const row = await this.prisma.staffAdditionalDutyAssignment.findUnique({ where: { id }, select: { scopeType: true, scopeResourceId: true } });
    if (!row) throw new NotFoundException('Không tìm thấy phân công kiêm nhiệm.');
    return row;
  }

  async getAssignment(id: string): Promise<StaffAdditionalDutyAssignmentRecord> {
    const row = await this.prisma.staffAdditionalDutyAssignment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy phân công kiêm nhiệm.');
    return toDutyAssignmentRecord(row);
  }

  async createAssignment(dto: CreateDutyAssignmentDto, actor: string, meta: RequestMeta): Promise<StaffAdditionalDutyAssignmentRecord> {
    const window = parseWindow(dto.validFrom, dto.validUntil);
    if (dto.scopeType === 'SCHOOL_WIDE' && dto.scopeResourceId !== undefined) throw new BadRequestException('Scope toàn trường không có resource.');
    if (dto.scopeType === 'SUBJECT_GROUP' && !dto.scopeResourceId) throw new BadRequestException('Thiếu tổ chuyên môn.');
    const [staff, definition, group] = await Promise.all([
      this.prisma.staffProfile.findUnique({ where: { id: dto.staffProfileId }, select: { id: true } }),
      this.prisma.additionalDutyDefinition.findUnique({ where: { id: dto.dutyDefinitionId } }),
      dto.scopeType === 'SUBJECT_GROUP' ? this.prisma.subjectGroup.findUnique({ where: { id: dto.scopeResourceId! }, select: { status: true } }) : Promise.resolve(null),
    ]);
    if (!staff || !definition || (dto.scopeType === 'SUBJECT_GROUP' && !group)) throw new NotFoundException('Không tìm thấy tham chiếu phân công.');
    if (!definition.isActive || definition.validFrom > window.validFrom || (definition.validUntil && window.validFrom >= definition.validUntil) || (definition.validUntil && (!window.validUntil || window.validUntil > definition.validUntil))) {
      throw new ConflictException('Phân công nằm ngoài hiệu lực định nghĩa.');
    }
    if (group && group.status !== 'ACTIVE') throw new ConflictException('Tổ chuyên môn không hoạt động.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.staffAdditionalDutyAssignment.create({ data: { staffProfileId: dto.staffProfileId, dutyDefinitionId: dto.dutyDefinitionId, scopeType: dto.scopeType, scopeResourceId: dto.scopeResourceId ?? null, ...window, ...(dto.note !== undefined ? { note: dto.note } : {}), createdByUserId: actor } });
        await this.audit.write({ actorUserId: actor, action: 'STAFF_ADDITIONAL_DUTY_ASSIGNED', entityType: 'StaffAdditionalDutyAssignment', entityId: row.id, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata: { staffProfileId: row.staffProfileId, dutyDefinitionId: row.dutyDefinitionId, scopeType: row.scopeType, ...(row.scopeResourceId ? { scopeResourceId: row.scopeResourceId } : {}) } }, tx);
        return toDutyAssignmentRecord(row);
      });
    } catch (error) {
      if (isAssignmentConflict(error)) throw new ConflictException('Phân công trùng hoặc chồng lấn thời gian.');
      throw error;
    }
  }

  async updateAssignment(id: string, dto: UpdateDutyAssignmentDto, actor: string, meta: RequestMeta): Promise<StaffAdditionalDutyAssignmentRecord> {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Phải có dữ liệu cập nhật.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const old = await tx.staffAdditionalDutyAssignment.findUnique({ where: { id }, include: { dutyDefinition: true } });
        if (!old) throw new NotFoundException('Không tìm thấy phân công kiêm nhiệm.');
        const window = parseWindow(dto.validFrom ?? old.validFrom.toISOString(), dto.validUntil ?? old.validUntil?.toISOString());
        if (window.validFrom < old.dutyDefinition.validFrom || (old.dutyDefinition.validUntil && (!window.validUntil || window.validUntil > old.dutyDefinition.validUntil))) {
          throw new ConflictException('Phân công nằm ngoài hiệu lực định nghĩa.');
        }
        const row = await tx.staffAdditionalDutyAssignment.update({ where: { id }, data: { ...window, ...(dto.note !== undefined ? { note: dto.note } : {}) } });
        await this.audit.write({ actorUserId: actor, action: 'STAFF_ADDITIONAL_DUTY_UPDATED', entityType: 'StaffAdditionalDutyAssignment', entityId: id, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata: { changedFields: Object.keys(dto) } }, tx);
        return toDutyAssignmentRecord(row);
      });
    } catch (error) {
      if (isAssignmentConflict(error)) throw new ConflictException('Phân công trùng hoặc chồng lấn thời gian.');
      throw error;
    }
  }

  async endAssignment(id: string, dto: EndDutyAssignmentDto, actor: string, meta: RequestMeta): Promise<StaffAdditionalDutyAssignmentRecord> {
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.staffAdditionalDutyAssignment.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Không tìm thấy phân công kiêm nhiệm.');
      if (old.validUntil) return toDutyAssignmentRecord(old);
      const endAt = dto.endAt ? new Date(dto.endAt) : new Date();
      if (endAt <= old.validFrom) throw new BadRequestException('Thời điểm kết thúc không hợp lệ.');
      const row = await tx.staffAdditionalDutyAssignment.update({ where: { id }, data: { validUntil: endAt } });
      await this.audit.write({ actorUserId: actor, action: 'STAFF_ADDITIONAL_DUTY_ENDED', entityType: 'StaffAdditionalDutyAssignment', entityId: id, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata: { previousValidUntil: null, newValidUntil: endAt.toISOString() } }, tx);
      return toDutyAssignmentRecord(row);
    });
  }

  private async definitionPage(where: Prisma.AdditionalDutyDefinitionWhereInput, page: number, pageSize: number): Promise<AdditionalDutyDefinitionListResponse> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.additionalDutyDefinition.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }, { id: 'asc' }] }),
      this.prisma.additionalDutyDefinition.count({ where }),
    ]);
    return { items: items.map(toDefinitionRecord), page, pageSize, total };
  }
}
