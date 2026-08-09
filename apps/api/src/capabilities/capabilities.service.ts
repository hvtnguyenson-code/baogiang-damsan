import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, CapabilityDefinition, CapabilityGrant, CatalogStatus, Prisma } from '@prisma/client';
import {
  CapabilityDefinitionListResponse,
  CapabilityDefinitionRecord,
  CapabilityGrantListResponse,
  CapabilityGrantRecord,
  CapabilityKey,
  CapabilityScope,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGrantDto, ListCapabilitiesDto, ListGrantsDto, RevokeGrantDto } from './dto';

const CAPABILITY_GRANT_CONSTRAINT = 'capability_grants_no_active_overlap';

function isGrantConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2002') return true;
  if (error.code !== 'P2004') return false;
  return JSON.stringify(error.meta ?? {}).includes(CAPABILITY_GRANT_CONSTRAINT) || error.message.includes(CAPABILITY_GRANT_CONSTRAINT);
}

export function toCapabilityDefinitionRecord(row: CapabilityDefinition): CapabilityDefinitionRecord {
  return {
    key: row.key as CapabilityKey,
    description: row.description,
    allowedScopeTypes: row.allowedScopeTypes as CapabilityScope[],
    isSystem: row.isSystem,
    isActive: row.isActive,
  };
}

export function toCapabilityGrantRecord(row: CapabilityGrant): CapabilityGrantRecord {
  return {
    id: row.id,
    userId: row.userId,
    capabilityKey: row.capabilityKey as CapabilityKey,
    scopeType: row.scopeType as CapabilityScope,
    ...(row.scopeResourceId ? { scopeResourceId: row.scopeResourceId } : {}),
    validFrom: row.validFrom.toISOString(),
    ...(row.validUntil ? { validUntil: row.validUntil.toISOString() } : {}),
    ...(row.grantedByUserId ? { grantedByUserId: row.grantedByUserId } : {}),
    ...(row.revokedAt ? { revokedAt: row.revokedAt.toISOString() } : {}),
    ...(row.revokedByUserId ? { revokedByUserId: row.revokedByUserId } : {}),
    ...(row.revokeReason ? { revokeReason: row.revokeReason } : {}),
  };
}

@Injectable()
export class CapabilitiesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async definitions(query: ListCapabilitiesDto): Promise<CapabilityDefinitionListResponse> {
    const where: Prisma.CapabilityDefinitionWhereInput = query.isActive === undefined ? {} : { isActive: query.isActive };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.capabilityDefinition.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: { key: 'asc' } }),
      this.prisma.capabilityDefinition.count({ where }),
    ]);
    return { items: items.map(toCapabilityDefinitionRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async list(userId: string, query: ListGrantsDto): Promise<CapabilityGrantListResponse> {
    await this.requireUser(userId);
    const activeAt = query.activeAt ? new Date(query.activeAt) : undefined;
    const where: Prisma.CapabilityGrantWhereInput = {
      userId,
      ...(query.capabilityKey ? { capabilityKey: query.capabilityKey } : {}),
      ...(query.scopeType ? { scopeType: query.scopeType } : {}),
      ...(query.revoked !== undefined ? { revokedAt: query.revoked ? { not: null } : null } : {}),
      ...(activeAt ? {
        revokedAt: null,
        AND: [
          { validFrom: { lte: activeAt } },
          { OR: [{ validUntil: null }, { validUntil: { gt: activeAt } }] },
        ],
      } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.capabilityGrant.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ validFrom: 'desc' }, { id: 'asc' }] }),
      this.prisma.capabilityGrant.count({ where }),
    ]);
    return { items: items.map(toCapabilityGrantRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async create(userId: string, dto: CreateGrantDto, actor: string, meta: RequestMeta): Promise<CapabilityGrantRecord> {
    await this.requireUser(userId);
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : new Date();
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (validUntil && validUntil <= validFrom) throw new BadRequestException('Khoảng thời gian không hợp lệ.');
    const definition = await this.prisma.capabilityDefinition.findUnique({ where: { key: dto.capabilityKey } });
    if (!definition) throw new NotFoundException('Không tìm thấy capability.');
    if (!definition.isActive || !definition.allowedScopeTypes.includes(dto.scopeType)) {
      throw new ConflictException('Capability không khả dụng cho scope này.');
    }
    const scopeResourceId = await this.normalizeResource(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.capabilityGrant.create({
          data: { userId, capabilityKey: dto.capabilityKey, scopeType: dto.scopeType, scopeResourceId, validFrom, validUntil, grantedByUserId: actor },
        });
        await this.audit.write({
          actorUserId: actor,
          action: 'CAPABILITY_GRANTED',
          entityType: 'CapabilityGrant',
          entityId: row.id,
          requestId: meta.requestId,
          result: AuditResult.SUCCESS,
          metadata: {
            targetUserId: userId,
            capabilityKey: row.capabilityKey,
            scopeType: row.scopeType,
            ...(row.scopeResourceId ? { scopeResourceId: row.scopeResourceId } : {}),
            validFrom: row.validFrom.toISOString(),
            ...(row.validUntil ? { validUntil: row.validUntil.toISOString() } : {}),
          },
        }, tx);
        return toCapabilityGrantRecord(row);
      });
    } catch (error) {
      if (isGrantConflict(error)) throw new ConflictException('Grant trùng hoặc chồng lấn thời gian.');
      throw error;
    }
  }

  async revoke(id: string, dto: RevokeGrantDto, actor: string, meta: RequestMeta): Promise<CapabilityGrantRecord> {
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.capabilityGrant.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Không tìm thấy grant.');
      if (old.revokedAt) return toCapabilityGrantRecord(old);
      const row = await tx.capabilityGrant.update({
        where: { id },
        data: { revokedAt: new Date(), revokedByUserId: actor, ...(dto.revokeReason !== undefined ? { revokeReason: dto.revokeReason } : {}) },
      });
      await this.audit.write({
        actorUserId: actor,
        action: 'CAPABILITY_REVOKED',
        entityType: 'CapabilityGrant',
        entityId: id,
        requestId: meta.requestId,
        result: AuditResult.SUCCESS,
        metadata: {
          targetUserId: row.userId,
          capabilityKey: row.capabilityKey,
          scopeType: row.scopeType,
          ...(row.scopeResourceId ? { scopeResourceId: row.scopeResourceId } : {}),
        },
      }, tx);
      return toCapabilityGrantRecord(row);
    });
  }

  private async requireUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
  }

  private async normalizeResource(dto: CreateGrantDto): Promise<string | null> {
    if (dto.scopeType === 'SCHOOL_WIDE' || dto.scopeType === 'PERSONAL') {
      if (dto.scopeResourceId !== undefined) throw new BadRequestException('Scope này không nhận resource.');
      return null;
    }
    if (!dto.scopeResourceId) throw new BadRequestException('Scope cần resource.');
    if (dto.scopeType === 'ACTIVITY') return dto.scopeResourceId;
    if (dto.scopeType === 'SUBJECT_GROUP') {
      const group = await this.prisma.subjectGroup.findUnique({ where: { id: dto.scopeResourceId }, select: { status: true } });
      if (!group) throw new NotFoundException('Không tìm thấy tổ chuyên môn.');
      if (group.status !== CatalogStatus.ACTIVE) throw new ConflictException('Tổ chuyên môn không hoạt động.');
      return dto.scopeResourceId;
    }
    const subject = await this.prisma.subject.findUnique({ where: { id: dto.scopeResourceId }, select: { status: true } });
    if (!subject) throw new NotFoundException('Không tìm thấy môn học.');
    if (subject.status !== CatalogStatus.ACTIVE) throw new ConflictException('Môn học không hoạt động.');
    return dto.scopeResourceId;
  }
}
