import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditResult, Prisma, PrismaClient } from '@prisma/client';
import { AuditEventListResponse, AuditEventRecord } from '@baogiang/contracts';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_KEY = /password|token|cookie|secret|hash|authorization|credential|bearer|api[_-]?key|database[_-]?url/i;
const MAX_METADATA_DEPTH = 8;

export interface AuditInput {
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  requestId?: string;
  result: AuditResult;
  metadata?: Record<string, unknown>;
}

type AuditDb = Pick<PrismaClient, 'auditEvent'> | Prisma.TransactionClient;
type SafeJson = string | number | boolean | null | SafeJson[] | { [key: string]: SafeJson };

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  sanitize(metadata?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
    if (!metadata) return undefined;
    return this.sanitizeValue(metadata, 0, new WeakSet<object>()) as Prisma.InputJsonValue;
  }

  private sanitizeValue(
    value: unknown,
    depth: number,
    seen: WeakSet<object>,
  ): SafeJson | undefined {
    if (depth > MAX_METADATA_DEPTH || value === undefined) return undefined;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'object') return undefined;
    if (seen.has(value)) return undefined;
    seen.add(value);
    if (Array.isArray(value)) {
      const output: SafeJson[] = [];
      for (const item of value) {
        const sanitized = this.sanitizeValue(item, depth + 1, seen);
        if (sanitized !== undefined) output.push(sanitized);
      }
      return output;
    }
    const output: Record<string, SafeJson> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) continue;
      const sanitized = this.sanitizeValue(item, depth + 1, seen);
      if (sanitized !== undefined) output[key] = sanitized;
    }
    return output;
  }

  async write(input: AuditInput, db: AuditDb = this.prisma): Promise<void> {
    await db.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        requestId: input.requestId,
        result: input.result,
        metadata: this.sanitize(input.metadata),
      },
    });
  }

  async list(query: { page: number; pageSize: number; actorUserId?: string; action?: string; entityType?: string; entityId?: string; requestId?: string; result?: AuditResult; createdFrom?: string; createdTo?: string }): Promise<AuditEventListResponse> {
    const from = query.createdFrom ? new Date(query.createdFrom) : undefined;
    const to = query.createdTo ? new Date(query.createdTo) : undefined;
    if ((from && Number.isNaN(+from)) || (to && Number.isNaN(+to)) || (from && to && from >= to)) throw new BadRequestException('Khoảng thời gian không hợp lệ.');
    const where: Prisma.AuditEventWhereInput = {};
    if (query.actorUserId !== undefined) where.actorUserId = query.actorUserId;
    if (query.action !== undefined) where.action = query.action;
    if (query.entityType !== undefined) where.entityType = query.entityType;
    if (query.entityId !== undefined) where.entityId = query.entityId;
    if (query.requestId !== undefined) where.requestId = query.requestId;
    if (query.result !== undefined) where.result = query.result;
    if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return { items: items.map((item): AuditEventRecord => ({
      id: item.id,
      ...(item.actorUserId ? { actorUserId: item.actorUserId } : {}),
      action: item.action,
      entityType: item.entityType,
      ...(item.entityId ? { entityId: item.entityId } : {}),
      ...(item.requestId ? { requestId: item.requestId } : {}),
      result: item.result,
      ...(this.viewerMetadata(item.metadata) ? { metadata: this.viewerMetadata(item.metadata) } : {}),
      createdAt: item.createdAt.toISOString(),
    })), page: query.page, pageSize: query.pageSize, total };
  }

  private viewerMetadata(value: unknown): Record<string, unknown> | undefined {
    const forbidden = new Set(['password','passwordhash','token','tokenhash','cookie','secret','credential','apikey','database_url','authorization','authorizationheader','sessiontoken']);
    const clean = (input: unknown): unknown => Array.isArray(input) ? input.map(clean) : input && typeof input === 'object' ? Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(([key]) => !forbidden.has(key.toLowerCase())).map(([key,item]) => [key,clean(item)])) : input;
    return value && typeof value === 'object' && !Array.isArray(value) ? clean(value) as Record<string,unknown> : undefined;
  }
}
